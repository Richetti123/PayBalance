import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isPaymentProof } from './keywords.js';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';
// Importa la función handler del comando subircomprobante.js
import { handler as subirComprobanteHandler } from '../plugins/subircomprobante.js';

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

        // Necesitamos el mensaje original del cliente para reenviarlo a subirComprobanteHandler
        // Esto es un desafío con Baileys si no se guarda el mensaje completo.
        // Para simplificar, asumiremos que el mensaje original (media) está en `originalMessage`
        // y lo reconstruiremos para pasarlo al handler de subirComprobante.
        if (!originalMessage) {
            console.error('No se encontró el mensaje original citado para procesar la respuesta del admin.');
            await conn.sendMessage(m.chat, { text: '❌ Error: No se pudo procesar la respuesta. Falta el mensaje original del comprobante.' });
            return true;
        }

        // Recrear un objeto `m` simulado para el handler de `subircomprobante.js`
        // Tendremos que extraer el `remoteJid` del mensaje original y el contenido del mensaje (imagen/documento)
        const simulatedM = {
            message: originalMessage,
            quoted: { message: originalMessage, isCommand: true }, // Simula que es un quoted message de comando
            text: `.subircomprobante ${clientNumber}`, // Simula el texto del comando
            isOwner: true, // El admin es el owner, así que pasamos isOwner como true
            reply: async (msg) => { // Mock de la función reply para que el handler pueda enviar mensajes
                await conn.sendMessage(m.chat, { text: msg });
            }
        };
        simulatedM.quoted.message.imageMessage = originalMessage.imageMessage;
        simulatedM.quoted.message.documentMessage = originalMessage.documentMessage;
        simulatedM.quoted.message.videoMessage = originalMessage.videoMessage;

        if (selectedButtonId.startsWith('accept_payment_')) {
            const paymentsData = loadPaymentsData();
            if (paymentsData[clientNumber]) {
                // El cliente está registrado, proceder a ejecutar subirComprobanteHandler
                try {
                    // Llamar a subirComprobanteHandler con el mensaje simulado
                    await subirComprobanteHandler(simulatedM, { conn, text: clientNumber, usedPrefix: '.', command: 'subircomprobante' });
                    // Notificar al admin que se ejecutó el comando
                    await conn.sendMessage(m.chat, { text: `✅ Comprobante de ${paymentsData[clientNumber].nombre} aceptado y registrado.` });
                    // Notificar al cliente que su pago fue aceptado
                    await conn.sendMessage(clientJidFromButton, { text: `✅ ¡Hola ${paymentsData[clientNumber].nombre}! Tu pago ha sido aceptado y registrado. ¡Gracias!` });
                } catch (error) {
                    console.error('Error al ejecutar subirComprobanteHandler:', error);
                    await conn.sendMessage(m.chat, { text: `❌ Error al registrar el comprobante de ${clientNumber}: ${error.message}` });
                    await conn.sendMessage(clientJidFromButton, { text: `❌ Hubo un problema al procesar tu pago. Por favor, contacta a soporte.` });
                }
            } else {
                // Cliente no registrado
                await conn.sendMessage(m.chat, { text: `⚠️ El comprobante fue aceptado, pero el cliente (${clientNumber}) no está registrado en 'pagos.json'. No se ejecutó el comando subircomprobante.` });
                await conn.sendMessage(clientJidFromButton, { text: `✅ Recibimos tu comprobante, pero parece que no estás registrado en nuestro sistema. Un administrador se pondrá en contacto contigo.` });
            }
        } else if (selectedButtonId.startsWith('reject_payment_')) {
            // No ejecutar subirComprobanteHandler si se rechaza el pago
            const paymentsData = loadPaymentsData();
            const clientName = paymentsData[clientNumber]?.nombre || 'cliente desconocido';
            await conn.sendMessage(m.chat, { text: `❌ Comprobante de ${clientName} (${clientNumber}) rechazado. No se realizaron cambios.` });
            await conn.sendMessage(clientJidFromButton, { text: `❌ Lamentamos informarte que tu comprobante de pago ha sido rechazado. Por favor, contacta a soporte para más detalles.` });
        }
        return true; // Se ha manejado la respuesta del botón
    }

    // Lógica original para recibir comprobantes de los clientes
    if (isPaymentProof(captionText)) {
        const paymentsData = loadPaymentsData();
        const chatData = loadChatData();

        let clientName;
        // Primero busca en paymentsData, luego en chatData
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

            // Los buttonId ahora incluyen el JID del remitente para identificarlo al aceptar/rechazar
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
                buttonMessage = { // Aunque no es un comprobante típico, se maneja el caso
                    video: mediaBuffer,
                    caption: captionForAdmin,
                    buttons: buttons,
                    headerType: 4,
                    mimetype: msgContent.mimetype
                };
            }

            if (buttonMessage) {
                // Envía el mensaje al admin
                await conn.sendMessage(ADMIN_NUMBER_FOR_FORWARDING, buttonMessage);
                // Envía confirmación al cliente
                await conn.sendMessage(senderJid, { text: `✅ Recibí tu comprobante de pago. Lo estoy verificando. ¡Gracias!` }, { quoted: m });
            } else {
                // Caso alternativo si no se puede crear un buttonMessage con media (poco probable)
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
