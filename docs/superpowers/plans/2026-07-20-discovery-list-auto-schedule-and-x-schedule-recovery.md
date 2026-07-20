# Discovery List Auto-Schedule and X Schedule Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a visible row-level auto-schedule button and recover safely when X opens a schedule-dialog shell without rendering date/time controls.

**Architecture:** The React table reuses its existing row-scoped asynchronous callback in a dedicated action button. The server converts DOM/network observations into pure schedule-dialog states, applies a bounded wait/reopen policy, and releases only auto-allocated slots whose X submission never began.

**Tech Stack:** React 19, TypeScript/TSX, Node.js, built-in `node:test`, Chrome CDP 9224, X web compose UI.

## Global Constraints

- Work on the existing `main` branch because the user explicitly requested it.
- Preserve all pre-existing dirty-worktree changes; do not stage or overwrite unrelated hunks in shared files.
- The required X account is `@terafabXai` on headed Chrome CDP port `9224`.
- Keep the existing asynchronous `/api/discovery/auto-schedule-async` endpoint and row-scoped `autoScheduleSubmitting` state.
- Do not globally disable other rows while one row is being accepted.
- Wait up to 45 seconds per schedule-dialog opening and reopen the dialog at most once.
- Never reload the whole compose page during recovery.
- Release an auto-allocated slot only when X submission has not started.
- Do not create a duplicate schedule during E2E verification.
- Close work tabs and remove temporary media after every X attempt.
- Because `mirror_server.js`, `dashboard/src/components/data-table.tsx`, and the shared tests contain pre-existing changes, implementation commits are deferred unless exact new hunks can be staged without including unrelated work.

---

### Task 1: Dedicated List Auto-Schedule Action

**Files:**
- Modify: `dashboard/src/components/data-table.tsx:485-540`
- Test: `test/inssider-dashboard.test.js`

**Interfaces:**
- Consumes: `props.onAutoSchedule(row: DiscoveryRow)` and `props.autoScheduleSubmitting: string[]`.
- Produces: one visible row button with accessible label `자동 예약`; the overflow menu no longer calls `onAutoSchedule`.

- [ ] **Step 1: Write the failing source regression test**

```js
test('discovery list exposes auto schedule beside the overflow menu instead of inside it', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'src', 'components', 'data-table.tsx'), 'utf8');
  assert.match(source, /aria-label="자동 예약"[\s\S]*props\.onAutoSchedule\(row\.original\)/);
  assert.doesNotMatch(source, /<DropdownMenuItem[^>]*onClick=\{\(\) => props\.onAutoSchedule\(row\.original\)\}/);
  assert.match(source, /props\.autoScheduleSubmitting\.includes\(row\.original\.canonicalUrl\) \? "접수 중" : "자동 예약"/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="discovery list exposes auto schedule" test/inssider-dashboard.test.js
```

Expected: FAIL because no dedicated button with `aria-label="자동 예약"` exists.

- [ ] **Step 3: Add the dedicated row button and remove the overflow entry**

Add before `<DropdownMenu>` inside the actions cell:

```tsx
const autoSchedulePending = props.autoScheduleSubmitting.includes(row.original.canonicalUrl)
const autoScheduleDisabled = !row.original.canPost || autoSchedulePending

<Button
  variant="outline"
  size="sm"
  aria-label="자동 예약"
  onClick={() => props.onAutoSchedule(row.original)}
  disabled={autoScheduleDisabled}
>
  <CalendarClockIcon data-icon="inline-start" />
  {autoSchedulePending ? "접수 중" : "자동 예약"}
</Button>
```

Delete only this overflow item:

```tsx
<DropdownMenuItem onClick={() => props.onAutoSchedule(row.original)} ...>
  ...
</DropdownMenuItem>
```

- [ ] **Step 4: Run the focused test and dashboard build**

Run:

```bash
node --test --test-name-pattern="discovery list exposes auto schedule" test/inssider-dashboard.test.js
npm run build:dashboard
```

Expected: PASS and Vite build exit code 0.

