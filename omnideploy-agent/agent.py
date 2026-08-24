#!/usr/bin/env python3
"""
Agente OmniDeploy: ejecuta trabajos de ComfyUI en el PC del dueno.

Bucle: registrarse -> esperar aprobacion -> pedir trabajo -> ejecutarlo en el
ComfyUI local -> devolver el resultado. Nunca abre un puerto: todas las
conexiones son salientes, asi que la IP del host no se expone jamas.

No conoce el transporte: ver `transporte.py`. Cambiar el sondeo por WebSocket
el dia que haya VPS no toca este fichero.

Sin dependencias externas, solo biblioteca estandar. Se ejecuta con
`python agent.py` y se configura por variables de entorno o `agent.env`.
"""

from __future__ import annotations

import base64
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from transporte import ErrorRelay, TransporteSondeo

AQUI = Path(__file__).resolve().parent
ESTADO = AQUI / "agent.json"


def cargar_env() -> None:
    """Lee `agent.env` sin dependencias. Las variables ya definidas ganan."""
    fichero = AQUI / "agent.env"
    if not fichero.exists():
        return
    for linea in fichero.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, valor = linea.split("=", 1)
        os.environ.setdefault(clave.strip(), valor.strip())


cargar_env()

RELAY = os.environ.get("OMNI_RELAY_URL", "https://omni-api.fenixdev.cloud")
MASTER_KEY = os.environ.get("OMNI_MASTER_KEY", "")
COMFYUI = os.environ.get("OMNI_COMFYUI_URL", "http://127.0.0.1:8188").rstrip("/")
NOMBRE = os.environ.get("OMNI_FRIENDLY_NAME", os.environ.get("COMPUTERNAME", "Host GPU"))

# Cuanto esperar antes de reintentar cuando el relay no responde. Sube hasta un
# minuto: si el servidor esta caido, machacarlo cada segundo no lo arregla.
ESPERA_MIN = 5
ESPERA_MAX = 60

# Tope de espera de un trabajo en ComfyUI: UNA HORA.
#
# Eran diez minutos, pensados para una imagen suelta. No dan para un video, un
# modelo pesado o una cola de fotogramas en una 3090, y el agente abandonaba un
# trabajo que iba bien. Se alinea con `TRABAJO_MAX_MS` del relay: no tiene
# sentido esperar mas de lo que el relay considera un trabajo vivo.
TIMEOUT_TRABAJO = 60 * 60


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def leer_estado() -> dict:
    if ESTADO.exists():
        try:
            return json.loads(ESTADO.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            log("agent.json ilegible, se regenera")
    return {}


def guardar_estado(datos: dict) -> None:
    ESTADO.write_text(json.dumps(datos, indent=2), encoding="utf-8")
    try:
        os.chmod(ESTADO, 0o600)
    except OSError:
        pass  # En Windows no siempre aplica; no es motivo para abortar.


# --------------------------------------------------------------- ComfyUI ---

def comfy(metodo: str, ruta: str, cuerpo: dict | None = None, espera: int = 60):
    """
    Habla con ComfyUI.

    LEE EL CUERPO DEL ERROR. `urlopen` lanza `HTTPError` ante un 400 y su texto
    por defecto es solo "HTTP Error 400: Bad Request", que no dice nada: el
    motivo real -que nodo fallo y por que- viaja en el cuerpo de la respuesta,
    y descartarlo convierte un diagnostico en una adivinanza.
    """
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(f"{COMFYUI}{ruta}", data=datos, method=metodo)
    if datos is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=espera) as resp:
            crudo = resp.read()
            return json.loads(crudo) if crudo else {}
    except urllib.error.HTTPError as e:
        detalle = ""
        try:
            detalle = e.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001 — si no se puede leer, queda el codigo
            pass
        raise RuntimeError(f"ComfyUI respondio {e.code} en {ruta}: {resumir_error(detalle)}") from e


def resumir_error(cuerpo: str) -> str:
    """
    Saca lo util del error de ComfyUI, que devuelve un JSON muy verboso.

    Interesa el mensaje y QUE NODO fallo; el resto -el grafo entero repetido-
    solo sirve para que no se lea nada.
    """
    if not cuerpo:
        return "(sin detalle)"
    try:
        j = json.loads(cuerpo)
    except Exception:  # noqa: BLE001
        return cuerpo[:300]

    partes = []
    err = j.get("error") or {}
    if isinstance(err, dict):
        cabecera = " ".join(x for x in (err.get("message"), err.get("details")) if x)
        if cabecera:
            partes.append(cabecera.strip())
    elif err:
        partes.append(str(err))

    # El `details` de cada nodo es LO UTIL: en un `value_not_in_list` el mensaje
    # es solo "Value not in list", mientras que el detalle dice exactamente que
    # valor se pidio y en que campo -"ckpt_name: 'x.safetensors' not in (...)"-.
    # Sin el, el aviso no sirve para arreglar nada.
    for nid, ne in (j.get("node_errors") or {}).items():
        clase = ne.get("class_type", "?")
        for e in ne.get("errors", []) or []:
            campo = (e.get("extra_info") or {}).get("input_name", "")
            texto = e.get("details") or e.get("message") or ""
            partes.append(
                f"nodo {nid} ({clase}){f' [{campo}]' if campo else ''}: {texto}"
            )

    return " | ".join(partes)[:600] if partes else cuerpo[:300]

