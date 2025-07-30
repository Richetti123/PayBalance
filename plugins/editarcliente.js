// plugins/editarcliente.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const args = text.trim().split(/\s+/);
    if (args.length < 3) {
        return m.reply(`*Uso incorrecto del comando:*\nProporciona el identificador del cliente (nombre o número), el campo a editar y el nuevo valor.\nEjemplo: \`\`\`${usedPrefix}${command} Juan diaPago 15\`\`\`\nCampos editables: \`nombre\`, \`diaPago\`, \`monto\`, \`bandera\`.`);
    }

    const clientIdentifier = args[0]; // Nombre o número
    const fieldToEdit = args[1].toLowerCase(); // Campo a editar (ej. "diapago", "nombre", "monto", "bandera")
    const newValue = args.slice(2).join(' '); // El nuevo valor puede contener espacios

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

        // Validar y aplicar la edición
        switch (fieldToEdit) {
            case 'nombre':
                clientToEdit.nombre = newValue;
                break;
            case 'diapago':
                const dia = parseInt(newValue, 10);
                if (isNaN(dia) || dia < 1 || dia > 31) {
                    return m.reply('❌ El día de pago debe ser un número entre 1 y 31.');
                }
                clientToEdit.diaPago = dia;
                break;
            case 'monto':
                // Nota: Si usas la estructura de historial de pagos, 'monto' en la raíz no es tan relevante.
                // Esta edición aplicaría al monto del último pago si lo adaptas, o al monto 'base'.
                // Por ahora, lo actualizamos si existe, pero el historial de pagos es un array.
                // Si quieres que afecte al último pago del historial, la lógica sería más compleja aquí.
                clientToEdit.monto = newValue; 
                break;
            case 'bandera':
                clientToEdit.bandera = newValue;
                break;
            default:
                return m.reply(`❌ Campo \`\`\`${fieldToEdit}\`\`\` no válido para edición. Campos editables: \`nombre\`, \`diaPago\`, \`monto\`, \`bandera\`.`);
        }

        fs.writeFileSync(paymentsFilePath, JSON.stringify(clientsData, null, 2), 'utf8');
        await m.reply(`✅ Cliente *${clientToEdit.nombre || clientFoundKey}* actualizado:\n*${fieldToEdit}* cambiado a \`\`\`${newValue}\`\`\`.`);

    } catch (e) {
        console.error('Error processing .editarcliente command:', e);
        m.reply(`❌ Ocurrió un error interno al intentar editar al cliente. Por favor, reporta este error.`);
    }
};

handler.help = ['editarcliente <nombre/número> <campo> <nuevo_valor>'];
handler.tags = ['pagos'];
handler.command = /^(editarcliente)$/i;
handler.owner = true;

export default handler;
