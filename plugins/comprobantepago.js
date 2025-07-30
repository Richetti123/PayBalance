// plugins/comprobantepago.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const paymentID = text.trim();
    if (!paymentID) {
        return m.reply(`*Uso incorrecto:*\nPor favor, proporciona el ID del comprobante de pago.\nEjemplo: \`\`\`${usedPrefix}${command} comprobante_5217771234567_1678886400000.jpg\`\`\``);
    }

    const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');
    const comprobantesDir = path.join(__dirname, '..', 'src', 'comprobantes'); // Carpeta donde se guardan los comprobantes

    try {
        if (!fs.existsSync(paymentsFilePath)) {
            return m.reply('❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.');
        }
        if (!fs.existsSync(comprobantesDir)) {
            return m.reply('❌ La carpeta de comprobantes (`src/comprobantes`) no existe. Asegúrate de que los comprobantes se estén guardando allí.');
        }

        const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        let foundComprobantePath = null;
        let clientName = 'Desconocido';
        let paymentInfo = 'N/A';

        // Recorrer los clientes y sus pagos para encontrar el ID del comprobante
        for (const phoneNumber in clientsData) {
            const client = clientsData[phoneNumber];
            if (client.pagos && Array.isArray(client.pagos)) {
                for (const pago of client.pagos) {
                    // Si el ID proporcionado coincide exactamente o el nombre del archivo es una subcadena del ID proporcionado
                    // Adaptar la lógica de búsqueda si el ID en pagos.json no es el nombre completo del archivo
                    if (pago.idComprobante === paymentID || (pago.idComprobante && pago.idComprobante.includes(paymentID))) {
                        const expectedFilePath = path.join(comprobantesDir, pago.idComprobante);
                        if (fs.existsSync(expectedFilePath)) {
                            foundComprobantePath = expectedFilePath;
                            clientName = client.nombre || phoneNumber;
                            paymentInfo = `Monto: ${pago.monto || 'N/A'}, Fecha: ${pago.fecha || 'N/A'}`;
                            break; // Se encontró el comprobante, salir del bucle interno
                        }
                    }
                }
            }
            if (foundComprobantePath) break; // Se encontró el comprobante, salir del buucle externo
        }

        if (foundComprobantePath) {
            await conn.sendMessage(m.chat, {
                image: fs.readFileSync(foundComprobantePath),
                caption: `✅ *Comprobante de Pago ID:* \`\`\`${paymentID}\`\`\`\n*Cliente:* ${clientName}\n*Detalles del Pago:* ${paymentInfo}`
            }, { quoted: m });
        } else {
            // Intentar una búsqueda directa por nombre de archivo si no se encontró en pagos.json
            const directFilePath = path.join(comprobantesDir, paymentID);
            if (fs.existsSync(directFilePath)) {
                 await conn.sendMessage(m.chat, {
                    image: fs.readFileSync(directFilePath),
                    caption: `✅ *Comprobante de Pago ID:* \`\`\`${paymentID}\`\`\` (Encontrado directamente en la carpeta, no vinculado en pagos.json)`
                }, { quoted: m });
            } else {
                await m.reply(`❌ No se encontró ningún comprobante de pago con el ID \`\`\`${paymentID}\`\`\` en la base de datos ni en la carpeta de comprobantes.`);
            }
        }

    } catch (e) {
        console.error('Error processing .comprobantepago command:', e);
        m.reply(`❌ Ocurrió un error interno al intentar obtener el comprobante de pago. Por favor, reporta este error.`);
    }
};

handler.help = ['comprobantepago <ID_de_pago>'];
handler.tags = ['pagos', 'avanzado'];
handler.command = /^(comprobantepago)$/i;
handler.owner = true;

export default handler;
