// plugins/bienvenida.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const newWelcomeMessage = text.trim();

    if (!newWelcomeMessage) {
        return m.reply(`*Uso incorrecto:*\nProporciona el mensaje de bienvenida que el bot enviará a nuevos usuarios.\nEjemplo: \`\`\`${usedPrefix}${command} ¡Bienvenido a nuestro servicio! Contáctanos si tienes alguna duda.\`\`\`\n\nVariables disponibles: \`\`\`{user}\`\`\` (nombre del usuario), \`\`\`{bot}\`\`\` (nombre del bot).`);
    }

    try {
        let configData = {};
        if (fs.existsSync(configBotPath)) {
            configData = JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
        }

        configData.mensajeBienvenida = newWelcomeMessage;

        fs.writeFileSync(configBotPath, JSON.stringify(configData, null, 2), 'utf8');
        await m.reply(`✅ Mensaje de bienvenida actualizado exitosamente:\n\n\`\`\`${newWelcomeMessage}\`\`\``);

    } catch (e) {
        console.error('Error processing .bienvenida command:', e);
        m.reply(`❌ Ocurrió un error interno al actualizar el mensaje de bienvenida. Por favor, reporta este error.`);
    }
};

handler.help = ['bienvenida <mensaje>'];
handler.tags = ['config'];
handler.command = /^(bienvenida)$/i;
handler.owner = true;

export { handler };
