// plugins/ayuda.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, command, usedPrefix }) => {
    // Leer todos los archivos de la carpeta 'plugins'
    const pluginsDir = path.join(__dirname, ''); // __dirname ya apunta a plugins/

    try {
        const files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js') && file !== 'index.js'); // Ignorar index.js si existe
        let commandsList = {};

        for (const file of files) {
            const modulePath = `file://${path.join(pluginsDir, file)}`;
            const module = await import(modulePath);

            if (module.default && module.default.command) {
                const cmd = module.default.command;
                const help = module.default.help || [cmd.toString()]; // Usar la ayuda definida o el nombre del comando
                const tags = module.default.tags || ['general']; // Categoría por defecto

                // Normalizar cmd para asegurar que siempre sea un array
                const commandsArray = Array.isArray(cmd) ? cmd : [cmd];

                commandsArray.forEach(singleCmd => {
                    const commandName = singleCmd.toString().replace(/[/\\^$*+?.()|[\]{}]/g, ''); // Limpiar regex si es necesario
                    if (!commandsList[tags[0]]) { // Agrupar por la primera etiqueta
                        commandsList[tags[0]] = [];
                    }
                    commandsList[tags[0]].push({
                        command: commandName,
                        description: help[0] // Usar la primera ayuda como descripción
                    });
                });
            }
        }

        let replyMessage = `📚 *Lista de Comandos del Bot*\n\n`;

        for (const tag in commandsList) {
            replyMessage += `*───「 ${tag.toUpperCase()} 」───*\n`;
            commandsList[tag].sort((a, b) => a.command.localeCompare(b.command)); // Ordenar alfabéticamente
            commandsList[tag].forEach(cmd => {
                replyMessage += `\`\`\`${usedPrefix}${cmd.description}\`\`\`\n`;
            });
            replyMessage += '\n';
        }

        replyMessage += `_Usa \`\`\`${usedPrefix}menu\`\`\` o \`\`\`${usedPrefix}help\`\`\` para ver esta lista._`;

        await conn.sendMessage(m.chat, { text: replyMessage }, { quoted: m });

    } catch (e) {
        console.error('Error processing .ayuda command:', e);
        m.reply(`❌ Ocurrió un error interno al generar la lista de comandos. Por favor, reporta este error.`);
    }
};

handler.help = ['ayuda', 'comandos'];
handler.tags = ['info'];
handler.command = /^(ayuda|comandos)$/i; // Permite ambos comandos para la ayuda
// No necesitamos owner para este comando, es para todos.
// handler.owner = false; // Comentado o eliminado, por defecto es false si no se especifica.

export default handler;
