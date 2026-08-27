import fs from 'fs';
import path from 'path';
import https from 'https';

const ADMIN_SECRET = '_pReyBRMZ1LQXtVsSjVb6gjx2UijBsnaTRFvpVVbebM';
const BASE_URL = 'https://fenixdev.cloud/api/admin/upload-chunk';

async function updateFile(localPath, remotePath, restartServer = false) {
  const content = fs.readFileSync(localPath);
  const targetUrl = `${BASE_URL}?filename=${encodeURIComponent(remotePath)}&target=root&chunk=0&total=1${restartServer ? '&restart=1' : ''}`;

  console.log(`🚀 Subiendo a ${remotePath} (${content.length} bytes)...`);
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
          console.log(`  ✓ ${remotePath} actualizado exitosamente.`);
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
  const localServerJs = path.join(process.cwd(), 'auth-server', 'server.js');

  await updateFile(localServerJs, 'server.js', false);
  await updateFile(localServerJs, 'public_html/server.js', false);
  await updateFile(localServerJs, 'auth-server/server.js', false);
  await updateFile(localServerJs, '../server.js', true);

  console.log('🎉 ¡server.js desplegado en todas las rutas posibles del servidor Hostinger!');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
