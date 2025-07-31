import fs from 'fs';
import path from 'path';

const BOT_OWNER_JID = '5217771303481@s.whatsapp.net';
const chatDataPath = path.join(path.resolve(), 'src', 'chat_data.json');

const loadChatData = () => {
    if (fs.existsSync(chatDataPath)) {
        return JSON.parse(fs.readFileSync(chatDataPath, 'utf8'));
    }
    return {};
};

export async function handler(m, { conn }) {
    try {
        const chatData = loadChatData();
        const userChatHistory = chatData[m.sender] || {};
        const userName = m.pushName || m.sender.split('@')[0];

        let summary = `🚨 *Solicitud de Contacto con el Administrador* 🚨\n\n`;
        summary += `*👤 Cliente:* ${userName}\n`;
        summary += `*📞 Número:* +${m.sender.split('@')[0]}\n`;
        summary += `*Conversación:* \n`;
        
        for (const key in userChatHistory) {
            summary += `  - ${key}: ${userChatHistory[key]}\n`;
        }

        if (Object.keys(userChatHistory).length === 0) {
            summary += `  (No se encontraron datos previos de la conversación)`;
        }

        await conn.sendMessage(BOT_OWNER_JID, { text: summary });

        await m.reply('✅ He notificado al administrador de tu solicitud. Se pondrá en contacto contigo lo antes posible.');
        
        // Limpiar el estado del chat del usuario
        if (chatData[m.sender]) {
            delete chatData[m.sender];
            fs.writeFileSync(chatDataPath, JSON.stringify(chatData, null, 2), 'utf8');
        }

    } catch (e) {
        console.error('Error al notificar al administrador:', e);
        await m.reply('❌ Lo siento, ocurrió un error al intentar notificar al administrador. Por favor, inténtalo de nuevo más tarde.');
    }
}
