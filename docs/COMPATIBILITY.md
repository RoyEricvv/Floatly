# Compatibilidad

Este documento solo recoge resultados de **pruebas reales**. Si algo no se ha probado, figura como «Pendiente de verificación».

Estados: ✅ Compatible · 🟡 Parcialmente compatible · ❌ Incompatible · ⏳ Pendiente de verificación

Entorno de las pruebas automatizadas (25-10-2026): macOS 26.0, **Chrome for Testing 156.0.8078.4** (el Chromium de Playwright, en modo headless) con el build de la extensión cargado. Google Chrome 155 (la versión de marca instalada) **no** se probó de forma automatizada: desde Chrome 137 no permite cargar extensiones con `--load-extension`.

## Plataformas de video

| Plataforma | Chromium (automatizado) | Safari 26 (macOS) | Notas |
| --- | --- | --- | --- |
| Páginas de prueba propias (HTML5, varios videos, iframe de otro origen) | ✅ | ⏳ | 12 pruebas E2E: detección, selección, abrir/cerrar, pausa, regresar, cierre, iframe, errores |
| YouTube (video público, sin sesión) | ✅ | ⏳ | Detectó 1 video (880×495). PiP abierto, sin activación previa de la página, y cerrado. El tiempo siguió avanzando (14,4 s → 15,9 s) |
| Twitch (canal en directo, sin sesión) | ✅ | ⏳ | Video en directo 700×394 detectado. PiP a 1280×720 abierto y cerrado |
| Vimeo | ⏳ | ⏳ | El navegador automatizado se encontró con una verificación «Verify you are human» de Cloudflare. No se intentó eludirla, así que no hay conclusión |
| Netflix | ⏳ | ⏳ | Requiere cuenta y DRM. No probado |
| HBO Max | ⏳ | ⏳ | Requiere cuenta y DRM. No probado |
| Disney+ | ⏳ | ⏳ | Requiere cuenta y DRM. No probado |
| Udemy | ⏳ | ⏳ | Los cursos requieren sesión. No probado |
| Otras páginas HTML5 | ⏳ | ⏳ | Depende de cada sitio |

Qué cabe esperar (hipótesis, **no son resultados**). Hay plataformas que desactivan el PiP con `disablePictureInPicture`, con `Permissions-Policy: picture-in-picture=()` o con su propio reproductor. En ese caso la extensión muestra el motivo y no intenta eludirlo. Con contenido DRM, el navegador puede negarse a mostrar la imagen en PiP o mostrarla en negro; es una restricción legítima y no se esquiva.

## Navegadores y sistemas

| Navegador | Estado | Evidencia |
| --- | --- | --- |
| Chromium / Chrome for Testing 156 · macOS | ✅ | `npm run test:e2e`: 12/12 (headless) y 24/24 (con ventana, ×2) |
| Google Chrome 155 · macOS | ⏳ | Mismo motor; falta la instalación manual (ver `CHROME_SETUP.md`) |
| Google Chrome · Windows | ⏳ | El build y el ZIP no dependen del sistema operativo. No probado en Windows |
| Safari 26.0 · macOS 26 | ⏳ | El proyecto Xcode se genera sin advertencias y la app compila (`BUILD SUCCEEDED`), pero la ejecución en Safari queda pendiente de prueba manual |

## APIs por navegador (según documentación y detección)

| API | Safari | Chrome | Uso en la extensión |
| --- | --- | --- | --- |
| `HTMLVideoElement.requestPictureInPicture()` | Sí (13.1+) | Sí | Vía principal |
| `webkitSetPresentationMode` | Sí | No | Alternativa en WebKit |
| Document Picture-in-Picture | No | Sí (116+) | Solo se detecta y se muestra en el panel |
| `scripting.executeScript` con `func`/`args` | Sí (MV3, 15.4+) | Sí | Comunicación popup → página |
| `storage.session` | Sí (16.4+) | Sí | Pestaña con PiP activo (con respaldo en memoria) |
| `commands` | Pendiente de verificar en Safari 26 | Sí, configurable | Atajos `toggle-pip` y `_execute_action` |
| Propagación del gesto popup → `executeScript` | **Pendiente de verificar** | Sí, verificada | Si falla, aparece el botón sobre el video |
