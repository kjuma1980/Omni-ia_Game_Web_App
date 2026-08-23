import React from 'react';

interface PencilSparkleAnimationProps {
  className?: string;
  size?: number;
}

export const PencilSparkleAnimation: React.FC<PencilSparkleAnimationProps> = ({
  className = 'w-3.5 h-3.5',
  size
}) => {
  const customStyle = size ? { width: size, height: size } : undefined;

  return (
    <div
      className={`inline-flex items-center justify-center relative select-none pointer-events-none ${className}`}
      style={customStyle}
    >
      <style>{`
        @keyframes pencil-scribble {
          0%, 100% {
            transform: translate(0px, 0px) rotate(0deg);
          }
          25% {
            transform: translate(1.5px, 0.8px) rotate(-5deg);
          }
          50% {
            transform: translate(3px, -0.5px) rotate(4deg);
          }
          75% {
            transform: translate(1.2px, 0.8px) rotate(-3deg);
          }
        }

        @keyframes sparkle-drift-1 {
          0% {
            transform: translate(0, 0) scale(0);
            opacity: 0;
          }
          25% {
            transform: translate(-3px, -4px) scale(1.2);
            opacity: 1;
          }
          75% {
            transform: translate(-6px, -9px) scale(0.8);
            opacity: 0.8;
          }
          100% {
            transform: translate(-8px, -13px) scale(0);
            opacity: 0;
          }
        }

        @keyframes sparkle-drift-2 {
          0% {
            transform: translate(0, 0) scale(0);
            opacity: 0;
          }
          30% {
            transform: translate(3px, -5px) scale(1.3);
            opacity: 1;
          }
          80% {
            transform: translate(6px, -11px) scale(0.7);
            opacity: 0.7;
          }
          100% {
            transform: translate(8px, -15px) scale(0);
            opacity: 0;
          }
        }

        @keyframes sparkle-drift-3 {
          0% {
            transform: translate(0, 0) scale(0);
            opacity: 0;
          }
          40% {
            transform: translate(0px, -6px) scale(1.1);
            opacity: 1;
          }
          90% {
            transform: translate(1px, -12px) scale(0.5);
            opacity: 0.5;
          }
          100% {
            transform: translate(1px, -16px) scale(0);
            opacity: 0;
          }
        }

        .anim-pencil {
          transform-origin: 3px 21px;
          animation: pencil-scribble 0.9s ease-in-out infinite;
        }

        .anim-sparkle-1 {
          transform-origin: 3px 21px;
          animation: sparkle-drift-1 1.1s cubic-bezier(0.25, 1, 0.5, 1) infinite;
        }

        .anim-sparkle-2 {
          transform-origin: 3px 21px;
          animation: sparkle-drift-2 1.3s cubic-bezier(0.25, 1, 0.5, 1) infinite 0.35s;
        }

        .anim-sparkle-3 {
          transform-origin: 3px 21px;
          animation: sparkle-drift-3 1.2s cubic-bezier(0.25, 1, 0.5, 1) infinite 0.7s;
        }
      `}</style>

      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full overflow-visible"
      >
        {/* Partícula de estrella 1 (Dorado brillante) */}
        <path
          d="M3 17 L3.8 19.2 L6 20 L3.8 20.8 L3 23 L2.2 20.8 L0 20 L2.2 19.2 Z"
          fill="#FDE047"
          className="anim-sparkle-1"
        />

        {/* Partícula de estrella 2 (Cian / Destello mágico) */}
        <path
          d="M4 16 L4.6 17.6 L6.2 18.2 L4.6 18.8 L4 20.4 L3.4 18.8 L1.8 18.2 L3.4 17.6 Z"
          fill="#38BDF8"
          className="anim-sparkle-2"
        />

        {/* Partícula de estrella 3 (Rosa / Púrpura cósmico) */}
        <path
          d="M2 18 L2.5 19.3 L3.8 19.8 L2.5 20.3 L2 21.6 L1.5 20.3 L0.2 19.8 L1.5 19.3 Z"
          fill="#F472B6"
          className="anim-sparkle-3"
        />

        {/* Lápiz con animación de trazo */}
        <g className="anim-pencil">
          {/* Cuerpo principal del lápiz */}
          <path
            d="M20.7 4.7 C21.1 4.3 21.1 3.7 20.7 3.3 L18.7 1.3 C18.3 0.9 17.7 0.9 17.3 1.3 L6.5 12.1 L9.9 15.5 L20.7 4.7 Z"
            fill="#F59E0B"
            stroke="#D97706"
            strokeWidth="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Banda / Virola */}
          <path
            d="M17.3 1.3 L15.3 3.3 L18.7 6.7 L20.7 4.7 L17.3 1.3 Z"
            fill="#FBBF24"
            opacity="0.85"
          />
          {/* Madera cónica de la punta */}
          <path
            d="M6.5 12.1 L3.1 18.9 C2.9 19.3 3.3 19.7 3.7 19.5 L10.5 16.1 L6.5 12.1 Z"
            fill="#FED7AA"
            stroke="#EA580C"
            strokeWidth="0.6"
          />
          {/* Mina / Grafito que escribe */}
          <path
            d="M3.1 18.9 L2 21.5 C1.8 21.9 2.1 22.2 2.5 22 L5.1 20.9 L3.1 18.9 Z"
            fill="#1E293B"
          />
          {/* Destello sutil en la punta de contacto */}
          <circle
            cx="2.2"
            cy="21.8"
            r="1"
            fill="#FEF08A"
            className="animate-ping"
          />
        </g>
      </svg>
    </div>
  );
};
export default PencilSparkleAnimation;
