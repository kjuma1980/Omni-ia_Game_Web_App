# Prepara la maquina para Omni IA Game, desde el instalador y sin que el
# cliente haga nada.
#
# LA REGLA, decidida por el propietario: si el equipo tiene una NVIDIA con 6 GB
# de VRAM o mas, se instala la pila local completa -ComfyUI y Ollama con su
# modelo- descargandola de los repositorios oficiales. Si no, se deja el equipo
# en modo nube, que es como funcionaba hasta ahora.
#
# El motivo de la condicion es practico: por debajo de 6 GB, SDXL y los modelos
# de video no caben en VRAM y la generacion local falla o tarda tanto que no
# sirve. Descargar 9 GB para eso seria peor que no descargarlos.
#
# QUE VRAM SE MIRA Y POR QUE `nvidia-smi`. `Win32_VideoController.AdapterRAM` es
# un entero de 32 bits y se queda topado en 4 GB: una 3090 de 24 GB reporta 4.
# `nvidia-smi` viene con el driver de NVIDIA, da el dato exacto, y su sola
# presencia ya confirma que hay una NVIDIA con driver instalado, que es
# justamente la condicion.
#
# Nada de esto es obligatorio: si algo falla, se anota y la aplicacion sigue
# pudiendo trabajar en la nube. Un fallo de descarga no puede dejar sin instalar
# Omni IA Game.

param(
  [string]$Destino = "$env:LOCALAPPDATA\Omni IA Game",
  [switch]$SoloDetectar
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # Sin esto, Invoke-WebRequest es lentisimo.

$logDir = Join-Path $Destino 'logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$modelsDir = Join-Path $Destino 'models'
New-Item -ItemType Directory -Force -Path $modelsDir | Out-Null
$log = Join-Path $logDir 'instalacion-requisitos.log'

function Registrar($msg) {
  $linea = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $msg
  Write-Host $linea
  Add-Content -LiteralPath $log -Value $linea -Encoding UTF8
}

function Anotar($nombre, $valor) {
  New-Item -Path 'HKCU:\Software\Omni IA Game' -Force | Out-Null
  Set-ItemProperty -Path 'HKCU:\Software\Omni IA Game' -Name $nombre -Value $valor
}

# ---------------------------------------------------------------- deteccion ---

function Obtener-VramNvidia {
  # Devuelve los MB de VRAM de la GPU NVIDIA con mas memoria, o 0 si no hay.
  $smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
  if (-not $smi) {
    # El driver instala nvidia-smi en System32, pero puede no estar en PATH.
    $ruta = Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'
    if (Test-Path $ruta) { $smi = $ruta } else { return 0 }
  } else {
    $smi = $smi.Source
  }

  try {
    $salida = & $smi --query-gpu=memory.total --format=csv,noheader,nounits 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $salida) { return 0 }
    $valores = @($salida) | ForEach-Object { [int]($_ -replace '[^\d]', '') } | Where-Object { $_ -gt 0 }
    if (-not $valores) { return 0 }
    return ($valores | Measure-Object -Maximum).Maximum
  } catch {
    return 0
  }
}

function Describir-Graficos {
  # Solo informativo, para el registro: que tarjetas ve Windows.
  try {
    (Get-CimInstance Win32_VideoController -ErrorAction Stop |
      Where-Object { $_.Name -and $_.Name -notmatch 'Basic|Remote|Virtual|Mirror|Meta|Parsec' } |
      Select-Object -ExpandProperty Name) -join ', '
  } catch { 'desconocidos' }
}

Registrar "Graficos detectados: $(Describir-Graficos)"

$vram = Obtener-VramNvidia
$MINIMO_MB = 6000   # 6 GB. Una 1660/2060 de 6 GB entra; una 1650 de 4 GB no.

