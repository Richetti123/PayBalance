import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPaymentProof } from './keywords.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
// ¡IMPORTANTE! Asegúrate de importar SOLO processPaymentProofAndSave
import { processPaymentProofAndSave } from '../plugins/subircomprobante.js'; 

const ADMIN_NUMBER_FOR_FORWARDING = '5217771303481@s.whatsapp.net';

const __filenameLib = fileURLToPath(import.meta.url);
const __dirnameLib = path.dirname(__filenameLib);
const chatDataPath = path.join(__dirnameLib, '..', 'src', 'chat_data.json');
const paymentsFilePath = path.join(__dirnameLib, '..', 'src', 'pagos.json');

const loadChatData = () => {
    if (fs.existsSync(chatDataPath)) {
        return JSON.parse(fs.readFileSync(chatDataPath, 'utf8'));
    }
    return {};
};

const loadPaymentsData = () => {
    if (fs.existsSync(paymentsFilePath)) {
        return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    }
    return {};
};

const normalizarNumero = (numero) => {
    if (!numero) return numero;
    const sinMas = numero.replace('+', '');
    if (sinMas.startsWith('521') && sinMas.length === 13) {
        return '+52' + sinMas.slice(3);
    }
    return numero.startsWith('+') ? numero : '+' + numero;
};

