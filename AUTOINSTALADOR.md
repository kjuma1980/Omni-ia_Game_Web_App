# Autoinstalador de Omni IA Game

Fecha: 2026-08-05
Estado: **cadena completa y lista para probar en un Windows limpio.** Queda la
fase 4 (pantalla de estado en Ajustes para instalarlo *después*).

---

## 1. El problema

En un Windows recién instalado, Omni IA Game **no arrancaba**. Y aunque arranque,
generar en local exige ComfyUI, que no viene con la aplicación. El usuario final
es un profesor sin conocimientos técnicos: cualquier paso manual es un paso que
no se dará.

## 2. Qué necesita la aplicación, medido

### Ya viaja dentro del instalador — cero trabajo para el usuario

| Pieza | Tamaño |
|---|---|
| App Tauri (React + binario Rust) | 21 MB |
| Backend del Creador 2D: `node.exe`, servidor, Prisma, Argon2 nativo | 201 MB |
| Migraciones y catálogo de 290 bloques | incluido |

El Creador 2D **ya es un autoinstalador en miniatura**: crea su base, migra y
siembra el catálogo en el primer arranque. Es el patrón a seguir.

### No viaja, ordenado por lo que duele

| Pieza | Para qué | Tamaño | ¿Automatizable? |
|---|---|---|---|
| **WebView2** | sin él la app **no abre** | ~120 MB | **hecho**, fase 1 |
| ComfyUI portable | generar en local | ~2 GB | sí, fase 2-3 |
| Modelos (checkpoints, LoRA) | sin ellos ComfyUI no genera nada | 2-40 GB | **decisión: no se descargan** |
| Edge TTS | voz | ~5 MB | sí, más adelante |
| Ollama | LLM local, opcional | ~700 MB | opcional |

## 3. El hallazgo que reordena el problema

**OmniDeploy cambia la pregunta.** Con el proveedor de GPU remota, un usuario
puede generar **sin instalar nada más**. Eso convierte el instalador en dos
perfiles en vez de uno:

| | Perfil A · Solo nube | Perfil B · GPU local |
|---|---|---|
| WebView2 | sí | sí |
| Aplicación | sí | sí |
| ComfyUI | **no** | sí |
| Descarga | ~250 MB, 2 minutos | +2 GB |

Meterlo todo en un único instalador obligaría a un profesor a descargar 2 GB que
no va a usar.

> **WebView2 NO es el perfil A.** Lo necesitan los dos: es el motor que dibuja la
> interfaz. No es una opción, es un requisito duro.

---

## 4. Fase 1 — WebView2 (HECHA)

`src-tauri/tauri.conf.json`:

```json
"bundle": {
  "windows": {
    "webviewInstallMode": { "type": "downloadBootstrapper", "silent": true }
  }
}
```

Verificado en el script NSIS que genera Tauri, no supuesto:

```nsis
!define INSTALLWEBVIEW2MODE "downloadBootstrapper"
!define WEBVIEW2INSTALLERARGS "/silent"
NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
```

La lógica es la correcta: lee el registro y **si WebView2 ya está no descarga
nada**; si falta, baja el instalador oficial de Microsoft y lo ejecuta en
silencio; si la descarga falla **aborta con un mensaje**, en vez de dejar
instalada una aplicación que no abre; y se salta el paso al actualizar.

El instalador sigue pesando 43,7 MB: los ~120 MB del motor solo se descargan en
los equipos que no lo tienen.

---

## 5. Decisión del propietario sobre ComfyUI

> «Si el usuario decide instalar ComfyUI, se instalará la versión oficial
> portable que exista en el momento de la instalación de Omni IA, **sin ningún
> modelo ni workflow**, la versión como venga directo del repositorio oficial.»

Consecuencias, todas buenas menos la última:

- Sin problemas de licencias de modelos ni redistribución.
- Sin descargas de decenas de gigas.
- «La que exista en el momento» sale sola: la API de GitHub da la última versión
  en tiempo real y **no hay que fijar ninguna versión en el código**.
- **Pero ComfyUI sin ningún checkpoint se instala y no genera nada.** El aviso al
  usuario deja de ser un detalle y pasa a ser obligatorio.

