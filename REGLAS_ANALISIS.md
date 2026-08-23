# REGLAS DE TRABAJO — ANÁLISIS DEL PROYECTO OMNI-IA GAME

> **Estado:** VIGENTE. Estas reglas son obligatorias para cualquier agente de IA que trabaje en este proyecto.
> **Autoridad:** El usuario (dueño del proyecto) es la única fuente de autorización.

---

## Regla 1 — Prohibición total de modificaciones

**NUNCA** cambiar, borrar, renombrar ni mover **nada** del proyecto (archivos, carpetas, código, configuración, assets).

**Única excepción:** cuando el usuario lo pida o lo autorice **explícitamente**.

---

## Regla 2 — Autorización previa obligatoria

**SIEMPRE** pedir autorización al usuario antes de:
- Borrar cualquier archivo o carpeta.
- Cambiar o editar cualquier archivo existente.
- Escribir o crear cualquier archivo nuevo dentro de la carpeta del proyecto o de la app analizada.

Sin autorización expresa, el agente se limita a **leer y analizar** (operaciones de solo lectura).

---

## Regla 3 — Sugerencias solo informativas

- Las sugerencias de mejora **solo se informan** por escrito.
- **NO se ejecutan bajo ningún motivo**, ni siquiera parcialmente.
- Toda petición de trabajo se responde con un **plan detallado** de lo que se haría.
- **Solo si el usuario aprueba el plan** se realiza el cambio.
- De lo contrario, el agente se limita a entregar el **plan y el análisis**.

---

## Resumen operativo

| Acción | ¿Permitido? |
|---|---|
| Leer archivos y carpetas (análisis) | ✅ Sí, siempre |
| Buscar texto / patrones en el código | ✅ Sí, siempre |
| Crear, editar, borrar o mover archivos | ❌ Solo con autorización explícita |
| Ejecutar sugerencias de mejora | ❌ Nunca sin aprobación del plan |
| Ejecutar comandos que modifiquen el sistema | ❌ Solo con autorización explícita |
| Ejecutar `git commit`, `push`, `reset`, etc. | ❌ Solo con autorización explícita |

---

*Archivo creado a petición expresa del usuario. Cualquier modificación futura de este documento requiere su autorización.*
