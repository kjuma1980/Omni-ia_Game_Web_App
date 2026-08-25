export type ArtStyle = 
  | 'Pixel Art (8-bit)'
  | 'Pixel Art (16-bit)'
  | 'Pixel Art (HD)'
  | 'Low Poly 3D'
  | 'Realistic 3D (PBR)'
  | '2.5D Style'
  | 'Flat Vector'
  | 'Cartoon / Cel Shaded'
  | 'Digital Painting'
  | 'Watercolor'
  | 'Hand-drawn / Line Art'
  | 'Voxel Art'
  | 'Retro Low-Res 3D (PS1)'
  | 'Minimalist UI/UX'
  | 'Gothic / Dark Fantasy'
  | 'Colorful Fantasy'
  | 'Top-down'
  | 'Chibi / SD'
  | 'Stylized Realism'
  | 'Pre-rendered Sprites'
  | 'Silhouette Art'
  | 'Stylized / Soft Shading';

export type AnimationType = 
  | 'Walk Cycle'
  | 'Melee Attack'
  | 'Firearm Attack'
  | 'Sword Attack'
  | 'Blunt Weapon Attack'
  | 'Magic Attack'
  | 'Jump (Flip Forward)'
  | 'Jump (Flip Backward)'
  | 'Jump (Forward Displacement)'
  | 'Jump (Backward Displacement)'
  | 'Jump (Vertical Low)'
  | 'Jump (Vertical Mid)'
  | 'Jump (Vertical High)'
  | 'Jump (Over Character)'
  | 'Jump (Away from Character)'
  | 'Crouch'
  | 'Prone (Face Down)'
  | 'Supine (Face Up)'
  | 'Ground Roll (Right)'
  | 'Ground Roll (Left)'
  | 'Direct Hit'
  | 'Body Shot'
  | 'Injured'
  | 'Death'
  | 'Getting Up';

export type ActionType = 'Idle' | 'Walk' | 'Attack' | 'Jump' | 'Static Object' | 'T-Pose' | 'Model Sheet' | AnimationType;

export interface AssetPrompt {
  character: string;
  action: ActionType;
  style: ArtStyle;
  additionalDetails?: string;
  negativePrompt?: string;
}

export interface GeneratedAsset {
  id: string;
  imageUrl: string;
  prompt: string;
  timestamp: number;
  mode?: 'sprite' | 'background';
  /**
   * Accion con la que se genero.
   *
   * Se guarda para poder asignar su workflow a ESA accion desde la tarjeta:
   * ver una imagen buena y decir "usa esto siempre para Attack" solo funciona
   * si el asset recuerda que era un Attack. Opcional, porque los assets
   * anteriores a este campo no la tienen.
   */
  action?: string;
  /**
   * Que produjo esta imagen: modelo, LoRAs, semilla, muestreador y tamano.
   *
   * Sin esto, al probar modelos y LoRAs una imagen buena no se puede
   * reproducir ni se sabe a que se debio: la experimentacion no acumula.
   * Ver `services/generationMeta.ts`.
   */
  generation?: import('./services/generationMeta').GenerationMeta;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  type: 'text' | 'code' | 'audio_desc';
}

export enum TabView {
  ASSETS = 'ASSETS',
  ANIMATION = 'ANIMATION',
  CODE = 'CODE',
  AUDIO = 'AUDIO',
  NARRATIVE = 'NARRATIVE',
  NPCS = 'NPCS',
  THREE_D = 'THREE_D'
}

export interface NPCProfile {
  id: string;
  name: string;
  role: string;
  personality: string;
  initialRelationship: number;
  systemPrompt: string;
  greetings: string[];
  clueHints?: string[];
  codeword?: string;
  failureConditions?: string[];
  relationship: number; // Trust/Afinidad (0-100)
  chatHistory: { id: string; role: 'user' | 'model'; content: string }[];
}

export interface NPCState {
  npcs: NPCProfile[];
  activeNpcId: string | null;
  chatInput: string;
  isGenerating: boolean;
}


