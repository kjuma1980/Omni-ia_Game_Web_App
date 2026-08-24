import React from 'react';
import { CloudRain, Droplets, Wind, Zap } from 'lucide-react';
import { useFluidSettings, useUpdateWeather, useUpsertFluid, useWeather } from '../api/hooks';
import { useEditorStore } from '../state/editorStore';
import { Help } from './Help';
import {
  FLOW_LABEL,
  WEATHER_LABEL,
  WIND_LABEL,
  type FluidFlow,
  type WeatherType,
  type WindDirection,
} from '../types';

interface Props {
  worldId: string;
}

const WEATHER_TYPES: WeatherType[] = [
  'NONE',
  'RAIN',
  'STORM',
  'SNOW',
  'DUST',
  'ASH',
  'LAVA_RAIN',
  'FOG',
  'MIST',
];

/**
 * Tinte por defecto de cada efecto. Elegir "nieve" y ver caer gotas grises no
 * es una previsualizacion util: el color forma parte del efecto, y esperar a
 * que el usuario lo ajuste a mano convierte cada cambio en dos pasos.
 */
const DEFAULT_TINT: Record<WeatherType, string> = {
  NONE: '#9fb4c7',
  RAIN: '#9fc4e0',
  STORM: '#7fa8cc',
  SNOW: '#f2f7fb',
  DUST: '#c9b184',
  ASH: '#9a938c',
  LAVA_RAIN: '#ff7a2f',
  FOG: '#b8c4cf',
  MIST: '#cfdae4',
};

/** Disposicion de la rosa de viento; el centro es "sin viento". */
const WIND_GRID: Array<WindDirection | null> = [
  null,
  'UP',
  null,
  'LEFT',
  'NONE',
  'RIGHT',
  'DOWN_LEFT',
  'DOWN',
  'DOWN_RIGHT',
];

const FLOWS: FluidFlow[] = ['STILL', 'LEFT', 'RIGHT', 'UP', 'DOWN'];

/**
 * Clima y fluidos animados.
 *
 * Elegir un efecto lo enciende en el lienzo de inmediato, y "Despejado" lo
 * apaga: los mismos valores que se ven aqui son los que se incrustan en el
 * script nativo de Unity, Godot o Unreal al exportar. Antes solo se guardaban,
 * y el panel parecia averiado.
 */
