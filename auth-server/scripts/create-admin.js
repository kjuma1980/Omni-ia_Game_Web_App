#!/usr/bin/env node
// Crea (o promueve) una cuenta de administrador directamente en la BD.
// Uso: node scripts/create-admin.js <email> <contraseña>
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { findUserByEmail, createAdmin, promoteToAdmin, logAudit } = require('../db');
const { EMAIL_RE } = require('../validation');

const [emailArg, passwordArg] = process.argv.slice(2);

if (!emailArg || !passwordArg) {
  console.error('Uso: node scripts/create-admin.js <email> <contraseña>');
  process.exit(1);
}

const email = emailArg.trim().toLowerCase();
if (!EMAIL_RE.test(email)) {
  console.error('Correo no válido.');
  process.exit(1);
}
if (passwordArg.length < 10) {
  console.error('La contraseña debe tener al menos 10 caracteres.');
  process.exit(1);
}

const existing = findUserByEmail(email);
if (existing) {
  if (existing.role === 'admin') {
    console.log(`Ya existe una cuenta admin para ${email}.`);
    process.exit(0);
  }
  promoteToAdmin(email);
  logAudit(null, null, 'admin.create_script', { email, action: 'promoted' });
  console.log(`Usuario existente promovido a administrador: ${email}`);
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(passwordArg, 12);
createAdmin({ email, passwordHash });
logAudit(null, null, 'admin.create_script', { email, action: 'created' });
console.log(`Cuenta de administrador creada: ${email}`);
