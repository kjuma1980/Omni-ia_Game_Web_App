# OMNIDEPLOY — Proveedor de GPU Remota vía fenixdev.cloud

Fecha: 2026-08-04
Estado: PLAN REVISADO (sin ejecutar)

> **Lee antes el §0.** La revisión del plan encontró que el transporte elegido
> —WebSocket— es justo lo que peor soporta el hosting compartido actual. El §0
> sustituye tres decisiones; el resto del documento sigue vigente.

Decisiones del usuario:
  1. Relay en subdominio dedicado: `omni-api.fenixdev.cloud`
  2. Agente del host en **Python**
  3. Credenciales por **auto-registro del agente** + aprobación manual del dueño
  4. ~~Transporte agente-relay por **WebSocket**~~ → **sondeo largo**, ver §0
  5. **Sin VPS**: se implementa sobre el hosting compartido existente, sin costes
     nuevos, pero modular para migrar a VPS cuando sea comercial.

---

## 0. Revisión del plan (2026-08-04)

### 0.1 Lo que se verificó contra el código

| Afirmación | Realidad |
|---|---|
| `ALLOWED_CLOUD_DOMAINS` en `lib.rs:440-459` | correcto; añadir un dominio es aditivo |
| Patrón ComfyDeploy clonable | correcto; `pollComfyDeployRun` existe y se usa desde 3 sitios |
| «Reutiliza de auth-server» para el WebSocket | **falso**: las dependencias son `bcryptjs`, `dotenv`, `express`, `jsonwebtoken`, `nodemailer`. No hay librería de WebSocket; sería dependencia nueva |

### 0.2 Los cuatro riesgos

1. **WebSocket sobre hosting compartido.** `deploy/HOSTINGER_HPANEL.md` §5 avisa de
   que el proceso se duerme. Una conexión persistente es lo peor que se puede
   apoyar en eso: si el proceso duerme, el agente no recibe trabajos. El
   `POST /jobs/:id/result` cubre la subida del resultado, no la recepción.
2. **El relay en el mismo proceso que las licencias.** Un fallo del relay tumbaría
   el login y la validación de licencias. El 2026-08-04 ya se comprobó lo frágil
   que es ese proceso.
3. **Los binarios pasan por el hosting.** Host → disco compartido → app. Sin tope
   de tamaño ni TTL agresivo, la cuota se agota. Y `jobs/` **no puede vivir dentro
   de la carpeta de la app**: cada despliegue la reemplaza.
4. **Una sola GPU, sin límite de concurrencia ni aviso de host apagado.**

### 0.3 Transporte: sondeo largo en vez de WebSocket

```
GET /api/omnideploy/agent/poll        (cabecera: deviceToken)
   → el relay espera hasta 25 s a que haya trabajo
   → 200 {job_id, inputs}   ó   204 sin contenido
   → el agente vuelve a preguntar de inmediato
```

- **Sobrevive a que el proceso duerma**: una petición nueva lo despierta; una
  conexión muerta no se entera.
- **Cero dependencias nuevas.**
- **El agente mantiene vivo el servidor**: una petición cada 25 s es el
  «keep-alive» que recomienda la guía de despliegue, gratis.
- 25 s por debajo del corte habitual de 30 s de los proxies intermedios.

### 0.4 Aislamiento posible en compartido

| Medida | Qué protege |
|---|---|
| Base propia `omnideploy.db`, aparte de `data.db` | que los trabajos no toquen cuentas ni licencias |
| `OMNIDEPLOY_ENABLED=false` → rutas 503 | apagar el relay sin tocar login ni licencias |
| Router propio `auth-server/omnideploy.js`, montado con una línea | quitarlo es quitar esa línea |
| Datos en `OMNI_DATA_DIR/omnideploy/jobs/` | que un despliegue no los borre |

### 0.5 Contención del almacenamiento

- TTL de **2 horas**, no 24.
- Borrado al leer el fichero.
- Tope 25 MB por fichero, 100 MB por trabajo; se rechaza en el agente.
- Barrido de caducados en el propio sondeo. Sin cron.
- Cola máxima de 5 pendientes; el sexto recibe 429 con su posición.

