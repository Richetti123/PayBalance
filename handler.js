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
import { handler as consultaHandler } from './plugins/consulta.js';

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

const sendPaymentOptions = async (m, conn) => {
    const paymentMessage = 'Selecciona la opción que deseas:';
    const buttons = [
        { buttonId: '1', buttonText: { displayText: 'He realizado el pago' }, type: 1 },
        { buttonId: '2', buttonText: { displayText: 'Necesito ayuda con mi pago' }, type: 1 }
    ];
    const buttonMessage = {
        text: paymentMessage,
        buttons: buttons,
        headerType: 1
    };

    await conn.sendMessage(m.chat, buttonMessage, { quoted: m });

    // Se establece el chatState aquí
    await new Promise((resolve, reject) => {
        global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'awaitingPaymentResponse' } }, {}, (err) => {
            if (err) {
                console.error("Error al actualizar chatState a 'awaitingPaymentResponse':", err);
                return reject(err);
            }
            resolve();
        });
    });
};

export async function handler(m, conn, store) {
    if (!m) return;
    if (m.key.fromMe) return;

    if (!hasResetOnStartup) {
        const allUsers = await new Promise((resolve, reject) => {
            global.db.data.users.find({}, (err, docs) => {
                if (err) return reject(err);
                resolve(docs);
            });
        });
        if (allUsers.length > 0) {
            await new Promise((resolve, reject) => {
                global.db.data.users.update({}, { $set: { chatState: 'initial' } }, { multi: true }, (err, numReplaced) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }
        hasResetOnStartup = true;
        lastResetTime = Date.now();
    } else if (Date.now() - lastResetTime > RESET_INTERVAL_MS) {
        const allUsers = await new Promise((resolve, reject) => {
            global.db.data.users.find({}, (err, docs) => {
                if (err) return reject(err);
                resolve(docs);
            });
        });
        if (allUsers.length > 0) {
            await new Promise((resolve, reject) => {
                global.db.data.users.update({}, { $set: { chatState: 'initial' } }, { multi: true }, (err, numReplaced) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }
        lastResetTime = Date.now();
    }
    
    const isGroup = m.key.remoteJid?.endsWith('@g.us');
    
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
            chatName = await conn.groupMetadata(m.key.remoteJid).then(res => res.subject);
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
        if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
        if (m.key.remoteJid === 'status@broadcast') return;

        m = smsg(conn, m);
        const ownerJid = `${BOT_OWNER_NUMBER}@s.whatsapp.net`;
        m.isOwner = m.isGroup ? m.key.participant === ownerJid : m.sender === ownerJid;
        m.prefix = '.';
        
        const user = await new Promise((resolve, reject) => {
            global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
                if (err) {
                    return resolve(null);
                }
                resolve(doc);
            });
        });
        const chatState = user?.chatState || 'initial';

        if (m.message) {
            let buttonReplyHandled = false;
            let buttonId = '';

            if (m.message.buttonsResponseMessage && m.message.buttonsResponseMessage.selectedButtonId) {
                buttonId = m.message.buttonsResponseMessage.selectedButtonId;
                buttonReplyHandled = true;
            } else if (m.message.templateButtonReplyMessage && m.message.templateButtonReplyMessage.selectedId) {
                buttonId = m.message.templateButtonReplyMessage.selectedId;
                buttonReplyHandled = true;
            } else if (m.message.listResponseMessage && m.message.listResponseMessage.singleSelectReply) {
                buttonId = m.message.listResponseMessage.singleSelectReply.selectedRowId;
                buttonReplyHandled = true;
            }

            if (buttonReplyHandled) {
                m.text = buttonId;
                console.log(chalk.yellow(`[DEBUG] Botón presionado. ID: ${buttonId}. ChatState: ${chatState}`));
                
                if (m.text === '.reactivate_chat') {
                    console.log(chalk.green(`[DEBUG] Manejando botón de reactivación.`));
                    await sendWelcomeMessage(m, conn);
                    return;
                }
                
                if (chatState === 'awaitingPaymentResponse') {
                    console.log(chalk.green(`[DEBUG] ChatState es 'awaitingPaymentResponse'. Llamando a manejarRespuestaPago.`));
                    if (await manejarRespuestaPago(m, conn)) {
                        console.log(chalk.green(`[DEBUG] Respuesta de pago manejada exitosamente.`));
                        return;
                    }
                }
                
                if (await handlePaymentProofButton(m, conn)) {
                    console.log(chalk.green(`[DEBUG] Botón de comprobante de pago manejado exitosamente.`));
                    return;
                }

                console.log(chalk.red(`[DEBUG] Botón no manejado. El chatState no era el esperado.`));
                m.reply('Lo siento, la acción que intentaste realizar no es válida en este momento. Por favor, intenta de nuevo o escribe "ayuda" para ver las opciones disponibles.');
                return;
            }
        }

        const esImagenConComprobante = m.message?.imageMessage?.caption && isPaymentProof(m.message.imageMessage.caption);
        const esDocumentoConComprobante = m.message?.documentMessage?.caption && isPaymentProof(m.message.documentMessage.caption);
        
        if (esImagenConComprobante || esDocumentoConComprobante) {
            console.log(`[DEBUG] Comprobante de pago detectado. ChatState: ${chatState}`);
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
            
            const handledMedia = await handleIncomingMedia(m, conn, clientInfo);
            if (handledMedia) {
                return;
            }
        }

        if (m.text && m.text.startsWith(m.prefix)) {
            m.isCmd = true;
            m.command = m.text.slice(m.prefix.length).split(' ')[0].toLowerCase();
        }

        if (m.isCmd) {
            console.log(chalk.blue(`[DEBUG] Comando detectado: ${m.command}`));
            if (m.isGroup) {
                const commandText = m.text.slice(m.text.startsWith(m.prefix) ? m.prefix.length + m.command.length : m.command.length).trim();
                switch (m.command) {
                    case 'registrarpago':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await registrarPagoHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'registrarlote':
                    case 'agregarclientes':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await registrarLoteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'recibo':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await enviarReciboHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'recordatorio':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await recordatorioHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'clientes':
                    case 'listarpagos':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        if (fs.existsSync(paymentsFilePath)) {
                            const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                            let clientList = '📊 *Lista de Clientes y Pagos:*\n\n';
                            for (const num in clientsData) {
                                const client = clientsData[num];
                                const estadoPago = client.pagoRealizado ? '✅ Pagado este mes' : '❌ Pendiente de pago';
                                const pagoActual = client.pagos && client.pagos[0] ? client.pagos[0] : { monto: 'N/A' };
                                
                                clientList += `*👤 Nombre:* ${client.nombre}\n*📞 Número:* ${num}\n*🗓️ Día de Pago:* ${client.diaPago}\n*💰 Monto:* ${pagoActual.monto}\n*🌎 Bandera:* ${client.bandera}\n*• Estado de Suspensión:* ${client.suspendido ? '🔴 Suspendido' : '🟢 Activo'}\n*• Estado de Pago:* ${estadoPago}\n----------------------------\n`;
                            }
                            if (Object.keys(clientsData).length === 0) clientList = '❌ No hay clientes registrados.';
                            await conn.sendMessage(m.chat, { text: clientList }, { quoted: m });
                        } else {
                            await conn.sendMessage(m.chat, { text: '❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.' }, { quoted: m });
                        }
                        break;
                    case 'cliente':
                    case 'vercliente':
                    case 'editarcliente':
                    case 'eliminarcliente':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await clienteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'historialpagos':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await historialPagosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'pagosmes':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await pagosMesHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'pagosatrasados':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await pagosAtrasadosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'recordatoriolote':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await recordatorioLoteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'suspendercliente':
                    case 'activarcliente':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await suspenderActivarHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'modopago':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await modoPagoHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner, currentConfigData: loadConfigBot(), saveConfigBot });
                        break;
                    case 'estadobot':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await estadoBotHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'bienvenida':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await bienvenidaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner, currentConfigData: loadConfigBot(), saveConfigBot });
                        break;
                    case 'despedida':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await despedidaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner, currentConfigData: loadConfigBot(), saveConfigBot });
                        break;
                    case 'derivados':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await derivadosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'ayuda':
                    case 'comandos':
                        await ayudaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                        break;
                    case 'faq':
                    case 'eliminarfaq':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await faqHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'importarpagos':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await importarPagosHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'reset':
                        await resetHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix });
                        break;
                    case 'comprobantepago':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await comprobantePagoHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'consulta':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await consultaHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'update':
                    case 'actualizar':
                    case 'gitpull':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await updateHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    case 'subircomprobante':
                        if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                        await subirComprobanteHandler(m, { conn, text: commandText, command: m.command, usedPrefix: m.prefix, isOwner: m.isOwner });
                        break;
                    default:
                        m.reply('❌ Comando no reconocido. Escribe .ayuda para ver la lista de comandos.');
                        break;
                }
            } else {
                m.reply('❌ Lo siento, los comandos solo pueden ser usados en grupos.');
            }
            return;
        }

        if (!m.isGroup) {
            console.log(chalk.blue(`[DEBUG] Mensaje en chat privado. Procesando lógica de chatState.`));
            const currentConfigData = loadConfigBot();
            const faqs = currentConfigData.faqs || {};
            const chatData = loadChatData();
            const userChatData = chatData[m.sender] || {};
            const messageTextLower = m.text.toLowerCase().trim();

            if (chatState === 'initial') {
                console.log(chalk.green(`[DEBUG] chatState es 'initial'. Enviando mensaje de bienvenida.`));
                await sendWelcomeMessage(m, conn);
                return;
            } else if (chatState === 'awaitingName') {
                console.log(chalk.yellow(`[DEBUG] chatState es 'awaitingName'. Procesando nombre.`));
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
                            text: `¡Hola ${userChatData.nombre}! ¿En qué puedo ayudarte hoy?`,
                            footer: 'Toca el botón para ver nuestros servicios.',
                            title: '📚 *Bienvenido/a*',
                            buttonText: 'Ver Servicios',
                            sections
                        };
                        await conn.sendMessage(m.chat, listMessage, { quoted: m });
                        
                        return;
                    }
                }
            } else if (chatState === 'active' || chatState === 'awaitingPaymentProof' || chatState === 'awaitingPaymentResponse') {
                console.log(chalk.blue(`[DEBUG] chatState es '${chatState}'. Procesando flujos de conversación.`));
                const goodbyeKeywords = ['adios', 'chao', 'chau', 'bye', 'nos vemos', 'hasta luego', 'me despido'];
                const isGoodbye = goodbyeKeywords.some(keyword => messageTextLower.includes(keyword));

                if (isGoodbye) {
                    console.log(chalk.red(`[DEBUG] Despedida detectada.`));
                    await handleGoodbye(m, conn, m.sender);
                    return;
                }
                
                const faqHandled = await getfaqHandler(m, { conn, text: m.text, command: 'getfaq', usedPrefix: m.prefix });
                if (faqHandled) {
                    console.log(chalk.green(`[DEBUG] FAQ detectada y manejada.`));
                    return;
                }

                const paises = Object.keys(countryPaymentMethods);
                const paisEncontrado = paises.find(p => messageTextLower.includes(p));

                if (paisEncontrado) {
                    console.log(chalk.yellow(`[DEBUG] País detectado: ${paisEncontrado}`));
                    const metodoPago = countryPaymentMethods[paisEncontrado];
                    if (metodoPago && metodoPago.length > 0) {
                        await m.reply(`¡Claro! Aquí tienes el método de pago para ${paisEncontrado}:` + metodoPago);
                    } else {
                        const noMethodMessage = `Lo siento, aún no tenemos un método de pago configurado para ${paisEncontrado}. Un moderador se pondrá en contacto contigo lo antes posible para ayudarte.`;
                        await m.reply(noMethodMessage);
                        const ownerNotificationMessage = `El usuario ${m.pushName} (+${m.sender ? m.sender.split('@')[0] : 'N/A'}) ha preguntado por un método de pago en ${paisEncontrado}, pero no está configurado.`;
                        await notificarOwnerHandler(m, { conn, text: ownerNotificationMessage, command: 'notificarowner', usedPrefix: m.prefix });
                    }
                    return;
                }

                const paymentsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                const formattedSender = `+${m.sender.split('@')[0]}`;
                const clientInfo = paymentsData[formattedSender];
                
                const paymentInfoKeywords = ['día de pago', 'dia de pago', 'fecha de pago', 'cuando pago', 'cuando me toca pagar', 'monto', 'cuanto debo', 'cuanto pagar', 'pais', 'país'];
                const paymentKeywords = ['realizar un pago', 'quiero pagar', 'comprobante', 'pagar', 'pago'];
                
                const isPaymentInfoIntent = paymentInfoKeywords.some(keyword => messageTextLower.includes(keyword));
                const isPaymentIntent = paymentKeywords.some(keyword => messageTextLower.includes(keyword));
                
                if (isPaymentInfoIntent) {
                    console.log(chalk.yellow(`[DEBUG] Intención de consulta de información de pago detectada.`));
                    if (clientInfo) {
                        let replyText = `¡Hola, ${clientInfo.nombre}! Aquí está la información que tengo sobre tu cuenta:\n\n`;
                        
                        if (clientInfo.diaPago) {
                            replyText += `🗓️ *Tu día de pago es el día ${clientInfo.diaPago} de cada mes.*\n`;
                        }
                        
                        if (clientInfo.monto) {
                            replyText += `💰 *El monto que te toca pagar es de ${clientInfo.monto}.*\n`;
                        }
                        
                        if (clientInfo.bandera) {
                            replyText += `🌍 *El país que tengo registrado para ti es ${clientInfo.bandera}.*\n`;
                        }
                        
                        if (clientInfo.pagos && clientInfo.pagos.length > 0) {
                            const ultimoPago = clientInfo.pagos[clientInfo.pagos.length - 1];
                            if (ultimoPago.fecha) {
                                replyText += `✅ *Tu último pago fue el ${ultimoPago.fecha}.*\n`;
                            }
                        }
                        
                        await m.reply(replyText);
                        return;
                    } else {
                        await m.reply('Lo siento, no he encontrado información de cliente asociada a tu número. Por favor, asegúrate de que tu cuenta esté registrada.');
                        return;
                    }
                }
                
                if (isPaymentIntent) {
                    console.log(chalk.green(`[DEBUG] Intención de realizar un pago detectada. Enviando opciones de pago.`));
                    await sendPaymentOptions(m, conn);
                    return;
                }
                
                const ownerKeywords = ['creador', 'dueño', 'owner', 'administrador', 'admin', 'soporte', 'contactar'];
                const isOwnerContactIntent = ownerKeywords.some(keyword => messageTextLower.includes(keyword));

                if (isOwnerContactIntent) {
                    console.log(chalk.yellow(`[DEBUG] Intención de contactar al owner detectada.`));
                    await notificarOwnerHandler(m, { conn });
                    return;
                }
                
                try {
                    const paymentsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                    const paymentMethods = {
                        '🇲🇽': `\n\nPara pagar en México, usa:\nCLABE: 706969168872764411\nNombre: Gaston Juarez\nBanco: Arcus Fi`,
                        '🇵🇪': `\n\nPara pagar en Perú, usa:\nNombre: Marcelo Gonzales R.\nYape: 967699188\nPlin: 955095498`,
                        '🇨🇱': `\n\nPara pagar en Chile, usa:\nNombre: BARINIA VALESKA ZENTENO MERINO\nRUT: 17053067-5\nBANCO ELEGIR: TEMPO\nTipo de cuenta: Cuenta Vista\nNumero de cuenta: 111117053067\nCorreo: estraxer2002@gmail.com`,
                        '🇺🇸': `\n\nPara pagar en Estados Unidos, usa:\nNombre: Marcelo Gonzales R.\nCorreo: jairg6218@gmail.com\nEnlace: https://paypal.me/richetti123`,
                        'Paypal': `\n\nPara pagar desde cualquier parte del mundo, usa paypal:\nNombre: Marcelo Gonzales R.\nCorreo: jairg6218@gmail.com\nEnlace: https://paypal.me/richetti123`,
                        '🇦🇷': `\n\nPara pagar en Argentina, usa:\nNombre: Gaston Juarez\nCBU: 4530000800011127480736`
                    };
                    const methodsList = Object.values(paymentMethods).join('\n\n');
                    const formattedSender = `+${m.sender.split('@')[0]}`;
                    const clientInfoPrompt = !!paymentsData[formattedSender] ?
                        `El usuario es un cliente existente con los siguientes detalles: Nombre: ${paymentsData[formattedSender].nombre}, Día de pago: ${paymentsData[formattedSender].diaPago}, Monto: ${paymentsData[formattedSender].monto}, Bandera: ${paymentsData[formattedSender].bandera}. Su estado es ${paymentsData[formattedSender].suspendido ? 'suspendido' : 'activo'}.` :
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
                    
                    ${clientInfoPrompt}
                    
                    Has aprendido que tus servicios son:
                    - MichiBot exclusivo (pago mensual): Un bot de WhatsApp con gestión de grupos, descargas de redes sociales, IA, stickers y más.
                    - Bot personalizado (pago mensual): Similar a MichiBot, pero con personalización de tus datos y logo.
                    - Bot personalizado (único pago): La misma versión personalizada, pero con un solo pago.
                    - CashFlow: Un bot de gestión de clientes para seguimiento de pagos y recordatorios automáticos.`;
                    
                    const encodedContent = encodeURIComponent(personaPrompt);
                    const encodedText = encodeURIComponent(m.text);
                    const url = `https://apis-starlights-team.koyeb.app/starlight/turbo-ai?content=${encodedContent}&text=${encodedText}`;
                    console.log(chalk.yellow('[Consulta] Enviando petición a IA'));
                    
                    const apiii = await fetch(url);
                    if (!apiii.ok) {
                        console.error(chalk.red(`[❌] La API de IA respondió con un error de estado: ${apiii.status} ${apiii.statusText}`));
                        m.reply('Lo siento, no pude procesar tu solicitud. Intenta de nuevo más tarde.');
                        return;
                    }
                    const json = await apiii.json();
                    
                    if (json.content) {
                        console.log(chalk.green(`[✔️] Respuesta de la API de IA recibida correctamente.`));
                        m.reply(json.content);
                    } else {
                        console.error(chalk.red(`[❌] La API de IA no devolvió un campo 'content' válido.`));
                        m.reply('Lo siento, no pude procesar tu solicitud. Intenta de nuevo más tarde.');
                    }
                } catch (e) {
                    console.error(chalk.red(`[❗] Error al llamar a la API de IA: ${e.message}`));
                    m.reply('Lo siento, no pude procesar tu solicitud. Ocurrió un error con el servicio de IA.');
                }
            }
        }
    } catch (e) {
        console.error(chalk.red(`[❌] Error en messages.upsert: ${e.message || e}`));  
        m.reply('Lo siento, ha ocurrido un error al procesar tu solicitud.');
    }
}

let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
    unwatchFile(file);
    console.log(chalk.redBright("Se actualizó 'handler.js', recargando..."));
    import(`${file}?update=${Date.now()}`);
});