---

## 6. Lo que se descubrió al mirar el repositorio oficial

Consultado en vivo (`api.github.com/repos/comfyanonymous/ComfyUI/releases/latest`),
versión **v0.30.0** publicada el 2026-08-03:

| Variante | Peso |
|---|---|
| `ComfyUI_windows_portable_nvidia.7z` | 2013 MB |
| `ComfyUI_windows_portable_nvidia_cu126.7z` | 1958 MB |
| `ComfyUI_windows_portable_amd.7z` | 1699 MB |
| `ComfyUI_windows_portable_intel.7z` | 1620 MB |

**No es un fichero, son cuatro.** Hay que detectar la GPU: descargar la de NVIDIA
en un portátil con Intel son 2 GB tirados y un ComfyUI que no arranca.

**Vienen en `.7z`, y Windows no lo descomprime de serie.** Ni el Explorador ni
PowerShell. Se resuelve empotrando `7zr.exe` (600 KB, extractor oficial y
autónomo) en el instalador. Descargar 7-Zip aparte añadiría una dependencia más
que puede fallar, y pedir al usuario que descomprima a mano va contra la regla
del clic único.

---

## 6 bis. Lo construido (2026-08-05)

La cadena está **completa y encadenada**.

| Pieza | Dónde | Commit |
|---|---|---|
| Detección de GPU | `lib.rs` · `detectar_gpu` | `a9237` |
| Resolutor del paquete | `services/comfyuiInstaller.ts` | `dc43f` |
| Descarga con reanudación | `lib.rs` · `descargar_comfyui` | `3e5e3` |
| Pregunta al instalar | `src-tauri/installer-hooks.nsh` | `68513` |
| Extracción del `.7z` | `lib.rs` · `extraer_comfyui` | `b1c4b` |
| **Lectura de la respuesta** | `lib.rs` · `preferencia_comfyui` | *esta sesión* |
| **La pantalla que lo ata** | `components/ComfyUIInstaller.tsx` | *esta sesión* |

### Por qué la pantalla no pregunta nada

Ni ruta de instalación, ni variante, ni versión. El destino sale de
`%LOCALAPPDATA%\Omni IA Game\ComfyUI` y no se negocia, porque el usuario final es
un profesor: cada campo que se le enseña es una decisión que no sabe tomar y una
forma más de que la instalación acabe en una carpeta rara. Hay un botón que dice
lo que va a pasar y cuánto pesa.

**`marcar_comfyui_resuelto` apaga la petición** una vez instalada —o descartada—
escribiendo `0` en la misma clave. Sin eso la pantalla reaparecería en cada
arranque, que es justo la clase de insistencia que hace que alguien deje de abrir
un programa.

**Sin clave en el registro no se pinta nada.** En desarrollo, o si la carpeta se
copió a mano, `respondida` es `false` y el componente devuelve `null`. La pantalla
solo existe para quien pidió ComfyUI de forma explícita.

### Cuatro hallazgos que conviene no volver a descubrir

**1 · El `tar` de Windows extrae `.7z`.** Se daba por hecho que habría que
empotrar `7zr.exe` (600 KB) o descargar 7-Zip, porque ni el Explorador ni
PowerShell descomprimen 7-Zip. Pero `tar.exe` está en `system32` desde Windows
10 1803 y se apoya en libarchive, que sí lo lee. Comprobado creando un `.7z` con
subcarpetas y extrayéndolo con la jerarquía intacta. **Una dependencia menos que
empotrar, descargar y que pueda fallar.**

**2 · Tauri no permite añadir páginas al instalador, pero sus ganchos sí
permiten preguntar.** Una página propia exigiría copiar y mantener su plantilla
NSIS de ~1200 líneas, refundiéndola en cada actualización. El gancho
`NSIS_HOOK_POSTINSTALL` muestra un diálogo Sí/No y guarda la respuesta sin tocar
la plantilla. La elección se lee en:

```
HKCU\Software\Omni IA Game\InstalarComfyUI     "1" = sí   ·   "0" = solo nube
```

