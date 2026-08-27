import fs from 'fs';
import path from 'path';
import https from 'https';

const ADMIN_SECRET = '_pReyBRMZ1LQXtVsSjVb6gjx2UijBsnaTRFvpVVbebM';
const BASE_URL = 'https://fenixdev.cloud/api/admin/upload-chunk';

function getAllFiles(dirPath, arrayOfFiles = [], baseDir = dirPath) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles, baseDir);
    } else {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      arrayOfFiles.push({ fullPath, relPath });
    }
  });
  return arrayOfFiles;
}

async function uploadFile(filePath, remoteFilename) {
  const stats = fs.statSync(filePath);
  const totalSize = stats.size;
  const CHUNK_SIZE = 5 * 1024 * 1024;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE) || 1;
  const fd = fs.openSync(filePath, 'r');

  console.log(`\n🚀 Subiendo ${remoteFilename} (${(totalSize / 1024).toFixed(1)} KB)...`);
  const buffer = Buffer.alloc(CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const bytesRead = fs.readSync(fd, buffer, 0, CHUNK_SIZE, i * CHUNK_SIZE);
    const chunkData = buffer.subarray(0, bytesRead);

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
      req.write(chunkData);
      req.end();
    });
  }
  fs.closeSync(fd);
  console.log(`  ✓ ${remoteFilename} completado.`);
}

async function main() {
  const rootDir = process.cwd();
  const appDir = path.join(rootDir, 'dist');

  if (!fs.existsSync(appDir)) {
    console.error('❌ No existe la carpeta dist. Ejecuta primero npm run build.');
    process.exit(1);
  }

  const files = getAllFiles(appDir);
  console.log(`🌐 Subiendo ${files.length} archivos de la versión Web a fenixdev.cloud/app/, downloads/ y public/...`);

  for (const file of files) {
    // 1. Ruta /app/ (Web App principal)
    const remotePathApp = `public/app/${file.relPath}`;
    await uploadFile(file.fullPath, remotePathApp);

    // 2. Ruta /downloads/ (Descargas y web universal)
    const remotePathDownloads = `public/downloads/${file.relPath}`;
    await uploadFile(file.fullPath, remotePathDownloads);

    // 3. Ruta raíz /
    const remotePathPublic = `public/${file.relPath}`;
    await uploadFile(file.fullPath, remotePathPublic);
  }

  console.log('\n🎉 ¡Versión Web subida e instalada exitosamente en todas las rutas de https://fenixdev.cloud/ !');
}

main().catch(err => {
  console.error('❌ Error en subida Web:', err);
  process.exit(1);
});
