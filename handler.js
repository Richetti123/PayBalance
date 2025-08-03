import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './lib/simple.js';
import { format } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';
import fs, { watchFile, unwatchFile } from 'fs';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { handlePaymentProofButton, manejarRespuestaPago } from './lib/respuestapagos.js';
import { handleIncomingMedia } from './lib/comprobantes.js';
import { isPaymentProof } from './lib/keywords.js';
import { handler as clienteHandler } from './plugins/cliente.js';
import { handler as historialPagosHandler } from './plugins/historialpagos.js';
import { handler as pagosMesHandler } from './plugins/pagosmes.js';
import { handler as pagosAtrasadosHandler } from './plugins/pagosatrasados.js';
import { handler as recordatorioLoteHandler } from './plugins/recordatoriolote.js';
import { handler as suspenderActivarHandler } from './plugins/suspenderactivar.js';
import { handler as modoPagoHandler } from './plugins/modopago.js';
import { handler as estadoBotHandler } from './plugins/estadobot.js';
import { handler as bienvenidaHandler } from './plugins/bienvenida.js';
import { handler as despedidaHandler } from './plugins/despedida.js';
import { handler as derivadosHandler } from './plugins/derivados.js';
import { handler as ayudaHandler } from './plugins/comandos.js';
import { handler as getfaqHandler } from './lib/getfaq.js';
import { handler as faqHandler } from './plugins/faq.js';
import { handler as importarPagosHandler } from './plugins/importarpagos.js';
import { handler as resetHandler } from './plugins/reset.js';
import { handler as notificarOwnerHandler } from './plugins/notificarowner.js';
import { handler as registrarPagoHandler } from './plugins/registrarpago.js';
import { handler as registrarLoteHandler } from './plugins/registrarlote.js';
import { handler as enviarReciboHandler } from './plugins/recibo.js';
import { handler as recordatorioHandler } from './plugins/recordatorios.js';
import { handler as comprobantePagoHandler } from './plugins/comprobantepago.js';
import { handler as updateHandler } from './plugins/update.js';
import { handler as subirComprobanteHandler } from './plugins/subircomprobante.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_OWNER_NUMBER = '5217771303481';
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;
const RESET_INTERVAL_MS = 12 * 60 * 60 * 1000;

const inactivityTimers = {};
let hasResetOnStartup = false;
let lastResetTime = Date.now();

const isNumber = x => typeof x === 'number' && !isNaN(x);
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
    clearTimeout(this);
}, ms));

const configBotPath = path.join(__dirname, 'src', 'configbot.json');
const paymentsFilePath = path.join(__dirname, 'src', 'pagos.json');
const chatDataPath = path.join(__dirname, 'src', 'chat_data.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return {
        modoPagoActivo: false,
        mensajeBienvenida: "¡Hola {user}! Soy tu bot asistente de pagos. ¿En qué puedo ayudarte hoy?",
        mensajeDespedida: "¡Hasta pronto! Esperamos verte de nuevo.",
        faqs: {},
        mensajeDespedidaInactividad: "Hola, parece que la conversación terminó. Soy tu asistente PayBalance. ¿Necesitas algo más? Puedes reactivar la conversación enviando un nuevo mensaje o tocando el botón.",
        chatGreeting: "Hola soy PayBalance, un asistente virtual. ¿Podrías brindarme tu nombre y decirme cuál es el motivo de tu consulta?"
    };
};

