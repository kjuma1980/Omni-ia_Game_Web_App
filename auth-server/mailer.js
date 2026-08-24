const path = require('path');
const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465', 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || 'Omni-IA Game';
const MAIL_FROM_LICENSES = process.env.MAIL_FROM_LICENSES || 'omniia.edu.licencias@fenixdev.cloud';
const LOGO_PATH = path.join(__dirname, 'assets', 'logo.png');

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  connectionTimeout: 30000,
  greetingTimeout: 15000,
});

function buildHtml(code) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

    <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:24px 32px;text-align:center;">
      <img src="cid:logo" width="160" alt="Omni-IA Game" style="display:block;margin:0 auto;" />
      <p style="color:#a5b4fc;font-size:11px;letter-spacing:3px;margin:10px 0 0;text-transform:uppercase;font-weight:600;">Sistema de Confirmaci&oacute;n de Cuentas</p>
    </div>

    <div style="padding:32px;">
      <h2 style="color:#1e1b4b;margin:0 0 10px;font-size:20px;">Confirma tu cuenta</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 22px;">
        Gracias por registrarte en <strong>Omni-IA Game</strong>. Usa el siguiente c&oacute;digo para activar tu cuenta:
      </p>
      <div style="background:#eef2ff;border:2px dashed #6366f1;border-radius:10px;padding:22px;text-align:center;margin:0 0 22px;">
        <span style="font-size:34px;font-weight:bold;letter-spacing:12px;color:#312e81;font-family:Consolas,monospace;">${code}</span>
      </div>
      <p style="color:#475569;font-size:13px;line-height:1.6;margin:0 0 6px;">
        El c&oacute;digo expira en <strong>15 minutos</strong>.
      </p>
      <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.5;">
        Si no solicitaste este registro, ignora este correo. Nunca compartas este c&oacute;digo con nadie.
      </p>
    </div>

    <div style="border-top:1px solid #e2e8f0;padding:24px 32px;background:#f8fafc;">
      <table role="presentation" style="width:100%;">
        <tr>
          <td style="vertical-align:middle;width:100px;">
            <img src="cid:logo" width="90" alt="Omni-IA Game" style="display:block;" />
          </td>
          <td style="vertical-align:middle;padding-left:16px;">
            <p style="margin:0;color:#1e1b4b;font-size:13px;font-weight:bold;">Omni-IA Game &mdash; Versi&oacute;n Educativa</p>
            <p style="margin:3px 0 0;color:#64748b;font-size:12px;">Plataforma de creaci&oacute;n de videojuegos con inteligencia artificial</p>
            <p style="margin:3px 0 0;color:#64748b;font-size:12px;">${MAIL_FROM} &middot; ${(process.env.APP_DOMAIN || '').replace(/^https?:\/\//, '')}</p>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0;color:#94a3b8;font-size:10px;text-align:center;">
        Este es un mensaje autom&aacute;tico del sistema de cuentas. No respondas a este correo.
      </p>
    </div>

  </div>
</body>
</html>`;
}

function buildPasswordResetHtml(code) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:30px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.05);">

    <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:24px 32px;text-align:center;">
      <h1 style="color:#ffffff;font-size:22px;margin:0;font-family:sans-serif;">Omni-IA Game</h1>
      <p style="color:#a5b4fc;font-size:11px;letter-spacing:3px;margin:8px 0 0;text-transform:uppercase;font-weight:600;">Recuperaci&oacute;n de Contrase&ntilde;a</p>
    </div>

    <div style="padding:32px;">
      <h2 style="color:#1e1b4b;margin:0 0 10px;font-size:20px;">Restablece tu Contrase&ntilde;a</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 22px;">
        Hemos recibido una solicitud para restablecer la contrase&ntilde;a de tu cuenta en <strong>Omni-IA Game</strong>. Usa el siguiente c&oacute;digo de seguridad de 6 d&iacute;gitos:
      </p>
      <div style="background:#eef2ff;border:2px dashed #6366f1;border-radius:10px;padding:22px;text-align:center;margin:0 0 22px;">
        <span style="font-size:34px;font-weight:bold;letter-spacing:12px;color:#312e81;font-family:Consolas,monospace;">${code}</span>
      </div>
      <p style="color:#475569;font-size:13px;line-height:1.6;margin:0 0 6px;">
        Este c&oacute;digo expira en <strong>15 minutos</strong> y es de un solo uso.
      </p>
      <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;line-height:1.5;border-top:1px solid #f1f5f9;padding-top:12px;">
        Si no solicitaste restablecer tu contrase&ntilde;a, puedes ignorar este correo de forma segura. Tu cuenta permanece protegida.
      </p>
    </div>

    <div style="border-top:1px solid #e2e8f0;padding:20px 32px;background:#f8fafc;text-align:center;">
      <p style="margin:0;color:#64748b;font-size:11px;">Omni-IA Game &middot; fenixdev.cloud &middot; Seguridad de Cuentas</p>
    </div>

  </div>
</body>
</html>`;
}

async function sendVerificationCode(to, code) {
  const text = `Omni-IA Game — Código de Confirmación\n\nTu código de activación es: ${code}\n\nExpira en 15 minutos.`;
  const info = await transporter.sendMail({
    from: `"${MAIL_FROM_NAME}" <${MAIL_FROM}>`,
    to,
    subject: 'Omni-IA Game — Código de confirmación',
    text,
    html: buildHtml(code),
    attachments: [
      {
        filename: 'logo.png',
        path: LOGO_PATH,
        cid: 'logo',
      },
    ],
  });
  return info;
}

async function sendPasswordResetCode(to, code) {
  const text = `Omni-IA Game — Restablecimiento de Contraseña\n\nTu código de seguridad para restablecer tu contraseña es: ${code}\n\nEste código expira en 15 minutos.\n\nSi no solicitaste este cambio, ignora este mensaje.`;
  const info = await transporter.sendMail({
    from: `"${MAIL_FROM_NAME}" <${MAIL_FROM}>`,
    to,
    subject: 'Omni-IA Game — Código de recuperación de contraseña',
    text,
    html: buildPasswordResetHtml(code),
  });
  return info;
}

async function sendLicenseEmail(to, subject, html) {
  const info = await transporter.sendMail({
    from: `"${MAIL_FROM_NAME}" <${MAIL_FROM_LICENSES}>`,
    sender: SMTP_USER,
    to,
    subject,
    html,
    attachments: [
      {
        filename: 'logo.png',
        path: LOGO_PATH,
        cid: 'logo',
      },
    ],
  });
  return info;
}

function buildExpiryHtml({ hwid, licenseKey, expiresAt, daysLeft, appDomain }) {
  const date = expiresAt && expiresAt !== 'UNLIMITED' ? expiresAt : 'Sin fecha';
  const days =
    daysLeft === null || daysLeft === undefined
      ? '—'
      : daysLeft > 0
      ? `${daysLeft} día${daysLeft === 1 ? '' : 's'}`
      : 'hoy';
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">

    <div style="background:linear-gradient(135deg,#4c1d95,#7c3aed);padding:24px 32px;text-align:center;">
      <img src="cid:logo" width="160" alt="Omni-IA Game" style="display:block;margin:0 auto;" />
      <p style="color:#ddd6fe;font-size:11px;letter-spacing:3px;margin:10px 0 0;text-transform:uppercase;font-weight:600;">Aviso de Licencia</p>
    </div>

    <div style="padding:32px;">
      <h2 style="color:#1e1b4b;margin:0 0 10px;font-size:20px;">Tu licencia est&aacute; por expirar</h2>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 22px;">
        La licencia de <strong>Omni-IA Game</strong> asociada a este equipo tiene poco tiempo restante.
      </p>
      <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;padding:20px 24px;margin:0 0 22px;">
        <table role="presentation" style="width:100%;font-size:13px;color:#475569;">
          <tr><td style="padding:4px 0;color:#94a3b8;width:140px;">Hardware ID</td><td style="padding:4px 0;font-family:Consolas,monospace;color:#312e81;">${hwid || '—'}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Expira</td><td style="padding:4px 0;font-weight:600;color:#c2410c;">${date}</td></tr>
          <tr><td style="padding:4px 0;color:#94a3b8;">Tiempo restante</td><td style="padding:4px 0;font-weight:600;color:#312e81;">${days}</td></tr>
        </table>
      </div>
      <p style="color:#475569;font-size:13px;line-height:1.6;margin:0 0 6px;">
        Contacta al administrador del centro educativo para renovar tu licencia y continuar usando
        las funciones premium sin interrupciones.
      </p>
      <p style="color:#94a3b8;font-size:12px;margin:0;line-height:1.5;">
        Licencia: <span style="font-family:Consolas,monospace;">${licenseKey || '—'}</span>
      </p>
    </div>

    <div style="border-top:1px solid #e2e8f0;padding:24px 32px;background:#f8fafc;">
      <table role="presentation" style="width:100%;">
        <tr>
          <td style="vertical-align:middle;width:100px;">
            <img src="cid:logo" width="90" alt="Omni-IA Game" style="display:block;" />
          </td>
          <td style="vertical-align:middle;padding-left:16px;">
            <p style="margin:0;color:#1e1b4b;font-size:13px;font-weight:bold;">Omni-IA Game &mdash; Versi&oacute;n Educativa</p>
            <p style="margin:3px 0 0;color:#64748b;font-size:12px;">${appDomain || 'fenixdev.cloud'}</p>
          </td>
        </tr>
      </table>
      <p style="margin:18px 0 0;color:#94a3b8;font-size:10px;text-align:center;">
        Este es un mensaje autom&aacute;tico del sistema de licencias. No respondas a este correo.
      </p>
    </div>

  </div>
</body>
</html>`;
}


/** Fila de la tabla de datos, para no repetir el mismo HTML ocho veces. */
function fila(etiqueta, valor, monospace) {
  if (valor === null || valor === undefined || valor === '') return '';
  const est = monospace
    ? "font-family:'Consolas',monospace;font-size:12px;word-break:break-all;"
    : 'font-size:13px;';
  return `<tr>
    <td style="padding:8px 12px;color:#64748b;font-size:12px;white-space:nowrap;vertical-align:top;">${etiqueta}</td>
    <td style="padding:8px 12px;color:#1e1b4b;${est}"><strong>${valor}</strong></td>
  </tr>`;
}

function envoltorio(titulo, subtitulo, cuerpo) {
  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
    <div style="background:linear-gradient(135deg,#4c1d95,#7c3aed);padding:24px 32px;text-align:center;">
      <img src="cid:logo" width="160" alt="Omni-IA Game" style="display:block;margin:0 auto;" />
      <p style="color:#ddd6fe;font-size:11px;letter-spacing:3px;margin:10px 0 0;text-transform:uppercase;font-weight:600;">${subtitulo}</p>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1e1b4b;margin:0 0 16px;font-size:20px;">${titulo}</h2>
      ${cuerpo}
    </div>
    <div style="background:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;">Omni-IA Game &mdash; Este correo se envi&oacute; autom&aacute;ticamente. No respondas a esta direcci&oacute;n.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Correo de EMISION de una licencia.
 */
function buildIssueHtml({
  nombreCliente, cuenta, producto, licenseKey, hwid,
  duracionEtiqueta, modoCobro, emitidaEn, modulos, appDomain, targetType,
}) {
  const porUso = modoCobro === 'usage';
  const esWeb = targetType === 'web' || (hwid && hwid.startsWith('WEB-'));
  const tipoPlataforma = esWeb ? 'Aplicación Web (Cuenta por Correo)' : 'Aplicación de Escritorio (Hardware ID)';
  const instruccionUso = esWeb
    ? `Inicia sesión en la versión Web (https://${appDomain || 'fenixdev.cloud'}/app/) con tu cuenta y tus funciones premium se activarán automáticamente.`
    : `Pégala en Omni-IA Game Versión Escritorio en Configuración › Licencia, o inicia sesión con tu cuenta en el programa.`;

  const cuerpo = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      ${nombreCliente ? `Hola ${nombreCliente}, t` : 'T'}u licencia de Omni-IA Game ya est&aacute; emitida.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;">
      ${fila('Plataforma / Tipo', tipoPlataforma)}
      ${fila('Producto', producto)}
      ${fila('M&oacute;dulos', modulos)}
      ${fila('Duraci&oacute;n', duracionEtiqueta)}
      ${fila('Se cuenta por', porUso ? 'Tiempo de uso real' : 'D&iacute;as de calendario')}
      ${fila('Cuenta', cuenta)}
      ${fila('Equipo (HWID)', hwid, true)}
      ${fila('Emitida el', emitidaEn)}
    </table>
    <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:14px 16px;margin:20px 0;border-radius:6px;">
      <p style="margin:0;color:#1e3a8a;font-size:13px;line-height:1.6;">
        <strong>El tiempo empieza a contar cuando actives la licencia</strong>, no hoy.
        ${porUso
          ? 'Se descuenta &uacute;nicamente el tiempo que tengas la aplicaci&oacute;n abierta: si la usas 7 horas y la cierras, solo se descuentan esas 7 horas.'
          : 'A partir de la activaci&oacute;n corren los d&iacute;as naturales, uses la aplicaci&oacute;n o no.'}
      </p>
    </div>
    <p style="color:#64748b;font-size:12px;margin:0 0 8px;">Tu clave de licencia:</p>
    <div style="background:#1e1b4b;color:#c4b5fd;padding:14px;border-radius:8px;font-family:'Consolas',monospace;font-size:11px;word-break:break-all;line-height:1.5;">
      ${licenseKey}
    </div>
    <p style="color:#475569;font-size:13px;line-height:1.6;margin:20px 0 0;">
      ${instruccionUso}
      ${appDomain ? `<br/>M&aacute;s informaci&oacute;n en <a href="https://${appDomain}" style="color:#7c3aed;">${appDomain}</a>.` : ''}
    </p>`;
  const tituloHeader = esWeb ? 'Licencia Web Emitida' : 'Licencia de Escritorio Emitida';
  const subtituloHeader = esWeb ? 'Emisi&oacute;n de Licencia Web App' : 'Emisi&oacute;n de Licencia Escritorio';
  return envoltorio(tituloHeader, subtituloHeader, cuerpo);
}

/**
 * Correo de EMISION de una clave de OmniDeploy.
 *
 * La API Key va aqui EN CLARO y solo una vez: el servidor guarda su hash, asi
 * que no se puede volver a mostrar ni recuperar. Si el cliente la pierde hay que
 * revocarla y emitir otra. El aviso va destacado por eso, no por adorno.
 */
function buildOmniDeployKeyHtml({
  nombreCliente, deploymentId, apiKey, emitidaEn, duracionEtiqueta, expiraEn, appDomain,
}) {
  const cuerpo = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      Ya puedes generar con la GPU remota. Estas son tus credenciales de OmniDeploy.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;">
      ${fila('Cliente', nombreCliente)}
      ${fila('Deployment ID', deploymentId, true)}
      ${fila('API Key', apiKey, true)}
      ${fila('Emitida el', emitidaEn)}
      ${fila('Vigencia', duracionEtiqueta)}
      ${fila('Caduca el', expiraEn)}
    </table>
    <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 16px;margin:20px 0;border-radius:6px;">
      <p style="margin:0;color:#991b1b;font-size:13px;line-height:1.6;">
        <strong>Guarda bien la API Key.</strong> No se puede volver a consultar ni regenerar:
        el servidor solo conserva una huella suya, no la clave. Si la pierdes, hay que
        revocarla y emitir una nueva.
      </p>
    </div>
    <p style="color:#475569;font-size:13px;line-height:1.6;margin:0;">
      P&eacute;galas en Omni-IA Game, en Configuraci&oacute;n, eligiendo <strong>OmniDeploy</strong> como
      proveedor. No necesitas instalar ComfyUI ni cargar ning&uacute;n workflow.
      ${appDomain ? `<br/>M&aacute;s informaci&oacute;n en <a href="https://${appDomain}" style="color:#7c3aed;">${appDomain}</a>.` : ''}
    </p>`;
  return envoltorio('Credenciales de OmniDeploy', 'Acceso a GPU Remota', cuerpo);
}

/**
 * Aviso de caducidad de una clave de OmniDeploy.
 *
 * NO se reutiliza el de licencias: lo que caduca aqui es el acceso a una GPU
 * remota, no la aplicacion. Al cliente hay que decirle que dejara de poder
 * generar, no que se le apaga el programa, y la clave que se le nombra es el
 * Deployment ID -la API Key no se repite nunca, ni siquiera aqui-.
 */
function buildOmniDeployExpiryHtml({ nombreCliente, deploymentId, expiraEn, diasRestantes, appDomain }) {
  const vencida = diasRestantes < 0;
  const cuerpo = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      ${vencida
        ? 'Tu acceso a la GPU remota <strong>ha caducado</strong>. Las generaciones con OmniDeploy dejar&aacute;n de funcionar hasta que se renueve.'
        : diasRestantes === 0
          ? 'Tu acceso a la GPU remota <strong>caduca hoy</strong>.'
          : `Tu acceso a la GPU remota caduca en <strong>${diasRestantes} d&iacute;a${diasRestantes === 1 ? '' : 's'}</strong>.`}
    </p>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;">
      ${fila('Cliente', nombreCliente)}
      ${fila('Deployment ID', deploymentId, true)}
      ${fila('Caduca el', expiraEn)}
    </table>
    <p style="color:#475569;font-size:13px;line-height:1.6;margin:20px 0 0;">
      El resto de Omni-IA Game sigue funcionando: esto solo afecta a generar en la
      GPU remota. Para renovar, responde a quien te facilit&oacute; las credenciales.
      ${appDomain ? `<br/>M&aacute;s informaci&oacute;n en <a href="https://${appDomain}" style="color:#7c3aed;">${appDomain}</a>.` : ''}
    </p>`;
  return envoltorio(
    vencida ? 'Acceso a GPU caducado' : 'Tu acceso a GPU está por caducar',
    'Aviso de OmniDeploy',
    cuerpo,
  );
}

function buildRenewalHtml({ hwid, licenseKey, durationEtiqueta, contactEmail, appDomain }) {
  const cuerpo = `
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">
      ¡Tu licencia de Omni-IA Game ha sido <strong>renovada exitosamente</strong>!
    </p>
    <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;overflow:hidden;">
      ${fila('Equipo (HWID)', hwid, true)}
      ${fila('Nueva Duración', durationEtiqueta)}
      ${fila('Correo de cuenta', contactEmail)}
      ${fila('Estado', 'ACTIVA Y RENOVADA')}
    </table>
    <div style="background:#ecfdf5;border-left:4px solid #10b981;padding:14px 16px;margin:20px 0;border-radius:6px;">
      <p style="margin:0;color:#065f46;font-size:13px;line-height:1.6;">
        <strong>Sincronización automática:</strong> Tu aplicación Omni-IA Game actualizará tu firma de licencia automáticamente sin que tengas que realizar ninguna acción manual.
      </p>
    </div>
    <p style="color:#64748b;font-size:12px;margin:0 0 8px;">Nueva firma de licencia:</p>
    <div style="background:#1e1b4b;color:#c4b5fd;padding:14px;border-radius:8px;font-family:'Consolas',monospace;font-size:11px;word-break:break-all;line-height:1.5;">
      ${licenseKey}
    </div>`;
  return envoltorio('Licencia Renovada', 'Renovación de Licencia', cuerpo);
}

module.exports = { sendVerificationCode, sendPasswordResetCode, sendLicenseEmail, buildExpiryHtml, buildIssueHtml, buildRenewalHtml, buildOmniDeployKeyHtml, buildOmniDeployExpiryHtml, MAIL_FROM_LICENSES };
