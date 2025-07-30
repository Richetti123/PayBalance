// plugins/historialpagos.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
    
    const clientIdentifier = text.trim(); // Puede ser nombre o número
    if (!clientIdentifier) {
        return m.reply(`*Uso incorrecto del comando:*\nPor favor, proporciona el nombre o número de WhatsApp del cliente para ver su historial.\nEjemplo: \`\`\`${usedPrefix}${command} Juan\`\`\` o \`\`\`${usedPrefix}${command} 5217771234567\`\`\``);
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
            if (foundClientInfo.pagos && Array.isArray(foundClientInfo.pagos) && foundClientInfo.pagos.length > 0) {
                let message = `*🧾 Historial de Pagos de ${foundClientInfo.nombre || foundPhoneNumberKey}:*\n\n`;
                // Mostrar los pagos del más reciente al más antiguo
                const sortedPayments = [...foundClientInfo.pagos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

                sortedPayments.forEach((pago, index) => {
                    message += `*Pago #${sortedPayments.length - index}*\n`;
                    message += `  Monto: ${pago.monto || 'N/A'}\n`;
                    message += `  Fecha: ${pago.fecha || 'N/A'}\n`;
                    message += `  Confirmado: ${pago.confirmado ? '✅ Sí' : '❌ No'}\n`;
                    if (pago.idComprobante) {
                        message += `  ID Comprobante: ${pago.idComprobante}\n`;
                    }
                    message += `----------------------------\n`;
                });
                await conn.sendMessage(m.chat, { text: message }, { quoted: m });
            } else {
                await m.reply(`❌ El cliente *${foundClientInfo.nombre || foundPhoneNumberKey}* no tiene registros de pagos en su historial.`);
            }
        } else {
            await m.reply(`❌ No se encontró ningún cliente con el identificador \`\`\`${clientIdentifier}\`\`\` en la base de datos.`);
        }

    } catch (e) {
        console.error('Error processing .historialpagos command:', e);
        m.reply(`❌ Ocurrió un error interno al intentar ver el historial de pagos. Por favor, reporta este error.`);
    }
};

handler.help = ['historialpagos <nombre/número>'];
handler.tags = ['pagos'];
handler.command = /^(historialpagos)$/i;
handler.owner = true;

export default handler;
