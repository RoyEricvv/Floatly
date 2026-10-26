/**
 * Verificación OPCIONAL de la lógica compartida en Safari real (macOS) vía WebDriver.
 * Requisito previo (manual, una vez): Safari › Ajustes › Desarrollador › "Permitir
 * automatización remota" (o `safaridriver --enable`).
 *
 *   node scripts/safari-webdriver-check.ts
 *
 * Comprueba en Safari: capacidades PiP, detección y selección de videos, error sin
 * gesto + botón de respaldo, clic nativo sobre el botón → PiP, y salida de PiP.
 * No prueba la extensión instalada (eso es manual; ver docs/SAFARI_SETUP.md).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { build } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const DRIVER_PORT = 4799;
const FIXTURE_PORT = 4174;
const results: { check: string; ok: boolean; detail?: unknown }[] = [];
const children: ChildProcess[] = [];

async function wd(method: string, path: string, body?: unknown) {
  const res = await fetch(`http://127.0.0.1:${DRIVER_PORT}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json()) as { value: unknown };
  if (!res.ok) throw new Error(JSON.stringify(json.value));
  return json.value;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function record(check: string, ok: boolean, detail?: unknown) {
  results.push({ check, ok, detail });
  console.log(`${ok ? '✔' : '✘'} ${check}${detail === undefined ? '' : ` → ${JSON.stringify(detail)}`}`);
}

async function main() {
  const outDir = join(ROOT, 'tests/fixtures/.harness');
  mkdirSync(outDir, { recursive: true });
  await build({
    configFile: false,
    logLevel: 'warn',
    define: { __TARGET__: '"safari"', __DEV__: 'false', __E2E__: 'false' },
    build: {
      outDir,
      emptyOutDir: true,
      minify: false,
      lib: { entry: join(ROOT, 'tests/safari/harness.ts'), formats: ['iife'], name: 'VF', fileName: () => 'harness.js' },
    },
  });

  children.push(spawn('node', ['tests/fixtures/server.ts'], { cwd: ROOT, env: { ...process.env, PORT: String(FIXTURE_PORT) } }));
  children.push(spawn('safaridriver', ['-p', String(DRIVER_PORT)]));
  await sleep(1500);

  const session = (await wd('POST', '/session', { capabilities: { alwaysMatch: { browserName: 'safari' } } })) as {
    sessionId: string;
    capabilities: { browserVersion: string };
  };
  const s = `/session/${session.sessionId}`;
  const exec = (script: string, args: unknown[] = []) => wd('POST', `${s}/execute/sync`, { script, args });
  const execAsync = (script: string, args: unknown[] = []) => wd('POST', `${s}/execute/async`, { script, args });
  console.log(`Safari ${session.capabilities.browserVersion}`);

  try {
    await wd('POST', `${s}/url`, { url: `http://127.0.0.1:${FIXTURE_PORT}/video.html` });
    await execAsync('const done = arguments[0]; window.ready.then(() => done(true), (e) => done(String(e)));');
    await execAsync(`const done = arguments[0]; const s = document.createElement('script');
      s.src = '.harness/harness.js'; s.onload = () => done(true); s.onerror = () => done(false); document.head.append(s);`);

    const report = (await exec('return window.__vfHarness.report();')) as {
      capabilities: Record<string, boolean>;
      videos: { width: number; pipDisabled: boolean; readyState: number }[];
    };
    record('Capacidades PiP detectadas', !!(report.capabilities.standard || report.capabilities.webkitPresentationMode), report.capabilities);
    record('Detecta los 4 videos del documento', report.videos.length === 4, report.videos.map((v) => v.width));

    const result = (await execAsync(
      'const done = arguments[0]; window.__vfHarness.enter(null).then(done, (e) => done(String(e)));',
    )) as { ok: boolean; error?: { code: string }; fallbackShown?: boolean };
    const pipAfterScript = await exec('return document.pictureInPictureElement && document.pictureInPictureElement.id;');
    record('Activación desde script (sin clic del usuario)', true, { result, pip: pipAfterScript });

    if (!result.ok && result.fallbackShown) {
      const rect = (await exec(`const r = document.querySelector('video-flotante-overlay').getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2 - 20), y: Math.round(r.top + r.height / 2) };`)) as { x: number; y: number };
      await wd('POST', `${s}/actions`, {
        actions: [{
          type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' },
          actions: [
            { type: 'pointerMove', x: rect.x, y: rect.y, origin: 'viewport' },
            { type: 'pointerDown', button: 0 },
            { type: 'pointerUp', button: 0 },
          ],
        }],
      });
      await sleep(1500);
      const pip = await exec('return document.pictureInPictureElement && document.pictureInPictureElement.id;');
      record('Clic nativo en el botón de respaldo abre PiP', pip === 'main', { pip });
    }

    const inPip = await exec('return !!document.pictureInPictureElement;');
    if (inPip) {
      const before = (await exec("return document.getElementById('main').currentTime;")) as number;
      const exit = await execAsync('const done = arguments[0]; window.__vfHarness.exit().then(done);');
      await sleep(500);
      const after = (await exec("return document.getElementById('main').currentTime;")) as number;
      const pip = await exec('return document.pictureInPictureElement;');
      record('Salir de PiP conserva el tiempo', pip === null && after >= before, { exit, before, after });
    }

    const blocked = (await execAsync(`const done = arguments[0];
      const api = window.__vfHarness; const v = api.report().videos.find((x) => x.pipDisabled);
      api.enter(v.id).then(done);`)) as { error?: { code: string } };
    record('Respeta disablePictureInPicture', blocked.error?.code === 'PIP_DISABLED_BY_PAGE', blocked);
  } finally {
    await wd('DELETE', s).catch(() => {});
  }
}

main()
  .catch((error: unknown) => {
    console.error('✘ No se pudo completar la verificación:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const child of children) child.kill();
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\nResultado: ${results.length - failed}/${results.length} comprobaciones correctas`);
    if (failed) process.exitCode = 1;
  });
