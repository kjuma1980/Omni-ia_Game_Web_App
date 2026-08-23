import { FluidSetting, WeatherSetting, World } from '@prisma/client';

/**
 * ---------------------------------------------------------------------------
 *  Generacion de scripts de runtime
 * ---------------------------------------------------------------------------
 *  Al exportar un mundo que tiene clima o fluidos animados se emite, ademas de
 *  los datos, el script nativo que reproduce ese efecto en cada motor. Los
 *  valores configurados en el editor quedan incrustados como constantes: el
 *  usuario arrastra el script y funciona, sin tener que reconfigurar nada.
 *
 *  Se generan como texto y no se compilan aqui: el backend no conoce la version
 *  del motor de destino, asi que produce codigo idiomatico y legible que el
 *  desarrollador puede leer y ajustar.
 * ---------------------------------------------------------------------------
 */

export type Engine = 'unity' | 'godot' | 'unreal';

export interface GeneratedScript {
  filename: string;
  language: string;
  contents: string;
}

/** Vector unitario de caida segun la direccion del viento. */
function windVector(direction: string): { x: number; y: number } {
  const diagonal = Math.SQRT1_2;

  switch (direction) {
    case 'DOWN':
      return { x: 0, y: -1 };
    case 'UP':
      return { x: 0, y: 1 };
    case 'LEFT':
      return { x: -1, y: 0 };
    case 'RIGHT':
      return { x: 1, y: 0 };
    case 'DOWN_LEFT':
      return { x: -diagonal, y: -diagonal };
    case 'DOWN_RIGHT':
      return { x: diagonal, y: -diagonal };
    default:
      return { x: 0, y: 0 };
  }
}

/** Caracteristicas fisicas de cada tipo de precipitacion. */
function weatherProfile(type: string): {
  fallSpeed: number;
  size: number;
  drag: number;
  isVolumetric: boolean;
  description: string;
} {
  switch (type) {
    case 'RAIN':
      return { fallSpeed: 14, size: 0.08, drag: 0.02, isVolumetric: false, description: 'lluvia' };
    case 'SNOW':
      return { fallSpeed: 1.6, size: 0.14, drag: 0.55, isVolumetric: false, description: 'nieve' };
    case 'DUST':
      return { fallSpeed: 0.8, size: 0.1, drag: 0.7, isVolumetric: false, description: 'polvo' };
    case 'ASH':
      return { fallSpeed: 1.1, size: 0.12, drag: 0.6, isVolumetric: false, description: 'ceniza' };
    case 'LAVA_RAIN':
      return { fallSpeed: 9, size: 0.2, drag: 0.05, isVolumetric: false, description: 'lluvia de lava' };
    case 'FOG':
      return { fallSpeed: 0.15, size: 2.5, drag: 0.9, isVolumetric: true, description: 'niebla' };
    case 'MIST':
      return { fallSpeed: 0.1, size: 1.8, drag: 0.92, isVolumetric: true, description: 'neblina' };
    case 'STORM':
      // Como la lluvia pero mas violenta; los relampagos van aparte porque no
      // son particulas: iluminan la escena entera.
      return { fallSpeed: 15, size: 0.1, drag: 0.02, isVolumetric: false, description: 'tormenta electrica' };
    default:
      return { fallSpeed: 0, size: 0, drag: 0, isVolumetric: false, description: 'sin clima' };
  }
}

function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  const num = parseInt(value.length === 3 ? value.repeat(2) : value, 16);
  return {
    r: Number((((num >> 16) & 0xff) / 255).toFixed(3)),
    g: Number((((num >> 8) & 0xff) / 255).toFixed(3)),
    b: Number(((num & 0xff) / 255).toFixed(3)),
  };
}

function flowVector(flow: string): { x: number; y: number } {
  switch (flow) {
    case 'LEFT':
      return { x: -1, y: 0 };
    case 'RIGHT':
      return { x: 1, y: 0 };
    case 'UP':
      return { x: 0, y: -1 };
    case 'DOWN':
      return { x: 0, y: 1 };
    default:
      return { x: 0, y: 0 };
  }
}

// ---------------------------------------------------------------------------
//  CLIMA
// ---------------------------------------------------------------------------

