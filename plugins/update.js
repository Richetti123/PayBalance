import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const handler = async (m, { conn, text, isOwner }) => {
    if (!isOwner) {
        return m.reply('❌ Comando no disponible, solo para el propietario del bot.');
    }
    
    try {
        await m.reply('🔄 Actualizando archivos del bot, por favor espera...');
        const stdout = execSync('git pull');
        let message = stdout.toString();

        if (message.includes('Already up to date.')) {
            message = '✅ El bot ya está actualizado a la versión más reciente.';
        } else if (message.includes('Updating')) {
            message = '✅ El bot ha sido actualizado con éxito. Reinicia el bot si es necesario.';
        }

        conn.reply(m.chat, message, m);
    } catch (error) {
        console.error('Error al actualizar el bot:', error);
        
        try {
            const status = execSync('git status --porcelain').toString();
            if (status.length > 0) {
                const conflictedFiles = status
                    .split('\n')
                    .filter(line => line.trim() !== '' && !line.includes('.npm/') && !line.includes('.cache/') && !line.includes('tmp/') && !line.includes('GataBotSession/') && !line.includes('npm-debug.log'))
                    .map(line => `*→ ${line.slice(3).trim()}*`);

                if (conflictedFiles.length > 0) {
                    const errorMessage = `❌ Se han encontrado cambios locales que entran en conflicto con la actualización. Resuelve los conflictos manualmente o reinstala el bot.\n\n*Archivos en conflicto:*\n${conflictedFiles.join('\n')}`;
                    await conn.reply(m.chat, errorMessage, m);
                } else {
                    await conn.reply(m.chat, `❌ Ocurrió un error al intentar actualizar. Detalles del error: ${error.message}`, m);
                }
            } else {
                await conn.reply(m.chat, `❌ Ocurrió un error al intentar actualizar. Detalles del error: ${error.message}`, m);
            }
        } catch (innerError) {
            console.error('Error al obtener el estado de Git:', innerError);
            await m.reply('❌ Ocurrió un error fatal al intentar actualizar. Verifica el log del servidor.');
        }
    }
};

handler.command = /^(update|actualizar|gitpull)$/i;
