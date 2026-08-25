# Walkthrough - Corrección de Estructura de Payload HTTP 400 en NVIDIA NIM

Se identificó y corrigió la causa exacta del error **HTTP 400 (Bad Request)** al realizar peticiones a NVIDIA NIM.

---

## 🎯 Causa del Error HTTP 400

En la biblioteca de Python de OpenAI, el argumento `extra_body={"chat_template_kwargs": {"thinking": True, "reasoning_effort": "high"}}` es un parámetro del cliente de Python que desempaca sus claves directamente en la **raíz del objeto JSON** enviado por HTTP.

Al enviar literalmente la propiedad `"extra_body": { "chat_template_kwargs": ... }` en el cuerpo JSON en TypeScript, la API REST de NVIDIA NIM fallaba la validación de esquema y devolvía `HTTP 400 Bad Request`.

---

## 🛠️ Solución Aplicada ([`services/localService.ts`](file:///g:/apps/Omni-IA-Game%20Educational%20Version/Omni-ia_Game_Web_App/services/localService.ts))

Se corrigió la estructura del objeto JSON enviado a la API de NVIDIA para incluir `chat_template_kwargs` a nivel raíz:

```json
{
  "model": "deepseek-ai/deepseek-v4-flash-0731",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 1,
  "top_p": 0.95,
  "max_tokens": 16384,
  "chat_template_kwargs": {
    "thinking": true,
    "reasoning_effort": "high"
  }
}
```

---

## 🧪 Verificación

- **`npm run build`:** Compilación exitosa (Código de salida 0).
- El endpoint `http://127.0.0.1:3142/api/nvidia/v1/chat/completions` recibe la estructura de parámetros JSON compatible con el validador de NVIDIA NIM.
