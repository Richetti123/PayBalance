import { Boom } from '@hapi/boom';
import NodeCache from 'node-cache';
import P from 'pino';
import makeWASocket, {
    useMultiFileAuthState,
    makeInMemoryStore,
    PHONENUMBER_MCC, // Aunque no se usa directamente en este main, puede ser requerido por Baileys internamente.
    DisconnectReason,
    delay
} from '@whiskeysockets/baileys';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import util from 'util';
import Datastore from '@seald-io/nedb';
import { sendAutomaticPaymentReminders } from './plugins/recordatorios.js'; // RUTA ACTUALIZADA

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// --- Configuración de la Base de Datos Nedb ---
global.db = {
    data: {
        users: {},
        chats: {},
        settings: {},
        // Esto intenta cargar un database.json. Si no existe, no pasa nada.
        // Los datos se cargarán desde los archivos .db de Nedb.
        ...(existsSync('./src/database.json') && JSON.parse(readFileSync('./src/database.json')))
    }
};

const collections = ['users', 'chats', 'settings'];
collections.forEach(collection => {
    global.db.data[collection] = new Datastore({ filename: `./src/${collection}.db`, autoload: true });
    global.db.data[collection].loadDatabase();
});

// Guardar la base de datos en JSON (opcional, pero puede ser útil para backup)
// He dejado esta sección comentada como en la versión anterior.
// Si realmente necesitas un database.json con los contenidos de Nedb, deberías
// leer los documentos de cada colección y luego serializarlos.
// Por ahora, la persistencia principal es en los archivos .db de Nedb.
/*
setInterval(() => {
    let dataToSave = {};
    // Para guardar los datos de Nedb en JSON, necesitas exportarlos primero.
    // Esto es complejo ya que Nedb no expone directamente un método para obtener todos los documentos
    // en una forma serializable fácilmente para esto.
    // Si necesitas esto, deberías leer los docs de cada colección y luego serializar.
    // writeFileSync('./src/database.json', JSON.stringify(dataToSave, null, 2));
}, 30 * 1000); // Guardar cada 30 segundos
*/

// --- Almacenamiento en Memoria para Baileys ---
const store = makeInMemoryStore({ logger: P().child({ level: 'silent', stream: 'store' }) });

// --- Cache para mensajes ---
const msgRetryCounterCache = new NodeCache();

// --- Función Principal de Conexión ---
async function startBot() {
    // La sesión se guardará en la carpeta 'sessions' en la raíz del bot-cobros
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
        shouldIgnoreJid: jid => false // No hay razón para ignorar JIDs específicos en este bot de cobros
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
            // --- Iniciar los recordatorios automáticos una vez que el bot esté conectado ---
            sendAutomaticPaymentReminders(sock);
            // Ejecutar recordatorios cada 24 horas (ajusta el intervalo según necesites)
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
            if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return; // Ignorar mensajes de estado o de bots internos de Baileys
            if (m.key.remoteJid === 'status@broadcast') return;

            // Normalización de mensajes efímeros/viewOnce
            m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
            m.message = (Object.keys(m.message)[0] === 'viewOnceMessage') ? m.message.viewOnceMessage.message : m.message;

            global.self = sock.user.id.split(':')[0] + '@s.whatsapp.net';

            // Importar y usar el handler de mensajes
            const { handler } = await import('./handler.js');
            await handler(m, sock, store);

        } catch (e) {
            console.error(e);
        }
    });

    return sock;
}

startBot();