# Que variable de `agent.env` lleva el workflow de cada tipo, para el proveedor
# que quiera fijar uno suyo. NO es un valor por defecto: si esta vacia y la
# aplicacion no manda grafo, el trabajo se rechaza con un aviso claro.
WORKFLOW_POR_TIPO = {
    "imagen": "OMNI_WORKFLOW_IMAGEN",
    "video": "OMNI_WORKFLOW_VIDEO",
    "voz": "OMNI_WORKFLOW_VOZ",
    "musica": "OMNI_WORKFLOW_MUSICA",
    "sfx": "OMNI_WORKFLOW_SFX",
    "3d": "OMNI_WORKFLOW_3D",
}


def ruta_workflow(tipo: str) -> str:
    """
    Workflow que el PROVEEDOR ha configurado para este tipo de trabajo.

    Se busca primero el especifico -`OMNI_WORKFLOW_VIDEO`- y luego el general
    `OMNI_WORKFLOW`, que sigue valiendo para quien solo genere imagenes.
    """
    especifico = os.environ.get(WORKFLOW_POR_TIPO.get(tipo, ""), "").strip()
    if especifico:
        return especifico
    return os.environ.get("OMNI_WORKFLOW", "").strip()


# Marca que el agente pone en sus PROPIAS generaciones de emergencia.
#
# Sin ella el agente se leia a si mismo: coge el ultimo grafo del historial,
# genera, y esa generacion pasa a ser la ultima del historial. A partir de la
# primera vez, el grafo de emergencia se reproducia en bucle —con sus 256x1024
# congelados— y el workflow del dueno no volvia a mirarse nunca.
MARCA_PROPIA = "omnideploy_agente"

