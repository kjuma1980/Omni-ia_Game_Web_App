# Plan — Ollama remoto a través de OmniDeploy

Fecha: 2026-08-06
Estado: **plan, sin implementar.**

---

## 1. El problema, y por qué es el mismo de siempre

El PC de pruebas es un ordenador normal. `gemma4:12b` pide unos 8 GB de VRAM y
**no arranca ahí**. Pero el modelo sí está en el PC del proveedor, junto a los
28 GB de checkpoints de ComfyUI.

Es exactamente el problema que OmniDeploy vino a resolver — *«el cliente no
necesita GPU»* — resuelto **a medias**: hoy solo cubre imágenes. Narrativa, NPCs
y Scripts siguen exigiendo un Ollama local que ese equipo no puede sostener.

Un profesor con un portátil de aula puede generar sprites contra la GPU del
estudio, pero no puede escribir un diálogo. No tiene sentido.

## 2. Arquitectura: la misma que ya funciona

**No se inventa nada.** El camino de imágenes ya está probado y su lección más
cara está aprendida:

> El cliente manda **parámetros y un tipo**. El grafo —y ahora el modelo— los
> elige **el host**, porque es quien sabe qué tiene instalado.

Esa regla se rompió una vez, con `customWorkflowJson`, y costó una sesión de
depuración: el grafo del cliente nombraba `z_image_turbo_bf16.safetensors` y el
host no lo tenía. No se vuelve a romper.

```
  App (PC del profesor)                Relay                 Agente (PC del estudio)
  ─────────────────────                ─────                 ───────────────────────
  generateText()
     provider = omnideploy
     { tipo: 'texto',      ──POST──▶  /queue    ──sondeo──▶  ejecutar_en_ollama()
       prompt, system }                                        POST /api/generate
                                                                   ▼
     pollOmniDeployRun()  ◀──POST───  /jobs/:id  ◀──result──   respuesta.txt
```

## 3. Cinco decisiones, con su motivo

### 3.1 · El modelo lo elige el host, y **se comprueba**

`OMNI_OLLAMA_MODEL` en `agent.env`, validado contra `/api/tags` antes de usarlo.

Esto no es precaución teórica: `OMNI_CHECKPOINT=z_image_turbo_bf16.safetensors`
apuntaba a un modelo que ese ComfyUI no tenía, y **cada trabajo moría con un 400
que el usuario remoto no podía ni interpretar ni arreglar**. La validación se
hace desde el primer día, no después del susto.

### 3.2 · La respuesta viaja como fichero

`respuesta.txt` dentro del array `outputs` que ya existe.

**Cero cambios en el relay**: ya almacena y sirve ficheros en base64, con su TTL
y sus límites. Un texto ronda los 10 KB frente al tope de 25 MB. Añadir un campo
`texto` al protocolo sería tocar la base de datos, el encolado, la entrega y el
cliente para no ganar nada.

### 3.3 · Sin streaming, y se dice por qué

El relay es de encolar y consultar. El texto aparecería de golpe al terminar, no
palabra a palabra.

Se acepta porque `generateText` **ya devuelve una cadena completa**: la interfaz
no muestra progreso hoy con Ollama local. Streaming exigiría otro transporte
(SSE o troceo por sondeo) y es una fase aparte si algún día se pide.

### 3.4 · Un tipo nuevo, no un servicio nuevo

`tipo: 'texto'`. El agente reparte: los tipos de imagen y audio van a ComfyUI,
`texto` va a Ollama. Un solo agente, un solo registro, una sola credencial.

### 3.5 · Ollama ya está resuelto en el host

El instalador de Omni IA Game **ya sabe instalar Ollama y descargar el modelo**.
El proveedor no tiene que hacer nada especial: si dijo que sí en la instalación,
su equipo ya sirve en `127.0.0.1:11434`.

---

## 4. Lo que hay que tocar

| Fichero | Qué |
|---|---|
| `omnideploy-agent/agent.py` | Reparto por tipo · `ejecutar_en_ollama` · `elegir_modelo_ollama` con validación |
| `omnideploy-agent/agent.env.example` | `OMNI_OLLAMA_URL`, `OMNI_OLLAMA_MODEL` |
| `services/omniDeploy.ts` | `generarTextoConOmniDeploy` |
| `services/aiProvider.ts` | Rama en `generateText` (un solo punto: lo usan Narrativa, NPCs y Scripts) |
| `types.ts` | `'omnideploy'` en los proveedores de `text`, `npcs`, `code`, `promptEngineer` + credenciales |
| `components/SettingsModal.tsx` | Proveedor en las listas + bloques de credenciales + `credencialesOmniDeploy` |