export interface ProjectData {
  id: string;
  name: string;
  showTooltips?: boolean;
  initialized?: boolean;
  assets: GeneratedAsset[];
  assetState: {
    mode: 'sprite' | 'background';
    spriteName: string;
    worldName: string;
    selectedStyle: ArtStyle;
    selectedAction: ActionType;
    spriteDetails: string;
    worldDetails: string;
    /**
     * Prompt negativo del modo activo. Se conserva por compatibilidad con los
     * proyectos ya guardados; al cargarlos su valor siembra los dos campos
     * separados de abajo, que son los que usa la interfaz.
     */
    negativePrompt: string;
    /**
     * Negativos separados por modo. Un sprite y un escenario necesitan
     * exclusiones opuestas: el sprite pide "sin sombra, centrado, sin borde de
     * pegatina" y el mundo necesita justo esas sombras para tener volumen y
     * hora del dia, ademas de llenar el encuadre en vez de centrarse.
     * Compartir un unico campo hacia que lo de uno contaminara al otro.
     */
    spriteNegativePrompt?: string;
    worldNegativePrompt?: string;
    useConsistency: boolean;
    uploadedRef: string | null;
    customWorkflow: string | null; // Workflow JSON as string
    autoRemoveBackground: boolean;
    autoSlice: boolean;
    isActionSpriteSheet?: boolean;
    useProceduralWorld?: boolean;
    gameGenre?: 'rpg' | 'platformer' | 'isometric' | 'openworld' | 'topdown_34' | 'topdown_90' | 'platformer_2d' | 'platformer_parallax' | 'isometric_25d' | 'fps_3d' | 'third_person_3d' | 'isometric_3d';
    worldDensity?: 'dense' | 'organic' | 'simple' | 'full_scene' | 'parallax_background' | 'parallax_midground' | 'parallax_foreground' | 'topdown_terrain' | 'topdown_props' | 'isometric_blocks' | 'isometric_decor' | 'sideview_platforms' | 'sideview_props' | 'dungeon_chamber' | 'cave_passage' | 'house_interior' | 'castle_hall';
    emptySceneOnly?: boolean;
    /**
     * Lado en pixeles de la imagen de mundo. Se inyecta en el nodo de latente
     * vacio del workflow. 0 = no tocar, respetar lo que traiga el workflow.
     */
    worldResolution?: number;
    /** Proporcion del lienzo: '1:1', '16:9', '9:16'... Ver `imageSizing.ts`. */
    worldAspect?: string;
    /** Lado en px de la salida en modo sprite. 0 = respetar el workflow. */
    spriteResolution?: number;
    /** Proporcion del lienzo en modo sprite, independiente de la de mundos. */
    spriteAspect?: string;
    /**
     * Semilla fija. `null` = aleatoria en cada generacion, que es lo correcto
     * para producir. Fijarla es lo que permite COMPARAR: si al cambiar de
     * modelo cambia tambien la semilla, no se sabe que causo la diferencia.
     */
    lockedSeed?: number | null;
    /**
     * Palabra de activacion del LoRA cargado en el workflow. Va la primera y
     * literal en el prompt: muchos LoRAs solo se activan si aparece tal cual.
     */
    loraTriggerWords?: string;
    /**
     * El LoRA define el estilo. Cuando esta marcado, la guia de estilo de la
     * app se aparta en vez de competir con el: dos direcciones artisticas
     * tirando de la misma imagen se estorban.
     */
    loraOwnsStyle?: boolean;
    /** Inserta el nodo de recorte en el workflow en vez de recortar en JS. */
    removeBgInWorkflow?: boolean;
    rembgModel?: string;
    useChromaKeyGreen?: boolean;
    spriteBgMode?: 'white' | 'chromakey' | 'transparent';
    useBasicBackgrounds?: boolean;
  };

