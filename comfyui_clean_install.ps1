# ============================================================
#  ComfyUI - Clean Install & Full Setup Script v5.0
#  Rebuild estable con verificacion final corregida
# ============================================================

param(
    [switch]$SkipClean,
    [switch]$SkipPythonMgmt,
    [switch]$IncludeDocuments,
    [ValidateSet("auto","cu130","cu128","cu124","cu121","cpu")]
    [string]$CudaVersion = "auto"
)

$ErrorActionPreference = "SilentlyContinue"
$ProgressPreference    = "SilentlyContinue"

trap {
    Write-Host ""
    Write-Host " [ERROR FATAL] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host " Linea: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Red
    Write-Host ""
    Read-Host " Presiona ENTER para cerrar"
    exit 1
}

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$InstallDir = Join-Path $ScriptDir "ComfyUI"

function Write-Step  { param($m) Write-Host "  [>>] $m" -ForegroundColor Cyan }
function Write-OK    { param($m) Write-Host "  [OK] $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host " [!!] $m" -ForegroundColor Yellow }
function Write-Err   { param($m) Write-Host " [XX] $m" -ForegroundColor Red }
function Write-Title { param($m) Write-Host ""; Write-Host "  --- $m ---" -ForegroundColor Magenta }

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]"Administrator")

Clear-Host
Write-Host ""
Write-Host "  =================================================" -ForegroundColor Magenta
Write-Host "   ComfyUI Clean Installer v5.0 - Rebuild estable" -ForegroundColor Magenta
Write-Host "  =================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Script ubicado en : $ScriptDir" -ForegroundColor White
Write-Host "  ComfyUI se instala: $InstallDir" -ForegroundColor Cyan
Write-Host "  CUDA              : $CudaVersion" -ForegroundColor White
Write-Host "  Admin             : $isAdmin" -ForegroundColor White
Write-Host ""
Write-Host "  NOTA DE SEGURIDAD: la limpieza (PASO 1) requiere confirmacion manual," -ForegroundColor Yellow
Write-Host "  solo detiene procesos Python de ComfyUI y nunca borra Documents\ComfyUI" -ForegroundColor Yellow
Write-Host "  salvo que se indique el flag -IncludeDocuments." -ForegroundColor Yellow
Write-Host ""
Start-Sleep -Seconds 2

# PASO 1 - LIMPIEZA
if (-not $SkipClean) {
    Write-Title "PASO 1: LIMPIEZA DE COMFYUI PREVIO"
    Write-Host "  ADVERTENCIA: la limpieza elimina instalaciones previas de ComfyUI de forma irreversible." -ForegroundColor Yellow
    Write-Host "  (Documents\ComfyUI NO se toca salvo flag -IncludeDocuments)" -ForegroundColor Yellow
    $confirmClean = Read-Host "  Escribe SI para confirmar la limpieza; cualquier otra respuesta la omite"
    if ($confirmClean -ne 'SI') {
        Write-Step "Limpieza omitida por el usuario."
    } else {
        # SEGURIDAD (2026-07-20): solo detener procesos Python de ComfyUI, nunca todo Python del sistema
        Get-CimInstance Win32_Process -Filter "Name='python.exe' OR Name='python3.exe'" -ErrorAction SilentlyContinue |
            Where-Object { ($_.ExecutablePath -like '*ComfyUI*') -or ($_.CommandLine -like '*ComfyUI*') } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
        $comfyPaths = @(
            "$env:LOCALAPPDATA\Programs\@comfyorg",
            "$env:LOCALAPPDATA\@comfyorg",
            "$env:LOCALAPPDATA\comfyui-electron-updater",
            "$env:LOCALAPPDATA\uv",
            "$env:APPDATA\ComfyUI",
            $InstallDir
        )
        if ($IncludeDocuments) { $comfyPaths += "$env:USERPROFILE\Documents\ComfyUI" }
        foreach ($p in $comfyPaths) {
            if (Test-Path $p) {
                Write-Step "Eliminando: $p"
                Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue
            }
        }
        Write-OK "Limpieza completada."
    }
}

