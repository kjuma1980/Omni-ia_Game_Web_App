
export const PROMPT_GLOSSARY: Record<string, string> = {
  // Perspectivas / Vistas
  "vista de frente": "front view",
  "vista frontal": "front view",
  "simetricamente frontal": "symmetrical front view",
  "frontal": "front view",
  "vista lateral": "side view",
  "vista de perfil": "side profile view",
  "vista de espaldas": "back view",
  "vista desde arriba": "top-down perspective",
  "vista cenital": "overhead view",
  "vista isometrica": "isometric view",
  "perspectiva oblicua": "oblique perspective",

  // Estado de Objetos
  "cerrado": "closed",
  "abierto": "open",
  "roto": "broken",
  "destruido": "destroyed",
  "nuevo": "pristine",
  "antiguo": "ancient",
  "oxidado": "rusty",
  "flotando": "floating",

  // Materiales y Texturas
  "madera": "wooden",
  "metal": "metallic",
  "cristal": "crystal",
  "vidrio": "glass",
  "piedra": "stone",
  "roca": "rock",
  "oro": "golden",
  "plata": "silver",
  "brillante": "glowing",
  "transparente": "translucent",
  "rugoso": "rough texture",
  "suave": "smooth texture",

  // Composición
  "primer plano": "close-up",
  "cuerpo completo": "full body",
  "centrado": "centered",
  "centrada": "centered",
  "fondo blanco": "isolated on white background",
  "fondo negro": "isolated on black background",

  // Detalles Técnicos
  "detallado": "highly detailed",
  "joyas incrustadas": "encrusted jewels",
  "luces led": "led lights",
  "estilo pixel": "pixel art style",
  "alta resolucion": "high resolution",
  "luz plana": "flat lighting, no shadows",
  "sin sombras": "no shadows, flat shading",
};

/**
 * Translates common Spanish terms in a prompt to technical English SD terms.
 */
export const translatePrompt = (prompt: string): string => {
  let translated = prompt.toLowerCase();

  // Sort keys by length (descending) to avoid partial replacements (e.g., "madera" vs "madera tallada")
  const sortedKeys = Object.keys(PROMPT_GLOSSARY).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    const regex = new RegExp(`\\b${key}\\b`, 'gi');
    translated = translated.replace(regex, PROMPT_GLOSSARY[key]);
  }

  return translated;
};
