require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {
  findUserByEmail,
  findUserById,
  createUser,
  createAdmin,
  promoteToAdmin,
  setUserRole,
  setUserPassword,
  setUserCode,
  setUserActive,
  registerFailedAttempt,
  updateUserProfile,
  listUsers,
  logAudit,
  listAudit,
  registerLicense,
  findLicenseByKey,
  activarLicencia,
  estadoLicencia,
  listLicenses,
  updateLicenseStatus,
  deleteUserById,
  deleteAllUsers,
  deleteLicenseByKey,
  deleteAllLicenses,
  linkLicenseToUser,
  renewLicense,
  findLicenseByHwid,
  findActiveLicenseForUser,
  revokeUserLicense,
} = require('./db');
const { validateProfile, EMAIL_RE } = require('./validation');
const { sendVerificationCode, sendPasswordResetCode, sendLicenseEmail, buildIssueHtml, buildRenewalHtml, buildOmniDeployKeyHtml } = require('./mailer');
const geo = require('./geo');
const { startReminders } = require('./reminders');
const { generateLicense, DURATIONS, MODULES, CAPS, resolveDuration } = require('./license');

/** Como se llama cada nivel de acceso de cara al cliente. */
const CAPS_ETIQUETA = {
  full: 'Omni-IA Game — Todas las pestañas',
  dev_portal: 'Omni-IA Game — Portal Dev',
  none: 'Módulo suelto',
};

const app = express();

// OmniDeploy mueve FICHEROS en base64 -imagenes, video, audio-, y el parseador
// de JSON de Express admite 100 KB POR DEFECTO. Una imagen de 340 KB llega como
// 460 KB de base64: Express la rechazaba con PayloadTooLargeError, caia en el
// manejador de errores del final y el agente recibia "Error interno del
// servidor" despues de haber generado bien. NINGUNA imagen podia entregarse.
//
// El limite grande se monta SOLO en las rutas de OmniDeploy, y antes del
// parseador general: cuando este se ejecuta, el cuerpo ya esta leido y no hace
// nada. Subirlo de forma global habria abierto las rutas de login y licencias a
// cuerpos de cien megas, que es justo lo que no interesa.
//
// 150 MB cubre el tope de 100 MB por trabajo mas el 34 % que anade base64.
app.use('/api/omnideploy', express.json({ limit: '150mb' }));

app.use(express.json());

const PORT = parseInt(process.env.PORT || '4010', 10);
const JWT_SECRET = process.env.JWT_SECRET || '_omni_ia_game_jwt_secret_fallback_key_2026_safe_';
const CODE_TTL_MS = (parseInt(process.env.CODE_TTL_MINUTES || '15', 10)) * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;

const APP_ORIGINS = [
  'http://tauri.localhost',
  'tauri://localhost',
  'http://localhost:3142',
  'http://127.0.0.1:3142',
  ...String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
];

if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret, x-device-id, x-device-token');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function rateLimit(limitMs, max) {
  const hits = new Map();
  return (req, res, next) => {
    const key = (req.body && req.body.email) || req.ip;
    const now = Date.now();
    const bucket = hits.get(key);
    if (!bucket || now - bucket.first > limitMs) {
      hits.set(key, { first: now, count: 1 });
      return next();
    }
    bucket.count += 1;
    if (bucket.count > max) {
      return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera unos minutos.' });
    }
    next();
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'omni-ia-auth', time: Date.now() });
});

const ALLOWED_CLOUD_DOMAINS = [
  "generativelanguage.googleapis.com",
  "api.openai.com",
  "api.anthropic.com",
  "api.deepseek.com",
  "dashscope.aliyuncs.com",
  "api.moonshot.cn",
  "api.comfydeploy.com",
  "api.sunoapi.org",
  "api.udio.com",
  "openart.ai",
  "api.youart.ai",
  "youart.ai",
  "api.seedance.ai",
  "api.klingai.com",
  "api.elevenlabs.io",
  "api.tripo3d.ai",
  "platform.tripo3d.ai",
  "api.meshy.ai",
  "fenixdev.cloud",
  "omni-api.fenixdev.cloud"
];

app.post('/api/proxy', rateLimit(60 * 1000, 120), (req, res) => {
  try {
    const targetUrl = req.body?.targetUrl || req.body?.url;
    const method = req.body?.method || 'GET';
    const headers = req.body?.headers || {};
    const payload = req.body?.payload !== undefined ? req.body?.payload : req.body?.body;

    if (!targetUrl) {
      return res.status(400).send('targetUrl es requerido');
    }

    const { URL } = require('url');
    const http = require('http');
    const https = require('https');
    const parsedUrl = new URL(targetUrl);
    const hostname = parsedUrl.hostname.toLowerCase();

    const isAllowed = ALLOWED_CLOUD_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
    if (!isAllowed) {
      return res.status(403).send('Dominio no permitido en el proxy seguro de Hostinger');
    }

    const reqHeaders = { ...headers, host: parsedUrl.host };
    delete reqHeaders['content-length'];

    const clientReq = (parsedUrl.protocol === 'https:' ? https : http).request(targetUrl, {
      method: method.toUpperCase(),
      headers: reqHeaders
    }, (upstreamRes) => {
      res.status(upstreamRes.statusCode);
      Object.keys(upstreamRes.headers).forEach(k => {
        if (k !== 'transfer-encoding') {
          res.setHeader(k, upstreamRes.headers[k]);
        }
      });
      upstreamRes.pipe(res);
    });

    clientReq.on('error', (err) => {
      res.status(502).send('Error en relé proxy: ' + err.message);
    });

    if (payload) {
      const dataStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
      clientReq.write(dataStr);
    }
    clientReq.end();
  } catch (err) {
    res.status(400).send('Petición proxy inválida: ' + err.message);
  }
});

app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/' || req.path.startsWith('/downloads') || req.path.startsWith('/app')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get(['/downloads', '/downloads/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'downloads', 'portal.html'));
});

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use('/app', express.static(path.join(__dirname, 'public', 'downloads'), { index: false }));

