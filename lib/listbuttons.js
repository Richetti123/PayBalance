import fs from 'fs';
import path from 'path';

const configBotPath = path.join(process.cwd(), 'src', 'configbot.json');

const loadConfigBot = () => {
    if (fs.existsSync(configBotPath)) {
        return JSON.parse(fs.readFileSync(configBotPath, 'utf8'));
    }
    return { faqs: {} };
};

export async function handleListButtonResponse(m, conn) {
    // Verificar si el mensaje es una respuesta de un botón de lista
    const selectedRowId = m.message?.listResponseMessage?.singleSelectReply?.selectedRowId;
    if (!selectedRowId) {
        return false;
    }

    // El ID del botón de lista debe tener el formato `!getfaq <clave_de_faq>`
    const prefix = '!getfaq';
    if (!selectedRowId.startsWith(prefix)) {
        return false;
    }

    // Extraer la clave de la FAQ del ID del botón
    const faqKey = selectedRowId.replace(prefix, '').trim();
    const currentConfig = loadConfigBot();
    const faq = currentConfig.faqs[faqKey];

    if (faq) {
        // Formatear la respuesta con la descripción y el precio
        const responseText = `*${faq.pregunta}*\n\n${faq.respuesta}\n\n*Precio:* ${faq.precio}`;
        await conn.sendMessage(m.chat, { text: responseText }, { quoted: m });
        
        // Guardar el estado para saber sobre qué servicio preguntó el usuario (opcional, para futuras consultas de precio)
        if (global.db.data.users) {
            let userDoc = await new Promise((resolve, reject) => {
                global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
                    if (err) return reject(err);
                    resolve(doc);
                });
            });

            if (userDoc) {
                userDoc.lastFaqSentKey = faqKey;
                await new Promise((resolve, reject) => {
                    global.db.data.users.update({ id: m.sender }, { $set: userDoc }, {}, (err) => {
                        if (err) return reject(err);
                        resolve();
                    });
                });
            }
        }
        
        return true; // Indica que la respuesta del botón fue manejada
    }
    
    return false; // No se encontró una FAQ que coincida
}
