import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configBotPath = path.join(__dirname, '..', 'src', 'configbot.json');

// Función para cargar la configuración del bot
const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return { faqs: {} }; // Retorna un objeto básico si no existe
};

let handler = async (m, { conn, command, usedPrefix }) => {
    let text = `👋 *¡Hola! Soy tu bot de pagos y asistencia. Aquí tienes mis comandos disponibles:*\n\n`;

    // Comandos de Propietario (Owner)
    text += `*⚙️ Comandos de Propietario:*\n`;
    text += `  • \`\`\`${usedPrefix}registrarpago <num_o_nombre> <monto> <dia_pago> <bandera>\`\`\` - Registra el pago de un cliente.\n`;
    text += `  • \`\`\`${usedPrefix}agregarcliente <num_o_nombre> <monto> <dia_pago> <bandera>\`\`\` - Alias de registrarpago.\n`;
    text += `  • \`\`\`${usedPrefix}agregarclientes <adjunto.xlsx>\`\`\` - Añade clientes desde un archivo Excel.\n`;
    text += `  • \`\`\`${usedPrefix}registrarlote <adjunto.xlsx>\`\`\` - Alias de agregarclientes.\n`;
    text += `  • \`\`\`${usedPrefix}recibo <num_o_nombre> <monto> [concepto]\`\`\` - Envía un recibo/cobro puntual.\n`;
    text += `  • \`\`\`${usedPrefix}recordatorio <num_o_nombre>\`\`\` - Envía un recordatorio de pago a un cliente.\n`;
    text += `  • \`\`\`${usedPrefix}clientes\`\`\` o \`\`\`${usedPrefix}listarpagos\`\`\` - Muestra la lista de todos los clientes registrados.\n`;
    text += `  • \`\`\`${usedPrefix}cliente <num_o_nombre>\`\`\` - Muestra detalles de un cliente.\n`;
    text += `  • \`\`\`${usedPrefix}vercliente <num_o_nombre>\`\`\` - Alias de cliente.\n`;
    text += `  • \`\`\`${usedPrefix}editarcliente <num_o_nombre> [campo] [nuevo_valor]\`\`\` - Edita información de un cliente.\n`;
    text += `  • \`\`\`${usedPrefix}eliminarcliente <num_o_nombre>\`\`\` - Elimina un cliente.\n`;
    text += `  • \`\`\`${usedPrefix}historialpagos <num_o_nombre>\`\`\` - Muestra el historial de pagos de un cliente.\n`;
    text += `  • \`\`\`${usedPrefix}pagosmes [mes/año]\`\`\` - Muestra los pagos registrados para un mes específico (ej: 07/2024).\n`;
    text += `  • \`\`\`${usedPrefix}pagosatrasados\`\`\` - Muestra los clientes con pagos atrasados.\n`;
    text += `  • \`\`\`${usedPrefix}recordatoriolote\`\`\` - Envía recordatorios a todos los clientes con pagos atrasados.\n`;
    text += `  • \`\`\`${usedPrefix}suspendercliente <num_o_nombre>\`\`\` - Suspende los recordatorios y avisos a un cliente.\n`;
    text += `  • \`\`\`${usedPrefix}activarcliente <num_o_nombre>\`\`\` - Reactiva los recordatorios y avisos a un cliente.\n`;
    text += `  • \`\`\`${usedPrefix}modopago [on/off]\`\`\` - Activa/desactiva el modo de recepción de comprobantes.\n`;
    text += `  • \`\`\`${usedPrefix}estadobot\`\`\` - Muestra el estado actual del bot.\n`;
    text += `  • \`\`\`${usedPrefix}bienvenida <mensaje>\`\`\` - Establece el mensaje de bienvenida para nuevos usuarios. Usa {user} y {bot}.\n`;
    text += `  • \`\`\`${usedPrefix}despedida <mensaje>\`\`\` - Establece el mensaje de despedida para usuarios que se van. Usa {user} y {bot}.\n`;
    text += `  • \`\`\`${usedPrefix}derivados\`\`\` - Muestra los números derivados para soporte.\n`;
    text += `  • \`\`\`${usedPrefix}faq <pregunta>|<respuesta>\`\`\` - Añade una pregunta frecuente.\n`;
    text += `  • \`\`\`${usedPrefix}eliminarfaq <pregunta>\`\`\` - Elimina una pregunta frecuente.\n`;
    text += `  • \`\`\`${usedPrefix}importarpagos <adjunto.json>\`\`\` - Importa datos de pagos desde un JSON (SOBREESCRIBE).\n`;


    // Comandos de Usuario (General)
    text += `\n*✨ Comandos Generales:*\n`;
    text += `  • \`\`\`${usedPrefix}ayuda\`\`\` o \`\`\`${usedPrefix}comandos\`\`\` - Muestra este menú de ayuda.\n`;
    
    // Lista de FAQs dinámicas
    const configData = loadConfigBot();
    const faqs = configData.faqs || {};
    const faqsList = Object.values(faqs);

    if (faqsList.length > 0) {
        text += `\n*❓ Preguntas Frecuentes (FAQs):*\n`;
        faqsList.forEach((faq, index) => {
            text += `  • \`\`\`${usedPrefix}getfaq ${faq.pregunta}\`\`\` - Para ver: ${faq.pregunta}\n`;
        });
        text += `\n_También puedes interactuar con el bot haciendo preguntas directas sobre pagos o el bot._\n`;
    } else {
        text += `\n_Actualmente no hay Preguntas Frecuentes configuradas. Puedes interactuar con el bot haciendo preguntas directas._\n`;
    }

    await m.reply(text);
};

// Configuración de ayuda y comandos para el handler
handler.help = ['ayuda', 'comandos'];
handler.tags = ['main'];
handler.command = /^(ayuda|comandos)$/i;

export { handler };
