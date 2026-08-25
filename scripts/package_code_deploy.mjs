import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const rootDir = process.cwd();
const authServerDir = path.join(rootDir, 'auth-server');
const tempDir = process.env.TEMP || '/tmp';
const stageDir = path.join(tempDir, 'omni_auth_code_staging');
const zipFile = path.join(rootDir, 'omni_auth_code_deploy.zip');

console.log('🚀 Preparando paquete de código y landing page (sin .exe grande)...');

// Pre-flight check: verificar que auth-server/.env existe y contiene SMTP_PASS configurado
const envPath = path.join(authServerDir, '.env');
if (!fs.existsSync(envPath)) {
  console.error('❌ ERROR CRÍTICO: No existe auth-server/.env. Abortando empaquetado para proteger la configuración del servidor.');
  process.exit(1);
}
const envText = fs.readFileSync(envPath, 'utf-8');
if (!envText.includes('SMTP_PASS=') || envText.includes('SMTP_PASS=""') || envText.includes('SMTP_PASS=\n')) {
  console.error('❌ ERROR CRÍTICO: SMTP_PASS no está configurado en auth-server/.env. Abortando empaquetado.');
  process.exit(1);
}

if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
  fs.rmSync(zipFile, { force: true });
}

fs.mkdirSync(stageDir, { recursive: true });

const PROTECTED_ITEMS = new Set([
  'node_modules',
  '.env.local',
  'data.db',
  'data.db-wal',
  'data.db-shm',
  'data.db.bak',
  'data.db.backup',
  'server.log',
  'server.err.log',
  '.git',
  '.DS_Store'
]);

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      if (PROTECTED_ITEMS.has(childItemName) || childItemName.endsWith('.log') || childItemName.startsWith('data.db') || childItemName.startsWith('omnideploy.db')) {
        return;
      }
      // Omitir ejecutables pesados excepto OmniDeployAgent.exe del agente
      if (childItemName.endsWith('.exe') && childItemName !== 'OmniDeployAgent.exe') {
        return;
      }
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    if (src.endsWith('.exe') && !src.endsWith('OmniDeployAgent.exe')) return;
    fs.copyFileSync(src, dest);
  }
}

const distDir = path.join(rootDir, 'dist');
const localAppDir = path.join(authServerDir, 'public', 'app');
const localDlDir = path.join(authServerDir, 'public', 'downloads');

if (fs.existsSync(distDir)) {
  console.log('🧹 Limpiando assets antiguos acumulados en public/app/assets/ y public/downloads/assets/...');
  const appAssets = path.join(localAppDir, 'assets');
  const dlAssets = path.join(localDlDir, 'assets');
  if (fs.existsSync(appAssets)) fs.rmSync(appAssets, { recursive: true, force: true });
  if (fs.existsSync(dlAssets)) fs.rmSync(dlAssets, { recursive: true, force: true });

  console.log('📋 Copiando archivos compilados frescos de dist/ a public/app/ y public/downloads/...');
  copyRecursiveSync(distDir, localAppDir);
  copyRecursiveSync(distDir, localDlDir);
}

copyRecursiveSync(authServerDir, stageDir);

// Asegurar copias en el directorio de staging para /app y /downloads
if (fs.existsSync(distDir)) {
  copyRecursiveSync(distDir, path.join(stageDir, 'public', 'app'));
  copyRecursiveSync(distDir, path.join(stageDir, 'public', 'downloads'));
}

// Omitir .env local para evitar empaquetar credenciales locales de desarrollo

console.log('📦 Comprimiendo código...');
const psCmd = `powershell -Command "Get-ChildItem -Path '${stageDir}' -Force | Compress-Archive -DestinationPath '${zipFile}' -Force"`;
execSync(psCmd, { stdio: 'inherit' });

const stats = fs.statSync(zipFile);
console.log(`✅ Paquete de código creado: ${zipFile} (${(stats.size / 1024).toFixed(2)} KB)`);
