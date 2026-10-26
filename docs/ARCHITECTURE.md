# Arquitectura

## Principios

1. **Un solo código base.** Toda la lógica de video y Picture-in-Picture está en `src/core/` y no usa APIs de extensión. ESLint lo impone: en `core/`, `utils/` y `shared/` está prohibido usar los globales `chrome` y `browser`.
2. **Las APIs de extensión pasan por un adaptador.** `src/adapters/` es la única capa que habla con `browser.*` / `chrome.*`.
3. **El adaptador se elige al compilar.** `__TARGET__` es una constante que inyecta Vite, así que cada build solo incluye su adaptador (lo comprueba `tests/build/build.test.ts`).
4. **Se usa la API nativa.** No hay reproductor propio: se llama a `HTMLVideoElement.requestPictureInPicture()` sobre el `<video>` original de la página. Mover y redimensionar la ventana lo gestiona el sistema operativo.
5. **Permisos mínimos.** `activeTab` + `scripting` + `storage`, sin `host_permissions` ni `content_scripts` declarados. El content script solo se inyecta cuando el usuario abre el panel o usa el atajo.

## Capas

```
┌────────────── popup/ ──────────────┐   ┌──────── background/ ────────┐
│ main.ts: UI, selector, botones     │   │ badge "PiP", sesión activa, │
│                                    │   │ atajo toggle-pip            │
└───────────────┬────────────────────┘   └──────────────┬──────────────┘
                │ shared/content-bridge.ts (invokeContent)│
                ▼                                         ▼
        ┌──────────────── adapters/ ───────────────────────────┐
        │ browser-adapter.ts  (implementación WebExtensions)    │
        │ safari-adapter.ts   (namespace browser, sin UI atajos)│
        │ chrome-adapter.ts   (namespace chrome, atajos config.)│
        └───────────────┬──────────────────────────────────────┘
                        │ scripting.executeScript (mundo aislado)
                        ▼
        ┌──────── content/ (en cada frame accesible) ─────────┐
        │ content-script.ts → globalThis.__videoFlotante       │
        │ create-content-api.ts: report/enter/exit/reveal/...  │
        │ overlay.ts: botón de respaldo y resaltado            │
        └───────────────┬──────────────────────────────────────┘
                        ▼
        ┌──────────────────── core/ ───────────────────────────┐
        │ video-detector.ts   <video> en DOM y shadow roots    │
        │ video-selector.ts   heurística del video principal   │
        │ pip-controller.ts   PiP estándar + WebKit heredado   │
        │ playback-controller.ts  play/pause y continuidad     │
        │ capabilities.ts     detección de capacidades         │
        └──────────────────────────────────────────────────────┘
```

## Flujo «Abrir ventana flotante»

1. Al abrirse, el popup llama a `adapter.injectContentScript(tabId)`. Esto usa `scripting.executeScript({files:['content.js'], allFrames:true})` con el permiso temporal de `activeTab`. Una guarda evita instalarlo dos veces.
2. El popup pide `report()` a todos los frames. Cada frame devuelve descriptores serializables (tamaño, área visible, tiempo, estado y `disablePictureInPicture`), sin URLs ni contenido. `shared/frames.ts` los combina con claves `frameId:id` y los ordena con `rankVideos`.
3. Al hacer clic, el manejador llama a `executeScript` **sin ningún `await` previo**. La función inyectada llama a `globalThis.__videoFlotante.enter(id)` en el mundo aislado de la extensión, el mismo del content script e invisible para la página. `PipController.enter()` llama a `requestPictureInPicture()` también de forma síncrona. Así se conserva la activación transitoria del usuario. En Chromium está verificado que funciona (la página nunca tuvo activación propia; ver `TEST_REPORT.md`).
4. Si el navegador responde `NotAllowedError` (no llegó el gesto), el content script muestra un botón dentro de un shadow root cerrado sobre el video. Ese botón solo acepta clics con `isTrusted`, y un clic real abre el PiP. Es la alternativa prevista para Safari, donde la propagación del gesto todavía no está verificada.
5. Los eventos `enterpictureinpicture`, `leavepictureinpicture` y `webkitpresentationmodechanged` llegan al content script, que avisa al background (`pip-state`). El background actualiza el badge y guarda `{tabId, frameId, windowId}` en `storage.session` para «Ir al video original» y para el atajo.

