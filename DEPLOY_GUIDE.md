# 🚀 Guía Oficial de Compilación y Despliegue — Omni IA Game

Este documento describe el procedimiento optimizado y estricto para compilar, firmar digitalmente y desplegar nuevas versiones de **Omni IA Game** en **Hostinger** (`fenixdev.cloud`) sin bloqueos ni retrasos.

---

## 📌 1. Variables y Claves Criptográficas (Tauri v2 Updater)

* **Clave Pública (Ed25519 / Minisign)**: `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEEzQ0FGM0M0MDcyOEQwMTcKUlVUQllFSGZBb2xqVitFb0RNOHl6STBYSGhFVDBCZzZuUllOM0VlV0NqU2NqNGlKcVpqSTljMm00dGsxZHNWQWo1N2IvK0tIcVBZTUN6OFpLVFBKSjlRUGpFc1o3MGFmOXcwPQo=`
* **Clave Privada**: Almacenada en la variable de entorno `$env:TAURI_SIGNING_PRIVATE_KEY`.
* **Configuración en `src-tauri/tauri.conf.json`**:
  ```json
  "bundle": {
    "createUpdaterArtifacts": true
  }
  ```

---

## ⚡ 2. Procedimiento de Compilación del Instalador

Ejecutar en PowerShell:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJVTldUT0J3Q3Rvd3VnZ0p3Y1hDazU5V213bFhQc1ZlVnlaR2Z5OHR3eEkvNGM4aVJpc2x2KzE4QU5lMkdHcllCY2VjclphOGkKUk12VmluN2FhU28zWjR0NW0wK1k0S2t4d1lFcWZwR3dqcW9xSVc1cDF3TktpUXlSVDN4S2I2eGZ1OG9SOHF1dWpFcjVtcVZyCjZJcldmK2V5ZmtndS9tTXF3cmtwTkE9PQo="

npx tauri build
```

**Artefactos Generados en `src-tauri/target/release/bundle/nsis/`**:
1. `Omni IA Game_0.2.7_x64-setup.exe` (Instalador NSIS, ~392 MB)
2. `Omni IA Game_0.2.7_x64-setup.exe.sig` (Firma criptográfica Minisign)

---

## 🌐 3. Procedimiento de Despliegue a Hostinger (`fenixdev.cloud`)

1. Desplegar el código liviano del servidor con `node scripts/package_code_deploy.mjs` y `hosting_deployJsApplication`.
2. Subir el instalador `.exe` de ~392 MB de forma directa y atómica en ~1-2 minutos con `node scripts/upload_to_server.mjs`.
3. La base de datos persistente en `/home/u670620190/omni_data/data.db` y las licencias se mantienen 100% intactas.

---

## 🔍 4. Verificación de Producción

Comprobar que todos los endpoints respondan `HTTP 200 OK` (o redirección 302 hacia 0.2.7):
```powershell
node scratch/test_production_endpoints.mjs
```

