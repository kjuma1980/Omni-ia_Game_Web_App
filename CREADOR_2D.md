# Creador de Mundos 2D / 2.5D

Submódulo de edición de escenarios acoplado a **Omni IA Game**, en la pestaña
`ASSETS` ▸ subpestaña `Mundos` ▸ botón **Creador 2D**.

Es un módulo autónomo: tiene su propia base de datos PostgreSQL, su propia API,
su propia sesión y su propio cliente de datos. No lee ni escribe el estado de la
aplicación base, y ésta sigue funcionando exactamente igual si el servicio del
Creador 2D está apagado.

---

## 1. Estructura

```
omni-ia-game-educational-version/
│
├── components/AssetGenerator.tsx      ← ÚNICO archivo de la app base tocado (+69 / -1)
│
├── modules/creador2d/                 ← EDITOR WEB (se compila con la app base)
│   ├── WorldForge2D.tsx               Raíz del módulo: salud, sesión, navegación
│   ├── types.ts                       Tipos de dominio del editor
│   ├── schemas.ts                     Validación Zod de todo lo que entra por red
│   ├── vite-env.d.ts                  Declaración local de import.meta.env
│   │
│   ├── core/                          MOTOR DE EDICIÓN (sin React)
│   │   ├── grid.ts                    Snapping magnético, chunks, Y-sort, colisiones
│   │   ├── chunkStore.ts              Residencia estricta de 9 chunks + edición optimista
│   │   ├── chunkWorker.ts             Web Worker: prepara y ordena los planes de dibujo
│   │   ├── renderer.ts                Canvas 2D con culling y orden 2.5D
│   │   ├── procedural.ts              Generador de baldosas (arte original en runtime)
│   │   └── history.ts                 Deshacer/rehacer con captura previa de celdas
│   │
│   ├── state/
│   │   ├── editorStore.ts             Zustand: sólo el estado que redibuja la UI
│   │   └── services.ts                Singletons no reactivos (cliente, store, renderer)
│   │
│   ├── api/
│   │   ├── client.ts                  REST + rotación transparente de tokens
│   │   ├── socket.ts                  Socket.IO: chunks en vivo y presencia
│   │   └── hooks.ts                   TanStack Query
│   │
│   ├── hooks/useWorldEditor.ts        Orquestador: lienzo, cámara, herramientas, red
│   │
│   └── components/                    Toolbar, LayerPanel, BlockPalette, VirtualHand,
│                                      StatusBar, AiPanel, ProfilePanel, ExportPanel,
│                                      WorldBrowser, LoginPanel, Toasts, BlockSwatch
│
├── creador2d-backend/                 ← API CENTRAL (proceso independiente)
│   ├── prisma/
│   │   ├── schema.prisma              12 modelos + 6 enums
│   │   ├── migrations/                Migración inicial aplicada
│   │   └── seed.ts                    33 bloques, 5 logros, 2 usuarios, 1 mundo demo
│   ├── src/
│   │   ├── common/domain/tiles.ts     FUENTE DE VERDAD de la geometría
│   │   ├── auth/                      JWT rotativo + Argon2id + token de motor
│   │   ├── blocks/  worlds/  chunks/  Catálogo, mundos y edición transaccional
│   │   ├── gamification/              Puntos, XP, inventario, fabricación, logros
│   │   ├── realtime/                  Gateway WebSocket (namespace /realtime)
│   │   ├── export/                    3 formatos que consumen los motores
│   │   └── ai/                        Propuestas de IA validadas e inertes
│   └── test/creador2d.e2e-spec.ts     25 pruebas de extremo a extremo
│
└── creador2d-plugins/                 ← PLUGINS CLIENTE
    ├── unity/                         4 archivos C#
    ├── godot/                         3 archivos GDScript (Godot 4.x)
    └── unreal/                        Plugin C++ (.uplugin + Source/)
```

---

## 2. Tecnologías

| Capa | Elección | Nota |
|---|---|---|
| Editor web | React 19, TypeScript estricto, Tailwind, **Zustand**, **TanStack Query**, **Zod** | Se compila dentro de la app base (Vite) |
| Motor de dibujo | **API Canvas 2D optimizada** | Ver decisión en §8 |
| Concurrencia | **Web Worker** para preparar y ordenar chunks | `core/chunkWorker.ts` |
| API | **NestJS 11 sobre Fastify**, TypeScript | Puerto **4310** |
| ORM / BD | **Prisma 6** + **PostgreSQL 18** (BD `Creador_2d`) | El enunciado pedía 17; la máquina tiene 18.4 |
| Tiempo real | **Socket.IO** (`@nestjs/websockets`) | Namespace `/realtime` |
| Seguridad | **JWT rotativos** + **Argon2id** (`@node-rs/argon2`) + Helmet + Throttler | Ver §7 |
| IA | Ollama local (por defecto), Gemini, OpenAI, **Anthropic (SDK oficial, `claude-opus-5`)** | Opcional y desactivada de fábrica |
| Pruebas | Jest + Supertest | 49 unitarias + 39 e2e |

**Sin Docker, sin WSL.** Todo se ejecuta como procesos nativos de Windows.

---

## 3. Reglas técnicas de edición implementadas

### Ajuste magnético (grid snapping)

La conversión píxel → tile se hace **siempre** con división entera hacia abajo
(`Math.floor(v / tileSize)`), nunca con `Math.round`, `Math.trunc` ni `| 0`.

Esto no es una preferencia de estilo. El truncamiento parte en dos el
comportamiento en el semieje negativo: `Math.trunc(-1 / 32)` es `-0`, de modo que
los píxeles `-1` y `+1` caerían ambos en el tile `0` y aparecería una fisura de
un tile completo al desplazar la cámara al otro lado del origen. La prueba
`tiles.spec.ts` lo verifica explícitamente, incluida la comprobación de que cada
píxel pertenece a exactamente un tile sin solapes ni huecos.

- Implementación: [`creador2d-backend/src/common/domain/tiles.ts`](creador2d-backend/src/common/domain/tiles.ts)
- Espejo del editor: [`modules/creador2d/core/grid.ts`](modules/creador2d/core/grid.ts)
- **Prueba de paridad** entre ambas copias: `grid-parity.spec.ts` (compara 3.200+
  valores por función).

### Carga por chunks

- Chunks cuadrados de **16×16 o 32×32** tiles (validado en el esquema Zod y en Prisma).
- `ChunkStore.setCamera()` mantiene residentes **exactamente los 9 chunks** de la
  matriz 3×3 centrada en la cámara; todo lo demás se descarta de memoria.
- Al cruzar una frontera de chunk se pide la ventana completa con **una sola
  petición** (`GET /chunks/viewport?cx&cy&radius=1`).
- La conversión de un chunk a lista de dibujo ordenada (4.096 lecturas + una
  ordenación por chunk) se hace en un **Web Worker**, no en el hilo de UI.

### Ordenamiento de capas (2.5D)