- [ ] **Step 5: Review the isolated diff**

Run:

```bash
git diff --check -- dashboard/src/components/data-table.tsx test/inssider-dashboard.test.js
git diff -- dashboard/src/components/data-table.tsx test/inssider-dashboard.test.js
```

Expected: only the dedicated button, removed menu item, and regression test appear among the new hunks.

---

### Task 2: Schedule Dialog State and Recovery Policy

**Files:**
- Modify: `mirror_server.js:14240-14420`
- Test: `test/inssider-dashboard.test.js`

**Interfaces:**
- Produces: `classifyXScheduleDialogState(snapshot) -> "ready" | "loading_shell" | "rate_limited" | "login_or_navigation_error" | "unsupported_dom"`.
- Produces: `xScheduleRecoveryAction({ state, elapsedMs, reopenCount, waitLimitMs }) -> "wait" | "reopen" | "continue" | "fail"`.
- Consumes snapshots shaped as `{ url, bodyText, requiredFieldCount, visibleFieldCount, relevantRateLimitUrl }`.

- [ ] **Step 1: Write failing pure-state tests**

```js
test('X schedule dialog classifies a title-only route as a loading shell', () => {
  assert.equal(classifyXScheduleDialogState({
    url: 'https://x.com/compose/post/schedule',
    bodyText: '예약 게시물',
    requiredFieldCount: 0,
    visibleFieldCount: 0,
  }), 'loading_shell');
});

test('X schedule recovery waits, reopens once, then fails boundedly', () => {
  assert.equal(xScheduleRecoveryAction({ state: 'loading_shell', elapsedMs: 10_000, reopenCount: 0, waitLimitMs: 45_000 }), 'wait');
  assert.equal(xScheduleRecoveryAction({ state: 'loading_shell', elapsedMs: 45_000, reopenCount: 0, waitLimitMs: 45_000 }), 'reopen');
  assert.equal(xScheduleRecoveryAction({ state: 'loading_shell', elapsedMs: 45_000, reopenCount: 1, waitLimitMs: 45_000 }), 'fail');
  assert.equal(xScheduleRecoveryAction({ state: 'ready', elapsedMs: 0, reopenCount: 0, waitLimitMs: 45_000 }), 'continue');
});

test('X schedule dialog reports a relevant 429 before generic loading shell', () => {
  assert.equal(classifyXScheduleDialogState({
    url: 'https://x.com/compose/post/schedule',
    bodyText: '예약 게시물',
    requiredFieldCount: 0,
    visibleFieldCount: 0,
    relevantRateLimitUrl: 'https://x.com/i/api/graphql/example',
  }), 'rate_limited');
});
```

Add both helpers to the test import list before running.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --test --test-name-pattern="X schedule dialog|X schedule recovery" test/inssider-dashboard.test.js
```

Expected: FAIL because both functions are not exported.

- [ ] **Step 3: Implement the pure classifiers**

```js
function classifyXScheduleDialogState(snapshot = {}) {
  if (snapshot.requiredFieldCount >= 5) return "ready";
  if (snapshot.relevantRateLimitUrl) return "rate_limited";
  if (!/x[.]com\/compose\/post\/schedule/i.test(String(snapshot.url || ""))
      || /로그인|가입하기|Log in|Sign up/i.test(String(snapshot.bodyText || ""))) {
    return "login_or_navigation_error";
  }
  if (Number(snapshot.visibleFieldCount || 0) === 0
      && /예약 게시물|scheduled posts?/i.test(String(snapshot.bodyText || ""))) {
    return "loading_shell";
  }
  return "unsupported_dom";
}

