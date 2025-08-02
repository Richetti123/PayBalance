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
        console.log(`[DEBUG - respuestapagos.js] Botón de comprobante detectado. ID: ${m.text}`);
        const selectedId = m.text;
        
        try {
            if (selectedId.startsWith('accept_payment_')) {
                const clientJid = selectedId.replace('accept_payment_', '');
                console.log(`[DEBUG - respuestapagos.js] Aceptando pago para: ${clientJid}`);
                const responseMessage = '✅ ¡Genial! Tu pago ha sido aceptado. En un momento el creador se comunicará contigo para la entrega del servicio que compraste.';
                await conn.sendMessage(clientJid, { text: responseMessage });

                const paymentsData = loadPayments();
                if (paymentsData[clientJid] && paymentsData[clientJid].comprobantesPendientes) {
                    paymentsData[clientJid].comprobantesPendientes = false;
                    savePayments(paymentsData);
                }

                await m.reply(`✅ Comprobante aceptado. Se notificó al cliente ${clientJid}.`);
            } else if (selectedId.startsWith('reject_payment_')) {
                const clientJid = selectedId.replace('reject_payment_', '');
                console.log(`[DEBUG - respuestapagos.js] Rechazando pago para: ${clientJid}`);
                const responseMessage = '❌ ¡Importante! Mi creador ha rechazado este comprobante de pago, tal vez porque es falso o porque la transferencia no se recibió. De igual manera, en un momento se comunicará contigo para resolver este problema.';
                await conn.sendMessage(clientJid, { text: responseMessage });
                
                await m.reply(`❌ Comprobante rechazado. Se notificó al cliente ${clientJid}.`);
            }
            console.log(`[DEBUG - respuestapagos.js] Flujo de botón de comprobante completado. Retornando true.`);
            return true;
        } catch (e) {
            console.error('[DEBUG - respuestapagos.js] Error al manejar el botón de comprobante:', e);
            await m.reply('Ocurrió un error al procesar la solicitud.');
            return false;
        }
    }
    console.log(`[DEBUG - respuestapagos.js] No es una respuesta de botón de comprobante. Retornando false.`);
    return false;
}

export async function manejarRespuestaPago(m, conn) {
    const sender = m.sender || m.key?.participant || m.key?.remoteJid;
    if (!sender) return false;

    console.log(`[DEBUG - manejarRespuestaPago] Iniciando para el remitente: ${sender}`);
    
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
    console.log(`[DEBUG - manejarRespuestaPago] userDoc encontrado. Estado de chat actual: ${userDoc.chatState}`);

    if (userDoc.chatState === 'awaitingPaymentResponse' && !m.key.fromMe) {
        console.log(`[DEBUG - manejarRespuestaPago] El chatState es 'awaitingPaymentResponse'. Procesando respuesta.`);
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

        console.log(`[DEBUG - manejarRespuestaPago] Respuesta capturada de ${sender}: "${respuesta}"`);

        if (respuesta === "1" || respuesta.toLowerCase() === "he realizado el pago") {
            console.log(`[DEBUG - manejarRespuestaPago] La respuesta coincide con "1" o "he realizado el pago".`);
            const pagosPath = path.join(process.cwd(), 'src', 'pagos.json');
            let pagosData = {};
            try {
                if (fs.existsSync(pagosPath)) {
                    pagosData = JSON.parse(fs.readFileSync(pagosPath, 'utf8'));
                }
            } catch (e) {
                console.error('[DEBUG - manejarRespuestaPago] Error leyendo pagos.json:', e);
            }

            const cliente = pagosData[userDoc.paymentClientNumber] || {};
            const nombre = cliente.nombre || userDoc.paymentClientName || "cliente";
            const numero = cliente.numero || userDoc.paymentClientNumber || sender.split('@')[0];

            const chatId = m.chat || sender;

            await conn.sendMessage(chatId, {
                text: `✅ *Si ya ha realizado su pago, por favor enviar foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸`
            });
            
            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'awaitingPaymentProof' } }, {}, (err) => {
                    if (err) {
                        console.error("[DEBUG - manejarRespuestaPago] Error al actualizar chatState a 'awaitingPaymentProof':", err);
                        return reject(err);
                    }
                    console.log("[DEBUG - manejarRespuestaPago] chatState actualizado a 'awaitingPaymentProof'.");
                    resolve();
                });
            });
            return true;
        } else if (respuesta === "2" || respuesta.toLowerCase() === "necesito ayuda") {
            console.log(`[DEBUG - manejarRespuestaPago] La respuesta coincide con "2" o "necesito ayuda".`);
            await conn.sendMessage(m.chat || sender, {
                text: `⚠️ En un momento se comunicará mi creador contigo.`
            });
            const adminJid = "5217771303481@s.whatsapp.net";
            const adminMessage = `👋 Hola creador, *${nombre}* (${numero}) tiene problemas con su pago. Por favor comunícate con él/ella.`;
            try {
                await conn.sendMessage(adminJid, { text: adminMessage });
            } catch (error) {
                console.error('[DEBUG - manejarRespuestaPago] Error enviando mensaje al admin:', error);
            }
            
            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err) => {
                    if (err) {
                        console.error("[DEBUG - manejarRespuestaPago] Error al actualizar chatState a 'active':", err);
                        return reject(err);
                    }
                    console.log("[DEBUG - manejarRespuestaPago] chatState actualizado a 'active'.");
                    resolve();
                });
            });
            return true;
        }

        if (/^\d+$/.test(respuesta) && respuesta !== "1" && respuesta !== "2") {
            console.log(`[DEBUG - manejarRespuestaPago] Respuesta numérica inválida: "${respuesta}".`);
            await conn.sendMessage(m.chat || sender, {
                text: 'Por favor responde solo con 1 (He realizado el pago) o 2 (Necesito ayuda con mi pago).'
            });
            return true;
        }
        console.log(`[DEBUG - manejarRespuestaPago] La respuesta no coincide con "1" o "2". Retornando false.`);
        return false;
    }

    if (userDoc.chatState === 'awaitingPaymentProof' && !m.key.fromMe) {
        console.log(`[DEBUG - manejarRespuestaPago] El chatState es 'awaitingPaymentProof'. Buscando comprobante.`);
        const isComprobantePhrase = m.text && m.text.toLowerCase().includes("aquí está mi comprobante de pago");
        const hasMedia = m.message?.imageMessage || m.message?.documentMessage;

        if (hasMedia && isComprobantePhrase) {
            console.log(`[DEBUG - manejarRespuestaPago] Comprobante de pago (media + frase clave) detectado.`);
            const chatId = m.chat || sender;
            await conn.sendMessage(chatId, {
                text: '✅ Comprobante recibido. Gracias por tu pago.'
            });

            userDoc.chatState = 'active';
            userDoc.paymentClientName = '';
            userDoc.paymentClientNumber = '';
            userDoc.awaitingPaymentResponse = false;
            
            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: sender }, { $set: userDoc }, {}, (err) => {
                    if (err) {
                        console.error('[DEBUG - manejarRespuestaPago] Error actualizando usuario en DB tras comprobante:', err);
                        return reject(err);
                    }
                    console.log(`[DEBUG - manejarRespuestaPago] Estado de chat para ${sender} reseteado tras comprobante. Retornando true.`);
                    resolve();
                });
            });
            return true;
        }
        
        console.log(`[DEBUG - manejarRespuestaPago] No se detectó un comprobante válido. Retornando false.`);
        return false;
    }

    console.log(`[DEBUG - manejarRespuestaPago] No se cumplieron las condiciones del chatState. Retornando false.`);
    return false;
}