app.get(['/app', '/app/', '/app/*'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'downloads', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/register', rateLimit(60 * 60 * 1000, 5), async (req, res) => {
  try {
    const email = String((req.body.email || '').trim().toLowerCase());
    const password = String(req.body.password || '');

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Correo electrónico no válido.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' });
    }

    let user = findUserByEmail(email);
    if (user) {
      if (user.status === 'active') {
        return res.status(409).json({ ok: false, error: 'Este correo ya está registrado. Inicia sesión.' });
      }
    } else {
      const profileFields = ['first_name', 'last_name', 'personal_email', 'edu_email', 'phone', 'address', 'city', 'state', 'country', 'birth_date', 'interests'];
      const hasProfile = profileFields.some((k) => req.body[k] !== undefined && String(req.body[k]).trim() !== '');
      let profile = null;
      if (hasProfile) {
        const { errors, profile: p } = validateProfile(req.body);
        if (Object.keys(errors).length > 0) {
          return res.status(400).json({
            ok: false,
            error: 'Revisa los campos del formulario.',
            fields: errors,
          });
        }
        profile = p;
      }
      const passwordHash = await bcrypt.hash(password, 12);
      user = createUser({ email, passwordHash, profile });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    setUserCode({ email, codeHash, expiresAt: Date.now() + CODE_TTL_MS });

    try {
      await sendVerificationCode(email, code);
      res.json({ ok: true, message: 'Revisa tu correo: enviamos un código de confirmación de 6 dígitos.' });
    } catch (smtpErr) {
      console.error('[register] Error de envío SMTP:', smtpErr.message || smtpErr);
      res.status(500).json({ ok: false, error: 'No se pudo enviar el correo de confirmación. Intenta de nuevo.' });
    }
  } catch (err) {
    console.error('[register]', err);
    res.status(500).json({ ok: false, error: 'No se pudo enviar el código. Intenta de nuevo.' });
  }
});

app.use('/downloads', (req, res, next) => {
  const persistentDir = '/home/u670620190/omni_data/downloads';
  const cleanPath = req.path.replace(/^[/\\]+/, '');
  // La app web y sus chunks JS/CSS viven en public/downloads del paquete desplegado.
  // omni_data solo custodia instaladores (.exe, .sig, .zip) para sobrevivir a despliegues.
  if (cleanPath.endsWith('.html') || cleanPath.startsWith('assets/') || cleanPath.startsWith('scripts/')) {
    return next();
  }
  const persistentFile = path.join(persistentDir, cleanPath);
  if (fs.existsSync(persistentFile) && fs.statSync(persistentFile).isFile()) {
    return res.sendFile(persistentFile);
  }
  next();
});

app.get([
  '/downloads/Omni-IA-Game-Setup-latest.exe',
  '/downloads/Omni-IA-Game-Setup-0.2.7.exe',
  '/downloads/Omni-IA-Game-Setup-0.2.6.exe',
  '/downloads/Omni-IA-Game-Setup-0.2.5.exe',
  '/downloads/Omni-IA-Game-Setup-0.2.4.exe',
  '/downloads/Omni-IA-Game-Setup-0.2.3.exe',
  '/downloads/Omni_IA_Game_latest_x64-setup.exe',
  '/downloads/Omni_IA_Game_0.2.8_x64-setup.exe',
  '/downloads/Omni_IA_Game_0.2.7_x64-setup.exe',
  '/downloads/Omni_IA_Game_0.2.6_x64-setup.exe',
  '/downloads/Omni_IA_Game_0.2.5_x64-setup.exe',
  '/downloads/Omni_IA_Game_0.2.4_x64-setup.exe',
  '/downloads/Omni_IA_Game_0.2.3_x64-setup.exe'
], (req, res) => {
  res.redirect(302, '/downloads/Omni-IA-Game-Setup-0.2.8.exe');
});

app.post('/api/admin/upload-chunk', (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  const expectedSecret = process.env.LICENSE_REGISTER_KEY || '_pReyBRMZ1LQXtVsSjVb6gjx2UijBsnaTRFvpVVbebM';
  if (!adminSecret || adminSecret !== expectedSecret) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  const targetRelative = (req.query.filename || 'Omni-IA-Game-Setup-0.2.8.exe').replace(/^[/\\]+/, '');
  const chunkIndex = parseInt(req.query.chunk || '0', 10);
  const totalChunks = parseInt(req.query.total || '1', 10);
  const isRestart = req.query.restart === '1' || req.query.restart === 'true';
  const isCodeTarget = req.query.target === 'root' || req.query.scope === 'code';
  const filename = path.basename(targetRelative);
  
  const baseFolder = isCodeTarget ? __dirname : path.join(__dirname, 'public');
  const destDir = path.join(baseFolder, path.dirname(targetRelative));
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(baseFolder, targetRelative);

  const writeStream = fs.createWriteStream(destPath, { flags: chunkIndex === 0 ? 'w' : 'a' });
  let bytesWritten = 0;

  req.on('data', (chunk) => {
    bytesWritten += chunk.length;
  });

  req.pipe(writeStream);

  writeStream.on('finish', () => {
    if (chunkIndex + 1 >= totalChunks) {
      try {
        const persistentDir = '/home/u670620190/omni_data/downloads';
        if (!isCodeTarget && fs.existsSync('/home/u670620190/omni_data')) {
          if (!fs.existsSync(persistentDir)) fs.mkdirSync(persistentDir, { recursive: true });
          const persistentPath = path.join(persistentDir, filename);
          fs.copyFileSync(destPath, persistentPath);
          console.log(`💾 Guardado respaldo persistente en: ${persistentPath}`);
        }
      } catch (errCopy) {
        console.error('Error guardando copia persistente:', errCopy);
      }
      if (isRestart) {
        console.log('🔄 Reiniciando proceso de Node.js en Hostinger...');
        setTimeout(() => process.exit(0), 500);
      }
    }
    return res.json({ ok: true, chunkIndex, totalChunks, filename, bytesWritten, restarted: isRestart });
  });

  writeStream.on('error', (err) => {
    console.error('Error escribiendo stream de bloque:', err);
    return res.status(500).json({ ok: false, error: err.message });
  });

  req.on('error', (err) => {
    writeStream.destroy();
    return res.status(500).json({ ok: false, error: err.message });
  });
});

