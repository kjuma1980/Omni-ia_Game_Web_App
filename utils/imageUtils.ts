/**
 * Convierte y limpia URLs de imágenes para etiquetas <img>:
 * 1. Si la URL es nula, indefinida o vacía, devuelve undefined (evitando que React renderice src="" en modo Dev).
 * 2. Si la URL es una ruta de archivo local de disco (ej: C:\Users\... o file://), la convierte vía convertFileSrc en Tauri.
 */
export const safeImageSrc = (url?: string | null): string | undefined => {
  if (!url || typeof url !== 'string' || url.trim() === '') return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith('file://') || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    const convertFn =
      (window as any).__TAURI__?.core?.convertFileSrc ||
      (window as any).__TAURI__?.primitives?.convertFileSrc ||
      (window as any).__TAURI_INTERNALS__?.convertFileSrc;

    if (convertFn) {
      try {
        return convertFn(trimmed);
      } catch {
        // Fallback
      }
    }
  }
  return trimmed;
};

/**
 * Garantiza que la URL de un asset sea un Data URL Base64 (data:image/png;base64,...).
 * Si es una URL HTTP de ComfyUI (http://127.0.0.1:8188) o una ruta local de disco,
 * descarga o lee los bytes y los convierte a Base64 para incrustar la imagen
 * de forma permanente y portatil dentro del archivo de proyecto .json.
 */
export const ensureAssetBase64 = async (url?: string | null): Promise<string> => {
  if (!url || typeof url !== 'string') return url || '';
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:')) {
    return trimmed;
  }

  try {
    const invokeFn =
      (window as any).__TAURI__?.invoke ||
      (window as any).__TAURI_INTERNALS__?.invoke;

    if (invokeFn) {
      try {
        const resolved = await invokeFn('resolve_asset_image', { url: trimmed });
        if (typeof resolved === 'string' && resolved.startsWith('data:')) {
          return resolved;
        }
      } catch (e) {
        console.warn('resolve_asset_image fallback error:', e);
      }
    }

    const res = await fetch(trimmed);
    if (res.ok) {
      const blob = await res.blob();
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            resolve(trimmed);
          }
        };
        reader.onerror = () => resolve(trimmed);
        reader.readAsDataURL(blob);
      });
    }
  } catch (e) {
    console.warn('[imageUtils] No se pudo convertir la imagen a Base64:', e);
  }

  return trimmed;
};

/**
 * Procesa un arreglo de assets para asegurar que todas sus imagenes sean Base64 portatiles.
 */
export const processAssetsBase64 = async (assets: any[]): Promise<any[]> => {
  if (!Array.isArray(assets)) return [];
  return Promise.all(
    assets.map(async (asset) => {
      if (!asset || !asset.imageUrl) return asset;
      const base64Url = await ensureAssetBase64(asset.imageUrl);
      return { ...asset, imageUrl: base64Url };
    })
  );
};
