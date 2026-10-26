/**
 * Build de la extensión para un navegador concreto.
 *
 *   node scripts/build.ts --target=safari|chrome [--watch] [--e2e] [--outDir=ruta]
 *
 * Genera un directorio autocontenido (dist/<target>) con manifest.json en la raíz.
 * El popup se compila como página; content script y background como IIFE clásicos
 * (scripting.executeScript no admite módulos ES).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, type InlineConfig } from 'vite';

type Target = 'safari' | 'chrome';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv: string[]) {
  const get = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const target = get('target');
  if (target !== 'safari' && target !== 'chrome') {
    throw new Error('Uso: node scripts/build.ts --target=safari|chrome [--watch] [--e2e] [--outDir=ruta]');
  }
  const e2e = argv.includes('--e2e');
  return {
    target: target as Target,
    watch: argv.includes('--watch'),
    e2e,
    outDir: resolve(ROOT, get('outDir') ?? join('dist', e2e ? `${target}-e2e` : target)),
  };
}

const readJson = (path: string) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

export function createManifest(target: Target, { e2e = false } = {}): Record<string, unknown> {
  const pkg = readJson('package.json');
  const manifest = { ...readJson('manifests/base.json'), ...readJson(`manifests/${target}.json`), version: pkg.version };
  if (e2e) {
    // Solo para pruebas automatizadas: Playwright no puede pulsar el botón de la barra,
    // así que activeTab nunca se concede; se permite el servidor local de fixtures.
    manifest.host_permissions = ['http://127.0.0.1/*', 'http://localhost/*'];
    manifest.name = `${manifest.name} (E2E)`;
  }
  return manifest;
}

/** Comprueba que todo archivo referenciado por el manifest exista en el build. */
export function validateBuild(outDir: string, manifest: Record<string, unknown>): string[] {
  const refs = new Set<string>();
  const collect = (value: unknown, key = ''): void => {
    if (typeof value === 'string' && /\.(png|js|html)$/.test(value)) refs.add(value);
    else if (Array.isArray(value)) value.forEach((v) => collect(v, key));
    else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => collect(v, k));
  };
  collect(manifest);
  refs.add('content.js');
  return [...refs].filter((file) => !existsSync(join(outDir, file))).map((f) => `Falta ${f}`);
}

interface WatcherLike {
  on(event: 'event', listener: (e: { code: string; error?: unknown }) => void): void;
}

/** En modo watch, `build()` devuelve un watcher: se espera a que termine la primera compilación. */
async function runBuild(config: InlineConfig, watch: boolean): Promise<void> {
  const output = await build(config);
  if (!watch) return;
  await new Promise<void>((resolve, reject) => {
    (output as unknown as WatcherLike).on('event', (e) => {
      if (e.code === 'END') resolve();
      else if (e.code === 'ERROR') {
        reject(e.error);
        console.error('Error de compilación:', e.error);
      }
    });
  });
}

export async function buildExtension(opts: { target: Target; watch?: boolean; e2e?: boolean; outDir: string }) {
  const { target, watch = false, e2e = false, outDir } = opts;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const shared: InlineConfig = {
    configFile: false,
    logLevel: 'warn',
    root: join(ROOT, 'src'),
    base: './',
    define: {
      __TARGET__: JSON.stringify(target),
      __DEV__: JSON.stringify(watch),
      __E2E__: JSON.stringify(e2e),
    },
  };
  const buildOptions = {
    outDir,
    emptyOutDir: false,
    minify: false,
    sourcemap: watch ? ('inline' as const) : false,
    target: target === 'safari' ? 'safari16' : 'chrome116',
    watch: watch ? {} : null,
  };

  await runBuild({
    ...shared,
    publicDir: join(ROOT, 'public'),
    build: {
      ...buildOptions,
      rollupOptions: { input: { popup: join(ROOT, 'src/popup/index.html') } },
    },
  }, watch);

  for (const [entry, fileName] of [
    ['src/content/content-script.ts', 'content.js'],
    ['src/background/background.ts', 'background.js'],
  ] as const) {
    await runBuild({
      ...shared,
      publicDir: false,
      build: {
        ...buildOptions,
        lib: { entry: join(ROOT, entry), formats: ['iife'], name: 'VideoFlotante', fileName: () => fileName },
      },
    }, watch);
  }

  const manifest = createManifest(target, { e2e });
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const problems = validateBuild(outDir, manifest);
  if (problems.length) throw new Error(`Build inválido:\n${problems.join('\n')}`);
  return { outDir, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const { outDir } = await buildExtension(args);
  console.log(`✔ Build ${args.target}${args.e2e ? ' (e2e)' : ''} → ${outDir}`);
  if (args.watch) console.log('Observando cambios… (recarga la extensión en el navegador tras cada cambio)');
}
