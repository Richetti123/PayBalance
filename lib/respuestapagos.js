import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Importa la función handler del comando subircomprobante.js
import { handler as subirComprobanteHandler } from '../plugins/subircomprobante.js';

const __filenameLib = fileURLToPath(import.meta.url);
const __dirnameLib = path.dirname(__filenameLib);
const paymentsFilePath = path.join(__dirnameLib, '..', 'src', 'pagos.json');
const processedButtonIds = new Set(); // Para evitar procesar el mismo botón dos veces

const loadPayments = () => {
    if (fs.existsSync(paymentsFilePath)) {
        return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    }
    return {};
};

const savePayments = (data) => {
    fs.writeFileSync(paymentsFilePath, JSON.stringify(data, null, 2), 'utf8');
};

const normalizarNumero = (numero) => {
    if (!numero) return numero;
    const sinMas = numero.replace('+', '');
    // Asumiendo que 521 indica un número de México y debe ser +52...
    if (sinMas.startsWith('521') && sinMas.length === 13) {
        return '+52' + sinMas.slice(3);
    }
    return numero.startsWith('+') ? numero : '+' + numero;
};

/**
 * Maneja la respuesta del propietario a los botones de comprobante de pago.
 * @param {import('@whiskeysockets/baileys').WAMessage} m
 * @param {import('@whiskeysockets/baileys').WASocket} conn
 * @returns {boolean} True si la respuesta fue manejada, false en caso contrario.
 */
export async function handlePaymentProofButton(m, conn) {
    // Solo procesar si el mensaje es del propietario (admin) y es una respuesta a un botón
    if (m.isOwner && m.message?.buttonsResponseMessage) {
        const selectedId = m.message.buttonsResponseMessage.selectedButtonId;
        const originalMessage = m.message.buttonsResponseMessage.contextInfo?.quotedMessage; // Obtener el mensaje original del comprobante

        // Verificamos si el botón ya ha sido procesado
        if (processedButtonIds.has(selectedId)) {
            console.log(`[DEBUG] Botón con ID ${selectedId} ya procesado. Ignorando.`);
            return true;
        }

        if (selectedId.startsWith('accept_payment_') || selectedId.startsWith('reject_payment_')) {
            // Agregamos el ID a la lista de procesados
            processedButtonIds.add(selectedId);

            try {
                // Extraer el JID del cliente del buttonId
                const clientJidFromButton = selectedId.replace('accept_payment_', '').replace('reject_payment_', '');
                const clientNumber = normalizarNumero(`+${clientJidFromButton.split('@')[0]}`);
                
                // Cargar datos de pagos para verificar el cliente
                const paymentsData = loadPayments();
                const clientInfo = paymentsData[clientNumber];

                if (selectedId.startsWith('accept_payment_')) {
                    if (!originalMessage) {
                        await m.reply('❌ Error: No se pudo encontrar el mensaje original del comprobante para aceptar.');
                        processedButtonIds.delete(selectedId);
                        return true;
                    }

                    if (clientInfo) {
                        // Cliente registrado, ejecutar subircomprobante
                        // Recrear un objeto `m` simulado para el handler de `subircomprobante.js`
                        const simulatedM = {
                            message: originalMessage, // Aquí está el mensaje original con la media
                            quoted: { message: originalMessage, isCommand: true }, // Simula que es un quoted message de comando
                            text: `.subircomprobante ${clientNumber}`, // Simula el texto del comando
                            isOwner: true, // El admin es el owner, así que pasamos isOwner como true
                            reply: async (msg) => { // Mock de la función reply para que el handler pueda enviar mensajes
                                await conn.sendMessage(m.chat, { text: msg });
                            }
                        };
                        // Asegurar que las propiedades de media estén en simulatedM.quoted.message
                        simulatedM.quoted.message.imageMessage = originalMessage.imageMessage;
                        simulatedM.quoted.message.documentMessage = originalMessage.documentMessage;
                        simulatedM.quoted.message.videoMessage = originalMessage.videoMessage;

                        try {
                            // Llamar a subirComprobanteHandler con el mensaje simulado
                            await subirComprobanteHandler(simulatedM, { conn, text: clientNumber, usedPrefix: '.', command: 'subircomprobante' });
                            
                            // Notificar al admin
                            await m.reply(`✅ Comprobante de ${clientInfo.nombre} aceptado y registrado.`);
                            // Notificar al cliente
                            await conn.sendMessage(clientJidFromButton, { text: `✅ ¡Hola ${clientInfo.nombre}! Tu pago ha sido aceptado y registrado. ¡Gracias!` });
                        } catch (error) {
                            console.error('Error al ejecutar subirComprobanteHandler:', error);
                            await m.reply(`❌ Ocurrió un error al registrar el comprobante de ${clientNumber}: ${error.message}`);
                            await conn.sendMessage(clientJidFromButton, { text: `❌ Hubo un problema al procesar tu pago. Por favor, contacta a soporte.` });
                            processedButtonIds.delete(selectedId); // Si hay un error, removemos el ID para poder reintentar
                        }
                    } else {
                        // Cliente no registrado
                        await m.reply(`⚠️ El comprobante fue aceptado, pero el cliente (${clientNumber}) NO está registrado en 'pagos.json'. No se ejecutó el comando subircomprobante.`);
                        await conn.sendMessage(clientJidFromButton, { text: `✅ Recibimos tu comprobante, pero parece que no estás registrado en nuestro sistema. Un administrador se pondrá en contacto contigo.` });
                    }
                } else if (selectedId.startsWith('reject_payment_')) {
                    // No ejecutar subirComprobanteHandler si se rechaza el pago
                    const clientName = clientInfo?.nombre || 'cliente desconocido';
                    await m.reply(`❌ Comprobante de ${clientName} (${clientNumber}) rechazado. No se realizaron cambios.`);
                    await conn.sendMessage(clientJidFromButton, { text: `❌ Lamentamos informarte que tu comprobante de pago ha sido rechazado. Por favor, contacta a soporte para más detalles.` });
                }
                return true;
            } catch (e) {
                console.error('Error al manejar el botón de comprobante:', e);
                await m.reply('Ocurrió un error al procesar la solicitud del botón.');
                processedButtonIds.delete(selectedId); // Si hay un error, removemos el ID para poder reintentar
                return false;
            }
        }
    }
    return false;
}

