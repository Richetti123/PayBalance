// plugins/vercliente.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
    
    const clientIdentifier = text.trim(); // Puede ser nombre o número
    if (!clientIdentifier) {
        return m.reply(`*Uso incorrecto del comando:*\nPor favor, proporciona el nombre o número de WhatsApp del cliente.\nEjemplo: \`\`\`${usedPrefix}${command} Juan\`\`\` o \`\`\`${usedPrefix}${command} 5217771234567\`\`\``);
    }

    const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

    try {
        if (!fs.existsSync(paymentsFilePath)) {
            return m.reply('❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.');
        }

        const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        let clientFound = false;
        let foundClientInfo = null;
        let foundPhoneNumberKey = null;

        // Intentar buscar por número (quitando espacios y posibles '+' iniciales)
        let cleanedIdentifier = clientIdentifier.replace(/\s+/g, '').replace(/^\+/, ''); 
        for (const phoneNumberKey in clientsData) {
            // Limpiar la clave del número de teléfono para la comparación
            const cleanedPhoneNumberKey = phoneNumberKey.replace(/\s+/g, '').replace(/^\+/, '');
            if (cleanedPhoneNumberKey === cleanedIdentifier) {
                clientFound = true;
                foundClientInfo = clientsData[phoneNumberKey];
                foundPhoneNumberKey = phoneNumberKey;
                break;
            }
        }

        // Si no se encontró por número, intentar buscar por nombre
        if (!clientFound) {
            for (const phoneNumberKey in clientsData) {
                const clientInfo = clientsData[phoneNumberKey];
                if (clientInfo.nombre && clientInfo.nombre.toLowerCase() === clientIdentifier.toLowerCase()) {
                    clientFound = true;
                    foundClientInfo = clientInfo;
                    foundPhoneNumberKey = phoneNumberKey;
                    break;
                }
            }
        }

        if (clientFound && foundClientInfo && foundPhoneNumberKey) {
            let message = `*👤 Detalles del Cliente:*\n\n`;
            message += `*📝 Nombre:* ${foundClientInfo.nombre || 'N/A'}\n`;
            message += `*📞 Número:* +${foundPhoneNumberKey}\n`;
            message += `*🗓️ Día de Pago:* ${foundClientInfo.diaPago || 'N/A'}\n`;
            message += `*💰 Monto Actual:* ${foundClientInfo.monto || 'N/A'} (considera que esto es el último monto registrado, no el mensual si se usa historial)\n`; // Nota sobre monto
            message += `*🌎 Bandera/País:* ${foundClientInfo.bandera || 'N/A'}\n`;

            // Historial de pagos (si la estructura de pagos.json se actualiza con un array 'pagos')
            if (foundClientInfo.pagos && Array.isArray(foundClientInfo.pagos) && foundClientInfo.pagos.length > 0) {
                message += `\n*🧾 Historial de Pagos (${foundClientInfo.pagos.length} registros):*\n`;
                // Mostrar solo los últimos 5 pagos para no saturar
                const pagosToShow = foundClientInfo.pagos.slice(-5).reverse(); // Últimos 5, el más reciente primero
                pagosToShow.forEach((pago, index) => {
                    message += `  - *${pagosToShow.length - index}.* Monto: ${pago.monto}, Fecha: ${pago.fecha || 'N/A'}, Confirmado: ${pago.confirmado ? '✅ Sí' : '❌ No'}\n`;
                });
                if (foundClientInfo.pagos.length > 5) {
                    message += `  _(Mostrando los últimos 5 pagos. Usa ".historialpagos" para ver más.)_\n`;
                }
            } else {
                message += `\n*🧾 Historial de Pagos:* No hay registros de pagos.\n`;
            }

            await conn.sendMessage(m.chat, { text: message }, { quoted: m });
        } else {
            await m.reply(`❌ No se encontró ningún cliente con el identificador \`\`\`${clientIdentifier}\`\`\` en la base de datos.`);
        }

    } catch (e) {
        console.error('Error processing .vercliente command:', e);
        m.reply(`❌ Ocurrió un error interno al intentar ver los detalles del cliente. Por favor, reporta este error.`);
    }
};

handler.help = ['vercliente <nombre/número>'];
handler.tags = ['pagos'];
handler.command = /^(vercliente)$/i;
handler.owner = true;

export default handler;
