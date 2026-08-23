// F4 — Scheduler de recordatorios de expiración de licencias.
// Escanea licencias activas temporales y envía un correo cuando el tiempo
// restante baja del umbral configurado (REMINDER_THRESHOLD_PCT, default 0.20).
// Después de enviar, marca last_reminded_at para no volver a recordar la
// misma licencia hasta que pase el intervalo de re-aviso (REMINDER_MIN_GAP_DAYS).

const {
  findUserById,
  findLicenseByKey,
  listLicenses,
  touchLicenseReminder,
  createReminder,
  markReminderSent,
  failReminderAttempt,
  logAudit,
} = require('./db');
const { sendLicenseEmail, buildExpiryHtml, buildOmniDeployExpiryHtml } = require('./mailer');

const CHECK_INTERVAL_MS = parseInt(process.env.REMINDER_CHECK_INTERVAL_MS || '3600000', 10); // 1 h
const THRESHOLD_PCT = Math.min(Math.max(parseFloat(process.env.REMINDER_THRESHOLD_PCT || '0.20'), 0.01), 0.95);
const MIN_GAP_DAYS = parseInt(process.env.REMINDER_MIN_GAP_DAYS || '7', 10);
const APP_DOMAIN = (process.env.APP_DOMAIN || 'https://fenixdev.cloud').replace(/^https?:\/\//, '');
const ENABLED = process.env.REMINDERS_ENABLED !== 'false';

function daysUntil(expiresAt) {
  if (!expiresAt || expiresAt === 'UNLIMITED') return null;
  const target = new Date(`${expiresAt}T23:59:59Z`);
  if (Number.isNaN(target.getTime())) return null;
  const ms = target.getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/**
 * Correo de la cuenta a la que esta vinculada la licencia.
 *
 * `contact_email` es texto libre y opcional; `user_id` es el vinculo real, y
 * emitir exige una cuenta existente desde hace tiempo. Sin este respaldo, casi
 * ninguna licencia tenia a quien avisar.
 */
function correoDeLaCuenta(userId) {
  if (!userId) return null;
  try {
    const u = findUserById(userId);
    return u && u.email ? u.email : null;
  } catch {
    return null;
  }
}

async function processExpiryReminders() {
  let offset = 0;
  const page = 100;
  for (;;) {
    const { rows } = listLicenses({ search: '', status: 'active', limit: page, offset });
    if (!rows.length) break;
    for (const lic of rows) {
      // LA FECHA BUENA ES LA DE LA ACTIVACION, no la de emision.
      //
      // Esto miraba `expires_at`, que se clava al GENERAR la licencia. Con el
      // reloj ya en el servidor, la fecha real es `effective_expires_at`, la que
      // se sella cuando el cliente la activa por primera vez.
      const fin = lic.effective_expires_at || lic.expires_at;

      // Una licencia emitida y no entregada no tiene de que avisar: su reloj no
      // ha empezado.
      if (lic.duration_days && !lic.activated_at) continue;

      const daysLeft = daysUntil(fin);
      if (daysLeft === null) continue; // perpetua

      // YA VENCIDA TAMBIEN SE AVISA. Antes se hacia `continue` y quien mas
      // necesitaba enterarse -el que ya no puede trabajar- era justo el unico
      // que no recibia nada.
      const totalDays = lic.duration_days || Math.max(daysLeft, 1);
      const pctLeft = daysLeft / totalDays;
      if (daysLeft >= 0 && pctLeft > THRESHOLD_PCT) continue;

      const gapMs = MIN_GAP_DAYS * 24 * 60 * 60 * 1000;
      if (lic.last_reminded_at && Date.now() - lic.last_reminded_at < gapMs) continue;

      // Si la licencia no lleva correo de contacto se usa el de la cuenta a la
      // que esta vinculada: `contact_email` es texto libre y opcional, mientras
      // que `user_id` es el vinculo real y es obligatorio desde que emitir exige
      // una cuenta existente. Sin este respaldo, la mayoria no avisaba a nadie.
      const contact = lic.contact_email || correoDeLaCuenta(lic.user_id);
      if (!contact) continue;

      const reminder = createReminder({ licenseKey: lic.license_key, daysLeft, pctLeft });
      try {
        await sendLicenseEmail(
          contact,
          daysLeft < 0
            ? 'Omni-IA Game — Tu licencia ha expirado'
            : daysLeft === 0
              ? 'Omni-IA Game — Tu licencia expira hoy'
              : `Omni-IA Game — Tu licencia expira en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`,
          buildExpiryHtml({
            hwid: lic.hwid,
            licenseKey: lic.license_key,
            expiresAt: fin,
            daysLeft,
            appDomain: APP_DOMAIN,
          }),
        );
        markReminderSent(reminder.id);
        touchLicenseReminder(lic.license_key);
        logAudit(null, null, 'license.reminder_sent', {
          license_key: lic.license_key,
          hwid: lic.hwid,
          contact,
          days_left: daysLeft,
        });
        console.log(`[reminders] Recordatorio enviado a ${contact} (${lic.license_key}, ${daysLeft} días restantes).`);
      } catch (err) {
        failReminderAttempt(reminder.id, String(err.message || err));
        console.error(`[reminders] Fallo al enviar recordatorio de ${lic.license_key}:`, err.message);
      }
    }
    offset += page;
  }
}

/**
 * Avisos de caducidad de las CLAVES DE OMNIDEPLOY.
 *
 * Van aparte de los de licencias porque lo que caduca es otra cosa -el acceso a
 * una GPU remota, no la aplicacion- y viven en otra base. Se recorre desde aqui
 * para no montar un segundo temporizador: uno solo, que hace las dos rondas.
 *
 * Solo avisa a las claves ESTRENADAS: una emitida y no usada no tiene reloj
 * corriendo. Y se avisa tambien de las ya caducadas, por el mismo motivo que en
 * las licencias: quien ya no puede generar es justo quien necesita enterarse.
 */
async function processOmniDeployReminders() {
  let od;
  try {
    od = require('./omnideploy/db');
  } catch {
    return; // OmniDeploy no montado en este servidor.
  }

  const filas = od.db
    .prepare(
      `SELECT * FROM omnideploy_clients
       WHERE status = 'active' AND duration_days IS NOT NULL
         AND activated_at IS NOT NULL AND contact_email IS NOT NULL`,
    )
    .all();

  const hoy = new Date().toISOString().slice(0, 10);
  for (const c of filas) {
    if (!c.expires_at) continue;
    const dias = Math.round(
      (Date.parse(`${c.expires_at}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86400000,
    );

    // Mismo umbral que las licencias: el ultimo 20 % de la vigencia.
    if (dias >= 0 && dias / Math.max(c.duration_days, 1) > THRESHOLD_PCT) continue;

    const gapMs = MIN_GAP_DAYS * 24 * 60 * 60 * 1000;
    if (c.last_reminded_at && Date.now() - c.last_reminded_at < gapMs) continue;

    try {
      await sendLicenseEmail(
        c.contact_email,
        dias < 0
          ? 'Omni-IA Game — Tu acceso a la GPU remota ha caducado'
          : dias === 0
            ? 'Omni-IA Game — Tu acceso a la GPU remota caduca hoy'
            : `Omni-IA Game — Tu acceso a la GPU remota caduca en ${dias} día${dias === 1 ? '' : 's'}`,
        buildOmniDeployExpiryHtml({
          nombreCliente: c.label,
          deploymentId: c.deployment_id,
          expiraEn: c.expires_at,
          diasRestantes: dias,
          appDomain: APP_DOMAIN,
        }),
      );
      od.db
        .prepare('UPDATE omnideploy_clients SET last_reminded_at = ? WHERE client_id = ?')
        .run(Date.now(), c.client_id);
      logAudit(null, null, 'omnideploy.client.reminder_sent', {
        client_id: c.client_id, to: c.contact_email, days_left: dias,
      });
      console.log(`[reminders] Aviso de OmniDeploy a ${c.contact_email} (${dias} días).`);
    } catch (err) {
      console.error(`[reminders] Fallo al avisar a ${c.contact_email}:`, err.message);
    }
  }
}

let timer = null;

function startReminders() {
  if (!ENABLED) {
    console.log('[reminders] Recordatorios desactivados (REMINDERS_ENABLED=false).');
    return;
  }
  const ronda = () => {
    processExpiryReminders().catch((err) => console.error('[reminders] Ciclo falló:', err.message));
    processOmniDeployReminders().catch((err) =>
      console.error('[reminders] Ciclo de OmniDeploy falló:', err.message),
    );
  };
  ronda();
  timer = setInterval(ronda, CHECK_INTERVAL_MS);
  console.log(
    `[reminders] Scheduler activo: umbral ${Math.round(THRESHOLD_PCT * 100)}%, re-aviso cada ${MIN_GAP_DAYS} días, chequeo cada ${CHECK_INTERVAL_MS / 60000} min.`
  );
}

function stopReminders() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startReminders, stopReminders, daysUntil };
