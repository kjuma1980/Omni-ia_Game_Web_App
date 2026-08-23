import { BIOME_PALETTES, LAYER_SIZE, buildBackgroundPrompt, paletteFor } from './background-prompts';

describe('Prompts de fondo de parallax', () => {
  it('todas las capas piden explicitamente tileado horizontal', () => {
    for (const kind of ['SKY', 'FAR', 'MID', 'NEAR'] as const) {
      const prompt = buildBackgroundPrompt({
        kind,
        biome: 'grassland',
        worldType: 'SIDE_PLATFORMER',
      });

      expect(prompt.positive).toContain('seamless horizontally tileable');
      expect(prompt.positive).toContain('left and right edges must continue into each other');
      // Un elemento protagonista delata el punto de repeticion aunque la
      // costura sea perfecta.
      expect(prompt.positive).toContain('no single hero element');
    }
  });

  it('el negativo excluye siempre personajes, texto e interfaz', () => {
    const prompt = buildBackgroundPrompt({
      kind: 'MID',
      biome: 'jungle',
      worldType: 'SIDE_PLATFORMER',
    });

    for (const banned of ['character', 'text', 'watermark', 'ui', 'hud']) {
      expect(prompt.negative).toContain(banned);
    }
  });

  it('la capa de cielo excluye suelo y horizonte', () => {
    const prompt = buildBackgroundPrompt({
      kind: 'SKY',
      biome: 'grassland',
      worldType: 'SIDE_PLATFORMER',
    });

    expect(prompt.positive).toContain('no ground');
    expect(prompt.negative).toContain('mountains');
  });

  it('la capa lejana pide perspectiva atmosferica y la media no', () => {
    const far = buildBackgroundPrompt({ kind: 'FAR', biome: 'mountain', worldType: 'SIDE_PLATFORMER' });
    const mid = buildBackgroundPrompt({ kind: 'MID', biome: 'mountain', worldType: 'SIDE_PLATFORMER' });

    expect(far.positive).toContain('atmospheric perspective');
    expect(far.positive).toContain('desaturated');
    // La capa media debe leerse mas cercana: mas saturada y contrastada.
    expect(mid.positive).toContain('more saturated and more contrasted than the far layer');
  });

  it('la capa cercana deja el centro despejado para no tapar la accion', () => {
    const prompt = buildBackgroundPrompt({
      kind: 'NEAR',
      biome: 'forest',
      worldType: 'SIDE_PLATFORMER',
    });

    expect(prompt.positive).toContain('centre must be empty');
    expect(prompt.negative).toContain('content in the centre');
  });

  it('el runner compone con punto de fuga y el plataformas no', () => {
    const runner = buildBackgroundPrompt({
      kind: 'MID',
      biome: 'city',
      worldType: 'COUNTRYSIDE_RUNNER',
    });
    const side = buildBackgroundPrompt({
      kind: 'MID',
      biome: 'city',
      worldType: 'SIDE_PLATFORMER',
    });

    // Referencia: Subway Surfers y Temple Run miran al horizonte.
    expect(runner.positive).toContain('vanishing point');
    expect(runner.positive).toContain('symmetrical');
    expect(side.positive).toContain('no perspective vanishing point');
  });

  it('la paleta del bioma llega al prompt', () => {
    const volcanic = buildBackgroundPrompt({
      kind: 'FAR',
      biome: 'volcanic',
      worldType: 'SIDE_PLATFORMER',
    });

    expect(volcanic.positive).toContain(BIOME_PALETTES.volcanic.farFeatures);
    expect(volcanic.positive).toContain(BIOME_PALETTES.volcanic.mood);
  });

  it('un bioma desconocido cae en la paleta por defecto sin romperse', () => {
    expect(paletteFor('bioma_inventado')).toEqual(BIOME_PALETTES.grassland);

    const prompt = buildBackgroundPrompt({
      kind: 'FAR',
      biome: 'bioma_inventado',
      worldType: 'TOP_DOWN_THREE_QUARTER',
    });

    expect(prompt.positive.length).toBeGreaterThan(100);
  });

  it('la indicacion del usuario se anade al final', () => {
    const prompt = buildBackgroundPrompt({
      kind: 'MID',
      biome: 'desert',
      worldType: 'SIDE_PLATFORMER',
      userHint: 'ruinas de un templo enterrado',
    });

    expect(prompt.positive).toContain('additional direction: ruinas de un templo enterrado');
  });

  it('todas las capas son anchas y multiplo de 64 para SDXL', () => {
    for (const [kind, size] of Object.entries(LAYER_SIZE)) {
      expect(size.width % 64).toBe(0);
      expect(size.height % 64).toBe(0);
      expect(size.width).toBeGreaterThan(size.height);
      expect(kind).toBeTruthy();
    }
  });

  it('cada bioma define todos sus campos', () => {
    for (const [name, palette] of Object.entries(BIOME_PALETTES)) {
      for (const field of ['sky', 'distant', 'mid', 'accent', 'farFeatures', 'midFeatures', 'nearFeatures', 'mood'] as const) {
        // El nombre del bioma va en el mensaje para localizar el campo vacio.
        expect(`${name}.${field}=${palette[field]}`).not.toMatch(/=$/);
      }
    }
  });
});
