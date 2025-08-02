import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta al archivo pagos.json que se va a sobrescribir
// Asume que pagos.json está en 'src', y este plugin está en 'plugins'
const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

let handler = async (m, { conn, isOwner }) => {
    if (!isOwner) {
        return m.reply(`❌ Solo el propietario puede usar este comando.`);
    }

    // Obtiene el mensaje citado o el mensaje actual
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || '';
    let filename = (q.msg || q).fileName || '';

    // Verifica si el archivo adjunto es un JSON.
    // Se valida por tipo MIME o por la extensión del nombre del archivo.
    if (!mime || (!mime.includes('json') && !filename.endsWith('.json'))) {
        return m.reply(`❗ Por favor, adjunta el archivo \`.json\` de pagos con el comando o responde a un mensaje que lo contenga.`);
    }

    try {
        // Descarga el buffer del archivo
        let buffer = await q.download();
        // Parsea el contenido del buffer a un objeto JavaScript
        let importedData = JSON.parse(buffer.toString('utf8'));

        // Opcional: Validación básica del contenido JSON
        if (typeof importedData !== 'object' || importedData === null || Array.isArray(importedData)) {
            return m.reply('❌ El archivo JSON no parece contener los datos de pagos en el formato de objeto esperado.');
        }

        // Sobrescribe el archivo pagos.json existente con los datos importados
        fs.writeFileSync(paymentsFilePath, JSON.stringify(importedData, null, 2), 'utf8');

        m.reply('✅ Datos de pagos importados y actualizados correctamente en `pagos.json`.');

    } catch (e) {
        console.error('Error al importar pagos:', e);
        m.reply(`❌ Ocurrió un error al importar los datos de pagos: ${e.message}\n Asegúrate de que el archivo adjunto sea un JSON válido y tenga el formato correcto.`);
    }
};

handler.help = ['importarpagos'];
handler.tags = ['owner']; // Solo el propietario puede usarlo
handler.command = /^(importarpagos)$/i;

export { handler };
