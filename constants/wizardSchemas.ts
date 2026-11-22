/**
 * ---------------------------------------------------------------------------
 *  Esquemas y Directivas del Wizard Interactivo Multimodal (constants/wizardSchemas.ts)
 * ---------------------------------------------------------------------------
 *  Define los pasos interactivos, campos nativos de formulario (inputs, selects,
 *  píldoras, switches) y compiladores de prompts oficiales para los 8 módulos de
 *  Omni-IA Game:
 *  - ASSETS: Sprites y Personajes 2D
 *  - MUNDOS: Escenarios, Wang Tiles y Fondos Parallax
 *  - ANIMACION: Hojas de Sprites y Animación Fluida
 *  - NARRATIVA: Documentos GDD, Lore y Diálogos
 *  - NPCS: Comportamiento, Arquetipos y Voces
 *  - SCRIPTS: Código para Godot, Unity, Phaser
 *  - AUDIO: Música, Efectos SFX y Ambientes
 *  - SUITE 3D: Modelado, Mallas y Rigging
 * ---------------------------------------------------------------------------
 */

import { ART_STYLES } from '../constants';
import { describeStyle } from './promptDirectives';
import { directPosePrompt } from './poseDirectives';

export type WizardTabType = 'ASSETS' | 'MUNDOS' | 'ANIMACION' | 'NARRATIVA' | 'NPCS' | 'SCRIPTS' | 'AUDIO' | 'SUITE3D';

export interface WizardOption {
  value: string;
  label: string;
  description?: string;
  icon?: string;
  badge?: string;
}

export interface WizardOptionCategory {
  category: string;
  options: WizardOption[];
}

export type WizardFieldType = 'text-suggest' | 'select-categories' | 'radio-pills' | 'switch';

export interface WizardStepDefinition {
  id: string;
  title: string;
  subtitle: string;
  fieldType: WizardFieldType;
  placeholder?: string;
  suggestions?: string[];
  options?: WizardOption[];
  categories?: WizardOptionCategory[];
  switchLabels?: { on: string; off: string };
  defaultValue?: any;
}

export interface WizardTabSchema {
  tab: WizardTabType;
  tabLabel: string;
  title: string;
  description: string;
  icon: string;
  steps: WizardStepDefinition[];
}

/** Catálogo categorizado oficial de los 22 estilos artísticos para ASSETS y MUNDOS */
export const ART_STYLE_CATEGORIES: WizardOptionCategory[] = [
  {
    category: 'Pixel Art',
    options: [
      { value: 'Pixel Art (8-bit)', label: 'Pixel Art (8-bit)', description: 'Estética retro NES/GameBoy, paleta restringida' },
      { value: 'Pixel Art (16-bit)', label: 'Pixel Art (16-bit)', description: 'Estilo SNES/Genesis, rico sombreado y dithering' },
      { value: 'Pixel Art (HD)', label: 'Pixel Art (HD)', description: 'Alta resolución pixelada, detallado y moderno' }
    ]
  },
  {
    category: 'Render / Estética 3D (en Assets 2D)',
    options: [
      { value: 'Low Poly 3D', label: 'Low Poly 3D', description: 'Faceteado geométrico plano, estilo indie 3D renderizado' },
      { value: 'Realistic 3D (PBR)', label: 'Realistic 3D (PBR)', description: 'Texturas PBR con oclusión y relieve, acabado pre-render' },
      { value: 'Retro Low-Res 3D (PS1)', label: 'Retro Low-Res PS1', description: 'Nostalgia PlayStation 1, texturas afines y polígonos crudos' },
      { value: 'Voxel Art', label: 'Voxel Art', description: 'Construcción basada en bloques 3D volumétricos' },
      { value: 'Pre-rendered Sprites', label: 'Pre-rendered Sprites', description: 'Estilo Donkey Kong Country / Diablo 2' },
      { value: '2.5D Style', label: '2.5D Style', description: 'Perspectiva con profundidad aparente y capas 2.5D' }
    ]
  },
  {
    category: 'Ilustración & Dibujo',
    options: [
      { value: 'Cartoon / Cel Shaded', label: 'Cartoon / Cel Shaded', description: 'Bordes limpios entintados y colores planos brillantes' },
      { value: 'Flat Vector', label: 'Flat Vector', description: 'Formas vectoriales nítidas, estilo contemporáneo' },
      { value: 'Digital Painting', label: 'Digital Painting', description: 'Pintura digital rica en pinceladas e iluminación suave' },
      { value: 'Watercolor', label: 'Watercolor', description: 'Acuarela tradicional con veladuras y transparencias' },
      { value: 'Hand-drawn / Line Art', label: 'Hand-drawn / Line Art', description: 'Trazos a mano alzada y boceto orgánico' },
      { value: 'Chibi / SD', label: 'Chibi / SD', description: 'Proporciones super-deformed adorables y expresivas' },
      { value: 'Silhouette Art', label: 'Silhouette Art', description: 'Siluetas de alto contraste y sombras dramáticas' },
      { value: 'Stylized / Soft Shading', label: 'Stylized / Soft Shading', description: 'Degradados suaves y estética pulida de videojuego' },
      { value: 'Stylized Realism', label: 'Stylized Realism', description: 'Anatomía proporcionada con estilizado artístico' }
    ]
  },
  {
    category: 'Temáticos & Perspectiva',
    options: [
      { value: 'Gothic / Dark Fantasy', label: 'Gothic / Dark Fantasy', description: 'Atmósfera lúgubre, tonos oscuros y niebla siniestra' },
      { value: 'Colorful Fantasy', label: 'Colorful Fantasy', description: 'Mundos mágicos vivos, paleta vibrante y cálida' },
      { value: 'Minimalist UI/UX', label: 'Minimalist UI/UX', description: 'Iconografía sintética y legible' },
      { value: 'Top-down', label: 'Top-down', description: 'Vista cenital para mapas y tokens de rol' }
    ]
  }
];

