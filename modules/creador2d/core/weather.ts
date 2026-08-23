import type { WeatherSetting, WeatherType, WindDirection } from '../types';

/**
 * ---------------------------------------------------------------------------
 *  Clima en el lienzo
 * ---------------------------------------------------------------------------
 *  Hasta ahora el clima solo existia como configuracion que viajaba al script
 *  exportado. Eso es defendible desde dentro ("el editor no simula fisicas"),
 *  pero inutil desde fuera: quien elige "lluvia" espera ver lluvia, y si no
 *  pasa nada da igual como este justificado — la herramienta no responde.
 *
 *  Esto es una PREVISUALIZACION, no un motor: sirve para juzgar si la
 *  intensidad, el viento y el tinte quedan bien antes de exportar. Los valores
 *  que se ven aqui son los mismos que se incrustan en los scripts de Unity,
 *  Godot y Unreal.
 *
 *  Coste: las particulas se dibujan como segmentos o circulos planos, sin
 *  textura ni mezcla costosa, y el numero se acota (`MAX_PARTICLES`). A
 *  intensidad 1 son 900 trazos por frame, que Canvas 2D resuelve holgado
 *  incluso con ComfyUI ocupando la GPU.
 * ---------------------------------------------------------------------------
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Longitud del trazo (gotas) o radio (copos, motas). */
  size: number;
  /** 0..1; las particulas mas tenues sugieren profundidad. */
  depth: number;
  /** Fase propia para las trayectorias oscilantes de nieve y ceniza. */
  phase: number;
}

const MAX_PARTICLES = 900;

/** Componentes del viento por direccion, en fracciones de la velocidad. */
const WIND_VECTOR: Record<WindDirection, { x: number; y: number }> = {
  NONE: { x: 0, y: 0 },
  DOWN: { x: 0, y: 1 },
  UP: { x: 0, y: -1 },
  LEFT: { x: -1, y: 0.2 },
  RIGHT: { x: 1, y: 0.2 },
  DOWN_LEFT: { x: -0.7, y: 0.7 },
  DOWN_RIGHT: { x: 0.7, y: 0.7 },
};

/** Perfil fisico de cada clima. Es lo que distingue nieve de lluvia. */
interface Profile {
  /** Velocidad base de caida en px/s a intensidad 1. */
  fall: number;
  /** Dispersion de velocidad entre particulas: da sensacion de profundidad. */
  spread: number;
  /** Longitud o radio base del trazo. */
  size: number;
  /** Cuanto oscila lateralmente al caer (0 = recto). */
  sway: number;
  /** Como se dibuja. */
  render: 'streak' | 'flake' | 'mote' | 'ember';
  /** Velo de color sobre toda la escena, 0 = ninguno. */
  haze: number;
  /** Particulas por unidad de area a intensidad 1. */
  density: number;
}

const PROFILES: Record<Exclude<WeatherType, 'NONE'>, Profile> = {
  RAIN: { fall: 1400, spread: 0.35, size: 16, sway: 0, render: 'streak', haze: 0.06, density: 1 },
  STORM: { fall: 1900, spread: 0.3, size: 22, sway: 0, render: 'streak', haze: 0.12, density: 1.3 },
  SNOW: { fall: 90, spread: 0.7, size: 2.6, sway: 26, render: 'flake', haze: 0.05, density: 0.7 },
  DUST: { fall: 60, spread: 0.9, size: 1.8, sway: 40, render: 'mote', haze: 0.14, density: 0.8 },
  ASH: { fall: 70, spread: 0.8, size: 2.2, sway: 30, render: 'mote', haze: 0.16, density: 0.7 },
  LAVA_RAIN: { fall: 520, spread: 0.5, size: 5, sway: 8, render: 'ember', haze: 0.1, density: 0.45 },
  // Niebla y neblina no son precipitacion: son un velo. Casi no llevan
  // particulas, su efecto esta en `haze` y en el gradiente.
  FOG: { fall: 18, spread: 0.6, size: 40, sway: 22, render: 'mote', haze: 0.42, density: 0.12 },
  MIST: { fall: 14, spread: 0.5, size: 28, sway: 18, render: 'mote', haze: 0.24, density: 0.1 },
};