export async function handleIncomingMedia(m, conn) {
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
    const formattedSenderNumber = normalizarNumero(`+${senderJid.split('@')[0]}`);
    const captionText = m.message[messageType]?.caption || '';

    // Manejar respuesta del admin a un comprobante (botones de aceptar/rechazar)
    if (m.message.buttonsResponseMessage && m.key.remoteJid === ADMIN_NUMBER_FOR_FORWARDING) {
        const selectedButtonId = m.message.buttonsResponseMessage.selectedButtonId;
        const originalMessage = m.message.buttonsResponseMessage.contextInfo.quotedMessage;
        
        // Extraer el JID del cliente del buttonId
        const parts = selectedButtonId.split('_');
        if (parts.length < 3 || (parts[0] !== 'accept' && parts[0] !== 'reject')) {
            return false; // No es una respuesta a nuestros botones de comprobante
        }
        const clientJidFromButton = parts.slice(2).join('_'); // Reconstruir el JID original del cliente
        const clientNumber = normalizarNumero(`+${clientJidFromButton.split('@')[0]}`);

        if (!originalMessage) {
            // console.error('No se encontró el mensaje original citado para procesar la respuesta del admin.'); // Log eliminado
            await conn.sendMessage(m.chat, { text: '❌ Error: No se pudo procesar la respuesta. Falta el mensaje original del comprobante.' });
            return true;
        }

        // --- Inicio de la lógica crucial para extraer el contenido del comprobante desde originalMessage ---
        let messageContentForSave = null;
        let isImageForSave = false;

        // Intentar encontrar el media directamente en originalMessage
        if (originalMessage.imageMessage) {
            messageContentForSave = originalMessage.imageMessage;
            isImageForSave = true;
        } else if (originalMessage.documentMessage) {
            messageContentForSave = originalMessage.documentMessage;
            isImageForSave = false; 
        } else if (originalMessage.videoMessage) { // Manejar videos si es posible, aunque no son típicos para comprobantes
            messageContentForSave = originalMessage.videoMessage;
            isImageForSave = false; 
            // console.warn('DEBUG: Se detectó un video como comprobante.'); // Log eliminado
        } 
        // Si no se encuentra directamente, buscar en un quotedMessage anidado (común con extendedTextMessage)
        else if (originalMessage.extendedTextMessage?.contextInfo?.quotedMessage) {
            const nestedQuotedMessage = originalMessage.extendedTextMessage.contextInfo.quotedMessage;
            if (nestedQuotedMessage.imageMessage) {
                messageContentForSave = nestedQuotedMessage.imageMessage;
                isImageForSave = true;
                // console.log('DEBUG: Media encontrada anidada en originalMessage.extendedTextMessage.contextInfo.quotedMessage (imagen).'); // Log eliminado
            } else if (nestedQuotedMessage.documentMessage) {
                messageContentForSave = nestedQuotedMessage.documentMessage;
                isImageForSave = false;
                // console.log('DEBUG: Media encontrada anidada en originalMessage.extendedTextMessage.contextInfo.quotedMessage (documento).'); // Log eliminado
            } else if (nestedQuotedMessage.videoMessage) {
                messageContentForSave = nestedQuotedMessage.videoMessage;
                isImageForSave = false;
                // console.log('DEBUG: Media encontrada anidada en originalMessage.extendedTextMessage.contextInfo.quotedMessage (video).'); // Log eliminado
            }
        }

        if (!messageContentForSave) {
            // console.error('ERROR: No se pudo encontrar contenido multimedia válido en el comprobante original.'); // Log eliminado
            await conn.sendMessage(m.chat, { text: '❌ Error: No se pudo procesar la respuesta. El comprobante original no es una imagen ni un documento válido o está en un formato inesperado.' });
            return true;
        }
        // --- Fin de la lógica crucial ---

        if (selectedButtonId.startsWith('accept_payment_')) {
            const paymentsData = loadPaymentsData();
            if (paymentsData[clientNumber]) {
                try {
                    const result = await processPaymentProofAndSave(conn, messageContentForSave, clientNumber, paymentsData[clientNumber], isImageForSave);

                    if (result.success) {
                        await conn.sendMessage(m.chat, { text: result.responseToOwner });
                        await conn.sendMessage(result.clientJid, { text: result.responseToClient });
                    } else {
                        // console.error('Error al registrar el comprobante:', result.error); // Log eliminado
                        await conn.sendMessage(m.chat, { text: `❌ Ocurrió un error al registrar el comprobante de ${clientNumber}: ${result.error}` });
                        await conn.sendMessage(clientJidFromButton, { text: `❌ Hubo un problema al procesar tu pago. Por favor, contacta a soporte.` });
                    }
                } catch (error) {
                    // console.error('Error general al procesar aceptación:', error); // Log eliminado
                    await conn.sendMessage(m.chat, { text: `❌ Ocurrió un error general al procesar la aceptación: ${error.message}` });
                    await conn.sendMessage(clientJidFromButton, { text: `❌ Hubo un problema al procesar tu pago. Por favor, contacta a soporte.` });
                }
            } else {
                await conn.sendMessage(m.chat, { text: `⚠️ El comprobante fue aceptado, pero el cliente (${clientNumber}) no está registrado en 'pagos.json'. No se ejecutó el proceso de registro automático.` });
                await conn.sendMessage(clientJidFromButton, { text: `✅ Recibimos tu comprobante, pero parece que no estás registrado en nuestro sistema. Un administrador se pondrá en contacto contigo.` });
            }
        } else if (selectedButtonId.startsWith('reject_payment_')) {
            const paymentsData = loadPaymentsData();
            const clientName = paymentsData[clientNumber]?.nombre || 'cliente desconocido';
            await conn.sendMessage(m.chat, { text: `❌ Comprobante de ${clientName} (${clientNumber}) rechazado. No se realizaron cambios.` });
            await conn.sendMessage(clientJidFromButton, { text: `❌ Lamentamos informarte que tu comprobante de pago ha sido rechazado. Por favor, contacta a soporte para más detalles.` });
        }
        return true; 
    }

    // Lógica original para recibir comprobantes de los clientes
    if (isPaymentProof(captionText)) {
        const paymentsData = loadPaymentsData();
        const chatData = loadChatData();

        let clientName;
        if (paymentsData[formattedSenderNumber] && paymentsData[formattedSenderNumber].nombre) {
            clientName = paymentsData[formattedSenderNumber].nombre;
        } else if (chatData[formattedSenderNumber] && chatData[formattedSenderNumber].nombre) {
            clientName = chatData[formattedSenderNumber].nombre;
        } else {
            clientName = 'Un cliente desconocido';
        }

        const captionForAdmin = `✅ Comprobante recibido de *${clientName}* (${formattedSenderNumber}).`;
        
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
            // console.error('Error procesando comprobante:', e); // Log eliminado
            await conn.sendMessage(senderJid, { text: `❌ Ocurrió un error procesando tu comprobante. Intenta de nuevo o contacta a soporte.` }, { quoted: m });
            return true;
        }
    }

    return false;
}
