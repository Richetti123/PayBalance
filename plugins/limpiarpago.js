import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let handler = async (m, { conn, text, command, usedPrefix }) => {
    // Definimos la ruta del archivo de pagos.
    const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

    // Verificamos si se proporcionó un nombre
    if (!text) {
        return m.reply(`*Uso incorrecto del comando:*\nPor favor, proporciona el nombre del cliente a eliminar.\nEjemplo: \`\`\`${usedPrefix}${command} Marcelo\`\`\`\n\n*¡ADVERTENCIA!* Si hay múltiples clientes con el mismo nombre, solo se eliminará el *primer* cliente encontrado.`);
    }

    const nameToDelete = text.trim(); // El texto completo es el nombre a eliminar

    try {
        let clientsData = {};
        // Intentamos leer el archivo pagos.json. Si no existe, no hay nada que borrar.
        if (fs.existsSync(paymentsFilePath)) {
            clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
        } else {
            return m.reply(`❌ La base de datos de pagos (${path.basename(paymentsFilePath)}) no existe. No hay clientes para eliminar.`);
        }

        let found = false;
        let deletedClientName = '';
        let deletedClientNumber = '';
        
        // Iterar sobre las claves (números de teléfono) para encontrar el nombre
        // Se itera de esta forma porque la clave es el número, no el nombre.
        for (const numberKey in clientsData) {
            // Comparar nombres ignorando mayúsculas/minúsculas para una búsqueda más flexible
            if (clientsData[numberKey].nombre.toLowerCase() === nameToDelete.toLowerCase()) {
                deletedClientName = clientsData[numberKey].nombre; // Guardamos el nombre real del cliente
                deletedClientNumber = numberKey; // Guardamos el número del cliente
                delete clientsData[numberKey]; // Eliminamos la entrada usando su clave (el número)
                found = true;
                break; // Detenemos la búsqueda después de eliminar el primer coincidente
            }
        }

        if (found) {
            // Guardamos los datos actualizados en el archivo
            fs.writeFileSync(paymentsFilePath, JSON.stringify(clientsData, null, 2), 'utf8');
            m.reply(`✅ Cliente *${deletedClientName}* (${deletedClientNumber}) eliminado exitosamente de la base de datos de pagos.`);
        } else {
            m.reply(`❌ El cliente con el nombre \`\`\`${nameToDelete}\`\`\` no se encontró en la base de datos de pagos.`);
        }

    } catch (e) {
        console.error('Error al procesar el comando .limpiarpago:', e);
        m.reply(`❌ Ocurrió un error interno al intentar eliminar el cliente. Por favor, reporta este error.`);
    }
};

handler.help = ['limpiarpago <nombre_del_cliente>'];
handler.tags = ['pagos'];
handler.command = /^(limpiarpago|eliminarcliente)$/i; // Puedes usar .limpiarpago o .eliminarcliente
handler.owner = true; // Solo el dueño del bot puede usar este comando

export default handler;