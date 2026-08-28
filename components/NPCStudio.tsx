import React, { useState, useEffect, useRef } from 'react';
import { ProjectData, NPCProfile, NPCState, ChatMessage } from '../types';
import { User, Users, Sparkles, MessageSquare, Shield, Settings2, Trash2, Plus, Send, Heart, Brain, RefreshCw, Star, Info, Volume2, Square } from 'lucide-react';
import Tooltip from './Tooltip';
import { refinePrompt, generateText } from '../services/aiProvider';
import PencilSparkleAnimation from './PencilSparkleAnimation';

interface NPCStudioProps {
  state: NPCState | undefined;
  updateState: (updates: Partial<NPCState>) => void;
  apiSettings: ProjectData['apiSettings'];
  showTooltips: boolean;
}

const DEFAULT_SYSTEM_PROMPT = `Eres {name}, un {role}.
PERSONALIDAD: {personality}

INSTRUCCIONES DE CONVERSACIÓN:
- Mantén tus respuestas cortas (máximo 2 o 3 frases).
- Mantente estrictamente en personaje.
- Habla en español de forma natural, pero puedes usar términos o modismos de tu rol.
- Muestra sospecha al principio, y vuélvete amigable o cooperativo solo si tu nivel de confianza ({trustLevel}/100) aumenta.`;