app.get(['/api/updates/check', '/api/updates/check/:version'], (req, res) => {
  res.json({
    enabled: true,
    latest_version: "0.2.8",
    min_supported_version: "0.1.0",
    title: "¡Actualización Disponible para Omni IA Game v0.2.8!",
    subtitle: "Novedades y optimizaciones de la versión 0.2.8 (21 de Agosto, 2026).",
    notes: [
      "⚡ Deslimitación Universal de Tokens en Ollama: Generación continua sin cortes (num_predict ilimitado y contexto 32K).",
      "📜 Narrativa y GDD Completo: Expansión IA de 7 secciones en español e inglés sin truncamiento de texto.",
      "✨ Refinamiento con IA sin Restricciones: Optimización fluida y completa para semillas de guión y prompts.",
      "🚀 Instalador Automático In-App: Descarga nativa y ejecución en segundo plano sin dependencias del navegador."
    ],
    logo_url: "https://fenixdev.cloud/omni_ia_logo.jpg",
    download_url: "https://fenixdev.cloud/downloads/Omni-IA-Game-Setup-0.2.8.exe",
    pub_date: new Date().toISOString()
  });
});

app.post('/api/verify', rateLimit(10 * 60 * 1000, 10), (req, res) => {
  const email = String((req.body.email || '').trim().toLowerCase());
  const code = String(req.body.code || '').trim();

  if (!/^\d{6}$/.test(code)) {
    return res.status(400).json({ ok: false, error: 'El código debe tener 6 dígitos.' });
  }

  const user = findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ ok: false, error: 'Cuenta no encontrada. Regístrate primero.' });
  }
  if (user.status === 'active') {
    return res.status(400).json({ ok: false, error: 'La cuenta ya está activa. Inicia sesión.' });
  }
  if (!user.code_hash || !user.code_expires_at) {
    return res.status(400).json({ ok: false, error: 'No hay código pendiente. Regístrate de nuevo.' });
  }
  if (Date.now() > user.code_expires_at) {
    return res.status(400).json({ ok: false, error: 'El código expiró. Regístrate de nuevo para recibir otro.' });
  }
  if (user.code_attempts >= CODE_MAX_ATTEMPTS) {
    return res.status(429).json({ ok: false, error: 'Demasiados intentos. Regístrate de nuevo para recibir otro código.' });
  }

  const providedHash = crypto.createHash('sha256').update(code).digest('hex');
  if (providedHash !== user.code_hash) {
    registerFailedAttempt(email);
    return res.status(400).json({ ok: false, error: 'Código incorrecto. Verifica e intenta de nuevo.' });
  }

  setUserActive(email);
  res.json({ ok: true, message: 'Cuenta activada. Ya puedes iniciar sesión.' });
});

app.post('/api/password-reset/request', rateLimit(15 * 60 * 1000, 5), async (req, res) => {
  try {
    const email = String((req.body.email || '').trim().toLowerCase());
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Correo electrónico no válido.' });
    }

    const user = findUserByEmail(email);
    if (!user) {
      // Respuesta consistente para no exponer enumeración
      return res.json({ ok: true, message: 'Si el correo está registrado, recibirás un código de 6 dígitos.' });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutos

    setUserCode({ email, codeHash, expiresAt });

    await sendPasswordResetCode(email, code);
    logAudit(user.id, email, 'user.password_reset_requested', {});
    res.json({ ok: true, message: 'Código de recuperación enviado a tu correo.' });
  } catch (err) {
    console.error('[password-reset/request]', err);
    res.status(500).json({ ok: false, error: 'Error al enviar el correo de recuperación. Intenta más tarde.' });
  }
});

app.post('/api/password-reset/confirm', rateLimit(15 * 60 * 1000, 10), async (req, res) => {
  try {
    const email = String((req.body.email || '').trim().toLowerCase());
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.new_password || '');

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ ok: false, error: 'Correo electrónico no válido.' });
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ ok: false, error: 'El código debe ser de 6 dígitos numéricos.' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' });
    }

    const user = findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Cuenta no encontrada.' });
    }
    if (!user.code_hash || !user.code_expires_at) {
      return res.status(400).json({ ok: false, error: 'No hay solicitud activa de recuperación. Solicita un código nuevo.' });
    }
    if (Date.now() > user.code_expires_at) {
      return res.status(400).json({ ok: false, error: 'El código expiró. Solicita uno nuevo.' });
    }
    if (user.code_attempts >= CODE_MAX_ATTEMPTS) {
      return res.status(429).json({ ok: false, error: 'Demasiados intentos fallidos. Solicita un código nuevo.' });
    }

    const providedHash = crypto.createHash('sha256').update(code).digest('hex');
    if (providedHash !== user.code_hash) {
      registerFailedAttempt(email);
      return res.status(400).json({ ok: false, error: 'Código incorrecto. Verifica e intenta de nuevo.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    setUserPassword(user.id, passwordHash);
    setUserActive(email);
    logAudit(user.id, email, 'user.password_reset_confirmed', {});

    res.json({ ok: true, message: 'Tu contraseña ha sido restablecida con éxito. Ya puedes iniciar sesión.' });
  } catch (err) {
    console.error('[password-reset/confirm]', err);
    res.status(500).json({ ok: false, error: 'Error interno al restablecer contraseña.' });
  }
});

const handleLogin = async (req, res) => {
  try {
    const email = String((req.body.email || '').trim().toLowerCase());
    const password = String(req.body.password || '');

    const user = findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos.' });
    }
    if (user.status !== 'active') {
      return res.status(403).json({ ok: false, error: 'Cuenta pendiente de confirmación.' });
    }

    const activeLic = findActiveLicenseForUser(user.id, user.email);
    res.json({
      ok: true,
      token: signToken(user),
      user: { email: user.email, createdAt: user.created_at },
      license: activeLic ? activeLic.license_key : null,
    });
  } catch (err) {
    console.error('[login]', err);
    res.status(500).json({ ok: false, error: 'Error interno al iniciar sesión.' });
  }
};

app.post('/api/login', rateLimit(10 * 60 * 1000, 10), handleLogin);
app.post('/api/auth/login', rateLimit(10 * 60 * 1000, 10), handleLogin);

