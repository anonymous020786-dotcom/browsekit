import { test, expect, ORIGIN, html, toast, clipboard, runCommand, selectText, waitForBrowsekit } from './fixtures.js';

const LONG_ARTICLE = `
  <nav>Home · About · Contact</nav>
  <article>
    <h1>A long article</h1>
    ${'<p>Browsekit reader mode keeps the paragraphs of the main article and drops the clutter around it. </p>'.repeat(12)}
  </article>
  <aside>Sidebar advert</aside>`;

test.describe('reading', () => {
  test('reader mode shows the article and Esc closes it', async ({ page, open }) => {
    await open('/article', LONG_ARTICLE);
    await page.keyboard.press('Alt+Shift+KeyR');
    const reader = page.locator('browsekit-reader');
    await expect(reader.locator('h1')).toHaveText('A long article');
    await expect(reader.locator('article p')).toHaveCount(12);
    await expect(reader).not.toContainText('Sidebar advert');
    await page.keyboard.press('Escape');
    await expect(reader).toHaveCount(0);
  });

  test('page outline lists headings', async ({ page, open }) => {
    await open('/article', '<h1>Title</h1><h2>First part</h2><p>a</p><h2>Second part</h2><p>b</p>');
    await page.keyboard.press('Alt+Shift+KeyO');
    await expect(page.locator('#browsekit-panel a')).toHaveText(['Title', 'First part', 'Second part']);
  });
});

test.describe('links', () => {
  test('tracking parameters are removed from the address', async ({ page, serve }) => {
    await serve(`${ORIGIN}/article`, html('<p>Hi</p>'));
    await page.goto(`${ORIGIN}/article?utm_source=news&id=7&fbclid=abc`);
    await waitForBrowsekit(page);
    await expect.poll(() => page.url()).toBe(`${ORIGIN}/article?id=7`);
  });

  test('copies the page as a Markdown link', async ({ page, open }) => {
    await open('/article', '<p>Hi</p>', { title: 'My [draft] page' });
    await page.keyboard.press('Alt+Shift+KeyC');
    await expect(toast(page)).toHaveText('Copied Markdown link');
    expect(await clipboard(page)).toBe(`[My \\[draft\\] page](${ORIGIN}/article)`);
  });

  test('redirect wrappers are skipped', async ({ page, open, serve }) => {
    await serve(`${ORIGIN}/target`, html('<h1>Arrived</h1>'));
    const wrapped = `https://www.google.com/url?q=${encodeURIComponent(`${ORIGIN}/target`)}&sa=D`;
    await open('/article', `<a id="out" href="${wrapped}">Go</a>`);
    await page.click('#out');
    await expect(page).toHaveURL(`${ORIGIN}/target`);
  });

  test('next page shortcut follows rel=next', async ({ page, open, serve }) => {
    await serve(`${ORIGIN}/page/2`, html('<h1>Page 2</h1>'));
    await open('/page/1', '<a rel="next" href="/page/2">More</a>');
    await page.keyboard.press('Alt+Shift+ArrowRight');
    await expect(page).toHaveURL(`${ORIGIN}/page/2`);
  });

  test('link hints click the chosen element', async ({ page, open }) => {
    await open('/article', '<button onclick="document.title = \'clicked\'">Press me</button>');
    await page.keyboard.press('Alt+Shift+KeyF');
    await expect(page.locator('html > div > span')).toHaveText('S');
    await page.keyboard.press('s');
    await expect(page).toHaveTitle('clicked');
  });

  test('warns about links that show one site but go to another', async ({ page, open }) => {
    await open('/article', '<a href="https://evil.test/login">https://bank.example.com/login</a>');
    await page.hover('a');
    await expect(toast(page)).toHaveText('⚠ This link shows bank.example.com but goes to evil.test');
  });
});

test.describe('media', () => {
  const VIDEO = '<video style="width:320px;height:180px"></video>';

  test('speed keys change and reset playback speed', async ({ page, open }) => {
    await open('/video', VIDEO);
    const rate = () => page.evaluate(() => document.querySelector('video').playbackRate);
    await page.keyboard.press('BracketRight');
    await page.keyboard.press('BracketRight');
    expect(await rate()).toBe(1.5);
    await expect(toast(page)).toHaveText('Speed 1.50×');
    await page.keyboard.press('BracketLeft');
    expect(await rate()).toBe(1.25);
    await page.keyboard.press('Backslash');
    expect(await rate()).toBe(1);
  });

  test('loop toggle', async ({ page, open }) => {
    await open('/video', VIDEO);
    await page.keyboard.press('Alt+Shift+KeyL');
    expect(await page.evaluate(() => document.querySelector('video').loop)).toBe(true);
  });
});

