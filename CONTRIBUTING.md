# Contributing to Browsekit

Thanks for helping. Browsekit is plain JavaScript with no build step, so getting started is quick.

## Setup

You need Node.js 22 or newer.

```sh
npm install
npx playwright install chromium
npm run verify
```

`npm run verify` runs everything CI runs: the feature registry check, the store builds, the Firefox lint, and the browser tests.

To try your changes by hand, load the `extension/` folder as an unpacked extension (see the README), then reload the extension and the page after each edit.

## Adding a feature

1. Add a `register({...})` call to the right file in `extension/src/features/`. The README shows the fields.
2. Add a browser test to `tests/features.spec.js`. The fixtures serve fake pages, so tests never touch the real internet:

   ```js
   test('my feature does its thing', async ({ page, open }) => {
     await open('/page', '<p>Some HTML</p>');
     await page.keyboard.press('Alt+Shift+KeyQ');
     await expect(toast(page)).toHaveText('Done');
   });
   ```

3. Run `npm run verify`.

## Guidelines

- **Be a good guest on other people's websites.** Wait for the user to act instead of doing heavy work on page load, and clean up anything you add when the feature is toggled off.
- **Anything that changes how a site behaves should be `defaultEnabled: false`.**
- **Avoid shortcuts browsers reserve.** Chrome on Windows keeps `Alt+Shift+T`, `I`, `A` and `B` for itself; the registry check catches clashes between our own shortcuts.
- **No network requests** unless the feature exists to make one and says so in its description.
- Match the style of the surrounding code: small named helpers, short comments that explain why.
