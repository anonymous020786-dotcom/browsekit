import { test, expect, ORIGIN, html, toast, waitForBrowsekit } from './fixtures.js';

const ARTICLE = '<h1>Hello</h1><p>Some text with an <a href="https://elsewhere.test/">external link</a>.</p>';

test('shortcut cheat sheet lists active shortcuts', async ({ page, open }) => {
  await open('/article', ARTICLE);
  await page.keyboard.press('Alt+Shift+KeyK');
  const panel = page.locator('#browsekit-panel');
  await expect(panel).toContainText('Browsekit shortcuts');
  await expect(panel).toContainText('Command palette');
  await expect(panel).toContainText('Alt+Shift+X');
  await page.keyboard.press('Alt+Shift+KeyK');
  await expect(panel).toHaveCount(0);
});

test('command palette filters, runs a command, and the result persists per site', async ({ page, open }) => {
  await open('/article', ARTICLE);
  await page.keyboard.press('Alt+Shift+KeyX');
  const palette = page.locator('browsekit-palette');
  await palette.locator('input').fill('dark mode');
  await expect(palette.locator('li')).toHaveCount(1);
  await expect(palette.locator('li')).toContainText('Toggle dark mode');
  await expect(palette.locator('li kbd')).toHaveText('Alt+Shift+D');
  await page.keyboard.press('Enter');

  await expect(palette).toHaveCount(0);
  await expect(toast(page)).toHaveText('Dark mode on for this site');
  const htmlFilter = () => page.evaluate(() => getComputedStyle(document.documentElement).filter);
  expect(await htmlFilter()).toContain('invert');

  await page.reload();
  await waitForBrowsekit(page);
  await expect.poll(htmlFilter).toContain('invert');
});

test('palette explains when a command does not apply to the page', async ({ page, open }) => {
  await open('/article', ARTICLE);
  await page.keyboard.press('Alt+Shift+KeyX');
  await page.locator('browsekit-palette input').fill('speed up video');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toHaveText('“Speed up video” is not available on this page');
});

test('palette keystrokes do not reach page shortcuts', async ({ page, open }) => {
  await open('/article', `${ARTICLE}<script>let keys = 0; document.addEventListener('keydown', () => { document.title = 'keys:' + ++keys; });</script>`);
  await page.keyboard.press('Alt+Shift+KeyX');
  const titleAfterOpening = await page.title();
  await page.keyboard.type('outline');
  expect(await page.title()).toBe(titleAfterOpening);
});

test('Browsekit can be switched off for a site', async ({ page, serve, worker }) => {
  await worker.evaluate(() => chrome.storage.sync.set({ disabledSites: ['browsekit.test'] }));
  await serve(`${ORIGIN}/article`, html(ARTICLE));
  await page.goto(`${ORIGIN}/article`);
  await page.waitForTimeout(500);
  await page.keyboard.press('Alt+Shift+KeyK');
  await page.waitForTimeout(300);
  await expect(page.locator('#browsekit-panel')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.children.length)).toBe(2); // Only <head> and <body>.
});

test('switching a feature on in settings applies to open pages without a reload', async ({ page, open, worker }) => {
  await open('/article', ARTICLE);
  const marker = () => page.evaluate(() => getComputedStyle(document.querySelector('a'), '::after').content);
  expect(await marker()).toBe('none');
  await worker.evaluate(() => chrome.storage.sync.set({ enabled: { 'mark-external-links': true } }));
  await expect.poll(marker).toBe('"↗"');
});

test('background worker commands reach the page', async ({ page, open, worker }) => {
  await open('/article', ARTICLE);
  await worker.evaluate(async origin => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    await chrome.tabs.sendMessage(tab.id, { type: 'browsekit-command', name: 'palette' });
  }, ORIGIN);
  await expect(page.locator('browsekit-palette input')).toBeFocused();
});

test.describe('settings page', () => {
  test('lists every feature and saves toggles', async ({ page, extensionId, worker }) => {
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    // The summary appears once every feature script has loaded and the list is rendered.
    await expect(page.locator('#summary')).toHaveText(/^\d+ of \d+ features enabled$/);
    const rows = page.locator('.feature');
    const total = await rows.count();
    expect(total).toBeGreaterThanOrEqual(100);
    await expect(page.locator('#summary')).toHaveText(new RegExp(`of ${total} features enabled`));

    await rows.filter({ hasText: 'Reading progress bar' }).locator('input').uncheck();
    await expect.poll(() => worker.evaluate(async () => (await chrome.storage.sync.get('enabled')).enabled?.['reading-progress-bar']))
      .toBe(false);
  });

  test('filter box narrows the list', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await expect(page.locator('#summary')).toHaveText(/features enabled/);
    await page.locator('#filter').fill('youtube');
    const visible = page.locator('.feature:not(.hidden)');
    expect(await visible.count()).toBeGreaterThanOrEqual(4);
    for (const text of await visible.allTextContents()) expect(text.toLowerCase()).toContain('youtube');
  });

  test('turned-off sites are listed and can be turned back on', async ({ page, extensionId, worker }) => {
    await worker.evaluate(() => chrome.storage.sync.set({ disabledSites: ['example.org'] }));
    await page.goto(`chrome-extension://${extensionId}/options/options.html`);
    await expect(page.locator('#sites li')).toContainText('example.org');
    await page.locator('#sites button', { hasText: 'Turn back on' }).click();
    await expect.poll(() => worker.evaluate(async () => (await chrome.storage.sync.get('disabledSites')).disabledSites))
      .toEqual([]);
  });
});