Cuatro capas por celda: `GROUND` (suelo) · `PIT` (fosos) · `WALL` (muros
dinámicos) · `OVERLAY` (techos y copas).

El eje de ordenación ancla en el **borde inferior** del elemento, no en su
centro:

```
ySortOrigin = (tileY + heightInTiles) * tileSize + ySortOffset
```

Así un árbol de 2 tiles cuya base está en la fila 4 se ordena igual que un bloque
apoyado en la fila 5 — que es exactamente lo que el ojo espera. El Y-sort sólo se
activa en las perspectivas que lo necesitan (3/4 y laterales), no en la cenital pura.

### Exportación de colisiones

Matriz lógica invisible, **en columna separada** de la capa visual
(`Chunk.collision`, tipo `Bytes`): un byte por celda con banderas binarias.

| Bandera | Valor | Bandera | Valor |
|---|---|---|---|
| `SOLID` | 1 | `ONE_WAY` | 16 |
| `WATER` | 2 | `DAMAGE` | 32 |
| `STAIRS` | 4 | `LADDER` | 64 |
| `PIT` | 8 | `TRIGGER` | 128 |

Se **deriva siempre** de los bloques presentes en la celda (unión de sus
banderas), tanto en el servidor como en la vista optimista del cliente. Al ser
determinista, no puede desincronizarse de lo que se ve. Un chunk de 32×32 ocupa
exactamente 1.024 bytes.

---

## 4. Instalación

### 4.1 Base de datos y backend

```bash
cd creador2d-backend
npm install
```

Copie `.env.example` a `.env` y rellene los valores (el `.env` ya creado apunta a
la base local). Después:

```bash
npm run setup
```

`setup` ejecuta `prisma generate` + `prisma migrate deploy` + `db:seed`. La base
`Creador_2d` debe existir; si no, créela una vez:

```bash
psql -U postgres -h localhost -c "CREATE DATABASE \"Creador_2d\""
```

Arrancar la API:

```bash
npm run start:dev
```

### 4.2 Editor web

No requiere pasos adicionales: se compila con la aplicación base.

```bash
npm run dev
```

Abra **ASSETS ▸ Mundos ▸ Creador 2D**. Si el backend está apagado, el módulo
muestra las instrucciones para levantarlo en lugar de fallar.

### 4.3 Plugin de Unity

1. Copie `creador2d-plugins/unity/*.cs` a `Assets/Creador2D/` de su proyecto.
2. Cree un GameObject vacío y añada el componente **Creador2DWorldBuilder**.
3. Rellene en el inspector:
   - **Api Url** → `http://127.0.0.1:4310`
   - **World Id** → UUID del mundo
   - **Engine Token** → token de 12 h
   (los tres se copian del panel *Motores y exportación* del editor web).
4. Ajuste **Units Per Pixel** (`1/32` = un tile de 32 px ocupa 1 unidad).
5. Opcional: asocie prefabs por clave de bloque en **Block Prefabs**. Lo que no
   tenga prefab se dibuja como un sprite del color base del bloque.
6. Ejecute la escena. Con **Generate Colliders** activo se crean `BoxCollider2D`
   fusionando celdas sólidas contiguas de cada fila.

Consultas desde su código: `builder.IsSolidAt(x, y)`, `builder.CollisionMaskAt(x, y)`.

### 4.4 Plugin de Godot (4.x)

1. Copie `creador2d-plugins/godot/*.gd` a `res://addons/creador2d/`.
2. Añada un `Node2D` a la escena y asigne el script **creador2d_world_builder.gd**.
3. Rellene en el inspector `api_url`, `world_id` y `engine_token`.
4. Opcional: asocie escenas por clave en `block_scenes`
   (`{"stone_wall": preload("res://muro.tscn")}`).
5. Ejecute. Se genera un `StaticBody2D` con las colisiones fusionadas por filas.

Consultas: `builder.is_solid_at(x, y)`, `builder.collision_mask_at(x, y)`.
Señales: `world_built(matrix)`, `build_failed(message)`.

> El eje Y de Godot 2D crece hacia abajo, igual que en el editor: **no** hay que
> invertir el signo (a diferencia de Unity).

### 4.5 Plugin de Unreal Engine

1. Copie la carpeta `creador2d-plugins/unreal` a `<Proyecto>/Plugins/Creador2D`.
2. Clic derecho en el `.uproject` → *Generate Visual Studio project files*.
3. Compile el proyecto (el módulo depende de `HTTP`, `Json` y `JsonUtilities`).
4. Arrastre **Creador2DWorldBuilder** al nivel y rellene `ApiUrl`, `WorldId` y
   `EngineToken`.
5. Ajuste **Units Per Pixel** (`3.125` = un tile de 32 px ocupa 100 uu).
6. Opcional: asocie clases de actor por clave en **Block Actor Classes**.

Convención de ejes del plugin: **X = derecha, Z = arriba, Y = profundidad** (una
franja por capa). Funciones expuestas a Blueprint: `IsSolidAt`,
`GetCollisionMaskAt`, `GetBlockKeyAt`, `BuildWorld`, `ClearWorld`.

---

## 5. Variables de entorno

Todas en `creador2d-backend/.env`. La plantilla `.env.example` **no contiene
ningún valor real**, ni de base de datos ni de proveedores cloud.

| Variable | Por defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | — | Cadena de conexión PostgreSQL |
| `PORT` | `4310` | Puerto de la API (3000 está reservado y 3142 lo usa Vite) |
| `HOST` | `127.0.0.1` | Sólo escucha en local |
| `NODE_ENV` | `development` | |
| `CORS_ORIGINS` | `localhost:3142`, `tauri://localhost` | Orígenes permitidos, separados por coma |
| `JWT_ACCESS_SECRET` | — | Mínimo 32 caracteres; la app no arranca sin él |
| `JWT_REFRESH_SECRET` | — | Debe ser distinto del anterior |
| `JWT_ACCESS_TTL` | `900s` | Vida del token de acceso |
| `JWT_REFRESH_TTL` | `7d` | Vida del token de refresco |
| `AI_ENABLED` | `false` | La IA está **desactivada de fábrica** |
| `AI_DEFAULT_PROVIDER` | `ollama` | Motor local, no requiere clave |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | |
| `OLLAMA_MODEL` | `llama3.1` | |
| `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | vacío | Vacío = proveedor desactivado |

El editor web acepta `VITE_CREADOR2D_API` para apuntar a otra URL sin recompilar.

---

## 6. Comandos

### Backend (`creador2d-backend/`)

| Comando | Qué hace |
|---|---|
| `npm run setup` | Genera Prisma, aplica migraciones y siembra |
| `npm run start:dev` | API en modo watch |
| `npm run start:prod` | Ejecuta `dist/main.js` |
| `npm run build` | Compila a `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint 9 (configuración plana) |
| `npm test` | 38 pruebas unitarias |
| `npm run test:e2e` | 25 pruebas de extremo a extremo |
| `npm run prisma:migrate` | Nueva migración |
| `npm run prisma:studio` | Inspector visual de la BD |

