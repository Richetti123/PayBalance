import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configFile = path.join(__dirname, '..', 'src', 'commands-state.json');

// Función que lee el estado de los comandos, ahora exportada
export function getCommandsState() {
    try {
        if (fs.existsSync(configFile)) {
            return JSON.parse(fs.readFileSync(configFile, 'utf8'));
        }
    } catch (e) {
        console.error('Error al leer el archivo de estado de comandos:', e);
    }
    return {};
}

// Función que guarda el estado de los comandos, también exportada por si la necesitas en el futuro
export function saveCommandsState(state) {
    try {
        fs.writeFileSync(configFile, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
        console.error('Error al guardar el archivo de estado de comandos:', e);
    }
}

// Handler principal para el comando de activación/desactivación
export async function handler(m, { conn, text, command, usedPrefix }) {
    // 🔍 AÑADIDOS LOGS PARA DEPURAR
    console.log('-----------------------------------');
    console.log('DEBUG: Invocando el comando TOGGLE');
    console.log('DEBUG: Texto completo recibido:', text);
    console.log('DEBUG: Comando recibido:', command);
    console.log('-----------------------------------');
    
    if (!m.isOwner) {
        return m.reply('❌ Este comando solo puede ser usado por el dueño del bot.');
    }

    const args = text.split(' ').slice(1);
    const action = args[0];
    const commandName = args[1];

    // 🔍 LOGS PARA MOSTRAR LOS ARGUMENTOS PARSEADOS
    console.log('DEBUG: Argumentos parseados:', args);
    console.log('DEBUG: Acción (on/off):', action);
    console.log('DEBUG: Nombre del comando:', commandName);
    console.log('-----------------------------------');

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

handler.help = ['toggle <on|off> <comando>'];
handler.tags = ['owner'];
handler.command = /^(toggle)$/i;
handler.owner = true;
