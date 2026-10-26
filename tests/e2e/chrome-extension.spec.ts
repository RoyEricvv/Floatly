/**
 * Pruebas E2E reales en Chromium (Chrome for Testing de Playwright) con la
 * extensión cargada. El popup se abre como pestaña (Playwright no puede pulsar el
 * botón de la barra), apuntando a la pestaña de la fixture mediante ?tabId=.
 *
 * IMPORTANTE: page.evaluate()/waitForFunction() de Playwright otorgan activación de
 * usuario a la página durante ~5 s, lo que falsearía las pruebas de gesto. Antes de
 * cada clic, el estado de la página se lee desde el service worker (sin gesto).
 */
import { chromium, expect, test, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { resolve } from 'node:path';

const EXTENSION = resolve('dist/chrome-e2e');
const BASE = 'http://127.0.0.1:4173';
const HEADLESS = process.env.HEADED !== '1';

let context: BrowserContext;
let worker: Worker;
let extensionId: string;

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: HEADLESS,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  extensionId = new URL(worker.url()).host;
});

test.afterAll(async () => {
  await context?.close();
});

test.afterEach(async () => {
  for (const page of context.pages()) await page.close();
});

let pageCounter = 0;

async function openFixture(path: string, attempts = 3): Promise<{ page: Page; tabId: number }> {
  const page = await context.newPage();
  // URL única: chrome.tabs.query({url}) debe encontrar exactamente esta pestaña.
  await page.goto(`${BASE}/${path}?n=${++pageCounter}`);
  const tabId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0]!.id!, page.url());
  if (path.startsWith('video')) {
    await expect.poll(() => readMain(tabId, 'readyState')).toBeGreaterThanOrEqual(2);
    // En modo headed, a veces una pestaña nueva hereda activación (foco de ventana).
    // Una página así invalidaría las pruebas de gesto: se descarta y se abre otra.
    if (await hasUserActivation(tabId)) {
      await page.close();
      if (attempts <= 1) throw new Error('La página de prueba tiene activación de usuario previa');
      return openFixture(path, attempts - 1);
    }
  }
  return { page, tabId };
}

/** Lee una propiedad del video #main desde la extensión, sin otorgar activación a la página. */
async function readMain<K extends 'readyState' | 'currentTime' | 'paused'>(tabId: number, prop: K) {
  return worker.evaluate(
    async ([tab, key]) => {
      const [r] = await chrome.scripting.executeScript({
        target: { tabId: tab, frameIds: [0] },
        func: (k: string) => (document.getElementById('main') as unknown as Record<string, unknown>)[k],
        args: [key],
      });
      return r!.result as HTMLVideoElement[K];
    },
    [tabId, prop] as const,
  );
}

async function hasUserActivation(tabId: number): Promise<boolean> {
  return worker.evaluate(async (tab) => {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab, frameIds: [0] },
      func: () => navigator.userActivation.hasBeenActive,
    });
    return r!.result as boolean;
  }, tabId);
}

