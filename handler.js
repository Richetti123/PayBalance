import { generateWAMessageFromContent } from '@whiskeysockets/baileys'; // Esta importación de Baileys está bien aquí
import { smsg } from './lib/simple.js'; // <-- RUTA CORRECTA, y ahora simple.js estará bien
import { format } from 'util';
import path from 'path'; // Consolidado
import { fileURLToPath } from 'url';
import fs from 'fs';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { manejarRespuestaPago } from './lib/respuestapagos.js';
import { handleIncomingMedia } from './lib/comprobantes.js';
import { isPaymentProof } from './lib/keywords.js';

// Definición de __dirname para módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isNumber = x => typeof x === 'number' && !isNaN(x);
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
    clearTimeout(this);
    resolve();
}, ms));

/**
 * Handle messages upsert
 * @param {import('@whiskeysockets/baileys').WAMessage} m
 * @param {import('@whiskeysockets/baileys').WASocket} conn
 * @param {import('@whiskeysockets/baileys').InMemoryStore} store
 */
export async function handler(m, conn, store) {
    if (!m) return;

    try {
        if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
        if (m.key.remoteJid === 'status@broadcast') return;

        m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
        m.message = (Object.keys(m.message)[0] === 'viewOnceMessage') ? m.message.viewOnceMessage.message : m.message;

        m = smsg(conn, m);
        if (!m.text) return;

        if (!m.sender) return;

        // Inicializar datos del usuario en la base de datos Nedb si no existen
        // Asumiendo que global.db.data.users es una instancia de Nedb Datastore
        const senderJid = m.sender;
        let userDoc = await new Promise((resolve, reject) => {
            global.db.data.users.findOne({ id: senderJid }, (err, doc) => {
                if (err) reject(err);
                resolve(doc);
            });
        });

        if (!userDoc) {
            userDoc = {
                id: senderJid,
                awaitingPaymentResponse: false,
                paymentClientName: '',
                paymentClientNumber: ''
            };
            await new Promise((resolve, reject) => {
                global.db.data.users.insert(userDoc, (err, newDoc) => {
                    if (err) reject(err);
                    resolve(newDoc);
                });
            });
        }
        // Para acceso directo en el handler
        const user = userDoc;

        // --- Lógica del Bot de Cobros ---

        // 1. Manejar respuestas a los mensajes de recordatorio de pago
        const textoMensaje = m.text.toLowerCase();
        const esImagenConComprobante = m.message?.imageMessage && m.message.imageMessage?.caption && isPaymentProof(m.message.imageMessage.caption);
        const esDocumentoConComprobante = m.message?.documentMessage && m.message.documentMessage?.caption && isPaymentProof(m.message.documentMessage.caption);

        if (user.awaitingPaymentResponse || esImagenConComprobante || esDocumentoConComprobante) {
            const handled = await manejarRespuestaPago(m, conn);
            if (handled) return;
        }

        // 2. Manejar la llegada de cualquier medio (imagen/documento) para buscar comprobantes
        if (m.message?.imageMessage || m.message?.documentMessage) {
            const handledMedia = await handleIncomingMedia(m, conn);
            if (handledMedia) return;
        }

        // 3. Manejar comandos específicos del bot de cobros
        const prefix = '.';
        const command = m.text.startsWith(prefix) ? m.text.slice(prefix.length).split(' ')[0].toLowerCase() : null;
        const textArgs = m.text.startsWith(prefix) ? m.text.slice(prefix.length + (command ? command.length + 1 : 0)).trim() : m.text.trim();

        switch (command) {
            case 'registrarpago':
                // Solo el propietario del bot debería poder registrar pagos
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: registrarPagoHandler } = await import('./plugins/registrarpago.js');
                await registrarPagoHandler(m, { conn, text: textArgs, command, usedPrefix: prefix });
                break;

            case 'recordatorio':
                // Solo el propietario del bot debería poder enviar recordatorios manuales
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: recordatorioHandler } = await import('./lib/recordatorio.js');
                await recordatorioHandler(m, { conn, text: textArgs, command, usedPrefix: prefix });
                break;

            case 'clientes':
            case 'listarpagos':
                // Comando para listar clientes y sus pagos
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const paymentsFilePath = path.join(__dirname, 'src', 'pagos.json'); // path.join(__dirname, '../src', 'pagos.json') también funcionaría si handler estuviera en plugins/
                if (fs.existsSync(paymentsFilePath)) {
                    const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                    let clientList = '📊 *Lista de Clientes y Pagos:*\n\n';
                    for (const num in clientsData) {
                        const client = clientsData[num];
                        clientList += `*👤 Nombre:* ${client.nombre}\n`;
                        clientList += `*📞 Número:* ${num}\n`;
                        clientList += `*🗓️ Día de Pago:* ${client.diaPago}\n`;
                        clientList += `*💰 Monto:* ${client.monto}\n`;
                        clientList += `*🌎 Bandera:* ${client.bandera}\n`;
                        clientList += '----------------------------\n';
                    }
                    if (Object.keys(clientsData).length === 0) {
                        clientList = '❌ No hay clientes registrados en la base de datos de pagos.';
                    }
                    await conn.sendMessage(m.chat, { text: clientList }, { quoted: m });
                } else {
                    await conn.sendMessage(m.chat, { text: '❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.' }, { quoted: m });
                }
                break;

            default:
                // Puedes dejar esto vacío o con un mensaje muy genérico para no confundir.
                break;
        }

    } catch (e) {
        console.error('Error en handler:', e);
    }
}