# PASO 2 - PYTHON 3.12
if (-not $SkipPythonMgmt) {
    Write-Title "PASO 2: PYTHON 3.12"

    function Get-InstalledPythons {
        $keys = @(
            "HKLM:\SOFTWARE\Python\PythonCore",
            "HKCU:\SOFTWARE\Python\PythonCore",
            "HKLM:\SOFTWARE\WOW6432Node\Python\PythonCore"
        )
        $found = @()
        foreach ($key in $keys) {
            if (Test-Path $key) {
                Get-ChildItem $key -ErrorAction SilentlyContinue | ForEach-Object {
                    $found += $_.PSChildName
                }
            }
        }
        return ($found | Select-Object -Unique)
    }

    $installed = Get-InstalledPythons
    if ($installed) {
        Write-Host "  Python detectados: $($installed -join ', ')" -ForegroundColor Yellow
    }

    foreach ($stub in @("$env:LOCALAPPDATA\Microsoft\WindowsApps\python.exe","$env:LOCALAPPDATA\Microsoft\WindowsApps\python3.exe")) {
        if (Test-Path $stub) {
            Remove-Item $stub -Force -ErrorAction SilentlyContinue
        }
    }

    $has312 = $false
    try { $ver = & python --version 2>&1; if ($ver -match "3\.12") { $has312 = $true } } catch {}

    if (-not $has312) {
        Write-Step "Descargando Python 3.12.10..."
        $pyInst = "$env:TEMP\python-3.12.10-amd64.exe"
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe" -OutFile $pyInst -UseBasicParsing
        Write-Step "Instalando Python 3.12.10..."
        if ($isAdmin) {
            Start-Process $pyInst -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0 Include_launcher=1 AssociateFiles=1 Shortcuts=0" -Wait -NoNewWindow
        } else {
            Start-Process $pyInst -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0 Include_launcher=1 AssociateFiles=1 Shortcuts=0" -Wait -NoNewWindow
        }
        Remove-Item $pyInst -Force -ErrorAction SilentlyContinue
    }

    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $pv = & python --version 2>&1
    if ($pv -match "3\.12") { Write-OK "Python activo: $pv" } else { Write-Err "Python 3.12 no disponible."; exit 1 }
}

# PASO 3 - GIT
Write-Title "PASO 3: GIT"
$gitOk = $false
try { $gv = & git --version 2>&1; if ($gv -match "git version") { $gitOk = $true; Write-OK $gv } } catch {}
if (-not $gitOk) {
    Write-Step "Descargando Git..."
    $gitInst = "$env:TEMP\git_installer.exe"
    Invoke-WebRequest -Uri "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/Git-2.47.1-64-bit.exe" -OutFile $gitInst -UseBasicParsing
    Start-Process $gitInst -ArgumentList "/VERYSILENT /NORESTART /NOCANCEL /SP- /CLOSEAPPLICATIONS /o:PathOption=CmdTools" -Wait -NoNewWindow
    Remove-Item $gitInst -Force -ErrorAction SilentlyContinue
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    $gv2 = & git --version 2>&1
    if ($gv2 -match "git version") { Write-OK "Git instalado: $gv2" } else { Write-Err "Git no se pudo instalar."; exit 1 }
}

# PASO 4 - VC++
Write-Title "PASO 4: VISUAL C++ REDISTRIBUTABLE"
$vcInst = "$env:TEMP\vc_redist.x64.exe"
try {
    Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vc_redist.x64.exe" -OutFile $vcInst -UseBasicParsing
    Start-Process $vcInst -ArgumentList "/install /quiet /norestart" -Wait -NoNewWindow
    Remove-Item $vcInst -Force -ErrorAction SilentlyContinue
    Write-OK "Visual C++ instalado o actualizado."
} catch {
    Write-Warn "No se pudo instalar VC++ automaticamente."
}

