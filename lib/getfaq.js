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

        if (userDoc) {
            // Actualizar el estado del usuario a 'active' para activar el asistente virtual
            global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err, numReplaced) => {
                if (err) console.error("Error al actualizar chatState:", err);
            });
        }
        
        const chatGreeting = currentConfigData.chatGreeting || "¡Hola! He recibido tu consulta. Soy Richetti, tu asistente virtual. Para darte la mejor ayuda, ¿podrías darme tu nombre y el motivo de tu consulta? A partir de ahora puedes hacerme cualquier pregunta.";
        
        await m.reply(chatGreeting);
        
        // Log para saber que el asistente virtual ha sido activado
        console.log(chalk.green(`[✅] Asistente virtual activado para el usuario: ${m.sender}`));

    } else {
        await m.reply('❌ Lo siento, esta función solo está disponible en chats privados.');
    }
}
