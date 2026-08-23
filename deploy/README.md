# Despliegue del auth-server (Omni-IA Game)

Infraestructura de producción para cuentas + licencias en **fenixdev.cloud**.

## Contenido

| Archivo | Para qué |
|---|---|
| `HOSTINGER_HPANEL.md` | Guía paso a paso para hPanel (Hostinger) — vía principal |
| `ecosystem.config.cjs` | PM2 (VPS — proceso persistente + auto-reinicio) |
| `nginx-omni-auth.conf` | Reverse proxy nginx (VPS) |
| `Dockerfile` | Imagen Docker (VPS) |
| `backup.js` | Backup cifrado de `data.db` + claves (Node puro) |

## Flujo completo en producción

1. La app Omni-IA (Tauri) apunta a `https://fenixdev.cloud` como servidor de cuentas.
2. Usuarios se registran → código por correo → activan → `POST /api/me` mantiene la sesión.
3. El administrador entra a `https://fenixdev.cloud/admin` y genera licencias desde el panel
   (firma Ed25519 **en el servidor** + registro en BD en un solo clic).
4. La app valida su licencia localmente (firma pública embebida) y además la contrasta
   online (`POST /api/licenses/validate`): si fue revocada/borrada/expirada o el HWID no
   coincide, se bloquea el acceso premium.
5. Recordatorios automáticos avisan al cliente (correo) cuando la licencia está por expirar.

## Requisitos

- Node.js **>= 22.5** (el servidor usa `node:sqlite`, sin compilación nativa).
- Los orígenes de la app Tauri siempre están permitidos (CORS).
- La clave privada Ed25519 NUNCA viaja al repositorio: se configura en el servidor vía
  `LICENSE_PRIVATE_KEY` (env) o `LICENSE_PRIVATE_KEY_PATH` (archivo).
