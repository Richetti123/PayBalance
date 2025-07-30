import Boom from '@hapi/boom';
import NodeCache from 'node-cache';
import P from 'pino';

// Aquí importamos makeWASocket y otras utilidades como exportaciones nombradas.
// Esta es la forma más común y recomendada para @whiskeysockets/baileys.
import {
    makeWASocket, // Debería ser la función principal
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
import sendAutomaticPaymentReminders from './plugins/recordatorios.js'; // Importación por defecto

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

// --- Cache para mensajes ---
const msgRetryCounterCache = new NodeCache();

// --- Función Principal de Conexión ---
async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('sessions'); 

    const sock = makeWASocket({ // Esta es la llamada que esperamos funcione
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
    sock.ev.on('messages.upsert', async