app.post('/api/admin/login', rateLimit(10 * 60 * 1000, 10), async (req, res) => {
  try {
    const email = String((req.body.email || '').trim().toLowerCase());
    const password = String(req.body.password || '');

    const user = findUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ ok: false, error: 'Correo o contraseña incorrectos.' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Acceso denegado. Esta cuenta no tiene permisos de administrador.' });
    }

    res.json({
      ok: true,
      token: signToken(user),
      user: { email: user.email, role: user.role, createdAt: user.created_at }
    });
  } catch (err) {
    console.error('[admin/login]', err);
    res.status(500).json({ ok: false, error: 'Error interno al iniciar sesión de administrador.' });
  }
});

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Sesión no válida.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Sesión expirada o no válida.' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

app.get('/api/me', authRequired, (req, res) => {
  const user = findUserByEmail(req.user.email);
  if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
  let interests = [];
  try {
    interests = JSON.parse(user.interests || '[]');
  } catch {
    interests = [];
  }
  const activeLic = findActiveLicenseForUser(user.id, user.email);
  res.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.created_at,
      completedRegistration: !!user.completed_registration,
      license: activeLic ? activeLic.license_key : null,
      profile: {
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        personal_email: user.personal_email || '',
        edu_email: user.edu_email || '',
        phone: user.phone || '',
        address: user.address || '',
        city: user.city || '',
        state: user.state || '',
        country: user.country || '',
        birth_date: user.birth_date || '',
        interests,
      },
    },
  });
});

const handleUserLicenseDelete = (req, res) => {
  try {
    const user = req.user;
    const revokedLic = revokeUserLicense(user.id, user.email);
    if (revokedLic && revokedLic.license_key) {
      logAudit(user.id, user.email, 'license.user_deleted', { license_key: String(revokedLic.license_key).slice(0, 24) + '…' });
    }
    return res.json({ ok: true, message: 'Licencia eliminada y desvinculada exitosamente.' });
  } catch (err) {
    console.error('[delete /api/me/license]', err);
    return res.status(500).json({ ok: false, error: String(err.message || err) });
  }
};

app.delete('/api/me/license', authRequired, rateLimit(60 * 1000, 20), handleUserLicenseDelete);
app.post('/api/me/license/delete', authRequired, rateLimit(60 * 1000, 20), handleUserLicenseDelete);

app.post('/api/me/profile', authRequired, rateLimit(60 * 60 * 1000, 20), (req, res) => {
  const user = findUserByEmail(req.user.email);
  if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
  const { errors, profile } = validateProfile(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ ok: false, error: 'Revisa los campos del formulario.', fields: errors });
  }
  const updated = updateUserProfile({ email: user.email, profile });
  let interests = [];
  try {
    interests = JSON.parse(updated.interests || '[]');
  } catch {
    interests = [];
  }
  res.json({
    ok: true,
    user: {
      id: updated.id,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      completedRegistration: !!updated.completed_registration,
      profile: {
        first_name: updated.first_name || '',
        last_name: updated.last_name || '',
        personal_email: updated.personal_email || '',
        edu_email: updated.edu_email || '',
        phone: updated.phone || '',
        address: updated.address || '',
        city: updated.city || '',
        state: updated.state || '',
        country: updated.country || '',
        birth_date: updated.birth_date || '',
        interests,
      },
    },
  });
});

app.get('/api/geo/countries', rateLimit(60 * 1000, 120), (req, res) => {
  res.json({ ok: true, countries: geo.listCountries() });
});

app.get('/api/geo/states', rateLimit(60 * 1000, 120), (req, res) => {
  const country = String(req.query.country || '').trim();
  if (!country) return res.status(400).json({ ok: false, error: 'Falta el parámetro country.' });
  res.json({ ok: true, states: geo.listStates(country) });
});

app.get('/api/geo/cities', rateLimit(60 * 1000, 120), (req, res) => {
  const country = String(req.query.country || '').trim();
  const state = String(req.query.state || '').trim();
  if (!country || !state) {
    return res.status(400).json({ ok: false, error: 'Faltan los parámetros country y state.' });
  }
  const q = String(req.query.q || '').trim();
  res.json({ ok: true, cities: geo.searchCities(country, state, q) });
});

function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Sesión no válida.' });
  const user = findUserByEmail(req.user.email);
  if (!user || user.status !== 'active' || user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Acceso denegado: se requieren privilegios de administrador.' });
  }
  req.admin = user;
  next();
}

app.get('/api/admin/users', authRequired, adminRequired, rateLimit(60 * 1000, 120), (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { total, rows } = listUsers({ search, status, limit, offset });
  res.json({ ok: true, total, limit, offset, users: rows });
});

app.post('/api/admin/users/:id/role', authRequired, adminRequired, rateLimit(60 * 1000, 60), (req, res) => {
  const id = parseInt(req.params.id, 10);
  const role = String(req.body.role || '');
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ ok: false, error: 'Rol inválido. Usa "user" o "admin".' });
  }
  if (id === req.admin.id) {
    return res.status(400).json({ ok: false, error: 'No puedes cambiar tu propio rol.' });
  }
  const target = findUserById(id);
  if (!target) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
  setUserRole(id, role);
  logAudit(req.admin.id, req.admin.email, 'user.role_change', {
    target_id: id,
    target_email: target.email,
    role,
  });
  res.json({ ok: true, message: 'Rol actualizado.' });
});

app.delete('/api/admin/users/:id', authRequired, adminRequired, rateLimit(60 * 1000, 60), (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.admin.id) {
    return res.status(400).json({ ok: false, error: 'No puedes eliminar tu propia cuenta.' });
  }
  const target = findUserById(id);
  if (!target) return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
  deleteUserById(id);
  logAudit(req.admin.id, req.admin.email, 'user.delete', { target_id: id, target_email: target.email });
  res.json({ ok: true, message: 'Usuario eliminado.' });
});

app.post('/api/admin/users/clear', authRequired, adminRequired, rateLimit(60 * 1000, 10), (req, res) => {
  const count = deleteAllUsers();
  logAudit(req.admin.id, req.admin.email, 'user.clear_all', { count });
  res.json({ ok: true, message: `${count} usuarios eliminados.` });
});

