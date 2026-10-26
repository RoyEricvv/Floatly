import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildExtension } from '../../scripts/build.ts';

interface Manifest {
  permissions?: string[];
  host_permissions?: string[];
  content_scripts?: unknown;
  background?: unknown;
}

const tmp = mkdtempSync(join(tmpdir(), 'video-flotante-build-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path).map((f) => `${name}/${f}`) : [name];
  });
}

describe.each(['safari', 'chrome'] as const)('build %s', (target) => {
  const outDir = join(tmp, target);
  let manifest: Manifest;

  it('genera un directorio autocontenido con manifest.json en la raíz', async () => {
    ({ manifest } = (await buildExtension({ target, outDir })) as { manifest: Manifest });
    const files = listFiles(outDir);
    expect(files).toContain('manifest.json');
    expect(files).toContain('content.js');
    expect(files).toContain('background.js');
    expect(files).toContain('popup/index.html');
    expect(JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')).manifest_version).toBe(3);
  });

  it('pide solo los permisos mínimos, sin acceso permanente a sitios', () => {
    expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('background adecuado al navegador', () => {
    if (target === 'chrome') expect(manifest.background).toEqual({ service_worker: 'background.js' });
    else expect(manifest.background).toEqual({ scripts: ['background.js'] });
  });

  it('no contiene código remoto ni evaluación dinámica, ni el adaptador del otro navegador', () => {
    const js = listFiles(outDir)
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(outDir, f), 'utf8'))
      .join('\n');
    expect(js).not.toMatch(/\beval\(|new Function\(|importScripts\(/);
    expect(js).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
    if (target === 'chrome') expect(js).not.toContain('target: "safari"');
    else expect(js).not.toContain('chrome://extensions/shortcuts');
  });
});

it('build E2E añade permisos de host solo para el servidor local', async () => {
  const { manifest } = (await buildExtension({ target: 'chrome', outDir: join(tmp, 'e2e'), e2e: true })) as {
    manifest: Manifest;
  };
  expect(manifest.host_permissions).toEqual(['http://127.0.0.1/*', 'http://localhost/*']);
});
