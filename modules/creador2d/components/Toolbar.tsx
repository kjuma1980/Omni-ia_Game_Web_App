import React from 'react';
import {
  Armchair,
  Crosshair,
  Eraser,
  Grid3x3,
  Hand,
  Layers,
  Magnet,
  Maximize,
  Move,
  Paintbrush,
  Pipette,
  Redo2,
  ShieldAlert,
  Square,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEditorStore } from '../state/editorStore';
import { TOOL_LABEL, type EditorTool } from '../types';
import { Help, HelpToggle } from './Help';

interface Props {
  onUndo: () => void;
  onRedo: () => void;
  onFrameWorld: () => void;
  onFrameChunk: () => void;
  onClearWorld: () => void;
}

const TOOLS: Array<{ tool: EditorTool; icon: React.ElementType; hint: string; help: string }> = [
  { tool: 'PLACE', icon: Paintbrush, hint: 'Colocar bloque (B)', help: 'c2dToolPlace' },
  { tool: 'BREAK', icon: Eraser, hint: 'Romper bloque (E)', help: 'c2dToolBreak' },
  { tool: 'RECT', icon: Square, hint: 'Rectangulo (R)', help: 'c2dToolRect' },
  { tool: 'PICK', icon: Pipette, hint: 'Cuentagotas (I)', help: 'c2dToolPick' },
  {
    tool: 'OBJECT',
    icon: Armchair,
    hint: 'Mobiliario (O): arrastrar y soltar fuera de la rejilla. Clic derecho retira.',
    help: 'c2dToolObject',
  },
  { tool: 'PAN', icon: Move, hint: 'Desplazar camara (H)', help: 'c2dToolPan' },
];

