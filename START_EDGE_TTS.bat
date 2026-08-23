@echo off
echo ================================================
echo    Edge TTS Server for Omni-IA Game
echo ================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

echo Verificando dependencias...
python -c "import flask, flask_cors, edge_tts" >nul 2>&1
if errorlevel 1 (
    echo Instalando dependencias...
    pip install flask flask-cors edge-tts
) else (
    echo Dependencias ya instaladas. Instalacion omitida.
)

echo.
echo Starting Edge TTS Server on http://localhost:5000
echo.
echo IMPORTANT: Keep this window open while using Omni-IA Game TTS
echo Press Ctrl+C to stop the server
echo.

python edge-tts-server.py

pause