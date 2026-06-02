# Phase 7 — Connected Portal (live + conversational)

**Goal:** make the portal feel **alive** (real-time updates) and **connected**
(controllable from outside the React UI). Two independent units, one theme:
the portal reacts instantly and can be driven conversationally.

These are additive and low-risk; both have graceful no-ops and neither is on the
critical path to first autonomous apply. Sequence after the apply engine
(Phase 6) so there are agent events worth streaming and routes worth exposing.

**Units:** 7.1 (SSE live tracker) · 7.2 (custom MCP server)

---

## Unit 7.1 — Server-Sent Events: a live tracker
- **Objective:** the Kanban and dashboards update in real time as state changes —
  from a manual edit, the extension, the apply queue, or the Playwright runner.
- **Depends on:** none required; most valuable after 6.2/6.5 (apply-run events).
- **Backend:**
  - `services/events.js`: a process-local `EventEmitter` bus with a typed
    `emit(type, payload)` helper.
  - `GET /api/events` (SSE): sets `Content-Type: text/event-stream`, writes
    `data: {json}\n\n` frames, sends a periodic heartbeat comment to keep the
    connection alive, and cleans up listeners on `req.close`.
  - Emit points: `application.created`, `application.status_changed`,
    `job.saved`, and the apply-run lifecycle
    `agent.run_started | run_needs_input | run_completed | run_failed`
    (these turn the tracker into a live monitor for batch apply sessions, 6.5).
- **Frontend:** `useEventStream(onEvent)` hook wrapping `EventSource` with
  auto-reconnect + backoff; `Applications` (Kanban) and `Dashboard` subscribe on
  mount and patch state in place (move a card, bump a stat) instead of refetching.
- **Tests:** the emitter fires on a status change (unit); the endpoint sets SSE
  headers and formats a frame (light integration); the hook parses an event and
  invokes the callback (client test with a mocked `EventSource`).
- **Acceptance:** changing an application's status in one tab (or via the agent)
  moves the card in another open tab within a second, with no manual refresh.
- **Caveat:** SSE here is single-process/local. Multi-client across devices needs
  Phase 5 (cloud/auth); documented as such.
- **Commit:** `feat(tracker): real-time updates via Server-Sent Events`

---

## Unit 7.2 — Custom MCP server (job hunt from Claude Desktop / Cursor)
- **Objective:** expose the portal's capabilities as MCP tools so the whole job
  hunt becomes a conversational workflow — "find remote React roles", "save this
  one", "draft a cover letter", "what's in my pipeline?" — without opening the UI.
- **Depends on:** the existing REST API (1.5+/3); read-only tools work today.
- **Packages:** `@modelcontextprotocol/sdk`.
- **Backend:** a separate, thin **stdio MCP server** in `mcp-server/` that calls
  the local Express API (configurable base URL + optional shared token). Tools:

  | Tool | Maps to | Enables |
  |------|---------|---------|
  | `search_jobs` | `GET /api/jobs/search` | "Find remote React roles on Remotive" |
  | `get_profile` | `GET /api/profile` | context for any generation |
  | `get_pipeline` | `GET /api/applications` | "What's in my pipeline?" |
  | `draft_cover_letter` | `POST /api/assistant/cover-letter` | "Draft a letter for this JD" |
  | `save_job` | `POST /api/applications` | "Save this job to my tracker" |
  | `update_status` | `PATCH /api/applications/:id` | "Mark Stripe as interviewing" |

  - **Safety:** read tools are unrestricted; write tools are explicit and echo
    what changed. The MCP server **never** exposes apply/auto-submit — autonomy
    stays behind the Phase 6 policy + approval gate, never reachable as a tool.
- **Frontend:** none. Ship a documented Claude Desktop / Cursor `mcpServers`
  config snippet in the `mcp-server/` README.
- **Tests:** each tool invokes the correct route with validated input (mock
  `fetch`); unknown/oversized inputs are rejected; write tools require explicit
  args.
- **Acceptance:** from Cursor/Claude Desktop, a user can search, save, draft, and
  re-stage applications conversationally; nothing can auto-submit through MCP.
- **Commit:** `feat(mcp): expose the portal as MCP tools for Claude Desktop/Cursor`

---

## Phase exit criteria
- [ ] Tracker and dashboard update live via SSE; reconnects cleanly.
- [ ] Apply-run lifecycle events stream to the UI (live batch monitor).
- [ ] MCP server exposes search/profile/pipeline/draft/save/status tools with
      guarded writes and **no** apply/submit capability.
- [ ] Both degrade safely (SSE no-ops without listeners; MCP optional).
