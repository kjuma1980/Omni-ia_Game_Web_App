'use strict';

/**
 * Rutas de OmniDeploy: proveedor de GPU remota.
 *
 * Router propio, montado desde `server.js` con UNA linea. Quitarlo es quitar
 * esa linea. Esto no es estetica: el servidor de licencias y el login son lo
 * critico del negocio, y esto es una funcion experimental que mueve binarios
 * grandes y mantiene peticiones abiertas 25 segundos. Comparten proceso porque
 * en hosting compartido no hay otra, pero no comparten ni fichero de base de
 * datos ni superficie de codigo.
 *
 * `OMNIDEPLOY_ENABLED=false` apaga las rutas sin tocar nada mas.
 */

const express = require('express');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const { db, vigenciaCliente } = require('./db');
const cola = require('./cola');
const almacen = require('./almacen');

const router = express.Router();

const ACTIVO = String(process.env.OMNIDEPLOY_ENABLED ?? 'true').toLowerCase() !== 'false';
/** Clave maestra del dueno: autoriza el auto-registro de agentes. */
const MASTER_KEY = process.env.OMNIDEPLOY_MASTER_KEY || '';
/** Segundos sin sondear tras los cuales se considera al agente caido. */
const CAIDO_TRAS_MS = 60_000;

function hash(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

/**
 * Compara secretos en tiempo constante.
 *
 * Mismo motivo que en `licenseRegisterAuthorized`: un `===` sale en el primer
 * caracter distinto y ese tiempo, medido, deja adivinar el secreto por partes.
 */
function coincide(recibido, esperado) {
  if (typeof recibido !== 'string' || !esperado) return false;
  return crypto.timingSafeEqual(
    Buffer.from(hash(recibido), 'hex'),
    Buffer.from(hash(esperado), 'hex'),
  );
}

function ahora() {
  return Date.now();
}

// Todas las rutas pasan por aqui: si el modulo esta apagado, no existe.
router.use((req, res, next) => {
  if (!ACTIVO) {
    return res.status(503).json({ ok: false, error: 'OmniDeploy esta desactivado en este servidor.' });
  }
  next();
});

// --------------------------------------------------------------- agentes ---

/**
 * Auto-registro del agente del host.
 *
 * Queda en `pending`: el dueno lo aprueba desde el panel. Registrarse no
 * concede nada, solo pide turno.
 */
router.post('/devices/register', (req, res) => {
  if (!MASTER_KEY) {
    return res.status(503).json({ ok: false, error: 'El servidor no tiene clave maestra configurada.' });
  }
  if (!coincide(req.body?.masterKey, MASTER_KEY)) {
    return res.status(403).json({ ok: false, error: 'Clave maestra invalida.' });
  }

  const nombre = String(req.body?.friendlyName || 'Host sin nombre').slice(0, 80);
  const deviceId = randomUUID();
  const deviceToken = crypto.randomBytes(32).toString('base64url');

  db.prepare(
    `INSERT INTO omnideploy_devices (device_id, device_token_hash, friendly_name, status, created_at)
     VALUES (?, ?, ?, 'pending', ?)`,
  ).run(deviceId, hash(deviceToken), nombre, ahora());

  // El token se devuelve UNA sola vez: despues solo se guarda su hash.
  res.json({ ok: true, deviceId, deviceToken, status: 'pending' });
});

/** Autentica al agente por su token. Devuelve el dispositivo o `null`. */
function agenteDe(req) {
  const cabecera = req.headers['x-device-token'];
  const token = Array.isArray(cabecera) ? null : cabecera;
  if (!token) return null;
  const fila = db.prepare('SELECT * FROM omnideploy_devices WHERE device_token_hash = ?').get(hash(token));
  return fila && fila.status !== 'revoked' ? fila : null;
}

/**
 * El agente pregunta si su registro ya fue aprobado.
 *
 * Mientras esta `pending` no puede sondear trabajos, pero si necesita saber
 * cuando le toca, para no quedarse reintentando a ciegas.
 */
router.get('/devices/me', (req, res) => {
  const dev = agenteDe(req);
  if (!dev) return res.status(401).json({ ok: false, error: 'Dispositivo no reconocido.' });
  res.json({
    ok: true,
    deviceId: dev.device_id,
    status: dev.status,
    deploymentId: dev.deployment_id,
    friendlyName: dev.friendly_name,
  });
});

// ---------------------------------------------------------------- sondeo ---

/**
 * Sondeo largo del agente.
 *
 * Espera hasta 25 s a que haya trabajo. Devolver 204 es lo normal, no un fallo.
 *
 * Sustituye al WebSocket del plan original por un motivo concreto: en hosting
 * compartido el proceso se duerme, y una conexion persistente muerta no se
 * entera de nada mientras que una peticion nueva lo despierta. De regalo, el
 * propio sondeo hace de keep-alive.
 */
router.get('/agent/poll', async (req, res) => {
  const dev = agenteDe(req);
  if (!dev) return res.status(401).json({ ok: false, error: 'Dispositivo no reconocido.' });
  if (dev.status !== 'active' || !dev.deployment_id) {
    return res.status(403).json({ ok: false, error: 'Dispositivo pendiente de aprobacion.', status: dev.status });
  }

  db.prepare('UPDATE omnideploy_devices SET last_seen_at = ? WHERE device_id = ?').run(ahora(), dev.device_id);

  // Se aprovecha el sondeo para limpiar. Sin cron que configurar ni que falle.
  try {
    cola.purgarCaducados();
  } catch {
    // La limpieza nunca debe impedir que el agente reciba trabajo.
  }

  const trabajo = await cola.esperarTrabajo(dev.deployment_id);
  if (!trabajo) {
    return res.status(204).end();
  }
  res.json({ ok: true, jobId: trabajo.job_id, inputs: JSON.parse(trabajo.inputs) });
});

/** El agente entrega el resultado. */
router.post('/agent/result', (req, res) => {
  const dev = agenteDe(req);
  if (!dev || dev.status !== 'active') {
    return res.status(401).json({ ok: false, error: 'Dispositivo no reconocido.' });
  }

  const jobId = String(req.body?.jobId || '');
  const trabajo = cola.obtener(jobId);
  if (!trabajo) return res.status(404).json({ ok: false, error: 'Trabajo desconocido.' });
  if (trabajo.deployment_id !== dev.deployment_id) {
    return res.status(403).json({ ok: false, error: 'Ese trabajo no es de este dispositivo.' });
  }

  if (req.body?.status === 'success') {
    let guardados;
    try {
      guardados = almacen.guardar(jobId, req.body.files || []);
    } catch (e) {
      cola.terminar(jobId, { status: 'failed', error: e.message });
      return res.status(413).json({ ok: false, error: e.message });
    }
    cola.terminar(jobId, { status: 'success', outputs: guardados });
    return res.json({ ok: true });
  }

  cola.terminar(jobId, { status: 'failed', error: String(req.body?.error || 'Error sin detallar') });
  res.json({ ok: true });
});

// --------------------------------------------------- cliente (la aplicacion) ---

/** Autentica a la aplicacion por deploymentId + apiKey. */
/**
 * Autentica a la aplicacion por deploymentId + apiKey.
 *
 * La clave se busca en la tabla de CLIENTES, no en la del dispositivo: cada
 * cliente tiene la suya y se revoca por separado. Devuelve `{dispositivo,
 * cliente}` para que quien llame pueda anotar a quien atribuir el trabajo.
 *
 * Se conserva la comprobacion contra el dispositivo por compatibilidad con las
 * credenciales emitidas antes de que existieran los clientes: seguirian
 * funcionando en lugar de dejar a alguien fuera sin avisar.
 */
function despliegueDe(body) {
  const deploymentId = String(body?.deploymentId || '');
  const apiKey = String(body?.apiKey || '');
  if (!deploymentId || !apiKey) return null;

  const dispositivo = db
    .prepare("SELECT * FROM omnideploy_devices WHERE deployment_id = ? AND status = 'active'")
    .get(deploymentId);
  if (!dispositivo) return null;

  const recibido = Buffer.from(hash(apiKey), 'hex');
  const coincideCon = (h) => Boolean(h) && crypto.timingSafeEqual(recibido, Buffer.from(h, 'hex'));

  const cliente = db
    .prepare("SELECT * FROM omnideploy_clients WHERE deployment_id = ? AND status = 'active'")
    .all(deploymentId)
    .find((c) => coincideCon(c.api_key_hash));

  if (cliente) {
    // LA CLAVE CADUCA, como caduca una licencia: da acceso a la GPU de otra
    // persona. El reloj arranca en el PRIMER USO -aqui-, no al emitirla, para
    // que una clave entregada tarde no llegue ya gastada. Sin `duration_days`
    // no caduca nunca.
    const v = vigenciaCliente(cliente);
    if (!v.vigente) return null;
    return { ...dispositivo, cliente, vigencia: v };
  }

  // Credencial antigua, anterior a la separacion por cliente.
  if (coincideCon(dispositivo.api_key_hash)) {
    return { ...dispositivo, cliente: null };
  }

  return null;
}

/**
 * ¿Esta el agente vivo?
 *
 * Dos formas de estarlo, y la segunda hace falta:
 *
 *   1. Sondeo reciente. Mas de un minuto sin preguntar se considera caido.
 *   2. TRABAJANDO. Mientras genera no sondea —una imagen son unos 90 s y la
 *      ventana es de 60—, asi que el dispositivo aparecia DESCONECTADO
 *      justo mientras hacia su trabajo: la aplicacion decia "la GPU esta
 *      apagada" y un segundo encargo se rechazaba. Con texto es peor, porque
 *      un modelo grande pasa de los tres minutos.
 *
 * `trabajoEnCurso` acota por tiempo, de modo que un agente que muera a mitad
 * deja de contar como vivo en cuanto su trabajo pasa de lo razonable.
 */
function estaEnLinea(dev) {
  if (dev.last_seen_at && ahora() - dev.last_seen_at < CAIDO_TRAS_MS) return true;
  return Boolean(dev.deployment_id && cola.trabajoEnCurso(dev.deployment_id));
}

/**
 * Estado del proveedor, para que la aplicacion pueda decir "GPU no disponible"
 * en vez de dejar al usuario esperando un resultado que no va a llegar.
 */
router.post('/status', (req, res) => {
  const dev = despliegueDe(req.body);
  if (!dev) return res.status(401).json({ ok: false, error: 'Credenciales invalidas.' });
  res.json({
    ok: true,
    online: estaEnLinea(dev),
    // Ocupada no es lo mismo que apagada, y confundirlas hace que el usuario
    // crea que algo va mal cuando solo tiene que esperar su turno.
    busy: Boolean(dev.deployment_id && cola.trabajoEnCurso(dev.deployment_id)),
    queue_depth: cola.pendientes(dev.deployment_id).length,
    friendly_name: dev.friendly_name,
  });
});

/** Encola un trabajo. */
router.post('/queue', (req, res) => {
  const dev = despliegueDe(req.body);
  if (!dev) return res.status(401).json({ ok: false, error: 'Credenciales invalidas.' });

  if (!estaEnLinea(dev)) {
    return res.status(503).json({
      ok: false,
      error: 'La GPU del proveedor no esta disponible ahora mismo.',
      online: false,
    });
  }

  // Se anota quien encola: sin esto no hay forma de saber que cliente consumio
  // la GPU, que es medio motivo de separar las claves.
  if (dev.cliente) {
    db.prepare(
      'UPDATE omnideploy_clients SET jobs_count = jobs_count + 1, last_used_at = ? WHERE client_id = ?',
    ).run(ahora(), dev.cliente.client_id);
  }

  const r = cola.encolar(dev.deployment_id, req.body?.inputs, dev.cliente?.client_id ?? null);
  if (r.error === 'cola_llena') {
    return res.status(429).json({
      ok: false,
      error: `Hay ${r.posicion} trabajos por delante. Intentalo en unos minutos.`,
      queue_depth: r.posicion,
    });
  }
  res.json({ ok: true, job_id: r.jobId, position: r.posicion });
});

/** Consulta del estado de un trabajo. */
router.post('/jobs/:id', (req, res) => {
  const dev = despliegueDe(req.body);
  if (!dev) return res.status(401).json({ ok: false, error: 'Credenciales invalidas.' });

  const t = cola.obtener(req.params.id);
  if (!t || t.deployment_id !== dev.deployment_id) {
    return res.status(404).json({ ok: false, error: 'Trabajo desconocido.' });
  }
  res.json({
    ok: true,
    status: t.status,
    outputs: t.outputs ? JSON.parse(t.outputs) : [],
    error: t.error,
    position: t.status === 'pending'
      ? cola.pendientes(dev.deployment_id).findIndex((p) => p.job_id === t.job_id) + 1
      : 0,
  });
});

/** Cancelación explícita de un trabajo por parte del usuario. */
router.post('/jobs/:id/cancel', (req, res) => {
  const dev = despliegueDe(req.body);
  if (!dev) return res.status(401).json({ ok: false, error: 'Credenciales invalidas.' });

  const t = cola.obtener(req.params.id);
  if (!t || t.deployment_id !== dev.deployment_id) {
    return res.status(404).json({ ok: false, error: 'Trabajo desconocido.' });
  }

  cola.cancelar(req.params.id);
  res.json({ ok: true, message: 'Trabajo cancelado con éxito.' });
});

/**
 * Descarga de un fichero de resultado.
 *
 * POST y no GET porque las credenciales viajan en el cuerpo: una `apiKey` en la
 * cadena de consulta acabaria en los registros del servidor y del proxy.
 */
function entregarFichero(req, res, nombre) {
  const dev = despliegueDe(req.body);
  if (!dev) return res.status(401).json({ ok: false, error: 'Credenciales invalidas.' });

  const t = cola.obtener(req.params.id);
  if (!t || t.deployment_id !== dev.deployment_id) {
    return res.status(404).json({ ok: false, error: 'Trabajo desconocido.' });
  }
  const bytes = almacen.leer(req.params.id, nombre);
  if (!bytes) return res.status(404).json({ ok: false, error: 'Fichero no encontrado.' });

  // El tipo lo declaro el agente al entregar; si no viene, se deduce del
  // nombre. Asi el cliente no tiene que adivinar si un .bin es audio o malla.
  const declarado = (t.outputs ? JSON.parse(t.outputs) : []).find((o) => o.name === nombre);

  // En base64 porque la aplicacion lo recibe a traves de `proxy_request`, que
  // devuelve texto.
  res.json({
    ok: true,
    name: nombre,
    kind: declarado?.kind ?? null,
    mime: declarado?.mime ?? null,
    data: bytes.toString('base64'),
  });
}

/**
 * Descarga por NOMBRE EN EL CUERPO, no en la ruta.
 *
 * Es la buena, y existe por un fallo medido: con el nombre en la URL la
 * peticion terminaba en `.png`, y el servidor web del hosting la interceptaba
 * como fichero estatico —404 de una linea, `text/plain`— sin que Node llegara a
 * verla nunca. La imagen se generaba, se entregaba al relay y se perdia en el
 * ultimo tramo.
 *
 * De paso evita el otro problema de tener la extension en la URL: el proxy
 * nativo de la aplicacion decide si una respuesta es binaria mirando tambien la
 * URL, y devolvia el JSON envuelto en una data URL.
 */
router.post('/jobs/:id/file', (req, res) => {
  const nombre = String(req.body?.name || '');
  if (!nombre) return res.status(400).json({ ok: false, error: 'Falta el nombre del fichero.' });
  return entregarFichero(req, res, nombre);
});

/** Ruta antigua, con el nombre en la URL. Se conserva por compatibilidad. */
router.post('/jobs/:id/files/:name', (req, res) => entregarFichero(req, res, req.params.name));

/**
 * Monta las rutas de administracion.
 *
 * Se pasan desde `server.js` porque los middlewares de sesion viven alli; este
 * modulo no debe conocer el sistema de cuentas.
 */
/**
 * @param enviarCorreo  funcion de envio, inyectada por `server.js`.
 * @param plantillaClave  plantilla del correo de credenciales.
 *
 * Se inyectan en vez de importar el mailer aqui para no acoplar el relay al
 * resto del servidor: si manana OmniDeploy se muda a un VPS, este fichero se
 * lleva tal cual y solo cambia quien le pasa estas dos funciones.
 */
function rutasAdmin({ authRequired, adminRequired, logAudit, enviarCorreo, plantillaClave, resolverDuracion }) {
  const admin = express.Router();

  admin.get('/devices', authRequired, adminRequired, (req, res) => {
    const filas = db.prepare('SELECT * FROM omnideploy_devices ORDER BY created_at DESC').all();
    res.json({
      ok: true,
      devices: filas.map((d) => ({
        device_id: d.device_id,
        friendly_name: d.friendly_name,
        status: d.status,
        deployment_id: d.deployment_id,
        online: estaEnLinea(d),
        last_seen_at: d.last_seen_at,
        created_at: d.created_at,
        authorized_at: d.authorized_at,
      })),
    });
  });

  /** El dueno aprueba un agente: se emiten deploymentId y apiKey. */
  admin.post('/devices/:id/authorize', authRequired, adminRequired, (req, res) => {
    const dev = db.prepare('SELECT * FROM omnideploy_devices WHERE device_id = ?').get(req.params.id);
    if (!dev) return res.status(404).json({ ok: false, error: 'Dispositivo desconocido.' });
    if (dev.status === 'active') {
      return res.status(409).json({ ok: false, error: 'Ese dispositivo ya estaba aprobado.' });
    }

    const deploymentId = `omni_${crypto.randomBytes(9).toString('hex')}`;
    const apiKey = crypto.randomBytes(32).toString('base64url');

    db.prepare(
      `UPDATE omnideploy_devices
       SET status = 'active', deployment_id = ?, api_key_hash = ?, authorized_at = ?
       WHERE device_id = ?`,
    ).run(deploymentId, hash(apiKey), ahora(), dev.device_id);

    logAudit?.(req.admin?.id ?? null, req.admin?.email ?? null, 'omnideploy.authorize', {
      device_id: dev.device_id, friendly_name: dev.friendly_name, deployment_id: deploymentId,
    });

    // La apiKey se muestra UNA vez. Despues solo queda su hash.
    res.json({ ok: true, deploymentId, apiKey });
  });

  // ------------------------------------------------------------ clientes ---

  admin.get('/clients', authRequired, adminRequired, (req, res) => {
    const filas = db
      .prepare('SELECT * FROM omnideploy_clients ORDER BY created_at DESC')
      .all();
    res.json({
      ok: true,
      clients: filas.map((c) => ({
        client_id: c.client_id,
        deployment_id: c.deployment_id,
        label: c.label,
        contact_email: c.contact_email,
        status: c.status,
        jobs_count: c.jobs_count,
        last_used_at: c.last_used_at,
        created_at: c.created_at,
        notes: c.notes,
        // Faltaban en el listado: sin la fecha de emision no habia forma de
        // saber desde cuando existe una clave, ni cuanto le queda.
        issued_at: c.issued_at || c.created_at,
        duration_days: c.duration_days,
        activated_at: c.activated_at,
        expires_at: c.expires_at,
        days_left:
          c.duration_days && c.expires_at
            ? Math.max(
                0,
                Math.round(
                  (Date.parse(`${c.expires_at}T00:00:00Z`) -
                    Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) /
                    86400000,
                ),
              )
            : null,
      })),
    });
  });

  /**
   * Emite una clave para un cliente concreto.
   *
   * Se comprueba que el despliegue exista y este activo ANTES de generar nada:
   * una clave para una maquina que no existe parece valida hasta que se usa.
   */
  admin.post('/clients', authRequired, adminRequired, (req, res) => {
    const deploymentId = String(req.body?.deploymentId || '').trim();
    const label = String(req.body?.label || '').trim().slice(0, 80);
    if (!deploymentId) {
      return res.status(400).json({ ok: false, error: 'Falta el Deployment ID del equipo.' });
    }
    if (!label) {
      return res.status(400).json({ ok: false, error: 'Ponle un nombre al cliente: sin el no se distinguen.' });
    }

    const dev = db
      .prepare("SELECT * FROM omnideploy_devices WHERE deployment_id = ? AND status = 'active'")
      .get(deploymentId);
    if (!dev) {
      return res.status(404).json({ ok: false, error: 'No hay ningun equipo activo con ese Deployment ID.' });
    }

    const clientId = `cli_${crypto.randomBytes(8).toString('hex')}`;
    const apiKey = crypto.randomBytes(32).toString('base64url');

    // Vigencia. Se aceptan LAS MISMAS claves que las licencias -'1'..'5' y
    // 'd45' a medida- resueltas por el mismo `resolveDuration`, para que no
    // haya dos tablas de duraciones que mantener y diverjan. `durationDays`
    // directo se conserva por si alguien llama a la API a mano.
    let dias = null;
    if (req.body?.duration != null && String(req.body.duration).trim() !== '') {
      try {
        dias = resolverDuracion(String(req.body.duration)).days;
      } catch (e) {
        return res.status(400).json({ ok: false, error: e.message });
      }
    } else {
      const crudo = Number.parseInt(req.body?.durationDays, 10);
      dias = Number.isFinite(crudo) && crudo > 0 ? crudo : null;
    }
    const correo = String(req.body?.contactEmail || '').trim().toLowerCase() || null;
    const emitida = ahora();

    db.prepare(
      `INSERT INTO omnideploy_clients
         (client_id, deployment_id, api_key_hash, label, contact_email, notes, status,
          created_at, issued_at, duration_days)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    ).run(
      clientId,
      deploymentId,
      hash(apiKey),
      label,
      correo,
      String(req.body?.notes || '').trim() || null,
      emitida,
      emitida,
      dias,
    );

    logAudit?.(req.admin?.id ?? null, req.admin?.email ?? null, 'omnideploy.client.create', {
      client_id: clientId, deployment_id: deploymentId, label, duration_days: dias,
    });

    // SE LE MANDA AL CLIENTE. Antes habia que pasarle las credenciales a mano.
    //
    // La API Key viaja en claro y SOLO AQUI: el servidor guarda su hash, asi que
    // no se puede volver a mostrar ni regenerar. El correo lo advierte.
    //
    // No bloquea la respuesta: la clave ya esta creada, y perderla por un fallo
    // de SMTP seria peor que no avisar. El panel la sigue mostrando una vez.
    if (correo && enviarCorreo && plantillaClave) {
      enviarCorreo(
        correo,
        'Omni-IA Game — Tus credenciales de OmniDeploy',
        plantillaClave({
          nombreCliente: label,
          deploymentId,
          apiKey,
          emitidaEn: new Date(emitida).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' }),
          duracionEtiqueta: dias ? `${dias} día${dias === 1 ? '' : 's'} desde el primer uso` : 'Sin caducidad',
          expiraEn: null, // se sella en el primer uso, no ahora
          appDomain: (process.env.APP_DOMAIN || '').replace(/^https?:\/\//, ''),
        }),
      )
        .then(() => logAudit?.(null, null, 'omnideploy.client.key_email_sent', { client_id: clientId, to: correo }))
        .catch((e) =>
          logAudit?.(null, null, 'omnideploy.client.key_email_failed', {
            client_id: clientId, to: correo, error: String(e.message || e),
          }),
        );
    }

    // La apiKey se muestra UNA vez: despues solo queda su hash.
    res.json({ ok: true, clientId, deploymentId, apiKey, label, durationDays: dias, issuedAt: emitida });
  });

  /**
   * Historial de uso de un cliente: QUE uso y CUANDO.
   *
   * "Ultimo uso: hace 1 h" no es un control, es un dato suelto. Aqui va el
   * detalle -que servicio, a que hora, si salio bien- y el resumen por
   * servicio, que es lo que permite saber a que se le esta dando la GPU.
   */
  admin.get('/clients/:id/uso', authRequired, adminRequired, (req, res) => {
    const cliente = db
      .prepare('SELECT * FROM omnideploy_clients WHERE client_id = ?')
      .get(req.params.id);
    if (!cliente) return res.status(404).json({ ok: false, error: 'Cliente desconocido.' });

    const limite = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);

    const trabajos = db
      .prepare(
        `SELECT job_id, servicio, status, created_at, started_at, finished_at, error
         FROM omnideploy_jobs
         WHERE client_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(req.params.id, limite);

    const resumen = db
      .prepare(
        `SELECT servicio,
                COUNT(*) AS veces,
                SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS correctos,
                MAX(created_at) AS ultimo
         FROM omnideploy_jobs
         WHERE client_id = ?
         GROUP BY servicio
         ORDER BY veces DESC`,
      )
      .all(req.params.id);

    res.json({
      ok: true,
      client: {
        client_id: cliente.client_id,
        label: cliente.label,
        contact_email: cliente.contact_email,
        issued_at: cliente.issued_at || cliente.created_at,
        duration_days: cliente.duration_days,
        activated_at: cliente.activated_at,
        expires_at: cliente.expires_at,
      },
      resumen,
      // Cada trabajo con su duracion real, que es lo que de verdad cuesta GPU.
      trabajos: trabajos.map((t) => ({
        job_id: t.job_id,
        servicio: t.servicio || 'desconocido',
        estado: t.status,
        cuando: t.created_at,
        segundos:
          t.started_at && t.finished_at ? Math.round((t.finished_at - t.started_at) / 1000) : null,
        error: t.error || null,
      })),
    });
  });

  admin.post('/clients/:id/revoke', authRequired, adminRequired, (req, res) => {
    const c = db.prepare('SELECT * FROM omnideploy_clients WHERE client_id = ?').get(req.params.id);
    if (!c) return res.status(404).json({ ok: false, error: 'Cliente desconocido.' });
    db.prepare("UPDATE omnideploy_clients SET status = 'revoked', revoked_at = ? WHERE client_id = ?")
      .run(ahora(), c.client_id);
    logAudit?.(req.admin?.id ?? null, req.admin?.email ?? null, 'omnideploy.client.revoke', {
      client_id: c.client_id, label: c.label,
    });
    res.json({ ok: true });
  });

  admin.post('/devices/:id/revoke', authRequired, adminRequired, (req, res) => {
    const dev = db.prepare('SELECT * FROM omnideploy_devices WHERE device_id = ?').get(req.params.id);
    if (!dev) return res.status(404).json({ ok: false, error: 'Dispositivo desconocido.' });
    db.prepare("UPDATE omnideploy_devices SET status = 'revoked' WHERE device_id = ?").run(dev.device_id);
    logAudit?.(req.admin?.id ?? null, req.admin?.email ?? null, 'omnideploy.revoke', {
      device_id: dev.device_id, friendly_name: dev.friendly_name,
    });
    res.json({ ok: true });
  });

  return admin;
}

module.exports = { router, rutasAdmin, hash, coincide, ACTIVO, CAIDO_TRAS_MS };
