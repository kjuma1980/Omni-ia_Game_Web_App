
import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import { ArtStyle, ActionType, GeneratedAsset, ProjectData } from '../types';
import { ART_STYLES, ACTIONS } from '../constants';
import {
  COMPOSITION_OPTIONS,
  PERSPECTIVE_LABEL,
  describeDensity,
  describePerspective,
  explainComposition,
  isRecommendedComposition,
} from '../constants/promptDirectives';
import { ASPECT_OPTIONS, computeDimensions } from '../constants/imageSizing';
import { REMBG_MODELS } from '../services/workflowRembg';
import { summarizeMeta, type GenerationMeta } from '../services/generationMeta';
import {
  SHEET_VIEWS,
  SINGLE_PASS_SHEET_NEGATIVE,
  composeSheet,
  mirrorDataUrl,
  neutraliseForTurnaround,
  singlePassSheetPrompt,
  subjectForSingleView,
  viewsLookIdentical,
} from '../services/modelSheet';
import {
  assignSlot,
  ensureLibrary,
  findWorkflowForAsset,
  loadSlots,
  planModelSheet,
  resolveSlot,
  slotKeyForAction,
  slotKeyForPerspective,
  type LibraryEntry,
} from '../services/workflowLibrary';
import { publicarWorkflows } from '../services/publicarWorkflows';
import { generateImage, refinePrompt, ensureValidPngBase64DataUrl } from '../services/aiProvider';
import { safeImageSrc } from '../utils/imageUtils';
import PencilSparkleAnimation from './PencilSparkleAnimation';
import {
  Loader2,
  Image as ImageIcon,
  Download,
  Sparkles,
  Ban,
  Link as LinkIcon,
  Upload,
  X,
  Map as MapIcon,
  Scissors,
  Layers,
  Palette,
  Box,
  Server,
  CheckCircle,
  Trash2,
  RotateCcw,
  Power,
  Eraser,
  Wand2,
  Boxes,
  Dices,
  Square,
} from 'lucide-react';
import Tooltip from './Tooltip';

// --- ACOPLE: Creador de Mundos 2D / 2.5D (submodulo independiente) ---------
// Se carga de forma diferida para que el resto de la pestana ASSETS no pague
// el coste del editor mientras no se abre.
const WorldForge2D = lazy(() => import('../modules/creador2d/WorldForge2D'));
// Dialogo para dar de alta un sprite generado como bloque del Creador 2D.
const SendToCreador2D = lazy(() => import('../modules/creador2d/SendToCreador2D'));

interface AssetGeneratorProps {
  assets: GeneratedAsset[];
  setAssets: (assets: GeneratedAsset[] | ((prev: GeneratedAsset[]) => GeneratedAsset[])) => void;
  state: ProjectData['assetState'];
  updateState: (updates: Partial<ProjectData['assetState']>) => void;
  apiSettings?: ProjectData['apiSettings'];
  showTooltips?: boolean;
  /**
   * El Creador de Mundos 2D se vende como modulo aparte y lo abre la licencia.
   * Por defecto `false`: si el dato no llega, se muestra bloqueado en vez de
   * quedar abierto por accidente.
   */
  creador2dUnlocked?: boolean;
}

