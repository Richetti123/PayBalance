// plugins/cambiarmonto.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const args = text.trim().split(/\s+/);
    if (args.length < 2) {
        return m.reply(`*Uso incorrecto del comando:*\nProporciona el identificador del cliente (nombre o número) y el nuevo monto.\nEjemplo: \`\`\`${usedPrefix}${command} Juan $500\`\`\``);
    }

    const clientIdentifier = args[0]; // Nombre o número
    const newMonto = args.slice(1).join(' '); // El nuevo monto puede contener espacios o símbolos (ej. "$1000", "S/50")

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

        let clientToEdit = clientsData[clientFoundKey];
        const oldMonto = clientToEdit.monto || 'N/A';

        clientToEdit.monto = newMonto; // Actualiza el monto general del cliente

        fs.writeFileSync(paymentsFilePath, JSON.stringify(clientsData, null, 2), 'utf8');
        await m.reply(`✅ Monto de *${clientToEdit.nombre || clientFoundKey}* actualizado:\nDe \`${oldMonto}\` a \`${newMonto}\`.`);

    } catch (e) {
        console.error('Error processing .cambiarmonto command:', e);
        m.reply(`❌ Ocurrió un error interno al intentar cambiar el monto. Por favor, reporta este error.`);
    }
};

handler.help = ['cambiarmonto <nombre/número> <nuevo_monto>'];
handler.tags = ['pagos'];
handler.command = /^(cambiarmonto)$/i;
handler.owner = true;

export default handler;
