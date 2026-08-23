extends ParallaxBackground
class_name Creador2DParallax

## Monta las capas de fondo del mundo (Godot 4.x).
##
## Se apoya en el ParallaxBackground nativo de Godot, que ya resuelve el
## desplazamiento y la repeticion: solo hay que traducir el factor `speedX` del
## editor a `motion_scale` y el ancho de la imagen a `motion_mirroring`.
##
## `motion_scale` es exactamente la misma semantica que usa el editor: 0 deja la
## capa clavada a la pantalla y 1 la ancla al mundo.

## Orden de dibujado: lo mas lejano primero.
const KIND_ORDER := {"SKY": 0, "FAR": 1, "MID": 2, "NEAR": 3}


## Crea las capas a partir del bloque `parallax` del export.
func build(layers: Array) -> void:
	clear_layers()

	if layers.is_empty():
		return

	var sorted := layers.duplicate()
	sorted.sort_custom(func(a, b):
		return KIND_ORDER.get(a.get("kind", "MID"), 2) < KIND_ORDER.get(b.get("kind", "MID"), 2)
	)

	for index in sorted.size():
		var info: Dictionary = sorted[index]

		if not info.get("visible", true):
			continue

		var data_url: String = str(info.get("imageUrl", ""))
		if data_url.is_empty():
			continue

		var texture := _decode_data_url(data_url)
		if texture == null:
			push_warning("[Creador2D] No se pudo decodificar la capa \"%s\"." % info.get("name", "?"))
			continue

		_add_layer(info, texture, index)


func clear_layers() -> void:
	for child in get_children():
		if child is ParallaxLayer:
			child.queue_free()


func _add_layer(info: Dictionary, texture: Texture2D, index: int) -> void:
	var layer := ParallaxLayer.new()
	layer.name = "%s_%s" % [info.get("kind", "MID"), info.get("name", index)]

	# motion_scale traduce directamente el factor de parallax del editor.
	layer.motion_scale = Vector2(
		float(info.get("speedX", 0.2)),
		float(info.get("speedY", 0.1))
	)
	layer.motion_offset = Vector2(0.0, float(info.get("offsetY", 0)))

	# motion_mirroring es lo que hace que la capa se repita sin fin: se fija al
	# ancho exacto de la textura, que el editor ya entrego sin costura.
	if info.get("repeatX", true):
		layer.motion_mirroring = Vector2(texture.get_width(), 0.0)

	var sprite := Sprite2D.new()
	sprite.texture = texture
	sprite.centered = false
	sprite.modulate = Color(
		Creador2DGrid.parse_hex_color(str(info.get("tint", "#ffffff"))),
	)
	sprite.modulate.a = float(info.get("opacity", 1.0))
	sprite.z_index = -100 + index

	layer.add_child(sprite)
	add_child(layer)


## Convierte `data:image/png;base64,...` en una textura.
func _decode_data_url(data_url: String) -> Texture2D:
	var comma := data_url.find(",")
	var payload := data_url.substr(comma + 1) if comma >= 0 else data_url

	var bytes := Marshalls.base64_to_raw(payload)
	if bytes.is_empty():
		return null

	var image := Image.new()
	if image.load_png_from_buffer(bytes) != OK:
		return null

	return ImageTexture.create_from_image(image)
