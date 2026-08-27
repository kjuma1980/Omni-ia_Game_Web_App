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
  const indexJsName = filesInAssets.find(f => f.startsWith('index-') && f.endsWith('.js'));
  const assetJs = path.join(assetsDir, indexJsName);

  // Subir a public/downloads/ (donde Express sirve /app/*)
  await updateFile(indexHtml, 'public/downloads/index.html');
  await updateFile(assetJs, `public/downloads/assets/${indexJsName}`);

  // Subir a auth-server/public/downloads/
  await updateFile(indexHtml, 'auth-server/public/downloads/index.html');
  await updateFile(assetJs, `auth-server/public/downloads/assets/${indexJsName}`);

  console.log('🎉 ¡Rutas /app/ de Hostinger actualizadas al nuevo bundle!');
}

main().catch(err => {
  console.error('❌ Error actualizando:', err);
  process.exit(1);
});
