export async function handler(m, { conn, text, command, usedPrefix }) {
    if (!m.isOwner) {
        return m.reply('❌ Lo siento, este comando solo puede ser usado por el propietario del bot.');
    }

    let userDoc = await new Promise((resolve, reject) => {
        global.db.data.users.findOne({ id: m.sender }, (err, doc) => {
            if (err) reject(err);
            resolve(doc);
        });
    });

    if (userDoc) {
        global.db.data.users.update({ id: m.sender }, { $set: { chatState: 'initial' } }, {}, (err, numReplaced) => {
            if (err) {
                console.error("Error al restablecer chatState:", err);
                return m.reply('❌ Ocurrió un error al intentar restablecer el estado del chat.');
            }
            m.reply('✅ El estado de tu chat ha sido restablecido a "initial". El bot ahora debería responderte con el mensaje de bienvenida y los botones de FAQ.');
        });
    } else {
        m.reply('❌ No se encontró tu perfil en la base de datos. Ya estás en estado "initial".');
    }
}

export const name = 'reset';
export const description = 'Restablece el estado de chat del propietario para probar el mensaje de bienvenida.';
export const usage = '.reset';
