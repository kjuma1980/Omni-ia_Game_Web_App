# REGLAS ESTRICTAS DE DESARROLLO (BOZAL DE SEGURIDAD)

1. **PROHIBIDO MODIFICAR FUNCIONALIDADES EXISTENTES:**
   - Queda estrictamente prohibido alterar, refactorizar o modificar funciones que ya están operativas o aprobadas por el usuario, salvo que el usuario lo pida explícitamente.
   - Está prohibido modificar la estructura de guardado/exportado existente (`stripApiKeysFromProject`, schemas de base de datos, tipos de proyecto) si ya fue probada y funcionando.

2. **PROHIBIDO DESTRUCTIVIDAD DE DATOS:**
   - Nunca agregues filtros, reemplazos o borrados de base64/imágenes ni alteres los assets generados.

3. **CONSULTA OBLIGATORIA ANTES DE CUALQUIER CAMBIO DE ARQUITECTURA:**
   - Antes de modificar más de 1 archivo o alterar el flujo de guardado/carga de la app, DEBES pedir confirmación previa explícita al usuario detallando exactamente qué archivos vas a tocar y por qué.

4. **VERIFICACIÓN OBLIGATORIA DE COMMITS PASADOS:**
   - Antes de aplicar cualquier cambio, compara con `git diff` contra la versión funcional para asegurar que no se introducen regresiones.
