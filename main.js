process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '1';
import './config.js';
import './plugins/_content.js'; // Asumo que esto es necesario para tu bot
import { createRequire } from 'module';
import path, { join } from 'path';
import { fileURLToPath } from 'url'; // Removí pathToFileURL, platform ya no es estrictamente necesaria aquí
import * as ws from 'ws'; // Mantengo por si es una dependencia indirecta
import fs, { watchFile, unwatchFile, existsSync, readFileSync, readdirSync, unlinkSync, statSync, writeFileSync } from 'fs'; // Importaciones síncronas
import yargs from 'yargs';
import { spawn } from 'child_process'; // Mantengo por si se usa en otros lados
import lodash from 'lodash'; // Mantengo por si se usa en otros lados
import chalk from 'chalk';
import syntaxerror from 'syntax-error'; // Mantengo por si se usa en otros lados
import { format } from 'util';
import pino from 'pino'; // Ya importabas Pino como P, pino es el nombre del paquete
import { Boom } from '@hapi/boom';
// import { makeWASocket, protoType, serialize } from './lib/simple.js'; // Si usas lib/simple.js, descomenta
import { Low, JSONFile } from 'lowdb'; // Mantengo por si se usa en otros lados
import PQueue from 'p-queue'; // Mantengo por si se usa en otros lados
import Datastore from '@seald-io/nedb';
// import store from './lib/store.js'; // Si usas este store en lugar de makeInMemoryStore
import readline from 'readline';
import NodeCache from 'node-cache';
// import { gataJadiBot } from './plugins/jadibot-serbot.js'; // Mantengo por si es una funcionalidad
// import pkg from 'google-libphonenumber'; // Mantengo si usas isValidPhoneNumber de aquí
// const { PhoneNumberUtil } = pkg;
// const phoneUtil = PhoneNumberUtil.getInstance(); // Mantengo si usas isValidPhoneNumber de aquí

// Importaciones de Baileys
import {
    makeWASocket,
    useMultiFileAuthState,
    makeInMemoryStore, // Asegúrate de usar este si no usas './lib/store.js'
    DisconnectReason,
    delay
} from '@whiskeysockets/baileys';

// Importación de funciones de limpieza y recordatorios
import {
    readdir,
    unlink,
    stat
} from 'fs/promises';
import {
    sendAutomaticPaymentRemindersLogic
} from './plugins/recordatorios.js'; // Asegúrate que esta ruta es correcta

// --- Tu lógica de lenguajeGB y otros utilitarios (ajusta según tu estructura real) ---
// Simulación de lenguajeGB si no está definida globalmente
let lenguajeGB = {
    smsClearTmp: () => 'Archivos temporales limpiados.',
    smspurgeSession: () => 'Sesión principal purgada.',
    smspurgeOldFiles: () => 'Archivos antiguos purgados.',
    smsCargando: () => 'Cargando bot...',
    smsMainBot: () => 'Detectado cambio en main.js. Recargando...'
};
// Asumo que tienes un archivo config.js que define global.db, etc.
// Y que tienes una función _quickTest() definida en algún lugar o en un config.js
// Si no están definidos, necesitarás definirlos o eliminarlos.
let _quickTest = async () => {}; // Función dummy para evitar errores si no existe
let conn = null; // Declaramos conn globalmente para los setIntervals

// --- Carga de 'config.js' y otras configuraciones globales (ej: global.db) ---
// Tu archivo original 'main (2).js' carga 'config.js' al inicio.
// Este 'config.js' suele inicializar global.db y otras variables globales.
// Asegúrate de que esas variables estén correctamente inicializadas si las estás usando.

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// --- Configuración de la Base de Datos Nedb ---
// Esta parte de global.db debe ser inicializada por tu config.js o aquí.
// La dejo aquí como referencia de tu estructura original.
if (!global.db) {
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
}


