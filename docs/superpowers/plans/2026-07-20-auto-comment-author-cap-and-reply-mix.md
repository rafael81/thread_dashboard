# Auto Comment Author Cap and Reply Mix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit ordinary automatic comments to two posts per target account per KST day, limit automatic replies to two per own root post for its lifetime, and schedule one own-post reply after every five successful ordinary comments.

**Architecture:** Add pure policy helpers in `mirror_server.js`, apply them both before enqueue and immediately before posting, and persist a successful-comment counter in the existing TerafabX JSON state. Reuse the existing single-item own-post reply runner and shared X writer lock so the weighted scheduler never starts an unbounded reply sweep.

**Tech Stack:** Node.js CommonJS, `node:test`, JSON state persistence, existing CDP/Grok/Gemini workers.

## Global Constraints

- Do not add mutual-following checks.
- Ordinary automatic comments are limited to 2 per target account per KST date.
- Automatic own-post replies are limited to 2 total per own root post, independent of date.
- One eligible own-post reply is preferred after 5 successful ordinary automatic comments.
- A missing or failed own-post reply must not stop ordinary automatic comments.
- Existing Grok-context, Gemini-review, quality-gate, account-verification, and writer-lock requirements remain mandatory.
- Existing pending drafts are preserved; ordinary drafts over the daily cap are deferred without incrementing retry attempts.
- Hearts are not affected by reply caps.

---

### Task 1: Pure ordinary-comment author cap policy

**Files:**
- Modify: `mirror_server.js:1509-1580`
- Modify: `mirror_server.js:16310-16470`
- Test: `test/inssider-dashboard.test.js`

**Interfaces:**
- Produces: `terafabxCommentAuthorHandle(record): string`
- Produces: `terafabxCommentAuthorDailyUsage(state, record, nowValue, options): { handle, date, posted, reserved, used, limit, allowed, retryAt }`
- Consumes: `formatKstDateKey`, `normalizeXStatusUrl`, `parseXStatusUrl`

- [ ] **Step 1: Write failing tests for posted and reserved counts**

```js
test('ordinary auto comments count posted and pending reservations per author on the KST date', () => {
  const state = {
    commentHistory: [{ targetUrl: 'https://x.com/Foo/status/1', postedAt: '2026-07-20T00:00:00.000Z', replyUrl: 'https://x.com/terafabXai/status/11', source: 'prefill' }],
    pendingCommentPosts: [{ targetUrl: 'https://x.com/foo/status/2', status: 'pending', source: 'prefill' }],
  };
  const usage = terafabxCommentAuthorDailyUsage(state, { targetUrl: 'https://x.com/FOO/status/3', source: 'prefill' }, new Date('2026-07-20T06:00:00.000Z'));
  assert.deepEqual({ handle: usage.handle, posted: usage.posted, reserved: usage.reserved, used: usage.used, allowed: usage.allowed }, { handle: 'foo', posted: 1, reserved: 1, used: 2, allowed: false });
});

test('ordinary auto comment author cap resets at the KST date boundary', () => {
  const state = { commentHistory: [{ targetUrl: 'https://x.com/foo/status/1', postedAt: '2026-07-19T14:59:59.000Z', replyUrl: 'https://x.com/terafabXai/status/11', source: 'prefill' }], pendingCommentPosts: [] };
  assert.equal(terafabxCommentAuthorDailyUsage(state, { targetUrl: 'https://x.com/foo/status/2', source: 'prefill' }, new Date('2026-07-19T15:00:01.000Z')).allowed, true);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --test --test-name-pattern='ordinary auto comment' test/inssider-dashboard.test.js`

Expected: FAIL because `terafabxCommentAuthorDailyUsage` is not exported.

- [ ] **Step 3: Implement the pure cap helpers and export them**

```js
const TERAFABX_COMMENT_AUTHOR_DAILY_LIMIT = 2;

function terafabxCommentAuthorHandle(record = {}) {
  return String(parseXStatusUrl(normalizeXStatusUrl(record.targetUrl || ''))?.handle || '').toLowerCase();
}

function terafabxCommentAuthorDailyUsage(state = {}, record = {}, nowValue = new Date(), options = {}) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const date = formatKstDateKey(now);
  const handle = terafabxCommentAuthorHandle(record);
  const limit = Number(options.limit || TERAFABX_COMMENT_AUTHOR_DAILY_LIMIT);
  const posted = (state.commentHistory || []).filter((item) => item.source !== 'own_post_reply' && item.source !== 'today_post_reply' && terafabxCommentAuthorHandle(item) === handle && item.replyUrl && formatKstDateKey(item.postedAt || item.at) === date).length;
  const reserved = (state.pendingCommentPosts || []).filter((item) => item.status !== 'posted' && terafabxCommentAuthorHandle(item) === handle && formatKstDateKey(item.capDate || item.queuedAt || now) === date).length;
  const retryAt = nextKstDateBoundary(now).toISOString();
  return { handle, date, posted, reserved, used: posted + reserved, limit, allowed: Boolean(handle) && posted + reserved < limit, retryAt };
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test --test-name-pattern='ordinary auto comment' test/inssider-dashboard.test.js`

