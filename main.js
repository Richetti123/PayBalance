import Boom from '@hapi/boom';
import NodeCache from 'node-cache';
import P from 'pino';
import chalk from 'chalk'; // Importamos chalk para los colores en la consola
import yargs from 'yargs'; // Importamos yargs para analizar argumentos de línea de comandos
import { createInterface } from 'readline'; // Importamos readline para interactuar con la consola

import {
    makeWASocket,
    useMultiFileAuthState,
    makeInMemoryStore,
    DisconnectReason,
    delay
} from '@whiskeysockets/baileys';

import {
    readFileSync,
    existsSync,
    writeFileSync,
    readdirSync, // Sincrónico para clearTmp
    unlinkSync // Sincrónico para clearTmp
} from 'fs';
import {
    join
} from 'path';
import {
    fileURLToPath
} from 'url';
import util from 'util';
import Datastore from '@seald-io/nedb';
import {
    sendAutomaticPaymentRemindersLogic
} from './plugins/recordatorios.js';

// Importaciones de 'fs/promises' para operaciones asíncronas
import {
    readdir,
    unlink,
    stat
} from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// --- Configuración de la Base de Datos Nedb ---
global.db = {
    data: {
        users: {},
        chats: {},
        settings: {},
        ...(existsSync('./src/database.json') && JSON.parse(readFileSync('./src/database.json')))
    }
};

const collections = ['users', 'chats', 'settings'];
collections.forEach(collection => {
    global.db.data[collection] = new Datastore({
        filename: `./src/${collection}.db`,
        autoload: true
    });
    global.db.data[collection].loadDatabase();
});

// --- Almacenamiento en Memoria para Baileys ---
const store = makeInMemoryStore({
    logger: P().child({
        level: 'silent',
        stream: 'store'
    })
});

// --- Cache para mensajes ---
const msgRetryCounterCache = new NodeCache();

// --- FUNCIONES DE LIMPIEZA Y MANTENIMIENTO ---

/**
 * Elimina todos los archivos de la carpeta 'tmp'.
 */
function clearTmp() {
    const tmpDir = join(__dirname, 'tmp');
    if (!existsSync(tmpDir)) {
        console.log(chalk.yellow(`[⚠] Carpeta temporal no encontrada: ${tmpDir}`));
        return;
    }
    try {
        const filenames = readdirSync(tmpDir);
        filenames.forEach(file => {
            const filePath = join(tmpDir, file);
            try {
                unlinkSync(filePath);
                // console.log(chalk.green(`[🗑️] Archivo temporal eliminado: ${file}`));
            } catch (err) {
                // console.error(chalk.red(`[⚠] Error al eliminar temporal ${file}: ${err.message}`));
            }
        });
        console.log(chalk.bold.cyanBright(`[🔵] Archivos temporales eliminados de ${tmpDir}`));
    } catch (err) {
        console.error(chalk.red(`[⚠] Error general al limpiar 'tmp': ${err.message}`));
    }
}

/**
 * Limpia la carpeta de sesiones principal, eliminando pre-keys antiguas y otros archivos no esenciales.
 */