def workflow_de_esta_maquina(inputs: dict) -> dict | None:
    """
    El workflow que ESTA MAQUINA tiene cargado en Omni IA Game.

    Es el corazon de OmniDeploy: el PC del cliente no tiene modelos, ni ComfyUI,
    ni workflows —para eso paga el servicio—. Quien los tiene es este equipo, y
    son los que el dueno ha cargado en su propia aplicacion.

    La aplicacion los vuelca en LOCALAPPDATA y aqui se leen. Se busca primero el
    ligado a la ACCION que pidio el cliente -"Static Object", "Idle"...- y si esa
    accion no tiene ninguno, el general. Exactamente el mismo orden que sigue la
    aplicacion cuando genera en local.
    """
    base = os.environ.get("LOCALAPPDATA", "")
    if not base:
        return None
    raiz = Path(base) / "Omni IA Game" / "omnideploy" / "workflows"
    if not raiz.is_dir():
        return None

    def saneado(x: str) -> str:
        return "".join(c if (c.isalnum() or c in "-_") else "_" for c in x)

    # SE BUSCA DENTRO DE LA CARPETA DEL TIPO Y NUNCA FUERA. Cada pestana de la
    # aplicacion tiene su propia configuracion de ComfyUI, con su workflow: un
    # trabajo de voz no puede acabar ejecutando un grafo de imagen y devolviendo
    # un PNG donde se espera un wav.
    tipo = saneado(str(inputs.get("tipo") or "imagen").strip().lower())

    candidatos = []
    accion = str(inputs.get("accion") or "").strip()
    if accion:
        candidatos.append((tipo, saneado(accion)))
    candidatos.append((tipo, "general"))

    # Mundos funciona igual que Sprites: tiene sus ranuras por perspectiva, pero
    # si no hay nada cargado en ellas ni en su general, vale el general de
    # Imagen —el mismo que usa Sprites—, que es lo que hace la aplicacion cuando
    # genera en local. No al reves: un grafo de mundos no se sirve a un sprite.
    if tipo == "mundos":
        # Las tuberias A, B y C NO se consultan. Son el reparto entre varios
        # ComfyUI del camino local, y sus workflows son los mismos que ya estan
        # en las ranuras por perspectiva: consultarlas solo anade un escalon que
        # puede servir un grafo distinto del que el usuario ve seleccionado.
        candidatos.append(("imagen", "general"))

    for carpeta, nombre in candidatos:
        dir_wf = raiz / carpeta
        f = dir_wf / f"{nombre}.json"
        if f.exists():
            try:
                grafo = json.loads(f.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if isinstance(grafo, dict) and grafo:
                log(f"  workflow de esta maquina: {carpeta}/{nombre} ({len(grafo)} nodos)")
                return grafo
    return None


def workflow_por_defecto(inputs: dict) -> dict:
    """
    NO HAY WORKFLOW POR DEFECTO. Nunca.

    El grafo lo pone SIEMPRE la aplicacion: es el que el usuario tiene cargado
    en Ajustes, en la pestana de ComfyUI. El agente solo lo ejecuta.

    Antes esto miraba el historial de ComfyUI y, si no habia, montaba un
    texto-a-imagen minimo con un checkpoint elegido a dedo. Las dos cosas
    estaban mal: el historial vive en memoria y se borra al reiniciar ComfyUI,
    y un grafo inventado genera cualquier cosa menos lo que el usuario pidio.

    `OMNI_WORKFLOW_<TIPO>` en agent.env sigue valiendo como respaldo para el
    proveedor que quiera fijar uno suyo, pero no se inventa nada.
    """
    tipo = str(inputs.get("tipo", "imagen")).lower()

    # 1. EL DE ESTA MAQUINA. Es el caso normal: el cliente no tiene nada, y
    #    este equipo pone su workflow y su GPU. Va primero por eso.
    propio = workflow_de_esta_maquina(inputs)
    if propio:
        return sustituir_parametros(propio, inputs)

    # 2. Una ruta fijada a mano por el proveedor, si la quiso poner.
    ruta = ruta_workflow(tipo)
    if ruta:
        p = Path(ruta)
        if not p.exists():
            raise RuntimeError(
                f"El workflow configurado para '{tipo}' no existe: {ruta}. "
                f"Revisa {WORKFLOW_POR_TIPO.get(tipo, 'OMNI_WORKFLOW')} en agent.env."
            )
        return sustituir_parametros(json.loads(p.read_text(encoding="utf-8")), inputs)

    raise RuntimeError(
        f"Este equipo no tiene ningun workflow de '{tipo}' publicado. Abre Omni "
        f"IA Game AQUI, carga tu workflow en Ajustes y vuelve a intentarlo: el "
        f"cliente no necesita tener ninguno, los pone esta maquina."
    )

def entero(valor, por_defecto: int) -> int:
    """
    Convierte a entero SIN reventar.

    `inputs.get("width", 1024)` devuelve `None` si la clave existe con valor
    nulo, e `int(None)` lanza "int() argument must be ... not 'NoneType'". Pasa
    de verdad: `JSON.stringify(NaN)` produce `null`, asi que un campo de
    resolucion vacio en la aplicacion llega aqui como nulo. El cliente tambien
    lo controla ya, pero un dato que cruza la red se valida en los dos lados.
    """
    try:
        n = int(valor)
    except (TypeError, ValueError):
        return por_defecto
    return n if n > 0 else por_defecto


def sustituir_parametros(grafo: dict, inputs: dict) -> dict:
    """
    Inyecta prompt, negativo y tamano en un workflow propio.

    Se identifica por `class_type` y no por numero de nodo: los identificadores
    cambian de un workflow a otro. El negativo es el CLIPTextEncode al que apunta
    la entrada `negative` del muestreador, no "el segundo": el orden no significa
    nada en un grafo.
    """
    negativo_id = None
    for nodo in grafo.values():
        if "KSampler" in nodo.get("class_type", ""):
            ref = nodo.get("inputs", {}).get("negative")
            if isinstance(ref, list) and ref:
                negativo_id = str(ref[0])
            break

    # La semilla la manda el cliente. Si no la manda, se sortea aqui: sin esto
    # el grafo guardado repetiria SIEMPRE la misma imagen, que es exactamente lo
    # que la aplicacion evita cuando genera contra su ComfyUI local.
    semilla = entero(inputs.get("seed"), None)
    if semilla is None:
        semilla = random.randint(0, 1_000_000_000)

    # El tamano que pidio el cliente. Si falta cualquiera de los dos, no se toca
    # el lienzo: manda el del workflow.
    ancho = entero(inputs.get("width"), None)
    alto = entero(inputs.get("height"), None)

    for nid, nodo in grafo.items():
        clase = nodo.get("class_type", "")
        campos = nodo.get("inputs", {})
        if "TextEncode" in clase and isinstance(campos.get("text"), str):
            campos["text"] = inputs.get("negative_prompt", "") if nid == negativo_id else inputs.get("prompt", "")
        elif es_latente_de_imagen(clase):
            # LOS DOS O NINGUNO.
            #
            # El agente NO decide el tamano: o lo eligio el cliente en la
            # aplicacion, o manda el que trae el workflow. Aplicar solo uno de
            # los dos mezcla las dos fuentes y deforma la imagen -un ancho de
            # 256 sobre un alto de 1088 del grafo-, que es exactamente lo que
            # pasaba.
            if ancho is not None and alto is not None:
                if "width" in campos:
                    campos["width"] = ancho
                if "height" in campos:
                    campos["height"] = alto
        # Los dos nombres que usa ComfyUI segun el muestreador, igual que hace
        # la aplicacion en local.
        if "seed" in campos and not isinstance(campos["seed"], list):
            campos["seed"] = semilla
        if "noise_seed" in campos and not isinstance(campos["noise_seed"], list):
            campos["noise_seed"] = semilla
    return grafo


def es_latente_de_imagen(clase: str) -> bool:
    """
    ¿Crea este nodo un lienzo de imagen vacio?

    No basta con buscar "EmptyLatentImage": el workflow del dueno usaba
    `EmptySD3LatentImage` -Z-Image, Flux y SD3 lo usan- y la sustitucion no lo
    reconocia, asi que la resolucion elegida en la aplicacion se ignoraba en
    silencio.

    Se excluyen los de VIDEO: definen fotogramas, no una imagen, y reescribirlos
    con el tamano de un sprite descuadra la animacion entera.
    """
    if "Empty" not in clase or "Latent" not in clase:
        return False
    return "Video" not in clase and "Audio" not in clase


def ejecutar_en_comfyui(inputs: dict) -> list[dict[str, str]]:
    """
    Encola el workflow en ComfyUI y espera el resultado.

    Si el trabajo trae un grafo en `workflow`, se usa tal cual. Si no, se monta
    uno con los parametros recibidos.
    """
    # Manda el grafo del cliente si lo trae: es el que tiene cargado en su
    # aplicacion y el que sabe que produce lo que quiere. Si no lo trae, se usa
    # el que el proveedor haya configurado para ese tipo.
    #
    # El riesgo -que el grafo nombre un modelo que este equipo no tenga- no se
    # evita adivinando, se evita DICIENDOLO: `comfy()` devuelve ahora el nodo y
    # el campo exactos, que se corrige en dos minutos.
    propio = inputs.get("workflow")
    if propio and inputs.get("workflow_listo"):
        # LA APLICACION YA LO MONTO. Es el camino normal: OmniDeploy es ComfyUI
        # en otra maquina, asi que el grafo llega con el prompt, la resolucion,
        # el LoRA y el recorte ya inyectados, igual que si el usuario tuviera el
        # ComfyUI al lado. Tocarlo aqui seria pisar lo que acaba de decidir.
        workflow = propio
        log("  ejecutando el workflow que envio la aplicacion, tal cual")
    elif propio:
        workflow = sustituir_parametros(propio, inputs)
    else:
        workflow = workflow_por_defecto(inputs)

    if not workflow:
        raise ValueError("No se pudo montar ningun workflow para este trabajo")

    # Se deja constancia de con QUE se va a generar. Un tamano absurdo o un
    # modelo inesperado se ven aqui, no en la imagen deformada que llega media
    # hora despues.
    for nodo in workflow.values():
        campos = nodo.get("inputs") or {}
        if es_latente_de_imagen(nodo.get("class_type", "")) and "width" in campos:
            log(f"  lienzo: {campos['width']}x{campos['height']}")
        for clave in ("ckpt_name", "unet_name", "model_name"):
            if clave in campos:
                log(f"  modelo: {campos[clave]}")

    encolado = comfy("POST", "/prompt", {"prompt": workflow})
    prompt_id = encolado.get("prompt_id")
    if not prompt_id:
        raise ValueError(f"ComfyUI no acepto el workflow: {encolado}")

    log(f"  encolado en ComfyUI: {prompt_id}")

    limite = time.time() + TIMEOUT_TRABAJO
    fallos_consecutivos = 0
    while time.time() < limite:
        try:
            historial = comfy("GET", f"/history/{prompt_id}", espera=60)
            fallos_consecutivos = 0
            entrada = historial.get(prompt_id)
            if entrada:
                estado = entrada.get("status", {})
                if estado.get("status_str") == "error" or estado.get("completed") is False:
                    raise RuntimeError(f"ComfyUI fallo: {estado}")
                return recoger_salidas(entrada)
        except (urllib.error.URLError, TimeoutError, OSError, ConnectionError) as e:
            # Si ComfyUI esta saturado procesando la GPU/CPU, la peticion HTTP puntual
            # de sondeo puede caducar. No abortamos el trabajo: seguimos esperando.
            fallos_consecutivos += 1
            if fallos_consecutivos % 5 == 1:
                log(f"  ComfyUI respondiendo lento al sondeo ({e}); continuando espera...")
        time.sleep(2)

    raise TimeoutError(f"ComfyUI no termino en {TIMEOUT_TRABAJO} s")


# Que clase de cosa es cada salida de ComfyUI. NO TODO ES TEXTO NI TODO ES
# IMAGEN: una malla 3D, un wav y un mp4 se guardan, se muestran y se abren de
# formas distintas, y el cliente no deberia tener que adivinarlo por la
# extension. ComfyUI ya lo agrupa por clave, asi que la informacion existe: solo
# habia que no tirarla.
CLASE_POR_CLAVE = {
    "images": "imagen",
    "gifs": "animacion",
    "videos": "video",
    "audio": "audio",
    "3d": "modelo3d",
    "meshes": "modelo3d",
    "text": "texto",
}

# Tipo MIME por extension, para que el cliente no tenga que deducirlo.
MIME_POR_EXTENSION = {
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".webp": "image/webp", ".gif": "image/gif",
    ".mp4": "video/mp4", ".webm": "video/webm",
    ".wav": "audio/wav", ".mp3": "audio/mpeg", ".flac": "audio/flac", ".ogg": "audio/ogg",
    ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".obj": "model/obj",
    ".ply": "model/ply", ".stl": "model/stl",
    ".txt": "text/plain", ".json": "application/json",
}


def mime_de(nombre: str) -> str:
    return MIME_POR_EXTENSION.get(Path(nombre).suffix.lower(), "application/octet-stream")


def recoger_salidas(entrada: dict) -> list[dict[str, str]]:
    """
    Descarga de ComfyUI los ficheros producidos y los deja en base64.

    Cada uno viaja CON SU CLASE Y SU TIPO: imagen, animacion, video, audio o
    modelo 3D. Un mp4 y un wav no se tratan igual al llegar, y deducirlo de la
    extension en el cliente es adivinar lo que aqui se sabe con certeza.
    """
    ficheros: list[dict[str, str]] = []
    for salida in (entrada.get("outputs") or {}).values():
        for clave in ("images", "gifs", "videos", "audio", "3d", "meshes"):
            for item in salida.get(clave, []) or []:
                nombre = item.get("filename")
                if not nombre:
                    continue
                params = urllib.parse.urlencode({
                    "filename": nombre,
                    "subfolder": item.get("subfolder", ""),
                    "type": item.get("type", "output"),
                })
                for intento in range(3):
                    try:
                        with urllib.request.urlopen(f"{COMFYUI}/view?{params}", timeout=120) as r:
                            ficheros.append({
                                "name": nombre,
                                "kind": CLASE_POR_CLAVE.get(clave, "archivo"),
                                "mime": mime_de(nombre),
                                "data": base64.b64encode(r.read()).decode("ascii"),
                            })
                        break
                    except Exception as e:
                        if intento == 2:
                            raise
                        log(f"  Aviso descargando {nombre} (intento {intento + 1}/3): {e}")
                        time.sleep(2)
    return ficheros


# ----------------------------------------------------------------- Ollama ---

OLLAMA = os.environ.get("OMNI_OLLAMA_URL", "http://localhost:11434").rstrip("/")

# Lo mismo para el texto: UNA HORA. Medido, gemma4:12b tardo 136 s en una sola
# frase con el modelo en frio; un documento largo no cabe en diez minutos.
TIMEOUT_TEXTO = 60 * 60

# Modelos que NO sirven para conversar: los de embeddings devuelven vectores,
# no texto. Elegir uno de esos da una respuesta vacia y ninguna pista.
NO_CONVERSAN = ("embed", "embedding", "bge-", "e5-", "reranker")


def ollama(ruta: str, cuerpo: dict | None = None, espera: int = 60):
    """Habla con Ollama, leyendo el cuerpo del error igual que con ComfyUI."""
    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None
    req = urllib.request.Request(f"{OLLAMA}{ruta}", data=datos,
                                 method="POST" if datos else "GET")
    if datos is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=espera) as resp:
            crudo = resp.read()
            return json.loads(crudo) if crudo else {}
    except urllib.error.HTTPError as e:
        detalle = ""
        try:
            detalle = e.read().decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            pass
        raise RuntimeError(f"Ollama respondio {e.code} en {ruta}: {detalle[:300]}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Ollama no responde en {OLLAMA} ({e.reason}). Comprueba que este "
            f"encendido en este equipo."
        ) from e


