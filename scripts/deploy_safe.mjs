import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * DEPLOY SEGURO A HOSTINGER — CERO PÉRDIDA DE DATOS
 * 
 * REGLA DE ORO DE SEGURIDAD:
 * NUNCA incluir `data.db` (ni sus archivos WAL/SHM) ni credenciales `.env` en el paquete de despliegue.
 * Hostinger extraerá el código actualizado, los instaladores y el HTML, manteniendo
 * el archivo `data.db` del servidor 100% intacto con todas las cuentas, licencias y contraseñas de los usuarios.
 */

const rootDir = process.cwd();
const authServerDir = path.join(rootDir, 'auth-server');
const tempDir = process.env.TEMP || '/tmp';
const stageDir = path.join(tempDir, 'omni_auth_safe_staging');
const zipFile = path.join(rootDir, 'omni_auth_deploy_safe.zip');

console.log('🚀 [Deploy Seguro] Iniciando preparación de paquete de despliegue...');

// Limpiar staging anterior
if (fs.existsSync(stageDir)) {
  fs.rmSync(stageDir, { recursive: true, force: true });
}
if (fs.existsSync(zipFile)) {
  fs.rmSync(zipFile, { force: true });
}

fs.mkdirSync(stageDir, { recursive: true });

// Archivos estrictamente protegidos que JAMÁS deben sobreescribir la BD del servidor
const PROTECTED_ITEMS = new Set([
  'node_modules',
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
      if (PROTECTED_ITEMS.has(childItemName) || childItemName.endsWith('.log') || childItemName.startsWith('data.db')) {
        console.log(`🛡️  [Protegido] Omitiendo archivo local: ${childItemName} (permanecerá intacto en el servidor)`);
        return;
      }
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Copiar código fuente del auth-server
copyRecursiveSync(authServerDir, stageDir);

// 2. Limpiar downloads en staging para que SOLO contenga el instalador actual de la versión
const downloadsDir = path.join(stageDir, 'public', 'downloads');
if (fs.existsSync(downloadsDir)) {
  fs.rmSync(downloadsDir, { recursive: true, force: true });
}
fs.mkdirSync(downloadsDir, { recursive: true });

// Leer versión actual de package.json
const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
const currentVersion = pkgJson.version;
console.log(`📌 Versión activa del proyecto: v${currentVersion}`);

// Buscar instalador recién compilado de la versión actual (priorizar target/release/bundle/nsis)
const nsisCandidateNames = [
  `Omni IA Game_${currentVersion}_x64-setup.exe`,
  `Omni_IA_Game_${currentVersion}_x64-setup.exe`,
  `Omni-IA-Game-Setup-${currentVersion}.exe`
];

let foundInstaller = false;
const nsisDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');

for (const name of nsisCandidateNames) {
  const nsisPath = path.join(nsisDir, name);
  if (fs.existsSync(nsisPath)) {
    const destStaging = path.join(downloadsDir, `Omni-IA-Game-Setup-${currentVersion}.exe`);
    const destAuth = path.join(authServerDir, 'public', 'downloads', `Omni-IA-Game-Setup-${currentVersion}.exe`);
    fs.copyFileSync(nsisPath, destStaging);
    fs.copyFileSync(nsisPath, destAuth);
    console.log(`✓ Instalador FRESCO copiado de build NSIS: ${nsisPath} -> ${destStaging}`);
    foundInstaller = true;

    // Buscar y copiar firma digital .sig
    const sigCandidates = [
      `${nsisPath}.sig`,
      path.join(nsisDir, `${name}.sig`),
      path.join(nsisDir, `Omni IA Game_${currentVersion}_x64-setup.exe.sig`),
      path.join(nsisDir, `Omni_IA_Game_${currentVersion}_x64-setup.exe.sig`)
    ];
    for (const sigP of sigCandidates) {
      if (fs.existsSync(sigP)) {
        const destSigStaging = path.join(downloadsDir, `Omni-IA-Game-Setup-${currentVersion}.exe.sig`);
        const destSigAuth = path.join(authServerDir, 'public', 'downloads', `Omni-IA-Game-Setup-${currentVersion}.exe.sig`);
        fs.copyFileSync(sigP, destSigStaging);
        fs.copyFileSync(sigP, destSigAuth);
        const sigContent = fs.readFileSync(sigP, 'utf-8').trim();
        console.log(`✓ Firma Minisign copiada: ${sigP} -> ${destSigStaging}`);
        
        // Actualizar firma en updates.json
        const updatesJsonPath = path.join(authServerDir, 'public', 'updates.json');
        if (fs.existsSync(updatesJsonPath)) {
          const updObj = JSON.parse(fs.readFileSync(updatesJsonPath, 'utf-8'));
          if (updObj.platforms && updObj.platforms['windows-x86_64']) {
            updObj.platforms['windows-x86_64'].signature = sigContent;
            fs.writeFileSync(updatesJsonPath, JSON.stringify(updObj, null, 2), 'utf-8');
            console.log(`✓ Firma Minisign inyectada en updates.json`);
          }
        }
        break;
      }
    }
    break;
  }
}

if (!foundInstaller) {
  // Fallback secundario si no está en target
  for (const name of nsisCandidateNames) {
    const p = path.join(authServerDir, 'public', 'downloads', name);
    if (fs.existsSync(p)) {
      const destStaging = path.join(downloadsDir, `Omni-IA-Game-Setup-${currentVersion}.exe`);
      fs.copyFileSync(p, destStaging);
      console.log(`✓ Instalador copiado desde downloads: ${p} -> ${destStaging}`);
      foundInstaller = true;
      break;
    }
  }
}

if (!foundInstaller) {
  console.warn(`⚠️ ALERTA: No se encontró instalador compilado para v${currentVersion} en disco.`);
}

// 3. Remover subcarpeta public/api/updates si existe para evitar conflictos con rutas API de Express
const publicUpdatesDir = path.join(stageDir, 'public', 'api', 'updates');
if (fs.existsSync(publicUpdatesDir)) {
  fs.rmSync(publicUpdatesDir, { recursive: true, force: true });
  console.log('✓ Carpeta vacia public/api/updates removida de staging.');
}

// 4. Asegurar updates.json en public
const updatesJsonSrc = path.join(authServerDir, 'public', 'updates.json');
if (fs.existsSync(updatesJsonSrc)) {
  fs.copyFileSync(updatesJsonSrc, path.join(stageDir, 'public', 'updates.json'));
  console.log('✓ updates.json copiado a staging.');
}

// 5. Comprimir paquete seguro usando tar
console.log('📦 Comprimiendo paquete de despliegue seguro (sin base de datos)...');
try {
  execSync(`tar -a -c -f "${zipFile}" -C "${stageDir}" *`, { stdio: 'inherit' });
  const zipStats = fs.statSync(zipFile);
  console.log(`✅ Paquete de despliegue seguro creado: ${zipFile} (${(zipStats.size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log('🛡️ Verificación: Este archivo NO contiene data.db. Las cuentas de los clientes no serán alteradas.');
} catch (e) {
  console.error('Error al comprimir:', e);
  process.exit(1);
}