if ($vram -ge $MINIMO_MB) {
  Registrar "NVIDIA con $vram MB de VRAM: se instalara la pila local."
  Anotar 'GpuApta' 1
  Anotar 'VramMB' $vram
} else {
  if ($vram -gt 0) {
    Registrar "NVIDIA con solo $vram MB de VRAM (hacen falta $MINIMO_MB): modo nube."
  } else {
    Registrar "Sin NVIDIA con driver: modo nube."
  }
  Anotar 'GpuApta' 0
  Anotar 'VramMB' $vram
  # Se apagan las peticiones para que la aplicacion no vuelva a preguntar por
  # algo que este equipo no puede aprovechar.
  Anotar 'InstalarComfyUI' 0
  Anotar 'preferencia_comfyui' 'nube'
  exit 0
}

if ($SoloDetectar) { exit 0 }

# ------------------------------------------------------------------ ComfyUI ---

function Instalar-ComfyUI {
  $raiz = Join-Path $Destino 'ComfyUI'
  if (Test-Path (Join-Path $raiz 'ComfyUI_windows_portable\run_nvidia_gpu.bat')) {
    Registrar 'ComfyUI ya estaba instalado.'
    Anotar 'InstalarComfyUI' 0
    return $true
  }

  Registrar 'Buscando la ultima version portable de ComfyUI...'
  try {
    $api = Invoke-RestMethod -Uri 'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/latest' `
      -Headers @{ 'User-Agent' = 'OmniIAGame-Installer' } -TimeoutSec 30
  } catch {
    Registrar "No se pudo consultar GitHub: $($_.Exception.Message)"
    return $false
  }

  # v0.30.0 publica DOS ficheros con "nvidia" en el nombre, asi que se elige por
  # coincidencia exacta del sufijo y no por "el que contenga nvidia".
  $activo = $api.assets |
    Where-Object { $_.name -match '^ComfyUI_windows_portable_nvidia(_cu\d+)?\.7z$' } |
    Sort-Object { $_.name.Length } |
    Select-Object -First 1

  if (-not $activo) {
    Registrar 'La version publicada no trae paquete portable de NVIDIA.'
    return $false
  }

  New-Item -ItemType Directory -Force -Path $raiz | Out-Null
  $paquete = Join-Path $raiz $activo.name
  Registrar "Descargando $($activo.name) ($([math]::Round($activo.size/1MB)) MB)..."

  try {
    # Reanudable: si el instalador se corta, la siguiente vez continua. GitHub
    # responde 206 desde un punto intermedio, comprobado.
    $ya = 0
    if (Test-Path $paquete) { $ya = (Get-Item $paquete).Length }
    if ($ya -gt 0 -and $ya -lt $activo.size) {
      Registrar "  Reanudando desde $([math]::Round($ya/1MB)) MB."
      $req = [System.Net.HttpWebRequest]::Create($activo.browser_download_url)
      $req.AddRange($ya)
      $resp = $req.GetResponse()
      $entrada = $resp.GetResponseStream()
      $salida = [System.IO.File]::Open($paquete, 'Append')
      $entrada.CopyTo($salida)
      $salida.Close(); $entrada.Close()
    } elseif ($ya -ne $activo.size) {
      Invoke-WebRequest -Uri $activo.browser_download_url -OutFile $paquete -TimeoutSec 3600
    }
  } catch {
    Registrar "Fallo la descarga: $($_.Exception.Message)"
    return $false
  }

  # El `tar` de Windows lee 7-Zip via libarchive: no hace falta empotrar 7zr.
  Registrar 'Extrayendo (esto tarda varios minutos)...'
  & cmd /c "tar -xf `"$paquete`" -C `"$raiz`"" 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Registrar 'No se pudo extraer el paquete.'
    return $false
  }
  Remove-Item -LiteralPath $paquete -Force -ErrorAction SilentlyContinue

  Anotar 'ComfyUIRuta' $raiz
  Anotar 'InstalarComfyUI' 0
  Anotar 'preferencia_comfyui' 'local'
  Registrar 'ComfyUI instalado.'
  return $true
}

# ------------------------------------------------------------------- Ollama ---