export function weatherScript(
  engine: Engine,
  world: Pick<World, 'name' | 'slug'>,
  weather: WeatherSetting,
): GeneratedScript | null {
  if (!weather.enabled || weather.type === 'NONE') {
    return null;
  }

  const profile = weatherProfile(weather.type);
  const wind = windVector(weather.windDirection);
  const tint = hexToRgb01(weather.tint);
  const rate = Math.round(weather.emissionRate * weather.intensity);
  // Los relampagos no son particulas: el destello ilumina la escena entera, asi
  // que se generan como un componente aparte que actua sobre la iluminacion.
  const lightning = weather.lightning || weather.type === 'STORM';
  const strikeEvery = Number(weather.lightningEvery.toFixed(2));
  const strikeTint = hexToRgb01(weather.lightningTint);

  // Deriva total: la caida propia mas el empuje del viento.
  const driftX = Number((wind.x * weather.windStrength * profile.fallSpeed).toFixed(3));
  const driftY = Number(((wind.y || -1) * profile.fallSpeed).toFixed(3));

  const header = [
    `Clima generado automaticamente por el Creador 2D de Omni IA Game.`,
    `Mundo: ${world.name} (${world.slug})`,
    `Efecto: ${profile.description} | intensidad ${weather.intensity} | viento ${weather.windDirection} (${weather.windStrength})`,
    `Regenerar este archivo al cambiar el clima en el editor: los valores estan incrustados.`,
  ];

  if (engine === 'unity') {
    return {
      filename: 'Creador2DWeather.cs',
      language: 'csharp',
      contents: `using UnityEngine;

/// <summary>
/// ${header.join('\n/// ')}
/// </summary>
[RequireComponent(typeof(ParticleSystem))]
public class Creador2DWeather : MonoBehaviour
{
    // --- Valores incrustados desde el editor ---
    public const float Intensity = ${weather.intensity}f;
    public const float WindStrength = ${weather.windStrength}f;
    public const float FogDensity = ${weather.fogDensity}f;

    static readonly Vector2 Drift = new Vector2(${driftX}f, ${driftY}f);
    static readonly Color Tint = new Color(${tint.r}f, ${tint.g}f, ${tint.b}f, 1f);

    [Tooltip("Area cubierta por el emisor, en unidades de mundo.")]
    public Vector2 emitterSize = new Vector2(40f, 24f);

    ParticleSystem _system;

    void Awake()
    {
        _system = GetComponent<ParticleSystem>();
        Configure();
    }

    void Configure()
    {
        var main = _system.main;
        main.startSpeed = ${profile.fallSpeed}f;
        main.startSize = ${profile.size}f;
        main.startColor = Tint;
        main.simulationSpace = ParticleSystemSimulationSpace.World;
        main.maxParticles = ${Math.max(200, rate * 4)};
${profile.isVolumetric ? '        main.startLifetime = 12f;' : '        main.startLifetime = 4f;'}

        var emission = _system.emission;
        emission.rateOverTime = ${rate}f;

        var shape = _system.shape;
        shape.shapeType = ParticleSystemShapeType.Box;
        shape.scale = new Vector3(emitterSize.x, 0.1f, emitterSize.y);

        // El viento se aplica como fuerza constante: asi la deriva se ve tanto
        // en las particulas nuevas como en las que ya estan cayendo.
        var force = _system.forceOverLifetime;
        force.enabled = true;
        force.space = ParticleSystemSimulationSpace.World;
        force.x = new ParticleSystem.MinMaxCurve(Drift.x);
        force.y = new ParticleSystem.MinMaxCurve(Drift.y);

        var limit = _system.limitVelocityOverLifetime;
        limit.enabled = ${profile.drag > 0.3 ? 'true' : 'false'};
        limit.dampen = ${profile.drag}f;
    }

    /// <summary>Cambia la intensidad en caliente (0 = despejado, 1 = tormenta).</summary>
    public void SetIntensity(float intensity)
    {
        var emission = _system.emission;
        emission.rateOverTime = ${weather.emissionRate}f * Mathf.Clamp01(intensity);
    }
}
${
        lightning
          ? `
/// <summary>
/// Relampagos. Se anade a cualquier objeto de la escena; no necesita el sistema
/// de particulas. El destello se pinta como un velo a pantalla completa con
/// caida rapida y repique, porque un rayo real casi nunca es un solo golpe.
///
/// La cadencia es una MEDIA con margen aleatorio: un intervalo exacto se
/// percibe como un parpadeo mecanico, no como una tormenta.
/// </summary>
public class Creador2DLightning : MonoBehaviour
{
    public const float StrikeEvery = ${strikeEvery}f;
    static readonly Color StrikeTint =
        new Color(${strikeTint.r}f, ${strikeTint.g}f, ${strikeTint.b}f, 1f);

    [Tooltip("Orden de dibujo del velo: por encima de todo el escenario.")]
    public int sortingOrder = 900;

    SpriteRenderer _veil;
    float _nextStrike;
    float _flash;

    void Awake()
    {
        var veilObject = new GameObject("Creador2DLightningVeil");
        veilObject.transform.SetParent(transform, false);

        _veil = veilObject.AddComponent<SpriteRenderer>();
        _veil.sprite = Sprite.Create(
            Texture2D.whiteTexture, new Rect(0f, 0f, 1f, 1f), new Vector2(0.5f, 0.5f));
        _veil.color = new Color(StrikeTint.r, StrikeTint.g, StrikeTint.b, 0f);
        _veil.sortingOrder = sortingOrder;

        ScheduleNext();
    }

    void LateUpdate()
    {
        // El velo sigue a la camara y cubre su encuadre completo.
        var cam = Camera.main;
        if (cam != null)
        {
            var height = cam.orthographicSize * 2f;
            _veil.transform.position = new Vector3(
                cam.transform.position.x, cam.transform.position.y, cam.transform.position.z + 1f);
            _veil.transform.localScale = new Vector3(height * cam.aspect, height, 1f);
        }

        _nextStrike -= Time.deltaTime;
        if (_nextStrike <= 0f)
        {
            _flash = 1f;
            ScheduleNext();
        }

        if (_flash > 0f)
        {
            var curve = _flash > 0.75f
                ? 1f
                : _flash * (0.55f + 0.45f * Mathf.Sin(_flash * 24f));

            var colour = _veil.color;
            colour.a = Mathf.Max(0f, curve) * 0.55f;
            _veil.color = colour;

            _flash = Mathf.Max(0f, _flash - Time.deltaTime * 3.2f);
        }
    }

    void ScheduleNext()
    {
        _nextStrike = StrikeEvery * Random.Range(0.45f, 1.55f);
    }
}
`
          : ''
      }`,
    };
  }

  if (engine === 'godot') {
    return {
      filename: 'creador2d_weather.gd',
      language: 'gdscript',
      contents: `extends GPUParticles2D
## ${header.join('\n## ')}

# --- Valores incrustados desde el editor ---
const INTENSITY: float = ${weather.intensity}
const WIND_STRENGTH: float = ${weather.windStrength}
const FOG_DENSITY: float = ${weather.fogDensity}
const DRIFT := Vector2(${driftX}, ${-driftY})
const TINT := Color(${tint.r}, ${tint.g}, ${tint.b})

## Area cubierta por el emisor, en pixeles.
@export var emitter_size := Vector2(1280, 720)


func _ready() -> void:
	_configure()${lightning ? '\n\t_setup_lightning()' : ''}


func _configure() -> void:
	amount = ${Math.max(50, rate)}
	lifetime = ${profile.isVolumetric ? '12.0' : '4.0'}
	preprocess = 1.0
	local_coords = false

	var material := ParticleProcessMaterial.new()
	material.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	material.emission_box_extents = Vector3(emitter_size.x * 0.5, 4.0, 1.0)

	# En Godot 2D el eje Y crece hacia abajo: la caida es Y positivo.
	material.direction = Vector3(DRIFT.x, 1.0, 0.0)
	material.spread = ${profile.isVolumetric ? 35.0 : 6.0}
	material.initial_velocity_min = ${(profile.fallSpeed * 8).toFixed(1)}
	material.initial_velocity_max = ${(profile.fallSpeed * 12).toFixed(1)}

	# El viento es una gravedad lateral constante.
	material.gravity = Vector3(DRIFT.x * 60.0, ${(profile.fallSpeed * 20).toFixed(1)}, 0.0)
	material.damping_min = ${(profile.drag * 10).toFixed(2)}
	material.damping_max = ${(profile.drag * 20).toFixed(2)}
	material.scale_min = ${(profile.size * 6).toFixed(2)}
	material.scale_max = ${(profile.size * 10).toFixed(2)}
	material.color = TINT

	process_material = material
	emitting = true


## Cambia la intensidad en caliente (0 = despejado, 1 = tormenta).
func set_intensity(value: float) -> void:
	amount = int(${weather.emissionRate} * clampf(value, 0.0, 1.0))
${
        lightning
          ? `
# --- Relampagos -------------------------------------------------------------
# No son particulas: el destello ilumina la escena entera. Se resuelve con un
# CanvasLayer propio y un ColorRect a pantalla completa, de modo que funciona
# igual con iluminacion 2D o sin ella.
#
# La cadencia es una MEDIA con margen aleatorio: un intervalo exacto se percibe
# como un parpadeo mecanico, no como una tormenta.

const STRIKE_EVERY: float = ${strikeEvery}
const STRIKE_TINT := Color(${strikeTint.r}, ${strikeTint.g}, ${strikeTint.b}, 1.0)

var _veil: ColorRect
var _next_strike: float = 0.0
var _flash: float = 0.0


func _setup_lightning() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 90
	add_child(layer)

	_veil = ColorRect.new()
	_veil.color = Color(STRIKE_TINT.r, STRIKE_TINT.g, STRIKE_TINT.b, 0.0)
	_veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_veil.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(_veil)

	_schedule_next_strike()


func _schedule_next_strike() -> void:
	_next_strike = STRIKE_EVERY * randf_range(0.45, 1.55)


func _process(delta: float) -> void:
	if _veil == null:
		return

	_next_strike -= delta
	if _next_strike <= 0.0:
		_flash = 1.0
		_schedule_next_strike()

	if _flash > 0.0:
		# Doble destello: el rayo real casi siempre tiene un repique.
		var curve := 1.0 if _flash > 0.75 else _flash * (0.55 + 0.45 * sin(_flash * 24.0))
		_veil.color.a = maxf(0.0, curve) * 0.55
		_flash = maxf(0.0, _flash - delta * 3.2)
`
          : ''
      }`,
    };
  }

  return {
    filename: 'Creador2DWeather.h',
    language: 'cpp',
    contents: `#pragma once

/**
 * ${header.join('\n * ')}
 */

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Particles/ParticleSystemComponent.h"${lightning ? '\n#include "Components/DirectionalLightComponent.h"' : ''}
#include "Creador2DWeather.generated.h"

UCLASS(Blueprintable)
class ACreador2DWeather : public AActor
{
    GENERATED_BODY()

public:
    ACreador2DWeather()
    {
        PrimaryActorTick.bCanEverTick = true;
        Particles = CreateDefaultSubobject<UParticleSystemComponent>(TEXT("Weather"));
        RootComponent = Particles;
    }

    // --- Valores incrustados desde el editor ---
    static constexpr float Intensity = ${weather.intensity}f;
    static constexpr float WindStrength = ${weather.windStrength}f;
    static constexpr float FogDensity = ${weather.fogDensity}f;
    static constexpr float EmissionRate = ${rate}.0f;

    /** Deriva total: caida propia mas empuje del viento (X derecha, Z arriba). */
    UPROPERTY(EditAnywhere, Category = "Creador2D|Clima")
    FVector Drift = FVector(${driftX}f, 0.0f, ${driftY}f);

    UPROPERTY(EditAnywhere, Category = "Creador2D|Clima")
    FLinearColor Tint = FLinearColor(${tint.r}f, ${tint.g}f, ${tint.b}f, 1.0f);

    UPROPERTY(EditAnywhere, Category = "Creador2D|Clima")
    FVector2D EmitterSize = FVector2D(4000.0f, 2400.0f);

    UPROPERTY(VisibleAnywhere, Category = "Creador2D|Clima")
    UParticleSystemComponent* Particles;

    virtual void BeginPlay() override
    {
        Super::BeginPlay();

        if (!Particles)
        {
            return;
        }

        // Los parametros se exponen al material del sistema de particulas para
        // que un artista pueda seguir ajustandolos sin tocar el codigo.
        Particles->SetFloatParameter(TEXT("SpawnRate"), EmissionRate);
        Particles->SetFloatParameter(TEXT("ParticleSize"), ${profile.size}f);
        Particles->SetFloatParameter(TEXT("Drag"), ${profile.drag}f);
        Particles->SetVectorParameter(TEXT("Drift"), Drift);
        Particles->SetColorParameter(TEXT("Tint"), Tint);
        Particles->SetFloatParameter(TEXT("FogDensity"), FogDensity);
        Particles->ActivateSystem();
    }

    /** Cambia la intensidad en caliente (0 = despejado, 1 = tormenta). */
    UFUNCTION(BlueprintCallable, Category = "Creador2D|Clima")
    void SetIntensity(float NewIntensity)
    {
        if (Particles)
        {
            Particles->SetFloatParameter(
                TEXT("SpawnRate"),
                ${weather.emissionRate}.0f * FMath::Clamp(NewIntensity, 0.0f, 1.0f));
        }
    }
};
${
    lightning
      ? `
/**
 * Relampagos. No son particulas: el destello ilumina la escena entera, asi que
 * se resuelve con una luz direccional propia que pulsa.
 *
 * La cadencia es una MEDIA con margen aleatorio; un intervalo exacto se percibe
 * como un parpadeo mecanico, no como una tormenta.
 */
UCLASS(Blueprintable)
class ACreador2DLightning : public AActor
{
    GENERATED_BODY()

public:
    ACreador2DLightning()
    {
        PrimaryActorTick.bCanEverTick = true;

        Flash = CreateDefaultSubobject<UDirectionalLightComponent>(TEXT("Flash"));
        RootComponent = Flash;
        Flash->SetIntensity(0.0f);
        Flash->SetCastShadows(false);
    }

    static constexpr float StrikeEvery = ${strikeEvery}f;

    UPROPERTY(EditAnywhere, Category = "Creador2D|Clima")
    FLinearColor StrikeTint =
        FLinearColor(${strikeTint.r}f, ${strikeTint.g}f, ${strikeTint.b}f, 1.0f);

    /** Intensidad de la luz en el pico del destello, en lux. */
    UPROPERTY(EditAnywhere, Category = "Creador2D|Clima")
    float PeakIntensity = 12.0f;

    UPROPERTY(VisibleAnywhere, Category = "Creador2D|Clima")
    UDirectionalLightComponent* Flash;

    virtual void BeginPlay() override
    {
        Super::BeginPlay();
        Flash->SetLightColor(StrikeTint);
        ScheduleNext();
    }

    virtual void Tick(float DeltaSeconds) override
    {
        Super::Tick(DeltaSeconds);

        NextStrike -= DeltaSeconds;
        if (NextStrike <= 0.0f)
        {
            FlashLevel = 1.0f;
            ScheduleNext();
        }

        if (FlashLevel > 0.0f)
        {
            // Doble destello: el rayo real casi siempre tiene un repique.
            const float Curve = FlashLevel > 0.75f
                ? 1.0f
                : FlashLevel * (0.55f + 0.45f * FMath::Sin(FlashLevel * 24.0f));

            Flash->SetIntensity(FMath::Max(0.0f, Curve) * PeakIntensity);
            FlashLevel = FMath::Max(0.0f, FlashLevel - DeltaSeconds * 3.2f);
        }
    }

private:
    float NextStrike = 0.0f;
    float FlashLevel = 0.0f;

    void ScheduleNext()
    {
        NextStrike = StrikeEvery * FMath::FRandRange(0.45f, 1.55f);
    }
};
`
      : ''
  }`,
  };
}

