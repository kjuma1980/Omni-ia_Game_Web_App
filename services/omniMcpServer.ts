/**
 * ---------------------------------------------------------------------------
 *  Servidor MCP y Despachador de Herramientas para Omni-IA Game (omniMcpServer)
 * ---------------------------------------------------------------------------
 *  Define y ejecuta las herramientas estándar bajo la especificación
 *  Model Context Protocol (MCP) para que tanto el Agente Fénix como
 *  cualquier agente externo (Claude Desktop, Antigravity, Cursor) puedan
 *  interactuar con Omni-IA Game y construir videojuegos completos.
 * ---------------------------------------------------------------------------
 */

import { saveFenixMemory, getFenixMemories } from './fenixDb';
import { generateImage } from './aiProvider';
import { ProjectData } from '../types';
import { describeStyle } from '../constants/promptDirectives';
import { directPosePrompt } from '../constants/poseDirectives';

export const STYLE_ALIAS_MAP: Record<string, string> = {
  PIXEL_ART: 'Pixel Art (16-bit)',
  RETRO_16BIT: 'Retro 8-bit',
  ANIME: 'Anime / Manga',
  CHIBI: 'Chibi / Kawaii',
  DARK_FANTASY: 'Gothic / Dark Fantasy',
  CYBERPUNK: 'Cyberpunk / Sci-Fi',
  VECTOR: 'Vector / Flat 2D',
  HAND_DRAWN: 'Hand Drawn / Sketch',
  REALISTIC: 'Realistic / Photorealistic',
  STUDIO_GHIBLI: 'Studio Ghibli',
  LOW_POLY: 'Low Poly 3D',
  CEL_SHADED: 'Cel Shaded',
  INK_WASH: 'Ink Wash / Sumi-e',
  WATERCOLOR: 'Watercolor / Painterly',
  COMIC_BOOK: 'Comic Book / Pop Art'
};

export function resolveOfficialStyle(rawStyle?: string): string {
  if (!rawStyle) return 'Gothic / Dark Fantasy';
  const clean = rawStyle.trim();
  const normalizedKey = clean.toUpperCase().replace(/[\s\-/]+/g, '_');
  if (STYLE_ALIAS_MAP[normalizedKey]) {
    return STYLE_ALIAS_MAP[normalizedKey];
  }
  return clean;
}

export interface OmniMcpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
      default?: any;
    }>;
    required?: string[];
  };
}

/**
 * Catálogo oficial de herramientas MCP expuestas por Omni-IA Game
 */
