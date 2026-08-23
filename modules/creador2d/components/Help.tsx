import React from 'react';
import { HelpCircle } from 'lucide-react';
import Tooltip from '../../../components/Tooltip';
import { useEditorStore } from '../state/editorStore';

/**
 * ---------------------------------------------------------------------------
 *  Ayudas flotantes del Creador 2D
 * ---------------------------------------------------------------------------
 *  Reusa el MISMO componente `Tooltip` y el MISMO mapa `TOOLTIPS` que el resto
 *  de la aplicacion, en vez de tener su propia version. Asi son identicos por
 *  construccion -mismo aspecto, mismo retardo de 250 ms, mismo formato de
 *  titulo y descripcion- y no hay dos sistemas que se separen con el tiempo.
 *
 *  Lo unico propio es de donde sale el interruptor: el modulo se carga de forma
 *  diferida y su arbol no recibe la prop `showTooltips` de la app, asi que lo
 *  lee del store del editor, que es de donde cada panel ya lee todo lo demas.
 * ---------------------------------------------------------------------------
 */
export const Help: React.FC<{
  id: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  inline?: boolean;
}> = ({ id, children, position = 'top', className, inline }) => {
  const storeShowTooltips = useEditorStore((s) => s.showTooltips);
  const showTooltips = storeShowTooltips ?? true;

  return (
    <Tooltip id={id} showTooltips={showTooltips} position={position} className={className} inline={inline}>
      {children}
    </Tooltip>
  );
};

/**
 * Boton que enciende y apaga las ayudas, equivalente al de la barra superior de
 * la aplicacion. Se coloca en la barra de herramientas del editor.
 */
export const HelpToggle: React.FC = () => {
  const showTooltips = useEditorStore((s) => s.showTooltips);
  const toggleFlag = useEditorStore((s) => s.toggleFlag);

  return (
    <button
      onClick={() => toggleFlag('showTooltips')}
      title={showTooltips ? 'Ocultar las ayudas flotantes' : 'Mostrar ayudas flotantes al pasar el ratón'}
      aria-pressed={showTooltips}
      className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wider border transition-colors ${
        showTooltips
          ? 'bg-blue-600 border-blue-500 text-white'
          : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
      }`}
    >
      <HelpCircle className="w-3.5 h-3.5" />
      Ayudas
    </button>
  );
};

export default Help;