// ---------------------------------------------------------------------------
//  FLUIDOS
// ---------------------------------------------------------------------------

type FluidWithKey = Pick<
  FluidSetting,
  'blockKey' | 'flow' | 'speed' | 'waveHeight' | 'bubbles' | 'bubbleRate'
>;

export function fluidScript(
  engine: Engine,
  world: Pick<World, 'name' | 'slug'>,
  fluids: FluidWithKey[],
): GeneratedScript | null {
  if (fluids.length === 0) {
    return null;
  }

  const header = [
    `Fluidos animados generados automaticamente por el Creador 2D de Omni IA Game.`,
    `Mundo: ${world.name} (${world.slug})`,
    `El desplazamiento de la textura y las burbujas usan los valores del editor.`,
  ];

  const rows = fluids.map((fluid) => {
    const vector = flowVector(fluid.flow);
    return {
      key: fluid.blockKey,
      x: Number((vector.x * fluid.speed).toFixed(3)),
      y: Number((vector.y * fluid.speed).toFixed(3)),
      wave: fluid.waveHeight,
      bubbles: fluid.bubbles,
      bubbleRate: fluid.bubbleRate,
    };
  });

  if (engine === 'unity') {
    const entries = rows
      .map(
        (row) =>
          `        { "${row.key}", new FluidProfile(new Vector2(${row.x}f, ${row.y}f), ${row.wave}f, ${row.bubbles ? 'true' : 'false'}, ${row.bubbleRate}) },`,
      )
      .join('\n');

    return {
      filename: 'Creador2DFluids.cs',
      language: 'csharp',
      contents: `using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// ${header.join('\n/// ')}
/// </summary>
public class Creador2DFluids : MonoBehaviour
{
    public readonly struct FluidProfile
    {
        public readonly Vector2 Flow;
        public readonly float WaveHeight;
        public readonly bool Bubbles;
        public readonly int BubbleRate;

        public FluidProfile(Vector2 flow, float waveHeight, bool bubbles, int bubbleRate)
        {
            Flow = flow;
            WaveHeight = waveHeight;
            Bubbles = bubbles;
            BubbleRate = bubbleRate;
        }
    }

    /// <summary>Perfil por clave de bloque, tal y como se configuro en el editor.</summary>
    public static readonly Dictionary<string, FluidProfile> Profiles = new Dictionary<string, FluidProfile>
    {
${entries}
    };

    [Tooltip("Clave del bloque de fluido que anima este objeto.")]
    public string blockKey = "${rows[0].key}";

    Renderer _renderer;
    MaterialPropertyBlock _block;
    FluidProfile _profile;
    float _time;

    void Awake()
    {
        _renderer = GetComponent<Renderer>();
        _block = new MaterialPropertyBlock();

        if (!Profiles.TryGetValue(blockKey, out _profile))
        {
            enabled = false;
        }
    }

    void Update()
    {
        _time += Time.deltaTime;

        // Desplazamiento continuo de la textura: es lo que da la sensacion de
        // corriente sin mover la geometria.
        Vector2 offset = _profile.Flow * _time;
        offset.y += Mathf.Sin(_time * 2f) * _profile.WaveHeight * 0.1f;

        _renderer.GetPropertyBlock(_block);
        _block.SetVector("_MainTex_ST", new Vector4(1f, 1f, offset.x, offset.y));
        _renderer.SetPropertyBlock(_block);
    }

    /// <summary>Particulas ascendentes; propio de la lava.</summary>
    public bool WantsBubbles => _profile.Bubbles;
    public int BubblesPerSecond => _profile.BubbleRate;
}
`,
    };
  }

  if (engine === 'godot') {
    const entries = rows
      .map(
        (row) =>
          `\t"${row.key}": {"flow": Vector2(${row.x}, ${row.y}), "wave": ${row.wave}, "bubbles": ${row.bubbles}, "bubble_rate": ${row.bubbleRate}},`,
      )
      .join('\n');

    return {
      filename: 'creador2d_fluids.gd',
      language: 'gdscript',
      contents: `extends Node2D
## ${header.join('\n## ')}

## Perfil por clave de bloque, tal y como se configuro en el editor.
const PROFILES := {
${entries}
}

@export var block_key: String = "${rows[0].key}"

var _time: float = 0.0
var _profile: Dictionary = {}
var _material: ShaderMaterial


func _ready() -> void:
	_profile = PROFILES.get(block_key, {})
	if _profile.is_empty():
		set_process(false)
		return

	# El desplazamiento se aplica sobre el material; si no hay shader asignado
	# el nodo sigue vivo pero no anima, en lugar de fallar.
	var sprite := get_node_or_null("Sprite2D")
	if sprite and sprite.material is ShaderMaterial:
		_material = sprite.material


func _process(delta: float) -> void:
	_time += delta

	var flow: Vector2 = _profile["flow"]
	var offset := flow * _time
	offset.y += sin(_time * 2.0) * float(_profile["wave"]) * 0.1

	if _material:
		_material.set_shader_parameter("uv_offset", offset)


func wants_bubbles() -> bool:
	return bool(_profile.get("bubbles", false))


func bubbles_per_second() -> int:
	return int(_profile.get("bubble_rate", 0))
`,
    };
  }

  const entries = rows
    .map(
      (row) =>
        `        Profiles.Add(TEXT("${row.key}"), FCreador2DFluidProfile(FVector2D(${row.x}f, ${row.y}f), ${row.wave}f, ${row.bubbles}, ${row.bubbleRate}));`,
    )
    .join('\n');

  return {
    filename: 'Creador2DFluids.h',
    language: 'cpp',
    contents: `#pragma once

/**
 * ${header.join('\n * ')}
 */

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Components/StaticMeshComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Creador2DFluids.generated.h"

USTRUCT(BlueprintType)
struct FCreador2DFluidProfile
{
    GENERATED_BODY()

    UPROPERTY(BlueprintReadOnly) FVector2D Flow = FVector2D::ZeroVector;
    UPROPERTY(BlueprintReadOnly) float WaveHeight = 0.0f;
    UPROPERTY(BlueprintReadOnly) bool bBubbles = false;
    UPROPERTY(BlueprintReadOnly) int32 BubbleRate = 0;

    FCreador2DFluidProfile() {}
    FCreador2DFluidProfile(FVector2D InFlow, float InWave, bool InBubbles, int32 InRate)
        : Flow(InFlow), WaveHeight(InWave), bBubbles(InBubbles), BubbleRate(InRate) {}
};

UCLASS(Blueprintable)
class ACreador2DFluids : public AActor
{
    GENERATED_BODY()

public:
    ACreador2DFluids()
    {
        PrimaryActorTick.bCanEverTick = true;
${entries}
    }

    /** Perfil por clave de bloque, tal y como se configuro en el editor. */
    TMap<FString, FCreador2DFluidProfile> Profiles;

    UPROPERTY(EditAnywhere, Category = "Creador2D|Fluidos")
    FString BlockKey = TEXT("${rows[0].key}");

    UPROPERTY(EditAnywhere, Category = "Creador2D|Fluidos")
    UStaticMeshComponent* Surface;

    virtual void BeginPlay() override
    {
        Super::BeginPlay();

        if (const FCreador2DFluidProfile* Found = Profiles.Find(BlockKey))
        {
            Profile = *Found;
        }

        if (Surface)
        {
            Dynamic = Surface->CreateAndSetMaterialInstanceDynamic(0);
        }
    }

    virtual void Tick(float DeltaSeconds) override
    {
        Super::Tick(DeltaSeconds);
        Time += DeltaSeconds;

        if (!Dynamic)
        {
            return;
        }

        // Desplazamiento continuo de la textura mas una ondulacion vertical.
        const float OffsetX = Profile.Flow.X * Time;
        const float OffsetY = Profile.Flow.Y * Time
            + FMath::Sin(Time * 2.0f) * Profile.WaveHeight * 0.1f;

        Dynamic->SetScalarParameterValue(TEXT("UVOffsetX"), OffsetX);
        Dynamic->SetScalarParameterValue(TEXT("UVOffsetY"), OffsetY);
    }

    UFUNCTION(BlueprintPure, Category = "Creador2D|Fluidos")
    bool WantsBubbles() const { return Profile.bBubbles; }

    UFUNCTION(BlueprintPure, Category = "Creador2D|Fluidos")
    int32 BubblesPerSecond() const { return Profile.BubbleRate; }

private:
    FCreador2DFluidProfile Profile;
    UMaterialInstanceDynamic* Dynamic = nullptr;
    float Time = 0.0f;
};
`,
  };
}
