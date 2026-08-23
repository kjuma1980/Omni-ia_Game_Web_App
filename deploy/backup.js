#!/usr/bin/env node
// Backup del auth-server: data.db + archivos de estado, empaquetado y cifrado (AES-256-GCM).
// Uso:
//   node backup.js                    → backup a ./backups/ (local)
//   node backup.js /ruta/destino.zip  → backup a ruta concreta
//   OMNI_BACKUP_PASS=clave node backup.js   → cifra el ZIP con AES-256-GCM
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const AUTH_DIR = __dirname;
const DATA_DB = process.env.DB_PATH || path.join(AUTH_DIR, 'data.db');
const OUT_DIR = process.argv[2] || path.join(AUTH_DIR, 'backups');
const PASS = process.env.OMNI_BACKUP_PASS || '';

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
const zipPath = path.join(OUT_DIR, `omni-auth-backup-${stamp}.zip`);
const payloadPath = zipPath + (PASS ? '.enc' : '');

function hasTool(cmd) {
  try { execFileSync(cmd, ['--version'], { stdio: 'ignore' }); return true; }
  catch { return false; }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (!fs.existsSync(DATA_DB)) {
    console.error('[backup] No se encontró data.db en', DATA_DB);
    process.exit(1);
  }

  const entries = [DATA_DB];
  for (const name of ['data.db-wal', 'data.db-shm']) {
    const p = path.join(path.dirname(DATA_DB), name);
    if (fs.existsSync(p)) entries.push(p);
  }
  if (process.env.LICENSE_PRIVATE_KEY_PATH && fs.existsSync(process.env.LICENSE_PRIVATE_KEY_PATH)) {
    entries.push(process.env.LICENSE_PRIVATE_KEY_PATH);
    console.log('[backup] Incluyendo clave privada Ed25519.');
  }

  if (hasTool('zip')) {
    const rel = entries.map((p) => path.basename(p));
    execFileSync('zip', ['-q', zipPath, ...rel], { cwd: path.dirname(entries[0]) });
  } else if (hasTool('tar')) {
    const rel = entries.map((p) => path.basename(p));
    execFileSync('tar', ['-czf', zipPath, ...rel], { cwd: path.dirname(entries[0]) });
  } else {
    console.error('[backup] Necesitas zip o tar en el servidor.');
    process.exit(1);
  }

  if (PASS) {
    const iv = crypto.randomBytes(12);
    const key = crypto.createHash('sha256').update(PASS).digest();
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = fs.readFileSync(zipPath);
    const enc = Buffer.concat([cipher.update(data), cipher.final()]);
    fs.writeFileSync(payloadPath, Buffer.concat([iv, cipher.getAuthTag(), enc]));
    fs.unlinkSync(zipPath);
    console.log(`[backup] Cifrado AES-256-GCM → ${payloadPath}`);
  } else {
    console.log(`[backup] Sin cifrar → ${zipPath}`);
  }
  console.log('[backup] Para restaurar: descomprime en el servidor y reemplaza data.db.');
}

main();
