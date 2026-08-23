@echo off
setlocal
title Agente OmniDeploy - Omni IA Game
cd /d "%~dp0"

echo.
echo   ================================================
echo    AGENTE OMNIDEPLOY
echo   ================================================
echo.
echo   Este equipo prestara su tarjeta grafica a los
echo   usuarios que tengan tus credenciales.
echo.
echo   Deja esta ventana abierta. Para parar, cierrala.
echo.

rem Se busca Python en el orden en que suele existir. `py` es el lanzador
rem oficial de Windows y funciona aunque python.exe no este en el PATH, que es
rem justo el caso de una instalacion desde la Microsoft Store.
set "PY="
where py >nul 2>&1 && set "PY=py"
if not defined PY ( where python >nul 2>&1 && set "PY=python" )

if not defined PY (
  echo   [ERROR] No se ha encontrado Python en este equipo.
  echo.
  echo   Instalalo desde https://www.python.org/downloads/
  echo   y marca la casilla "Add Python to PATH".
  echo.
  pause
  exit /b 1
)

if not exist "agent.env" (
  echo   [ERROR] Falta el fichero agent.env.
  echo.
  echo   Copia agent.env.example como agent.env y rellena
  echo   OMNI_MASTER_KEY con tu clave maestra.
  echo.
  pause
  exit /b 1
)

echo   Python: %PY%
echo   Arrancando...
echo.

%PY% agent.py

rem Si el agente termina -por error o porque se paro- la ventana NO se cierra
rem de golpe: sin esto el mensaje de error desaparece antes de poder leerlo.
echo.
echo   ================================================
echo    El agente se ha detenido.
echo   ================================================
echo.
pause