### Aplicación base (raíz)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Vite en el puerto 3142 |
| `npm run build` | Compila la app, incluido el módulo |
| `npm run lint` | `tsc --noEmit` sobre todo el proyecto |

---

## 7. Credenciales de la semilla

Sólo para el entorno local de desarrollo. Se definen en `.env` y pueden cambiarse
antes de sembrar.

| Usuario | Email | Clave | Rol |
|---|---|---|---|
| `admin` | `admin@creador2d.local` | `Admin.Creador2D.2026` | ADMIN |
| `creador` | `creador@creador2d.local` | `Creador.2D.2026` | CREATOR |

Base de datos: `postgresql://postgres@localhost:5432/Creador_2d` (la clave está
únicamente en `.env`, que está en `.gitignore`).

El seed crea además el mundo de demostración **Valle de Inicio**
(`valle-de-inicio`), en vista cenital 3/4, con un sendero, un estanque y un muro
perimetral.

### Modelo de seguridad

- **Claves cloud**: viven exclusivamente en el proceso del backend. Nunca se
  envían al navegador, no aparecen en `.env.example` ni en el repositorio, y
  `GET /ai/status` sólo revela *si* un proveedor está configurado, nunca su valor.
- **Contraseñas**: Argon2id (19 MiB, 2 iteraciones, paralelismo 1). El login
  ejecuta una verificación incluso cuando el usuario no existe, para que el
  tiempo de respuesta no permita enumerar cuentas.
- **Refresh tokens rotativos**: se guarda sólo el hash. Cada canje revoca el
  anterior y emite el siguiente de la misma familia; presentar un token ya
  rotado revoca **toda la familia** (detección de robo). Verificado en e2e.
- **Token de motor**: rol `VIEWER`, 12 h, sólo lectura. El motor nunca maneja las
  credenciales del usuario.
- **La IA no toca la base de datos.** Produce una propuesta que el backend valida
  contra el catálogo de bloques, contra el tipo de mundo y contra un rectángulo
  autorizado; se guarda como dato inerte (`AiSuggestion` en estado `PENDING`) y
  sólo se aplica cuando una persona la acepta — momento en el que se ejecuta
  **con la identidad del usuario** y pasa por los mismos controles que una
  edición manual.
- **Inventario, puntos, experiencia, logros y roles** los calcula el servidor a
  partir de las celdas realmente escritas. No hay ninguna ruta por la que el
  cliente o la IA puedan reclamar progresión.

---

## 8. Decisiones de diseño

**Canvas 2D en lugar de PixiJS.** El enunciado permitía cualquiera de los dos. Se
eligió Canvas 2D porque el módulo se acopla dentro de una aplicación Tauri que ya
ejecuta `<model-viewer>` (WebGL) en otras pestañas, y un segundo contexto WebGL
persistente compite por recursos de GPU con ComfyUI en la misma máquina; además
evita sumar una dependencia pesada a la app base. El coste se compensa con
baldosas prerasterizadas, culling por rectángulo visible y listas de dibujo ya
ordenadas por el worker. El bucle sólo repinta cuando algo cambia.

**Vite en lugar de Next.js.** El enunciado pedía Next.js con App Router, pero la
aplicación base es **Vite + React 19 + Tauri v2** y la instrucción de no
modificarla es prioritaria. Convertirla a Next.js habría implicado reescribir el
arranque, el enrutado y la integración con Tauri. El módulo usa React 19 con
TypeScript estricto, Tailwind, Zustand, TanStack Query y Zod tal y como se pedía;
sólo cambia el empaquetador que lo compila.

**Arte 100 % procedural.** Ninguna baldosa es un archivo de imagen. Cada bloque
es un descriptor (`patrón + paleta`) que `procedural.ts` rasteriza en tiempo de
ejecución con un PRNG semillado por la clave del bloque. No se copia ni se
distribuye ningún recurso de terceros, y el mismo bloque siempre se ve igual.

**Copia de la geometría en lugar de paquete compartido.** El editor no puede
importar código del backend (son proyectos npm distintos y la app base no tiene
workspaces). En vez de introducir un monorepo en una aplicación que no lo usa, se
mantiene una copia literal en `modules/creador2d/core/grid.ts` protegida por la
prueba de paridad `grid-parity.spec.ts`, que compara ambas implementaciones valor
a valor.

---

## 9. Acople en la aplicación base

Un único archivo modificado: **`components/AssetGenerator.tsx`** (+69 líneas, −1).

1. `import` diferido del módulo (`lazy` + `Suspense`), para que la pestaña ASSETS
   no cargue el editor mientras no se abra.
2. Un estado local `worldTool` (`'generator' | 'creator'`) cuyo valor por defecto
   conserva intacto el comportamiento anterior.
3. Un conmutador **Generador IA / Creador 2D** visible sólo en el subtab Mundos.
4. Un `return` anticipado que monta el editor a pantalla completa.

Ninguna función, estado ni ruta existente cambia de comportamiento. Revertir el
acople es borrar esas cuatro adiciones.

También se añadieron 4 dependencias a `package.json` (`zustand`, `zod`,
`@tanstack/react-query`, `socket.io-client`); las existentes no se tocaron.

---

## 10. Verificación realizada

| Comprobación | Resultado |
|---|---|
| `tsc --noEmit` (app base + módulo) | ✅ 0 errores |
| `vite build` | ✅ worker emitido aparte; editor en un chunk diferido de 247 kB |
| `tsc --noEmit` (backend) | ✅ 0 errores |
| `nest build` | ✅ `dist/main.js` |
| ESLint 9 (backend) | ✅ 0 problemas |
| `prisma migrate` | ✅ migración inicial aplicada |
| `db:seed` | ✅ 33 bloques, 5 logros, 2 usuarios, 1 mundo |
| Pruebas unitarias | ✅ 38/38 |
| Pruebas e2e | ✅ 25/25 |
| API en ejecución | ✅ health, login, ventana 3×3, edición, exportación |

Comprobaciones funcionales sobre la API real: la ventana devuelve los 9 chunks
(incluidos `-1:-1`, lo que valida la división entera con negativos); la matriz de
colisiones se deriva correctamente; la exportación coincide celda a celda con lo
editado; y las cinco vías de escritura ilegítima (sin token, bloque inexistente,
capa equivocada, tipo de mundo incorrecto, IA desactivada) se rechazan.

---

## 11. Ampliación v2 (2026-07-26)

### Bugs corregidos

