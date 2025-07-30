import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ADMIN_NUMBER_CONFIRMATION = '5217771303481@s.whatsapp.net';
const DELAY_BETWEEN_MESSAGES_MS = 1800000; // 30 minutos

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Lógica de envío automático (exportada para ser usada por main.js y también internamente por el handler)
export async function sendAutomaticPaymentRemindersLogic(client) {
    const today = new Date();
    const currentDayOfMonth = today.getDate();

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowDayOfMonth = tomorrow.getDate();

    try {
        const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
        let clientsData = {};
        if (fs.existsSync(paymentsFilePath)) {
            clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        } else {
            fs.writeFileSync(paymentsFilePath, JSON.stringify({}, null, 2), 'utf8'); // Crea el archivo si no existe
        }

        const clientsToSendReminders = [];

        for (const phoneNumberKey in clientsData) {
            const clientInfo = clientsData[phoneNumberKey];
            const numero = phoneNumberKey; // El número puro, e.g., '5217771234567'
            const { diaPago, monto, bandera, nombre } = clientInfo;

            if (!numero) continue;

            let mainReminderMessage = '';
            let paymentDetails = '';
            let shouldSend = false;

            if (diaPago === currentDayOfMonth) {
                mainReminderMessage = `¡Hola ${nombre}! 👋 Es tu día de pago. Recuerda que tu monto es de ${monto}.`;
                shouldSend = true;
            } else if (diaPago === tomorrowDayOfMonth) {
                mainReminderMessage = `¡Hola ${nombre}! 👋 Tu pago de ${monto} vence mañana. ¡No lo olvides!`;
                shouldSend = true;
            }

            if (shouldSend) {
                switch (bandera) {
                    case '🇲🇽':
                        paymentDetails = `\n\nPara pagar en México, usa:
CLABE: 706969168872764411
Nombre: Gaston Juarez
Banco: Arcus Fi`;
                        break;
                    case '🇵🇪':
                        paymentDetails = `\n\nPara pagar en Perú, usa:
Nombre: Marcelo Gonzales R.
Yape: 967699188
Plin: 955095498`;
                        break;
                    case '🇨🇱':
                        paymentDetails = `\n\nPara pagar en Chile, usa:
Nombre: BARINIA VALESKA ZENTENO MERINO
RUT: 17053067-5
BANCO ELEGIR: TEMPO
Tipo de cuenta: Cuenta Vista
Numero de cuenta: 111117053067
Correo: estraxer2002@gmail.com`;
                        break;
                    case '🇦🇷':
                        paymentDetails = `\n\nPara pagar en Argentina, usa:
Nombre: Gaston Juarez
CBU: 4530000800011127480736`;
                        break;
                    default:
                        paymentDetails = '\n\nPor favor, contacta para coordinar tu pago. No se encontraron métodos de pago específicos para tu país.';
                }

                const formattedNumber = numero.replace(/\+/g, '') + '@s.whatsapp.net';

                const buttons = [
                    { buttonId: '1', buttonText: { displayText: 'He realizado el pago' }, type: 1 },
                    { buttonId: '2', buttonText: { displayText: 'Necesito ayuda con mi pago' }, type: 1 }
                ];

                const buttonMessage = {
                    text: mainReminderMessage + paymentDetails + '\n\n*Escoge una de las opciones:*',
                    buttons: buttons,
                    headerType: 1
                };

                clientsToSendReminders.push({ formattedNumber, buttonMessage, nombre, numero });
            }
        }

        for (let i = 0; i < clientsToSendReminders.length; i++) {
            const { formattedNumber, buttonMessage, nombre, numero } = clientsToSendReminders[i];

            try {
                console.log(`[DEBUG - Auto] Intentando enviar recordatorio a: ${formattedNumber}`);
                await client.sendMessage(formattedNumber, buttonMessage);
                console.log(`[DEBUG - Auto] Recordatorio enviado exitosamente a: ${formattedNumber}`);

                // --- CAMBIO CLAVE AQUÍ: Actualizar Nedb para awaitingPaymentResponse ---
                // Obtener el documento del usuario de Nedb
                let userDoc = await new Promise((resolve, reject) => {
                    global.db.data.users.findOne({ id: formattedNumber }, (err, doc) => {
                        if (err) return reject(err);
                        resolve(doc);
                    });
                });

                if (userDoc) {
                    // Si el usuario ya existe, actualizarlo
                    userDoc.awaitingPaymentResponse = true;
                    userDoc.paymentClientName = nombre;
                    userDoc.paymentClientNumber = numero;
                    await new Promise((resolve, reject) => {
                        global.db.data.users.update({ id: formattedNumber }, { $set: userDoc }, {}, (err) => {
                            if (err) {
                                console.error('Error actualizando usuario en DB tras recordatorio:', err);
                                return reject(err);
                            }
                            console.log(`[DEBUG] Estado de awaitingPaymentResponse para ${formattedNumber} establecido a true.`);
                            resolve();
                        });
                    });
                } else {
                    // Si el usuario no existe, insertarlo
                    userDoc = {
                        id: formattedNumber,
                        awaitingPaymentResponse: true,
                        paymentClientName: nombre,
                        paymentClientNumber: numero
                    };
                    await new Promise((resolve, reject) => {
                        global.db.data.users.insert(userDoc, (err, newDoc) => {
                            if (err) {
                                console.error('Error insertando usuario en DB tras recordatorio:', err);
                                return reject(err);
                            }
                            console.log(`[DEBUG] Nuevo usuario ${formattedNumber} insertado con awaitingPaymentResponse a true.`);
                            resolve(newDoc);
                        });
                    });
                }

                const confirmationText = `✅ Recordatorio automático enviado a *${nombre}* (${numero}).`;
                await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: confirmationText });
                console.log(`[DEBUG - Auto] Confirmación enviada a admin para ${formattedNumber}.`);

            } catch (sendError) {
                console.error(`[ERROR - Auto] Falló el envío de recordatorio a ${formattedNumber}:`, sendError);
                try {
                    await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `❌ Falló el recordatorio automático a *${nombre}* (${numero}). Error: ${sendError.message || sendError}` });
                } catch (adminSendError) {
                    console.error(`[ERROR - Auto] Falló el envío de error al admin para ${formattedNumber}:`, adminSendError);
                }
            }

            if (i < clientsToSendReminders.length - 1) {
                await sleep(DELAY_BETWEEN_MESSAGES_MS);
            }
        }

    } catch (error) {
        console.error('Error general en sendAutomaticPaymentRemindersLogic:', error);
    }
}


