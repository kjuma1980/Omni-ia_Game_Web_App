import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Compass, RotateCw } from 'lucide-react';
import { queryKeys } from '../api/hooks';
import { getServices } from '../state/services';
import { useEditorStore } from '../state/editorStore';
import type { WorldDetail } from '../types';
import { Help } from './Help';

interface Props {
  world: WorldDetail;
}

/** Angulos habituales, para no tener que buscarlos con el deslizador. */
const PRESETS = [0, -15, -30, 15, 30, 45];

/**
 * Geometria del escenario: inclinacion de la rejilla y carriles del runner.
 *
 * La inclinacion existe porque un countryside visto desde arriba no es plano:
 * la carretera se aleja en diagonal, y hasta ahora la unica rejilla posible era
 * ortogonal. Se mide en grados exactos, no "un poco torcido", para que el mismo
 * angulo pueda reproducirse en el motor.
 *
 * Es una INCLINACION, no una perspectiva: gira el plano del mundo entero. No
 * hay punto de fuga ni escorzo, porque eso exigiria una proyeccion proyectiva y
 * romperia la equivalencia entre lo que se edita aqui y lo que exporta el
 * backend por celdas.
 */
export const GeometryPanel: React.FC<Props> = ({ world }) => {
  const queryClient = useQueryClient();
  const pushToast = useEditorStore((state) => state.pushToast);

  // Estado local para que el deslizador responda al instante; el servidor se
  // entera al soltar, no en cada uno de los cientos de valores intermedios.
  const [angle, setAngle] = useState(world.gridAngle);
  const [lanes, setLanes] = useState(world.laneCount);
  const [laneWidth, setLaneWidth] = useState(world.laneWidth);

  useEffect(() => {
    setAngle(world.gridAngle);
    setLanes(world.laneCount);
    setLaneWidth(world.laneWidth);
  }, [world.gridAngle, world.laneCount, world.laneWidth]);

  const commit = (payload: Record<string, unknown>) => {
    void getServices()
      .client.updateWorld(world.id, payload)
      .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.world(world.id) }))
      .catch((error: Error) => pushToast('error', error.message));
  };

  const isRunner = world.type === 'COUNTRYSIDE_RUNNER';

  return (
    <div className="border-t border-slate-800">
      <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 px-3 py-2 border-b border-slate-800/60">
        <Compass className="w-3.5 h-3.5" /> Geometria del escenario
      </h4>

      <div className="p-3 space-y-3">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <RotateCw className="w-3 h-3" /> Inclinacion de la rejilla
            </label>
            <span className="text-[10px] font-mono text-emerald-400 tabular-nums">
              {angle.toFixed(1)}°
            </span>
          </div>

          <Help id="c2dGridAngle"><input
            type="range"
            min={-45}
            max={45}
            step={0.5}
            value={angle}
            onChange={(event) => setAngle(Number(event.target.value))}
            onPointerUp={() => commit({ gridAngle: angle })}
            onKeyUp={() => commit({ gridAngle: angle })}
            className="w-full accent-emerald-500 h-1"
          /></Help>

          <div className="flex gap-1 mt-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setAngle(preset);
                  commit({ gridAngle: preset });
                }}
                className={`flex-1 text-[9px] font-mono py-1 rounded border transition ${
                  Math.abs(angle - preset) < 0.26
                    ? 'bg-emerald-900/50 border-emerald-600 text-emerald-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:border-slate-600'
                }`}
              >
                {preset}°
              </button>
            ))}
          </div>

          <p className="text-[9px] font-mono text-slate-600 leading-snug mt-1">
            Gira el plano del mundo. El iman sigue siendo exacto: el puntero se desgira antes de
            convertirse en celda, asi que el bloque cae donde apunta el cursor.
          </p>
        </div>

        {isRunner && (
          <div className="pt-2 border-t border-slate-800/70 space-y-2">
            <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
              Carriles del runner
            </p>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-mono text-slate-500">Numero de carriles</label>
                <span className="text-[10px] font-mono text-slate-300">{lanes}</span>
              </div>
              <Help id="c2dRunnerLanes"><input
                type="range"
                min={2}
                max={7}
                step={1}
                value={lanes}
                onChange={(event) => setLanes(Number(event.target.value))}
                onPointerUp={() => commit({ laneCount: lanes })}
                onKeyUp={() => commit({ laneCount: lanes })}
                className="w-full accent-emerald-500 h-1"
              /></Help>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-mono text-slate-500">
                  Ancho de carril (baldosas)
                </label>
                <span className="text-[10px] font-mono text-slate-300">{laneWidth}</span>
              </div>
              <Help id="c2dRunnerLaneWidth"><input
                type="range"
                min={1}
                max={6}
                step={1}
                value={laneWidth}
                onChange={(event) => setLaneWidth(Number(event.target.value))}
                onPointerUp={() => commit({ laneWidth })}
                onKeyUp={() => commit({ laneWidth })}
                className="w-full accent-emerald-500 h-1"
              /></Help>
            </div>

            <p className="text-[9px] font-mono text-slate-600 leading-snug">
              El recorrido son {lanes} carriles de {laneWidth} baldosas: {lanes * laneWidth} de
              ancho. Las piezas de calle se dimensionan con estos valores, y el jugador salta de
              carril a carril, no se desplaza en continuo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
