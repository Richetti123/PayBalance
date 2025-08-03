import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

const loadPayments = () => {
    if (fs.existsSync(paymentsFilePath)) {
        return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    }
    return {};
};

const savePayments = (data) => {
    fs.writeFileSync(paymentsFilePath, JSON.stringify(data, null, 2), 'utf8');
};

export async function handler(m, { conn, text, usedPrefix, command }) {
    if (!m.isOwner) {
        return m.reply('❌ Solo el propietario del bot puede usar este comando.');
    }
    
    const clientNameOrNumber = text.trim();
    if (!clientNameOrNumber) {
        return m.reply(`❌ Debes especificar el nombre o número del cliente. Uso correcto: \`${usedPrefix + command} nombre_cliente\` o \`${usedPrefix + command} +521... \``);
    }
    
    try {
        const clientsData = loadPayments();
        let clientKey = null;

        // Buscar cliente por nombre o número de teléfono
        for (const key in clientsData) {
            const client = clientsData[key];
            if (client.nombre.toLowerCase() === clientNameOrNumber.toLowerCase() || key === clientNameOrNumber) {
                clientKey = key;
                break;
            }
        }
        
        if (!clientKey) {
            return m.reply(`❌ Cliente "${clientNameOrNumber}" no encontrado en la base de datos.`);
        }
        
        const client = clientsData[clientKey];

        // Se marca el pago como realizado y se actualiza el archivo
        client.pagoRealizado = true;
        savePayments(clientsData);

        const responseMessage = `✅ Se ha marcado el pago de *${client.nombre}* como realizado. Los recordatorios automáticos se detendrán para este cliente.`;
        await m.reply(responseMessage);

        const clientJid = `${clientKey.replace('+', '')}@s.whatsapp.net`;
        await conn.sendMessage(clientJid, { text: `✅ ¡Hola ${client.nombre}! Tu pago ha sido registrado. Gracias por tu compra.` });
        
    } catch (error) {
        console.error('Error en el comando subircomprobante:', error);
        return m.reply(`❌ Ocurrió un error al procesar el comprobante: ${error.message}`);
    }
}

handler.help = ['subircomprobante <nombre_o_numero>'];
handler.tags = ['pagos'];
handler.command = ['subircomprobante'];
