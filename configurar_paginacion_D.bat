@echo off
:: Comprobar si se ejecuta como Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [Omni IA Game] Solicitando permisos de Administrador...
    powershell -Command "Start-Process '%~0' -Verb RunAs"
    exit /b
)

echo ====================================================================
echo  Configurando Archivo de Paginacion en SSD P: (Dedicado a SWAP)
echo  Tamano Inicial: 64 GB (65536 MB) - Tamano Maximo: 215 GB (220000 MB)
echo ====================================================================
echo.

powershell -NoProfile -Command ^
  "$regPath = 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management';" ^
  "Set-ItemProperty -Path $regPath -Name 'AutomaticManagedPagefile' -Value 0 -Type DWord;" ^
  "Set-ItemProperty -Path $regPath -Name 'PagingFiles' -Value @('P:\pagefile.sys 65536 220000') -Type MultiString;" ^
  "Write-Host '[OK] Paginacion configurada exclusivamente en P:\pagefile.sys (64GB a 215GB SSD).' -ForegroundColor Green;" ^
  "Write-Host '';" ^
  "Write-Host 'Configuracion actual en Registro de Windows:' -ForegroundColor Cyan;" ^
  "(Get-ItemProperty -Path $regPath).PagingFiles;"

echo.
echo ====================================================================
echo  Configuracion completada con exito.
echo ====================================================================
pause
