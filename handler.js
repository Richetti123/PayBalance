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
import { handler as clienteHandler } from './plugins/cliente.js'; // Para .cliente, .vercliente, .editarcliente, .eliminarcliente
import { handler as historialPagosHandler } from './plugins/historialpagos.js'; // Para .historialpagos
import { handler as pagosMesHandler } from './plugins/pagosmes.js'; // Para .pagosmes
import { handler as pagosAtrasadosHandler } = await import('./plugins/pagosatrasados.js'); // Para .pagosatrasados
import { handler as recordatorioLoteHandler } from './plugins/recordatoriolote.js'; // Para .recordatoriolote
import { handler as suspenderActivarHandler } from './plugins/suspenderactivar.js'; // Para .suspendercliente, .activarcliente
import { handler as modoPagoHandler } from './plugins/modopago.js'; // Para .modopago
import { handler as estadoBotHandler } from './plugins/estadobot.js'; // Para .estadobot
import { handler as bienvenidaHandler } from './plugins/bienvenida.js'; // Para .bienvenida
import { handler as despedidaHandler } from './plugins/despedida.js'; // Para .despedida
import { handler as derivadosHandler } from './plugins/derivados.js'; // Para .derivados
import { handler as ayudaHandler } from './plugins/comandos.js'; // Para .ayuda o .comandos
import { handler as faqHandler } from './plugins/faq.js'; // Para .faq y .eliminarfaq
import { handler as getfaqHandler } from './lib/getfaq.js'; // Para .getfaq (comando interno para FAQs)
import { handler as importarPagosHandler } from './plugins/importarpagos.js'; // Para .importarpagos

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define el JID del propietario del bot para notificaciones urgentes
const BOT_OWNER_JID = '5217771303481@s.whatsapp.net';

const isNumber = x => typeof x === 'number' && !isNaN(x);
const delay = ms => isNumber(ms) && new Promise(resolve => setTimeout(function () {
    clearTimeout(this);
    resolve();
}, ms));

// --- FUNCIONES PARA CARGAR/GUARDAR CONFIGBOT.JSON ---
const configBotPath = path.join(__dirname, 'src', 'configbot.json'); // Ruta a configbot.json

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    // Retorna una configuración por defecto si el archivo no existe
    return {
        modoPagoActivo: false,
        mensajeBienvenida: "¡Hola {user}! Soy tu bot asistente. ¿En qué puedo ayudarte hoy?",
        mensajeDespedida: "¡Hasta pronto! Esperamos verte de nuevo.",
        faqs: {},
        mensajeDespedidaInactividad: "Hola, parece que la conversación terminó. Soy tu asistente Richetti. ¿Necesitas algo más? Puedes reactivar la conversación con el botón.", // Nuevo campo
    };
};

const saveConfigBot = (config) => {
    fs.writeFileSync(configBotPath, JSON.stringify(config, null, 2), 'utf8');
};
// --- FIN FUNCIONES CONFIGBOT.JSON ---

/**
 * Handle messages upsert
 * @param {import('@whiskeysockets/baileys').WAMessage} m
 * @param {import('@whiskeysockets/baileys').WASocket} conn
 * @param {import('@whiskeysockets/baileys').InMemoryStore} store
 */
