/**
 * Dispara una notificación flotante efímera (Toast) no bloqueante.
 * Desaparece automáticamente tras 1.5 segundos sin exigir clics ni detener la interacción.
 */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
  if (!message || typeof message !== 'string') return;
  
  // Si el usuario canceló el diálogo del sistema operativo, no mostrar nada
  const lower = message.toLowerCase();
  if (lower.includes('cancelado') || lower.includes('canceled') || lower.includes('canceló')) {
    return;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('omni-toast', { detail: { message, type } }));
  }
}