app.post('/api/admin/change-password', authRequired, adminRequired, rateLimit(60 * 1000, 10), async (req, res) => {
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  if (!current) return res.status(400).json({ ok: false, error: 'Escribe tu contraseña actual.' });
  if (next.length < 8) return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  if (next === current) return res.status(400).json({ ok: false, error: 'La nueva contraseña debe ser distinta de la actual.' });

  const admin = findUserByEmail(req.user.email);
  if (!admin) return res.status(404).json({ ok: false, error: 'Cuenta no encontrada.' });
  const ok = await bcrypt.compare(current, admin.password_hash);
  if (!ok) return res.status(400).json({ ok: false, error: 'La contraseña actual no es correcta.' });

  const passwordHash = await bcrypt.hash(next, 12);
  setUserPassword(admin.id, passwordHash);
  logAudit(admin.id, admin.email, 'admin.change_password', {});
  res.json({ ok: true, message: 'Contraseña actualizada correctamente.' });
});

app.post('/api/admin/users/reset-password', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  let isAuthorized = false;

  if (adminSecret && adminSecret === process.env.LICENSE_REGISTER_KEY) {
    isAuthorized = true;
  } else if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload && payload.role === 'admin' && payload.status === 'active') {
        isAuthorized = true;
      }
    } catch {}
  }

  if (!isAuthorized) {
    return res.status(403).json({ ok: false, error: 'No autorizado.' });
  }

  const email = String((req.body.email || '').trim().toLowerCase());
  const newPassword = String(req.body.new_password || '');

  if (!email || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ ok: false, error: 'Email y nueva contraseña (mínimo 6 caracteres) requeridos.' });
  }

  const user = findUserByEmail(email);
  if (!user) {
    return res.status(404).json({ ok: false, error: 'Usuario no encontrado.' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  setUserPassword(user.id, passwordHash);
  logAudit(null, 'system', 'user.admin_reset_password', { target_email: email, target_id: user.id });

  res.json({ ok: true, message: `Contraseña actualizada correctamente para ${email}.` });
});

app.post('/api/admin/licenses/clear', authRequired, adminRequired, rateLimit(60 * 1000, 10), (req, res) => {
  const count = deleteAllLicenses();
  logAudit(req.admin.id, req.admin.email, 'license.clear_all', { count });
  res.json({ ok: true, message: `${count} licencias eliminadas.` });
});

app.get('/api/admin/audit', authRequired, adminRequired, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  res.json({ ok: true, entries: listAudit(limit) });
});

const LICENSE_REGISTER_KEY = process.env.LICENSE_REGISTER_KEY || '';

/**
 * Compara dos secretos en tiempo constante.
 *
 * Un `===` corriente sale en cuanto encuentra el primer carácter distinto. Ese
 * tiempo, medido muchas veces, permite adivinar el secreto carácter a carácter
 * en vez de tener que probarlo entero. Se comparan los hashes SHA-256 para que
 * ambos lados midan siempre lo mismo y la propia longitud no filtre nada:
 * `timingSafeEqual` exige búferes del mismo tamaño y lanza si no lo son.
 */
function secretoCoincide(recibido, esperado) {
  if (typeof recibido !== 'string' || !esperado) return false;
  const a = crypto.createHash('sha256').update(recibido).digest();
  const b = crypto.createHash('sha256').update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}

function licenseRegisterAuthorized(req) {
  if (LICENSE_REGISTER_KEY && secretoCoincide(req.headers['x-license-register-key'], LICENSE_REGISTER_KEY)) {
    return { admin: null };
  }
  if (req.user) {
    const user = findUserByEmail(req.user.email);
    if (user && user.status === 'active' && user.role === 'admin') {
      return { admin: user };
    }
  }
  return null;
}

app.post('/api/licenses/register', optionalAuth, rateLimit(60 * 1000, 30), (req, res) => {  const auth = licenseRegisterAuthorized(req);
  if (!auth) {
    return res.status(403).json({ ok: false, error: 'Acceso denegado: se requiere clave de registro o cuenta de administrador.' });
  }
  const licenseKey = String((req.body.license_key || '').trim());
  const hwid = String((req.body.hwid || '').trim().toUpperCase());
  const capability = String(req.body.capability || 'dev_portal');
  if (!licenseKey) return res.status(400).json({ ok: false, error: 'Falta license_key.' });
  if (!hwid) return res.status(400).json({ ok: false, error: 'Falta hwid.' });
  if (!CAPS.includes(capability)) {
    return res.status(400).json({ ok: false, error: `Capability inválida: usa ${CAPS.join(", ")}.` });
  }
  const durationDays = req.body.duration_days ? parseInt(req.body.duration_days, 10) : null;
  const uptimeLimit = req.body.uptime_limit ? parseInt(req.body.uptime_limit, 10) : 0;
  const expiresAt = String(req.body.expires_at || 'UNLIMITED');
  const contactEmail = String((req.body.contact_email || '').trim().toLowerCase()) || null;
  const notes = String(req.body.notes || '').trim() || null;

  const license = registerLicense({
    licenseKey, hwid, capability, durationDays, uptimeLimit,
    expiresAt, contactEmail, notes,
  });
  logAudit(auth.admin ? auth.admin.id : null, auth.admin ? auth.admin.email : null, 'license.register', {
    license_key: licenseKey, hwid, capability, contact_email: contactEmail,
  });
  res.json({ ok: true, license });
});

