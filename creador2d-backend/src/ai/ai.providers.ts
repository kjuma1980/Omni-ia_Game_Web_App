import { Logger, ServiceUnavailableException } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AppConfig } from '../common/config/configuration';
import { AI_PLAN_JSON_SCHEMA } from './ai.schemas';

export interface PlanRequest {
  system: string;
  user: string;
}

/**
 * Un proveedor devuelve UNICAMENTE texto JSON crudo. Toda la validacion vive
 * en `AiService`, de modo que ningun proveedor puede saltarse las reglas.
 */
export interface AiProvider {
  readonly name: string;
  generatePlan(request: PlanRequest): Promise<string>;
}

const REQUEST_TIMEOUT_MS = 120_000;

async function postJson(url: string, body: unknown, headers: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ServiceUnavailableException(
        `El proveedor respondio ${response.status}: ${detail.slice(0, 300)}`,
      );
    }

    return (await response.json()) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

/** Motor local. Es el predeterminado porque no requiere ninguna clave. */
export class OllamaProvider implements AiProvider {
  readonly name = 'ollama';

  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
  ) {}

  async generatePlan(request: PlanRequest): Promise<string> {
    const payload = await postJson(
      `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
      {
        model: this.model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      },
      {},
    );

    const message = payload.message as { content?: string } | undefined;
    return message?.content ?? '';
  }
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generatePlan(request: PlanRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: request.system,
      messages: [{ role: 'user', content: request.user }],
      // La salida estructurada garantiza que el plan llegue con la forma
      // exacta que despues valida Zod.
      output_config: {
        format: {
          type: 'json_schema',
          schema: AI_PLAN_JSON_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    });

    if (response.stop_reason === 'refusal') {
      throw new ServiceUnavailableException(
        'El proveedor rechazo la peticion por politicas de contenido',
      );
    }

    const text = response.content.find((block) => block.type === 'text');
    return text && text.type === 'text' ? text.text : '';
  }
}

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';

  constructor(private readonly apiKey: string) {}

  async generatePlan(request: PlanRequest): Promise<string> {
    const payload = await postJson(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
      },
      { authorization: `Bearer ${this.apiKey}` },
    );

    const choices = payload.choices as Array<{ message?: { content?: string } }> | undefined;
    return choices?.[0]?.message?.content ?? '';
  }
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';

  constructor(private readonly apiKey: string) {}

  async generatePlan(request: PlanRequest): Promise<string> {
    const payload = await postJson(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: 'user', parts: [{ text: request.user }] }],
        generationConfig: { responseMimeType: 'application/json' },
      },
      { 'x-goog-api-key': this.apiKey },
    );

    const candidates = payload.candidates as
      | Array<{ content?: { parts?: Array<{ text?: string }> } }>
      | undefined;

    return candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }
}

/**
 * Construye el proveedor solicitado. Las claves cloud se leen del entorno del
 * proceso backend y NUNCA se envian al navegador ni a los plugins.
 */
export function createProvider(config: AppConfig, requested?: string): AiProvider {
  const logger = new Logger('AiProviderFactory');
  const name = requested ?? config.ai.defaultProvider;

  switch (name) {
    case 'ollama':
      return new OllamaProvider(config.ai.ollamaBaseUrl, config.ai.ollamaModel);

    case 'anthropic': {
      const key = config.ai.keys.anthropic;
      if (!key) {
        throw new ServiceUnavailableException('El proveedor anthropic no tiene clave configurada');
      }
      return new AnthropicProvider(key);
    }

    case 'openai': {
      const key = config.ai.keys.openai;
      if (!key) {
        throw new ServiceUnavailableException('El proveedor openai no tiene clave configurada');
      }
      return new OpenAiProvider(key);
    }

    case 'gemini': {
      const key = config.ai.keys.gemini;
      if (!key) {
        throw new ServiceUnavailableException('El proveedor gemini no tiene clave configurada');
      }
      return new GeminiProvider(key);
    }

    default:
      logger.warn(`Proveedor desconocido "${name}"; se usa ollama local`);
      return new OllamaProvider(config.ai.ollamaBaseUrl, config.ai.ollamaModel);
  }
}
