import Boom from '@hapi/boom';
import NodeCache from 'node-cache';
import P from 'pino';
// Aquí importamos makeWASocket como DEFAULT export desde Baileys
// y las demás utilidades como NAMED exports.
import makeWASocket, { // <-- ¡CORRECCIÓN CLAVE AQUÍ! makeWASocket es un default export
    useMultiFileAuthState,
    makeInMemoryStore,
    PHONENUMBER_MCC,
    DisconnectReason,
    delay
} from '@whiskeysockets/baileys';

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import util from 'util';
import Datastore from '@seald-io/nedb';
import sendAutomaticPaymentReminders from './plugins/recordatorios.js'; // Importación por defecto (corregida previamente)

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

// Guardar la base de datos en JSON (opcional, se mantiene comentada)
/*
setInterval(() => {
    let dataToSave = {};
}, 30 * 1000);
*/

// --- Almacenamiento en Memoria para Baileys ---
const store = makeInMemoryStore({ logger: P().child({ level: 'silent', stream: 'store' }) });

// --- Cache para mensajes ---
const msgRetryCounterCache = new NodeCache();

// --- Función Principal de Conexión ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sessions'); 

    const sock = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: true,
        browser: ['Bot de Cobros', 'Desktop', '3.0'],
        auth: {
            creds: state.creds,
            keys: {
                preKey: state.keys.preKey,
                session: state.keys.session,
                senderKey: state.keys.senderKey,
                appSyncKey: state.keys.appSyncKey,
                signedPreKey: state.keys.signedPreKey,
                signedIdentityKey: state.keys.signedIdentityKey,
            }
        },
        generateHighQualityLinkPreview: true,
        msgRetryCounterCache,
        shouldIgnoreJid: jid => false
    });

    store.bind(sock.ev);

    // --- Manejo de Eventos de Conexión ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'close') {
            let reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
            if (reason === DisconnectReason.badSession) {
                console.log(`Bad Session File, Please Delete and Scan Again`);
                process.exit();
            } else if (reason === DisconnectReason.connectionClosed) {
                console.log("Connection closed, reconnecting....");
                startBot();
            } else if (reason === DisconnectReason.connectionLost) {
                console.log("Connection Lost from Server, reconnecting...");
                startBot();
            } else if (reason === DisconnectReason.connectionReplaced) {
                console.log("Connection Replaced, Another new session opened, Please Close current session first");
                process.exit();
            } else if (reason === DisconnectReason.loggedOut) {
                console.log(`Device Logged Out, Please Delete Session and Scan Again.`);
                process.exit();
            } else if (reason === DisconnectReason.restartRequired) {
                console.log("Restart Required, Restarting...");
                startBot();
            } else if (reason === DisconnectReason.timedOut) {
                console.log("Connection TimedOut, Reconnecting...");
                startBot();
            } else {
                console.log(`Unknown DisconnectReason: ${reason}|${lastDisconnect.error}`);
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Opened connection');
            sendAutomaticPaymentReminders(sock);
            setInterval(() => sendAutomaticPaymentReminders(sock), 24 * 60 * 60 * 1000);
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

            const { handler } = await import('./handler.js');
            await handler(m, sock, store);

        } catch (e) {
            console.error(e);
        }
    });

    return sock;
}

startBot();