### 0.6 Estado visible para el usuario

- `last_seen_at` del agente en cada sondeo.
- `GET /api/omnideploy/status` → `{online, queue_depth, position}`.
- Más de 60 s sin sondeo ⇒ proveedor **caído**: la app dice «GPU no disponible»
  en vez de dejar al usuario esperando.

### 0.7 Modularidad para migrar a VPS

| Pieza | Fichero | Qué cambia en el VPS |
|---|---|---|
| Transporte del agente | `omnideploy-agent/transporte.py` | clase con `obtener_trabajo()` / `enviar_resultado()`; se añade la variante WebSocket al lado |
| Notificación en el relay | `auth-server/omnideploy/cola.js` | hoy consulta la tabla; mañana además empuja por WS |
| Almacén de resultados | `auth-server/omnideploy/almacen.js` | disco local hoy; S3 o disco del VPS mañana |
| Base de datos | `omnideploy.db` | se copia, o se migra sin tocar `data.db` |

**Regla:** ningún módulo fuera de esos cuatro debe saber si el transporte es
sondeo o WebSocket. Si al migrar hay que tocar un quinto fichero, el aislamiento
estaba mal hecho.

### 0.8 Fases revisadas

1. **Relay**: `omnideploy.js`, `omnideploy.db`, interruptor y almacén con TTL.
2. **Agente**: `agent.py` + `transporte.py` (variante sondeo), registro, purga.
3. **Extremo a extremo con `curl`**, antes de tocar la app: encolar → el agente
   lo recoge → devuelve resultado → se descarga. **Si esto no funciona, el resto
   sobra.** Es la fase que el plan original no tenía y la que más tiempo ahorra.
4. **Cliente**: `types.ts`, ramas en `aiProvider`/`localService`, `pollOmniDeployRun`.
5. **Interfaz**: `SettingsModal`, tooltips, aviso de proveedor no disponible.
6. **Rust**: un dominio a la lista blanca.

### 0.9 Lo que sigue sin resolver

- Una GPU y muchos usuarios: la cola lo hace soportable, no rápido (~90 s/imagen).
- Si el PC del dueño está apagado no hay proveedor; el aviso evita la mala
  experiencia, no la sustituye.
- **Los límites reales del hosting compartido no están medidos**: cuota de disco,
  ancho de banda y si hay corte de peticiones largas. Los 25 s del sondeo son una
  apuesta razonable; la fase 3 dirá si hay que bajarlos.

---

## 0.10 Lo construido (2026-08-05) — rama `OMNIDEPLOY`

Fases 1 a 5 hechas y desplegadas. Difiere del plan en cuatro puntos y conviene
saber por qué.

### Qué existe

| Pieza | Dónde |
|---|---|
| Relay | `auth-server/omnideploy/` — `index.js`, `db.js`, `cola.js`, `almacen.js` |
| Agente | `omnideploy-agent/` — `agent.py`, `transporte.py` |
| Cliente | `services/omniDeploy.ts` |
| Interfaz | proveedor `omnideploy` en las 6 listas y 4 bloques de credenciales |
| Panel | pestaña **Dispositivos** con equipos y clientes |
| Emisión por consola | `scratch/asistente-omnideploy.mjs` |

Montado en `server.js` con **dos líneas**. `OMNIDEPLOY_ENABLED=false` lo apaga
sin tocar el login ni las licencias.

### Diferencias con el plan, y su motivo

**1 · Una clave POR CLIENTE, no una por dispositivo.** El plan tenía
`deployment_id` + `api_key` en la tabla de dispositivos: una sola clave para
todos. Con eso, retirar el acceso a un cliente obliga a cambiársela a todos y no
hay forma de saber quién consume la GPU. Se añadió `omnideploy_clients`: el
dispositivo es el PC con la tarjeta, el cliente es quien tiene permiso. Cada
trabajo queda atribuido con `client_id`, y `jobs_count` y `last_used_at` dicen
quién gasta.