function Instalar-Ollama {
  if (Get-Command ollama -ErrorAction SilentlyContinue) {
    Registrar 'Ollama ya estaba instalado.'
    return $true
  }

  $exe = Join-Path $env:TEMP 'OllamaSetup.exe'
  Registrar 'Descargando Ollama...'
  try {
    Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile $exe -TimeoutSec 1800
  } catch {
    Registrar "No se pudo descargar Ollama: $($_.Exception.Message)"
    return $false
  }

  Registrar 'Instalando Ollama en silencio...'
  # /VERYSILENT es de Inno Setup, que es lo que usa el instalador de Ollama.
  $p = Start-Process -FilePath $exe -ArgumentList '/VERYSILENT', '/NORESTART' -Wait -PassThru
  Remove-Item -LiteralPath $exe -Force -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) {
    Registrar "El instalador de Ollama devolvio $($p.ExitCode)."
    return $false
  }
  Registrar 'Ollama instalado.'
  return $true
}

function Instalar-LlamaCpp {
  $targetDir = Join-Path $env:LOCALAPPDATA 'Programs\llama.cpp'
  $exePath = Join-Path $targetDir 'llama-server.exe'
  if (Test-Path $exePath) {
    Registrar 'llama.cpp (llama-server) ya estaba instalado.'
    return $true
  }

  New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
  $zipPath = Join-Path $env:TEMP 'llama-server-win.zip'
  Registrar 'Descargando ejecutable liviano de llama.cpp (llama-server)...'
  try {
    Invoke-WebRequest -Uri 'https://github.com/ggerganov/llama.cpp/releases/download/b3500/llama-b3500-bin-win-vulkan-x64.zip' -OutFile $zipPath -TimeoutSec 900
    Expand-Archive -LiteralPath $zipPath -DestinationPath $targetDir -Force
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Registrar 'llama.cpp (llama-server) instalado correctamente.'
    return $true
  } catch {
    Registrar "Nota: No se pudo descargar automaticamente llama.cpp: $($_.Exception.Message)"
    return $false
  }
}

function Descargar-Modelo($modelo) {
  Registrar "Descargando el modelo $modelo (varios GB, tarda)..."
  $ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
  if (-not $ollama) { $ollama = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe' }
  if (-not (Test-Path $ollama)) {
    Registrar 'No se encontro ollama.exe tras instalarlo.'
    return $false
  }
  & $ollama pull $modelo 2>&1 | ForEach-Object { if ($_ -match 'success|error') { Registrar "  $_" } }
  if ($LASTEXITCODE -ne 0) {
    Registrar "La descarga del modelo fallo (codigo $LASTEXITCODE)."
    return $false
  }
  Anotar 'ModeloOllamaLocal' 0
  Registrar "Modelo $modelo listo."
  return $true
}

# -------------------------------------------------------------------- curso ---
#
# Cada pieza es independiente: que falle ComfyUI no debe impedir Ollama, ni al
# reves. La aplicacion funciona con lo que haya, y lo que falte se puede
# reintentar volviendo a ejecutar el instalador.

$quiereComfy = (Get-ItemProperty -Path 'HKCU:\Software\Omni IA Game' -Name 'InstalarComfyUI' -ErrorAction SilentlyContinue).InstalarComfyUI
$quiereOllama = (Get-ItemProperty -Path 'HKCU:\Software\Omni IA Game' -Name 'InstalarOllama' -ErrorAction SilentlyContinue).InstalarOllama
$quiereModelo = (Get-ItemProperty -Path 'HKCU:\Software\Omni IA Game' -Name 'ModeloOllamaLocal' -ErrorAction SilentlyContinue).ModeloOllamaLocal

if ($quiereComfy -eq 1) {
  if (-not (Instalar-ComfyUI)) { Registrar 'ComfyUI queda pendiente; la aplicacion lo ofrecera al abrirse.' }
} else {
  Registrar 'ComfyUI: no solicitado.'
}

if ($quiereOllama -eq 1) {
  if (Instalar-Ollama) {
    if ($quiereModelo -eq 1) {
      if (-not (Descargar-Modelo 'qwen3.5:4b')) {
        Registrar 'El modelo queda pendiente; se puede descargar desde la aplicacion.'
      }
    } else {
      Registrar 'Modelo local: no solicitado (se usara en la nube).'
    }
  }
} else {
  Registrar 'Ollama: no solicitado.'
}

# Instalacion automatica de llama.cpp (llama-server)
Instalar-LlamaCpp | Out-Null

Registrar 'Preparacion terminada.'
exit 0
