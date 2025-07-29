import fs from 'fs';
import path from 'path';

export async function manejarRespuestaPago(m, conn) { 
  const sender = m.sender || m.key?.participant || m.key?.remoteJid;
  if (!sender) return false;

  const user = global.db?.data?.users?.[sender];
  if (!user) return false;

  // Validar si está esperando respuesta de pago
  if (user.awaitingPaymentResponse && !m.key.fromMe) {
    const texto =
      m.text?.toString() ||
      m.message?.conversation?.toString() ||
      m.message?.extendedTextMessage?.text?.toString() ||
      '';

    const respuesta = texto.trim();

    // Si es "1" o "2"
    if (respuesta === "1" || respuesta === "2") {
      const pagosPath = path.join(process.cwd(), 'src', 'pagos.json');
      let pagosData = {};
      try {
        if (fs.existsSync(pagosPath)) {
          pagosData = JSON.parse(fs.readFileSync(pagosPath, 'utf8'));
        }
      } catch (e) {
        console.error('Error leyendo pagos.json:', e);
      }

      const cliente = pagosData[user.paymentClientNumber] || {};
      const nombre = cliente.nombre || user.paymentClientName || "cliente";
      const numero = cliente.numero || user.paymentClientNumber || sender;

      const chatId = m.chat || sender;

      if (respuesta === "1") {
        await conn.sendMessage(chatId, {
          text: `✅ *Si ya ha realizado su pago, por favor enviar foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸`
        });
      } else if (respuesta === "2") {
        await conn.sendMessage(chatId, {
          text: `⚠️ En un momento se comunicará mi creador contigo.`
        });
        const adminJid = "5217771303481@s.whatsapp.net";
        const adminMessage = `👋 Hola creador, *${nombre}* (${numero}) tiene problemas con su pago. Por favor comunícate con él/ella.`;
        try {
          await conn.sendMessage(adminJid, { text: adminMessage });
        } catch (error) {
          console.error('Error enviando mensaje al admin:', error);
        }
      }

      return true;
    }

    // Si es número pero NO es 1 ni 2 (ej: 0,3,4,5,6,...)
    if (/^\d+$/.test(respuesta)) {
      await conn.sendMessage(m.chat || sender, {
        text: 'Por favor responde solo con 1 (He realizado el pago) o 2 (Necesito ayuda con mi pago).'
      });
      return true;
    }

    // Si el mensaje es imagen con texto comprobante
    if (
      m.message?.imageMessage &&
      (
        texto.includes("Aquí está mi comprobante de pago") ||
        m.message?.extendedTextMessage?.text?.includes("Aquí está mi comprobante de pago")
      )
    ) {
      const chatId = m.chat || sender;
      await conn.sendMessage(chatId, {
        text: '✅ Comprobante recibido. Gracias por tu pago.'
      });

      delete user.awaitingPaymentResponse;
      delete user.paymentClientName;
      delete user.paymentClientNumber;

      return true;
    }

    // Para cualquier otro mensaje distinto, NO responder para no molestar
    return false;
  }

  return false;
}
