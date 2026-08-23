@echo off
chcp 65001 >nul
title Generador de licencias - Omni IA Game
cd /d "%~dp0"

rem  Lanzador y nada mas. TODA la logica esta en asistente-licencias.mjs.
rem  Este fichero llego a llevar el menu completo y batch produjo dos fallos
rem  de parseo en un dia: finales de linea LF, y saltos fuera de bloques
rem  entre parentesis que reejecutaban trozos del menu. No vuelve a tener
rem  logica.

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  No se encuentra Node.js. Instalalo desde https://nodejs.org
  echo.
  pause
  exit /b 1
)

node "asistente-licencias.mjs"
echo.
pause
