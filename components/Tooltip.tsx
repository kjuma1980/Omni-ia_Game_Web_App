import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { TOOLTIPS } from '../constants/tooltips';
import { HelpCircle } from 'lucide-react';

/** Claves ya avisadas, para no repetir el mismo aviso en cada render. */
const avisadas = new Set<string>();

interface TooltipProps {
  id: string;
  showTooltips?: boolean;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  inline?: boolean;
}

const Tooltip: React.FC<TooltipProps> = ({
  id,
  showTooltips = true,
  children,
  position = 'top',
  className = '',
  inline = false
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const tooltipInfo = TOOLTIPS[id];
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Update absolute page-relative coordinates of the trigger element
  const updateCoords = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;
      
      let top = 0;
      let left = 0;

      // Position calculations relative to the absolute document
      if (position === 'top') {
        top = rect.top + scrollY - 8;
        left = rect.left + scrollX + rect.width / 2;
      } else if (position === 'bottom') {
        top = rect.bottom + scrollY + 8;
        left = rect.left + scrollX + rect.width / 2;
      } else if (position === 'left') {
        top = rect.top + scrollY + rect.height / 2;
        left = rect.left + scrollX - 8;
      } else if (position === 'right') {
        top = rect.top + scrollY + rect.height / 2;
        left = rect.right + scrollX + 8;
      }

      setCoords({ top, left });
    }
  };

  // Recalculate if scrolled or resized while tooltip is visible
  useEffect(() => {
    if (isVisible) {
      updateCoords(); // Initial calculation on show
      
      const handleScrollResize = () => {
        updateCoords();
      };
      
      window.addEventListener('scroll', handleScrollResize, { passive: true });
      window.addEventListener('resize', handleScrollResize, { passive: true });
      
      // Also listen to any internal scrollable panel changes
      const scrollablePanels = document.querySelectorAll('.overflow-y-auto, .overflow-x-auto');
      scrollablePanels.forEach(panel => {
        panel.addEventListener('scroll', handleScrollResize, { passive: true });
      });

      return () => {
        window.removeEventListener('scroll', handleScrollResize);
        window.removeEventListener('resize', handleScrollResize);
        scrollablePanels.forEach(panel => {
          panel.removeEventListener('scroll', handleScrollResize);
        });
      };
    }
  }, [isVisible, position]);

  /**
   * Aviso en desarrollo cuando la clave no existe.
   *
   * Sin esto el control se pinta sin ayuda y sin error, y el fallo es
   * invisible: asi es como 22 controles llevaban tiempo sin tooltip sin que
   * nadie lo notara. Solo en desarrollo y una vez por clave, para no llenar la
   * consola del usuario final.
   */
  if ((import.meta as any).env?.DEV && !tooltipInfo && !avisadas.has(id)) {
    avisadas.add(id);
    console.warn(`[Omni IA Game] No hay tooltip definido para "${id}". Añádelo en constants/tooltips.ts.`);
  }

  if (!showTooltips || !tooltipInfo) {
    return <>{children}</>;
  }

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // 250ms delay prevents popups flashing under fast cursor sweeps
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 250);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  // Position translate adjustments matching the anchor center
  const getTransformClass = () => {
    switch (position) {
      case 'bottom':
        return '-translate-x-1/2 animate-in fade-in slide-in-from-top-1';
      case 'left':
        return '-translate-x-full -translate-y-1/2 animate-in fade-in slide-in-from-right-1';
      case 'right':
        return '-translate-y-1/2 animate-in fade-in slide-in-from-left-1';
      case 'top':
      default:
        return '-translate-x-1/2 -translate-y-full animate-in fade-in slide-in-from-bottom-1';
    }
  };

  // Arrow orientation border shapes
  const getArrowClasses = () => {
    switch (position) {
      case 'bottom':
        return 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 border-x-transparent border-t-transparent border-4';
      case 'left':
        return 'left-full top-1/2 -translate-y-1/2 border-l-slate-800 border-y-transparent border-r-transparent border-4';
      case 'right':
        return 'right-full top-1/2 -translate-y-1/2 border-r-slate-800 border-y-transparent border-l-transparent border-4';
      case 'top':
      default:
        return 'top-full left-1/2 -translate-x-1/2 border-t-slate-800 border-x-transparent border-b-transparent border-4';
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative ${inline ? 'inline-block' : 'block'} ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
    >
      {children}
      {isVisible && createPortal(
        <div
          className={`absolute z-[9999] w-64 p-3.5 bg-slate-950/95 backdrop-blur-md border border-slate-800 rounded-lg shadow-2xl pointer-events-none select-none text-left transition-all duration-200 ${getTransformClass()}`}
          style={{
            position: 'absolute',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
          }}
          role="tooltip"
        >
          {/* Arrow indicator */}
          <div className={`absolute w-0 h-0 ${getArrowClasses()}`} />
          
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-mono font-bold text-slate-100 leading-snug tracking-wide uppercase">
                {tooltipInfo.title}
              </p>
              <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                {tooltipInfo.description}
              </p>
              {tooltipInfo.shortcut && (
                <div className="pt-1 flex items-center justify-end">
                  <span className="px-1 py-0.5 bg-slate-900 border border-slate-800 text-[8px] font-mono text-slate-500 rounded">
                    {tooltipInfo.shortcut}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Tooltip;
