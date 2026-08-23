export {};

/**
 * El `tsconfig.json` de la aplicacion base fija `types: ["node"]`, por lo que
 * los tipos de `vite/client` no se cargan automaticamente. En lugar de tocar la
 * configuracion base, el submodulo declara aqui la unica variable de entorno
 * que consume. La declaracion es una fusion de interfaces: si en el futuro la
 * aplicacion base incorpora `vite/client`, ambas coexisten sin conflicto.
 */
declare global {
  interface ImportMetaEnv {
    /** URL del backend del Creador 2D. Por defecto http://127.0.0.1:4310 */
    readonly VITE_CREADOR2D_API?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
