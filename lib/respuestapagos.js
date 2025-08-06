import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './simple.js';
import { format } from 'util';
import fs from 'fs';
import path from 'path';
import { subirComprobanteHandler } from '../plugins/subircomprobante.js';

// Ruta al archivo de pagos
const paymentsFilePath = path.join(process.cwd(), 'src', 'pagos.json');
const chatDataPath = path.join(process.cwd(), 'src', 'chat_data.json'); // Ruta al archivo chat_data.json

// NOTA: Eliminamos 'processedButtonIds' Set. La gestión de duplicados se hará por el estado 'pagoRealizado'
// o por la lógica interna de processPaymentProofAndSave.

const loadPayments = () => {
    if (fs.existsSync(paymentsFilePath)) {
        return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    }
    return {};
};

const savePayments = (data) => {
    fs.writeFileSync(paymentsFilePath, JSON.stringify(data, null, 2), 'utf8');
};

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


/**
 * Maneja la respuesta del propietario a los botones de comprobante de pago.
 * @param {import('@whiskeysockets/baileys').WAMessage} m
 * @param {import('@whiskeysockets/baileys').WASocket} conn
 * @param {any} store El objeto del store de Baileys para cargar mensajes.
 * @returns {boolean} True si la respuesta fue manejada, false en caso contrario.
 */
export async function handlePaymentProofButton(m, conn, store) {
    if (m.isOwner && m.text) {
        const selectedId = m.text;
        
        // El formato de los botones de aprobación/rechazo es:
        // ACCEPT_PROOF_{originalMsgId}_{clientKey}
        // REJECT_PROOF_{originalMsgId}_{clientKey}
        if (selectedId.startsWith('ACCEPT_PROOF_') || selectedId.startsWith('REJECT_PROOF_')) {
            try {
                const parts = selectedId.split('_');
                const action = parts[0]; // 'ACCEPT' o 'REJECT'
                const originalMsgId = parts[2]; // ID del mensaje original del comprobante
                const clientKey = parts[3]; // La clave del cliente (ej. '+527771234567')

                const paymentsData = loadPayments();
                const chatData = loadChatData();

                let clientInfo = paymentsData[clientKey];
                let clientNameForMessages = clientInfo?.nombre;

                // Si clientInfo no se encontró en pagos.json, es un cliente nuevo/no registrado
                if (!clientInfo) {
                    const userChatData = chatData[clientKey] || {};
                    clientNameForMessages = userChatData.nombre || clientKey; // Usar el nombre del chat_data o el número
                    // Crear un objeto de cliente temporal para pasar a processPaymentProofAndSave
                    // Esta función lo agregará a pagos.json si no existe
                    clientInfo = {
                        nombre: clientNameForMessages,
                        numero: clientKey, // El número normalizado
                        // Puedes añadir otros campos por defecto si son necesarios en pagos.json al crear un nuevo cliente
                        diaPago: new Date().getDate(), // O algún valor por defecto, o pedirlo al admin
                        monto: 'Desconocido', // O pedirlo al admin
                        bandera: 'Desconocido', // O pedirlo al admin
                        suspendido: false,
                        pagoRealizado: false, // Se establecerá a true por processPaymentProofAndSave
                        pagos: [],
                        historialComprobantes: []
                    };
                }

                if (action === 'ACCEPT') {
                    // Cargar el mensaje original del comprobante
                    // 'm.chat' en este contexto es el chat del owner (donde el owner hizo clic en el botón)
                    const originalMessage = await store.loadMessage(m.chat, originalMsgId);
                    
                    if (!originalMessage || !originalMessage.message) {
                        await m.reply('❌ No se pudo encontrar el mensaje del comprobante original para aceptar.');
                        return true;
                    }
                    
                    const messageContent = originalMessage.message.imageMessage || originalMessage.message.documentMessage;
                    const isImage = !!originalMessage.message.imageMessage;

                    if (!messageContent) {
                        await m.reply('❌ Contenido del comprobante no válido para procesar.');
                        return true;
                    }

                    // Llamar a la función refactorizada para procesar y guardar el comprobante
                    const result = await processPaymentProofAndSave(conn, messageContent, clientKey, clientInfo, isImage);

                    if (result.success) {
                        await m.reply(result.responseToOwner); // Mensaje al owner
                        await conn.sendMessage(result.clientJid, { text: result.responseToClient }); // Mensaje al cliente
                    } else {
                        await m.reply(`❌ Ocurrió un error al aceptar el comprobante: ${result.error}`);
                    }
                } else if (action === 'REJECT') {
                    await m.reply(`✅ El comprobante de *${clientNameForMessages}* (${clientKey}) ha sido rechazado.`);
                    const clientJid = `${clientKey.replace('+', '')}@s.whatsapp.net`;
                    await conn.sendMessage(clientJid, { text: `❌ ¡Hola ${clientNameForMessages}! Tu comprobante de pago ha sido revisado y, lamentablemente, ha sido *rechazado*. Por favor, verifica los detalles y envía un comprobante válido si es necesario o contacta con soporte.` });
                }
                return true; // La respuesta del botón fue manejada
            } catch (e) {
                console.error('Error al manejar el botón de comprobante (ACCEPT/REJECT):', e);
                await m.reply('Ocurrió un error al procesar la solicitud de aprobación/rechazo.');
                return false;
            }
        }
    }
    // ... (resto de la función handlePaymentProofButton para otros tipos de botones) ...
    // Tus botones existentes como 'accept_payment_' o 'reject_payment_'
    if (m.isOwner && m.text) { // Si no es ACCEPT_PROOF o REJECT_PROOF, verifica los antiguos
        const selectedId = m.text;
        if (selectedId.startsWith('accept_payment_') || selectedId.startsWith('reject_payment_')) {
            try {
                const clientJid = selectedId.replace('accept_payment_', '').replace('reject_payment_', '');
                const formattedNumberForAdmin = `+${clientJid.split('@')[0]}`;
                
                if (selectedId.startsWith('accept_payment_')) {
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
                    const responseMessage = '❌Mi creador ha rechazado este comprobante de pago, tal vez porque es falso o porque la transferencia no se recibió. De igual manera, en un momento se comunicará contigo para resolver este problema.';
                    await conn.sendMessage(clientJid, { text: responseMessage });
                    await m.reply(`❌ Comprobante rechazado. Se notificó al cliente ${formattedNumberForAdmin}.`);
                }
                return true;
            } catch (e) {
                console.error('Error al manejar el botón de comprobante (antiguo formato):', e);
                await m.reply('Ocurrió un error al procesar la solicitud.');
                return false;
            }
        }
    }
    return false;
}

export async function manejarRespuestaPago(m, conn) {
    // ... (Tu código existente para manejar la lógica de 'Necesito ayuda' y 'He realizado el pago' del cliente) ...
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
    
    return false;
}
