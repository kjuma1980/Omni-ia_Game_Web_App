import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const setupDir = path.join(rootDir, 'auth-server', 'public', 'downloads', 'setup');
if (!fs.existsSync(setupDir)) {
  fs.mkdirSync(setupDir, { recursive: true });
}

console.log('🔒 Cifrando código fuente Python del agente con PyArmor...');
const agentDir = path.join(rootDir, 'omnideploy-agent');
const obfDir = path.join(rootDir, 'obf_agent');

if (fs.existsSync(obfDir)) {
  fs.rmSync(obfDir, { recursive: true, force: true });
}

const pyarmorCmd = `pyarmor gen -O "${obfDir}" "${path.join(agentDir, 'agent.py')}" "${path.join(agentDir, 'transporte.py')}"`;
console.log('Ejecutando PyArmor:', pyarmorCmd);
execSync(pyarmorCmd, { stdio: 'inherit' });

console.log('⚙️ Compilando código binario seguro a ejecutable .exe con PyInstaller...');
const pyinstallerCmd = `pyinstaller --onefile --noconsole --name OmniDeployAgent --paths "${obfDir}" "${path.join(obfDir, 'agent.py')}"`;
console.log('Ejecutando PyInstaller:', pyinstallerCmd);
execSync(pyinstallerCmd, { stdio: 'inherit' });

const exeSrc = path.join(rootDir, 'dist', 'OmniDeployAgent.exe');
const exeDst = path.join(setupDir, 'OmniDeployAgent.exe');

if (fs.existsSync(exeSrc)) {
  fs.copyFileSync(exeSrc, exeDst);
  console.log(`✅ Ejecutable binario seguro creado en: ${exeDst}`);
} else {
  console.error('❌ Error: No se encontró el ejecutable compilado en:', exeSrc);
  process.exit(1);
}