app.post('/api/licenses/validate', rateLimit(60 * 1000, 300), (req, res) => {
  const licenseKey = String((req.body.license_key || req.body.licenseKey || '').trim());
  let hwid = String((req.body.hwid || '').trim().toUpperCase());
  const reqEmail = String((req.body.email || '').trim().toLowerCase());

  if (!licenseKey) return res.status(400).json({ ok: false, error: 'Falta license_key.' });

  if (!hwid && licenseKey) {
    try {
      const parts = licenseKey.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload && (payload.hw || payload.hwid)) {
          hwid = String(payload.hw || payload.hwid).toUpperCase();
        }
      }
    } catch (e) {}
  }
  if (!hwid) hwid = 'WEB_BROWSER_CLIENT';

  const license = findLicenseByKey(licenseKey);
  if (!license) {
    return res.json({ ok: true, valid: false, status: 'not_found', reason: 'La licencia no está registrada en el servidor.' });
  }

  if (license.status === 'revoked') {
    logAudit(null, null, 'license.validate_rejected', { license_key: licenseKey, reason: 'revoked', hwid });
    return res.json({ ok: true, valid: false, status: 'revoked', reason: 'La licencia fue revocada por el administrador.' });
  }
  if (license.status !== 'active') {
    return res.json({ ok: true, valid: false, status: license.status || 'inactive', reason: 'La licencia no está activa.' });
  }
  const isWebClient = req.body.is_web_client ||
                      req.body.client_type === 'web' ||
                      hwid.startsWith('OMNI-HW-WEB') ||
                      hwid === 'WEB_BROWSER_CLIENT' ||
                      req.headers['x-client-platform'] === 'web' ||
                      (req.headers.referer && req.headers.referer.includes('/downloads/')) ||
                      (req.headers.origin && req.headers.origin.includes('fenixdev.cloud'));
  const emailMatches = license.contact_email && reqEmail && license.contact_email.trim().toLowerCase() === reqEmail;

  if (license.hwid && license.hwid !== hwid && !isWebClient && !emailMatches) {
    logAudit(null, null, 'license.validate_rejected', { license_key: licenseKey, reason: 'hwid_mismatch', hwid, expected_hwid: license.hwid });
    return res.json({ ok: true, valid: false, status: 'hwid_mismatch', reason: 'La licencia está vinculada a otro equipo.' });
  }
  if (license.contact_email && reqEmail && license.contact_email.trim().toLowerCase() !== reqEmail) {
    logAudit(null, null, 'license.validate_rejected', { license_key: licenseKey, reason: 'email_mismatch', email: reqEmail, expected_email: license.contact_email });
    return res.json({ ok: true, valid: false, status: 'email_mismatch', reason: 'La licencia está vinculada a otra cuenta de correo.' });
  }

  // AQUI EMPIEZA A CORRER EL RELOJ, y aqui se lleva la cuenta.
  //
  // La primera validacion de una licencia es su activacion: se sella la fecha y
  // se calcula el fin real. Antes la caducidad se decidia con `expires_at`, que
  // se clavaba al GENERAR -una licencia de un dia emitida ayer nacia consumida-
  // y el credito de uso se contaba en un fichero del equipo del cliente, que
  // desaparecia al desinstalar y reiniciaba el contador.
  //
  // `minutes_used` es lo que la aplicacion ha consumido desde el ultimo aviso.
  // Solo descuenta en las licencias de tipo `usage` -las demos-, donde lo que
  // se vende es tiempo de uso y no dias de calendario.
  const actualizada = activarLicencia(licenseKey, Number(req.body.minutes_used) || 0) || license;
  const estado = estadoLicencia(actualizada);

  if (!estado.valid) {
    logAudit(null, null, 'license.validate_rejected', {
      license_key: licenseKey, reason: estado.reason, hwid,
    });
    return res.json({
      ok: true,
      valid: false,
      status: 'expired',
      reason:
        estado.reason === 'expired_usage'
          ? 'La licencia agotó su tiempo de uso.'
          : 'La licencia ha expirado.',
      estado,
    });
  }

    let licenseMods = [];
    if (Array.isArray(license.mods)) {
      licenseMods = license.mods;
    } else if (typeof license.mods === 'string') {
      try { licenseMods = JSON.parse(license.mods); } catch { licenseMods = []; }
    } else if (license.license_key) {
      try {
        const payload = JSON.parse(Buffer.from(license.license_key.split('.')[0], 'base64').toString('utf8'));
        licenseMods = Array.isArray(payload.mods) ? payload.mods : [];
      } catch {
        licenseMods = [];
      }
    }

    res.json({
      ok: true,
      valid: true,
      status: 'valid',
      // Lo que la aplicacion debe MOSTRAR. Deja de calcularlo ella: el reloj es
      // este, y asi las dos pantallas no pueden decir cosas distintas.
      estado,
      license: {
        license_key: license.license_key,
        capability: license.capability,
        status: license.status,
        hwid: license.hwid,
        expires_at: estado.expires_at,
        activated_at: estado.activated_at,
        billing_mode: estado.billing_mode,
        days_left: estado.days_left,
        minutes_left: estado.minutes_left,
        registered_at: license.registered_at,
        mods: licenseMods,
      },
    });
});

app.get('/api/admin/license-durations', authRequired, adminRequired, rateLimit(60 * 1000, 60), (req, res) => {
  // `modules` viaja junto a las duraciones para que el panel pinte las casillas
  // de modulos sin llevar la lista escrita a mano en el HTML.
  res.json({ ok: true, durations: DURATIONS, modules: MODULES });
});

