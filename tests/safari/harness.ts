/**
 * Arnés para Safari real vía WebDriver: las sesiones automatizadas de Safari no
 * cargan extensiones, así que se inyecta en la página la misma lógica compartida
 * que usa el content script (sin el adaptador de extensión).
 */
import { createContentApi } from '../../src/content/create-content-api.ts';

(window as unknown as Record<string, unknown>).__vfHarness = createContentApi(document);
