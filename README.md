# Browsekit

[![CI](https://github.com/anonymous020786-dotcom/browsekit/actions/workflows/ci.yml/badge.svg)](https://github.com/anonymous020786-dotcom/browsekit/actions/workflows/ci.yml)
[![CodeQL](https://github.com/anonymous020786-dotcom/browsekit/actions/workflows/codeql.yml/badge.svg)](https://github.com/anonymous020786-dotcom/browsekit/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A modular, open-source browser extension that adds 105 small power-user features to every website. Each one can be switched on or off: reader mode, link hints, a command palette, video speed control, a highlighter, table sorting, tracking-parameter removal, and much more.

- **Works in:** Chrome, Edge, Brave, Opera, Vivaldi and Firefox (desktop and Android), on Manifest V3.
- **No dependencies, no tracking:** the extension is plain JavaScript, and nothing leaves your device (see [Privacy](#privacy)).
- **Tested in a real browser:** 39 Playwright tests run against the shipped package on every push.

## Install

### From a release

Download the zip for your browser from the [latest release](../../releases/latest):

- **Chrome, Edge, Brave, Opera, Vivaldi:** unzip `browsekit-chrome-<version>.zip`. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and pick the unzipped folder.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `browsekit-firefox-<version>.zip`. To install it permanently, use the Firefox Add-ons listing once it's published.

### From source

Load the `extension/` folder the same way. After editing code, click the extension's reload button, then reload the page.

## Using it

- **`Alt+Shift+X` opens the command palette.** It lists every action available on the page, including ones without a shortcut (password generator, page info, Wayback Machine, site-pack actions…). It works inside text fields too.
- **`Alt+Shift+K`** lists the shortcuts active on the current page.
- **Toolbar popup:** turn Browsekit off for the current site, and use tab tools (copy URLs, close duplicates, sort by site, close tabs to the right, mute other tabs).
- **Settings page:** search and toggle every feature, and export or import your settings. Switching a feature on works in open tabs right away; switching one off needs a page reload. Some features are off by default because they change how sites behave.
- **Browser-level shortcuts:** assign your own keys to the palette, link hints, reader mode and dark mode at `chrome://extensions/shortcuts` (Firefox: about:addons → ⚙ → Manage Extension Shortcuts). These work even on sites that capture Alt+Shift keys.

In-page shortcuts avoid the keys Chrome reserves on Windows (`Alt+Shift+T`, `I`, `A`, `B`), because pages never receive them.

## Features

| Category | Count | Highlights |
| --- | --- | --- |
| Reading | 12 | Reader mode, read aloud, dark mode per site, page outline, footnote previews, resume reading position |
| Links & URLs | 13 | Link hints, strip tracking parameters, skip redirect pages, deceptive-link warning, copy as Markdown |
| Video & media | 13 | Speed keys with per-site memory, skip ±10s, A–B repeat, picture-in-picture, save frame, Alt+scroll volume |
| Forms & text | 11 | Password generator, text drafts, character-limit counter, fill test data, form data as JSON |
| Keyboard | 7 | Command palette, `/` for search, next/previous page, shortcut cheat sheet |
| Annoyances | 8 | Cookie banners, sticky bars, newsletter pop-ups, scroll unlocking, copy/right-click unblocking |
| Productivity | 21 | Highlighter, colour picker, page notes, JSON viewer, selection → Markdown, calculator, save page as HTML |
| Tables | 4 | Sort, filter, copy for spreadsheets, download as CSV |
| Site packs | 16 | GitHub, YouTube, Wikipedia, Reddit, Amazon, Stack Exchange, Hacker News |

The settings page lists every feature with a description.

## Privacy

Browsekit has no server and no analytics. Settings sync through your browser account. Page notes, text drafts, per-site dark mode and video speeds, and reading positions stay in local extension storage on your device. Highlights are never stored. The only feature that contacts a third party is **Define selected word**: when you run it, it sends just the selected word to dictionaryapi.dev.

## Development

Requires Node.js 22+.

```sh
npm install
npx playwright install chromium
npm run verify        # everything CI runs: registry check, build, Firefox lint, browser tests
```

| Command | What it does |
| --- | --- |
| `npm run check` | Validates feature ids, categories and shortcut conflicts |
| `npm run build` | Writes store-ready, reproducible zips for Chromium browsers and Firefox to `dist/` |
| `npm run lint:firefox` | Lints the Firefox build with Mozilla's addons.mozilla.org rules |
| `npm test` | Runs the Playwright browser tests against `extension/` |
| `npm run test:headed` | Same, with a visible browser window |

### Project layout

```text
extension/                   the extension itself (load this folder unpacked)
  manifest.json
  src/core.js                registry + shared helpers (command, onKey, toast, addStyle, copyText, togglePanel…)
  src/runner.js              runs enabled features, starts newly enabled ones live, receives browser shortcuts
  src/background.js          browser-level shortcuts
  src/features/*.js          one file per category; each calls register() once per feature
  options/  popup/  icons/
scripts/                     build, icon generator, registry check
tests/                       Playwright tests; fake pages, no real network
.github/workflows/           CI, CodeQL, release + store publishing
```

### Adding a feature

```js
register({
  id: 'my-feature',                 // unique, kebab-case; used as the settings key
  name: 'My feature',
  category: 'productivity',         // a key from CATEGORIES in core.js
  description: 'One sentence a user can understand.',
  shortcut: 'Alt+Shift+X',          // optional, for display and conflict checking
  defaultEnabled: true,             // false if it changes how sites behave
  match: location => location.hostname.endsWith('example.com'),   // optional
  run() {
    // command() adds a palette entry and, when given a combo, a keyboard shortcut.
    // A handler that returns false means "not available here"; the palette tells the user so.
    command('Do my thing', null, () => { /* … */ });
  },
});
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the test pattern and guidelines, and [PUBLISHING.md](PUBLISHING.md) for releases and store publishing.

## License

[MIT](LICENSE)