app.post('/api/admin/licenses/generate', optionalAuth, rateLimit(60 * 1000, 30), (req, res) => {
  const auth = licenseRegisterAuthorized(req);
  if (!auth) {
    return res.status(403).json({ ok: false, error: 'Acceso denegado: se requiere clave de registro o cuenta de administrador.' });
  }
  const targetType = String(req.body.target_type || req.body.license_type || 'desktop').toLowerCase();
  let hwid = String((req.body.hwid || '').trim().toUpperCase());
  const durationKey = String(req.body.duration || '');
  const capability = String(req.body.capability || 'full');

  // Cuenta del CLIENTE a la que se ata la licencia. Es obligatoria si se envia:
  // una licencia sin cuenta no se puede reclamar ni controlar, asi que se
  // prefiere ABORTAR la emision antes que crear una huerfana. Se comprueba
  // ANTES de firmar nada, para no dejar una clave emitida a medias.
  const clientEmail = String((req.body.client_email || '').trim().toLowerCase());
  let cliente = null;
  if (clientEmail) {
    cliente = findUserByEmail(clientEmail);
    if (!cliente) {
      return res.status(404).json({
        ok: false,
        error: `No hay ninguna cuenta registrada con ${clientEmail}. El cliente debe crearla en la aplicación antes de emitir su licencia.`,
      });
    }
  }

  const contactEmail = String((req.body.contact_email || '').trim().toLowerCase()) || null;
  const targetEmail = (cliente ? cliente.email : null) || contactEmail;

  if (targetType === 'web' || !hwid) {
    if (!targetEmail) {
      return res.status(400).json({ ok: false, error: 'Para emitir una licencia Web se requiere seleccionar el usuario o su correo electrónico.' });
    }
    hwid = `WEB-${targetEmail.toUpperCase()}`;
  }

  if (!hwid) return res.status(400).json({ ok: false, error: 'Falta hwid o correo del usuario Web.' });
  // `resolveDuration` y no `DURATIONS[...]`: admite los cinco escalones de
  // siempre y ademas un numero de dias a medida.
  const duracion = resolveDuration(durationKey);
  if (!duracion) {
    return res.status(400).json({ ok: false, error: 'Duración inválida: usa 1-5 o un número de días (1-36500).' });
  }
  if (!CAPS.includes(capability)) {
    return res.status(400).json({ ok: false, error: `Capability inválida: usa ${CAPS.join(", ")}.` });
  }

  // Modulos premium sueltos, ademas de lo que conceda `capability`. Se admite
  // array o cadena separada por comas, porque el panel manda una cosa y los
  // scripts de linea de comandos la otra.
  const mods = Array.isArray(req.body.mods)
    ? req.body.mods
    : String(req.body.mods || '')
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);

  let generated;
  try {
    generated = generateLicense(hwid, durationKey, capability, mods, targetEmail);
  } catch (err) {
    // 400 y no 500: un modulo inexistente es un error de quien pide, y
    // devolver 500 haria pensar que el servidor esta averiado.
    const esDeEntrada = /Módulo desconocido|Cap inválida|Duración inválida/.test(err.message);
    return res.status(esDeEntrada ? 400 : 500).json({ ok: false, error: err.message });
  }
  const notes = String(req.body.notes || '').trim() || null;

  const license = registerLicense({
    licenseKey: generated.token,
    hwid,
    capability,
    durationDays: generated.durationDays,
    uptimeLimit: generated.uptimeLimit,
    expiresAt: generated.payload.exp,
    contactEmail: targetEmail,
    notes: notes || 'Generada desde el panel de administración',
    // Las demos se venden por tiempo de uso; el resto, por calendario.
    billingMode: String(req.body.billing_mode || '').toLowerCase() === 'usage' ? 'usage' : 'calendar',
  });

  // Se ata a la cuenta del cliente. Asi la licencia se puede reclamar desde la
  // aplicacion y aparece en su ficha, en vez de quedar suelta atada solo a un
  // numero de serie de maquina.
  if (cliente) {
    linkLicenseToUser(generated.token, cliente.id);
  }

  logAudit(auth.admin ? auth.admin.id : null, auth.admin ? auth.admin.email : null, 'license.generate', {
    license_key: generated.token.slice(0, 24) + '…',
    hwid, capability, duration: durationKey, contact_email: contactEmail,
    mods, client_email: cliente ? cliente.email : null,
  });

  // AVISO DE EMISION.
  //
  // Hasta ahora se emitia una licencia y el cliente no se enteraba por ningun
  // canal: habia que pasarle la clave a mano. Se envia con lo que necesita para
  // saber que compro y como se le cuenta el tiempo.
  //
  // No bloquea la respuesta: si el SMTP falla, la licencia YA esta emitida y
  // registrada, y perderla por un fallo de correo seria mucho peor que no
  // avisar. Queda constancia en la auditoria.
  const destino = contactEmail || (cliente ? cliente.email : null);
  if (destino) {
    const modoCobro = String(req.body.billing_mode || '').toLowerCase() === 'usage' ? 'usage' : 'calendar';
    const esLicenciaWeb = targetType === 'web' || hwid.startsWith('WEB-');
    const asunto = esLicenciaWeb ? 'Omni-IA Game — Tu licencia Web está lista' : 'Omni-IA Game — Tu licencia de Escritorio está lista';
    sendLicenseEmail(
      destino,
      asunto,
      buildIssueHtml({
        nombreCliente: cliente ? (cliente.first_name || null) : null,
        cuenta: cliente ? cliente.email : destino,
        producto: CAPS_ETIQUETA[capability] || capability,
        licenseKey: generated.token,
        hwid,
        duracionEtiqueta: generated.durationDays
          ? `${generated.durationDays} día${generated.durationDays === 1 ? '' : 's'}`
          : 'Perpetua (sin caducidad)',
        modoCobro,
        emitidaEn: new Date().toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }),
        modulos: (mods && mods.length) ? mods.join(', ') : null,
        appDomain: (process.env.APP_DOMAIN || '').replace(/^https?:\/\//, ''),
        targetType: targetType || (esLicenciaWeb ? 'web' : 'hwid'),
      }),
    )
      .then(() => logAudit(null, null, 'license.issue_email_sent', { to: destino, hwid }))
      .catch((e) =>
        logAudit(null, null, 'license.issue_email_failed', { to: destino, hwid, error: String(e.message || e) }),
      );
  }
  res.json({
    ok: true,
    token: generated.token,
    license,
    client: cliente ? { id: cliente.id, email: cliente.email } : null,
  });
});

app.get('/api/admin/licenses', authRequired, adminRequired, rateLimit(60 * 1000, 120), (req, res) => {  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const { total, rows } = listLicenses({ search, status, limit, offset });
  res.json({ ok: true, total, limit, offset, licenses: rows });
});

app.post('/api/admin/licenses/:key/revoke', authRequired, adminRequired, rateLimit(60 * 1000, 60), (req, res) => {
  const key = String(req.params.key || '').trim();
  const license = findLicenseByKey(key);
  if (!license) return res.status(404).json({ ok: false, error: 'Licencia no encontrada.' });
  const updated = updateLicenseStatus(key, 'revoked');
  logAudit(req.admin.id, req.admin.email, 'license.revoke', { license_key: key, hwid: updated.hwid });
  res.json({ ok: true, message: 'Licencia revocada.', license: updated });
});