test.describe('forms', () => {
  test('Ctrl+Enter submits the form', async ({ page, open }) => {
    await open('/form', '<form onsubmit="event.preventDefault(); document.title = \'sent\'"><textarea></textarea></form>');
    await page.click('textarea');
    await page.keyboard.type('Hello');
    await page.keyboard.press('Control+Enter');
    await expect(page).toHaveTitle('sent');
  });

  test('character limit counter', async ({ page, open }) => {
    await open('/form', '<input maxlength="10">');
    await page.click('input');
    await page.keyboard.type('abc');
    await expect(page.getByText('3 / 10')).toBeVisible();
  });

  test('password generator fills the focused password field', async ({ page, open }) => {
    await open('/form', '<input type="password" id="pw">');
    await page.click('#pw');
    await runCommand(page, 'generate strong password');
    await expect(toast(page)).toHaveText('Password filled and copied');
    const value = await page.inputValue('#pw');
    expect(value).toHaveLength(20);
    expect(await clipboard(page)).toBe(value);
  });

  test('fill test data guesses sensible values', async ({ page, open }) => {
    await open('/form', `
      <form>
        <input name="first_name"><input name="surname"><input type="email" name="contact">
        <input name="postcode"><select name="country"><option value="">Choose…</option><option value="nl">Netherlands</option></select>
        <input name="prefilled" value="keep me">
      </form>`);
    await page.click('input[name="first_name"]');
    await runCommand(page, 'fill form with test data');
    expect(await page.inputValue('[name="first_name"]')).toBe('Ada');
    expect(await page.inputValue('[name="surname"]')).toBe('Lovelace');
    expect(await page.inputValue('[name="contact"]')).toBe('test@example.com');
    expect(await page.inputValue('[name="postcode"]')).toBe('12345');
    expect(await page.inputValue('[name="country"]')).toBe('nl');
    expect(await page.inputValue('[name="prefilled"]')).toBe('keep me');
  });
});

test.describe('keyboard', () => {
  test('Alt+Shift+1 jumps to the first text field (Shift changes the key to "!")', async ({ page, open }) => {
    await open('/form', '<p>Intro</p><input type="checkbox"><input id="name" type="text">');
    await page.keyboard.press('Alt+Shift+Digit1');
    await expect(page.locator('#name')).toBeFocused();
  });

  test('/ focuses the search box', async ({ page, open }) => {
    await open('/search', '<input type="search" id="q">');
    await page.keyboard.press('Slash');
    await expect(page.locator('#q')).toBeFocused();
  });
});

test.describe('productivity', () => {
  test('calculates selected maths', async ({ page, open }) => {
    await open('/maths', '<p>Total: <span id="sum">(1,200 + 350) * 2</span></p>');
    await selectText(page, '#sum');
    await expect(toast(page)).toHaveText('= 3,100');
  });

  test('converts selected Unix timestamps', async ({ page, open }) => {
    await open('/time', '<p>Created <span id="ts">1700000000</span></p>');
    await selectText(page, '#ts');
    await expect(toast(page)).toContainText('2023-11-14T22:13:20.000Z');
  });

  test('highlighter marks the selection and copies highlights', async ({ page, open }) => {
    await open('/article', '<p>Keep <b id="quote">this important bit</b> in mind.</p>');
    await selectText(page, '#quote');
    await page.keyboard.press('Alt+Shift+KeyZ');
    await expect(page.locator('mark.browsekit-highlight')).toHaveText('this important bit');
    await runCommand(page, 'copy all highlights');
    expect(await clipboard(page)).toMatch(/^> this important bit\n\n— Test page\n/);
  });

  test('copies the selection as Markdown', async ({ page, open }) => {
    await open('/article', '<div id="part"><h2>Steps</h2><ol><li>Open <a href="/docs">the docs</a></li><li>Read <strong>carefully</strong></li></ol></div>');
    await selectText(page, '#part');
    await page.keyboard.press('Alt+Shift+KeyM');
    await expect(toast(page)).toHaveText('Copied selection as Markdown');
    expect(await clipboard(page)).toBe(`## Steps\n\n1. Open [the docs](${ORIGIN}/docs)\n2. Read **carefully**`);
  });

  test('JSON responses are pretty-printed', async ({ page, serve }) => {
    await serve(`${ORIGIN}/data.json`, '{"name":"Browsekit","tags":[true,null,3]}', 'application/json');
    await page.goto(`${ORIGIN}/data.json`);
    await expect(page.getByRole('button', { name: 'Raw' })).toBeVisible();
    await expect(page.locator('pre')).toContainText('"name": "Browsekit"');
  });

  test('page notes are saved and come back', async ({ page, open }) => {
    await open('/article', '<p>Hi</p>');
    await page.keyboard.press('Alt+Shift+KeyN');
    await page.locator('#browsekit-panel textarea').fill('Remember to cite this');
    await page.waitForTimeout(600); // Notes save 400 ms after typing stops.
    await page.reload();
    await waitForBrowsekit(page);
    await expect(toast(page)).toHaveText('You have a note for this page — Alt+Shift+N');
    await page.keyboard.press('Alt+Shift+KeyN');
    await expect(page.locator('#browsekit-panel textarea')).toHaveValue('Remember to cite this');
  });
});

