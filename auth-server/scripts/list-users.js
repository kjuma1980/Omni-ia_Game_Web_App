#!/usr/bin/env node
// Lista los usuarios registrados. Uso:
//   node scripts/list-users.js [--search texto] [--status active|pending] [--json] [--limit N]
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { listUsers } = require('../db');

const args = process.argv.slice(2);
function argValue(name, def) {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
}

const search = argValue('--search', '');
const status = argValue('--status', '');
const limit = Math.min(Math.max(parseInt(argValue('--limit', '50'), 10) || 50, 1), 500);
const asJson = args.includes('--json');

const { total, rows } = listUsers({ search, status, limit, offset: 0 });

if (asJson) {
  console.log(JSON.stringify({ total, rows }, null, 2));
  process.exit(0);
}

console.log(`Usuarios registrados: ${total}${search ? ` (filtro: "${search}")` : ''}${status ? ` (estado: ${status})` : ''}\n`);
if (rows.length === 0) {
  console.log('No hay usuarios que coincidan.');
  process.exit(0);
}

const table = rows.map((u) => ({
  ID: u.id,
  Correo: u.email,
  Nombre: [u.first_name, u.last_name].filter(Boolean).join(' ') || '-',
  Pais: u.country || '-',
  Ciudad: u.city || '-',
  Estado: u.status,
  Rol: u.role,
  Registro: new Date(u.created_at).toLocaleString('es-ES'),
  Perfil: u.completed_registration ? 'completo' : 'incompleto',
}));

console.table(table);
