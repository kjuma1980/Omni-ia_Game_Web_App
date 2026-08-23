import * as backend from './tiles';
// El editor web mantiene una copia de esta misma matematica porque no puede
// importar codigo del backend. Esta prueba es la red de seguridad de esa copia:
// si alguien cambia una regla en un lado y no en el otro, el editor pintaria en
// una celda y el servidor escribiria en otra.
import * as frontend from '../../../../modules/creador2d/core/grid';

describe('Paridad entre el nucleo del backend y el del editor web', () => {
  it('comparte las mismas banderas de colision', () => {
    expect(frontend.COLLISION_FLAGS).toEqual(backend.COLLISION_FLAGS);
  });

  it('comparte el mismo orden de capas', () => {
    expect([...frontend.LAYER_ORDER]).toEqual([...backend.LAYER_ORDER]);
  });

  it('comparte la misma celda vacia y los mismos tamanos de chunk', () => {
    expect(frontend.EMPTY_CELL).toBe(backend.EMPTY_CELL);
    expect([...frontend.ALLOWED_CHUNK_SIZES]).toEqual([...backend.ALLOWED_CHUNK_SIZES]);
  });

  it('floorDiv y floorMod coinciden en todo el rango probado', () => {
    for (let value = -200; value <= 200; value += 1) {
      for (const divisor of [8, 16, 32, 64]) {
        expect(frontend.floorDiv(value, divisor)).toBe(backend.floorDiv(value, divisor));
        expect(frontend.floorMod(value, divisor)).toBe(backend.floorMod(value, divisor));
      }
    }
  });

  it('el snapping pixel -> tile es identico', () => {
    for (let pixel = -500; pixel <= 500; pixel += 7) {
      for (const tileSize of [16, 32, 48]) {
        expect(frontend.pixelToTile(pixel, tileSize)).toBe(backend.pixelToTile(pixel, tileSize));
      }
    }
  });

  it('la asignacion de tile a chunk y a coordenada local es identica', () => {
    for (let tile = -100; tile <= 100; tile += 1) {
      for (const chunkSize of [16, 32]) {
        expect(frontend.tileToChunk(tile, chunkSize)).toBe(backend.tileToChunk(tile, chunkSize));
        expect(frontend.tileToLocal(tile, chunkSize)).toBe(backend.tileToLocal(tile, chunkSize));
      }
    }
  });

  it('el indice lineal dentro del chunk es identico', () => {
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        expect(frontend.localIndex(x, y, 32)).toBe(backend.localIndex(x, y, 32));
      }
    }
  });

  it('el ancla de ordenacion 2.5D es identica', () => {
    for (let tileY = -20; tileY <= 20; tileY += 1) {
      for (const height of [1, 2, 3]) {
        for (const offset of [-8, 0, 4]) {
          expect(frontend.ySortOrigin(tileY, 32, height, offset)).toBe(
            backend.ySortOrigin(tileY, 32, height, offset),
          );
        }
      }
    }
  });

  it('la ventana de 9 chunks es identica', () => {
    const a = frontend.neighbourChunks(3, -2).map((c) => frontend.chunkKey(c.cx, c.cy));
    const b = backend.neighbourChunks(3, -2).map((c) => backend.chunkKey(c.cx, c.cy));
    expect(a).toEqual(b);
  });

  it('un chunk vacio tiene la misma forma en ambos lados', () => {
    const a = frontend.createEmptyChunk(1, -1, 16);
    const b = backend.createEmptyChunk(1, -1, 16);

    expect(a.layers).toEqual(b.layers);
    expect(a.collision).toEqual(b.collision);
    expect(a.palette).toEqual(b.palette);
  });
});
