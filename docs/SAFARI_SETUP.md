# Safari (macOS): instalación local y pruebas

No hace falta una cuenta de Apple Developer. Los nombres de los menús pueden variar un poco según el idioma del sistema; entre paréntesis va el nombre en inglés.

## 0. Requisitos

- macOS con Safari 26 o posterior para la opción A. Para la opción B basta con Safari 16.4 o posterior.
- Node.js 22.18 o posterior (`node -v`).
- Opción B: Xcode (probado con Xcode 16.4). No hace falta cambiar `xcode-select`: el script usa `/Applications/Xcode.app` automáticamente si solo están activas las Command Line Tools.

```bash
npm install
npm run build:safari        # genera dist/safari/ con manifest.json en la raíz
```

Activa las funciones de desarrollador una sola vez: **Safari › Ajustes › Avanzado › «Mostrar funciones para desarrolladores web»** (*Show features for web developers*). A partir de ahí aparece la pestaña **Desarrollador** (*Developer*) en Ajustes.

## Opción A: extensión temporal, sin Xcode (Safari 26+)

1. **Safari › Ajustes › Desarrollador** (*Developer*).
2. Pulsa **«Añadir extensión temporal…»** (*Add Temporary Extension…*).
3. Si Safari lo pide, autentícate. Esto equivale a activar **«Permitir extensiones sin firmar»** (*Allow unsigned extensions*).
4. Elige la carpeta `dist/safari` del proyecto y pulsa **Seleccionar**.
5. En **Ajustes › Extensiones**, comprueba que «Video Flotante» está activada.

Tras cada cambio en el código, ejecuta `npm run build:safari` y vuelve a cargar la extensión temporal desde la pestaña Desarrollador (o elimínala y añádela de nuevo). Las extensiones temporales y el permiso para extensiones sin firmar son solo para desarrollo, y Safari puede retirarlos al salir; si la extensión desaparece, repite los pasos.

## Opción B: app contenedora con Xcode

El proyecto se genera con la herramienta oficial `safari-web-extension-converter`. Xcode 26 incluye también `safari-web-extension-packager`, pero en este equipo (Xcode 16.4) solo está disponible el conversor.

```bash
npm run safari:xcode
# = build:safari + xcrun safari-web-extension-converter dist/safari --macos-only --swift ...
#   + xcodebuild con firma local ad hoc (CODE_SIGN_IDENTITY=-)
```

Resultado:

- Proyecto: `xcode/Video Flotante/Video Flotante.xcodeproj`
- App: `xcode/build/Build/Products/Debug/Video Flotante.app`

Pasos:

1. **Safari › Ajustes › Desarrollador › «Permitir extensiones sin firmar»** (*Allow unsigned extensions*). Esta opción se desactiva cada vez que sales de Safari.
2. Abre la app una vez para que Safari registre la extensión: `open "xcode/build/Build/Products/Debug/Video Flotante.app"`.
3. **Safari › Ajustes › Extensiones**: activa «Video Flotante».

Para trabajar desde Xcode: `node scripts/safari-xcode.ts --open`, elige el esquema **Video Flotante (macOS)** y pulsa ▶︎ Run. Si Xcode pide equipo de firma, elige **Sign to Run Locally**.

El proyecto **referencia** `dist/safari`, no copia sus archivos. Tras `npm run build:safari` basta con recompilar en Xcode (⌘B) o volver a ejecutar `npm run safari:xcode`. El identificador de paquete por defecto es `local.videoflotante.app`; puedes cambiarlo con `SAFARI_BUNDLE_ID=com.tu.dominio npm run safari:xcode`.

## Permisos en Safari

La extensión no pide acceso permanente a ningún sitio. Al pulsar el icono, `activeTab` le da acceso temporal a la pestaña actual. Según tu configuración, Safari puede preguntar si permites la extensión en ese sitio («una vez», «un día» o «siempre»). También se puede ajustar en **Ajustes › Extensiones › Video Flotante › Editar sitios web**.

## Depuración

- **Popup:** con el panel abierto, clic derecho › **Inspeccionar elemento**.
- **Background:** menú **Desarrollo › Contenido de fondo de la extensión web › Video Flotante** (*Develop › Web Extension Background Content*).
- **Content script:** el inspector web de la página, en el contexto de la extensión.
- `npm run dev:safari` compila en modo watch con logs de depuración (`[video-flotante:…]`).

## Pruebas manuales en Safari (pendientes)

Anota el resultado de cada paso en `docs/TEST_REPORT.md` (sección «Safari: pruebas manuales»).

1. Abre `http://127.0.0.1:4173/video.html` tras ejecutar `node tests/fixtures/server.ts`. Pulsa el icono: debe indicar «4 videos detectados» o más, con ★ en el de 960×540.
2. Pulsa **Abrir ventana flotante**. Esta es la **verificación clave**:
   - Si se abre la ventana directamente, Safari propaga el gesto del panel a la página.
   - Si aparece el aviso «El navegador exige un clic directo…» y un botón sobre el video, Safari no lo propaga; pulsa ese botón y debe abrirse la ventana.
3. Mueve y redimensiona la ventana flotante. Cambia de pestaña y de aplicación: el video debe seguir reproduciéndose.
4. **Pausar/Reanudar** desde el panel, y también desde los controles de la propia ventana.
5. **Regresar al reproductor:** la ventana se cierra, la página se desplaza hasta el video y el tiempo es el mismo.
6. Cierra la ventana flotante con su botón ✕: el panel debe mostrar «PiP inactivo» y desaparecer el badge «PiP».
7. Con la ventana abierta, ve a otra pestaña y abre el panel: debe aparecer «Ir al video original».
8. Prueba el atajo `⌥⇧P` (abrir/cerrar) y `⌥⇧V` (panel). Anota si Safari los reconoce.
9. Selecciona el video «bloqueado» (480×270 con `disablepictureinpicture`): el botón debe quedar deshabilitado y mostrarse el motivo.
10. Abre una página interna (p. ej. la página de inicio de Safari): debe indicar «No disponible en esta página».
11. Plataformas: YouTube, Netflix, HBO Max, Disney+, Twitch, Udemy y Vimeo. Actualiza `docs/COMPATIBILITY.md` con lo que observes.

### Verificación automatizada opcional (Safari real, sin la extensión)

Las sesiones de WebDriver de Safari no cargan extensiones, pero sí permiten comprobar la lógica compartida (detección, PiP, botón de respaldo con clic nativo y `disablePictureInPicture`) en el motor real:

1. **Safari › Ajustes › Desarrollador › «Permitir automatización remota»** (*Allow remote automation*), o `safaridriver --enable`.
2. `npm run test:safari-webdriver`