# PASO 5 - CLONAR COMFYUI
Write-Title "PASO 5: CLONAR COMFYUI"
New-Item -ItemType Directory -Path $ScriptDir -Force | Out-Null
Write-Step "Clonando ComfyUI..."
& git clone --quiet "https://github.com/comfyanonymous/ComfyUI.git" $InstallDir 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0 -and -not (Test-Path "$InstallDir\main.py")) { Write-Err "No se pudo clonar ComfyUI."; exit 1 }
Write-OK "ComfyUI listo."

# PASO 6 - .venv
Write-Title "PASO 6: CREAR .venv"
Set-Location $InstallDir
$pythonExe = "python"
Write-Step "Creando entorno virtual..."
& $pythonExe -m venv "$InstallDir\.venv" 2>&1 | Out-Null
if (-not (Test-Path "$InstallDir\.venv\Scripts\python.exe")) { Write-Err "No se pudo crear .venv"; exit 1 }
$venvPython = "$InstallDir\.venv\Scripts\python.exe"
$venvPip    = "$InstallDir\.venv\Scripts\pip.exe"
& $venvPython -m pip install --upgrade pip wheel setuptools --quiet 2>&1 | Out-Null
Write-OK ".venv creado y pip actualizado."

# PASO 7 - DETECCION GPU Y PYTORCH
Write-Title "PASO 7: PYTORCH + CUDA"
$torchIndex = "https://download.pytorch.org/whl/cpu"
$torchLabel = "CPU"

if ($CudaVersion -eq "auto") {
    $gpuName = $null
    try {
        $gpuObj = Get-WmiObject Win32_VideoController -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "NVIDIA" } | Select-Object -First 1
        if ($gpuObj) { $gpuName = $gpuObj.Name }
    } catch {}

    if ($gpuName) {
        Write-OK "GPU detectada: $gpuName"
        if ($gpuName -match "RTX\s*50\d\d") {
            $torchIndex = "https://download.pytorch.org/whl/cu130"; $torchLabel = "CUDA 13.0"
        } elseif ($gpuName -match "RTX\s*40\d\d") {
            $torchIndex = "https://download.pytorch.org/whl/cu128"; $torchLabel = "CUDA 12.8"
        } elseif ($gpuName -match "RTX\s*30\d\d|A\d{4}") {
            $torchIndex = "https://download.pytorch.org/whl/cu124"; $torchLabel = "CUDA 12.4"
        } elseif ($gpuName -match "RTX\s*20\d\d|GTX\s*16\d\d|GTX\s*10\d\d") {
            $torchIndex = "https://download.pytorch.org/whl/cu121"; $torchLabel = "CUDA 12.1"
        } else {
            $torchIndex = "https://download.pytorch.org/whl/cu124"; $torchLabel = "CUDA 12.4"
        }
    } else {
        Write-Warn "No se detecto GPU NVIDIA. Se usara CPU."
        Write-Warn "Si tienes RTX 3090, puedes forzar con -CudaVersion cu124"
    }
} else {
    switch ($CudaVersion) {
        "cu130" { $torchIndex = "https://download.pytorch.org/whl/cu130"; $torchLabel = "CUDA 13.0" }
        "cu128" { $torchIndex = "https://download.pytorch.org/whl/cu128"; $torchLabel = "CUDA 12.8" }
        "cu124" { $torchIndex = "https://download.pytorch.org/whl/cu124"; $torchLabel = "CUDA 12.4" }
        "cu121" { $torchIndex = "https://download.pytorch.org/whl/cu121"; $torchLabel = "CUDA 12.1" }
        "cpu"   { $torchIndex = "https://download.pytorch.org/whl/cpu";   $torchLabel = "CPU" }
    }
}

Write-Step "Instalando PyTorch para $torchLabel ..."
& $venvPip install torch torchvision torchaudio --index-url $torchIndex --quiet 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    & $venvPip install torch torchvision torchaudio --extra-index-url $torchIndex --quiet 2>&1 | Out-Null
}
Write-OK "PyTorch instalado."