export class WeatherOverlay {
  private particles: Particle[] = [];
  private width = 0;
  private height = 0;
  private lastTime = 0;

  /** Segundos que faltan para el proximo relampago. */
  private nextStrike = 0;
  /** Intensidad del destello actual, 0..1; decae en unas decimas. */
  private flash = 0;

  /** Deja el sistema en reposo: se llama al elegir "Despejado". */
  reset(): void {
    this.particles = [];
    this.flash = 0;
    this.nextStrike = 0;
    this.lastTime = 0;
  }

  /**
   * Dibuja un fotograma. Devuelve `true` si sigue habiendo animacion, para que
   * el bucle del editor sepa que debe pedir otro frame: con el clima apagado el
   * lienzo vuelve a repintarse solo cuando algo cambia.
   */
  draw(
    ctx: CanvasRenderingContext2D,
    weather: WeatherSetting | null,
    now: number,
  ): boolean {
    if (!weather || !weather.enabled || weather.type === 'NONE') {
      if (this.particles.length > 0 || this.flash > 0) {
        this.reset();
      }
      return false;
    }

    const { width, height } = ctx.canvas;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.particles = [];
    }

    // Primer frame tras activar: no hay delta fiable, y usar `now` completo
    // teletransportaria todas las particulas fuera de la pantalla.
    const dt = this.lastTime === 0 ? 1 / 60 : Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const profile = PROFILES[weather.type];
    const intensity = Math.max(0, Math.min(1, weather.intensity));

    this.spawn(profile, intensity, weather);
    this.advance(profile, intensity, weather, dt);
    this.paintHaze(ctx, profile, intensity, weather);
    this.paintParticles(ctx, profile, weather);
    this.paintLightning(ctx, weather, dt);

