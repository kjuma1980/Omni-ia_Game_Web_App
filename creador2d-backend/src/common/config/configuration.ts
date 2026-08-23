import { z } from 'zod';

/**
 * Esquema de configuracion. La aplicacion se niega a arrancar si falta algo
 * critico: es preferible un fallo ruidoso al arranque que una API a medio
 * configurar sirviendo peticiones autenticadas con secretos por defecto.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4310),
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CORS_ORIGINS: z.string().default('http://localhost:3142'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_TTL: z.string().default('900s'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  /**
   * Secreto de enlace con Omni IA Game.
   *
   * Permite acunar una sesion local a partir de la cuenta ya validada en la
   * nube, sin pedir un segundo usuario y contrasena. Lo genera el arrancador en
   * el primer inicio y solo puede leerlo la aplicacion, que vive en la misma
   * maquina.
   *
   * VACIO POR DEFECTO, y vacio significa DESACTIVADO. Sin esto, cualquier
   * pagina web abierta en el navegador podria hacer una peticion a
   * `127.0.0.1:4310` y acunarse una sesion con el correo que se le antojara.
   */
  OMNI_LINK_SECRET: z.string().default(''),

  AI_ENABLED: z
    .string()
    .default('false')
    .transform((value) => value.toLowerCase() === 'true'),
  AI_DEFAULT_PROVIDER: z.enum(['ollama', 'gemini', 'openai', 'anthropic']).default('ollama'),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('llama3.1'),
  GEMINI_API_KEY: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  ANTHROPIC_API_KEY: z.string().optional().default(''),

  // --- Generacion de fondos de parallax con ComfyUI local -------------------
  // Reutiliza el ComfyUI que Omni IA Game ya levanta. No requiere clave.
  COMFYUI_BASE_URL: z.string().default('http://127.0.0.1:8188'),
  COMFYUI_BG_CHECKPOINT: z.string().default('dreamshaperXL_lightningDPMSDE.safetensors'),
  // Los checkpoints "lightning" convergen en 6-8 pasos con CFG bajo.
  COMFYUI_BG_STEPS: z.coerce.number().int().min(1).max(150).default(8),
  COMFYUI_BG_CFG: z.coerce.number().min(0).max(30).default(2),
  COMFYUI_BG_SAMPLER: z.string().default('dpmpp_sde'),
  COMFYUI_BG_SCHEDULER: z.string().default('karras'),
});

export type AppConfig = {
  databaseUrl: string;
  port: number;
  host: string;
  nodeEnv: 'development' | 'test' | 'production';
  corsOrigins: string[];
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  /** Secreto de enlace con la app anfitriona. Vacio = enlace desactivado. */
  linkSecret: string;
  ai: {
    enabled: boolean;
    defaultProvider: 'ollama' | 'gemini' | 'openai' | 'anthropic';
    ollamaBaseUrl: string;
    ollamaModel: string;
    keys: Record<string, string>;
  };
  backgrounds: {
    comfyBaseUrl: string;
    comfyCheckpoint: string;
    steps: number;
    cfg: number;
    sampler: string;
    scheduler: string;
  };
};

export function loadConfiguration(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuracion de entorno invalida:\n${details}`);
  }

  const env = parsed.data;

  return {
    databaseUrl: env.DATABASE_URL,
    port: env.PORT,
    host: env.HOST,
    nodeEnv: env.NODE_ENV,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    linkSecret: env.OMNI_LINK_SECRET,
    ai: {
      enabled: env.AI_ENABLED,
      defaultProvider: env.AI_DEFAULT_PROVIDER,
      ollamaBaseUrl: env.OLLAMA_BASE_URL,
      ollamaModel: env.OLLAMA_MODEL,
      keys: {
        gemini: env.GEMINI_API_KEY,
        openai: env.OPENAI_API_KEY,
        anthropic: env.ANTHROPIC_API_KEY,
      },
    },
    backgrounds: {
      comfyBaseUrl: env.COMFYUI_BASE_URL.replace(/\/$/, ''),
      comfyCheckpoint: env.COMFYUI_BG_CHECKPOINT,
      steps: env.COMFYUI_BG_STEPS,
      cfg: env.COMFYUI_BG_CFG,
      sampler: env.COMFYUI_BG_SAMPLER,
      scheduler: env.COMFYUI_BG_SCHEDULER,
    },
  };
}