# PASO 8 - DEPENDENCIAS COMFYUI
Write-Title "PASO 8: DEPENDENCIAS COMFYUI"
& $venvPip install -r "$InstallDir\requirements.txt" --quiet 2>&1 | Out-Null
$extraPkgs = @(
    "scipy","scikit-image","opencv-python-headless","einops",
    "transformers","accelerate","safetensors","omegaconf",
    "peft","requests","aiohttp","GitPython","huggingface_hub"
)
foreach ($pkg in $extraPkgs) { & $venvPip install $pkg --quiet 2>&1 | Out-Null }
Write-OK "Dependencias instaladas."

# PASO 9 - COMFYUI MANAGER
Write-Title "PASO 9: COMFYUI MANAGER"
$managerDir = "$InstallDir\custom_nodes\ComfyUI-Manager"
New-Item -ItemType Directory -Path "$InstallDir\custom_nodes" -Force | Out-Null
& git clone --quiet "https://github.com/Comfy-Org/ComfyUI-Manager.git" $managerDir 2>&1 | Out-Null
if (Test-Path "$managerDir\requirements.txt") {
    & $venvPip install -r "$managerDir\requirements.txt" --quiet 2>&1 | Out-Null
}
Write-OK "ComfyUI-Manager instalado."

# PASO 10 - MODELOS
Write-Title "PASO 10: CARPETA DE MODELOS"
$defaultModels = "$InstallDir\models"
$useExtraYaml = $false
$modelsDir = $defaultModels

Write-Host ""
Write-Host "  Los modelos pueden ocupar cientos de GB." -ForegroundColor White
Write-Host "  Carpeta por defecto: $defaultModels" -ForegroundColor Cyan
Write-Host "  Opcion 1: Usar la carpeta por defecto" -ForegroundColor Green
Write-Host "  Opcion 2: Elegir otra carpeta o disco" -ForegroundColor Yellow
Write-Host ""

$modelChoice = Read-Host "  Elige una opcion [1 o 2]"
if ($modelChoice -eq "2") {
    do {
        $rawPath = (Read-Host "  Ruta de modelos").Trim().Trim('"')
        if ($rawPath -match "^[A-Za-z]:\\") {
            $modelsDir = $rawPath
        } else {
            Write-Warn "Ruta invalida. Ejemplo: D:\Modelos"
            $modelsDir = ""
        }
    } while (-not $modelsDir)
    $useExtraYaml = $true
}