**El relay no se toca.** Ni su base, ni sus rutas, ni sus límites.

`generateText` tiene **un único punto de decisión** (`aiProvider.ts:48`), así que
Narrativa, NPCs y Scripts quedan cubiertos con una sola rama.

---

## 5. Un fallo que había que arreglar antes — HECHO

**Mientras el agente genera, el relay lo daba por caído.**

`last_seen_at` se actualiza **solo al sondear** (`index.js:136`), y
`estaEnLinea` usa una ventana de **60 s** (`CAIDO_TRAS_MS`). Una imagen tarda
~90 s: durante ese tiempo el agente no sondea, el contador se pasa de rosca y el
dispositivo aparece **desconectado**. Un segundo trabajo se rechazaría, y
«Probar conexión» diría que la GPU está apagada con el agente trabajando.

Con texto es peor: un GDD completo con un modelo de 12B pasa de los tres
minutos.

**Tres arreglos posibles**, de menos a más invasivo:

1. **Latido durante el trabajo** — el agente avisa cada 20 s mientras genera.
   Correcto, pero exige una ruta nueva en el relay.
2. **Marcar el dispositivo como ocupado al entregarle un trabajo** y considerarlo
   vivo mientras ese trabajo esté en curso. **No toca el protocolo**: el relay ya
   sabe a qué dispositivo entregó cada trabajo.
3. **Subir `CAIDO_TRAS_MS`** a 5 minutos. Una línea, pero tarda cinco minutos en
   detectar un agente realmente caído.

**Elegida la 2**, que no toca el protocolo. `cola.trabajoEnCurso(deploymentId)`
mira si hay un trabajo en `running` empezado hace menos de **15 minutos**, y
`estaEnLinea` acepta ese caso además del sondeo reciente.

El tope de 15 minutos es la parte importante: sin él, un agente que muriera a
mitad dejaría su trabajo en `running` para siempre y el dispositivo figuraría
vivo eternamente — un remedio peor que la enfermedad.

`/status` devuelve además `busy`, porque **ocupada no es lo mismo que apagada** y
confundirlas hace creer que algo va mal cuando solo hay que esperar turno. La
prueba de conexión ya lo distingue: *«Generando ahora mismo; N en cola»* frente a
*«Libre, N trabajos en cola»*.

**Verificado de extremo a extremo** contra un auth-server real sobre base
temporal, ocho casos:

| Situación | Resultado |
|---|---|
| Sin sondear nunca | offline ✅ |
| Encolar con el agente sondeando | 200 ✅ |
| **95 s sin sondear, trabajando** | **sigue en línea** ✅ |
| … y se declara ocupada | `busy: true` ✅ |
| Segundo trabajo mientras genera | **ya no da 503** ✅ |
| Trabajo entregado | deja de figurar ocupada ✅ |
| … y sin sondeo reciente | vuelve a offline ✅ |
| **Trabajo colgado hace 20 min** | **NO cuenta como vivo** ✅ |

---

## 6. Fases

**Fase 0 — El dispositivo ocupado no está caído. HECHA.** Ver §5.

**Fase 1 — El agente habla Ollama. HECHA.** Reparto por tipo,
`ejecutar_en_ollama`, validación del modelo contra `/api/tags`, y un informe al
arrancar que dice qué puede atender el equipo.

Probado contra el Ollama real, no solo compilado:

| Prueba | Resultado |
|---|---|
| Generación con `gemma4:12b` | **136 s**, `respuesta.txt`, frase correcta en español |
| Acentos: utf-8 → base64 → vuelta | idéntico |
| Modelo configurado inexistente | avisa y elige otro |
| Nombre sin etiqueta (`gemma4`) | resuelve a la variante instalada |
| Ollama apagado | «no responde en `<url>`, comprueba que esté encendido» |
| Trabajo sin prompt | rechazado con su motivo |

**Los 136 segundos son el dato importante**, y son para *una frase* con el modelo
cargándose en frío. Confirman dos cosas: que la fase 0 era imprescindible —136 s
pasan de largo la ventana de 60 s— y que la fase 3 no es opcional.

**Fase 2 — La aplicación puede elegirlo. HECHA.** `omnideploy` aparece junto a
`ollama` en las listas de **Texto**, **NPCs** y **Scripts**, cada una con su
bloque de credenciales, y la prueba de conexión cubre las tres secciones.

