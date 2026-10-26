import { getAdapter } from '../adapters/index.ts';
import { CONTENT_API_KEY } from '../shared/content-api.ts';
import { createContentApi } from './create-content-api.ts';

/**
 * Se inyecta bajo demanda (activeTab + scripting) en todos los frames accesibles.
 * La guarda evita instalarlo dos veces si el popup se abre de nuevo.
 */
const scope = globalThis as unknown as Record<string, unknown>;
if (!scope[CONTENT_API_KEY]) {
  const adapter = getAdapter();
  scope[CONTENT_API_KEY] = createContentApi(document, {
    onPipChange: (active) => void adapter.sendMessage({ type: 'pip-state', active }),
  });
}