const saveConfigBot = (config) => {
    fs.writeFileSync(configBotPath, JSON.stringify(config, null, 2), 'utf8');
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

const countryPaymentMethods = {
    'méxico': `\n\nPara pagar en México, usa:\nCLABE: 706969168872764411\nNombre: Gaston Juarez\nBanco: Arcus Fi`,
    'perú': `\n\nPara pagar en Perú, usa:\nNombre: Marcelo Gonzales R.\nYape: 967699188\nPlin: 955095498`,
    'mexico': `\n\nPara pagar en México, usa:\nCLABE: 706969168872764411\nNombre: Gaston Juarez\nBanco: Arcus Fi`,
    'peru': `\n\nPara pagar en Perú, usa:\nNombre: Marcelo Gonzales R.\nYape: 967699188\nPlin: 955095498`,
    'chile': `\n\nPara pagar en Chile, usa:\nNombre: BARINIA VALESKA ZENTENO MERINO\nRUT: 17053067-5\nBANCO ELEGIR: TEMPO\nTipo de cuenta: Cuenta Vista\nNumero de cuenta: 111117053067\nCorreo: estraxer2002@gmail.com`,
    'argentina': `\n\nPara pagar en Argentina, usa:\nNombre: Gaston Juarez\nCBU: 4530000800011127480736`,
    'bolivia': ``,
    'españa': ``,
    'italia': ``,
    'paypal': `\n\nPara pagar desde cualquier parte del mundo, usa paypal:\nNombre: Marcelo Gonzales R.\nCorreo: jairg6218@gmail.com\nEnlace: https://paypal.me/richetti123`,
    'estados unidos': `\n\nPara pagar en Estados Unidos, usa:\nNombre: Marcelo Gonzales R.\nCorreo: jairg6218@gmail.com\nEnlace: https://paypal.me/richetti123`,
    'puerto rico': ``,
    'panamá': ``,
    'uruguay': ``,
    'colombia': ``
};

const handleInactivity = async (m, conn, userId) => {
    try {
        const currentConfigData = loadConfigBot();
        const farewellMessage = currentConfigData.mensajeDespedidaInactividad
            .replace(/{user}/g, m.pushName || (m.sender ? m.sender.split('@')[0] : 'usuario'))
            .replace(/{bot}/g, conn.user.name || 'Bot');

        const sections = [{
            title: '❓ Retomar Conversación',
            rows: [{
                title: '➡️ Reactivar Chat',
                rowId: `.reactivate_chat`,
                description: 'Pulsa aquí para iniciar una nueva conversación.'
            }]
        }];
        
        const listMessage = {
            text: farewellMessage,
            footer: 'Toca el botón para reactivar la conversación.',
            title: '👋 *Hasta Pronto*',
            buttonText: 'Retomar Conversación',
            sections
        };
        await conn.sendMessage(m.chat, listMessage, { quoted: m });

        global.db.data.users.update({ id: userId }, { $set: { chatState: 'initial' } }, {}, (err) => {
            if (err) console.error("Error al actualizar chatState a initial:", err);
        });
        delete inactivityTimers[userId];
        
    } catch (e) {
        console.error('Error al enviar mensaje de inactividad:', e);
    }
};

const handleGoodbye = async (m, conn, userId) => {
    try {
        await handleInactivity(m, conn, userId);
    } catch (e) {
        console.error('Error al manejar la despedida:', e);
    }
};

const sendWelcomeMessage = async (m, conn) => {
    const currentConfigData = loadConfigBot();
    const chatData = loadChatData();
    const userChatData = chatData[m.sender] || {};
    let welcomeMessage = '';

    if (!userChatData.nombre) {
        welcomeMessage = "¡Hola! soy PayBalance, un asistente virtual y estoy aqui para atenderte. Por favor indicame tu nombre para brindarte los servicios disponibles.";
        await m.reply(welcomeMessage);
        
        global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'awaitingName' } }, {}, (err) => {
            if (err) console.error("Error al actualizar chatState a awaitingName:", err);
        });
        
    } else {
        welcomeMessage = `¡Hola ${userChatData.nombre}! ¿En qué puedo ayudarte hoy?`;
        const faqsList = Object.values(currentConfigData.faqs || {});
        const sections = [{
            title: '⭐ Nuestros Servicios',
            rows: faqsList.map((faq) => ({
                title: faq.pregunta,
                rowId: `${faq.pregunta}`,
                description: `Toca para saber más sobre: ${faq.pregunta}`
            }))
        }];

        const listMessage = {
            text: welcomeMessage,
            footer: 'Toca el botón para ver nuestros servicios.',
            title: '📚 *Bienvenido/a*',
            buttonText: 'Ver Servicios',
            sections
        };
        await conn.sendMessage(m.chat, listMessage, { quoted: m });
        
        global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err) => {
            if (err) console.error("Error al actualizar chatState a active:", err);
        });
    }
};

