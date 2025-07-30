import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './lib/simple.js';
import { format } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk'; // Asegúrate de que esta línea esté presente
import fetch from 'node-fetch';
import { manejarRespuestaPago } from './lib/respuestapagos.js';
import { handleIncomingMedia } from './lib/comprobantes.js';
import { isPaymentProof } from './lib/keywords.js';

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
        let senderJid = m.sender || m.key?.participant || m.key?.remoteJid;
        
        senderJid = String(senderJid); 

        let senderNumber = 'Desconocido';
        let senderName = m.pushName || 'Desconocido';

        if (senderJid && senderJid !== 'undefined' && senderJid !== 'null') {
             senderNumber = senderJid.split('@')[0]; 
        } else {
            console.warn(`Mensaje recibido con senderJid inválido: '${senderJid}'. No se pudo determinar el número de remitente.`);
        }
        
        let groupName = 'Chat Privado';
        if (m.key.remoteJid && m.key.remoteJid.endsWith('@g.us')) {
            try {
                const groupMetadata = await conn.groupMetadata(m.key.remoteJid);
                groupName = groupMetadata.subject || 'Grupo Desconocido';
            } catch (e) {
                console.error("Error al obtener metadatos del grupo:", e);
                groupName = 'Grupo (Error)';
            }
        }
        
        const messageType = Object.keys(m.message || {})[0];
        const rawText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        const commandForLog = rawText.startsWith('.') || rawText.startsWith('!') || rawText.startsWith('/') || rawText.startsWith('#') ? rawText.split(' ')[0] : null;

        // *** BLOQUE DE CONSOLE.LOG CON COLORES AJUSTADOS A TU IMAGEN ***
        console.log(
            chalk.hex('#FF8C00')(`╭━━━━━━━━━━━━━━𖡼`) + '\n' + // Naranja oscuro para los bordes
            chalk.white(`┃ ❖ Bot: ${chalk.cyan(conn.user.jid?.split(':')[0]?.replace(':', '') || 'N/A')} ~${chalk.cyan(conn.user?.name || 'Bot')}`) + '\n' +
            chalk.white(`┃ ❖ Horario: ${chalk.greenBright(new Date().toLocaleTimeString())}`) + '\n' +
            chalk.white(`┃ ❖ Acción: ${commandForLog ? chalk.yellow(`Comando: ${commandForLog}`) : chalk.yellow('Mensaje')}`) + '\n' +
            chalk.white(`┃ ❖ Usuario: ${chalk.blueBright('+' + senderNumber)} ~${chalk.blueBright(senderName)}`) + '\n' +
            chalk.white(`┃ ❖ Grupo: ${chalk.magenta(groupName)}`) + '\n' + 
            chalk.white(`┃ ❖ Tipo de mensaje: [Recibido] ${chalk.red(messageType)}`) + '\n' +
            chalk.hex('#FF8C00')(`╰━━━━━━━━━━━━━━𖡼`) + '\n' +
            chalk.white(`Contenido: ${rawText || ' (Sin texto legible) '}`) // Contenido en gris para diferenciar
        );
        // --- FIN: Bloque para logging visual ---

        m = smsg(conn, m); 

        if (!m.sender) {
            console.warn('Mensaje procesado por smsg sin un m.sender válido. Ignorando.');
            return;
        }

        let userDoc = await new Promise((resolve, reject) => {
            global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
                if (err) reject(err);
                resolve(doc);
            });
        });

        if (!userDoc) {
            userDoc = {
                id: m.sender,
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
        const user = userDoc;

        const textoMensaje = m.text.toLowerCase();
        const esImagenConComprobante = m.message?.imageMessage && m.message.imageMessage?.caption && isPaymentProof(m.message.imageMessage.caption);
        const esDocumentoConComprobante = m.message?.documentMessage && m.message.documentMessage?.caption && isPaymentProof(m.message.documentMessage.caption);

        if (user.awaitingPaymentResponse || esImagenConComprobante || esDocumentoConComprobante) {
            const handled = await manejarRespuestaPago(m, conn);
            if (handled) return;
        }

        if (m.message?.imageMessage || m.message?.documentMessage) {
            const handledMedia = await handleIncomingMedia(m, conn);
            if (handledMedia) return;
        }

        const prefix = m.prefix; 

        switch (m.command) {
            case 'registrarpago':
            case 'agregarcliente':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: registrarPagoHandler } = await import('./plugins/registrarpago.js');
                await registrarPagoHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'recordatorio':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: recordatorioHandler } = await import('./plugins/recordatorios.js');
                await recordatorioHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'limpiarpago':
            case 'eliminarcliente':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: limpiarpagoHandler } = await import('./plugins/limpiarpago.js');
                await limpiarpagoHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'clientes':
            case 'listarpagos':
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
                break;
        }

    } catch (e) {
        console.error('Error en handler:', e);
    }
}