  animationState: {
    selectedType: AnimationType;
    selectedStyle: ArtStyle;
    activePrinciples: string[];
    characterDesc: string;
    negativePrompt: string;
    resultImage: string | null;
    videoUrl: string | null;
    gifUrl: string | null;
    guideText: string | null;
    useConsistency: boolean;
    uploadedRef: string | null;
    customWorkflow: null | string; // Workflow JSON as string
    apiProvider: 'google' | 'deepseek';
    customApiKey: string;
    frames?: string[] | null;
    activeStep?: number;
    variants?: string[];
    selectedVariantIdx?: number | null;
    directionalPoses?: {
      front: string | null;
      right: string | null;
      left: string | null;
      back: string | null;
    };
    extractedFrames?: string[];
    isDefringed?: boolean;
    useRandomSeed?: boolean;
    customSeed?: number;
  };
  narrativeState: {
    idea: string;
    useAIExpansion: boolean;
    scriptES: string;
    scriptEN: string;
    selectedVoice: string;
    voiceEnthusiasm: number;
    useSpainSpanish: boolean;
    voiceSpeed: number;
    sfxDesc: string;
    musicDesc: string;
    monsterLevel: number;
    audioUrlES?: string | null;
    audioUrlEN?: string | null;
    useRandomSeed?: boolean;
    customSeed?: number;
  };
  audioState: {
    category: 'sfx' | 'music';
    sfx: {
      title: string;
      prompt: string;
      lyrics: string;
      language: string;
      isInstrumental: boolean;
      genre: string;
      style: string;
      singerGender: 'male' | 'female' | 'duet' | null;
      duration: number;
      injectDuration?: boolean;
      bpm?: number;
      audioUrl: string | null;
      isSoundscape?: boolean;
      useRandomSeed?: boolean;
      customSeed?: number;
    };
    music: {
      title: string;
      prompt: string;
      lyrics: string;
      language: string;
      isInstrumental: boolean;
      genre: string;
      style: string;
      singerGender: 'male' | 'female' | 'duet' | null;
      duration: number;
      injectDuration?: boolean;
      bpm?: number;
      audioUrl: string | null;
      isSoundscape?: boolean;
      useRandomSeed?: boolean;
      customSeed?: number;
    };
  };
  apiSettings: {
    ollama: {
      baseUrl: string;
      model: string;
      apiKey?: string;
    };
    text: {
      provider: 'gemini' | 'ollama' | 'lm-studio' | 'llama-server' | 'omnideploy' | 'anthropic' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'openrouter' | 'cometapi' | 'nvidia' | 'other';
      baseUrl: string;
      baseUrls?: { [provider: string]: string };
      model: string;
      apiKey?: string;
      apiKeys?: { [provider: string]: string };
      models?: { [provider: string]: string };
      /** OmniDeploy: el texto se genera con el Ollama del proveedor. */
      omniDeployApiKey?: string;
      omniDeployDeploymentId?: string;
    };
    npcs: {
      provider: 'gemini' | 'ollama' | 'lm-studio' | 'llama-server' | 'omnideploy' | 'anthropic' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'openrouter' | 'cometapi' | 'nvidia' | 'other';
      baseUrl: string;
      baseUrls?: { [provider: string]: string };
      model: string;
      apiKey?: string;
      apiKeys?: { [provider: string]: string };
      models?: { [provider: string]: string };
      /** OmniDeploy: el texto se genera con el Ollama del proveedor. */
      omniDeployApiKey?: string;
      omniDeployDeploymentId?: string;
    };
    image: {
      provider: 'gemini' | 'comfyui' | 'a1111' | 'ollama' | 'lm-studio' | 'openai' | 'midjourney-api' | 'comfydeploy' | 'omnideploy' | 'other';
      baseUrl: string;
      baseUrls?: { [provider: string]: string };
      model: string;
      workflowId?: string;
      apiKey?: string;
      comfyDeployApiKey?: string;
      comfyDeployDeploymentId?: string;

      /** OmniDeploy: GPU remota del proveedor. Ver auth-server/omnideploy. */

      omniDeployApiKey?: string;

      omniDeployDeploymentId?: string;
      customWorkflow?: string;
      apiKeys?: { [provider: string]: string };
      models?: { [provider: string]: string };
    };
    worldWorkflows?: {
      a: {
        provider: 'comfyui' | 'comfydeploy' | 'omnideploy' | 'a1111' | 'other';
        baseUrl: string;
        workflowId: string;
        customWorkflow?: string;
        comfyDeployApiKey?: string;
        comfyDeployDeploymentId?: string;

        /** OmniDeploy: GPU remota del proveedor. Ver auth-server/omnideploy. */

        omniDeployApiKey?: string;

        omniDeployDeploymentId?: string;
      };
      b: {
        provider: 'comfyui' | 'comfydeploy' | 'omnideploy' | 'a1111' | 'other';
        baseUrl: string;
        workflowId: string;
        customWorkflow?: string;
        comfyDeployApiKey?: string;
        comfyDeployDeploymentId?: string;

        /** OmniDeploy: GPU remota del proveedor. Ver auth-server/omnideploy. */

        omniDeployApiKey?: string;

        omniDeployDeploymentId?: string;
      };
      c: {
        provider: 'comfyui' | 'comfydeploy' | 'omnideploy' | 'a1111' | 'other';
        baseUrl: string;
        workflowId: string;
        customWorkflow?: string;
        comfyDeployApiKey?: string;
        comfyDeployDeploymentId?: string;

        /** OmniDeploy: GPU remota del proveedor. Ver auth-server/omnideploy. */

        omniDeployApiKey?: string;

        omniDeployDeploymentId?: string;
      };
    };
    video: {
      provider: 'gemini' | 'comfyui' | 'a1111' | 'ollama' | 'llama-server' | 'lm-studio' | 'seedance' | 'kling' | 'openart' | 'youart' | 'comfydeploy' | 'omnideploy' | 'other';
      baseUrl: string;
      baseUrls?: { [provider: string]: string };
      model?: string;
      workflowId?: string;
      apiKey?: string;
      comfyDeployApiKey?: string;
      comfyDeployDeploymentId?: string;

      /** OmniDeploy: GPU remota del proveedor. Ver auth-server/omnideploy. */

      omniDeployApiKey?: string;

      omniDeployDeploymentId?: string;
      customWorkflow?: string;
      promptNode?: string;
      negativeNode?: string;
      imageNode?: string;
      useAdvancedPipeline?: boolean;
      apiKeys?: { [provider: string]: string };
      models?: { [provider: string]: string };
    };
    audio: {
      ttsProvider: 'gemini' | 'ollama' | 'llama-server' | 'lm-studio' | 'comfyui' | 'elevenlabs' | 'suno' | 'local' | 'comfydeploy' | 'omnideploy' | 'other';
      ttsUrl: string;
      ttsUrls?: { [provider: string]: string };
      ttsModel: string;
      ttsWorkflowId?: string;
      ttsCustomWorkflow?: string;
      ttsComfyDeployApiKey?: string;
      ttsComfyDeployDeploymentId?: string;

      /** OmniDeploy: GPU remota del proveedor. Ver auth-server/omnideploy. */

      ttsOmniDeployApiKey?: string;

      ttsOmniDeployDeploymentId?: string;
 
      musicProvider: 'gemini' | 'comfyui' | 'a1111' | 'ollama' | 'llama-server' | 'lm-studio' | 'suno' | 'udio' | 'meta-audiocraft' | 'local' | 'comfydeploy' | 'omnideploy' | 'other';
      musicUrl: string;
      musicUrls?: { [provider: string]: string };
      musicModel: string;
      musicWorkflowId?: string;
      musicCustomWorkflow?: string;
      musicComfyDeployApiKey?: string;
      musicComfyDeployDeploymentId?: string;

      /** OmniDeploy: GPU remota del proveedor. Ver auth-server/omnideploy. */

      musicOmniDeployApiKey?: string;

      musicOmniDeployDeploymentId?: string;
      
      sfxModel: string;
      sfxUrl?: string;
      sfxWorkflowId?: string;
      sfxCustomWorkflow?: string;
      sfxComfyDeployApiKey?: string;
      sfxComfyDeployDeploymentId?: string;

      /** OmniDeploy: GPU remota del proveedor. Ver auth-server/omnideploy. */

      sfxOmniDeployApiKey?: string;

      sfxOmniDeployDeploymentId?: string;
      apiKey?: string;
      apiKeys?: { [provider: string]: string };
      ttsModels?: { [provider: string]: string };
      musicModels?: { [provider: string]: string };
      sfxModels?: { [provider: string]: string };
    };
    threeD: {
      provider: 'tripo' | 'meshy' | 'comfydeploy' | 'omnideploy' | 'comfyui' | 'a1111';
      baseUrl: string;
      baseUrls?: { [provider: string]: string };
      apiKey: string;
      model: string;
      workflowId?: string;
      customWorkflow?: string;
      promptNode?: string;
      negativeNode?: string;
      imageNode?: string;
      /**
       * OmniDeploy: GPU remota del proveedor.
       *
       * Campos PROPIOS y no reutilizando `baseUrl`/`apiKey` como hacia
       * ComfyDeploy aqui: con los compartidos, cambiar de proveedor pisaba las
       * credenciales del anterior y no habia donde pegar un Deployment ID.
       */
      omniDeployApiKey?: string;
      omniDeployDeploymentId?: string;
      apiKeys?: { [provider: string]: string };
    };
    code: {
      provider: 'gemini' | 'ollama' | 'lm-studio' | 'llama-server' | 'omnideploy' | 'anthropic' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'openrouter' | 'cometapi' | 'nvidia' | 'other';
      baseUrl: string;
      baseUrls?: { [provider: string]: string };
      model: string;
      apiKey?: string;
      apiKeys?: { [provider: string]: string };
      models?: { [provider: string]: string };
      /** OmniDeploy: el texto se genera con el Ollama del proveedor. */
      omniDeployApiKey?: string;
      omniDeployDeploymentId?: string;
    };
    promptEngineer: {
      enabled: boolean;
      useTextProvider: boolean;
      provider: 'gemini' | 'ollama' | 'lm-studio' | 'llama-server' | 'omnideploy' | 'anthropic' | 'openai' | 'deepseek' | 'qwen' | 'kimi' | 'openrouter' | 'cometapi' | 'nvidia' | 'other';
      /** OmniDeploy: el refinador tambien puede ir a la GPU del proveedor. */
      omniDeployApiKey?: string;
      omniDeployDeploymentId?: string;
      baseUrl: string;
      baseUrls?: { [provider: string]: string };
      model: string;
      models?: { [provider: string]: string };
      apiKey?: string;
      apiKeys?: { [provider: string]: string };
    };
    llamaCpp?: {
      baseUrl?: string;
      model?: string;
      modelPath?: string;
      hfToken?: string;
      modelsDir?: string;
      gpuLayers?: number;
      contextSize?: number;
      threads?: number;
      port?: number;
      customArgs?: string;
      binaryPath?: string;
    };
    enabledTabs?: {
      animation: boolean;
      npcs: boolean;
      threeD: boolean;
      /**
       * Creador de Mundos 2D. Opcional a proposito: los proyectos guardados
       * antes de que existiera el modulo no lo traen, y ahi `undefined` debe
       * comportarse como activo -igual que los otros tres-, porque quien manda
       * de verdad sobre este modulo es la licencia, no el interruptor.
       */
      creador2d?: boolean;
    };
    comfyuiPath?: string;
    /** Liberar VRAM/RAM automáticamente tras cada generación individual (Ollama, ComfyUI, Llama-Server) */
    autoFreeMemoryAfterGeneration?: boolean;
  };
  codeState: {
    messages: ChatMessage[];
    input: string;
  };
  threeDState?: {
    activeSubTab: string; // '3d_gen_texturizing' | 'rigging_animation'
    nestedTab: string; // '3d_gen' | 'texturize' | 'rigging' | 'animation'
    prompt: string;
    negativePrompt: string;
    referenceImage: string | null;
    useConsistency: boolean;
    resultModelUrl: string | null;
    resultModelType: 'glb' | 'gltf' | 'obj' | null;
    isGenerating: boolean;
    progressText: string;
    useRandomSeed?: boolean;
    customSeed?: number;
  };
  npcsState?: NPCState;
}