async function cleanMainSession() {
    const sessionDir = './sessions'; // Tu carpeta de sesiones
    try {
        if (!existsSync(sessionDir)) {
            console.log(chalk.yellow(`[⚠] Carpeta de sesiones no encontrada: ${sessionDir}`));
            return;
        }
        const files = await readdir(sessionDir);
        const now = Date.now();
        const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000); // 24 horas en milisegundos

        let cleanedFilesCount = 0;

        for (const file of files) {
            const filePath = join(sessionDir, file);
            // Evitar eliminar creds.json que es esencial para la sesión
            if (file === 'creds.json') {
                // console.log(chalk.yellow(`[ℹ️] Manteniendo archivo esencial: ${file}`));
                continue;
            }

            try {
                const fileStats = await stat(filePath);

                // Si es un archivo pre-key y es antiguo (más de 24 horas)
                if (file.startsWith('pre-key-') && fileStats.mtimeMs < twentyFourHoursAgo) {
                    await unlink(filePath);
                    console.log(chalk.green(`[🗑️] Pre-key antigua eliminada: ${file}`));
                    cleanedFilesCount++;
                } else if (!file.startsWith('pre-key-')) {
                    // Si no es un archivo pre-key, se considera un archivo residual y se elimina.
                    // Esto cubre otros archivos que Baileys pueda generar que no sean creds.json o pre-key.
                    await unlink(filePath);
                    console.log(chalk.green(`[🗑️] Archivo residual de sesión eliminado: ${file}`));
                    cleanedFilesCount++;
                } else {
                    // console.log(chalk.yellow(`[ℹ️] Manteniendo pre-key activa: ${file}`));
                }
            } catch (err) {
                console.error(chalk.red(`[⚠] Error al procesar o eliminar ${file} en ${sessionDir}: ${err.message}`));
            }
        }
        if (cleanedFilesCount > 0) {
            console.log(chalk.cyanBright(`[🔵] Limpieza de sesión completada. Archivos eliminados: ${cleanedFilesCount}`));
        } else {
            console.log(chalk.bold.green(`[🔵] No se encontraron archivos de sesión no esenciales o antiguos para eliminar.`));
        }

    } catch (err) {
        console.error(chalk.red(`[⚠] Error general al limpiar la sesión principal: ${err.message}`));
    }
}


