# Automatic Comment Discovery on CDP 9224 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the dedicated CDP 9237 headed reader and discover automatic-comment targets through disposable tabs on the existing CDP 9224 Chrome.

**Architecture:** Candidate discovery acquires the existing global 9224 lock, opens one automation-owned tab, verifies `@terafabXai`, scans X home, and closes the tab in `finally`. The persistent CDP 9238 writer and Grok/Gemini workers remain isolated.

**Tech Stack:** Node.js CommonJS, Chrome DevTools Protocol over HTTP/WebSocket, `node:test`.

## Global Constraints

- Never navigate, reuse, or close a user-owned CDP 9224 tab.
- Verify `@terafabXai` before reading X home candidates.
- Do not fall back to CDP 9237.
- Preserve the persistent CDP 9238 quick writer.
- Close the disposable CDP 9224 work tab on every exit path.

---

### Task 1: Define the 9224 discovery resource contract

**Files:**
- Modify: `test/own-post-reply.test.js`
- Modify: `mirror_server.js`

**Interfaces:**
- Consumes: `CHROME_PORT`, `TERAFABX_COMMENT_X_CHROME_PORT`, `TERAFABX_AUTO_COMMENT_WRITER_PORT`.
- Produces: `terafabxAutoCommentBrowserResources()` with `legacy` and `writer` only; `terafabxAutoCommentDiscoveryOptions()` returning `{ port: CHROME_PORT, lock: "global-9224", disposableTab: true }`.

- [ ] **Step 1: Write the failing resource-contract test**

```js
test("auto comment discovery uses disposable tabs on the shared 9224 browser", () => {
  const resources = terafabxAutoCommentBrowserResources();
  assert.deepEqual(Object.keys(resources).sort(), ["legacy", "writer"]);
  assert.deepEqual(terafabxAutoCommentDiscoveryOptions(), {
    port: 9224,
    lock: "global-9224",
    disposableTab: true,
  });
  assert.equal(resources.writer.port, 9238);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test --test-name-pattern="auto comment discovery uses" test/own-post-reply.test.js`

Expected: FAIL because `terafabxAutoCommentDiscoveryOptions` is not exported and the reader resource still exists.

- [ ] **Step 3: Implement the minimal resource contract**

Remove the 9237 reader constants and `terafabxAutoCommentReaderBrowserOptions`. Return only `legacy` and `writer` from `terafabxAutoCommentBrowserResources`, add:

```js
function terafabxAutoCommentDiscoveryOptions() {
  return { port: CHROME_PORT, lock: "global-9224", disposableTab: true };
}
```

Export `terafabxAutoCommentDiscoveryOptions` instead of `terafabxAutoCommentReaderBrowserOptions`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test --test-name-pattern="auto comment discovery uses" test/own-post-reply.test.js`

Expected: PASS.

### Task 2: Move candidate discovery to a disposable 9224 tab

**Files:**
- Modify: `test/own-post-reply.test.js`
- Modify: `mirror_server.js`

**Interfaces:**
- Consumes: `withTerafabxLock(action, fn, { wait, timeoutMs })`, `newPageForPort(CHROME_PORT, url)`, `verifyXAccount(page)`.
- Produces: `discoverTerafabxCommentTargets(limit)` serialized by the global lock; `runTerafabxCommentDiscoveryAttempt(limit)` owning one disposable tab.

- [ ] **Step 1: Write the failing source-level lifecycle test**

```js
test("comment discovery uses the 9224 global lock and disposable work tabs", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "mirror_server.js"), "utf8");
  const block = source.slice(
    source.indexOf("async function discoverTerafabxCommentTargetsUnlocked"),
    source.indexOf("async function discoverTerafabxCommentTarget()"),
  );
  assert.match(block, /newPageForPort\(CHROME_PORT/);
  assert.match(block, /withTerafabxLock\(/);
  assert.match(block, /await page\.close\(\)/);
  assert.doesNotMatch(block, /getTerafabxAutoCommentHeadlessPage\("reader"/);
  assert.doesNotMatch(block, /closeTerafabxAutoCommentReaderBrowser/);
});
```

- [ ] **Step 2: Run the lifecycle test and verify RED**

Run: `node --test --test-name-pattern="comment discovery uses the 9224" test/own-post-reply.test.js`

Expected: FAIL because discovery still opens and restarts the 9237 reader.

- [ ] **Step 3: Implement disposable-tab discovery**

Open each attempt with:

```js
const page = await newPageForPort(CHROME_PORT, `https://x.com/${REQUIRED_X_HANDLE}`);
```

Bring only that tab forward, verify the required account, navigate to X home,
retain the existing filtering and metadata logic, and close the page in
`finally`. Wrap both attempts in:

```js
return withTerafabxLock("comment-target-discovery", async () => {
  // existing two-attempt loop, each attempt creates a fresh tab
}, { wait: true, timeoutMs: 10 * 60 * 1000 });
```

Retry only the X-home loading and CDP-9224 availability errors. Do not close or
restart Chrome 9224 between attempts.

- [ ] **Step 4: Remove the remaining reader setup and status references**

Delete the 9237 launcher/closer, reader branch in
`getTerafabxAutoCommentHeadlessPage`, reader cleanup entry, reader status
payload, reader retry messages, and unused cookie-copy behavior that existed
only for the reader path. Keep the writer branch on port 9238 unchanged.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `node --test test/own-post-reply.test.js test/comment-pipeline-status.test.js`

Expected: all tests PASS.

### Task 3: Regression and live runtime verification

**Files:**
- Modify: `mirror_server.js` only if verification exposes a defect covered by a new failing test.
- Modify: `test/own-post-reply.test.js` only for such a regression test.

**Interfaces:**
- Consumes: server start command, CDP `/json/list`, project event log.
- Produces: evidence that 9237 is absent and 9224 tabs are preserved.

- [ ] **Step 1: Run the full automated suite**

Run: `npm test`

Expected: all tests PASS with no new warning or error.

- [ ] **Step 2: Restart the server and verify ports**

Restart through the existing project start path, then run:

```bash
lsof -nP -iTCP:9237 -sTCP:LISTEN
curl -fsS http://127.0.0.1:9224/json/version
curl -fsS http://127.0.0.1:9238/json/version
```

Expected: no 9237 listener; healthy Chrome responses on 9224 and 9238.

- [ ] **Step 3: Verify account, discovery, and tab preservation**

Record the IDs from `http://127.0.0.1:9224/json/list`, trigger one automatic
comment prefill/discovery through the server's existing automation endpoint,
and compare the tab IDs afterward. Confirm the existing IDs remain, the
temporary work-tab ID is gone, account verification logged `@terafabXai`, and
`terafabx_comment_target_candidates` was emitted with port 9224 activity.

- [ ] **Step 4: Save the stable implementation decision**

Run:

```bash
npm run memory -- add implementation_decision "Automatic-comment target discovery uses a disposable tab on shared CDP 9224 under the global lock; dedicated headed reader 9237 is removed, while quick writer 9238 remains isolated." "terafabx,auto-comment,chrome,cdp9224,resource-cleanup"
```

Expected: memory entry added successfully.
