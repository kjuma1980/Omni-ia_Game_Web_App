# 🚀 GUÍA DE MIGRACIÓN: MEJORAS DE SPRITES (FONDO BLANCO, CHROMA KEY Y CENTRADO SIN SOMBRAS)

Este documento detalla paso a paso las modificaciones aplicadas y probadas en la versión educativa de **Omni-IA Game** para ser replicadas en la **Versión Comercial**.

---

## 🎯 1. OBJETIVO DE LAS MEJORAS
1. **Fondo Blanco Sólido por Defecto:** Garantizar que los sprites sin croma key se generen en fondo blanco plano y sin degradados ni particiones negras.
2. **Fondo Verde Chroma Key (`#00FF00`):** Opción mediante Checkbox en la UI para fondos verdes puros utilizables en motores de videojuegos (Godot, Unity, Unreal) para remoción automática por color keying.
3. **Centrado Absoluto en Pantalla (`dead center composition:2.0`):** Eliminar desplazamientos a la izquierda, derecha o encuadres asimétricos recortados.
4. **Cero Absoluto de Sombras (Purga de Tokens + Desasociación de Estudio):** Eliminar sombras de piso, contacto o tinte verde evitando invocar sets de fotografía/estudio reales o palabras prohibidas (`shadowless`, `no shadows`, `chroma key`) en el positive prompt.

---

## 📁 2. RESUMEN DE ARCHIVOS A MODIFICAR
1. `types.ts`
2. `App.tsx`
3. `components/AssetGenerator.tsx`
4. `services/aiProvider.ts`

---

## 📝 3. PASO A PASO DE IMPLEMENTACIÓN

### PASO 1: `types.ts`
En la interfaz `AssetState` (o el estado de configuración de assets), agregar la propiedad opcional:
```typescript
export interface AssetState {
  // ... campos existentes ...
  useChromaKeyGreen?: boolean;
}
```

---

### PASO 2: `App.tsx`
En el estado por defecto del proyecto (`DEFAULT_PROJECT.assetState`):
```typescript
const DEFAULT_PROJECT = {
  // ...
  assetState: {
    // ...
    useChromaKeyGreen: false,
  }
};
```

---

### PASO 3: `components/AssetGenerator.tsx`
1. En el renderizado de la barra lateral de **Sprites**, añadir el Checkbox exclusivo para el modo `sprite`:
```tsx
{mode === 'sprite' && (
  <div className="flex items-center gap-2 mt-2 p-2 rounded bg-slate-800/60 border border-slate-700/50">
    <input
      type="checkbox"
      id="useChromaKeyGreen"
      checked={!!assetState.useChromaKeyGreen}
      onChange={(e) => updateAssetState({ useChromaKeyGreen: e.target.checked })}
      className="w-4 h-4 rounded accent-emerald-500 bg-slate-900 border-slate-700"
    />
    <label htmlFor="useChromaKeyGreen" className="text-xs font-semibold text-emerald-400 cursor-pointer">
      🟩 Fondo Verde Chroma Key (#00FF00)
    </label>
  </div>
)}
```

2. Pasar `useChromaKeyGreen` en el contexto extra de `refinePrompt` y `generateImage`:
```typescript
// Al llamar a refinePrompt:
const result = await refinePrompt(..., {
  useChromaKeyGreen: assetState.useChromaKeyGreen
});

// Al llamar a generateImage:
const result = await generateImage(..., assetState);
```

---

### PASO 4: `services/aiProvider.ts`

#### A. Sanitización Activa y Encabezados en `generateImage` (Modo `sprite`)
En la función `generateImage`, dentro del bloque `if (mode === 'sprite')`:

