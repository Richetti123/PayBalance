// plugins/faq.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

// Función auxiliar para cargar la configuración del bot
const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return {
        modoPagoActivo: false,
        mensajeBienvenida: "¡Hola! Soy tu bot asistente.",
        mensajeDespedida: "¡Hasta pronto!",
        faqs: {} // Asegurarse de que faqs existe
    };
};

// Función auxiliar para guardar la configuración del bot
const saveConfigBot = (config) => {
    fs.writeFileSync(configBotPath, JSON.stringify(config, null, 2), 'utf8');
};

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const args = text.trim().split(/\|/); // Usamos '|' para separar pregunta y respuesta
    const subCommand = args[0] ? args[0].trim().toLowerCase() : '';

    let configData = loadConfigBot();

    switch (subCommand) {
        case 'añadir':
        case 'add':
            if (args.length < 3) {
                return m.reply(`*Uso incorrecto:*\n\`\`\`${usedPrefix}${command} añadir|<pregunta>|<respuesta>\`\`\`\nEjemplo: \`\`\`${usedPrefix}${command} añadir|¿Cómo funciona el servicio?|Nuestro servicio funciona así...\`\`\``);
            }
            const questionToAdd = args[1].trim();
            const answerToAdd = args[2].trim();

            if (!questionToAdd || !answerToAdd) {
                return m.reply('Por favor, proporciona una pregunta y una respuesta válidas.');
            }

            configData.faqs[questionToAdd.toLowerCase()] = {
                pregunta: questionToAdd,
                respuesta: answerToAdd
            };
            saveConfigBot(configData);
            m.reply(`✅ FAQ añadida/actualizada exitosamente:\n\n*Pregunta:* ${questionToAdd}\n*Respuesta:* ${answerToAdd}`);
            break;

        case 'eliminar':
        case 'del':
            if (args.length < 2) {
                return m.reply(`*Uso incorrecto:*\n\`\`\`${usedPrefix}${command} eliminar|<pregunta>\`\`\`\nEjemplo: \`\`\`${usedPrefix}${command} eliminar|¿Cómo funciona el servicio?\`\`\``);
            }
            const questionToDelete = args[1].trim();

            if (!questionToDelete) {
                return m.reply('Por favor, proporciona la pregunta de la FAQ a eliminar.');
            }

            if (configData.faqs[questionToDelete.toLowerCase()]) {
                delete configData.faqs[questionToDelete.toLowerCase()];
                saveConfigBot(configData);
                m.reply(`✅ FAQ "${questionToDelete}" eliminada exitosamente.`);
            } else {
                m.reply(`❌ La FAQ "${questionToDelete}" no se encontró.`);
            }
            break;

        case 'ver':
        case 'list':
            const faqsList = Object.values(configData.faqs);
            if (faqsList.length === 0) {
                return m.reply('ℹ️ No hay preguntas frecuentes configuradas en este momento.');
            }

            const sections = [{
                title: '❓ Preguntas Frecuentes',
                rows: faqsList.map((faq, index) => ({
                    title: `${index + 1}. ${faq.pregunta}`,
                    rowId: `${usedPrefix}getfaq ${faq.pregunta}`, // Un comando interno para obtener la respuesta
                    description: `Pulsa para ver la respuesta a: ${faq.pregunta}`
                }))
            }];

            const listMessage = {
                text: 'Selecciona una pregunta de la lista para ver su respuesta:',
                footer: 'Toca el botón para ver las FAQs.',
                title: '📚 *Preguntas Frecuentes (FAQs)*',
                buttonText: 'Ver Preguntas Frecuentes',
                sections
            };

            await conn.sendMessage(m.chat, listMessage, { quoted: m });
            break;

        default:
            return m.reply(`*Uso correcto de ${usedPrefix}${command}:*\n` +
                           `\`\`\`${usedPrefix}${command} añadir|<pregunta>|<respuesta>\`\`\` - Añade o actualiza una FAQ.\n` +
                           `\`\`\`${usedPrefix}${command} eliminar|<pregunta>\`\`\` - Elimina una FAQ.\n` +
                           `\`\`\`${usedPrefix}${command} ver\`\`\` - Muestra todas las FAQs en una lista.`);
    }
};

handler.help = ['faq <añadir|eliminar|ver>|<pregunta>|[respuesta]', 'eliminarfaq <pregunta>'];
handler.tags = ['config'];
handler.command = /^(faq|eliminarfaq)$/i;
handler.owner = true;

export default handler;
