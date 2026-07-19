# FxTwitter Following Comment Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refill automatic-comment candidates from `@terafabXai`'s FxTwitter following graph and recent 24-hour root posts without automatic X home navigation, while retaining a dashboard-only one-shot X home diagnostic.

**Architecture:** Add pure normalization, cutoff, cache, and retry helpers around the FxTwitter `/2/profile/{handle}/following` and `/statuses` endpoints. The automatic discovery function consumes the existing reservoir, refills it through a bounded FxTwitter worker pool, and keeps the current status validation/Grok/Gemini/pending pipeline unchanged. Extract the existing headed X home collector behind an explicit API action and expose discovery diagnostics in the dashboard.

**Tech Stack:** Node.js CommonJS, built-in `fetch`, `node:test`, React 19, Vite 8, existing JSON state and dashboard API.

## Global Constraints

- Required X account remains `@terafabXai`.
- Automatic target discovery must never navigate to `https://x.com/home`.
- Candidate age is strictly limited to the preceding 24 hours.
- Following cache refresh interval is six hours.
- FxTwitter partial failures must not stop successful account results.
- X home is available only through the explicit dashboard action `X 홈 1회 스캔`.
- Existing Grok context, Gemini review, pending queue, and reply posting quality gates remain unchanged.
- Preserve unrelated dirty-worktree changes and stage only files from this feature.

---

### Task 1: FxTwitter Following and Timeline Domain Helpers

**Files:**
- Modify: `mirror_server.js:1190-1200`
- Modify: `mirror_server.js:4829-4860`
- Modify: `mirror_server.js:15913-16080`
- Test: `test/own-post-reply.test.js:1-40`
- Test: `test/own-post-reply.test.js:760-830`

**Interfaces:**
- Produces: `normalizeFxTwitterFollowingAccounts(value) -> Array<Account>`
- Produces: `normalizeFxTwitterFollowingCandidates(value, options) -> Array<Candidate>`
- Produces: `terafabxFxTwitterFollowingPlan(options) -> Plan`
- Produces: `terafabxFxTwitterRetryAt(failureCount, nowMs) -> ISO string`
- Produces: state defaults for following cache, per-handle sync state, and cycle diagnostics.

- [ ] **Step 1: Write failing normalization and cutoff tests**

Add tests that import the four helpers and assert:

```js
assert.deepEqual(normalizeFxTwitterFollowingAccounts([
  { id: "1", screen_name: "Alice", name: "Alice", protected: false },
  { id: "1", screen_name: "alice", name: "duplicate" },
  { screen_name: "terafabXai" },
  { screen_name: "" },
]), [{ id: "1", handle: "Alice", name: "Alice", protected: false }]);

const now = Date.parse("2026-07-19T15:00:00.000Z");
assert.deepEqual(normalizeFxTwitterFollowingCandidates([
  { id: "11", url: "https://x.com/Alice/status/11", text: "recent root", created_at: "2026-07-19T14:00:00.000Z", author: { screen_name: "Alice" } },
  { id: "12", url: "https://x.com/Alice/status/12", text: "old", created_at: "2026-07-18T14:59:59.999Z", author: { screen_name: "Alice" } },
  { id: "13", url: "https://x.com/Alice/status/13", text: "reply", created_at: "2026-07-19T14:00:00.000Z", replying_to_status: "9", author: { screen_name: "Alice" } },
], { handle: "Alice", now }), [
  { url: "https://x.com/Alice/status/11", text: "recent root", discoveredAt: "2026-07-19T15:00:00.000Z", source: "fxtwitter-following-statuses" },
]);
```

Also assert the plan's 24-hour cutoff, six-hour refresh decision, bounded concurrency, and deterministic retry bounds.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/own-post-reply.test.js`

Expected: FAIL because the new helpers are not exported.

- [ ] **Step 3: Implement minimal pure helpers and state defaults**

Add constants for 24 hours, six hours, worker concurrency, and retry bounds. Normalize handles case-insensitively, exclude `@terafabXai`, reject protected/invalid accounts, accept only rows whose parsed creation time is within `[now - 24h, now]`, and reject replies or author mismatches.

The plan helper returns exact cutoff, refresh-needed, eligible account, and concurrency values without performing I/O. Retry uses capped exponential delays starting at five minutes.

- [ ] **Step 4: Export helpers and verify GREEN**

Run: `node --test test/own-post-reply.test.js`

Expected: PASS.

