// plugins/pagosatrasados.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const now = new Date();
    const currentDay = now.getDate();
    const currentMonth = now.getMonth() + 1; // Mes actual (1-12)
    const currentYear = now.getFullYear();

    const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

    try {
        if (!fs.existsSync(paymentsFilePath)) {
            return m.reply('❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.');
        }

        const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        let atrasados = [];

        for (const phoneNumber in clientsData) {
            const client = clientsData[phoneNumber];
            const diaPago = client.diaPago;

            // Solo si el día de pago del cliente es igual o anterior al día actual del mes
            if (diaPago && diaPago <= currentDay) {
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

                if (!pagoConfirmadoEsteMes) {
                    atrasados.push(`*👤 ${client.nombre || phoneNumber}:* Día ${diaPago} - Monto: ${client.monto || 'N/A'}`);
                }
            }
        }

        let message = `🚨 *Clientes con Pagos Atrasados para ${String(currentMonth).padStart(2, '0')}/${currentYear}:*\n\n`;
        if (atrasados.length > 0) {
            message += atrasados.join('\n');
            message += `\n\n_Total de clientes atrasados: ${atrasados.length}_`;
        } else {
            message += '🎉 ¡Todos los pagos esperados hasta hoy están al día!';
        }

        await conn.sendMessage(m.chat, { text: message }, { quoted: m });

    } catch (e) {
        console.error('Error processing .pagosatrasados command:', e);
        m.reply(`❌ Ocurrió un error interno al verificar los pagos atrasados. Por favor, reporta este error.`);
    }
};

handler.help = ['pagosatrasados'];
handler.tags = ['pagos'];
handler.command = /^(pagosatrasados)$/i;
handler.owner = true;

export { handler };
