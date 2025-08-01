import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return {
        faqs: {},
        chatGreeting: "¡Hola! He recibido tu consulta. Soy Richetti, tu asistente virtual. Para darte la mejor ayuda, ¿podrías darme tu nombre y el motivo de tu consulta? A partir de ahora puedes hacerme cualquier pregunta."
    };
};

export async function handler(m, { conn, text, command, usedPrefix }) {
    if (!m.isGroup) {
        const currentConfigData = loadConfigBot();
        
        // Cargar el documento de usuario desde la base de datos
        let userDoc = await new Promise((resolve, reject) => {
            global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
                if (err) reject(err);
                resolve(doc);
            });
        });

        // Asegurarse de que el usuario exista
        if (!userDoc) {
            userDoc = { id: m.sender, chatState: 'active' };
            await new Promise((resolve, reject) => {
                global.db.data.users.insert(userDoc, (err, newDoc) => {
                    if (err) reject(err);
                    resolve(newDoc);
                });
            });
        } else {
            // Actualizar el estado del usuario a 'active'
            global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err, numReplaced) => {
                if (err) console.error("Error al actualizar chatState:", err);
            });
        }

        // Buscar la FAQ en el archivo configbot.json
        const faqs = currentConfigData.faqs || {};
        const faq = Object.values(faqs).find(item => item.pregunta.toLowerCase() === text.toLowerCase().trim());
        
        if (faq) {
            // Si la FAQ existe, enviar la respuesta
            let replyText = `*${faq.pregunta}*\n\n${faq.respuesta}`;

            // Si hay un precio definido, agregarlo a la respuesta
            if (faq.precio) {
                replyText += `\n\n*💰 Precio:* ${faq.precio}`;
            }

            await m.reply(replyText);
            console.log(chalk.green(`[✅] FAQ encontrada y enviada para: "${text}"`));
        } else {
            // Si no se encuentra la FAQ, enviar un mensaje de error y el saludo inicial
            const chatGreeting = currentConfigData.chatGreeting || "¡Hola! He recibido tu consulta. Soy Richetti, tu asistente virtual. Para darte la mejor ayuda, ¿podrías darme tu nombre y el motivo de tu consulta? A partir de ahora puedes hacerme cualquier pregunta.";
            
            await m.reply(`❌ Lo siento, no pude encontrar información sobre: "${text}".\n\n${chatGreeting}`);
            console.log(chalk.red(`[❌] No se encontró la FAQ: "${text}".`));
        }
        
    } else {
        await m.reply('❌ Lo siento, esta función solo está disponible en chats privados.');
    }
}
