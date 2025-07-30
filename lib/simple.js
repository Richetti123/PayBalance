import { jidDecode, generateWAMessageFromContent } from '@whiskeysockets/baileys';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import util from 'util';
// No incluyo 'idiomas/total-idiomas.js', 'converter.js', 'chalk', 'fetch', 'PhoneNumber', 'file-type', 'store.js', 'Jimp'
// ni las otras funciones de Baileys que se exportaban en tu simple.js original,
// ya que no son directamente usadas por la función smsg ni por el handler simplificado.
// Si en el futuro necesitas alguna de ellas, puedes añadirlas.

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Normaliza el objeto del mensaje de Baileys para facilitar su uso.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} conn El objeto de conexión de Baileys.
 * @param {import('@whiskeysockets/baileys').WAMessage} m El objeto del mensaje de Baileys.
 * @param {boolean} [doNotReply=false] Si es true, el mensaje no se modificará para enviar respuestas.
 * @returns {import('@whiskeysockets/baileys').WAMessage} El objeto del mensaje normalizado.
 */
export function smsg(conn, m, doNotReply = false) {
    if (!m) return m;

    // Asegura que conn.decodeJid y conn.getName estén disponibles si no lo están directamente
    // Baileys v6+ tiene decodeJid en el objeto de conexión
    conn.decodeJid = jid => {
        if (!jid) return jid;
        if (/:\d+@/gi.test(jid)) {
            let decode = jidDecode(jid) || {};
            return (decode.user && decode.server && decode.user + '@' + decode.server || jid).trim();
        }
        return jid.trim();
    };

    conn.getName = (jid) => {
        const id = conn.decodeJid(jid);
        if (id.endsWith('@g.us')) {
            const groupMetadata = (conn.chats?.[id] || {}).metadata || conn.groupMetadata(id) || {};
            return groupMetadata.subject || groupMetadata.name || id;
        } else {
            return (conn.contacts?.[id]?.name || conn.contacts?.[id]?.verifiedName || conn.contacts?.[id]?.notify || '' + id).trim();
        }
    };


    if (m.message) {
        // Asegura que m.message.ephemeralMessage y m.message.viewOnceMessage sean manejados
        m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
        m.message = (Object.keys(m.message)[0] === 'viewOnceMessage') ? m.message.viewOnceMessage.message : m.message;
    }

    // `text` y `body`
    if (m.message) {
        m.text = m.message.conversation ||
                 m.message.extendedTextMessage?.text ||
                 m.message.imageMessage?.caption ||
                 m.message.videoMessage?.caption ||
                 m.message.documentMessage?.caption ||
                 m.message.buttonResponseMessage?.selectedButtonId ||
                 m.message.listResponseMessage?.singleSelectReply?.selectedRowId ||
                 m.message.templateButtonReplyMessage?.selectedId ||
                 m.message.stickerMessage?.url || // Esto podría no ser necesario si no procesas stickers como comandos
                 m.message.editedMessage?.extendedTextMessage?.text ||
                 '';
        m.body = m.text; // Usar 'body' como alias de 'text'
    } else {
        m.text = '';
        m.body = '';
    }

    // JIDs del chat y del remitente
    m.chat = m.key.remoteJid;
    m.sender = conn.decodeJid(m.key.fromMe && conn.user.id || m.participant || m.key.remoteJid || m.sender);
    m.isGroup = m.chat.endsWith('@g.us');
    m.fromMe = m.key.fromMe || false;

    // `pushName` (nombre de contacto)
    m.pushName = m.pushName || conn.getName(m.sender);

    // `isOwner`
    // TU NÚMERO DE ADMINISTRADOR AÑADIDO AQUÍ
    m.isOwner = m.sender === '5217771303481@s.whatsapp.net';

    // Función para responder a un mensaje
    m.reply = async (text, chatId = m.chat, options = {}) => {
        if (doNotReply) return; // Si se especifica no responder, salir
        return conn.sendMessage(chatId, { text: util.format(text) + '', ...options }, { quoted: m, ...options });
    };

    // `mentionedJid` (menciones)
    let r = m.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (r) m.mentionedJid = r;

    // Alias para `conn` (socket)
    m.conn = conn;

    // Obtener el prefijo del mensaje
    const prefixes = ['.', '!', '/', '#', '']; // Define los prefijos que tu bot usa
    const selectedPrefix = prefixes.find(prefix => m.text.startsWith(prefix));
    m.prefix = selectedPrefix || '';

    // Extraer comando y argumentos
    if (m.text.startsWith(m.prefix) && m.prefix.length > 0) {
        const fullCommand = m.text.slice(m.prefix.length).trim().split(' ')[0].toLowerCase();
        m.command = fullCommand;
        m.args = m.text.slice(m.prefix.length + fullCommand.length).trim().split(' ').filter(v => v);
    } else {
        m.command = null;
        m.args = [];
    }

    // Si tu `simple.js` original tenía otras propiedades o métodos que tu `handler.js`
    // u otros archivos de cobros necesiten y no estén aquí, deberás añadirlos manualmente.
    // Por ejemplo:
    // m.download = async () => await conn.downloadMediaMessage(m.message.imageMessage || m.message.videoMessage || m.message.documentMessage);
    // m.media = m.message?.imageMessage || m.message?.videoMessage || m.message?.documentMessage;

    return m;
}

// Puedes añadir otras utilidades de simple.js aquí si son estrictamente necesarias
// para las funciones de cobro que no sean smsg.
