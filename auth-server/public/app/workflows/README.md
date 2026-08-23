# Workflows de ComfyUI

Aquí van los workflows que Omni IA Game puede usar para generar.

## Dónde y cómo

Deja el fichero `.json` **en esta misma carpeta** y ejecuta:

```
npm run workflows:index
```

Eso regenera `index.json`, que es lo que la aplicación lee al arrancar. Hace
falta porque un navegador no puede listar un directorio: solo puede pedir
ficheros por su nombre. El índice se regenera también antes de `npm run build`,
así que un workflow añadido nunca se queda fuera del instalador.

Funciona igual en modo escritorio y en modo navegador, sin plugins ni permisos.

## Tiene que estar en formato API

ComfyUI guarda en dos formatos y **solo ejecuta uno**:

| | Cómo se reconoce | ¿Sirve? |
|---|---|---|
| **API** | `{"3": {"class_type": "...", "inputs": {...}}}` | **Sí** |
| Interfaz | `{"nodes": [...], "links": [...]}` | No |

Para exportar en formato API desde ComfyUI:

1. Ajustes → activa **Dev mode** (o *Enable Dev mode Options*).
2. Menú **Workflow → Export (API)**.

Si dejas aquí un fichero en formato de interfaz, el indexador lo omite y te dice
por qué; no falla en silencio.

## Qué detecta la aplicación sola

Al registrar un workflow, Omni IA Game **propone** qué nodo cumple cada papel
—prompt, negativo, semilla, pasos, cfg, ancho, alto, modelo, LoRA y salida— y la
propuesta se puede corregir. Nada está cableado a un modelo concreto: la
detección es estructural, así que sirve para Z-Image, SDXL, Flux, Qwen o
cualquier otro.

Dos detalles que conviene conocer, porque explican cosas que parecen fallos:

- **Positivo y negativo se distinguen siguiendo el cable**, no por el título del
  nodo. Un nodo puede llamarse «Negative Prompt» y estar conectado al positivo.
- **Si el grafo no tiene rama negativa propia, no se propone negativo.** No es un
  error: es que ese workflow no puede usar prompt negativo. Pasa con Z-Image
  Turbo y con Flux, que corren a cfg 1, donde la rama negativa se cancela
  matemáticamente.

## Nombres

El nombre que se ve en la aplicación sale del nombre del fichero:
`turnaround-charturner.json` → «Turnaround charturner». Usa guiones y evita
espacios.

## Los que vienen de ejemplo

| Fichero | Para qué |
|---|---|
| `turnaround-charturner.json` | Hoja de modelo (giro de personaje). El único que produjo las vistas de verdad |
| `zimage-pixelart.json` | Sprite suelto en pixel art, Z-Image Turbo |
| `sdxl-pixelart.json` | Sprite suelto en pixel art, SDXL Lightning |
| `flux-spritesheet.json` | Fotogramas de animación, Flux |
