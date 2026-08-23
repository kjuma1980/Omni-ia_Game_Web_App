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

// Crear archivo zip
const zipPath = path.join(scriptsDir, 'omni-agent-installer.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

const agentDir = path.join(rootDir, 'omnideploy-agent');
const filesToZip = [
  path.join(agentDir, 'Instalar_Agente_OmniDeploy.bat'),
  path.join(agentDir, 'agent.py'),
  path.join(agentDir, 'transporte.py'),
  path.join(agentDir, 'Iniciar agente.bat'),
  path.join(agentDir, 'agent.env.example')
].map(f => `'${f}'`).join(', ');

const psCmd = `powershell -Command "Compress-Archive -Path ${filesToZip} -DestinationPath '${zipPath}' -Force"`;
console.log('Ejecutando:', psCmd);
execSync(psCmd, { stdio: 'inherit' });

console.log('✅ Paquete del Agente OmniDeploy generado con éxito en:', scriptsDir);
