import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const scriptsDir = path.join(rootDir, 'auth-server', 'public', 'downloads', 'scripts');
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

// Copiar script .bat
const batSrc = path.join(rootDir, 'omnideploy-agent', 'Instalar_Agente_OmniDeploy.bat');
const batDst = path.join(scriptsDir, 'Instalar_Agente_OmniDeploy.bat');
fs.copyFileSync(batSrc, batDst);

// Asegurar que no exista el archivo zip en public
const zipPath = path.join(scriptsDir, 'omni-agent-installer.zip');
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

console.log('✅ Script del Agente OmniDeploy (.bat) actualizado con éxito en:', scriptsDir);
