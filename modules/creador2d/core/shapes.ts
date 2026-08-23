/**
 * ---------------------------------------------------------------------------
 *  Siluetas de objeto
 * ---------------------------------------------------------------------------
 *  Los patrones de `procedural.ts` son TEXTURAS: sirven para rellenar una
 *  baldosa de suelo o de muro con madera, ladrillo o piedra. Un mueble no es
 *  eso. Un barril dibujado con veta de madera es un cuadrado con vetas, no un
 *  barril.
 *
 *  Aqui se dibuja la FORMA de cada objeto sobre fondo transparente, ocupando la
 *  celda pero sin rellenarla: se reconoce por su silueta, que es lo que el ojo
 *  necesita para identificarlo de un vistazo en la paleta y en el lienzo.
 *
 *  Convenio comun a todos: el objeto se apoya en el borde inferior de la celda
 *  (igual que el ancla del Y-sort) y deja aire a los lados.
 * ---------------------------------------------------------------------------
 */

export const OBJECT_SHAPES = [
  'barrel',
  'crate',
  'bed',
  'table',
  'roundTable',
  'chair',
  'stool',
  'chest',
  'wardrobe',
  'shelf',
  'bookshelf',
  'painting',
  'mirror',
  'rug',
  'tv',
  'radio',
  'deskLamp',
  'cauldron',
  'torch',
  'streetLamp',
  'candle',
  'bucket',
  'wellStone',
  'signArrow',
  'cone',
  'barrier',
  'scaffold',
  'car',
  'bus',
  'train',
  'cart',
  'coin',
  'gem',
  'trap',
] as const;

export type ObjectShape =
  | 'barrel'
  | 'crate'
  | 'bed'
  | 'table'
  | 'roundTable'
  | 'chair'
  | 'stool'
  | 'chest'
  | 'wardrobe'
  | 'shelf'
  | 'bookshelf'
  | 'painting'
  | 'mirror'
  | 'rug'
  | 'tv'
  | 'radio'
  | 'deskLamp'
  | 'cauldron'
  | 'torch'
  | 'streetLamp'
  | 'candle'
  | 'bucket'
  | 'wellStone'
  | 'signArrow'
  | 'cone'
  | 'barrier'
  | 'scaffold'
  | 'car'
  | 'bus'
  | 'train'
  | 'cart'
  | 'coin'
  | 'gem'
  | 'trap';

interface Palette {
  base: string;
  dark: string;
  accent: string;
}

/** Sombra de contacto: asienta el objeto en el suelo en lugar de flotar. */
function groundShadow(ctx: CanvasRenderingContext2D, s: number, width = 0.7): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.94, s * width * 0.5, s * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function outline(ctx: CanvasRenderingContext2D, colour = 'rgba(0, 0, 0, 0.45)', width = 1): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Rectangulo con esquinas redondeadas, la primitiva mas usada aqui. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Dibuja la silueta indicada. Devuelve `false` si la forma no esta contemplada,
 * para que el llamador recurra al patron de textura.
 */