Al **actualizar** no se vuelve a preguntar; al **desinstalar** se borra la clave
para que una instalación futura vuelva a preguntar. En instalación silenciosa la
respuesta por defecto es NO: un despliegue desatendido en un aula no debe
ponerse a bajar dos gigas por equipo.

**3 · Hay que priorizar la GPU, no coger la primera.** En el equipo de pruebas
Windows devuelve tres controladores de vídeo: `Virtual Desktop Monitor`, `Meta
Virtual Monitor` y `NVIDIA GeForce RTX 3090`. Cogiendo el primero, **una RTX 3090
habría dado «ninguna»**. El orden es NVIDIA → AMD → Intel, porque en un portátil
la integrada aparece junto a la dedicada y la dedicada es la que sirve.

Se usa `Get-CimInstance` y no `wmic`: wmic está obsoleto y ya no viene en las
instalaciones recientes de Windows 11 — habría fallado justo en los equipos
nuevos.

**4 · Coincidencia exacta del nombre del paquete, no «el que contenga nvidia».**
La versión v0.30.0 publica **dos** ficheros con «nvidia» en el nombre —
`_nvidia.7z` y `_nvidia_cu126.7z` — así que buscar por contenido elegiría uno de
los dos por casualidad. Decisión del propietario: **la variante `nvidia` normal**,
no la `cu126`.

### Sobre la reanudación

Verificado contra GitHub, no supuesto: acepta `Range` desde un punto intermedio,
responde `206` y devuelve `content-range: bytes 1000000-1999999/2110797220`,
cuyo total coincide con el del catálogo. Era **la premisa de la que dependía todo
el diseño**: sin reanudación, un corte al 90 % de 2 GB obliga a empezar de cero.

Se contempla además que el servidor **ignore** `Range` y responda 200: en ese
caso se empieza de nuevo, en lugar de concatenar el fichero entero sobre lo ya
bajado y producir un `.7z` corrupto que fallaría mucho después, al extraer.

---

## 6 ter. Ollama y el modelo de lenguaje (2026-08-05)

Segunda pieza opcional, **independiente de ComfyUI**: se puede querer generar
imágenes en la nube y escribir los diálogos en local, o al revés. Por eso el
instalador hace **dos preguntas separadas** y no una de «todo local o todo
nube», que obligaría a bajar 8,5 GB a quien solo quería una de las dos cosas.

| Pieza | Peso | Cómo |
|---|---|---|
| `OllamaSetup.exe` | 1491 MB | `/VERYSILENT /NORESTART`, sin ventanas |
| `gemma4:12b` | 7,04 GB | `POST /api/pull`, y se puede aplazar |

`HKCU\Software\Omni IA Game\InstalarOllama`, misma mecánica que ComfyUI.

### Cuatro cosas que se midieron

**1 · No existe un gemma4 ligero.** Se pidió «un modelo más ligero» y resultó no
haberlo: `e2b` pesa 6,67 GB frente a los 7,04 del `12b`. La «e2b» son los
parámetros ACTIVOS al inferir (MatFormer), no lo que se descarga. Consultado el
registro de Ollama, lo genuinamente ligero está en otras familias —`gemma3:4b`
3,11 GB, `llama3.2:3b` 1,88 GB, `gemma3:1b` 0,76 GB—. **Decisión del propietario:
`gemma4:12b`, con la descarga del modelo opcional y aplazable.**

**2 · El modelo por defecto de la aplicación era `llama3`, no gemma.** En seis
sitios entre `App.tsx` y `SettingsModal.tsx`. Si el instalador baja un modelo y
la aplicación pide otro, se descargan 7 GB y sigue sin funcionar. Unificado en
`gemma4:12b`, con `MODELO_POR_DEFECTO` en `ollamaInstaller.ts` como único sitio
donde se escribe.

**3 · `ollama pull` NO se puede raspar.** Se implementó primero lanzando el CLI
y partiendo su salida por retornos de carro. Medido contra el binario real:
manda por **stderr** —eso sí se acertó— pero pinta con **secuencias ANSI de
control de cursor**, no con `\r`. La barra se habría quedado a 0 % hasta saltar
al final. Se cambió a `POST /api/pull`, que devuelve JSON por líneas con
`completed` y `total`: progreso de verdad en vez de adivinanza.

