extends Node2D
class_name Creador2DWorldBuilder

## Ensambla en la escena el mundo creado en el editor web (Godot 4.x).
##
## Instalacion: copie los tres .gd a `res://addons/creador2d/`, anada un nodo
## Node2D a la escena y asigne este script. Rellene URL, World ID y token (se
## copian del panel "Motores y exportacion" del editor web).
##
## Cada bloque puede tener una escena propia en `block_scenes`. Los que no la
## tengan se generan como un ColorRect del color base del bloque, de forma que
## el mundo es visible desde el primer momento sin necesidad de arte.

signal world_built(matrix: Dictionary)
signal build_failed(message: String)

@export_group("Conexion")
@export var api_url: String = "http://127.0.0.1:4310"
@export var world_id: String = ""
@export var engine_token: String = ""

@export_group("Ensamblado")
@export var build_on_ready: bool = true
@export var generate_collisions: bool = true
@export var build_ground: bool = true
@export var build_pit: bool = true
@export var build_wall: bool = true
@export var build_overlay: bool = true
## Montar las capas de fondo de parallax incluidas en el mundo.
@export var build_parallax: bool = true
## Instanciar el mobiliario y adornos de colocacion libre.
@export var build_objects: bool = true

## Escenas por clave de bloque: { "stone_wall": preload("res://muro.tscn") }
@export var block_scenes: Dictionary = {}

var matrix: Dictionary = {}

var _client: Creador2DClient
var _root: Node2D
var _catalog: Dictionary = {}


func _ready() -> void:
	_client = Creador2DClient.new()
	_client.api_url = api_url
	_client.engine_token = engine_token
	_client.request_failed.connect(_on_request_failed)
	add_child(_client)

	if build_on_ready:
		build()


func _on_request_failed(message: String) -> void:
	push_error("[Creador2D] %s" % message)
	build_failed.emit(message)


func build() -> void:
	if world_id.is_empty() or engine_token.is_empty():
		_on_request_failed("Faltan world_id o engine_token")
		return

	var downloaded: Dictionary = await _client.fetch_matrix(world_id)
	if downloaded.is_empty():
		return

	matrix = downloaded
	_assemble()
	world_built.emit(matrix)

	var world: Dictionary = matrix.get("world", {})
	print("[Creador2D] Mundo \"%s\" ensamblado: %dx%d tiles." % [
		world.get("name", "?"), matrix.get("width", 0), matrix.get("height", 0)
	])


func _assemble() -> void:
	if is_instance_valid(_root):
		_root.queue_free()

	var world: Dictionary = matrix.get("world", {})
	var tile_size: int = int(world.get("tileSize", 32))
	var width: int = int(matrix.get("width", 0))
	var origin: Dictionary = matrix.get("origin", {"tileX": 0, "tileY": 0})
	var layers: Dictionary = matrix.get("layers", {})

	_catalog.clear()
	for block in matrix.get("blocks", []):
		_catalog[block.get("key", "")] = block

	_root = Node2D.new()
	_root.name = "Creador2D_%s" % world.get("slug", "mundo")
	# El Y-sort de Godot ordena por la posicion Y global, que es exactamente la
	# semantica 2.5D del editor.
	_root.y_sort_enabled = true
	add_child(_root)

	for layer_name in Creador2DGrid.LAYER_ORDER:
		if not _should_build(layer_name):
			continue

		var cells: Array = layers.get(layer_name, [])
		if cells.is_empty():
			continue

		var layer_root := Node2D.new()
		layer_root.name = layer_name
		layer_root.y_sort_enabled = (layer_name == "WALL")
		layer_root.z_index = _layer_z(layer_name)
		_root.add_child(layer_root)

		for index in cells.size():
			var key: String = str(cells[index])
			if key.is_empty():
				continue

			var tile_x: int = int(origin.get("tileX", 0)) + (index % width)
			var tile_y: int = int(origin.get("tileY", 0)) + int(index / width)
			_spawn_block(layer_root, key, layer_name, tile_x, tile_y, tile_size)

	if build_parallax:
		_build_parallax()

	if build_objects:
		_build_free_objects(tile_size)

	if generate_collisions:
		_build_collisions(tile_size, origin)


## Capas de fondo, delegadas al ParallaxBackground nativo de Godot.
func _build_parallax() -> void:
	var layers: Array = matrix.get("parallax", [])
	if layers.is_empty():
		return

	var background := Creador2DParallax.new()
	background.name = "Parallax"
	# El fondo cuelga del arbol de la escena, no del nodo del mundo: debe
	# seguir a la camara, no a la geometria.
	add_child(background)
	background.build(layers)


