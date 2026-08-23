@echo off
setlocal
echo ================================================
echo    Instalador de Piper TTS para Omni-IA Game
echo ================================================
echo.

REM Create piper directory
if not exist "piper" mkdir piper
cd piper

echo Descargando Piper TTS (Windows x64)...
echo.

REM Download Piper for Windows (release 2023.11.14-2 - URL corregida 2026-07-20)
curl -L -o piper.zip https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip

if errorlevel 1 (
    echo ERROR: No se pudo descargar Piper
    pause
    exit /b 1
)

REM SEGURIDAD: verificar integridad SHA256 antes de extraer (auditoria 2026-07-20)
echo Verificando integridad del paquete...
for /f %%h in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 piper.zip).Hash"') do set "PIPER_HASH=%%h"
if /i not "%PIPER_HASH%"=="F3C58906402B24F3A96D92145F58ACBA6D86C9B5DB896D207F78DC80811EFCEA" (
    echo ERROR: El archivo descargado NO coincide con el hash oficial esperado.
    echo Se elimino por seguridad. Revisa tu conexion o avisa al desarrollador.
    del piper.zip
    pause
    exit /b 1
)

echo Extrayendo archivos...
tar -xf piper.zip
del piper.zip

echo.
echo Descargando modelo de voz en español Mexico (es_MX-claude-high)...
curl -L -o es_MX-claude-high.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx
curl -L -o es_MX-claude-high.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/es/es_MX/claude/high/es_MX-claude-high.onnx.json

if errorlevel 1 (
    echo ERROR: No se pudo descargar el modelo de voz
    pause
    exit /b 1
)

REM SEGURIDAD: verificar integridad SHA256 del modelo y su configuracion
echo Verificando integridad del modelo de voz...
for /f %%h in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 es_MX-claude-high.onnx).Hash"') do set "ONNX_HASH=%%h"
if /i not "%ONNX_HASH%"=="3EF40A71EA63852CD8AB7E6FA7D2ECDCFA67A0B47C9C48E3F10E02EE02083EA0" (
    echo ERROR: El modelo descargado NO coincide con el hash oficial esperado.
    del es_MX-claude-high.onnx
    pause
    exit /b 1
)
for /f %%h in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 es_MX-claude-high.onnx.json).Hash"') do set "JSON_HASH=%%h"
if /i not "%JSON_HASH%"=="1AFC81F703C0E4CB3B4D7C0DCA096B8B54A98806807F0170CF5EB5557723C12D" (
    echo ERROR: La configuracion del modelo NO coincide con el hash oficial esperado.
    del es_MX-claude-high.onnx.json
    pause
    exit /b 1
)

cd ..

echo.
echo ================================================
echo    Instalación completada con éxito
echo ================================================
echo.
echo Ahora puedes ejecutar START_PIPER_TTS.bat
echo.
pause
