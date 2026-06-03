# Browser extension — Safari (iPad) + Chrome (desktop)

Phase 2 ships **one shared codebase** as:

| Target | Why |
|--------|-----|
| **Safari on iPad** | **Primary mobile** apply surface — iOS/iPadOS only supports extensions in Safari, not Chrome |
| **Safari on Mac** | Same Safari Web Extension binary family |
| **Chrome / Arc / Edge** | Fast desktop dev via unpacked `dist/chrome/` |

> Status: **scaffold**. Production build: shared `src/` → `dist/chrome/` + `dist/safari/` per [`docs/plans/phase-2-apply.md`](../docs/plans/phase-2-apply.md).

## How it works

1. The portal exposes per-application data via the **packet API** (`GET /api/applications/:id/packet`) and a generic autofill map (`GET /api/assistant/autofill`).
2. The content script matches form fields to packet fields (per-ATS maps + generic fallback).
3. You review and submit — the extension **never** auto-submits.

## Using the extension on iPad (important)

On iPad, `http://localhost:4000` points at the **iPad**, not your Mac.

1. Run the portal on your Mac (or NAS) with **`HOST=0.0.0.0`** in `server/.env`.
2. Find your machine’s LAN address (e.g. `192.168.1.42`).
3. In the extension **Options**, set portal URL to `http://192.168.1.42:4000` and tap **Test connection**.
4. Keep Mac and iPad on the same Wi‑Fi; allow local network access if iOS prompts.

Then open an employer ATS apply page in **Safari** (not Chrome on iOS — Chrome cannot load extensions).

## Development

### Chrome (quick iteration)

```bash
cd extension-safari
npm install
npm run build          # → dist/chrome/
```

Load `dist/chrome/` in `chrome://extensions` → Developer mode → Load unpacked.

### Safari (Mac + iPad)

```bash
npm run build          # → dist/safari/
xcrun safari-web-extension-converter dist/safari \
  --project-location safari-app \
  --macos-only false   # include iOS/iPadOS target when supported
```

Open `safari-app/*.xcodeproj` in Xcode, select your **iPad** as run destination, build & run. Enable the extension under **Settings → Safari → Extensions** on the device.

Safari on Mac: **Develop → Allow Unsigned Extensions** during local dev.

## Files (today’s scaffold)

- `manifest.json` — MV3 manifest (will move under `dist/chrome` / `dist/safari`)
- `content.js` — field detection + fill (will bundle to IIFE, no top-level `export`)
- `popup.html` / `popup.js` — toolbar UI

## Phase 2 plan

Full units (2.5, 2.5b, 2.6–2.8): [`docs/plans/phase-2-apply.md`](../docs/plans/phase-2-apply.md)
