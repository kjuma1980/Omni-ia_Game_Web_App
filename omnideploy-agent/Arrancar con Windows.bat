@echo off
setlocal
title Agente OmniDeploy - arranque automatico
cd /d "%~dp0"

rem Deja el agente arrancando solo al iniciar sesion, para no tener que acordarse
rem de encenderlo. Se hace con un acceso directo en la carpeta Inicio del USUARIO
rem (HKCU, sin permisos de administrador) y no con un servicio de Windows:
rem un servicio corre sin sesion de escritorio y no veria la GPU igual.

set "INICIO=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "ACCESO=%INICIO%\Agente OmniDeploy.lnk"
set "DESTINO=%~dp0Iniciar agente.bat"

echo.
echo   ================================================
echo    ARRANQUE AUTOMATICO DEL AGENTE
echo   ================================================
echo.

if exist "%ACCESO%" (
  echo   Ya estaba activado.
  echo.
  echo   Para QUITARLO, borra este fichero:
  echo   %ACCESO%
  echo.
  pause
  exit /b 0
)

powershell -NoProfile -NonInteractive -Command ^
  "$s = (New-Object -ComObject WScript.Shell).CreateShortcut('%ACCESO%');" ^
  "$s.TargetPath = '%DESTINO%';" ^
  "$s.WorkingDirectory = '%~dp0';" ^
  "$s.Description = 'Agente OmniDeploy de Omni IA Game';" ^
  "$s.Save()"

if exist "%ACCESO%" (
  echo   ACTIVADO. El agente arrancara solo al iniciar sesion.
  echo.
  echo   Para quitarlo, borra:
  echo   %ACCESO%
) else (
  echo   [ERROR] No se pudo crear el acceso directo.
)

echo.
pause