Expected: 2 passing tests.

- [ ] **Step 5: Commit the policy helper**

```bash
git add mirror_server.js test/inssider-dashboard.test.js
git commit -m "feat: add per-author auto comment cap policy"
```

---

### Task 2: Enforce the author cap at discovery, enqueue, and consumption

**Files:**
- Modify: `mirror_server.js:4230-4295`
- Modify: `mirror_server.js:1523-1580`
- Modify: `mirror_server.js:8570-8715`
- Test: `test/inssider-dashboard.test.js`
- Test: `test/own-post-reply.test.js`

**Interfaces:**
- Consumes: `terafabxCommentAuthorDailyUsage(state, record, nowValue, options)` from Task 1
- Produces: `terafabxCommentAuthorCapDisposition(state, item, nowValue): { allowed, reason, retryAt, usage }`

- [ ] **Step 1: Write failing tests for enqueue rejection and consumer deferral**

```js
test('a third ordinary comment for one author is excluded before enqueue', () => {
  const state = {
    commentHistory: [
      { targetUrl: 'https://x.com/foo/status/1', postedAt: '2026-07-20T01:00:00.000Z', replyUrl: 'https://x.com/terafabXai/status/11', source: 'prefill' },
      { targetUrl: 'https://x.com/foo/status/2', postedAt: '2026-07-20T02:00:00.000Z', replyUrl: 'https://x.com/terafabXai/status/12', source: 'prefill' },
    ],
    pendingCommentPosts: [],
  };
  const disposition = terafabxCommentAuthorCapDisposition(state, { targetUrl: 'https://x.com/foo/status/3', source: 'prefill' }, new Date('2026-07-20T06:00:00.000Z'));
  assert.equal(disposition.allowed, false);
  assert.equal(disposition.reason, 'author_daily_cap_reached');
});

test('cap deferral preserves a quality-approved pending comment without increasing attempts', () => {
  const item = { targetUrl: 'https://x.com/foo/status/3', status: 'pending', attempts: 1, source: 'prefill' };
  const deferred = deferTerafabxPendingCommentForAuthorCap(item, '2026-07-20T15:00:00.000Z');
  assert.equal(deferred.attempts, 1);
  assert.equal(deferred.status, 'pending');
  assert.equal(deferred.lastFailureReason, 'author_daily_cap_reached');
  assert.equal(deferred.nextEligibleAt, '2026-07-20T15:00:00.000Z');
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test --test-name-pattern='third ordinary comment|cap deferral' test/inssider-dashboard.test.js test/own-post-reply.test.js`

Expected: FAIL because the disposition and deferral helpers do not exist.

- [ ] **Step 3: Implement minimal enforcement**

Add `terafabxCommentAuthorCapDisposition` and `deferTerafabxPendingCommentForAuthorCap`. In `discoverTerafabxCommentTargetsUnlocked`, skip candidates whose author has two posted/reserved items. In `enqueueTerafabxPendingCommentPost`, return `{ skipped: true, reason: 'author_daily_cap_reached' }` before saving. In `runTerafabxPendingCommentPosts`, re-read state immediately before each post; replace a capped item with the deferred record and continue to the next candidate without incrementing attempts.

```js
function deferTerafabxPendingCommentForAuthorCap(item, retryAt) {
  return { ...item, status: 'pending', nextEligibleAt: retryAt, lastFailureReason: 'author_daily_cap_reached' };
}
```

- [ ] **Step 4: Run focused tests and the existing pending suite**

Run: `node --test --test-name-pattern='author|pending comment|retry cooldown' test/inssider-dashboard.test.js test/own-post-reply.test.js`

Expected: all selected tests pass.

- [ ] **Step 5: Commit cap enforcement**

```bash
git add mirror_server.js test/inssider-dashboard.test.js test/own-post-reply.test.js
git commit -m "feat: enforce daily auto comment author cap"
```

---

