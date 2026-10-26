# Informe de pruebas

Fecha: 25-10-2026 · Versión 0.1.0. Aquí solo figuran pruebas **ejecutadas realmente**; lo pendiente aparece marcado como tal.

## Entorno

| Componente | Versión |
| --- | --- |
| macOS | 26.0 (25A354) |
| Node.js / npm | 26.9.0 / 11.19.1 |
| TypeScript / Vite / Vitest / Playwright | 6.0.3 / 8.3.5 / 5.0.5 / 1.64.1 |
| Navegador E2E | Chrome for Testing 156.0.8078.4 (`channel: 'chromium'`) |
| Safari / Xcode | Safari 26.0 / Xcode 16.4 (16F6) |

## 1. Pruebas automatizadas

### Calidad estática

| Comando | Resultado |
| --- | --- |
| `npm run lint` | ✅ 0 problemas |
| `npm run typecheck` | ✅ 0 errores (modo `strict` + `noUncheckedIndexedAccess`) |

### Unitarias y de build: `npm run test` (Vitest + happy-dom)

**✅ 90/90 pruebas en 9 archivos.**

| Archivo | Pruebas | Qué cubre (requisito) |
| --- | --- | --- |
| `unit/video-detector.test.ts` | 6 | Detección en el DOM y en shadow roots, ids estables sin tocar el DOM, directos, `disablePictureInPicture` (1) |
| `unit/video-selector.test.ts` | 7 | Video principal: miniaturas, reproducción, área visible, vistas previas silenciadas, PiP activo, empates (2) |
| `unit/pip-controller.test.ts` | 19 | Capacidades, activación, llamada síncrona (gesto), toggle, shadow DOM, errores DOM → códigos, política, cierre con ✕, alternativa WebKit (3, 4, 6) |
| `unit/playback-controller.test.ts` | 4 | Pausar/reanudar, autoplay bloqueado, `AbortError`, continuidad del tiempo (5) |
| `unit/content-api.test.ts` | 11 | API del content script: sin video, id inexistente, botón de respaldo sin gesto, conservación de tiempo y estado, cierre, regresar, pausa, resaltado (3–6) |
| `unit/adapters.test.ts` | 20 | Safari (namespace `browser`, sin pantalla de atajos), Chrome (atajos configurables), y para ambos: pestaña activa, inyección, páginas no accesibles, frames, badge, foco, `storage.session` con respaldo (7) |
| `unit/background.test.ts` | 4 | Sesión PiP + badge, limpieza al cerrar o navegar, atajo que abre o cierra (6, 7) |
| `unit/shared.test.ts` | 10 | Combinación de frames, serialización de errores, formato de tiempo |
| `build/build.test.ts` | 9 | Builds de Safari y Chrome: `manifest.json` en la raíz, archivos completos, permisos mínimos, background correcto, sin código remoto ni `eval`, sin el adaptador del otro navegador, build E2E aislado (8) |

### E2E reales en Chromium: `npm run test:e2e` (Playwright)

Se carga la extensión real (`dist/chrome-e2e`) y se usa el popup real. La ventana PiP es la del navegador.

| Ejecución | Resultado |
| --- | --- |
| Headless | ✅ 12/12 |
| Con ventanas (`HEADED=1`, `--repeat-each=2`) | ✅ 24/24 |

| # | Prueba | Resultado |
| --- | --- | --- |
| 1 | El service worker de la extensión arranca | ✅ |
| 2 | Página sin videos: «No se detectó ningún video…» y botón deshabilitado | ✅ |
| 3 | Detecta 4 videos (incluido uno en un iframe de otro origen), descarta la miniatura y elige el de 960×540 | ✅ |
| 4 | Abre el PiP desde el popup, pausa y reanuda, cierra; el tiempo no retrocede | ✅ |
| 5 | «Regresar al reproductor» sale del PiP y el video sigue reproduciéndose | ✅ |
| 6 | Si el PiP se cierra fuera de la extensión, el popup pasa a «PiP inactivo» | ✅ |
| 7 | Respeta `disablePictureInPicture`: botón deshabilitado y mensaje | ✅ |
| 8 | Video sin datos: mensaje «todavía no está listo» | ✅ |
| 9 | Sin gesto (llamada desde el service worker): `NEEDS_USER_GESTURE`, aparece el botón sobre el video y un clic real abre el PiP | ✅ |
| 10 | PiP de un video dentro de un iframe de otro origen | ✅ |
| 11 | Desde otra pestaña: aviso y «Ir al video original» (cierra el PiP y enfoca la pestaña) | ✅ |
| 12 | Página interna (`chrome://version`): «No disponible en esta página» | ✅ |