**4 · El servidor puede no estar vivo aún.** El instalador deja Ollama
arrancando al iniciar sesión, pero en la misma sesión en que se acaba de
instalar puede no estarlo. `asegurar_ollama_vivo` comprueba `/api/version`,
levanta `ollama serve` si hace falta y espera hasta 15 s.

No se reimplementa la descarga del modelo: Ollama trocea, verifica y **reanuda**
por su cuenta, así que reintentar tras un corte continúa donde iba.

---

## 7. Fases

### La cadena completa (HECHA)

```
leer HKCU\Software\Omni IA Game\InstalarComfyUI
   "0" o ausente  ->  no hacer nada, el componente devuelve null
   "1"            ->  detectarGpu()
                      resolverPaquete(gpu)      ->  null: avisar y ofrecer nube
                      descargarPaquete(...)      ->  barra de progreso
                        escucha el evento `comfyui-descarga`
                      extraerPaquete(...)
                      onInstalado(ruta) -> updateApiSettings({ comfyuiPath })
                      marcarResuelto()  -> no volver a preguntar
                      AVISAR de que hace falta un modelo en models/checkpoints
```

### Lo que se verificó, y no se supuso

- **El formato que devuelve `reg query`** en este Windows es
  `    InstalarComfyUI    REG_SZ    1`, y el parseo de Rust (buscar la línea,
  partir por espacios, coger el último) devuelve `1`. Probado con los tres casos:
  valor `1`, valor `0`, y clave inexistente (`exit code 1`, que **no** es un
  error: significa «no preguntes nada»).
- **Las tres variantes resuelven hoy** contra el repositorio real: `nvidia` →
  2013 MB, `amd` → 1699 MB, `intel` → 1620 MB, sobre la v0.30.0.
- **Siguen existiendo DOS ficheros con «nvidia» en el nombre**, que es la razón
  de la coincidencia exacta.
- **GitHub sigue respondiendo `206`** con `content-range: bytes
  1000000-1999999/2110797220` — la reanudación es real, no una suposición.

---

### Fase 2 — La pregunta al instalar (HECHA, ver §6 bis)

Página propia en el instalador NSIS:

```
  ( ) Solo servicios en la nube        — recomendado
      Genera con OmniDeploy o proveedores cloud.
      No descarga nada más. Listo en 2 minutos.

  ( ) Instalar también ComfyUI local   — necesitas GPU NVIDIA, AMD o Intel
      Descarga ComfyUI (~2 GB). Puede tardar.
```

**El instalador solo guarda la elección; no descarga.** Es deliberado: NSIS no
sabe reanudar una descarga cortada, no muestra progreso decente, y si falla **se
cae toda la instalación**. Dos gigas por una red doméstica es exactamente el caso
en que eso ocurre.

Si no se detecta GPU compatible, la segunda opción no se ofrece.

### Fase 3 — La descarga, dentro de la aplicación

Al primer arranque, si se eligió ComfyUI:

1. Preguntar a GitHub cuál es la última versión.
2. Elegir la variante según la GPU: `wmic path win32_VideoController get name`.
3. Descargar con progreso real, **reanudable** y cancelable.
4. Extraer con `7zr.exe`.
5. Dejar la ruta configurada en Ajustes.

Si falla, no debe dejar la aplicación inservible: se reintenta o se cambia a la
nube. Por debajo puede apoyarse en `comfyui_clean_install.ps1`, que ya viaja como
recurso del instalador y detecta la versión de CUDA.

### Fase 4 — Pantalla de estado en Ajustes

Qué hay instalado, qué falta, y un botón para instalar ComfyUI **después**: quien
eligió nube y luego se compra una tarjeta no debería reinstalar la aplicación.

Incluye el aviso obligatorio:

> «ComfyUI instalado. Necesitas colocar un modelo en `models/checkpoints` para
> poder generar.»

---

## 7 bis. El fallo que solo existía en la aplicación instalada

