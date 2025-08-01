import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');
const chatDataPath = path.join(__dirname, '..', 'src', 'chat_data.json'); // Ruta corregida

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
        
        let userDoc = await new Promise((resolve, reject) => {
            global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
                if (err) reject(err);
                resolve(doc);
            });
        });

        if (!userDoc) {
            userDoc = { id: m.sender, chatState: 'active' };
            await new Promise((resolve, reject) => {
                global.db.data.users.insert(userDoc, (err, newDoc) => {
                    if (err) reject(err);
                    resolve(newDoc);
                });
            });
        } else {
            global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err, numReplaced) => {
                if (err) console.error("Error al actualizar chatState:", err);
            });
        }
        
        const chatData = loadChatData();
        if (!chatData[m.sender]) {
            chatData[m.sender] = {};
        }

        const faqs = currentConfigData.faqs || {};
        const faq = Object.values(faqs).find(item => item.pregunta.toLowerCase().includes(text.toLowerCase().trim())); // Uso de 'includes' para mayor flexibilidad
        
        if (faq) {
            let replyText = `*${faq.pregunta}*\n\n${faq.respuesta}`;

            if (faq.precio) {
                replyText += `\n\n*💰 Precio:* ${faq.precio}`;
            }

            await m.reply(replyText);
            
            // Guardar la última FAQ enviada en el historial de chat
            chatData[m.sender].lastFaqSent = faq.pregunta;
            saveChatData(chatData);

            console.log(chalk.green(`[✅] FAQ encontrada y enviada para: "${text}"`));
        } else {
            const chatGreeting = currentConfigData.chatGreeting || "¡Hola! He recibido tu consulta. Soy Richetti, tu asistente virtual. Para darte la mejor ayuda, ¿podrías darme tu nombre y el motivo de tu consulta? A partir de ahora puedes hacerme cualquier pregunta.";
            
            await m.reply(`❌ Lo siento, no pude encontrar información sobre: "${text}".\n\n${chatGreeting}`);
            console.log(chalk.red(`[❌] No se encontró la FAQ: "${text}".`));
        }
        
    } else {
        await m.reply('❌ Lo siento, esta función solo está disponible en chats privados.');
    }
}