export const WIZARD_SCHEMAS: Record<WizardTabType, WizardTabSchema> = {
  ASSETS: {
    tab: 'ASSETS',
    tabLabel: 'Assets 2D',
    title: 'Crear Sprite o Criatura',
    description: 'Asistente interactivo guiado para diseñar sprites con directivas oficiales AAA.',
    icon: 'Palette',
    steps: [
      {
        id: 'characterName',
        title: 'Nombre Técnico del Asset',
        subtitle: 'Elige un identificador técnico único para guardar y exportar el sprite.',
        fieldType: 'text-suggest',
        placeholder: 'Ej. Lobo_Feroz, Caballero_Sombra, Hechicera_Fuego...',
        suggestions: ['Lobo_Sombra', 'Caballero_Oscuro', 'Golem_Piedra', 'Hechicera_Arcana', 'Ciber_Ninja', 'Cazador_Vampiros'],
        defaultValue: 'Personaje_Heroe'
      },
      {
        id: 'style',
        title: 'Estilo Artístico Oficial',
        subtitle: 'Selecciona uno de los 22 estilos oficiales de Omni-IA Game (todos se generan directamente en Assets).',
        fieldType: 'select-categories',
        categories: ART_STYLE_CATEGORIES,
        defaultValue: 'Pixel Art (16-bit)'
      },
      {
        id: 'action',
        title: 'Pose o Postura del Personaje',
        subtitle: 'Define la acción o actitud con la que se dibujará el personaje.',
        fieldType: 'radio-pills',
        options: [
          { value: 'Idle', label: 'Idle (Reposo)', description: 'Postura neutral lista para animación en juego', badge: 'Estándar' },
          { value: 'Walk', label: 'Walk (Caminata)', description: 'En ciclo de avance lateral', badge: 'Acción' },
          { value: 'Attack', label: 'Attack (Ataque)', description: 'Blandiendo arma o poder en pose agresiva', badge: 'Combate' },
          { value: 'Jump', label: 'Jump (Salto)', description: 'En suspensión en el aire con momentum dinámico', badge: 'Ágil' },
          { value: 'Model Sheet', label: 'Model Sheet (Rotación)', description: 'Frente, perfil y 3/4 para referencia técnica', badge: 'Técnico' }
        ],
        defaultValue: 'Idle'
      },
      {
        id: 'format',
        title: 'Formato de Entrega',
        subtitle: '¿Deseas una pose individual o una cuadrícula de animación completa?',
        fieldType: 'radio-pills',
        options: [
          { value: 'single', label: 'Sprite Individual', description: 'Un solo fotograma de alta definición aislado', badge: 'Recomendado' },
          { value: 'sheet', label: 'Hoja de Sprites (Sheet 4x4)', description: 'Cuadrícula con 16 fotogramas secuenciales para animación', badge: 'Animable' }
        ],
        defaultValue: 'single'
      },
      {
        id: 'autoRemoveBackground',
        title: 'Tratamiento del Fondo',
        subtitle: 'Los sprites sin fondo se optimizan con luz envolvente difusa y exclusión estricta de sombras.',
        fieldType: 'switch',
        switchLabels: {
          on: 'Transparente / Sin Fondo (Listo para Motor de Juego)',
          off: 'Con Fondo Ilustrado (Escenario Completo)'
        },
        defaultValue: true
      }
    ]
  },

  MUNDOS: {
    tab: 'MUNDOS',
    tabLabel: 'WorldForge 2D',
    title: 'Crear Escenario o Tileset',
    description: 'Diseña escenarios completos, tilesets modulares o fondos parallax por capas.',
    icon: 'Globe',
    steps: [
      {
        id: 'worldName',
        title: 'Nombre del Escenario o Bioma',
        subtitle: 'Identificador del nivel o zona de tu juego.',
        fieldType: 'text-suggest',
        placeholder: 'Ej. Mazmorra_Lava, Ciudad_Neon, Bosque_Sombras...',
        suggestions: ['Mazmorra_Lava', 'Ciudad_Cyberpunk', 'Bosque_Encantado', 'Ruinas_Templo', 'Cueva_Cristal', 'Tundra_Helada'],
        defaultValue: 'Escenario_Nivel1'
      },
      {
        id: 'style',
        title: 'Estilo Artístico del Mundo',
        subtitle: 'Mantén la coherencia visual con tus personajes.',
        fieldType: 'select-categories',
        categories: ART_STYLE_CATEGORIES,
        defaultValue: 'Pixel Art (16-bit)'
      },
      {
        id: 'perspective',
        title: 'Perspectiva de la Cámara',
        subtitle: '¿Cómo verá el jugador el mundo en pantalla?',
        fieldType: 'radio-pills',
        options: [
          { value: 'topdown_34', label: 'Top-down Oblicuo (3/4)', description: 'Vista clásica de RPG estilo Zelda / Pokemon' },
          { value: 'platformer_2d', label: 'Plataformas Lateral (2D)', description: 'Vista lateral pura para juegos como Hollow Knight o Mario' },
          { value: 'isometric_25d', label: 'Isométrico 2.5D', description: 'Ángulo axonométrico de 120° estilo Diablo / Tactics' }
        ],
        defaultValue: 'topdown_34'
      },
      {
        id: 'density',
        title: 'Tipo de Elemento',
        subtitle: 'Elige si necesitas el nivel completo, una capa o un set de tiles.',
        fieldType: 'radio-pills',
        options: [
          { value: 'full_scene', label: 'Escenario Completo', description: 'Ilustración terminada del ambiente y atmósfera' },
          { value: 'parallax_background', label: 'Fondo Parallax', description: 'Capa lejana de cielo y horizonte sin obstáculos' },
          { value: 'topdown_terrain', label: 'Tileset de Terreno', description: 'Cuadrícula de suelo, caminos y transiciones modulares' }
        ],
        defaultValue: 'full_scene'
      }
    ]
  },

  ANIMACION: {
    tab: 'ANIMACION',
    tabLabel: 'Animación',
    title: 'Planificar Secuencia Animada',
    description: 'Genera ciclos de caminado, ataques y animaciones fluidas para tus sprites.',
    icon: 'Film',
    steps: [
      {
        id: 'animName',
        title: 'Nombre de la Animación',
        subtitle: 'Identificador de la acción para el Sprite Sheet.',
        fieldType: 'text-suggest',
        placeholder: 'Ej. Heroe_Caminata, Boss_AtaqueEspecial...',
        suggestions: ['Heroe_Caminata', 'Heroe_Salto', 'Enemigo_Ataque', 'Personaje_Muerte', 'Cofre_Apertura'],
        defaultValue: 'Animacion_Caminata'
      },
      {
        id: 'animAction',
        title: 'Tipo de Ciclo / Movimiento',
        subtitle: 'Acción que realizará la secuencia.',
        fieldType: 'radio-pills',
        options: [
          { value: 'Walk Cycle', label: 'Caminata (Walk Cycle)', description: 'Paso coordinado cíclico para desplazamiento' },
          { value: 'Run Cycle', label: 'Carrera (Run Cycle)', description: 'Velocidad e inclinación frontal dinámica' },
          { value: 'Melee Attack', label: 'Ataque Cuerpo a Cuerpo', description: 'Golpe, espada o impacto frontal' },
          { value: 'Jump', label: 'Salto e Impulso', description: 'Anticipación, elevación y aterrizaje' }
        ],
        defaultValue: 'Walk Cycle'
      },
      {
        id: 'engine',
        title: 'Motor de Render de Animación',
        subtitle: 'ComfyUI local con Flux o motor en la nube.',
        fieldType: 'radio-pills',
        options: [
          { value: 'comfyui', label: 'ComfyUI Local (Recomendado)', description: 'Flux 2 / SVD local con 0 costos y alta fidelidad' },
          { value: 'veo', label: 'Gemini Veo 3.1', description: 'Generación cinemática HD en la nube' }
        ],
        defaultValue: 'comfyui'
      }
    ]
  },

  NARRATIVA: {
    tab: 'NARRATIVA',
    tabLabel: 'Narrativa & GDD',
    title: 'Diseñar Guión y Documento de Diseño',
    description: 'Compón el trasfondo de tu videojuego, misiones y diálogos interactivos.',
    icon: 'BookOpen',
    steps: [
      {
        id: 'gameTitle',
        title: 'Título o Premisa del Videojuego',
        subtitle: 'El nombre o concepto principal de la obra.',
        fieldType: 'text-suggest',
        placeholder: 'Ej. Ecos del Abismo, CyberRevenge 2088...',
        suggestions: ['Ecos_del_Abismo', 'Cronicas_de_Aethelgard', 'Protocolo_CyberZero', 'La_Maldicion_de_Valdoria'],
        defaultValue: 'Mi_Proyecto_Juego'
      },
      {
        id: 'genre',
        title: 'Género de Juego',
        subtitle: 'Estilo jugable y marco estructural.',
        fieldType: 'radio-pills',
        options: [
          { value: 'survival_horror', label: 'Survival Horror', description: 'Tensión, recursos escasos y suspenso' },
          { value: 'action_rpg', label: 'Action RPG / Fantasía', description: 'Progresión, magia y exploración de mazmorras' },
          { value: 'metroidvania', label: 'Metroidvania', description: 'Mapa interconectado, habilidades y misterio' },
          { value: 'cyberpunk', label: 'Sci-Fi / Cyberpunk', description: 'Megacorporaciones, hackers y tecnología decadente' }
        ],
        defaultValue: 'survival_horror'
      },
      {
        id: 'deliverable',
        title: 'Documento a Producir',
        subtitle: 'Elige qué sección narrativa redactar.',
        fieldType: 'radio-pills',
        options: [
          { value: 'gdd', label: 'GDD Resumido (Game Design Document)', description: 'Visión, mecánicas, loop de juego y pilares' },
          { value: 'dialogues', label: 'Árbol de Diálogos con Opciones', description: 'Ramificaciones de conversación y respuestas' },
          { value: 'lore', label: 'Lore y Ficha de Facciones', description: 'Historia del mundo, aliados y enemigos' }
        ],
        defaultValue: 'gdd'
      }
    ]
  },

  NPCS: {
    tab: 'NPCS',
    tabLabel: 'NPCs & Diálogos',
    title: 'Crear Personaje no Jugador (NPC)',
    description: 'Define arquetipos, personalidad y voces bilingües para los habitantes de tu juego.',
    icon: 'Users',
    steps: [
      {
        id: 'npcName',
        title: 'Nombre del NPC',
        subtitle: 'Nombre o título del personaje en el juego.',
        fieldType: 'text-suggest',
        placeholder: 'Ej. Maestro_Eldrin, Posadero_Garrick, Sintetico_X7...',
        suggestions: ['Maestro_Eldrin', 'Posadero_Garrick', 'Sintetico_X7', 'Capitana_Valeria', 'Ermitaño_Ciego'],
        defaultValue: 'NPC_Guia'
      },
      {
        id: 'archetype',
        title: 'Arquetipo de Personaje',
        subtitle: 'Rol que desempeña en la trama.',
        fieldType: 'radio-pills',
        options: [
          { value: 'merchant', label: 'Comerciante / Mercader', description: 'Negocia objetos y comparte rumores' },
          { value: 'boss', label: 'Jefe de Zona (Boss)', description: 'Antagonista desafiante con presencia imponente' },
          { value: 'mentor', label: 'Mentor / Sabio', description: 'Enseña habilidades y otorga misiones' },
          { value: 'companion', label: 'Compañero Aliado', description: 'Lucha o viaja junto al protagonista' }
        ],
        defaultValue: 'merchant'
      },
      {
        id: 'voice',
        title: 'Voz Oficial Asignada',
        subtitle: 'Selecciona la voz para la síntesis bilingüe ES/EN.',
        fieldType: 'radio-pills',
        options: [
          { value: 'heroic_male', label: 'Heroic Male (Hombre Firme)' },
          { value: 'mystic_female', label: 'Mystic Female (Misteriosa)' },
          { value: 'ancient_sage', label: 'Ancient Sage (Sabio Anciano)' },
          { value: 'villain_deep', label: 'Villain Deep (Voz Profunda Oscura)' }
        ],
        defaultValue: 'heroic_male'
      }
    ]
  },

  SCRIPTS: {
    tab: 'SCRIPTS',
    tabLabel: 'Scripts de Código',
    title: 'Generar Script de Jugabilidad',
    description: 'Produce mecánicas de código listas para importar en tu motor de videojuegos.',
    icon: 'Code2',
    steps: [
      {
        id: 'engine',
        title: 'Motor de Videojuegos',
        subtitle: 'Selecciona el entorno donde compilarás o ejecutarás el juego.',
        fieldType: 'radio-pills',
        options: [
          { value: 'godot', label: 'Godot 4 (GDScript)', description: 'Scripts optimizados para nodos CharacterBody2D/3D', badge: 'Recomendado' },
          { value: 'unity', label: 'Unity (C#)', description: 'MonoBehaviour y componentes nativos de Unity' },
          { value: 'phaser', label: 'Phaser / Web (TypeScript)', description: 'Lógica 2D liviana para navegadores' }
        ],
        defaultValue: 'godot'
      },
      {
        id: 'systemType',
        title: 'Mecánica o Sistema',
        subtitle: '¿Qué comportamiento deseas programar?',
        fieldType: 'radio-pills',
        options: [
          { value: 'controller', label: 'Controlador de Movimiento', description: 'Movimiento, inercia, salto y gravedad fluida' },
          { value: 'combat', label: 'Sistema de Vida y Combate', description: 'Puntos de salud, daño, invulnerabilidad y muerte' },
          { value: 'enemy_ai', label: 'IA de Enemigo / Patrullaje', description: 'Máquina de estados para acechar y atacar' },
          { value: 'inventory', label: 'Gestor de Inventario', description: 'Recolección, ranuras y uso de items' }
        ],
        defaultValue: 'controller'
      }
    ]
  },

  AUDIO: {
    tab: 'AUDIO',
    tabLabel: 'Audio & Música',
    title: 'Diseñar Música o Efectos de Sonido',
    description: 'Genera bandas sonoras cinemáticas o efectos de sonido limpios para tu proyecto.',
    icon: 'Music',
    steps: [
      {
        id: 'audioType',
        title: 'Tipo de Audio',
        subtitle: '¿Necesitas música instrumental de fondo o un efecto sonoro puntual?',
        fieldType: 'radio-pills',
        options: [
          { value: 'music', label: '🎵 Música / Banda Sonora', description: 'Composiciones con tempo, atmósfera y loops' },
          { value: 'sfx', label: '🔊 Efecto de Sonido (SFX)', description: 'Sonidos cortos como impactos, pasos o explosiones' }
        ],
        defaultValue: 'music'
      },
      {
        id: 'mood',
        title: 'Atmósfera y Estilo',
        subtitle: 'Emoción o ambientación deseada.',
        fieldType: 'radio-pills',
        options: [
          { value: 'dark_horror', label: 'Terror Psicológico / Opresivo', description: 'Drones graves, susurros y silencios tensos' },
          { value: 'epic_battle', label: 'Batalla Épica', description: 'Orquesta enérgica, metales y percusión militar' },
          { value: 'cyber_synth', label: 'Cyberpunk / Retrowave', description: 'Sintetizadores análogos de los 80s y arpegios rápidos' },
          { value: 'peaceful_town', label: 'Pueblo Tranquilo / Posada', description: 'Guitarras acústicas y flautas cálidas' }
        ],
        defaultValue: 'dark_horror'
      },
      {
        id: 'duration',
        title: 'Duración Estimada',
        subtitle: 'Longitud en segundos para la pista.',
        fieldType: 'radio-pills',
        options: [
          { value: '30', label: '30 segundos', description: 'Loop rápido para prueba o menú' },
          { value: '60', label: '60 segundos (1 min)', description: 'Estándar para temas de exploración' },
          { value: '120', label: '120 segundos (2 min)', description: 'Pista extendida para combate o jefe' }
        ],
        defaultValue: '60'
      }
    ]
  },

  SUITE3D: {
    tab: 'SUITE3D',
    tabLabel: 'Suite 3D',
    title: 'Crear Modelo o Malla 3D',
    description: 'Genera modelos poligonales 3D (.glb) listos para visor orbital y exportación.',
    icon: 'Box',
    steps: [
      {
        id: 'meshName',
        title: 'Nombre del Modelo 3D',
        subtitle: 'Identificador del archivo .glb exportable.',
        fieldType: 'text-suggest',
        placeholder: 'Ej. Espada_Legendaria, Dragon_LowPoly, Casco_SciFi...',
        suggestions: ['Espada_Legendaria', 'Dragon_LowPoly', 'Casco_SciFi', 'Cofre_Tesoros', 'Nave_Exploradora'],
        defaultValue: 'Modelo_3D'
      },
      {
        id: 'style3d',
        title: 'Estilo de Malla 3D',
        subtitle: 'Tipo de poligonización y sombreado tridimensional.',
        fieldType: 'radio-pills',
        options: [
          { value: 'low_poly', label: 'Low Poly Estilizado', description: 'Pocos polígonos, ideal para juegos optimizados' },
          { value: 'realistic_pbr', label: 'Realista PBR', description: 'Superficies detalladas con mapas de rugosidad y metal' },
          { value: 'voxel_3d', label: 'Voxel Cúbico', description: 'Estilo volumétrico cúbico tipo Minecraft / Trove' }
        ],
        defaultValue: 'low_poly'
      }
    ]
  }
};