const AssetGenerator: React.FC<AssetGeneratorProps> = ({ assets, setAssets, state, updateState, apiSettings, showTooltips, creador2dUnlocked = false }) => {
  const { 
    mode, spriteName, worldName, selectedStyle, selectedAction, spriteDetails, worldDetails, negativePrompt, 
    spriteNegativePrompt, worldNegativePrompt,
    useConsistency, uploadedRef, customWorkflow, autoRemoveBackground, autoSlice, isActionSpriteSheet = false,
    useProceduralWorld = false, gameGenre = 'rpg', worldDensity = 'organic', emptySceneOnly = true,
    worldResolution = 1536, worldAspect = '1:1',
    spriteResolution = 1024, spriteAspect = '1:1',
    lockedSeed = null, loraTriggerWords = '', loraOwnsStyle = false,
    removeBgInWorkflow = false, rembgModel = 'BiRefNet_toonout',
    useChromaKeyGreen = false, spriteBgMode = 'white',
    useBasicBackgrounds = true
  } = state;

  /**
   * Prompt negativo del modo activo.
   *
   * Sprite y escenario necesitan exclusiones opuestas: el sprite pide "sin
   * sombra, centrado, sin borde de pegatina" y el mundo necesita justo esas
   * sombras para tener volumen y hora del dia, ademas de llenar el encuadre en
   * vez de centrarse. Con un solo campo compartido, refinar un sprite dejaba
   * esos terminos puestos y contaminaba el siguiente mundo.
   *
   * La reserva a `negativePrompt` cubre los proyectos guardados antes de la
   * separacion, cuyo valor migra a los dos campos al cargarlos.
   */
  const activeNegative =
    (mode === 'sprite' ? spriteNegativePrompt : worldNegativePrompt) ?? negativePrompt;

  const setActiveNegative = (value: string) =>
    updateState(mode === 'sprite' ? { spriteNegativePrompt: value } : { worldNegativePrompt: value });

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [lastDeleted, setLastDeleted] = useState<GeneratedAsset | null>(null);
  const [refining, setRefining] = useState(false);
  const abortRefineRef = useRef<AbortController | null>(null);

  /**
   * Biblioteca de workflows de `public/workflows/`.
   *
   * Se carga una vez y NO bloquea nada: si la carpeta esta vacia o el indice no
   * existe, la lista queda vacia y todo sigue funcionando con el workflow de
   * siempre. Es lo que garantiza que quien no configure nada no note ningun
   * cambio.
   */
  const [workflowLibrary, setWorkflowLibrary] = useState<LibraryEntry[]>([]);
  const [workflowSlots, setWorkflowSlots] = useState(() => loadSlots());
  /** Por que esta vacia la lista. Se enseña en la caja, no solo en consola. */
  const [workflowLibraryError, setWorkflowLibraryError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    ensureLibrary()
      .then((lib) => {
        if (vivo) setWorkflowLibrary(lib);
      })
      .catch((e) => {
        // Antes esto solo avisaba por consola y la caja desaparecia entera, de
        // modo que un fallo aqui era indistinguible de una funcion que no
        // existe. Ahora el motivo se ve en la propia caja.
        console.warn('[Omni IA Game] No se pudo cargar la biblioteca de workflows:', e);
        if (vivo) setWorkflowLibraryError(e?.message ?? 'No se pudo cargar la lista de workflows.');
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Sincronizar dinámicamente las ranuras asignadas (slots) con localStorage
  useEffect(() => {
    const syncSlots = () => {
      setWorkflowSlots(loadSlots());
    };
    syncSlots();
    window.addEventListener('focus', syncSlots);
    return () => window.removeEventListener('focus', syncSlots);
  }, [apiSettings]);

  /**
   * Ranura que corresponde a ESTA generacion.
   *
   * Una por accion, no por familia: el objetivo es poder probar que modelo hace
   * mejor cada accion y quedarse con el que gano. En Mundos la ranura es la de
   * la tuberia que de verdad se va a usar, calculada con la misma funcion que
   * usa el generador, para que lo que se muestra sea lo que ocurre.
   */
  const activeSlotKey =
    mode === 'background' ? slotKeyForPerspective(gameGenre || '') : slotKeyForAction(selectedAction);

  /** Como se llama, para la etiqueta de la caja. */
  const activeSlotLabel =
    mode === 'background' ? (PERSPECTIVE_LABEL[gameGenre] ?? 'Mundos') : selectedAction;

  /**
   * Workflow asignado a ESTA generacion.
   *
   * Ranura vacia = el workflow general de Ajustes, que es el comportamiento de
   * siempre. La asignacion se hace en Ajustes > Imagen.
   */
  const activeWorkflowSlot = workflowSlots[activeSlotKey];
  const activeWorkflowJson = activeWorkflowSlot?.jsonStr || null;

  /**
   * Al cambiar las asignaciones por accion, esta maquina republica sus
   * workflows para el agente de OmniDeploy. El volcado completo -las siete
   * secciones- lo hace App.tsx; aqui solo se avisa de que las ranuras
   * cambiaron, porque viven en almacenamiento local y App no se entera.
   */
  useEffect(() => {
    if (workflowLibrary.length === 0) return;
    publicarWorkflows(apiSettings);
  }, [workflowLibrary, workflowSlots]);

  const sheetWorkflow =
    mode === 'sprite' && selectedAction === 'Model Sheet' ? activeWorkflowSlot : null;
  const sheetWorkflowParsed = sheetWorkflow?.jsonStr ? (() => { try { return { workflow: JSON.parse(sheetWorkflow.jsonStr) }; } catch { return null; } })() : null;
  const sheetStrategy = planModelSheet(sheetWorkflowParsed as any);
  // ACOPLE: dentro del subtab Mundos se elige entre el generador por IA
  // existente y el nuevo creador de escenarios por bloques. El valor por
  // defecto conserva intacto el comportamiento anterior.
  const [worldTool, setWorldTool] = useState<'generator' | 'creator'>('generator');
  // ACOPLE: asset que se esta enviando al catalogo del Creador 2D.
  const [assetToPublish, setAssetToPublish] = useState<GeneratedAsset | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);


  const filteredAssets = assets.filter(asset => {
    const assetMode = asset.mode || 'sprite';
    return assetMode === mode;
  });

  const getLastAssetForCharacter = (): GeneratedAsset | undefined => {
    const nameToMatch = mode === 'sprite' ? spriteName : worldName;
    if (!nameToMatch) return undefined;
    return filteredAssets.find(a => a.prompt.toLowerCase().includes(nameToMatch.toLowerCase()));
  };

  const lastAsset = getLastAssetForCharacter();

  const getPlaceholder = (style: string, mode: 'sprite' | 'background', type: 'name' | 'details') => {
    const placeholders: Record<string, any> = {
      'Gothic / Dark Fantasy': {
        name: mode === 'sprite' ? "Ej: Caballero Oscuro, Gárgola..." : "Ej: Catedral en Ruinas, Bosque Maldito...",
        details: "Ej: atmósfera lúgubre, niebla densa, iluminación dramática de velas, arquitectura gótica, sombras profundas..."
      },
      'Colorful Fantasy': {
        name: mode === 'sprite' ? "Ej: Hada del Bosque, Unicornio..." : "Ej: Valle de los Dulces, Jardín Mágico...",
        details: "Ej: colores vibrantes, aura mágica, flores gigantes, cielo arcoíris, atmósfera alegre y brillante..."
      },
      'Cyberpunk': {
        name: mode === 'sprite' ? "Ej: Mercenario Cyborg, Drone..." : "Ej: Callejón de Neon, Megaciudad...",
        details: "Ej: luces de neón, lluvia nocturna, tecnología avanzada, cables expuestos, reflejos metálicos..."
      },
      'Pixel Art': {
        name: mode === 'sprite' ? "Ej: Guerrero 8-bit, Slime..." : "Ej: Calabozo Retro, Nivel 1-1...",
        details: "Ej: bordes definidos, paleta de colores limitada, estética retro de consola, sombreado por puntos (dithering)..."
      }
    };

    const styleData = placeholders[style] || {
      name: mode === 'sprite' ? "Ej: Nombre del sujeto..." : "Ej: Nombre del mundo...",
      details: "Ej: detalles visuales, clima, iluminación..."
    };

    return type === 'name' ? styleData.name : styleData.details;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateState({ uploadedRef: reader.result as string, useConsistency: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDownload = async (imageUrl: string, id: string) => {
    try {
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;

      const cleanB64 = await ensureValidPngBase64DataUrl(imageUrl);

      if (invokeFn) {
        const result = await invokeFn('save_image', {
          b64Data: cleanB64,
          filename: `asset-${id}.png`
        });
        alert(result);
        return;
      }

      if (imageUrl.startsWith('data:')) {
        const parts = imageUrl.split(';base64,');
        const contentType = parts[0].split(':')[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);

        for (let i = 0; i < rawLength; ++i) {
          uInt8Array[i] = raw.charCodeAt(i);
        }

        const blob = new Blob([uInt8Array], { type: contentType });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `asset-${id}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 100);
      } else {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `asset-${id}.png`;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error("Download failed:", err);
      alert("Error al descargar la imagen.");
    }
  };

  const removeBackground = (imageUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      console.log("[Omni IA Game] Processing with DeltaE-Aware Color Segmentation...");
      const img = new Image();
      img.crossOrigin = "anonymous";
      const cacheBustUrl = imageUrl.startsWith('data:') ? imageUrl : `${imageUrl}${imageUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
      img.src = cacheBustUrl;

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          reject("No context");
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        // 1. Identificar color de fondo predominante (Moda de las esquinas)
        const getPixel = (x: number, y: number) => {
          const i = (y * width + x) * 4;
          return [data[i], data[i+1], data[i+2]];
        };

        const samples = [
          getPixel(0,0), getPixel(width-1, 0),
          getPixel(0, height-1), getPixel(width-1, height-1),
          getPixel(Math.floor(width/2), 0), getPixel(0, Math.floor(height/2))
        ];

        // Usamos el primer sample como referencia base
        const refR = samples[0][0], refG = samples[0][1], refB = samples[0][2];

        // 2. Flood Fill Simple pero con tolerancia de color mejorada
        const visited = new Uint8Array(width * height);
        const queue: number[] = [];
        const threshold = 45; // Tolerancia equilibrada

        // Semillas: Todo el borde exterior + Escaneo de cuadrícula para áreas atrapadas
        for (let x = 0; x < width; x++) { queue.push(x); queue.push((height-1)*width+x); }
        for (let y = 1; y < height - 1; y++) { queue.push(y*width); queue.push(y*width+(width-1)); }

        // Semillas adicionales en cuadrícula para encontrar áreas blancas aisladas (entre piernas, etc.)
        const step = 20;
        for (let y = step; y < height - step; y += step) {
          for (let x = step; x < width - step; x += step) {
             const pos = y * width + x;
             const idx = pos * 4;
             const dist = Math.sqrt(Math.pow(data[idx]-refR,2)+Math.pow(data[idx+1]-refG,2)+Math.pow(data[idx+2]-refB,2));
             if (dist < threshold - 10) { // Un poco más estricto para las semillas internas
                queue.push(pos);
             }
          }
        }

        let head = 0;
        while (head < queue.length) {
          const pos = queue[head++];
          if (visited[pos]) continue;
          visited[pos] = 1;

          const idx = pos * 4;
          const r = data[idx], g = data[idx+1], b = data[idx+2];

          // Distancia Euclidiana de color
          const dist = Math.sqrt(
            Math.pow(r - refR, 2) +
            Math.pow(g - refG, 2) +
            Math.pow(b - refB, 2)
          );

          if (dist < threshold) {
            data[idx + 3] = 0; // Transparente

            const cx = pos % width;
            const cy = Math.floor(pos / width);

            if (cx + 1 < width) queue.push(pos + 1);
            if (cx - 1 >= 0) queue.push(pos - 1);
            if (cy + 1 < height) queue.push(pos + width);
            if (cy - 1 >= 0) queue.push(pos - width);
          }
        }

        // 3. Post-procesado: Suavizado de bordes (Opcional pero ayuda)
        // No aplicamos blur pesado para no dañar el pixel art

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject("Load error");
    });
  };

  const handleRemoveBackground = async (asset: GeneratedAsset) => {
    alert("Función de post-procesado desactivada. Use los nodos de su workflow para transparencia.");
  };

  const handleSlice = async (asset: GeneratedAsset) => {
    alert("Función de rebanado desactivada temporalmente para preservar calidad original.");
  };

  const handleDeleteAsset = (id: string) => {
    const asset = assets.find(a => a.id === id);
    if (asset) {
      setLastDeleted(asset);
      setAssets(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleRestore = () => {
    if (lastDeleted) {
      setAssets(prev => [lastDeleted, ...prev]);
      setLastDeleted(null);
    }
  };

  const handleGenerate = async () => {
    setLoading(true);
    setProgress(0);
    try {
      const currentName = mode === 'sprite' ? spriteName : worldName;
      const currentDetails = mode === 'sprite' ? spriteDetails : worldDetails;

      if (!currentName.trim()) {
        alert("Por favor, especifique un nombre para el sujeto o localización.");
        setLoading(false);
        return;
      }

      // 1. Matar proceso anterior y configurar nuevo AbortController
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      let imageUrl = "";
      let composedPrompt = "";

      if (mode === 'background') {
        if (useProceduralWorld) {
          // Los descriptores viven en `constants/promptDirectives.ts`, compartidos
          // con el refinador. Estaban duplicados aqui y solo los usaba este
          // boton: el refinador recibia las claves crudas y devolvia prompts
          // que decian "topdown_34 perspective" en vez de describir la camara.
          composedPrompt = `Location: ${currentName}, Perspective: ${describePerspective(gameGenre)}, Layout: ${describeDensity(worldDensity)}, Style: ${selectedStyle}`;
          if (currentDetails.trim()) {
            composedPrompt += `, Details: ${currentDetails}`;
          }
          if (emptySceneOnly) {
            composedPrompt += `, detailed style, empty background scene, no characters, no people, no NPCs, background environment only`;
          }
        } else {
          composedPrompt = `Location: ${currentName}, Style: ${selectedStyle}, Details: ${currentDetails}`;
        }
      } else {
        composedPrompt = `Entity: ${currentName}, Action: ${selectedAction}, Style: ${selectedStyle}, Details: ${currentDetails}`;
      }

      let referenceImage: string | undefined = undefined;
      // La consistencia visual sirve igual para un mundo que para un sprite:
      // subir un boceto o una imagen de referencia y pedir el mismo estilo con
      // otras indicaciones. Estaba limitada a sprites sin motivo tecnico.
      if (useConsistency) {
        if (uploadedRef) {
          referenceImage = uploadedRef;
        } else if (lastAsset) {
          referenceImage = lastAsset.imageUrl;
        }
      }

      // La hoja de modelo lleva su propio progreso, uno por vista: dejar
      // corriendo tambien el simulado hace que la barra pelee consigo misma.
      const usaProgresoPorVista = mode === 'sprite' && selectedAction === 'Model Sheet';

      // Simulación de progreso estable para evitar saturación de red/WebSocket
      const progressInterval = usaProgresoPorVista
        ? null
        : setInterval(() => {
            setProgress(prev => {
              if (prev < 90) return prev + Math.random() * 5;
              return prev;
            });
          }, 800);

      // Si una vista falla a mitad, el intervalo quedaba vivo para siempre:
      // antes la ventana era de una generacion y ahora es de cuatro.
      progressIntervalRef.current = progressInterval;

      /**
       * La hoja de modelo se genera en CUATRO PASADAS, una por vista.
       *
       * Pedirle las cuatro figuras en una sola imagen fallo cinco veces y cada
       * vez de forma distinta: tres con dos repetidas, cinco con una cortada,
       * seis con una corrupta. El numero de figuras no es algo que un modelo de
       * difusion controle, porque llena el ancho disponible.
       *
       * Y hay un problema mayor que el conteo: cuatro personajes en 2048 px
       * reciben ~512 px cada uno, frente a los ~1900 px de una figura sola. Son
       * dieciseis veces menos superficie, y eso no lo arregla ningun prompt.
       *
       * Cuesta cuatro pasadas -unos 20 s en una 3090- y a cambio cada vista
       * tiene el detalle de un retrato individual y siempre son exactamente
       * cuatro.
       */
      const esHojaDeModelo = mode === 'sprite' && selectedAction === 'Model Sheet';

      // UNA sola semilla para las cuatro pasadas. Con semillas distintas el
      // ruido inicial es distinto y salen cuatro criaturas diferentes, que es
      // justo lo contrario de una hoja de rotacion: un mismo personaje girado.
      // Se guarda lo que produjo la imagen. En la hoja de modelo las cuatro
      // pasadas comparten modelo, LoRAs y semilla, asi que basta la primera.
      let metaGeneracion: GenerationMeta | undefined;

      // Con el candado puesto se reutiliza esa semilla; sin el se sortea una,
      // compartida por las cuatro pasadas para que sea el mismo personaje.
      const semillaHoja = lockedSeed ?? Math.floor(Math.random() * 1000000000);

      // `override` permite que la hoja de modelo use SU workflow y SU negativo
      // sin tocar el camino normal: si no se pasa, todo queda como estaba.
      const generarVista = (
        prompt: string,
        vista?: string,
        override?: { workflowJson?: string; negative?: string },
      ) =>
        generateImage(
          prompt,
          override?.negative ?? activeNegative,
          apiSettings,
          referenceImage || undefined,
          mode,
          override?.workflowJson ?? activeWorkflowJson ?? (apiSettings?.image?.customWorkflow || undefined),
          {
            style: selectedStyle,
            action: selectedAction,
            details: currentDetails,
            autoRemoveBackground: mode === 'background' ? (autoRemoveBackground ?? false) : autoRemoveBackground,
            useChromaKeyGreen: mode === 'background' ? false : useChromaKeyGreen,
            spriteBgMode: mode === 'background' ? 'white' : spriteBgMode,
            useBasicBackgrounds: mode === 'background' ? true : useBasicBackgrounds,
          useProceduralWorld: useProceduralWorld,
          gameGenre: gameGenre,
          worldDensity: worldDensity,
          worldResolution: useProceduralWorld ? worldResolution : 0,
          outputResolution: mode === 'sprite'
            ? spriteResolution
            : (useProceduralWorld ? worldResolution : 0),
          worldAspect: mode === 'sprite' ? spriteAspect : worldAspect,
          removeBgInWorkflow: mode === 'sprite' ? removeBgInWorkflow : false,
          rembgModel: rembgModel,
          // Sustituye a la pose en esa pasada concreta.
          sheetView: vista,
          loraTriggerWords,
          loraOwnsStyle,
          // Mapeo del workflow asignado a este tipo de generacion. Sin ranura
          // asignada va `undefined` y la inyeccion se queda como estaba.
          workflowMapping: undefined,
          // Solo se fija en la hoja de modelo; el resto sigue aleatorio.
          // La hoja siempre fija semilla; el resto solo si hay candado.
          seed: vista ? semillaHoja : (lockedSeed ?? undefined),
          onGenerationMeta: (m) => { if (!metaGeneracion) metaGeneracion = m; },
        }, abortControllerRef.current!.signal);

      if (esHojaDeModelo && sheetStrategy.mode === 'single-pass' && sheetWorkflow) {
        /**
         * UNA sola generacion.
         *
         * Solo se llega aqui si el workflow asignado a la hoja trae un LoRA de
         * giro. Quien gira al sujeto es el LoRA, no el texto: se midio con
         * semilla fija y tres redacciones distintas que el modelo habitual
         * devuelve siempre el mismo perfil, asi que las tres pasadas de la rama
         * de abajo producian tres veces la misma vista.
         *
         * Con el LoRA cargado, la hoja completa sale en una pasada de unos 40
         * segundos frente a las tres pasadas mas la composicion.
         */
        setProgress(20);
        const sujetoHoja = neutraliseForTurnaround(subjectForSingleView(composedPrompt));

        // El sesgo humanoide de estos LoRAs se lleva por delante a cualquier
        // criatura, asi que se combate por el negativo, y SOLO cuando el sujeto
        // no es humano: pedirle a una hoja de caballero que no dibuje humanos
        // seria contraproducente.
        const esCriatura = /dinosaur|dragon|beast|creature|animal|wolf|bear|reptile|lizard|monster|dino|bestia|criatura|animal|lobo|oso|reptil|lagarto|monstruo/i.test(
          composedPrompt,
        );
        const negativoHoja = [
          activeNegative,
          ...SINGLE_PASS_SHEET_NEGATIVE,
          ...(esCriatura ? ['human', 'humanoid', 'person', 'clothing', 'uniform'] : []),
        ]
          .filter(Boolean)
          .join(', ');

        imageUrl = await generarVista(singlePassSheetPrompt(sujetoHoja), undefined, {
          workflowJson: sheetWorkflow?.jsonStr,
          negative: negativoHoja,
        });
      } else if (esHojaDeModelo) {
        const sujetoHoja = neutraliseForTurnaround(subjectForSingleView(composedPrompt));

        // Tres pasadas, no cuatro: el perfil opuesto se deriva por espejo.
        // Medido con semilla fija y tres redacciones -incluida una instruccion
        // de chat directa-, este modelo devuelve siempre el mismo perfil, asi
        // que pedirle el contrario gasta una pasada para obtener un duplicado.
        const vistas: string[] = [];
        for (let i = 0; i < SHEET_VIEWS.length; i += 1) {
          setProgress(Math.round((i / SHEET_VIEWS.length) * 85));
          vistas.push(await generarVista(sujetoHoja, SHEET_VIEWS[i].clause));
        }

        setProgress(90);
        const iPerfil = SHEET_VIEWS.findIndex((v) => v.key === 'left');
        const perfilOpuesto = await mirrorDataUrl(vistas[iPerfil]);

        // Orden de hoja: frente, izquierda, derecha, espalda.
        const ordenadas = [vistas[0], vistas[iPerfil], perfilOpuesto, vistas[2]];

        setProgress(95);
        // Si el modelo no supo girar al personaje, componer una hoja con
        // cuatro perfiles iguales seria un documento inutil sin decirlo.
        if (await viewsLookIdentical(vistas)) {
          alert(
            'Las vistas salieron casi iguales: este modelo no esta girando al personaje. La hoja se compone igual, pero para frente y espalda hara falta ControlNet u otro modelo.',
          );
        }

        imageUrl = await composeSheet(ordenadas, {
          background: spriteBgMode === 'transparent' ? 'transparent' : 'white',
        });
      } else {
        imageUrl = await generarVista(composedPrompt);
      }

      if (progressInterval) clearInterval(progressInterval);
      progressIntervalRef.current = null;
      setProgress(100);


      const newAsset: GeneratedAsset = {
        id: Date.now().toString(),
        imageUrl,
        prompt: mode === 'sprite' 
          ? `${currentName} - ${selectedStyle} - ${selectedAction}`
          : `${currentName} - ${selectedStyle}`,
        timestamp: Date.now(),
        mode,
        // Solo en sprites: en Mundos la accion no significa nada, la tuberia
        // se deduce del genero y la densidad.
        action: mode === 'sprite' ? selectedAction : undefined,
        generation: metaGeneracion
      };

      setAssets(prev => [newAsset, ...prev]);

      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      if (invokeFn) {
        // Correct syntax for Tauri v2 Notification Plugin (which uses an 'options' wrapper)
        await invokeFn('plugin:notification|notify', {
          options: {
            title: 'Omni IA Game - Asset Generado',
            body: `Se ha completado la generación de: ${currentName}`,
          }
        }).catch((e: any) => console.error("Notification error:", e));
      }
    } catch (error: any) {
      console.error("Asset generation failed:", error);
      alert(`Error creando asset: ${error.message || error}`);
    } finally {
      // Red de seguridad: si algo lanzo antes de limpiarlo, aqui se cierra.
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setLoading(false);
    }
  };

  // --- ACOPLE: subtab Mundos -> Creador de escenarios 2D / 2.5D ------------
  // El editor ocupa toda el area de la pestana. Es un submodulo autonomo: no
  // comparte estado, servicios ni base de datos con el generador por IA.
  //
  // `creador2dUnlocked` se comprueba TAMBIEN aqui y no solo en el boton: si el
  // modulo se apaga mientras esta abierto -expira la licencia, el servidor la
  // rechaza, o se desactiva el interruptor-, esta guarda lo cierra en el
  // siguiente render en vez de dejarlo a la vista.
  if (mode === 'background' && worldTool === 'creator' && creador2dUnlocked) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-6 py-2 border-b border-slate-800 bg-slate-950/40">
          <MapIcon className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Mundos</span>
          <div className="grid grid-cols-2 gap-1.5 w-64 bg-slate-950 p-1 rounded-lg border border-slate-800 ml-2">
            <Tooltip id="openWorldGenerator" showTooltips={showTooltips} inline>
              <button
                onClick={() => setWorldTool('generator')}
                className="w-full px-3 py-1 text-[10px] rounded uppercase font-bold transition-all text-slate-500 hover:text-slate-300"
              >
                Generador IA
              </button>
            </Tooltip>
            <Tooltip id="openCreador2D" showTooltips={showTooltips} inline>
              <button
                onClick={() => setWorldTool('creator')}
                className="w-full px-3 py-1 text-[10px] rounded uppercase font-bold transition-all bg-cyan-700 text-white"
              >
                Creador 2D
              </button>
            </Tooltip>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex items-center justify-center h-full text-slate-500 text-xs font-mono gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando editor de mundos...
              </div>
            }
          >
            <WorldForge2D onSalir={() => setWorldTool('generator')} />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-6 p-6">
      {/* Controls */}
      <div className={`w-1/3 flex flex-col gap-5 p-6 rounded-xl border transition-all duration-300 shadow-xl backdrop-blur-sm overflow-y-auto max-h-full scrollbar-thin ${
        mode === 'sprite' ? 'bg-slate-900/50 border-slate-800' : 'bg-blue-950/20 border-blue-900/30'
      }`}>
        <div className="flex items-center justify-between border-b border-slate-700 pb-2 sticky top-0 bg-slate-900/95 z-10 -mx-6 px-6">
          <h2 className={`text-2xl font-bold flex items-center gap-2 ${mode === 'sprite' ? 'text-blue-500' : 'text-cyan-400'}`}>
            {mode === 'sprite' ? <ImageIcon className="w-6 h-6" /> : <MapIcon className="w-6 h-6" />}
            {mode === 'sprite' ? 'Asset Foundry' : 'World Forge'}
          </h2>
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
             <Tooltip id="assetModeSprite" inline showTooltips={showTooltips} position="bottom">
               <button
                 onClick={() => updateState({ mode: 'sprite' })}
                 className={`px-3 py-1 text-[10px] rounded uppercase font-bold transition-all ${mode === 'sprite' ? 'bg-blue-900 text-white' : 'text-slate-500'}`}
               >
                 Sprites
               </button>
             </Tooltip>
             <Tooltip id="assetModeBackground" inline showTooltips={showTooltips} position="bottom">
                <button
                  onClick={() => updateState({ mode: 'background', autoRemoveBackground: false })}
                  className={`px-3 py-1 text-[10px] rounded uppercase font-bold transition-all ${mode === 'background' ? 'bg-cyan-700 text-white' : 'text-slate-500'}`}
                >
                 Mundos
               </button>
             </Tooltip>
          </div>
        </div>

        {/* ACOPLE: selector de herramienta dentro del subtab Mundos.
            Sin el modulo no se pinta NADA: ni el selector ni un boton
            deshabilitado. Un control visible pero bloqueado solo senala donde
            hay que hurgar para saltarselo. */}
        {mode === 'background' && creador2dUnlocked && (
          <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <Tooltip id="openWorldGenerator" showTooltips={showTooltips} inline>
              <button
                onClick={() => setWorldTool('generator')}
                className="w-full px-3 py-1.5 text-[10px] rounded uppercase font-bold transition-all bg-cyan-700 text-white"
              >
                Generador IA
              </button>
            </Tooltip>
            <Tooltip id="openCreador2D" showTooltips={showTooltips} inline>
              <button
                onClick={() => setWorldTool('creator')}
                className="w-full px-3 py-1.5 text-[10px] rounded uppercase font-bold transition-all text-slate-500 hover:text-slate-300"
              >
                Creador 2D
              </button>
            </Tooltip>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">
              {mode === 'sprite' ? 'Entidad / Objeto' : 'Localización / Bioma'}
            </label>
            <Tooltip id={mode === 'sprite' ? 'assetSpriteName' : 'assetWorldName'} showTooltips={showTooltips}>
              <input
                type="text"
                value={mode === 'sprite' ? spriteName : worldName}
                onChange={(e) => updateState(mode === 'sprite' ? { spriteName: e.target.value } : { worldName: e.target.value })}
                placeholder={getPlaceholder(selectedStyle, mode, 'name')}
                className="w-full bg-black/50 border border-blue-500/50 text-blue-100 p-2 rounded focus:border-blue-500 outline-none text-sm font-mono"
              />
            </Tooltip>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center gap-1">
              <Palette className="w-3 h-3" /> Estilo Artístico
            </label>
            <Tooltip id="assetStyle" showTooltips={showTooltips}>
              <select
                value={selectedStyle}
                onChange={(e) => updateState({ selectedStyle: e.target.value as ArtStyle })}
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-blue-500 outline-none text-sm"
              >
                {ART_STYLES.map(style => (
                  <option key={style} value={style}>{style}</option>
                ))}
              </select>
            </Tooltip>
          </div>

          {mode === 'sprite' && (
            <div>
              <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider">Acción / Pose</label>
              <Tooltip id="assetAction" showTooltips={showTooltips}>
                <select
                  value={selectedAction}
                  onChange={(e) => updateState({ selectedAction: e.target.value as ActionType })}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-blue-500 outline-none text-sm"
                >
                  {ACTIONS.map(action => (
                    <option key={action} value={action}>{action}</option>
                  ))}
                </select>
              </Tooltip>

              <div className="mt-2.5 bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!isActionSpriteSheet}
                    onChange={(e) => updateState({ isActionSpriteSheet: e.target.checked })}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                    <span>📊 Generar Secuencia Animada (Sprite Sheet)</span>
                  </span>
                </label>
                {isActionSpriteSheet && (
                  <p className="text-[11px] text-slate-400 font-mono pl-6 flex items-center gap-1">
                    <span className="text-amber-500 font-bold">●</span> {
                      selectedAction === 'Walk' ? '8 a 12 cuadros (ciclo completo de caminata)' :
                      selectedAction === 'Attack' ? '6 a 8 cuadros (anticipación, impacto y recuperación)' :
                      selectedAction === 'Jump' ? '6 a 8 cuadros (impulso, ápex y aterrizaje)' :
                      selectedAction === 'Idle' ? '4 a 6 cuadros (bucle sutil de respiración y reposo)' :
                      '6 a 8 cuadros secuenciales de movimiento'
                    }
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Workflow de ESTA generacion.
              Se muestra en los dos modos y para todas las acciones, no solo
              para la hoja de modelo: Idle, Walk, Attack, Jump, T-Pose y Static
              Object comparten la ranura "sprite", Mundos tiene la suya, y la
              hoja va aparte porque es la unica que necesita un modelo capaz de
              girar al sujeto.
              Vacio = el workflow general de Ajustes, es decir, exactamente el
              comportamiento anterior a que esto existiera. */}

          {/* Consistency — disponible en los dos modos. En Mundos permite subir
              un boceto o una referencia de estilo y generar el escenario con
              esa misma dirección artística, tanto en configuración estándar
              como en la avanzada: este bloque vive fuera del condicional de
              "Configuración Avanzada". */}
          <div className="bg-slate-950 p-3 rounded border border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <label className="text-slate-400 text-xs font-mono uppercase tracking-wider flex items-center gap-1">
                  <LinkIcon className="w-3 h-3 text-amber-500" />
                  Consistencia Visual
                  <span className={`ml-1 normal-case tracking-normal text-[9px] px-1.5 py-0.5 rounded border ${
                    mode === 'sprite'
                      ? 'text-blue-400 border-blue-900/50 bg-blue-950/30'
                      : 'text-cyan-400 border-cyan-900/50 bg-cyan-950/30'
                  }`}>
                    {mode === 'sprite' ? 'Sprites' : 'Mundos'}
                  </span>
                </label>
                <Tooltip id="assetConsistency" inline showTooltips={showTooltips}>
                  <input
                    type="checkbox"
                    checked={useConsistency}
                    onChange={(e) => updateState({ useConsistency: e.target.checked })}
                    className="accent-blue-600 w-4 h-4"
                  />
                </Tooltip>
              </div>

              <div className="space-y-2">
                {useConsistency ? (
                  <>
                    {uploadedRef ? (
                      <div className="relative group bg-blue-900/10 p-2 rounded border border-blue-500/30 flex items-center gap-2">
                         <img src={safeImageSrc(uploadedRef)} alt="Manual Ref" className="w-10 h-10 object-cover rounded bg-black" />
                         <div className="flex-1 overflow-hidden">
                           <p className="text-[10px] text-blue-400 font-bold uppercase">Ref. Manual</p>
                           <p className="text-[9px] text-slate-500 truncate">Cargada</p>
                         </div>
                         <button
                           onClick={() => updateState({ uploadedRef: null })}
                           className="p-1 hover:bg-red-500/20 text-red-500 rounded transition-colors"
                         >
                           <X className="w-4 h-4" />
                         </button>
                      </div>
                    ) : lastAsset?.imageUrl ? (
                      <div className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-700/50">
                         <img src={safeImageSrc(lastAsset.imageUrl)} alt="Auto Ref" className="w-8 h-8 object-cover rounded bg-black" />
                         <div className="flex-1 overflow-hidden">
                           <p className="text-[10px] text-slate-500 font-bold uppercase">Ref. Automática</p>
                           <p className="text-[9px] text-slate-400 truncate">{lastAsset.prompt}</p>
                         </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-600 italic px-1">Sin referencia activa.</p>
                    )}

                    <p className="text-[9px] text-slate-600 font-mono leading-snug px-1">
                      {mode === 'sprite'
                        ? 'Se usará como referencia de estilo para mantener el mismo personaje entre poses.'
                        : 'Suba un boceto o una imagen del estilo que busca: el escenario se generará con esa misma dirección artística, siguiendo las indicaciones del prompt.'}
                    </p>

                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept="image/*"
                      className="hidden"
                    />
                    <Tooltip id="assetUploadRef" showTooltips={showTooltips}>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-1.5 px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono rounded border border-slate-700 flex items-center justify-center gap-2 transition-all"
                      >
                        <Upload className="w-3 h-3" />
                        SUBIR BOCETO / REF
                      </button>
                    </Tooltip>
                  </>
                ) : (
                  <p className="text-[10px] text-slate-600 px-1">Consistencia desactivada.</p>
                )}
              </div>
            </div>

          {/* Resolución del sprite y recorte dentro del workflow */}
          {mode === 'sprite' && (
            <div className="bg-slate-950 p-3 rounded border border-slate-800 flex flex-col gap-3">
              <div>
                <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider">
                  Resolución del Sprite
                </label>
                <Tooltip id="spriteResolution" showTooltips={showTooltips}><select
                  value={spriteResolution}
                  onChange={(e) => updateState({ spriteResolution: Number(e.target.value) })}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-blue-500 outline-none text-xs"
                >
                  <option value={0}>La del workflow (no tocar)</option>
                  <option value={1024}>1024 — estándar</option>
                  <option value={1536}>1536 — más detalle</option>
                  <option value={2048}>2048 — máximo</option>
                </select></Tooltip>
              </div>

              <div>
                <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider">
                  Proporción del Lienzo
                </label>
                <Tooltip id="spriteAspect" showTooltips={showTooltips}><select
                  value={spriteAspect}
                  onChange={(e) => updateState({ spriteAspect: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-blue-500 outline-none text-xs"
                >
                  {ASPECT_OPTIONS.map((option) => (
                    <option key={option.key} value={option.key}>{option.label}</option>
                  ))}
                </select></Tooltip>

                {spriteResolution > 0 && (() => {
                  const { width, height } = computeDimensions(spriteResolution, spriteAspect);
                  const esHoja = selectedAction === 'Model Sheet';
                  const estrecho = esHoja && width / height < 1.4;
                  return (
                    <>
                      <p className="text-[9px] text-slate-600 font-mono mt-1 leading-snug">
                        Saldrá a {width} x {height} px
                        {esHoja ? ` · ${Math.round(width / 4)} px por vista` : ''}.
                      </p>
                      {estrecho && (
                        <div className="mt-1 flex items-start gap-1.5">
                          <p className="text-[9px] text-amber-500/90 font-mono leading-snug flex-1">
                            ▲ Cuatro figuras en fila (frente, izquierda, derecha y espalda) no caben
                            holgadas en este formato: quedan estrechas y el modelo tiende a soltar
                            la última. Se recomienda apaisado.
                          </p>
                          <button
                            type="button"
                            onClick={() => updateState({ spriteAspect: '16:9' })}
                            className="shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-700/60 text-amber-400 hover:bg-amber-900/30 transition"
                          >
                            Usar 16:9
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* El recorte dentro del workflow usa BiRefNet, entrenado para
                  esto; el de la aplicación es un relleno por inundación en JS.
                  No se "mutea" el nodo -el formato API no tiene ese campo- sino
                  que se inserta o se quita recableando. */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="rembg-wf" className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5">
                    <Eraser className="w-3 h-3 text-indigo-400" />
                    Quitar fondo en el workflow
                  </label>
                  <Tooltip id="removeBgInWorkflow" showTooltips={showTooltips}><input
                    id="rembg-wf"
                    type="checkbox"
                    checked={removeBgInWorkflow}
                    onChange={(e) => updateState({ removeBgInWorkflow: e.target.checked })}
                    className="accent-indigo-500 w-3.5 h-3.5 cursor-pointer"
                  /></Tooltip>
                </div>

                {removeBgInWorkflow ? (
                  <>
                    <Tooltip id="rembgModel" showTooltips={showTooltips}><select
                      value={rembgModel}
                      onChange={(e) => updateState({ rembgModel: e.target.value })}
                      className="w-full mt-1.5 bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-indigo-500 outline-none text-xs"
                    >
                      {REMBG_MODELS.map((m) => (
                        <option key={m.key} value={m.key}>{m.label}</option>
                      ))}
                    </select></Tooltip>
                    <p className="text-[9px] text-slate-600 font-mono mt-1 leading-snug">
                      Se inserta un nodo BiRefNet tras el decodificador y se recablea la salida.
                      Al desmarcar se quita y el cableado vuelve a su sitio. Recorta mucho mejor
                      los bordes suavizados que el recorte posterior de la app.
                    </p>
                  </>
                ) : (
                  <p className="text-[9px] text-slate-600 font-mono mt-1 leading-snug">
                    Desactivado: la imagen llega con fondo y, si tiene marcado «Auto Fondo», la
                    app lo recorta después por inundación.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Opciones de Fondo para Sprites */}
          {mode === 'sprite' && (
            <div className="bg-slate-950 p-3 rounded border border-slate-800 flex flex-col gap-2">
              <Tooltip id="spriteBasicBackgrounds" showTooltips={showTooltips} inline className="w-full">
                <div className="flex items-center justify-between">
                  <label htmlFor="basic-bg-toggle" className="text-[11px] font-mono text-slate-300 flex items-center gap-1.5 cursor-pointer">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">FONDOS BÁSICOS</span>
                  </label>
                  <input
                    id="basic-bg-toggle"
                    type="checkbox"
                    checked={useBasicBackgrounds}
                    onChange={(e) => updateState({ useBasicBackgrounds: e.target.checked })}
                    className="accent-indigo-500 w-3.5 h-3.5 cursor-pointer"
                  />
                </div>
              </Tooltip>

              {useBasicBackgrounds ? (
                <>
                  <div className="grid grid-cols-3 gap-1.5 mt-1">
                    <Tooltip id="spriteBgWhite" showTooltips={showTooltips} inline>
                      <button
                        type="button"
                        onClick={() => updateState({ spriteBgMode: 'white', useChromaKeyGreen: false })}
                        className={`w-full py-1.5 px-2 rounded text-[10px] font-mono border transition-all flex items-center justify-center gap-1 ${
                          (!spriteBgMode || spriteBgMode === 'white') && !useChromaKeyGreen
                            ? 'bg-slate-200 text-slate-950 border-white font-bold shadow'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        <span>⬜ Blanco</span>
                      </button>
                    </Tooltip>
                    <Tooltip id="spriteBgChroma" showTooltips={showTooltips} inline>
                      <button
                        type="button"
                        onClick={() => updateState({ spriteBgMode: 'chromakey', useChromaKeyGreen: true })}
                        className={`w-full py-1.5 px-2 rounded text-[10px] font-mono border transition-all flex items-center justify-center gap-1 ${
                          spriteBgMode === 'chromakey' || useChromaKeyGreen
                            ? 'bg-emerald-950 text-emerald-300 border-emerald-500 font-bold shadow'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        <span>🟩 Chroma</span>
                      </button>
                    </Tooltip>
                    <Tooltip id="spriteBgTransparent" showTooltips={showTooltips} inline>
                      <button
                        type="button"
                        onClick={() => updateState({ spriteBgMode: 'transparent', useChromaKeyGreen: false, autoRemoveBackground: true })}
                        className={`w-full py-1.5 px-2 rounded text-[10px] font-mono border transition-all flex items-center justify-center gap-1 ${
                          spriteBgMode === 'transparent'
                            ? 'bg-cyan-950 text-cyan-300 border-cyan-500 font-bold shadow'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                        }`}
                      >
                        <span>✨ Sin Fondo</span>
                      </button>
                    </Tooltip>
                  </div>
                  <p className="text-[9px] text-slate-600 font-mono leading-snug">
                    Activo: La IA genera con fondo sólido (Blanco/Chroma) o recorta el fondo si eliges «Sin Fondo».
                  </p>
                </>
              ) : (
                <p className="text-[9px] text-slate-500 font-mono leading-snug">
                  Desactivado: La IA generará el fondo y entorno que describas en tus detalles sin forzar fondos planos.
                </p>
              )}
            </div>
          )}

          {/* Mundos Procedurales / Wang Tiles (background mode) */}
          {mode === 'background' && (
            <div className="bg-slate-950 p-3 rounded border border-slate-800 shadow-[0_0_15px_rgba(34,211,238,0.05)]">
              <div className="flex items-center justify-between mb-3">
                <label className="text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <MapIcon className="w-3.5 h-3.5 text-cyan-400" />
                  📐 CONFIGURACIÓN DE ESCENA AVANZADA
                </label>
                <Tooltip id="assetProceduralCheck" inline showTooltips={showTooltips}>
                  <input
                    type="checkbox"
                    checked={useProceduralWorld}
                    onChange={(e) => updateState({ useProceduralWorld: e.target.checked })}
                    className="accent-cyan-500 w-4 h-4 cursor-pointer"
                  />
                </Tooltip>
              </div>

              {useProceduralWorld ? (
                <div className="space-y-3 pt-2 border-t border-slate-900 animate-in slide-in-from-top-1 duration-200">
                  <div>
                    <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider">
                      Perspectiva de Juego
                    </label>
                    <Tooltip id="assetPerspectiveSelect" showTooltips={showTooltips}>
                      <select
                        value={gameGenre}
                        onChange={(e) => updateState({ gameGenre: e.target.value as any })}
                        className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-cyan-500 outline-none text-xs"
                      >
                        <option value="topdown_34">Cenital Oblicuo 3/4 (Axonométrica RPG)</option>
                        <option value="topdown_90">Cenital Pura 90° (Overhead / Aerial)</option>
                        <option value="platformer_2d">Vista Lateral 2D (Side-Scroller)</option>
                        <option value="platformer_parallax">Vista Lateral 2.5D con Profundidad</option>
                        <option value="isometric_25d">Isométrica 2.5D Estricta (120°)</option>
                        <option value="fps_3d">Primera Persona 3D (FPS)</option>
                        <option value="third_person_3d">Tercera Persona 3D (Third-Person)</option>
                        <option value="isometric_3d">Perspectiva Táctica 3D (Ortográfica)</option>
                        <option value="rpg">RPG Estándar</option>
                        <option value="platformer">Plataformas Estándar</option>
                        <option value="isometric">Isométrico Estándar</option>
                        <option value="openworld">Mundo Abierto / Aventura</option>
                      </select>
                    </Tooltip>
                  </div>

                  <div>
                    <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider">
                      Composición / Capa de Escenario
                    </label>
                    <Tooltip id="assetTileDensitySelect" showTooltips={showTooltips}>
                      {/* Se ordenan por afinidad con la perspectiva, pero NO se
                          ocultan: desde que las reglas de encuadre distinguen la
                          familia de cámara, ningún par está roto. Ocultar
                          opciones obligaría a reasignar la selección al cambiar
                          de perspectiva, cambiándole en silencio algo que el
                          usuario había elegido. */}
                      <Tooltip id="worldDensity" showTooltips={showTooltips}><select
                        value={worldDensity}
                        onChange={(e) => updateState({ worldDensity: e.target.value as any })}
                        className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-cyan-500 outline-none text-xs"
                      >
                        {(() => {
                          const encaja = (k: string) => isRecommendedComposition(gameGenre, k);
                          const afines = COMPOSITION_OPTIONS.filter((o) => encaja(o.key));
                          const otras = COMPOSITION_OPTIONS.filter((o) => !encaja(o.key));
                          return (
                            <>
                              <optgroup label={`✓ Recomendadas para ${PERSPECTIVE_LABEL[gameGenre] ?? 'esta perspectiva'}`}>
                                {afines.map((o) => (
                                  <option key={o.key} value={o.key}>{o.label}</option>
                                ))}
                              </optgroup>
                              {otras.length > 0 && (
                                <optgroup label="Otras (funcionan, pero no encajan con esta cámara)">
                                  {otras.map((o) => (
                                    <option key={o.key} value={o.key}>{o.label}</option>
                                  ))}
                                </optgroup>
                              )}
                            </>
                          );
                        })()}
                      </select></Tooltip>
                    </Tooltip>
                    {(() => {
                      const aviso = explainComposition(gameGenre, worldDensity);
                      return aviso ? (
                        <p className="text-[9px] text-amber-500/90 font-mono mt-1 leading-snug flex gap-1">
                          <span className="shrink-0">▲</span>
                          <span>{aviso}</span>
                        </p>
                      ) : null;
                    })()}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                      Solo Escena Vacía (Sin NPCs)
                    </label>
                    <Tooltip id="assetEmptySceneCheck" inline showTooltips={showTooltips}>
                      <input
                        type="checkbox"
                        checked={emptySceneOnly}
                        onChange={(e) => updateState({ emptySceneOnly: e.target.checked })}
                        className="accent-cyan-500 w-3.5 h-3.5 cursor-pointer"
                      />
                    </Tooltip>
                  </div>

                  {/* La resolución no la decide el prompt sino el nodo de
                      latente del workflow. Hasta ahora no se inyectaba nunca:
                      un mapa completo salía al tamaño por defecto del workflow
                      y no admitía acercamiento. */}
                  <div>
                    <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider">
                      Resolución del Mundo
                    </label>
                    <Tooltip id="worldResolution" showTooltips={showTooltips}><select
                      value={worldResolution}
                      onChange={(e) => updateState({ worldResolution: Number(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-cyan-500 outline-none text-xs"
                    >
                      <option value={0}>La del workflow (no tocar)</option>
                      <option value={1024}>1024 x 1024 — rápido</option>
                      <option value={1536}>1536 x 1536 — recomendado</option>
                      <option value={2048}>2048 x 2048 — máximo detalle</option>
                    </select></Tooltip>
                    <p className="text-[9px] text-slate-600 font-mono mt-1 leading-snug">
                      {worldResolution === 0
                        ? 'Se respeta el tamaño que traiga su workflow.'
                        : `Se inyecta en el nodo de latente vacío del workflow (en el de Z-Image Turbo, el EmptySD3LatentImage, que viene a 1024). Todo modelo tiene un área con la que se entrenó: pasarse de ella produce elementos duplicados en vez de más detalle, así que si ve dos horizontes o dos aldeas, baje un escalón.`}
                    </p>
                  </div>

                  <div>
                    <label className="block text-slate-500 text-[10px] mb-1 font-mono uppercase tracking-wider">
                      Proporción del Lienzo
                    </label>
                    <Tooltip id="worldAspect" showTooltips={showTooltips}><select
                      value={worldAspect}
                      onChange={(e) => updateState({ worldAspect: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-cyan-500 outline-none text-xs"
                    >
                      {ASPECT_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select></Tooltip>
                    {worldResolution > 0 && (() => {
                      const { width, height } = computeDimensions(worldResolution, worldAspect);
                      return (
                        <p className="text-[9px] text-cyan-600/80 font-mono mt-1 leading-snug">
                          Saldrá a {width} x {height} px. La proporción reparte el mismo número de
                          píxeles en otra forma, en vez de estirar un lado: pasarse del área con la
                          que se entrenó el modelo produce elementos duplicados, no más detalle.
                        </p>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-600 px-1">Configuración avanzada desactivada (Usa el modo estándar).</p>
              )}
            </div>
          )}

          {/* Remoción de fondo opcional en Mundos (Desactivada por defecto) */}
          {mode === 'background' && (
            <div className="bg-slate-950 p-3 rounded border border-slate-800 flex items-center justify-between">
              <label htmlFor="world-auto-remove-bg" className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 cursor-pointer">
                <Eraser className="w-3.5 h-3.5 text-cyan-400" />
                Quitar fondo al generar escenario (Opcional)
              </label>
              <Tooltip id="assetWorldRemoveBg" inline showTooltips={showTooltips}>
                <input
                  id="world-auto-remove-bg"
                  type="checkbox"
                  checked={autoRemoveBackground ?? false}
                  onChange={(e) => updateState({ autoRemoveBackground: e.target.checked })}
                  className="accent-cyan-500 w-3.5 h-3.5 cursor-pointer"
                />
              </Tooltip>
            </div>
          )}


          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center justify-between">
              <span>Detalles Adicionales</span>
              {apiSettings?.promptEngineer?.enabled && (
                <Tooltip id="assetRefinePromptBtn" position="top" inline>
                  <button
                    onClick={async () => {
                      if (refining) {
                        if (abortRefineRef.current) {
                          abortRefineRef.current.abort();
                          abortRefineRef.current = null;
                        }
                        setRefining(false);
                        return;
                      }
                      const currentName = mode === 'sprite' ? spriteName : worldName;
                      const currentDetails = mode === 'sprite' ? spriteDetails : worldDetails;
                      if (!currentName.trim()) {
                        alert('Escribe un nombre primero para que la IA pueda refinar.');
                        return;
                      }
                      setRefining(true);
                      const controller = new AbortController();
                      abortRefineRef.current = controller;
                      try {
                        const idea = `${currentName}${currentDetails ? ', ' + currentDetails : ''}`;
                        const refined = await refinePrompt(idea, selectedStyle, mode, selectedAction, activeNegative, apiSettings, {
                          useChromaKeyGreen,
                          spriteBgMode,
                          useBasicBackgrounds,
                          useProceduralWorld,
                          gameGenre,
                          worldDensity,
                          worldAspect,
                          worldName,
                          emptySceneOnly,
                          isActionSpriteSheet,
                          autoRemoveBackground,
                          removeBgInWorkflow
                        }, controller.signal);
                        updateState(
                          mode === 'sprite'
                            ? { spriteDetails: refined.positive, spriteNegativePrompt: refined.negative }
                            : { worldDetails: refined.positive, worldNegativePrompt: refined.negative },
                        );
                      } catch (err: any) {
                        if (err?.name === 'AbortError' || String(err).includes('Aborted')) {
                          console.log('[AssetGenerator] Refinamiento de IA cancelado.');
                        } else {
                          alert(`Error del Prompt Engineer: ${err.message || err}`);
                        }
                      } finally {
                        setRefining(false);
                        abortRefineRef.current = null;
                      }
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold transition-all ${
                      refining
                        ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md shadow-red-900/40 cursor-pointer border border-red-500'
                        : 'bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 border border-amber-700/50'
                    }`}
                    title="Refinar prompt con IA"
                  >
                    {refining ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Wand2 className="w-3 h-3" />}
                    {refining ? '⏹ DETENER REFINADO' : '✨ REFINAR CON IA'}
                  </button>
                </Tooltip>
              )}
            </label>
            <Tooltip id={mode === 'sprite' ? 'assetSpritePrompt' : 'assetWorldPrompt'} showTooltips={showTooltips}>
              <textarea
                value={mode === 'sprite' ? spriteDetails : worldDetails}
                onChange={(e) => updateState(mode === 'sprite' ? { spriteDetails: e.target.value } : { worldDetails: e.target.value })}
                placeholder={getPlaceholder(selectedStyle, mode, 'details')}
                className="w-full h-20 bg-slate-800 border border-slate-700 text-slate-200 p-2 rounded focus:border-blue-500 outline-none resize-none text-sm"
              />
            </Tooltip>
          </div>

          <div>
            <label className="block text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center gap-1">
              <Ban className="w-3 h-3 text-red-400" />
              Prompt Negativo
              <span className={`ml-auto normal-case tracking-normal text-[9px] px-1.5 py-0.5 rounded border ${
                mode === 'sprite'
                  ? 'text-blue-400 border-blue-900/50 bg-blue-950/30'
                  : 'text-cyan-400 border-cyan-900/50 bg-cyan-950/30'
              }`}>
                {mode === 'sprite' ? 'Sprites' : 'Mundos'}
              </span>
            </label>
            <Tooltip id="assetNegativePrompt" showTooltips={showTooltips}>
              <textarea
                value={activeNegative}
                onChange={(e) => setActiveNegative(e.target.value)}
                placeholder={mode === 'sprite'
                  ? 'Ej: shadow, off-center, sticker, blurry...'
                  : 'Ej: characters, people, blurry, low quality...'}
                className="w-full h-14 bg-slate-950 border border-red-900/30 text-slate-300 p-2 rounded focus:border-blue-500 outline-none resize-none text-xs placeholder:text-slate-600"
              />
            </Tooltip>
            <p className="text-[9px] text-slate-600 font-mono mt-1 leading-snug">
              Cada modo guarda el suyo: un sprite necesita excluir las sombras que un escenario
              necesita tener.
            </p>
          </div>

          {/* Semilla.
              Aleatoria es lo correcto para producir; fijarla es lo que permite
              COMPARAR. Si al cambiar de modelo cambia tambien la semilla, no se
              sabe que causo la diferencia. */}
          <div>
            <label className="text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Dices className="w-3 h-3 text-emerald-400" />
              Semilla
              <span className={`ml-auto normal-case tracking-normal text-[9px] px-1.5 py-0.5 rounded border ${
                lockedSeed === null
                  ? 'text-slate-500 border-slate-800'
                  : 'text-emerald-400 border-emerald-900/60 bg-emerald-950/30'
              }`}>
                {lockedSeed === null ? 'Aleatoria' : 'Fija'}
              </span>
            </label>

            <div className="flex gap-1.5">
              <Tooltip id="seedValue" showTooltips={showTooltips}><input
                type="number"
                value={lockedSeed ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  updateState({ lockedSeed: v === '' ? null : Math.abs(Math.floor(Number(v))) || 0 });
                }}
                placeholder="aleatoria en cada generación"
                className="flex-1 min-w-0 bg-slate-950 border border-slate-800 text-slate-300 px-2 py-1.5 rounded outline-none text-xs font-mono focus:border-emerald-600 placeholder:text-slate-600"
              /></Tooltip>
              <Tooltip id="seedMode" showTooltips={showTooltips} inline><button
                type="button"
                onClick={() => updateState({ lockedSeed: Math.floor(Math.random() * 1000000000) })}
                title="Sortear una semilla y fijarla"
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[10px] font-mono transition"
              >
                Sortear
              </button></Tooltip>
              <Tooltip id="seedReuseLast" showTooltips={showTooltips} inline><button
                type="button"
                disabled={filteredAssets[0]?.generation?.seed === undefined}
                onClick={() => updateState({ lockedSeed: filteredAssets[0]!.generation!.seed! })}
                title="Reutilizar la semilla de la última imagen generada"
                className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 disabled:text-slate-700 text-slate-300 rounded border border-slate-700 disabled:border-slate-800 text-[10px] font-mono transition"
              >
                Última
              </button></Tooltip>
              {lockedSeed !== null && (
                <Tooltip id="seedRelease" showTooltips={showTooltips} inline><button
                  type="button"
                  onClick={() => updateState({ lockedSeed: null })}
                  title="Volver a semilla aleatoria"
                  className="px-2 py-1.5 bg-slate-800 hover:bg-red-900/40 text-slate-400 hover:text-red-400 rounded border border-slate-700 text-[10px] font-mono transition"
                >
                  Soltar
                </button></Tooltip>
              )}
            </div>

            <p className="text-[9px] text-slate-600 font-mono mt-1 leading-snug">
              {lockedSeed === null
                ? 'Cada generación usa una semilla distinta. Fíjela para comparar dos modelos, dos LoRAs o dos prompts con el mismo punto de partida.'
                : 'Fija. Cambie una sola cosa entre generaciones —el modelo, un LoRA, el prompt— y la diferencia será atribuible a ese cambio.'}
            </p>
          </div>

          {/* LoRA: su palabra de activacion tiene que llegar literal, y si el
              LoRA define el estilo hay que apartarse en vez de competir. */}
          <div>
            <label className="text-slate-400 text-xs mb-1 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-fuchsia-400" />
              LoRA
            </label>

            <Tooltip id="loraTrigger" showTooltips={showTooltips}><input
              value={loraTriggerWords}
              onChange={(e) => updateState({ loraTriggerWords: e.target.value })}
              placeholder="palabra de activación (ej: pixelsprite, arcane style)"
              className="w-full bg-slate-950 border border-slate-800 text-slate-300 px-2 py-1.5 rounded outline-none text-xs font-mono focus:border-fuchsia-600 placeholder:text-slate-600"
            /></Tooltip>

            <div className="flex items-center gap-2 mt-1.5">
              <Tooltip id="loraOwnsStyle" showTooltips={showTooltips}><input
                id="lora-style"
                type="checkbox"
                checked={loraOwnsStyle}
                onChange={(e) => updateState({ loraOwnsStyle: e.target.checked })}
                className="accent-fuchsia-500 w-3.5 h-3.5 cursor-pointer"
              /></Tooltip>
              <label htmlFor="lora-style" className="text-[10px] font-mono text-slate-400">
                El LoRA define el estilo
              </label>
            </div>

            <p className="text-[9px] text-slate-600 font-mono mt-1 leading-snug">
              {loraTriggerWords.trim()
                ? 'Irá la primera y literal en el prompt, sin que ningún dialecto la reescriba ni la envuelva en pesos.'
                : 'Muchos LoRAs solo se activan si su palabra aparece tal cual en el prompt. Escríbala aquí.'}
              {loraOwnsStyle
                ? ' La guía de estilo de la app se aparta: manda el LoRA.'
                : ' Márquelo si su LoRA ya trae el estilo, para que no compita con la guía de la app.'}
            </p>
          </div>



          {loading ? (
            <div className="flex gap-2 mt-2 relative">
              <button
                disabled={true}
                className="flex-1 py-3 font-bold rounded flex items-center justify-center gap-2 bg-emerald-500/20 text-emerald-400 cursor-not-allowed border border-emerald-500/30 overflow-hidden relative shadow-[0_0_15px_rgba(16,185,129,0.1)]"
              >
                {/* Capa de progreso verde esmeralda con pulso */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-emerald-500/40 transition-all duration-500 ease-out animate-pulse"
                  style={{ width: `${progress}%` }}
                ></div>
                <Loader2 className="animate-spin w-5 h-5 z-10" />
                <span className="z-10 font-bold tracking-widest">
                   {progress > 0 ? `GENERANDO... ${Math.floor(progress)}%` : 'GENERANDO...'}
                </span>
              </button>
              <button
                onClick={() => {
                   setLoading(false);
                   setProgress(0);
                   if (abortControllerRef.current) {
                     abortControllerRef.current.abort();
                   }
                   alert("Generación cancelada. El proceso ha sido detenido.");
                }}
                className="px-4 py-3 bg-red-900/30 hover:bg-red-800/50 text-red-400 border border-red-800 rounded font-bold transition-all flex items-center gap-2 shadow-lg"
                title="Detener generación"
              >
                <Power className="w-5 h-5" /> DETENER
              </button>
            </div>
          ) : (
            <>
              {/* Workflow de lo que se va a generar, aqui mismo.
                  Cambia con la accion -o con la perspectiva, en Mundos- y
                  escribe en la MISMA ranura que Ajustes > Imagen, asi que lo
                  que elijas aqui queda guardado para esa accion y se ve alli.
                  Esta justo encima del boton para poder cambiar de modelo y
                  generar sin abrir Ajustes. */}


              <Tooltip id="assetGenerateBtn" showTooltips={showTooltips}>
              <button
                onClick={handleGenerate}
                className={`w-full py-3 font-bold rounded flex items-center justify-center gap-2 transition-all shadow-lg mt-2 text-white ${
                  mode === 'sprite' ? 'bg-blue-700 hover:bg-blue-600' : 'bg-cyan-700 hover:bg-cyan-600'
                }`}
              >
                <Sparkles className="w-5 h-5" />
                GENERAR {mode === 'sprite' ? 'ASSET' : 'MUNDO'}
              </button>
            </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* Gallery */}
      <div className="w-2/3 overflow-y-auto pr-2 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-4">
           <h2 className="text-xl text-slate-400 font-mono uppercase tracking-widest">Bóveda de Assets</h2>
           <div className="flex items-center gap-4">
             {lastDeleted && (
               <button
                 onClick={handleRestore}
                 className="flex items-center gap-1.5 px-3 py-1 bg-amber-900/30 hover:bg-amber-800/50 text-amber-400 border border-amber-800 rounded text-[10px] font-bold transition-all animate-pulse"
               >
                 <RotateCcw className="w-3 h-3" /> RESTAURAR ÚLTIMO
               </button>
             )}
             <div className="text-[10px] text-slate-600 flex items-center gap-2">
               <Layers className="w-3 h-3" />
               TRANSPARENCIA Y REBANADO ACTIVO
             </div>
           </div>
        </div>

        {filteredAssets.length === 0 && (
          <div className="h-64 flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/30">
            <Box className="w-12 h-12 mb-2 opacity-20" />
            <p className="text-sm font-mono">No hay assets generados aún.</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {filteredAssets.map(asset => (
            <div key={asset.id} className="group bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg transition-all hover:border-blue-500/50 hover:shadow-blue-900/20">
              <div className="aspect-square bg-black relative flex items-center justify-center overflow-hidden">
                <img src={safeImageSrc(asset.imageUrl)} alt={asset.prompt} className="w-full h-full object-contain transition-transform group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
                   <div className="flex gap-2">
                     <Tooltip id="assetDownloadPng" inline showTooltips={showTooltips} position="top">
                       <button
                         onClick={() => handleDownload(asset.imageUrl, asset.id)}
                         className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center gap-2 text-xs font-bold transition-colors"
                         title="Descargar PNG"
                       >
                         <Download className="w-4 h-4" /> PNG
                       </button>
                     </Tooltip>
                     <button
                        onClick={() => handleSlice(asset)}
                        className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg flex items-center gap-2 text-xs font-bold transition-colors"
                        title="Rebanar Sprite"
                     >
                       <Scissors className="w-4 h-4" />
                     </button>
                     <button
                        onClick={() => handleRemoveBackground(asset)}
                        className="p-2 bg-indigo-900/50 hover:bg-indigo-600 text-white rounded-lg flex items-center gap-2 text-xs font-bold transition-colors"
                        title="Quitar Fondo"
                     >
                        <Eraser className="w-4 h-4" />
                     </button>
                     {/* ACOPLE: alta directa en el catalogo del Creador 2D. Solo
                         si la licencia trae el modulo: dar de alta un bloque en
                         un catalogo que no se puede abrir no lleva a ninguna
                         parte, y el backend tampoco estaria arrancado. */}
                     {creador2dUnlocked && (
                       <button
                          onClick={() => setAssetToPublish(asset)}
                          className="p-2 bg-cyan-800/70 hover:bg-cyan-600 text-white rounded-lg flex items-center gap-2 text-xs font-bold transition-colors"
                          title="Agregar al Creador 2D"
                       >
                          <Boxes className="w-4 h-4" /> 2D
                       </button>
                     )}
                     <button
                        onClick={() => handleDeleteAsset(asset.id)}
                        className="p-2 bg-red-900/50 hover:bg-red-600 text-white rounded-lg flex items-center gap-2 text-xs font-bold transition-colors"
                        title="Eliminar Asset"
                     >
                        <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                </div>
              </div>
              <div className="p-3 border-t border-slate-800">
                <p className="text-[10px] text-blue-400 font-mono font-bold uppercase mb-1">Asset ID: {asset.id}</p>
                <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed">{asset.prompt}</p>

                {/* Que produjo esta imagen. Sin esto, al probar modelos y LoRAs
                    una imagen buena no se puede reproducir. */}
                {asset.generation && (
                  <div className="mt-2 pt-2 border-t border-slate-800/70">
                    <Tooltip id="generationMetaSummary" showTooltips={showTooltips}>
                      <p className="text-[9px] font-mono text-slate-500 leading-snug break-words">
                        {summarizeMeta(asset.generation)}
                      </p>
                    </Tooltip>

                    {/* De registro a decision.
                        La app NO juzga que workflow salio mejor -eso solo lo
                        sabe quien mira la imagen-, pero si sabe con cual se
                        hizo. Ves un Idle que salio perfecto, pulsas, y esa
                        accion queda asignada a ese workflow. */}
                    {asset.generation.seed !== undefined && (
                      <Tooltip id="copySeed" showTooltips={showTooltips} inline><button
                        onClick={() => {
                          navigator.clipboard?.writeText(String(asset.generation!.seed));
                          alert(`Semilla ${asset.generation!.seed} copiada al portapapeles.`);
                        }}
                        className="mt-1 text-[9px] font-mono text-cyan-500 hover:text-cyan-300 transition"
                        title="Copiar la semilla para reproducir o comparar"
                      >
                        copiar semilla
                      </button></Tooltip>
                    )}
                    {asset.generation.notes.length > 0 && (
                      <p className="text-[9px] font-mono text-amber-600/80 mt-1 leading-snug">
                        {asset.generation.notes[0]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ACOPLE: dialogo de alta en el catalogo del Creador 2D. */}
      {assetToPublish && (
        <Suspense fallback={null}>
          <SendToCreador2D
            imageUrl={assetToPublish.imageUrl}
            suggestedName={assetToPublish.prompt.split(',')[0].slice(0, 60)}
            onClose={() => setAssetToPublish(null)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default AssetGenerator;
