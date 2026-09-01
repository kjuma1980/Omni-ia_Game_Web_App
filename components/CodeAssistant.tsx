import React, { useState, useEffect, useRef } from 'react';
import Tooltip from './Tooltip';
import { generateText, refinePrompt } from '../services/aiProvider';
import { ChatMessage, ProjectData } from '../types';
import { Terminal, Send, Code2, Copy, Server, Wand2, Loader2, Download, Info, Square, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import PencilSparkleAnimation from './PencilSparkleAnimation';

import { showToast } from '../utils/toast';

interface CodeAssistantProps {
  state: ProjectData['codeState'];
  updateState: (updates: Partial<ProjectData['codeState']>) => void;
  apiSettings?: ProjectData['apiSettings'];
  showTooltips?: boolean;
}

// Heurística robusta para extraer el bloque de código principal (el más largo) generado por la IA
const extractCodeBlock = (text: string): string => {
  if (!text) return '';
  const regex = /```(?:[a-zA-Z0-9+#-]+)?\s*([\s\S]*?)```/g;
  let matches: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      matches.push(match[1].trim());
    }
  }
  if (matches.length > 0) {
    return matches.reduce((a, b) => (a.length > b.length ? a : b));
  }
  // Fallback si no hay bloques de código markdown
  return text.trim();
};

