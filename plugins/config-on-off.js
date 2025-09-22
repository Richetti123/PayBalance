import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = path.join(__dirname, '..', 'src', 'commands-state.json');

// Función que lee el estado de los comandos desde el archivo de configuración.
function getCommandsState() {
    try {
        if (fs.existsSync(configFile)) {
            return JSON.parse(fs.readFileSync(configFile, 'utf8'));
        }
    } catch (e) {
        console.error('Error al leer el archivo de estado de comandos:', e);
    }
    // Si el archivo no existe o hay un error, devuelve un objeto vacío.
    return {};
}

// Función que guarda el estado de los comandos en el archivo de configuración.
function saveCommandsState(state) {
    try {
        fs.writeFileSync(configFile, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
        console.error('Error al guardar el archivo de estado de comandos:', e);
    }
}

// Handler principal para el comando de activación/desactivación
export async function handler(m, { conn, text, command, usedPrefix }) {
    // Este comando solo puede ser usado por el dueño del bot.
    if (!m.isOwner) {
        return m.reply('❌ Este comando solo puede ser usado por el dueño del bot.');
    }

    const args = text.split(' ').slice(1);
    const action = args[0]; // 'on' o 'off'
    const commandName = args[1]; // Nombre del comando a afectar

    if (!action || !commandName || (action !== 'on' && action !== 'off')) {
        return m.reply(`*Uso incorrecto del comando:*\nUsa ${usedPrefix}${command} <on|off> <nombre_del_comando>.\nEjemplo: \`\`\`${usedPrefix}${command} off consulta\`\`\``);
    }

    const commandsState = getCommandsState();

    if (action === 'on') {
        if (commandsState[commandName] !== undefined && commandsState[commandName] === true) {
            return m.reply(`✅ El comando *${commandName}* ya está activado.`);
        }
        commandsState[commandName] = true;
        saveCommandsState(commandsState);
        return m.reply(`✅ El comando *${commandName}* ha sido activado.`);
    } else if (action === 'off') {
        if (commandsState[commandName] !== undefined && commandsState[commandName] === false) {
            return m.reply(`🔴 El comando *${commandName}* ya está desactivado.`);
        }
        commandsState[commandName] = false;
        saveCommandsState(commandsState);
        return m.reply(`🔴 El comando *${commandName}* ha sido desactivado.`);
    }
}

// Propiedades para que el bot reconozca el comando
handler.help = ['config <on|off> <comando>'];
handler.tags = ['owner'];
handler.command = /^(config)$/i;
handler.owner = true;
