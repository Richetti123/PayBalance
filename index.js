import { join, dirname } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { setupMaster, fork } from 'cluster';
import { watchFile, unwatchFile } from 'fs';
import cfonts from 'cfonts'; // Para los títulos bonitos
import { createInterface } from 'readline'; // Para interacción por consola
import os from 'os'; // Para información del sistema
import { promises as fsPromises } from 'fs'; // Para leer package.json
import chalk from 'chalk'; // Para colores en la consola

// Determina __dirname y crea require para módulos comunes como package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(__dirname);

// Intenta cargar la información del paquete (nombre, autor, versión)
let packageJson = {};
try {
    packageJson = require(join(__dirname, './package.json'));
} catch (e) {
    console.error(chalk.red('❌ No se pudo cargar package.json. Asegúrate de que exista en la raíz del bot.'));
}

const rl = createInterface(process.stdin, process.stdout); // Interfaz para la consola

// --- Branding inicial ---
cfonts.say(packageJson.name || 'Logistic\nBot', {
    font: 'chrome',
    align: 'center',
    gradient: ['red', 'magenta']
});
cfonts.say(`Por ${packageJson.author || 'Autor Desconocido'}`, {
    font: 'console',
    align: 'center',
    gradient: ['red', 'magenta']
});

// --- Manejo de errores no capturados del proceso principal ---
process.on('uncaughtException', (err) => {
    if (err.code === 'ENOSPC') {
        console.error(chalk.red('⚠️ ERROR: ENOSPC (sin espacio o límite de watchers alcanzado). Reiniciando...'));
    } else {
        console.error(chalk.red('⚠️ ERROR no capturado en el proceso principal:'), err);
    }
    process.exit(1); // Salir para que el orquestador lo reinicie si es el caso
});

let isRunning = false; // Bandera para controlar si el proceso hijo está activo

// --- Función para iniciar/reiniciar el proceso del bot (main.js) ---
async function start(file) {
    if (isRunning) return; // Si ya está corriendo, no hacer nada
    isRunning = true;

    const botFilePath = join(__dirname, file);
    let args = [botFilePath, ...process.argv.slice(2)]; // Argumentos para el proceso hijo

    console.log(chalk.blueBright(`\n✨ Iniciando ${packageJson.name || 'Bot'}...`));

    // Configura el master de cluster para ejecutar el archivo del bot
    setupMaster({
        exec: args[0], // Ruta al script principal del bot (main.js)
        args: args.slice(1), // Otros argumentos de línea de comandos
    });

    let p = fork(); // Crea un nuevo proceso hijo

    // --- Escucha mensajes del proceso hijo ---
    p.on('message', data => {
        switch (data) {
            case 'reset': // Si el hijo envía 'reset', lo mata para reiniciarlo
                console.log(chalk.yellow('\n🔄 Recibido comando de reinicio desde el bot.'));
                p.process.kill();
                isRunning = false;
                start.apply(this, arguments); // Reinicia el bot
                break;
            case 'uptime': // Si el hijo pide el uptime del proceso maestro
                p.send(process.uptime()); // Envía el tiempo de actividad del proceso maestro
                break;
            // Puedes añadir más casos de comunicación aquí si tu bot los necesita
        }
    });

    // --- Manejo del evento de salida del proceso hijo (reiniciador) ---
    p.on('exit', async (code, signal) => {
        isRunning = false; // El proceso hijo ha terminado
        console.error(chalk.red(`\n❌ El bot (proceso hijo) ha terminado. Código de salida: ${code}, Señal: ${signal || 'ninguna'}.`));

        // *** LÓGICA DE REINICIO PRINCIPAL ***
        // Reinicia automáticamente main.js si falla o sale por alguna razón
        // (a menos que el código de salida sea 0, lo que indica un cierre correcto).
        if (code === 0) {
            console.log(chalk.green('✅ El bot ha salido correctamente. No se reiniciará automáticamente.'));
            // Aquí podrías decidir si quieres un comportamiento diferente para una salida limpia
            // Por ejemplo, esperar input para reiniciar manualmente.
        } else {
            console.log(chalk.yellow('🔄 Reiniciando el bot debido a un cierre inesperado...'));
            await start('main.js'); // Llama a 'start' para reiniciar el bot
        }

        // Si el proceso no salió con código 0 y no se reinicia directamente,
        // o para manejar re-inicios por cambios en el archivo (opcional, como en tu original)
        // Puedes descomentar y ajustar esta parte si quieres que se reinicie solo al detectar cambios
        // en el archivo si no es un reinicio inmediato por error.
        /*
        if (code !== 0) {
            watchFile(args[0], () => {
                unwatchFile(args[0]);
                console.log(chalk.yellow(`\n♻️ Detectado cambio en ${file}. Reiniciando...`));
                start(file);
            });
        }
        */
    });

    // --- Muestra información de inicio ---
    const ramInGB = os.totalmem() / (1024 * 1024 * 1024);
    const freeRamInGB = os.freemem() / (1024 * 1024 * 1024);
    const currentTime = new Date().toLocaleString();
    let lineM = '⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ ⋯ 》';

    console.log(chalk.yellow(`╭${lineM}
┊${chalk.blueBright('╭┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')}
┊${chalk.blueBright('┊')} ${chalk.blue.bold(`🟢 INFORMACIÓN DEL BOT:`)}
┊${chalk.blueBright('┊')}${chalk.cyan(`🤖 Nombre: ${packageJson.name || 'No definido'}`)}
┊${chalk.blueBright('┊')}${chalk.cyan(`🔢 Versión: ${packageJson.version || 'N/A'}`)}
┊${chalk.blueBright('┊')}${chalk.cyan(`✏️ Autor: ${packageJson.author || 'No definido'}`)}
┊${chalk.blueBright('┊')}${chalk.cyan(`⏰ Hora de Inicio:`)}
┊${chalk.blueBright('┊')}${chalk.cyan(`${currentTime}`)}
┊${chalk.blueBright('╰┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅')}
╰${lineM}`));

    // Mantiene el proceso maestro activo
    setInterval(() => {}, 1000);

    // --- Interacción con la consola (reenvía input al proceso hijo) ---
    // Puedes comentar estas líneas si no quieres interactuar con el bot directamente por la consola
    if (!rl.listenerCount()) rl.on('line', line => {
        p.emit('message', line.trim());
    });
}

// --- Iniciar el bot ---
start('main.js');
