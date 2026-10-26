# Lista de verificación de publicación

## Común

- [ ] Actualizar `version` en `package.json`. Se copia sola a ambos manifests.
- [ ] `npm run lint && npm run typecheck && npm run test && npm run test:e2e`, todo en verde.
- [ ] Ejecutar las pruebas manuales en Safari y en Google Chrome, y actualizar `TEST_REPORT.md` y `COMPATIBILITY.md` solo con resultados reales.
- [ ] Revisar que los permisos sigan siendo `activeTab`, `scripting` y `storage`, sin `host_permissions` (lo verifica `tests/build/build.test.ts`).
- [ ] Confirmar que no hay código remoto, `eval`, analítica ni peticiones de red (también lo verifica el test de build).
- [ ] Nunca publicar `dist/chrome-e2e`.

## Chrome Web Store

- [ ] `npm run package:chrome` → `release/video-flotante-chrome-<versión>.zip`.
- [ ] Cargar el ZIP como extensión descomprimida en un perfil limpio de Google Chrome (macOS y Windows) y hacer una prueba rápida.
- [ ] Ficha: descripción, capturas de 1280×800, icono de 128 px y categoría.
- [ ] Prácticas de privacidad: propósito único, justificación de cada permiso, «sin código remoto» y «no recopila datos» (ver `CHROME_SETUP.md`).
- [ ] Política de privacidad pública, si el panel la pide (se puede basar en la sección «Privacidad» del README).

## Safari (App Store, más adelante)

Para distribuir hace falta una cuenta del Apple Developer Program. Para probar en local no.

- [ ] Regenerar el proyecto con `npm run safari:xcode`, o con `xcrun safari-web-extension-packager` en Xcode 26.
- [ ] Definir el identificador definitivo: `SAFARI_BUNDLE_ID=com.tu-dominio.videoflotante`.
- [ ] En Xcode: equipo de firma, versión y build (`MARKETING_VERSION` igual a la versión del manifest), icono de la app en `Assets.xcassets`.
- [ ] Revisar la app contenedora (`ViewController` / `Main.html`), con un texto que explique cómo activar la extensión.
- [ ] Probar el archivo de Release firmado en un Safari limpio (sin «Permitir extensiones sin firmar»).
- [ ] App Store Connect: etiquetas de privacidad («Datos no recopilados»), capturas y descripción.
- [ ] Archive › Distribute App › App Store Connect.
