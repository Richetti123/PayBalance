import fs from 'fs';

const handler = async (m, { conn }) => {
  try {
    const messageTextLower = m.text.toLowerCase();
    const userChatData = global.db.data.users[m.sender] || {};
    const chatData = global.db.data.chatData || {};
    const faqs = global.db.data.faqs || {};
    const paymentsFilePath = './src/pagos.json';

    console.log('[Consulta] Mensaje recibido:', m.text);

    const askForPrice = ['precio', 'cuanto cuesta', 'costo', 'valor'].some(k => messageTextLower.includes(k));
    const askForInfo = ['más información', 'mas informacion', 'mas info'].some(k => messageTextLower.includes(k));

    if ((askForPrice || askForInfo) && userChatData.lastFaqSentKey) {
      const faqKey = userChatData.lastFaqSentKey;
      const faq = faqs[faqKey];
      console.log('[Consulta] Detectada FAQ previa:', faqKey);

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

    if (!fs.existsSync(paymentsFilePath)) {
      console.error('[Consulta] Archivo pagos.json no encontrado');
      throw new Error('Archivo de pagos no encontrado.');
    }

    const paymentsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    console.log('[Consulta] Datos de pagos cargados');

    const paymentMethods = {
      '🇲🇽': `Para pagar en México:\nCLABE: 706969168872764411\nNombre: Gaston Juarez\nBanco: Arcus Fi`,
      '🇵🇪': `Para pagar en Perú:\nYape: 967699188\nPlin: 955095498\nNombre: Marcelo Gonzales R.`,
      '🇨🇱': `Para pagar en Chile:\nBanco: TEMPO\nCuenta Vista: 111117053067\nNombre: BARINIA VALESKA ZENTENO MERINO\nRUT: 17053067-5\nCorreo: estraxer2002@gmail.com`,
      '🇺🇸': `Para pagar en Estados Unidos:\nPayPal: https://paypal.me/richetti123\nNombre: Marcelo Gonzales R.`,
      '🇦🇷': `Para pagar en Argentina:\nCBU: 4530000800011127480736\nNombre: Gaston Juarez`,
      'Paypal': `Pago internacional (PayPal):\nCorreo: jairg6218@gmail.com\nEnlace: https://paypal.me/richetti123`
    };
    const methodsList = Object.values(paymentMethods).join('\n\n');

    const cliente = paymentsData[m.sender];
    const clientInfoPrompt = cliente
      ? `El usuario es un cliente existente con: Nombre: ${cliente.nombre}, Día de pago: ${cliente.diaPago}, Monto: ${cliente.monto}, País: ${cliente.bandera}. Estado: ${cliente.suspendido ? 'suspendido' : 'activo'}.`
      : `El usuario no es un cliente registrado. Es un posible cliente.`;

    const historicalChatPrompt = Object.keys(userChatData).length
      ? `Historial: ${JSON.stringify(userChatData)}`
      : `Sin historial previo.`;

    const personaPrompt = `Eres CashFlow, un asistente virtual profesional para atención al cliente de Richetti. Tu objetivo es ayudar con consultas sobre pagos y servicios. Sé directo, profesional y conciso.

${clientInfoPrompt}
${historicalChatPrompt}

Métodos de pago disponibles:
${methodsList}

Servicios disponibles:
- MichiBot exclusivo (mensual)
- Bot personalizado (mensual)
- Bot personalizado (único pago)
- CashFlow (gestión de clientes y pagos automáticos)

Instrucciones:
- Si preguntan por precio, pide revisar la lista oficial.
- Si preguntan por fecha de corte o método exacto, indica que lo consulten con su proveedor.
- No inventes precios ni reveles datos privados.`;

    const encodedContent = encodeURIComponent(personaPrompt);
    const encodedText = encodeURIComponent(m.text);
    const url = `https://apis-starlights-team.koyeb.app/starlight/turbo-ai?content=${encodedContent}&text=${encodedText}`;

    console.log('[Consulta] Enviando petición a IA:', url);

    const response = await fetch(url);

    if (!response.ok) {
      console.error('[Consulta] Fallo HTTP:', response.status, response.statusText);
      throw new Error(`Fallo en la API con status ${response.status}`);
    }

    const json = await response.json();

    console.log('[Consulta] Respuesta IA:', json);

    if (json.resultado) {
      return m.reply(json.resultado);
    } else {
      throw new Error('Respuesta sin resultado de la IA');
    }

  } catch (e) {
    console.error('[❗] Error en el comando .consulta:', e);
    return m.reply('Lo siento, no pude procesar tu solicitud en este momento. Detalles: ' + e.message);
  }
};

handler.command = /^consulta$/i;
export { handler };