## Detección y selección

- `findVideos()` recorre el documento y los shadow roots **abiertos**. Los iframes se cubren porque el content script se inyecta en todos los frames accesibles.
- Los ids se guardan en `WeakMap` + `WeakRef`, sin añadir atributos al DOM de la página.
- Heurística (`scoreVideo`): se parte del área visible. Se multiplica por 3 si se está reproduciendo, por 1,5 si tiene datos (`readyState ≥ 2`), por 0,6 si está silenciado (vistas previas), por 0,3 si dura menos de 5 s y por 0,1 si tiene PiP deshabilitado. Los videos de menos de 160×90 se descartan, y el video que ya está en PiP siempre queda primero.

## Picture-in-Picture y capacidades

`detectCapabilities()` informa de:

| Capacidad | Uso |
| --- | --- |
| `requestPictureInPicture` + `document.pictureInPictureEnabled` | Vía principal (Safari ≥ 13.1, Chrome) |
| `webkitSetPresentationMode('picture-in-picture')` | Alternativa para WebKit cuando la API estándar no existe o está desactivada |
| `documentPictureInPicture` | Solo se informa. **No se usa**: Safari no la ofrece y la API nativa basta para el MVP |

Los errores DOM se traducen a códigos propios (`utils/errors.ts`) con mensajes en español: `NEEDS_USER_GESTURE`, `PIP_DISABLED_BY_PAGE`, `PIP_DISABLED_BY_POLICY`, `VIDEO_NOT_READY`, `PIP_UNSUPPORTED`, `PAGE_NOT_ACCESSIBLE`, etc.

**Tiempo de reproducción.** El PiP nativo usa el mismo elemento, así que la posición se conserva por diseño. `checkContinuity()` registra una advertencia si un reproductor reinicia la posición al salir. La extensión no fuerza nada: si el navegador pausa al cerrar la ventana con ✕, se respeta.

## Diferencias entre navegadores

| Aspecto | Safari (macOS) | Chrome |
| --- | --- | --- |
| Namespace | `browser` (se usa `chrome` si falta) | `chrome` |
| Background | `background.scripts` (no persistente en MV3) | `background.service_worker` |
| Gesto popup → `executeScript` | **No verificado**; está cubierto por el botón de respaldo | Verificado en Chromium 156 |
| Configurar atajos | Sin pantalla de configuración; se usa el atajo sugerido | `chrome://extensions/shortcuts` (botón «Configurar») |
| API WebKit heredada | Disponible | No existe |
| Document PiP | No | Sí (no se usa) |
| Versión mínima declarada | `safari.strict_min_version: 16.4` | `minimum_chrome_version: 116` |

## Build

`scripts/build.ts` usa la API de Vite:

- El popup se compila como página HTML, y `public/` (iconos) se copia a la raíz.
- `content.js` y `background.js` se generan como **IIFE clásicos**, porque `scripting.executeScript` no admite módulos ES. No se minifica, para facilitar la revisión en las tiendas.
- El manifest se forma con `manifests/base.json` + `manifests/<target>.json` y la versión de `package.json`.
- `validateBuild()` falla si falta algún archivo referenciado.
- `--e2e` solo añade `host_permissions` para `127.0.0.1`/`localhost`, en un directorio aparte (`dist/chrome-e2e`), porque Playwright no puede pulsar el botón de la barra para conceder `activeTab`.

## Cómo extender

- **Nueva acción sobre el video:** añade el método a `ContentApi` (`shared/content-api.ts`), impleméntalo en `create-content-api.ts` y llámalo con `invokeContent()`.
- **Nuevo navegador (p. ej. Firefox):** añade `manifests/firefox.json`, un `firefox-adapter.ts` sobre `createWebExtensionAdapter` y el target en `scripts/build.ts`.
- **Interfaz propia (Document PiP en Chrome):** iría como una estrategia adicional en `PipController`, activada por `capabilities.documentPip`, sin tocar Safari.
