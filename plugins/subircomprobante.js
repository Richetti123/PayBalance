import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
const comprobantesDir = path.join(__dirname, '..', 'src', 'comprobantes');

// Asegurarse de que la carpeta de comprobantes existe
if (!fs.existsSync(comprobantesDir)) {
    fs.mkdirSync(comprobantesDir);
}

const loadPayments = () => {
    if (fs.existsSync(paymentsFilePath)) {
        return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    }
    return {};
};

const savePayments = (data) => {
    fs.writeFileSync(paymentsFilePath, JSON.stringify(data, null, 2), 'utf8');
};

/**
 * Procesa y guarda un comprobante de pago, actualiza el estado del cliente y notifica.
 * @param {object} conn Objeto de conexión de Baileys.
 * @param {object} messageContent Contenido del mensaje (imageMessage o documentMessage).
 * @param {string} clientKey La clave del cliente (número de teléfono o ID) en pagos.json.
 * @param {object} clientInfo La información completa del cliente desde pagos.json.
 * @param {boolean} isImage Si el comprobante es una imagen.
 */
export async function processPaymentProofAndSave(conn, messageContent, clientKey, clientInfo, isImage) {
    try {
        const paymentsData = loadPayments();
        const client = clientInfo;

        const messageType = isImage ? 'imageMessage' : 'documentMessage';
        const msgTypeForDownload = messageType.replace('Message', '');
        
        const stream = await downloadContentFromMessage(messageContent, msgTypeForDownload);
        const bufferArray = [];
        for await (const chunk of stream) {
            bufferArray.push(chunk);
        }
        const mediaBuffer = Buffer.concat(bufferArray);

        if (!mediaBuffer || mediaBuffer.length === 0) {
            throw new Error('El archivo está vacío o falló la descarga.');
        }

        const fileExtension = isImage ? path.extname(messageContent.url || 'png') || '.png' : path.extname(messageContent.fileName || 'document.pdf') || '.pdf';
        const fileName = `${client.nombre.replace(/\s/g, '_')}_${Date.now()}${fileExtension}`;
        const filePath = path.join(comprobantesDir, fileName);
        
        fs.writeFileSync(filePath, mediaBuffer);
        
        client.pagoRealizado = true;
        
        if (!client.pagos) {
            client.pagos = [];
        }
        if (!client.historialComprobantes) {
            client.historialComprobantes = [];
        }

        const currentMonthYear = new Date().toISOString().slice(0, 7);
        const lastPayment = client.pagos[client.pagos.length - 1];
        
        if (!lastPayment || lastPayment.mes !== currentMonthYear) {
            client.pagos.push({
                fecha: new Date().toISOString(),
                monto: client.monto || 'Desconocido',
                mes: currentMonthYear,
                comprobante: filePath
            });
        }
        
        client.historialComprobantes.push({
            fecha: new Date().toISOString(),
            archivo: filePath
        });
        
        paymentsData[clientKey] = client;
        savePayments(paymentsData);

        const responseMessageToOwner = `✅ Se ha registrado el pago de *${client.nombre}*. El comprobante se ha guardado en la ruta: \n\`${filePath}\`. Los recordatorios automáticos se detendrán para este cliente.`;
        const clientJid = `${clientKey.replace('+', '')}@s.whatsapp.net`;
        const responseMessageToClient = `✅ ¡Hola ${client.nombre}! Hemos registrado tu pago. Gracias por tu compra.`;
        
        return { success: true, responseToOwner: responseMessageToOwner, responseToClient: responseMessageToClient, clientJid: clientJid };

    } catch (error) {
        console.error('Error en processPaymentProofAndSave:', error);
        return { success: false, error: error.message };
    }
}


