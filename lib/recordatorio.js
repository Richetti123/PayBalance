import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_NUMBER_CONFIRMATION = '5217771303481@s.whatsapp.net';
const DELAY_BETWEEN_MESSAGES_MS = 1800000; // 30 minutos
const REMINDER_RECORDS_FILE_PATH = path.join(__dirname, '..', 'src', 'recordatoriosautomaticos.json'); // Nueva constante

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Funciones para cargar y guardar los registros de recordatorios
function loadReminderRecords() {
    if (fs.existsSync(REMINDER_RECORDS_FILE_PATH)) {
        return JSON.parse(fs.readFileSync(REMINDER_RECORDS_FILE_PATH, 'utf8'));
    }
    return {};
}

function saveReminderRecords(records) {
    fs.writeFileSync(REMINDER_RECORDS_FILE_PATH, JSON.stringify(records, null, 2), 'utf8');
}

// Función para obtener la fecha en formato YYYY-MM-DD
function getFormattedDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Lógica de envío automático
export async function sendAutomaticPaymentRemindersLogic(client) {
    const today = new Date();
    const currentDayOfMonth = today.getDate();
    const todayFormatted = getFormattedDate(today); // Fecha formateada de hoy

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const tomorrowDayOfMonth = tomorrow.getDate();
    const tomorrowFormatted = getFormattedDate(tomorrow); // Fecha formateada de mañana

    try {
        const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
        let clientsData = {};
        if (fs.existsSync(paymentsFilePath)) {
            clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        } else {
            fs.writeFileSync(paymentsFilePath, JSON.stringify({}, null, 2), 'utf8');
        }

        let reminderRecords = loadReminderRecords(); // Cargar registros existentes

        const clientsToSendReminders = [];

        for (const phoneNumberKey in clientsData) {
            const clientInfo = clientsData[phoneNumberKey];
            const numero = phoneNumberKey;
            const { diaPago, bandera, nombre, suspendido, pagoRealizado } = clientInfo;

            // --- Lógica actualizada para omitir si el pago ya se realizó o está suspendido ---
            if (suspendido || pagoRealizado) {
                console.log(`[Recordatorios] Omitiendo a ${nombre} (${numero}) porque su cuenta está suspendida o el pago ya fue registrado.`);
                continue;
            }
            // --- Fin de la lógica actualizada ---

            const monto = clientInfo.pagos && clientInfo.pagos.length > 0 ? clientInfo.pagos[0].monto : 'un monto no especificado';

            if (!numero) continue;

            let mainReminderMessage = '';
            let paymentDetails = '';
            let shouldSend = false;
            let reminderDateKey = ''; // Para saber qué fecha se está chequeando

            const MAX_REMINDERS_PER_DAY = 2; // Máximo de 2 recordatorios por día

            if (diaPago === currentDayOfMonth) {
                reminderDateKey = todayFormatted;
                const clientRemindersCount = reminderRecords[phoneNumberKey]?.[reminderDateKey] || 0;
                if (clientRemindersCount >= MAX_REMINDERS_PER_DAY) {
                    await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `⚠️ Atención: Se ha superado el límite diario de ${MAX_REMINDERS_PER_DAY} recordatorios para *${nombre}* (${numero}) para hoy (${reminderDateKey}). No se envió más.` });
                    console.log(`[Recordatorios] Límite alcanzado para ${nombre} (${numero}) hoy. No se envía recordatorio.`);
                    continue; // No enviar si ya se alcanzaron los 2 recordatorios de hoy
                }
                mainReminderMessage = `¡Hola ${nombre}! 👋 Es tu día de pago. Recuerda que tu monto es de ${monto}.`;
                shouldSend = true;
            } else if (diaPago === tomorrowDayOfMonth) {
                reminderDateKey = tomorrowFormatted;
                const clientRemindersCount = reminderRecords[phoneNumberKey]?.[reminderDateKey] || 0;
                if (clientRemindersCount >= MAX_REMINDERS_PER_DAY) {
                    await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `⚠️ Atención: Se ha superado el límite diario de ${MAX_REMINDERS_PER_DAY} recordatorios para *${nombre}* (${numero}) para mañana (${reminderDateKey}). No se envió más.` });
                    console.log(`[Recordatorios] Límite alcanzado para ${nombre} (${numero}) mañana. No se envía recordatorio.`);
                    continue; // No enviar si ya se alcanzaron los 2 recordatorios para mañana
                }
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
                    case '🇺🇸':
                        paymentDetails = `\n\nPara pagar en Estados Unidos, usa:
Nombre: Marcelo Gonzales R.
Correo: jairg6218@gmail.com
Enlace: https://paypal.me/richetti123`;
                        break;
                    default:
                        paymentDetails = `\n\nPara pagar desde cualquier parte del mundo, usa paypal:
Nombre: Marcelo Gonzales R.
Correo: jairg6218@gmail.com
Enlace: https://paypal.me/richetti123`;
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

                clientsToSendReminders.push({ formattedNumber, buttonMessage, nombre, numero, reminderDateKey, phoneNumberKey });
            }
        }

        for (let i = 0; i < clientsToSendReminders.length; i++) {
            const { formattedNumber, buttonMessage, nombre, numero, reminderDateKey, phoneNumberKey } = clientsToSendReminders[i];

            try {
                await client.sendMessage(formattedNumber, buttonMessage);

                let userDoc = await new Promise((resolve, reject) => {
                    global.db.data.users.findOne({ id: formattedNumber }, (err, doc) => {
                        if (err) return reject(err);
                        resolve(doc);
                    });
                });

                if (userDoc) {
                    userDoc.chatState = 'awaitingPaymentResponse';
                    userDoc.paymentClientName = nombre;
                    userDoc.paymentClientNumber = numero;
                    await new Promise((resolve, reject) => {
                        global.db.data.users.update({ id: formattedNumber }, { $set: userDoc }, {}, (err) => {
                            if (err) return reject(err);
                            resolve();
                        });
                    });
                } else {
                    userDoc = {
                        id: formattedNumber,
                        chatState: 'awaitingPaymentResponse',
                        paymentClientName: nombre,
                        paymentClientNumber: numero
                    };
                    await new Promise((resolve, reject) => {
                        global.db.data.users.insert(userDoc, (err, newDoc) => {
                            if (err) return reject(err);
                            resolve(newDoc);
                        });
                    });
                }

                // Actualizar el registro de recordatorios enviados
                reminderRecords[phoneNumberKey] = reminderRecords[phoneNumberKey] || {};
                reminderRecords[phoneNumberKey][reminderDateKey] = (reminderRecords[phoneNumberKey][reminderDateKey] || 0) + 1;
                saveReminderRecords(reminderRecords); // Guardar después de cada envío exitoso

                await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `✅ Recordatorio automático enviado a *${nombre}* (${numero}). (Recordatorios enviados hoy para este cliente: ${reminderRecords[phoneNumberKey][reminderDateKey]})` });

            } catch (sendError) {
                try {
                    await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `❌ Falló el recordatorio automático a *${nombre}* (${numero}). Error: ${sendError.message || sendError}` });
                } catch (adminSendError) {
                    console.error("Error al notificar al administrador sobre el fallo de envío:", adminSendError);
                }
            }

            if (i < clientsToSendReminders.length - 1) {
                await sleep(DELAY_BETWEEN_MESSAGES_MS);
            }
        }
    } catch (error) {
        console.error('Error general en sendAutomaticPaymentRemindersLogic:', error);
        try {
            await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `❌ Error crítico en la lógica de recordatorios automáticos: ${error.message || error}` });
        } catch (adminError) {
            console.error("Error al notificar al administrador sobre el error crítico:", adminError);
        }
    }
}