def elegir_modelo_ollama() -> str:
    """
    Elige un modelo que ESTE DESCARGADO en este equipo.

    Misma leccion que con `OMNI_CHECKPOINT`, que apuntaba a un modelo ausente y
    mataba cada trabajo con un error que el usuario remoto no podia arreglar: lo
    configurado se comprueba, no se obedece a ciegas.
    """
    forzado = os.environ.get("OMNI_OLLAMA_MODEL", "").strip()

    try:
        datos = ollama("/api/tags", espera=20)
        instalados = [m.get("name", "") for m in (datos.get("models") or []) if m.get("name")]
    except Exception:  # noqa: BLE001 — sin lista, se confia en lo configurado
        if forzado:
            return forzado
        raise

    if forzado:
        # Ollama nombra `gemma4:12b`; se acepta tambien escribirlo sin etiqueta.
        exacto = next((m for m in instalados if m == forzado), None)
        if exacto:
            return exacto
        con_latest = next((m for m in instalados if m.split(":")[0] == forzado.split(":")[0]), None)
        if con_latest:
            return con_latest
        log(f"AVISO: OMNI_OLLAMA_MODEL='{forzado}' no esta descargado en este equipo.")
        log("       Se elegira otro. Corrigelo en agent.env o descargalo con `ollama pull`.")

    utiles = [m for m in instalados if not any(x in m.lower() for x in NO_CONVERSAN)]
    if not utiles:
        raise RuntimeError(
            "Este equipo no tiene ningun modelo de texto en Ollama. Descarga uno "
            "con `ollama pull gemma4:12b` para poder atender trabajos de texto."
        )
    return utiles[0]


