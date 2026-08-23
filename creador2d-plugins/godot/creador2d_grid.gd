extends RefCounted
class_name Creador2DGrid

## Espejo de la geometria del editor (Godot 4.x).
##
## Copia literal de `creador2d-backend/src/common/domain/tiles.ts`. Si la regla
## cambia alli, debe cambiar aqui: un motor que calcule las coordenadas de otra
## forma ensamblaria el mundo desplazado respecto a como lo dibujo el usuario.

# --- Banderas de la matriz logica de colisiones (un byte por celda) ---------
const FLAG_NONE: int    = 0
const FLAG_SOLID: int   = 1 << 0
const FLAG_WATER: int   = 1 << 1
const FLAG_STAIRS: int  = 1 << 2
const FLAG_PIT: int     = 1 << 3
const FLAG_ONE_WAY: int = 1 << 4
const FLAG_DAMAGE: int  = 1 << 5
const FLAG_LADDER: int  = 1 << 6
const FLAG_TRIGGER: int = 1 << 7

const LAYER_ORDER: Array[String] = ["GROUND", "PIT", "WALL", "OVERLAY"]

const FLAG_NAMES := {
	FLAG_SOLID: "SOLID",
	FLAG_WATER: "WATER",
	FLAG_STAIRS: "STAIRS",
	FLAG_PIT: "PIT",
	FLAG_ONE_WAY: "ONE_WAY",
	FLAG_DAMAGE: "DAMAGE",
	FLAG_LADDER: "LADDER",
	FLAG_TRIGGER: "TRIGGER",
}


## Division entera hacia abajo. `floori(a / b)` es correcto en el semieje
## negativo; la division entera de GDScript trunca hacia cero y colapsaria los
## tiles -1 y 0 en el mismo indice.
static func floor_div(value: int, divisor: int) -> int:
	return floori(float(value) / float(divisor))


static func floor_mod(value: int, divisor: int) -> int:
	return ((value % divisor) + divisor) % divisor


## Snapping magnetico: pixel del mundo -> coordenada de tile que lo contiene.
static func pixel_to_tile(pixel: int, tile_size: int) -> int:
	return floor_div(pixel, tile_size)


static func tile_to_chunk(tile: int, chunk_size: int) -> int:
	return floor_div(tile, chunk_size)


static func has_flag(mask: int, flag: int) -> bool:
	return (mask & flag) != 0


static func is_solid(mask: int) -> bool:
	return has_flag(mask, FLAG_SOLID)


static func describe(mask: int) -> Array[String]:
	var result: Array[String] = []
	for flag in FLAG_NAMES:
		if has_flag(mask, flag):
			result.append(FLAG_NAMES[flag])
	return result


## Posicion en pixeles del centro de un tile.
##
## El eje Y del editor y el de Godot 2D crecen ambos hacia abajo, asi que aqui
## NO hay que invertir el signo (a diferencia del plugin de Unity).
static func tile_to_world(tile_x: int, tile_y: int, tile_size: int) -> Vector2:
	return Vector2(
		(float(tile_x) + 0.5) * tile_size,
		(float(tile_y) + 0.5) * tile_size
	)


## Orden de dibujado para el sorting 2.5D. El ancla es el borde inferior del
## elemento: un actor situado mas abajo en pantalla se dibuja despues.
static func sorting_order(tile_y: int, height_in_tiles: int, y_sort_offset: int, tile_size: int) -> int:
	return (tile_y + height_in_tiles) * tile_size + y_sort_offset


## Desplazamiento base por capa, para que el suelo nunca tape a los muros.
static func layer_base_order(layer: String) -> int:
	match layer:
		"GROUND":
			return -20000
		"PIT":
			return -10000
		"WALL":
			return 0
		"OVERLAY":
			return 20000
		_:
			return 0


static func parse_hex_color(hex: String, fallback := Color(0.39, 0.45, 0.55)) -> Color:
	if hex.is_empty() or not hex.begins_with("#"):
		return fallback
	return Color.from_string(hex, fallback)