// --- Función Principal de Conexión ---
async function startBot() {
    // 1. Analizar los argumentos de línea de comandos
    const argv = yargs(process.argv.slice(2)).parse();

    // 2. Comprobar si se pasó el argumento --code para la conexión de 8 dígitos
    const usePairingCode = argv.code || argv['pairing-code']; // Permite --code o --pairing-code
    let phoneNumber = null;

    if (usePairingCode) {
        // Si el número se pasa directamente como un argumento posicional (ej: node . --code 521XXXXXXXXXX)
        phoneNumber = argv._[0]; 
        
        if (!phoneNumber) {
            console.log(chalk.yellow('\nPor favor, ingresa tu número de teléfono para el código de emparejamiento.'));
            console.log(chalk.yellow('Ejemplo: node . --code 521XXXXXXXXXX'));

            // Usamos readline para pedir el número si no se proporcionó
            const rl = createInterface({
                input: process.stdin,
                output: process.stdout
            });
            phoneNumber = await new Promise(resolve => {
                rl.question('Ingresa tu número de WhatsApp con código de país (ej: 521XXXXXXXXXX): ', input => {
                    rl.close();
                    resolve(input.replace(/\D/g, '')); // Limpiamos el número de cualquier caracter no dígito
                });
            });

            if (!phoneNumber) {
                console.log(chalk.red('Número no proporcionado. Saliendo...'));
                process.exit(1);
            }
        } else {
            phoneNumber = String(phoneNumber).replace(/\D/g, ''); // Limpiar el número si ya se proporcionó
        }

        // Validar que el número sea un número de teléfono válido para WhatsApp
        // Baileys requiere que los números para pairingCode empiecen con el código de país (sin el '+')
        if (!/^\d+$/.test(phoneNumber)) {
            console.log(chalk.red('Número de teléfono inválido. Debe contener solo dígitos y el código de país.'));
            process.exit(1);
        }
    }

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState('sessions');

    const sock = makeWASocket({
        logger: P({
            level: 'silent'
        }),
        // Solo imprimir QR si no se usa el código de emparejamiento
        printQRInTerminal: !usePairingCode,
        browser: ['LogisticBot', 'Desktop', '3.0'],
        auth: state,
        generateHighQualityLinkPreview: true,
        msgRetryCounterCache,
        shouldIgnoreJid: jid => false,
        // Configuración para el código de emparejamiento
        pairingCode: usePairingCode && phoneNumber ? phoneNumber : undefined,
    });

    // Asignar sock a global.conn para que las funciones de limpieza lo puedan usar
    global.conn = sock;

    // Si se usa el código de emparejamiento y la conexión aún no está establecida
    // Baileys imprimirá el código automáticamente si `pairingCode` se configuró correctamente
    if (usePairingCode && !sock.user && !existsSync('./sessions/creds.json')) { // Solo mostrar si es una nueva conexión con código
        console.log(chalk.blue(`\nPor favor, espera. Generando código de 8 dígitos...`));
        console.log(chalk.green(`Una vez generado, ingresa este código en tu WhatsApp móvil:`));
        // El código aparecerá automáticamente en la consola después de este mensaje si Baileys lo genera.
    }


    store.bind(sock.ev);

    // --- Manejo de Eventos de Conexión ---
    sock.ev.on('connection.update', async (update) => {
        const {
            connection,
            lastDisconnect,
            qr
        } = update;

        if (connection === 'close') {
            let reason = Boom.boomify(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.badSession) {
                console.log(chalk.red(`[❌] Archivo de sesión incorrecto, por favor elimina la carpeta 'sessions' y vuelve a escanear.`));
                process.exit();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log(chalk.yellow(`[⚠️] Conexión cerrada, reconectando....`));
                startBot();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log(chalk.yellow(`[⚠️] Conexión perdida del servidor, reconectando...`));
                startBot();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log(chalk.red(`[❌] Conexión reemplazada, otra nueva sesión abierta. Por favor, cierra la sesión actual primero.`));
                process.exit();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red(`[❌] Dispositivo desconectado, por favor elimina la carpeta 'sessions' y vuelve a escanear.`));
                process.exit();
            } else {
                console.log(chalk.red(`[❌] Razón de desconexión desconocida: ${reason}|${lastDisconnect.error}`));
                startBot();
            }
        } else if (connection === 'open') {
            console.log(chalk.green('[✅] Conexión abierta con WhatsApp.'));
            // Envía recordatorios al iniciar y luego cada 24 horas
            await sendAutomaticPaymentRemindersLogic(sock);
            setInterval(() => sendAutomaticPaymentRemindersLogic(sock), 24 * 60 * 60 * 1000); // Cada 24 horas
        }
    });

    // --- Guardar Credenciales ---
    sock.ev.on('creds.update', saveCreds);

    // --- Manejo de Mensajes Entrantes ---
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message) return;
            if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
            if (m.key.remoteJid === 'status@broadcast') return;

            m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
            m.message = (Object.keys(m.message)[0] === 'viewOnceMessage') ? m.message.viewOnceMessage.message : m.message;

            global.self = sock.user.id.split(':')[0] + '@s.whatsapp.net';

            const {
                handler
            } = await import('./handler.js');
            await handler(m, sock, store);

        } catch (e) {
            console.error(chalk.red(`[❌] Error en messages.upsert: ${e.message || e}`));
        }
    });

    return sock;
}

// --- Inicio del bot y programación de tareas de limpieza ---
startBot();

// Limpiar la carpeta 'tmp' cada 3 minutos
setInterval(async () => {
    // Solo limpiar si el bot está conectado
    // La conexión 'conn' es 'sock' y se asignó a global.conn
    if (global.conn && global.conn.user) {
        clearTmp();
    } else {
        // console.log(chalk.gray('[ℹ️] Bot desconectado, omitiendo limpieza de tmp.'));
    }
}, 1000 * 60 * 3); // Cada 3 minutos

// Limpiar la carpeta de sesiones cada 10 minutos
setInterval(async () => {
    // Solo limpiar si el bot está conectado
    if (global.conn && global.conn.user) {
        await cleanMainSession();
    } else {
        // console.log(chalk.gray('[ℹ️] Bot desconectado, omitiendo limpieza de sesión.'));
    }
}, 1000 * 60 * 10); // Cada 10 minutos
