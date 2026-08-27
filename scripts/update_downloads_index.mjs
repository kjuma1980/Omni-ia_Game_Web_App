import fs from 'fs';
import path from 'path';
import https from 'https';

const ADMIN_SECRET = '_pReyBRMZ1LQXtVsSjVb6gjx2UijBsnaTRFvpVVbebM';
const BASE_URL = 'https://fenixdev.cloud/api/admin/upload-chunk';

async function updateFile(localPath, remotePath) {
  const content = fs.readFileSync(localPath);
  const targetUrl = `${BASE_URL}?filename=${encodeURIComponent(remotePath)}&target=root&chunk=0&total=1`;

  console.log(`🚀 Forzando actualización remota: ${remotePath} (${content.length} bytes)...`);
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
  const distDir = path.join(process.cwd(), 'dist');
  const indexHtml = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');
  const filesInAssets = fs.readdirSync(assetsDir);

  const targets = ['public/downloads', 'public/app', 'auth-server/public/downloads', 'auth-server/public/app'];

  for (const targetPrefix of targets) {
    await updateFile(indexHtml, `${targetPrefix}/index.html`);
    for (const file of filesInAssets) {
      const localFilePath = path.join(assetsDir, file);
      if (fs.statSync(localFilePath).isFile()) {
        await updateFile(localFilePath, `${targetPrefix}/assets/${file}`);
      }
    }
  }

  console.log('🎉 ¡Todos los bundles CSS y JS subidos a las rutas de Hostinger!');
}

main().catch(err => {
  console.error('❌ Error actualizando:', err);
  process.exit(1);
});