export const Toolbar: React.FC<Props> = ({
  onUndo,
  onRedo,
  onFrameWorld,
  onFrameChunk,
  onClearWorld,
}) => {
  const tool = useEditorStore((state) => state.tool);
  const setTool = useEditorStore((state) => state.setTool);
  const camera = useEditorStore((state) => state.camera);
  const setCamera = useEditorStore((state) => state.setCamera);
  const showGrid = useEditorStore((state) => state.showGrid);
  const showSnapToGrid = useEditorStore((state) => state.showSnapToGrid);
  const showChunkBorders = useEditorStore((state) => state.showChunkBorders);
  const showCollision = useEditorStore((state) => state.showCollision);
  const dimInactiveLayers = useEditorStore((state) => state.dimInactiveLayers);
  const strictResidency = useEditorStore((state) => state.strictResidency);
  const toggleFlag = useEditorStore((state) => state.toggleFlag);
  const historyDepth = useEditorStore((state) => state.historyDepth);

  const confirmClear = () => {
    onClearWorld();
  };

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/80 border-b border-slate-800 backdrop-blur-sm">
      <div className="flex items-center gap-1 pr-3 border-r border-slate-800">
        <Hand className="w-4 h-4 text-cyan-400" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
          {TOOL_LABEL[tool]}
        </span>
      </div>

      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
        {TOOLS.map(({ tool: candidate, icon: Icon, hint, help }) => (
          <Help key={candidate} id={help} position="bottom" inline>
          <button
            type="button"
            title={hint}
            onClick={() => setTool(candidate)}
            className={`px-2.5 py-1.5 rounded transition-all ${
              tool === candidate
                ? 'bg-cyan-700 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon className="w-4 h-4" />
          </button>
          </Help>
        ))}
      </div>

      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 ml-1">
        <Help id="c2dUndo" position="bottom" inline><button
          type="button"
          title="Deshacer (Ctrl+Z)"
          disabled={historyDepth.undo === 0}
          onClick={onUndo}
          className="px-2.5 py-1.5 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-500 transition"
        >
          <Undo2 className="w-4 h-4" />
        </button></Help>
        <Help id="c2dRedo" position="bottom" inline><button
          type="button"
          title="Rehacer (Ctrl+Shift+Z)"
          disabled={historyDepth.redo === 0}
          onClick={onRedo}
          className="px-2.5 py-1.5 rounded text-slate-500 hover:text-slate-200 disabled:opacity-30 disabled:hover:text-slate-500 transition"
        >
          <Redo2 className="w-4 h-4" />
        </button></Help>
      </div>

      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 ml-1">
        <Help id="c2dToggleGrid" position="bottom" inline><button
          type="button"
          title="Cuadricula (G)"
          onClick={() => toggleFlag('showGrid')}
          className={`px-2.5 py-1.5 rounded transition ${
            showGrid ? 'text-cyan-400' : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          <Grid3x3 className="w-4 h-4" />
        </button></Help>
        <Help id="c2dToggleSnapGrid" position="bottom" inline><button
          type="button"
          title="Iman de rejilla (Alinear objetos a la rejilla 32x32)"
          onClick={() => toggleFlag('showSnapToGrid')}
          className={`px-2.5 py-1.5 rounded transition ${
            showSnapToGrid ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          <Magnet className="w-4 h-4" />
        </button></Help>
        <Help id="c2dToggleChunkBorders" position="bottom" inline><button
          type="button"
          title="Limites de chunk"
          onClick={() => toggleFlag('showChunkBorders')}
          className={`px-2.5 py-1.5 rounded transition ${
            showChunkBorders ? 'text-cyan-400' : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button></Help>
        <Help id="c2dToggleCollision" position="bottom" inline><button
          type="button"
          title="Matriz de colisiones (C)"
          onClick={() => toggleFlag('showCollision')}
          className={`px-2.5 py-1.5 rounded transition ${
            showCollision ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
        </button></Help>
        <Help id="c2dDimInactiveLayers" position="bottom" inline><button
          type="button"
          title="Atenuar capas inactivas"
          onClick={() => toggleFlag('dimInactiveLayers')}
          className={`px-2.5 py-1.5 rounded transition text-[10px] font-mono font-bold ${
            dimInactiveLayers ? 'text-cyan-400' : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          DIM
        </button></Help>
        <Help id="c2dStrictResidency" position="bottom" inline><button
          type="button"
          title="Residencia estricta 3x3. Desactivada, la ventana cargada se amplia hasta cubrir la pantalla."
          onClick={() => toggleFlag('strictResidency')}
          className={`px-2.5 py-1.5 rounded transition text-[10px] font-mono font-bold ${
            strictResidency ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400'
          }`}
        >
          3x3
        </button></Help>
      </div>

      <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 ml-1">
        <Help id="c2dFrameChunk" position="bottom" inline><button
          type="button"
          title="Encuadrar el chunk actual"
          onClick={onFrameChunk}
          className="px-2.5 py-1.5 rounded text-slate-500 hover:text-cyan-300 transition"
        >
          <Crosshair className="w-4 h-4" />
        </button></Help>
        <Help id="c2dFrameWorld" position="bottom" inline><button
          type="button"
          title="Encuadrar todo el mundo"
          onClick={onFrameWorld}
          className="px-2.5 py-1.5 rounded text-slate-500 hover:text-cyan-300 transition"
        >
          <Maximize className="w-4 h-4" />
        </button></Help>
        <Help id="c2dClearWorld" position="bottom" inline><button
          type="button"
          title="Vaciar el mundo completo"
          onClick={confirmClear}
          className="px-2.5 py-1.5 rounded text-slate-600 hover:text-red-400 transition"
        >
          <Trash2 className="w-4 h-4" />
        </button></Help>
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <Help id="c2dZoomOut" position="bottom" inline><button
          type="button"
          title="Alejar"
          onClick={() => setCamera({ zoom: camera.zoom * 0.85 })}
          className="p-1.5 rounded text-slate-500 hover:text-slate-200 transition"
        >
          <ZoomOut className="w-4 h-4" />
        </button></Help>
        <span className="text-[10px] font-mono text-slate-400 w-12 text-center">
          {Math.round(camera.zoom * 100)}%
        </span>
        <Help id="c2dZoomIn" position="bottom" inline><button
          type="button"
          title="Acercar"
          onClick={() => setCamera({ zoom: camera.zoom * 1.15 })}
          className="p-1.5 rounded text-slate-500 hover:text-slate-200 transition"
        >
          <ZoomIn className="w-4 h-4" />
        </button></Help>
        <button
          type="button"
          onClick={() => setCamera({ x: 256, y: 256, zoom: 1 })}
          className="ml-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-cyan-300 border border-slate-800 rounded transition"
        >
          Centrar
        </button>
      </div>
      {/* Encendido de las ayudas, equivalente al boton de la barra superior de
          la aplicacion. Vive aqui porque el modulo se carga de forma diferida y
          no recibe la prop `showTooltips` del arbol principal. */}
      <div className="ml-auto">
        <Help id="c2dHelpToggle" position="bottom" inline>
          <HelpToggle />
        </Help>
      </div>
    </div>
  );
};