/**
 * Compila los valores del Wizard en un Prompt Maestro oficial de Omni-IA Game
 */
export function compileWizardOutput(
  tab: WizardTabType,
  values: Record<string, any>
): {
  prompt: string;
  negativePrompt: string;
  suggestedName: string;
  style?: string;
  action?: string;
  autoRemoveBackground?: boolean;
  extraSettings?: Record<string, any>;
} {
  switch (tab) {
    case 'ASSETS': {
      const name = values.characterName || 'Personaje_Sprite';
      const style = values.style || 'Pixel Art (16-bit)';
      const action = values.action || 'Idle';
      const format = values.format || 'single';
      const noBg = values.autoRemoveBackground !== false;

      const styleDesc = describeStyle(style);
      const poseDesc = directPosePrompt(action, name) || `${action} pose`;
      const isSheet = format === 'sheet';

      const promptParts: string[] = [
        `${name}, video game character sprite`,
        poseDesc,
        styleDesc.positive
      ];

      if (isSheet) {
        promptParts.push('4x4 sprite sheet, full animation cycle sequence, 16 individual animation frames organized in clean grid layout');
      }

      if (noBg) {
        promptParts.push('diffuse ambient lighting, shadowless, completely isolated on pure solid white background');
      }

      const negativeParts: string[] = [
        styleDesc.negative,
        'blurry, low quality, artifacts, watermark, signature, text, cropped',
        'distorted anatomy, deformed limbs'
      ];

      if (noBg) {
        negativeParts.push('shadow, drop shadow, ground shadow, cast shadow, floor shadow, ambient occlusion, white border, sticker outline, background elements');
      }

      return {
        prompt: promptParts.join(', '),
        negativePrompt: negativeParts.join(', '),
        suggestedName: name,
        style,
        action,
        autoRemoveBackground: noBg,
        extraSettings: { format }
      };
    }

    case 'MUNDOS': {
      const name = values.worldName || 'Escenario_Mundo';
      const style = values.style || 'Pixel Art (16-bit)';
      const perspective = values.perspective || 'topdown_34';
      const density = values.density || 'full_scene';
      const styleDesc = describeStyle(style);

      const prompt = `${name}, video game environment, ${styleDesc.positive}, perspective: ${perspective}, composition: ${density}, detailed scenery, atmospheric lighting, seamless level design`;
      const negativePrompt = `${styleDesc.negative}, character, person, sprite, blurry, text, watermark, low quality`;

      return {
        prompt,
        negativePrompt,
        suggestedName: name,
        style,
        extraSettings: { perspective, density }
      };
    }

    case 'ANIMACION': {
      const name = values.animName || 'Animacion_Sprite';
      const animAction = values.animAction || 'Walk Cycle';
      const engine = values.engine || 'comfyui';

      const prompt = `${name}, animated game sequence, ${animAction}, high frame rate consistency, fluid movement, keyframe poses, isolated background`;
      const negativePrompt = 'jitter, morphing, deformed anatomy, blurry, artifacts';

      return {
        prompt,
        negativePrompt,
        suggestedName: name,
        extraSettings: { animAction, engine }
      };
    }

    case 'NARRATIVA': {
      const title = values.gameTitle || 'Juego_GDD';
      const genre = values.genre || 'survival_horror';
      const deliverable = values.deliverable || 'gdd';

      const prompt = `Título: ${title}. Género: ${genre}. Generar documento estructurado de tipo: ${deliverable}. Incluir premisa, mecánicas centrales, progresión, arcos dramáticos y especificación técnica para producción en Omni-IA Game.`;

      return {
        prompt,
        negativePrompt: '',
        suggestedName: title,
        extraSettings: { genre, deliverable }
      };
    }

    case 'NPCS': {
      const name = values.npcName || 'NPC_Personaje';
      const archetype = values.archetype || 'merchant';
      const voice = values.voice || 'heroic_male';

      const prompt = `NPC: ${name}, Arquetipo: ${archetype}, Voz: ${voice}. Generar ficha de diseño de NPC con trasfondo, rasgos psicológicos, árbol de diálogo con ramificaciones y líneas de audio optimizadas para síntesis de voz.`;

      return {
        prompt,
        negativePrompt: '',
        suggestedName: name,
        extraSettings: { archetype, voice }
      };
    }

    case 'SCRIPTS': {
      const engine = values.engine || 'godot';
      const systemType = values.systemType || 'controller';

      const prompt = `Motor: ${engine}. Sistema: ${systemType}. Programar script limpio, comentado y modular con arquitectura desacoplada, gestión de entradas, manejo de estados y señales de eventos.`;

      return {
        prompt,
        negativePrompt: '',
        suggestedName: `Script_${systemType}`,
        extraSettings: { engine, systemType }
      };
    }

    case 'AUDIO': {
      const audioType = values.audioType || 'music';
      const mood = values.mood || 'dark_horror';
      const duration = values.duration || '60';

      const prompt = `Soundtrack: ${audioType}, Atmosphere: ${mood}, Target Duration: ${duration}s, immersive soundscape, high audio fidelity, clean mix, suitable for game background loop.`;
      const negativePrompt = 'vocals, speaking, clipping, distortion, low quality hiss';

      return {
        prompt,
        negativePrompt,
        suggestedName: `Audio_${mood}`,
        extraSettings: { audioType, mood, duration }
      };
    }

    case 'SUITE3D': {
      const name = values.meshName || 'Modelo_3D';
      const style3d = values.style3d || 'low_poly';

      const prompt = `3D asset: ${name}, style: ${style3d}, clean polygonal topology, game-ready asset, centered origin, optimized UV unwrapping.`;
      const negativePrompt = 'holes, non-manifold geometry, inverted normals, chaotic mesh';

      return {
        prompt,
        negativePrompt,
        suggestedName: name,
        extraSettings: { style3d }
      };
    }
  }
}
