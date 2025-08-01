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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BOT_OWNER_NUMBER = '5217771303481';
const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000;

const inactivityTimers = {};
let hasResetOnStartup = false;

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

// --- NUEVO: Objeto con métodos de pago por país ---
const countryPaymentMethods = {
    'méxico': `\n\nPara pagar en México, usa:\nCLABE: 706969168872764411\nNombre: Gaston Juarez\nBanco: Arcus Fi`,
    'perú': `\n\nPara pagar en Perú, usa:\nNombre: Marcelo Gonzales R.\nYape: 967699188\nPlin: 955095498`,
    'chile': `\n\nPara pagar en Chile, usa:\nNombre: BARINIA VALESKA ZENTENO MERINO\nRUT: 17053067-5\nBANCO ELEGIR: TEMPO\nTipo de cuenta: Cuenta Vista\nNumero de cuenta: 111117053067\nCorreo: estraxer2002@gmail.com`,
    'argentina': `\n\nPara pagar en Argentina, usa:\nNombre: Gaston Juarez\nCBU: 4530000800011127480736`,
    'bolivia': ``,
    'españa': ``,
    'italia': ``,
    'estados unidos': ``,
    'puerto rico': ``,
    'panamá': ``,
    'uruguay': ``,
    'colombia': ``
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
        welcomeMessage = "¡Hola! soy CashFlow, un asistente virtual y estoy aqui para atenderte. Por favor indicame tu nombre para brindarte los servicios disponibles.";
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

const handlePaymentProof = async (m, conn) => {
    const currentConfigData = loadConfigBot();
    if (!currentConfigData.modoPagoActivo) {
        return;
    }

    const { manejarRespuestaPago } = await import('./lib/respuestapagos.js');
    const { handleIncomingMedia } = await import('./lib/comprobantes.js');
    const { isPaymentProof } = await import('./lib/keywords.js');

    const esImagenConComprobante = m.message?.imageMessage && m.message.imageMessage?.caption && isPaymentProof(m.message.imageMessage.caption);
    const esDocumentoConComprobante = m.message?.documentMessage && m.message.documentMessage?.caption && isPaymentProof(m.message.documentMessage.caption);
    const isPaymentResponseExpected = m.user?.awaitingPaymentResponse;

    if (isPaymentResponseExpected || esImagenConComprobante || esDocumentoConComprobante) {
        const handled = await manejarRespuestaPago(m, conn);
        if (handled) return true;
    }
    
    if (m.message?.imageMessage || m.message?.documentMessage) {
        const handledMedia = await handleIncomingMedia(m, conn);
        if (handledMedia) return true;
    }

    return false;
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

        // Primero, parsea el mensaje para obtener todas las propiedades, incluido el prefijo.
        m = smsg(conn, m);
        m.isOwner = m.sender.startsWith(BOT_OWNER_NUMBER);

        m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
        m.message = (Object.keys(m.message)[0] === 'viewOnceMessage') ? m.message.viewOnceMessage.message : m.message;
        
        let isButtonResponse = false;
        let commandFromButton = null;
        let buttonMessageText = null;

        if (m.message && m.message.listResponseMessage && m.message.listResponseMessage.singleSelectReply) {
            buttonMessageText = m.message.listResponseMessage.singleSelectReply.selectedRowId;
        } else if (m.message && m.message.buttonsResponseMessage && m.message.buttonsResponseMessage.selectedButtonId) {
            buttonMessageText = m.message.buttonsResponseMessage.selectedButtonId;
        } else if (m.message && m.message.templateButtonReplyMessage && m.message.templateButtonReplyMessage.selectedId) {
             buttonMessageText = m.message.templateButtonReplyMessage.selectedId;
        }

        if (buttonMessageText) {
            m.text = buttonMessageText;
            m.isCmd = true;
            m.command = buttonMessageText.split(' ')[0].replace(m.prefix, '');
            isButtonResponse = true;
            commandFromButton = m.command;
        }
        
        // --- NUEVO: Corrección de comandos ---
        // Se ejecuta esta lógica antes del switch para asegurarnos que un comando se procesa siempre.
        if (m.text && m.text.startsWith(m.prefix)) {
            m.isCmd = true;
            m.command = m.text.slice(m.prefix.length).split(' ')[0].toLowerCase();
        }

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
        const commandForLog = commandFromButton ? `Botón: ${commandFromButton}` : (rawText.startsWith(m.prefix) ? rawText.split(' ')[0] : null);
        console.log(
            chalk.hex('#FF8C00')(`╭━━━━━━━━━━━━━━𖡼`) + '\n' +
            chalk.white(`┃ ❖ Bot: ${chalk.cyan(conn.user.jid?.split(':')[0]?.replace(':', '') || 'N/A')} ~${chalk.cyan(conn.user?.name || 'Bot')}`) + '\n' +
            chalk.white(`┃ ❖ Horario: ${chalk.greenBright(new Date().toLocaleTimeString())}`) + '\n' +
            chalk.white(`┃ ❖ Acción: ${commandForLog ? chalk.yellow(commandForLog) : chalk.yellow('Mensaje')}`) + '\n' +
            chalk.white(`┃ ❖ Usuario: ${chalk.blueBright('+' + senderNumber)} ~${chalk.blueBright(senderName)}`) + '\n' +
            chalk.white(`┃ ❖ Grupo: ${chalk.magenta(groupName)}`) + '\n' +
            chalk.white(`┃ ❖ Tipo de mensaje: [Recibido] ${chalk.red(messageType)}`) + '\n' +
            chalk.hex('#FF8C00')(`╰━━━━━━━━━━━━━━𖡼`) + '\n' +
            chalk.white(`${rawText || ' (Sin texto legible) '}`)
        );


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
        m.user = user;

        if (inactivityTimers[m.sender]) {
            clearTimeout(inactivityTimers[m.sender]);
            delete inactivityTimers[m.sender];
        }

        if (!m.isCmd && m.text && !m.isGroup) {
            inactivityTimers[m.sender] = setTimeout(() => {
                handleInactivity(m, conn, m.sender);
            }, INACTIVITY_TIMEOUT_MS);
        }
        
        // Manejo de comandos y respuestas de botones (AHORA SOLO EN GRUPOS)
        if (m.isCmd && m.isGroup) {
            const commandText = m.text.slice(m.text.startsWith(m.prefix) ? m.prefix.length + m.command.length : m.command.length).trim();
            switch (m.command) {
                case 'registrarpago':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await registrarPagoHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'registrarlote':
                case 'agregarclientes':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await registrarLoteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'recibo':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await enviarReciboHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'recordatorio':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await recordatorioHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
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
                    await clienteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                    break;
                case 'historialpagos':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await historialPagosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'pagosmes':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await pagosMesHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'pagosatrasados':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await pagosAtrasadosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'recordatoriolote':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await recordatorioLoteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'suspendercliente': case 'activarcliente':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await suspenderActivarHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'modopago':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await modoPagoHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, currentConfigData: loadConfigBot(), saveConfigBot });
                    break;
                case 'estadobot':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await estadoBotHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'bienvenida':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await bienvenidaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, currentConfigData: loadConfigBot(), saveConfigBot });
                    break;
                case 'despedida':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await despedidaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, currentConfigData: loadConfigBot(), saveConfigBot });
                    break;
                case 'derivados':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await derivadosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'ayuda': case 'comandos':
                    await ayudaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'faq': case 'eliminarfaq':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await faqHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'getfaq':
                    await getfaqHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'importarpagos':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await importarPagosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                    break;
                case 'reset':
                    await resetHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'reactivate_chat':
                    if (!m.isGroup) {
                        await sendWelcomeMessage(m, conn);
                    }
                    break;
                case 'comprobantepago':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await comprobantePagoHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
                case 'notificarowner':
                    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                    await notificarOwnerHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                    break;
            }
            return; // Se detiene la ejecución si se detecta un comando o un botón
        }
        
        // Manejo de la lógica del asistente virtual (solo si no es un comando y no es una respuesta de botón)
        if (m.text && !isButtonResponse && !m.isGroup) {
            const currentConfigData = loadConfigBot();
            const faqs = currentConfigData.faqs || {};
            const chatData = loadChatData();
            const userChatData = chatData[m.sender] || {};
            const messageTextLower = m.text.toLowerCase().trim();

            // Lógica de comprobantes de pago
            if (await handlePaymentProof(m, conn)) {
                return;
            }

            // Flujo 1: Pedir y almacenar el nombre
            if (user.chatState === 'initial' || isNewUser || isInactive) {
                await sendWelcomeMessage(m, conn, true);
                return;
            } else if (user.chatState === 'awaitingName') {
                if (messageTextLower.length > 0) {
                    let name = '';
                    const soyMatch = messageTextLower.match(/^(?:soy|me llamo)\s+(.*?)(?:\s+y|\s+quiero|$)/);
                    const nombreEsMatch = messageTextLower.match(/^mi nombre es\s+(.*?)(?:\s+y|\s+quiero|$)/);

                    if (soyMatch && soyMatch[1]) {
                        name = soyMatch[1].trim();
                    } else if (nombreEsMatch && nombreEsMatch[1]) {
                        name = nombreEsMatch[1].trim();
                    } else {
                        name = messageTextLower.split(' ')[0];
                    }

                    if (name) {
                        userChatData.nombre = name.charAt(0).toUpperCase() + name.slice(1);
                        chatData[m.sender] = userChatData;
                        saveChatData(chatData);
                        global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'active' } }, {}, (err) => {
                            if (err) console.error("Error al actualizar chatState a active:", err);
                        });
                        await sendWelcomeMessage(m, conn);
                        return;
                    }
                }
            }

            // Flujo 2: Manejo de la conversación activa
            if (user.chatState === 'active') {
                
                // --- NUEVO: Manejar la lógica de pago por país ANTES de la IA ---
                const paises = Object.keys(countryPaymentMethods);
                const paisEncontrado = paises.find(p => messageTextLower.includes(p));

                if (paisEncontrado) {
                    const metodoPago = countryPaymentMethods[paisEncontrado];
                    if (metodoPago && metodoPago.length > 0) {
                        await m.reply(`¡Claro! Aquí tienes el método de pago para ${paisEncontrado}:` + metodoPago);
                    } else {
                        const noMethodMessage = `Lo siento, aún no tenemos un método de pago configurado para ${paisEncontrado}. Un moderador se pondrá en contacto contigo lo antes posible para ayudarte.`;
                        await m.reply(noMethodMessage);
                        const ownerNotificationMessage = `El usuario ${m.pushName} (+${m.sender.split('@')[0]}) ha preguntado por un método de pago en ${paisEncontrado}, pero no está configurado.`;
                        await notificarOwnerHandler(m, { conn, text: ownerNotificationMessage, command: 'notificarowner', usedPrefix: m.prefix });
                    }
                    return; // Detiene la ejecución para no caer en la IA
                }
                
                // Paso 2.1: Detectar intención de pago (si no se encontró un país)
                const paymentKeywords = ['realizar un pago', 'quiero pagar', 'comprobante', 'pagar', 'pago'];
                const isPaymentIntent = paymentKeywords.some(keyword => messageTextLower.includes(keyword));
                
                if (isPaymentIntent) {
                    const paymentMessage = `¡Claro! Para procesar tu pago, por favor envía la foto o documento del comprobante junto con el texto:\n\n*"Aquí está mi comprobante de pago"* 📸`;
                    await m.reply(paymentMessage);
                    return;
                }
                
                // Paso 2.2: Manejar preguntas de precio/información contextual
                const askForPrice = ['precio', 'cuanto cuesta', 'costo', 'valor'].some(keyword => messageTextLower.includes(keyword));
                const askForInfo = ['más información', 'mas informacion', 'mas info'].some(keyword => messageTextLower.includes(keyword));

                if ((askForPrice || askForInfo) && userChatData.lastFaqSentKey) {
                    const faqKey = userChatData.lastFaqSentKey;
                    const faq = faqs[faqKey];
                    
                    if (faq) {
                        let replyText = '';
                        if (askForPrice) {
                            replyText = faq.precio || `Lo siento, no tengo información de precio para "${faq.pregunta}".`;
                        } else if (askForInfo) {
                            replyText = `Claro, aquí tienes más información sobre el servicio "${faq.pregunta}":\n\n${faq.respuesta}`;
                        }
                        
                        await m.reply(replyText);
                        delete chatData[m.sender].lastFaqSentKey;
                        saveChatData(chatData);
                        return;
                    }
                }
                
                // Paso 2.3: Si nada de lo anterior coincide, usar la IA
                try {
                    const paymentsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));

                    const paymentMethods = {
                        '🇲🇽': `\n\nPara pagar en México, usa:\nCLABE: 706969168872764411\nNombre: Gaston Juarez\nBanco: Arcus Fi`,
                        '🇵🇪': `\n\nPara pagar en Perú, usa:\nNombre: Marcelo Gonzales R.\nYape: 967699188\nPlin: 955095498`,
                        '🇨🇱': `\n\nPara pagar en Chile, usa:\nNombre: BARINIA VALESKA ZENTENO MERINO\nRUT: 17053067-5\nBANCO ELEGIR: TEMPO\nTipo de cuenta: Cuenta Vista\nNumero de cuenta: 111117053067\nCorreo: estraxer2002@gmail.com`,
                        '🇦🇷': `\n\nPara pagar en Argentina, usa:\nNombre: Gaston Juarez\nCBU: 4530000800011127480736`
                    };

                    const methodsList = Object.values(paymentMethods).join('\n\n');

                    const clientInfoPrompt = !!paymentsData[m.sender] ?
                        `El usuario es un cliente existente con los siguientes detalles: Nombre: ${paymentsData[m.sender].nombre}, Día de pago: ${paymentsData[m.sender].diaPago}, Monto: ${paymentsData[m.sender].monto}, Bandera: ${paymentsData[m.sender].bandera}. Su estado es ${paymentsData[m.sender].suspendido ? 'suspendido' : 'activo'}.` :
                        `El usuario no es un cliente existente. Es un cliente potencial.`;

                    const historicalChatPrompt = Object.keys(userChatData).length > 0 ?
                        `Datos previos de la conversación con este usuario: ${JSON.stringify(userChatData)}.` :
                        `No hay datos previos de conversación con este usuario.`;
                    
                    const personaPrompt = `Eres CashFlow, un asistente virtual profesional para la atención al cliente de Richetti. Tu objetivo es ayudar a los clientes con consultas sobre pagos y servicios. No uses frases como "Estoy aquí para ayudarte", "Como tu asistente...", "Como un asistente virtual" o similares. Ve directo al punto y sé conciso.
                    
                    El nombre del usuario es ${userChatData.nombre || 'el usuario'} y el historial de chat con datos previos es: ${JSON.stringify(userChatData)}.
                    
                    Instrucciones:
                    - Responde de forma concisa, útil y profesional.
                    - Si te preguntan por métodos de pago, usa esta lista: ${methodsList}
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
                    const json = await apiii.json();
                    if (json.resultado) {
                        m.reply(json.resultado);
                    } else {
                        m.reply('Lo siento, no pude procesar tu solicitud. Intenta de nuevo más tarde.');
                    }
                } catch (e) {
                    console.error("Error en la llamada a la API de IA:", e);
                    m.reply('Lo siento, no pude procesar tu solicitud. Ocurrió un error con el servicio de IA.');
                }
            }
        }
    } catch (e) {
        console.error(e);
        m.reply('Lo siento, ha ocurrido un error al procesar tu solicitud.');
    }
}

// Observador para cambios en archivos (útil para el desarrollo)
let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
    unwatchFile(file);
    console.log(chalk.redBright("Se actualizó 'handler.js', recargando..."));
    import(`${file}?update=${Date.now()}`);
});
