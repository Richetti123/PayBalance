import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './simple.js';
import { format } from 'util';
import fs from 'fs';
import path from 'path';

// Ruta al archivo de pagos
const paymentsFilePath = path.join(process.cwd(), 'src', 'pagos.json');
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

/**
 * Maneja la respuesta del propietario a los botones de comprobante de pago.
 * @param {import('@whiskeysockets/baileys').WAMessage} m
 * @param {import('@whiskeysockets/baileys').WASocket} conn
 * @returns {boolean} True si la respuesta fue manejada, false en caso contrario.
 */
export async function handlePaymentProofButton(m, conn) {
    if (m.isOwner && m.text) {
        const selectedId = m.text;
        
        // [LOG] Verificando si el botón ha sido presionado por el owner
        console.log(`[handlePaymentProofButton] Botón presionado por el owner con ID: ${selectedId}`);
        
        // Verificamos si el botón ya ha sido procesado
        if (processedButtonIds.has(selectedId)) {
            console.log(`[DEBUG] Botón con ID ${selectedId} ya procesado. Ignorando.`);
            return true;
        }

        if (selectedId.startsWith('accept_payment_') || selectedId.startsWith('reject_payment_')) {
            // Agregamos el ID a la lista de procesados
            processedButtonIds.add(selectedId);

            try {
                const clientJid = selectedId.replace('accept_payment_', '').replace('reject_payment_', '');
                
                const formattedNumberForAdmin = `+${clientJid.split('@')[0]}`;
                
                if (selectedId.startsWith('accept_payment_')) {
                    // [LOG] Botón de aceptar pago
                    console.log(`[handlePaymentProofButton] Aceptando pago para el cliente: ${formattedNumberForAdmin}`);
                    
                    const responseMessage = '✅ ¡Genial! Tu pago ha sido aceptado. En un momento el creador se comunicará contigo para la entrega del servicio que compraste.';
                    await conn.sendMessage(clientJid, { text: responseMessage });

                    const paymentsData = loadPayments();
                    const clientPhoneNumberKey = formattedNumberForAdmin;
                    if (paymentsData[clientPhoneNumberKey]) {
                        paymentsData[clientPhoneNumberKey].comprobantesPendientes = false;
                        savePayments(paymentsData);
                    }

                    await m.reply(`✅ Comprobante aceptado. Se notificó al cliente ${formattedNumberForAdmin}.`);
                } else if (selectedId.startsWith('reject_payment_')) {
                    // [LOG] Botón de rechazar pago
                    console.log(`[handlePaymentProofButton] Rechazando pago para el cliente: ${formattedNumberForAdmin}`);
                    
                    const responseMessage = '❌ ¡Importante! Mi creador ha rechazado este comprobante de pago, tal vez porque es falso o porque la transferencia no se recibió. De igual manera, en un momento se comunicará contigo para resolver este problema.';
                    await conn.sendMessage(clientJid, { text: responseMessage });
                    
                    await m.reply(`❌ Comprobante rechazado. Se notificó al cliente ${formattedNumberForAdmin}.`);
                }
                return true;
            } catch (e) {
                console.error('Error al manejar el botón de comprobante:', e);
                await m.reply('Ocurrió un error al procesar la solicitud.');
                processedButtonIds.delete(selectedId); // Si hay un error, removemos el ID para poder reintentar
                return false;
            }
        }
    }
    return false;
}

export async function manejarRespuestaPago(m, conn) {
    const sender = m.sender || m.key?.participant || m.key?.remoteJid;
    if (!sender) return false;
    
    // [LOG] manejando respuesta de pago
    console.log('[manejarRespuestaPago] Iniciando manejo de respuesta de pago.');
    
    let userDoc = await new Promise((resolve, reject) => {
        global.db.data.users.findOne({ id: sender }, (err, doc) => {
            if (err) return reject(err);
            resolve(doc);
        });
    });

    if (!userDoc) {
        // [LOG] Usuario no encontrado en la base de datos
        console.log('[manejarRespuestaPago] Usuario no encontrado en la base de datos.');
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
    // [LOG] Respuesta del usuario detectada
    console.log(`[manejarRespuestaPago] Respuesta detectada: '${respuesta}'`);

    if (respuesta === "2" || respuesta.toLowerCase() === "necesito ayuda con mi pago") {
        // [LOG] El usuario seleccionó '2' o 'necesito ayuda'
        console.log('[manejarRespuestaPago] El usuario seleccionó la opción 2 (Necesito ayuda).');
        
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
        const adminMessage = `👋 Hola creador, *${nombre}* (${numero}) tiene problemas con su pago. Por favor comunícate con él/ella.`;
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

    if (userDoc.chatState === 'awaitingPaymentResponse' && !m.key.fromMe) {
        if (respuesta === "1" || respuesta.toLowerCase() === "he realizado el pago") {
            // [LOG] El usuario seleccionó '1' o 'he realizado el pago'
            console.log('[manejarRespuestaPago] El usuario seleccionó la opción 1 (He realizado el pago).');
            
            const chatId = m.chat || sender;

            await conn.sendMessage(chatId, {
                text: `✅ *Si ya ha realizado su pago, por favor envía la foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸`
            });
            
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
        } else if (/^\d+$/.test(respuesta) && respuesta !== "1" && respuesta !== "2") {
            // [LOG] Respuesta numérica inválida
            console.log('[manejarRespuestaPago] El usuario envió una respuesta numérica inválida.');
            await conn.sendMessage(m.chat || sender, {
                text: 'Por favor responde solo con 1 (He realizado el pago) o 2 (Necesito ayuda con mi pago).'
            });
            return true;
        }
    }
    
    // [LOG] Ninguna de las opciones anteriores coincidió
    console.log('[manejarRespuestaPago] Ninguna de las condiciones de respuesta fue cumplida.');
    
    return false;
}
