import { readList, writeList, listIncludes } from './json-list';

/**
 * Las listas serializadas son lo unico que la migracion a SQLite cambia de
 * forma SEMANTICA: en PostgreSQL eran columnas de lista nativas y la base las
 * validaba. Ahora son texto, y quien lo lea puede encontrarse cualquier cosa.
 *
 * Estas pruebas fijan el contrato que el resto del codigo da por hecho:
 * `readList` devuelve SIEMPRE un array, y `listIncludes` compara ELEMENTOS y no
 * subcadenas. Lo segundo es lo que evitaba que un bloque incompatible pasara
 * por valido en `validateKeys`.
 */
describe('json-list', () => {
  describe('readList', () => {
    it('lee una lista normal', () => {
      expect(readList('["SIDE_PLATFORMER","TOP_DOWN_CENITAL"]')).toEqual([
        'SIDE_PLATFORMER',
        'TOP_DOWN_CENITAL',
      ]);
    });

    it('devuelve array vacio ante null, undefined y cadena vacia', () => {
      expect(readList(null)).toEqual([]);
      expect(readList(undefined)).toEqual([]);
      expect(readList('')).toEqual([]);
    });

    it('no lanza con JSON invalido: devuelve array vacio', () => {
      // Es el caso que justifica centralizar la lectura: un valor corrupto no
      // puede tumbar la peticion desde un sitio cualquiera del codigo.
      expect(readList('{esto no es json')).toEqual([]);
      expect(readList('[1,2,')).toEqual([]);
    });

    it('descarta un JSON valido que no sea un array', () => {
      expect(readList('{"a":1}')).toEqual([]);
      expect(readList('"una cadena"')).toEqual([]);
      expect(readList('42')).toEqual([]);
    });

    it('descarta los elementos que no sean cadenas', () => {
      expect(readList('["ok",1,null,{"a":1},"otra"]')).toEqual(['ok', 'otra']);
    });
  });

  describe('writeList', () => {
    it('serializa una lista normal', () => {
      expect(writeList(['a', 'b'])).toBe('["a","b"]');
    });

    it('devuelve "[]" ante null, undefined y lista vacia', () => {
      expect(writeList(null)).toBe('[]');
      expect(writeList(undefined)).toBe('[]');
      expect(writeList([])).toBe('[]');
    });

    it('quita duplicados y cadenas vacias', () => {
      expect(writeList(['a', 'a', '', 'b', 'b'])).toBe('["a","b"]');
    });

    it('conserva acentos, comillas y comas', () => {
      const dificil = ['acido', 'con "comillas"', 'coma,dentro'];
      expect(readList(writeList(dificil))).toEqual(dificil);
    });
  });

  describe('listIncludes', () => {
    it('encuentra un elemento presente', () => {
      expect(listIncludes('["SIDE_PLATFORMER"]', 'SIDE_PLATFORMER')).toBe(true);
    });

    it('no encuentra uno ausente', () => {
      expect(listIncludes('["SIDE_PLATFORMER"]', 'TOP_DOWN_CENITAL')).toBe(false);
    });

    it('NO confunde una subcadena con un elemento', () => {
      // La razon de ser de esta funcion. Con `.includes()` sobre el texto crudo,
      // los tres casos darian `true` y un bloque incompatible pasaria como
      // valido en `validateKeys`, sin ningun error.
      expect(listIncludes('["TOP_DOWN_THREE_QUARTER"]', 'TOP_DOWN')).toBe(false);
      expect(listIncludes('["COUNTRYSIDE_RUNNER"]', 'RUNNER')).toBe(false);
      expect(listIncludes('["SIDE_PLATFORMER"]', 'PLATFORMER')).toBe(false);
    });

    it('tolera un valor corrupto sin lanzar', () => {
      expect(listIncludes('roto', 'lo que sea')).toBe(false);
      expect(listIncludes(null, 'lo que sea')).toBe(false);
    });
  });

  it('ida y vuelta: lo que se escribe es lo que se lee', () => {
    const casos = [[], ['uno'], ['uno', 'dos', 'tres'], ['con espacio', 'UPPER_CASE']];
    for (const caso of casos) {
      expect(readList(writeList(caso))).toEqual(caso);
    }
  });
});
