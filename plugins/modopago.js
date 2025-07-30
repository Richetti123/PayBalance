// plugins/modopago.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const arg = text.trim().toLowerCase();

    if (!arg || (arg !== 'on' && arg !== 'off')) {
        return m.reply(`*Uso incorrecto:*\nDefine si el modo de pago está \`\`\`on\`\`\` o \`\`\`off\`\`\`.\nEjemplo: \`\`\`${usedPrefix}${command} on\`\`\` o \`\`\`${usedPrefix}${command} off\`\`\``);
    }

    try {
        let configData = {};
        if (fs.existsSync(configBotPath)) {
            configData = JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
        }

        const newMode = arg === 'on';
        configData.modoPagoActivo = newMode;

        fs.writeFileSync(configBotPath, JSON.stringify(configData, null, 2), 'utf8');
        await m.reply(`✅ Modo de pago ha sido ${newMode ? '*ACTIVADO*' : '*DESACTIVADO*'}.`);

    } catch (e) {
        console.error('Error processing .modopago command:', e);
        m.reply(`❌ Ocurrió un error interno al cambiar el modo de pago. Por favor, reporta este error.`);
    }
};

handler.help = ['modopago [on/off]'];
handler.tags = ['config'];
handler.command = /^(modopago)$/i;
handler.owner = true;

export { handler };
