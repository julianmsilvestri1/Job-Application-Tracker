# Safari Autofill Extension (Phase 2 — scaffold)

This is the starting point for the phase-2 Safari Web Extension that fills
job-application forms on external sites (Indeed, LinkedIn, company ATS pages)
directly from your saved profile.

> Status: **scaffold**. The content-script heuristics below work as a starting
> point; the production version will pull live profile data from the running
> portal (`GET /api/assistant/autofill`) and add per-site field maps.

## How it will work

1. The portal exposes your profile as labelled fields at
   `http://localhost:4000/api/assistant/autofill`.
2. The extension's content script scans the current page's form fields, matches
   them to your profile fields by label / name / autocomplete attributes, and
   fills them on click.
3. You review and submit — the extension never auto-submits.

## Loading it during development (as a Web Extension)

Safari extensions must be wrapped in an Xcode project for distribution, but you
can iterate on the web-extension parts directly:

1. Open Safari → Settings → Advanced → enable **Show Develop menu**.
2. Develop → **Allow Unsigned Extensions**.
3. Use `xcrun safari-web-extension-converter ./extension-safari` to generate the
   Xcode project, then run it.

The same `manifest.json` + `content.js` also load in Chrome/Edge via
`chrome://extensions` → "Load unpacked", which is handy for quick testing.

## Files

- `manifest.json` — MV3 manifest.
- `content.js` — field-detection + fill logic (heuristic starting point).
- `popup.html` / `popup.js` — toolbar button that triggers autofill.
