# Despliegue en Hostinger hPanel (vía principal)

Dominio: **fenixdev.cloud** (DNS gestionado en Cloudflare, correo en Hostinger).

## 1. Preparar el código

```bash
cd auth-server
# Instalar dependencias localmente (o directamente en el hosting)
npm install
node --check server.js   # sintaxis OK
```

## 2. Subir el proyecto al hosting

1. Entra a hPanel → **Hosting → Gestionar** (el plan debe soportar Node.js).
2. **Dominios** → añade/vincula `fenixdev.cloud` al hosting (hPanel lo gestiona).
3. En Cloudflare (DNS del dominio), crea el registro:
   - Tipo **A**, nombre `@`, valor = **IP del hosting** (hPanel → *Detalles del servidor*).
   - Si Cloudflare proxya (naranja), ponlo en **Solo DNS (gris)** mientras configuras
     el certificado; luego puedes reactivar el proxy.
4. Sube la carpeta `auth-server/` (SIN `node_modules`, SIN `.env` ni `data.db`) con el
   **Gestor de archivos** o FTP a la raíz de tu app Node (hPanel usa una carpeta tipo
   `nodejs/` dentro de la cuenta).
5. Crea la carpeta de claves (protegida, NO dentro de public_html):
   `keys/` y sube `ed25519_private.pem` (la misma clave privada que firma las licencias).

## 3. Configurar la app Node.js

hPanel → **Avanzado → Node.js** (o "Node.js app"):

| Campo | Valor |
|---|---|
| Aplicación | carpeta donde subiste `auth-server` |
| Archivo de entrada | `server.js` |
| Versión de Node | **22 LTS** (o 23/24; mínimo 22.5 por `node:sqlite`) |
| URL de la aplicación | `https://fenixdev.cloud` |
| Variables de entorno | pega el contenido de `.env.production.example` completado |

Variables críticas (completar con valores reales):

```
HOST=0.0.0.0
PORT=4010                       # hPanel lo proxya; puede ser el puerto asignado
JWT_SECRET=<aleatorio largo>
ADMIN_BOOTSTRAP_PASSWORD=<fuerte, solo la primera vez>
LICENSE_REGISTER_KEY=<aleatorio largo>
LICENSE_PRIVATE_KEY_PATH=/home/<usuario>/keys/ed25519_private.pem
CORS_ORIGINS=https://fenixdev.cloud,https://www.fenixdev.cloud
TRUST_PROXY=1
SMTP_PASS=<contraseña real del correo omniia.edu@fenixdev.cloud>
```

## 4. Arrancar y verificar

1. hPanel → **Node.js** → botón **Ejecutar / Reiniciar** la aplicación.
2. Comprueba los **logs** de la app (sin errores; se creará `data.db` y el admin).
3. Desde tu navegador:
   - `https://fenixdev.cloud/api/health` → `{"ok":true,...}`
   - `https://fenixdev.cloud/` → landing FenixDev Cloud
   - `https://fenixdev.cloud/admin` → panel de administración (login con el admin)
4. Haz el smoke test completo:
   - Generar una licencia desde el panel (pestaña **Generar**) y copiarla.
   - Activar esa licencia en una app Omni-IA → validación online OK.
   - Revocar la licencia en el panel → en ≤30 s la app muestra **LICENCIA BLOQUEADA**.

## 5. Recordatorios (SMTP)

Con `REMINDERS_ENABLED=true` el scheduler corre dentro del mismo proceso Node.
En hosting compartido el proceso se duerme a veces; si hPanel lo permite, crea un
**cron** que toque `https://fenixdev.cloud/api/health` cada hora para mantenerlo vivo.

## 6. Seguridad post-despliegue (IMPORTANTE)

- [ ] Cambia la contraseña admin inicial tras el primer login.
- [ ] No dejes `.env` ni `ed25519_private.pem` accesibles por web (fuera de la raíz pública).
- [ ] Mantén un backup de `data.db` (usa `node deploy/backup.js`).
- [ ] Guarda copias de `ed25519_private.pem` en al menos 2 lugares seguros.
