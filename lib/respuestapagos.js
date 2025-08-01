import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './simple.js';
import { format } from 'util';
import fs from 'fs';
import path from 'path';

// Ruta al archivo de pagos
const paymentsFilePath = path.join(process.cwd(), 'src', 'pagos.json');

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
    if (m.isOwner && m.text && (m.text.startsWith('accept_payment_') || m.text.startsWith('reject_payment_'))) {
        const selectedId = m.text;
        
        try {
            if (selectedId.startsWith('accept_payment_')) {
                const clientJid = selectedId.replace('accept_payment_', '');
                const responseMessage = '✅ ¡Genial! Tu pago ha sido aceptado. En un momento el creador se comunicará contigo para la entrega del servicio que compraste.';
                await conn.sendMessage(clientJid, { text: responseMessage });

                // Marcar el pago como aceptado en la base de datos o archivo de pagos
                const paymentsData = loadPayments();
                if (paymentsData[clientJid] && paymentsData[clientJid].comprobantesPendientes) {
                    paymentsData[clientJid].comprobantesPendientes = false;
                    savePayments(paymentsData);
                }

                await m.reply(`✅ Comprobante aceptado. Se notificó al cliente ${clientJid}.`);
            } else if (selectedId.startsWith('reject_payment_')) {
                const clientJid = selectedId.replace('reject_payment_', '');
                const responseMessage = '❌ ¡Importante! Mi creador ha rechazado este comprobante de pago, tal vez porque es falso o porque la transferencia no se recibió. De igual manera, en un momento se comunicará contigo para resolver este problema.';
                await conn.sendMessage(clientJid, { text: responseMessage });
                
                // Opcionalmente, puedes marcar el pago como rechazado si lo manejas en tus datos
                await m.reply(`❌ Comprobante rechazado. Se notificó al cliente ${clientJid}.`);
            }
            return true;
        } catch (e) {
            console.error('Error al manejar el botón de comprobante:', e);
            await m.reply('Ocurrió un error al procesar la solicitud.');
            return false;
        }
    }
    return false;
}

export async function manejarRespuestaPago(m, conn) {
    const sender = m.sender || m.key?.participant || m.key?.remoteJid;
    if (!sender) return false;

    // Obtener los datos del usuario de la base de datos
    let userDoc = await new Promise((resolve, reject) => {
        global.db.data.users.findOne({ id: sender }, (err, doc) => {
            if (err) return reject(err);
            resolve(doc);
        });
    });

    if (!userDoc) {
        console.log(`[DEBUG - manejarRespuestaPago] No se encontró userDoc para ${sender}. Retornando false.`);
        return false;
    }

    // Validar si está esperando respuesta de pago y el mensaje no es del bot
    // Se mantiene userDoc.awaitingPaymentResponse activa para permitir múltiples respuestas.
    if (userDoc.awaitingPaymentResponse && !m.key.fromMe) {
        let respuesta = '';

        // --- Extracción de la respuesta del usuario (Prioridad de botones) ---
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

        console.log(`[DEBUG - manejarRespuestaPago] Respuesta capturada de ${sender}: "${respuesta}"`);

        // --- Lógica para respuestas "1" o "2" ---
        if (respuesta === "1" || respuesta === "2") {
            const pagosPath = path.join(process.cwd(), 'src', 'pagos.json');
            let pagosData = {};
            try {
                if (fs.existsSync(pagosPath)) {
                    pagosData = JSON.parse(fs.readFileSync(pagosPath, 'utf8'));
                }
            } catch (e) {
                console.error('Error leyendo pagos.json:', e);
            }

            const cliente = pagosData[userDoc.paymentClientNumber] || {};
            const nombre = cliente.nombre || userDoc.paymentClientName || "cliente";
            const numero = cliente.numero || userDoc.paymentClientNumber || sender.split('@')[0];

            const chatId = m.chat || sender;

            if (respuesta === "1") {
                await conn.sendMessage(chatId, {
                    text: `✅ *Si ya ha realizado su pago, por favor enviar foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸`
                });
                // NO se resetea awaitingPaymentResponse aquí. Se sigue esperando el comprobante.
            } else if (respuesta === "2") {
                await conn.sendMessage(chatId, {
                    text: `⚠️ En un momento se comunicará mi creador contigo.`
                });
                const adminJid = "5217771303481@s.whatsapp.net";
                const adminMessage = `👋 Hola creador, *${nombre}* (${numero}) tiene problemas con su pago. Por favor comunícate con él/ella.`;
                try {
                    await conn.sendMessage(adminJid, { text: adminMessage });
                } catch (error) {
                    console.error('Error enviando mensaje al admin:', error);
                }
                // Aquí podrías considerar resetear awaitingPaymentResponse si esta es la "respuesta final" para el usuario
                // que eligió ayuda y no necesita enviar un comprobante.
                // Si quieres que solo el envío del comprobante finalice la conversación,
                // entonces NO resetees aquí tampoco. Por ahora, lo dejaré **sin resetear**.
            }
            
            // IMPORTANTE: No reseteamos 'awaitingPaymentResponse' aquí, solo si se envía el comprobante.
            // Los otros campos (paymentClientName, paymentClientNumber) se mantienen.
            return true; // Mensaje manejado
        }

        // Si es un número puro pero no 1 ni 2 (y el bot sigue esperando respuesta)
        if (/^\d+$/.test(respuesta) && respuesta !== "1" && respuesta !== "2") {
            await conn.sendMessage(m.chat || sender, {
                text: 'Por favor responde solo con 1 (He realizado el pago) o 2 (Necesito ayuda con mi pago).'
            });
            return true; // Mensaje manejado (respuesta inválida, pero el estado de espera se mantiene)
        }
        
        // --- Lógica para el comprobante de pago (cuando el usuario envía la frase) ---
        const isComprobantePhrase = respuesta.includes("Aquí está mi comprobante de pago");

        if (m.message?.imageMessage && isComprobantePhrase) {
            const chatId = m.chat || sender;
            await conn.sendMessage(chatId, {
                text: '✅ Comprobante recibido. Gracias por tu pago.'
            });

            // --- AHORA SÍ: Resetear el estado de espera y guardar en la base de datos ---
            userDoc.awaitingPaymentResponse = false;
            userDoc.paymentClientName = '';
            userDoc.paymentClientNumber = '';
            
            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: sender }, { $set: userDoc }, {}, (err) => {
                    if (err) {
                        console.error('Error actualizando usuario en DB tras comprobante:', err);
                        return reject(err);
                    }
                    console.log(`[DEBUG] Estado de awaitingPaymentResponse para ${sender} reseteado tras comprobante.`);
                    resolve();
                });
            });

            return true; // Mensaje de comprobante manejado
        }
        
        // Si el usuario está esperando una respuesta y envía algo que no es 1, 2, o un comprobante explícito,
        // no se hace nada y la función retorna false.
        // El estado 'awaitingPaymentResponse' sigue siendo 'true' para que pueda intentar de nuevo.
        return false;
    }

    return false; // El usuario no está esperando una respuesta de pago o el mensaje es del bot
}