**Hallazgo metodológico.** `page.evaluate()` y `page.waitForFunction()` de Playwright conceden **activación de usuario** a la página, lo que habría dado falsos positivos en las pruebas de gesto. Por eso las pruebas leen el estado de la página desde el service worker de la extensión y **comprueban** que `navigator.userActivation.hasBeenActive === false` antes de cada clic. Así queda verificado que, en Chromium, el clic del popup llega a `requestPictureInPicture()` a través de `scripting.executeScript`.

### Plataformas reales en Chromium (exploratorio, 25-10-2026)

Se usó un build temporal con `host_permissions` para estos dominios y el mismo flujo de popup. Antes del clic, la página no tenía activación de usuario.

| Sitio | Resultado |
| --- | --- |
| YouTube: video público `aqz-KE-bpKQ` | ✅ 1 video (880×495). PiP abierto (640×360) y cerrado; el tiempo siguió avanzando (14,38 s → 15,90 s) |
| Twitch: canal en directo | ✅ 1 video (700×394, «en directo»). PiP abierto (1280×720) y cerrado |
| Vimeo `1084537` | ⏳ Bloqueado por una verificación «Verify you are human» de Cloudflare. No se intentó eludirla |

### Safari: empaquetado y compilación

| Paso | Resultado |
| --- | --- |
| `npm run build:safari` | ✅ `dist/safari` con `manifest.json` en la raíz |
| `xcrun safari-web-extension-converter` | ✅ Proyecto generado. La primera versión avisó de la clave `persistent` (no admitida en MV3); se eliminó y la conversión ya no da advertencias |
| `xcodebuild` (Debug, `CODE_SIGN_IDENTITY=-`) | ✅ `BUILD SUCCEEDED` |
| `codesign --verify --deep --strict` | ✅ Firma ad hoc válida; la app incluye `manifest.json`, `content.js`, `background.js`, popup e iconos |
| `npm run package:chrome` + `unzip -t` | ✅ ZIP de 13 archivos, sin errores, con `manifest.json` en la raíz |

## 2. No ejecutado: requiere acción manual

| Prueba | Motivo |
| --- | --- |
| Extensión funcionando en Safari 26 | Hay que activar «Permitir extensiones sin firmar» o «Añadir extensión temporal…», y ambas piden autenticación del usuario. No había automatización de interfaz disponible |
| `npm run test:safari-webdriver` | Safari rechazó la sesión: «You must enable 'Allow remote automation'…». El script está listo para cuando se active |
| Google Chrome 155 (marca) y Windows | Instalación manual (`CHROME_SETUP.md`) |
| Netflix, HBO Max, Disney+, Udemy | Requieren cuenta y suscripción |
| Mover y redimensionar la ventana PiP | Lo gestiona el sistema operativo; requiere verificación visual |

## 3. Safari: pruebas manuales (rellenar)

Procedimiento en `docs/SAFARI_SETUP.md`, sección «Pruebas manuales en Safari».

| # | Prueba | Resultado | Notas |
| --- | --- | --- | --- |
| 1 | Detección y video principal en la fixture | ⏳ | |
| 2 | El clic del popup abre el PiP directamente (¿se propaga el gesto?) | ⏳ | Si no, ¿funciona el botón sobre el video? |
| 3 | Mover y redimensionar; sigue reproduciéndose al cambiar de pestaña o de app | ⏳ | |
| 4 | Pausar/Reanudar | ⏳ | |
| 5 | Regresar al reproductor conservando el tiempo | ⏳ | |
| 6 | Cierre con ✕: estado y badge | ⏳ | |
| 7 | «Ir al video original» desde otra pestaña | ⏳ | |
| 8 | Atajos `⌥⇧P` / `⌥⇧V` | ⏳ | |
| 9 | `disablePictureInPicture` respetado | ⏳ | |
| 10 | Página no accesible | ⏳ | |
| 11 | YouTube / Netflix / HBO Max / Disney+ / Twitch / Udemy / Vimeo | ⏳ | Pasar los resultados a `COMPATIBILITY.md` |
