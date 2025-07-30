// plugins/estadobot.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

let handler = async (m, { conn, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    try {
        let clientsData = {};
        if (fs.existsSync(paymentsFilePath)) {
            clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        }

        let configData = {};
        if (fs.existsSync(configBotPath)) {
            configData = JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
        }

        const totalClients = Object.keys(clientsData).length;
        let suspendedClients = 0;
        let activeClients = 0;
        let paymentsThisMonth = 0; // Pagos confirmados este mes
        let pendingPaymentsThisMonth = 0; // Pagos no confirmados este mes
        let overdueClients = 0; // Clientes con pagos atrasados

        const now = new Date();
        const currentDay = now.getDate();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();

        for (const phoneNumber in clientsData) {
            const client = clientsData[phoneNumber];

            if (client.suspendido) {
                suspendedClients++;
            } else {
                activeClients++;
            }

            // Calcular pagos de este mes y atrasados
            let pagoConfirmadoEsteMes = false;
            let pagoPendienteEsteMes = false;

            if (client.pagos && Array.isArray(client.pagos)) {
                for (const pago of client.pagos) {
                    const paymentDate = new Date(pago.fecha);
                    if (paymentDate.getMonth() + 1 === currentMonth && paymentDate.getFullYear() === currentYear) {
                        if (pago.confirmado) {
                            paymentsThisMonth++;
                            pagoConfirmadoEsteMes = true;
                        } else {
                            pendingPaymentsThisMonth++;
                            pagoPendienteEsteMes = true;
                        }
                    }
                }
            }

            // Lógica para pagos atrasados (similar a .pagosatrasados)
            if (client.diaPago && client.diaPago <= currentDay && !pagoConfirmadoEsteMes && !client.suspendido) {
                // Si el día de pago ya pasó y no hay un pago confirmado para este mes
                // Y el cliente no está suspendido
                overdueClients++;
            }
        }

        const modoPagoStatus = configData.modoPagoActivo ? '🟢 ACTIVADO' : '🔴 DESACTIVADO';
        const totalFAQs = configData.faqs ? Object.keys(configData.faqs).length : 0;

        let message = `📊 *Estado Actual del Bot*\n\n`;
        message += `*👥 Clientes Registrados:* ${totalClients}\n`;
        message += `  - Activos: ${activeClients}\n`;
        message += `  - Suspendidos: ${suspendedClients}\n\n`;
        message += `*💰 Pagos este Mes (${String(currentMonth).padStart(2, '0')}/${currentYear}):*\n`;
        message += `  - Confirmados: ${paymentsThisMonth}\n`;
        message += `  - Pendientes/No registrados (esperados): ${pendingPaymentsThisMonth}\n`;
        message += `  - Atrasados (esperados y no confirmados hasta hoy): ${overdueClients}\n\n`;
        message += `*⚙️ Configuración del Bot:*\n`;
        message += `  - Modo Pago: ${modoPagoStatus}\n`;
        message += `  - FAQs Configuradas: ${totalFAQs}\n`;
        message += `  - Mensaje de Bienvenida: ${configData.mensajeBienvenida ? 'Configurado' : 'No configurado'}\n`;
        message += `  - Mensaje de Despedida: ${configData.mensajeDespedida ? 'Configurado' : 'No configurado'}\n\n`;
        message += `_Última actualización: ${now.toLocaleString()}_`;

        await conn.sendMessage(m.chat, { text: message }, { quoted: m });

    } catch (e) {
        console.error('Error processing .estadobot command:', e);
        m.reply(`❌ Ocurrió un error interno al obtener el estado del bot. Por favor, reporta este error.`);
    }
};

handler.help = ['estadobot'];
handler.tags = ['info', 'config'];
handler.command = /^(estadobot)$/i;
handler.owner = true;

export default handler;
