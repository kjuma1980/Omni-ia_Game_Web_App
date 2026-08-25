/**
 * omniCrypto.ts — Módulo de Cifrado Binario y Formato de Guardado `.omni`
 *
 * Formato binario encriptado de alta seguridad para proyectos de Omni-IA Game.
 * Compatible 100% tanto con la Web App (Navegador) como con la Versión de Escritorio (Tauri / WebView2 / Node.js).
 *
 * Especificación de la Estructura Binaria (.omni):
 * [0x00 - 0x03] (4 bytes): Cabecera Mágica ASCII "OMNI" (0x4F 0x4D 0x4E 0x49)
 * [0x04]        (1 byte) : Versión de Protocolo (0x01)
 * [0x05 - 0x14] (16 bytes): Salt aleatorio para derivación PBKDF2
 * [0x15 - 0x20] (12 bytes): IV / Nonce aleatorio para AES-256-GCM
 * [0x21 - ... ] (Variable): Payload comprimido (GZIP) + Cifrado AES-GCM (incluye Auth Tag de 16B al final)
 */

const MAGIC_BYTES = new Uint8Array([0x4F, 0x4D, 0x4E, 0x49]); // "OMNI"
const PROTOCOL_VERSION = 0x01;
const DEFAULT_KEY_PASSPHRASE = "OMNI_IA_GAME_PROJECT_SECRET_KEY_v1_2026";
const PBKDF2_ITERATIONS = 100_000;

/**
 * Comprime un string de texto a GZIP utilizando la API W3C CompressionStream.
 */
async function comprimirTexto(texto: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const datos = encoder.encode(texto);
  if (typeof CompressionStream !== 'undefined') {
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(datos);
    writer.close();
    const chunks: Uint8Array[] = [];
    const reader = cs.readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }
    let totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
  return datos; // Fallback si no está disponible CompressionStream
}

/**
 * Descomprime datos GZIP a string de texto utilizando W3C DecompressionStream.
 */
async function descomprimirTexto(datos: Uint8Array): Promise<string> {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(datos);
      writer.close();
      const chunks: Uint8Array[] = [];
      const reader = ds.readable.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      let totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const result = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return new TextDecoder('utf-8').decode(result);
    } catch (e) {
      // Si no era GZIP, decodificar directo
      return new TextDecoder('utf-8').decode(datos);
    }
  }
  return new TextDecoder('utf-8').decode(datos);
}

/**
 * Deriva una clave simétrica de 256 bits usando PBKDF2 y HMAC-SHA-256.
 */
async function derivarClaveAES(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(passphrase),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Cifra y empaqueta un objeto de proyecto en formato binario `.omni`.
 */
export async function exportarProyectoOmni(
  projectData: object,
  userPassphrase: string = DEFAULT_KEY_PASSPHRASE
): Promise<Uint8Array> {
  const jsonStr = JSON.stringify(projectData);
  const compressedData = await comprimirTexto(jsonStr);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const key = await derivarClaveAES(userPassphrase, salt);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    compressedData
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);

  // Ensamblar binario final: MAGIC(4B) + VERSION(1B) + SALT(16B) + IV(12B) + CIPHERTEXT(N)
  const totalLength = MAGIC_BYTES.length + 1 + salt.length + iv.length + ciphertext.length;
  const omniBinary = new Uint8Array(totalLength);

  let offset = 0;
  omniBinary.set(MAGIC_BYTES, offset);
  offset += MAGIC_BYTES.length;

  omniBinary[offset] = PROTOCOL_VERSION;
  offset += 1;

  omniBinary.set(salt, offset);
  offset += salt.length;

  omniBinary.set(iv, offset);
  offset += iv.length;

  omniBinary.set(ciphertext, offset);

  return omniBinary;
}

/**
 * Inspecciona si un buffer binario corresponde a un archivo `.omni` válido.
 */
export function esArchivoOmni(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 33) return false;
  const header = new Uint8Array(buffer, 0, 4);
  return (
    header[0] === MAGIC_BYTES[0] &&
    header[1] === MAGIC_BYTES[1] &&
    header[2] === MAGIC_BYTES[2] &&
    header[3] === MAGIC_BYTES[3]
  );
}

/**
 * Descifra y desempaca un archivo binario `.omni` devolviendo el objeto JSON del proyecto.
 */
export async function importarProyectoOmni(
  buffer: ArrayBuffer,
  userPassphrase: string = DEFAULT_KEY_PASSPHRASE
): Promise<any> {
  const bytes = new Uint8Array(buffer);

  if (!esArchivoOmni(buffer)) {
    throw new Error("El archivo proporcionado no es un archivo cifrado .omni válido.");
  }

  const version = bytes[4];
  if (version !== PROTOCOL_VERSION) {
    throw new Error(`Versión de formato .omni no soportada (v${version}).`);
  }

  const salt = bytes.slice(5, 21);
  const iv = bytes.slice(21, 33);
  const ciphertext = bytes.slice(33);

  const key = await derivarClaveAES(userPassphrase, salt);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      ciphertext
    );

    const compressedData = new Uint8Array(decryptedBuffer);
    const jsonStr = await descomprimirTexto(compressedData);
    return JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      "Error al descifrar el proyecto .omni. El archivo está dañado o fue alterado externamente (Tamper Check Failed)."
    );
  }
}