    return true;
  }

  /** Repone la poblacion hasta la que corresponde a la intensidad actual. */
  private spawn(profile: Profile, intensity: number, weather: WeatherSetting): void {
    const area = (this.width * this.height) / (1280 * 720);
    const target = Math.min(
      MAX_PARTICLES,
      Math.round(profile.density * intensity * 620 * Math.max(0.4, area)),
    );

    if (this.particles.length > target) {
      this.particles.length = target;
      return;
    }

    const wind = WIND_VECTOR[weather.windDirection];
    const windStrength = Math.max(0, Math.min(1, weather.windStrength));

    while (this.particles.length < target) {
      const depth = 0.35 + Math.random() * 0.65;
      const speed = profile.fall * (1 - profile.spread + Math.random() * profile.spread) * depth;

      this.particles.push({
        // Se distribuyen por toda la pantalla al arrancar en vez de caer desde
        // arriba en bloque: de otro modo se ve un telon descendiendo.
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: wind.x * speed * windStrength * 1.2,
        vy: speed * Math.max(0.15, wind.y === 0 ? 1 : wind.y),
        size: profile.size * depth * (0.7 + Math.random() * 0.6),
        depth,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  private advance(
    profile: Profile,
    intensity: number,
    weather: WeatherSetting,
    dt: number,
  ): void {
    const wind = WIND_VECTOR[weather.windDirection];
    const windStrength = Math.max(0, Math.min(1, weather.windStrength));
    const margin = profile.size * 2 + 40;

    for (const p of this.particles) {
      p.phase += dt * 2;

      // El bamboleo solo afecta a lo que cae despacio. Una gota de lluvia no
      // serpentea; un copo si.
      const sway = profile.sway === 0 ? 0 : Math.sin(p.phase) * profile.sway * p.depth;

      p.x += (p.vx + sway + wind.x * 180 * windStrength) * dt;
      p.y += p.vy * dt * (0.5 + intensity * 0.5);

      // Reciclado toroidal: reaparece por el lado contrario al que salio, de
      // modo que la poblacion se mantiene constante sin reasignar memoria.
      if (p.y > this.height + margin) {
        p.y = -margin;
        p.x = Math.random() * this.width;
      } else if (p.y < -margin) {
        p.y = this.height + margin;
        p.x = Math.random() * this.width;
      }

      if (p.x > this.width + margin) {
        p.x = -margin;
      } else if (p.x < -margin) {
        p.x = this.width + margin;
      }
    }
  }

  /** Velo de color: lo que convierte la niebla en niebla. */
  private paintHaze(
    ctx: CanvasRenderingContext2D,
    profile: Profile,
    intensity: number,
    weather: WeatherSetting,
  ): void {
    const density = Math.max(profile.haze * intensity, weather.fogDensity * 0.55);
    if (density <= 0.001) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = Math.min(0.75, density);

    // La niebla se acumula hacia abajo, donde esta el suelo; arriba clarea.
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, withAlpha(weather.tint, 0.35));
    gradient.addColorStop(1, withAlpha(weather.tint, 1));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  }

  private paintParticles(
    ctx: CanvasRenderingContext2D,
    profile: Profile,
    weather: WeatherSetting,
  ): void {
    ctx.save();

    if (profile.render === 'streak') {
      ctx.strokeStyle = weather.tint;
      ctx.lineCap = 'round';

      for (const p of this.particles) {
        // El trazo sigue la direccion real de la gota, no una vertical fija:
        // con viento lateral las lineas se inclinan solas.
        const length = p.size;
        const norm = Math.hypot(p.vx, p.vy) || 1;
        const dx = (p.vx / norm) * length;
        const dy = (p.vy / norm) * length;

        ctx.globalAlpha = 0.25 + p.depth * 0.5;
        ctx.lineWidth = Math.max(0.6, p.depth * 1.6);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - dx, p.y - dy);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (profile.render === 'ember') {
      for (const p of this.particles) {
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.2);
        glow.addColorStop(0, withAlpha(weather.tint, 0.9));
        glow.addColorStop(1, withAlpha(weather.tint, 0));
        ctx.globalAlpha = 0.4 + p.depth * 0.6;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    // Copos y motas: circulos planos, con la opacidad marcando la distancia.
    ctx.fillStyle = weather.tint;
    for (const p of this.particles) {
      ctx.globalAlpha = (profile.render === 'mote' ? 0.1 : 0.35) + p.depth * 0.45;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Relampagos. No son una particula mas: el destello ilumina la escena entera
   * durante una fraccion de segundo, por eso se pinta como un flash a pantalla
   * completa con caida rapida.
   */
  private paintLightning(
    ctx: CanvasRenderingContext2D,
    weather: WeatherSetting,
    dt: number,
  ): void {
    const active = weather.lightning || weather.type === 'STORM';

    if (!active) {
      this.flash = 0;
      return;
    }

    this.nextStrike -= dt;

    if (this.nextStrike <= 0) {
      // Jitter amplio: una cadencia exacta se percibe como un parpadeo
      // mecanico, no como una tormenta.
      const mean = Math.max(1, weather.lightningEvery);
      this.nextStrike = mean * (0.45 + Math.random() * 1.1);
      this.flash = 1;
    }

    if (this.flash <= 0) {
      return;
    }

    // Doble destello: el rayo real casi siempre tiene un repique.
    const curve = this.flash > 0.75 ? 1 : this.flash * (0.55 + 0.45 * Math.sin(this.flash * 24));

    ctx.save();
    ctx.globalAlpha = Math.max(0, curve) * 0.55;
    ctx.fillStyle = weather.lightningTint;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();

    this.flash = Math.max(0, this.flash - dt * 3.2);
  }
}

/** Convierte "#rrggbb" en rgba con la opacidad pedida. */
function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return `rgba(159, 180, 199, ${alpha})`;
  }
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
