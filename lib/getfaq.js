import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');
const chatDataPath = path.join(__dirname, '..', 'src', 'chat_data.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return {
        faqs: {},
        chatGreeting: "¡Hola! He recibido tu consulta. Soy Richetti, tu asistente virtual. Para darte la mejor ayuda, ¿podrías darme tu nombre y el motivo de tu consulta? A partir de ahora puedes hacerme cualquier pregunta."
    };
};

const loadChatData = () => {
    if (fs.existsSync(chatDataPath)) {
        return JSON.parse(fs.readFileSync(chatDataPath, 'utf8'));
    }
    return {};
};

const saveChatData = (data) => {
    fs.writeFileSync(chatDataPath, JSON.stringify(data, null, 2), 'utf8');
};

export async function handler(m, { conn, text, command, usedPrefix }) {
    if (!m.isGroup) {
        const currentConfigData = loadConfigBot();
        const chatData = loadChatData();

        if (!chatData[m.sender]) {
            chatData[m.sender] = {};
        }

        const faqs = currentConfigData.faqs || {};

        // Búsqueda de FAQ con coincidencia exacta del texto
        // Esto es más confiable para las respuestas de botones de lista
        const faq = Object.values(faqs).find(item => item.pregunta.toLowerCase() === text.toLowerCase().trim());

        if (faq) {
            let replyText = `*${faq.pregunta}*\n\n${faq.respuesta}`;

            // Guardar la clave de la FAQ en lugar de la pregunta para una búsqueda más precisa
            chatData[m.sender].lastFaqSentKey = Object.keys(faqs).find(key => faqs[key].pregunta.toLowerCase() === text.toLowerCase().trim());
            saveChatData(chatData);

            if (faq.precio) {
                replyText += `\n\n*💰 Precio:* ${faq.precio}`;
            }

            replyText += '\n\nSi estas interesado en adquirir este producto dime el pais donde te encuentras para brindarte el metodo de pago';

            await m.reply(replyText);

            console.log(chalk.green(`[✅] FAQ encontrada y enviada para: "${text}"`));
        } else {
            const chatGreeting = currentConfigData.chatGreeting || "¡Hola! soy CashFlow, un asistente virtual y estoy aqui para atenderte. Por favor indicame tu nombre para brindarte los servicios disponibles.";
            await m.reply(`❌ Lo siento, no pude encontrar información sobre: "${text}".\n\n${chatGreeting}`);
            console.log(chalk.red(`[❌] No se encontró la FAQ: "${text}".`));
        }

    } else {
        await m.reply('❌ Lo siento, esta función solo está disponible en chats privados.');
    }
}
