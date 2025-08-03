import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendAutomaticPaymentRemindersLogic } from './lib/recordatorio.js';

const ADMIN_NUMBER_CONFIRMATION = '5217771303481@s.whatsapp.net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Este es el handler para el comando del bot (por ejemplo, cuando alguien escribe ".recordatorio Marcelo")
export async function handler(m, { conn, text, command, usedPrefix }) {
    const clientNameInput = text.trim();

    try {
        const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
        let clientsData = {};
        if (fs.existsSync(paymentsFilePath)) {
            clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        } else {
            return conn.sendMessage(m.chat, { text: '❌ El archivo `pagos.json` no se encontró.' }, { quoted: m });
        }

        let clientInfo = null;
        let phoneNumberKey = null;

        if (clientNameInput) {
            for (const key in clientsData) {
                if (clientsData[key].nombre && clientsData[key].nombre.toLowerCase() === clientNameInput.toLowerCase()) {
                    clientInfo = clientsData[key];
                    phoneNumberKey = key;
                    break;
                }
            }

            if (!clientInfo) {
                return conn.sendMessage(m.chat, { text: `❌ Cliente con nombre "${clientNameInput}" no encontrado en la base de datos de pagos.` }, { quoted: m });
            }
        } else {
            // Se llama a la lógica de recordatorios automáticos desde el otro archivo
            await conn.sendMessage(m.chat, { text: '🔄 Iniciando envío de recordatorios automáticos a todos los clientes que les toca pago hoy o mañana...' }, { quoted: m });
            await sendAutomaticPaymentRemindersLogic(conn);
            return conn.sendMessage(m.chat, { text: '✅ Proceso de recordatorios automáticos finalizado.' }, { quoted: m });
        }
        
        // --- CORRECCIÓN EN LA LECTURA DEL MONTO ---
        const { bandera, nombre, suspendido } = clientInfo;
        const monto = clientInfo.pagos && clientInfo.pagos.length > 0 ? clientInfo.pagos[0].monto : 'un monto no especificado';
        // --- FIN DE LA CORRECCIÓN ---

        if (suspendido) {
            return conn.sendMessage(m.chat, { text: `❌ No se puede enviar un recordatorio a *${nombre}* porque su cuenta está suspendida.` }, { quoted: m });
        }

        const numeroSinPrefijo = phoneNumberKey.replace(/\+/g, '');
        const formattedTargetNumber = numeroSinPrefijo + '@s.whatsapp.net';

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

        const buttons = [
            { buttonId: '1', buttonText: { displayText: 'He realizado el pago' }, type: 1 },
            { buttonId: '2', buttonText: { displayText: 'Necesito ayuda con mi pago' }, type: 1 }
        ];

        const buttonMessage = {
            text: mainReminderMessage + paymentDetails + '\n\n*Escoge una de las opciones:*',
            buttons: buttons,
            headerType: 1
        };

        await conn.sendMessage(formattedTargetNumber, buttonMessage);

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
                    if (err) return reject(err);
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
                    if (err) return reject(err);
                    resolve(newDoc);
                });
            });
        }
        await conn.sendMessage(m.chat, { text: `✅ Recordatorio manual enviado a *${nombre}* (+${numeroSinPrefijo}).` }, { quoted: m });
        await conn.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `✅ Recordatorio manual enviado a *${nombre}* (+${numeroSinPrefijo}).` });
    } catch (error) {
        await conn.sendMessage(m.chat, { text: `❌ Ocurrió un error interno al enviar el recordatorio: ${error.message || error}` }, { quoted: m });
    }
}

handler.help = ['recordatorio <nombre_cliente>'];
handler.tags = ['pagos'];
handler.command = /^(recordatorio|recordar)$/i;
handler.owner = true;
