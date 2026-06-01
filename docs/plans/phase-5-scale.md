# Phase 5 — Scale: Auth & Multi-Device Sync (optional)

**Goal:** only if single-machine SQLite is outgrown (you want the portal on your
phone + laptop, or share it). This phase is **optional** and the largest
behavioral change, so it's gated behind a real need. See conventions in
[README.md](./README.md).

**Decision gate before starting:** confirm the deployment target (self-hosted
single user across devices? small multi-user?) — it changes auth and storage
choices. Use one hosted Postgres or keep SQLite-on-a-server accordingly.

**Units:** 5.0 (decision) → 5.1 → 5.2 → 5.3 → 5.4

---

## Unit 5.0 — Multi-tenancy decision & data-model prep
- **Objective:** decide single-user-multi-device vs. multi-user; introduce a
  `user_id` seam without behavior change.
- **Depends on:** all prior phases stable.
- **Schema (migration):** add nullable `user_id` to every owned table
  (`profile`, `documents`, `applications`, …), defaulting to a single seed user
  (`id = 1`) so existing data keeps working. Add a `users` table.
- **Backend:** introduce a `getUserId(req)` helper returning the seed user until
  auth lands (5.1), and thread it through queries (replace the hardcoded
  `profile id = 1` with per-user lookups).
- **Acceptance:** app behaves identically; all queries are user-scoped internally.
- **Commit:** `refactor(db): add user_id seam for multi-tenancy`

---

## Unit 5.1 — Authentication
- **Objective:** protect the API + associate data with a user.
- **Depends on:** 5.0.
- **Packages:** `bcrypt` (hashing), `jsonwebtoken` or signed `cookie-session`.
- **Backend:** `users` table (email, password_hash); `POST /api/auth/register`,
  `/login`, `/logout`, `GET /api/auth/me`; auth middleware on `/api/*` (except
  health/auth). `getUserId(req)` now reads the verified session/JWT.
- **Frontend:** login/register screen; auth context guarding routes; attach token
  / send cookies in `api.js`.
- **Tests:** register→login→access protected route; bad creds rejected; data
  isolation between two users.
- **Acceptance:** unauthenticated requests are rejected; users see only their data.
- **Commit:** `feat(auth): user accounts and protected API`

---

## Unit 5.2 — Storage backend for multi-device
- **Objective:** durable, network-accessible storage.
- **Depends on:** 5.1.
- **Options (pick at 5.0):**
  - **Keep SQLite** on a single small server (e.g. Litestream for backup) — least
    change; fine for single user across devices.
  - **Postgres** (managed) — better for multi-user/concurrency. Introduce a thin
    DB adapter so query sites don't care; migrate the migration runner to the
    chosen engine.
  - **Object storage** (S3-compatible) for uploaded documents instead of local
    disk; store keys in `documents`.
- **Backend:** DB adapter + storage adapter; env-driven selection; migrations
  ported.
- **Tests:** adapter contract tests run against the chosen engine in CI (service
  container) + SQLite for local.
- **Acceptance:** the app runs against the chosen backend; documents stored
  durably; existing data migrated.
- **Commit:** `feat(infra): pluggable DB + object storage`

---

## Unit 5.3 — Deployment
- **Objective:** run it somewhere both devices can reach.
- **Depends on:** 5.1–5.2.
- **Backend/infra:** `Dockerfile` (build client, serve via Express — `index.js`
  already serves `client/dist`), `docker-compose.yml` (app + Postgres),
  deployment notes (Fly.io/Render/railway). Secrets via env. HTTPS.
- **Tests:** container builds; healthcheck passes.
- **Acceptance:** reachable URL with login; data persists across restarts.
- **Commit:** `feat(infra): containerized deployment`

---

## Unit 5.4 — Sync niceties (optional)
- **Objective:** smoother multi-device UX.
- **Depends on:** 5.3.
- **Scope:** per-user data export/import; optimistic UI; (far future) realtime
  via SSE/WebSocket for live tracker updates across devices.
- **Acceptance:** changes on one device appear on another after refresh (or live
  if realtime added).
- **Commit:** `feat(sync): export/import and live updates`

---

## Phase exit criteria
- [ ] Deployment target decided (5.0) before building.
- [ ] Auth enforced; per-user data isolation tested.
- [ ] Durable storage (DB + documents) for the chosen target.
- [ ] Reachable, containerized deployment with persistent data.

## When to skip
If the app stays on one machine for personal use, **skip this phase** — SQLite +
local files are simpler and sufficient. Revisit only when you actually need
another device or user.