const handleRenewLicense = (req, res) => {
  const auth = licenseRegisterAuthorized(req);
  if (!auth) {
    return res.status(403).json({ ok: false, error: 'Acceso denegado: se requiere clave de registro o cuenta de administrador.' });
  }

  const key = String(req.body.license_key || req.params.key || req.params[0] || '').trim();
  let lic = findLicenseByKey(key);
  if (!lic && key) {
    const all = listLicenses({ limit: 1000 }).licenses;
    lic = all.find((l) => l.license_key === key || l.license_key.startsWith(key.slice(0, 30)));
  }

  if (!lic) return res.status(404).json({ ok: false, error: 'Licencia no encontrada.' });

  const targetKey = lic.license_key;
  const targetHwid = String(req.body.hwid || '').trim().toUpperCase() || lic.hwid;
  const durationKey = req.body.duration !== undefined ? req.body.duration : (req.body.duration_days || '2');
  const capability = String(req.body.capability || lic.capability || 'dev_portal');
  const mods = Array.isArray(req.body.mods) ? req.body.mods : undefined;

  let generated;
  try {
    generated = generateLicense(targetHwid, durationKey, capability, mods);
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }

  let renewed;
  try {
    renewed = renewLicense({
      licenseKey: targetKey,
      newLicenseKey: generated.token,
      hwid: targetHwid,
      capability,
      durationDays: generated.durationDays,
      expiresAt: generated.payload.exp,
      uptimeLimit: generated.uptimeLimit,
      notes: req.body.notes || `Renovada el ${new Date().toISOString().slice(0, 10)}`,
      billingMode: req.body.billing_mode || lic.billing_mode || 'calendar',
    });
  } catch (err) {
    console.error('[license.renew] Error renovando licencia:', err);
    return res.status(400).json({ ok: false, error: `Error renovando licencia: ${err.message}` });
  }

  logAudit(auth.admin ? auth.admin.id : null, auth.admin ? auth.admin.email : null, 'license.renew', {
    old_license_key: targetKey.slice(0, 24) + '…',
    new_license_key: generated.token.slice(0, 24) + '…',
    hwid: targetHwid,
    duration: durationKey,
  });

  const emailDestino = lic.contact_email || req.body.contact_email;
  if (emailDestino) {
    const htmlEmail = buildRenewalHtml({
      hwid: targetHwid,
      licenseKey: generated.token,
      durationEtiqueta: durationKey === '5' ? 'Perpetua' : `${generated.durationDays || '—'} días`,
      contactEmail: emailDestino,
      appDomain: process.env.APP_DOMAIN || 'fenixdev.cloud',
    });
    sendLicenseEmail(emailDestino, 'Omni-IA Game — Licencia Renovada', htmlEmail).catch(err => {
      console.error('[license.renew] Error enviando correo de renovación:', err);
    });
  }

  res.json({
    ok: true,
    message: 'Licencia renovada exitosamente.',
    token: generated.token,
    license: renewed,
  });
};

app.post('/api/admin/licenses/renew', optionalAuth, rateLimit(60 * 1000, 30), handleRenewLicense);
app.post('/api/admin/licenses/:key/renew', optionalAuth, rateLimit(60 * 1000, 30), handleRenewLicense);
app.post(/^\/api\/admin\/licenses\/(.+)\/renew$/, optionalAuth, rateLimit(60 * 1000, 30), handleRenewLicense);

app.delete('/api/admin/licenses/:key', authRequired, adminRequired, rateLimit(60 * 1000, 60), (req, res) => {
  const key = String(req.params.key || '').trim();
  const license = findLicenseByKey(key);
  if (!license) return res.status(404).json({ ok: false, error: 'Licencia no encontrada.' });
  deleteLicenseByKey(key);
  logAudit(req.admin.id, req.admin.email, 'license.delete', { license_key: key, hwid: license.hwid });
  res.json({ ok: true, message: 'Licencia eliminada.' });
});

app.use((err, req, res, next) => {
  console.error('[server]', err);
  res.status(500).json({ ok: false, error: err.message || 'Error interno del servidor.' });
});

const HOST = process.env.HOST || '127.0.0.1';

async function bootstrapAdmin() {
  const email = String(process.env.ADMIN_BOOTSTRAP_EMAIL || 'admin@fenixdev.cloud').trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || 'OmniAdmin2026Secure!';
  if (!email || !password) return;
  if (!EMAIL_RE.test(email)) {
    console.warn('[admin] ADMIN_BOOTSTRAP_EMAIL no es un correo válido; no se creó la cuenta admin.');
    return;
  }
  if (password.length < 10) {
    console.warn('[admin] ADMIN_BOOTSTRAP_PASSWORD debe tener al menos 10 caracteres; no se creó la cuenta admin.');
    return;
  }
  const existing = findUserByEmail(email);
  if (existing) {
    if (existing.role !== 'admin') {
      promoteToAdmin(email);
      logAudit(null, null, 'admin.bootstrap', { email, action: 'promoted' });
      console.log(`[admin] Usuario existente promovido a administrador: ${email}`);
    }
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  createAdmin({ email, passwordHash });
  logAudit(null, null, 'admin.bootstrap', { email, action: 'created' });
  console.log(`[admin] Cuenta de administrador creada: ${email}`);
}

// --- OmniDeploy: proveedor de GPU remota -----------------------------------
// Router propio, montado con estas lineas y nada mas. Quitarlo es quitarlas.
// Su base de datos es otra (`omnideploy.db`), de modo que un fallo suyo no
// puede tocar cuentas ni licencias, y `OMNIDEPLOY_ENABLED=false` lo apaga sin
// afectar al login. Es una funcion experimental conviviendo con la pieza
// critica del negocio porque en hosting compartido no hay un segundo proceso.
const omnideploy = require('./omnideploy');
app.use('/api/omnideploy', rateLimit(60 * 1000, 240), omnideploy.router);
app.use(
  '/api/admin/omnideploy',
  omnideploy.rutasAdmin({
    authRequired,
    adminRequired,
    logAudit,
    // El relay no importa el mailer: se le pasa, para que siga pudiendo
    // llevarse a otro servidor sin arrastrar medio auth-server detras.
    enviarCorreo: sendLicenseEmail,
    plantillaClave: buildOmniDeployKeyHtml,
    // La MISMA tabla de duraciones que las licencias.
    resolverDuracion: resolveDuration,
  }),
);

async function start() {
  await bootstrapAdmin();
  startReminders();
  app.listen(PORT, HOST, () => {
    console.log(`Omni-IA Auth Server escuchando en http://${HOST}:${PORT}`);
  });
}

start();
