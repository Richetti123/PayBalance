import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return {
        faqs: {}
    };
};

const saveChatData = (data) => {
    const chatDataPath = path.join(__dirname, '..', 'src', 'chat_data.json');
    fs.writeFileSync(chatDataPath, JSON.stringify(data, null, 2), 'utf8');
};

const loadChatData = () => {
    const chatDataPath = path.join(__dirname, '..', 'src', 'chat_data.json');
    if (fs.existsSync(chatDataPath)) {
        return JSON.parse(fs.readFileSync(chatDataPath, 'utf8'));
    }
    return {};
};

export async function handler(m, { conn, text, command, usedPrefix }) {
    if (m.key.remoteJid.endsWith('@g.us')) return false;

    const currentConfigData = loadConfigBot();
    const faqs = currentConfigData.faqs || {};
    const chatData = loadChatData();
    const userChatData = chatData[m.sender] || {};
    const messageTextLower = text.toLowerCase().trim();

    for (const key in faqs) {
        if (Object.prototype.hasOwnProperty.call(faqs, key)) {
            const faq = faqs[key];
            const keywords = faq.keywords || [faq.pregunta];

            if (keywords.some(keyword => messageTextLower.includes(keyword.toLowerCase()))) {
                userChatData.lastFaqSentKey = key;
                chatData[m.sender] = userChatData;
                saveChatData(chatData);

                const sections = [{
                    title: 'Opciones Adicionales',
                    rows: [
                        { title: '💰 Precio', rowId: `${usedPrefix}precio-${faq.pregunta}`, description: 'Consulta el precio de este servicio.' },
                        { title: 'ℹ️ Más Información', rowId: `${usedPrefix}info-${faq.pregunta}`, description: 'Obtén más detalles sobre el servicio.' }
                    ]
                }];

                const listMessage = {
                    text: `✅ *${faq.pregunta}*\n\n${faq.respuesta}\n\nSelecciona una opción para continuar:`,
                    footer: 'Toca el botón para ver más información.',
                    title: '📚 *Servicios*',
                    buttonText: 'Ver Opciones',
                    sections
                };
                await conn.sendMessage(m.chat, listMessage, { quoted: m });
                return true;
            }
        }
    }
    
    //console.log(`[❌] No se encontró la FAQ: "${text}"`);
    return false;
}
