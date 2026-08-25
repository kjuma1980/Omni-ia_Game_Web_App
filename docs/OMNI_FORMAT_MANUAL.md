# Manual de Especificación e Implementación del Formato Binario Cifrado `.omni`

**Versión:** 1.0.0  
**Fecha:** 2026-08-24  
**Compatibilidad:** Universal (Omni-IA Game Web App + Omni-IA Game Versión Educativa de Escritorio)

---

## 🎯 1. Objetivo y Alcance

Este manual define la especificación técnica completa y el código de referencia para implementar y replicar de forma 100% idéntica el formato de archivo de guardado binario encriptado **`.omni`** en la **Versión Educativa de Escritorio** de Omni-IA Game (Tauri / Rust / Node.js / Python / C#).

Cualquier proyecto guardado desde la Web App en formato `.omni` se abrirá perfectamente en la aplicación de escritorio y viceversa, garantizando **seguridad impenetrable AES-256-GCM**, compresión binaria y protección contra manipulación (Anti-Tampering).

---

## 🔒 2. Especificación del Layout Binario (`.omni`)

Un archivo `.omni` es un archivo binario puro estructurado en 5 segmentos secuenciales:

```
+-------------------+---------------+-------------------+-------------------+-----------------------------------+
|  MAGIC HEADER     | VERSION (1B)  |   SALT (16B)      |    IV (12B)       |    CIPHERTEXT + AUTH TAG (GCM)    |
| 0x4F 0x4D 0x4E 0x49|     0x01      |  (PBKDF2 Salt)    |   (AES-GCM Nonce) | (Deflated GZIP JSON + Tag 16B)   |
+-------------------+---------------+-------------------+-------------------+-----------------------------------+
 0x00            0x03 0x04       0x04 0x05           0x14 0x15           0x20 0x21                           N
```

### Tabla de Desplazamientos (Offsets):

| Rango de Bytes | Nombre del Campo | Descripción Técnica |
| :--- | :--- | :--- |
| `0x00 - 0x03` | `Magic Header` | **4 Bytes ASCII:** `"OMNI"` (`0x4F 0x4D 0x4E 0x49`). Firma binaria requerida. |
| `0x04` | `Protocol Version` | **1 Byte:** `0x01` (Versión 1 del formato `.omni`). |
| `0x05 - 0x14` | `PBKDF2 Salt` | **16 Bytes:** Sal aleatoria criptográfica estocástica única por archivo. |
| `0x15 - 0x20` | `AES-GCM IV / Nonce`| **12 Bytes:** Vector de Inicialización de 96 bits único por archivo. |
| `0x21 - FIN` | `Payload Cifrado` | **Variable:** JSON comprimido en GZIP y cifrado con **AES-256-GCM**. Los últimos 16 bytes corresponden al Authentication Tag de GCM. |

---

## 🔑 3. Parámetros Criptográficos Estándar

Para lograr compatibilidad cruzada exacta entre WebApp y Desktop:

1. **Fórmula de Derivación Dinámica de Clave (Identidad del Usuario + Licencia):**  
   Para impedir que un usuario no autorizado abra archivos `.omni` creados por otra cuenta, la clave simétrica AES-256-GCM se deriva mediante PBKDF2 combinando:  
   `PassphraseIdentidad = "OMNI_IA_GAME_PROJECT_SECRET_KEY_v1_2026:" + email.toLowerCase().trim() + ":" + licencia.trim()`
2. **Algoritmo de Cifrado Simétrico:**  
   **AES-256-GCM** (Galois/Counter Mode) con 256 bits y Auth Tag de 16 bytes.
3. **Derivación de Clave (KDF):**  
   - Algoritmo: **PBKDF2**
   - Hash: **SHA-256**
   - Iteraciones: **100,000**
   - Longitud de Clave Resultante: **256 bits (32 bytes)**
4. **Firma Interna de Propiedad (`_omniOwner`):**  
   El payload JSON comprimido incluye los metadatos `_omniOwner: { ownerEmail, licenseKey, timestamp }`.
5. **Compresión Previa al Cifrado:**  
   Algoritmo **GZIP / Deflate** aplicado al texto plano JSON antes de cifrar.

---

## 💻 4. Implementación de Referencia en TypeScript / JavaScript (Web & Desktop)

El archivo `services/omniCrypto.ts` es totalmente autónomo y no depende de paquetes externos de `node_modules`, utilizando únicamente las APIs estándar `crypto.subtle` y `CompressionStream`/`DecompressionStream`:

```typescript
const MAGIC_BYTES = new Uint8Array([0x4F, 0x4D, 0x4E, 0x49]); // "OMNI"
const PROTOCOL_VERSION = 0x01;
const DEFAULT_KEY_PASSPHRASE = "OMNI_IA_GAME_PROJECT_SECRET_KEY_v1_2026";
const PBKDF2_ITERATIONS = 100_000;

// Exportar / Cifrar
export async function exportarProyectoOmni(projectData: object, passphrase = DEFAULT_KEY_PASSPHRASE): Promise<Uint8Array>
// Importar / Descifrar
export async function importarProyectoOmni(buffer: ArrayBuffer, passphrase = DEFAULT_KEY_PASSPHRASE): Promise<any>
// Validar Firma
export function esArchivoOmni(buffer: ArrayBuffer): boolean
```

---

## ⚙️ 5. Guía de Replicación en la Versión de Escritorio (Tauri / Rust / Python)

 Si la Versión Educativa de Escritorio usa **Tauri / Rust** backend:

### En Rust (`src/main.rs` o módulo `omni_crypto.rs`):

```rust
use ring::aead::{Aead, BoundKey, SealingKey, OpeningKey, UnboundKey, AES_256_GCM, Nonce};
use ring::pbkdf2;
use flate2::write::GzEncoder;
use flate2::read::GzDecoder;
use std::num::NonZeroU32;

pub fn encrypt_omni_project(json_str: &str, passphrase: &str) -> Vec<u8> {
    // 1. Comprimir con GZIP
    // 2. Derivar clave con PBKDF2-HMAC-SHA256 (100,000 iteraciones)
    // 3. Cifrar con AES-256-GCM usando IV de 12 bytes
    // 4. Concatenar: b"OMNI" + [0x01] + Salt(16) + IV(12) + Ciphertext
}
```

Si la Versión Educativa de Escritorio usa **Python** (ej. PySide / PyQt / PyInstaller):

```python
import hashlib, os, gzip, json
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

def decrypt_omni_file(filepath: str, passphrase: str = "OMNI_IA_GAME_PROJECT_SECRET_KEY_v1_2026") -> dict:
    with open(filepath, "rb") as f:
        data = f.read()
    
    assert data[:4] == b"OMNI", "No es un archivo .omni valido"
    version = data[4]
    salt = data[5:21]
    iv = data[21:33]
    ciphertext = data[33:]
    
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100000)
    key = kdf.derive(passphrase.encode())
    
    aesgcm = AESGCM(key)
    compressed_bytes = aesgcm.decrypt(iv, ciphertext, None)
    json_bytes = gzip.decompress(compressed_bytes)
    return json.loads(json_bytes.decode('utf-8'))
```

---

## 🛡️ 6. Pruebas de Calidad e Integridad (QA Protocol)

1. **Verificación de Firma:** Abrir un archivo `.omni` con un editor de texto plano (Notepad) debe mostrar únicamente los bytes mágicos `OMNI` seguidos de caracteres binarios ininteligibles.
2. **Prueba Anti-Tamper:** Modificar 1 solo byte dentro del payload binario debe arrojar una excepción de descifrado `DecryptionError / TamperCheckFailed`.
3. **Prueba de Intercambio:** Crear un archivo `Proyecto.omni` en la Web App y cargarlo en la versión Educativa de Escritorio para verificar paridad 100%.
