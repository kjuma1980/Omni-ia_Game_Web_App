import { invoke } from '@tauri-apps/api/core';
import { readStoredEmail } from '../components/AuthScreen';

export interface UpdateManifest {
  hasUpdate: boolean;
  version: string;
  title?: string;
  subtitle?: string;
  notes: string[];
  releaseLogoUrl?: string;
  url: string;
  pubDate?: string;
}

export const CURRENT_VERSION = '0.2.9';
const PRIMARY_UPDATE_URL = 'https://fenixdev.cloud/updates.json';
const FALLBACK_UPDATE_URL = 'https://fenixdev.cloud/api/updates/check/';
const FALLBACK_UPDATE_URL_ALT = 'https://fenixdev.cloud/api/updates/check';

function compareVersions(v1: string, v2: string): number {
  const p1 = v1.split('.').map(Number);
  const p2 = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const val1 = p1[i] || 0;
    const val2 = p2[i] || 0;
    if (val1 > val2) return 1;
    if (val1 < val2) return -1;
  }
  return 0;
}

function hayEntornoTauri(): boolean {
  return Boolean(
    (window as any).__TAURI__?.invoke || (window as any).__TAURI_INTERNALS__?.invoke,
  );
}

/**
 * Consulta la nube para verificar si el servidor ha activado una actualización superior.
 * Toda la información visual (título, subtítulo, notas, logo, url) proviene 100% de la nube.
 */
export async function checkForUpdates(): Promise<UpdateManifest> {
  if (!hayEntornoTauri()) {
    return {
      hasUpdate: false,
      version: CURRENT_VERSION,
      title: '',
      subtitle: '',
      notes: [],
      url: '',
      pubDate: new Date().toISOString(),
    };
  }
  const urlsToTry = [PRIMARY_UPDATE_URL, FALLBACK_UPDATE_URL, FALLBACK_UPDATE_URL_ALT];

  for (const url of urlsToTry) {
    try {
      let rawText = '';
      if (hayEntornoTauri()) {
        try {
          rawText = await invoke<string>('proxy_request', {
            url: url,
            method: 'GET',
          });
        } catch (tauriErr) {
          const res = await fetch(url);
          if (res.ok) {
            rawText = await res.text();
          }
        }
      } else {
        const res = await fetch(url);
        if (!res.ok) continue;
        rawText = await res.text();
      }

      if (!rawText || rawText.trim().startsWith('<')) continue; // ignora HTML 404/500
      const data = JSON.parse(rawText || '{}');

      // Si el servidor desactivó las actualizaciones explícitamente, ignorar
      if (data.enabled === false) {
        break;
      }

      const latestVersion = data.latest_version || data.version;
      if (!latestVersion) continue;

      if (compareVersions(latestVersion, CURRENT_VERSION) > 0) {
        let parsedNotes: string[] = [];
        if (Array.isArray(data.notes)) {
          parsedNotes = data.notes;
        } else if (typeof data.notes === 'string') {
          parsedNotes = data.notes.split('\n').filter(Boolean);
        }

        const resolvedUrl =
          data.platforms?.['windows-x86_64']?.url ||
          data.download_url ||
          data.url ||
          `https://fenixdev.cloud/downloads/Omni-IA-Game-Setup-${latestVersion}.exe`;

        return {
          hasUpdate: true,
          version: latestVersion,
          title: data.title || '¡Actualización Disponible!',
          subtitle: data.subtitle || `Novedades de la versión ${latestVersion}`,
          notes: parsedNotes.length > 0 ? parsedNotes : ['Mejoras de estabilidad y rendimiento general.'],
          releaseLogoUrl: data.logo_url || data.releaseLogoUrl || 'https://fenixdev.cloud/omni_ia_logo.jpg',
          url: resolvedUrl,
          pubDate: data.pub_date || new Date().toISOString(),
        };
      }
      break;
    } catch (e) {
      // Intentar siguiente URL
    }
  }

  return {
    hasUpdate: false,
    version: CURRENT_VERSION,
    notes: [],
    url: '',
  };
}

/**
 * Realiza un Snapshot de Seguridad guardando en un respaldo local todas las licencias,
 * API Keys, credenciales de OmniDeploy y configuraciones del usuario antes de actualizar.
 */
export async function createSafetyBackupSnapshot(): Promise<void> {
  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      email: readStoredEmail() || '',
      apiSettings: localStorage.getItem('omni-api-settings'),
      workflowSlots: localStorage.getItem('omni-workflow-slots'),
      relayKey: localStorage.getItem('omnideploy_relay_key'),
      credentials: localStorage.getItem('omnideploy_credentials'),
    };

    localStorage.setItem('omni_safety_snapshot', JSON.stringify(backupData));
    console.log('[Omni IA Game] Safety snapshot de respaldo creado exitosamente.');
  } catch (err) {
    console.warn('[Omni IA Game] Error al crear snapshot de seguridad:', err);
  }
}
