import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ADMIN_NUMBER_CONFIRMATION = '5217771303481@s.whatsapp.net'; // Asegúrate de que este número es el correcto para notificaciones al admin.

export async function handler(m, { conn, text, command, usedPrefix }) {
    // Expresión regular para el formato: "Nombre Número Monto Bandera"
    const regex = /^(?<name>.+?)\s+(?<number>\+\d+)\s+(?<amount>.+?)\s*(?<flag>[\u{1F1E6}-\u{1F1FF}]+)$/u;
    const match = text.match(regex);

    if (!match) {
        return m.reply(`*Uso incorrecto del comando:*\nPor favor, proporciona el nombre, número, monto y bandera.\nEjemplo: \`\`\`${usedPrefix}${command} Marcelo +5217771303481 S/10 🇵🇪\`\`\`\n\n*Nota:* El número debe empezar con '+'`);
    }

    const { name: clientName, number: clientNumber, amount: monto, flag: bandera } = match.groups;

    let paymentDetails = '';
    // Lógica para obtener detalles de pago según la bandera
    switch (bandera.trim()) {
        case '🇲🇽':
            paymentDetails = `\n\nPara pagar en México, usa:
CLABE: 706969168872764411
Nombre: Gaston Juarez
Banco: Arcus Fi`;
            break;
        case '🇵🇪':
            paymentDetails = `\n\nPara pagar en Perú, usa:
Nombre: Marcelo Gonzales R.
Yape: 967699188
Plin: 955095498`;
            break;
        case '🇨🇱':
            paymentDetails = `\n\nPara pagar en Chile, usa:
Nombre: BARINIA VALESKA ZENTENO MERINO
RUT: 17053067-5
BANCO ELEGIR: TEMPO
Tipo de cuenta: Cuenta Vista
Numero de cuenta: 111117053067
Correo: estraxer2002@gmail.com`;
            break;
        case '🇦🇷':
            paymentDetails = `\n\nPara pagar en Argentina, usa:
Nombre: Gaston Juarez
CBU: 4530000800011127480736`;
            break;
        default:
            paymentDetails = '\n\nPor favor, contacta para coordinar tu pago. No se encontraron métodos de pago específicos para tu país.';
    }

    const messageText = `¡Hola ${clientName.trim()}! 👋 Te recordamos que tienes un pago pendiente de *${monto.trim()}*. Por favor, realiza el pago lo antes posible.${paymentDetails}\n\n*Si ya pagaste, ignora este mensaje o contacta a soporte.*`;

    try {
        const formattedNumber = clientNumber.trim().replace(/\+/g, '') + '@s.whatsapp.net';
        
        // Construye el mensaje con botones
        const buttons = [
            { buttonId: 'pago_realizado_recibo', buttonText: { displayText: 'Ya realicé el pago' }, type: 1 },
            { buttonId: 'necesito_ayuda_recibo', buttonText: { displayText: 'Necesito ayuda' }, type: 1 }
        ];

        const buttonMessage = {
            text: messageText,
            buttons: buttons,
            headerType: 1
        };

        await conn.sendMessage(formattedNumber, buttonMessage);
        
        // Notificar al administrador
        await conn.sendMessage(ADMIN_NUMBER_CONFIRMATION, { text: `✅ Mensaje de cobro manual enviado a *${clientName.trim()}* (${clientNumber.trim()}). Monto: ${monto.trim()} ${bandera.trim()}.` });
        m.reply(`✅ Mensaje de cobro enviado exitosamente a *${clientName.trim()}* (${clientNumber.trim()}).`);

    } catch (e) {
        console.error('Error al enviar recibo manual:', e);
        m.reply(`❌ Ocurrió un error al intentar enviar el mensaje de cobro a *${clientName.trim()}*. Asegúrate de que el número sea válido y esté activo en WhatsApp.`);
    }
}

handler.help = ['recibo <nombre> <numero> <monto> <bandera>'];
handler.tags = ['pagos'];
handler.command = /^(recibo)$/i;
handler.owner = true; // Solo el propietario puede usar este comando
