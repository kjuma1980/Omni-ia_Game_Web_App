import { create } from 'zustand';
import type { LayerName } from '../core/grid';
import type { Camera } from '../core/renderer';
import type {
  BlockDefinition,
  EditorTool,
  Presence,
  WorldDetail,
  WorldSummary,
} from '../types';

export type ConnectionStatus = 'connecting' | 'online' | 'offline' | 'error';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface EditorState {
  // --- sesion ---
  authStatus: 'unknown' | 'anonymous' | 'authenticated';
  username: string | null;
  apiOnline: boolean;

  // --- mundo activo ---
  worlds: WorldSummary[];
  world: WorldDetail | null;
  blocks: BlockDefinition[];

  // --- camara y herramientas ---
  camera: Camera;
  tool: EditorTool;
  activeLayer: LayerName;
  selectedBlockKey: string | null;
  layerVisibility: Record<LayerName, boolean>;
  showGrid: boolean;
  showSnapToGrid: boolean;
  /**
   * Ayudas flotantes del editor.
   *
   * Vive aqui y no en el modulo principal porque el Creador 2D se carga de
   * forma diferida y su arbol no recibe la prop `showTooltips` de la app: para
   * hacerla llegar habria que tocar la firma de los 17 paneles. Con un
   * conmutador propio en el store, cada panel lo lee de donde ya lee todo lo
   * demas, y el boton de ayuda se comporta igual que el de la app.
   */
  showTooltips: boolean;
  showChunkBorders: boolean;
  showCollision: boolean;
  dimInactiveLayers: boolean;
  /**
   * Con `true` la residencia queda fijada en la matriz 3x3 del enunciado.
   * Con `false` (por defecto) la ventana se amplia hasta cubrir el viewport,
   * que es lo que hace usable la edicion con la camara alejada.
   */
  strictResidency: boolean;
  /** Limites en tiles de la region residente, para dibujar su contorno. */
  residentBounds: { minTileX: number; minTileY: number; maxTileX: number; maxTileY: number } | null;

  // --- estado vivo ---
  hover: { tileX: number; tileY: number } | null;
  selection: { tileX: number; tileY: number; width: number; height: number } | null;
  presences: Record<string, Presence>;
  connection: ConnectionStatus;
  connectionDetail: string | null;
  historyDepth: { undo: number; redo: number };
  pendingOperations: number;
  toasts: Toast[];

  // --- acciones ---
  setAuth: (status: EditorState['authStatus'], username: string | null) => void;
  setApiOnline: (online: boolean) => void;
  setWorlds: (worlds: WorldSummary[]) => void;
  setWorld: (world: WorldDetail | null) => void;
  setBlocks: (blocks: BlockDefinition[]) => void;
  setCamera: (camera: Partial<Camera>) => void;
  panCamera: (dx: number, dy: number) => void;
  setTool: (tool: EditorTool) => void;
  setActiveLayer: (layer: LayerName) => void;
  selectBlock: (key: string | null) => void;
  toggleLayer: (layer: LayerName) => void;
  toggleFlag: (
    flag:
      | 'showGrid'
      | 'showSnapToGrid'
      | 'showChunkBorders'
      | 'showCollision'
      | 'dimInactiveLayers'
      | 'strictResidency'
      | 'showTooltips',
  ) => void;
  setResidentBounds: (bounds: EditorState['residentBounds']) => void;
  setHover: (hover: EditorState['hover']) => void;
  setSelection: (selection: EditorState['selection']) => void;
  upsertPresence: (presence: Presence) => void;
  removePresence: (socketId: string) => void;
  setConnection: (status: ConnectionStatus, detail?: string) => void;
  setHistoryDepth: (depth: { undo: number; redo: number }) => void;
  incrementPending: (delta: number) => void;
  pushToast: (kind: Toast['kind'], message: string) => void;
  dismissToast: (id: number) => void;
  resetWorldState: () => void;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

let toastCounter = 0;

export const useEditorStore = create<EditorState>((set) => ({
  authStatus: 'unknown',
  username: null,
  apiOnline: false,

  worlds: [],
  world: null,
  blocks: [],

  camera: { x: 256, y: 256, zoom: 1 },
  tool: 'PLACE',
  activeLayer: 'GROUND',
  selectedBlockKey: null,
  layerVisibility: { GROUND: true, PIT: true, WALL: true, OVERLAY: true },
  showGrid: true,
  showSnapToGrid: true,
  showTooltips: true,
  // Los limites de chunk se muestran de entrada: sin ellos no se ve donde
  // termina la region editable y es facil pintar "al vacio".
  showChunkBorders: true,
  showCollision: false,
  dimInactiveLayers: false,
  strictResidency: false,
  residentBounds: null,

  hover: null,
  selection: null,
  presences: {},
  connection: 'offline',
  connectionDetail: null,
  historyDepth: { undo: 0, redo: 0 },
  pendingOperations: 0,
  toasts: [],

  setAuth: (authStatus, username) => set({ authStatus, username }),
  setApiOnline: (apiOnline) => set({ apiOnline }),
  setWorlds: (worlds) => set({ worlds }),
  setWorld: (world) => set({ world }),
  setBlocks: (blocks) => set({ blocks }),

  setCamera: (camera) =>
    set((state) => ({
      camera: {
        ...state.camera,
        ...camera,
        zoom:
          camera.zoom === undefined
            ? state.camera.zoom
            : Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom)),
      },
    })),

  panCamera: (dx, dy) =>
    set((state) => ({ camera: { ...state.camera, x: state.camera.x + dx, y: state.camera.y + dy } })),

  setTool: (tool) => set({ tool, selection: null }),
  setActiveLayer: (activeLayer) => set({ activeLayer }),
  selectBlock: (selectedBlockKey) => set({ selectedBlockKey }),

  toggleLayer: (layer) =>
    set((state) => ({
      layerVisibility: { ...state.layerVisibility, [layer]: !state.layerVisibility[layer] },
    })),

  toggleFlag: (flag) => set((state) => ({ [flag]: !state[flag] }) as Partial<EditorState>),
  setResidentBounds: (residentBounds) => set({ residentBounds }),

  setHover: (hover) => set({ hover }),
  setSelection: (selection) => set({ selection }),

  upsertPresence: (presence) =>
    set((state) => ({ presences: { ...state.presences, [presence.socketId]: presence } })),

  removePresence: (socketId) =>
    set((state) => {
      const next = { ...state.presences };
      delete next[socketId];
      return { presences: next };
    }),

  setConnection: (connection, connectionDetail) =>
    set({ connection, connectionDetail: connectionDetail ?? null }),

  setHistoryDepth: (historyDepth) => set({ historyDepth }),

  incrementPending: (delta) =>
    set((state) => ({ pendingOperations: Math.max(0, state.pendingOperations + delta) })),

  pushToast: (kind, message) =>
    set((state) => {
      toastCounter += 1;
      // Se mantienen a lo sumo 4 avisos para no tapar el lienzo.
      const toasts = [...state.toasts, { id: toastCounter, kind, message }].slice(-4);
      return { toasts };
    }),

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  resetWorldState: () =>
    set({
      world: null,
      hover: null,
      selection: null,
      presences: {},
      connection: 'offline',
      connectionDetail: null,
      historyDepth: { undo: 0, redo: 0 },
      pendingOperations: 0,
    }),
}));
