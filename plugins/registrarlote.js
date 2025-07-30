import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function handler(m, { conn, text, command, usedPrefix }) {
    const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

    const lines = text.trim().split('\n').filter(line => line.trim() !== '');

    if (lines.length === 0) {
        return m.reply(`*Uso incorrecto del comando:*\nEnvía el comando seguido de la lista de clientes, un cliente por línea.\n\n*Formato por línea:*\n\`\`\`Nombre Número Día de cada mes ($Monto Bandera)\`\`\`\n\n*Ejemplo:*\n\`\`\`${usedPrefix}${command}\nVictoria +569292929292 21 de cada mes ($3000🇨🇱)\nMarcelo +51987654321 10 de cada mes (S/50🇵🇪)\`\`\`\n\n*Nota:* El número debe empezar con '+' y el día de pago debe ser un número (1-31).`);
    }

    let clientsData = {};
    const addedClients = [];
    const failedClients = [];

    try {
        if (fs.existsSync(paymentsFilePath)) {
            clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        } else {
            fs.writeFileSync(paymentsFilePath, JSON.stringify({}, null, 2), 'utf8');
        }

        // Expresión regular para el nuevo formato: "Nombre Número Día de cada de mes ($Monto Bandera)"
        const lineRegex = /^(?<name>.+?)\s+(?<number>\+\d+)\s+(?<day>\d{1,2})\s+de\s+cada\s+\w+\s+\(\s*(?<amount>\$?[\d,.]+)\s*(?<flag>[\u{1F1E6}-\u{1F1FF}]+)\s*\)$/u;

        for (const line of lines) {
            const match = line.match(lineRegex);

            if (!match) {
                failedClients.push(`${line} (Formato incorrecto o faltan datos. Asegúrate de incluir el número, día, monto y bandera en el formato esperado.)`);
                continue;
            }

            const { name: clientName, number: clientNumber, day: diaPagoStr, amount: monto, flag: bandera } = match.groups;
            const diaPago = parseInt(diaPagoStr);

            if (isNaN(diaPago) || diaPago < 1 || diaPago > 31) {
                failedClients.push(`${line} (Día de pago inválido. Debe ser un número entre 1 y 31.)`);
                continue;
            }
            if (clientsData[clientNumber]) {
                failedClients.push(`${line} (Cliente ya existente con ese número.)`);
                continue;
            }

            clientsData[clientNumber] = {
                nombre: clientName.trim(),
                diaPago: diaPago,
                monto: monto.trim(),
                bandera: bandera.trim()
            };
            addedClients.push(clientName.trim());
        }

        fs.writeFileSync(paymentsFilePath, JSON.stringify(clientsData, null, 2), 'utf8');

        let replyMessage = `✅ Clientes añadidos exitosamente (${addedClients.length}): ${addedClients.length > 0 ? addedClients.join(', ') : 'Ninguno'}.\n`;
        if (failedClients.length > 0) {
            replyMessage += `\n❌ Falló la adición de los siguientes clientes (${failedClients.length}):\n${failedClients.map(f => `- ${f}`).join('\n')}`;
        }
        m.reply(replyMessage);

    } catch (e) {
        // console.error('Error al procesar el comando .agregarclientes:', e); // Comentado para limpiar la consola
        m.reply(`❌ Ocurrió un error interno al intentar añadir los clientes en lote. Por favor, reporta este error.`);
    }
}

handler.help = ['agregarclientes'];
handler.tags = ['pagos'];
handler.command = /^(agregarclientes|registrarlote)$/i;
handler.owner = true;