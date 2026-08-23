"""
Edge TTS Server for Omni-IA Game
Simple Flask server that provides Text-to-Speech using Microsoft Edge TTS
"""
import asyncio
import base64
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS
import edge_tts

app = Flask(__name__)
# CORS RESTRINGIDO (auditoria 2026-08-01): solo origenes del webview de Tauri.
# El frontend llama con fetch DIRECTO a /api/tts (services/aiProvider.ts:1160),
# asi que no se puede quitar CORS; restringirlo bloquea webs maliciosas.
CORS(app, origins=[
    'http://tauri.localhost',   # produccion Windows (WebView2)
    'tauri://localhost',        # produccion Linux/macOS
    'http://localhost:3142',    # desarrollo (vite devUrl)
    'http://127.0.0.1:3142'     # desarrollo (variante IP)
])

@app.route('/api/tts', methods=['POST'])
def generate_tts():
    """Generate TTS audio using Edge TTS"""
    try:
        data = request.json
        text = data.get('text', '')
        voice = data.get('voice', 'es-MX-DaliaNeural')

        if not text:
            return jsonify({"error": "Text is required"}), 400

        # Generate unique temp file
        temp_file = f"tts_{uuid.uuid4()}.mp3"

        # Run Edge TTS
        async def run_edge():
            print(f"[AUDIO] Generando TTS con voz: {voice}")
            print(f"[AUDIO] Texto: {text[:50]}...")
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(temp_file)

        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        loop.run_until_complete(run_edge())

        # Read and encode to base64
        with open(temp_file, 'rb') as f:
            audio_data = f.read()
            if not audio_data:
                raise Exception("El archivo generado está vacío.")
            base64_audio = base64.b64encode(audio_data).decode('utf-8')

        # Clean up temp file
        import os
        os.remove(temp_file)

        return jsonify({
            "audio": base64_audio,
            "format": "mp3"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/voices', methods=['GET'])
def list_voices():
    """List available Edge TTS voices"""
    try:
        async def get_voices():
            return await edge_tts.list_voices()
            
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        voices = loop.run_until_complete(get_voices())
        
        spanish_voices = [
            {
                "name": v["ShortName"],
                "gender": v["Gender"],
                "locale": v["Locale"]
            }
            for v in voices if v["Locale"].startswith("es-")
        ]
        return jsonify(spanish_voices)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("==================================================")
    print("[AUDIO] Edge TTS Server for Omni-IA Game")
    print("Running on http://127.0.0.1:5000 (solo esta maquina)")
    print("API Endpoints:")
    print("  - POST /api/tts")
    print("  - GET  /api/voices")
    print("==================================================")
    # SEGURIDAD (auditoria 2026-07-20): solo localhost, no exponer a la red local
    app.run(host='127.0.0.1', port=5000, debug=False)