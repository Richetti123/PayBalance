import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { downloadContentFromMessage } from '@whiskeysockets/baileys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
const ADMIN_NUMBER_CONFIRMATION = '5217771303481@s.whatsapp.net'; // Asegúrate de que sea tu número de propietario

const loadPayments = () => {
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

    // Normalizar el número del remitente para buscar en pagos.json
    const senderNumber = normalizarNumero(m.sender.split('@')[0]);
    const paymentsData = loadPayments();
    
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
            { buttonId: `ACCEPT_PAYMENT_${m.key.id}_${clientKey}`, buttonText: { displayText: '✅ Aceptar Pago' }, type: 1 },
            { buttonId: `REJECT_PAYMENT_${m.key.id}_${clientKey}`, buttonText: { displayText: '❌ Rechazar Pago' }, type: 1 }
        ];

        // Reenviar el mensaje original (comprobante) al owner
        // Asegúrate de que 'm' sea el objeto de mensaje completo que contiene el tipo de mensaje (imageMessage, documentMessage)
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

        // Guardar el ID del mensaje original del comprobante y el cliente en una variable temporal para el owner
        // Esto se manejará en handler.js, por lo que no es necesario aquí.
        // Solo necesitamos que el buttonId contenga la información necesaria.
        
        // Notificar al cliente que el comprobante ha sido recibido y está en revisión
        await conn.sendMessage(m.chat, { text: `✅ ¡Gracias! Hemos recibido tu comprobante de pago. Lo estamos revisando y te notificaremos una vez que sea aceptado. Te pedimos paciencia.` }, { quoted: m });

        return true; // Se manejó un comprobante de un cliente registrado
    } else {
        // Es un comprobante pero el cliente NO está registrado
        await conn.sendMessage(m.chat, { text: `✅ ¡Gracias! Hemos recibido tu comprobante de pago. Sin embargo, no hemos encontrado tus datos de cliente. Un administrador se pondrá en contacto contigo para verificar tu pago. Te pedimos paciencia.` }, { quoted: m });
        
        // Notificar al admin que un comprobante llegó de un número no registrado
        await conn.sendMessage(ADMIN_NUMBER_CONFIRMATION, {
            text: `🔔 *Comprobante de Pago Recibido - Cliente NO Registrado* 🔔\n\n` +
                  `*De:* ${m.pushName || senderNumber} (${senderNumber})\n` +
                  `*Mensaje:* "${messageCaption}"\n\n` +
                  `Por favor, revisa manualmente. Responde al comprobante con el comando \`.subircomprobante ${senderNumber}\` si deseas registrarlo.`
        });
        
        // Reenviar el mensaje original al owner para que pueda verlo
        await conn.copyNForward(ADMIN_NUMBER_CONFIRMATION, m, false, {
            quoted: m,
            contextInfo: {
                forwardingScore: 999,
                isForwarded: true
            }
        });
        
        return true; // Se manejó un comprobante de un cliente no registrado
    }
}
