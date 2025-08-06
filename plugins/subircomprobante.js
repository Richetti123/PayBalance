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
    console.log('--- Inicia processPaymentProofAndSave ---');
    console.log('messageContent:', messageContent ? Object.keys(messageContent) : 'null');
    console.log('clientKey:', clientKey);
    console.log('isImage (passed to function):', isImage);

    try {
        const paymentsData = loadPayments();
        const client = clientInfo;

        const messageType = isImage ? 'imageMessage' : 'documentMessage';
        const msgTypeForDownload = messageType.replace('Message', '');
        
        console.log('Attempting to download media. Type:', msgTypeForDownload);
        const stream = await downloadContentFromMessage(messageContent, msgTypeForDownload);
        const bufferArray = [];
        for await (const chunk of stream) {
            bufferArray.push(chunk);
        }
        const mediaBuffer = Buffer.concat(bufferArray);
        console.log('Media buffer size:', mediaBuffer.length);

        if (!mediaBuffer || mediaBuffer.length === 0) {
            throw new Error('El archivo está vacío o falló la descarga.');
        }

        const fileExtension = isImage ? path.extname(messageContent.url || 'png') || '.png' : path.extname(messageContent.fileName || 'document.pdf') || '.pdf';
        const fileName = `${client.nombre.replace(/\s/g, '_')}_${Date.now()}${fileExtension}`;
        const filePath = path.join(comprobantesDir, fileName);
        
        fs.writeFileSync(filePath, mediaBuffer);
        console.log('Comprobante guardado en:', filePath);
        
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
        console.log('Datos de pago actualizados.');

        const responseMessageToOwner = `✅ Se ha registrado el pago de *${client.nombre}*. El comprobante se ha guardado en la ruta: \n\`${filePath}\`. Los recordatorios automáticos se detendrán para este cliente.`;
        const clientJid = `${clientKey.replace('+', '')}@s.whatsapp.net`;
        const responseMessageToClient = `✅ ¡Hola ${client.nombre}! Hemos registrado tu pago. Gracias por tu compra.`;
        
        console.log('--- Finaliza processPaymentProofAndSave (Éxito) ---');
        return { success: true, responseToOwner: responseMessageToOwner, responseToClient: responseMessageToClient, clientJid: clientJid };

    } catch (error) {
        console.error('Error en processPaymentProofAndSave:', error);
        console.log('--- Finaliza processPaymentProofAndSave (Fallo) ---');
        return { success: false, error: error.message };
    }
}


