// plugins/pagosmes.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    let targetMonth, targetYear;
    const now = new Date(); // Usamos la fecha actual del servidor

    if (text && text.includes('/')) {
        const parts = text.split('/');
        targetMonth = parseInt(parts[0], 10);
        targetYear = parseInt(parts[1], 10);
        if (isNaN(targetMonth) || isNaN(targetYear) || targetMonth < 1 || targetMonth > 12 || targetYear < 2000 || targetYear > 2100) {
            return m.reply(`*Uso incorrecto:*\nEl formato debe ser \`\`\`MM/AAAA\`\`\` (ej. \`\`\`${usedPrefix}${command} 07/2025\`\`\`).`);
        }
    } else if (text) {
         return m.reply(`*Uso incorrecto:*\nPara especificar mes y año, el formato debe ser \`\`\`MM/AAAA\`\`\` (ej. \`\`\`${usedPrefix}${command} 07/2025\`\`\`). Si no especificas, se usará el mes y año actuales.`);
    } else {
        targetMonth = now.getMonth() + 1; // getMonth() es 0-indexado
        targetYear = now.getFullYear();
    }

    const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

    try {
        if (!fs.existsSync(paymentsFilePath)) {
            return m.reply('❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.');
        }

        const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));

        let paymentsReport = `📊 *Reporte de Pagos para ${String(targetMonth).padStart(2, '0')}/${targetYear}:*\n\n`;
        let pagosRecibidos = [];
        let pagosPendientes = [];
        let totalRecibido = 0;
        let totalPendiente = 0;
        let clientesConPagosEsperados = 0;

        for (const phoneNumber in clientsData) {
            const client = clientsData[phoneNumber];
            const hasExpectedPaymentForMonth = client.diaPago && client.diaPago <= new Date(targetYear, targetMonth, 0).getDate(); // Verifica si el día de pago es válido para el mes
            
            if (hasExpectedPaymentForMonth) {
                clientesConPagosEsperados++;
                let paymentFoundForMonth = false;
                if (client.pagos && Array.isArray(client.pagos)) {
                    for (const pago of client.pagos) {
                        const paymentDate = new Date(pago.fecha);
                        if (paymentDate.getMonth() + 1 === targetMonth && paymentDate.getFullYear() === targetYear) {
                            paymentFoundForMonth = true;
                            if (pago.confirmado) {
                                pagosRecibidos.push(`✅ ${client.nombre || phoneNumber} (${pago.monto}) - ${pago.fecha}`);
                                // Intentar convertir el monto a número para la suma, ignorando símbolos
                                const numericMonto = parseFloat(String(pago.monto).replace(/[^0-9.]/g, ''));
                                if (!isNaN(numericMonto)) totalRecibido += numericMonto;
                            } else {
                                pagosPendientes.push(`❌ ${client.nombre || phoneNumber} (${pago.monto}) - ${pago.fecha}`);
                                const numericMonto = parseFloat(String(pago.monto).replace(/[^0-9.]/g, ''));
                                if (!isNaN(numericMonto)) totalPendiente += numericMonto;
                            }
                            break; // Ya encontramos el pago para este mes, salimos del bucle de pagos
                        }
                    }
                }
                
                // Si el cliente tiene un día de pago en este mes pero no se encontró un registro de pago específico para este mes
                if (!paymentFoundForMonth) {
                    // Aquí asumimos que el monto esperado es el 'monto' general del cliente, si no hay un pago específico para el mes
                    // Esto puede requerir ajuste si tu lógica de "monto esperado" es más compleja.
                    pagosPendientes.push(`❓ ${client.nombre || phoneNumber} (${client.monto || 'N/A'}) - Se espera pago para el día ${client.diaPago}`);
                     const numericMonto = parseFloat(String(client.monto).replace(/[^0-9.]/g, ''));
                    if (!isNaN(numericMonto)) totalPendiente += numericMonto;
                }
            }
        }

        if (pagosRecibidos.length === 0 && pagosPendientes.length === 0 && clientesConPagosEsperados === 0) {
             paymentsReport += 'No hay clientes registrados con pagos esperados para este mes.';
        } else {
            if (pagosRecibidos.length > 0) {
                paymentsReport += `*Pagos Recibidos (${pagosRecibidos.length}):*\n` + pagosRecibidos.join('\n') + '\n\n';
            } else {
                paymentsReport += '*Pagos Recibidos:* Ninguno.\n\n';
            }

            if (pagosPendientes.length > 0) {
                paymentsReport += `*Pagos Pendientes/No Registrados (${pagosPendientes.length}):*\n` + pagosPendientes.join('\n') + '\n\n';
            } else {
                paymentsReport += '*Pagos Pendientes/No Registrados:* Ninguno.\n\n';
            }
            
            paymentsReport += `*Resumen para ${String(targetMonth).padStart(2, '0')}/${targetYear}:*\n`;
            paymentsReport += `Total Recibido: ${totalRecibido.toFixed(2)}\n`;
            paymentsReport += `Total Pendiente: ${totalPendiente.toFixed(2)}\n`;
        }

        await conn.sendMessage(m.chat, { text: paymentsReport }, { quoted: m });

    } catch (e) {
        console.error('Error processing .pagosmes command:', e);
        m.reply(`❌ Ocurrió un error interno al generar el reporte de pagos del mes. Por favor, reporta este error.`);
    }
};

handler.help = ['pagosmes [MM/AAAA]'];
handler.tags = ['pagos'];
handler.command = /^(pagosmes)$/i;
handler.owner = true;

export default handler;
