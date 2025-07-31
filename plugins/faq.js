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
    return { faqs: {} };
};

export async function handler(m, { conn, text }) {
    const configBot = loadConfigBot();
    const faqs = configBot.faqs || {};

    if (!text) {
        return m.reply("Por favor, especifica el nombre de un servicio para obtener más detalles.");
    }

    const faqKey = Object.keys(faqs).find(key => key.toLowerCase() === text.toLowerCase());

    if (faqKey) {
        const faq = faqs[faqKey];
        const faqResponse = faq.respuesta;
        const faqPrice = faq.precio;

        // Responder con la descripción del servicio
        await conn.sendMessage(m.chat, { text: faqResponse }, { quoted: m });

        // Responder con el precio en un mensaje separado
        if (faqPrice) {
            await conn.sendMessage(m.chat, { text: faqPrice }, { quoted: m });
        }
    } else {
        await m.reply("❌ Lo siento, no encontré información sobre ese servicio.");
    }
}
