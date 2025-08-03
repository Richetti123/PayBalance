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
            if (client.nombre.toLowerCase() === clientNameOrNumber.toLowerCase() || key === clientNameOrNumber) {
                clientKey = key;
                break;
            }
        }
        
        if (!clientKey) {
            return m.reply(`❌ Cliente "${clientNameOrNumber}" no encontrado en la base de datos.`);
        }
        
        const client = paymentsData[clientKey];

        // Descargar la imagen/documento
        const messageType = isImage ? 'imageMessage' : 'documentMessage';
        const msgContent = quoted.message[messageType];
        const msgTypeForDownload = messageType.replace('Message', '');
        
        const stream = await downloadContentFromMessage(msgContent, msgTypeForDownload);
        const bufferArray = [];
        for await (const chunk of stream) {
            bufferArray.push(chunk);
        }
        const mediaBuffer = Buffer.concat(bufferArray);

        // Generar un nombre de archivo único
        const fileExtension = isImage ? path.extname(msgContent.url || 'png') || '.png' : path.extname(msgContent.fileName || 'document.pdf') || '.pdf';
        const fileName = `${client.nombre.replace(/\s/g, '_')}_${Date.now()}${fileExtension}`;
        const filePath = path.join(comprobantesDir, fileName);
        
        fs.writeFileSync(filePath, mediaBuffer);
        
        // Actualizar el archivo de pagos
        client.pagoRealizado = true;
        
        if (!client.historialComprobantes) {
            client.historialComprobantes = [];
        }
        client.historialComprobantes.push({
            fecha: new Date().toISOString(),
            archivo: filePath
        });
        
        savePayments(paymentsData);

        const responseMessage = `✅ Se ha registrado el pago de *${client.nombre}*. El comprobante se ha guardado en la ruta: \n\`${filePath}\`. Los recordatorios automáticos se detendrán para este cliente.`;
        await m.reply(responseMessage);

        const clientJid = `${clientKey.replace('+', '')}@s.whatsapp.net`;
        await conn.sendMessage(clientJid, { text: `✅ ¡Hola ${client.nombre}! Hemos registrado tu pago. Gracias por tu compra.` });
        
    } catch (error) {
        console.error('Error en el comando subircomprobante:', error);
        return m.reply(`❌ Ocurrió un error al procesar el comprobante: ${error.message}`);
    }
}

handler.help = ['subircomprobante <nombre_o_numero>'];
handler.tags = ['pagos'];
handler.command = ['subircomprobante'];