// Este es el handler para el comando del bot (por ejemplo, cuando alguien escribe "!recordatorio Marcelo")
export async function handler(m, { conn, text, command, usedPrefix }) {
    const clientNameInput = text.trim(); // El input del usuario es el nombre

    try {
        const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
        let clientsData = {};
        if (fs.existsSync(paymentsFilePath)) {
            clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        } else {
            console.log('[DEBUG - Manual] pagos.json no encontrado.');
            return conn.sendMessage(m.chat, { text: '❌ El archivo `pagos.json` no se encontró.' }, { quoted: m });
        }

        let clientInfo = null;
        let phoneNumberKey = null;

        if (clientNameInput) {
            console.log(`[DEBUG - Manual] Buscando cliente: ${clientNameInput}`);
            for (const key in clientsData) {
                if (clientsData[key].nombre && clientsData[key].nombre.toLowerCase() === clientNameInput.toLowerCase()) {
                    clientInfo = clientsData[key];
                    phoneNumberKey = key; // El número puro, que es la clave en pagos.json
                    break;
                }
            }

            if (!clientInfo) {
                console.log(`[DEBUG - Manual] Cliente "${clientNameInput}" no encontrado.`);
                return conn.sendMessage(m.chat, { text: `❌ Cliente con nombre "${clientNameInput}" no encontrado en la base de datos de pagos.` }, { quoted: m });
            }
        } else {
            // Si no se proporciona nombre, se ejecuta la lógica automática para todos los clientes que les toca hoy/mañana
            console.log('[DEBUG - Manual] No se proporcionó nombre, ejecutando recordatorios automáticos.');
            await conn.sendMessage(m.chat, { text: '🔄 Iniciando envío de recordatorios automáticos a todos los clientes que les toca pago hoy o mañana...' }, { quoted: m });
            await sendAutomaticPaymentRemindersLogic(conn); // Llama a la función de lógica automática
            return conn.sendMessage(m.chat, { text: '✅ Proceso de recordatorios automáticos finalizado.' }, { quoted: m });
        }

        // Si se especificó un cliente por nombre y se encontró, enviar recordatorio solo a ese cliente
        const { diaPago, monto, bandera, nombre } = clientInfo;
        const numeroSinPrefijo = phoneNumberKey.replace(/\+/g, ''); // CORRECCIÓN APLICADA AQUÍ
        const formattedTargetNumber = numeroSinPrefijo + '@s.whatsapp.net';

        console.log(`[DEBUG - Manual] Cliente encontrado: ${nombre} (${numeroSinPrefijo}). JID de destino: ${formattedTargetNumber}`);


        let mainReminderMessage = `¡Hola ${nombre}! 👋 Este es un recordatorio de tu pago de ${monto}.`;
        let paymentDetails = '';

        switch (bandera) {
            case '🇲🇽':
                paymentDetails = `\n\nPara pagar en México, usa:
CLABE: 706969168872764411
Nombre: Gaston Juarez
Banco: Arcus Fi`;
                break;
            case '🇵🇪':
                paymentDetails = `\n\nPara pagar en Perú, usa:
Nombre: Marcelo Gonzales R.
Yape: 967699188
Plin: 955095498`;
                break;
            case '🇨🇱':
                paymentDetails = `\n\nPara pagar en Chile, usa:
Nombre: BARINIA VALESKA ZENTENO MERINO
RUT: 17053067-5
BANCO ELEGIR: TEMPO
Tipo de cuenta: Cuenta Vista
Numero de cuenta: 111117053067
Correo: estraxer2002@gmail.com`;
                break;
            case '🇦🇷':
                paymentDetails = `\n\nPara pagar en Argentina, usa:
Nombre: Gaston Juarez
CBU: 4530000800011127480736`;
                break;
            default:
                paymentDetails = '\n\nPor favor, contacta para coordinar tu pago. No se encontraron métodos de pago específicos para tu país.';
        }

        const buttons = [
            { buttonId: '1', buttonText: { displayText: 'He realizado el pago' }, type: 1 },
            { buttonId: '2', buttonText: { displayText: 'Necesito ayuda con mi pago' }, type: 1 }
        ];

        const buttonMessage = {
            text: mainReminderMessage + paymentDetails + '\n\n*Escoge una de las opciones:*',
            buttons: buttons,
            headerType: 1
        };

        console.log(`[DEBUG - Manual] Intentando enviar recordatorio a: ${formattedTargetNumber}`);
        await conn.sendMessage(formattedTargetNumber, buttonMessage);
        console.log(`[DEBUG - Manual] Recordatorio manual enviado exitosamente a: ${formattedTargetNumber}`);


        // --- CAMBIO CLAVE AQUÍ: Actualizar Nedb para awaitingPaymentResponse en el handler manual ---
        let userDoc = await new Promise((resolve, reject) => {
            global.db.data.users.findOne({ id: formattedTargetNumber }, (err, doc) => {
                if (err) return reject(err);
                resolve(doc);
            });
        });

        if (userDoc) {
            userDoc.awaitingPaymentResponse = true;
            userDoc.paymentClientName = nombre;
            userDoc.paymentClientNumber = numeroSinPrefijo;
            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: formattedTargetNumber }, { $set: userDoc }, {}, (err) => {
                    if (err) {
                        console.error('Error actualizando usuario en DB tras recordatorio manual:', err);
                        return reject(err);
                    }
                    console.log(`[DEBUG] Estado de awaitingPaymentResponse para ${formattedTargetNumber} establecido a true (manual).`);
                    resolve();
                });
            });
        } else {
            userDoc = {
                id: formattedTargetNumber,
                awaitingPaymentResponse: true,
                paymentClientName: nombre,
                paymentClientNumber: numeroSinPrefijo
            };
            await new Promise((resolve, reject) => {
                global.db.data.users.insert(userDoc, (err, newDoc) => {
                    if (err) {
                        console.error('Error insertando usuario en DB tras recordatorio manual:', err);
                        return reject(err);
                    }
                    console.log(`[DEBUG] Nuevo usuario ${formattedTargetNumber} insertado con awaitingPaymentResponse a true (manual).`);
                    resolve(newDoc);
                });
            });
        }
        
        // --- Nueva línea de depuración ---
        console.log(`[DEBUG - Manual] Intentando enviar confirmación a m.chat (${m.chat}).`);
        await conn.sendMessage(m.chat, { text: `✅ Recordatorio manual enviado a *${nombre}* (${numeroSinPrefijo}).` }, { quoted: m });
        console.log(`[DEBUG - Manual] Confirmación a m.chat enviada exitosamente.`);

        await conn.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `✅ Recordatorio manual enviado a *${nombre}* (${numeroSinPrefijo}).` });
        console.log(`[DEBUG - Manual] Confirmación a admin_number_confirmation enviada.`);

    } catch (error) {
        console.error('Error al enviar recordatorio manual:', error);
        await conn.sendMessage(m.chat, { text: `❌ Ocurrió un error interno al enviar el recordatorio: ${error.message || error}` }, { quoted: m });
    }
}

// --- Líneas que faltaban y son CRUCIALES para el comando ---
handler.help = ['recordatorio <nombre_cliente>'];
handler.tags = ['pagos'];
handler.command = /^(recordatorio|recordar)$/i;
handler.owner = true;