function xScheduleRecoveryAction({ state, elapsedMs = 0, reopenCount = 0, waitLimitMs = 45_000 } = {}) {
  if (state === "ready") return "continue";
  if (state !== "loading_shell") return "fail";
  if (elapsedMs < waitLimitMs) return "wait";
  return reopenCount < 1 ? "reopen" : "fail";
}
```

Export both helpers.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run:

```bash
node --test --test-name-pattern="X schedule dialog|X schedule recovery" test/inssider-dashboard.test.js
```

Expected: all new state tests PASS.

- [ ] **Step 5: Integrate bounded condition waiting into `setXSchedule`**

Create `readXScheduleDialogSnapshot(page)` that gathers all visible dialogs rather than only the last one, counts required fields in the dialog containing the most schedule controls, records each dialog's field/button summary, and attaches the newest relevant HTTP 429 URL from `page.events`.

Replace the fixed 20 × 500 ms loop with this control flow:

```js
for (let reopenCount = 0; reopenCount <= 1; reopenCount += 1) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= 45_000) {
    const snapshot = await readXScheduleDialogSnapshot(page);
    const state = classifyXScheduleDialogState(snapshot);
    const action = xScheduleRecoveryAction({ state, elapsedMs: Date.now() - startedAt, reopenCount, waitLimitMs: 45_000 });
    logEvent("schedule_dialog_state", { scheduledAt: scheduledAt.toISOString(), reopenCount, state, action, snapshot });
    if (action === "continue") return fillAndConfirmXSchedule(page, scheduledAt, snapshot);
    if (action === "wait") { await sleep(500); continue; }
    if (action === "reopen") {
      await closeXScheduleDialog(page);
      await ensureComposerText(page, expectedText, "schedule_dialog_reopen");
      await openXScheduleDialog(page);
      break;
    }
    throw xScheduleStateError(state, snapshot);
  }
}
```

Pass the expected composer text into `setXSchedule(page, scheduledAt, expectedText)`. `closeXScheduleDialog` must click only the schedule dialog's close/back control and wait for the visible composer. `openXScheduleDialog` must click the visible `[data-testid="scheduleOption"]`. Keep the existing field setting and confirmation code in `fillAndConfirmXSchedule`.

- [ ] **Step 6: Verify syntax and focused regressions**

Run:

```bash
node --check mirror_server.js
node --test --test-name-pattern="X schedule dialog|X schedule recovery|X compose" test/inssider-dashboard.test.js
```

Expected: syntax exit 0 and focused tests PASS.

---

### Task 3: Release Stale Auto-Allocated Slots Before Submission

**Files:**
- Modify: `mirror_server.js:12040-12140`
- Modify: `mirror_server.js:14820-14860`
- Test: `test/inssider-dashboard.test.js`

**Interfaces:**
- Produces: schedule errors carrying `xScheduleSubmissionStarted: boolean`.
- Produces: `shouldReleaseReservedScheduleSlot(error) -> boolean`.
- Consumes: existing `removeScheduleSlot(scheduledAt, canonicalUrl)`.

- [ ] **Step 1: Write the failing slot-disposition test**

```js
test('auto schedule releases only slots whose X submission never started', () => {
  assert.equal(shouldReleaseReservedScheduleSlot(Object.assign(new Error('loading shell'), { xScheduleSubmissionStarted: false })), true);
  assert.equal(shouldReleaseReservedScheduleSlot(Object.assign(new Error('post-submit verify failed'), { xScheduleSubmissionStarted: true })), false);
});
```

Add `shouldReleaseReservedScheduleSlot` to the test import list.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
node --test --test-name-pattern="auto schedule releases only slots" test/inssider-dashboard.test.js
```

Expected: FAIL because the helper is not exported.

- [ ] **Step 3: Track the submission boundary in `postToX`**

```js
let xScheduleSubmissionStarted = false;
try {
  // existing compose, media, and schedule setup
  const clicked = await page.eval(/* existing submit click */);
  if (!clicked) throw new Error("X 게시 버튼을 클릭하지 못했습니다.");
  xScheduleSubmissionStarted = Boolean(scheduledAt);
  // existing post-submit verification
} catch (error) {
  if (options.schedule) error.xScheduleSubmissionStarted = xScheduleSubmissionStarted;
  throw error;
} finally {
  await page.close();
}
```

Add and export:

```js
function shouldReleaseReservedScheduleSlot(error) {
  return error?.xScheduleSubmissionStarted !== true;
}
```

