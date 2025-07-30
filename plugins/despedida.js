// plugins/despedida.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const newGoodbyeMessage = text.trim();

    if (!newGoodbyeMessage) {
        return m.reply(`*Uso incorrecto:*\nProporciona el mensaje de despedida que el bot enviará.\nEjemplo: \`\`\`${usedPrefix}${command} ¡Gracias por ser parte de nuestra comunidad! Vuelve pronto.\`\`\`\n\nVariables disponibles: \`\`\`{user}\`\`\` (nombre del usuario), \`\`\`{bot}\`\`\` (nombre del bot).`);
    }

    try {
        let configData = {};
        if (fs.existsSync(configBotPath)) {
            configData = JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
        }

        configData.mensajeDespedida = newGoodbyeMessage;

        fs.writeFileSync(configBotPath, JSON.stringify(configData, null, 2), 'utf8');
        await m.reply(`✅ Mensaje de despedida actualizado exitosamente:\n\n\`\`\`${newGoodbyeMessage}\`\`\``);

    } catch (e) {
        console.error('Error processing .despedida command:', e);
        m.reply(`❌ Ocurrió un error interno al actualizar el mensaje de despedida. Por favor, reporta este error.`);
    }
};

handler.help = ['despedida <mensaje>'];
handler.tags = ['config'];
handler.command = /^(despedida)$/i;
handler.owner = true;

export default handler;