### Task 3: Enforce two automatic replies per own root post

**Files:**
- Modify: `mirror_server.js:5325-5415`
- Modify: `mirror_server.js:7160-7420`
- Modify: `mirror_server.js:7420-7670`
- Test: `test/own-post-reply.test.js`
- Test: `test/today-post-reply.test.js`

**Interfaces:**
- Produces: `terafabxOwnRootReplyUsage(state, rootPostUrl): { rootPostUrl, posted, reserved, used, limit, allowed }`
- Consumes: `ownPostReplyHistory`, `ownPostReplyManualQueue`, normalized `rootPostUrl`

- [ ] **Step 1: Write failing lifetime-cap tests**

```js
test('automatic own-post replies stop at two total replies per root post across dates', () => {
  const rootPostUrl = 'https://x.com/terafabXai/status/100';
  const state = { ownPostReplyHistory: [
    { rootPostUrl, targetUrl: 'https://x.com/a/status/1', replyUrl: 'https://x.com/terafabXai/status/11', postedAt: '2026-07-19T01:00:00.000Z' },
    { rootPostUrl, targetUrl: 'https://x.com/b/status/2', replyUrl: 'https://x.com/terafabXai/status/12', postedAt: '2026-07-20T01:00:00.000Z' },
  ], ownPostReplyManualQueue: [] };
  assert.deepEqual(terafabxOwnRootReplyUsage(state, rootPostUrl), { rootPostUrl, posted: 2, reserved: 0, used: 2, limit: 2, allowed: false });
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `node --test --test-name-pattern='two total replies per root' test/own-post-reply.test.js`

Expected: FAIL because `terafabxOwnRootReplyUsage` is not exported.

- [ ] **Step 3: Implement root usage and apply remaining allowance**

Compute successful history by normalized `rootPostUrl` and active manual queue reservations by `postUrl`. Before `runTerafabxOwnPostReplyOnce` and `runTerafabxOwnPostReplyBatch`, return `skipped: 'root_post_reply_cap_reached'` when allowance is zero. Clamp candidate/batch limits to `2 - used`; recheck immediately before saving success so concurrent paths cannot post a third reply.

```js
const usage = terafabxOwnRootReplyUsage(loadTerafabxState(), rootUrl);
if (!usage.allowed) return { ok: true, action: 'own-post-reply', skipped: 'root_post_reply_cap_reached', usage };
const effectiveLimit = Math.min(requestedLimit, usage.limit - usage.used);
```

- [ ] **Step 4: Run own-post and today-sweep suites**

Run: `node --test test/own-post-reply.test.js test/today-post-reply.test.js`

Expected: all tests pass.

- [ ] **Step 5: Commit root-post cap enforcement**

```bash
git add mirror_server.js test/own-post-reply.test.js test/today-post-reply.test.js
git commit -m "feat: cap automatic replies per own post"
```

---

### Task 4: Persist and apply the 5-to-1 weighted scheduler

**Files:**
- Modify: `mirror_server.js:1220-1280`
- Modify: `mirror_server.js:7160-7260`
- Modify: `mirror_server.js:8570-8715`
- Modify: `mirror_server.js:9580-9750`
- Test: `test/own-post-reply.test.js`
- Test: `test/comment-pipeline-status.test.js`

**Interfaces:**
- Produces: state field `successfulAutoCommentsSinceOwnReply: number`
- Produces: `terafabxWeightedReplyDecision(state, options): { due, count, threshold }`
- Produces: `recordTerafabxWeightedPostSuccess(kind): number`
- Consumes: `runTerafabxOwnPostReplyOnce({ manual: false })`

- [ ] **Step 1: Write failing scheduler tests**

```js
test('one own-post reply becomes due after five successful ordinary comments', () => {
  assert.equal(terafabxWeightedReplyDecision({ successfulAutoCommentsSinceOwnReply: 4 }).due, false);
  assert.equal(terafabxWeightedReplyDecision({ successfulAutoCommentsSinceOwnReply: 5 }).due, true);
});

