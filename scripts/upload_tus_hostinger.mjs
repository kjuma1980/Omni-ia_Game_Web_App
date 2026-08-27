import fs from 'fs';
import path from 'path';
import https from 'https';

const archivePath = path.join(process.cwd(), 'omni_auth_deploy_safe.zip');
const stats = fs.statSync(archivePath);
const fileName = 'omni_auth_code_deploy.zip';
const fileNameBase64 = Buffer.from(fileName).toString('base64');

console.log(`🚀 [TUS Upload] Iniciando subida de ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)...`);

// Hostinger Upload Credentials
const authHeader = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjoxLCJsb2NhbGUiOiJlbl9VUyIsInZpZXdNb2RlIjoibGlzdCIsInNpbmdsZUNsaWNrIjpmYWxzZSwicmVkaXJlY3RBZnRlckNvcHlNb3ZlIjpmYWxzZSwicGVybSI6eyJhZG1pbiI6ZmFsc2UsImV4ZWN1dGUiOmZhbHNlLCJjcmVhdGUiOnRydWUsInJlbmFtZSI6dHJ1ZSwibW9kaWZ5Ijp0cnVlLCJkZWxldGUiOnRydWUsInNoYXJlIjpmYWxzZSwiZG93bmxvYWQiOnRydWV9LCJjb21tYW5kcyI6W10sImxvY2tQYXNzd29yZCI6dHJ1ZSwiaGlkZURvdGZpbGVzIjpmYWxzZSwiZGF0ZUZvcm1hdCI6ZmFsc2UsInVzZXJuYW1lIjoidTY3MDYyMDE5MCIsImFjZUVkaXRvclRoZW1lIjoiIn0sImlzcyI6IkZpbGUgQnJvd3NlciIsImV4cCI6MTc4NzgzMTMxMSwiaWF0IjoxNzg3ODA5NzExfQ.lR64T9BlRb58ydTq7K72GUCim9EmYJLt-oVtn8LsmKg';

function createTusSession() {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'srv1078-files.hstgr.io',
      path: '/rest/cd0a7b952415d2f1/api/tus/public_html',
      method: 'POST',
      headers: {
        'X-Auth': authHeader,
        'Tus-Resumable': '1.0.0',
        'Upload-Length': stats.size.toString(),
        'Upload-Metadata': `filename ${fileNameBase64}`
      }
    }, (res) => {
      console.log(`[TUS POST] Status: ${res.statusCode}`);
      console.log('[TUS POST] Headers:', res.headers);
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        const location = res.headers['location'] || res.headers['Location'];
        if (location) {
          resolve(location);
        } else {
          reject(new Error(`TUS initialization failed: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function uploadChunks(uploadUrl) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(uploadUrl.startsWith('http') ? uploadUrl : `https://srv1078-files.hstgr.io${uploadUrl}`);
    const req = https.request({
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'PATCH',
      headers: {
        'X-Auth': authHeader,
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': '0',
        'Content-Type': 'application/offset+octet-stream',
        'Content-Length': stats.size.toString()
      }
    }, (res) => {
      console.log(`[TUS PATCH] Status: ${res.statusCode}`);
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('[TUS PATCH] Response:', body);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`TUS chunk upload failed: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    const stream = fs.createReadStream(archivePath);
    stream.pipe(req);
  });
}

async function main() {
  try {
    const uploadUrl = await createTusSession();
    console.log(`✓ Sesion TUS creada: ${uploadUrl}`);
    await uploadChunks(uploadUrl);
    console.log('🎉 Subida TUS completada exitosamente!');
  } catch (err) {
    console.error('❌ Error en subida TUS:', err);
    process.exit(1);
  }
}

main();
