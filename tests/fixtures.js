// Test fixtures: a Chromium instance with Browsekit loaded, plus helpers for serving fake pages.
// Tests never touch the real network — every http(s) request that no test serves is aborted.
import { test as base, chromium, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// Tests load the source folder by default; CI sets BROWSEKIT_EXTENSION=dist/chrome to test the shipped build.
const extensionPath = fileURLToPath(new URL(`../${process.env.BROWSEKIT_EXTENSION ?? 'extension'}`, import.meta.url));

export const ORIGIN = 'https://browsekit.test';

export const html = (body, { head = '', title = 'Test page' } = {}) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>${head}</head><body>${body}</body></html>`;

export const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium', // The full Chromium build; it can load extensions while headless.
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await context.route(/^https?:\/\//, route => route.abort());
    await use(context);
    await context.close();
  },

  // The extension's background service worker: used to read and write chrome.storage.
  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    await use(worker);
  },

  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },

  // serve(url, body, contentType): answer requests for that exact origin + path (any query string).
  serve: async ({ context }, use) => {
    await use(async (url, body, contentType = 'text/html') => {
      const { origin, pathname } = new URL(url);
      await context.route(
        candidate => candidate.origin === origin && candidate.pathname === pathname,
        route => route.fulfill({ status: 200, contentType, body }),
      );
    });
  },

  // open(path, body): serve a page on the test origin, open it, and wait until Browsekit has started.
  open: async ({ page, serve }, use) => {
    await use(async (path, body, options) => {
      const url = new URL(path, ORIGIN);
      await serve(url.href, html(body, options));
      await page.goto(url.href);
      await waitForBrowsekit(page);
    });
  },
});

// Content scripts start at "document idle", which can be after the load event. The reading progress bar
// is a <div> Browsekit adds directly under <html> as soon as it starts, so its presence means features are running.
export async function waitForBrowsekit(page) {
  await page.waitForFunction(() => [...document.documentElement.children].some(element => element.tagName === 'DIV'));
}

export const toast = page => page.locator('html > div[role="status"]');

// The Windows clipboard converts \n to \r\n; normalise so expectations are the same on every OS.
export const clipboard = async page => (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');

export async function runCommand(page, query) {
  await page.keyboard.press('Alt+Shift+KeyX');
  const palette = page.locator('browsekit-palette');
  await palette.locator('input').fill(query);
  await expect(palette.locator('li').first()).not.toHaveText('No matching commands');
  await page.keyboard.press('Enter');
  await expect(palette).toHaveCount(0);
}

export async function selectText(page, selector) {
  await page.evaluate(target => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(target));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }, selector);
}

export { expect };
