import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const paymentsFilePath = path.join(__dirname, '..', 'src', 'pagos.json');

// Función para cargar los datos de pagos
const loadPaymentsData = () => {
    if (fs.existsSync(paymentsFilePath)) {
        return JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
    }
    return {};
};

// Función para guardar los datos de pagos
const savePaymentsData = (data) => {
    fs.writeFileSync(paymentsFilePath, JSON.stringify(data, null, 2), 'utf8');
};

let handler = async (m, { conn, text, command, usedPrefix, isOwner }) => {
    if (!isOwner) {
        return m.reply(`❌ Solo el propietario puede usar este comando.`);
    }

    const args = text.split(' ').map(arg => arg.trim()).filter(arg => arg !== '');
    const paymentsData = loadPaymentsData();

    // Función auxiliar para normalizar números
    const normalizeNumber = (inputNumber) => {
        let cleanNumber = inputNumber.replace(/[^0-9]/g, ''); // Limpia solo dígitos
        // Asume que números de 10 dígitos son MX sin 521, los agrega
        if (cleanNumber.length === 10) {
            cleanNumber = '521' + cleanNumber;
        } 
        // Si ya tiene 52 o 521, no hace nada extra
        // Si es de 11 digitos y no empieza con 52 (e.g., un número de EUA con 1 inicial), añade el prefijo 1.
        else if (cleanNumber.length === 11 && !cleanNumber.startsWith('52')) {
            // Podrías ajustar esto para otros prefijos de país si es necesario
            if (cleanNumber.startsWith('1')) { // Asumiendo que es un número de 11 dígitos de Norteamérica
                cleanNumber = '1' + cleanNumber; // Esto es una corrección si ya tiene el 1 pero no el +
            } else {
                // Caso genérico para números que no encajan en 521 o 1, intenta solo mantenerlo
            }
        }
        // Si ya tiene + y el prefijo de país, solo asegura el formato
        else if (cleanNumber.length > 10 && cleanNumber.startsWith('52')) {
            // Ya debería estar bien
        }
        // Si el número es muy largo o muy corto después de la limpieza, puede ser inválido
        if (!cleanNumber.match(/^\d{10,15}$/)) { 
            return null; // Indica que no es un número válido después de la normalización
        }
        return cleanNumber;
    };


    switch (command.toLowerCase()) {
        case 'cliente':
        case 'vercliente':
            if (args.length === 0) {
                return m.reply(`*Uso correcto:* ${usedPrefix}${command} [número_cliente]\nEj: ${usedPrefix}${command} 5217771234567`);
            }
            let clientNumberToView = normalizeNumber(args[0]);
            if (!clientNumberToView) {
                return m.reply('❌ Número de cliente inválido. Debe ser solo dígitos y tener una longitud razonable.');
            }
            const clientJidToView = `${clientNumberToView}@s.whatsapp.net`;

            if (paymentsData[clientJidToView]) {
                const client = paymentsData[clientJidToView];
                let clientInfo = `*👤 Información del Cliente:*\n\n`;
                clientInfo += `*• Nombre:* ${client.nombre}\n`;
                clientInfo += `*• Número:* ${clientNumberToView}\n`;
                clientInfo += `*• Día de Pago:* ${client.diaPago}\n`;
                clientInfo += `*• Monto:* ${client.monto}\n`;
                clientInfo += `*• Bandera:* ${client.bandera}\n`;
                clientInfo += `*• Estado:* ${client.suspendido ? '🔴 Suspendido' : '🟢 Activo'}\n`;
                clientInfo += `*• Último Pago Verificado:* ${client.ultimoPagoVerificado || 'N/A'}\n`;
                clientInfo += `*• Clientes en Lote:* ${client.clientesLote ? Object.keys(client.clientesLote).length : 'N/A'}\n`;
                clientInfo += `*• Fecha de Registro:* ${new Date(client.fechaRegistro).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}\n`;
                
                if (client.clientesLote && Object.keys(client.clientesLote).length > 0) {
                    clientInfo += `\n*Integrantes del Lote:*\n`;
                    for (const numLote in client.clientesLote) {
                        clientInfo += `  - ${client.clientesLote[numLote].nombre} (${numLote.replace('@s.whatsapp.net', '')})\n`;
                    }
                }

                await m.reply(clientInfo);
            } else {
                await m.reply(`❌ No se encontró ningún cliente con el número ${clientNumberToView}.`);
            }
            break;

        case 'editarcliente':
            if (args.length < 3) {
                return m.reply(`*Uso correcto:* ${usedPrefix}${command} [número_cliente] [campo] [nuevo_valor]\nCampos: nombre, diaPago, monto, bandera\nEj: ${usedPrefix}${command} 5217771234567 nombre Juan Pérez`);
            }
            let editNumber = normalizeNumber(args[0]);
            if (!editNumber) {
                return m.reply('❌ Número de cliente inválido para editar.');
            }
            const editJid = `${editNumber}@s.whatsapp.net`;

            if (!paymentsData[editJid]) {
                return m.reply(`❌ No se encontró ningún cliente con el número ${editNumber} para editar.`);
            }

            const fieldToEdit = args[1].toLowerCase();
            const newValue = args.slice(2).join(' ');

            const validFields = ['nombre', 'diapago', 'monto', 'bandera'];
            if (!validFields.includes(fieldToEdit)) {
                return m.reply(`❌ Campo '${fieldToEdit}' inválido. Campos permitidos: nombre, diaPago, monto, bandera.`);
            }

            // Validaciones específicas por campo
            if (fieldToEdit === 'diapago') {
                const day = parseInt(newValue, 10);
                if (isNaN(day) || day < 1 || day > 31) {
                    return m.reply('❌ El día de pago debe ser un número entre 1 y 31.');
                }
                paymentsData[editJid].diaPago = day;
            } else if (fieldToEdit === 'monto') {
                const amount = parseFloat(newValue);
                if (isNaN(amount) || amount <= 0) {
                    return m.reply('❌ El monto debe ser un número positivo.');
                }
                paymentsData[editJid].monto = amount.toFixed(2); // Formatea a 2 decimales
            } else {
                paymentsData[editJid][fieldToEdit] = newValue;
            }

            savePaymentsData(paymentsData);
            await m.reply(`✅ Cliente ${paymentsData[editJid].nombre} (${editNumber}) actualizado: campo '${fieldToEdit}' ahora es '${newValue}'.`);
            break;

        case 'eliminarcliente':
            if (args.length === 0) {
                return m.reply(`*Uso correcto:*\n${usedPrefix}${command} [número_cliente]\n*O*\n${usedPrefix}${command} [nombre_cliente]\n\nEjemplos:\n${usedPrefix}${command} 5217771234567\n${usedPrefix}${command} Juan Perez\n\n*¡ADVERTENCIA!* Si eliminas por nombre y hay duplicados, solo se eliminará el *primer* cliente encontrado.`);
            }

            let identifier = args.join(' ').trim(); // Puede ser un número o un nombre
            let clientToDelete = null;
            let deleteType = ''; // 'number' or 'name'
            let clientJidToDelete = null;

            // 1. Intentar eliminar por número (es el método más preciso)
            let potentialNumber = normalizeNumber(identifier);
            if (potentialNumber) { // Si se normalizó a un número válido
                const jidFromNumber = `${potentialNumber}@s.whatsapp.net`;
                if (paymentsData[jidFromNumber]) {
                    clientToDelete = paymentsData[jidFromNumber];
                    clientJidToDelete = jidFromNumber;
                    deleteType = 'número';
                }
            }

            // 2. Si no se encontró por número, intentar por nombre
            if (!clientToDelete) {
                const nameLower = identifier.toLowerCase();
                for (const jid in paymentsData) {
                    if (paymentsData[jid].nombre.toLowerCase() === nameLower) {
                        clientToDelete = paymentsData[jid];
                        clientJidToDelete = jid;
                        deleteType = 'nombre';
                        // Romper después de encontrar el primero para evitar eliminar múltiples
                        // si hay nombres duplicados (comportamiento de `limpiarpago` anterior)
                        break;
                    }
                }
            }

            if (clientToDelete && clientJidToDelete) {
                const clientName = clientToDelete.nombre;
                const clientNumber = clientJidToDelete.replace('@s.whatsapp.net', '');
                delete paymentsData[clientJidToDelete]; // Elimina la entrada del objeto
                savePaymentsData(paymentsData); // Guarda los cambios
                await m.reply(`🗑️ Cliente *${clientName}* (${clientNumber}) eliminado exitosamente por ${deleteType}.`);
            } else {
                await m.reply(`❌ No se encontró ningún cliente con el identificador "${identifier}". Intenta con el número completo o el nombre exacto.`);
            }
            break;

        default:
            // Esto no debería ejecutarse si el comando está en el switch del handler principal
            // pero es un buen fallback si se llama directamente el handler sin un command válido.
            break;
    }
};

// Actualiza la ayuda para reflejar la capacidad de eliminar por número O nombre
handler.help = ['cliente <num>', 'vercliente <num>', 'editarcliente <num> <campo> <valor>', 'eliminarcliente <num_o_nombre>'];
handler.tags = ['owner']; // Solo el propietario puede usar estos comandos
handler.command = /^(cliente|vercliente|editarcliente|eliminarcliente)$/i;

export { handler };
