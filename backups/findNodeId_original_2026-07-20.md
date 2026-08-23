# RESPALDO — Estado original de `findNodeId` (2026-07-20)

> **Propósito:** preservar el código original de las 5 definiciones de `findNodeId` antes de cualquier
> refactor futuro (Fase 9 opcional del plan de remediación). Si un cambio rompe algo, restaurar desde aquí
> o desde git (la rama `main` y el punto de creación de `security-hardening` conservan el estado original).
>
> **Verificación realizada 2026-07-20:** 4 copias son IDÉNTICAS en su mecanismo (Versión A) y 1 es una
> VARIANTE EXTENDIDA necesaria para TTS (Versión B). Los criterios de búsqueda de cada módulo
> (qué nodos busca cada pestaña y en qué orden) son distintos y necesarios, y NO se respaldan aquí
> porque no deben modificarse: permanecen en cada módulo.

---

## Versión A — Mecanismo idéntico (4 copias)

### Copia 1 — `services/aiProvider.ts`, líneas 472-479 (contexto: IMAGEN)

```ts
        const findNodeId = (wf: any, classType: string, title?: string) => {
          if (title) {
            const found = Object.entries(wf).find(([_, n]: any) => n._meta?.title === title);
            if (found) return found[0];
          }
          const found = Object.entries(wf).find(([_, n]: any) => n.class_type === classType);
          return found ? found[0] : null;
        };
```

### Copia 2 — `services/aiProvider.ts`, líneas 1230-1237 (contexto: MÚSICA)

```ts
      const findNodeId = (wf: any, classType: string, title?: string) => {
        if (title) {
          const found = Object.entries(wf).find(([_, n]: any) => n._meta?.title === title);
          if (found) return found[0];
        }
        const found = Object.entries(wf).find(([_, n]: any) => n.class_type === classType);
        return found ? found[0] : null;
      };
```

### Copia 3 — `services/localService.ts`, líneas 994-1001 (contexto: VIDEO)

```ts
         const findNodeId = (wf: any, classType: string, title?: string) => {
           if (title) {
             const found = Object.entries(wf).find(([_, n]: any) => n._meta?.title === title);
             if (found) return found[0];
           }
           const found = Object.entries(wf).find(([_, n]: any) => n.class_type === classType);
           return found ? found[0] : null;
         };
```

### Copia 4 — `services/localService.ts`, líneas 2048-2055 (contexto: 3D)

```ts
      const findNodeId = (wf: any, classType: string, title?: string) => {
        if (title) {
          const found = Object.entries(wf).find(([_, n]: any) => n._meta?.title === title);
          if (found) return found[0];
        }
        const found = Object.entries(wf).find(([_, n]: any) => n.class_type === classType);
        return found ? found[0] : null;
      };
```

---

## Versión B — Variante extendida NECESARIA (1 copia)

### `services/aiProvider.ts`, líneas 989-1008 (contexto: TTS / VibeVoice)

Capacidades que la Versión A NO tiene y que el TTS requiere:
1. Búsqueda directa por **ID de nodo** (`wf[searchStr]`).
2. Fallback **insensible a mayúsculas/minúsculas**.
3. **Diagnóstico** en consola listando los nodos disponibles del workflow cuando no encuentra coincidencia.

```ts
      const findNodeId = (wf: any, searchStr: string) => {
        if (wf[searchStr]) return searchStr;
        const entries = Object.entries(wf);
        let found = entries.find(([_, n]: any) =>
          n.class_type === searchStr ||
          n._meta?.title === searchStr
        );
        if (!found) {
          found = entries.find(([_, n]: any) =>
            n.class_type?.toLowerCase() === searchStr.toLowerCase() ||
            n._meta?.title?.toLowerCase() === searchStr.toLowerCase()
          );
        }
        if (!found) {
          console.warn("[Omni-IA Game] No se encontró el nodo. Nodos disponibles en tu JSON:",
            entries.map(([id, n]: any) => `ID: ${id} | Class: ${n.class_type} | Title: ${n._meta?.title || 'Sin Título'}`)
          );
        }
        return found ? found[0] : null;
      };
```

---

## Regla de restauración / refactor seguro

- La unificación futura (SI el usuario la aprueba) debe compartir **SOLO el mecanismo**, con:
  - Modo exacto por defecto (equivalente a Versión A).
  - Modo flexible + diagnóstico para TTS (equivalente a Versión B).
- Los criterios de búsqueda por módulo (cadenas de llamadas con sus títulos y fallbacks) **NO se tocan**.
- Prueba de aceptación: cada módulo (Imagen, Música, Video, 3D, TTS) debe comportarse de forma idéntica a hoy.
- Restauración rápida con git (desde la raíz del repo):
  - `git checkout main -- services/aiProvider.ts services/localService.ts`
  - o copiar manualmente los bloques de este documento a sus líneas originales.
