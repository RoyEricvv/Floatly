/**
 * Genera (o regenera) el proyecto Xcode contenedor de Safari con la herramienta
 * oficial de Apple y, opcionalmente, lo compila firmado "para ejecutar localmente"
 * (sin cuenta de Apple Developer).
 *
 *   node scripts/safari-xcode.ts [--build] [--open]
 *
 * El proyecto referencia dist/safari (no copia los archivos): tras `npm run build:safari`
 * basta con recompilar en Xcode para que Safari use el código nuevo.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const APP_NAME = 'Video Flotante';
const BUNDLE_ID = process.env.SAFARI_BUNDLE_ID ?? 'local.videoflotante.app';
const XCODE_DIR = join(ROOT, 'xcode');
const PROJECT = join(XCODE_DIR, APP_NAME, `${APP_NAME}.xcodeproj`);
const args = process.argv.slice(2);

function developerEnv(): NodeJS.ProcessEnv {
  if (process.env.DEVELOPER_DIR) return process.env;
  const selected = execFileSync('xcode-select', ['-p'], { encoding: 'utf8' }).trim();
  const xcode = '/Applications/Xcode.app/Contents/Developer';
  // Si solo están activas las Command Line Tools, se usa Xcode.app sin cambiar la configuración global.
  if (selected.includes('CommandLineTools') && existsSync(xcode)) return { ...process.env, DEVELOPER_DIR: xcode };
  return process.env;
}

const env = developerEnv();
const run = (cmd: string, cmdArgs: string[]) => execFileSync(cmd, cmdArgs, { stdio: 'inherit', env, cwd: ROOT });

if (!existsSync(join(ROOT, 'dist/safari/manifest.json'))) {
  throw new Error('Falta dist/safari. Ejecuta primero: npm run build:safari');
}

run('xcrun', [
  'safari-web-extension-converter',
  join(ROOT, 'dist/safari'),
  '--project-location', XCODE_DIR,
  '--app-name', APP_NAME,
  '--bundle-identifier', BUNDLE_ID,
  '--swift',
  '--macos-only',
  '--no-open',
  '--no-prompt',
  '--force',
]);
console.log(`✔ Proyecto Xcode: ${PROJECT}`);

if (args.includes('--build')) {
  run('xcodebuild', [
    '-project', PROJECT,
    '-scheme', APP_NAME,
    '-configuration', 'Debug',
    '-derivedDataPath', join(XCODE_DIR, 'build'),
    'CODE_SIGN_IDENTITY=-',
    'CODE_SIGN_STYLE=Manual',
    'DEVELOPMENT_TEAM=',
    'build',
  ]);
  console.log(`✔ App: ${join(XCODE_DIR, 'build/Build/Products/Debug', `${APP_NAME}.app`)}`);
}

if (args.includes('--open')) run('open', [PROJECT]);
