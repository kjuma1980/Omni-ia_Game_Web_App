"""
Transporte entre el agente y el relay.

ES LA UNICA PIEZA QUE SABE COMO LLEGAN LOS TRABAJOS. Hoy el agente pregunta
-sondeo largo-, porque el hosting compartido duerme el proceso y una conexion
persistente muerta no se entera de nada mientras que una peticion nueva lo
despierta. El dia que haya VPS se anade aqui una clase `TransporteWebSocket` y
`agent.py` no cambia.

Si al migrar hay que tocar otro fichero, el aislamiento estaba mal hecho.

Sin dependencias externas: `urllib` de la biblioteca estandar. Anadir
`requests` o `websockets` obligaria a instalar cosas en el PC del dueno.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

VERSION = "1.0"


class ErrorRelay(Exception):
    """Fallo hablando con el relay. Lleva el codigo HTTP si lo hubo."""

    def __init__(self, mensaje: str, codigo: int | None = None) -> None:
        super().__init__(mensaje)
        self.codigo = codigo


class TransporteSondeo:
    """Sondeo largo por HTTPS."""

    def __init__(self, url_base: str, device_token: str | None = None) -> None:
        self.url_base = url_base.rstrip("/")
        self.device_token = device_token

    # ------------------------------------------------------------- interno --
    def _peticion(
        self,
        metodo: str,
        ruta: str,
        cuerpo: dict[str, Any] | None = None,
        espera: int = 40,
    ) -> tuple[int, dict[str, Any]]:
        url = f"{self.url_base}{ruta}"
        datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None

        req = urllib.request.Request(url, data=datos, method=metodo)
        # Identificacion propia. `urllib` se presenta por defecto como
        # "Python-urllib/3.x", y Cloudflare —que protege el dominio— rechaza esa
        # firma con un error 1010 antes de que la peticion llegue al servidor.
        # No es un rodeo a nada: es que un cliente HTTP diga quien es.
        req.add_header("User-Agent", f"OmniDeployAgent/{VERSION}")
        req.add_header("Accept", "application/json")
        if datos is not None:
            req.add_header("Content-Type", "application/json")
        if self.device_token:
            req.add_header("X-Device-Token", self.device_token)

        try:
            with urllib.request.urlopen(req, timeout=espera) as resp:
                crudo = resp.read()
                if not crudo:
                    return resp.status, {}
                return resp.status, json.loads(crudo)
        except urllib.error.HTTPError as e:
            crudo = e.read()
            try:
                return e.code, json.loads(crudo) if crudo else {}
            except json.JSONDecodeError:
                return e.code, {"error": crudo.decode("utf-8", "replace")[:200]}
        except urllib.error.URLError as e:
            raise ErrorRelay(f"No se pudo contactar con el relay: {e.reason}") from e
        except TimeoutError as e:
            raise ErrorRelay("El relay no respondio a tiempo") from e

    # -------------------------------------------------------------- publico --
    def registrar(self, master_key: str, nombre: str) -> dict[str, Any]:
        """Auto-registro. Devuelve deviceId y deviceToken; queda pendiente."""
        codigo, datos = self._peticion(
            "POST", "/api/omnideploy/devices/register",
            {"masterKey": master_key, "friendlyName": nombre},
        )
        if codigo != 200:
            raise ErrorRelay(datos.get("error", f"HTTP {codigo}"), codigo)
        return datos

    def estado(self) -> dict[str, Any]:
        """Estado del dispositivo: pending, active o revoked."""
        codigo, datos = self._peticion("GET", "/api/omnideploy/devices/me")
        if codigo != 200:
            raise ErrorRelay(datos.get("error", f"HTTP {codigo}"), codigo)
        return datos

    def obtener_trabajo(self) -> dict[str, Any] | None:
        """
        Pide trabajo y espera. `None` significa "no hay", que es lo normal:
        el relay retiene la peticion 25 s antes de contestar 204.

        La espera del cliente es mayor que la del servidor a proposito: si
        fueran iguales, la red podria cortar justo en el limite y cada sondeo
        parecerian un fallo.
        """
        codigo, datos = self._peticion("GET", "/api/omnideploy/agent/poll", espera=40)
        if codigo == 204:
            return None
        if codigo == 200:
            return datos
        raise ErrorRelay(datos.get("error", f"HTTP {codigo}"), codigo)

    def enviar_resultado(
        self,
        job_id: str,
        estado: str,
        ficheros: list[dict[str, str]] | None = None,
        error: str | None = None,
    ) -> None:
        codigo, datos = self._peticion(
            "POST", "/api/omnideploy/agent/result",
            {"jobId": job_id, "status": estado, "files": ficheros or [], "error": error},
            espera=300,  # subir binarios tarda mas que preguntar; 5 min de margen
        )
        if codigo != 200:
            raise ErrorRelay(datos.get("error", f"HTTP {codigo}"), codigo)
