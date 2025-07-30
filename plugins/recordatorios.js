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

// Lógica original de envío automático (ahora como una función EXPORTADA POR NOMBRE)
// Esta es la función que debe ser llamada por setInterval en main.js
export async function sendAutomaticPaymentRemindersLogic(client) { // Solo espera 'client' (que será 'conn')
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
            // Si el archivo no existe, lo creamos vacío para evitar errores
            fs.writeFileSync(paymentsFilePath, JSON.stringify({}, null, 2), 'utf8');
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
                await client.sendMessage(formattedNumber, buttonMessage);

                if (global.db && global.db.data && global.db.data.users) {
                    global.db.data.users[formattedNumber] = global.db.data.users[formattedNumber] || {};
                    global.db.data.users[formattedNumber].awaitingPaymentResponse = true;
                    global.db.data.users[formattedNumber].paymentClientName = nombre;
                    global.db.data.users[formattedNumber].paymentClientNumber = numero;
                }

                const confirmationText = `✅ Recordatorio automático enviado a *${nombre}* (${numero}).`;
                await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: confirmationText });

            } catch (sendError) {
                try {
                    await client.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `❌ Falló el recordatorio automático a *${nombre}* (${numero}). Error: ${sendError.message || sendError}` });
                } catch {}
            }

            if (i < clientsToSendReminders.length - 1) {
                await sleep(DELAY_BETWEEN_MESSAGES_MS);
            }
        }

    } catch (error) {
        console.error('Error en sendAutomaticPaymentRemindersLogic:', error);
    }
}


// Este es el handler para el comando del bot (por ejemplo, cuando alguien escribe "!recordatorio")
// Se importa en handler.js
export async function handler(m, { conn, text, command, usedPrefix }) {
    // La lógica de envío automático por temporizador sigue en sendAutomaticPaymentRemindersLogic.
    // Este handler se encarga del comando manual y opcionalmente puede disparar el envío automático.

    let targetInput = text.trim(); // Puede ser un número o una cadena vacía
    let targetNumber = '';
    
    // Si se proporciona un número como argumento
    if (targetInput && !isNaN(targetInput) && targetInput.length > 5) { // Simple check for number-like input
        targetNumber = targetInput;
        if (targetNumber.startsWith('+')) {
            targetNumber = targetNumber.substring(1); // Remover el '+' inicial si está presente
        }
        // Formatear el número de WhatsApp
        if (!targetNumber.includes('@s.whatsapp.net')) {
            targetNumber = targetNumber.replace(/[^0-9]/g, '') + '@s.whatsapp.net'; // Limpiar y añadir sufijo
        }
    } else if (targetInput) {
        // Asume que si no es un número, es un nombre (aunque tu JSON usa números como claves)
        // Para simplificar, y dado que las claves son números, si el input no es numérico,
        // no buscaremos por nombre aquí, o puedes adaptar tu pagos.json para buscar por nombre.
        // Por ahora, si no es un número, se considerará un comando sin argumento específico de número.
        return conn.sendMessage(m.chat, { text: `❌ Para enviar un recordatorio manual a un cliente, por favor, escribe el número de teléfono (ej: ${usedPrefix}${command} +5217771234567) o simplemente usa ${usedPrefix}${command} para enviar a todos los que les toca hoy/mañana.` }, { quoted: m });
    }

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

        if (targetNumber) {
            // Buscar por el número de WhatsApp formateado (la clave en pagos.json es el número puro)
            const pureNumber = targetNumber.split('@')[0];
            if (clientsData[pureNumber]) {
                clientInfo = clientsData[pureNumber];
                phoneNumberKey = pureNumber;
            }
            
            if (!clientInfo) {
                return conn.sendMessage(m.chat, { text: `❌ Cliente con número "${targetInput}" no encontrado en la base de datos de pagos.` }, { quoted: m });
            }
        } else {
            // Si no se proporciona número, se envía recordatorio a *todos* los clientes que les toca hoy/mañana (como en el automático)
            await conn.sendMessage(m.chat, { text: '🔄 Iniciando envío de recordatorios automáticos a todos los clientes que les toca pago hoy o mañana...' }, { quoted: m });
            await sendAutomaticPaymentRemindersLogic(conn); // Llamada a la función de lógica automática
            return conn.sendMessage(m.chat, { text: '✅ Proceso de recordatorios automáticos finalizado.' }, { quoted: m });
        }

        // Si se especificó un cliente y se encontró, enviar recordatorio solo a ese cliente
        const { diaPago, monto, bandera, nombre } = clientInfo;
        const numeroSinPrefijo = phoneNumberKey; // Número puro sin @s.whatsapp.net

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

        const formattedTargetNumber = numeroSinPrefijo + '@s.whatsapp.net';
        await conn.sendMessage(formattedTargetNumber, buttonMessage);

        if (global.db && global.db.data && global.db.data.users) {
            global.db.data.users[formattedTargetNumber] = global.db.data.users[formattedTargetNumber] || {};
            global.db.data.users[formattedTargetNumber].awaitingPaymentResponse = true;
            global.db.data.users[formattedTargetNumber].paymentClientName = nombre;
            global.db.data.users[formattedTargetNumber].paymentClientNumber = numeroSinPrefijo;
        }

        await conn.sendMessage(m.chat, { text: `✅ Recordatorio manual enviado a *${nombre}* (${numeroSinPrefijo}).` }, { quoted: m });
        await conn.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `✅ Recordatorio manual enviado a *${nombre}* (${numeroSinPrefijo}).` });

    } catch (error) {
        console.error('Error al enviar recordatorio manual:', error);
        await conn.sendMessage(m.chat, { text: `❌ Ocurrió un error interno al enviar el recordatorio: ${error.message || error}` }, { quoted: m });
    }
}
