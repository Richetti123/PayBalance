// plugins/derivados.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const derivadosFilePath = path.join(__dirname, '..', 'src', 'derivados.json');

// Función auxiliar para cargar derivados
const loadDerivados = () => {
    if (fs.existsSync(derivadosFilePath)) {
        return JSON.parse(fs.readFileSync(derivadosFilePath, 'utf8'));
    }
    return {};
};

// Función auxiliar para guardar derivados
const saveDerivados = (derivados) => {
    fs.writeFileSync(derivadosFilePath, JSON.stringify(derivados, null, 2), 'utf8');
};

let handler = async (m, { conn, text, command, usedPrefix }) => {
    if (!m.isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);

    const args = text.trim().split(/\s+/);
    const subCommand = args[0] ? args[0].toLowerCase() : '';

    if (!subCommand) {
        return m.reply(`*Uso correcto de ${usedPrefix}${command}:*\n` +
                       `\`\`\`${usedPrefix}${command} añadir <nombre>\`\`\` - Añade un nuevo derivado.\n` +
                       `\`\`\`${usedPrefix}${command} eliminar <nombre>\`\`\` - Elimina un derivado.\n` +
                       `\`\`\`${usedPrefix}${command} ver\`\`\` - Muestra todos los derivados registrados.`);
    }

    let derivados = loadDerivados();

    switch (subCommand) {
        case 'añadir':
        case 'add':
            const newDerivadoName = args.slice(1).join(' ');
            if (!newDerivadoName) {
                return m.reply(`*Uso incorrecto:*\n\`\`\`${usedPrefix}${command} añadir <nombre_del_derivado>\`\`\``);
            }
            if (derivados[newDerivadoName.toLowerCase()]) {
                return m.reply(`❌ El derivado *${newDerivadoName}* ya existe.`);
            }
            derivados[newDerivadoName.toLowerCase()] = {
                nombre: newDerivadoName,
                fechaCreacion: new Date().toISOString().split('T')[0], // YYYY-MM-DD
                clientesAsociados: [] // Puedes expandir esto para asociar clientes más adelante
            };
            saveDerivados(derivados);
            m.reply(`✅ Derivado *${newDerivadoName}* añadido exitosamente.`);
            break;

        case 'eliminar':
        case 'del':
            const derivadoToDelete = args.slice(1).join(' ');
            if (!derivadoToDelete) {
                return m.reply(`*Uso incorrecto:*\n\`\`\`${usedPrefix}${command} eliminar <nombre_del_derivado>\`\`\``);
            }
            if (!derivados[derivadoToDelete.toLowerCase()]) {
                return m.reply(`❌ El derivado *${derivadoToDelete}* no se encontró.`);
            }
            delete derivados[derivadoToDelete.toLowerCase()];
            saveDerivados(derivados);
            m.reply(`✅ Derivado *${derivadoToDelete}* eliminado exitosamente.`);
            break;

        case 'ver':
        case 'list':
            let derivadosList = Object.values(derivados);
            if (derivadosList.length === 0) {
                return m.reply('ℹ️ No hay derivados registrados en este momento.');
            }
            let message = '📊 *Lista de Derivados:*\n\n';
            derivadosList.forEach((derivado, index) => {
                message += `${index + 1}. *${derivado.nombre}*\n`;
                message += `   Fecha de Creación: ${derivado.fechaCreacion}\n`;
                message += `   Clientes Asociados: ${derivado.clientesAsociados.length}\n`; // Mostrar el conteo
                if (index < derivadosList.length - 1) message += '\n';
            });
            m.reply(message);
            break;

        default:
            m.reply(`*Subcomando inválido:*\nUsa \`\`\`${usedPrefix}${command} añadir | eliminar | ver\`\`\`.`);
    }
};

handler.help = ['derivados <añadir|eliminar|ver> [nombre]'];
handler.tags = ['config'];
handler.command = /^(derivados)$/i;
handler.owner = true;

export default handler;