Reportado sobre el instalador, no sobre desarrollo: en los tabs **Texto (LLM)**,
**NPCs** y **Scripts**, eligiendo Ollama como proveedor, **la lista de modelos
salía vacía** aunque el equipo tuviera modelos descargados. En `npm run dev`
funcionaba perfectamente.

**Causa: contenido mixto.** En desarrollo la interfaz se sirve desde
`http://localhost:5173`, y pedir a `http://localhost:11434` es http → http, que
el navegador permite. **Empaquetada, el origen pasa a ser
`https://tauri.localhost`**, y la misma petición es https → http: el motor la
bloquea antes de que salga del proceso.

ComfyUI nunca lo sufrió porque siempre habló por `proxy_request`. Las listas de
modelos usaban `fetch` directo.

**Arreglo:** `pedirJsonLocal` en `services/localService.ts`, que pasa por
`proxy_request` cuando hay Tauri y cae a `fetch` en el navegador.
`is_url_allowed` (`lib.rs:486`) ya admitía localhost y las IPs privadas de LAN,
así que un Ollama en otro equipo de la red también funciona. Aplicado a las
cuatro listas: Ollama, LM Studio local, vídeo y la lista cloud.

### Dos defectos más que salieron por el camino

**La lista solo se pedía al ABRIR el modal.** Si ya estabas dentro y cambiabas
el proveedor a Ollama —que es lo que hace cualquiera— no se pedía nunca. Añadido
un efecto por tab que la recarga al cambiar de proveedor o de URL.

**Los errores se tragaban.** `fetchModels`, `fetchNpcModels` y `fetchCodeModels`
mandaban el fallo a la consola y dejaban la lista vacía, de modo que el usuario
veía un desplegable con un único elemento y ninguna pista. Ahora se enseña el
motivo, y sin URL configurada se usa `http://localhost:11434` en vez de
rendirse en silencio —que es lo que `fetchPEModels` y `fetchVideoModels` ya
hacían—.

**El modelo guardado que ya no está descargado** aparece marcado como
`(no descargado)` en vez de desaparecer: sin esa opción el `select` no encuentra
su valor y salta al primero de la lista, cambiando el ajuste sin que el usuario
toque nada.

> El valor `llama3` que aparecía venía del **proyecto guardado**, no del código:
> el cambio de `DEFAULT_PROJECT` solo afecta a proyectos nuevos. Con la lista ya
> cargada se corrige eligiendo el modelo en el desplegable.

---

## 7 ter. Ficheros bloqueados al instalar encima

Reportado con el instalador nuevo: tres errores **«Error opening file for
writing»**, siempre en el Creador 2D:

```
creador2d-server\creador2d-server.exe
creador2d-server\node_modules\.prisma\client\query_engine-windows.dll.node
creador2d-server\node_modules\@node-rs\argon2-...\argon2.win32-x64-msvc.node
```

**Causa:** `creador2d-server.exe` seguía corriendo. Windows bloquea el `.exe` de
un proceso vivo **y también los módulos nativos que tiene cargados en memoria**
— de ahí que los otros dos ficheros sean precisamente el motor de Prisma y el
Argon2, los dos `.node` que el servidor carga al arrancar.

**Desinstalar antes no basta**, y el usuario lo hizo: el desinstalador tampoco
cierra el proceso, así que el servidor de la versión anterior seguía vivo
bloqueando los ficheros de la nueva.

**Arreglo:** `NSIS_HOOK_PREINSTALL` y `NSIS_HOOK_PREUNINSTALL` con
`taskkill /F /T /IM creador2d-server.exe` y una pausa breve para que Windows
suelte los descriptores. Se ignora el error del `taskkill`: si no estaba
corriendo, no hay nada que cerrar y eso no es un fallo.

---

## 7 quater. OmniDeploy: el argumento que se llamaba distinto

«Probar conexión» no conectaba nunca, ni siquiera lo intentaba de forma
visible. No era la red, ni el relay, ni las credenciales.

`services/omniDeploy.ts` llamaba al proxy nativo así:

```ts
await inv('proxy_request', { url, method: 'POST', body: JSON.stringify(cuerpo) });
```