const NPCStudio: React.FC<NPCStudioProps> = ({ state, updateState, apiSettings, showTooltips }) => {
  const npcs = state?.npcs || [];
  const activeNpcId = state?.activeNpcId || null;
  const chatInput = state?.chatInput || '';
  const isGenerating = state?.isGenerating || false;

  const [activeTab, setActiveTab] = useState<'chat' | 'editor' | 'exporter'>('chat');
  const [exportFormat, setExportFormat] = useState<'unity' | 'godot' | 'unreal' | 'json'>('unity');
  const [editingNpc, setEditingNpc] = useState<Partial<NPCProfile> | null>(null);
  const [isRefining, setIsRefining] = useState(false);
  const [evaluatingTrust, setEvaluatingTrust] = useState(false);
  const [trustDeltaText, setTrustDeltaText] = useState<string | null>(null);
  const [relationshipLogs, setRelationshipLogs] = useState<{timestamp: string; delta: number; reason: string}[]>([]);
  const [deletingNpcId, setDeletingNpcId] = useState<string | null>(null);
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const npcsRef = useRef<NPCProfile[]>(npcs);
  const altCodeBufferRef = useRef<string>('');
  const isAltPressedRef = useRef<boolean>(false);

  // Gestor de combinaciones Alt + Código (ej: Alt + 124 para |)
  const handleAltKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === 'Alt') {
      isAltPressedRef.current = true;
      altCodeBufferRef.current = '';
      e.stopPropagation();
    } else if (isAltPressedRef.current || e.altKey) {
      let digit = '';
      if (e.code && e.code.startsWith('Numpad') && !isNaN(parseInt(e.code.replace('Numpad', ''), 10))) {
        digit = e.code.replace('Numpad', '');
      } else if (e.key >= '0' && e.key <= '9') {
        digit = e.key;
      }
      if (digit) {
        altCodeBufferRef.current += digit;
        e.preventDefault();
        e.stopPropagation();
      }
    }
  };

  const handleAltKeyUp = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    onChangeCallback?: (newVal: string) => void
  ) => {
    if (e.key === 'Alt' || !e.altKey) {
      if (altCodeBufferRef.current.length > 0) {
        const code = parseInt(altCodeBufferRef.current, 10);
        altCodeBufferRef.current = '';
        isAltPressedRef.current = false;
        if (!isNaN(code) && code > 0) {
          const char = String.fromCharCode(code);
          const target = e.currentTarget;
          const start = target.selectionStart ?? target.value.length;
          const end = target.selectionEnd ?? target.value.length;
          const val = target.value;
          const newVal = val.substring(0, start) + char + val.substring(end);
          
          target.value = newVal;
          target.setSelectionRange(start + char.length, start + char.length);
          
          if (onChangeCallback) {
            onChangeCallback(newVal);
          }
          e.preventDefault();
          e.stopPropagation();
        }
      }
      isAltPressedRef.current = false;
    }
  };

  // Mantener npcsRef actualizado con la lista de NPCs más fresca de cada render
  useEffect(() => {
    npcsRef.current = npcs;
  }, [npcs]);

  const activeNpc = npcs.find(n => n.id === activeNpcId);

  // Sincronizar editingNpc con activeNpc removiendo textos hardcodeados antiguos para que los placeholders funcionen
  useEffect(() => {
    if (activeNpc) {
      const cleanNpc = { ...activeNpc };
      if (cleanNpc.name === 'Nuevo NPC') cleanNpc.name = '';
      if (cleanNpc.role === 'Mercader / Netrunner') cleanNpc.role = '';
      if (cleanNpc.personality === 'Misterioso, astuto, pragmático') cleanNpc.personality = '';
      if (cleanNpc.codeword === 'NEON_SHADOW') cleanNpc.codeword = '';
      if (cleanNpc.systemPrompt === DEFAULT_SYSTEM_PROMPT) cleanNpc.systemPrompt = '';
      if (cleanNpc.greetings?.length === 2 && cleanNpc.greetings[0]?.includes('suburbios')) cleanNpc.greetings = [];
      if (cleanNpc.clueHints?.length === 2 && cleanNpc.clueHints[0]?.includes('Alfa')) cleanNpc.clueHints = [];
      setEditingNpc(cleanNpc);
    } else {
      setEditingNpc(null);
    }
  }, [activeNpcId]);

  // Auto-scroll al final del chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeNpc?.chatHistory, isGenerating]);

  // Si no hay NPC activo pero hay NPCs disponibles, activar el primero
  useEffect(() => {
    if (!activeNpcId && npcs.length > 0) {
      updateState({ activeNpcId: npcs[0].id });
    }
  }, [npcs, activeNpcId]);

  // Manejo de la creación de un nuevo NPC
  const handleCreateNPC = () => {
    const newId = `npc_${Date.now()}`;
    const newNpc: NPCProfile = {
      id: newId,
      name: '',
      role: '',
      personality: '',
      initialRelationship: 30,
      systemPrompt: '',
      greetings: [],
      clueHints: [],
      codeword: '',
      relationship: 30,
      chatHistory: []
    };

    const updatedNpcs = [...npcs, newNpc];
    updateState({
      npcs: updatedNpcs,
      activeNpcId: newId
    });
    setEditingNpc(newNpc);
    setActiveTab('editor');
  };

  const handleSaveNPC = () => {
    if (!editingNpc || !editingNpc.id) return;
    
    // Sustituir variables en el system prompt si no están presentes
    let systemPrompt = editingNpc.systemPrompt || '';
    if (!systemPrompt.includes('{name}')) {
      systemPrompt = DEFAULT_SYSTEM_PROMPT;
    }

    const updatedNpc: NPCProfile = {
      ...(editingNpc as NPCProfile),
      name: editingNpc.name?.trim() || 'Nuevo NPC',
      role: editingNpc.role?.trim() || 'Personaje',
      personality: editingNpc.personality?.trim() || 'Sin definir',
      relationship: editingNpc.relationship ?? editingNpc.initialRelationship ?? 30,
      systemPrompt: systemPrompt
    };

    const updatedNpcs = npcs.map(n => n.id === editingNpc.id ? updatedNpc : n);
    updateState({ npcs: updatedNpcs });
    setActiveTab('chat');
  };

  const handleDeleteNPC = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (deletingNpcId !== id) {
      setDeletingNpcId(id);
      setTimeout(() => setDeletingNpcId(null), 3000);
      return;
    }
    setDeletingNpcId(null);
    
    const updatedNpcs = npcs.filter(n => n.id !== id);
    const nextActive = updatedNpcs.length > 0 ? updatedNpcs[0].id : null;
    
    updateState({
      npcs: updatedNpcs,
      activeNpcId: nextActive
    });

    if (activeNpcId === id) {
      setEditingNpc(null);
    }
  };

  // Enviar mensaje al NPC e interactuar con LLM
  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeNpc || isGenerating) return;

    const userMessageId = `msg_${Date.now()}`;
    const userMessageContent = chatInput.trim();
    
    // 1. Agregar mensaje del usuario a la UI
    const updatedHistory = [
      ...activeNpc.chatHistory,
      { id: userMessageId, role: 'user' as const, content: userMessageContent }
    ];

    const updatedNpcs = npcs.map(n => 
      n.id === activeNpc.id ? { ...n, chatHistory: updatedHistory } : n
    );

    updateState({
      npcs: updatedNpcs,
      chatInput: '',
      isGenerating: true
    });

    // Crear el mensaje vacío para streaming
    const modelMessageId = `msg_${Date.now() + 1}`;
    let fullResponse = '';

    // Preparar el prompt del sistema compuesto
    let sysPrompt = activeNpc.systemPrompt
      .replace(/{name}/g, activeNpc.name)
      .replace(/{role}/g, activeNpc.role)
      .replace(/{personality}/g, activeNpc.personality)
      .replace(/{trustLevel}/g, activeNpc.relationship.toString())
      .replace(/{codeword}/g, activeNpc.codeword || 'NINGUNO');

    if (activeNpc.clueHints && activeNpc.clueHints.length > 0) {
      sysPrompt += `\nPISTAS QUE CONOCES (solo descárgalas sutilmente si confías en el jugador): ${activeNpc.clueHints.join(' | ')}`;
    }

    try {
      // Llamar al proveedor de IA en modo texto con soporte de streaming
      // (Construimos la llamada al router universal)
      const chatMessages = [
        { role: 'system' as const, content: sysPrompt },
        ...updatedHistory.map(h => ({ role: h.role, content: h.content }))
      ];

      // Simulamos callback de stream usando aiProvider
      // (Si el text provider de Omni IA Game no soporta streaming reactivo directo,
      // actualizamos el bloque entero al resolverse, pero simularemos streaming visual si es local)
      
      const provider = apiSettings.npcs?.provider || apiSettings.text.provider;
      const model = apiSettings.npcs?.model || apiSettings.text.model;
      const baseUrl = apiSettings.npcs?.baseUrl || apiSettings.text.baseUrl;

      let responseText = "";
      
      // Consultamos al Router Universal
      const promptWithHistory = `SYSTEM INSTRUCTION: ${sysPrompt}
${chatMessages.map(m => `${m.role === 'user' ? 'USER' : 'NPC'}: ${m.content}`).join('\n')}
NPC:`;
      const result = await generateText(
        promptWithHistory,
        apiSettings,
        false,
        true // useNpcsSettings
      );

      responseText = result || "... El NPC te mira en silencio ...";
      
      // Simular efecto de máquina de escribir fluido para una excelente UX
      let currentLength = 0;
      const interval = setInterval(() => {
        currentLength += Math.min(5, responseText.length - currentLength);
        const partialResponse = responseText.substring(0, currentLength);
        
        const partialNpcs = updatedNpcs.map(n => {
          if (n.id === activeNpc.id) {
            const historyWithoutLastModel = n.chatHistory.filter(h => h.id !== modelMessageId);
            return {
              ...n,
              chatHistory: [
                ...historyWithoutLastModel,
                { id: modelMessageId, role: 'model' as const, content: partialResponse }
              ]
            };
          }
          return n;
        });

        if (currentLength >= responseText.length) {
          clearInterval(interval);
          // Consolidar la actualización final en una única llamada atómica para evitar desajustes de renders asíncronos
          updateState({
            npcs: partialNpcs,
            isGenerating: false
          });
          
          // Disparar evaluación de afinidad asíncrona de fondo pasándole la lista de NPCs más reciente
          triggerAsynchronousTrustEvaluation(userMessageContent, responseText, activeNpc, partialNpcs);
        } else {
          updateState({ npcs: partialNpcs });
        }
      }, 30);

    } catch (e) {
      console.error('Error generando respuesta de NPC:', e);
      const errorNpcs = updatedNpcs.map(n => 
        n.id === activeNpc.id ? {
          ...n,
          chatHistory: [
            ...n.chatHistory,
            { id: modelMessageId, role: 'model' as const, content: '*Estática de radio*... [Conexión perdida con el núcleo de personalidad]' }
          ]
        } : n
      );
      updateState({ npcs: errorNpcs, isGenerating: false });
    }
  };

  // Evaluación asíncrona de confianza de fondo (Background Evaluation)
  const triggerAsynchronousTrustEvaluation = async (userMsg: string, npcResponse: string, npc: NPCProfile, currentNpcsList?: NPCProfile[]) => {
    setEvaluatingTrust(true);
    setTrustDeltaText(null);

    const systemPrompt = `You are a relationship/trust evaluator in a video game RPG.
CONTEXT:
- NPC Name: ${npc.name}
- Personality: ${npc.personality}
- Current Relationship: ${npc.relationship}/100

YOUR JOB:
Analyze the player's message and the NPC's response to determine if this exchange should increase (+), decrease (-), or maintain (0) the NPC's trust in the player.

PLAYER MESSAGE: "${userMsg}"
NPC RESPONSE: "${npcResponse}"

CRITERIA:
- Increase (+1 to +5) if player is respectful, supportive, helpful, or aligns with the NPC's values.
- Decrease (-1 to -5) if player is pushy, rude, threatening, or goes against NPC interests.
- Neutral (0) if it's casual small talk, basic greetings, or has no emotional weight.

You must respond ONLY with a signed integer like: "+2", "-1", "0", "+4", "-3".
No explanation. No markdown. Just the number.`;

    try {
      // Llamar al LLM para evaluar la confianza
      const evaluationPrompt = `${systemPrompt}\n\nACTION: Evaluate the relationship delta based on the above exchange.`;
      const evaluationResult = await generateText(
        evaluationPrompt,
        apiSettings,
        false,
        true // useNpcsSettings
      );

      const trimmed = evaluationResult.trim();
      const match = trimmed.match(/([+-]?\d+)/);

      if (match) {
        const delta = parseInt(match[1]);
        if (delta !== 0) {
          // Obtener la lista de NPCs más fresca del render actual a través del ref mutable
          const freshNpcs = npcsRef.current || state?.npcs || currentNpcsList || npcs;
          
          // Buscar el NPC fresco para calcular el delta sobre la relación más actual en memoria
          const freshNpc = freshNpcs.find(n => n.id === npc.id) || npc;
          const oldRelationship = freshNpc.relationship;
          const newRelationship = Math.max(0, Math.min(100, oldRelationship + delta));
          
          // Mapear la nueva afinidad preservando la lista de NPCs y el historial de chat fresco
          const updatedNpcs = freshNpcs.map(n => 
            n.id === npc.id ? { ...n, relationship: newRelationship } : n
          );
          updateState({ npcs: updatedNpcs });

          // Animación visual de delta de confianza
          setTrustDeltaText(delta > 0 ? `+${delta} Afinidad` : `${delta} Afinidad`);
          setTimeout(() => setTrustDeltaText(null), 3000);

          // Guardar registro
          setRelationshipLogs(prev => [
            {
              timestamp: new Date().toLocaleTimeString(),
              delta: delta,
              reason: delta > 0 ? 'Conversación positiva' : 'Conversación tensa'
            },
            ...prev
          ]);
        }
      }
    } catch (e) {
      console.warn('Error al evaluar la afinidad del diálogo:', e);
    } finally {
      setEvaluatingTrust(false);
    }
  };

  const abortRefineRef = useRef<AbortController | null>(null);

  // Refinar con IA el System Prompt del NPC
  const handleRefinePrompt = async () => {
    if (isRefining) {
      if (abortRefineRef.current) {
        abortRefineRef.current.abort();
        abortRefineRef.current = null;
      }
      setIsRefining(false);
      return;
    }
    if (!editingNpc) return;
    setIsRefining(true);

    const idea = `Refinar el System Prompt para un NPC de videojuego llamado "${editingNpc.name || 'Desconocido'}", con el rol de "${editingNpc.role || 'Desconocido'}" y la personalidad de "${editingNpc.personality || 'Desconocida'}".`;
    const controller = new AbortController();
    abortRefineRef.current = controller;

    try {
      const refined = await refinePrompt(
        idea,
        'NPC',
        'narrative',
        'Dialogue',
        '',
        apiSettings,
        undefined,
        controller.signal
      );

      if (refined && refined.positive) {
        setEditingNpc(prev => prev ? { ...prev, systemPrompt: refined.positive } : null);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || String(e).includes('Aborted')) {
        console.log('[NPCStudio] Refinamiento cancelado por el usuario.');
      } else {
        alert('Error refinando el prompt del NPC: ' + e);
      }
    } finally {
      setIsRefining(false);
      abortRefineRef.current = null;
    }
  };

  // Resetear historial de chat
  const handleClearHistory = () => {
    if (!activeNpc) return;
    if (!confirmClearHistory) {
      setConfirmClearHistory(true);
      setTimeout(() => setConfirmClearHistory(false), 3000);
      return;
    }
    setConfirmClearHistory(false);
    
    const initMsg = activeNpc.greetings && activeNpc.greetings.length > 0 
      ? activeNpc.greetings[0] 
      : 'Hola... ¿qué te trae por aquí?';

    const updatedNpcs = npcs.map(n => 
      n.id === activeNpc.id ? { 
        ...n, 
        relationship: n.initialRelationship,
        chatHistory: [{ id: 'init', role: 'model' as const, content: initMsg }] 
      } : n
    );

    updateState({ npcs: updatedNpcs });
    setRelationshipLogs([]);
  };

  // Determinar color de la afinidad seg�  const escapeQuotes = (str: string) => str.replace(/"/g, '\"');

  const generateUnityScript = (npc: NPCProfile) => {
    const cleanSystemPrompt = npc.systemPrompt
      .replace(/{name}/g, npc.name)
      .replace(/{role}/g, npc.role)
      .replace(/{personality}/g, npc.personality)
      .replace(/"/g, '""');

    const cleanGreetings = npc.greetings ? npc.greetings.map(g => `"${g.replace(/"/g, '\"')}"`).join(',\n        ') : `"${npc.name} listo."`;

    return `using System;
using System.Text;
using System.Net.Http;
using System.Threading.Tasks;
using UnityEngine;

/// <summary>
/// Cerebro de integración de Inteligencia Artificial para el NPC: ${npc.name}.
/// Autogenerado por Omni IA Game.
/// </summary>
public class NPCGameBrain : MonoBehaviour
{
    [Header("NPC Profile")]
    public string npcName = "${npc.name}";
    public string npcRole = "${npc.role}";
    public string npcPersonality = "${npc.personality}";
    
    [Header("Gameplay Variables")]
    [Tooltip("Nivel de afinidad/confianza actual con el jugador (0 a 100)")]
    [Range(0, 100)]
    public int relationship = ${npc.relationship};
    
    [Header("Security & Clues")]
    [Tooltip("El codeword o secreto a revelar al ganar suficiente afinidad")]
    public string codeword = "${npc.codeword || 'NEON_SHADOW'}";
    
    [Header("AI Settings")]
    [Tooltip("URL del endpoint del LLM local o cloud")]
    public string apiEndpoint = "http://localhost:11434/api/generate";
    public string modelName = "llama3";
    
    [TextArea(5, 10)]
    public string systemPrompt = @"${cleanSystemPrompt}";

    [Header("Initial Dialogues")]
    public string[] greetings = new string[] {
        ${cleanGreetings}
    };

    // Evento disparado automáticamente cuando el NPC responde para actualizar la UI del juego
    public static event Action<string, string> OnResponseReceived;

    // Evento disparado automáticamente cuando se desbloquea el secreto
    public static event Action<string> OnSecretUnlocked;

    private static readonly HttpClient httpClient = new HttpClient();

    [System.Serializable]
    private class OllamaRequestPayload
    {
        public string model;
        public string prompt;
        public bool stream;
    }

    [System.Serializable]
    private class OllamaResponsePayload
    {
        public string response;
    }

    /// <summary>
    /// Envía un mensaje al NPC e interactúa con el modelo LLM.
    /// </summary>
    public async Task<string> SendMessageToNPC(string playerMessage)
    {
        try
        {
            string activeSystemPrompt = systemPrompt.Replace("{trustLevel}", relationship.ToString());
            string promptWithContext = $"SYSTEM: {activeSystemPrompt}\\n" +
                                       $"NPC TRUST LEVEL: {relationship}/100\\n" +
                                       $"PLAYER: {playerMessage}\\n" +
                                       $"NPC:";

            var payload = new OllamaRequestPayload
            {
                model = modelName,
                prompt = promptWithContext,
                stream = false
            };

            string jsonPayload = JsonUtility.ToJson(payload);
            var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

            HttpResponseMessage response = await httpClient.PostAsync(apiEndpoint, content);
            if (response.IsSuccessStatusCode)
            {
                string jsonResponse = await response.Content.ReadAsStringAsync();
                OllamaResponsePayload resData = JsonUtility.FromJson<OllamaResponsePayload>(jsonResponse);
                string npcResponse = resData != null ? resData.response : "";

                if (string.IsNullOrEmpty(npcResponse))
                {
                    npcResponse = ExtractResponseFromJson(jsonResponse);
                }
                
                EvaluateAffinitiesLocally(playerMessage, npcResponse);
                OnResponseReceived?.Invoke(npcName, npcResponse);
                return npcResponse;
            }
            return "*Estática de radio*... [Error de red en el módulo cognitivo]";
        }
        catch (Exception ex)
        {
            Debug.LogError("Error al comunicarse con el NPC Brain: " + ex.Message);
            return "*Estática de radio*... [Error de conexión]";
        }
    }

    private string ExtractResponseFromJson(string json)
    {
        int index = json.IndexOf("\\"response\\":");
        if (index != -1)
        {
            int start = json.IndexOf("\\"", index + 11) + 1;
            int end = json.IndexOf("\\"", start);
            if (start > 0 && end > start)
            {
                return json.Substring(start, end - start).Replace("\\\\n", "\\n");
            }
        }
        return json;
    }

    private void EvaluateAffinitiesLocally(string playerMsg, string npcResponse)
    {
        playerMsg = playerMsg.ToLower();
        int delta = 0;

        if (playerMsg.Contains("ayuda") || playerMsg.Contains("gracias") || playerMsg.Contains("por favor"))
        {
            delta = UnityEngine.Random.Range(1, 4);
        }
        else if (playerMsg.Contains("muere") || playerMsg.Contains("estúpido") || playerMsg.Contains("amenaza"))
        {
            delta = UnityEngine.Random.Range(-5, -2);
        }

        if (delta != 0)
        {
            relationship = Mathf.Clamp(relationship + delta, 0, 100);
            Debug.Log($"[Afinidad] Nueva afinidad con {npcName}: {relationship}/100 (Delta: {delta})");

            if (relationship >= 75)
            {
                Debug.LogWarning($"[DESBLOQUEADO] ¡Secreto revelado por {npcName}! Codeword: {codeword}");
                OnSecretUnlocked?.Invoke(codeword);
            }
        }
    }
}
`;
  };

  const generateGodotScript = (npc: NPCProfile) => {
    const cleanSystemPrompt = npc.systemPrompt
      .replace(/{name}/g, npc.name)
      .replace(/{role}/g, npc.role)
      .replace(/{personality}/g, npc.personality)
      .replace(/"/g, '\\"');

    const cleanGreetings = npc.greetings ? npc.greetings.map(g => `"${g.replace(/"/g, '\\"')}"`).join(',\n    ') : `"${npc.name} listo."`;

    return `# Cerebro de integración de Inteligencia Artificial para el NPC: ${npc.name}
# Autogenerado por Omni IA Game.
class_name NPCGameBrain
extends Node

## Señal emitida cuando el NPC responde para actualizar la interfaz del juego
signal response_received(npc_response: String)

## Señal emitida cuando el jugador gana suficiente afinidad y se desbloquea el secreto
signal secret_unlocked(codeword: String)

@export_group("NPC Profile")
@export var npc_name: String = "${npc.name}"
@export var npc_role: String = "${npc.role}"
@export var npc_personality: String = "${npc.personality}"

@export_group("Gameplay Variables")
@export_range(0, 100) var relationship: int = ${npc.relationship}
@export var codeword: String = "${npc.codeword || 'NEON_SHADOW'}"

@export_group("AI Settings")
@export var api_endpoint: String = "http://localhost:11434/api/generate"
@export var model_name: String = "llama3"

@export_multiline var system_prompt: String = "${cleanSystemPrompt}"

@export var greetings: Array[String] = [
    ${cleanGreetings}
]

var http_client: HTTPRequest

func _ready() -> void:
	http_client = HTTPRequest.new()
	add_child(http_client)
	http_client.request_completed.connect(_on_request_completed)

## Envía un mensaje al NPC interactivo de forma asíncrona
func send_message_to_npc(player_message: String) -> Error:
	var active_system_prompt = system_prompt.replace("{trustLevel}", str(relationship))
	var prompt_with_context = "SYSTEM: %s\\nNPC TRUST LEVEL: %d/100\\nPLAYER: %s\\nNPC:" % [
		active_system_prompt,
		relationship,
		player_message
	]
	
	var payload = {
		"model": model_name,
		"prompt": prompt_with_context,
		"stream": false
	}
	
	var json_payload = JSON.stringify(payload)
	var headers = ["Content-Type: application/json"]
	
	return http_client.request(api_endpoint, headers, HTTPClient.METHOD_POST, json_payload)

func _on_request_completed(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS or response_code != 200:
		printerr("[NPC Brain Error] Error en llamada HTTP al modelo de IA.")
		return
		
	var json = JSON.new()
	var error = json.parse(body.get_string_from_utf8())
	if error != OK:
		printerr("[NPC Brain Error] Error parseando respuesta JSON.")
		return
		
	var response_data = json.get_data()
	if response_data is Dictionary and response_data.has("response"):
		var npc_response = String(response_data["response"])
		_evaluate_relationship_locally(npc_response)
		response_received.emit(npc_response)
		print("%s responde: %s" % [npc_name, npc_response])

func _evaluate_relationship_locally(npc_response: String) -> void:
	# Lógica heurística simple de humor
	var delta := 0
	var lower_response = npc_response.to_lower()
	
	if "gracias" in lower_response or "amigo" in lower_response:
		delta = randi_range(1, 3)
	elif "maldito" in lower_response or "largo" in lower_response:
		delta = randi_range(-4, -1)
		
	if delta != 0:
		relationship = clampi(relationship + delta, 0, 100)
		print("[Afinidad] Nueva afinidad con %s: %d/100" % [npc_name, relationship])
		if relationship >= 75:
			secret_unlocked.emit(codeword)
			print_rich("[color=green][DESBLOQUEADO] ¡Secreto revelado por %s! Codeword: %s[/color]" % [npc_name, codeword])
`;
  };

  const generateJSONProfile = (npc: NPCProfile) => {
    const cleanNpc = {
      id: npc.id,
      name: npc.name,
      role: npc.role,
      personality: npc.personality,
      initialRelationship: npc.initialRelationship,
      relationship: npc.relationship,
      systemPrompt: npc.systemPrompt,
      greetings: npc.greetings,
      clueHints: npc.clueHints || [],
      codeword: npc.codeword || "NEON_SHADOW",
      failureConditions: npc.failureConditions || [],
      exportedAt: new Date().toISOString(),
      generator: "Omni IA Game — Versión Educativa"
    };
    return JSON.stringify(cleanNpc, null, 2);
  };

  const generateUnrealScript = (npc: NPCProfile) => {
    const cleanSystemPrompt = npc.systemPrompt
      .replace(/{name}/g, npc.name)
      .replace(/{role}/g, npc.role)
      .replace(/{personality}/g, npc.personality)
      .replace(/"/g, '\\"');

    const cleanGreetings = npc.greetings ? npc.greetings.map(g => `TEXT("${g.replace(/"/g, '\\"')}")`).join(',\n        ') : `TEXT("${npc.name} listo.")`;

    return `// ==========================================
// NPCGameBrain.h
// ==========================================
#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "NPCGameBrain.generated.h"

// Delegados dinámicos multicast para notificar a Blueprints de Unreal
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnNPCResponseReceived, const FString&, NPCName, const FString&, Response);
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnSecretUnlocked, const FString&, Codeword);

UCLASS( ClassGroup=(Custom), meta=(BlueprintSpawnableComponent) )
class UNPCGameBrain : public UActorComponent
{
    GENERATED_BODY()

public:    
    UNPCGameBrain();

protected:
    virtual void BeginPlay() override;

public:
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="NPC Profile")
    FString NPCName = TEXT("${npc.name}");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="NPC Profile")
    FString NPCRole = TEXT("${npc.role}");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="NPC Profile")
    FString NPCPersonality = TEXT("${npc.personality}");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="NPC Gameplay", meta=(UIMin="0", UIMax="100"))
    int32 Relationship = ${npc.relationship};

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="NPC Gameplay")
    FString Codeword = TEXT("${npc.codeword || 'NEON_SHADOW'}");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="NPC AI")
    FString ApiEndpoint = TEXT("http://localhost:11434/api/generate");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="NPC AI")
    FString ModelName = TEXT("llama3");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="NPC AI", meta=(MultiLine=true))
    FString SystemPrompt = TEXT("${cleanSystemPrompt}");

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="NPC AI")
    TArray<FString> Greetings = {
        ${cleanGreetings}
    };

    UPROPERTY(BlueprintAssignable, Category="NPC Events")
    FOnNPCResponseReceived OnNPCResponseReceived;

    UPROPERTY(BlueprintAssignable, Category="NPC Events")
    FOnSecretUnlocked OnSecretUnlocked;

    UFUNCTION(BlueprintCallable, Category="NPC AI")
    void SendMessageToNPC(const FString& PlayerMessage);

private:
    void OnResponseReceived(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful);
    void EvaluateAffinitiesLocally(const FString& PlayerMsg, const FString& NPCResponse);
};

// ==========================================
// NPCGameBrain.cpp
// ==========================================
#include "NPCGameBrain.h"
#include "HttpModule.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

UNPCGameBrain::UNPCGameBrain()
{
    PrimaryComponentTick.bCanEverTick = false;
}

void UNPCGameBrain::BeginPlay()
{
    Super::BeginPlay();
    UE_LOG(LogTemp, Warning, TEXT("[NPC %s Brain] Inicializado."), *NPCName);
}

void UNPCGameBrain::SendMessageToNPC(const FString& PlayerMessage)
{
    FString ActiveSystemPrompt = SystemPrompt.Replace(TEXT("{trustLevel}"), *FString::FromInt(Relationship));
    FString PromptWithContext = FString::Printf(TEXT("SYSTEM: %s\\nNPC TRUST LEVEL: %d/100\\nPLAYER: %s\\nNPC:"), 
        *ActiveSystemPrompt, 
        Relationship, 
        *PlayerMessage
    );

    TSharedRef<FJsonObject> JsonRequestObject = MakeShared<FJsonObject>();
    JsonRequestObject->SetStringField(TEXT("model"), ModelName);
    JsonRequestObject->SetStringField(TEXT("prompt"), PromptWithContext);
    JsonRequestObject->SetBoolField(TEXT("stream"), false);

    FString RequestPayload;
    TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&RequestPayload);
    FJsonSerializer::Serialize(JsonRequestObject, Writer);

    TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = FHttpModule::Get().CreateRequest();
    Request->OnProcessRequestComplete().BindUObject(this, &UNPCGameBrain::OnResponseReceived);
    Request->SetURL(ApiEndpoint);
    Request->SetVerb(TEXT("POST"));
    Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    Request->SetContentAsString(RequestPayload);
    Request->ProcessRequest();
}

void UNPCGameBrain::OnResponseReceived(FHttpRequestPtr Request, FHttpResponsePtr Response, bool bWasSuccessful)
{
    if (!bWasSuccessful || !Response.IsValid() || Response->GetResponseCode() != 200)
    {
        UE_LOG(LogTemp, Error, TEXT("[NPC Brain Error] Error en llamada HTTP al modelo de IA."));
        return;
    }

    FString ResponseString = Response->GetContentAsString();
    TSharedPtr<FJsonObject> JsonResponseObject;
    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(ResponseString);

    if (FJsonSerializer::Deserialize(Reader, JsonResponseObject) && JsonResponseObject.IsValid())
    {
        FString NPCResponse;
        if (JsonResponseObject->TryGetStringField(TEXT("response"), NPCResponse))
        {
            EvaluateAffinitiesLocally(Request->GetContentAsString(), NPCResponse);
            OnNPCResponseReceived.Broadcast(NPCName, NPCResponse);
            UE_LOG(LogTemp, Log, TEXT("%s responde: %s"), *NPCName, *NPCResponse);
        }
    }
}

void UNPCGameBrain::EvaluateAffinitiesLocally(const FString& PlayerMsg, const FString& NPCResponse)
{
    FString LowerMsg = PlayerMsg.ToLower();
    int32 Delta = 0;

    if (LowerMsg.Contains(TEXT("ayuda")) || LowerMsg.Contains(TEXT("gracias")) || LowerMsg.Contains(TEXT("por favor")))
    {
        Delta = FMath::RandRange(1, 3);
    }
    else if (LowerMsg.Contains(TEXT("muere")) || LowerMsg.Contains(TEXT("estúpido")) || LowerMsg.Contains(TEXT("amenaza")))
    {
        Delta = FMath::RandRange(-4, -1);
    }

    if (Delta != 0)
    {
        Relationship = FMath::Clamp(Relationship + Delta, 0, 100);
        UE_LOG(LogTemp, Warning, TEXT("[Afinidad] Nueva afinidad con %s: %d/100 (Delta: %d)"), *NPCName, Relationship, Delta);

        if (Relationship >= 75)
        {
            UE_LOG(LogTemp, Warning, TEXT("[DESBLOQUEADO] ¡Secreto revelado por %s! Codeword: %s"), *NPCName, *Codeword);
            OnSecretUnlocked.Broadcast(Codeword);
        }
    }
}
`;
  };

  const handleDownloadFile = async (filename: string, content: string) => {
    try {
      const invokeFn = (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke;
      if (invokeFn) {
        // Obtenemos la extensión correspondiente (ej: cs, gd, h, json)
        const ext = filename.split('.').pop() || 'txt';
        // En entorno Tauri, usamos el comando nativo save_text_file que admite filtros de extensión dinámicos
        await invokeFn('save_text_file', {
          content: content,
          filename: filename,
          extension: ext
        });
        return;
      }
    } catch (e) {
      console.warn("Tauri native save failed, falling back to browser download:", e);
    }

    // Fallback para navegador web tradicional
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getTrustColor = (val: number) => {
    if (val < 30) return 'text-red-400 bg-red-950/40 border-red-900/60';
    if (val < 70) return 'text-amber-400 bg-amber-950/40 border-amber-900/60';
    return 'text-green-400 bg-green-950/40 border-green-900/60';
  };

  const getTrustBarColor = (val: number) => {
    if (val < 30) return 'from-red-600 to-red-400 shadow-[0_0_10px_rgba(239,68,68,0.4)]';
    if (val < 70) return 'from-amber-600 to-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.4)]';
    return 'from-green-600 to-green-400 shadow-[0_0_10px_rgba(34,197,94,0.4)]';
  };

  return (
    <div className="w-full h-full flex bg-slate-950 text-slate-100 overflow-hidden select-none animate-fade-in">
      {/* Sidebar - Lista de NPCs */}
      <aside className="w-80 border-r border-slate-800 bg-slate-900/60 flex flex-col h-full relative z-10">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold tracking-wider font-mono">LIBRERÍA NPCs</h2>
          </div>
          <Tooltip id="npcNewBtn" showTooltips={showTooltips} inline>
            <button
              onClick={handleCreateNPC}
              className="p-1.5 hover:bg-slate-800 rounded-md text-indigo-400 hover:text-indigo-300 transition-colors border border-indigo-900/40 flex items-center gap-1 text-xs font-mono font-bold uppercase"
            >
              <Plus className="w-3.5 h-3.5" /> Nuevo
            </button>
          </Tooltip>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
          {npcs.length === 0 ? (
            <div className="text-center py-8 text-slate-500 font-mono text-xs">
              No hay NPCs creados. <br /> Haz clic en "+ Nuevo" para comenzar.
            </div>
          ) : (
            npcs.map(npc => (
              <div
                key={npc.id}
                onClick={() => {
                  updateState({ activeNpcId: npc.id });
                  setEditingNpc(npc);
                }}
                className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer relative group ${
                  activeNpcId === npc.id
                    ? 'bg-slate-850 border-indigo-500/60 shadow-[0_0_15px_rgba(99,102,241,0.15)] text-indigo-300'
                    : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
                    <span className="font-mono text-xs font-bold truncate max-w-[140px]">{npc.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* Indicador de relación rápido */}
                    <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${getTrustColor(npc.relationship)}`}>
                      💖 {npc.relationship}
                    </span>
                    <button
                      onClick={(e) => handleDeleteNPC(npc.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-red-400 transition-all"
                      title="Eliminar NPC"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-slate-500 truncate">{npc.role}</div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Panel */}
      <section className="flex-1 flex flex-col h-full bg-slate-950/20 relative overflow-hidden">
        {activeNpc ? (
          <>
            {/* Header del NPC */}
            <header className="h-14 border-b border-slate-850 bg-slate-900/40 px-6 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold font-mono tracking-wide text-slate-100">{activeNpc.name}</h3>
                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{activeNpc.role}</p>
                </div>
              </div>

              {/* Tabs internas */}
              <div className="flex items-center gap-4">
                <div className="flex bg-slate-950 border border-slate-800 rounded p-0.5">
                  <Tooltip id="npcTabChat" inline showTooltips={showTooltips} position="bottom">
                    <button
                      onClick={() => setActiveTab('chat')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold font-mono transition-all ${
                        activeTab === 'chat'
                          ? 'bg-slate-850 text-indigo-400'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5" /> PROBAR CHAT
                    </button>
                  </Tooltip>
                  <Tooltip id="npcTabConfig" inline showTooltips={showTooltips} position="bottom">
                    <button
                      onClick={() => {
                        setEditingNpc(activeNpc);
                        setActiveTab('editor');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold font-mono transition-all ${
                        activeTab === 'editor'
                          ? 'bg-slate-850 text-indigo-400'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <Settings2 className="w-3.5 h-3.5" /> CONFIGURAR NPC
                    </button>
                  </Tooltip>
                  <Tooltip id="npcTabExport" inline showTooltips={showTooltips} position="bottom">
                    <button
                      onClick={() => setActiveTab('exporter')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold font-mono transition-all ${
                        activeTab === 'exporter'
                          ? 'bg-slate-850 text-indigo-400'
                          : 'text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5" /> EXPORTAR SCRIPT
                    </button>
                  </Tooltip>
                </div>
                
                <Tooltip id="npcResetHistoryBtn" inline showTooltips={showTooltips} position="bottom">
                  <button
                    onClick={handleClearHistory}
                    className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-red-400 transition-colors border border-slate-800/80 text-xs font-mono font-bold"
                    title="Reiniciar diálogo"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              </div>
            </header>

            {/* Contenedor principal de Tab activa */}
            <div className="flex-1 flex overflow-hidden">
              {activeTab === 'chat' ? (
                <>
                  {/* Vista de Chat */}
                  <div className="flex-1 flex flex-col h-full bg-slate-950/10 p-6 overflow-hidden">
                    {/* Área de Mensajes */}
                    <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin scrollbar-thumb-slate-900 pb-4">
                      {activeNpc.chatHistory.map((msg, index) => (
                        <div
                          key={`${msg.id}_${index}`}
                          className={`flex gap-3 max-w-[85%] ${
                            msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center border shrink-0 ${
                            msg.role === 'user' 
                              ? 'bg-blue-950/40 border-blue-900/60 text-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.1)]' 
                              : 'bg-indigo-950/40 border-indigo-900/60 text-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.1)]'
                          }`}>
                            {msg.role === 'user' ? <User className="w-4 h-4" /> : <Brain className="w-4 h-4" />}
                          </div>

                          <div className={`rounded-xl p-3.5 border font-mono text-xs leading-relaxed relative ${
                            msg.role === 'user'
                              ? 'bg-blue-950/20 border-blue-900/50 text-blue-100 rounded-tr-none'
                              : 'bg-indigo-950/20 border-indigo-900/50 text-indigo-100 rounded-tl-none'
                          }`}>
                            <div className="whitespace-pre-wrap">{msg.content}</div>
                          </div>
                        </div>
                      ))}
                      
                      {isGenerating && (
                        <div className="flex gap-3 max-w-[85%]">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center border bg-indigo-950/40 border-indigo-900/60 text-indigo-400 shrink-0 animate-pulse">
                            <Brain className="w-4 h-4 animate-spin-slow" />
                          </div>
                          <div className="bg-indigo-950/10 border border-indigo-900/40 text-slate-500 rounded-xl rounded-tl-none p-3.5 font-mono text-xs flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></span>
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                            <span className="italic ml-1">Escribiendo...</span>
                          </div>
                        </div>
                      )}
                      
                      <div ref={chatEndRef} />
                    </div>

                    {/* Entrada de Chat */}
                    <div className="h-16 mt-4 border border-slate-800 bg-slate-900/40 rounded-xl p-2 flex items-center gap-3 relative z-10">
                      <Tooltip id="npcChatInput" showTooltips={showTooltips} className="flex-1">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={(e) => updateState({ chatInput: e.target.value })}
                          onKeyDown={(e) => {
                            handleAltKeyDown(e);
                            if (e.key === 'Enter') handleSendMessage();
                          }}
                          onKeyUp={(e) => handleAltKeyUp(e, (val) => updateState({ chatInput: val }))}
                          placeholder={`Háblale a ${activeNpc.name}... (ej: ¿quién eres?, ¿qué sabes del protocolo?)`}
                          disabled={isGenerating}
                          className="w-full bg-transparent border-none outline-none font-mono text-xs px-3 text-slate-200 placeholder-slate-600 disabled:cursor-not-allowed"
                        />
                      </Tooltip>
                      
                      {/* Delta de afinidad flotante arriba del botón enviar */}
                      {trustDeltaText && (
                        <div className="absolute -top-10 right-4 px-3 py-1.5 bg-indigo-950/90 border border-indigo-500/40 rounded-lg text-xs font-mono font-bold text-indigo-400 animate-bounce shadow-2xl flex items-center gap-1.5">
                          <Heart className="w-3.5 h-3.5 fill-indigo-400 animate-pulse" /> {trustDeltaText}
                        </div>
                      )}

                      <Tooltip id="npcChatSendBtn" inline showTooltips={showTooltips}>
                        <button
                          onClick={handleSendMessage}
                          disabled={!chatInput.trim() || isGenerating}
                          className="p-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-black disabled:text-slate-600 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </Tooltip>
                    </div>
                  </div>

                  {/* Panel Lateral Derecho: Métricas de Relación y Afinidad */}
                  <div className="w-72 border-l border-slate-850 bg-slate-900/20 p-5 flex flex-col h-full overflow-hidden select-none">
                    <Tooltip id="npcAffinityMetrics" showTooltips={showTooltips}>
                      <h4 className="text-xs font-bold font-mono text-slate-400 mb-4 tracking-wider uppercase cursor-help">AFINIDAD Y MÉTRICAS</h4>
                    </Tooltip>
                    
                    {/* Barra de progreso de afinidad */}
                    <div className="mb-6 p-4 rounded-xl border border-slate-850 bg-slate-900/60 relative overflow-hidden">
                      <div className="flex justify-between items-center mb-2.5">
                        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">Confianza</span>
                        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded border ${getTrustColor(activeNpc.relationship)}`}>
                          💖 {activeNpc.relationship}/100
                        </span>
                      </div>
                      
                      <div className="w-full h-3 bg-slate-950 rounded-full border border-slate-800 overflow-hidden p-0.5">
                        <div 
                          className={`h-full rounded-full bg-gradient-to-r transition-all duration-1000 ${getTrustBarColor(activeNpc.relationship)}`}
                          style={{ width: `${activeNpc.relationship}%` }}
                        ></div>
                      </div>
                      <div className="text-[9px] font-mono text-slate-600 mt-2">
                        Define la disposición del NPC a revelar secretos o codewords.
                      </div>
                    </div>

                    {/* Estado de la evaluación asíncrona */}
                    <div className="mb-6 border-b border-slate-850 pb-5">
                      <Tooltip id="npcMoodEvaluator" showTooltips={showTooltips}>
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-400 mb-3 cursor-help">
                          <Shield className="w-4 h-4 text-indigo-400" />
                          <span>EVALUADOR DE HUMOR</span>
                        </div>
                      </Tooltip>
                      
                      {evaluatingTrust ? (
                        <div className="flex items-center gap-2.5 p-3 rounded-lg border border-indigo-900/30 bg-indigo-950/20 text-indigo-400 text-[10px] font-mono animate-pulse">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Calculando delta de afinidad...</span>
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg border border-slate-850 bg-slate-900/40 text-[10px] font-mono text-slate-500 flex items-center gap-2">
                          <Info className="w-3.5 h-3.5 text-slate-600" />
                          <span>Esperando respuesta del jugador.</span>
                        </div>
                      )}
                    </div>

                    {/* Logs de la sesión */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="text-[10px] font-bold font-mono text-slate-500 tracking-wider mb-2 uppercase">REGISTRO DE CAMBIOS</div>
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-900 text-[10px] font-mono">
                        {relationshipLogs.length === 0 ? (
                          <div className="text-slate-600 text-center py-6">No hay registros de afinidad en esta sesión.</div>
                        ) : (
                          relationshipLogs.map((log, idx) => (
                            <div key={idx} className="p-2 border border-slate-850/60 bg-slate-900/20 rounded flex items-center justify-between">
                              <div className="text-slate-500">{log.timestamp}</div>
                              <div className="text-slate-300 font-bold truncate max-w-[120px]">{log.reason}</div>
                              <div className={`font-bold ${log.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {log.delta > 0 ? `+${log.delta}` : log.delta}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </>
              ) : activeTab === 'editor' ? (
                /* Vista del Configuración/Editor del NPC */
                <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-900">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-400 mb-2">NOMBRE DEL NPC</label>
                      <Tooltip id="npcInputName" showTooltips={showTooltips}>
                        <input
                          type="text"
                          value={editingNpc?.name || ''}
                          onChange={(e) => setEditingNpc(prev => prev ? { ...prev, name: e.target.value } : null)}
                          onKeyDown={handleAltKeyDown}
                          onKeyUp={(e) => handleAltKeyUp(e, (val) => setEditingNpc(prev => prev ? { ...prev, name: val } : null))}
                          placeholder="ej: Kaelen, Nyx, Sentinel..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                        />
                      </Tooltip>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-400 mb-2">ROL / OFICIO</label>
                      <Tooltip id="npcInputRole" showTooltips={showTooltips}>
                        <input
                          type="text"
                          value={editingNpc?.role || ''}
                          onChange={(e) => setEditingNpc(prev => prev ? { ...prev, role: e.target.value } : null)}
                          onKeyDown={handleAltKeyDown}
                          onKeyUp={(e) => handleAltKeyUp(e, (val) => setEditingNpc(prev => prev ? { ...prev, role: val } : null))}
                          placeholder="ej: Mercader, Netrunner, Guarda..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                        />
                      </Tooltip>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-400 mb-2">PERSONALIDAD Y ATRIBUTOS</label>
                      <Tooltip id="npcInputPersonality" showTooltips={showTooltips}>
                        <input
                          type="text"
                          value={editingNpc?.personality || ''}
                          onChange={(e) => setEditingNpc(prev => prev ? { ...prev, personality: e.target.value } : null)}
                          onKeyDown={handleAltKeyDown}
                          onKeyUp={(e) => handleAltKeyUp(e, (val) => setEditingNpc(prev => prev ? { ...prev, personality: val } : null))}
                          placeholder="ej: Desconfiado, sarcástico, bilingüe..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                        />
                      </Tooltip>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-400 mb-2">SECRETO / CODEWORD A REVELAR</label>
                      <Tooltip id="npcInputCodeword" showTooltips={showTooltips}>
                        <input
                          type="text"
                          value={editingNpc?.codeword || ''}
                          onChange={(e) => setEditingNpc(prev => prev ? { ...prev, codeword: e.target.value } : null)}
                          onKeyDown={handleAltKeyDown}
                          onKeyUp={(e) => handleAltKeyUp(e, (val) => setEditingNpc(prev => prev ? { ...prev, codeword: val } : null))}
                          placeholder="ej: NEON_SHADOW"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                        />
                      </Tooltip>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-400 mb-2">
                        RELACIÓN INICIAL DE CONFIANZA: <span className="text-indigo-400">{editingNpc?.initialRelationship ?? 30}</span>
                      </label>
                      <Tooltip id="npcInputRelationship" showTooltips={showTooltips}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={editingNpc?.initialRelationship ?? 30}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setEditingNpc(prev => prev ? { ...prev, initialRelationship: val, relationship: val } : null);
                          }}
                          className="w-full h-8 cursor-pointer"
                        />
                      </Tooltip>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-400 mb-2">PISTAS / CLUES (SEPARADOS POR '|' )</label>
                      <Tooltip id="npcInputClues" showTooltips={showTooltips}>
                        <input
                          type="text"
                          value={editingNpc?.clueHints?.join(' | ') || ''}
                          onChange={(e) => {
                            const hints = e.target.value.split('|').map(s => s.trim()).filter(Boolean);
                            setEditingNpc(prev => prev ? { ...prev, clueHints: hints } : null);
                          }}
                          onKeyDown={handleAltKeyDown}
                          onKeyUp={(e) => handleAltKeyUp(e, (val) => {
                            const hints = val.split('|').map(s => s.trim()).filter(Boolean);
                            setEditingNpc(prev => prev ? { ...prev, clueHints: hints } : null);
                          })}
                          placeholder="ej: El protocolo Alfa | La red oculta"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                        />
                      </Tooltip>
                    </div>
                  </div>

                  {/* System Prompt */}
                  <div className="relative">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-mono font-bold text-slate-400">MAESTRO SYSTEM PROMPT DEL NPC</label>
                      
                      <Tooltip id="npcSystemPromptBtn" inline showTooltips={showTooltips} position="top">
                        <button
                          onClick={handleRefinePrompt}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold font-mono border transition-all cursor-pointer ${
                            isRefining 
                              ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse shadow-md shadow-red-900/40 border-red-500' 
                              : 'bg-indigo-900/30 hover:bg-indigo-800/50 text-indigo-400 border-indigo-900/60'
                          }`}
                        >
                          {isRefining ? <PencilSparkleAnimation className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {isRefining ? '⏹ DETENER REFINADO' : '✨ REFINAR CON IA'}
                        </button>
                      </Tooltip>
                    </div>

                    <Tooltip id="npcSystemPromptTextarea" showTooltips={showTooltips}>
                      <textarea
                        value={editingNpc?.systemPrompt || ''}
                        onChange={(e) => setEditingNpc(prev => prev ? { ...prev, systemPrompt: e.target.value } : null)}
                        onKeyDown={handleAltKeyDown}
                        onKeyUp={(e) => handleAltKeyUp(e, (val) => setEditingNpc(prev => prev ? { ...prev, systemPrompt: val } : null))}
                        className="w-full h-52 bg-slate-900 border border-slate-800 rounded-lg p-3 font-mono text-xs text-slate-100 placeholder-slate-500 leading-relaxed focus:border-indigo-500 outline-none resize-vertical"
                        placeholder={DEFAULT_SYSTEM_PROMPT}
                      />
                    </Tooltip>
                    <p className="text-[10px] font-mono text-slate-600 mt-2">
                      Usa las etiquetas marcadas como <code className="text-indigo-400 font-bold">{'{name}'}</code>, <code className="text-indigo-400 font-bold">{'{role}'}</code>, <code className="text-indigo-400 font-bold">{'{personality}'}</code> y <code className="text-indigo-400 font-bold">{'{trustLevel}'}</code> para inyecciones automáticas de metadatos.
                    </p>
                  </div>

                  {/* Saludos y Failure Conditions */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-400 mb-2">SALUDOS O FRASES DE ENTRADA (SEPARADOS POR '|' )</label>
                      <Tooltip id="npcInputGreetings" showTooltips={showTooltips}>
                        <input
                          type="text"
                          value={editingNpc?.greetings?.join(' | ') || ''}
                          onChange={(e) => {
                            const greets = e.target.value.split('|').map(s => s.trim()).filter(Boolean);
                            setEditingNpc(prev => prev ? { ...prev, greetings: greets } : null);
                          }}
                          onKeyDown={handleAltKeyDown}
                          onKeyUp={(e) => handleAltKeyUp(e, (val) => {
                            const greets = val.split('|').map(s => s.trim()).filter(Boolean);
                            setEditingNpc(prev => prev ? { ...prev, greetings: greets } : null);
                          })}
                          placeholder="ej: Hola... ¿qué te trae por aquí? | ¿Buscas algo de valor?"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                        />
                      </Tooltip>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-mono font-bold text-slate-400 mb-2">CONDICIONES DE EXPULSIÓN / permanent LOCKOUT (SEPARADOS POR '|' )</label>
                      <Tooltip id="npcInputLockout" showTooltips={showTooltips}>
                        <input
                          type="text"
                          value={editingNpc?.failureConditions?.join(' | ') || ''}
                          onChange={(e) => {
                            const fails = e.target.value.split('|').map(s => s.trim()).filter(Boolean);
                            setEditingNpc(prev => prev ? { ...prev, failureConditions: fails } : null);
                          }}
                          onKeyDown={handleAltKeyDown}
                          onKeyUp={(e) => handleAltKeyUp(e, (val) => {
                            const fails = val.split('|').map(s => s.trim()).filter(Boolean);
                            setEditingNpc(prev => prev ? { ...prev, failureConditions: fails } : null);
                          })}
                          placeholder="ej: Si el jugador defiende a MegaCorp | Si intenta intimidarte"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 font-mono text-xs text-slate-100 placeholder-slate-500 focus:border-indigo-500 outline-none"
                        />
                      </Tooltip>
                    </div>
                  </div>

                  <div className="flex gap-3 justify-end pt-4 border-t border-slate-900">
                    <button
                      onClick={() => setActiveTab('chat')}
                      className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-lg font-mono text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveNPC}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-black rounded-lg font-mono text-xs font-bold transition-all cursor-pointer"
                    >
                      Guardar Configuración
                    </button>
                  </div>
                </div>
              ) : (
                /* Vista de Exportación de Scripts (exporter) */
                <div className="flex-1 flex overflow-hidden bg-slate-950/10 p-6 gap-6 h-full w-full">
                  {/* Columna Izquierda: Opciones de exportación y guía */}
                  <div className="w-80 flex flex-col gap-4 select-none shrink-0 h-full overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-900">
                    <div className="p-4 rounded-xl border border-slate-850 bg-slate-900/60 flex flex-col gap-3">
                      <h4 className="text-xs font-bold font-mono text-indigo-400 tracking-wider uppercase flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> SELECCIONA EL MOTOR
                      </h4>
                      <p className="text-[10px] font-mono text-slate-500 leading-relaxed">
                        Genera componentes y scripts optimizados listos para integrar a este NPC interactivo inteligente en tus propios proyectos de juego.
                      </p>
                      
                      <Tooltip id="npcExportFormatBtn" showTooltips={showTooltips}>
                        <div className="flex flex-col gap-2 mt-2">
                          <button
                            onClick={() => setExportFormat('unity')}
                            className={`w-full p-3 rounded-lg border text-left font-mono text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                              exportFormat === 'unity'
                                ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>🎮 Unity (C#)</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-900 bg-indigo-950/60">.cs</span>
                          </button>
                          
                          <button
                            onClick={() => setExportFormat('godot')}
                            className={`w-full p-3 rounded-lg border text-left font-mono text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                              exportFormat === 'godot'
                                ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>🤖 Godot (GDScript)</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-900 bg-indigo-950/60">.gd</span>
                          </button>

                          <button
                            onClick={() => setExportFormat('unreal')}
                            className={`w-full p-3 rounded-lg border text-left font-mono text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                              exportFormat === 'unreal'
                                ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>⚡ Unreal Engine (C++)</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-900 bg-indigo-950/60">.h / .cpp</span>
                          </button>
                          
                          <button
                            onClick={() => setExportFormat('json')}
                            className={`w-full p-3 rounded-lg border text-left font-mono text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                              exportFormat === 'json'
                                ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.1)]'
                                : 'bg-slate-900/40 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>📄 Perfil Purificado (JSON)</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-indigo-900 bg-indigo-950/60">.json</span>
                          </button>
                        </div>
                      </Tooltip>
                    </div>

                    <div className="p-4 rounded-xl border border-slate-850 bg-slate-900/60 flex flex-col gap-3">
                      <h4 className="text-xs font-mono font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-slate-500" /> INSTRUCCIONES DE USO
                      </h4>
                      
                      {exportFormat === 'unity' ? (
                        <div className="text-[10px] font-mono text-slate-500 space-y-2 leading-relaxed">
                          <p>1. Descarga el script <code className="text-indigo-400 font-bold">NPCGameBrain.cs</code>.</p>
                          <p>2. Incorpóralo a tu proyecto Unity dentro de la carpeta Assets.</p>
                          <p>3. Asigna el script a tu GameObject del NPC.</p>
                          <p>4. Conecta el evento <code className="text-indigo-400 font-bold">OnSecretUnlocked</code> para desbloquear contenido cuando la afinidad supere 75.</p>
                        </div>
                      ) : exportFormat === 'godot' ? (
                        <div className="text-[10px] font-mono text-slate-500 space-y-2 leading-relaxed">
                          <p>1. Descarga el script <code className="text-indigo-400 font-bold">npc_game_brain.gd</code>.</p>
                          <p>2. Incorpóralo a tu proyecto de Godot (<code className="text-indigo-400">res://</code>).</p>
                          <p>3. Asigna el script a tu nodo del NPC.</p>
                          <p>4. Conecta la señal <code className="text-indigo-400 font-bold">secret_unlocked</code> para reaccionar al codeword.</p>
                        </div>
                      ) : exportFormat === 'unreal' ? (
                        <div className="text-[10px] font-mono text-slate-500 space-y-2 leading-relaxed">
                          <p>1. Descarga el código <code className="text-indigo-400 font-bold">NPCGameBrain_C++.h</code>.</p>
                          <p>2. Agrega una nueva clase C++ en Unreal Engine heredando de <code className="text-indigo-400">UActorComponent</code>.</p>
                          <p>3. Copia las declaraciones del encabezado (.h) y del cuerpo (.cpp) correspondientemente.</p>
                          <p>4. Vincula el delegado dinámico <code className="text-indigo-400 font-bold">OnSecretUnlocked</code> en Blueprints para reaccionar cuando se revele el secreto.</p>
                        </div>
                      ) : (
                        <div className="text-[10px] font-mono text-slate-500 space-y-2 leading-relaxed">
                          <p>1. Descarga el archivo JSON de metadatos.</p>
                          <p>2. Consúmelo desde tu backend de juego o léelo dinámicamente en tiempo de ejecución.</p>
                        </div>
                      )}
                    </div>

                    <Tooltip id="npcExportDownloadBtn" showTooltips={showTooltips}>
                      <button
                        onClick={() => {
                          if (exportFormat === 'unity') {
                            handleDownloadFile(`${activeNpc.name.replace(/\s+/g, '_')}_GameBrain.cs`, generateUnityScript(activeNpc));
                          } else if (exportFormat === 'godot') {
                            handleDownloadFile(`${activeNpc.name.replace(/\s+/g, '_')}_game_brain.gd`, generateGodotScript(activeNpc));
                          } else if (exportFormat === 'unreal') {
                            handleDownloadFile(`${activeNpc.name.replace(/\s+/g, '_')}_GameBrain_C++.h`, generateUnrealScript(activeNpc));
                          } else {
                            handleDownloadFile(`${activeNpc.name.replace(/\s+/g, '_')}_profile.json`, generateJSONProfile(activeNpc));
                          }
                        }}
                        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-black font-mono text-xs font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(99,102,241,0.25)] hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] cursor-pointer flex items-center justify-center gap-2 mt-auto"
                      >
                        <Sparkles className="w-4 h-4 fill-black" /> DESCARGAR ARCHIVO
                      </button>
                    </Tooltip>
                  </div>

                  {/* Columna Derecha: Vista previa del código autogenerado */}
                  <div className="flex-1 flex flex-col h-full rounded-xl border border-slate-850 bg-slate-950 overflow-hidden relative">
                    <div className="h-10 border-b border-slate-850 bg-slate-900/40 px-4 flex items-center justify-between select-none">
                      <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                        {exportFormat === 'unity' ? 'NPCGameBrain.cs (Unity)' : exportFormat === 'godot' ? 'npc_game_brain.gd (Godot)' : exportFormat === 'unreal' ? 'NPCGameBrain.h / .cpp (Unreal)' : 'profile.json (JSON)'}
                      </span>
                      <span className="text-[9px] font-mono text-indigo-400">VISTA PREVIA AUTOGENERADA</span>
                    </div>
                    
                    <pre className="flex-1 p-5 font-mono text-xs leading-relaxed overflow-auto text-indigo-300/90 select-text scrollbar-thin scrollbar-thumb-slate-900 bg-black/60">
                      <code>
                        {exportFormat === 'unity' 
                          ? generateUnityScript(activeNpc) 
                          : exportFormat === 'godot' 
                            ? generateGodotScript(activeNpc) 
                            : exportFormat === 'unreal'
                              ? generateUnrealScript(activeNpc)
                              : generateJSONProfile(activeNpc)
                        }
                      </code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-950/20">
            <Users className="w-16 h-16 text-slate-700 mb-4 animate-pulse" />
            <h3 className="text-base font-bold font-mono text-slate-400 mb-2">Simulador interactivo de NPCs</h3>
            <p className="text-xs font-mono text-slate-600 max-w-sm mb-6 leading-relaxed">
              Crea o selecciona un perfil de NPC en el panel lateral izquierdo para modelar su personalidad, estructurar su system prompt y probar diálogos reactivos en tiempo real con afinidad asíncrona.
            </p>
            <button
              onClick={handleCreateNPC}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-black font-mono text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              + Crear Primer NPC
            </button>
          </div>
        )}
      </section>
    </div>
  );
};

export default NPCStudio;