export async function handler(m, { conn, text, usedPrefix, command }) {
    if (!m.isOwner) {
        return m.reply('❌ Solo el propietario del bot puede usar este comando.');
    }
    
    let messageContent = null; 
    let isImage = false;
    let isDocument = false;

    // Función auxiliar para extraer media de un objeto de mensaje
    const extractMediaFromMessageObject = (msgObj) => {
        if (!msgObj) return { content: null, isImg: false, isDoc: false };

        if (msgObj.imageMessage) {
            return { content: msgObj.imageMessage, isImg: true, isDoc: false };
        }
        if (msgObj.documentMessage) {
            return { content: msgObj.documentMessage, isImg: false, isDoc: true };
        }
        if (msgObj.videoMessage) {
            return { content: msgObj.videoMessage, isImg: false, isDoc: true };
        }
        return { content: null, isImg: false, isDoc: false };
    };

    // Intentar obtener el contenido del mensaje citado (si existe)
    if (m.quoted?.message) {
        const quotedResult = extractMediaFromMessageObject(m.quoted.message);
        if (quotedResult.content) {
            messageContent = quotedResult.content;
            isImage = quotedResult.isImg;
            isDocument = quotedResult.isDoc;
        } else if (m.quoted.message.extendedTextMessage?.contextInfo?.quotedMessage) {
            // Caso: m.quoted es un extendedTextMessage que cita a una media (reply dentro de reply)
            const nestedQuotedResult = extractMediaFromMessageObject(m.quoted.message.extendedTextMessage.contextInfo.quotedMessage);
            if (nestedQuotedResult.content) {
                messageContent = nestedQuotedResult.content;
                isImage = nestedQuotedResult.isImg;
                isDocument = nestedQuotedResult.isDoc;
            }
        } else if (m.quoted.message.buttonsMessage) {
            // Caso: m.quoted es un buttonsMessage. Puede contener la media directamente o citarla.
            const buttonsMsg = m.quoted.message.buttonsMessage;
            const buttonsResult = extractMediaFromMessageObject(buttonsMsg);
             if (buttonsResult.content) {
                messageContent = buttonsResult.content;
                isImage = buttonsResult.isImg;
                isDocument = buttonsResult.isDoc;
            } else if (buttonsMsg.contextInfo?.quotedMessage) {
                const nestedButtonsQuotedResult = extractMediaFromMessageObject(buttonsMsg.contextInfo.quotedMessage);
                if (nestedButtonsQuotedResult.content) {
                    messageContent = nestedButtonsQuotedResult.content;
                    isImage = nestedButtonsQuotedResult.isImg;
                    isDocument = nestedButtonsQuotedResult.isDoc;
                }
            }
        }
    }

    // Si aún no se encontró media en el mensaje citado, intentar en el mensaje actual (para adjuntos directos)
    if (!messageContent && m.message) {
        const currentMessageResult = extractMediaFromMessageObject(m.message);
        if (currentMessageResult.content) {
            messageContent = currentMessageResult.content;
            isImage = currentMessageResult.isImg;
            isDocument = currentMessageResult.isDoc;
        }
    }

    if (!isImage && !isDocument) {
        return m.reply(`❌ Debes usar este comando respondiendo a una imagen o documento de comprobante, o adjuntando la imagen en el mensaje.`);
    }

    let clientNameOrNumber = text.trim();

    if (!clientNameOrNumber) {
        // Si no se proporcionó texto de comando, intentar obtenerlo de un mensaje citado si es una respuesta a un comando
        if (m.quoted && m.quoted.text) {
            const quotedText = m.quoted.text.trim();
            // Buscar si el texto citado contiene el comando para extraer el nombre/número
            if (quotedText.startsWith(usedPrefix + command)) {
                const args = quotedText.slice(usedPrefix.length).trim().split(/ +/).filter(v => v);
                if (args.length > 1) { 
                    clientNameOrNumber = args.slice(1).join(' ');
                }
            }
        }
        if (!clientNameOrNumber) { 
            return m.reply(`❌ Debes especificar el nombre o número del cliente. Uso correcto: \`${usedPrefix + command} nombre_cliente\` o \`${usedPrefix + command} +521...\``);
        }
    }
    
    try {
        const paymentsData = loadPayments();
        let clientKey = null;

        for (const key in paymentsData) {
            const client = paymentsData[key];
            const normalizedKey = key.startsWith('+') ? key : `+${key}`;
            const normalizedClientNameOrNumber = clientNameOrNumber.startsWith('+') ? clientNameOrNumber : `+${clientNameOrNumber}`;

            if (client.nombre.toLowerCase() === clientNameOrNumber.toLowerCase() || normalizedKey === normalizedClientNameOrNumber) {
                clientKey = key;
                break;
            }
        }
        
        if (!clientKey) {
            return m.reply(`❌ Cliente "${clientNameOrNumber}" no encontrado en la base de datos.`);
        }
        
        const clientInfo = paymentsData[clientKey];

        const result = await processPaymentProofAndSave(conn, messageContent, clientKey, clientInfo, isImage);

        if (result.success) {
            await m.reply(result.responseToOwner);
            await conn.sendMessage(result.clientJid, { text: result.responseToClient });
        } else {
            return m.reply(`❌ Ocurrió un error al procesar el comprobante: ${result.error}`);
        }
        
    } catch (error) {
        console.error('Error en el comando subircomprobante (handler):', error);
        return m.reply(`❌ Ocurrió un error al procesar el comprobante: ${error.message}`);
    }
}

handler.help = ['subircomprobante <nombre_o_numero>'];
handler.tags = ['pagos'];
handler.command = ['subircomprobante'];
