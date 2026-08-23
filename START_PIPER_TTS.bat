@echo off
echo ================================================
echo    Piper TTS Server for Omni-IA Game
echo ================================================
echo.

REM Check if Piper is installed
if not exist "piper\piper.exe" (
    echo ERROR: Piper no está instalado
    echo Por favor ejecuta INSTALL_PIPER.bat primero
    pause
    exit /b 1
)

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

echo Verificando dependencias...
python -c "import flask, flask_cors" >nul 2>&1
if errorlevel 1 (
    echo Instalando dependencias...
    pip install flask flask-cors
) else (
    echo Dependencias ya instaladas. Instalacion omitida.
)

echo.
echo Starting Piper TTS Server on http://localhost:5000
echo.
echo IMPORTANTE: Mantén esta ventana abierta mientras uses Omni-IA Game TTS
echo Presiona Ctrl+C para detener el servidor
echo.

python piper-tts-server.py

pause