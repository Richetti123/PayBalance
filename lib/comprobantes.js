import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPaymentProof } from './keywords.js';
import { downloadContentFromMessage, generateWAMessageFromContent } from '@whiskeysockets/baileys';

const ADMIN_NUMBER_FOR_FORWARDING = '5217771303481@s.whatsapp.net';

const __filenameLib = fileURLToPath(import.meta.url);
const __dirnameLib = path.dirname(__filenameLib);

// La función ahora recibe 'clientInfo' del handler principal
export async function handleIncomingMedia(m, conn, clientInfo) {
    if (m.key.remoteJid.endsWith('@g.us')) return false;
    if (!m.message || m.key.fromMe) return false;

    let messageType;
    if (m.message) {
        if (m.message.imageMessage) messageType = 'imageMessage';
        else if (m.message.videoMessage) messageType = 'videoMessage';
        else if (m.message.documentMessage) messageType = 'documentMessage';
    }

    if (!messageType) return false;

    const senderJid = m.key.participant || m.key.remoteJid;
    const senderNumber = senderJid.split('@')[0];
    const formattedSenderNumber = `+${senderNumber}`;
    const captionText = m.message[messageType]?.caption || '';

    if (isPaymentProof(captionText)) {
        // --- CÓDIGO CORREGIDO: Usamos el nombre que nos pasan ---
        const clientName = clientInfo ? clientInfo.nombre : 'Un cliente desconocido';
        // --- FIN DEL CÓDIGO CORREGIDO ---

        const captionForAdmin = `✅ Comprobante recibido de *${clientName}* (${formattedSenderNumber}).`;
        const originalMediaCaption = captionText;

        try {
            let mediaBuffer;
            const msgContent = m.message[messageType];
            const msgTypeForDownload = messageType.replace('Message', '');
            
            const stream = await downloadContentFromMessage(msgContent, msgTypeForDownload);
            const bufferArray = [];
            for await (const chunk of stream) {
                bufferArray.push(chunk);
            }
            mediaBuffer = Buffer.concat(bufferArray);

            if (!mediaBuffer || mediaBuffer.length === 0) {
                throw new Error('El archivo está vacío o falló la descarga.');
            }

            const buttons = [{
                buttonId: `accept_payment_${m.sender}`,
                buttonText: { displayText: '✅ Aceptar transferencia' },
                type: 1
            }, {
                buttonId: `reject_payment_${m.sender}`,
                buttonText: { displayText: '❌ Rechazar transferencia' },
                type: 1
            }];

            let buttonMessage;
            if (messageType === 'imageMessage') {
                buttonMessage = {
                    image: mediaBuffer,
                    caption: captionForAdmin,
                    buttons: buttons,
                    headerType: 4
                };
            } else if (messageType === 'documentMessage') {
                buttonMessage = {
                    document: mediaBuffer,
                    caption: captionForAdmin,
                    buttons: buttons,
                    headerType: 4,
                    fileName: msgContent.fileName || 'comprobante.pdf',
                    mimetype: msgContent.mimetype
                };
            } else if (messageType === 'videoMessage') {
                buttonMessage = {
                    video: mediaBuffer,
                    caption: captionForAdmin,
                    buttons: buttons,
                    headerType: 4,
                    mimetype: msgContent.mimetype
                };
            }

            if (buttonMessage) {
                await conn.sendMessage(ADMIN_NUMBER_FOR_FORWARDING, buttonMessage);
                await conn.sendMessage(senderJid, { text: `✅ Recibí tu comprobante de pago. Lo estoy verificando. ¡Gracias!` }, { quoted: m });
            } else {
                await conn.sendMessage(ADMIN_NUMBER_FOR_FORWARDING, { text: captionForAdmin, buttons: buttons, headerType: 1 });
            }
            
            return true;
        } catch (e) {
            console.error('Error procesando comprobante:', e);
            await conn.sendMessage(senderJid, { text: `❌ Ocurrió un error procesando tu comprobante. Intenta de nuevo o contacta a soporte.` }, { quoted: m });
            return true;
        }
    }

    return false;
}
