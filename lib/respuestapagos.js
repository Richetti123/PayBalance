import fs from 'fs';
import path from 'path';

export async function manejarRespuestaPago(m, conn) {
    const sender = m.sender || m.key?.participant || m.key?.remoteJid;
    if (!sender) return false;

    // Obtener los datos del usuario de la base de datos
    // Asegurarse de que 'user' es un objeto mutable si se va a modificar y guardar
    let userDoc = await new Promise((resolve, reject) => {
        global.db.data.users.findOne({ id: sender }, (err, doc) => {
            if (err) reject(err);
            resolve(doc);
        });
    });

    if (!userDoc) return false; // Si el usuario no existe en la DB, no hay estado de pago que manejar

    // Validar si está esperando respuesta de pago y el mensaje no es del bot
    if (userDoc.awaitingPaymentResponse && !m.key.fromMe) {
        let respuesta = '';

        // --- Extracción de la respuesta del usuario (Prioridad de botones) ---
        if (m.message?.buttonsResponseMessage) {
            // Para botones simples (legacy) o botones de texto
            respuesta = m.message.buttonsResponseMessage.selectedButtonId || m.message.buttonsResponseMessage.selectedDisplayText || '';
        } else if (m.message?.templateButtonReplyMessage) {
            // Para botones de plantilla (quick reply buttons)
            respuesta = m.message.templateButtonReplyMessage.selectedId || m.message.templateButtonReplyMessage.selectedDisplayText || '';
        } else if (m.message?.listResponseMessage) {
            // Para mensajes de lista (seleccionando una fila)
            respuesta = m.message.listResponseMessage.singleSelectReply?.selectedRowId || m.message.listResponseMessage.title || '';
        }
        // Fallback para mensajes de texto normales (escritos por el usuario o respuestas de texto directo de algunos clientes)
        else {
            respuesta = m.message?.conversation || m.message?.extendedTextMessage?.text || '';
        }

        respuesta = respuesta.trim();

        console.log(`[DEBUG - manejarRespuestaPago] Respuesta capturada de ${sender}: "${respuesta}"`); // Línea de depuración

        // --- Lógica para respuestas "1" o "2" ---
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

            // Usar la información del usuario en espera si existe, de lo contrario, la DB
            const cliente = pagosData[userDoc.paymentClientNumber] || {};
            const nombre = cliente.nombre || userDoc.paymentClientName || "cliente";
            const numero = cliente.numero || userDoc.paymentClientNumber || sender.split('@')[0]; // Asegurar solo el número

            const chatId = m.chat || sender;

            if (respuesta === "1") {
                await conn.sendMessage(chatId, {
                    text: `✅ *Si ya ha realizado su pago, por favor enviar foto o documento de su pago con el siguiente texto:*\n\n*"Aquí está mi comprobante de pago"* 📸`
                });
            } else if (respuesta === "2") {
                await conn.sendMessage(chatId, {
                    text: `⚠️ En un momento se comunicará mi creador contigo.`
                });
                const adminJid = "5217771303481@s.whatsapp.net"; // Asegúrate de que este JID sea correcto (número@s.whatsapp.net)
                const adminMessage = `👋 Hola creador, *${nombre}* (${numero}) tiene problemas con su pago. Por favor comunícate con él/ella.`;
                try {
                    await conn.sendMessage(adminJid, { text: adminMessage });
                } catch (error) {
                    console.error('Error enviando mensaje al admin:', error);
                }
            }

            // Resetear el estado de espera y guardar en la base de datos
            userDoc.awaitingPaymentResponse = false;
            userDoc.paymentClientName = '';
            userDoc.paymentClientNumber = '';
            
            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: sender }, { $set: userDoc }, {}, (err) => {
                    if (err) {
                        console.error('Error actualizando usuario en DB:', err);
                        return reject(err);
                    }
                    console.log(`[DEBUG] Estado de awaitingPaymentResponse para ${sender} reseteado.`);
                    resolve();
                });
            });

            return true; // Mensaje manejado
        }

        // Si es un número puro pero no 1 ni 2 (y el bot sigue esperando respuesta)
        // Esta condición debe ir DESPUÉS de la de '1' o '2'
        if (/^\d+$/.test(respuesta)) {
            await conn.sendMessage(m.chat || sender, {
                text: 'Por favor responde solo con 1 (He realizado el pago) o 2 (Necesito ayuda con mi pago).'
            });
            return true; // Mensaje manejado (respuesta inválida)
        }
        
        // --- Lógica para el comprobante de pago (cuando el usuario envía la frase) ---
        // Nota: Esta parte también existe en 'handleIncomingMedia'.
        // Asegúrate de que no haya duplicidad o define claramente dónde se manejará esto.
        // Aquí se maneja si el texto "Aquí está mi comprobante de pago" viene en el caption de una imagen
        // o como un mensaje de texto plano, mientras el bot espera una respuesta.
        const isComprobantePhrase = respuesta.includes("Aquí está mi comprobante de pago");

        if (m.message?.imageMessage && isComprobantePhrase) {
            const chatId = m.chat || sender;
            await conn.sendMessage(chatId, {
                text: '✅ Comprobante recibido. Gracias por tu pago.'
            });

            // Resetear el estado de espera y guardar en la base de datos
            userDoc.awaitingPaymentResponse = false;
            userDoc.paymentClientName = '';
            userDoc.paymentClientNumber = '';
            
            await new Promise((resolve, reject) => {
                global.db.data.users.update({ id: sender }, { $set: userDoc }, {}, (err) => {
                    if (err) {
                        console.error('Error actualizando usuario en DB tras comprobante:', err);
                        return reject(err);
                    }
                    console.log(`[DEBUG] Estado de awaitingPaymentResponse para ${sender} reseteado tras comprobante.`);
                    resolve();
                });
            });

            return true; // Mensaje de comprobante manejado
        }
        
        // Si el usuario está esperando una respuesta y envía algo que no es 1, 2, o un comprobante explícito,
        // no se hace nada y la función retorna false, permitiendo que otros handlers actúen
        // o simplemente ignorando el mensaje (lo cual es deseable para evitar spam si solo espera 1 o 2).
        return false;
    }

    return false; // El usuario no está esperando una respuesta de pago o el mensaje es del bot
}
