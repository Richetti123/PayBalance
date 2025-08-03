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
    delay, // Aseguramos que 'delay' esté importado
    fetchLatestBaileysVersion // Importar para obtener la última versión
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
} from './lib/recordatorio.js';

// Importaciones de 'fs/promises' para operaciones asíncronas
import {
    readdir,
    unlink,
    stat
} from 'fs/promises';

// Importaciones adicionales para la lógica de conexión
import pkg from 'google-libphonenumber';
const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// --- DEFINICIONES DE global.mid y global.lenguajeGB ---
// Si ya tienes estas definiciones en tu config.js o en otro archivo,
// POR FAVOR, ELIMINA ESTAS LÍNEAS para evitar conflictos si las tienes duplicadas.
global.mid = {
    methodCode1: "╔═════ᨒ═╍═╍═✦═╍═╍═ᨒ═════╗", // Este y otros ya no se usarán para el menú principal
    methodCode2: "║  [ *SELECCIONE EL TIPO DE CONEXIÓN* ]  ║",
    methodCode3: "OPCIÓN",
    methodCode4: "CONECTAR POR CÓDIGO QR",
    methodCode5: "CONECTAR POR CÓDIGO DE 8 DÍGITOS",
    methodCode6: "╰═▶️ SI NO SABES CÓMO ELEGIR",
    methodCode7: "         ELIJE LA OPCIÓN 1",
    methodCode8: "PARA MÁS DETALLES, UTILICE LA LÍNEA DE COMANDOS",
    methodCode9: "node . --qr",
    methodCode10: "node . --code <numero>",
    methodCode11: (chalk) => `[ ${chalk.bold.redBright('❌ ERROR')} ] POR FAVOR, SELECCIONE UN NÚMERO ENTRE EL 1 O EL 2`,
    methodCode12: 'Conexión por código QR',
    methodCode13: 'Conexión por código de 8 dígitos',
    methodCode14: 'Inicia el bot normalmente',
    // MODIFICACIÓN AQUÍ: Aclarar que se pide el '+'
    phNumber2: (chalk) => `[ ${chalk.bold.greenBright('⚠️ INGRESAR NÚMERO')} ] POR FAVOR, INGRESE SU NÚMERO DE WHATSAPP CON EL CÓDIGO DE PAÍS, INCLUYENDO EL SIGNO '+'. EJEMPLO: ${chalk.yellow('+52155XXXXXXXX')}\n---> `,
    pairingCode: '[ ⚠️ CÓDIGO DE EMPAREJAMIENTO ]',
    mCodigoQR: 'ESCANEA EL CÓDIGO QR',
    mConexion: '¡CONEXIÓN ESTABLECIDA CORRECTAMENTE!'
};