```typescript
if (mode === 'sprite') {
  // 1. Sanitizado activo de sombras y desencadenantes de estudio:
  // Elimina del positive prompt palabras que activan sombras o sets fotográficos
  finalPositive = finalPositive
    .replace(/\b(ground|drop|cast|contact|floor|surface|ambient|soft)?\s*shadows?\b/gi, "")
    .replace(/\bshadowless\b/gi, "")
    .replace(/\b(shading|ambient occlusion)\b/gi, "")
    .replace(/\b(chroma\s*key|chromakey|green\s*screen|studio\s*floor)\b/gi, "")
    .replace(/,\s*,/g, ",")
    .trim();

  // 2. Encabezados de centrado muerto e iluminación plana sin sombras
  const centeredHeader = "(dead center composition:2.0), (perfectly centered isolated subject:2.0), (symmetrical placement:1.8), (centered in frame:1.8), ";
  const flatUnlitHeader = "(flat solid colors:2.0), (unlit texture:2.0), (diffuse studio flash:1.9), (even ambient illumination:1.9), (vector flat art:1.8), (sticker asset style:1.8), ";

  // 3. Ramificación según Checkbox de Chroma Key vs Blanco por Defecto
  if (uiState?.useChromaKeyGreen) {
    finalPositive = `${centeredHeader}${flatUnlitHeader}(isolated on a single uniform solid flat green background hex #00FF00:2.0), (pure flat solid neon green backdrop:2.0), (unlit green digital canvas:1.9), (flat 2D vector asset:1.8), (no split background:1.5), ${finalPositive}`;
    
    finalNegative += ", (green screen studio:2.5), (studio floor:2.5), (green shadow:2.5), (photography backdrop:2.5), (shadow:2.5), (shadows:2.5), (drop shadow:2.5), (ground shadow:2.5), (cast shadow:2.5), (contact shadow:2.5), (ambient occlusion:2.5), (floor shadow:2.5), (surface shadow:2.5), (shading:2.2), (directional lighting:2.0), (spotlight:2.0), (table:2.0), (ground:2.0), (floor:2.0), (ground plane:2.5), (off-center:2.0), (left aligned:2.0), (right aligned:2.0), (left side:1.9), (asymmetrical placement:1.8), (cropped:1.9), (out of frame:1.9), (cut off:1.9), (white background:1.6), (black background:1.6), (split background:1.8), (gradient background:1.7)";
  } else {
    finalPositive = `${centeredHeader}${flatUnlitHeader}(isolated on pure solid white background:1.8), (flat plain white backdrop:1.8), (no split background:1.5), ${finalPositive}`;
    
    finalNegative += ", (shadow:2.5), (shadows:2.5), (drop shadow:2.5), (ground shadow:2.5), (cast shadow:2.5), (contact shadow:2.5), (ambient occlusion:2.5), (floor shadow:2.5), (surface shadow:2.5), (shading:2.2), (directional lighting:2.0), (spotlight:2.0), (table:2.0), (ground:2.0), (floor:2.0), (off-center:2.0), (left aligned:2.0), (right aligned:2.0), (left side:1.9), (asymmetrical placement:1.8), (cropped:1.9), (out of frame:1.9), (cut off:1.9), (black background:1.6), (dark background:1.6), (split background:1.8), (gradient background:1.7)";
  }
}
```

#### B. Purga en el System Prompt del Refinador de IA (`refinePrompt`)
En la función `refinePrompt`, actualizar la directiva de fondo y el System Prompt:

```typescript
const useChromaKey = !!extraContext?.useChromaKeyGreen;
const spriteBgDirective = useChromaKey
  ? 'isolated subject on a single uniform solid flat green background (hex #00FF00), pure flat solid neon green backdrop, flat unlit texture, diffuse even ambient illumination, flat solid colors, 2D vector asset style, no split background.'
  : 'isolated subject on a pure solid white background, flat white backdrop, flat unlit texture, diffuse even ambient illumination, flat solid colors, sticker asset style, no split background.';

systemPrompt = `You are a world-class Stable Diffusion / image generation prompt engineer specialized in video game art.

RULES:
1. Transform the user's idea into a highly detailed, professional image generation prompt.
2. Output your response ONLY as a valid JSON object with exactly two keys: "positive" and "negative".
3. Use specific artistic terminology: composition, lighting, color palette, texture, atmosphere, materials.
4. Include quality boosters in the positive prompt: "masterpiece", "ultra detailed", "professional illustration", "8k resolution".
5. The positive prompt MUST match the artistic style "${style}" precisely. Use keywords that define that style.
6. Mode is "${mode}": ${mode === 'background' ? 'Focus on environment, atmosphere, wide composition, landscape. NEVER include characters, people, or living entities.' : `Focus on character/object design, ${action} pose, proportions, ${spriteBgDirective}${action === 'T-Pose' ? ' Crucial rule: The character MUST always face the camera directly, their body position must be completely front-facing, and their head, face, and eyes must be facing directly forward, looking straight at the viewer. Absolutely no head tilts, body rotation, or side angles.' : ''}`}
7. CRITICAL SHADOW & STUDIO EXCLUSION RULE: For sprites, the generated subject MUST be completely shadowless. DO NOT output words like "shadow", "shadows", "shadowless", "shading", "ambient occlusion", "chroma key", "chromakey", "green screen", "studio", "studio floor", or "lighting" in the positive prompt key under any circumstances. Describe the green background strictly as "single uniform solid flat green background (hex #00FF00)". Describe the asset using terms like "unlit 2D asset", "flat solid color palette", "sticker style", and "diffuse even ambient illumination". Place all shadow and studio floor terms ONLY inside the "negative" prompt key of the JSON output.
8. ABSOLUTE CENTERING RULE: The subject MUST be positioned dead center in the canvas, perfectly symmetrical, isolated with generous equal margins on all sides. NEVER align to the left or right, and do NOT use terms like "side perspective", "left view", or "asymmetrical layout".
9. PRESERVE all specific elements the user mentions (objects, creatures, architectural features, colors).
10. ENHANCE those elements with professional descriptive details the user didn't think of.
11. For the negative prompt, include terms to avoid based on the style, mode, and user idea, while keeping the user's current negative terms as a base. For sprites, ALWAYS include: "shadow, drop shadow, ground shadow, cast shadow, contact shadow, ambient occlusion, floor shadow, green screen studio, studio floor, green shadow, off-center, left aligned, right aligned, left side".
12. Write the prompts in ENGLISH (image AI models work best with English prompts).
13. NEVER output markdown formatting like \`\`\`json or explanations. Return raw JSON only.`;
```

---

## 🔬 4. VERIFICACIÓN Y PRUEBAS RECOMENDADAS
1. Ejecutar `npx tsc --noEmit` para verificar cero errores de tipos.
2. Probar generación con **Fondo Blanco**: Verificar que el sprite esté en el centro perfecto sin sombras de piso ni bordes cortados.
3. Activar checkbox **🟩 Fondo Verde Chroma Key (#00FF00)**: Verificar verde puro `#00FF00` sin piso de estudio ni tinte/sombra verde en los pies o base del objeto.