| Síntoma reportado | Causa real | Corrección |
|---|---|---|
| `Body cannot be empty when content-type is set to 'application/json'` | El cliente enviaba esa cabecera **también en peticiones sin cuerpo**, y Fastify las rechaza con 400. | La cabecera solo se añade cuando hay `body`. |
| No se podían borrar mundos | Mismo origen: el `DELETE` iba con `content-type` y sin cuerpo. | Resuelto por lo anterior. |
| El contenido «se reiniciaba» al desplazarse y solo se veían los límites a zoom mínimo | La residencia estaba fijada en 3×3 chunks, más pequeña que el viewport a zoom bajo: el usuario alcanzaba el borde de lo cargado. | Radio **adaptativo** (1–3) que cubre el viewport, contorno de la región residente dibujado en pantalla, velo sobre lo no editable, y botones **Encuadrar chunk** / **Encuadrar mundo**. El modo estricto 3×3 sigue disponible con el botón `3x3`. |
| La cámara arrancaba en un punto fijo | Posición inicial hardcodeada en (256, 256). | Al abrir un mundo la cámara se encuadra sobre su contenido real. |
| No se podía vaciar el mundo | No existía la operación. | `DELETE /worlds/:id/chunks` + botón con confirmación. Se avisa por socket a los demás editores. |
| Dudas sobre el campo Bioma | Era texto libre. | Desplegable de 16 biomas con descripción. El bioma filtra la paleta y el estilo de los fondos. |

Además: al desalojar chunks la lista global de muros no se invalidaba y podían quedar
muros de chunks ya descargados.

### Catálogo ampliado: 33 → 228 bloques

Organizado en `prisma/catalog/` por familias, con generadores en lugar de entradas
literales. Recuento por categoría al sembrar.

| Categoría | Contenido |
|---|---|
| **TERRAIN** (49) | 12 familias de suelo (tierra, hierba, hierba fina, arena, nieve, losa, adoquín, cemento, madera, tierra húmeda, grava, ceniza) **cada una con su variante agrietada**; remates de hierba (`grass_edge`, `grass_on_dirt`, `grass_on_stone`); bloques sólidos laterales; escalones, rampas y desniveles; carriles y andenes. |
| **WALL / COLUMN / RUIN** (52) | 7 materiales × {intacto, agrietado, en ruinas} + columna y columna rota. Escombros y grietas sueltas. |
| **VEGETATION** (24) | 7 árboles en dos piezas (tronco sólido + copa por encima del personaje): roble, pino, **palmera, platanera, cafeto**, árbol seco, cactus. **4 enredaderas** (colgante, de muro, florida y liana trepable), helechos, setas. |
| **FLUID** (10) | 5 texturas de agua y 5 de lava, todas animadas. |
| **STRUCTURE** (21) | **10 casas y 10 castillos**; tejados. |
| **RUIN** (incl.) | **5 chozas en ruinas y 5 castillos en ruinas**. |
| **FURNITURE** (20) | Baúles, camas, mesas, sillas, estanterías, cuadros, espejos, alfombras, **televisor, radio**, armarios, calderos. Colocación **libre**, no anclada a la rejilla. |
| **LIGHT** (9) | Antorchas de muro y de pie, lamparillas, farolas, faroles colgantes, pebeteros, velas. |
| **DECOR** (7) | **6 estatuas** + estalactitas. |
| **VEHICLE** (10) | **5 carretas y carruajes** + 5 automóviles urbanos. |
| **ENTRANCE** (5) | Bocas de cueva, puertas y **pozos**, enlazables con un interior. |
| **SIGN** (6) | Señales de dirección, de aldea, de peligro, paneles y mojones. |
| **PROP** (13) | Barandas (madera, piedra, metal), puentes, muelles, escaleras, pinchos, obstáculos de runner. |

Todo sigue siendo **arte procedural original**: se añadieron 19 patrones nuevos
(`cracked`, `rubble`, `column`, `grassEdge`, `grassTuft`, `vine`, `cobble`, `thatch`,
`metal`, `glass`, `fabric`, `wood`, `roofTile`, `window`, `flame`, `statue`, `railing`,
`wheel`, `signpost`) más una capa de suciedad superpuesta (musgo, nieve, humedad, hollín).

### Nuevos modelos de datos

- **`ParallaxLayer`** — capas de fondo por mundo (`SKY`, `FAR`, `MID`, `NEAR`) con
  velocidad de parallax independiente en X e Y, tinte, opacidad, repetición y origen
  (procedural, IA local, IA cloud o subida).
- **`WeatherSetting`** — tipo (lluvia, nieve, polvo, ceniza, lluvia de lava, niebla,
  neblina), intensidad 0–1, **dirección de viento** (abajo, izquierda, derecha,
  abajo-izquierda, abajo-derecha, arriba), fuerza del viento, densidad de niebla y tinte.
- **`FluidSetting`** — por mundo y tipo de fluido: sentido de la corriente, velocidad,
  amplitud de onda y **burbujas ascendentes** con su frecuencia.
- **`PlacedObject`** — mobiliario y adornos en posición continua (píxeles), con rotación,
  escala y volteo. No participa de la matriz de colisiones.
- **`World.isInterior` / `parentWorldId` / `entranceTileX/Y`** — un interior (cueva, casa,
  castillo) **es a su vez un mundo**, enlazado por la celda de su entrada. Reutilizar el
  mismo modelo evita duplicar chunks, exportación y permisos.
- **`BlockDefinition.category` / `placement` / `tags` / `variant` / `animated` / `entrance`**.

La semilla incluye una migración que reescribe las claves renombradas en las paletas de
los chunks ya guardados: sin ella, un mundo creado antes de la ampliación conservaría
referencias a bloques inexistentes y perdería su colisión en silencio.

### Scripts de runtime generados al exportar

`GET /worlds/:id/export/scripts?engine=unity|godot|unreal`

Genera el script nativo con los valores del editor **ya incrustados**, y solo de lo que
el mundo usa realmente:

| Motor | Clima | Fluidos |
|---|---|---|
| Unity | `Creador2DWeather.cs` — `ParticleSystem` con fuerza de viento constante y `SetIntensity()` en caliente | `Creador2DFluids.cs` — desplazamiento de UV por `MaterialPropertyBlock` |
| Godot 4.x | `creador2d_weather.gd` — `GPUParticles2D` + `ParticleProcessMaterial` | `creador2d_fluids.gd` — parámetro de shader `uv_offset` |
| Unreal | `Creador2DWeather.h` — `UParticleSystemComponent` con parámetros expuestos | `Creador2DFluids.h` — `UMaterialInstanceDynamic` |

La conversión de ejes se resuelve por motor: con viento `DOWN_LEFT` la deriva sale
`(-4.95, -9.90)` en Unity (Y hacia arriba), `(-4.95, +9.90)` en Godot (Y hacia abajo) y
`(-4.95, 0, -9.90)` en Unreal (Z vertical).

## 12. Fondos de parallax generados con IA

`POST /worlds/:id/parallax/:layerId/generate` — usa el **ComfyUI que Omni IA Game ya
levanta**. No requiere ninguna clave y nada sale de la máquina. Si ComfyUI está apagado,
el panel lo indica y el editor sigue funcionando con fondos procedurales.

### Por qué el prompt es así

Un fondo de parallax no es «una imagen bonita del bioma»: tiene tres restricciones duras
y el prompt está construido alrededor de ellas (`src/ai/background-prompts.ts`).