export const WeatherPanel: React.FC<Props> = ({ worldId }) => {
  const weatherQuery = useWeather(worldId);
  const updateWeather = useUpdateWeather(worldId);
  const fluidsQuery = useFluidSettings(worldId);
  const upsertFluid = useUpsertFluid(worldId);
  const pushToast = useEditorStore((state) => state.pushToast);

  const weather = weatherQuery.data;

  const patch = (data: Record<string, unknown>) => {
    updateWeather.mutate(data, {
      onError: (error) => pushToast('error', (error as Error).message),
    });
  };

  const patchFluid = (blockKey: string, data: Record<string, unknown>) => {
    upsertFluid.mutate(
      { blockKey, ...data },
      { onError: (error) => pushToast('error', (error as Error).message) },
    );
  };

  if (!weather) {
    return (
      <div className="border-t border-slate-800 px-3 py-3">
        <p className="text-[10px] font-mono text-slate-500">Cargando clima...</p>
      </div>
    );
  }

  const fluidsInUse = fluidsQuery.data?.inUse ?? [];
  const fluidSettings = fluidsQuery.data?.settings ?? [];

  return (
    <div className="border-t border-slate-800">
      <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60">
        <CloudRain className="w-3.5 h-3.5" /> Clima y fluidos
      </h4>

      <div className="p-3 space-y-3">
        {/* --- Tipo de clima --- */}
        <div>
          <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">
            Efecto
          </label>
          <Help id="c2dWeatherType"><select
            value={weather.type}
            onChange={(event) => {
              const type = event.target.value as WeatherType;
              patch({
                type,
                // Elegir un efecto lo enciende; "Despejado" lo apaga. Obligar a
                // marcar ademas una casilla para ver algo seria una trampa.
                enabled: type !== 'NONE',
                tint: DEFAULT_TINT[type],
                // La tormenta trae sus rayos; el resto los deja como estaban
                // para no pisar una eleccion deliberada del usuario.
                ...(type === 'STORM' ? { lightning: true } : {}),
              });
            }}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 px-2 py-1.5 rounded outline-none text-[11px]"
          >
            {WEATHER_TYPES.map((type) => (
              <option key={type} value={type}>
                {WEATHER_LABEL[type]}
              </option>
            ))}
          </select></Help>
        </div>

        {weather.type !== 'NONE' && (
          <>
            <Help id="c2dWeatherIntensity"><Slider
              label="Intensidad"
              value={weather.intensity}
              onChange={(value) => patch({ intensity: value })}
              hint={weather.intensity < 0.33 ? 'suave' : weather.intensity < 0.7 ? 'media' : 'tormenta'}
            /></Help>

            {/* --- Rosa de viento --- */}
            <div>
              <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Wind className="w-3 h-3" /> Direccion del viento
              </label>
              <div className="grid grid-cols-3 gap-1 w-fit">
                {WIND_GRID.map((direction, index) =>
                  direction === null ? (
                    <div key={index} />
                  ) : (
                    <button
                      key={direction}
                      type="button"
                      title={WIND_LABEL[direction].label}
                      onClick={() => {
                        const patchData: Record<string, unknown> = { windDirection: direction };
                        if (direction !== 'NONE' && weather.windStrength === 0) {
                          patchData.windStrength = 0.5;
                        }
                        patch(patchData);
                      }}
                      className={`w-8 h-8 rounded border text-sm transition-all ${
                        weather.windDirection === direction
                          ? 'bg-indigo-800/60 border-indigo-500 text-indigo-100'
                          : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:border-slate-600'
                      }`}
                    >
                      {WIND_LABEL[direction].arrow}
                    </button>
                  ),
                )}
              </div>
              <p className="text-[9px] font-mono text-slate-600 mt-1">
                {WIND_LABEL[weather.windDirection].label}
              </p>
            </div>

            <Help id="c2dWindStrength"><Slider
              label="Fuerza del viento"
              value={weather.windStrength}
              onChange={(value) => patch({ windStrength: value })}
              hint={weather.windStrength < 0.3 ? 'brisa' : weather.windStrength < 0.7 ? 'viento' : 'vendaval'}
            /></Help>

            <Help id="c2dFogDensity"><Slider
              label="Densidad de niebla"
              value={weather.fogDensity}
              onChange={(value) => patch({ fogDensity: value })}
              hint={weather.fogDensity === 0 ? 'sin niebla' : undefined}
            /></Help>

            {/* --- Relampagos --- */}
            <div className="pt-2 border-t border-slate-800/70 space-y-2">
              <div className="flex items-center gap-2">
                <Help id="c2dWeatherLightning"><input
                  id="weather-lightning"
                  type="checkbox"
                  checked={weather.lightning}
                  onChange={(event) => patch({ lightning: event.target.checked })}
                  className="accent-amber-500 w-3.5 h-3.5"
                /></Help>
                <label
                  htmlFor="weather-lightning"
                  className="text-[10px] font-mono text-slate-300 flex items-center gap-1"
                >
                  <Zap className="w-3 h-3 text-amber-400" /> Relampagos
                </label>
              </div>

              {weather.lightning && (
                <>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                        Cada
                      </label>
                      <span className="text-[9px] font-mono text-slate-400">
                        ~{weather.lightningEvery.toFixed(0)} s
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      step={1}
                      value={weather.lightningEvery}
                      onChange={(event) =>
                        patch({ lightningEvery: Number(event.target.value) })
                      }
                      className="w-full accent-amber-500 h-1"
                    />
                    <p className="text-[9px] font-mono text-slate-600 leading-snug">
                      Es una media, no un metronomo: cada destello se dispara con margen
                      aleatorio porque una cadencia exacta se percibe como un parpadeo.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                      Color del destello
                    </label>
                    <input
                      type="color"
                      value={weather.lightningTint}
                      onChange={(event) => patch({ lightningTint: event.target.value })}
                      className="w-8 h-6 bg-transparent border border-slate-700 rounded cursor-pointer"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                Color de la particula
              </label>
              <input
                type="color"
                value={weather.tint}
                onChange={(event) => patch({ tint: event.target.value })}
                className="w-8 h-6 bg-transparent border border-slate-700 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="weather-enabled"
                type="checkbox"
                checked={weather.enabled}
                onChange={(event) => patch({ enabled: event.target.checked })}
                className="accent-indigo-600 w-3.5 h-3.5"
              />
              <label htmlFor="weather-enabled" className="text-[10px] font-mono text-slate-400">
                Activo (se ve aqui y se exporta)
              </label>
            </div>
          </>
        )}

        {/* --- Fluidos --- */}
        <div className="pt-2 border-t border-slate-800/70">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <Droplets className="w-3 h-3" /> Fluidos del mundo
          </p>

          {fluidsInUse.length === 0 ? (
            <p className="text-[9px] font-mono text-slate-600 leading-snug">
              Coloque agua o lava en el mundo para poder configurar su corriente.
            </p>
          ) : (
            <div className="space-y-2">
              {fluidsInUse.map((blockKey) => {
                const setting = fluidSettings.find((item) => item.blockKey === blockKey);
                const flow = setting?.flow ?? 'STILL';
                const isLava = blockKey.startsWith('lava');

                return (
                  <div key={blockKey} className="bg-slate-950/50 border border-slate-800 rounded p-2">
                    <p className="text-[10px] font-bold text-slate-300 mb-1">{blockKey}</p>

                    <div className="flex gap-1 mb-1.5">
                      {FLOWS.map((candidate) => (
                        <button
                          key={candidate}
                          type="button"
                          title={FLOW_LABEL[candidate].label}
                          onClick={() => patchFluid(blockKey, { flow: candidate })}
                          className={`flex-1 py-1 rounded border text-xs transition ${
                            flow === candidate
                              ? 'bg-indigo-800/60 border-indigo-500 text-indigo-100'
                              : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:border-slate-600'
                          }`}
                        >
                          {FLOW_LABEL[candidate].arrow}
                        </button>
                      ))}
                    </div>

                    <Slider
                      label="Velocidad"
                      value={setting?.speed ?? 0.4}
                      max={2}
                      onChange={(value) => patchFluid(blockKey, { speed: value })}
                    />

                    {isLava && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <Help id="c2dFluidBubbles"><input
                          id={`bubbles-${blockKey}`}
                          type="checkbox"
                          checked={setting?.bubbles ?? false}
                          onChange={(event) =>
                            patchFluid(blockKey, { bubbles: event.target.checked })
                          }
                          className="accent-orange-600 w-3.5 h-3.5"
                        /></Help>
                        <label
                          htmlFor={`bubbles-${blockKey}`}
                          className="text-[10px] font-mono text-slate-400"
                        >
                          Burbujas ascendentes
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[9px] font-mono text-slate-600 leading-snug pt-1 border-t border-slate-800/70">
          Lo que ve en el lienzo es una previsualizacion con estos mismos valores. Al exportar se
          genera el script nativo de Unity, Godot o Unreal con ellos incrustados; el editor no
          simula fisicas, solo muestra como quedara.
        </p>
      </div>
    </div>
  );
};

const Slider: React.FC<{
  label: string;
  value: number;
  max?: number;
  hint?: string;
  onChange: (value: number) => void;
}> = ({ label, value, max = 1, hint, onChange }) => (
  <div>
    <div className="flex items-center justify-between">
      <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">{label}</label>
      <span className="text-[9px] font-mono text-slate-400">
        {value.toFixed(2)}
        {hint ? ` · ${hint}` : ''}
      </span>
    </div>
    <input
      type="range"
      min={0}
      max={max}
      step={0.05}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="w-full accent-indigo-500 h-1"
    />
  </div>
);
