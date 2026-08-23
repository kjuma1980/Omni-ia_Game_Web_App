import React, { useMemo, useState } from 'react';
import { Boxes, Loader2, X } from 'lucide-react';
import { getServices } from './state/services';
import { LAYER_LABEL, type LayerName } from './core/grid';
import {
  CATEGORY_LABEL,
  WORLD_TYPE_LABEL,
  type BlockCategory,
  type WorldType,
} from './types';
import { safeImageSrc } from '../../services/localService';

interface Props {
  /** Imagen ya generada, como URL o data URL. */
  imageUrl: string;
  /** Texto del prompt: sirve para proponer un nombre sin escribirlo a mano. */
  suggestedName?: string;
  onClose: () => void;
}

const WORLD_TYPES: WorldType[] = [
  'TOP_DOWN_CENITAL',
  'TOP_DOWN_THREE_QUARTER',
  'COUNTRYSIDE_RUNNER',
  'SIDE_PLATFORMER',
];

const CATEGORIES: BlockCategory[] = [
  'PROP',
  'FURNITURE',
  'VEHICLE',
  'DECOR',
  'STRUCTURE',
  'VEGETATION',
  'SIGN',
  'LIGHT',
  'TERRAIN',
  'WALL',
  'COLUMN',
  'RUIN',
  'FLUID',
  'ENTRANCE',
];

/**
 * Categorias que por naturaleza forman parte del terreno y se pintan en la
 * rejilla; el resto son objetos que se sueltan libremente. Elegirlo por el
 * usuario evita una pregunta cuya respuesta casi siempre se deduce.
 */
const GRID_CATEGORIES = new Set<BlockCategory>([
  'TERRAIN',
  'WALL',
  'COLUMN',
  'RUIN',
  'FLUID',
  'ENTRANCE',
]);

const LAYER_BY_CATEGORY: Record<BlockCategory, LayerName> = {
  TERRAIN: 'GROUND',
  FLUID: 'GROUND',
  WALL: 'WALL',
  COLUMN: 'WALL',
  RUIN: 'WALL',
  VEGETATION: 'WALL',
  PROP: 'WALL',
  FURNITURE: 'WALL',
  STRUCTURE: 'WALL',
  VEHICLE: 'WALL',
  ENTRANCE: 'WALL',
  SIGN: 'WALL',
  DECOR: 'OVERLAY',
  LIGHT: 'OVERLAY',
};

/** Convierte "Barril de Roble #2" en "barril_de_roble_2". */
function toKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

/**
 * ---------------------------------------------------------------------------
 *  Enviar un sprite generado al Creador 2D
 * ---------------------------------------------------------------------------
 *  Cierra el hueco entre las dos mitades de la aplicacion: lo que se genera en
 *  Asset Foundry ya no hay que descargarlo y volverlo a subir; entra
 *  directamente en el catalogo de PostgreSQL y aparece en la paleta del editor.
 *
 *  Este componente vive en el modulo del creador y NO en la aplicacion base, de
 *  modo que el acople sigue siendo un unico punto: un boton que lo abre.
 * ---------------------------------------------------------------------------
 */
