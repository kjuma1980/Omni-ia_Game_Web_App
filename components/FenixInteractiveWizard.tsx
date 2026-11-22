/**
 * ---------------------------------------------------------------------------
 *  Componente: Wizard Interactivo Multimodal (components/FenixInteractiveWizard.tsx)
 * ---------------------------------------------------------------------------
 *  Tarjeta interactiva para el feed de chat de Fénix Agent que guía al creador
 *  un paso a la vez mediante controles táctiles nativos (inputs, cuadrículas de
 *  estilos, píldoras y switches), evitando monólogos y listas de texto del LLM.
 * ---------------------------------------------------------------------------
 */

import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Palette,
  Globe,
  Film,
  BookOpen,
  Users,
  Code2,
  Music,
  Box,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  RotateCcw,
  Copy,
  Wand2
} from 'lucide-react';
import {
  WizardTabType,
  WIZARD_SCHEMAS,
  WizardStepDefinition,
  compileWizardOutput
} from '../constants/wizardSchemas';

interface FenixInteractiveWizardProps {
  currentTab?: string;
  initialValues?: Record<string, any>;
  onFinish: (output: ReturnType<typeof compileWizardOutput>) => void;
  onCancel: () => void;
}

export const FenixInteractiveWizard: React.FC<FenixInteractiveWizardProps> = ({
  currentTab = 'ASSETS',
  initialValues = {},
  onFinish,
  onCancel,
}) => {
  // Normalizar la pestaña activa
  const mapTabToWizard = (tab: string): WizardTabType => {
    const upper = tab.toUpperCase();
    if (upper === 'MUNDOS' || upper === 'WORLDFORGE' || upper === 'MUNDO') return 'MUNDOS';
    if (upper === 'ANIMACION' || upper === 'ANIMATION') return 'ANIMACION';
    if (upper === 'NARRATIVA' || upper === 'LORE' || upper === 'GDD') return 'NARRATIVA';
    if (upper === 'NPCS' || upper === 'NPC') return 'NPCS';
    if (upper === 'SCRIPTS' || upper === 'CODE' || upper === 'CODIGO') return 'SCRIPTS';
    if (upper === 'AUDIO' || upper === 'MUSIC' || upper === 'SFX') return 'AUDIO';
    if (upper === 'SUITE3D' || upper === '3D') return 'SUITE3D';
    return 'ASSETS';
  };

  const [activeTab, setActiveTab] = useState<WizardTabType>(mapTabToWizard(currentTab));
  const schema = WIZARD_SCHEMAS[activeTab] || WIZARD_SCHEMAS.ASSETS;

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formValues, setFormValues] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    schema.steps.forEach((s) => {
      defaults[s.id] = initialValues[s.id] ?? s.defaultValue;
    });
    return defaults;
  });

  const [copied, setCopied] = useState(false);

  // Si cambia la pestaña exterior, sincronizar si aún estamos en paso 0
  useEffect(() => {
    const mapped = mapTabToWizard(currentTab);
    if (mapped !== activeTab && currentStepIndex === 0) {
      setActiveTab(mapped);
      const newSchema = WIZARD_SCHEMAS[mapped];
      const defaults: Record<string, any> = {};
      newSchema.steps.forEach((s) => {
        defaults[s.id] = initialValues[s.id] ?? s.defaultValue;
      });
      setFormValues(defaults);
    }
  }, [currentTab]);

  const currentStep: WizardStepDefinition | undefined = schema.steps[currentStepIndex];
  const isFinalReview = currentStepIndex >= schema.steps.length;

  const handleFieldValueChange = (fieldId: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleSelectAndAdvance = (fieldId: string, val: any) => {
    setFormValues((prev) => ({ ...prev, [fieldId]: val }));
    // Auto-avance al siguiente paso
    setCurrentStepIndex((prev) => prev + 1);
  };

  const handleNext = () => {
    if (currentStepIndex < schema.steps.length) {
      setCurrentStepIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1);
    }
  };

  const handleReset = () => {
    const defaults: Record<string, any> = {};
    schema.steps.forEach((s) => {
      defaults[s.id] = s.defaultValue;
    });
    setFormValues(defaults);
    setCurrentStepIndex(0);
  };

  // Compilar resultado final
  const compiledOutput = isFinalReview ? compileWizardOutput(activeTab, formValues) : null;

  const handleCopyPrompt = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getTabIcon = (tab: WizardTabType) => {
    switch (tab) {
      case 'ASSETS': return <Palette className="w-4 h-4 text-amber-400" />;
      case 'MUNDOS': return <Globe className="w-4 h-4 text-emerald-400" />;
      case 'ANIMACION': return <Film className="w-4 h-4 text-purple-400" />;
      case 'NARRATIVA': return <BookOpen className="w-4 h-4 text-cyan-400" />;
      case 'NPCS': return <Users className="w-4 h-4 text-blue-400" />;
      case 'SCRIPTS': return <Code2 className="w-4 h-4 text-pink-400" />;
      case 'AUDIO': return <Music className="w-4 h-4 text-indigo-400" />;
      case 'SUITE3D': return <Box className="w-4 h-4 text-orange-400" />;
    }
  };

  return (
    <div className="w-full my-3 bg-gradient-to-b from-slate-900/98 to-slate-950/98 border border-amber-500/50 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.7),0_0_20px_rgba(245,158,11,0.2)] overflow-hidden text-xs text-slate-200 backdrop-blur-xl animate-fade-in font-sans">
      {/* HEADER DEL WIZARD */}
      <div className="px-3.5 py-2.5 bg-slate-900/90 border-b border-amber-500/30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-500/20 rounded-lg border border-amber-500/40">
            {getTabIcon(activeTab)}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-amber-300 tracking-wide text-xs">
                Asistente Interactivo: {schema.tabLabel}
              </span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded font-mono font-semibold">
                {isFinalReview ? 'Listo para Crear' : `Paso ${currentStepIndex + 1} de ${schema.steps.length}`}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">{schema.title}</p>
          </div>
        </div>

        <button
          onClick={onCancel}
          className="p-1 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          title="Cerrar asistente"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* BARRA DE PROGRESO */}
      <div className="w-full h-1 bg-slate-800">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-300"
          style={{
            width: `${Math.min(100, ((currentStepIndex + 1) / schema.steps.length) * 100)}%`
          }}
        />
      </div>

      {/* RESUMEN DE RESPUESTAS DADAS (BREADCRUMBS CLICABLES) */}
      <div className="px-3 py-1.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10px]">
        {schema.steps.map((s, idx) => {
          const val = formValues[s.id];
          const isDone = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;

          return (
            <button
              key={s.id}
              onClick={() => setCurrentStepIndex(idx)}
              className={`whitespace-nowrap px-2 py-0.5 rounded-full flex items-center gap-1 transition-all ${
                isCurrent
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                  : isDone
                  ? 'bg-slate-800/90 text-amber-300 hover:bg-slate-700/80 border border-slate-700'
                  : 'bg-slate-900/60 text-slate-500 opacity-60'
              }`}
            >
              {isDone && <Check className="w-2.5 h-2.5" />}
              <span>{s.title.split(' ')[0]}:</span>
              <span className="font-mono truncate max-w-[80px]">
                {typeof val === 'boolean' ? (val ? 'Sí' : 'No') : String(val || '...')}
              </span>
            </button>
          );
        })}
      </div>

      {/* CUERPO DEL PASO ACTUAL */}
      <div className="p-3.5 space-y-3">
        {!isFinalReview && currentStep && (
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                {currentStep.title}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">{currentStep.subtitle}</p>
            </div>

            {/* RENDERIZADO POR TIPO DE CAMPO */}

            {/* 1. CAMPO TEXTO CON SUGERENCIAS */}
            {currentStep.fieldType === 'text-suggest' && (
              <div className="space-y-2.5">
                <input
                  type="text"
                  value={formValues[currentStep.id] || ''}
                  onChange={(e) => handleFieldValueChange(currentStep.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNext();
                  }}
                  placeholder={currentStep.placeholder}
                  className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 font-mono"
                  autoFocus
                />

                {/* Píldoras de sugerencias rápidas */}
                {currentStep.suggestions && currentStep.suggestions.length > 0 && (
                  <div>
                    <span className="text-[10px] text-slate-400 block mb-1">
                      💡 Sugerencias rápidas (clic para aplicar):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {currentStep.suggestions.map((sug) => (
                        <button
                          key={sug}
                          type="button"
                          onClick={() => handleSelectAndAdvance(currentStep.id, sug)}
                          className="px-2 py-1 bg-slate-800/80 hover:bg-amber-950/60 hover:text-amber-300 hover:border-amber-500/50 border border-slate-700/80 rounded-lg text-[11px] transition-all active:scale-95 font-mono"
                        >
                          {sug}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 2. SELECTOR CATEGORIZADO DE ESTILOS ARTÍSTICOS (LOS 22 ESTILOS OFICIALES) */}
            {currentStep.fieldType === 'select-categories' && currentStep.categories && (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {currentStep.categories.map((cat) => (
                  <div key={cat.category} className="space-y-1.5">
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                      {cat.category}
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      {cat.options.map((opt) => {
                        const isSelected = formValues[currentStep.id] === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleSelectAndAdvance(currentStep.id, opt.value)}
                            className={`p-2 rounded-xl text-left border transition-all flex flex-col justify-between ${
                              isSelected
                                ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
                                : 'bg-slate-950/70 border-slate-800 hover:border-amber-500/50 hover:bg-slate-900 text-slate-300'
                            }`}
                          >
                            <span className="font-bold text-[11px] flex items-center justify-between">
                              {opt.label}
                              {isSelected && <Check className="w-3 h-3 text-amber-400" />}
                            </span>
                            {opt.description && (
                              <span className="text-[9px] text-slate-400 mt-0.5 line-clamp-1">
                                {opt.description}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 3. BOTONES / PÍLDORAS CLICABLES (RADIO PILLS) */}
            {currentStep.fieldType === 'radio-pills' && currentStep.options && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {currentStep.options.map((opt) => {
                  const isSelected = formValues[currentStep.id] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelectAndAdvance(currentStep.id, opt.value)}
                      className={`p-2.5 rounded-xl text-left border transition-all flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                          : 'bg-slate-950/70 border-slate-800 hover:border-amber-500/40 hover:bg-slate-900 text-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs">{opt.label}</span>
                          {opt.badge && (
                            <span className="text-[9px] bg-slate-800 px-1.5 py-0.2 rounded text-amber-300 font-mono">
                              {opt.badge}
                            </span>
                          )}
                        </div>
                        {opt.description && (
                          <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                            {opt.description}
                          </p>
                        )}
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* 4. SWITCH (FONDO TRANSPARENTE VS CON FONDO) */}
            {currentStep.fieldType === 'switch' && currentStep.switchLabels && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSelectAndAdvance(currentStep.id, true)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    formValues[currentStep.id] !== false
                      ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-emerald-400 flex items-center gap-1">
                      ✨ Sin Fondo (Transparente)
                    </span>
                    {formValues[currentStep.id] !== false && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Iluminación envolvente shadowless y fondo blanco puro para recorte perfecto sin sombras en el suelo.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectAndAdvance(currentStep.id, false)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    formValues[currentStep.id] === false
                      ? 'bg-purple-950/40 border-purple-500/60 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-xs text-purple-400 flex items-center gap-1">
                      🌄 Con Fondo (Escenario)
                    </span>
                    {formValues[currentStep.id] === false && <Check className="w-3.5 h-3.5 text-purple-400" />}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Ilustración completa con paisaje, suelo y ambiente integrado para arte conceptual o cinemáticas.
                  </p>
                </button>
              </div>
            )}
          </div>
        )}

        {/* REVISIÓN FINAL Y GENERACIÓN */}
        {isFinalReview && compiledOutput && (
          <div className="space-y-3">
            <div className="p-3 bg-slate-950/80 border border-emerald-500/40 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-emerald-400 font-bold text-xs">
                <span className="flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5" /> Prompt Oficial Compilado para Omni-IA
                </span>
                <button
                  onClick={() => handleCopyPrompt(compiledOutput.prompt)}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors flex items-center gap-1 text-[10px]"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>

              <div className="bg-slate-900/90 p-2.5 rounded-lg font-mono text-[11px] text-amber-200 leading-relaxed border border-slate-800 select-all max-h-36 overflow-y-auto">
                {compiledOutput.prompt}
              </div>

              {compiledOutput.negativePrompt && (
                <div className="text-[10px] text-slate-400">
                  <span className="text-red-400 font-bold">Exclusiones Negativas:</span> {compiledOutput.negativePrompt}
                </div>
              )}
            </div>

            {/* BOTÓN DE ACCIÓN 1-CLIC */}
            <button
              type="button"
              onClick={() => onFinish(compiledOutput)}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-[0_0_20px_rgba(245,158,11,0.4)] flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <Palette className="w-4 h-4" />
              <span>🎨 GENERAR EN EL ESTUDIO AHORA</span>
            </button>
          </div>
        )}
      </div>

      {/* FOOTER DE NAVEGACIÓN */}
      <div className="px-3.5 py-2.5 bg-slate-900/80 border-t border-slate-800/80 flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStepIndex === 0}
          className="px-2.5 py-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:pointer-events-none rounded-lg flex items-center gap-1 text-[11px] transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Anterior</span>
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleReset}
            className="p-1 text-slate-500 hover:text-amber-400 rounded-lg transition-colors"
            title="Reiniciar cuestionario"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {!isFinalReview && (
            <button
              type="button"
              onClick={handleNext}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg flex items-center gap-1 text-[11px] transition-all shadow-sm active:scale-95"
            >
              <span>{currentStepIndex === schema.steps.length - 1 ? 'Revisar' : 'Siguiente'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
