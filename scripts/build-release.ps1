<#
.SYNOPSIS
  Script automatizado para compilar y firmar digitalmente una release de Omni IA Game para Tauri v2.
#>

$ErrorActionPreference = "Stop"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Omni IA Game - Generador de Release Firmada" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

$KeyFile = Join-Path $PSScriptRoot "..\src-tauri\updater.key"
if (-not (Test-Path $KeyFile)) {
    Write-Error "No se encontro el archivo de clave privada en: $KeyFile"
    exit 1
}

$env:TAURI_SIGNING_PRIVATE_KEY = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIGVuY3J5cHRlZCBzZWNyZXQga2V5ClJVTldUT0J3Q3Rvd3VnZ0p3Y1hDazU5V213bFhQc1ZlVnlaR2Z5OHR3eEkvNGM4aVJpc2x2KzE4QU5lMkdHcllCY2VjclphOGkKUk12VmluN2FhU28zWjR0NW0wK1k0S2t4d1lFcWZwR3dqcW9xSVc1cDF3TktpUXlSVDN4S2I2eGZ1OG9SOHF1dWpFcjVtcVZyCjZJcldmK2V5ZmtndS9tTXF3cmtwTkE9PQo="
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
$env:CARGO_BUILD_JOBS = "2"

Write-Host "[2/3] Ejecutando compilación y firma con Tauri..." -ForegroundColor Yellow
npx tauri build

if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo la compilacion de Tauri."
    exit $LASTEXITCODE
}

Write-Host "`n[3/3] Compilación y firma completadas con éxito!" -ForegroundColor Green
$setupSigPath = Get-ChildItem -Path "src-tauri\target\release\bundle\nsis\*.sig" | Select-Object -First 1
if ($setupSigPath) {
    Write-Host "`nFirma generada:" -ForegroundColor Magenta
    $sigContent = Get-Content $setupSigPath.FullName -Raw
    Write-Host $sigContent
}
