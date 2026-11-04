# Publishing Browsekit

`npm run build` produces store-ready packages in `dist/`:

| Package | Stores |
| --- | --- |
| `browsekit-chrome-<version>.zip` | Chrome Web Store, Microsoft Edge Add-ons, Opera add-ons (Brave and Vivaldi install from the Chrome Web Store) |
| `browsekit-firefox-<version>.zip` | Firefox Add-ons (addons.mozilla.org), desktop and Android |

The builds are reproducible: the same source always gives byte-identical zips.

**Safari** needs Xcode on a Mac. Run `xcrun safari-web-extension-converter dist/chrome` to wrap the build in an app, then submit it to the App Store. This step isn't automated.

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