**1. Debe repetirse en horizontal sin costura.** El bucle se garantiza en el muestreo
(padding circular solo en X, ver abajo), pero el prompt también ayuda: se pide contenido
uniformemente distribuido y **sin elemento protagonista**, porque un rasgo único y
llamativo delata el punto de repetición aunque la costura sea matemáticamente perfecta.
También se pide que los bordes extremos queden visualmente calmados.

**2. Cada capa debe leerse a su distancia.** La profundidad en 2D se comunica con
perspectiva atmosférica. Si la capa lejana tiene el mismo contraste que la media, el
parallax se percibe como un fallo de renderizado, no como profundidad.

| Capa | Contenido | Tratamiento |
|---|---|---|
| `SKY` | Solo cielo y nubes, sin suelo ni horizonte | Contraste muy bajo, alta luminosidad, nubes repartidas |
| `FAR` | Montañas, skyline, cresta de bosque | Muy desaturado, tintado hacia el color del cielo, silueta casi plana, base fundida al cielo |
| `MID` | Arboleda, edificios, relieve intermedio | Más saturado y contrastado que `FAR`, borde inferior cortado plano (lo tapa el tilemap) |
| `NEAR` | Follaje que pasa por delante del jugador | Casi silueta, oscuro, **centro obligatoriamente vacío** |

**3. No puede competir con el juego.** El negativo es largo y explícito: sin personajes,
sin objetos que parezcan recogibles, sin texto, sin interfaz, sin marcos ni viñeteado.

**Composición según la perspectiva.** Las referencias de runner (Subway Surfers, Temple
Run) miran al horizonte con punto de fuga central, así que para `COUNTRYSIDE_RUNNER` se
pide composición **simétrica con horizonte alto**; para `SIDE_PLATFORMER`, vista lateral
plana **sin punto de fuga** y horizonte bajo; en cenital el horizonte queda muy alto o
no existe.

**Paleta por bioma.** 16 biomas, cada uno con cielo, tono lejano, tono medio, acento,
rasgos característicos por capa y atmósfera — descritos con **nombres de color en inglés**,
que es a lo que responden los modelos, no a hexadecimales.

`POST /worlds/:id/parallax/prompt-preview` devuelve el prompt y su justificación **sin
consumir GPU**, para poder revisarlo antes de generar.

### Cómo se garantiza el tileado horizontal

Dos mecanismos, porque el primero **no es suficiente** y se comprobó midiéndolo:

1. **En el muestreo.** El workflow parchea el modelo con `Model Patch Seamless (mtb)`
   usando `tilingX: true` y `tilingY: false`: padding circular en el eje horizontal y no
   en el vertical. Es exactamente lo que necesita una capa de parallax — bucle a
   izquierda y derecha, pero con un arriba y un abajo distintos.

2. **Al cargar la imagen, en el editor** (`core/parallax.ts`). El parche anterior solo
   afecta al UNet, no al decodificador VAE, que sigue introduciendo artefactos en la
   columna del borde. Medido sobre una capa real generada:

   | Medida | Valor |
   |---|---|
   | Diferencia media última columna ↔ primera (la costura) | **23,34 / 255** |
   | Diferencia media entre columnas contiguas interiores | 1,88 / 255 |

   Es decir, un corte 12× más marcado que una transición normal: perfectamente visible.
   Se corrige con un solape mezclado que es seamless **por construcción**:

   ```
   N = W − B                            (ancho del tile resultante)
   T[x] = S[x]                          para x en [B, N)
   T[x] = lerp(S[x + N], S[x], x / B)   para x en [0, B)
   ```

   Como `T[N−1] = S[N−1]` y `T[0] = S[N]` son columnas **contiguas** del original, el
   tile encaja consigo mismo. Con `B = 12 %` del ancho, sobre la misma capa la costura
   baja a **3,08 / 255**, ya al nivel del ruido interno de la imagen.

### Configuración

| Variable | Por defecto |
|---|---|
| `COMFYUI_BASE_URL` | `http://127.0.0.1:8188` |
| `COMFYUI_BG_CHECKPOINT` | `dreamshaperXL_lightningDPMSDE.safetensors` |
| `COMFYUI_BG_STEPS` / `_CFG` | `8` / `2` (checkpoint *lightning*: converge en pocos pasos) |
| `COMFYUI_BG_SAMPLER` / `_SCHEDULER` | `dpmpp_sde` / `karras` |

Requiere el nodo **`Model Patch Seamless (mtb)`** instalado en ComfyUI.

Las imágenes se guardan como *data URL* en `ParallaxLayer.imageUrl`, de modo que el mundo
queda autocontenido: al exportarlo, los plugins reciben el fondo incrustado sin depender
de que ComfyUI siga levantado. Una capa de 1536×512 ocupa ~1,1 MB en base64.

**Prueba real realizada:** capa `FAR`, bioma `grassland`, 1536×512, 8 pasos — 93 s en la
RTX 3090, resultado con perspectiva atmosférica correcta, sin personajes ni texto, y
bordes calmados.

## 13. Ambiente, mobiliario, interiores y runner (v3)

### Panel de clima y fluidos

`GET/PATCH /worlds/:id/weather` · `GET/POST/DELETE /worlds/:id/fluids`

El panel expone tipo de efecto (lluvia, nieve, polvo, ceniza, lluvia de lava, niebla,
neblina), intensidad, **rosa de viento** de 7 direcciones, fuerza del viento y densidad
de niebla. Los fluidos se configuran por bloque con su sentido de corriente, velocidad y
—en la lava— burbujas ascendentes.

`GET /worlds/:id/fluids/in-use` devuelve solo los fluidos **realmente colocados** en el
mundo, de modo que el panel no ofrece configurar una corriente para un agua que no existe.

Nada de esto se dibuja en el editor: son parámetros de ambiente que se traducen al script
nativo al exportar (§11). El panel lo dice explícitamente para que no se espere una
previsualización que no existe.

### Mobiliario: arrastrar y soltar

Herramienta **Mobiliario** (tecla `O`). Solo acepta bloques con `placement: FREE`
—mobiliario, vehículos y señales—; con cualquier otro avisa y no hace nada.

- **Clic** en zona libre: coloca el bloque seleccionado en la posición exacta del cursor,
  **sin ajustar a la rejilla**. La posición se guarda en píxeles con decimales.
- **Arrastrar** un objeto existente: lo mueve conservando el punto de agarre. Durante el
  arrastre se pinta en su posición provisional y el servidor solo se entera al soltar.
- **Clic derecho**: lo retira.

Los objetos viven en `PlacedObject`, fuera de los chunks, y **no participan de la matriz
de colisiones**: una silla adorna, no bloquea. Se dibujan ordenados por Y, anclados a su
borde inferior igual que el resto de la escena.

### Interiores navegables

`GET/POST /worlds/:id/interiors`

Un interior **es un mundo**, enlazado al exterior por la celda de su entrada
(`parentWorldId` + `entranceTileX/Y`). Reutilizar el mismo modelo significa que se edita
con las mismas herramientas, se exporta igual y hereda permisos, en vez de inventar un
segundo tipo de contenido.

