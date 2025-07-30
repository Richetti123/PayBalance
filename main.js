import Boom, { boomify } from '@hapi/boom';
import P from 'pino';
import readline from 'readline';

import {
    makeWASocket,
    useMultiFileAuthState,
    makeInMemoryStore,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay
} from '@whiskeysockets/baileys';

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import Datastore from '@seald-io/nedb';
import sendAutomaticPaymentReminders from './plugins/recordatorios.js';

// Importar PhoneNumberUtil para validación y normalización
import pkg from 'google-libphonenumber';
const { PhoneNumberUtil } = pkg;
const phoneUtil = PhoneNumberUtil.getInstance();

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// --- Función para normalizar números de teléfono ---
function normalizePhoneNumber(number) {
    let cleanedNumber = number.replace(/\s+/g, ''); // Eliminar todos los espacios
    if (!cleanedNumber.startsWith('+')) {
        cleanedNumber = `+${cleanedNumber}`; // Añadir '+' si falta
    }
    // **CORRECCIÓN CLAVE PARA NÚMEROS DE MÉXICO (+521 a +52)**
    if (cleanedNumber.startsWith('+521')) {
        cleanedNumber = cleanedNumber.replace('+521', '+52');
    }
    return cleanedNumber;
}

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
    global.db.data[collection] = new Datastore({ filename: `./src/${collection}.db`, autoload: true });
    global.db.data[collection].loadDatabase();
});

// --- Almacenamiento en Memoria para Baileys ---
const store = makeInMemoryStore({ logger: P().child({ level: 'silent', stream: 'store' }) });