**2 · La aplicación manda PARÁMETROS, no el grafo.** `generateLocalImage` no
recibe el workflow y su firma es común a todos los proveedores: cambiarla por
uno solo habría tocado código que funciona. Viajan prompt, negativo y tamaño, y
el agente monta el workflow. Es además más correcto — quien sabe qué modelos hay
instalados es el host. Si el trabajo trae `workflow`, ese tiene preferencia, y
`OMNI_WORKFLOW` permite fijar uno propio.

**3 · La pestaña 3D reutiliza `baseUrl` y `apiKey`.** Es lo que ya hace
ComfyDeploy ahí. Seguir el patrón vale más que dos campos que existirían en un
solo sitio.

**4 · El subdominio no es cosmética.** `omni-api.fenixdev.cloud` está en la lista
blanca de Rust **en lugar de** `fenixdev.cloud` entero: si el relay tuviera un
fallo de redirección, esa lista no le abriría de paso el servidor de licencias.

### Tres tropiezos que costaron tiempo

**Cloudflare rechaza a `urllib` por su firma.** El registro del agente fallaba
con `error code: 1010` antes de llegar al servidor: `urllib` se presenta como
`Python-urllib/3.10` y esa firma está vetada. El agente se identifica ahora como
`OmniDeployAgent/1.0`. El mismo muro apareció al llamar a la API de Hostinger
desde Node.

**El proveedor existía y no se podía elegir.** Se añadió `omnideploy` a las
listas de MODELOS pero no a las de BOTONES, que son otra cosa y están en seis
sitios. Tenía tipos, cliente y bloques de credenciales, y no aparecía en Ajustes.
Lo detectó el usuario probándolo.

**HTTP 525 al estrenar el subdominio.** Cloudflare llegaba a Hostinger pero el
TLS fallaba: el certificado del subdominio aún no estaba emitido. Se comprobó
conectando al origen con SNI —`fenixdev.cloud` tenía certificado,
`omni-api.fenixdev.cloud` no— en vez de suponerlo. Los DNS son de **Cloudflare**,
no de Hostinger: la zona de Hostinger es un espejo inerte y editarla no hace
nada.

### Verificación

Ciclo completo contra un `auth-server` real sobre base temporal: clave maestra
falsa rechazada, registro pendiente, sin aprobar no sondea, el panel lo ve, la
aprobación emite credenciales, encolar sin agente vivo da 503, con agente vivo
entra en cola, el agente lo recoge por sondeo con los inputs intactos, `apiKey`
inválida rechazada, entrega, consulta y descarga, y las licencias siguen
respondiendo. Y para las claves por cliente: dos clientes con claves distintas,
**revocar a uno devuelve 401 y el otro sigue en 200**.

En producción: subdominio 200, relay 403 a clave falsa, el agente entra por el
subdominio y sigue aprobado sin volver a registrarse.

### Pendiente

- **La prueba real generando**: agente + ComfyUI encendido + una imagen. Es lo
  único que dirá si el hosting compartido aguanta el sondeo de 25 s. Si lo corta,
  es un número en `cola.js`.
- **Fase 6**: ramas de generación para vídeo, voz, música y 3D. Hoy solo imagen.

---

## Plan original (referencia)

---

## 1. Objetivo

Nuevo proveedor `omnideploy` en Omni-IA Game: los usuarios finales se conectan a la
GPU del PC del dueño para probar generaciones, con el mismo modelo mental que
ComfyDeploy (Deployment ID + API Key), ultraseguro (tokens, TLS, whitelist Rust),
sin exponer nunca la IP del host.

Regla base: **100% aditivo**. No se toca ni modifica ningún proveedor ni flujo existente.

---

## 2. Arquitectura

```
App Tauri (usuario final)                 PC del dueño (GPU host)
┌─────────────────────────┐               ┌──────────────────────────────┐
│ aiProvider / localService│               │ Agente PYTHON (omnideploy)   │
│  → invoke proxy_request  │               │  → ComfyUI 127.0.0.1:8188    │
└───────────┬─────────────┘               └──────────────┬───────────────┘
            │ HTTPS (whitelist Rust)                     │ wss:// saliente
            ▼                                             ▼
   https://omni-api.fenixdev.cloud  ⇐== websocket ==⇒  agente del host
      (relay: cola + jobs + auth)       (push de jobs)
```