Desde el panel: sitúe el cursor sobre la celda de la puerta o boca de cueva, ponga nombre
y bioma, y se crea. La lista permite entrar en cada interior con un clic. El interior
hereda perspectiva, tamaño de tile y chunk del exterior para que el mismo personaje encaje
en ambos sin reescalar. No se permiten interiores dentro de interiores ni dos interiores
en la misma entrada (409).

### Modo runner

Las referencias que se usaron (Subway Surfers, Temple Run) comparten estructura: el
jugador **no recorre un plano libre**, baja por un pasillo de carriles y todo lo demás es
decorado lateral. El contenido viene del horizonte hacia la cámara, es decir, de arriba
abajo en el lienzo de edición.

En los mundos `COUNTRYSIDE_RUNNER` el editor dibuja el **pasillo de 3 carriles** con sus
separadores y sus bordes. Fuera de esos bordes empieza el decorado (andenes, casas,
vehículos, obstáculos), que el catálogo ya cubre. Sin esa referencia es fácil construir la
carretera descentrada o con un ancho que el jugador no puede recorrer.

### Los plugins montan el parallax

Los tres motores crean ahora las capas de fondo desde el export, decodificando el PNG
incrustado en el data URL, y instancian el mobiliario libre.

| Motor | Parallax | Objetos libres |
|---|---|---|
| Unity | `Creador2DParallax.cs` — fila de sprites reciclada por módulo; `speedX` se aplica como `camPos.x * (1 − speedX)` | Instanciados sin ajuste a rejilla, con rotación, escala y volteo |
| Godot 4.x | `creador2d_parallax.gd` — se apoya en `ParallaxBackground`; `speedX` → `motion_scale`, ancho de textura → `motion_mirroring` | `Node2D` con `y_sort_enabled` |
| Unreal | `Creador2DParallax.h/.cpp` — planos reciclados con `UMaterialInstanceDynamic` | Actores con la conversión de ejes del plugin |

En los tres, la textura se marca con repetición horizontal (`TextureWrapMode.Repeat`,
`motion_mirroring`, `TA_Wrap`): sin ella el muestreo del borde mezcla la última columna
con la primera y reaparece una línea fina en cada unión, justo lo que §12 resolvió.

## 14. Objetos, clima visible, runner y puente con el generador (v4)

### Los objetos se dibujan como objetos

Era un fallo de diseño del catálogo, no un detalle de acabado: el mobiliario
declaraba **patrones de textura** (`wood`, `fabric`, `metal`) donde hacían falta
**siluetas**. Un barril con `pattern: 'wood'` no dibuja un barril: rellena la
celda con veta de madera. Lo mismo con la cama, que salía como un rectángulo de
tela, y con los 20 muebles enteros.

`modules/creador2d/core/shapes.ts` añade **34 siluetas** dibujadas sobre fondo
transparente, apoyadas en el borde inferior de la celda (el mismo ancla que el
Y-sort) y con sombra de contacto para que no floten: barril, caja, cama, mesa,
mesa redonda, silla, taburete, baúl, armario, estantería, librería, cuadro,
espejo, alfombra, televisor, radio, lámpara, caldero, antorcha, farola, vela,
cubo, pozo, señal, cono, valla, andamio, coche, autobús, tren, carreta, moneda,
gema y trampa.

`procedural.ts` resuelve la silueta **antes** que el patrón y sin el relleno de
fondo: los patrones siguen existiendo, pero para lo que son — materiales de
suelo y muro. Los colores de sombra y realce se derivan del color base cuando la
paleta trae uno solo, para no obligar al catálogo a declarar tres.

`BlockDefinition.defaultScale` fija el tamaño con el que cae cada pieza, en
fracciones de baldosa: una cama con dosel sale a 2,4×, una vela a 0,5×. Salir
todos a 1× obligaría a redimensionar cada objeto nada más soltarlo. El fantasma
de colocación ya se ve a ese tamaño, y con el cursor encima **la rueda del ratón
redimensiona** (0,1×–8×) en lugar de mover la cámara, con la escala escrita bajo
el objeto para que el gesto se descubra.

### El clima se ve

Antes sólo se guardaba y viajaba al script exportado. Defendible desde dentro
— «el editor no simula físicas» — e inútil desde fuera: quien elige lluvia espera
ver lluvia. `core/weather.ts` dibuja ahora una **previsualización** con los
mismos valores que se incrustan en los scripts.

Cada efecto tiene perfil físico propio, que es lo que distingue nieve de lluvia:
velocidad de caída, dispersión, bamboleo lateral (0 en la lluvia, 26 px en la
nieve, 40 en el polvo), forma de dibujo (trazo orientado a la velocidad real,
copo, mota o ascua con halo) y velo de color. Niebla y neblina apenas llevan
partículas: su efecto está en el velo, más denso abajo.

Elegir un efecto lo enciende y aplica su tinte por defecto; **Despejado lo
apaga** y libera las partículas. Mientras hay clima el lienzo repinta cada
fotograma; en cuanto se apaga vuelve al repintado por cambio, para no gastar CPU
con la escena quieta.

**Relámpagos**, que faltaban: `WeatherType.STORM` los trae de serie y la casilla
`lightning` permite añadirlos a una ventisca o a una lluvia de ceniza. No son una
partícula más — el destello ilumina la escena entera — así que se pintan como velo
a pantalla completa con caída rápida y repique. La cadencia es una **media con
margen aleatorio**: un intervalo exacto se percibe como parpadeo mecánico. Los
tres motores generan su componente: `Creador2DLightning` (velo `SpriteRenderer`
que sigue a la cámara) en Unity, `CanvasLayer` + `ColorRect` en Godot, y
`ACreador2DLightning` con `UDirectionalLightComponent` pulsante en Unreal.

### Inclinación de la rejilla en grados

`World.gridAngle` (−45° a +45°), con panel propio y valores predefinidos. El
plano del mundo gira entero alrededor del centro de la vista: rejilla, bloques,
objetos y guías giran juntos. El imán sigue siendo exacto porque **el puntero se
desgira antes de convertirse en celda**; sin eso, cursor y bloque se separarían
más cuanto mayor fuera el ángulo. El parallax queda fuera del giro a propósito:
el horizonte no se inclina con el suelo.

### Runner, con el género analizado

Cómo funciona *Subway Surfers*, *Temple Run 2*, *Sonic Dash* y *Minion Rush*, y
qué consecuencias tiene para el editor:

1. El personaje **no se desplaza**: corre en el sitio, centrado, y es el
   escenario el que viene hacia él. El mundo se construye como una **tira
   vertical** recorrida de abajo hacia arriba, no como un mapa libre.
2. Hay **carriles discretos** (3 en los cuatro juegos). El jugador salta de
   carril a carril, no se mueve en continuo. De ahí `World.laneCount` y
   `World.laneWidth`, configurables en el panel de geometría.
