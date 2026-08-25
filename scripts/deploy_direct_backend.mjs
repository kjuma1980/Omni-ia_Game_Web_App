import fs from 'fs';
import path from 'path';
import https from 'https';

const ADMIN_SECRET = '_pReyBRMZ1LQXtVsSjVb6gjx2UijBsnaTRFvpVVbebM';
const BASE_URL = 'https://fenixdev.cloud/api/admin/upload-chunk';

async function updateRemoteCode(localPath, relativeRemotePath, restartServer = false) {
  const content = fs.readFileSync(localPath);
  const targetUrl = `${BASE_URL}?filename=${encodeURIComponent(relativeRemotePath)}&target=root&chunk=0&total=1${restartServer ? '&restart=1' : ''}`;

  console.log(`🚀 Actualizando servidor remoto: ${relativeRemotePath} ...`);
  return new Promise((resolve, reject) => {
    const req = https.request(targetUrl, {
      method: 'POST',
      headers: {
        'x-admin-secret': ADMIN_SECRET,
        'Content-Type': 'application/octet-stream',
        'Content-Length': content.length,
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`  ✓ ${relativeRemotePath} actualizado en servidor. ${restartServer ? '(Servidor reiniciado)' : ''}`);
          resolve(data);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(content);
    req.end();
  });
}

async function main() {
  const rootDir = process.cwd();
  const serverJs = path.join(rootDir, 'auth-server', 'server.js');
  const zipFile = path.join(rootDir, 'omni_auth_code_deploy.zip');

  console.log('1️⃣ Actualizando server.js en Hostinger y reiniciando motor Node.js...');
  await updateRemoteCode(serverJs, 'server.js', true);

  console.log('⏳ Esperando 3 segundos para reinicio del servidor...');
  await new Promise(r => setTimeout(r, 3000));

  console.log('2️⃣ Subiendo paquete web omni_auth_code_deploy.zip...');
  await updateRemoteCode(zipFile, '../../omni_auth_code_deploy.zip', true);

  console.log('\n🎉 ¡Despliegue y actualización completa en Hostinger finalizada con éxito!');
}

main().catch(err => {
  console.error('❌ Error actualizando servidor:', err.message);
  process.exit(1);
});
