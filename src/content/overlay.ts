/**
 * Elementos mínimos dentro de la página, en un shadow root cerrado para no
 * interferir con los estilos del sitio. Se usan solo cuando hace falta.
 */
const Z_TOP = '2147483647';

function createHost(doc: Document, rect: DOMRect): { host: HTMLElement; root: ShadowRoot } {
  const host = doc.createElement('video-flotante-overlay');
  const view = doc.defaultView;
  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const width = Math.min(rect.right, view?.innerWidth ?? rect.right) - left;
  const height = Math.min(rect.bottom, view?.innerHeight ?? rect.bottom) - top;
  host.style.cssText = `all:initial;position:fixed;left:${left}px;top:${top}px;width:${Math.max(width, 0)}px;height:${Math.max(height, 0)}px;z-index:${Z_TOP};pointer-events:none;`;
  const root = host.attachShadow({ mode: 'closed' });
  (doc.body ?? doc.documentElement).appendChild(host);
  return { host, root };
}

const BUTTON_CSS = `
  .wrap { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
  .card { pointer-events:auto; display:flex; gap:6px; align-items:center; padding:6px;
    background:rgba(20,22,28,.92); border-radius:12px; box-shadow:0 6px 24px rgba(0,0,0,.35);
    font:600 14px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
  button { all:unset; cursor:pointer; color:#fff; border-radius:8px; padding:10px 14px; }
  .go { background:#2f6fed; }
  .go:hover { background:#2559c4; }
  .close { padding:10px; opacity:.7; }
  .close:hover { opacity:1; }
  button:focus-visible { outline:2px solid #9bbcff; outline-offset:2px; }
`;

/**
 * Botón dentro de la página: un clic real del usuario aporta la activación que
 * el navegador exige para requestPictureInPicture() cuando no llega desde el popup.
 */
export function showActivationButton(
  video: HTMLVideoElement,
  onActivate: () => void,
  doc: Document = video.ownerDocument,
  timeoutMs = 12_000,
): () => void {
  const { host, root } = createHost(doc, video.getBoundingClientRect());
  root.innerHTML = `<style>${BUTTON_CSS}</style>
    <div class="wrap"><div class="card" role="dialog" aria-label="Video flotante">
      <button class="go" type="button">Abrir ventana flotante</button>
      <button class="close" type="button" aria-label="Cerrar">✕</button>
    </div></div>`;
  const remove = (): void => {
    clearTimeout(timer);
    host.remove();
  };
  const timer = setTimeout(remove, timeoutMs);
  root.querySelector('.go')!.addEventListener('click', (event) => {
    // Solo clics reales: la página no puede simularlos con dispatchEvent.
    if (!event.isTrusted) return;
    remove();
    onActivate();
  });
  root.querySelector('.close')!.addEventListener('click', remove);
  return remove;
}

export function flashHighlight(video: HTMLVideoElement, doc: Document = video.ownerDocument, ms = 1200): void {
  const { host, root } = createHost(doc, video.getBoundingClientRect());
  root.innerHTML = `<div style="position:absolute;inset:0;border:3px solid #2f6fed;border-radius:6px;
    box-shadow:0 0 0 9999px rgba(0,0,0,.25);"></div>`;
  setTimeout(() => host.remove(), ms);
}
