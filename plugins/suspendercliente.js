// plugins/suspendercliente.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const clientIdentifier = text.trim();
    if (!clientIdentifier) {
        return m.reply(`*Uso incorrecto:*\nPor favor, proporciona el nombre o número de WhatsApp del cliente a suspender.\nEjemplo: \`\`\`${usedPrefix}${command} Juan\`\`\` o \`\`\`${usedPrefix}${command} 5217771234567\`\`\``);
    }

    const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

    try {
        if (!fs.existsSync(paymentsFilePath)) {
            return m.reply('❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.');
        }

        let clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        let clientFoundKey = null;

        // Buscar al cliente por número
        let cleanedIdentifier = clientIdentifier.replace(/\s+/g, '').replace(/^\+/, ''); 
        for (const phoneNumberKey in clientsData) {
            const cleanedPhoneNumberKey = phoneNumberKey.replace(/\s+/g, '').replace(/^\+/, '');
            if (cleanedPhoneNumberKey === cleanedIdentifier) {
                clientFoundKey = phoneNumberKey;
                break;
            }
        }

        // Si no se encontró por número, buscar por nombre
        if (!clientFoundKey) {
            for (const phoneNumberKey in clientsData) {
                if (clientsData[phoneNumberKey].nombre && clientsData[phoneNumberKey].nombre.toLowerCase() === clientIdentifier.toLowerCase()) {
                    clientFoundKey = phoneNumberKey;
                    break;
                }
            }
        }

        if (!clientFoundKey) {
            return m.reply(`❌ No se encontró ningún cliente con el identificador \`\`\`${clientIdentifier}\`\`\`.`);
        }

        clientsData[clientFoundKey].suspendido = true; // Marcar como suspendido

        fs.writeFileSync(paymentsFilePath, JSON.stringify(clientsData, null, 2), 'utf8');
        await m.reply(`✅ Cliente *${clientsData[clientFoundKey].nombre || clientFoundKey}* ha sido *suspendido*.\nNo recibirá recordatorios ni interacciones proactivas del bot.`);

    } catch (e) {
        console.error('Error processing .suspendercliente command:', e);
        m.reply(`❌ Ocurrió un error interno al intentar suspender al cliente. Por favor, reporta este error.`);
    }
};

handler.help = ['suspendercliente <nombre/número>'];
handler.tags = ['pagos'];
handler.command = /^(suspendercliente)$/i;
handler.owner = true;

export default handler;
