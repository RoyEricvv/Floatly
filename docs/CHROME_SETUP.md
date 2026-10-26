# Google Chrome (macOS y Windows): instalación y publicación

## Instalar la extensión descomprimida

```bash
npm install
npm run build:chrome        # genera dist/chrome/ con manifest.json en la raíz
```

1. Abre `chrome://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. Pulsa **Cargar descomprimida** y elige la carpeta `dist/chrome`.
4. Opcional: fija el icono con el botón de la pieza de puzle de la barra.

Los pasos son los mismos en Windows. Tras cada cambio, ejecuta `npm run build:chrome` (o usa `npm run dev` en modo watch) y pulsa ↻ en la tarjeta de la extensión.

> No uses `dist/chrome-e2e`: es un build solo para pruebas, con permisos extra para `localhost`.

## Atajos de teclado

| Comando | Atajo sugerido |
| --- | --- |
| Abrir o cerrar la ventana flotante del video principal | `Alt+Shift+P` (macOS: `⌥⇧P`) |
| Abrir el panel | `Alt+Shift+V` (macOS: `⌥⇧V`) |

Se cambian en `chrome://extensions/shortcuts`, o con el enlace **Configurar** del panel. Si otro programa ya usa el atajo, Chrome no lo asigna y el panel muestra «sin asignar».

## Depuración

- **Popup:** clic derecho en el panel › **Inspeccionar**.
- **Service worker:** en `chrome://extensions`, enlace **service worker** de la tarjeta.
- **Content script:** DevTools de la página › Console › selector de contexto «Video Flotante».

## Pruebas automatizadas

```bash
npm run test:e2e          # build dist/chrome-e2e + Playwright (Chrome for Testing, headless)
HEADED=1 npm run test:e2e # con ventanas visibles
```

Desde Chrome 137, Google Chrome (la versión de marca) no admite `--load-extension`, así que las pruebas usan el Chromium de Playwright (Chrome for Testing).

## Preparar la publicación (Chrome Web Store)

```bash
npm run package:chrome    # → release/video-flotante-chrome-<versión>.zip (manifest.json en la raíz)
```

En el [panel de desarrollador de Chrome Web Store](https://chrome.google.com/webstore/devconsole):

1. Crea un elemento nuevo y sube el ZIP.
2. **Propósito único:** «Abrir el video de la página actual en una ventana flotante (Picture-in-Picture)».
3. **Justificación de permisos:**
   - `activeTab`: acceder a la pestaña actual solo cuando el usuario pulsa el icono o usa el atajo.
   - `scripting`: inyectar bajo demanda el script que detecta los videos y llama a la API Picture-in-Picture.
   - `storage`: recordar en la sesión (`storage.session`) qué pestaña tiene la ventana flotante abierta.
4. **Código remoto:** «No, no uso código remoto».
5. **Uso de datos:** no se recopila ningún tipo de dato. Marca las certificaciones correspondientes.
6. Capturas de pantalla (1280×800 o 640×400) e icono de 128 px (`public/icons/icon-128.png`).
7. Revisa `docs/RELEASE_CHECKLIST.md` antes de enviar.
