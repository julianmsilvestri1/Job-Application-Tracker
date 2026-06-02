# Phase 5 — Scale: Auth, Sync, Deployment, and Multi-Device

**Status:** optional, planned.

**Goal:** scale the portal beyond one local machine only when there is a real
need: phone + laptop access, hosted backups, collaboration with a coach, or
multi-user support. This phase changes the trust model, storage model, and
deployment model, so it must be deliberate.

**Default recommendation:** skip Phase 5 if the app remains a personal
single-machine tool. Local SQLite plus local uploads are simpler, cheaper, and
more private. Start Phase 5 only when multi-device or multi-user access is worth
the added security/ops complexity.

**Decision gates before coding:**
1. Is this still one user, just on multiple devices?
2. Will another person ever log in?
3. Should documents leave the local machine?
4. Do we need hosted backups?
5. Is mobile access required?
6. What is the acceptable security model for resumes, cover letters, and job
   search history?

**Units:** 5.0 → 5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 5.7 → 5.8

---

## Unit 5.0 — Scale decision record and architecture selection
- **Objective:** choose the minimum viable scale architecture before adding auth
  or moving data.
- **Depends on:** Phases 1.5, 2, 3, and 4 stable.
- **Packages:** none.
- **Schema:** none.
- **Deliverable:** `docs/architecture/scale-decision.md`.
- **Decision matrix:**
  | Option | Best for | Database | Files | Auth | Complexity |
  |---|---|---|---|---|---|
  | Local-only | one desktop | SQLite | local disk | none | lowest |
  | Self-host single user | laptop + phone | SQLite/libSQL | local/S3-compatible | one account | low-medium |
  | Hosted single user | backup + remote access | managed Postgres/Turso | S3/R2 | password/passkey | medium |
  | Multi-user | multiple candidates/coaches | Postgres | object storage | hosted auth/RBAC | highest |
- **Recommended technology paths:**
  - **Path A: SQLite on a server** with backups: minimal rewrite.
  - **Path B: libSQL/Turso**: SQLite-like sync-friendly hosted DB.
  - **Path C: Postgres**: best for true multi-user concurrency.
  - **Object storage:** S3-compatible bucket, Cloudflare R2, Backblaze B2, or
    local disk for self-host.
  - **Auth:** local email/password, passkeys/WebAuthn, or hosted auth.
- **Backend:** no behavior change.
- **Frontend:** no behavior change.
- **Tests:** none.
- **Acceptance:**
  - Decision record is committed with selected path and rejected alternatives.
  - Scope is explicitly single-user sync or multi-user.
- **Commit:** `docs(scale): choose auth and storage architecture`

---

## Unit 5.1 — User boundary and data ownership seam
- **Objective:** make all owned data user-scoped internally while preserving the
  current single-user behavior.