global.lenguajeGB = {
    smsClearTmp: () => 'Archivos temporales limpiados.',
    smspurgeSession: () => 'Sesión principal purgada.',
    smspurgeOldFiles: () => 'Archivos antiguos purgados.',
    smsCargando: () => 'Cargando bot...',
    smsMainBot: () => 'Detectado cambio en main.js. Recargando...',
    smsConexionOFF: () => `[ ⚠️ ] SESIÓN CERRADA. ¡¡VUELVA A ESCANEAR EL CÓDIGO QR O INGRESE UN CÓDIGO DE 8 DÍGITOS!!`,
    smsConexioncerrar: () => `[ ⚠️ ] LA CONEXIÓN SE HA CERRADO, SE INTENTARÁ RECONECTAR...`,
    smsConexionperdida: () => `[ ⚠️ ] LA CONEXIÓN SE HA PERDIDO CON EL SERVIDOR, SE INTENTARÁ RECONECTAR...`,
    smsConexionreem: () => `[ ❌ ] CONEXIÓN REEMPLAZADA, SE HA ABIERTO OTRA NUEVA SESIÓN, CIERRE LA SESIÓN ACTUAL PRIMERO.`,
    smsConexionreinicio: () => `[ ⚠️ ] REQUERIDO REINICIO, RECONECTANDO...`,
    smsConexiontiem: () => `[ ⚠️ ] TIEMPO DE CONEXIÓN AGOTADO, RECONECTANDO...`,
    smsConexiondescon: (reason, connection) => {
        let message = `[ ❌ ] MOTIVO DE DESCONEXIÓN DESCONOCIDO`;
        if (reason) message += `: ${reason}`;
        if (connection) message += ` | ${connection}`;
        return message;
    },
    smsWelcome: () => 'Bienvenido al grupo.',
    smsBye: () => 'Adiós del grupo.',
    smsSpromote: () => 'Fue promovido a administrador.',
    sdemote: () => 'Fue degradado de administrador.',
    smsSdesc: () => 'Se ha cambiado la descripción del grupo.',
    smsSsubject: () => 'Se ha cambiado el nombre del grupo.',
    smsSicon: () => 'Se ha cambiado la foto de perfil del grupo.',
    smsSrevoke: () => 'Se ha cambiado el enlace de invitación del grupo.',
    smspurgeOldFiles1: () => 'Archivo antiguo eliminado:',
    smspurgeOldFiles2: () => 'en sub-bot',
    smspurgeOldFiles3: () => 'Error al eliminar',
    smspurgeOldFiles4: () => 'Error al eliminar archivo residual',
    smspurgeSessionSB1: () => 'No se encontraron pre-keys antiguas en sub-bots para eliminar.',
    smspurgeSessionSB2: () => 'Pre-keys antiguas eliminadas de sub-bots.',
    smspurgeSessionSB3: () => 'Error al purgar sesión de sub-bots:'
};
// --- FIN DE DEFINICIONES ---


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
                    await unlink(filePath);
                    console.log(chalk.green(`[🗑️] Archivo residual de sesión eliminado: ${file}`));
                    cleanedFilesCount++;
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

// Función para hacer preguntas en la consola
let rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
})

const question = (texto) => {
    rl.clearLine(rl.input, 0)
    return new Promise((resolver) => {
        rl.question(texto, (respuesta) => {
            rl.clearLine(rl.input, 0)
            resolver(respuesta.trim())
        })
    })
}

// Función de validación de número de teléfono
async function isValidPhoneNumber(number) {
    try {
        // Asegurarse de que el número comience con '+' para la validación de libphonenumber
        if (!number.startsWith('+')) {
            number = `+${number}`;
        }
        number = number.replace(/\s+/g, '');
        // Si el número empieza con '+521', quitar el '1' para la validación interna
        if (number.startsWith('+521')) {
            number = number.replace('+521', '+52');
        }
        const parsedNumber = phoneUtil.parseAndKeepRawInput(number)
        return phoneUtil.isValidNumber(parsedNumber)
    } catch (error) {
        return false
    }
}

// Función para redefinir los métodos de consola y filtrar mensajes
const filterStrings = [
    "Q2xvc2luZ2ggc3RhYmxlIG9wZW4=", // "Closing stable open"
    "Q2xvc2luZyBvcGVuIHNlc3Npb24=", // "Closing open session"
    "RmFpbGVkIHRvIGRlY3J5cHQ=", // "Failed to decrypt"
    "U2Vzc2lvbiBlcnJvcg==", // "Session error"
    "RXJyb3I6IEJhZCBNQUM=", // "Error: Bad MAC"
    "RGVjcnlwdGVkIG1lc3NhZ2U=" // "Decrypted message"
]

function redefineConsoleMethod(methodName, filterStrings) {
    const originalConsoleMethod = console[methodName]
    console[methodName] = function() {
        const message = arguments[0]
        if (typeof message === 'string' && filterStrings.some(filterString => message.includes(atob(filterString)))) {
            arguments[0] = ""
        }
        originalConsoleMethod.apply(console, arguments)
    }
}

console.info = () => {}
console.debug = () => {}
['log', 'warn', 'error'].forEach(methodName => redefineConsoleMethod(methodName, filterStrings))