export const OMNI_MCP_TOOLS: OmniMcpTool[] = [
  {
    name: 'omni_create_sprite',
    description: 'Genera directamente un sprite 2D en segundo plano usando el motor de IA activo (ComfyUI local o Cloud) y devuelve la imagen renderizada (en base64) para previsualizar y guardar en el proyecto.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Descripción detallada del personaje, criatura o item a generar'
        },
        characterName: {
          type: 'string',
          description: 'Nombre identificador del asset (ej. Lobo_Alfa, Caballero_Sombra)'
        },
        style: {
          type: 'string',
          description: 'Estilo artístico oficial de Omni-IA Game (ej. "Gothic / Dark Fantasy", "Pixel Art (16-bit)", "Anime / Manga", "Low Poly 3D", etc.)'
        },
        action: {
          type: 'string',
          description: 'Pose o acción del personaje (ej. "Idle", "Walk", "Attack", "Jump", "T-Pose", "Model Sheet")',
          enum: ['Idle', 'Walk', 'Attack', 'Jump', 'T-Pose', 'Model Sheet', 'Static Object']
        },
        perspective: {
          type: 'string',
          description: 'Dirección o perspectiva',
          enum: ['FRONT', 'SIDE_RIGHT', 'SIDE_LEFT', 'ISOMETRIC', 'TOP_DOWN']
        },
        negativePrompt: {
          type: 'string',
          description: 'Prompt negativo opcional'
        },
        autoRemoveBackground: {
          type: 'boolean',
          description: 'Remover el fondo automáticamente y aislar el sprite con transparencia (cero sombras proyectadas)'
        },
        spriteBgMode: {
          type: 'string',
          description: 'Color de fondo base para recorte óptimo ("white" o "green")',
          enum: ['white', 'green']
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'omni_generate_sprite',
    description: 'Alias de omni_create_sprite. Genera directamente un sprite 2D con el motor de IA activo y devuelve la imagen en base64.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Descripción detallada del personaje o asset'
        },
        characterName: {
          type: 'string',
          description: 'Nombre del asset'
        },
        style: {
          type: 'string',
          description: 'Estilo artístico oficial'
        },
        action: {
          type: 'string',
          description: 'Pose o acción',
          enum: ['Idle', 'Walk', 'Attack', 'Jump', 'T-Pose', 'Model Sheet', 'Static Object']
        },
        perspective: {
          type: 'string',
          description: 'Dirección o perspectiva',
          enum: ['FRONT', 'SIDE_RIGHT', 'SIDE_LEFT', 'ISOMETRIC', 'TOP_DOWN']
        },
        negativePrompt: {
          type: 'string',
          description: 'Prompt negativo opcional'
        },
        autoRemoveBackground: {
          type: 'boolean',
          description: 'Remover fondo y aislar con transparencia'
        },
        spriteBgMode: {
          type: 'string',
          description: 'Color de fondo base para recorte ("white" o "chromakey")',
          enum: ['white', 'chromakey']
        }
      },
      required: ['prompt']
    }
  },
  {
    name: 'omni_get_project_summary',
    description: 'Obtiene un resumen del proyecto activo en Omni-IA Game: nombre, cantidad de assets creados por tipo (sprites, mundos, audio, 3D), motores activos y memorias registradas.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: {
          type: 'string',
          description: 'Identificador del proyecto (opcional, usa el activo por defecto)'
        }
      }
    }
  },
  {
    name: 'omni_record_project_memory',
    description: 'Guarda una decisión de diseño, regla de lore, estilo artístico o mecánica en la memoria a largo plazo del Agente Fénix.',
    inputSchema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description: 'Clave identificadora de la memoria (ej. "lore_villano", "mecanica_salto", "paleta_colores")'
        },
        category: {
          type: 'string',
          description: 'Categoría de la memoria',
          enum: ['game_genre', 'art_style', 'mechanics', 'character', 'lore', 'general']
        },
        content: {
          type: 'string',
          description: 'Contenido detallado de la decisión o conocimiento a recordar'
        }
      },
      required: ['key', 'category', 'content']
    }
  },
  {
    name: 'omni_craft_sprite_prompt',
    description: 'Genera una especificación técnica de prompt positivo y negativo calibrada con los pesos artísticos óptimos de Omni-IA Game para crear sprites consistentes en ComfyUI o Cloud.',
    inputSchema: {
      type: 'object',
      properties: {
        characterName: {
          type: 'string',
          description: 'Nombre del personaje o entidad'
        },
        roleOrArchetype: {
          type: 'string',
          description: 'Arquetipo (ej. Guerrero cibernético, Mago cósmico, Lobo feroz)'
        },
        style: {
          type: 'string',
          description: 'Estilo artístico oficial de Omni-IA Game (ej. "Gothic / Dark Fantasy", "Pixel Art (16-bit)", "Anime / Manga", etc.)'
        },
        action: {
          type: 'string',
          description: 'Pose o acción (ej. "Idle", "Walk", "Attack", "Jump", "T-Pose", "Model Sheet")',
          enum: ['Idle', 'Walk', 'Attack', 'Jump', 'T-Pose', 'Model Sheet', 'Static Object']
        },
        perspective: {
          type: 'string',
          description: 'Dirección o perspectiva',
          enum: ['FRONT', 'SIDE_RIGHT', 'SIDE_LEFT', 'ISOMETRIC', 'TOP_DOWN']
        },
        details: {
          type: 'string',
          description: 'Detalles visuales adicionales (pelaje, armadura, armas, colores, efectos)'
        },
        autoRemoveBackground: {
          type: 'boolean',
          description: 'Remover el fondo y garantizar recorte sin sombras en el suelo'
        },
        spriteBgMode: {
          type: 'string',
          description: 'Color de fondo base para recorte ("white" o "chromakey")',
          enum: ['white', 'chromakey']
        }
      },
      required: ['characterName', 'style', 'perspective']
    }
  },
  {
    name: 'omni_create_animation_plan',
    description: 'Crea el desglose de animación para hojas de sprites (Sprite Sheet 4x4) o secuencias de frames en Omni-IA Game, especificando timing, poses y transiciones.',
    inputSchema: {
      type: 'object',
      properties: {
        characterName: {
          type: 'string',
          description: 'Nombre del personaje'
        },
        actions: {
          type: 'string',
          description: 'Acciones requeridas separadas por coma (ej. Idle, Caminar, Ataque Ligero, Salto, Daño)'
        },
        frameRate: {
          type: 'string',
          description: 'Velocidad de fotogramas recomendada (ej. 8 FPS, 12 FPS, 24 FPS)'
        }
      },
      required: ['characterName', 'actions']
    }
  },
  {
    name: 'omni_generate_game_script',
    description: 'Genera un script funcional y listo para usar en el motor de juego elegido (Godot GDScript, Unity C#, Phaser JS) para controlar movimiento, salto, animaciones y combate.',
    inputSchema: {
      type: 'object',
      properties: {
        engine: {
          type: 'string',
          description: 'Motor de videojuegos objetivo',
          enum: ['godot', 'unity', 'phaser', 'web_canvas']
        },
        scriptType: {
          type: 'string',
          description: 'Tipo de script',
          enum: ['player_controller', 'enemy_ai', 'camera_follow', 'game_manager', 'inventory_system']
        },
        gameplayType: {
          type: 'string',
          description: 'Perspectiva o género jugable',
          enum: ['2d_platformer', 'top_down', 'isometric', 'side_scroller']
        },
        customFeatures: {
          type: 'string',
          description: 'Mecánicas adicionales (ej. doble salto, dash, disparo con enfriamiento)'
        }
      },
      required: ['engine', 'scriptType', 'gameplayType']
    }
  }
];

