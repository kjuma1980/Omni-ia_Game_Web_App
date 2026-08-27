---
name: deploy-seguro
description: Pasos exactos para desplegar, con checkpoints humanos obligatorios
---
1. Ejecutar tests locales.
2. Mostrar diff completo al usuario y ESPERAR aprobación.
3. Solo tras aprobación explícita, hacer commit.
4. Preguntar antes de hacer push.
5. Nunca desplegar a producción sin confirmación final del usuario.