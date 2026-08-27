import fs from 'fs';
import path from 'path';
import https from 'https';

const archivePath = path.join(process.cwd(), 'omni_auth_deploy_safe.zip');
const stats = fs.statSync(archivePath);
const fileName = 'omni_auth_code_deploy.zip';

console.log(`🚀 Preparando subida de ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)...`);

// Hostinger TUS / File Browser Direct Upload
const authHeader = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjoxLCJsb2NhbGUiOiJlbl9VUyIsInZpZXdNb2RlIjoibGlzdCIsInNpbmdsZUNsaWNrIjpmYWxzZSwicmVkaXJlY3RBZnRlckNvcHlNb3ZlIjpmYWxzZSwicGVybSI6eyJhZG1pbiI6ZmFsc2UsImV4ZWN1dGUiOmZhbHNlLCJjcmVhdGUiOnRydWUsInJlbmFtZSI6dHJ1ZSwibW9kaWZ5Ijp0cnVlLCJkZWxldGUiOnRydWUsInNoYXJlIjpmYWxzZSwiZG93bmxvYWQiOnRydWV9LCJjb21tYW5kcyI6W10sImxvY2tQYXNzd29yZCI6dHJ1ZSwiaGlkZURvdGZpbGVzIjpmYWxzZSwiZGF0ZUZvcm1hdCI6ZmFsc2UsInVzZXJuYW1lIjoidTY3MDYyMDE5MCIsImFjZUVkaXRvclRoZW1lIjoiIn0sImlzcyI6IkZpbGUgQnJvd3NlciIsImV4cCI6MTc4NzgzMTMxMSwiaWF0IjoxNzg3ODA5NzExfQ.lR64T9BlRb58ydTq7K72GUCim9EmYJLt-oVtn8LsmKg';

async function uploadFile() {
  const options = {
    hostname: 'srv1078-files.hstgr.io',
    path: `/rest/cd0a7b952415d2f1/api/resources/${fileName}?override=true`,
    method: 'PUT',
    headers: {
      'X-Auth': authHeader,
      'Content-Type': 'application/zip',
      'Content-Length': stats.size
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      console.log(`STATUS: ${res.statusCode}`);
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('RESPONSE:', body);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(true);
        } else {
          reject(new Error(`Upload failed with status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    const stream = fs.createReadStream(archivePath);
    stream.pipe(req);
  });
}

uploadFile().catch(err => {
  console.error('Error en subida:', err);
  process.exit(1);
});