// --- Almacenamiento en Memoria para Baileys ---
const store = makeInMemoryStore({
    logger: pino().child({ // Usar pino() aquí
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
            } catch (err) {
                // console.error(chalk.red(`[⚠] Error al eliminar temporal ${file}: ${err.message}`));
            }
        });
        console.log(chalk.bold.cyanBright(lenguajeGB.smsClearTmp()));
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
            if (file === 'creds.json') {
                continue;
            }

            try {
                const fileStats = await stat(filePath);
                if (file.startsWith('pre-key-') && fileStats.mtimeMs < twentyFourHoursAgo) {
                    await unlink(filePath);
                    console.log(chalk.green(`[🗑️] Pre-key antigua eliminada: ${file}`));
                    cleanedFilesCount++;
                } else if (!file.startsWith('pre-key-')) {
                    await unlink(filePath);
                    console.log(chalk.green(`[🗑️] Archivo residual de sesión eliminado: ${file}`));
                    cleanedFilesCount++;
                }
            } catch (err) {
                console.error(chalk.red(`[⚠] Error al procesar o eliminar ${file} en ${sessionDir}: ${err.message}`));
            }
        }
        if (cleanedFilesCount > 0) {
            console.log(chalk.cyanBright(lenguajeGB.smspurgeSession()));
        } else {
            console.log(chalk.bold.green(`[🔵] No se encontraron archivos de sesión no esenciales o antiguos para eliminar.`));
        }

    } catch (err) {
        console.error(chalk.red(`[⚠] Error general al limpiar la sesión principal: ${err.message}`));
    }
}

// Función para purgar archivos antiguos (si 'lenguajeGB.smspurgeOldFiles()' es de tu bot)
async function purgeOldFiles() {
    // Implementa tu lógica de purga de archivos antiguos aquí
    // Por ejemplo:
    // const oldFilesDir = './path/to/old/files';
    // if (existsSync(oldFilesDir)) {
    //     const files = await readdir(oldFilesDir);
    //     for (const file of files) {
    //         // Lógica para decidir qué archivos eliminar
    //     }
    // }
    console.log(chalk.bold.cyanBright(lenguajeGB.smspurgeOldFiles()));
}


// Función para hacer preguntas en la consola
function askQuestion(query) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    return new Promise(resolve => rl.question(query, ans => {
        rl.close();
        resolve(ans);
    }))
}