- [ ] **Step 4: Release only the matching slot in `runDiscoveryAutoSchedule`**

Wrap the call after `reserveNextAutoScheduleTime(canonicalUrl)`:

```js
try {
  const result = await postDiscoveryRowToX(canonicalUrl, { textOverride: options.text, schedule: true, scheduledAt });
  await markDiscoveryScheduled(canonicalUrl, result.mediaCount, result.scheduledAt);
  return result;
} catch (error) {
  if (shouldReleaseReservedScheduleSlot(error)) {
    removeScheduleSlot(scheduledAt, canonicalUrl);
    logEvent("discovery_auto_schedule_slot_released", {
      canonicalUrl,
      scheduledAt: scheduledAt.toISOString(),
      error: error.message,
    });
  }
  throw error;
}
```

- [ ] **Step 5: Run focused and full automated tests**

Run:

```bash
node --test --test-name-pattern="auto schedule releases only slots|duplicate auto-schedule|X schedule" test/inssider-dashboard.test.js
npm test
git diff --check
```

Expected: focused tests PASS, full suite reports zero failures, and diff check exits 0.

---

### Task 4: Runtime and Real X E2E Verification

**Files:**
- Runtime verification only; do not create a duplicate reservation.

**Interfaces:**
- Consumes: dashboard asynchronous auto-schedule route, server port 3131, Chrome CDP 9224, X account `@terafabXai`.
- Produces: verified X schedule entry and matching local `scheduled` state, or an explicit not-E2E-verified report.

- [ ] **Step 1: Restart and verify runtime prerequisites**

Run the established launchctl restart, then:

```bash
curl -fsS http://localhost:3131/api/health | jq '{ok,pid,chromePort,requiredXHandle}'
curl -fsS http://127.0.0.1:9224/json/version | jq '{Browser,"Protocol-Version":."Protocol-Version"}'
```

Expected: server `ok: true`, `chromePort: 9224`, and required handle `terafabxai`.

- [ ] **Step 2: Verify account and confirm the selected safe discovery row remains eligible**

Use a disposable CDP 9224 tab and authenticated UI evidence (`profileHref === "https://x.com/terafabXai"`). Confirm `https://www.threads.com/@pigon_hada2025/post/Da-vscGAoJf` is still `failed_schedule`, has no completed mirror-history entry, and has no X reservation. Its saved title is `요즘 계속 불나는 이유가…??` and it has one media item. If any of those facts changed, stop rather than selecting a different row implicitly.

- [ ] **Step 3: Exercise the real asynchronous auto-schedule path**

Send the same payload as the list button:

```bash
curl -fsS -X POST http://localhost:3131/api/discovery/auto-schedule-async \
  -H 'content-type: application/json' \
  --data '{"url":"https://www.threads.com/@pigon_hada2025/post/Da-vscGAoJf","text":"요즘 계속 불나는 이유가…??","origin":"dashboard_auto_schedule"}'
```

Expected: HTTP 202 and the row enters `queued_schedule` without blocking another row's UI action.

- [ ] **Step 4: Verify real schedule controls and final result**

Confirm logs show `schedule_dialog_state` reaching `ready`, the real X date/time/minute fields being set, schedule confirmation, `x_schedule_post_submit_verified`, and `discovery_auto_schedule_async_success`. Open the X schedule list and confirm exactly one entry at the allocated time with the expected title and media.

- [ ] **Step 5: Verify cleanup and dashboard state**

Confirm the row is `scheduled`, `lastError` is null, mirror history contains one matching record, its slot state is verified, no work tab remains, and temporary media directories are removed. Confirm the new list-level button is visible on another eligible row while the completed row is no longer actionable.

- [ ] **Step 6: Record stable findings**

```bash
npm run memory -- add bugfix "Discovery list auto-schedule is a dedicated row action; X schedule loading shells wait up to 45 seconds, reopen once without reloading compose, and pre-submit failures release their reserved slot." discovery,dashboard,x,schedule,recovery,slot
```

Expected: a new memory record ID is printed.