### Task 2: FxTwitter Following Cache and Partial-Failure Timeline Sync

**Files:**
- Modify: `mirror_server.js:4280-4580`
- Modify: `mirror_server.js:4829-4900`
- Test: `test/own-post-reply.test.js`

**Interfaces:**
- Consumes: domain helpers from Task 1 and existing `runFixedWorkerPool`.
- Produces: `fetchFxTwitterFollowingPage(handle, cursor) -> page`
- Produces: `syncTerafabxFxTwitterFollowing(options) -> sync result`
- Produces: `fetchFxTwitterProfileStatuses(handle, options) -> page`
- Produces: `collectTerafabxFxTwitterFollowingCandidates(options) -> cycle result`

- [ ] **Step 1: Write failing pagination and partial-failure tests**

Use injected fetch functions so tests exercise real production control flow without network access. Assert that:

```js
const result = await syncTerafabxFxTwitterFollowing({
  state: { fxTwitterFollowingAccounts: [] },
  fetchPage: async ({ cursor }) => cursor
    ? { results: [{ id: "2", screen_name: "Bob" }], cursor: { bottom: null } }
    : { results: [{ id: "1", screen_name: "Alice" }], cursor: { bottom: "next" } },
  now,
});
assert.deepEqual(result.accounts.map((row) => row.handle), ["Alice", "Bob"]);
```

Add a repeated-cursor test that terminates after the duplicate cursor. Add a cached-fallback test where refresh throws but the prior cache is returned with `status: "degraded"`. Add a worker-pool test where one account throws and another returns a recent root post; the successful candidate must remain in the result and the failed account must receive a retry time.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/own-post-reply.test.js`

Expected: FAIL because synchronization functions are missing.

- [ ] **Step 3: Implement paginated following synchronization**

Call `${FXTWITTER_API_BASE}/2/profile/${handle}/following?count=100`, follow unique bottom cursors, normalize accounts, and persist a successful cache timestamp. On failure, return the last successful cache when non-empty; otherwise throw an FxTwitter-specific error.

- [ ] **Step 4: Implement bounded timeline synchronization**

Call `${FXTWITTER_API_BASE}/2/profile/${handle}/statuses?count=100&since=${cutoffSeconds}` for eligible accounts. Use `runFixedWorkerPool`, record independent success/error/retry metadata, combine recent root candidates, deduplicate by normalized status URL, and return `ok`, `degraded`, or `error` diagnostics.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test test/own-post-reply.test.js`

Expected: PASS.

### Task 3: Replace Automatic X Home Discovery

**Files:**
- Modify: `mirror_server.js:4024-4195`
- Modify: `mirror_server.js:8050-8210`
- Test: `test/own-post-reply.test.js:800-860`

**Interfaces:**
- Consumes: `collectTerafabxFxTwitterFollowingCandidates` and existing reservoir/status validator.
- Produces: automatic `discoverTerafabxCommentTargetsUnlocked(limit)` with no Chrome dependency.
- Produces: `runTerafabxManualXHomeScan(options)` containing the old headed collector.

- [ ] **Step 1: Write failing source-boundary and behavior tests**

Replace the current automatic-discovery source assertion with checks that the function block calls the FxTwitter collector and contains none of:

```js
assert.doesNotMatch(block, /x\.com\/home/);
assert.doesNotMatch(block, /newIsolatedPageForPort/);
assert.doesNotMatch(block, /waitForXPageReady/);
```

Assert the manual function contains port 9224 disposable-tab creation, account verification, `https://x.com/home`, the global lock wrapper, and `finally` tab cleanup. Update the continuous-prefill test so X home backoff does not suppress FxTwitter prefill.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/own-post-reply.test.js`

Expected: FAIL because automatic discovery still owns X home navigation.

- [ ] **Step 3: Integrate FxTwitter reservoir refill**

Keep backlog-first validation. When it is insufficient, run the FxTwitter collection cycle, merge candidates into `commentTargetBacklog`, validate through `fetchFxTwitterV2Status`, persist cycle state, and return selected candidates. Remove X-home retry/backoff checks from automatic scheduling and error handling.

- [ ] **Step 4: Extract manual X home one-shot collector**

Move the existing deep-scroll implementation into `runTerafabxManualXHomeScan`. It must use `withTerafabxLock`, verify `@terafabXai`, append validated candidates to the reservoir, record its own last result/error, and always close the work tab.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test test/own-post-reply.test.js`

Expected: PASS.

