import fs from 'fs';
import https from 'https';
import path from 'path';

const INSTALLER_PATH = 'g:/apps/Omni-IA-Game Educational Version/omni-ia-game-educational-version/src-tauri/target/release/bundle/nsis/Omni IA Game_0.2.8_x64-setup.exe';
const ADMIN_SECRET = '_pReyBRMZ1LQXtVsSjVb6gjx2UijBsnaTRFvpVVbebM';
const TARGET_FILENAME = 'downloads/Omni-IA-Game-Setup-0.2.8.exe';
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB

async function uploadChunk(chunkBuffer, chunkIndex, totalChunks) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'fenixdev.cloud',
      port: 443,
      path: `/api/admin/upload-chunk?filename=${encodeURIComponent(TARGET_FILENAME)}&chunk=${chunkIndex}&total=${totalChunks}`,
      method: 'POST',
      headers: {
        'x-admin-secret': ADMIN_SECRET,
        'Content-Type': 'application/octet-stream',
        'Content-Length': chunkBuffer.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data || '{}'));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(chunkBuffer);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(INSTALLER_PATH)) {
    console.error('El instalador no existe:', INSTALLER_PATH);
    process.exit(1);
  }

  const stats = fs.statSync(INSTALLER_PATH);
  const totalBytes = stats.size;
  const totalChunks = Math.ceil(totalBytes / CHUNK_SIZE);

  console.log(`🚀 Iniciando subida directa por chunks del instalador v0.2.7...`);
  console.log(`📦 Archivo: ${INSTALLER_PATH}`);
  console.log(`📊 Tamaño: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB (${totalChunks} bloques de 10MB)\n`);

  const fd = fs.openSync(INSTALLER_PATH, 'r');
  const buffer = Buffer.alloc(CHUNK_SIZE);

  for (let i = 0; i < totalChunks; i++) {
    const bytesToRead = Math.min(CHUNK_SIZE, totalBytes - i * CHUNK_SIZE);
    fs.readSync(fd, buffer, 0, bytesToRead, i * CHUNK_SIZE);
    const slice = buffer.subarray(0, bytesToRead);

    const startTime = Date.now();
    await uploadChunk(slice, i, totalChunks);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const pct = (((i + 1) / totalChunks) * 100).toFixed(1);

    console.log(`✅ Bloque ${i + 1}/${totalChunks} (${pct}%) subido en ${elapsed}s`);
  }

  fs.closeSync(fd);
  console.log('\n🎉 ¡Instalador v0.2.7 subido exitosamente a producción!');
}

main().catch((err) => {
  console.error('❌ Error durante la subida:', err);
  process.exit(1);
});
