"""
Piper TTS Server for Omni-IA Game
Lightweight local TTS using Piper (https://github.com/rhasspy/piper)
"""
import os
import sys
import base64
import subprocess
import uuid
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
# CORS RESTRINGIDO (auditoria 2026-08-01): sin consumidores fetch directo en la app,
# pero se limita a origenes del webview de Tauri por consistencia de seguridad.
CORS(app, origins=[
    'http://tauri.localhost',   # produccion Windows (WebView2)
    'tauri://localhost',        # produccion Linux/macOS
    'http://localhost:3142',    # desarrollo (vite devUrl)
    'http://127.0.0.1:3142'     # desarrollo (variante IP)
])

# Piper executable path (will be downloaded if not exists)
PIPER_DIR = os.path.join(os.path.dirname(__file__), "piper")
PIPER_EXE = os.path.join(PIPER_DIR, "piper.exe")
VOICE_MODEL = os.path.join(PIPER_DIR, "es_MX-claude-medium.onnx")
if not os.path.exists(VOICE_MODEL):
    # Fallback: el modelo medium ya no se distribuye; INSTALL_PIPER.bat descarga high (2026-07-20)
    _alt = os.path.join(PIPER_DIR, "es_MX-claude-high.onnx")
    if os.path.exists(_alt):
        VOICE_MODEL = _alt

@app.route('/api/tts', methods=['POST'])
def generate_tts():
    """Generate TTS audio using Piper"""
    try:
        data = request.json
        text = data.get('text', '')

        if not text:
            return jsonify({"error": "Text is required"}), 400

        # Check if Piper is installed
        if not os.path.exists(PIPER_EXE):
            return jsonify({
                "error": "Piper TTS no está instalado. Ejecuta INSTALL_PIPER.bat primero."
            }), 500

        # Generate audio with Piper (nombre unico por peticion: evita race conditions)
        output_file = f"temp_tts_{uuid.uuid4().hex}.wav"

        # Run Piper: echo "text" | piper --model voice.onnx --output_file output.wav
        process = subprocess.Popen(
            [PIPER_EXE, "--model", VOICE_MODEL, "--output_file", output_file],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )

        stdout, stderr = process.communicate(input=text.encode('utf-8'))

        if process.returncode != 0:
            # SEGURIDAD: no filtrar stderr interno (rutas, versiones) al cliente
            return jsonify({"error": "Piper no pudo generar el audio. Revisa el modelo de voz y el texto."}), 500

        # Read and encode to base64
        with open(output_file, 'rb') as f:
            audio_data = f.read()
            base64_audio = base64.b64encode(audio_data).decode('utf-8')

        # Clean up
        if os.path.exists(output_file):
            os.remove(output_file)

        return jsonify({
            "audio": base64_audio,
            "format": "wav"
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    print("=" * 50)
    print("🎙️  Piper TTS Server for Omni-IA Game")
    print("=" * 50)
    print("Server running on http://127.0.0.1:5000 (solo esta maquina)")
    print("Endpoint: POST /api/tts")
    print("=" * 50)
    # SEGURIDAD (auditoria 2026-07-20): solo localhost, no exponer a la red local
    app.run(host='127.0.0.1', port=5000, debug=False)