### Task 4: API Status and Manual Diagnostic Action

**Files:**
- Modify: `mirror_server.js:8990-9060`
- Modify: `mirror_server.js:14880-14950`
- Test: `test/inssider-dashboard.test.js`
- Test: `test/own-post-reply.test.js`

**Interfaces:**
- Produces: `commentDiscovery` in `/api/terafabx/automation` status.
- Produces: `POST /api/terafabx/automation` with `{ job: "x-home-scan", action: "run" }`.

- [ ] **Step 1: Write failing status and route tests**

Assert the status builder exposes:

```js
{
  mode: "fxtwitter-following",
  windowHours: 24,
  followingCount: 68,
  lastFollowingSyncAt: "...",
  nextFollowingSyncAt: "...",
  attemptedCount: 10,
  succeededCount: 9,
  failedCount: 1,
  backedOffCount: 1,
  candidateCount: 40,
  targetBacklogCount: 120,
  lastManualXHomeScanAt: null,
}
```

Add route-source assertions allowing `x-home-scan` only for `run` and dispatching it to the manual collector.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test test/inssider-dashboard.test.js test/own-post-reply.test.js`

Expected: FAIL due to missing status and route support.

- [ ] **Step 3: Implement status projection and action dispatch**

Add `commentDiscovery` to `getTerafabxAutomationStatus`, extend job validation with `x-home-scan`, reject enable/disable for it, and return the one-shot result plus refreshed status.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test test/inssider-dashboard.test.js test/own-post-reply.test.js`

Expected: PASS.

### Task 5: Dashboard Diagnostics

**Files:**
- Modify: `dashboard/src/main.jsx:1890-1940`
- Test: `test/inssider-dashboard.test.js`
- Generate: `dashboard/dist/index.html`
- Generate: `dashboard/dist/assets/*`

**Interfaces:**
- Consumes: `data.terafabx.commentDiscovery` and existing `runTerafabx(job, action)`.
- Produces: visible FxTwitter discovery metrics and the `X 홈 1회 스캔` button.

- [ ] **Step 1: Write failing dashboard source test**

Assert the React source contains `FxTwitter 팔로잉`, the 24-hour label, following/failure/backlog metrics, and a button dispatching `runTerafabx("x-home-scan", "run")` with exact text `X 홈 1회 스캔`.

- [ ] **Step 2: Run dashboard test and verify RED**

Run: `node --test test/inssider-dashboard.test.js`

Expected: FAIL because the diagnostics UI is absent.

- [ ] **Step 3: Implement the dashboard diagnostic block**

Place the source/status lines inside the automatic-comment card. Use existing `formatDate`, `compact`, `Badge`, and `Button` components. The manual button must obey `controlsBusy` and use the common action handler.

- [ ] **Step 4: Build dashboard assets**

Run: `npm run build:dashboard`

Expected: Vite build succeeds and updates hashed assets plus `dashboard/dist/index.html`.

- [ ] **Step 5: Run dashboard test and verify GREEN**

Run: `node --test test/inssider-dashboard.test.js`

Expected: PASS.

### Task 6: Regression and Live Read-Only Verification

**Files:**
- Modify only if verification exposes a test-backed defect.

**Interfaces:**
- Verifies all preceding tasks as an integrated feature.

- [ ] **Step 1: Run syntax and focused tests**

Run:

```bash
node --check mirror_server.js
node --test test/own-post-reply.test.js test/inssider-dashboard.test.js test/comment-pipeline-status.test.js
```

Expected: all commands pass.

- [ ] **Step 2: Run full regression suite**

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Verify live FxTwitter reads**

Run read-only requests for `/2/profile/terafabXai/following?count=100` and one returned account's `/statuses?count=20&since=<24-hour cutoff>`. Confirm HTTP 200 and normalized candidates.

- [ ] **Step 4: Restart the local server and verify its API**

Start through the project's normal npm entrypoint, request `/api/terafabx/automation`, and confirm `commentDiscovery.mode === "fxtwitter-following"`, a nonzero following cache after synchronization, and no automatic `terafabx_comment_home_ready` event.

- [ ] **Step 5: Verify dashboard rendering**

Open `/discovery?view=automation#controls`, confirm the discovery metrics and `X 홈 1회 스캔` button render, and do not press the diagnostic button during automatic-path verification.

- [ ] **Step 6: Save stable implementation facts**

Record the final source boundary, state fields, and live verification result using `npm run memory -- add`.