export const SendToCreador2D: React.FC<Props> = ({ imageUrl, suggestedName, onClose }) => {
  const [name, setName] = useState(suggestedName?.slice(0, 60) ?? '');
  const [category, setCategory] = useState<BlockCategory>('PROP');
  const [worldTypes, setWorldTypes] = useState<WorldType[]>([...WORLD_TYPES]);
  const [solid, setSolid] = useState(true);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const key = useMemo(() => toKey(name), [name]);
  const placement = GRID_CATEGORIES.has(category) ? 'GRID' : 'FREE';
  const layer = LAYER_BY_CATEGORY[category];

  const toggleWorldType = (type: WorldType) => {
    setWorldTypes((current) =>
      current.includes(type) ? current.filter((item) => item !== type) : [...current, type],
    );
  };

  const submit = async () => {
    setError(null);

    if (key.length < 3) {
      setError('El nombre necesita al menos 3 caracteres utilizables.');
      return;
    }
    if (worldTypes.length === 0) {
      setError('Elija al menos un tipo de mundo.');
      return;
    }

    setStatus('sending');

    try {
      // La imagen puede ser una URL del servidor local, no un data URL. Se
      // convierte aqui para que el bloque quede autocontenido: si manana se
      // limpia la carpeta de salidas de ComfyUI, el bloque sigue existiendo.
      const imageData = await toDataUrl(imageUrl);

      // Se reutiliza el cliente compartido del editor, NUNCA uno nuevo: los
      // tokens de refresco rotan y detectan reutilizacion, asi que dos clientes
      // partiendo del mismo token guardado revocarian la sesion entera.
      const client = getServices().client;

      if (!client.isAuthenticated && !client.hasStoredSession) {
        throw new Error(
          'Primero entre al Creador 2D (Mundos > Creador 2D) para iniciar sesion; despues vuelva aqui.',
        );
      }

      await client.createCustomBlock({
        key,
        name: name.trim(),
        description: 'Creado desde el generador de Omni IA Game.',
        worldTypes,
        layer,
        category,
        placement,
        biome: 'generic',
        tags: ['ia', 'personalizado'],
        collisionFlags: solid ? 1 : 0,
        heightInTiles: height,
        ySortOffset: placement === 'FREE' ? -2 : 0,
        defaultScale: scale,
        origin: 'AI_LOCAL',
        imageData,
      });

      setStatus('done');
    } catch (caught) {
      setError((caught as Error).message);
      setStatus('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-cyan-800/50 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <h3 className="text-sm font-bold text-cyan-400 flex items-center gap-2">
            <Boxes className="w-4 h-4" /> Agregar al Creador 2D
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {status === 'done' ? (
          <div className="p-6 space-y-3 text-center">
            <p className="text-sm text-emerald-400 font-bold">
              "{name}" ya esta en el catalogo.
            </p>
            <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
              Aparece en la paleta del editor bajo {CATEGORY_LABEL[category]}, capa{' '}
              {LAYER_LABEL[layer]}. Si tenia el editor abierto, recargue para verlo.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-bold uppercase tracking-wider transition"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="flex gap-3">
              <img
                src={safeImageSrc(imageUrl)}
                alt="Sprite a enviar"
                className="w-24 h-24 object-contain bg-black/40 rounded border border-slate-800 shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                    Nombre
                  </label>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Barril de roble"
                    className="w-full bg-black/40 border border-slate-800 text-slate-200 px-2 py-1.5 rounded outline-none text-xs focus:border-cyan-600"
                  />
                  <p className="text-[9px] font-mono text-slate-600 mt-1 truncate">
                    clave: {key || '—'}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as BlockCategory)}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 px-2 py-1.5 rounded outline-none text-xs"
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {CATEGORY_LABEL[item]}
                  </option>
                ))}
              </select>
              <p className="text-[9px] font-mono text-slate-600 mt-1">
                {placement === 'GRID'
                  ? `Se pintara en la rejilla, capa ${LAYER_LABEL[layer]}.`
                  : `Se soltara libremente y podra moverse y redimensionarse, capa ${LAYER_LABEL[layer]}.`}
              </p>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1">
                Tipos de mundo
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {WORLD_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleWorldType(type)}
                    className={`text-[10px] font-mono py-1.5 px-2 rounded border text-left transition ${
                      worldTypes.includes(type)
                        ? 'bg-cyan-950/50 border-cyan-700 text-cyan-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:border-slate-600'
                    }`}
                  >
                    {WORLD_TYPE_LABEL[type]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                Proporciones y Alto en Baldosas (Recomendado según el objeto)
              </label>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {[
                  { h: 1, ratio: '1:1 (32x32px)', res: '512x512', desc: 'Suelo / Muro / Cajas / Barriles' },
                  { h: 2, ratio: '1:2 (32x64px)', res: '512x1024', desc: 'Puertas / Arbustos / Columnas' },
                  { h: 3, ratio: '1:3 (32x96px)', res: '512x1536', desc: 'Postes / Árboles jóvenes / Torres' },
                  { h: 4, ratio: '1:4 (32x128px)', res: '512x2048', desc: 'Árboles frondosos / Estatuas' },
                ].map((opt) => (
                  <button
                    key={opt.h}
                    type="button"
                    onClick={() => setHeight(opt.h)}
                    className={`p-2 rounded border text-left transition flex flex-col justify-between ${
                      height === opt.h
                        ? 'bg-cyan-950/70 border-cyan-500 text-cyan-200 shadow-sm shadow-cyan-950'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[10px] font-bold">
                      <span>{opt.h} {opt.h === 1 ? 'Baldosa' : 'Baldosas'}</span>
                      <span className="text-[9px] text-cyan-400 font-normal">{opt.ratio}</span>
                    </div>
                    <p className="text-[8.5px] text-slate-500 truncate mt-0.5">{opt.desc}</p>
                    <p className="text-[8px] font-mono text-slate-600 mt-0.5">IA: {opt.res} px</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                    Escala Inicial
                  </label>
                  <span className="text-[10px] font-mono text-slate-300">{scale.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0.3}
                  max={4}
                  step={0.1}
                  value={scale}
                  onChange={(event) => setScale(Number(event.target.value))}
                  className="w-full accent-cyan-500 h-1"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">
                    Alto Personalizado
                  </label>
                  <span className="text-[10px] font-mono text-slate-300">{height} {height === 1 ? 'baldosa' : 'baldosas'}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={height}
                  onChange={(event) => setHeight(Number(event.target.value))}
                  className="w-full accent-cyan-500 h-1"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="c2d-solid"
                type="checkbox"
                checked={solid}
                onChange={(event) => setSolid(event.target.checked)}
                className="accent-cyan-600 w-3.5 h-3.5"
              />
              <label htmlFor="c2d-solid" className="text-[10px] font-mono text-slate-400">
                Bloquea el paso (colision solida)
              </label>
            </div>

            {error && (
              <p className="text-[10px] font-mono text-red-400 bg-red-950/30 border border-red-900/50 rounded px-2 py-1.5">
                {error}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border border-slate-800 rounded hover:border-slate-600 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={status === 'sending'}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-bold uppercase tracking-wider bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded transition"
              >
                {status === 'sending' && <Loader2 className="w-3 h-3 animate-spin" />}
                Guardar o Reemplazar
              </button>
            </div>

            <p className="text-[9px] font-mono text-slate-600 leading-snug border-t border-slate-800/70 pt-2">
              El bloque se guarda en la base de datos del Creador 2D con su imagen incrustada. No
              toca inventarios, puntos ni logros: solo amplia el catalogo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Descarga la imagen y la convierte a data URL. Si ya lo es, se devuelve tal
 * cual: volver a pasarla por fetch seria trabajo inutil.
 */
async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) {
    return url;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`No se pudo leer la imagen (${response.status})`);
  }

  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo codificar la imagen'));
    reader.readAsDataURL(blob);
  });
}

export default SendToCreador2D;
