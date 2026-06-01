# Cross-cutting — Correctness & Quality

**Goal:** cheap, high-confidence fixes + a test/CI safety net that de-risks every
later phase. Do these right after Phase 1.5. See conventions in
[README.md](./README.md).

**Units:** C.1 → C.2 → C.3 → C.4 → C.5 (C.1 first so later units land green).

---

## Unit C.1 — Test harness & CI
- **Objective:** make tests runnable and gate them in CI.
- **Depends on:** 1.5.0 (migrations) helps DB tests.
- **Packages:** client dev deps `vitest`, `jsdom`, `@testing-library/react`,
  `@testing-library/jest-dom`. Server uses built-in `node --test` (no dep).
- **Backend:** add `"test": "node --test"` to `server/package.json`.
- **Frontend:** add `"test": "vitest run"`, `vitest.config.js` (jsdom env),
  `client/src/test/setup.js` (jest-dom matchers).
- **Root:** `"test": "npm run test --prefix server && npm run test --prefix client"`.
- **CI:** `.github/workflows/ci.yml`:
  ```yaml
  on: [push, pull_request]
  jobs:
    build-test:
      runs-on: ubuntu-latest
      strategy: { matrix: { node: [20, 22] } }
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: ${{ matrix.node }} }
        - run: npm run install:all
        - run: npm run lint --if-present
        - run: npm test
        - run: npm run build
  ```
- **Tests:** one smoke test per side so CI has something to run.
- **Acceptance:** CI is green on a PR; `npm test` works locally.
- **Commit:** `chore: add node:test + vitest harness and CI workflow`

> **SessionStart hook tie-in:** the `session-start-hook` skill can ensure web
> sessions install deps and can run tests/lint — worth adding once CI exists.

---

## Unit C.2 — Lint
- **Objective:** consistent style, catch dead code/unused vars.
- **Depends on:** C.1.
- **Packages:** `eslint`, `eslint-plugin-react`, `eslint-plugin-react-hooks`,
  `globals` (flat config).
- **Files:** root `eslint.config.js` (flat) covering `server` (node globals,
  ESM) and `client` (browser + react). `"lint"` scripts per workspace + root.
- **Tests:** n/a (lint is the check). Fix all surfaced issues.
- **Acceptance:** `npm run lint` clean; wired into CI (already referenced in C.1).
- **Commit:** `chore: add ESLint flat config and fix lint`

---

## Unit C.3 — Dedupe by stable identity
- **Objective:** stop cross-board duplicates and unstable tracking ids.
- **Depends on:** C.1 (tests).
- **Schema:** none.
- **Backend:** `services/jobProviders/index.js` `dedupe()`:
  - Primary key = normalized canonical URL (strip query/hash, lowercase host).
  - Fallback key = `source + ':' + externalId`.
  - Last resort = `company|title`.
  - Add `normalizeUrl(url)` to `util.js`.
  - Revisit Jooble `externalId`: derive from the canonical URL so the same
    posting yields the same id across searches (already hashed from link — make
    it hash the *normalized* link).
- **Tests:** `dedupe.test.js` — same posting from two boards (same URL, different
  title casing) collapses to one; different postings stay separate.
- **Acceptance:** searching a common term shows no obvious dupes.
- **Commit:** `fix(search): de-dupe by canonical URL/id`

---

## Unit C.4 — Provider query fidelity
- **Objective:** better precision on client-filtered boards.
- **Depends on:** C.1.
- **Schema:** none.
- **Backend:**
  - Jobicy: pass multiple tags (the API accepts `tag`; send the most significant
    1–2 terms, still apply `localFilter`).
  - The Muse: map common keywords → Muse `category` where possible to reduce
    over-fetch before local filtering.
  - Document each board's search capability in code comments + README table.
- **Tests:** unit-test the query-building helpers (no network).
- **Acceptance:** a precise query (e.g. "react native") returns tighter results
  from client-filtered boards.
- **Commit:** `fix(search): improve query fidelity for Jobicy/Muse`

---

## Unit C.5 — Doc/schema drift & small hygiene
- **Objective:** remove misleading docs and tidy.
- **Depends on:** none.
- **Backend:** fix `server/src/db.js` (now migration #1) `applications.source`
  comment to list all 8 sources + `manual`. Audit other comments for drift.
- **Frontend:** none.
- **Tests:** none.
- **Acceptance:** comments match behavior.
- **Commit:** `docs: correct source list and stale comments`

---

## Phase exit criteria
- [ ] `npm test` runs server + client tests; CI green on Node 20 & 22.
- [ ] `npm run lint` clean.
- [ ] Cross-board dedupe by URL/id with tests.
- [ ] Jobicy/Muse query building improved + tested.
- [ ] No stale schema comments.