/**
 * Despachador de ejecución de herramientas MCP dentro del ecosistema de Omni-IA Game
 */
export const executeOmniMcpTool = async (
  toolName: string,
  args: Record<string, any>,
  context: {
    projectName?: string;
    projectId?: string;
    assetCount?: number;
    preferredEngine?: string;
    apiSettings?: ProjectData['apiSettings'];
    currentTab?: string;
  }
): Promise<{ success: boolean; result: any; message: string }> => {
  console.log(`[Omni MCP] ⚙️ Ejecutando herramienta "${toolName}" con argumentos:`, args);

  switch (toolName) {
    case 'omni_create_sprite':
    case 'omni_generate_sprite': {
      const {
        prompt,
        characterName,
        style,
        perspective = 'FRONT',
        action = 'Idle',
        negativePrompt,
        autoRemoveBackground = true,
        spriteBgMode = 'white'
      } = args;

      const officialStyle = resolveOfficialStyle(style);
      const styleInfo = describeStyle(officialStyle);
      const poseText = directPosePrompt(action, prompt || characterName || '')
        || `game character sprite in ${action} pose`;
      const perspectiveStr = (perspective || 'FRONT').toLowerCase().replace('_', ' ');

      let positivePrompt = `Full body centered master-level game sprite of ${prompt || characterName || 'game character'}, ${poseText}, ${perspectiveStr} view, ${styleInfo.positive}`;
      
      let defaultNegative = negativePrompt
        ? `${negativePrompt}, ${styleInfo.negative}`
        : `${styleInfo.negative}, deformed anatomy, missing limbs, extra limbs, extra fingers, malformed hands, blurry, lowres, text, watermark, signature, cropped limbs`;

      if (autoRemoveBackground !== false) {
        positivePrompt += `, isolated character on pure solid ${spriteBgMode === 'green' ? 'chroma key green' : 'white'} background, diffuse ambient lighting, shadowless, clean silhouette, game asset ready`;
        defaultNegative += `, shadow, drop shadow, ground shadow, cast shadow, contact shadow, floor shadow, ambient occlusion, white border, sticker, capsule background, badge, scenic background, noisy background`;
      }

      try {
        console.log(`[Omni MCP] 🎨 Generando sprite directamente con motor de IA...`);
        const imageResult = await generateImage(
          positivePrompt,
          defaultNegative,
          context.apiSettings,
          undefined,
          'sprite',
          undefined,
          {
            style: officialStyle,
            action: action || 'Idle',
            details: prompt || characterName || '',
            autoRemoveBackground: autoRemoveBackground !== false
          }
        );

        const cleanSuggestedName = (characterName || prompt || 'Sprite_Fenix')
          .slice(0, 24)
          .trim()
          .replace(/[^a-zA-Z0-9_\-\s]/g, '')
          .replace(/\s+/g, '_') || 'Sprite_Fenix';

        return {
          success: true,
          result: {
            prompt: prompt || characterName,
            characterName: cleanSuggestedName,
            positivePrompt,
            negativePrompt: defaultNegative,
            style: officialStyle,
            action: action || 'Idle',
            perspective,
            autoRemoveBackground: autoRemoveBackground !== false,
            spriteBgMode: spriteBgMode || 'white',
            imageBase64: imageResult,
            suggestedName: cleanSuggestedName,
            createdAt: Date.now()
          },
          message: `¡Sprite 2D para "${cleanSuggestedName}" generado con éxito!`
        };
      } catch (genErr: any) {
        console.error('[Omni MCP] Error generando sprite:', genErr);
        return {
          success: false,
          result: {
            prompt: prompt || characterName,
            characterName: characterName || 'Sprite_Fenix',
            positivePrompt,
            negativePrompt: defaultNegative,
            style: officialStyle,
            action: action || 'Idle',
            perspective,
            autoRemoveBackground: autoRemoveBackground !== false,
            spriteBgMode: spriteBgMode || 'white',
            error: genErr.message || 'Error de conexión con el motor de generación'
          },
          message: `Error al generar el sprite: ${genErr.message || 'Verifica el servicio ComfyUI o tu clave API.'}`
        };
      }
    }
    case 'omni_get_project_summary': {
      const memories = await getFenixMemories(context.projectId || 'current');
      return {
        success: true,
        result: {
          projectName: context.projectName || 'Proyecto Omni IA',
          projectId: context.projectId || 'current',
          assetCount: context.assetCount || 0,
          preferredEngine: context.preferredEngine || 'godot',
          savedMemoriesCount: memories.length,
          recentMemories: memories.slice(-5)
        },
        message: `Resumen del proyecto "${context.projectName || 'Omni IA'}" obtenido exitosamente.`
      };
    }

    case 'omni_record_project_memory': {
      const { key, category, content } = args;
      const mem = {
        id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        projectId: context.projectId || 'current',
        key,
        category,
        content,
        timestamp: Date.now()
      };
      await saveFenixMemory(mem);
      return {
        success: true,
        result: mem,
        message: `Memoria registrada en categoría "${category}" con clave "${key}".`
      };
    }

    case 'omni_craft_sprite_prompt': {
      const {
        characterName,
        roleOrArchetype,
        style,
        perspective = 'FRONT',
        action = 'Idle',
        details,
        autoRemoveBackground = true,
        spriteBgMode = 'white'
      } = args;

      const officialStyle = resolveOfficialStyle(style);
      const styleInfo = describeStyle(officialStyle);
      const poseText = directPosePrompt(action, `${characterName || ''} ${roleOrArchetype || ''}`)
        || `game character sprite in ${action} pose`;
      const perspectiveStr = (perspective || 'FRONT').toLowerCase().replace('_', ' ');

      const subjectDescriptor = `${characterName || 'Hero Character'}${roleOrArchetype ? `, ${roleOrArchetype}` : ''}`;
      
      let basePositive = `Full body centered master-level game sprite of ${subjectDescriptor}, ${details ? `${details}, ` : ''}${poseText}, ${perspectiveStr} view, ${styleInfo.positive}`;
      
      let baseNegative = `${styleInfo.negative}, deformed anatomy, missing limbs, extra limbs, extra fingers, malformed hands, blurry, lowres, text, watermark, signature, cropped limbs`;

      if (autoRemoveBackground !== false) {
        basePositive += `, isolated character on pure solid ${spriteBgMode === 'green' ? 'chroma key green' : 'white'} background, diffuse ambient lighting, shadowless, clean silhouette, game asset ready`;
        baseNegative += `, shadow, drop shadow, ground shadow, cast shadow, contact shadow, floor shadow, ambient occlusion, white border, sticker, capsule background, badge, scenic background, noisy background`;
      }

      return {
        success: true,
        result: {
          characterName: characterName || 'Sprite_Fenix',
          style: officialStyle,
          action: action || 'Idle',
          perspective,
          autoRemoveBackground: autoRemoveBackground !== false,
          spriteBgMode: spriteBgMode || 'white',
          positivePrompt: basePositive,
          negativePrompt: baseNegative,
          recommendedStep: 'Presiona [🎨 GENERAR EN EL ESTUDIO] para enviar este prompt y sincronizar los selectores de pose y estilo en la app.'
        },
        message: `Prompt optimizado creado para ${characterName || 'personaje'} en estilo ${officialStyle} con acción ${action || 'Idle'}.`
      };
    }

    case 'omni_create_animation_plan': {
      const { characterName, actions, frameRate } = args;
      const actionList = (actions as string).split(',').map(a => a.trim());
      
      const plan = actionList.map(action => ({
        action,
        frames: 4,
        loop: ['idle', 'walk', 'run'].includes(action.toLowerCase()),
        description: `Secuencia de 4 fotogramas para ${action} a ${frameRate || '12 FPS'}`
      }));

      return {
        success: true,
        result: {
          characterName,
          recommendedFrameRate: frameRate || '12 FPS',
          sheetLayout: 'Matriz 4x4 (4 poses clave x 4 fotogramas)',
          sequencePlan: plan,
          instruction: 'Puedes generar la pose base en ANIMACIÓN (Modo Clásico) e inyectar el spritesheet en el generador de video/hojas.'
        },
        message: `Plan de animación de ${actionList.length} acciones diseñado para ${characterName}.`
      };
    }

    case 'omni_generate_game_script': {
      const { engine, scriptType, gameplayType, customFeatures } = args;
      let codeSnippet = '';

      if (engine === 'godot') {
        codeSnippet = `extends CharacterBody2D\n\n# Generado por el Agente Fénix para Omni-IA Game\nconst SPEED = 250.0\nconst JUMP_VELOCITY = -450.0\nvar gravity = ProjectSettings.get_setting("physics/2d/default_gravity")\n@onready var sprite = $AnimatedSprite2D\n\nfunc _physics_process(delta):\n\tif not is_on_floor():\n\t\tvelocity.y += gravity * delta\n\n\tif Input.is_action_just_pressed("ui_accept") and is_on_floor():\n\t\tvelocity.y = JUMP_VELOCITY\n\n\tvar direction = Input.get_axis("ui_left", "ui_right")\n\tif direction != 0:\n\t\tvelocity.x = direction * SPEED\n\t\tsprite.flip_h = direction < 0\n\t\tsprite.play("walk")\n\telse:\n\t\tvelocity.x = move_toward(velocity.x, 0, SPEED)\n\t\tsprite.play("idle")\n\n\tmove_and_slide()\n`;
      } else if (engine === 'unity') {
        codeSnippet = `using UnityEngine;\n\n// Generado por el Agente Fénix para Omni-IA Game\npublic class PlayerController : MonoBehaviour\n{\n    public float speed = 6f;\n    public float jumpForce = 12f;\n    private Rigidbody2D rb;\n    private SpriteRenderer sr;\n    private bool isGrounded;\n\n    void Start() {\n        rb = GetComponent<Rigidbody2D>();\n        sr = GetComponent<SpriteRenderer>();\n    }\n\n    void Update() {\n        float move = Input.GetAxisRaw("Horizontal");\n        rb.velocity = new Vector2(move * speed, rb.velocity.y);\n        if (move != 0) sr.flipX = move < 0;\n\n        if (Input.GetButtonDown("Jump") && isGrounded) {\n            rb.velocity = new Vector2(rb.velocity.x, jumpForce);\n        }\n    }\n\n    void OnCollisionEnter2D(Collision2D col) {\n        if (col.gameObject.CompareTag("Ground")) isGrounded = true;\n    }\n    void OnCollisionExit2D(Collision2D col) {\n        if (col.gameObject.CompareTag("Ground")) isGrounded = false;\n    }\n}\n`;
      } else {
        codeSnippet = `// Phaser 3 Player Controller generado por Agente Fénix\nexport class Player extends Phaser.Physics.Arcade.Sprite {\n  constructor(scene, x, y) {\n    super(scene, x, y, 'player_sheet');\n    scene.add.existing(this);\n    scene.physics.add.existing(this);\n    this.setCollideWorldBounds(true);\n    this.cursors = scene.input.keyboard.createCursorKeys();\n  }\n\n  update() {\n    if (this.cursors.left.isDown) {\n      this.setVelocityX(-160);\n      this.setFlipX(true);\n      this.anims.play('walk', true);\n    } else if (this.cursors.right.isDown) {\n      this.setVelocityX(160);\n      this.setFlipX(false);\n      this.anims.play('walk', true);\n    } else {\n      this.setVelocityX(0);\n      this.anims.play('idle', true);\n    }\n\n    if (this.cursors.up.isDown && this.body.blocked.down) {\n      this.setVelocityY(-350);\n    }\n  }\n}\n`;
      }

      return {
        success: true,
        result: {
          engine,
          scriptType,
          gameplayType,
          customFeatures: customFeatures || 'Control de movimiento estándar',
          code: codeSnippet
        },
        message: `Script de ${scriptType} para ${engine} generado con éxito.`
      };
    }

    default:
      return {
        success: false,
        result: null,
        message: `Herramienta desconocida: "${toolName}".`
      };
  }
};
