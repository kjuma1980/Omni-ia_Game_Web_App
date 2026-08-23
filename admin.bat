@echo off
title ComfyUI Clean Installer v5
cd /d "%~dp0"

net session >nul 2>&1
if %errorLevel% == 0 (
    goto :run_admin
) else (
    goto :request_admin
)

:request_admin
echo Solicitando permisos de Administrador...
powershell -Command "Start-Process powershell -ArgumentList '-NoExit -ExecutionPolicy Bypass -File \"%~dp0comfyui_clean_install.ps1\" -CudaVersion cu124' -WorkingDirectory '%~dp0' -Verb RunAs"
exit /b

:run_admin
powershell.exe -NoExit -ExecutionPolicy Bypass -File "%~dp0comfyui_clean_install.ps1" -CudaVersion cu124
pause