import fs from 'fs';
import path from 'path';
import https from 'https';

const ADMIN_SECRET = '_pReyBRMZ1LQXtVsSjVb6gjx2UijBsnaTRFvpVVbebM';
const BASE_URL = 'https://fenixdev.cloud/api/admin/upload-chunk';

async function uploadFileChunked(filePath, remoteFilename) {
  const stats = fs.statSync(filePath);
  const totalSize = stats.size;
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE);
  const fd = fs.openSync(filePath, 'r');

  console.log(`\n🚀 Subiendo ${remoteFilename} (${(totalSize / (1024 * 1024)).toFixed(2)} MB) en ${totalChunks} partes...`);

  const buffer = Buffer.alloc(CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, i * CHUNK_SIZE);
    const chunkData = buffer.subarray(0, bytesRead);

    let retries = 3;
    let success = false;

    while (retries > 0 && !success) {
      try {
        await new Promise((resolve, reject) => {
          const url = `${BASE_URL}?filename=${encodeURIComponent(remoteFilename)}&chunk=${i}&total=${totalChunks}`;
          const req = https.request(url, {
            method: 'POST',
            headers: {
              'x-admin-secret': ADMIN_SECRET,
              'Content-Type': 'application/octet-stream',
              'Content-Length': chunkData.length
            },
            timeout: 60000
          }, (res) => {
            let resBody = '';
            res.on('data', d => resBody += d);
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(resBody);
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${resBody}`));
              }
            });
          });

          req.on('error', reject);
          req.on('timeout', () => {
            req.destroy(new Error('Timeout en chunk'));
          });

          req.write(chunkData);
          req.end();
        });

        const percent = (((i + 1) / totalChunks) * 100).toFixed(1);
        process.stdout.write(`\r  ✓ Parte ${i + 1}/${totalChunks} enviada (${percent}%)`);
        success = true;
      } catch (err) {
        retries--;
        console.warn(`\n  ⚠️ Error en chunk ${i + 1} (${err.message}). Reintentando... (${retries} intentos restantes)`);
        if (retries === 0) {
          fs.closeSync(fd);
          throw err;
        }
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  fs.closeSync(fd);
  console.log(`\n🎉 ${remoteFilename} subido y ensamblado exitosamente en fenixdev.cloud.`);
}

async function run() {
  const rootDir = process.cwd();
  const zipPath = path.join(rootDir, 'omni_auth_code_deploy.zip');
  const exePath = path.join(rootDir, 'auth-server', 'public', 'downloads', 'Omni-IA-Game-Setup-0.2.8.exe');
  const sigPath = path.join(rootDir, 'auth-server', 'public', 'downloads', 'Omni-IA-Game-Setup-0.2.8.exe.sig');
  const updatesPath = path.join(rootDir, 'auth-server', 'public', 'updates.json');

  if (fs.existsSync(zipPath)) {
    await uploadFileChunked(zipPath, 'omni_auth_code_deploy.zip');
  }

  if (fs.existsSync(sigPath)) {
    await uploadFileChunked(sigPath, 'Omni-IA-Game-Setup-0.2.8.exe.sig');
  }

  if (fs.existsSync(exePath)) {
    await uploadFileChunked(exePath, 'Omni-IA-Game-Setup-0.2.8.exe');
  }

  if (fs.existsSync(updatesPath)) {
    await uploadFileChunked(updatesPath, 'updates.json');
  }
}

run().catch((err) => {
  console.error('\n❌ Error en la subida:', err);
  process.exit(1);
});
