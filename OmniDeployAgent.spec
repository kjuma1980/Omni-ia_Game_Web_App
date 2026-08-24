# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['G:\\apps\\Omni-IA-Game Educational Version\\Omni-ia_Game_Web_App\\obf_agent\\agent.py'],
    pathex=['G:\\apps\\Omni-IA-Game Educational Version\\Omni-ia_Game_Web_App\\obf_agent'],
    binaries=[],
    datas=[],
    hiddenimports=['transporte', 'base64', 'json', 'os', 'random', 'sys', 'time', 'pathlib', 'winreg', 'subprocess', 'threading', 'asyncio', 'typing', 'urllib', 'urllib.request', 'urllib.parse', 'urllib.error', 'urllib.response'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='OmniDeployAgent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