// Las funciones manejarRespuestaPago, loadPayments, savePayments, etc., permanecen igual.
// Solo asegúrate de que el resto del código de respuestapagos.js que no está relacionado
// con los botones de aceptar/rechazar comprobantes permanezca en su lugar.

export async function manejarRespuestaPago(m, conn) {
    const sender = m.sender || m.key?.participant || m.key?.remoteJid;
    if (!sender) return false;
    
    let userDoc = await new Promise((resolve, reject) => {
        global.db.data.users.findOne({ id: sender }, (err, doc) => {
            if (err) return reject(err);
            resolve(doc);
        });
    });

    if (!userDoc) {
        return false;
    }

    let respuesta = '';
    if (m.message?.buttonsResponseMessage) {
        respuesta = m.message.buttonsResponseMessage.selectedButtonId || m.message.buttonsResponseMessage.selectedDisplayText || '';
    } else if (m.message?.templateButtonReplyMessage) {
        respuesta = m.message.templateButtonReplyMessage.selectedId || m.message.templateButtonReplyMessage.selectedDisplayText || '';
    } else if (m.message?.listResponseMessage) {
        respuesta = m.message.listResponseMessage.singleSelectReply?.selectedRowId || m.message.listResponseMessage.title || '';
    } else {
        respuesta = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
    }

    respuesta = respuesta.trim();

    if (respuesta === "2" || respuesta.toLowerCase() === "necesito ayuda") {
        await conn.sendMessage(m.chat || sender, {
            text: `⚠️ En un momento se comunicará mi creador contigo.`
        });
        const adminJid = "5217771303481@s.whatsapp.net";
        const pagosPath = path.join(process.cwd(), 'src', 'pagos.json');
        let pagosData = {};
        if (fs.existsSync(pagosPath)) {
            pagosData = JSON.parse(fs.readFileSync(pagosPath, 'utf8'));
        }
        const cliente = pagosData[userDoc.paymentClientNumber] || {};
        const nombre = cliente.nombre || userDoc.paymentClientName || "cliente";
        const numero = cliente.numero || userDoc.paymentClientNumber || sender.split('@')[0];
        const adminMessage = `👋 Hola creador, *${nombre}* (+${numero}) tiene problemas con su pago. Por favor comunícate con él/ella.`;
        try {
            await conn.sendMessage(adminJid, { text: adminMessage });
        } catch (error) {
            console.error('Error enviando mensaje al admin:', error);
        }
        
        await new Promise((resolve, reject) => {
            global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err) => {
                if (err) {
                    console.error("Error al actualizar chatState a 'active':", err);
                    return reject(err);
                }
                resolve();
            });
        });
        return true;
    }

    // Se unifica el manejo de la respuesta "1" para evitar duplicaciones
    if (userDoc.chatState === 'awaitingPaymentResponse' && !m.key.fromMe) {
        if (respuesta === "1" || respuesta.toLowerCase() === "he realizado el pago") {
            const chatId = m.chat || sender;

            await conn.sendMessage(chatId, {
                text: `✅ *Si ya ha realizado su pago, por favor envía la foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸`
            });
            
            // Se actualiza el estado del chat a 'awaitingPaymentProof' para que la próxima
            // imagen o documento sea manejado correctamente por el handler.
            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'awaitingPaymentProof' } }, {}, (err) => {
                    if (err) {
                        console.error("Error al actualizar chatState a 'awaitingPaymentProof':", err);
                        return reject(err);
                    }
                    resolve();
                });
            });
            return true;
        } else if (/^\d+$/.test(respuesta) && respuesta !== "1") {
            await conn.sendMessage(m.chat || sender, {
                text: 'Por favor responde solo con 1 (He realizado el pago) o 2 (Necesito ayuda con mi pago).'
            });
            return true;
        }
        return false;
    }

    // Esta parte del código se ha eliminado para evitar el segundo mensaje de confirmación
    // El manejo del comprobante y el mensaje de confirmación ahora se gestionan en handler.js
    
    return false;
}
