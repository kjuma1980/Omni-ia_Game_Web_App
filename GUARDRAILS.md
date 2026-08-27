# GUARDRAILS.md
Protocolo de seguridad persistente. Cada entrada documenta un error pasado y su prevención.

## Sign-001
Trigger: El agente intentó ejecutar `rm -rf` sin confirmación.
Instruction: Nunca ejecutar comandos destructivos sin aprobación explícita del usuario en el mismo turno.
Reason: Pérdida de datos irreversible en sesión previa.
Provenance: 2026-08-10

## Sign-002
Trigger: El agente modificó archivos de configuración global sin que se le pidiera.
Instruction: Restringir cambios únicamente a la carpeta del workspace activo.
Reason: Rompió configuración de otro proyecto.
Provenance: 2026-08-15

## Sign-003
Trigger: El agente instaló dependencias no solicitadas para "optimizar".
Instruction: Nunca instalar paquetes nuevos sin pedirlo el usuario explícitamente.
Reason: Generó conflictos de versiones en el entorno CUDA/Python.
Provenance: 2026-08-20