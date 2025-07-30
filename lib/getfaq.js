// lib/getfaq.js // ¡Ahora está en la carpeta lib!
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url'; // Corregida la sintaxis de importación

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ajusta la ruta a configbot.json, ya que getfaq.js ahora está en 'lib'
// La ruta será 'lib/../src/configbot.json' => 'src/configbot.json'
const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

// Función auxiliar para cargar la configuración del bot
const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return { faqs: {} };
};

let handler = async (m, { conn, text, command }) => {
    const question = text.trim();
    if (!question) {
        // Este mensaje solo debería aparecer si hay un error al pasar la pregunta,
        // ya que el rowId debería siempre pasar algo.
        return m.reply('No se ha proporcionado una pregunta para buscar.');
    }

    const configData = loadConfigBot();
    const faqs = configData.faqs || {};

    // Normalizamos la pregunta para buscar sin importar mayúsculas/minúsculas
    const faqEntry = faqs[question.toLowerCase()];

    if (faqEntry) {
        await m.reply(`*❓ Pregunta:* ${faqEntry.pregunta}\n\n*💡 Respuesta:* ${faqEntry.respuesta}`);
    } else {
        await m.reply(`❌ No se encontró una respuesta para la pregunta: "${question}".`);
    }
};

handler.help = ['getfaq']; // No se mostrará en .ayuda
handler.tags = ['hidden']; // Etiqueta para que no aparezca en la ayuda general
handler.command = /^(getfaq)$/i; // Comando interno

export default handler;