test.describe('annoyances', () => {
  test('hides cookie banners', async ({ page, open }) => {
    await open('/article', '<div id="onetrust-banner-sdk">We use cookies</div><p>Content</p>');
    await expect(page.locator('#onetrust-banner-sdk')).toBeHidden();
  });

  test('sticky elements toggle off and back on', async ({ page, open }) => {
    await open('/article', '<header id="bar" style="position:fixed;top:0">Sticky bar</header><p>Content</p>');
    await page.keyboard.press('Alt+Shift+KeyH');
    await expect(page.locator('#bar')).toBeHidden();
    await page.keyboard.press('Alt+Shift+KeyH');
    await expect(page.locator('#bar')).toBeVisible();
  });
});

test.describe('tables', () => {
  const TABLE = `
    <table>
      <thead><tr><th>Name</th><th>Score</th></tr></thead>
      <tbody><tr><td>b</td><td>10</td></tr><tr><td>a</td><td>9</td></tr><tr><td>c</td><td>100</td></tr></tbody>
    </table>`;
  const column = (page, index) => page.locator(`tbody td:nth-child(${index})`).allTextContents();

  test('Alt+click a header sorts numerically, again to reverse', async ({ page, open }) => {
    await open('/table', TABLE);
    await page.click('th:nth-child(2)', { modifiers: ['Alt'] });
    expect(await column(page, 2)).toEqual(['9', '10', '100']);
    await page.click('th:nth-child(2)', { modifiers: ['Alt'] });
    expect(await column(page, 2)).toEqual(['100', '10', '9']);
  });

  test('Alt+click a cell copies the table for spreadsheets', async ({ page, open }) => {
    await open('/table', TABLE);
    await page.click('td', { modifiers: ['Alt'] });
    expect(await clipboard(page)).toBe('Name\tScore\nb\t10\na\t9\nc\t100');
  });
});

test.describe('site packs', () => {
  test('Amazon product addresses are shortened', async ({ page, serve }) => {
    await serve('https://www.amazon.com/Some-Gadget/dp/B000123456/ref=sr_1_1', html('<h1>Gadget</h1>'));
    await page.goto('https://www.amazon.com/Some-Gadget/dp/B000123456/ref=sr_1_1?keywords=gadget');
    await waitForBrowsekit(page);
    await expect.poll(() => page.url()).toBe('https://www.amazon.com/dp/B000123456');
  });

  test('GitHub: copy file path from the palette', async ({ page, serve }) => {
    await serve('https://github.com/octo/repo/blob/main/src/app%20main.js', html('<h1>app main.js</h1>'));
    await page.goto('https://github.com/octo/repo/blob/main/src/app%20main.js');
    await waitForBrowsekit(page);
    await runCommand(page, 'github copy file path');
    expect(await clipboard(page)).toBe('src/app main.js');
  });

  test('site-pack commands only appear on their site', async ({ page, open }) => {
    await open('/article', '<p>Hi</p>');
    await page.keyboard.press('Alt+Shift+KeyX');
    await page.locator('browsekit-palette input').fill('github');
    await expect(page.locator('browsekit-palette li')).toHaveText('No matching commands');
  });
});
