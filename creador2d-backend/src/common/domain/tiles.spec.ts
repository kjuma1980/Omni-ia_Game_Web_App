import {
  COLLISION_FLAGS,
  EMPTY_CELL,
  LAYER_ORDER,
  chunkKey,
  compactPalette,
  createEmptyChunk,
  describeCollision,
  floorDiv,
  floorMod,
  internBlockKey,
  localIndex,
  neighbourChunks,
  pixelToTile,
  tileToChunk,
  tileToLocal,
  tileToPixel,
  ySortOrigin,
} from './tiles';

describe('Snapping magnetico (division entera)', () => {
  it('floorDiv redondea hacia abajo tambien con negativos', () => {
    expect(floorDiv(0, 32)).toBe(0);
    expect(floorDiv(31, 32)).toBe(0);
    expect(floorDiv(32, 32)).toBe(1);
    expect(floorDiv(-1, 32)).toBe(-1);
    expect(floorDiv(-32, 32)).toBe(-1);
    expect(floorDiv(-33, 32)).toBe(-2);
  });

  it('difiere del truncamiento justo donde apareceria la fisura', () => {
    // Math.trunc(-1 / 32) === -0, que colapsaria los tiles -1 y 0 en el mismo
    // indice y dejaria un hueco de un tile al cruzar el origen.
    expect(Math.trunc(-1 / 32)).toBe(-0);
    expect(floorDiv(-1, 32)).toBe(-1);
  });

  it('floorMod siempre devuelve un valor no negativo', () => {
    expect(floorMod(-1, 16)).toBe(15);
    expect(floorMod(-16, 16)).toBe(0);
    expect(floorMod(17, 16)).toBe(1);
  });

  it('pixelToTile y tileToPixel son consistentes en ambos semiejes', () => {
    for (const tile of [-5, -1, 0, 1, 7]) {
      const pixel = tileToPixel(tile, 32);
      expect(pixelToTile(pixel, 32)).toBe(tile);
      // Cualquier pixel dentro del tile debe resolver al mismo tile.
      expect(pixelToTile(pixel + 31, 32)).toBe(tile);
    }
  });

  it('no deja huecos: cada pixel pertenece a exactamente un tile', () => {
    const seen = new Map<number, number>();
    for (let pixel = -64; pixel < 64; pixel += 1) {
      const tile = pixelToTile(pixel, 32);
      seen.set(tile, (seen.get(tile) ?? 0) + 1);
    }
    // 4 tiles cubiertos, 32 pixeles cada uno, sin solapes ni vacios.
    expect(seen.size).toBe(4);
    for (const count of seen.values()) {
      expect(count).toBe(32);
    }
  });
});

describe('Coordenadas de chunk', () => {
  it('asigna correctamente los tiles negativos', () => {
    expect(tileToChunk(-1, 16)).toBe(-1);
    expect(tileToChunk(-16, 16)).toBe(-1);
    expect(tileToChunk(-17, 16)).toBe(-2);
    expect(tileToChunk(15, 16)).toBe(0);
    expect(tileToChunk(16, 16)).toBe(1);
  });

  it('la coordenada local siempre cae dentro del chunk', () => {
    for (let tile = -40; tile <= 40; tile += 1) {
      const local = tileToLocal(tile, 16);
      expect(local).toBeGreaterThanOrEqual(0);
      expect(local).toBeLessThan(16);
    }
  });

  it('chunk + local reconstruyen el tile original', () => {
    for (const tile of [-33, -16, -1, 0, 5, 31, 64]) {
      const cx = tileToChunk(tile, 16);
      const lx = tileToLocal(tile, 16);
      expect(cx * 16 + lx).toBe(tile);
    }
  });

  it('localIndex mapea la rejilla sin colisiones', () => {
    const seen = new Set<number>();
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        seen.add(localIndex(x, y, 16));
      }
    }
    expect(seen.size).toBe(256);
  });

  it('neighbourChunks devuelve exactamente la matriz 3x3', () => {
    const neighbours = neighbourChunks(2, -3);
    expect(neighbours).toHaveLength(9);

    const keys = new Set(neighbours.map((c) => chunkKey(c.cx, c.cy)));
    expect(keys.size).toBe(9);
    expect(keys.has('2:-3')).toBe(true);
    expect(keys.has('1:-4')).toBe(true);
    expect(keys.has('3:-2')).toBe(true);
    expect(keys.has('4:-3')).toBe(false);
  });
});