def ejecutar_en_ollama(inputs: dict) -> list[dict[str, str]]:
    """
    Genera texto y lo devuelve COMO FICHERO.

    Viaja en el mismo array `outputs` que las imagenes, con lo que el relay no
    cambia en absoluto: ya almacena y sirve ficheros en base64, con su TTL y sus
    limites. Un texto ronda los 10 KB frente al tope de 25 MB.
    """
    prompt = str(inputs.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("El trabajo de texto no trae prompt")

    modelo = elegir_modelo_ollama()
    peticion = {"model": modelo, "prompt": prompt, "stream": False}

    sistema = str(inputs.get("system") or "").strip()
    if sistema:
        peticion["system"] = sistema

    log(f"  generando texto con {modelo}...")
    r = ollama("/api/generate", peticion, espera=TIMEOUT_TEXTO)

    texto = str(r.get("response") or "")
    if not texto.strip():
        raise RuntimeError(f"El modelo {modelo} devolvio una respuesta vacia.")

    return [{
        "name": "respuesta.txt",
        "kind": "texto",
        "mime": "text/plain; charset=utf-8",
        "data": base64.b64encode(texto.encode("utf-8")).decode("ascii"),
    }]


# ------------------------------------------------------------------ reparto ---

def ejecutar_trabajo(inputs: dict) -> list[dict[str, str]]:
    """
    Reparte segun lo que se pide.

    Un solo agente para las dos cosas: un solo registro, una sola credencial y
    un solo proceso que vigilar. Lo que cambia es a que servicio local se habla.
    """
    tipo = str(inputs.get("tipo", "imagen")).lower()

    # LA APLICACION PIDE EL GRAFO PARA INYECTARLO ELLA.
    #
    # Es lo que hace que OmniDeploy sea ComfyUI en otra maquina y no otra cosa
    # parecida: el cliente coge este grafo y le aplica EXACTAMENTE las mismas
    # inyecciones que aplicaria a un ComfyUI local -prompt, negativo, tamano,
    # semilla, LoRA, recorte de fondo, imagen de partida, voz, duracion...- y
    # devuelve el grafo ya montado. Nada se reimplementa aqui, asi que nada
    # puede divergir.
    if inputs.get("pedir_workflow"):
        grafo = workflow_de_esta_maquina(inputs)
        if grafo is None:
            grafo = workflow_por_defecto({**inputs, "prompt": "", "seed": None})
        log(f"  workflow entregado a la aplicacion: {len(grafo)} nodos")
        return [{
            "name": "workflow.json",
            "kind": "texto",
            "mime": "application/json",
            "data": base64.b64encode(json.dumps(grafo).encode("utf-8")).decode("ascii"),
        }]

    if tipo == "texto":
        return ejecutar_en_ollama(inputs)
    return ejecutar_en_comfyui(inputs)


# ----------------------------------------------------------------- inicio ---

def asegurar_registro(t: TransporteSondeo) -> TransporteSondeo:
    """Registra el agente si aun no lo esta y espera a que lo aprueben."""
    estado = leer_estado()

    if not estado.get("deviceToken"):
        if not MASTER_KEY:
            log("FALTA OMNI_MASTER_KEY. Ponla en agent.env y vuelve a lanzar.")
            sys.exit(1)
        log(f"Registrando '{NOMBRE}' en {RELAY}...")
        r = t.registrar(MASTER_KEY, NOMBRE)
        estado = {"deviceId": r["deviceId"], "deviceToken": r["deviceToken"]}
        guardar_estado(estado)
        log(f"Registrado. Id: {estado['deviceId']}")
        log("Apruebalo en el panel de administracion para que empiece a trabajar.")

    t.device_token = estado["deviceToken"]

    # Espera a la aprobacion sin machacar el servidor.
    avisado = False
    while True:
        try:
            info = t.estado()
            if info.get("status") == "active":
                log(f"Aprobado. Despliegue: {info.get('deploymentId')}")
                return t
            if info.get("status") == "revoked":
                log("Este dispositivo esta REVOCADO. Borra agent.json para registrarlo de nuevo.")
                sys.exit(1)
            if not avisado:
                log("Pendiente de aprobacion en el panel. Esperando...")
                avisado = True
            time.sleep(10)
        except ErrorRelay as e:
            if e.codigo == 401:
                log("Dispositivo no reconocido en el servidor (token desactualizado). Volviendo a registrar...")
                estado = {}
                guardar_estado(estado)
                t.device_token = None
                return asegurar_registro(t)
            raise


# Que servicio atiende cada cosa. ComfyUI NO es "el de las imagenes": es un
# motor de grafos, y segun el workflow devuelve imagenes, animaciones, video,
# audio o mallas 3D. Ollama es el que escribe.
SERVICIOS = {
    "ComfyUI": ("imagenes, animaciones, video, audio y modelos 3D", "el workflow decide cual"),
    "Ollama": ("textos: guiones, dialogos y NPCs", "un modelo de lenguaje"),
}


def informar_capacidades() -> None:
    """
    Dice al arrancar QUÉ puede atender este equipo y CON QUÉ.
    Verifica primero con /system_stats si ComfyUI ya está en ejecución.
    """
    que_comfy, _ = SERVICIOS["ComfyUI"]
    if esta_comfyui_activo():
        try:
            info = comfy("GET", "/object_info/CheckpointLoaderSimple", espera=5)
            n = len(info["CheckpointLoaderSimple"]["input"]["required"]["ckpt_name"][0])
            log(f"  ComfyUI  {COMFYUI} [EN LINEA - INSTANCIA ACTIVA DETECTADA]")
            log(f"           sirve {que_comfy} ({n} checkpoints)")
        except Exception:  # noqa: BLE001
            log(f"  ComfyUI  {COMFYUI} [EN LINEA - INSTANCIA ACTIVA DETECTADA]")
            log(f"           sirve {que_comfy}")
    else:
        log(f"  ComfyUI  {COMFYUI} [LISTO PARA AUTO-LANZAMIENTO REMOTO]")
        log("           (Apagado actualmente. Se encenderá automáticamente cuando la Web App lo solicite)")

    try:
        modelo = elegir_modelo_ollama()
        log(f"  Ollama   {OLLAMA}")
        log(f"           sirve textos: guiones, dialogos y NPCs, con {modelo}")
    except Exception:  # noqa: BLE001
        log(f"  Ollama   NO disponible en {OLLAMA}")
        log("           sin el no hay textos; iran por servicios en la nube")


PROCESO_COMFYUI = None
LOGS_PENDIENTES = []
ESTADO_COMFYUI = "stopped"

def capturar_linea_log(linea: str) -> None:
    if not linea:
        return
    l = linea.rstrip()
    if l:
        LOGS_PENDIENTES.append(f"[{time.strftime('%H:%M:%S')}] {l}")
        if len(LOGS_PENDIENTES) > 500:
            LOGS_PENDIENTES.pop(0)

def esta_comfyui_activo() -> bool:
    try:
        comfy("GET", "/system_stats", espera=3)
        return True
    except Exception:
        return False

def lanzar_comfyui_local() -> bool:
    global PROCESO_COMFYUI, ESTADO_COMFYUI
    if esta_comfyui_activo():
        capturar_linea_log("ComfyUI ya está activo en http://127.0.0.1:8188")
        ESTADO_COMFYUI = "running"
        return True

    ESTADO_COMFYUI = "launching"
    cmd = os.environ.get("OMNI_COMFYUI_LAUNCH_CMD", "").strip()
    if not cmd:
        candidatos = [
            r"F:\Comfyui_362\App\OMNI-IA_START - Copy.bat",
            r"G:\apps\all_comfyui_installer\ComfyUI\run_nvidia_gpu.bat",
            r"C:\ComfyUI\run_nvidia_gpu.bat",
        ]
        for c in candidatos:
            if os.path.exists(c):
                cmd = c
                break

    if not cmd:
        capturar_linea_log("Falta OMNI_COMFYUI_LAUNCH_CMD en agent.env. No se encontró script por defecto.")
        ESTADO_COMFYUI = "stopped"
        return False

    capturar_linea_log(f"Lanzando ComfyUI localmente: {cmd}")
    try:
        import subprocess
        import threading
        PROCESO_COMFYUI = subprocess.Popen(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )

        def capturar_salida():
            if PROCESO_COMFYUI and PROCESO_COMFYUI.stdout:
                for linea in PROCESO_COMFYUI.stdout:
                    capturar_linea_log(linea)

        t_hilo = threading.Thread(target=capturar_salida, daemon=True)
        t_hilo.start()
        ESTADO_COMFYUI = "running"
        return True
    except Exception as e:
        capturar_linea_log(f"Error al ejecutar script de ComfyUI: {e}")
        ESTADO_COMFYUI = "stopped"
        return False

def detener_comfyui_local() -> None:
    global PROCESO_COMFYUI, ESTADO_COMFYUI
    capturar_linea_log("Solicitud de apagado de ComfyUI local...")
    if PROCESO_COMFYUI:
        try:
            PROCESO_COMFYUI.terminate()
        except Exception:
            pass
        PROCESO_COMFYUI = None
    try:
        import subprocess
        subprocess.run("taskkill /F /IM python.exe /FI \"WINDOWTITLE eq ComfyUI*\"", shell=True, capture_output=True)
    except Exception:
        pass
    ESTADO_COMFYUI = "stopped"
    capturar_linea_log("ComfyUI detenido.")

def sincronizar_logs_y_control(t: TransporteSondeo) -> None:
    global LOGS_PENDIENTES, ESTADO_COMFYUI
    activo = esta_comfyui_activo()
    actual_status = "running" if activo else ("launching" if ESTADO_COMFYUI == "launching" else "stopped")
    ESTADO_COMFYUI = actual_status

    a_enviar = list(LOGS_PENDIENTES)
    LOGS_PENDIENTES.clear()

    try:
        resp = t.enviar_logs(a_enviar, status=actual_status)
        cmd = resp.get("controlCommand")
        if cmd == "START_COMFY":
            capturar_linea_log("Recibida orden remota START_COMFY desde el servidor.")
            lanzar_comfyui_local()
        elif cmd == "STOP_COMFY":
            capturar_linea_log("Recibida orden remota STOP_COMFY desde el servidor.")
            detener_comfyui_local()
    except Exception:  # noqa: BLE001
        pass

def main() -> None:
    log(f"Agente OmniDeploy — relay {RELAY}")
    informar_capacidades()
    t = TransporteSondeo(RELAY)

    try:
        t = asegurar_registro(t)
    except ErrorRelay as e:
        log(f"No se pudo registrar: {e}")
        sys.exit(1)

    espera = ESPERA_MIN
    while True:
        try:
            sincronizar_logs_y_control(t)
            trabajo = t.obtener_trabajo()
            espera = ESPERA_MIN  # hubo respuesta: se reinicia el retroceso

            if trabajo is None:
                continue  # 204: no habia trabajo, se vuelve a preguntar

            job_id = trabajo["jobId"]
            log(f"Trabajo {job_id}")

            # QUE PIDE EL CLIENTE, tal cual llega. Sin esto, un tamano
            # inesperado obliga a adivinar de donde salio; con esto se ve si lo
            # mando la aplicacion o lo puso el agente.
            _e = trabajo.get("inputs") or {}
            log(
                "  recibido: tipo={} {}x{} semilla={} workflow={}".format(
                    _e.get("tipo", "?"),
                    _e.get("width", "-"),
                    _e.get("height", "-"),
                    _e.get("seed", "-"),
                    "si ({} nodos)".format(len(_e["workflow"]))
                    if isinstance(_e.get("workflow"), dict)
                    else "no",
                )
            )
            _p = str(_e.get("prompt") or "")
            if _p:
                log(f"  prompt: {_p[:100]}")
            try:
                ficheros = ejecutar_trabajo(trabajo.get("inputs") or {})
                t.enviar_resultado(job_id, "success", ficheros=ficheros)
                log(f"  entregado: {len(ficheros)} fichero(s)")
            except Exception as e:  # noqa: BLE001 — cualquier fallo se reporta
                log(f"  fallo: {e}")
                try:
                    t.enviar_resultado(job_id, "failed", error=str(e)[:400])
                except ErrorRelay as e2:
                    log(f"  ademas no se pudo avisar del fallo: {e2}")

        except ErrorRelay as e:
            # 403 mientras esta pendiente o revocado: se vuelve a comprobar.
            if e.codigo == 403:
                log("El relay rechaza el sondeo; comprobando estado del dispositivo...")
                try:
                    t = asegurar_registro(t)
                    continue
                except ErrorRelay:
                    pass
            log(f"Relay no disponible ({e}); reintento en {espera} s")
            time.sleep(espera)
            espera = min(espera * 2, ESPERA_MAX)
        except KeyboardInterrupt:
            log("Detenido por el usuario")
            return


if __name__ == "__main__":
    main()
