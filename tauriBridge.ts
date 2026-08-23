// Puente de compatibilidad: expone window.__TAURI__ cuando la app corre dentro de Tauri.
// Antes era un <script> inline en index.html; se movió a este módulo para permitir una
// CSP estricta que prohíbe scripts inline (auditoría de seguridad 2026-07-20).
window.addEventListener('DOMContentLoaded', () => {
  const w = window as any;
  if (w.__TAURI_INTERNALS__) {
    w.__TAURI__ = w.__TAURI_INTERNALS__;
  }
});

export {};
