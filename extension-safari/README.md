# Browser extension — Safari (iPad) + Chrome (desktop)

One **shared core** (`src/`) bundled to two shippable targets:

| Target | Why |
|--------|-----|
| **Safari on iPad** | **Primary mobile** apply surface — iOS/iPadOS only supports extensions in Safari, not Chrome |
| **Safari on Mac** | Same Safari Web Extension binary family |
| **Chrome / Arc / Edge** | Fast desktop dev via unpacked `dist/chrome/` |

## How it works (Trigger UI — Unit 2.4 pivot)

The extension is a thin **Trigger UI**. It does **not** scrape, map, or fill the
page DOM — all form intelligence and submission happen server-side via the
backend **Stagehand** service (Unit 2.4) over the Chrome DevTools Protocol.

1. The portal exposes per-application data via the **packet API**
   (`GET /api/applications/:id/packet`).
2. The popup lists your saved applications, previews the selected packet, and
   lets you **copy** grouped fields/answers.
3. **Apply for me** sends `{ applicationId, url }` to
   `POST /api/extension/trigger-apply`; the backend fills and (when policy
   allows) submits. Sensitive/EEO fields are never auto-filled.

## Using the extension on iPad (important)

On iPad, `http://localhost:4000` points at the **iPad**, not your Mac.

1. Run the portal on your Mac (or NAS) with **`HOST=0.0.0.0`** in `server/.env`.
2. Find your machine's LAN address (e.g. `192.168.1.42`).
3. In the extension **Options**, set portal URL to `http://192.168.1.42:4000` and tap **Test connection**.
4. Keep Mac and iPad on the same Wi‑Fi; allow local network access if iOS prompts.

## Development

```bash
cd extension-safari
npm install
npm run build     # esbuild → dist/chrome/ and dist/safari/ (same JS, manifest differs)
npm test          # build both targets + run unit tests
```

### Chrome
Load `dist/chrome/` in `chrome://extensions` → Developer mode → Load unpacked.

### Safari (Mac + iPad)
```bash
npm run build                      # → dist/safari/
./scripts/build-safari.sh          # wraps xcrun safari-web-extension-converter
```
Open the generated `safari-app/*.xcodeproj`, pick your **iPad** (or Mac) run
destination, build & run, then enable under **Settings → Safari → Extensions**.
Safari on Mac: **Develop → Allow Unsigned Extensions** during local dev.

## Layout

```text
src/
  content.js              # thin: reports page hostname/url to the popup (no DOM fill)
  popup.html / popup.js   # Trigger UI: select app, preview, copy, "Apply for me"
  options.html/options.js # portal URL + Test connection + privacy copy
  shared/storage.js       # browser.storage / chrome.storage abstraction
  shared/portalClient.js  # packet + trigger-apply client (no hardcoded host)
  manifest.chrome.json    # MV3 (Chromium)
  manifest.safari.json    # MV3 (Safari converter input)
build.mjs                 # esbuild → dist/chrome + dist/safari (IIFE, no top-level export)
scripts/build-safari.sh   # Xcode project generation (kept separate; brittle in CI)
test/                     # build, storage round-trip, portal-unreachable
```

## Phase 2 plan

Full units (2.5, 2.5b, 2.6–2.8): [`docs/plans/phase-2-apply.md`](../docs/plans/phase-2-apply.md)
