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

On a detected ATS apply page (Greenhouse/Lever/Ashby/Workday…), an optional
**inline review** panel appears (handy on iPad where the toolbar popup is
small): select a saved application, preview/copy the packet, or trigger apply —
all from the page. Dismiss it and it stays hidden for that page/session.

## Using the extension on iPad (important)

On iPad, `http://localhost:4000` points at the **iPad**, not your Mac.

1. Run the portal on your Mac (or NAS) with **`HOST=0.0.0.0`** in `server/.env`.
2. Find your machine's LAN address (e.g. `192.168.1.42`). On many networks the
   mDNS name `http://<your-mac-hostname>.local:4000` also works.
3. Install/enable the extension (below), then in **Options** set the portal URL
   to `http://192.168.1.42:4000` and tap **Test connection** (clear errors tell
   you if the host is unreachable or if you used `https` for a local `http` server).
4. Keep Mac and iPad on the same Wi‑Fi; allow local network access if iOS prompts.
5. Enable it on the device: **Settings → Apps → Safari → Extensions → Job Apply**
   (older iPadOS: **Settings → Safari → Extensions**), and allow it on the ATS host.

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
`safari-web-extension-converter` generates an Xcode project with **both iOS and
macOS targets** from the same `dist/safari/`. Open `safari-app/*.xcodeproj`, pick
your **iPad** (or Mac) run destination, build & run, then enable under
**Settings → Apps → Safari → Extensions** (iPadOS) / Safari ▸ Settings ▸
Extensions (macOS). Safari on Mac: **Develop → Allow Unsigned Extensions** for
local dev.

### Distribution (pick one; development is the default for testing)
- **Development (recommended for now):** run from Xcode straight to a USB/paired
  iPad with a free Apple ID signing team. Re-run after each `npm run build`.
- **Ad Hoc:** archive in Xcode → export Ad Hoc with the device UDID registered;
  install the `.ipa` for a small device list without TestFlight.
- **TestFlight:** archive → upload to App Store Connect → distribute to testers
  (best for several iPads; requires a paid Apple Developer account).

> CORS: the portal currently allows extension origins (development). Locking
> `/api/extension/*` to the specific macOS + iPad extension IDs via
> `EXTENSION_ALLOWED_ORIGINS` is the Unit 2.7/2.8 hardening step.

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