export async function handler(m, conn, store) {
    const startTime = Date.now();
    console.log(chalk.yellow(`[⏱️] Mensaje recibido. Iniciando procesamiento en handler.js...`));

    if (!m) return;
    if (m.key.fromMe) return;
    if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
    if (m.key.remoteJid === 'status@broadcast') return;

    m = smsg(conn, m);
    const isGroup = m.chat?.endsWith('@g.us');
    const botJid = conn?.user?.id || conn?.user?.jid || '';
    const botRaw = botJid?.split('@')[0] || 'Desconocido';
    const botNumber = botRaw.split(':')[0];
    const botIdentifier = '+' + botNumber;

    const senderJid = m.key?.fromMe ? botJid : m.key?.participant || m.key?.remoteJid || m.sender || '';
    const senderRaw = senderJid.split('@')[0] || 'Desconocido';
    const senderNumber = '+' + senderRaw.split(':')[0];

    const senderName = m.pushName || 'Desconocido';

    let chatName = 'Chat Privado';
    if (isGroup) {
        try {
            chatName = await conn.groupMetadata(m.chat).then(res => res.subject);
        } catch (_) {
            chatName = 'Grupo Desconocido';
        }
    }
    
    const groupLine = isGroup ? `Grupo: ${chatName}` : `Chat: Chat Privado`;

    const rawText =
        m.text ||
        m.message?.conversation ||
        m.message?.extendedTextMessage?.text ||
        m.message?.imageMessage?.caption ||
        '';

    const commandForLog = rawText && m.prefix && rawText.startsWith(m.prefix) ? rawText.split(' ')[0] : null;
    const actionText = m.fromMe ? 'Mensaje Enviado' : (commandForLog ? `Comando: ${commandForLog}` : 'Mensaje');
    const messageType = Object.keys(m.message || {})[0] || 'desconocido';

    console.log(
        chalk.hex('#FF8C00')(`╭━━━━━━━━━━━━━━𖡼`) + '\n' +
        chalk.white(`┃ ❖ Bot: ${chalk.cyan(botIdentifier)} ~ ${chalk.cyan(conn.user?.name || 'Bot')}`) + '\n' +
        chalk.white(`┃ ❖ Horario: ${chalk.greenBright(new Date().toLocaleTimeString())}`) + '\n' +
        chalk.white(`┃ ❖ Acción: ${chalk.yellow(actionText)}`) + '\n' +
        chalk.white(`┃ ❖ Usuario: ${chalk.blueBright(senderNumber)} ~ ${chalk.blueBright(senderName)}`) + '\n' +
        chalk.white(`┃ ❖ ${groupLine}`) + '\n' +
        chalk.white(`┃ ❖ Tipo de mensaje: [${m.fromMe ? 'Enviado' : 'Recibido'}] ${chalk.red(messageType)}`) + '\n' +
        chalk.hex('#FF8C00')(`╰━━━━━━━━━━━━━━𖡼`) + '\n' +
        chalk.white(`${rawText.trim() || ' (Sin texto legible) '}`)
    );

    try {
        const ownerJid = `${BOT_OWNER_NUMBER}@s.whatsapp.net`;
        m.isOwner = m.isGroup ? m.key.participant === ownerJid : m.sender === ownerJid;
        m.prefix = '.';

        if (isGroup) {
            console.log(chalk.green(`[✅] Mensaje en grupo. La lógica de chatState se omite.`));
        }

        if (!isGroup) {
            console.log(chalk.yellow(`[⚠️] Mensaje en chat privado. Iniciando lógica de chatState...`));
            let user = global.db.data.users[m.sender];
            if (user) {
                console.log(chalk.cyan(`[🔍] Usuario ${m.sender} encontrado. Verificando chatState...`));
                if (!user.chatState) {
                    console.log(chalk.red(`[❌] chatState no definido. Reiniciando a 'initial'.`));
                    user.chatState = 'initial';
                } else {
                    console.log(chalk.green(`[👍] chatState ya definido: ${user.chatState}. No se reinicia.`));
                }
            } else {
                console.log(chalk.red(`[❗] Usuario ${m.sender} no encontrado. Creando nuevo usuario y reiniciando chatState a 'initial'.`));
                user = global.db.data.users[m.sender] = {
                    chatState: 'initial',
                    // Otras propiedades de usuario...
                };
            }
            console.log(chalk.yellow(`[✔️] Lógica de chatState para chat privado finalizada.`));
        }

        if (m.message) {
            let buttonReplyHandled = false;

            if (m.message.buttonsResponseMessage && m.message.buttonsResponseMessage.selectedButtonId) {
                m.text = m.message.buttonsResponseMessage.selectedButtonId;
                buttonReplyHandled = true;
            } else if (m.message.templateButtonReplyMessage && m.message.templateButtonReplyMessage.selectedId) {
                m.text = m.message.templateButtonReplyMessage.selectedId;
                buttonReplyHandled = true;
            } else if (m.message.listResponseMessage && m.message.listResponseMessage.singleSelectReply) {
                m.text = m.message.listResponseMessage.singleSelectReply.selectedRowId;
                buttonReplyHandled = true;
            }
            
            if (buttonReplyHandled) {
                if (m.text === '.reactivate_chat') {
                    await sendWelcomeMessage(m, conn);
                    return;
                }
                if (await handlePaymentProofButton(m, conn) || await manejarRespuestaPago(m, conn)) {
                    return;
                }
            }
        }
        const esImagenConComprobante = m.message?.imageMessage?.caption && isPaymentProof(m.message.imageMessage.caption);
        const esDocumentoConComprobante = m.message?.documentMessage?.caption && isPaymentProof(m.message.documentMessage.caption);
        if (esImagenConComprobante || esDocumentoConComprobante) {
            const paymentsFilePath = path.join(__dirname, 'src', 'pagos.json');
            let clientInfo = null;
            try {
                if (fs.existsSync(paymentsFilePath)) {
                    const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                    const formattedNumber = `+${m.sender.split('@')[0]}`;
                    clientInfo = clientsData[formattedNumber];
                }
            } catch (e) {
                console.error("Error al leer pagos.json en handler.js:", e);
            }
        }
        
        // Manejar los plugins según el estado del chat
        let user = global.db.data.users[m.sender];
        if (!user) user = { chatState: 'initial' };

        switch (user.chatState) {
            case 'initial':
                // Lógica para el estado inicial
                await registroHandler(m, conn, store);
                await clienteHandler(m, conn, store);
                await historialPagosHandler(m, conn, store);
                await pagosMesHandler(m, conn, store);
                await pagosAtrasadosHandler(m, conn, store);
                await recordatorioLoteHandler(m, conn, store);
                await suspenderActivarHandler(m, conn, store);
                await modoPagoHandler(m, conn, store);
                await estadoBotHandler(m, conn, store);
                await bienvenidaHandler(m, conn, store);
                await despedidaHandler(m, conn, store);
                await derivadosHandler(m, conn, store);
                await ayudaHandler(m, conn, store);
                await getfaqHandler(m, conn, store);
                await faqHandler(m, conn, store);
                await importarPagosHandler(m, conn, store);
                await resetHandler(m, conn, store);
                await notificarOwnerHandler(m, conn, store);
                await registrarPagoHandler(m, conn, store);
                await registrarLoteHandler(m, conn, store);
                await enviarReciboHandler(m, conn, store);
                await recordatorioHandler(m, conn, store);
                await comprobantePagoHandler(m, conn, store);
                await updateHandler(m, conn, store);
                await subirComprobanteHandler(m, conn, store);
                break;
            case 'awaiting_payment_confirmation':
                // Lógica para cuando se espera una respuesta de pago
                await manejarRespuestaPago(m, conn, store);
                break;
            // Otros estados de chat...
        }
        
        // Manejar el botón de comprobante de pago
        await handlePaymentProofButton(m, conn, store);

        // Lógica para la inteligencia artificial, si se usa
        const isPrivateChat = m.chat.endsWith('@s.whatsapp.net');
        if (isPrivateChat) {
            const personaPrompt = `Tu nombre es CashFlow, eres un bot de WhatsApp creado por Starlight-Team. Te especializas en la gestión de clientes, seguimiento de pagos, recordatorios automáticos, registro de clientes, historial de pagos, pagos del mes, pagos atrasados, suspensión y activación de clientes, modo de pago y otros servicios financieros. Solo debes responder a preguntas relacionadas con tus funciones y servicios. Si te preguntan por otros temas, debes responder amablemente que tu función es solo la gestión financiera. Los servicios de Starlight-Team incluyen:\n- MichiBot (pago mensual): Un bot multifunción con IA, stickers y más.\n- Bot personalizado (pago mensual): Similar a MichiBot, pero con personalización de tus datos y logo.\n- Bot personalizado (único pago): La misma versión personalizada, pero con un solo pago.\n- CashFlow: Un bot de gestión de clientes para seguimiento de pagos y recordatorios automáticos.`;
            
            const encodedContent = encodeURIComponent(personaPrompt);
            const encodedText = encodeURIComponent(m.text);
            const apiii = await fetch(`https://apis-starlights-team.koyeb.app/starlight/turbo-ai?content=${encodedContent}&text=${encodedText}`);
            const json = await apiii.json();
            if (json.resultado) {
                m.reply(json.resultado);
            } else {
                m.reply('Lo siento, no pude procesar tu solicitud. Intenta de nuevo más tarde.');
            }
        }
        
    } catch (e) {
        console.error(chalk.red(`[❌] Error en messages.upsert: ${e.message || e}`));
        m.reply('Lo siento, ha ocurrido un error al procesar tu solicitud.');
    }
    const endTime = Date.now();
    console.log(chalk.yellow(`[⏱️] Procesamiento de handler.js finalizado en ${endTime - startTime}ms.`));
}

let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
    unwatchFile(file);
    console.log(chalk.redBright("Se actualizó 'handler.js', recargando..."));
    import(`${file}?update=${Date.now()}`);
});