// --- Función Principal de Conexión ---
async function startBot() {
    const argv = yargs(process.argv.slice(2)).parse();
    let usePairingCode = false;
    let phoneNumber = null;

    // Verificar si ya hay una sesión guardada. Si la hay, simplemente reconecta.
    if (existsSync('./sessions/creds.json')) {
        console.log(chalk.green('[✅] Sesión existente encontrada. Conectando automáticamente...'));
        usePairingCode = false; // Aseguramos que no intente pairing code si ya hay credenciales
    } else {
        // Si no hay sesión, preguntamos al usuario
        console.log(chalk.blue('\n¿Cómo quieres conectar tu bot?'));
        console.log(chalk.cyan('1. Conectar por Código QR (recomendado si es la primera vez o si el código de 8 dígitos falla)'));
        console.log(chalk.cyan('2. Conectar por Código de 8 dígitos (útil si escaneo QR es difícil)'));
        const choice = await askQuestion(chalk.yellow('Ingresa 1 o 2: '));

        if (choice === '2') {
            usePairingCode = true;
            // Intenta obtener el número si se pasó como argumento posicional (ej. node . 521XXXXXXXXXX)
            phoneNumber = argv._[0]; 

            if (!phoneNumber) {
                console.log(chalk.yellow('\nPara el código de 8 dígitos, necesito tu número de teléfono.'));
                phoneNumber = await askQuestion(chalk.cyan('Ingresa tu número de WhatsApp con código de país (ej: 521XXXXXXXXXX): '));
                phoneNumber = phoneNumber.replace(/\D/g, ''); // Limpiamos el número
            }

            if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
                console.log(chalk.red('Número de teléfono inválido o no proporcionado. Saliendo...'));
                process.exit(1);
            }
        } else if (choice !== '1') {
            console.log(chalk.red('Opción inválida. Saliendo...'));
            process.exit(1);
        }
        // Si choice es '1', usePairingCode sigue siendo false, lo que activará el QR.
    }

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState('sessions');

    conn = makeWASocket({ // Asigna a la variable global 'conn'
        logger: pino({
            level: 'silent'
        }),
        printQRInTerminal: !usePairingCode, // Solo imprimir QR si no se usa el código de emparejamiento
        browser: ['LogisticBot', 'Desktop', '3.0'],
        auth: state,
        generateHighQualityLinkPreview: true,
        msgRetryCounterCache,
        shouldIgnoreJid: jid => false,
        pairingCode: usePairingCode && phoneNumber ? phoneNumber : undefined,
    });

    // Esta parte puede ser problemática si se ejecuta antes de que Baileys tenga tiempo de generar el código
    // Por eso, la dejamos aquí y el mensaje de arriba ya lo anticipa.
    if (usePairingCode && !existsSync('./sessions/creds.json')) {
        console.log(chalk.blue(`\nPor favor, espera. Si tu número (${phoneNumber}) es válido, se generará un código de 8 dígitos.`));
        console.log(chalk.green(`Ingresa este código en tu WhatsApp móvil (Vincula un Dispositivo > Vincular con número de teléfono).`));
    }

    store.bind(conn.ev); // Usa conn en lugar de sock

    // --- Manejo de Eventos de Conexión ---
    conn.ev.on('connection.update', async (update) => {
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
            } else if (reason === DisconnectReason.connectionClosed || reason === DisconnectReason.connectionLost) {
                console.log(chalk.yellow(`[⚠️] Conexión cerrada/perdida, reconectando....`));
                // Dale un pequeño retraso antes de reiniciar para evitar bucles rápidos
                await delay(1000); 
                startBot();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log(chalk.red(`[❌] Conexión reemplazada, otra nueva sesión abierta. Por favor, cierra la sesión actual primero.`));
                process.exit();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(chalk.red(`[❌] Dispositivo desconectado, por favor elimina la carpeta 'sessions' y vuelve a escanear.`));
                process.exit();
            } else {
                console.log(chalk.red(`[❌] Razón de desconexión desconocida: ${reason}|${lastDisconnect.error}`));
                // Dale un pequeño retraso antes de reiniciar para evitar bucles rápidos
                await delay(1000);
                startBot();
            }
        } else if (connection === 'open') {
            console.log(chalk.green('[✅] Conexión abierta con WhatsApp.'));

            // --- Mueve la lógica de _quickTest y watchFile aquí ---
            // Asegura que estas funciones se ejecuten solo una vez después de la conexión.
            if (!global.botInitialized) { // Usa una bandera para evitar que se ejecute en reconexiones
                global.botInitialized = true;
                _quickTest().then(() => conn.logger.info(chalk.bold(lenguajeGB['smsCargando']().trim()))).catch(console.error);

                let file = fileURLToPath(import.meta.url);
                watchFile(file, () => {
                    unwatchFile(file);
                    console.log(chalk.bold.greenBright(lenguajeGB['smsMainBot']().trim()));
                    // Importar de nuevo el archivo principal para aplicar cambios
                    import(`${file}?update=${Date.now()}`);
                });
            }
            // Envía recordatorios al iniciar y luego cada 24 horas
            await sendAutomaticPaymentRemindersLogic(conn);
            setInterval(() => sendAutomaticPaymentRemindersLogic(conn), 24 * 60 * 60 * 1000); // Cada 24 horas
        }
    });

    // --- Guardar Credenciales ---
    conn.ev.on('creds.update', saveCreds);

    // --- Manejo de Mensajes Entrantes ---
    conn.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message) return;
            if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
            if (m.key.remoteJid === 'status@broadcast') return;

            m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
            m.message = (Object.keys(m.message)[0] === 'viewOnceMessage') ? m.message.viewOnceMessage.message : m.message;

            global.self = conn.user.id.split(':')[0] + '@s.whatsapp.net';

            const {
                handler
            } = await import('./handler.js'); // Asegúrate que esta ruta es correcta
            await handler(m, conn, store);

        } catch (e) {
            console.error(chalk.red(`[❌] Error en messages.upsert: ${e.message || e}`));
        }
    });

    return conn;
}

// --- Inicio del bot y programación de tareas de limpieza ---
startBot();

// Limpiar la carpeta 'tmp' cada 3 minutos
setInterval(async () => {
    if (conn && conn.user) {
        clearTmp();
    }
}, 1000 * 60 * 3); // Cada 3 minutos

// Limpiar la carpeta de sesiones y archivos antiguos cada 10 minutos
setInterval(async () => {
    if (conn && conn.user) {
        await cleanMainSession();
        // Asumo que purgeSessionSB() es otra función de limpieza similar
        // if (typeof purgeSessionSB === 'function') await purgeSessionSB(); // Descomenta si existe
        // if (typeof purgeSession === 'function') await purgeSession(); // Descomenta si existe
        await purgeOldFiles(); // Llamada a la función purgeOldFiles
    }
}, 1000 * 60 * 10); // Cada 10 minutos