- **Depends on:** 5.0.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  CREATE TABLE users (
    id integer primary key autoincrement,
    email text unique,
    display_name text default '',
    created_at text default (datetime('now')),
    updated_at text default (datetime('now'))
  );

  INSERT OR IGNORE INTO users (id, email, display_name)
  VALUES (1, 'local@jobportal.invalid', 'Local User');
  ```
  Add `user_id integer default 1` to owned tables:
  - `profile`
  - `experiences`
  - `education`
  - `documents`
  - `applications`
  - `application_answers`
  - `job_scores` if scores are user/profile-specific.
  - `search_preferences`
  - Phase 2/4 tables as they exist.
- **Backend:**
  - Add `server/src/auth/userContext.js`:
    ```js
    export function getUserId(req) { return req.user?.id || 1; }
    export function requireUser(req, res, next) { ... } // no-op until auth
    ```
  - Thread `user_id` through every SELECT/INSERT/UPDATE/DELETE for owned data.
  - Replace hardcoded `profile WHERE id = 1` with `profile WHERE user_id = ?`
    while preserving a single profile row per user.
  - Add composite uniqueness where needed:
    - documents default per user/type.
    - applications source/external id per user.
    - search preferences one row per user.
- **Frontend:** no visible change.
- **Tests:**
  - Two seeded users cannot see each other's applications/documents.
  - Existing no-auth requests still use seed user id 1.
  - Migration backfills all existing rows to `user_id=1`.
- **Acceptance:**
  - Behavior is identical for local use.
  - Internally, all owned queries are user-scoped.
- **Commit:** `refactor(scale): add user ownership seam`

---

## Unit 5.2 — Authentication and session model
- **Objective:** protect hosted data and map requests to users.
- **Depends on:** 5.1.
- **Packages / options:**
  - **Local auth:** `bcrypt` or `argon2`, `cookie-session` or signed JWT cookies.
  - **Passkeys:** WebAuthn library if passwordless is selected.
  - **Hosted auth:** WorkOS AuthKit, Auth0, Clerk, or Supabase Auth if a managed
    provider is preferred.
- **Recommended baseline:** signed HTTP-only cookies for browser sessions.
  Avoid localStorage tokens for sensitive resume/application data.
- **Schema (migration) for local auth:**
  ```sql
  ALTER TABLE users ADD COLUMN password_hash text;
  ALTER TABLE users ADD COLUMN auth_provider text default 'local';
  ALTER TABLE users ADD COLUMN last_login_at text;

  CREATE TABLE sessions (
    id text primary key,
    user_id integer not null,
    expires_at text not null,
    created_at text default (datetime('now')),
    foreign key (user_id) references users(id) on delete cascade
  );
  ```
- **Backend:**
  - `POST /api/auth/register`.
  - `POST /api/auth/login`.
  - `POST /api/auth/logout`.
  - `GET /api/auth/me`.
  - Auth middleware on `/api/*` except:
    - `/api/health`
    - `/api/auth/*`
  - CSRF protection for cookie sessions:
    - SameSite=Lax cookies.
    - CSRF token header for unsafe methods if needed.
  - Rate-limit login attempts if exposed publicly.
- **Frontend:**
  - Auth context.
  - Login/register screens.
  - Route guard.
  - Session restore on page load.
  - Logout action in sidebar/settings.
- **Extension:**
  - The extension must detect auth failures and prompt user to open portal/login.
  - Do not store passwords/tokens in extension storage.
- **Tests:**
  - Register → login → read profile.
  - Bad password rejected.
  - Unauthenticated protected route returns 401.
  - User A cannot read User B data.
- **Acceptance:**
  - Hosted API is not readable without login.
  - Existing local seed user migration path works.
- **Commit:** `feat(auth): add user login and protected API`

---

## Unit 5.3 — Storage backend and file adapter
- **Objective:** make database rows and uploaded documents durable outside the
  local development machine.
- **Depends on:** 5.0, 5.1, 5.2.
- **Packages / options:**
  - SQLite path: existing `better-sqlite3`; optional Litestream outside app.
  - libSQL/Turso path: `@libsql/client` if selected.
  - Postgres path: `pg` if selected.
  - Object storage path: AWS SDK v3 S3 client or S3-compatible client.
- **Architecture:**
  - Introduce adapters:
    ```text
    server/src/db/
      sqlite.js
      postgres.js        // only if selected
      migrations.js
      index.js
    server/src/storage/
      localStorage.js
      s3Storage.js
      index.js
    ```
  - Document routes use `storage.put`, `storage.getStream`, `storage.delete`.
  - DB adapter exposes prepared query helpers or a small repository layer.
- **Schema changes:**
  - Add file storage metadata to `documents`:
    ```sql
    ALTER TABLE documents ADD COLUMN storage_provider text default 'local';
    ALTER TABLE documents ADD COLUMN storage_key text default '';
    ALTER TABLE documents ADD COLUMN checksum text default '';
    ```
  - Keep `stored_name` for backward compatibility until migration is complete.
- **Backend:**
  - Migration command:
    `npm run migrate:storage` copies local files to object storage and writes
    `storage_key`.
  - Download endpoint streams from selected adapter.
  - Upload endpoint writes through adapter.
  - Add checksum to detect corrupted uploads.
- **Frontend:** no visible change.
- **Tests:**
  - Storage adapter contract tests:
    - put/get/delete.
    - checksum.
    - missing file handling.
  - DB adapter contract tests if more than SQLite is supported.
- **Acceptance:**
  - App runs against selected durable storage.
  - Existing local uploads migrate or continue to work.
- **Commit:** `feat(scale): add durable storage adapters`

---

## Unit 5.4 — Sync API, conflict handling, and import/export
- **Objective:** make multi-device behavior predictable and recoverable.
- **Depends on:** 5.1–5.3.
- **Packages:** none.
- **Schema (migration):**
  ```sql
  ALTER TABLE applications ADD COLUMN deleted_at text;
  ALTER TABLE documents ADD COLUMN deleted_at text;
  ALTER TABLE application_tasks ADD COLUMN deleted_at text;

  CREATE TABLE sync_changes (
    id integer primary key autoincrement,
    user_id integer not null,
    entity_type text not null,
    entity_id text not null,
    operation text not null,             -- create | update | delete
    changed_at text default (datetime('now')),
    payload text default '{}',
    foreign key (user_id) references users(id) on delete cascade
  );
  CREATE INDEX idx_sync_changes_user_time ON sync_changes(user_id, changed_at);
  ```
- **Backend:**
  - Baseline multi-device can be simple server-authoritative CRUD with refresh.
  - Add optional sync endpoints:
    - `GET /api/sync/changes?since=timestamp`
    - `POST /api/sync/import`
    - `GET /api/sync/export`
  - Add soft delete for syncable entities.
  - Conflict policy:
    - Server timestamp wins for scalar fields.
    - Append-only for events.
    - Documents never auto-merge; create a second version.
    - Tasks merge by id; duplicates detected by label/category/application.
- **Frontend:**
  - Export/import buttons in Settings.
  - "Last synced" indicator if remote sync is enabled.
  - Conflict notification if import creates duplicates.
- **Innovative options:**
  - PWA offline mode with IndexedDB cache.
  - Background Sync API for queued offline edits.
  - Server-Sent Events for "data changed on another device".
- **Tests:**
  - Export includes all user-owned entities.
  - Import is idempotent.
  - Soft-deleted rows do not appear in normal lists.
  - Events append without conflict.
- **Acceptance:**
  - Data can be exported/imported safely.
  - Changes from another device appear after refresh or sync.
- **Commit:** `feat(sync): add export import and conflict policy`

---

## Unit 5.5 — Deployment and runtime operations
- **Objective:** run the portal at a reachable HTTPS URL with persistent data and
  repeatable operations.
- **Depends on:** 5.2, 5.3.
- **Packages:** none required.
- **Files:**
  ```text
  Dockerfile
  docker-compose.yml
  .dockerignore
  deploy/
    fly.toml             # if Fly.io selected
    render.yaml          # if Render selected
    railway.json         # if Railway selected
    README.md
  ```
- **Backend / infra:**
  - Dockerfile:
    - install root/server/client deps.
    - build client.
    - run Express serving API + built client.
  - Healthcheck:
    `GET /api/health` includes db and storage checks.
  - Env vars:
    - `DATABASE_URL` or SQLite path.
    - `STORAGE_PROVIDER`.
    - object storage credentials.
    - auth secret.
    - Anthropic/job-board keys.
  - Backups:
    - SQLite: Litestream or host volume backups.
    - Postgres: managed backups.
    - Object storage lifecycle and versioning.
- **Frontend:** production build already served by Express.
- **Tests:**
  - `docker build`.
  - container boots.
  - healthcheck passes.
  - upload/download smoke test in container.
- **Acceptance:**
  - App is reachable from another device via HTTPS.
  - Data persists across restarts.
  - Deployment instructions are documented.
- **Commit:** `feat(infra): add containerized deployment`

---

## Unit 5.6 — Security, privacy, and secrets hardening
- **Objective:** protect highly sensitive job-search data once it leaves a local
  laptop.
- **Depends on:** 5.2, 5.3, 5.5.
- **Packages / options:**
  - `helmet` for HTTP headers.
  - `express-rate-limit` for auth endpoints.
  - Optional encryption helper using Node `crypto`.
- **Backend:**
  - Security headers.
  - Rate limiting on auth and AI endpoints.
  - Request body limits reviewed for uploads vs JSON.
  - Audit event for login/logout/password change.
  - Secrets never returned by API.
  - Optional at-rest encryption for extracted resume text:
    - encrypt `documents.extracted_text`.
    - decrypt only when building AI context.
  - Add data deletion endpoint:
    `DELETE /api/account` with confirmation phrase.
- **Frontend:**
  - Privacy settings screen:
    - clear AI cache.
    - export all data.
    - delete account.
    - opt out of optional email/calendar integrations.
  - Show what is sent to AI before first AI use in hosted mode.
- **Extension:**
  - Portal URL allowlist.
  - No auth token in extension storage.
  - Clear selected application on logout.
- **Tests:**
  - Security headers present.
  - Auth rate limit works.
  - User data deletion removes owned rows and files.
  - Extracted text encryption round trip if enabled.
- **Acceptance:**
  - Hosted deployment has a documented privacy/security posture.
- **Commit:** `fix(security): harden hosted portal privacy`

---

## Unit 5.7 — Observability and supportability
- **Objective:** make hosted failures diagnosable without exposing sensitive data.
- **Depends on:** 5.5.
- **Packages / options:**
  - Baseline: structured logs with built-in console.
  - Optional: OpenTelemetry SDK.
  - Optional: Sentry or hosted log drain.
- **Backend:**
  - Request id middleware.
  - Structured logs:
    - route.
    - status.
    - duration.
    - user id hash, not email.
  - AI call metrics:
    - task.
    - source `ai|template|cache`.
    - latency.
    - error type.
  - Job-provider metrics:
    - provider.
    - result count.
    - timeout/error.
  - `GET /api/health/details` gated to admin/local only.
- **Frontend:**
  - Global error boundary.
  - "Copy diagnostics" button:
    - app version.
    - browser.
    - route.
    - recent non-sensitive errors.
- **Tests:**
  - Error middleware emits request id.
  - Diagnostics excludes profile/document/application content.
- **Acceptance:**
  - A production bug can be triaged from logs without leaking resume/job details.
- **Commit:** `feat(ops): add observability and diagnostics`

---

## Unit 5.8 — Multi-device UX, PWA, and collaboration
- **Objective:** make the hosted portal feel natural on mobile and optionally
  shareable with trusted collaborators.
- **Depends on:** 5.2–5.6.
- **Packages / options:**
  - PWA manifest and service worker (Vite PWA plugin optional).
  - Web Push later if notifications are desired.
- **Schema (migration) for collaboration if needed:**
  ```sql
  CREATE TABLE user_roles (
    id integer primary key autoincrement,
    owner_user_id integer not null,
    member_user_id integer not null,
    role text default 'viewer',          -- viewer | coach | editor
    created_at text default (datetime('now')),
    foreign key (owner_user_id) references users(id) on delete cascade,
    foreign key (member_user_id) references users(id) on delete cascade
  );
  ```
- **Frontend:**
  - Responsive mobile layouts:
    - bottom nav on small screens.
    - application workspace as full-screen drawer.
    - compact Dashboard widgets.
  - PWA:
    - installable manifest.
    - app icons.
    - offline read-only cache for dashboard/applications.
  - Collaboration (optional):
    - invite mentor/coach.
    - role-based read/comment/edit.
    - comments on applications/documents.
- **Backend:**
  - Role checks if collaboration is enabled.
  - `GET /api/me/permissions`.
  - Comment APIs if not already present:
    `POST /api/applications/:id/comments`.
- **Innovative ideas:**
  - Accountability mode: weekly digest of applications, due tasks, and blocked
    items.
  - Coach review mode: share one application packet without exposing all data.
  - Mobile quick action: mark follow-up complete after receiving a reply.
- **Tests:**
  - Responsive smoke via component tests where feasible.
  - Role isolation: viewer cannot mutate, editor can.
  - PWA manifest exists and references icons.
- **Acceptance:**
  - Portal is usable from phone.
  - Optional collaborator can see only permitted data.
- **Commit:** `feat(scale): add mobile PWA and collaboration options`

---

## Phase exit criteria
- [ ] Decision record chooses local-only, self-host single-user, hosted
      single-user, or multi-user.
- [ ] Data model has a user ownership seam with isolation tests.
- [ ] Auth is enforced if hosted.
- [ ] Durable DB and document storage are selected and adapter-tested.
- [ ] Export/import or sync behavior is defined and tested.
- [ ] Deployment is containerized, documented, and health-checked.
- [ ] Security/privacy controls are documented and implemented for hosted mode.
- [ ] Observability captures failures without sensitive content.
- [ ] Mobile/PWA/collaboration enhancements are implemented only if they match
      the chosen scale path.

## When to skip
Skip Phase 5 while the portal is personal and local. Revisit only when the user
needs another device, backups, hosted access, or collaboration.
