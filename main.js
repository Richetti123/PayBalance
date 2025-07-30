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

    if (connectionMethod === 'qr') {
        sock = makeWASocket(authConfig);
    } else { // connectionMethod === 'code'
        const phoneNumber = await question('Por favor, ingresa tu número de teléfono (ej: 5217771234567 sin el +): ');
        if (!phoneNumber || !/^\d+$/.test(phoneNumber)) {
            console.error('Número de teléfono inválido. Reinicia el bot y provee un número válido.');
            rl.close();
            return;
        }
        
        sock = makeWASocket({
            ...authConfig,
            qrTimeoutMs: undefined,
            pairingCode: true,
            phoneNumber: phoneNumber
        });

        // CAMBIO CLAVE AQUÍ: Usamos .on en lugar de .once
        sock.ev.on('connection.update', (update) => {
            if (update.pairingCode) {
                console.log(`╔═══════════════════════════`);
                console.log(`║ 📲 CÓDIGO DE 8 DÍGITOS PARA VINCULAR:`);
                console.log(`║ ➜  ${update.pairingCode}`);
                console.log(`║ 💡 Abra WhatsApp > Dispositivos vinculados > Vincular un dispositivo > Vincular con número.`);
                console.log(`╚═══════════════════════════`);
                // Si este listener se dispara múltiples veces, el mensaje se repetirá,
                // pero no debería afectar la funcionalidad de la sesión.
            }
        });
    }

    store.bind(sock.ev);

    // --- Manejo de Eventos de Conexión (UNIFICADO) ---
    sock.ev.on('connection.update', async (update) => {
        const { qr, isNewLogin, lastDisconnect, connection, receivedPendingNotifications } = update;

        if (connectionMethod === 'qr' && qr) {
            console.log('QR Code recibido. Escanéalo con tu teléfono.');
        }

        if (connection === 'close') {
            let reason = lastDisconnect?.error ? boomify(lastDisconnect.error)?.output.statusCode : undefined;

            if (reason === DisconnectReason.badSession) {
                console.log(`Bad Session File, Please Delete 'Richetti' folder and Scan Again.`);
                startBot();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log("Connection closed, reconnecting....");
                startBot();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log("Connection Lost from Server, reconnecting...");
                startBot();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log("Connection Replaced, Another new session opened, please close current session first");
                startBot();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(`Device Logged Out, Please Delete 'Richetti' folder and Scan Again.`);
                startBot();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log("Restart Required, Restarting...");
                startBot();
            } else {
                console.log(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`);
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Opened connection');
            sendAutomaticPaymentReminders(sock);
            setInterval(() => sendAutomaticPaymentReminders(sock), 24 * 60 * 60 * 1000);
            rl.close();
        }
    });

    sock.ev.on('creds.update', saveCreds);

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
            console.error('Error en messages.upsert:', e);
        }
    });

    return sock;
}

startBot();
