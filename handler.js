import { generateWAMessageFromContent } from '@whiskeysockets/baileys';
import { smsg } from './lib/simple.js';
import { format } from 'util';
import { fileURLToPath } from 'url';
import path from 'path';
import fs, { watchFile, unwatchFile } from 'fs';
import chalk from 'chalk';
import fetch from 'node-fetch';
import { manejarRespuestaPago } from './lib/respuestapagos.js';
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
import { handler as faqHandler } from './plugins/faq.js';
import { handler as getfaqHandler } from './lib/getfaq.js';
import { handler as importarPagosHandler } from './plugins/importarpagos.js';
import { handler as resetHandler } from './plugins/reset.js';
import { handler as notificarOwnerHandler } from './plugins/notificarowner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_OWNER_JID = '5217771303481@s.whatsapp.net';
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;

const inactivityTimers = {};
let hasResetOnStartup = false;

const isNumber = x => typeof x === 'number' && !isNaN(x);
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
    clearTimeout(this);
    resolve();
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
        mensajeDespedidaInactividad: "Hola, parece que la conversación terminó. Soy tu asistente CashFlow. ¿Necesitas algo más? Puedes reactivar la conversación enviando un nuevo mensaje o tocando el botón.",
        chatGreeting: "Hola soy CashFlow, un asistente virtual. ¿Podrías brindarme tu nombre y decirme cuál es el motivo de tu consulta?"
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

const resetAllChatStatesOnStartup = async () => {
    if (hasResetOnStartup) return;
    hasResetOnStartup = true;

    try {
        const users = await new Promise((resolve, reject) => {
            global.db.data.users.find({}, (err, docs) => {
                if (err) reject(err);
                resolve(docs);
            });
        });

        const userIdsToReset = users.filter(u => u.chatState !== 'initial').map(u => u.id);

        if (userIdsToReset.length > 0) {
            console.log(`[BOT STARTUP] Reiniciando el estado de chat de ${userIdsToReset.length} usuarios...`);
            global.db.data.users.update({ id: { $in: userIdsToReset } }, { $set: { chatState: 'initial' } }, { multi: true }, (err) => {
                if (err) console.error("Error al reiniciar estados de chat:", err);
                else console.log(`[BOT STARTUP] Estados de chat reiniciados con éxito.`);
            });
        }
    } catch (e) {
        console.error("Error al reiniciar estados de chat en el arranque:", e);
    }
};

