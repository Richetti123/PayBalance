import fs from 'fs';
import chalk from 'chalk';
import fetch from 'node-fetch';

const paymentsFilePath = './src/pagos.json';

// La función ahora se activará para todos los mensajes, actuando como un chatbot.
const handler = async (m, { conn, text }) => {
  try {
    console.log(`[Chatbot] Mensaje recibido: ${text}`);

    const messageTextLower = text.toLowerCase();
    const chatData = global.db.data.users || {};
    const userChatData = chatData[m.sender] || {};
    const faqs = global.db.data.faqs || {};

    // Detectar intención de pago para enviar mensaje sobre comprobante
    const paymentKeywords = ['realizar un pago', 'quiero pagar', 'comprobante', 'pagar', 'pago'];
    const isPaymentIntent = paymentKeywords.some(keyword => messageTextLower.includes(keyword));
    if (isPaymentIntent) {
      const paymentMessage = `¡Claro! Para procesar tu pago, por favor envía la foto o documento del comprobante junto con el texto:\n\n*"Aquí está mi comprobante de pago"* 📸`;
      await m.reply(paymentMessage);
      return;
    }

    // Detectar preguntas de precio o más información para responder con FAQ si se tiene contexto
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
        delete userChatData.lastFaqSentKey;
        global.db.write();
        return;
      }
    }

    // --- Lógica añadida para reinicio y problemas del bot ---
    const botIssueKeywords = ['reinicio', 'reiniciar', 'bot no funciona', 'bot lento', 'bot', 'problema', 'error', 'caido'];
    const isBotIssueIntent = botIssueKeywords.some(keyword => messageTextLower.includes(keyword));

    if (isBotIssueIntent) {
      // Número del desarrollador en formato JID
      const ownerJid = '34641307273@s.whatsapp.net';
      
      // Mensaje a enviar al desarrollador
      const alertMessage = `[Alerta de Bot] Un usuario reportó un problema.\n\nUsuario: ${m.sender}\nMensaje: ${text}`;
      
      // Enviar el mensaje de alerta al desarrollador
      await conn.sendMessage(ownerJid, { text: alertMessage });

      // Responder al usuario que reportó el problema
      await m.reply('He notificado a soporte sobre este inconveniente. Por favor, espera mientras resuelven el problema.');
      return;
    }
    // --- Fin de la lógica añadida ---


    // Cargar datos de pagos
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

    const cliente = paymentsData[m.sender];
    const clientInfoPrompt = cliente
      ? `El usuario es un cliente existente con los siguientes detalles: Nombre: ${cliente.nombre}, Día de pago: ${cliente.diaPago}, Monto: ${cliente.monto}, Bandera: ${cliente.bandera}. Su estado es ${cliente.suspendido ? 'suspendido' : 'activo'}.`
      : `El usuario no es un cliente existente. Es un cliente potencial.`;

    const historicalChatPrompt = Object.keys(userChatData).length > 0
      ? `Datos previos de la conversación con este usuario: ${JSON.stringify(userChatData)}.`
      : `No hay datos previos de conversación con este usuario.`;

    // Construcción del prompt para la IA
    const personaPrompt = `Eres PayBalance, un asistente virtual profesional para la atención al cliente de Richetti. Tu objetivo es ayudar a los clientes con consultas sobre pagos y servicios. No uses frases como "Estoy aquí para ayudarte", "Como tu asistente...", "Como un asistente virtual" o similares. Ve directo al punto y sé conciso.

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
- PayBalance: Un bot de gestión de clientes para seguimiento de pagos y recordatorios automáticos.
`;

    // Petición a la API IA
    const encodedContent = encodeURIComponent(personaPrompt);
    const encodedText = encodeURIComponent(text);

    const url = `https://apis-starlights-team.koyeb.app/starlight/turbo-ai?content=${encodedContent}&text=${encodedText}`;
    console.log(chalk.yellow('[Chatbot] Enviando petición a IA'));

    const response = await fetch(url);
    if (!response.ok) {
      console.error('[Chatbot] Fallo HTTP:', response.status, response.statusText);
      throw new Error(`Fallo en la API con status ${response.status}`);
    }

    const json = await response.json();

    if (json.content) {
      console.log('[Chatbot] Respuesta IA:', json.content);
      return m.reply(json.content);
    } else {
      console.log('[Chatbot] Respuesta IA sin campo content:', json);
      throw new Error('Respuesta sin resultado de la IA');
    }
  } catch (e) {
    console.error('[❗] Error en el chatbot:', e);
    return m.reply('Lo siento, ocurrió un error al procesar tu solicitud.');
  }
};

// Se elimina el `handler.command` para que se active en cada mensaje.
// export { handler }; // Solo se exporta el handler sin la propiedad command