const CodeAssistant: React.FC<CodeAssistantProps> = ({ state, updateState, apiSettings, showTooltips }) => {
  const { messages, input } = state;
  const [loading, setLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const abortRefineRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Estados de exportación de scripts
  const [exportFormat, setExportFormat] = useState<'unity' | 'godot' | 'unreal' | 'json'>('unity');
  const [filename, setFilename] = useState('GameLogic');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: input, type: 'text' };
    const newMessages = [...messages, userMsg];
    updateState({ messages: newMessages, input: '' });
    setLoading(true);

    // Contextualizar el prompt según el motor seleccionado
    let systemRole = "You are an expert Unity C# developer. Provide a complete, optimized C# script.";
    if (exportFormat === 'godot') {
      systemRole = "You are an expert Godot GDScript developer. Provide a complete, optimized GDScript (compatible with Godot 4.x).";
    } else if (exportFormat === 'unreal') {
      systemRole = "You are an expert Unreal Engine C++ developer. Provide a complete, optimized C++ header (.h) or implementation (.cpp) file structure.";
    } else if (exportFormat === 'json') {
      systemRole = "You are an expert game systems designer. Provide a complete, structured JSON configuration representing the game systems or logic requested.";
    }

    try {
      // Invocamos generateText indicando useCodeSettings = true como 5to parámetro
      const responseText = await generateText(
        `${systemRole} Include comments explaining key parts. Wrap code in markdown code blocks.\n\nRequest: ${input}`,
        apiSettings,
        false,
        false,
        true
      );

      const modelMsg: ChatMessage = { 
        id: (Date.now() + 1).toString(), 
        role: 'model', 
        content: responseText, 
        type: 'code' 
      };
      updateState({ messages: [...newMessages, modelMsg] });
    } catch (error) {
      updateState({ messages: [...newMessages, { id: `err_${Date.now()}`, role: 'model', content: "System Failure: Connection severed (or local model offline).", type: 'text' }] });
    } finally {
      setLoading(false);
    }
  };

  // Buscar el último bloque de código generado por la IA en el historial de chat
  const lastModelMsg = [...messages].reverse().find(m => m.role === 'model' && m.content && m.content !== "System Failure: Connection severed (or local model offline).");
  const extractedCode = lastModelMsg ? extractCodeBlock(lastModelMsg.content) : '';

  // Generar contenido del script o plantilla informativa por defecto
  const getScriptContent = () => {
    if (extractedCode) {
      return extractedCode;
    }

    const baseName = filename || 'GameLogic';
    if (exportFormat === 'unity') {
      return `using UnityEngine;
using System.Collections;

public class ${baseName} : MonoBehaviour
{
    // [VISTA PREVIA] Escribe un requerimiento en el chat de la izquierda.
    // El script C# generado aparecerá aquí listo para compilar.
    void Start()
    {
        Debug.Log("${baseName} initialized.");
    }
}`;
    } else if (exportFormat === 'godot') {
      return `# [VISTA PREVIA] Escribe un requerimiento en el chat de la izquierda.
# El script GDScript generado aparecerá aquí.
extends Node

class_name ${baseName}

func _ready():
\tprint("${baseName} ready.")
`;
    } else if (exportFormat === 'unreal') {
      return `// [VISTA PREVIA] Escribe un requerimiento en el chat de la izquierda.
// El script C++ generado aparecerá aquí.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "${baseName}.generated.h"

UCLASS( ClassGroup=(Custom), meta=(BlueprintSpawnableComponent) )
class GAME_API U${baseName} : public UActorComponent
{
\tGENERATED_BODY()
public:
\tU${baseName}();
protected:
\tvirtual void BeginPlay() override;
};
`;
    } else {
      return `{
  "filename": "${baseName}",
  "instructions": "Escribe un requerimiento en el chat de la izquierda. El JSON purificado aparecerá aquí."
}`;
    }
  };

  const scriptContent = getScriptContent();

  // Guardar archivo nativo mediante Tauri o fallback a navegador web
  const handleDownload = async () => {
    const sanitizedName = filename.trim().replace(/[^a-zA-Z0-9_]/g, '') || 'GameLogic';
    const extension = exportFormat === 'unity' ? 'cs' : exportFormat === 'godot' ? 'gd' : exportFormat === 'unreal' ? 'cpp' : 'json';
    const fullFilename = `${sanitizedName}.${extension}`;

    try {
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      if (invokeFn) {
        // Usar comando nativo de Rust save_text_file registrado para el proyecto
        const res = await invokeFn('save_text_file', {
          content: scriptContent,
          filename: fullFilename,
          extension: extension
        });
        if (res && typeof res === 'string') {
          showToast(res);
        }
        return;
      }
    } catch (e) {
      console.warn("Tauri native save failed, falling back to browser download:", e);
    }

    // Fallback de descarga HTML5 en navegador
    const blob = new Blob([scriptContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const PRESETS = [
    "Create a billboard script for 2.5D sprites facing the AR camera",
    "Write a script for a flickering flashlight with battery drain",
    "Detect a 'Floor' plane using ARFoundation and spawn La Patasola"
  ];

  // Identificar estado del proveedor de código
  const codeProvider = apiSettings?.code?.provider || 'ollama';
  const codeModel = apiSettings?.code?.model || 'default';
  const isCloud = ['gemini', 'anthropic', 'openai', 'deepseek', 'qwen', 'kimi'].includes(codeProvider);

  return (
    <div className="flex h-full gap-6 p-6 overflow-hidden">
      {/* Panel Izquierdo: Chat de requerimientos */}
      <div className="flex-1 flex flex-col bg-slate-900/90 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
        {/* Cabecera del compilador */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-500 font-mono">
            <Terminal className="w-5 h-5 animate-pulse" />
            <span>SCRIPTS_COMPILER_V1.0</span>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-emerald-500">
              <Server className="w-3.5 h-3.5" />
              {isCloud ? 'CLOUD_CORE' : 'LOCAL_CORE'}: {codeProvider.toUpperCase()} ({codeModel})
            </span>
            <span className="text-slate-600 hidden md:inline">META_XR_SDK // AR_FOUNDATION</span>
            <Tooltip id="codeClearTabBtn" inline showTooltips={showTooltips}>
              <button
                onClick={() => {
                  if (!confirmClear) {
                    setConfirmClear(true);
                    setTimeout(() => setConfirmClear(false), 3000);
                    return;
                  }
                  updateState({ messages: [], input: '' });
                  setConfirmClear(false);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold rounded border transition-all ${
                  confirmClear 
                    ? 'bg-red-600 text-white border-red-500 animate-pulse' 
                    : 'bg-red-950/40 hover:bg-red-900/40 text-red-400 border-red-800/40 hover:border-red-600/60'
                }`}
              >
                <X className="w-3 h-3" />
                {confirmClear ? '¿CONFIRMAR LIMPIAR?' : 'LIMPIAR TAB'}
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Historial de Chat */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[url('/carbon-fibre.png')]">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
              <Code2 className="w-16 h-16 text-slate-700 mb-4 animate-pulse" />
              <h3 className="text-sm font-bold font-mono text-slate-400 mb-2">Asistente de Código Inteligente</h3>
              <p className="text-xs font-mono text-slate-600 max-w-md leading-relaxed">
                Describe mecánicas, comportamientos AR/VR, lógica de interfaz o físicas de juego. La IA compilará el script óptimo para tu motor seleccionado.
              </p>
            </div>
          ) : (
            messages.map((msg, index) => (
              <div key={`${msg.id}_${index}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-lg p-4 shadow-md ${
                  msg.role === 'user' 
                    ? 'bg-slate-700 text-slate-100 border border-slate-600' 
                    : 'bg-slate-950/80 text-green-400 border border-green-900/30 font-mono'
                }`}>
                  {msg.role === 'model' ? (
                    <div className="prose prose-invert prose-pre:bg-black prose-pre:border prose-pre:border-slate-800 max-w-none text-xs leading-relaxed select-text">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          {loading && (
             <div className="flex justify-start">
               <div className="bg-slate-950/50 p-3 rounded text-green-500 font-mono animate-pulse border border-green-950 flex items-center gap-2 text-xs">
                 <Loader2 className="w-3.5 h-3.5 animate-spin" />
                 {isCloud ? 'Compiling cloud script logic...' : 'Inferencing local code model...'}
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Caja de Entrada de Mensajes */}
        <div className="p-4 bg-slate-900 border-t border-slate-800">
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1.5 scrollbar-thin scrollbar-thumb-slate-850">
            {PRESETS.map((preset, idx) => (
              <button 
                key={idx}
                type="button"
                onClick={() => updateState({ input: preset })}
                className="whitespace-nowrap px-3 py-1 bg-slate-800 hover:bg-slate-700 text-[10px] font-mono text-slate-400 hover:text-slate-200 rounded border border-slate-700 transition-colors"
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Tooltip id="codeQuery" showTooltips={showTooltips} className="flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => updateState({ input: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ej: Escribe un controlador para mover el personaje con WASD..."
                className="w-full bg-black/50 border border-slate-700 text-slate-200 p-3 rounded focus:border-green-500 focus:outline-none font-mono text-xs"
              />
            </Tooltip>
            <Tooltip id="codeSendBtn" inline showTooltips={showTooltips} position="left">
              <button 
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="bg-green-800 hover:bg-green-700 text-white px-4 rounded disabled:opacity-50 transition-colors h-full flex items-center justify-center"
              >
                <Send className="w-4 h-4" />
              </button>
            </Tooltip>
            {apiSettings?.promptEngineer?.enabled && (
              <Tooltip id="codeRefineBtn" inline showTooltips={showTooltips} position="left">
                <button
                  type="button"
                  onClick={async () => {
                    if (refining) {
                      if (abortRefineRef.current) {
                        abortRefineRef.current.abort();
                        abortRefineRef.current = null;
                      }
                      setRefining(false);
                      return;
                    }
                    if (!input.trim()) {
                      alert('Escribe un requerimiento o idea primero para que la IA pueda refinar.');
                      return;
                    }
                    setRefining(true);
                    const controller = new AbortController();
                    abortRefineRef.current = controller;
                    try {
                      const refined = await refinePrompt(input, '', 'code', '', '', apiSettings, undefined, controller.signal);
                      updateState({ input: refined.positive });
                    } catch (err: any) {
                      if (err?.name === 'AbortError' || String(err).includes('Aborted')) {
                        console.log('[CodeAssistant] Refinamiento de IA cancelado.');
                      } else {
                        alert(`Error del Prompt Engineer: ${err.message || err}`);
                      }
                    } finally {
                      setRefining(false);
                      abortRefineRef.current = null;
                    }
                  }}
                  disabled={loading}
                  className={`px-3 py-1.5 rounded transition-all flex items-center justify-center gap-1.5 font-mono text-[11px] font-bold ${
                    refining
                      ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md shadow-red-900/40 cursor-pointer border border-red-500'
                      : 'bg-green-950/40 hover:bg-green-900/60 text-green-400 border border-green-700/50'
                  }`}
                >
                  {refining ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Wand2 className="w-3.5 h-3.5" />}
                  <span>{refining ? '⏹ DETENER' : '✨ REFINAR'}</span>
                </button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>

      {/* Panel Derecho: Exportador de Script */}
      <div className="w-[420px] shrink-0 flex flex-col bg-slate-900/90 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">
        {/* Cabecera del Exportador */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400 font-mono">
            <Code2 className="w-5 h-5" />
            <span>SCRIPT_EXPORTER_V1.0</span>
          </div>
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-slate-900/60 px-2 py-0.5 rounded border border-slate-800">
            {exportFormat}
          </div>
        </div>

        {/* Nombre del Archivo */}
        <div className="p-4 border-b border-slate-800 space-y-2.5">
          <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wide">Nombre de Clase / Script</label>
          <Tooltip id="scriptClassName" showTooltips={showTooltips}>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
              className="w-full bg-black/50 border border-slate-700 text-slate-200 p-2 rounded text-xs font-mono focus:border-green-500 focus:outline-none"
              placeholder="ej. GameLogic"
            />
          </Tooltip>
        </div>

        {/* Selección del Motor */}
        <div className="p-4 border-b border-slate-800 space-y-2.5">
          <Tooltip id="scriptEngineSelector" showTooltips={showTooltips}>
            <label className="block text-[11px] font-mono font-bold text-slate-400 uppercase tracking-wide cursor-help">Selecciona el Motor de Destino</label>
          </Tooltip>
          <div className="grid grid-cols-2 gap-2">
            <Tooltip id="scriptEngineUnity" showTooltips={showTooltips} inline>
              <button
                type="button"
                onClick={() => setExportFormat('unity')}
                className={`w-full p-2.5 rounded-lg border text-left font-mono text-xs font-bold flex flex-col justify-between transition-all cursor-pointer ${
                  exportFormat === 'unity'
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-[10px]">🎮 Unity</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-900/80 bg-emerald-950/60 self-end mt-1.5">.cs</span>
              </button>
            </Tooltip>

            <Tooltip id="scriptEngineGodot" showTooltips={showTooltips} inline>
              <button
                type="button"
                onClick={() => setExportFormat('godot')}
                className={`w-full p-2.5 rounded-lg border text-left font-mono text-xs font-bold flex flex-col justify-between transition-all cursor-pointer ${
                  exportFormat === 'godot'
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-[10px]">🤖 Godot</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-900/80 bg-emerald-950/60 self-end mt-1.5">.gd</span>
              </button>
            </Tooltip>

            <Tooltip id="scriptEngineUnreal" showTooltips={showTooltips} inline>
              <button
                type="button"
                onClick={() => setExportFormat('unreal')}
                className={`w-full p-2.5 rounded-lg border text-left font-mono text-xs font-bold flex flex-col justify-between transition-all cursor-pointer ${
                  exportFormat === 'unreal'
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-[10px]">⚡ Unreal Engine</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-900/80 bg-emerald-950/60 self-end mt-1.5">.cpp</span>
              </button>
            </Tooltip>

            <Tooltip id="scriptEngineJson" showTooltips={showTooltips} inline>
              <button
                type="button"
                onClick={() => setExportFormat('json')}
                className={`w-full p-2.5 rounded-lg border text-left font-mono text-xs font-bold flex flex-col justify-between transition-all cursor-pointer ${
                  exportFormat === 'json'
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]'
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className="text-[10px]">📄 JSON Puro</span>
                <span className="text-[9px] font-bold px-1.5 py-0.2 rounded border border-emerald-900/80 bg-emerald-950/60 self-end mt-1.5">.json</span>
              </button>
            </Tooltip>
          </div>
        </div>

        {/* Guía de Instrucciones de Integración */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/30 flex gap-2">
          <Info className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="text-[10px] font-mono text-slate-500 leading-relaxed">
            {exportFormat === 'unity' ? (
              <p>Crea un archivo llamado <code className="text-emerald-400 font-bold">{filename}.cs</code> en la carpeta Assets de Unity y arrástralo a tu GameObject.</p>
            ) : exportFormat === 'godot' ? (
              <p>Guarda como <code className="text-emerald-400 font-bold">{filename}.gd</code> e incorpóralo en el Script de tu Nodo de Godot.</p>
            ) : exportFormat === 'unreal' ? (
              <p>Agrega como clase C++ heredando de Actor o ActorComponent en Unreal Engine y copia las declaraciones y métodos.</p>
            ) : (
              <p>Guarda el JSON para leer configuraciones, constantes de comportamiento o descripciones lógicas en tiempo de ejecución.</p>
            )}
          </div>
        </div>

        {/* Vista Previa del Código */}
        <div className="flex-1 flex flex-col overflow-hidden bg-black/50">
          <div className="px-4 py-2 border-b border-slate-850 bg-slate-950/60 flex items-center justify-between text-[9px] text-slate-500 font-mono select-none">
            <span>PREVIEW ({filename}.{exportFormat === 'unity' ? 'cs' : exportFormat === 'godot' ? 'gd' : exportFormat === 'unreal' ? 'cpp' : 'json'})</span>
            <Tooltip id="scriptCopyBtn" showTooltips={showTooltips} inline>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(scriptContent);
                  alert("¡Código copiado al portapapeles!");
                }}
                className="text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition-all cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>COPIAR</span>
              </button>
            </Tooltip>
          </div>
          
          <pre className="flex-1 p-4 font-mono text-[11px] leading-relaxed overflow-auto text-emerald-400/90 select-text scrollbar-thin scrollbar-thumb-slate-850">
            <code>{scriptContent}</code>
          </pre>
        </div>

        {/* Botón de Descarga */}
        <div className="p-4 bg-slate-950 border-t border-slate-800">
          <Tooltip id="codeExportDownloadBtn" showTooltips={showTooltips}>
            <button
              type="button"
              onClick={handleDownload}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-black font-mono text-xs font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] cursor-pointer flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4 fill-black" />
              <span>DESCARGAR SCRIPT</span>
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};

export default CodeAssistant;