Pero el comando de Rust es `proxy_request(url, method, payload, headers)`. Al no
existir ningún argumento `body`, **`payload` llegaba a `None` y la petición
salía sin cuerpo**. El relay no veía credenciales y respondía 401.

Medido sobre el relay en producción:

| Petición | Respuesta |
|---|---|
| POST sin cuerpo (lo que salía) | `401 {"ok":false,"error":"Credenciales invalidas."}` |
| POST con las credenciales | `200 {"ok":true,"online":true,...}` |

**De 33 llamadas a `proxy_request` en el proyecto, 32 usaban `payload` y una
usaba `body`: justo la de OmniDeploy.**

**Segundo fallo, encadenado:** Rust devuelve `Err(String)` ante un 401, y Tauri
rechaza con una **cadena**, no con un `Error`. Como el cliente hacía
`e?.message`, el motivo real se perdía y se veía el texto genérico «No se pudo
contactar con el relay» — cuando el relay había contestado perfectamente.
Añadida una función `motivo()` que extrae el texto venga como venga.

También: el aviso de credenciales ausentes **dice ahora en qué sección** faltan,
porque cada pestaña guarda su propio par y «faltan el Deployment ID o la API
Key» a secas no dice dónde pegarlos.

---

## 7 quinquies. La voz local, que nunca funcionó fuera del equipo de desarrollo

Reportado probando la app instalada: el servicio de voz de Microsoft no
arrancaba. **Tres fallos a la vez**, y cualquiera de ellos bastaba:

**1 · Ruta fija.** `launch_edge_tts` hacía `cd` a
`g:\apps\Generador de activos...\omniforge-main`, una carpeta del equipo del
autor. En cualquier otro PC no existe.

**2 · El script no viajaba.** `edge-tts-server.py` estaba en el proyecto pero no
en `resources`: el instalador solo llevaba el script de ComfyUI y el servidor
del Creador 2D.

**3 · Contenido mixto.** La llamada a `/api/tts` era un `fetch` directo a
`http://localhost:5000` desde `https://tauri.localhost`. **El mismo fallo que
dejaba vacías las listas de Ollama.** Resuelto con `enviarJsonLocal`, el hermano
POST de `pedirJsonLocal`.

### Python propio, porque la voz es parte del producto

No puede depender de que el equipo del cliente tenga Python ni sepa qué es pip.
`preparar_python_voz` lo monta la primera vez:

| Paso | Detalle |
|---|---|
| Descarga | distribución embebida oficial **3.12.8**, 10,6 MB, con `Range` verificado |
| Extracción | el `tar` de Windows, el mismo truco que con ComfyUI |
| **`site-packages`** | la embebida lo trae **desactivado** en el `._pth`; sin activarlo, pip instala y `import flask` no encuentra nada |
| pip | tampoco viene: se instala con `get-pip.py` |
| Paquetes | `edge-tts`, `flask`, `flask-cors` desde `requisitos-voz.txt` |

Queda en `LOCALAPPDATA`, aislado: no toca ningún Python del usuario ni su PATH.
Si algo falla, antes de rendirse prueba con el del sistema.

**Probado de cero, la cadena entera:** 10,6 MB en 0,6 s · Python 3.12.8
ejecutándose · `python312._pth` activado · pip 26.2.1 · edge-tts 7.2.8, flask
3.1.3 y flask-cors 6.0.5 en 5,4 s · los tres importan · **voz generada de
verdad: 18 576 bytes con `es-MX-JorgeNeural`** · 55,1 MB en disco al terminar.

---

## 8. Riesgos conocidos

1. **Sin modelos no genera.** Es la consecuencia directa de la decisión del §5 y
   se acepta a sabiendas. El aviso del §7 es lo que evita que parezca una avería.
2. **Descargas de 2 GB que se cortan.** Por eso la descarga va en la aplicación y
   no en el instalador, y por eso tiene que ser reanudable.
3. **La variante equivocada no arranca.** La detección de GPU no es un adorno.
4. **Las URL de GitHub pueden cambiar de forma.** Se consulta la API en vez de
   fijar enlaces, pero si GitHub cambiara el nombre de los ficheros habría que
   revisarlo.
