# Plugins cliente del Creador 2D

Scripts nativos que descargan un mundo creado en el editor web y lo ensamblan
dentro del motor de juego. Los tres consumen la misma API de NestJS.

## Lo que necesita cualquiera de los tres

Se copian del panel **Motores y exportación** del editor web:

| Dato | Ejemplo |
|---|---|
| URL de la API | `http://127.0.0.1:4310` |
| World ID | `31b35a17-e615-4ff8-af5e-6fadc3b477db` |
| Token de motor | `eyJhbGciOi...` (rol `VIEWER`, caduca a las 12 h) |

El token es de **solo lectura**: un motor no puede modificar el mundo. No lo
comparta — da acceso de lectura a los mundos del usuario que lo generó.

## Endpoint que consumen

```
GET /api/worlds/{worldId}/export/matrix
Authorization: Bearer <token de motor>
```

Devuelve `creador2d.matrix.v1`: una rejilla rectangular ya ensamblada, sin
necesidad de reconstruir chunks.

```jsonc
{
  "format": "creador2d.matrix.v1",
  "world":  { "tileSize": 32, "chunkSize": 16, "gravity": 9.8, ... },
  "blocks": [ { "key": "stone_wall", "layer": "WALL",
                "collisionFlags": 1, "heightInTiles": 1, "ySortOffset": -4,
                "visual": { "pattern": "bricks", "colors": ["#4c4f57", ...] } } ],
  "origin": { "tileX": -16, "tileY": -16 },
  "width": 32,
  "height": 32,
  "layers": {
    "GROUND":  ["grass", "grass", "", ...],   // clave de bloque o cadena vacía
    "PIT":     [...],
    "WALL":    [...],
    "OVERLAY": [...]
  },
  "collision": [0, 1, 3, 0, ...]              // un entero 0-255 por celda
}
```

Índice de una celda: `(tileY - origin.tileY) * width + (tileX - origin.tileX)`.

Para builds de servidor o recargas de física existe además
`GET /api/worlds/{worldId}/export/collision`, que devuelve **solo** la matriz de
banderas, sin nada visual.

## Banderas de colisión

| Bandera | Valor | Significado |
|---|---|---|
| `SOLID` | 1 | Bloquea el movimiento |
| `WATER` | 2 | Agua: nado o ralentización |
| `STAIRS` | 4 | Cambio de altura lógica |
| `PIT` | 8 | Foso o vacío |
| `ONE_WAY` | 16 | Plataforma atravesable desde abajo |
| `DAMAGE` | 32 | Zona de daño |
| `LADDER` | 64 | Escalera trepable |
| `TRIGGER` | 128 | Disparador lógico sin colisión |

Los tres plugins fusionan las celdas `SOLID` contiguas de cada fila en una sola
forma de colisión: un mundo de 32×32 pasa de cientos de colliders a unas decenas.

## Convención de ejes por motor

El editor usa el eje Y creciendo **hacia abajo** (convención de pantalla). Cada
plugin lo traduce a su motor:

| Motor | Traducción |
|---|---|
| **Unity** | `X = tileX`, `Y = -tileY` (Unity crece hacia arriba). Orden 2.5D en `sortingOrder`. |
| **Godot** | `X = tileX`, `Y = tileY` (Godot 2D también crece hacia abajo: **no** se invierte). Orden 2.5D con `y_sort_enabled`. |
| **Unreal** | `X = tileX`, `Z = -tileY`, `Y = profundidad` (una franja por capa). |

## Instalación

Las instrucciones detalladas de cada motor están en
[`../CREADOR_2D.md`](../CREADOR_2D.md) §4.3, §4.4 y §4.5.

| Motor | Archivos | Destino |
|---|---|---|
| Unity | `unity/*.cs` (4) | `Assets/Creador2D/` |
| Godot 4.x | `godot/*.gd` (3) | `res://addons/creador2d/` |
| Unreal | `unreal/` completo | `<Proyecto>/Plugins/Creador2D/` |

En los tres casos, los bloques sin prefab/escena/actor asignado se dibujan con el
color base que viene en la definición del bloque, de modo que el mundo es visible
desde el primer momento sin necesidad de arte propio.

## Geometría compartida

`Creador2DGrid` (`.cs`, `.gd`, `.h`) es una copia literal de
`creador2d-backend/src/common/domain/tiles.ts`. **Si una regla cambia allí, debe
cambiar aquí**: un motor que calcule las coordenadas de otra forma ensamblaría el
mundo desplazado respecto a como lo dibujó el usuario.

El punto más delicado es la división entera: debe redondear **hacia abajo**
(`Mathf.FloorToInt`, `floori`, `FMath::FloorToInt`), nunca truncar hacia cero,
o los tiles de coordenada negativa se desalinean en uno.