test('a successful own-post reply resets the persisted weighted counter', () => {
  assert.equal(nextTerafabxWeightedReplyCount(7, 'own_post_reply', true), 0);
  assert.equal(nextTerafabxWeightedReplyCount(4, 'ordinary_comment', true), 5);
  assert.equal(nextTerafabxWeightedReplyCount(5, 'own_post_reply', false), 5);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test --test-name-pattern='weighted|five successful' test/own-post-reply.test.js test/comment-pipeline-status.test.js`

Expected: FAIL because the weighted scheduler helpers are missing.

- [ ] **Step 3: Implement persistent counter updates**

Add `successfulAutoCommentsSinceOwnReply: 0` to default state. Increment it only after successful ordinary-comment history persistence in both direct and pending consumers. Reset it only after `saveTerafabxOwnPostReplySuccess` succeeds for an automatic weighted run.

```js
function nextTerafabxWeightedReplyCount(current, kind, succeeded) {
  const count = Math.max(0, Number(current || 0));
  if (!succeeded) return count;
  return kind === 'own_post_reply' ? 0 : count + 1;
}
```

- [ ] **Step 4: Add bounded weighted scheduling**

Before the ordinary writer consumes its next item, check `terafabxWeightedReplyDecision`. If due and no reply worker is busy, call a bounded automatic function that runs `runTerafabxOwnPostReplyOnce({ manual: false })` for monitored own posts and returns after at most one successful reply. If the result is `no_candidate`, capped, rejected, or failed, log it and continue the ordinary writer without resetting the counter.

- [ ] **Step 5: Verify focused scheduler behavior**

Run: `node --test --test-name-pattern='weighted|five successful|continuous prefill|writer lock' test/own-post-reply.test.js test/comment-pipeline-status.test.js test/inssider-dashboard.test.js`

Expected: all selected tests pass.

- [ ] **Step 6: Commit weighted scheduling**

```bash
git add mirror_server.js test/own-post-reply.test.js test/comment-pipeline-status.test.js
git commit -m "feat: mix one own-post reply after five comments"
```

---

### Task 5: Dashboard observability and runtime verification

**Files:**
- Modify: `mirror_server.js:9270-9555`
- Modify: `dashboard/src/main.jsx`
- Test: `test/comment-pipeline-status.test.js`
- Test: `test/inssider-dashboard.test.js`

**Interfaces:**
- Consumes: cap usage and weighted counter helpers from Tasks 1-4
- Produces: status fields `commentAuthorDailyLimit`, `successfulAutoCommentsSinceOwnReply`, `weightedOwnReplyDue`, `authorCapDeferredCount`, `ownPostReplyCap`

- [ ] **Step 1: Write failing status projection tests**

```js
test('automation status exposes author caps and the five-to-one reply counter', () => {
  const status = deriveTerafabxCommentPipelineHealth({ successfulAutoCommentsSinceOwnReply: 5, pendingCommentPosts: [] }, {});
  assert.equal(status.commentAuthorDailyLimit, 2);
  assert.equal(status.ownPostReplyCap, 2);
  assert.equal(status.successfulAutoCommentsSinceOwnReply, 5);
  assert.equal(status.weightedOwnReplyDue, true);
});
```

- [ ] **Step 2: Run focused status test and verify RED**

Run: `node --test --test-name-pattern='author caps and the five-to-one' test/comment-pipeline-status.test.js`

Expected: FAIL because the fields are absent.

- [ ] **Step 3: Add status fields and concise dashboard labels**

Expose the five fields from `/api/terafabx/status`. In the automation control panel show `계정당 하루 2건`, `자동댓글 N/5`, and `내 글당 대댓글 2건`. Show capped/deferred counts only when nonzero.

- [ ] **Step 4: Run the complete automated verification**

Run:

```bash
node --check mirror_server.js
npm test
npm run dashboard:build
git diff --check
```

Expected: syntax succeeds, 0 test failures, dashboard build exits 0, and diff check has no output.

- [ ] **Step 5: Restart and verify the live server**

Restart `com.thread-dashboard.mirror-server`, request `/api/terafabx/status`, and verify HTTP 200 plus the new cap/counter fields. Inspect `mirror-events.jsonl` to confirm a third same-author ordinary comment is logged as capped rather than posted, while a due weighted reply uses the shared writer lock and returns after one reply.

- [ ] **Step 6: Save stable implementation decisions to memory**

Run:

```bash
npm run memory -- add implementation-decision "일반 자동댓글은 계정당 KST 하루 2건이며 게시+pending 예약을 함께 계산한다. 성공 5건마다 내 글 대댓글 1건을 우선하고 내 원글별 자동 대댓글은 누적 2건이다." "terafabx,auto-comment,own-post-reply,cap,weighted-scheduler"
```

- [ ] **Step 7: Commit dashboard and verification changes**

```bash
git add mirror_server.js dashboard/src/main.jsx test/comment-pipeline-status.test.js test/inssider-dashboard.test.js
git commit -m "feat: expose comment cap and reply mix status"
```

