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
        const client = clientInfo; // Ya tenemos la info del cliente

        // Descargar la imagen/documento
        const messageType = isImage ? 'imageMessage' : 'documentMessage';
        const msgTypeForDownload = messageType.replace('Message', '');
        
        const stream = await downloadContentFromMessage(messageContent, msgTypeForDownload);
        const bufferArray = [];
        for await (const chunk of stream) {
            bufferArray.push(chunk);
        }
        const mediaBuffer = Buffer.concat(bufferArray);

        // Generar un nombre de archivo único
        const fileExtension = isImage ? path.extname(messageContent.url || 'png') || '.png' : path.extname(messageContent.fileName || 'document.pdf') || '.pdf';
        const fileName = `${client.nombre.replace(/\s/g, '_')}_${Date.now()}${fileExtension}`;
        const filePath = path.join(comprobantesDir, fileName);
        
        fs.writeFileSync(filePath, mediaBuffer);
        
        // Actualizar el archivo de pagos
        client.pagoRealizado = true;
        
        if (!client.pagos) { // Si no existe el array de pagos, lo crea
            client.pagos = [];
        }
        if (!client.historialComprobantes) { // Si no existe historialComprobantes, lo crea
            client.historialComprobantes = [];
        }

        // Se agrega el pago al historial de pagos (si no se hizo ya)
        const currentMonthYear = new Date().toISOString().slice(0, 7); // YYYY-MM
        const lastPayment = client.pagos[client.pagos.length - 1];
        
        if (!lastPayment || lastPayment.mes !== currentMonthYear) {
            // Asumiendo que `client.monto` contiene el monto del plan actual
            client.pagos.push({
                fecha: new Date().toISOString(),
                monto: client.monto || 'Desconocido', // Asegúrate de que client.monto esté disponible
                mes: currentMonthYear,
                comprobante: filePath
            });
        }
        
        client.historialComprobantes.push({
            fecha: new Date().toISOString(),
            archivo: filePath
        });
        
        // Actualizar el cliente en paymentsData
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


// El handler original, que ahora usa la nueva función exportada
export async function handler(m, { conn, text, usedPrefix, command }) {
    if (!m.isOwner) {
        return m.reply('❌ Solo el propietario del bot puede usar este comando.');
    }
    
    // Identificar el tipo de mensaje para buscar la imagen
    const quoted = m.quoted ? m.quoted : m;
    const isImage = (quoted.message?.imageMessage && m.text.startsWith(usedPrefix + command)) || (quoted.message?.imageMessage && quoted.isCommand);
    const isDocument = (quoted.message?.documentMessage && m.text.startsWith(usedPrefix + command)) || (quoted.message?.documentMessage && quoted.isCommand);
    
    if (!isImage && !isDocument) {
        return m.reply(`❌ Debes usar este comando respondiendo a una imagen o documento de comprobante, o adjuntando la imagen en el mensaje.`);
    }

    const clientNameOrNumber = text.trim();
    if (!clientNameOrNumber) {
        return m.reply(`❌ Debes especificar el nombre o número del cliente. Uso correcto: \`${usedPrefix + command} nombre_cliente\` o \`${usedPrefix + command} +521...\``);
    }
    
    try {
        const paymentsData = loadPayments();
        let clientKey = null;

        for (const key in paymentsData) {
            const client = paymentsData[key];
            // Normalizar la clave para la comparación si clientNameOrNumber es un número
            const normalizedKey = key.startsWith('+') ? key : `+${key}`;
            const normalizedClientNameOrNumber = clientNameOrNumber.startsWith('+') ? clientNameOrNumber : `+${clientNameOrNumber}`;

            if (client.nombre.toLowerCase() === clientNameOrNumber.toLowerCase() || normalizedKey === normalizedClientNameOrNumber) {
                clientKey = key; // Usar la clave original
                break;
            }
        }
        
        if (!clientKey) {
            return m.reply(`❌ Cliente "${clientNameOrNumber}" no encontrado en la base de datos.`);
        }
        
        const clientInfo = paymentsData[clientKey];
        const messageContent = isImage ? quoted.message.imageMessage : quoted.message.documentMessage;

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
