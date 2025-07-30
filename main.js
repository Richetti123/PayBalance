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
    delay,
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
} from './plugins/recordatorios.js';

// Importaciones de 'fs/promises' para operaciones asíncronas
import {
    readdir,
    unlink,
    stat
} from 'fs/promises';

// Importaciones adicionales de tu main (2).js para la lógica de conexión
import pkg from 'google-libphonenumber';
const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// --- DEFINICIONES PROVISIONALES PARA global.mid y global.lenguajeGB ---
// Si ya tienes estas definiciones en tu config.js o en otro archivo,
// POR FAVOR, ELIMINA ESTAS LÍNEAS para evitar conflictos.
global.mid = {
    methodCode1: "╔═════ᨒ═╍═╍═✦═╍═╍═ᨒ═════╗",
    methodCode2: "║  [ *SELECCIONE EL TIPO DE CONEXIÓN* ]  ║",
    methodCode3: "OPCIÓN",
    methodCode4: "CONECTAR POR CÓDIGO QR",
    methodCode5: "CONECTAR POR CÓDIGO DE 8 DÍGITOS",
    methodCode6: "╰═▶️ SI NO SABES CÓMO ELEGIR",
    methodCode7: "         ELIJE LA OPCIÓN 1",
    methodCode8: "PARA MÁS DETALLES, UTILICE LA LÍNEA DE COMANDOS",
    methodCode9: "node . --qr",
    methodCode10: "node . --code <numero>",
    methodCode11: (chalk) => `[ ${chalk.bold.redBright('❌ ERROR')} ] POR FAVOR, SELECCIONE UN NÚMERO ENTRE EL 1 O EL 2`,
    methodCode12: 'Conexión por código QR',
    methodCode13: 'Conexión por código de 8 dígitos',
    methodCode14: 'Inicia el bot normalmente',
    phNumber2: (chalk) => `[ ${chalk.bold.greenBright('⚠️ INGRESAR NÚMERO')} ] POR FAVOR, INGRESE SU NÚMERO DE WHATSAPP CON EL CÓDIGO DE PAÍS. EJEMPLO: ${chalk.yellow('52155XXXXXXXX')}\n---> `,
    pairingCode: '[ ⚠️ CÓDIGO DE EMPAREJAMIENTO ]',
    mCodigoQR: 'ESCANEA EL CÓDIGO QR', // Añadido de tu main (2).js
    mConexion: '¡CONEXIÓN ESTABLECIDA CORRECTAMENTE!' // Añadido de tu main (2).js
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
    smsConexionreem: () => `[ ⚠️ ] CONEXIÓN REEMPLAZADA, SE HA ABIERTO OTRA NUEVA SESIÓN, CIERRE LA SESIÓN ACTUAL PRIMERO.`,
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
// --- FIN DE DEFINICIONES PROVISIONALES ---


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

// Función para hacer preguntas en la consola (mejorada para coincidir con el readline de tu main (2).js)
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

// Función de validación de número de teléfono (copiada de tu main (2).js)
async function isValidPhoneNumber(number) {
    try {
        number = number.replace(/\s+/g, '')
        // Si el número empieza con '+521' o '+52 1', quitar el '1'
        if (number.startsWith('+521')) {
            number = number.replace('+521', '+52'); // Cambiar +521 a +52
        } else if (number.startsWith('+52') && number[4] === '1') {
            number = number.replace('+52 1', '+52'); // Cambiar +52 1 a +52
        }
        const parsedNumber = phoneUtil.parseAndKeepRawInput(number)
        return phoneUtil.isValidNumber(parsedNumber)
    } catch (error) {
        return false
    }
}

// Función para redefinir los métodos de consola y filtrar mensajes (tal como en tu original main (2).js)
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
    const { version, isLatest } = await fetchLatestBaileysVersion() // <-- CORRECCIÓN AQUÍ: eliminado el espacio en 'is latest'
    console.log(chalk.cyan(`[ℹ️] Usando Baileys v${version.join('.')}${!isLatest ? ' (no es la última, considerar actualizar)' : ''}`));


    // 1. Analizar los argumentos de línea de comandos para ver si se forzó un modo
    const argv = yargs(process.argv.slice(2)).parse();
    
    // Variables de control de tu main (2).js
    let phoneNumber = null; // Puedes definir global.botNumberCode si quieres un número por defecto
    const methodCodeQR = process.argv.includes("qr"); // `node . --qr`
    const methodCode = !!phoneNumber || process.argv.includes("code"); // `node . --code` o si phoneNumber ya está definido
    const MethodMobile = process.argv.includes("mobile"); // `node . --mobile`

    let opcion; // Variable para almacenar la elección del usuario (1 o 2)

    // Si se usa 'npm run qr' o 'node . --qr', se fuerza la opción 1 (QR)
    if (methodCodeQR) {
        opcion = '1';
    }

    // --- Lógica Interactiva para elegir tipo de conexión (copiada de tu main (2).js) ---
    // Este es el bloque que pregunta al usuario si quiere QR o código de 8 dígitos.
    if (!methodCodeQR && !methodCode && !existsSync('./sessions/creds.json')) {
        do {
            let lineM = '⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ 》'
            opcion = await question(`╭${lineM}  
┊ ${chalk.blueBright('╭┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')}
┊ ${chalk.blueBright('┊')} ${chalk.blue.bgBlue.bold.cyan(mid.methodCode1)}
┊ ${chalk.blueBright('╰┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')}   
┊ ${chalk.blueBright('╭┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')}     
┊ ${chalk.blueBright('┊')} ${chalk.green.bgMagenta.bold.yellow(mid.methodCode2)}
┊ ${chalk.blueBright('┊')} ${chalk.bold.redBright(`⇢  ${mid.methodCode3} 1:`)} ${chalk.greenBright(mid.methodCode4)}
┊ ${chalk.blueBright('┊')} ${chalk.bold.redBright(`⇢  ${mid.methodCode3} 2:`)} ${chalk.greenBright(mid.methodCode5)}
┊ ${chalk.blueBright('╰┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')}
┊ ${chalk.blueBright('╭┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')}     
┊ ${chalk.blueBright('┊')} ${chalk.italic.magenta(mid.methodCode6)}
┊ ${chalk.blueBright('┊')} ${chalk.italic.magenta(mid.methodCode7)}
┊ ${chalk.blueBright('╰┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')} 
┊ ${chalk.blueBright('╭┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')}    
┊ ${chalk.blueBright('┊')} ${chalk.red.bgRed.bold.green(mid.methodCode8)}
┊ ${chalk.blueBright('┊')} ${chalk.italic.cyan(mid.methodCode9)}
┊ ${chalk.blueBright('┊')} ${chalk.italic.cyan(mid.methodCode10)}
┊ ${chalk.blueBright('┊')} ${chalk.bold.yellow(`npm run qr ${chalk.italic.magenta(`(${mid.methodCode12})`)}`)}
┊ ${chalk.blueBright('┊')} ${chalk.bold.yellow(`npm run code ${chalk.italic.magenta(`(${mid.methodCode13})`)}`)}
┊ ${chalk.blueBright('┊')} ${chalk.bold.yellow(`npm start ${chalk.italic.magenta(`(${mid.methodCode14})`)}`)}
┊ ${chalk.blueBright('╰┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')} 
╰${lineM}\n${chalk.bold.magentaBright('---> ')}`);
            if (!/^[1-2]$/.test(opcion)) {
                console.log(chalk.bold.redBright(mid.methodCode11(chalk)));
            }
        } while (opcion !== '1' && opcion !== '2' || existsSync('./sessions/creds.json'));
    }

    const {
        state,
        saveCreds
    } = await useMultiFileAuthState('sessions');

    // Si se eligió la opción de código, se pide el número si no se dio por argumento
    if ((opcion === '2' || methodCode) && !existsSync('./sessions/creds.json')) {
        if (!phoneNumber) {
            let addNumber;
            do {
                phoneNumber = await question(chalk.bgBlack(chalk.bold.greenBright(mid.phNumber2(chalk))));
                addNumber = phoneNumber.replace(/\D/g, ''); // Limpia el número
                // Manejo específico para números mexicanos que a veces vienen con '1' después del código de país
                if (addNumber.startsWith('521') && addNumber.length === 12) { 
                    addNumber = '52' + addNumber.substring(3); // Elimina el '1' después del 52
                } else if (!addNumber.startsWith('+')) {
                    addNumber = `+${addNumber}`;
                }
            } while (!await isValidPhoneNumber(addNumber));
            phoneNumber = addNumber; // Actualiza phoneNumber con el número validado y limpiado
        }
        console.log(chalk.blue(`\nPor favor, espera. Si tu número (${phoneNumber}) es válido, se generará un código de 8 dígitos.`));
        console.log(chalk.green(`Ingresa este código en tu WhatsApp móvil (Vincula un Dispositivo > Vincular con número de teléfono).`));
        // El código aparecerá automáticamente en la consola, ya que Baileys lo gestiona.
    }


    const sock = makeWASocket({
        logger: P({
            level: 'silent'
        }),
        // --- CONFIGURACIÓN CLAVE PARA QR Y CÓDIGO DE 8 DÍGITOS EN BAILEYS ---
        // printQRInTerminal: Imprime el QR en la terminal. Se activa si se eligió opción 1 o se usó --qr
        printQRInTerminal: opcion == '1' ? true : methodCodeQR ? true : false,
        mobile: MethodMobile, // Habilita modo móvil si se usó --mobile
        // pairingCode: Pasa el número para generar el código de emparejamiento.
        // Se activa si se eligió opción 2 o se usó --code.
        // Solo se pasa el pairingCode si no hay credenciales existentes y se eligió esa opción.
        pairingCode: (opcion === '2' || methodCode) && !existsSync('./sessions/creds.json') ? phoneNumber : undefined,
        // --- FIN CONFIGURACIÓN CLAVE ---
        browser: opcion == '1' ? ['LogisticBot', 'Desktop', '3.0'] : methodCodeQR ? ['LogisticBot', 'Desktop', '3.0'] : ["Ubuntu", "Chrome", "20.0.04"], // Ajusta el navegador según la opción
        auth: state,
        generateHighQualityLinkPreview: true,
        msgRetryCounterCache,
        shouldIgnoreJid: jid => false,
        cachedGroupMetadata: (jid) => global.conn.chats[jid] ?? {}, // Asume que global.conn.chats existe y está poblado
        version: version, // Usar la versión obtenida dinámicamente
        keepAliveIntervalMs: 55000,
        maxIdleTimeMs: 60000,
    });

    // Asignar sock a global.conn para que las funciones de limpieza lo puedan usar
    global.conn = sock;
    
    // Asignar store a global.conn para compatibilidad con otros módulos que lo usen
    global.conn.store = store; 

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
            console.log(chalk.green('[✅] Conexión abierta con WhatsApp.'));
            // Envía recordatorios al iniciar y luego cada 24 horas
            await sendAutomaticPaymentRemindersLogic(sock);
            setInterval(() => sendAutomaticPaymentRemindersLogic(sock), 24 * 60 * 60 * 1000); // Cada 24 horas
        }
        
        // Manejo de QR desde tu main (2).js (solo si no se usó el método de código y no hay credenciales)
        if (qr != 0 && qr != undefined && !methodCode && !existsSync('./sessions/creds.json')) {
            if (opcion == '1' || methodCodeQR) {
                console.log(chalk.bold.yellow(mid.mCodigoQR));
            }
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
