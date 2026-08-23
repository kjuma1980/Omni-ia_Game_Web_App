@echo off
title Iniciando OMNI-IA GAME...
cd /d "%~dp0"

echo ===================================================
echo   Iniciando OMNI-IA GAME (DevAsset AI)
echo   Por favor, no cierres esta ventana mientras
echo   la aplicacion este en ejecucion.
echo ===================================================
echo.

:: Usamos 'call' para que el control regrese al script al ejecutar comandos de Node/npm/npx
call npx tauri dev

if %ERRORLEVEL% neq 0 (
    echo.
    echo ===================================================
    echo   ERROR: La aplicacion se detuvo inesperadamente.
    echo   Codigo de salida: %ERRORLEVEL%
    echo ===================================================
    echo.
    pause
)