## Objetos de colocacion libre: posicion continua en pixeles, sin ajustar a la
## rejilla, que es justo lo que los hace utiles para mobiliario y adornos.
func _build_free_objects(tile_size: int) -> void:
	var objects: Array = matrix.get("objects", [])
	if objects.is_empty():
		return

	var objects_root := Node2D.new()
	objects_root.name = "Objetos"
	objects_root.y_sort_enabled = true
	_root.add_child(objects_root)

	for placed in objects:
		var key: String = str(placed.get("blockKey", ""))
		if key.is_empty():
			continue

		var info: Dictionary = _catalog.get(key, {})
		var height_in_tiles: int = maxi(1, int(info.get("heightInTiles", 1)))

		var node: Node2D
		if block_scenes.has(key) and block_scenes[key] != null:
			node = (block_scenes[key] as PackedScene).instantiate()
		else:
			node = _build_fallback(key, info, tile_size, height_in_tiles)

		node.name = "%s_free" % key
		# El eje Y de Godot 2D crece hacia abajo igual que en el editor: la
		# posicion se usa tal cual, sin invertir.
		node.position = Vector2(float(placed.get("x", 0.0)), float(placed.get("y", 0.0)))
		node.rotation_degrees = float(placed.get("rotation", 0.0))

		var s: float = float(placed.get("scale", 1.0))
		node.scale = Vector2(-s if placed.get("flipX", false) else s, s)
		node.z_index = _layer_z(str(placed.get("layer", "WALL"))) + int(placed.get("zOffset", 0))

		objects_root.add_child(node)


func _should_build(layer_name: String) -> bool:
	match layer_name:
		"GROUND":
			return build_ground
		"PIT":
			return build_pit
		"WALL":
			return build_wall
		"OVERLAY":
			return build_overlay
		_:
			return false


func _layer_z(layer_name: String) -> int:
	match layer_name:
		"GROUND":
			return -20
		"PIT":
			return -10
		"WALL":
			return 0
		"OVERLAY":
			return 20
		_:
			return 0


func _spawn_block(parent: Node2D, key: String, layer_name: String, tile_x: int, tile_y: int, tile_size: int) -> void:
	var info: Dictionary = _catalog.get(key, {})
	var height_in_tiles: int = maxi(1, int(info.get("heightInTiles", 1)))

	var node: Node2D
	if block_scenes.has(key) and block_scenes[key] != null:
		node = (block_scenes[key] as PackedScene).instantiate()
	else:
		node = _build_fallback(key, info, tile_size, height_in_tiles)

	node.name = "%s_%d_%d" % [key, tile_x, tile_y]

	var position := Creador2DGrid.tile_to_world(tile_x, tile_y, tile_size)
	# Los props de mas de un tile de alto crecen hacia arriba desde su celda
	# base, igual que en el editor.
	if height_in_tiles > 1:
		position.y -= float(height_in_tiles - 1) * 0.5 * tile_size

	node.position = position
	parent.add_child(node)


## Representacion de respaldo: un rectangulo del color base del bloque.
func _build_fallback(key: String, info: Dictionary, tile_size: int, height_in_tiles: int) -> Node2D:
	var holder := Node2D.new()
	holder.name = key

	var visual: Dictionary = info.get("visual", {})
	var colors: Array = visual.get("colors", [])
	var color := Creador2DGrid.parse_hex_color(str(colors[0]) if colors.size() > 0 else "")

	var rect := ColorRect.new()
	rect.color = color
	rect.size = Vector2(tile_size, tile_size * height_in_tiles)
	rect.position = Vector2(-tile_size * 0.5, -tile_size * height_in_tiles * 0.5)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(rect)

	return holder


## Genera colisiones a partir de la matriz logica, no de lo visual.
##
## Las celdas solidas contiguas de una misma fila se fusionan en un unico
## rectangulo: un mundo de 32x32 pasa de cientos de formas a unas decenas.
func _build_collisions(tile_size: int, origin: Dictionary) -> void:
	var body := StaticBody2D.new()
	body.name = "Colisiones"
	_root.add_child(body)

	var width: int = int(matrix.get("width", 0))
	var height: int = int(matrix.get("height", 0))
	var collision: Array = matrix.get("collision", [])
	var origin_x: int = int(origin.get("tileX", 0))
	var origin_y: int = int(origin.get("tileY", 0))

	for row in height:
		var run_start: int = -1

		for column in width + 1:
			var solid := false
			if column < width:
				solid = Creador2DGrid.is_solid(int(collision[row * width + column]))

			if solid and run_start < 0:
				run_start = column
			elif not solid and run_start >= 0:
				var length: int = column - run_start
				var shape := CollisionShape2D.new()
				var rectangle := RectangleShape2D.new()
				rectangle.size = Vector2(length * tile_size, tile_size)
				shape.shape = rectangle
				shape.position = Vector2(
					(float(origin_x + run_start) + length * 0.5) * tile_size,
					(float(origin_y + row) + 0.5) * tile_size
				)
				body.add_child(shape)
				run_start = -1


## --- Consultas para la logica del juego ------------------------------------

func collision_mask_at(tile_x: int, tile_y: int) -> int:
	if matrix.is_empty():
		return 0

	var origin: Dictionary = matrix.get("origin", {})
	var width: int = int(matrix.get("width", 0))
	var height: int = int(matrix.get("height", 0))

	var local_x: int = tile_x - int(origin.get("tileX", 0))
	var local_y: int = tile_y - int(origin.get("tileY", 0))

	if local_x < 0 or local_y < 0 or local_x >= width or local_y >= height:
		return 0

	return int(matrix.get("collision", [])[local_y * width + local_x])


func is_solid_at(tile_x: int, tile_y: int) -> bool:
	return Creador2DGrid.is_solid(collision_mask_at(tile_x, tile_y))
