# Publishing Browsekit

`npm run build` produces a package for each store in `dist/`:

| Package | Store | Notes |
| --- | --- | --- |
| `browsekit-chrome-<version>.zip` | [Chrome Web Store](https://chrome.google.com/webstore/devconsole) | Brave and Vivaldi users install from here too |
| `browsekit-edge-<version>.zip` | [Microsoft Edge Add-ons](https://partner.microsoft.com/dashboard/microsoftedge) | |
| `browsekit-opera-<version>.zip` | [Opera add-ons](https://addons.opera.com/developer/) | |
| `browsekit-firefox-<version>.zip` | [Firefox Add-ons](https://addons.mozilla.org/developers/) | Desktop and Android |
| `browsekit-safari-macos-<version>-unsigned.zip` | Mac App Store, via Xcode | Built on macOS by CI, see below |

The Chromium packages share the same code and declare `minimum_chrome_version` 110. Firefox requires version 140 (142 on Android). The builds are reproducible: the same source always gives byte-identical zips.

### Safari

Safari extensions ship inside a Mac app, so they need Xcode, which only runs on macOS. The **Safari build** workflow (`.github/workflows/safari.yml`) does this on a GitHub macOS runner, on every CI run and release:

1. `xcrun safari-web-extension-converter dist/safari` wraps the extension in an Xcode project (bundle ID `io.github.anonymous020786.browsekit`).
2. `xcodebuild` compiles it **unsigned** and the app is zipped as `browsekit-safari-macos-<version>-unsigned.zip`.

The unsigned app is fine for testing (see the README). To publish on the Mac App Store you need an Apple Developer account ($99/year):

1. On a Mac, run the same converter command, then open the generated project in Xcode.
2. Pick your team under **Signing & Capabilities** for both the app and the extension targets.
3. **Product → Archive**, then **Distribute App → App Store Connect**, and complete the listing in App Store Connect.

iOS and iPadOS Safari need the same steps without `--macos-only` in the converter command.

## Releasing

1. Bump `version` in `extension/manifest.json` (and `package.json`).
2. Commit, then tag and push:

   ```sh
   git tag v1.1.0
   git push origin v1.1.0
   ```

3. The **Release** workflow checks that the tag matches the manifest. It then runs every check and test and creates a GitHub release with both zips and a `SHA256SUMS.txt`.

## Automatic store publishing (optional)

Each store job stays off until you turn it on. To turn one on, add the repository **variable** listed below (Settings → Secrets and variables → Actions → Variables), plus that store's secrets. Each job runs in its own GitHub **environment**, so you can require a manual approval before anything is published (Settings → Environments → add required reviewers).

**Submit the first version of each listing by hand.** That's where you write the store description and add screenshots. The workflows only handle updates.

### Chrome Web Store

- Variables: `PUBLISH_CHROME` = `true`, `CWS_EXTENSION_ID` = the item ID from the developer dashboard.
- Secrets (environment `chrome-web-store`): `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`. Create an OAuth client in Google Cloud with the Chrome Web Store API enabled, then get a refresh token for the `https://www.googleapis.com/auth/chromewebstore` scope.
- The job uses the v1.1 publishing API. If Google retires it, update the two URLs in `.github/workflows/release.yml`.

### Firefox Add-ons

- Variable: `PUBLISH_FIREFOX` = `true`.
- Secrets (environment `firefox-addons`): `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`, from <https://addons.mozilla.org/developers/addon/api/key/>.
- The add-on ID is fixed in the manifest (`{cb2924fa-d82d-4ba1-93fe-d40c9ffea53d}`). Keep it unchanged, or Firefox treats the upload as a different add-on.

### Microsoft Edge Add-ons

- Variables: `PUBLISH_EDGE` = `true`, `EDGE_PRODUCT_ID` from Partner Center.
- Secrets (environment `edge-addons`): `EDGE_CLIENT_ID`, `EDGE_API_KEY`, from Partner Center → Microsoft Edge → Publish API.

## Store listing notes

- **Permissions to justify:** `storage` (settings, notes, drafts), `tabs` (popup tab tools: copy URLs, close duplicates, sort, mute), `clipboardWrite` (copy commands), and content scripts on all sites (the features work on every page).
- **Data use:** no data is collected. Everything stays on the device. The only exception is "Define selected word", which sends the selected word to dictionaryapi.dev when the user runs it. The Firefox manifest declares `data_collection_permissions: none`; ask AMO review if they want that feature declared differently.
- **Icons:** `extension/icons/` holds the 16, 32, 48 and 128 px icons. To change the design, edit and rerun `node scripts/make-icons.mjs`.
- **Screenshots:** every store asks for at least one, at 1280×800 or 640×400. A good set: the command palette, reader mode, link hints, and the settings page.