- El usuario final ve solo `Deployment ID` + `API Key` (emitidos por el relay tras
  autorizar al agente).
- El host solo abre conexión saliente vía WebSocket. No expone IP ni puertos.
- La app encola por HTTPS y hace polling por HTTPS (igual que ComfyDeploy).

---

## 3. Backend relay (auth-server, solo-aditivo)

Nuevas rutas + tablas SQLite:
- `omnideploy_devices` (id, master_key_hash, device_token_hash, deployment_id,
  api_key_hash, friendly_name, status[pending|active|revoked], created_at, authorized_at)
- `omnideploy_jobs` (id, deployment_id, status[pending|running|success|failed],
  inputs, outputs_ref, error, created_at, ttl_expires_at)

Rutas:
- `POST /api/omnideploy/devices/register`
  Auto-registro del agente: `{masterKey, friendlyName}` → crea dispositivo `pending`
  → devuelve `deviceId + deviceToken`.
- `GET/POST /api/omnideploy/devices/:id/authorize` (panel admin)
  El dueño aprueba el dispositivo → el relay emite `deploymentId` (público) +
  `apiKey` (secreto para la app del usuario final).
- `POST /api/omnideploy/queue`
  La app envía `{deploymentId, apiKey, inputs}` → `{job_id}`, estado `pending`.
- WebSocket `wss://omni-api.fenixdev.cloud/agent/ws`
  El agente autentica con `deviceToken` y recibe push de `new_job`. Mensajes:
  - server→agent: `{"type":"new_job","job_id":..., "inputs":{...}}`
  - agent→server: `{"type":"job_result","job_id":..., "status":"success|failed", "files":[...], "error":...}`
- `POST /api/omnideploy/jobs/:id/result` (opcional HTTPS con deviceToken)
  Fallback por si el WS se cae; sube resultados y binarios.
- `GET /api/omnideploy/jobs/:id`
  Polling HTTPS de la app: `{status, outputs:[{data:{images|audio|video|glb}}]}`.
- `GET /api/omnideploy/jobs/:id/files/:name`
  Devuelve el binario; la app lo baja vía `proxy_request` como base64.

Reutiliza de auth-server: `rateLimit`, `logAudit`, `db.js`, `admin.html`
(nueva pestaña "DISPOSITIVOS"). Persistencia de salida en `OMNI_DATA_DIR/jobs/<id>/`.

---

## 4. Agente Python (nuevo folder `omnideploy-agent/`)

- Python 3 en venv propio; dependencia mínima: `websockets`.
- Archivos:
  - `agent.py` — bucle asyncio: registro/auto-auth → WS (reconexión backoff 5→60s)
    → recibe `new_job` → `POST /127.0.0.1:8188/prompt` → polling `GET /history/{promptId}`
    → mapea outputs de `output/` → responde `job_result`.
  - `agent.env` (NO committear):
    - `OMNI_RELAY_URL=wss://omni-api.fenixdev.cloud/agent/ws`
    - `OMNI_MASTER_KEY=<clave maestra del dueño, SOLO aquí>`
    - `OMNI_COMFYUI_URL=http://127.0.0.1:8188`
    - `OMNI_DEVICE_TOKEN=<auto-persistido en agent.json tras registrarse>`
  - `agent.json` — estado persistido (deviceId/deviceToken tras el registro).
- Opcional: `pm2` para autostart del agente en el host.

---

## 5. Cambios cliente (100% aditivos)

