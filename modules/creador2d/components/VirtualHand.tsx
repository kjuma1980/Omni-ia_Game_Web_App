import React from 'react';
import { Armchair, Eraser, Hand, Paintbrush, Pipette, Move, Square } from 'lucide-react';
import { BlockSwatch } from './BlockSwatch';
import { useEditorStore } from '../state/editorStore';
import { LAYER_LABEL } from '../core/grid';
import { TOOL_LABEL, type EditorTool } from '../types';

/**
 * Un icono por herramienta.
 *
 * `Record<EditorTool, ...>` y no un objeto suelto: al anadir la herramienta de
 * mobiliario se olvido su icono aqui, `TOOL_ICON['OBJECT']` quedaba `undefined`
 * y React tumbaba el arbol entero al intentar renderizar `<undefined />`. La
 * pantalla se ponia negra sin mas salida que recargar.
 *
 * Con el tipo puesto, olvidarse de una herramienta nueva ya no compila.
 */
const TOOL_ICON: Record<EditorTool, React.ElementType> = {
  HAND: Hand,
  PLACE: Paintbrush,
  BREAK: Eraser,
  RECT: Square,
  PICK: Pipette,
  OBJECT: Armchair,
  PAN: Move,
};

/**
 * Mano virtual.
 *
 * Es el elemento de interfaz original del modulo: una mano flotante que
 * "sostiene" el bloque activo y muestra en todo momento la celda exacta a la
 * que se adherira. Junto al fantasma que se dibuja sobre el lienzo, cierra el
 * bucle visual del iman: el usuario ve el bloque en la mano, ve donde va a
 * caer, y ve la coordenada de rejilla a la que se ha ajustado.
 */
export const VirtualHand: React.FC = () => {
  const tool = useEditorStore((state) => state.tool);
  const activeLayer = useEditorStore((state) => state.activeLayer);
  const hover = useEditorStore((state) => state.hover);
  const selectedBlockKey = useEditorStore((state) => state.selectedBlockKey);
  const blocks = useEditorStore((state) => state.blocks);

  const block = selectedBlockKey ? blocks.find((item) => item.key === selectedBlockKey) : null;
  const Icon = TOOL_ICON[tool];

  return (
    <div className="pointer-events-none absolute left-4 bottom-4 z-20 select-none">
      <div className="flex items-end gap-3">
        {/* Palma */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-slate-900/85 border border-cyan-600/40 backdrop-blur-sm shadow-[0_0_24px_rgba(34,211,238,0.15)] flex items-center justify-center">
            {tool === 'PLACE' && block ? (
              <BlockSwatch
                blockKey={block.key}
                visual={block.visual}
                origin={block.origin}
                imageData={block.imageData}
                size={40}
                className="rounded shadow-lg"
              />
            ) : (
              <Icon className="w-7 h-7 text-cyan-400" />
            )}
          </div>

          {/* Dedos: tres trazos que sugieren el agarre sin dibujar una mano
              realista, para mantener el estilo tecnico del resto de la app. */}
          <svg
            className="absolute -top-3 left-1/2 -translate-x-1/2"
            width="46"
            height="16"
            viewBox="0 0 46 16"
            fill="none"
          >
            <path
              d="M6 15 V6 a3 3 0 0 1 6 0 v9"
              stroke="rgba(34,211,238,0.55)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M20 15 V3 a3 3 0 0 1 6 0 v12"
              stroke="rgba(34,211,238,0.75)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M34 15 V7 a3 3 0 0 1 6 0 v8"
              stroke="rgba(34,211,238,0.55)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Lectura de estado */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 backdrop-blur-sm">
          <p className="text-[10px] font-mono uppercase tracking-wider text-cyan-400">
            {TOOL_LABEL[tool]}
          </p>
          <p className="text-[11px] font-bold text-slate-100 leading-tight">
            {tool === 'PLACE' ? (block?.name ?? 'Sin bloque seleccionado') : LAYER_LABEL[activeLayer]}
          </p>
          <p className="text-[10px] font-mono text-slate-500 mt-0.5">
            {hover ? `tile ${hover.tileX}, ${hover.tileY}` : 'fuera del lienzo'}
          </p>
        </div>
      </div>
    </div>
  );
};