3. Los obstáculos se clasifican por **la acción que obligan a hacer**, que es la
   única taxonomía útil al diseñar un tramo: bajo → saltar, alto → deslizarse,
   total → cambiar de carril. Se marcan con etiqueta (`saltar`, `deslizar`,
   `esquivar`) para que motor y generador de tramos puedan razonar sobre ellas.
   Los pórticos bajo los que uno se desliza **no son sólidos**: si lo fueran, el
   motor bloquearía al jugador en vez de dejarle pasar agachado.
4. Las **monedas no se esparcen al azar**: van en hilera dentro de un carril, y
   trazan la ruta segura o tientan hacia la peligrosa. Por eso son bloque de
   rejilla, pintables en línea con el mismo gesto que el suelo.
5. Los **potenciadores** son escasos y temporales: imán, escudo, impulso,
   multiplicador.

`prisma/catalog/runner.ts` añade **65 bloques**:

| Familia | Cantidad | Detalle |
|---|---|---|
| Calles | 36 | 6 materiales (pavimento, tierra, pasto, nieve, arena, piedra) × 6 piezas (carril, línea divisoria, borde, arcén, paso de peatones, tramo en obras) |
| Obstáculos | 10 | Cono, valla de obra, retén policial, andamio, pórtico, señal de obras, tronco, roca, bala de heno, socavón |
| Trampas | 5 | Pinchos, cepo, sierra, surtidor de fuego, descarga |
| Coleccionables | 9 | 2 monedas, 3 gemas, 4 potenciadores |
| Mobiliario urbano | 4 | Andén, bordillo, línea de salida, punto de control |

La «calle doble» que se veía era la **línea divisoria** usada como si fuera
calzada; ahora es una pieza con nombre propio dentro del juego completo.

Los **vehículos** pasan a silueta vista desde arriba y **orientada en vertical**
— en un runner el tráfico ocupa el carril y avanza hacia el jugador; de perfil
sale atravesado en la calzada — y su `heightInTiles` es la longitud real: coche 2
baldosas, autobús 4, camión 4,5, vagón 6. Se añaden autobús urbano, escolar,
camión de carga y dos vagones (metro y mercancías).

**Total: 228 → 290 bloques.**

### Puente: del generador de sprites al catálogo

Lo generado en **Asset Foundry** ya no hay que descargarlo y volverlo a subir.
Cada tarjeta de asset tiene un botón **2D** que abre un formulario con nombre,
categoría (14), los 4 tipos de mundo, tamaño, alto en baldosas y colisión; al
aceptar, el bloque entra en PostgreSQL y aparece en la paleta del editor.

- `POST /blocks/custom` y `DELETE /blocks/custom/:key`.
- La imagen viaja como **data URL y se guarda en la fila**, no en disco: un PNG
  de 128×128 ronda los 10–25 KB en base64 y a cambio el bloque es autocontenido
  — si mañana se limpia la carpeta de salidas de ComfyUI, el bloque sigue ahí.
  Límite de 2 MB.
- `isSystem: false` los separa del catálogo sembrado: la semilla no los toca, y
  el catálogo base **no se puede borrar** (403).
- Capa y modo de colocación se **deducen de la categoría**: terreno, muro,
  columna, ruina, fluido y entrada van a la rejilla; el resto se sueltan libres.
- El renderizador y la muestra de la paleta usan la imagen cuando existe, con
  decodificación asíncrona y el dibujo procedural como provisional mientras
  carga.
- **No toca inventarios, puntos, experiencia, logros, roles ni calificaciones**:
  amplía el catálogo y nada más. Un rol `VIEWER` no puede darlo de alta.
- Reutiliza el cliente compartido del editor y **nunca crea uno nuevo**: los
  tokens de refresco rotan con detección de reutilización, así que dos clientes
  partiendo del mismo token guardado revocarían la sesión entera.

Sigue siendo un solo punto de acople en la aplicación base: `AssetGenerator.tsx`
importa el diálogo de forma diferida y añade el botón.

## 15. Módulo de pago y sesión única (v5, 2026-08-04)

### 15.1 La licencia decide si el módulo existe

El Creador 2D se vende aparte de Animación, NPCs y Suite 3D. El payload firmado
con Ed25519 lleva una lista de módulos:

```json
{ "hw": "OMNI-HW-…", "exp": "2026-09-18", "cap": "none", "ut": 64800,
  "mods": ["creador2d"] }
```

`mods` es **opcional y solo se escribe cuando trae algo**: una licencia sin
módulos produce exactamente los mismos bytes que antes de existir el campo, así
que las ya emitidas siguen verificando. En Rust es `Option` con
`#[serde(default)]` por la misma razón.

**Nivel de acceso `none`.** Antes solo existían `full` y `dev_portal`, y
`src-tauri/src/lib.rs` **rechaza la licencia entera** si el valor no está en su
lista — no concede menos, la invalida. Sin un tercer valor no había forma de
vender el Creador 2D suelto sin regalar además el Portal Dev.

| Producto | `cap` | `mods` |
|---|---|---|
| Módulos del estudio | `full` | — |
| Creador de Mundos 2D | `none` | `creador2d` |
| Ambos en una licencia | `full` | `creador2d` |

La lista de niveles vive en `auth-server/license.js` y `server.js` la importa en
vez de repetirla: **divergir de la de Rust significa emitir licencias que la
aplicación rechaza**.

**Sin derecho no se pinta nada.** Se descartó mostrar el botón con un candado:
un control visible pero bloqueado es un cartel que indica dónde hurgar. No
aparecen el selector de herramienta, ni el botón «2D» de las tarjetas de sprite,
ni el interruptor del Portal Dev, ni mención alguna en la pantalla de licencia.

Tres condiciones, y las tres deben darse:

1. la firma Ed25519 es válida,
2. la firma nombra `creador2d`,
3. el servidor de licencias no la ha rechazado.

La tercera usa `licenseOnline.valid`, el mismo criterio que rige para los otros
módulos: solo cae cuando el servidor responde y **rechaza**. Estar sin internet
no apaga el módulo — la aplicación tiene que funcionar sin conexión.

### 15.2 Un solo inicio de sesión

Hasta ahora había dos: el de la cuenta en `fenixdev.cloud` y el propio del
Creador 2D. El segundo pedía algo que el usuario ya tenía, porque `App.tsx` no
pinta nada hasta validar la cuenta contra la nube.

**No se arrancó la autenticación local.** El `userId` sostiene cinco relaciones
con borrado en cascada — mundos, membresías con su rol, tokens de refresco,
perfil de progresión y sugerencias de IA — y se consulta en cuatro servicios. La
lista de mundos *es* una consulta por identidad, y el guard que impide a la IA
escribir en puntos y experiencia necesita saber a quién protege.

En su lugar se añadió una forma nueva de **conseguir** un `userId`:

```
POST /auth/cloud-session   { email, secret }
```

Busca o crea un usuario local con ese correo y devuelve **el mismo par de
tokens** que `/auth/login`, reutilizando `issueTokens` sin tocarlo. Aguas abajo
no cambia una línea.

