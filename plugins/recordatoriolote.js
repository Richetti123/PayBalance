// plugins/recordatoriolote.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

    if (!fs.existsSync(paymentsFilePath)) {
        return m.reply('❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.');
    }

    const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));

    if (!text) {
        return m.reply(`*Uso correcto:*\nEnvía recordatorios a clientes.\nEjemplo:\n\`\`\`${usedPrefix}${command} 3\`\`\` (para clientes cuyo pago es en 3 días)\n\`\`\`${usedPrefix}${command} 15\`\`\` (para clientes cuyo día de pago es el 15 de este mes)\n\`\`\`${usedPrefix}${command} -5\`\`\` (para clientes cuyo pago fue hace 5 días y no han confirmado)`);
    }

    const value = parseInt(text.trim(), 10);
    if (isNaN(value)) {
        return m.reply(`*Valor inválido:*\nPor favor, ingresa un número de días (ej. \`3\` o \`-5\`) o un día del mes (ej. \`15\`).`);
    }

    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let clientsToSendReminder = [];
    let reminderType = '';

    if (value > 0 && value <= 31) { // Podría ser un día del mes o días antes
        if (value >= 1 && value <= 31 && value > currentDay) { // Es un día del mes futuro
            reminderType = `próximo a vencer (día ${value})`;
            clientsToSendReminder = Object.keys(clientsData).filter(phoneNumber => {
                const client = clientsData[phoneNumber];
                // Ignorar clientes suspendidos
                if (client.suspendido) return false;

                return client.diaPago === value;
            });
        } else if (value >= 1 && value <= 31 && value <= currentDay) { // Es un día del mes pasado o actual
             reminderType = `del día ${value} (atrasado o pendiente)`;
            clientsToSendReminder = Object.keys(clientsData).filter(phoneNumber => {
                const client = clientsData[phoneNumber];
                // Ignorar clientes suspendidos
                if (client.suspendido) return false;

                if (client.diaPago === value) {
                    // Verificar si ya pagó este mes
                    let pagoConfirmadoEsteMes = false;
                    if (client.pagos && Array.isArray(client.pagos)) {
                        for (const pago of client.pagos) {
                            const paymentDate = new Date(pago.fecha);
                            if (paymentDate.getMonth() + 1 === currentMonth && paymentDate.getFullYear() === currentYear && pago.confirmado) {
                                pagoConfirmadoEsteMes = true;
                                break;
                            }
                        }
                    }
                    return !pagoConfirmadoEsteMes;
                }
                return false;
            });
        }
    } else if (value < 0) { // Días después del vencimiento (atrasados)
        reminderType = `vencidos hace ${Math.abs(value)} días`;
        const targetPastDay = currentDay + value; // value es negativo, ej. 25 + (-5) = 20
        
        if (targetPastDay <= 0) { // Si el día objetivo cae en el mes anterior
             return m.reply('❌ No se pueden enviar recordatorios para días de pago en un mes anterior con esta opción de días negativos.');
        }

        clientsToSendReminder = Object.keys(clientsData).filter(phoneNumber => {
            const client = clientsData[phoneNumber];
            // Ignorar clientes suspendidos
            if (client.suspendido) return false;

            if (client.diaPago === targetPastDay) {
                // Verificar si ya pagó este mes
                let pagoConfirmadoEsteMes = false;
                if (client.pagos && Array.isArray(client.pagos)) {
                    for (const pago of client.pagos) {
                        const paymentDate = new Date(pago.fecha);
                        if (paymentDate.getMonth() + 1 === currentMonth && paymentDate.getFullYear() === currentYear && pago.confirmado) {
                            pagoConfirmadoEsteMes = true;
                            break;
                        }
                    }
                }
                return !pagoConfirmadoEsteMes;
            }
            return false;
        });
    } else if (value > 0) { // Días antes del vencimiento
        reminderType = `por vencer en ${value} días`;
        const targetFutureDay = currentDay + value;
        
        clientsToSendReminder = Object.keys(clientsData).filter(phoneNumber => {
            const client = clientsData[phoneNumber];
            // Ignorar clientes suspendidos
            if (client.suspendido) return false;

            if (client.diaPago === targetFutureDay) {
                // Verificar si ya pagó este mes
                let pagoConfirmadoEsteMes = false;
                if (client.pagos && Array.isArray(client.pagos)) {
                    for (const pago of client.pagos) {
                        const paymentDate = new Date(pago.fecha);
                        if (paymentDate.getMonth() + 1 === currentMonth && paymentDate.getFullYear() === currentYear && pago.confirmado) {
                            pagoConfirmadoEsteMes = true;
                            break;
                        }
                    }
                }
                return !pagoConfirmadoEsteMes;
            }
            return false;
        });
    }


    if (clientsToSendReminder.length === 0) {
        return m.reply(`✅ No se encontraron clientes ${reminderType} para enviar recordatorio o todos ya pagaron.`);
    }

    let sentCount = 0;
    let failedCount = 0;
    let reminderMessages = [];

    for (const phoneNumber of clientsToSendReminder) {
        const client = clientsData[phoneNumber];
        const monto = client.monto || 'tu monto habitual';
        const nombre = client.nombre || 'estimado cliente';
        
        // Mensaje de recordatorio general (puedes personalizarlo más si lo deseas)
        const reminderMsg = `¡Hola ${nombre}!\n\nEste es un recordatorio amable de tu pago de ${monto} que vence el día ${client.diaPago} de este mes.\n\nPor favor, realiza tu pago lo antes posible para evitar interrupciones en el servicio. Si ya pagaste, ignora este mensaje.\n\n¡Gracias por tu preferencia!`;

        try {
            await conn.sendMessage(phoneNumber + '@s.whatsapp.net', { text: reminderMsg });
            reminderMessages.push(`✅ Enviado a: ${client.nombre || phoneNumber}`);
            sentCount++;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Pequeña pausa para evitar bloqueos
        } catch (e) {
            console.error(`Error enviando recordatorio a ${phoneNumber}:`, e);
            reminderMessages.push(`❌ Falló envío a: ${client.nombre || phoneNumber} (Error: ${e.message || 'Desconocido'})`);
            failedCount++;
        }
    }

    let finalMessage = `*Recordatorios Enviados para clientes ${reminderType}:*\n\n`;
    finalMessage += reminderMessages.join('\n');
    finalMessage += `\n\n*Resumen:*\nEnviados exitosamente: ${sentCount}\nFallidos: ${failedCount}`;

    await m.reply(finalMessage);
};

handler.help = ['recordatoriolote <dias>'];
handler.tags = ['pagos'];
handler.command = /^(recordatoriolote)$/i;
handler.owner = true;

export default handler;