describe('Chunks y paleta', () => {
  it('un chunk vacio tiene todas las capas dimensionadas', () => {
    const chunk = createEmptyChunk(0, 0, 16);

    for (const layer of LAYER_ORDER) {
      expect(chunk.layers[layer]).toHaveLength(256);
      expect(chunk.layers[layer].every((cell) => cell === EMPTY_CELL)).toBe(true);
    }

    expect(chunk.collision).toHaveLength(256);
    expect(chunk.palette).toHaveLength(0);
  });

  it('internBlockKey no duplica claves', () => {
    const palette: string[] = [];
    expect(internBlockKey(palette, 'grass')).toBe(0);
    expect(internBlockKey(palette, 'dirt')).toBe(1);
    expect(internBlockKey(palette, 'grass')).toBe(0);
    expect(palette).toEqual(['grass', 'dirt']);
  });

  it('compactPalette elimina claves huerfanas y reindexa las capas', () => {
    const chunk = createEmptyChunk(0, 0, 16);
    chunk.palette = ['grass', 'dirt', 'sand'];
    chunk.layers.GROUND[0] = 0; // grass
    chunk.layers.GROUND[1] = 2; // sand  (dirt queda sin usar)

    compactPalette(chunk);

    expect(chunk.palette).toEqual(['grass', 'sand']);
    expect(chunk.layers.GROUND[0]).toBe(0);
    expect(chunk.layers.GROUND[1]).toBe(1);
    expect(chunk.layers.GROUND[2]).toBe(EMPTY_CELL);
  });

  it('compactPalette no toca un chunk ya compacto', () => {
    const chunk = createEmptyChunk(0, 0, 16);
    chunk.palette = ['grass'];
    chunk.layers.GROUND[0] = 0;

    const before = JSON.stringify(chunk);
    compactPalette(chunk);
    expect(JSON.stringify(chunk)).toBe(before);
  });
});

describe('Banderas de colision', () => {
  it('caben en un byte', () => {
    for (const flag of Object.values(COLLISION_FLAGS)) {
      expect(flag).toBeLessThanOrEqual(255);
    }
  });

  it('describeCollision descompone una mascara combinada', () => {
    const mask = COLLISION_FLAGS.SOLID | COLLISION_FLAGS.DAMAGE;
    const flags = describeCollision(mask);

    expect(flags).toContain('SOLID');
    expect(flags).toContain('DAMAGE');
    expect(flags).not.toContain('WATER');
    expect(flags).not.toContain('NONE');
  });

  it('una mascara vacia no describe ninguna bandera', () => {
    expect(describeCollision(COLLISION_FLAGS.NONE)).toHaveLength(0);
  });
});

describe('Ordenacion 2.5D', () => {
  it('ancla en el borde inferior, no en el centro', () => {
    // Un tile en y=5 de un tile de alto ancla en (5+1)*32 = 192.
    expect(ySortOrigin(5, 32, 1, 0)).toBe(192);
  });

  it('un elemento mas abajo se dibuja despues', () => {
    const arriba = ySortOrigin(3, 32, 1, 0);
    const abajo = ySortOrigin(4, 32, 1, 0);
    expect(abajo).toBeGreaterThan(arriba);
  });

  it('un prop de dos tiles ancla en su base, no en su copa', () => {
    // Un arbol de 2 tiles cuya celda base esta en y=4 ocupa las filas 4 y 5.
    // Debe ordenarse como cualquier elemento cuya base esta en la fila 5, no
    // como uno de la fila 4: por eso el ancla usa (tileY + heightInTiles).
    const arbol = ySortOrigin(4, 32, 2, 0);
    const bloqueEnFila5 = ySortOrigin(5, 32, 1, 0);
    expect(arbol).toBe(bloqueEnFila5);

    // Y queda por detras de cualquier cosa apoyada en la fila 6.
    expect(arbol).toBeLessThan(ySortOrigin(6, 32, 1, 0));
  });

  it('el desplazamiento afina el orden sin cambiar la fila', () => {
    expect(ySortOrigin(5, 32, 1, -4)).toBe(188);
  });
});
