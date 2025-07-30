import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './lib/simple.js'; // <-- RUTA CORRECTA para smsg
import { format } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { manejarRespuestaPago } from './lib/respuestapagos.js'; // <-- RUTA CORRECTA
import { handleIncomingMedia } from './lib/comprobantes.js'; // <-- RUTA CORRECTA
import { isPaymentProof } from './lib/keywords.js'; // <-- RUTA CORRECTA

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

        // --- INICIO: Bloque para logging visual de mensajes recibidos ---
        // Este bloque debe ir ANTES de `m = smsg(conn, m);` para usar el 'm' crudo y luego el 'm' normalizado para el comando.
        const senderJid = m.sender || m.key?.participant || m.key?.remoteJid;
        const senderNumber = senderJid ? senderJid.split('@')[0] : 'Desconocido';
        const senderName = m.pushName || 'Desconocido';
        
        let groupName = 'Chat Privado';
        if (m.key.remoteJid.endsWith('@g.us')) {
            try {
                const groupMetadata = await conn.groupMetadata(m.key.remoteJid);
                groupName = groupMetadata.subject || 'Grupo Desconocido';
            } catch (e) {
                console.error("Error al obtener metadatos del grupo:", e);
                groupName = 'Grupo (Error)';
            }
        }
        
        const messageType = Object.keys(m.message || {})[0];
        // Aquí smsg() todavía no ha procesado el 'm', así que el comando lo extraemos manualmente para el log.
        // Después, llamamos a smsg para tener 'm.command' y 'm.prefix' para el switch.
        const rawText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        const commandForLog = rawText.startsWith('.') || rawText.startsWith('!') || rawText.startsWith('/') || rawText.startsWith('#') ? rawText.split(' ')[0] : null;


        console.log(
            `╭━━━━━━━━━━━━━━𖡼\n` +
            `┃ ❖ Bot: ${conn.user.jid.split(':')[0].replace(':', '')} ~${conn.user.name || 'Bot'}\n` +
            `┃ ❖ Horario: ${new Date().toLocaleTimeString()}\n` +
            `┃ ❖ Acción: ${commandForLog ? `Comando: ${commandForLog}` : 'Mensaje'}\n` +
            `┃ ❖ Usuario: +${senderNumber} ~${senderName}\n` +
            `┃ ❖ Grupo: ${groupName}\n` + 
            `┃ ❖ Tipo de mensaje: [Recibido] ${messageType}\n` +
            `╰━━━━━━━━━━━━━━𖡼\n` +
            `Contenido: ${rawText || ' (Sin texto legible) '}\n` 
        );
        // --- FIN: Bloque para logging visual ---


        m = smsg(conn, m); // Asegúrate de que esta línea esté después del log inicial


        if (!m.sender) return;

        // Inicializar datos del usuario en la base de datos Nedb si no existen
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
        // Los comandos se extraen con smsg, ahora m.command y m.args ya están disponibles
        const prefix = m.prefix; // Usar el prefijo detectado por smsg

        switch (m.command) { // Usamos m.command directamente
            case 'registrarpago':
            case 'agregarcliente': // Incluido el alias
                // Solo el propietario del bot debería poder registrar pagos
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: registrarPagoHandler } = await import('./plugins/registrarpago.js'); // <-- RUTA CORRECTA
                await registrarPagoHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'recordatorio':
                // Solo el propietario del bot debería poder enviar recordatorios manuales
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: recordatorioHandler } = await import('./plugins/recordatorio.js'); // <-- RUTA CORRECTA
                await recordatorioHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'limpiarpago':
            case 'eliminarcliente': // Incluido el alias
                // Solo el propietario del bot debería poder limpiar pagos
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: limpiarpagoHandler } = await import('./plugins/limpiarpago.js'); // <-- RUTA CORRECTA
                await limpiarpagoHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'clientes':
            case 'listarpagos':
                // Comando para listar clientes y sus pagos
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const paymentsFilePath = path.join(__dirname, 'src', 'pagos.json');
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
                // Puedes añadir aquí lógica para mensajes que no son comandos si lo deseas
                break;
        }

    } catch (e) {
        console.error('Error en handler:', e);
    }
}
