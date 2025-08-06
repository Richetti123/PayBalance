import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
const chatDataPath = path.join(__dirname, '..', 'src', 'chat_data.json'); // ¡NUEVO! Importar chat_data.json
const ADMIN_NUMBER_CONFIRMATION = '5217771303481@s.whatsapp.net'; // Asegúrate de que sea tu número de propietario

const loadPayments = () => {
    if (fs.existsSync(paymentsFilePath)) {
        return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    }
    return {};
};

// ¡NUEVO! Función para cargar los datos de chat
const loadChatData = () => {
    if (fs.existsSync(chatDataPath)) {
        return JSON.parse(fs.readFileSync(chatDataPath, 'utf8'));
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


export async function handleIncomingMedia(m, conn, clientInfoFromHandler) {
    const isImage = m.message?.imageMessage;
    const isDocument = m.message?.documentMessage;

    if (!isImage && !isDocument) {
        return false; // No es una imagen ni un documento, no es un comprobante
    }

    const messageContent = isImage ? m.message.imageMessage : m.message.documentMessage;
    const messageCaption = messageContent?.caption?.toLowerCase() || '';

    // Palabras clave para identificar un comprobante
    const comprobanteKeywords = [
        'comprobante', 'pago', 'realizado', 'aqui', 'adjunto', 'transferencia',
        'deposito', 'voucher', 'recibo', 'pagado', 'pagaré', 'factura'
    ];
    const isComprobante = comprobanteKeywords.some(keyword => messageCaption.includes(keyword));

    if (!isComprobante) {
        return false; // No contiene palabras clave de comprobante
    }

    // Normalizar el número del remitente para buscar en pagos.json y chat_data.json
    const senderNumberRaw = m.sender.split('@')[0];
    const senderNumber = normalizarNumero(senderNumberRaw);

    const paymentsData = loadPayments();
    const chatData = loadChatData(); // ¡NUEVO! Cargar datos de chat_data.json
    
    let clientKey = null;
    let clientInfo = null;

    // Buscar si el remitente está registrado en pagos.json
    for (const key in paymentsData) {
        const normalizedKey = normalizarNumero(key);
        if (normalizedKey === senderNumber) {
            clientKey = key;
            clientInfo = paymentsData[key];
            break;
        }
    }

    if (clientInfo) {
        // Es un comprobante de un cliente registrado. Enviar al owner para aprobación.
        const approvalMessageText = `🔔 *Nuevo Comprobante de Pago Recibido* 🔔\n\n` +
                                    `*De:* ${clientInfo.nombre} (${senderNumber})\n` +
                                    `*Monto esperado:* ${clientInfo.monto || 'No especificado'}\n` +
                                    `*Día de pago:* ${clientInfo.diaPago || 'No especificado'}\n\n` +
                                    `Por favor, revisa el comprobante y decide si ACEPTAR o RECHAZAR el pago.`;
        
        const buttons = [
            { buttonId: `ACCEPT_PROOF_${m.key.id}_${clientKey}`, buttonText: { displayText: '✅ Aceptar Pago' }, type: 1 }, // ¡CORREGIDO EL PREFIJO DEL ID!
            { buttonId: `REJECT_PROOF_${m.key.id}_${clientKey}`, buttonText: { displayText: '❌ Rechazar Pago' }, type: 1 }  // ¡CORREGIDO EL PREFIJO DEL ID!
        ];

        // Reenviar el mensaje original (comprobante) al owner
        await conn.copyNForward(ADMIN_NUMBER_CONFIRMATION, m, false, {
            quoted: m,
            contextInfo: {
                forwardingScore: 999, // Para indicar que es reenviado
                isForwarded: true
            }
        });

        // Enviar el mensaje con botones al owner DESPUÉS de reenviar el comprobante
        await conn.sendMessage(ADMIN_NUMBER_CONFIRMATION, {
            text: approvalMessageText,
            buttons: buttons,
            headerType: 1
        });

        // Notificar al cliente que el comprobante ha sido recibido y está en revisión
        await conn.sendMessage(m.chat, { text: `✅ ¡Gracias! Hemos recibido tu comprobante de pago. Lo estamos revisando y te notificaremos una vez que sea aceptado. Te pedimos paciencia.` }, { quoted: m });

        return true; // Se manejó un comprobante de un cliente registrado
    } else {
        // Es un comprobante pero el cliente NO está registrado o es nuevo.
        const userChatData = chatData[senderNumber] || {};
        const clientNameFromChat = userChatData.nombre || m.pushName || 'cliente desconocido'; // ¡NUEVO! Obtener nombre de chat_data

        const approvalMessageText = `🔔 *Comprobante de Pago Recibido - Cliente NO Registrado o Nuevo Cliente* 🔔\n\n` +
                                    `*De:* ${clientNameFromChat} (${senderNumber})\n` + // ¡NUEVO! Mostrar nombre del chat_data
                                    `*Mensaje:* "${messageCaption}"\n\n` +
                                    `Por favor, revisa el comprobante y decide si ACEPTAR o RECHAZAR el pago.`;
        
        // El clientKey para un cliente no registrado será su número normalizado
        const tempClientKey = senderNumber;

        const buttons = [
            { buttonId: `ACCEPT_PROOF_${m.key.id}_${tempClientKey}`, buttonText: { displayText: '✅ Aceptar Pago' }, type: 1 }, // ¡NUEVO! Botones para no registrados y prefijo correcto
            { buttonId: `REJECT_PROOF_${m.key.id}_${tempClientKey}`, buttonText: { displayText: '❌ Rechazar Pago' }, type: 1 }  // ¡NUEVO! Botones para no registrados y prefijo correcto
        ];

        // Notificar al cliente (Este mensaje se mantiene igual)
        await conn.sendMessage(m.chat, { text: `✅ ¡Gracias! Hemos recibido tu comprobante de pago. Sin embargo, no hemos encontrado tus datos de cliente. Un administrador se pondrá en contacto contigo para verificar tu pago. Te pedimos paciencia.` }, { quoted: m });
        
        // Reenviar el mensaje original (comprobante) al owner para que pueda verlo
        await conn.copyNForward(ADMIN_NUMBER_CONFIRMATION, m, false, {
            quoted: m,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true
            }
        });

        // Enviar el mensaje con botones al owner DESPUÉS de reenviar el comprobante
        await conn.sendMessage(ADMIN_NUMBER_CONFIRMATION, {
            text: approvalMessageText,
            buttons: buttons,
            headerType: 1
        });
        
        return true; // Se manejó un comprobante de un cliente no registrado
    }
}