const handleInactivity = async (m, conn, userId) => {
    try {
        const currentConfigData = loadConfigBot();
        const farewellMessage = currentConfigData.mensajeDespedidaInactividad
            .replace(/{user}/g, m.pushName || m.sender.split('@')[0])
            .replace(/{bot}/g, conn.user.name || 'Bot');

        const sections = [{
            title: '❓ Retomar Conversación',
            rows: [{
                title: '➡️ Reactivar Chat',
                rowId: `${m.prefix}reactivate_chat`,
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

const sendWelcomeMessage = async (m, conn, namePrompt = false) => {
    const currentConfigData = loadConfigBot();
    const chatData = loadChatData();
    const userChatData = chatData[m.sender] || {};
    let welcomeMessage = '';

    if (namePrompt || !userChatData.nombre) {
        welcomeMessage = "¡Hola! He recibido tu consulta. Soy Richetti, tu asistente virtual. Para darte la mejor ayuda, ¿podrías darme tu nombre y el motivo de tu consulta? A partir de ahora puedes hacerme cualquier pregunta.";
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
                rowId: `${m.prefix}getfaq ${faq.pregunta}`,
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
    if (!m) return;
    if (m.key.fromMe) return; 

    if (!hasResetOnStartup) {
        await resetAllChatStatesOnStartup();
    }

    try {
        if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
        if (m.key.remoteJid === 'status@broadcast') return;

        m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
        m.message = (Object.keys(m.message)[0] === 'viewOnceMessage') ? m.message.viewOnceMessage.message : m.message;

        let senderJid = m.sender || m.key?.participant || m.key?.remoteJid;
        senderJid = String(senderJid);
        let senderNumber = 'Desconocido';
        let senderName = m.pushName || 'Desconocido';
        if (senderJid && senderJid !== 'undefined' && senderJid !== 'null') {
            senderNumber = senderJid.split('@')[0];
        } else {
            console.warn(`Mensaje recibido con senderJid inválido: '${senderJid}'.`);
        }
        let groupName = 'Chat Privado';
        if (m.key.remoteJid && m.key.remoteJid.endsWith('@g.us')) {
            try {
                const groupMetadata = await conn.groupMetadata(m.key.remoteJid);
                groupName = groupMetadata.subject || 'Grupo Desconocido';
            } catch (e) {
                console.error("Error al obtener metadatos del grupo:", e);
                groupName = 'Grupo (Error)';
            }
        }
        const messageType = Object.keys(m.message || {})[0];
        const rawText = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        const commandForLog = rawText.startsWith('.') || rawText.startsWith('!') || rawText.startsWith('/') || rawText.startsWith('#') ? rawText.split(' ')[0] : null;
        console.log(
            chalk.hex('#FF8C00')(`╭━━━━━━━━━━━━━━𖡼`) + '\n' +
            chalk.white(`┃ ❖ Bot: ${chalk.cyan(conn.user.jid?.split(':')[0]?.replace(':', '') || 'N/A')} ~${chalk.cyan(conn.user?.name || 'Bot')}`) + '\n' +
            chalk.white(`┃ ❖ Horario: ${chalk.greenBright(new Date().toLocaleTimeString())}`) + '\n' +
            chalk.white(`┃ ❖ Acción: ${commandForLog ? chalk.yellow(`Comando: ${commandForLog}`) : chalk.yellow('Mensaje')}`) + '\n' +
            chalk.white(`┃ ❖ Usuario: ${chalk.blueBright('+' + senderNumber)} ~${chalk.blueBright(senderName)}`) + '\n' +
            chalk.white(`┃ ❖ Grupo: ${chalk.magenta(groupName)}`) + '\n' +
            chalk.white(`┃ ❖ Tipo de mensaje: [Recibido] ${chalk.red(messageType)}`) + '\n' +
            chalk.hex('#FF8C00')(`╰━━━━━━━━━━━━━━𖡼`) + '\n' +
            chalk.white(`${rawText || ' (Sin texto legible) '}`)
        );

        m = smsg(conn, m);

        if (!m.sender) {
            console.warn('Mensaje procesado por smsg sin un m.sender válido. Ignorando.');
            return;
        }

        let userDoc = await new Promise((resolve, reject) => {
            global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
                if (err) reject(err);
                resolve(doc);
            });
        });

        const now = new Date() * 1;
        const lastSeenThreshold = 45 * 60 * 1000;
        const isNewUser = !userDoc;
        const isInactive = userDoc && (now - userDoc.lastseen > lastSeenThreshold);

        if (isNewUser) {
            userDoc = {
                id: m.sender,
                awaitingPaymentResponse: false,
                paymentClientName: '',
                paymentClientNumber: '',
                lastseen: now,
                chatState: 'initial',
                registered: false,
            };
            await new Promise((resolve, reject) => {
                global.db.data.users.insert(userDoc, (err, newDoc) => {
                    if (err) reject(err);
                    resolve(newDoc);
                });
            });
        } else {
            global.db.data.users.update({ id: m.sender }, { $set: { lastseen: now } }, {}, (err, numReplaced) => {
                if (err) console.error("Error al actualizar lastseen:", err);
            });
        }
        const user = userDoc;

        if (inactivityTimers[m.sender]) {
            clearTimeout(inactivityTimers[m.sender]);
            delete inactivityTimers[m.sender];
        }

        if (!m.isCmd && m.text && !m.isGroup) {
            inactivityTimers[m.sender] = setTimeout(() => {
                handleInactivity(m, conn, m.sender);
            }, INACTIVITY_TIMEOUT_MS);
        }

        const esImagenConComprobante = m.message?.imageMessage && m.message.imageMessage?.caption && isPaymentProof(m.message.imageMessage.caption);
        const esDocumentoConComprobante = m.message?.documentMessage && m.message.documentMessage?.caption && isPaymentProof(m.message.documentMessage.caption);

        if (user.awaitingPaymentResponse || esImagenConComprobante || esDocumentoConComprobante) {
            const handled = await manejarRespuestaPago(m, conn);
            if (handled) return;
        }

        if (m.message?.imageMessage || m.message?.documentMessage) {
            const handledMedia = await handleIncomingMedia(m, conn);
            if (handledMedia) return;
        }

        const prefix = m.prefix;
        
        // Manejo de comandos (Se ejecuta primero)
        if (m.isCmd) {
            switch (m.command) {
                case 'registrarpago':
                case 'agregarcliente':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    const { handler: registrarPagoHandler } = await import('./plugins/registrarpago.js');
                    await registrarPagoHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'agregarclientes':
                case 'registrarlote':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    const { handler: agregarClientesHandler } = await import('./plugins/agregarclientes.js');
                    await agregarClientesHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'recibo':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    const { handler: enviarReciboHandler } = await import('./plugins/enviarrecibo.js');
                    await enviarReciboHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'recordatorio':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    const { handler: recordatorioHandler } = await import('./plugins/recordatorios.js');
                    await recordatorioHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'clientes':
                case 'listarpagos':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    if (fs.existsSync(paymentsFilePath)) {
                        const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                        let clientList = '📊 *Lista de Clientes y Pagos:*\n\n';
                        for (const num in clientsData) {
                            const client = clientsData[num];
                            clientList += `*👤 Nombre:* ${client.nombre}\n*📞 Número:* ${num.replace('@s.whatsapp.net', '')}\n*🗓️ Día de Pago:* ${client.diaPago}\n*💰 Monto:* ${client.monto}\n*🌎 Bandera:* ${client.bandera}\n*• Estado:* ${client.suspendido ? '🔴 Suspendido' : '🟢 Activo'}\n----------------------------\n`;
                        }
                        if (Object.keys(clientsData).length === 0) clientList = '❌ No hay clientes registrados.';
                        await conn.sendMessage(m.chat, { text: clientList }, { quoted: m });
                    } else {
                        await conn.sendMessage(m.chat, { text: '❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.' }, { quoted: m });
                    }
                    break;
                case 'cliente': case 'vercliente': case 'editarcliente': case 'eliminarcliente':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await clienteHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix, isOwner: m.isOwner });
                    break;
                case 'historialpagos':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await historialPagosHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'pagosmes':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await pagosMesHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'pagosatrasados':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await pagosAtrasadosHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'recordatoriolote':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await recordatorioLoteHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'suspendercliente': case 'activarcliente':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await suspenderActivarHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'modopago':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await modoPagoHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix, currentConfigData: loadConfigBot(), saveConfigBot });
                    break;
                case 'estadobot':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await estadoBotHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'bienvenida':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await bienvenidaHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix, currentConfigData: loadConfigBot(), saveConfigBot });
                    break;
                case 'despedida':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await despedidaHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix, currentConfigData: loadConfigBot(), saveConfigBot });
                    break;
                case 'derivados':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await derivadosHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'ayuda': case 'comandos':
                    await ayudaHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'faq': case 'eliminarfaq':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await faqHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'getfaq':
                    await getfaqHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                    break;
                case 'importarpagos':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await importarPagosHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix, isOwner: m.isOwner });
                    break;
                case 'reset':
                    await resetHandler(m, { conn, text: m.text, command: m.command, usedPrefix: prefix });
                    break;
                case 'reactivate_chat':
                    if (!m.isGroup) {
                        await sendWelcomeMessage(m, conn);
                    }
                    break;
            }
            return;
        }

        // Lógica del Asistente Virtual (Se ejecuta solo si no es un comando)
        if (m.text && !user.awaitingPaymentResponse && !m.isGroup) {
            const currentConfigData = loadConfigBot();
            const faqs = currentConfigData.faqs || {};
            const chatData = loadChatData();
            const userChatData = chatData[m.sender] || {};
            const messageTextLower = m.text.toLowerCase().trim();

            // Flujo 1: Pedir y almacenar el nombre
            if (user.chatState === 'initial' || isNewUser || isInactive) {
                await sendWelcomeMessage(m, conn, true);
                return;
            } else if (user.chatState === 'awaitingName') {
                if (messageTextLower.length > 0) {
                    const name = messageTextLower.split(' ')[0]; // Asumimos que la primera palabra es el nombre
                    userChatData.nombre = name.charAt(0).toUpperCase() + name.slice(1);
                    saveChatData(chatData);
                    global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err) => {
                        if (err) console.error("Error al actualizar chatState a active:", err);
                    });
                    await sendWelcomeMessage(m, conn); // Envía el mensaje con los servicios ahora que tiene el nombre
                    return;
                }
            }
            
            // Flujo 2: Manejo de la conversación activa
            if (user.chatState === 'active') {

                // Paso 2.1: Detectar intención de pago
                const paymentKeywords = ['realizar un pago', 'quiero pagar', 'comprobante', 'pagar', 'pago'];
                const isPaymentIntent = paymentKeywords.some(keyword => messageTextLower.includes(keyword));

                if (isPaymentIntent) {
                    const paymentMessage = "Al momento de realizar su pago por favor enviar foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸";
                    await m.reply(paymentMessage);
                    return;
                }

                // Paso 2.2: Manejar preguntas de precio/información contextual
                const askForPrice = ['precio', 'cuanto cuesta', 'costo', 'valor'].some(keyword => messageTextLower.includes(keyword));
                const askForInfo = ['más información'].some(keyword => messageTextLower.includes(keyword));

                if ((askForPrice || askForInfo) && userChatData.lastFaqSent) {
                    const faqKey = Object.keys(faqs).find(key => faqs[key].pregunta.toLowerCase() === userChatData.lastFaqSent.toLowerCase());
                    
                    if (faqKey) {
                        const faq = faqs[faqKey];
                        let replyText = '';
                        if (askForPrice) {
                            replyText = faq.precio || `Lo siento, no tengo información de precio para "${faq.pregunta}".`;
                        } else if (askForInfo) {
                            replyText = `Claro, aquí tienes más información sobre el servicio "${faq.pregunta}":\n\n${faq.respuesta}`;
                        }
                        
                        await m.reply(replyText);

                        // Mantener el contexto si la pregunta es de seguimiento, pero no de fin de conversación
                        delete chatData[m.sender].lastFaqSent;
                        saveChatData(chatData);
                        return;
                    }
                }
                
                // Paso 2.3: Si nada de lo anterior coincide, usar la IA
                try {
                    const personaPrompt = `Eres CashFlow, un asistente virtual profesional para la atención al cliente de Richetti. Tu objetivo es ayudar a los clientes con consultas sobre pagos y servicios. No uses frases como "Estoy aquí para ayudarte", "Como tu asistente...", "Como un asistente virtual" o similares. Ve directo al punto y sé conciso.
                    
                    El nombre del usuario es ${userChatData.nombre || 'el usuario'} y el historial de chat con datos previos es: ${JSON.stringify(userChatData)}.
                    
                    Instrucciones:
                    - Responde de forma concisa, útil y profesional.
                    - Si te preguntan por métodos de pago, usa esta lista: ${JSON.stringify(paymentMethods)}
                    - Si el usuario pregunta por un método de pago específico o por su fecha de corte, informa que debe consultar con el proveedor de servicio.
                    - No proporciones información personal ni financiera sensible.
                    - No inventes precios. Si te preguntan por el precio de un servicio, informa que revisen la lista de servicios.
                    - Eres capaz de identificar a los clientes. Aquí hay información del usuario:
                    
                    - Has aprendido que tus servicios son:
                      - MichiBot exclusivo (pago mensual): Un bot de WhatsApp con gestión de grupos, descargas de redes sociales, IA, stickers y más.
                      - Bot personalizado (pago mensual): Similar a MichiBot, pero con personalización de tus datos y logo.
                      - Bot personalizado (único pago): La misma versión personalizada, pero con un solo pago.
                      - CashFlow: Un bot de gestión de clientes para seguimiento de pagos y recordatorios automáticos.`;
                    
                    const encodedContent = encodeURIComponent(personaPrompt);
                    const encodedText = encodeURIComponent(m.text);
                    const apiii = await fetch(`https://apis-starlights-team.koyeb.app/starlight/turbo-ai?content=${encodedContent}&text=${encodedText}`);
                    const res = await apiii.json();

                    if (res.content) { 
                        const aiResponse = res.content;
                        await m.reply(aiResponse);
                    } else {
                        console.log('Chatbot API no devolvió una respuesta válida:', res);
                        await m.reply('❌ Lo siento, no pude procesar tu solicitud en este momento. Por favor, intenta de nuevo más tarde.');
                    }
                } catch (e) {
                    console.error('Error en el Asistente Virtual (IA):', e);
                    await m.reply('❌ Lo siento, ocurrió un error inesperado al intentar ayudarte. Por favor, intenta de nuevo más tarde.');
                }
            }
        }
    } catch (e) {
        console.error('Error en handler:', e);
    }
}

let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
    unwatchFile(file);
    console.log(chalk.redBright("Actualizando 'handler.js'..."));
    import(`${file}?update=${Date.now()}`); 
});
