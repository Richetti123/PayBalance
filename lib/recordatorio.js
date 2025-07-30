import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_NUMBER_CONFIRMATION = '5217771303481@s.whatsapp.net';
const DELAY_BETWEEN_MESSAGES_MS = 1800000; // 30 minutos

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Lógica de envío automático (exportada para ser usada por main.js)
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
            const numero = phoneNumberKey;
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
                await client.sendMessage(formattedNumber, buttonMessage);

                let userDoc = await new Promise((resolve, reject) => {
                    global.db.data.users.findOne({ id: formattedNumber }, (err, doc) => {
                        if (err) return reject(err);
                        resolve(doc);
                    });
                });

                if (userDoc) {
                    userDoc.awaitingPaymentResponse = true;
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
                        awaitingPaymentResponse: true,
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

                await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `✅ Recordatorio automático enviado a *${nombre}* (${numero}).` });

            } catch (sendError) {
                try {
                    await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `❌ Falló el recordatorio automático a *${nombre}* (${numero}). Error: ${sendError.message || sendError}` });
                } catch (adminSendError) {
                    // Ignorar errores al enviar al admin si ya estamos en un bloque de error
                }
            }

            if (i < clientsToSendReminders.length - 1) {
                await sleep(DELAY_BETWEEN_MESSAGES_MS);
            }
        }

    } catch (error) {
        // console.error('Error general en sendAutomaticPaymentRemindersLogic:', error); // Este se mantiene si quieres ver errores generales, si no, se puede comentar.
    }
}
