import React, { useRef, useState } from 'react';
import { ACTIONS, ANIMATION_ACTIONS } from '../constants';
import Tooltip from './Tooltip';
import { PERSPECTIVE_LABEL } from '../constants/promptDirectives';
import { X, Upload, CheckCircle2 } from 'lucide-react';
import {
  assignSlot,
  loadSlots,
  slotKeyForAction,
  slotKeyForAnimation,
  slotKeyForPerspective,
  type WorkflowSlots,
  type WorkflowSlotValue,
} from '../services/workflowLibrary';

const readJsonFile = (file: File): Promise<{ fileName: string; jsonStr: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = (evt.target?.result as string) || '';
        JSON.parse(text); // Validar JSON
        resolve({ fileName: file.name, jsonStr: text });
      } catch (err) {
        reject(new Error('El archivo no es un JSON válido.'));
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo.'));
    reader.readAsText(file);
  });
};

function useAssignments() {
  const [slots, setSlots] = useState<WorkflowSlots>(() => loadSlots());
  const [error, setError] = useState<string | null>(null);
  const subiendoPara = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const alSubir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichero = e.target.files?.[0];
    const clave = subiendoPara.current;
    if (!fichero || !clave) return;

    try {
      const result = await readJsonFile(fichero);
      setSlots((prevSlots) => {
        const actualizadas = assignSlot(prevSlots, clave, result);
        return actualizadas;
      });
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo leer el archivo JSON.');
    } finally {
      e.target.value = '';
    }
  };

  const alLimpiar = (clave: string) => {
    setSlots((prevSlots) => {
      const actualizadas = assignSlot(prevSlots, clave, null);
      return actualizadas;
    });
  };

  const pedirFichero = (clave: string) => {
    subiendoPara.current = clave;
    inputRef.current?.click();
  };

  return { slots, alAsignar: alSubir, alLimpiar, error, pedirFichero, inputRef };
}

interface FilaProps {
  clave: string;
  etiqueta: string;
  slots: WorkflowSlots;
  onLimpiar: (clave: string) => void;
  onSubir: (clave: string) => void;
  showTooltips: boolean;
}

const Fila: React.FC<FilaProps> = ({ clave, etiqueta, slots, onLimpiar, onSubir, showTooltips }) => {
  const slotVal = slots[clave];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 py-2 border-b border-slate-800/60 last:border-0">
      <div className="sm:w-48 shrink-0">
        <p className="text-xs text-slate-200 font-semibold">{etiqueta}</p>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex gap-2 items-center">
          <div className="flex-1 min-w-0 bg-slate-900 border border-slate-800 rounded p-2 text-xs font-mono text-slate-300 flex items-center gap-2">
            {slotVal?.fileName ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate text-emerald-300 font-bold">{slotVal.fileName}</span>
              </>
            ) : (
              <span className="text-slate-600 italic">(Vacío - Sin workflow asignado)</span>
            )}
          </div>

          <Tooltip id="workflowSlotUpload" showTooltips={showTooltips} inline>
          <button
            onClick={() => onSubir(clave)}
            className="shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-200 bg-slate-800 border border-slate-700 rounded hover:border-blue-500 hover:text-blue-400 transition flex items-center gap-1.5"
            title="Cargar un archivo .json especifico para esta accion"
          >
            <Upload className="w-3 h-3" />
            {slotVal?.fileName ? 'Cambiar JSON' : 'Cargar JSON'}
          </button>
          </Tooltip>

          {slotVal?.fileName && (
            <Tooltip id="workflowSlotClear" showTooltips={showTooltips} inline>
              <button
                onClick={() => onLimpiar(clave)}
                className="shrink-0 p-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-800/80 rounded text-rose-400 hover:text-rose-200 transition flex items-center justify-center"
                title="Quitar workflow de esta accion y dejar el campo vacio"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
};

const Encabezado: React.FC<{ error: string | null; texto: string }> = ({ error, texto }) => (
  <>
    <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">{texto}</p>
    {error && (
      <p className="mb-3 text-[11px] text-red-400 leading-relaxed border border-red-900/50 bg-red-950/30 rounded p-2">
        {error}
      </p>
    )}
  </>
);

/**
 * Acciones de sprite (Tab Imagen)
 */
export const SpriteWorkflowAssignments: React.FC<{ showTooltips?: boolean }> = ({ showTooltips = false }) => {
  const { slots, alLimpiar, error, alAsignar, pedirFichero, inputRef } = useAssignments();

  return (
    <div>
      <input ref={inputRef} type="file" accept=".json" onChange={alAsignar} className="hidden" />

      <Encabezado
        error={error}
        texto="Si no se carga un JSON en una acción, el campo permanecerá completamente vacío y se usará el workflow general."
      />

      {ACTIONS.map((a) => (
        <Fila
          key={a}
          clave={slotKeyForAction(a)}
          etiqueta={a}
          slots={slots}
          onLimpiar={alLimpiar}
          onSubir={pedirFichero}
          showTooltips={showTooltips}
        />
      ))}
    </div>
  );
};

/**
 * Workflows por perspectiva (Tab Imagen)
 */
export const WorldWorkflowAssignments: React.FC<{ showTooltips?: boolean }> = ({ showTooltips = false }) => {
  const { slots, alLimpiar, error, alAsignar, pedirFichero, inputRef } = useAssignments();

  return (
    <div>
      <input ref={inputRef} type="file" accept=".json" onChange={alAsignar} className="hidden" />

      <Encabezado
        error={error}
        texto="Workflows por perspectiva. Si está vacío, se usará el workflow general."
      />

      {Object.entries(PERSPECTIVE_LABEL).map(([clave, etiqueta]) => (
        <Fila
          key={clave}
          clave={slotKeyForPerspective(clave)}
          etiqueta={etiqueta}
          slots={slots}
          onLimpiar={alLimpiar}
          onSubir={pedirFichero}
          showTooltips={showTooltips}
        />
      ))}
    </div>
  );
};

/**
 * Acciones de animación (Tab Animación)
 */
export const AnimationWorkflowAssignments: React.FC<{ showTooltips?: boolean }> = ({ showTooltips = false }) => {
  const { slots, alLimpiar, error, alAsignar, pedirFichero, inputRef } = useAssignments();

  return (
    <div>
      <input ref={inputRef} type="file" accept=".json" onChange={alAsignar} className="hidden" />

      <Encabezado
        error={error}
        texto="Workflows por acción de animación. Si el campo está vacío, únicamente se usará el que cargues para esa acción específica."
      />

      {ANIMATION_ACTIONS.map((a) => (
        <Fila
          key={a}
          clave={slotKeyForAnimation(a)}
          etiqueta={a}
          slots={slots}
          onLimpiar={alLimpiar}
          onSubir={pedirFichero}
          showTooltips={showTooltips}
        />
      ))}
    </div>
  );
};