| Archivo | Cambio |
|---|---|
| `types.ts` | `omniDeployApiKey?` / `omniDeployDeploymentId?` en image (304), video (316), threeD (324/332), audio tts/music/sfx (358–374) |
| `SettingsModal.tsx` | `'omnideploy'` en arrays de proveedores (78, 91, 102, 114, 127 + renders 2671, 3109, 3449, 3828, 2963); bloques "OmniDeploy API Key / Deployment ID" clonados del patrón ComfyDeploy (2705+, 3155+, 3479+, 3841+); `usesOmniDeploy` (820–824); `testProviderConnection('omnideploy', ...)` (843–864); flags en 518–521 |
| `services/aiProvider.ts` | ramas `provider === 'omnideploy'` junto a las de comfydeploy (401–417, 1123–1126, 1253–1256, 1555, 3D 2618–2679) reusando helper común de queue/polling/base64 |
| `services/localService.ts` | ramas `isOmniDeploy` en audio (329), imagen (528), animación (1472), TTS (1676); `pollOmniDeployRun` (clon de `pollComfyDeployRun` 2040–2093, 150 intentos); `testProviderConnection('omnideploy')` (1904–1939) |
| `src-tauri/src/lib.rs` | añadir **`omni-api.fenixdev.cloud`** a `ALLOWED_CLOUD_DOMAINS` (440–459). `proxy_request` / `is_url_allowed` sin cambios |
| `constants/tooltips.ts` | tooltips `settings*OmniDeploy*` (clon de 883–949) |

---

## 6. Seguridad ("ultraseguro")

- Whitelist Rust estricta al subdominio `omni-api.fenixdev.cloud` (sin SSRF; las IPs
  del host nunca son accesibles).
- API keys del usuario final viajan solo por `proxy_request` (proceso Rust → invisibles
  en DevTools).
- `masterKey` / `deviceToken` SOLO en el host; el relay almacena hashes y permite
  revocación desde el panel admin.
- Auto-registro = aprobación manual del dueño (anti intrusión).
- Rate limiting por IP y por apiKey; TTL de jobs (24 h); audit logs.
- TLS en el subdominio (cert de Hostinger, como fenixdev.cloud).

---

## 7. Despliegue / infraestructura

1. **DNS**: registro `omni-api` (A/CNAME) en Cloudflare → hosting + TLS automático.
2. **Relay**: rutas + tablas en `auth-server`, deploy por MCP Hostinger.
3. **Agente**: `omnideploy-agent/` en el repo, activado en el PC host (PM2).
4. **App**: fases 3 y 4 (cliente + UI) verificando `tsc --noEmit` + `cargo check`.

---

## 8. Fases de ejecución

1. **Backend relay**: DNS/TLS del subdominio + rutas register/authorize/queue/jobs +
   WebSocket + tablas + admin (pestaña DISPOSITIVOS).
2. **Agente Python**: auto-registro, WS con reconexión, ejecución ComfyUI local,
   subida de resultados.
3. **Cliente**: `types.ts` + ramas en aiProvider/localService + `pollOmniDeployRun`.
4. **UI**: SettingsModal + tooltips.
5. **Rust whitelist** + deploy MCP + **E2E real** (queue app → push WS → ComfyUI host
   → resultado descargado).

Verificación al final: `npx tsc --noEmit` 0 errores, `vite build` OK, `cargo check` OK,
`py_compile` de `agent.py` OK.

---

## Archivos de referencia (patrón ComfyDeploy)

- `services/localService.ts`: `fetchJsonSecure` (16–49), `getHeaders` (8–14),
  `generateLocalImage` rama ComfyDeploy (528–608), `pollComfyDeployRun` (2040–2093),
  audio (329–385), animación (1472–1534), TTS (1676–1730), `testProviderConnection` (1904–1939).
- `services/aiProvider.ts`: ramas comfydeploy (401–417, 1123–1126, 1253–1256, 1555, 3D 2618–2679).
- `components/SettingsModal.tsx`: arrays de proveedores y bloques UI por tab.
- `src-tauri/src/lib.rs`: `ALLOWED_CLOUD_DOMAINS` (440–459), `proxy_request` (1001+).
- `types.ts`: campos ComfyDeploy en image (304–305), video (316–317), threeD (324–333), audio (358–374).
- `auth-server`: base para el relay (server.js, db.js, mailer.js, license.js, admin.html).