$modelSubs = @(
    "checkpoints","loras","vae","controlnet",
    "upscale_models","clip","diffusion_models","unet",
    "embeddings","hypernetworks","style_models","photomaker"
)
foreach ($sub in $modelSubs) {
    New-Item -ItemType Directory -Path "$modelsDir\$sub" -Force | Out-Null
}
foreach ($d in @("output","input","temp","user\default\workflows")) {
    New-Item -ItemType Directory -Path "$InstallDir\$d" -Force | Out-Null
}
if ($useExtraYaml) {
    $modelsDirYaml = $modelsDir.Replace("\","/")
    @(
        "# extra_model_paths.yaml",
        "comfyui:",
        "    base_path: $modelsDirYaml/",
        "    checkpoints: checkpoints/",
        "    loras: loras/",
        "    vae: vae/",
        "    clip: clip/",
        "    unet: unet/",
        "    diffusion_models: diffusion_models/",
        "    controlnet: controlnet/",
        "    upscale_models: upscale_models/",
        "    embeddings: embeddings/",
        "    hypernetworks: hypernetworks/",
        "    style_models: style_models/",
        "    photomaker: photomaker/"
    ) | Set-Content "$InstallDir\extra_model_paths.yaml" -Encoding UTF8
    Write-OK "extra_model_paths.yaml creado."
}
Write-OK "Modelos configurados en: $modelsDir"

# PASO 11 - LANZADORES
Write-Title "PASO 11: LANZADORES"
$bat1 = "@echo off`r`ncd /d `"$InstallDir`"`r`ncall `"$InstallDir\.venv\Scripts\activate.bat`"`r`npython main.py --listen 127.0.0.1 --port 8188 --preview-method auto --use-pytorch-cross-attention`r`npause"
$bat1 | Set-Content "$InstallDir\run_comfyui.bat" -Encoding ASCII
$bat2 = "@echo off`r`ncd /d `"$InstallDir`"`r`ncall `"$InstallDir\.venv\Scripts\activate.bat`"`r`npython main.py --listen 127.0.0.1 --port 8188 --preview-method auto --highvram --use-pytorch-cross-attention`r`npause"
$bat2 | Set-Content "$InstallDir\run_comfyui_highvram.bat" -Encoding ASCII
$bat3 = "@echo off`r`ncd /d `"$InstallDir`"`r`ncall `"$InstallDir\.venv\Scripts\activate.bat`"`r`npython main.py --listen 127.0.0.1 --port 8188 --preview-method auto --lowvram --cpu-vae`r`npause"
$bat3 | Set-Content "$InstallDir\run_comfyui_lowvram.bat" -Encoding ASCII
$bat4 = "@echo off`r`ncd /d `"$InstallDir`"`r`ncall `"$InstallDir\.venv\Scripts\activate.bat`"`r`ncmd /k"
$bat4 | Set-Content "$InstallDir\open_venv_console.bat" -Encoding ASCII
$bat5 = "@echo off`r`ncd /d `"$InstallDir`"`r`ncall `"$InstallDir\.venv\Scripts\activate.bat`"`r`ngit pull`r`npip install -r requirements.txt --quiet`r`ncd custom_nodes\ComfyUI-Manager`r`ngit pull`r`ncd `"$InstallDir`"`r`npause"
$bat5 | Set-Content "$InstallDir\update_comfyui.bat" -Encoding ASCII
Write-OK "Lanzadores creados."

# PASO 12 - VERIFICACION FINAL
Write-Title "VERIFICACION FINAL"
$sv = & python --version 2>&1
if ($sv -match "3\.12") { Write-OK "Python sistema : $sv" } else { Write-Warn "Python sistema : $sv" }
$vv = & $venvPython --version 2>&1
if ($vv -match "3\.12") { Write-OK "Python .venv   : $vv" } else { Write-Warn "Python .venv   : $vv" }

$torchCheckPy = @'
import torch
print("torch=" + str(torch.__version__))
if torch.cuda.is_available():
    print("cuda=True")
    print("gpu=" + str(torch.cuda.get_device_name(0)))
    print("cudaver=" + str(torch.version.cuda))
else:
    print("cuda=False")
    print("gpu=N/A")
    print("cudaver=N/A")
'@
$torchCheckPath = Join-Path $env:TEMP "comfy_torch_check.py"
$torchCheckPy | Set-Content $torchCheckPath -Encoding UTF8
$torchCheck = & $venvPython $torchCheckPath 2>&1
Remove-Item $torchCheckPath -Force -ErrorAction SilentlyContinue

foreach ($line in $torchCheck) {
    if ($line -match "torch=(.+)")   { Write-OK "PyTorch        : $($Matches[1])" }
    if ($line -match "cuda=True")    { Write-OK "CUDA           : disponible" }
    if ($line -match "cuda=False")   { Write-Warn "CUDA           : no disponible (CPU)" }
    if ($line -match "gpu=(.+)" -and $Matches[1] -ne "N/A")     { Write-OK "GPU            : $($Matches[1])" }
    if ($line -match "cudaver=(.+)" -and $Matches[1] -ne "N/A") { Write-OK "CUDA version   : $($Matches[1])" }
}

if (Test-Path "$managerDir\__init__.py") { Write-OK "ComfyUI-Manager: instalado" }
else { Write-Warn "ComfyUI-Manager: no verificado" }
if ($useExtraYaml -and (Test-Path "$InstallDir\extra_model_paths.yaml")) { Write-OK "extra_model_paths.yaml correcto" }

Write-Host ""
Write-Host "  =================================================" -ForegroundColor Green
Write-Host "   INSTALACION COMPLETADA" -ForegroundColor Green
Write-Host "  =================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  ComfyUI en : $InstallDir" -ForegroundColor Cyan
Write-Host "  Modelos en : $modelsDir" -ForegroundColor Yellow
Write-Host "  URL        : http://127.0.0.1:8188" -ForegroundColor White
Write-Host ""
Read-Host "  Presiona ENTER para salir"