export async function handler(m, { conn, text, usedPrefix, command }) {
    console.log('\n--- Inicia handler del comando subircomprobante ---');
    console.log('m.isOwner:', m.isOwner);
    console.log('text (argumento del comando):', text);

    // Log de los contenidos del mensaje 'm'
    console.log('Contenido de m.message:', m.message ? Object.keys(m.message) : 'No m.message');
    if (m.message?.imageMessage) console.log('m.message contiene imageMessage');
    if (m.message?.documentMessage) console.log('m.message contiene documentMessage');
    if (m.text) console.log('m.text:', m.text);

    // Log de los contenidos del mensaje 'm.quoted' (si existe)
    console.log('Contenido de m.quoted:', m.quoted ? 'Existe' : 'No existe');
    if (m.quoted && m.quoted.message) {
        console.log('Contenido de m.quoted.message:', Object.keys(m.quoted.message));
        if (m.quoted.message?.imageMessage) console.log('m.quoted.message contiene imageMessage');
        if (m.quoted.message?.documentMessage) console.log('m.quoted.message contiene documentMessage');
    }
    if (m.quoted && m.quoted.text) console.log('m.quoted.text:', m.quoted.text);


    if (!m.isOwner) {
        return m.reply('❌ Solo el propietario del bot puede usar este comando.');
    }
    
    let messageContent = null; // Contendrá el objeto de mensaje real con la media
    let isImage = false;
    let isDocument = false;

    // PRUEBA DE LÓGICA DE DETECCIÓN MEJORADA
    // 1. Priorizar el contenido si es una respuesta a un mensaje multimedia
    if (m.quoted?.message) {
        if (m.quoted.message.imageMessage) {
            messageContent = m.quoted.message.imageMessage;
            isImage = true;
            console.log('Detectado como respuesta a una imagen.');
        } else if (m.quoted.message.documentMessage) {
            messageContent = m.quoted.message.documentMessage;
            isDocument = true;
            console.log('Detectado como respuesta a un documento.');
        } else if (m.quoted.message.videoMessage) { // Si también quieres aceptar videos
            messageContent = m.quoted.message.videoMessage;
            isDocument = false; // O poner isVideo = true, pero para este comando nos interesa img/doc
            console.log('Detectado como respuesta a un video (considerado como documento).');
        }
    }

    // 2. Si no es una respuesta a media, verificar si la media está adjunta directamente al mensaje actual (con o sin caption)
    if (!messageContent) { // Solo si messageContent aún no se ha establecido
        if (m.message?.imageMessage) {
            messageContent = m.message.imageMessage;
            isImage = true;
            console.log('Detectado como imagen adjunta directamente.');
        } else if (m.message?.documentMessage) {
            messageContent = m.message.documentMessage;
            isDocument = true;
            console.log('Detectado como documento adjunto directamente.');
        } else if (m.message?.videoMessage) { // Si también quieres aceptar videos
            messageContent = m.message.videoMessage;
            isDocument = false; // O poner isVideo = true
            console.log('Detectado como video adjunto directamente (considerado como documento).');
        }
    }

    console.log('messageContent (después de la detección):', messageContent ? Object.keys(messageContent) : 'null');
    console.log('isImage (después de la detección):', isImage);
    console.log('isDocument (después de la detección):', isDocument);

    if (!isImage && !isDocument) {
        console.log('Fallo la detección de imagen/documento. Saliendo con error de validación.');
        return m.reply(`❌ Debes usar este comando respondiendo a una imagen o documento de comprobante, o adjuntando la imagen en el mensaje.`);
    }

    let clientNameOrNumber = text.trim();
    console.log('clientNameOrNumber inicial:', clientNameOrNumber);

    if (!clientNameOrNumber) {
        // Si no se proporcionó texto de comando, intentar obtenerlo de un mensaje citado si es una respuesta a un comando
        if (m.quoted && m.quoted.text) {
            const quotedText = m.quoted.text.trim();
            console.log('m.quoted.text (para extraer nombre):', quotedText);
            // Buscar si el texto citado contiene el comando para extraer el nombre/número
            if (quotedText.startsWith(usedPrefix + command)) {
                const args = quotedText.slice(usedPrefix.length).trim().split(/ +/).filter(v => v);
                if (args.length > 1) { // Si hay algo después del comando
                    clientNameOrNumber = args.slice(1).join(' '); // Obtener el resto como nombre/número
                    console.log('clientNameOrNumber extraído de quoted.text:', clientNameOrNumber);
                }
            }
        }
        if (!clientNameOrNumber) { // Si aún no hay nombre/número
            console.log('No se pudo determinar clientNameOrNumber. Saliendo con error de validación.');
            return m.reply(`❌ Debes especificar el nombre o número del cliente. Uso correcto: \`${usedPrefix + command} nombre_cliente\` o \`${usedPrefix + command} +521...\``);
        }
    }
    
    try {
        const paymentsData = loadPayments();
        let clientKey = null;

        console.log('Buscando cliente:', clientNameOrNumber);
        for (const key in paymentsData) {
            const client = paymentsData[key];
            const normalizedKey = key.startsWith('+') ? key : `+${key}`;
            const normalizedClientNameOrNumber = clientNameOrNumber.startsWith('+') ? clientNameOrNumber : `+${clientNameOrNumber}`;

            if (client.nombre.toLowerCase() === clientNameOrNumber.toLowerCase() || normalizedKey === normalizedClientNameOrNumber) {
                clientKey = key;
                console.log('Cliente encontrado. Clave:', clientKey);
                break;
            }
        }
        
        if (!clientKey) {
            console.log('Cliente no encontrado en la base de datos.');
            return m.reply(`❌ Cliente "${clientNameOrNumber}" no encontrado en la base de datos.`);
        }
        
        const clientInfo = paymentsData[clientKey];
        // messageContent ya está definido y contiene el objeto imageMessage/documentMessage

        console.log('Llamando a processPaymentProofAndSave con:', { clientKey, isImage, isDocument });
        const result = await processPaymentProofAndSave(conn, messageContent, clientKey, clientInfo, isImage);

        if (result.success) {
            console.log('processPaymentProofAndSave fue exitoso.');
            await m.reply(result.responseToOwner);
            await conn.sendMessage(result.clientJid, { text: result.responseToClient });
        } else {
            console.log('processPaymentProofAndSave falló:', result.error);
            return m.reply(`❌ Ocurrió un error al procesar el comprobante: ${result.error}`);
        }
        
    } catch (error) {
        console.error('Error en el comando subircomprobante (handler):', error);
        return m.reply(`❌ Ocurrió un error al procesar el comprobante: ${error.message}`);
    } finally {
        console.log('--- Finaliza handler del comando subircomprobante ---');
    }
}

handler.help = ['subircomprobante <nombre_o_numero>'];
handler.tags = ['pagos'];
handler.command = ['subircomprobante'];
