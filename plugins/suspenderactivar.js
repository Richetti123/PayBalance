import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

// Función para cargar los datos de pagos
const loadPaymentsData = () => {
    if (fs.existsSync(paymentsFilePath)) {
        return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    }
    return {};
};

// Función para guardar los datos de pagos
const savePaymentsData = (data) => {
    fs.writeFileSync(paymentsFilePath, JSON.stringify(data, null, 2), 'utf8');
};

let handler = async (m, { conn, text, command, usedPrefix, isOwner }) => {
    if (!isOwner) {
        return m.reply(`❌ Solo el propietario puede usar este comando.`);
    }

    if (!text) {
        return m.reply(`*Uso correcto:*\n${usedPrefix}${command} [número_cliente]\n*O*\n${usedPrefix}${command} [nombre_cliente]\n\nEjemplos:\n${usedPrefix}${command} 5217771234567\n${usedPrefix}${command} Juan Perez\n\n*¡ADVERTENCIA!* Si usas el nombre y hay duplicados, solo se afectará el *primer* cliente encontrado.`);
    }

    const identifier = text.trim();
    const paymentsData = loadPaymentsData();

    let clientToToggle = null;
    let clientJidToToggle = null;

    // 1. Intentar encontrar por número (es el método más preciso)
    // Limpia y normaliza el número (ej. quita espacios, el '+' inicial si existe)
    let potentialNumber = identifier.replace(/[^0-9]/g, ''); 
    if (potentialNumber.length === 10 && !potentialNumber.startsWith('52')) { // Asume que números de 10 dígitos son MX sin 521
        potentialNumber = '521' + potentialNumber;
    } else if (potentialNumber.length === 11 && !potentialNumber.startsWith('52')) { // Si es de 11 digitos y no empieza con 52, asume que es un 521 ya pegado o similar
        // Esto es una suposición, si tus números de 11 dígitos tienen otro prefijo, ajusta.
        if (potentialNumber.startsWith('1')) { // Por ejemplo, números de EUA/Canadá
            potentialNumber = '1' + potentialNumber;
        }
    }
    
    if (potentialNumber.match(/^\d{10,15}$/)) { // Validación básica de longitud numérica
        const jidFromNumber = `${potentialNumber}@s.whatsapp.net`;
        if (paymentsData[jidFromNumber]) {
            clientToToggle = paymentsData[jidFromNumber];
            clientJidToToggle = jidFromNumber;
        }
    }

    // 2. Si no se encontró por número, intentar por nombre
    if (!clientToToggle) {
        const nameLower = identifier.toLowerCase();
        for (const jid in paymentsData) {
            if (paymentsData[jid].nombre.toLowerCase() === nameLower) {
                clientToToggle = paymentsData[jid];
                clientJidToToggle = jid;
                break; // Afectar solo al primer cliente con ese nombre
            }
        }
    }

    if (!clientToToggle) {
        return m.reply(`❌ No se encontró ningún cliente con el identificador "${identifier}".`);
    }

    const clientName = clientToToggle.nombre;
    const clientNumber = clientJidToToggle.replace('@s.whatsapp.net', '');

    if (command.toLowerCase() === 'suspendercliente') {
        if (clientToToggle.suspendido) {
            return m.reply(`❗ El cliente *${clientName}* (${clientNumber}) ya está suspendido.`);
        }
        clientToToggle.suspendido = true;
        savePaymentsData(paymentsData);
        await m.reply(`⏸️ Cliente *${clientName}* (${clientNumber}) suspendido correctamente.`);
    } else if (command.toLowerCase() === 'activarcliente') {
        if (!clientToToggle.suspendido) {
            return m.reply(`❗ El cliente *${clientName}* (${clientNumber}) ya está activo.`);
        }
        clientToToggle.suspendido = false;
        savePaymentsData(paymentsData);
        await m.reply(`▶️ Cliente *${clientName}* (${clientNumber}) activado correctamente.`);
    }
};

handler.help = ['suspendercliente <num_o_nombre>', 'activarcliente <num_o_nombre>'];
handler.tags = ['owner'];
handler.command = /^(suspendercliente|activarcliente)$/i;
handler.owner = true;

export { handler };
