import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getBlockTile } from '../core/procedural';
import type { AssetOrigin, VisualDescriptor } from '../types';

interface Props {
  blockKey: string;
  visual: VisualDescriptor;
  size?: number;
  className?: string;
  /** Bloques con sprite propio: se dibuja la imagen en vez del procedural. */
  origin?: AssetOrigin;
  imageData?: string | null;
}

/**
 * Muestra la baldosa real del bloque, generada con el mismo codigo que dibuja
 * el lienzo. Asi la paleta nunca miente sobre como se vera el bloque colocado.
 */
export const BlockSwatch: React.FC<Props> = ({
  blockKey,
  visual,
  size = 32,
  className,
  origin,
  imageData,
}) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  /**
   * Los sprites propios se descodifican de forma asincrona. Este contador
   * fuerza un repintado cuando la imagen termina de cargar; sin el, la muestra
   * se quedaria con el dibujo procedural provisional.
   */
  const [revision, setRevision] = useState(0);
  const onReady = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }

    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(
      getBlockTile({ key: blockKey, visual, origin, imageData }, size, onReady),
      0,
      0,
      size,
      size,
    );
  }, [blockKey, visual, size, origin, imageData, onReady, revision]);

  return <canvas ref={ref} className={className} style={{ width: size, height: size }} />;
};