export async function handler(m, conn, store) {
    if (!m) return;

    try {
        if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return;
        if (m.key.remoteJid === 'status@broadcast') return;

        m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message;
        m.message = (Object.keys(m.message)[0] === 'viewOnceMessage') ? m.message.viewOnceMessage.message : m.message;

        // --- INICIO: Bloque para logging visual de mensajes recibidos ---
        let senderJid = m.sender || m.key?.participant || m.key?.remoteJid;
        
        senderJid = String(senderJid);      

        let senderNumber = 'Desconocido';
        let senderName = m.pushName || 'Desconocido'; // Nombre del usuario

        if (senderJid && senderJid !== 'undefined' && senderJid !== 'null') {
            senderNumber = senderJid.split('@')[0];     
        } else {
            console.warn(`Mensaje recibido con senderJid inválido: '${senderJid}'. No se pudo determinar el número de remitente.`);
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

        // *** BLOQUE DE CONSOLE.LOG CON COLORES AJUSTADOS A TU IMAGEN ***
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
        // --- FIN: Bloque para logging visual ---

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

        // --- Lógica de Bienvenida y FAQs para nuevos usuarios ---
        let currentConfigData = loadConfigBot(); // Cargar la configuración actual

        if (!userDoc) {
            // Si el usuario es nuevo, inicializarlo y enviar mensaje de bienvenida
            userDoc = {
                id: m.sender,
                awaitingPaymentResponse: false,
                paymentClientName: '',
                paymentClientNumber: '',
                lastseen: new Date() * 1, // Para registrar la última vez que se vio
                registered: false, // Puedes usar esto si tienes un comando de registro formal
                // ... otras propiedades que tengas en tus usuarios
            };
            await new Promise((resolve, reject) => {
                global.db.data.users.insert(userDoc, (err, newDoc) => {
                    if (err) reject(err);
                    resolve(newDoc);
                });
            });

            const welcomeMessage = currentConfigData.mensajeBienvenida
                .replace(/{user}/g, m.pushName || m.sender.split('@')[0])
                .replace(/{bot}/g, conn.user.name || 'Bot');
            
            const faqsList = Object.values(currentConfigData.faqs || {}); // Asegurarse de que faqs es un objeto
            if (faqsList.length > 0) {
                const sections = [{
                    title: '❓ Preguntas Frecuentes',
                    rows: faqsList.map((faq, index) => ({
                        title: `${index + 1}. ${faq.pregunta}`,
                        rowId: `${m.prefix}getfaq ${faq.pregunta}`, // Comando interno para obtener la respuesta
                        description: `Pulsa para ver la respuesta a: ${faq.pregunta}`
                    }))
                }];

                const listMessage = {
                    text: welcomeMessage,
                    footer: 'Toca el botón para ver las preguntas frecuentes.',
                    title: '📚 *Bienvenido/a*',
                    buttonText: 'Ver Preguntas Frecuentes',
                    sections
                };
                await conn.sendMessage(m.chat, listMessage, { quoted: m });
            } else {
                await m.reply(welcomeMessage); // Si no hay FAQs, solo envía el mensaje de bienvenida
            }
        }
        // Actualizar lastseen para usuarios existentes (o para el recién creado)
        global.db.data.users.update({ id: m.sender }, { $set: { lastseen: new Date() * 1 } }, {}, (err, numReplaced) => {
            if (err) console.error("Error al actualizar lastseen:", err);
        });
        const user = userDoc; // Usar el documento de usuario (existente o recién creado)
        // --- FIN Lógica de Bienvenida y FAQs ---

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

        switch (m.command) {
            case 'registrarpago':
            case 'agregarcliente': // Esto es un alias para el comando de un solo cliente
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: registrarPagoHandler } = await import('./plugins/registrarpago.js');
                await registrarPagoHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'agregarclientes': // Comando para añadir en lote
            case 'registrarlote': // Alias para el comando de añadir en lote
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                const { handler: agregarClientesHandler } = await import('./plugins/agregarclientes.js');
                await agregarClientesHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'recibo': // Nuevo comando para enviar recibos/cobros puntuales
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
                const paymentsFilePath = path.join(__dirname, 'src', 'pagos.json');
                if (fs.existsSync(paymentsFilePath)) {
                    const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                    let clientList = '📊 *Lista de Clientes y Pagos:*\n\n';
                    for (const num in clientsData) {
                        const client = clientsData[num];
                        clientList += `*👤 Nombre:* ${client.nombre}\n`;
                        clientList += `*📞 Número:* ${num.replace('@s.whatsapp.net', '')}\n`; // Mostrar solo el número, no el JID completo
                        clientList += `*🗓️ Día de Pago:* ${client.diaPago}\n`;
                        clientList += `*💰 Monto:* ${client.monto}\n`;
                        clientList += `*🌎 Bandera:* ${client.bandera}\n`;
                        clientList += `*• Estado:* ${client.suspendido ? '🔴 Suspendido' : '🟢 Activo'}\n`; // Añadir estado
                        clientList += '----------------------------\n';
                    }
                    if (Object.keys(clientsData).length === 0) {
                        clientList = '❌ No hay clientes registrados en la base de datos de pagos.';
                    }
                    await conn.sendMessage(m.chat, { text: clientList }, { quoted: m });
                } else {
                    await conn.sendMessage(m.chat, { text: '❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.' }, { quoted: m });
                }
                break;

            // --- NUEVOS COMANDOS INTEGRADOS ---

            case 'cliente':
            case 'vercliente':
            case 'editarcliente':
            case 'eliminarcliente': // Ahora este comando solo lo maneja 'cliente.js'
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
            
            case 'suspendercliente':
            case 'activarcliente':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                await suspenderActivarHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'modopago':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                await modoPagoHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix, currentConfigData, saveConfigBot });
                break;

            case 'estadobot':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                await estadoBotHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'bienvenida':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                await bienvenidaHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix, currentConfigData, saveConfigBot });
                break;

            case 'despedida':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                await despedidaHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix, currentConfigData, saveConfigBot });
                break;

            case 'derivados':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                await derivadosHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'ayuda':
            case 'comandos':
                await ayudaHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;
            
            case 'faq':
            case 'eliminarfaq':
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                await faqHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;
            
            case 'getfaq': // Este es un comando interno, no se usa con prefijo directamente por el usuario
                await getfaqHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix });
                break;

            case 'importarpagos': // Nuevo comando para importar datos de pagos
                if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
                await importarPagosHandler(m, { conn, text: m.text.slice(prefix.length + (m.command ? m.command.length + 1 : 0)).trim(), command: m.command, usedPrefix: prefix, isOwner: m.isOwner });
                break;

            // --- FIN NUEVOS COMANDOS INTEGRADOS ---

            // --- INICIO: Integración del Chatbot (Turbo AI con parámetro 'content' y notificación al owner) ---
            default:
                // Solo se activa si el mensaje NO es un comando, tiene texto y el usuario NO está esperando una respuesta de pago.
                // Además, solo responde a usuarios que NO son el propietario del bot y solo en chats privados (!m.isGroup).
                if (!m.isCmd && m.text && !user.awaitingPaymentResponse && !m.isOwner && !m.isGroup) { 
                    try {
                        // --- PROMPT DE LA PERSONA DEL CHATBOT ---
                        const personaPrompt = "Eres Richetti Bot, un amable y eficiente asistente virtual diseñado para atender al público de Richetti. Tu objetivo principal es ofrecer un soporte excepcional y agilizar la atención a los usuarios, proporcionando explicaciones claras y precisas sobre cómo funcionan nuestros servicios de pago y el uso general del bot. Siempre que interactúes, responde de forma servicial, profesional, concisa y útil, enfocándote en resolver dudas relacionadas con los servicios de Richetti, pagos, o el funcionamiento general del bot. Si te preguntan sobre métodos de pago específicos, menciona que las opciones pueden variar y que para detalles muy concretos o problemas complejos que no puedas resolver, el usuario debería contactar directamente con el equipo de Richetti. Evita dar información personal, financiera o consejos legales. Recuerda mantener el tono de voz de Richetti, siendo siempre atento y resolutivo.";
                        // --- FIN PROMPT DE LA PERSONA DEL CHATBOT ---

                        const encodedContent = encodeURIComponent(personaPrompt);
                        const encodedText = encodeURIComponent(m.text);

                        const apiii = await fetch(`https://apis-starlights-team.koyeb.app/starlight/turbo-ai?content=${encodedContent}&text=${encodedText}`);
                        const res = await apiii.json();

                        if (res.content) { 
                            const aiResponse = res.content; 
                            await m.reply(aiResponse);

                            const deflectionPhrases = [
                                "contacta al propietario", "necesitas hablar con el propietario",
                                "no puedo ayudarte con eso", "supera mi capacidad",
                                "no tengo información detallada sobre eso",
                                "para eso, por favor, consulta con el propietario",
                                "no puedo resolver eso directamente", "lo siento, no tengo esa información",
                                "para casos específicos", "requiere la atención del propietario",
                                "no puedo proporcionar esa información", "fuera de mi alcance",
                                "no tengo acceso a esa información", "necesitarías contactar directamente",
                                "contacta con el equipo de richetti", "habla con el equipo de richetti",
                                "nuestro equipo de soporte"
                            ].map(phrase => phrase.toLowerCase());    

                            const aiResponseLower = aiResponse.toLowerCase();
                            let aiDeflected = false;
                            for (const phrase of deflectionPhrases) {
                                if (aiResponseLower.includes(phrase)) {
                                    aiDeflected = true;
                                    break;
                                }
                            }

                            if (aiDeflected) {
                                const userName = m.pushName || 'Desconocido';
                                const userNumber = m.sender.split('@')[0];

                                const ownerNotification = `❗ *Atención: Consulta Urgente del Chatbot*\n\n` +
                                                                `El chatbot ha derivado una consulta que no pudo resolver. El usuario ha sido informado de que debe contactar al equipo de Richetti.\n\n` +
                                                                `*👤 Usuario:* ${userName}\n` +
                                                                `*📞 Número:* +${userNumber}\n` +
                                                                `*💬 Última pregunta del usuario:* \`${m.text}\`\n` +
                                                                `*💬 Respuesta del Chatbot (que motivó la derivación):* \`${aiResponse}\`\n\n` +
                                                                `Por favor, revisa y contacta al usuario si es necesario.`;
                                    
                                await conn.sendMessage(BOT_OWNER_JID, { text: ownerNotification });
                                console.log(`Notificación de consulta desviada enviada al propietario: ${ownerNotification}`);

                            }

                        } else {
                            console.log('Chatbot API no devolvió una respuesta con la propiedad "content" válida:', res);
                        }
                    } catch (e) {
                        console.error('Error al llamar a la API de Turbo AI para el chatbot:', e);
                    }
                    return; 
                }
                break;
            // --- FIN: Integración del Chatbot (Turbo AI) ---
        }

    } catch (e) {
        console.error('Error en handler:', e);
    }
}

// Recarga de módulos en caso de cambios
let file = fileURLToPath(import.meta.url);
watchFile(file, () => {
    unwatchFile(file);
    console.log(chalk.redBright("Actualizando 'handler.js'..."));
    import(`${file}?update=${Date.now()}`); 
});
