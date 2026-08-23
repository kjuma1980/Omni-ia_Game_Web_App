extends Node
class_name Creador2DClient

## Cliente HTTP del Creador 2D para Godot 4.x.
##
## Usa el token de servicio que genera el editor web (panel "Motores y
## exportacion"). Ese token es de SOLO LECTURA y caduca a las 12 horas: el motor
## nunca maneja la clave del usuario ni puede escribir en el mundo.

signal matrix_received(matrix: Dictionary)
signal collision_received(collision: Dictionary)
signal request_failed(message: String)

@export var api_url: String = "http://127.0.0.1:4310"
@export var engine_token: String = ""

var _http: HTTPRequest


func _ready() -> void:
	_http = HTTPRequest.new()
	# Un mundo grande puede superar el limite por defecto del cuerpo de
	# respuesta; se usa modo fichero-a-memoria sin limite artificial.
	_http.use_threads = true
	_http.timeout = 60.0
	add_child(_http)


func _headers() -> PackedStringArray:
	return PackedStringArray([
		"Authorization: Bearer %s" % engine_token,
		"Accept: application/json",
	])


func _base() -> String:
	return api_url.rstrip("/")


## Comprueba que el servicio responde antes de descargar nada.
func check_health() -> Dictionary:
	var error := _http.request("%s/api/health" % _base(), PackedStringArray(), HTTPClient.METHOD_GET)
	if error != OK:
		request_failed.emit("No se pudo iniciar la peticion de salud (%d)" % error)
		return {}

	var response: Array = await _http.request_completed
	return _parse(response, "health")


## Descarga la matriz absoluta del mundo: una rejilla rectangular ya
## ensamblada, sin necesidad de reconstruir los chunks.
func fetch_matrix(world_id: String) -> Dictionary:
	if engine_token.is_empty():
		request_failed.emit("Falta el token de motor")
		return {}

	var url := "%s/api/worlds/%s/export/matrix" % [_base(), world_id]
	var error := _http.request(url, _headers(), HTTPClient.METHOD_GET)
	if error != OK:
		request_failed.emit("No se pudo iniciar la peticion (%d)" % error)
		return {}

	var response: Array = await _http.request_completed
	var matrix := _parse(response, "matriz")

	if matrix.is_empty():
		return {}

	if matrix.get("format", "") != "creador2d.matrix.v1":
		request_failed.emit("La respuesta no tiene el formato creador2d.matrix.v1")
		return {}

	matrix_received.emit(matrix)
	return matrix


## Solo la matriz logica de colisiones, sin datos visuales.
func fetch_collision(world_id: String) -> Dictionary:
	var url := "%s/api/worlds/%s/export/collision" % [_base(), world_id]
	var error := _http.request(url, _headers(), HTTPClient.METHOD_GET)
	if error != OK:
		request_failed.emit("No se pudo iniciar la peticion (%d)" % error)
		return {}

	var response: Array = await _http.request_completed
	var payload := _parse(response, "colisiones")

	if not payload.is_empty():
		collision_received.emit(payload)

	return payload


func _parse(response: Array, what: String) -> Dictionary:
	var result: int = response[0]
	var code: int = response[1]
	var body: PackedByteArray = response[3]

	if result != HTTPRequest.RESULT_SUCCESS:
		request_failed.emit("Fallo de red al pedir %s (resultado %d)" % [what, result])
		return {}

	if code < 200 or code >= 300:
		request_failed.emit("El servidor devolvio %d al pedir %s" % [code, what])
		return {}

	var json := JSON.new()
	if json.parse(body.get_string_from_utf8()) != OK:
		request_failed.emit("Respuesta de %s ilegible: %s" % [what, json.get_error_message()])
		return {}

	if typeof(json.data) != TYPE_DICTIONARY:
		request_failed.emit("Respuesta de %s con forma inesperada" % what)
		return {}

	return json.data
