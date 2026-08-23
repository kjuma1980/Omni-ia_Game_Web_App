# Omni IA-Game (Educational Version)

Omni IA-Game es un estudio de desarrollo asistido por inteligencia artificial de nivel premium diseñado para agilizar la producción de recursos para videojuegos. Al integrar modelos generativos avanzados en local (ComfyUI) y en la nube a través de Tauri v2 y React, esta versión educativa optimiza y consolida la creación en cuatro áreas principales:

## Módulos Principales

### 1. Generador de Assets (Sprites y Mundos)
* **Diseño de Sprites:** Creación de sprites e imágenes coherentes orientadas a recursos 2D.
* **Generación de Mundos y Mapas:** Creación de mapas consistentes y autotiling lógico para escenarios y niveles de juego utilizando técnicas y algoritmos estructurados como Wang Tiles.
* **Procesamiento Nativo:** Herramientas nativas en Rust para remoción de fondos y eliminación de bordes defectuosos (defringing) en sprites generados de manera automatizada.

### 2. Narrativa e Historias
* **Flujos Ramificados:** Generador avanzado de historias lógicas con árbol de decisiones de desarrollo modular interactivo.
* **Composición de Guiones:** Generación de diálogos contextuales y guiones estructurados listos para ser exportados como scripts en formatos estándar para su integración directa en motores de juego.
* **Conversión de Diálogos a Voz:** Capacidad integrada para convertir de forma inmediata las narrativas y líneas de diálogos generadas en audio hablado de alta fidelidad, listos para su uso directo dentro del juego, permitiendo la selección de múltiples perfiles de voces en español e inglés.

### 3. Asistente de Scripts
* **Generación de Código de Videojuegos:** Asistente especializado en lenguajes de motores líderes de la industria, incluyendo Unity (C#), Godot (GDScript), Unreal Engine (C++) y archivos de datos parametrizados (JSON).
* **Refinamiento Interactivo:** Sistema de refinación de prompts con IA y terminal conversacional integrada con previsualizador de código interactivo.
* **Exportación Directa:** Descarga directa de archivos de código listos para su uso directo dentro de los respectivos entornos de desarrollo (IDE).

### 4. Audio Designer
* **Text-to-Speech (TTS):** Síntesis de voz y narración de alta calidad con soporte local y nube para voces en español e inglés, empleando clonación de voz a partir de audios de referencia.
* **Música Adaptativa:** Generación de bandas sonoras a partir de prompts de texto y letras, con calibración inteligente de la duración en función del tempo (BPM) y número de palabras.
* **Efectos de Sonido (SFX):** Creación de efectos de sonido individuales y paisajes sonoros completos (Soundscapes) con exclusión estricta de elementos vocales o instrumentales intrusivos.

## Estado del Proyecto

Versión educativa en desarrollo activo. El proyecto atraviesa actualmente una fase de endurecimiento de seguridad (rama `security-hardening`) orientada a proteger las claves de API de los usuarios y robustecer los servicios locales, sin alterar la funcionalidad existente.

## Seguridad y Buenas Prácticas

* Las claves de API de los proveedores en la nube las configura cada usuario y se almacenan únicamente en su propio equipo. Nunca se incluyen en el código fuente.
* Los archivos de proyecto exportados (`*_devasset_ai.json`) pueden incluir las claves configuradas: **no compartas estos archivos**.
* Los servicios locales (ComfyUI, motores TTS) están diseñados para ejecutarse en el equipo del usuario.
* El uso, reproducción y distribución de este software se rigen por `LICENSE.md` (Licencia de Uso Académico y No Comercial).