Una sola rama en `generateText` cubre Narrativa, NPCs y Scripts, porque las tres
entran por ahí y `textConfig` ya es la sección que corresponda.

**El detalle que se comprobó y no era obvio:** el relay entrega base64 y `atob`
devuelve **bytes sueltos, no caracteres**. Usarlo tal cual parte cada acento en
dos:

```
original:  ¡Alto! ¿Quién anda ahí? — La niña Ñoño dijo: «cuidado».
atob:      Â¡Alto! Â¿QuiÃ©n anda ahÃ­? â La niÃ±a ÃoÃ±o dijo: Â«cuidadoÂ».
```

Se reinterpretan los bytes con `TextDecoder('utf-8')`, y el texto vuelve
idéntico — 90 caracteres, emoji incluido, frente a los 109 del camino ingenuo.

**Fase 3 — Ampliar el margen de espera. HECHA.** `generarTextoConOmniDeploy`
pide **450 intentos × 2 s = 15 minutos**, y no es una cifra al azar: es el mismo
tope que el relay considera razonable para un trabajo en curso
(`TRABAJO_MAX_MS`). Más allá, el propio relay deja de dar por vivo al agente, así
que esperar más no serviría de nada.

Los 5 minutos por defecto se quedan para imagen, que es el caso para el que se
pensaron.

---

## 7. Riesgos

1. **El tiempo.** Es el riesgo real. Un modelo de 12B escribiendo un GDD puede
   pasar de cinco minutos, y hoy el sondeo se rinde ahí. La fase 3 no es
   opcional.
2. **Un modelo, un cuello de botella.** El host atiende de uno en uno. Con dos
   alumnos generando texto a la vez, el segundo espera. Ya pasa con las imágenes;
   con texto se nota más porque se espera respuesta inmediata.
3. **Modelo ausente o mal escrito.** Mitigado por §3.1 desde el principio.
4. **Ollama apagado en el host.** Mismo caso que ComfyUI apagado: mensaje claro
   diciendo qué falta, no un fallo genérico.

---

---

## 7 bis. Lo que apareció al probarlo en producción

El plan se cumplió, pero la primera prueba real destapó **tres muros que no eran
de lógica sino de infraestructura**, y ninguno se habría encontrado sin generar
de verdad.

**1 · Express admitía 100 KB.** `app.use(express.json())` sin opciones tiene ese
límite. Una imagen de 340 KB viaja como 460 KB en base64: el relay respondía 500
y el agente lo reportaba como fallo **después de haber generado bien**. Se
comprobó en el historial de ComfyUI —`status: success`, `omnideploy_00003_.png`,
0,34 MB— y midiendo la respuesta antes y después: de 500 a 401 con el mismo
cuerpo. El límite grande va solo en `/api/omnideploy`; global habría abierto
login y licencias a cuerpos de cien megas.

**2 · El hosting interceptaba la descarga.** El fichero se pedía por
`/jobs/:id/files/omnideploy_00004_.png`, y esa URL termina en `.png`: LiteSpeed
la trataba como estático y devolvía un 404 de **un byte** en `text/plain` sin
que Node la viera. El proxy nativo lo envolvía en
`data:text/plain;base64,IA==`, que es el error que llegaba al usuario. El nombre
viaja ahora en el cuerpo.

**3 · El agente se leía a sí mismo.** `workflow_del_historial` cogía la última
entrada de ComfyUI, pero en cuanto el agente genera una vez esa entrada es
**suya**: su grafo de emergencia se reproducía en bucle con sus 256×1024
congelados. Medido: de 10 entradas, **nueve eran del agente**. Se marcan las
propias y se saltan.

Y de paso: `EmptySD3LatentImage` —el que usa Z-Image— no contiene la cadena
`EmptyLatent`, así que la resolución elegida se ignoraba en silencio.

## 8. Lo que este plan NO hace

- **No añade streaming.** Ver §3.3.
- **No mueve los LLM en la nube.** Gemini, OpenAI y compañía siguen yendo
  directos desde el cliente: no necesitan la GPU de nadie.
- **No toca el relay.** Salvo la fase 0, que corrige un fallo existente.
- **No permite al cliente elegir el modelo.** Igual que con los checkpoints:
  quien decide con qué trabaja su GPU es el proveedor. El cliente ve el nombre
  del modelo en la respuesta, pero no lo impone.