async function openPopup(tabId: number): Promise<Page> {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html?tabId=${tabId}`);
  return popup;
}

const pipId = (page: Page) => page.evaluate(() => document.pictureInPictureElement?.id ?? null);

test('el service worker de la extensión arranca', () => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
});

test('página sin videos: lo indica en el popup', async () => {
  const { tabId } = await openFixture('no-video.html');
  const popup = await openPopup(tabId);
  await expect(popup.locator('#status-text')).toHaveText('No se detectó ningún video HTML5 en esta página.');
  await expect(popup.locator('#toggle')).toBeDisabled();
});

test('detecta videos (incluido iframe) y elige el principal', async () => {
  const { tabId } = await openFixture('video.html');
  const popup = await openPopup(tabId);
  await expect(popup.locator('#status-text')).toHaveText(/videos detectados/);
  const options = await popup.locator('#picker option').allTextContents();
  // main, inner (iframe), secondary, blocked; la miniatura de 120×68 se descarta.
  expect(options).toHaveLength(4);
  expect(options[0]).toContain('960×540');
  await expect(popup.locator('#status-meta')).toContainText('960×540');
  await expect(popup.locator('#caps')).toContainText('PiP estándar: sí');
  await expect(popup.locator('#other-tab')).toBeHidden();
});

test('abre y cierra la ventana flotante desde el popup conservando el tiempo', async () => {
  const { page, tabId } = await openFixture('video.html');
  const popup = await openPopup(tabId);
  await expect(popup.locator('#toggle')).toBeEnabled();
  const before = await readMain(tabId, 'currentTime');

  await popup.locator('#toggle').click();
  await expect.poll(() => pipId(page)).toBe('main');
  await expect(popup.locator('#pip-state')).toHaveText('PiP activo');
  await expect(popup.locator('#toggle')).toHaveText('Cerrar ventana flotante');

  // Pausar y reanudar desde el popup.
  await popup.locator('#play').click();
  await expect.poll(() => page.evaluate(() => (document.getElementById('main') as HTMLVideoElement).paused)).toBe(true);
  await popup.locator('#play').click();
  await expect.poll(() => page.evaluate(() => (document.getElementById('main') as HTMLVideoElement).paused)).toBe(false);

  await popup.locator('#toggle').click();
  await expect.poll(() => pipId(page)).toBeNull();
  const after = await page.evaluate(() => (document.getElementById('main') as HTMLVideoElement).currentTime);
  expect(after).toBeGreaterThanOrEqual(before);
});

test('regresar al reproductor original sale del PiP', async () => {
  const { page, tabId } = await openFixture('video.html');
  const popup = await openPopup(tabId);
  await expect(popup.locator('#toggle')).toBeEnabled();
  await popup.locator('#toggle').click();
  await expect.poll(() => pipId(page)).toBe('main');
  await popup.locator('#reveal').click();
  await expect.poll(() => pipId(page)).toBeNull();
  expect(await page.evaluate(() => (document.getElementById('main') as HTMLVideoElement).paused)).toBe(false);
});

test('cierre de la ventana por la página/navegador: el popup se actualiza', async () => {
  const { page, tabId } = await openFixture('video.html');
  const popup = await openPopup(tabId);
  await expect(popup.locator('#toggle')).toBeEnabled();
  await popup.locator('#toggle').click();
  await expect.poll(() => pipId(page)).toBe('main');
  await page.evaluate(() => document.exitPictureInPicture());
  await expect(popup.locator('#pip-state')).toHaveText('PiP inactivo');
});

test('respeta disablePictureInPicture del sitio', async () => {
  const { page, tabId } = await openFixture('video.html');
  const popup = await openPopup(tabId);
  await expect(popup.locator('#picker')).toBeVisible();
  const option = popup.locator('#picker option', { hasText: '480×270' });
  // Elegimos el video bloqueado buscando cuál tiene pipDisabled.
  const blockedKey = await worker.evaluate(async (tab) => {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab, frameIds: [0] },
      func: () => {
        const api = (globalThis as unknown as Record<string, { report(): { videos: { id: number; pipDisabled: boolean }[] } }>)
          .__videoFlotante!;
        return api.report().videos.find((v) => v.pipDisabled)!.id;
      },
    });
    return `0:${r!.result}`;
  }, tabId);
  expect(await option.count()).toBeGreaterThan(0);
  await popup.locator('#picker').selectOption(blockedKey);
  await expect(popup.locator('#toggle')).toBeDisabled();
  await expect(popup.locator('#message')).toContainText('disablePictureInPicture');
  expect(await pipId(page)).toBeNull();
});

test('video sin datos: muestra error de video no listo', async () => {
  const { tabId } = await openFixture('video.html');
  const popup = await openPopup(tabId);
  await expect(popup.locator('#picker')).toBeVisible();
  const secondaryKey = await worker.evaluate(async (tab) => {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab, frameIds: [0] },
      func: () => {
        const api = (globalThis as unknown as Record<string, { report(): { videos: { id: number; readyState: number }[] } }>)
          .__videoFlotante!;
        return api.report().videos.find((v) => v.readyState === 0)!.id;
      },
    });
    return `0:${r!.result}`;
  }, tabId);
  await popup.locator('#picker').selectOption(secondaryKey);
  await popup.locator('#toggle').click();
  await expect(popup.locator('#message')).toContainText('todavía no está listo');
});

test('sin gesto del usuario: aparece el botón en la página y un clic real abre el PiP', async () => {
  const { page, tabId } = await openFixture('video.html');
  // Desde el service worker no hay activación del usuario.
  const result = await worker.evaluate(async (tab) => {
    await chrome.scripting.executeScript({ target: { tabId: tab, allFrames: true }, files: ['content.js'] });
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab, frameIds: [0] },
      func: () =>
        (globalThis as unknown as Record<string, { enter(id: null): Promise<unknown> }>).__videoFlotante!.enter(null),
    });
    return r!.result as { ok: boolean; fallbackShown?: boolean; error?: { code: string } };
  }, tabId);
  expect(result).toMatchObject({ ok: false, fallbackShown: true, error: { code: 'NEEDS_USER_GESTURE' } });
  expect(await pipId(page)).toBeNull();

  const host = page.locator('video-flotante-overlay');
  await expect(host).toHaveCount(1);
  const box = (await host.boundingBox())!;
  // El shadow root es cerrado: se pulsa por coordenadas (centro, donde está el botón principal).
  await page.bringToFront();
  await page.mouse.click(box.x + box.width / 2 - 20, box.y + box.height / 2);
  await expect.poll(() => pipId(page)).toBe('main');
  await expect(host).toHaveCount(0);
});

test('video dentro de un iframe de otro origen', async () => {
  const { page, tabId } = await openFixture('video.html');
  const popup = await openPopup(tabId);
  await expect(popup.locator('#picker')).toBeVisible();
  const iframeOption = popup.locator('#picker option').filter({ hasNotText: '960×540' }).first();
  const keys = await popup.locator('#picker option').evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value));
  const frameKey = keys.find((k) => !k.startsWith('0:'))!;
  expect(frameKey).toBeTruthy();
  expect(await iframeOption.count()).toBeGreaterThan(0);
  await popup.locator('#picker').selectOption(frameKey);
  await expect(popup.locator('#status-meta')).toContainText('en iframe');
  await popup.locator('#toggle').click();
  const frame = page.frames().find((f) => f.url().includes('iframe.html'))!;
  await expect.poll(() => frame.evaluate(() => document.pictureInPictureElement?.id ?? null)).toBe('inner');
  await popup.locator('#toggle').click();
  await expect.poll(() => frame.evaluate(() => document.pictureInPictureElement?.id ?? null)).toBeNull();
});

test('desde otra pestaña: aviso de PiP activo y "Ir al video original"', async () => {
  const { page, tabId } = await openFixture('video.html');
  const popup = await openPopup(tabId);
  await expect(popup.locator('#toggle')).toBeEnabled();
  await popup.locator('#toggle').click();
  await expect.poll(() => pipId(page)).toBe('main');

  const other = await openFixture('no-video.html');
  const otherPopup = await openPopup(other.tabId);
  await expect(otherPopup.locator('#other-tab')).toBeVisible();
  await otherPopup.locator('#go-other').click();
  await expect.poll(() => pipId(page)).toBeNull();
  const active = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id);
  expect(active).toBe(tabId);
});

test('página interna del navegador: mensaje de página no accesible', async () => {
  const page = await context.newPage();
  await page.goto('chrome://version/');
  await page.bringToFront();
  // Sin permiso "tabs" no se puede filtrar por URL chrome://; es la pestaña activa.
  const tabId = await worker.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]!.id!);
  const popup = await openPopup(tabId);
  await expect(popup.locator('#status-text')).toHaveText('No disponible en esta página');
  await expect(popup.locator('#message')).toContainText('no puede acceder a esta página');
});
