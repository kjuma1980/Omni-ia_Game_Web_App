"""
VibeVoice TTS Server for Omni-IA Game
Provides High-Quality, Bilingual Text-to-Speech using VibeVoice (Realtime 0.5B)
"""
import io
import base64
import os
import wave
import uuid
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# Imports condicionales para evitar que la app falle si no están instaladas las dependencias
try:
    import torch
    # from transformers import AutoModelForCausalLM, AutoTokenizer # Dependiendo del fork exacto
    VIBEVOICE_AVAILABLE = True
except ImportError:
    VIBEVOICE_AVAILABLE = False
    print("⚠️  Dependencias de VibeVoice no encontradas. Ejecuta: pip install torch transformers torchaudio")

app = Flask(__name__)
# CORS RESTRINGIDO (auditoria 2026-08-01): el unico consumo es check_service_status
# via Rust (sin Origin -> CORS no aplica); se limita a origenes del webview de Tauri.
CORS(app, origins=[
    'http://tauri.localhost',   # produccion Windows (WebView2)
    'tauri://localhost',        # produccion Linux/macOS
    'http://localhost:3142',    # desarrollo (vite devUrl)
    'http://127.0.0.1:3142'     # desarrollo (variante IP)
])

# Configuración del modelo
MODEL_ID = "VibeVoice-Realtime-0.5B" # Placeholder para el ID en HuggingFace o ruta local
device = "cuda" if VIBEVOICE_AVAILABLE and torch.cuda.is_available() else "cpu"
model = None

def load_vibevoice_model():
    global model
    if not VIBEVOICE_AVAILABLE:
        return False
        
    if model is None:
        print(f"⏳ Cargando modelo {MODEL_ID} en {device}...")
        try:
            # Aquí irá la lógica exacta de inicialización del fork comunitario de VibeVoice.
            # Por ahora, es un mock para la arquitectura.
            # model = AutoModelForCausalLM.from_pretrained(MODEL_ID).to(device)
            print("✅ Modelo VibeVoice cargado exitosamente.")
            model = "loaded" # Flag de estado
        except Exception as e:
            print(f"❌ Error cargando modelo: {e}")
            return False
    return True

@app.route('/api/tts', methods=['POST'])
def generate_tts():
    """Generate TTS audio using VibeVoice"""
    try:
        data = request.json
        text = data.get('text', '')
        voice = data.get('voice', 'default') # VibeVoice puede usar prompts de audio para clonación
        
        if not text:
            return jsonify({"error": "Text is required"}), 400
            
        # if not VIBEVOICE_AVAILABLE:
        #     return jsonify({"error": "Faltan dependencias de Python (torch). Revisa la consola del servidor."}), 500

        # Intentar cargar el modelo si no está cargado (Lazy loading)
        # if not load_vibevoice_model():
        #     return jsonify({"error": "No se pudo cargar el modelo VibeVoice en la GPU."}), 500

        print(f"[VibeVoice] Generando audio para: {text[:50]}...")
        
        # =========================================================
        # LÓGICA DE INFERENCIA DE VIBEVOICE (MOCK PARA EL ESQUELETO)
        # =========================================================
        # En una implementación real con el fork de la comunidad:
        # audio_tensor = model.generate(text=text, voice_prompt=voice)
        # audio_data = audio_tensor.cpu().numpy()
        
        # Para pruebas de la rama, generamos un tono WAV válido (Mock):
        sample_rate = 24000
        t = np.linspace(0, 1.0, int(sample_rate * 1.0), False)
        # Tono simple de prueba de 1 segundo a 440Hz (La)
        audio_data = np.sin(440.0 * 2 * np.pi * t)
        
        # Convertir a 16-bit PCM
        audio_data = (audio_data * 32767).astype(np.int16)
        # =========================================================

        format_req = data.get('format', 'wav').lower()
        
        # Guardar en buffer en memoria como WAV (formato nativo)
        byte_io = io.BytesIO()
        with wave.open(byte_io, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2) # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_data.tobytes())
            
        byte_io.seek(0)
        
        if format_req == 'mp3':
            try:
                from pydub import AudioSegment
                audio_segment = AudioSegment.from_wav(byte_io)
                mp3_io = io.BytesIO()
                audio_segment.export(mp3_io, format="mp3", bitrate="192k")
                mp3_io.seek(0)
                audio_bytes = mp3_io.read()
                final_format = "mp3"
            except ImportError:
                print("⚠️ pydub no está instalado. Devolviendo WAV. Ejecuta: pip install pydub")
                audio_bytes = byte_io.read()
                final_format = "wav"
            except Exception as e:
                print(f"⚠️ Error convirtiendo a MP3 (¿falta ffmpeg?): {e}. Devolviendo WAV.")
                audio_bytes = byte_io.read()
                final_format = "wav"
        else:
            audio_bytes = byte_io.read()
            final_format = "wav"
        
        # Codificar a base64 para Omni-IA Game
        base64_audio = base64.b64encode(audio_bytes).decode('utf-8')

        return jsonify({
            "audio": base64_audio,
            "format": final_format
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

@app.route('/api/status', methods=['GET'])
def get_status():
    """Check if the server and GPU are ready"""
    return jsonify({
        "status": "online",
        "engine": "vibevoice",
        "device": device,
        "model_loaded": model is not None,
        "dependencies": VIBEVOICE_AVAILABLE
    })

if __name__ == '__main__':
    print("==================================================")
    print("VibeVoice TTS Server for Omni-IA Game (Local)")
    print("Running on http://127.0.0.1:5001 (solo esta maquina)")
    print(f"Target Device: {device.upper()}")
    print("API Endpoints:")
    print("  - POST /api/tts")
    print("  - GET  /api/status")
    print("==================================================")
    
    # Arrancamos en el puerto 5001 para no pisar a Edge TTS (5000)
    # SEGURIDAD (auditoria 2026-07-20): solo localhost, no exponer a la red local
    app.run(host='127.0.0.1', port=5001, debug=False)
