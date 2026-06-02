# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

Local-first **Job Application Portal** (npm monorepo): `client/` (React + Vite), `server/` (Express + SQLite). Optional `extension-safari/` scaffold is not required for core dev.

### Services

| Service | Port | Start command |
|---------|------|---------------|
| API + SQLite | 4000 | `npm run dev:server` or `npm run dev` |
| Vite client (dev) | 5173 | `npm run dev:client` or `npm run dev` |
| Prod (API + static UI) | 4000 | `npm run build` then `npm start` |

Run both with `npm run dev` from repo root (uses `concurrently`). Health check: `GET http://localhost:4000/api/health` → `{"ok":true}`.

### Dependencies

On first setup or after lockfile changes: `npm run install:all` (root + `server/` + `client/`). Requires **Node.js ≥ 18** (repo tested on 22). Copy `server/.env.example` → `server/.env` if missing; app works with zero API keys (five boards + template cover letters).

### Lint / tests

This repo has **no** ESLint, Prettier, or automated test scripts in `package.json`. Validate with `npm run build` and manual/API checks.

### Non-obvious notes

- Vite proxies `/api` to port 4000 in dev; do not point the browser at `:4000` alone unless using production `npm start`.
- SQLite DB: `server/data/app.db`; uploads: `server/uploads/` (both gitignored, created at runtime).
- Job search hits external HTTPS APIs; outbound network must be available for Search to return results.
- `better-sqlite3` is a native addon; if install fails, ensure build tools are present (usually fine on standard Linux dev images).

See [README.md](./README.md) for API keys and board configuration.
