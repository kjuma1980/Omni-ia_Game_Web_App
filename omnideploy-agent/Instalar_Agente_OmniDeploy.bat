@echo off
setlocal enabledelayedexpansion
title Instalador del Agente OmniDeploy - Proveedor GPU [v2.8 - 23/08/2026]
color 0A

rem Version actualizada con autodeteccion activa y consola en tiempo real

echo.
echo =========================================================================
echo       AGENTE PROVEEDOR DE GPU - OMNI-IA GAME WEB APP
echo =========================================================================
echo.
echo  ¿PARA QUE SIRVE ESTE SCRIPT?
echo  ----------------------------
echo  Este instalador configura tu PC como un Proveedor de GPU para la App Web.
echo  Permite que https://fenixdev.cloud encienda/apague y utilice tu ComfyUI
echo  local directamente desde el navegador web sin exponer tus datos sensibles.
echo.
echo  - No abre puertos en tu router (conexion saliente 100%% segura por HTTPS).
echo  - Consume menos de 15 MB de RAM y 0%% CPU cuando esta en reposo.
echo  - Se iniciara automaticamente con Windows de forma silenciosa.
echo =========================================================================
echo.

set "INSTALL_DIR=%LOCALAPPDATA%\OmniDeployAgent"
if not exist "!INSTALL_DIR!" mkdir "!INSTALL_DIR!"

echo [1/3] Configuración de tu instalación local de ComfyUI
echo.
echo Introduce o arrastra la ruta completa de tu ejecutable o lanzador .bat de ComfyUI.
echo (Ejemplo: F:\Comfyui_362\App\OMNI-IA_START - Copy.bat)
echo.
set /p COMFY_PATH="Ruta de ComfyUI [deja en blanco para intentar deteccion automatica]: "

if defined COMFY_PATH (
    set COMFY_PATH=!COMFY_PATH:"=!
)

echo.
set /p FRIENDLY_NAME="Nombre de tu equipo [Por defecto: PC del estudio]: "
if not defined FRIENDLY_NAME set "FRIENDLY_NAME=PC del estudio"

echo.
echo [2/3] Instalando archivos del agente en !INSTALL_DIR!...
copy /Y "%~dp0agent.py" "!INSTALL_DIR!\" >nul
copy /Y "%~dp0transporte.py" "!INSTALL_DIR!\" >nul
copy /Y "%~dp0Iniciar agente.bat" "!INSTALL_DIR!\" >nul

(
  echo OMNI_RELAY_URL=https://omni-api.fenixdev.cloud
  echo OMNI_MASTER_KEY=abKY62O2TDK0zgLDgWImeo26VaTrYdRjgDgsvyUzhAs
  echo OMNI_COMFYUI_URL=http://127.0.0.1:8188
  echo OMNI_COMFYUI_LAUNCH_CMD=!COMFY_PATH!
  echo OMNI_FRIENDLY_NAME=!FRIENDLY_NAME!
  echo OMNI_OLLAMA_URL=http://localhost:11434
) > "!INSTALL_DIR!\agent.env"

echo [3/3] Configurando Inicio Automático con Windows...
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_PATH=!STARTUP_FOLDER!\OmniDeployAgent.lnk"
set "TARGET_BAT=!INSTALL_DIR!\Iniciar agente.bat"

powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('!SHORTCUT_PATH!'); $s.TargetPath = '!TARGET_BAT!'; $s.WorkingDirectory = '!INSTALL_DIR!'; $s.WindowStyle = 7; $s.Save()"

echo.
echo =========================================================================
echo  ¡INSTALACION COMPLETADA CON EXITO!
echo =========================================================================
echo  El Agente OmniDeploy se ha configurado e instalado en:
echo  !INSTALL_DIR!
echo.
echo  Tambien se ha añadido al Inicio de Windows para estar disponible
echo  siempre que enciendas tu PC de forma ultraliviana.
echo =========================================================================
echo.
echo Iniciando el agente ahora mismo...
start "" "!TARGET_BAT!"
timeout /t 5