**Qué lo autoriza.** El arrancador genera un secreto en el primer inicio, junto a
los de JWT y con los mismos permisos, en
`%APPDATA%\Omni IA Game\creador2d\secrets.json`. Solo lo lee el proceso nativo,
a través del comando Tauri `creador2d_link_secret`. Sin él, cualquier página web
abierta en el navegador del usuario podría pedirle al servicio en
`127.0.0.1:4310` una sesión a nombre del correo que quisiera. La comparación es
en tiempo constante y un secreto vacío significa **desactivado**.

A quien ya tenía `secrets.json` se le añade solo la clave nueva: regenerar las
otras dos cerraría todas sus sesiones abiertas.

La cuenta creada lleva un hash Argon2id que ninguna contraseña satisface, de modo
que no se puede entrar a ella por el formulario.

**`LoginPanel` no se borra.** Sigue siendo la salida cuando no hay Tauri (modo
navegador), cuando no hay correo guardado, o cuando el enlace falla. Cualquier
error cae al formulario en vez de dejar al usuario sin entrada.

Es la única dependencia del módulo hacia la aplicación base: se importa
`OMNI_AUTH_EMAIL_KEY` de `AuthScreen` en vez de repetir la cadena.

#### La cuenta manda, y se intenta primero

El orden del arranque **no es indiferente**. La primera versión restauraba antes
la sesión local guardada y, si valía, salía sin intentar el enlace:

```ts
if (client.hasStoredSession) {
  const ok = await client.restore();
  if (ok) { setAuth('authenticated'); return; }   // ← se iba por aquí
}
const motivo = await sesionDesdeLaCuenta();        // ← nunca llegaba
```

Quien hubiera entrado **una sola vez** con las credenciales locales quedaba
atado a `creador@creador2d.local` para siempre, y sus mundos colgaban de esa
identidad en vez de su cuenta real. Se confirmó en el registro del backend: cero
llamadas a `/auth/cloud-session` desde la aplicación.

Ahora el enlace va primero y la sesión guardada es solo la red para cuando no es
posible: modo navegador, sin correo guardado, o servicio que rechaza.

#### El fallo se dice, no se traga

`sesionDesdeLaCuenta` devuelve **el motivo** del fallo, no un booleano, y se
pinta sobre el formulario además de escribirse en la consola. La versión
anterior tenía un `catch` vacío: el usuario veía un login que no debería existir
y no había forma de saber cuál de los cuatro pasos fallaba. Un fallo mudo cuesta
más de diagnosticar que el problema que oculta.

#### En desarrollo hace falta inyectar el secreto a mano

`launcher.cjs` genera e inyecta `OMNI_LINK_SECRET`, pero **en `npm run dev` ese
arrancador no interviene**: el backend lo lanza `scripts/vite-plugin-creador2d.mjs`.
Sin esa variable el servicio entiende que el enlace está desactivado y responde
`Enlace con Omni IA Game no autorizado` — solo en desarrollo, no en la aplicación
instalada.

El plugin lee ahora el secreto del mismo fichero que usa producción. **Dos
comportamientos distintos entre desarrollo y producción es la peor clase de
error**: se persiguen horas de un fallo que solo existe en un lado.

#### Salir del módulo no cierra la sesión

Con un solo inicio de sesión no hay de dónde salir. El botón cierra el Creador 2D
y devuelve al Generador IA, mediante la prop `onSalir` que aporta
`AssetGenerator` — el submódulo no conoce las pestañas de quien lo aloja.

### 15.3 Los plugins de motor no se ven afectados

Unity, Godot y Unreal **no tocan la base de datos**: hablan HTTP con la API
(`/api/worlds/{id}/export/matrix` y `/export/collision`) con un token de motor
de rol VIEWER y 12 horas de vida. Que detrás haya PostgreSQL o SQLite les es
indiferente, y por eso la migración a SQLite no exigió tocarlos.

## 16. Limitaciones conocidas

1. **PostgreSQL 18.4, no 17.** Es la versión instalada en la máquina. El esquema
   no usa nada específico de la 18 y funciona igual en la 17.
2. **Empaquetador Vite, no Next.js.** Explicado en §8. El resto del stack de
   frontend solicitado sí se usa.
3. **La colisión se deriva, no se pinta a mano.** Es determinista y nunca se
   desincroniza de lo visual, pero no existe un pincel para marcar una celda como
   sólida sin colocar un bloque. No se implementó porque no se pidió.
4. **Los plugins descargan, no sincronizan en vivo.** Los tres consumen la API por
   HTTP y reensamblan bajo demanda. El gateway WebSocket existe y está operativo
   (lo usa el editor web), pero los plugins no se suscriben a él todavía.
5. **El editor web es de un solo mundo a la vez.** La colaboración en tiempo real
   entre varios editores funciona (salas por mundo, presencia, difusión de
   chunks), pero no hay resolución de conflictos: gana la última escritura, y el
   número de revisión sólo sirve para descartar eventos desordenados.
6. **El token de refresco se guarda en `localStorage`.** Es una decisión
   consciente para una aplicación de escritorio local: permite sobrevivir a un
   recargado de la ventana. El token de acceso vive únicamente en memoria.
7. **La IA está desactivada de fábrica** y sin claves configuradas. Con
   `AI_ENABLED=true` y Ollama en marcha funciona sin ninguna clave cloud. La
   calidad de la propuesta depende del modelo; todo lo que no encaje en el
   esquema o salga del área autorizada se descarta silenciosamente.
8. **`GET /export` carga el mundo completo en memoria.** Suficiente para mundos de
   miles de tiles; para mundos muy grandes convendría paginar por chunks.
9. **Sin panel de administración.** El rol `ADMIN` existe y se respeta en los
   guards, pero no hay interfaz para gestionar usuarios o revisar la auditoría;
   la tabla `AuditLog` se rellena y se consulta con `prisma studio`.

### Pendiente

16. **Assets de terceros.** El catálogo es 100% procedural y original. Los packs de
    `E:\Test_UgameStudio` proceden de Unity Asset Store: su EULA permite usarlos en
    proyectos propios pero **no redistribuirlos**, así que no se ha copiado ninguno al
    repositorio. La vía correcta es enlazarlos por clave de bloque desde el plugin de
    Unity (`Block Prefabs`), que ya está implementado.
17. **La inclinación es un giro, no una perspectiva.** `gridAngle` rota el plano del
    mundo en grados exactos, y con eso el countryside deja de verse plano. Lo que no
    hay es punto de fuga ni escorzo: una proyección proyectiva rompería la
    equivalencia entre lo que se edita por celdas y lo que exporta el backend. El
    escorzo lo aplica el motor.
18. **Los interiores no se recorren desde el editor.** Se crean, se listan y se entra en
    ellos con un clic, pero no hay una simulación de atravesar la puerta.
19. **El mobiliario no rota desde el lienzo.** Mover y redimensionar sí (arrastre y
    rueda del ratón). La rotación y el volteo están en el modelo, en la API y en los
    tres plugins, pero el lienzo todavía no los expone.