// --- Función Principal de Conexión ---
async function startBot() {
    // Obtener la última versión de Baileys
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(chalk.cyan(`[ℹ️] Usando Baileys v${version.join('.')}${!isLatest ? ' (no es la última, considerar actualizar)' : ''}`));


    // 1. Analizar los argumentos de línea de comandos
    const argv = yargs(process.argv.slice(2)).parse();
    
    let phoneNumber = null;    
    const methodCodeQR = process.argv.includes("qr");
    const methodCode = !!phoneNumber || process.argv.includes("code");
    const MethodMobile = process.argv.includes("mobile");

    let opcion;

    if (methodCodeQR) {
        opcion = '1';
    }

    // --- Lógica Interactiva para elegir tipo de conexión (SIMPLIFICADA y en blanco) ---
    if (!methodCodeQR && !methodCode && !existsSync('./sessions/creds.json')) {
        do {
            opcion = await question(chalk.white(
                `CashFlow listo para conectarse escoge el metodo de vinculacion\n` +
                `1. Codigo QR\n` +
                `2. Codigo de 8 digitos\n---> `
            ));
            if (!/^[1-2]$/.test(opcion)) {
                console.log(chalk.bold.redBright(mid.methodCode11(chalk)));
            }
        } while (opcion !== '1' && opcion !== '2' || existsSync('./sessions/creds.json'));
    }

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState('sessions');

    const sock = makeWASocket({
        logger: P({
            level: 'silent'
        }),
        printQRInTerminal: opcion == '1' ? true : methodCodeQR ? true : false,
        mobile: MethodMobile,
        browser: opcion == '1' ? ['CashFlow', 'Desktop', '3.0'] : methodCodeQR ? ['CashFlow', 'Desktop', '3.0'] : ["CashFlow", "Chrome", "20.0.04"],
        auth: state,
        generateHighQualityLinkPreview: true,
        msgRetryCounterCache,
        shouldIgnoreJid: jid => false,
        // CORRECCIÓN APLICADA AQUÍ
        cachedGroupMetadata: (jid) => global.conn.chats?.[jid] ?? {},
        version: version,
        keepAliveIntervalMs: 55000,
        maxIdleTimeMs: 60000,
    });

    global.conn = sock;
    global.conn.store = store;    

    store.bind(sock.ev);

    // --- LÓGICA CLAVE PARA SOLICITAR Y MOSTRAR EL CÓDIGO DE 8 DÍGITOS ---
    if (!existsSync('./sessions/creds.json') && (opcion === '2' || methodCode)) {
        if (!sock.authState.creds.registered) {
            let addNumber;
            if (phoneNumber) {
                addNumber = phoneNumber.replace(/[^0-9]/g, '');
                if (!addNumber.startsWith('+')) {
                    addNumber = `+${addNumber}`;
                }
            } else {
                do {
                    phoneNumber = await question(chalk.bgBlack(chalk.bold.greenBright(mid.phNumber2(chalk))));
                    // Limpia el número: elimina espacios, guiones, etc.
                    addNumber = phoneNumber.replace(/\D/g, '');    
                    // Añade el '+' si no lo tiene (la validación ya lo hace, pero para el `requestPairingCode` es bueno asegurarlo)
                    if (!addNumber.startsWith('+')) {
                        addNumber = `+${addNumber}`;
                    }
                } while (!await isValidPhoneNumber(addNumber)); // Validar el número ya con el '+'
            }

            // Añadir un pequeño delay antes de solicitar el código
            await delay(2000); // Espera 2 segundos

            try {
                // Solicita el código de emparejamiento usando el número de teléfono
                const codeBot = await sock.requestPairingCode(addNumber);
                // Formatea el código para una mejor lectura (ej: "1234-5678")
                const formattedCode = codeBot?.match(/.{1,4}/g)?.join("-") || codeBot;
                
                console.log(chalk.blue(`\nPor favor, espera. Si tu número (${addNumber}) es válido, se generará un código de 8 dígitos.`));
                console.log(chalk.green(`Ingresa este código en tu WhatsApp móvil (Vincula un Dispositivo > Vincular con número de teléfono).`));
                console.log(chalk.bold.white(chalk.bgMagenta(mid.pairingCode)), chalk.bold.white(chalk.white(formattedCode)));

            } catch (error) {
                console.error(chalk.red(`[❌] Error al solicitar el código de emparejamiento: ${error.message}`));
                console.log(chalk.yellow(`[⚠️] Asegúrese de que el número sea correcto y de que no haya una sesión de WhatsApp ya abierta en el bot.`));
                startBot(); // Intenta reiniciar si falla la solicitud del código
            }
        }
    }
    // --- FIN LÓGICA CLAVE ---


    // --- Manejo de Eventos de Conexión ---
    sock.ev.on('connection.update', async (update) => {
        const {
            connection,
            lastDisconnect,
            qr,
        } = update;

        if (connection === 'close') {
            let reason = Boom.boomify(lastDisconnect?.error)?.output?.statusCode;
            let errorMessage = '';

            switch (reason) {
                case DisconnectReason.badSession:
                    errorMessage = `[❌] Archivo de sesión incorrecto, por favor elimina la carpeta 'sessions' y vuelve a escanear.`;
                    process.exit();
                    break;
                case DisconnectReason.connectionClosed:
                    errorMessage = `[⚠️] ${global.lenguajeGB.smsConexioncerrar()}`;
                    startBot();
                    break;
                case DisconnectReason.connectionLost:
                    errorMessage = `[⚠️] ${global.lenguajeGB.smsConexionperdida()}`;
                    startBot();
                    break;
                case DisconnectReason.connectionReplaced:
                    errorMessage = `[❌] ${global.lenguajeGB.smsConexionreem()}`;
                    process.exit();
                    break;
                case DisconnectReason.loggedOut:
                    errorMessage = `[❌] ${global.lenguajeGB.smsConexionOFF()}`;
                    process.exit();
                    break;
                case DisconnectReason.restartRequired:
                    errorMessage = `[⚠️] ${global.lenguajeGB.smsConexionreinicio()}`;
                    startBot();
                    break;
                case DisconnectReason.timedOut:
                    errorMessage = `[⚠️] ${global.lenguajeGB.smsConexiontiem()}`;
                    startBot();
                    break;
                case 405: // Specific handling for 405 Connection Failure
                    errorMessage = `[❌] Error de conexión (405): Posiblemente versión desactualizada o problema de red. Por favor, actualiza Baileys y verifica tu conexión a internet.`;
                    startBot();
                    break;
                default:
                    errorMessage = global.lenguajeGB.smsConexiondescon(reason, lastDisconnect.error?.message || '');
                    startBot();
                    break;
            }
            console.log(chalk.red(errorMessage));

        } else if (connection === 'open') {
            console.log(chalk.green('[✅] ¡Conexión abierta con WhatsApp!'));
            // Envía recordatorios al iniciar y luego cada 24 horas
            await sendAutomaticPaymentRemindersLogic(sock);
            setInterval(() => sendAutomaticPaymentRemindersLogic(sock), 24 * 60 * 60 * 1000); // Cada 24 horas
        }
        
        // Manejo de QR (solo si se eligió QR o se forzó con --qr)
        if ((opcion == '1' || methodCodeQR) && qr != 0 && qr != undefined && !methodCode && !existsSync('./sessions/creds.json')) {
            console.log(chalk.bold.yellow(mid.mCodigoQR));
            // El QR se imprime automáticamente en la terminal por `printQRInTerminal: true`
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
    if (global.conn && global.conn.user) {
        clearTmp();
    }
}, 1000 * 60 * 3); // Cada 3 minutos

// Limpiar la carpeta de sesiones cada 10 minutos
setInterval(async () => {
    if (global.conn && global.conn.user) {
        await cleanMainSession();
    }
}, 1000 * 60 * 10); // Cada 10 minutos