// --- Interfaz para leer entrada del usuario ---
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('Richetti');
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`Usando Baileys versión: ${version.join('.')}`);

    let connectionMethod = null;

    // Verificar si ya hay credenciales y si el bot ya está registrado
    if (state.creds && state.creds.registered === true) {
        console.log('✅ Credenciales existentes detectadas. Intentando iniciar sesión...');
        connectionMethod = 'existing'; // No preguntar, intentar reconectar
    } else {
        while (connectionMethod === null) {
            const choice = await question('¿Cómo quieres vincular el bot?\n1. Conexión por código QR\n2. Conexión por código de 8 dígitos\nIngresa 1 o 2: ');

            if (choice === '1') {
                connectionMethod = 'qr';
            } else if (choice === '2') {
                connectionMethod = 'code';
            } else {
                console.log('Opción no válida. Por favor, ingresa 1 o 2.');
            }
        }
    }

    const authConfig = {
        logger: P({ level: 'silent' }).child({ level: 'silent' }),
        printQRInTerminal: connectionMethod === 'qr',
        browser: ['RichettiBot', 'Safari', '1.0.0'],
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' }).child({ level: 'fatal' }))
        },
        version,
        shouldSyncHistoryMessage: true,
        getMessage: async (key) => {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg.message || undefined;
            }
            return undefined;
        }
    };

    let sock;

    if (connectionMethod === 'qr' || connectionMethod === 'existing') { // Se usa el mismo flujo para QR y Existing
        sock = makeWASocket(authConfig);
    } else { // connectionMethod === 'code'
        sock = makeWASocket({
            ...authConfig,
            qrTimeoutMs: undefined
        });

        const rawPhoneNumber = await question('Por favor, ingresa tu número de teléfono (ej: 5217771234567 sin el +): ');
        const phoneNumber = normalizePhoneNumber(rawPhoneNumber);

        try {
            if (!phoneUtil.isValidNumber(phoneUtil.parseAndKeepRawInput(phoneNumber))) {
                console.error('Número de teléfono inválido o en formato incorrecto después de la normalización. Asegúrate de que es un número de WhatsApp válido.');
                rl.close();
                return;
            }
        } catch (e) {
            console.error('Error de validación del número con libphonenumber:', e.message);
            rl.close();
            return;
        }

        try {
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`╔═══════════════════════════`);
            console.log(`║ 📲 CÓDIGO DE 8 DÍGITOS PARA VINCULAR:`);
            console.log(`║ ➜  ${code}`);
            console.log(`║ 💡 Abra WhatsApp > Dispositivos vinculados > Vincular un dispositivo > Vincular con número.`);
            console.log(`╚═══════════════════════════`);
        } catch (e) {
            console.error('❌ Error al solicitar el código de emparejamiento:', e.message || e);
            console.log('Asegúrate de que el número de teléfono sea válido y no tenga el "+".');
            console.log('También, verifica que tu fork de Baileys soporte requestPairingCode de esta manera.');
            rl.close();
            return;
        }
    }

    store.bind(sock.ev);

    // --- Manejo de Eventos de Conexión (UNIFICADO) ---
    sock.ev.on('connection.update', async (update) => {
        const { qr, isNewLogin, lastDisconnect, connection, receivedPendingNotifications } = update;

        console.log('🔄 Estado de conexión actualizado:', { connection, isNewLogin, lastDisconnectError: lastDisconnect?.error?.message });

        if (connectionMethod === 'qr' && qr) {
            console.log('QR Code recibido. Escanéalo con tu teléfono.');
        }

        if (connection === 'close') {
            let reason = lastDisconnect?.error ? boomify(lastDisconnect.error)?.output.statusCode : undefined;

            console.log(`🔴 Conexión cerrada. Razón: ${reason}`);

            if (reason === DisconnectReason.badSession) {
                console.log(`❌ Sesión corrupta. Por favor, elimina la carpeta 'Richetti' y vuelve a escanear/vincular.`);
                // fs.rmSync('Richetti', { recursive: true, force: true }); // Descomentar para borrado automático
                startBot();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log("🟡 Conexión cerrada, reconectando....");
                startBot();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log("🟠 Conexión perdida con el servidor, reconectando...");
                startBot();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log("⚠️ Conexión reemplazada. Otra sesión se abrió. Cierra la sesión actual e intenta de nuevo.");
                startBot();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(`⛔ Sesión cerrada. Por favor, elimina la carpeta 'Richetti' y vuelve a escanear/vincular.`);
                // fs.rmSync('Richetti', { recursive: true, force: true }); // Descomentar para borrado automático
                startBot();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log("🔄 Reinicio requerido. Reiniciando el bot...");
                startBot();
            } else {
                console.log(`❓ Razón de desconexión desconocida: ${reason}|${lastDisconnect?.error}`);
                startBot();
            }
        } else if (connection === 'open') {
            console.log('✅ Conexión establecida.');
            if (isNewLogin) {
                console.log('✨ ¡Nueva sesión iniciada exitosamente!');
            } else {
                console.log('✨ Sesión reconectada exitosamente.');
            }
            sendAutomaticPaymentReminders(sock);
            setInterval(() => sendAutomaticPaymentReminders(sock), 24 * 60 * 60 * 1000);
            rl.close(); // Cerrar la interfaz readline una vez conectado
        }
    });

    // Diagnóstico: Añadir un log para ver si creds.update se dispara
    sock.ev.on('creds.update', () => {
        console.log('💾 Credenciales actualizadas/guardadas. Verifique la carpeta "Richetti".');
        saveCreds(); // Asegúrate de que saveCreds se siga llamando
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const m = chatUpdate.messages[0];
            if (!m.message) return;
            if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
            if (m.key.remoteJid === 'status@broadcast') return;

            m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
            m.message = (Object.keys(m.message)[0] === 'viewOnceMessage') ? m.message.viewOnceMessage.message : m.message;

            global.self = sock.user.id.split(':')[0] + '@s.whatsapp.net';

            const { handler } = await import('./handler.js');
            await handler(m, sock, store);
        } catch (e) {
            console.error('❌ Error en messages.upsert (posiblemente en handler.js):', e);
        }
    });

    return sock;
}

startBot();
