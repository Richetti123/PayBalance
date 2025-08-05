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

// Función auxiliar para normalizar números de forma más robusta
const normalizeNumber = (inputNumber) => {
    const cleanNumber = inputNumber.replace(/[^\d+]/g, '');

    if (!cleanNumber) return null;

    if (cleanNumber.startsWith('+') && cleanNumber.length > 10) {
        return cleanNumber;
    }

    if (cleanNumber.length === 10) {
        return `+521${cleanNumber}`;
    }

    if (!cleanNumber.startsWith('+')) {
        return `+${cleanNumber}`;
    }
    
    return null;
};

let handler = async (m, { conn, text, command, usedPrefix, isOwner }) => {
    if (!isOwner) {
        return m.reply(`❌ Solo el propietario puede usar este comando.`);
    }

    const args = text.split(' ').map(arg => arg.trim()).filter(arg => arg !== '');
    const paymentsData = loadPaymentsData();

    switch (command.toLowerCase()) {
        case 'cliente':
        case 'vercliente':
            if (args.length === 0) {
                return m.reply(`*Uso correcto:* ${usedPrefix}${command} [número_cliente]\n*O*\n${usedPrefix}${command} [nombre_cliente]\n\nEj: ${usedPrefix}${command} 5217771234567\nEj: ${usedPrefix}${command} Juan Pérez`);
            }
            let identifierToView = args.join(' ').trim();
            let clientToView = null;
            let clientJidToView = null;
            let identifiedBy = '';

            let potentialNumberToView = normalizeNumber(identifierToView);
            if (potentialNumberToView) {
                const jidFromNumber = `${potentialNumberToView}@s.whatsapp.net`;
                if (paymentsData[jidFromNumber]) {
                    clientToView = paymentsData[jidFromNumber];
                    clientJidToView = jidFromNumber;
                    identifiedBy = 'número';
                }
            }

            if (!clientToView) {
                const nameLower = identifierToView.toLowerCase();
                for (const jid in paymentsData) {
                    if (paymentsData[jid].nombre.toLowerCase() === nameLower) {
                        clientToView = paymentsData[jid];
                        clientJidToView = jid;
                        identifiedBy = 'nombre';
                        break;
                    }
                }
            }

            if (clientToView && clientJidToView) {
                const fechaRegistro = clientToView.pagos && clientToView.pagos[0] && clientToView.pagos[0].fecha ? new Date(clientToView.pagos[0].fecha) : null;
                const fechaRegistroStr = fechaRegistro && !isNaN(fechaRegistro) ? fechaRegistro.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';

                const ultimoComprobante = clientToView.historialComprobantes && clientToView.historialComprobantes.length > 0 ? clientToView.historialComprobantes[clientToView.historialComprobantes.length - 1] : null;
                const ultimoPagoVerificado = ultimoComprobante ? new Date(ultimoComprobante.fecha) : null;
                const ultimoPagoVerificadoStr = ultimoPagoVerificado && !isNaN(ultimoPagoVerificado) ? ultimoPagoVerificado.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';
                
                const monto = clientToView.pagos && clientToView.pagos[0]?.monto ? clientToView.pagos[0].monto : 'N/A';

                let clientInfo = `*👤 Información del Cliente:*\n\n`;
                clientInfo += `*• Nombre:* ${clientToView.nombre}\n`;
                clientInfo += `*• Número:* ${clientJidToView.replace('@s.whatsapp.net', '')}\n`;
                clientInfo += `*• Día de Pago:* ${clientToView.diaPago || 'N/A'}\n`;
                clientInfo += `*• Monto:* ${monto}\n`;
                clientInfo += `*• Bandera:* ${clientToView.bandera}\n`;
                clientInfo += `*• Estado:* ${clientToView.suspendido ? '🔴 Suspendido' : '🟢 Activo'}\n`;
                clientInfo += `*• Último Pago Verificado:* ${ultimoPagoVerificadoStr}\n`;
                clientInfo += `*• Fecha de Registro:* ${fechaRegistroStr}\n`;
                
                if (clientToView.clientesLote && Object.keys(clientToView.clientesLote).length > 0) {
                    clientInfo += `\n*Integrantes del Lote:*\n`;
                    for (const numLote in clientToView.clientesLote) {
                        clientInfo += ` - ${clientToView.clientesLote[numLote].nombre} (${numLote.replace('@s.whatsapp.net', '')})\n`;
                    }
                }

                await m.reply(clientInfo);
            } else {
                await m.reply(`❌ No se encontró ningún cliente con el identificador "${identifierToView}".`);
            }
            break;

        case 'editarcliente':
            if (args.length < 3) {
                return m.reply(`*Uso correcto:* ${usedPrefix}${command} [número_o_nombre_cliente] [campo] [nuevo_valor]\nCampos: nombre, diaPago, monto, bandera\nEj: ${usedPrefix}${command} 5217771234567 nombre Juan Pérez\nEj: ${usedPrefix}${command} Juan Pérez monto $500.00`);
            }
            let identifierToEdit = args[0];
            const fieldToEdit = args[1].toLowerCase();
            const newValue = args.slice(2).join(' ');

            let clientToEdit = null;
            let clientJidToEdit = null;

            let potentialNumberToEdit = normalizeNumber(identifierToEdit);
            if (potentialNumberToEdit) {
                const jidFromNumber = `${potentialNumberToEdit}@s.whatsapp.net`;
                if (paymentsData[jidFromNumber]) {
                    clientToEdit = paymentsData[jidFromNumber];
                    clientJidToEdit = jidFromNumber;
                }
            }

            if (!clientToEdit) {
                const nameLower = identifierToEdit.toLowerCase();
                for (const jid in paymentsData) {
                    if (paymentsData[jid].nombre.toLowerCase() === nameLower) {
                        clientToEdit = paymentsData[jid];
                        clientJidToEdit = jid;
                        break;
                    }
                }
            }

            if (!clientToEdit || !clientJidToEdit) {
                return m.reply(`❌ No se encontró ningún cliente con el identificador "${identifierToEdit}" para editar.`);
            }

            const validFields = ['nombre', 'diapago', 'monto', 'bandera'];
            if (!validFields.includes(fieldToEdit)) {
                return m.reply(`❌ Campo '${fieldToEdit}' inválido. Campos permitidos: nombre, diaPago, monto, bandera.`);
            }

            if (fieldToEdit === 'diapago') {
                const day = parseInt(newValue, 10);
                if (isNaN(day) || day < 1 || day > 31) {
                    return m.reply('❌ El día de pago debe ser un número entre 1 y 31.');
                }
                clientToEdit.diaPago = day;
            } else if (fieldToEdit === 'monto') {
                if (clientToEdit.pagos && clientToEdit.pagos[0]) {
                    clientToEdit.pagos[0].monto = newValue;
                }
            } else {
                clientToEdit[fieldToEdit] = newValue;
            }

            savePaymentsData(paymentsData);
            await m.reply(`✅ Cliente ${clientToEdit.nombre} (${clientJidToEdit.replace('@s.whatsapp.net', '')}) actualizado: campo '${fieldToEdit}' ahora es '${newValue}'.`);
            break;
            
        case 'clientes':
        case 'listarpagos':
            if (!isOwner) return m.reply(`❌ Solo el propietario puede usar este comando.`);
            if (fs.existsSync(paymentsFilePath)) {
                const clientsData = JSON.parse(fs.readFileSync(paymentsFilePath, 'utf8'));
                let clientList = '📊 *Lista de Clientes y Pagos:*\n\n';
                for (const num in clientsData) {
                    const client = clientsData[num];
                    const estadoPago = client.pagoRealizado ? '✅ Pagado este mes' : '❌ Pendiente de pago';
                    const pagoActual = client.pagos && client.pagos[0] ? client.pagos[0] : null;

                    const monto = pagoActual?.monto || 'N/A';
                    const fechaRegistro = pagoActual?.fecha ? new Date(pagoActual.fecha) : null;
                    const fechaRegistroStr = fechaRegistro && !isNaN(fechaRegistro) ? fechaRegistro.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'N/A';

                    clientList += `*👤 Nombre:* ${client.nombre}\n*📞 Número:* ${num}\n*🗓️ Día de Pago:* ${client.diaPago}\n*💰 Monto:* ${monto}\n*🌎 Bandera:* ${client.bandera}\n*• Estado de Suspensión:* ${client.suspendido ? '🔴 Suspendido' : '🟢 Activo'}\n*• Estado de Pago:* ${estadoPago}\n*• Fecha de Registro:* ${fechaRegistroStr}\n----------------------------\n`;
                }
                if (Object.keys(clientsData).length === 0) clientList = '❌ No hay clientes registrados.';
                await conn.sendMessage(m.chat, { text: clientList }, { quoted: m });
            } else {
                await conn.sendMessage(m.chat, { text: '❌ El archivo `pagos.json` no se encontró. No hay clientes registrados.' }, { quoted: m });
            }
            break;

        case 'eliminarcliente':
            if (args.length === 0) {
                return m.reply(`*Uso correcto:*\n${usedPrefix}${command} [número_cliente]\n*O*\n${usedPrefix}${command} [nombre_cliente]\n\nEjemplos:\n${usedPrefix}${command} 5217771234567\n${usedPrefix}${command} Juan Perez\n\n*¡ADVERTENCIA!* Si eliminas por nombre y hay duplicados, solo se eliminará el *primer* cliente encontrado.`);
            }

            let identifierToDelete = args.join(' ').trim();
            let clientToDelete = null;
            let deleteType = '';
            let clientJidToDelete = null;

            let potentialNumberToDelete = normalizeNumber(identifierToDelete);
            if (potentialNumberToDelete) {
                const jidFromNumber = `${potentialNumberToDelete}@s.whatsapp.net`;
                if (paymentsData[jidFromNumber]) {
                    clientToDelete = paymentsData[jidFromNumber];
                    clientJidToDelete = jidFromNumber;
                    deleteType = 'número';
                }
            }

            if (!clientToDelete) {
                const nameLower = identifierToDelete.toLowerCase();
                for (const jid in paymentsData) {
                    if (paymentsData[jid].nombre.toLowerCase() === nameLower) {
                        clientToDelete = paymentsData[jid];
                        clientJidToDelete = jid;
                        deleteType = 'nombre';
                        break;
                    }
                }
            }

            if (clientToDelete && clientJidToDelete) {
                const clientName = clientToDelete.nombre;
                const clientNumber = clientJidToDelete.replace('@s.whatsapp.net', '');
                delete paymentsData[clientJidToDelete];
                savePaymentsData(paymentsData);
                await m.reply(`🗑️ Cliente *${clientName}* (${clientNumber}) eliminado exitosamente por ${deleteType}.`);
            } else {
                await m.reply(`❌ No se encontró ningún cliente con el identificador "${identifierToDelete}". Intenta con el número completo o el nombre exacto.`);
            }
            break;

        default:
            break;
    }
};

handler.help = [
    'cliente <num_o_nombre>',
    'vercliente <num_o_nombre>',
    'editarcliente <num_o_nombre> <campo> <valor>',
    'eliminarcliente <num_o_nombre>'
];
handler.tags = ['owner'];
handler.command = /^(cliente|vercliente|editarcliente|eliminarcliente)$/i;

export { handler };
