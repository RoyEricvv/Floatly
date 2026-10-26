# Video Flotante

Extensión de navegador que abre el video de una página en una **ventana flotante** (Picture-in-Picture nativo): se puede mover y redimensionar libremente, y sigue reproduciéndose aunque cambies de pestaña o de aplicación. La experiencia está inspirada en la minimización de videos de Telegram, pero no tiene ninguna relación ni integración con Telegram.

- **Prioridad 1:** Safari en macOS.
- **Prioridad 2:** Google Chrome en macOS y Windows.
- Un solo código base en TypeScript; cada navegador tiene su propio build y su propio manifest.

## Inicio rápido

```bash
npm install
npm run build:safari    # → dist/safari
npm run build:chrome    # → dist/chrome
```

- Safari: [docs/SAFARI_SETUP.md](docs/SAFARI_SETUP.md). La vía rápida, en Safari 26 o posterior, es **Ajustes › Desarrollador › Añadir extensión temporal…** y elegir `dist/safari`.
- Chrome: [docs/CHROME_SETUP.md](docs/CHROME_SETUP.md). Ve a `chrome://extensions`, activa el modo desarrollador y usa **Cargar descomprimida** con `dist/chrome`.

## Uso

1. Abre una página con video y pulsa el icono **Video flotante** en la barra de herramientas.
2. El panel muestra el video detectado. Si hay varios, aparece un selector y el video principal se marca con ★.
3. Pulsa **Abrir ventana flotante**. Para mover o redimensionar la ventana se usan los controles del sistema.
4. Desde el panel también puedes **Pausar/Reanudar**, **Regresar al reproductor** (cierra la ventana flotante y desplaza la página hasta el video) o **Cerrar ventana flotante**.
5. Si la ventana flotante está abierta en otra pestaña, el panel ofrece **Ir al video original**.
6. Atajo de teclado: `⌥⇧P` / `Alt+Shift+P` abre o cierra la ventana flotante del video principal, y `⌥⇧V` abre el panel. En Chrome se pueden cambiar en `chrome://extensions/shortcuts`.

Si el navegador no acepta la petición como un gesto del usuario, aparece **sobre el video** un botón «Abrir ventana flotante». Un clic real en ese botón abre el PiP. Es la alternativa segura que se usa cuando el navegador no transmite el clic del panel a la página.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` / `npm run dev:safari` | Build de Chrome o Safari en modo watch, con sourcemaps y logs de depuración |
| `npm run build` | Ejecuta `build:safari` y luego `build:chrome` |
| `npm run build:safari` | Genera `dist/safari/`, con `manifest.json` en la raíz |
| `npm run build:chrome` | Genera `dist/chrome/`, con `manifest.json` en la raíz |
| `npm run package:chrome` | Genera `release/video-flotante-chrome-<versión>.zip` |
| `npm run safari:xcode` | Genera el proyecto Xcode con `safari-web-extension-converter` y compila la app con firma local |
| `npm run test` | Pruebas unitarias y de build (Vitest + happy-dom) |
| `npm run test:e2e` | Pruebas E2E reales en Chromium con la extensión cargada (Playwright) |
| `npm run test:safari-webdriver` | Verificación opcional en Safari real (requiere activar «Permitir automatización remota») |
| `npm run typecheck` / `npm run lint` | TypeScript estricto y ESLint |

## Estructura

```
src/
  core/        Lógica independiente del navegador: detección, selección, PiP y reproducción
  adapters/    Único punto de contacto con las APIs de extensión (Safari / Chrome)
  content/     Content script, que se inyecta bajo demanda, y botón de respaldo en la página
  background/  Badge, pestaña con PiP activo y atajo de teclado
  popup/       Interfaz del panel
  shared/      Tipos y puente popup/background → content script
  utils/       Errores, logger y formato
manifests/     base.json + safari.json / chrome.json
scripts/       Build, empaquetado, Xcode e iconos
tests/         unit/, build/, e2e/ (Chromium), safari/ (WebDriver), fixtures/
docs/          Arquitectura, compatibilidad, informes y guías
```

## Privacidad

- Permisos: `activeTab`, `scripting` y `storage`. **No** pide acceso permanente a ningún sitio ni inyecta código en páginas que no hayas abierto con la extensión.
- No recopila historial ni datos personales, no hace peticiones de red, no carga código remoto y no incluye rastreadores.
- Solo guarda en `storage.session` (en memoria, se borra al cerrar el navegador) qué pestaña tiene la ventana flotante abierta.
- No descarga, copia ni retransmite video. Respeta `disablePictureInPicture`, las políticas de permisos de cada sitio y el DRM.

## Documentación

- [Arquitectura](docs/ARCHITECTURE.md)
- [Compatibilidad](docs/COMPATIBILITY.md)
- [Informe de pruebas](docs/TEST_REPORT.md)
- [Lista de verificación de publicación](docs/RELEASE_CHECKLIST.md)
- [Instalación en Safari](docs/SAFARI_SETUP.md)
- [Instalación en Chrome](docs/CHROME_SETUP.md)