export function paintShape(
  ctx: CanvasRenderingContext2D,
  shape: ObjectShape,
  size: number,
  palette: Palette,
): boolean {
  const s = size;
  const { base, dark, accent } = palette;

  ctx.clearRect(0, 0, s, s);
  ctx.lineJoin = 'round';

  switch (shape) {
    case 'barrel': {
      groundShadow(ctx, s, 0.6);
      const x = s * 0.24;
      const w = s * 0.52;
      const top = s * 0.16;
      const h = s * 0.76;

      // Cuerpo abombado: dos curvas laterales, no un rectangulo.
      ctx.beginPath();
      ctx.moveTo(x, top + s * 0.06);
      ctx.quadraticCurveTo(x - s * 0.07, top + h / 2, x, top + h - s * 0.06);
      ctx.lineTo(x + w, top + h - s * 0.06);
      ctx.quadraticCurveTo(x + w + s * 0.07, top + h / 2, x + w, top + s * 0.06);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Aros metalicos.
      ctx.fillStyle = accent;
      ctx.fillRect(x - s * 0.05, top + h * 0.22, w + s * 0.1, s * 0.06);
      ctx.fillRect(x - s * 0.05, top + h * 0.66, w + s * 0.1, s * 0.06);

      // Tapa.
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.ellipse(s * 0.5, top + s * 0.06, w / 2, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      outline(ctx);
      return true;
    }

    case 'crate': {
      groundShadow(ctx, s, 0.66);
      roundRect(ctx, s * 0.16, s * 0.24, s * 0.68, s * 0.68, s * 0.04);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Refuerzos en aspa: lo que distingue una caja de un bloque.
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(s * 0.16, s * 0.24);
      ctx.lineTo(s * 0.84, s * 0.92);
      ctx.moveTo(s * 0.84, s * 0.24);
      ctx.lineTo(s * 0.16, s * 0.92);
      ctx.stroke();

      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.strokeRect(s * 0.16, s * 0.24, s * 0.68, s * 0.68);
      return true;
    }

    case 'bed': {
      groundShadow(ctx, s, 0.85);
      // Cabecero.
      roundRect(ctx, s * 0.08, s * 0.26, s * 0.1, s * 0.5, s * 0.03);
      ctx.fillStyle = dark;
      ctx.fill();
      outline(ctx);

      // Colchon.
      roundRect(ctx, s * 0.16, s * 0.46, s * 0.74, s * 0.3, s * 0.05);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Manta doblada.
      roundRect(ctx, s * 0.42, s * 0.46, s * 0.48, s * 0.3, s * 0.05);
      ctx.fillStyle = accent;
      ctx.fill();
      outline(ctx, 'rgba(0,0,0,0.3)');

      // Almohada.
      roundRect(ctx, s * 0.2, s * 0.5, s * 0.18, s * 0.16, s * 0.05);
      ctx.fillStyle = '#f0ece2';
      ctx.fill();
      outline(ctx, 'rgba(0,0,0,0.25)');

      // Patas.
      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.18, s * 0.76, s * 0.06, s * 0.14);
      ctx.fillRect(s * 0.82, s * 0.76, s * 0.06, s * 0.14);
      return true;
    }

    case 'table':
    case 'roundTable': {
      groundShadow(ctx, s, 0.78);
      const top = s * 0.42;

      if (shape === 'roundTable') {
        ctx.beginPath();
        ctx.ellipse(s * 0.5, top, s * 0.36, s * 0.11, 0, 0, Math.PI * 2);
        ctx.fillStyle = base;
        ctx.fill();
        outline(ctx);

        ctx.fillStyle = dark;
        ctx.fillRect(s * 0.45, top, s * 0.1, s * 0.42);
        ctx.beginPath();
        ctx.ellipse(s * 0.5, s * 0.86, s * 0.18, s * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
        outline(ctx);
      } else {
        roundRect(ctx, s * 0.1, top, s * 0.8, s * 0.12, s * 0.03);
        ctx.fillStyle = base;
        ctx.fill();
        outline(ctx);

        ctx.fillStyle = dark;
        ctx.fillRect(s * 0.16, top + s * 0.12, s * 0.08, s * 0.36);
        ctx.fillRect(s * 0.76, top + s * 0.12, s * 0.08, s * 0.36);
      }
      return true;
    }

    case 'chair': {
      groundShadow(ctx, s, 0.5);
      // Respaldo.
      roundRect(ctx, s * 0.3, s * 0.18, s * 0.4, s * 0.34, s * 0.04);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.36, s * 0.26, s * 0.28, s * 0.05);

      // Asiento.
      roundRect(ctx, s * 0.26, s * 0.5, s * 0.48, s * 0.1, s * 0.03);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Patas.
      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.3, s * 0.6, s * 0.06, s * 0.3);
      ctx.fillRect(s * 0.64, s * 0.6, s * 0.06, s * 0.3);
      return true;
    }

    case 'stool': {
      groundShadow(ctx, s, 0.45);
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.5, s * 0.24, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.32, s * 0.52, s * 0.05, s * 0.36);
      ctx.fillRect(s * 0.63, s * 0.52, s * 0.05, s * 0.36);
      ctx.fillRect(s * 0.34, s * 0.72, s * 0.32, s * 0.04);
      return true;
    }

    case 'chest': {
      groundShadow(ctx, s, 0.68);
      // Cuerpo.
      roundRect(ctx, s * 0.14, s * 0.5, s * 0.72, s * 0.4, s * 0.04);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Tapa abombada: la firma visual de un baul.
      ctx.beginPath();
      ctx.moveTo(s * 0.14, s * 0.5);
      ctx.quadraticCurveTo(s * 0.5, s * 0.16, s * 0.86, s * 0.5);
      ctx.closePath();
      ctx.fillStyle = dark;
      ctx.fill();
      outline(ctx);

      // Herrajes y cerradura.
      ctx.fillStyle = accent;
      ctx.fillRect(s * 0.44, s * 0.42, s * 0.12, s * 0.2);
      ctx.fillRect(s * 0.12, s * 0.62, s * 0.76, s * 0.05);
      return true;
    }

    case 'wardrobe': {
      groundShadow(ctx, s, 0.62);
      roundRect(ctx, s * 0.2, s * 0.1, s * 0.6, s * 0.8, s * 0.03);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Dos puertas.
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.12);
      ctx.lineTo(s * 0.5, s * 0.88);
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(s * 0.44, s * 0.5, s * 0.035, 0, Math.PI * 2);
      ctx.arc(s * 0.56, s * 0.5, s * 0.035, 0, Math.PI * 2);
      ctx.fill();
      return true;
    }

    case 'shelf':
    case 'bookshelf': {
      groundShadow(ctx, s, 0.62);
      roundRect(ctx, s * 0.18, s * 0.14, s * 0.64, s * 0.76, s * 0.02);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Baldas.
      ctx.fillStyle = dark;
      for (let i = 1; i <= 3; i += 1) {
        ctx.fillRect(s * 0.18, s * 0.14 + (s * 0.76 * i) / 4, s * 0.64, s * 0.04);
      }

      if (shape === 'bookshelf') {
        // Libros de colores en las baldas.
        const colours = [accent, '#8c4a4a', '#3f6d8a', '#6b7f3a'];
        for (let row = 0; row < 3; row += 1) {
          for (let b = 0; b < 5; b += 1) {
            ctx.fillStyle = colours[(row + b) % colours.length];
            const bx = s * 0.22 + b * s * 0.115;
            const by = s * 0.18 + (s * 0.76 * row) / 4;
            ctx.fillRect(bx, by, s * 0.08, s * 0.14);
          }
        }
      }
      return true;
    }

    case 'painting': {
      // Cuelga: no lleva sombra de contacto con el suelo.
      roundRect(ctx, s * 0.16, s * 0.2, s * 0.68, s * 0.56, s * 0.02);
      ctx.fillStyle = dark;
      ctx.fill();
      outline(ctx);

      ctx.fillStyle = base;
      ctx.fillRect(s * 0.22, s * 0.26, s * 0.56, s * 0.44);

      // Paisaje sugerido dentro del marco.
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(s * 0.22, s * 0.62);
      ctx.lineTo(s * 0.4, s * 0.38);
      ctx.lineTo(s * 0.55, s * 0.56);
      ctx.lineTo(s * 0.68, s * 0.42);
      ctx.lineTo(s * 0.78, s * 0.62);
      ctx.closePath();
      ctx.fill();
      return true;
    }

    case 'mirror': {
      roundRect(ctx, s * 0.28, s * 0.14, s * 0.44, s * 0.72, s * 0.2);
      ctx.fillStyle = dark;
      ctx.fill();
      outline(ctx);

      roundRect(ctx, s * 0.33, s * 0.19, s * 0.34, s * 0.62, s * 0.17);
      ctx.fillStyle = accent;
      ctx.fill();

      // Reflejo diagonal.
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.moveTo(s * 0.36, s * 0.66);
      ctx.lineTo(s * 0.56, s * 0.26);
      ctx.lineTo(s * 0.63, s * 0.28);
      ctx.lineTo(s * 0.43, s * 0.68);
      ctx.closePath();
      ctx.fill();
      return true;
    }

    case 'rug': {
      // Tumbada en el suelo: elipse, no rectangulo de pie.
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.7, s * 0.42, s * 0.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx, 'rgba(0,0,0,0.35)');

      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.7, s * 0.3, s * 0.13, 0, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.7, s * 0.16, s * 0.06, 0, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      return true;
    }

    case 'tv': {
      groundShadow(ctx, s, 0.6);
      roundRect(ctx, s * 0.12, s * 0.24, s * 0.76, s * 0.46, s * 0.04);
      ctx.fillStyle = dark;
      ctx.fill();
      outline(ctx);

      ctx.fillStyle = accent;
      ctx.fillRect(s * 0.17, s * 0.29, s * 0.66, s * 0.36);

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(s * 0.2, s * 0.62);
      ctx.lineTo(s * 0.44, s * 0.31);
      ctx.lineTo(s * 0.54, s * 0.31);
      ctx.lineTo(s * 0.3, s * 0.62);
      ctx.closePath();
      ctx.fill();

      // Peana.
      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.45, s * 0.7, s * 0.1, s * 0.12);
      ctx.fillRect(s * 0.32, s * 0.82, s * 0.36, s * 0.06);
      return true;
    }

    case 'radio': {
      groundShadow(ctx, s, 0.55);
      roundRect(ctx, s * 0.2, s * 0.42, s * 0.6, s * 0.44, s * 0.05);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Altavoz.
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.arc(s * 0.38, s * 0.64, s * 0.11, 0, Math.PI * 2);
      ctx.fill();

      // Dial y mandos.
      ctx.fillStyle = accent;
      ctx.fillRect(s * 0.54, s * 0.5, s * 0.2, s * 0.09);
      ctx.beginPath();
      ctx.arc(s * 0.6, s * 0.72, s * 0.04, 0, Math.PI * 2);
      ctx.arc(s * 0.7, s * 0.72, s * 0.04, 0, Math.PI * 2);
      ctx.fill();

      // Antena.
      ctx.strokeStyle = dark;
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      ctx.moveTo(s * 0.7, s * 0.42);
      ctx.lineTo(s * 0.82, s * 0.18);
      ctx.stroke();
      return true;
    }

    case 'deskLamp': {
      groundShadow(ctx, s, 0.42);
      // Base y brazo.
      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.36, s * 0.84, s * 0.28, s * 0.06);
      ctx.fillRect(s * 0.47, s * 0.44, s * 0.06, s * 0.42);

      // Pantalla.
      ctx.beginPath();
      ctx.moveTo(s * 0.28, s * 0.44);
      ctx.lineTo(s * 0.72, s * 0.44);
      ctx.lineTo(s * 0.62, s * 0.2);
      ctx.lineTo(s * 0.38, s * 0.2);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Halo de luz.
      const glow = ctx.createRadialGradient(s * 0.5, s * 0.5, 1, s * 0.5, s * 0.5, s * 0.3);
      glow.addColorStop(0, accent);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(s * 0.2, s * 0.44, s * 0.6, s * 0.36);
      return true;
    }

    case 'cauldron': {
      groundShadow(ctx, s, 0.62);
      ctx.beginPath();
      ctx.moveTo(s * 0.22, s * 0.48);
      ctx.quadraticCurveTo(s * 0.5, s * 0.98, s * 0.78, s * 0.48);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Contenido burbujeante.
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.48, s * 0.28, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();

      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(s * 0.44, s * 0.4, s * 0.04, 0, Math.PI * 2);
      ctx.arc(s * 0.58, s * 0.34, s * 0.03, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Patas.
      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.3, s * 0.82, s * 0.06, s * 0.1);
      ctx.fillRect(s * 0.64, s * 0.82, s * 0.06, s * 0.1);
      return true;
    }

    case 'torch':
    case 'candle': {
      const slim = shape === 'candle';
      groundShadow(ctx, s, slim ? 0.3 : 0.36);

      ctx.fillStyle = base;
      const w = slim ? s * 0.12 : s * 0.1;
      ctx.fillRect(s * 0.5 - w / 2, slim ? s * 0.5 : s * 0.42, w, slim ? s * 0.42 : s * 0.5);

      const flameTop = slim ? s * 0.32 : s * 0.14;
      const glow = ctx.createRadialGradient(s * 0.5, s * 0.4, 1, s * 0.5, s * 0.4, s * 0.4);
      glow.addColorStop(0, accent);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, s, s);

      ctx.beginPath();
      ctx.moveTo(s * 0.5, flameTop);
      ctx.quadraticCurveTo(s * 0.66, s * 0.4, s * 0.5, s * 0.52);
      ctx.quadraticCurveTo(s * 0.34, s * 0.4, s * 0.5, flameTop);
      ctx.fillStyle = accent;
      ctx.fill();
      return true;
    }

    case 'streetLamp': {
      groundShadow(ctx, s, 0.3);
      ctx.fillStyle = base;
      ctx.fillRect(s * 0.46, s * 0.22, s * 0.08, s * 0.68);
      ctx.fillRect(s * 0.36, s * 0.88, s * 0.28, s * 0.06);

      // Brazo curvo y luminaria.
      ctx.strokeStyle = base;
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.24);
      ctx.quadraticCurveTo(s * 0.5, s * 0.1, s * 0.72, s * 0.12);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(s * 0.62, s * 0.14);
      ctx.lineTo(s * 0.82, s * 0.14);
      ctx.lineTo(s * 0.76, s * 0.26);
      ctx.lineTo(s * 0.68, s * 0.26);
      ctx.closePath();
      ctx.fillStyle = accent;
      ctx.fill();

      const glow = ctx.createRadialGradient(s * 0.72, s * 0.28, 1, s * 0.72, s * 0.28, s * 0.35);
      glow.addColorStop(0, accent);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(s * 0.35, s * 0.1, s * 0.65, s * 0.6);
      return true;
    }

    case 'bucket': {
      groundShadow(ctx, s, 0.5);
      ctx.beginPath();
      ctx.moveTo(s * 0.3, s * 0.42);
      ctx.lineTo(s * 0.7, s * 0.42);
      ctx.lineTo(s * 0.64, s * 0.88);
      ctx.lineTo(s * 0.36, s * 0.88);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.beginPath();
      ctx.arc(s * 0.5, s * 0.42, s * 0.2, Math.PI, 0);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.42, s * 0.2, s * 0.05, 0, 0, Math.PI * 2);
      ctx.fillStyle = dark;
      ctx.fill();
      return true;
    }

    case 'wellStone': {
      groundShadow(ctx, s, 0.8);
      // Brocal.
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.7, s * 0.34, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.68, s * 0.22, s * 0.08, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#0d1520';
      ctx.fill();

      // Postes y techado.
      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.2, s * 0.24, s * 0.06, s * 0.42);
      ctx.fillRect(s * 0.74, s * 0.24, s * 0.06, s * 0.42);

      ctx.beginPath();
      ctx.moveTo(s * 0.12, s * 0.26);
      ctx.lineTo(s * 0.5, s * 0.06);
      ctx.lineTo(s * 0.88, s * 0.26);
      ctx.closePath();
      ctx.fillStyle = accent;
      ctx.fill();
      outline(ctx);
      return true;
    }

    case 'signArrow': {
      groundShadow(ctx, s, 0.28);
      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.46, s * 0.36, s * 0.08, s * 0.56);

      ctx.beginPath();
      ctx.moveTo(s * 0.12, s * 0.16);
      ctx.lineTo(s * 0.7, s * 0.16);
      ctx.lineTo(s * 0.86, s * 0.3);
      ctx.lineTo(s * 0.7, s * 0.44);
      ctx.lineTo(s * 0.12, s * 0.44);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1.5, s * 0.04);
      ctx.beginPath();
      ctx.moveTo(s * 0.22, s * 0.26);
      ctx.lineTo(s * 0.6, s * 0.26);
      ctx.moveTo(s * 0.22, s * 0.35);
      ctx.lineTo(s * 0.5, s * 0.35);
      ctx.stroke();
      return true;
    }

    case 'cone': {
      groundShadow(ctx, s, 0.5);
      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.16);
      ctx.lineTo(s * 0.72, s * 0.82);
      ctx.lineTo(s * 0.28, s * 0.82);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Bandas reflectantes.
      ctx.fillStyle = accent;
      ctx.fillRect(s * 0.36, s * 0.44, s * 0.28, s * 0.09);
      ctx.fillRect(s * 0.32, s * 0.6, s * 0.36, s * 0.09);

      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.2, s * 0.82, s * 0.6, s * 0.08);
      return true;
    }

    case 'barrier': {
      groundShadow(ctx, s, 0.8);
      // Tablero a franjas: la senal universal de obra.
      const stripes = 5;
      for (let i = 0; i < stripes; i += 1) {
        ctx.fillStyle = i % 2 === 0 ? base : accent;
        ctx.save();
        ctx.beginPath();
        ctx.rect(s * 0.1 + (i * s * 0.8) / stripes, s * 0.3, (s * 0.8) / stripes, s * 0.26);
        ctx.clip();
        ctx.fillRect(0, 0, s, s);
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(s * 0.1, s * 0.3, s * 0.8, s * 0.26);

      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.2, s * 0.56, s * 0.06, s * 0.32);
      ctx.fillRect(s * 0.74, s * 0.56, s * 0.06, s * 0.32);
      return true;
    }

    case 'scaffold': {
      // Portico bajo el que se desliza el personaje: hueco en la parte baja.
      ctx.strokeStyle = base;
      ctx.lineWidth = Math.max(2, s * 0.08);
      ctx.beginPath();
      ctx.moveTo(s * 0.14, s * 0.92);
      ctx.lineTo(s * 0.14, s * 0.2);
      ctx.lineTo(s * 0.86, s * 0.2);
      ctx.lineTo(s * 0.86, s * 0.92);
      ctx.stroke();

      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(s * 0.14, s * 0.36);
      ctx.lineTo(s * 0.86, s * 0.36);
      ctx.stroke();

      // Aspas laterales.
      ctx.strokeStyle = dark;
      ctx.beginPath();
      ctx.moveTo(s * 0.14, s * 0.2);
      ctx.lineTo(s * 0.5, s * 0.36);
      ctx.moveTo(s * 0.86, s * 0.2);
      ctx.lineTo(s * 0.5, s * 0.36);
      ctx.stroke();

      ctx.fillStyle = accent;
      ctx.fillRect(s * 0.14, s * 0.14, s * 0.72, s * 0.07);
      return true;
    }

    case 'car':
    case 'bus':
    case 'train': {
      // Vista cenital y orientado en VERTICAL: en un runner el trafico avanza
      // por el carril, no de lado.
      groundShadow(ctx, s, 0.62);

      const long = shape === 'car' ? 0.78 : 0.94;
      const wide = shape === 'train' ? 0.62 : 0.52;
      const x = s * (0.5 - wide / 2);
      const y = s * (0.5 - long / 2);

      roundRect(ctx, x, y, s * wide, s * long, s * (shape === 'car' ? 0.12 : 0.06));
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      // Parabrisas y luneta.
      ctx.fillStyle = accent;
      roundRect(ctx, x + s * 0.06, y + s * 0.08, s * wide - s * 0.12, s * 0.16, s * 0.03);
      ctx.fill();

      if (shape === 'car') {
        roundRect(ctx, x + s * 0.06, y + s * long - s * 0.24, s * wide - s * 0.12, s * 0.14, s * 0.03);
        ctx.fill();
      } else {
        // Ventanillas laterales del autobus o vagones del tren.
        ctx.fillStyle = accent;
        const count = shape === 'bus' ? 4 : 5;
        for (let i = 0; i < count; i += 1) {
          const wy = y + s * 0.3 + (i * (s * long - s * 0.42)) / count;
          ctx.fillRect(x + s * 0.04, wy, s * wide - s * 0.08, s * 0.06);
        }
      }

      // Faros.
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(x + s * 0.04, y + s * 0.02, s * 0.08, s * 0.04);
      ctx.fillRect(x + s * wide - s * 0.12, y + s * 0.02, s * 0.08, s * 0.04);

      // Franja central.
      ctx.fillStyle = dark;
      ctx.fillRect(s * 0.5 - s * 0.02, y + s * 0.26, s * 0.04, s * long - s * 0.5);
      return true;
    }

    case 'cart': {
      groundShadow(ctx, s, 0.7);
      roundRect(ctx, s * 0.16, s * 0.34, s * 0.68, s * 0.3, s * 0.04);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx);

      ctx.fillStyle = accent;
      ctx.fillRect(s * 0.22, s * 0.38, s * 0.32, s * 0.16);

      ctx.fillStyle = dark;
      for (const wx of [s * 0.32, s * 0.7]) {
        ctx.beginPath();
        ctx.arc(wx, s * 0.72, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = Math.max(1, s * 0.03);
        ctx.stroke();
      }
      return true;
    }

    case 'coin': {
      const glow = ctx.createRadialGradient(s * 0.5, s * 0.5, 1, s * 0.5, s * 0.5, s * 0.45);
      glow.addColorStop(0, 'rgba(255, 215, 90, 0.55)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, s, s);

      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.5, s * 0.26, s * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx, 'rgba(120, 80, 0, 0.6)', 1.5);

      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.5, s * 0.16, s * 0.2, 0, 0, Math.PI * 2);
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      ctx.stroke();
      return true;
    }

    case 'gem': {
      const glow = ctx.createRadialGradient(s * 0.5, s * 0.5, 1, s * 0.5, s * 0.5, s * 0.45);
      glow.addColorStop(0, 'rgba(120, 220, 255, 0.5)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, s, s);

      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.18);
      ctx.lineTo(s * 0.78, s * 0.44);
      ctx.lineTo(s * 0.5, s * 0.82);
      ctx.lineTo(s * 0.22, s * 0.44);
      ctx.closePath();
      ctx.fillStyle = base;
      ctx.fill();
      outline(ctx, 'rgba(0,60,90,0.6)', 1.5);

      ctx.beginPath();
      ctx.moveTo(s * 0.5, s * 0.18);
      ctx.lineTo(s * 0.5, s * 0.82);
      ctx.moveTo(s * 0.22, s * 0.44);
      ctx.lineTo(s * 0.78, s * 0.44);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.stroke();
      return true;
    }

    case 'trap': {
      groundShadow(ctx, s, 0.7);
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.62, s * 0.34, s * 0.22, 0, 0, Math.PI * 2);
      ctx.fillStyle = dark;
      ctx.fill();
      outline(ctx);

      // Dientes enfrentados.
      ctx.fillStyle = base;
      for (let i = 0; i < 6; i += 1) {
        const angle = Math.PI + (i * Math.PI) / 5;
        const cx = s * 0.5 + Math.cos(angle) * s * 0.28;
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.04, s * 0.56);
        ctx.lineTo(cx, s * 0.4);
        ctx.lineTo(cx + s * 0.04, s * 0.56);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(s * 0.5, s * 0.64, s * 0.16, s * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      return true;
    }

    default:
      return false;
  }
}
