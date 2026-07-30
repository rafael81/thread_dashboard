const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("dashboard normalizes only @terafabXai status URLs", async () => {
  const { isValidOwnPostUrl, normalizeOwnPostUrl } = await import("../dashboard/src/lib/own-post-reply.mjs");
  assert.equal(
    normalizeOwnPostUrl(" https://x.com/TERAFABXAI/status/2074844701526573534?s=20 "),
    "https://x.com/terafabXai/status/2074844701526573534",
  );
  assert.equal(isValidOwnPostUrl("https://x.com/someone/status/1"), false);
  assert.equal(isValidOwnPostUrl("https://threads.net/@terafabXai/post/1"), false);
});

test("dashboard batch payload keeps verified reply operating limits", async () => {
  const { buildOwnPostReplyPayload } = await import("../dashboard/src/lib/own-post-reply.mjs");
  assert.deepEqual(buildOwnPostReplyPayload("batch", "https://x.com/terafabXai/status/123"), {
    action: "batch",
    postUrl: "https://x.com/terafabXai/status/123",
    concurrency: 5,
    limit: 200,
    delayMinMs: 10_000,
    delayMaxMs: 20_000,
    ignoreRootCap: true,
  });
  assert.throws(() => buildOwnPostReplyPayload("batch", "https://x.com/other/status/123"), /@terafabXai/);
});

test("dashboard derives per-post monitor and batch result state", async () => {
  const { deriveOwnPostReplyViewState } = await import("../dashboard/src/lib/own-post-reply.mjs");
  const state = deriveOwnPostReplyViewState({
    value: "https://x.com/terafabXai/status/123?s=20",
    status: {
      enabled: true,
      targetUrls: ["https://x.com/terafabXai/status/123"],
      nextRunAt: "2026-07-11T10:00:00.000Z",
    },
    response: {
      action: "batch",
      result: {
        posted: [{ replyUrl: "https://x.com/terafabXai/status/999" }],
        rejected: [{ error: "score too low" }],
        skippedTargets: [],
      },
    },
  });
  assert.equal(state.monitored, true);
  assert.equal(state.monitoringEnabled, true);
  assert.equal(state.posted.length, 1);
  assert.equal(state.rejected.length, 1);
});

test("dashboard shows a queued batch so the user never needs to press twice", async () => {
  const { deriveOwnPostReplyViewState } = await import("../dashboard/src/lib/own-post-reply.mjs");
  const state = deriveOwnPostReplyViewState({
    value: "https://x.com/terafabXai/status/123",
    status: {
      pendingManualCount: 1,
      manualQueue: [{
        id: "request-1",
        postUrl: "https://x.com/terafabXai/status/123",
        status: "queued",
        stageLabel: "대기 중",
      }],
    },
  });
  assert.equal(state.queueActive, true);
  assert.equal(state.queueStageLabel, "대기 중");
  assert.equal(state.pendingManualCount, 1);
});

test("posted table renders reply completion with direct-scan provenance", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "dashboard", "src", "components", "data-table.tsx"), "utf8");
  assert.match(source, /header: "대댓글 완료율"/);
  assert.match(source, /예약 갱신 · 전체 댓글 기준/);
  assert.match(source, /직접 전체수집 기준/);
  assert.match(source, /X 전체 답글 수 기준/);
  assert.match(source, /completion\.completedCount/);
});

test("posted table keeps its page during refresh and exposes the real X post link", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "dashboard", "src", "components", "data-table.tsx"), "utf8");
  assert.match(source, /autoResetPageIndex: false/);
  assert.match(source, /const previousViewRef = React\.useRef\(view\)/);
  assert.match(source, /React\.useLayoutEffect\(\(\) => \{/);
  assert.match(source, /if \(previousViewRef\.current === view\) return/);
  assert.match(source, /setPagination\(\(current\) => \(\{ \.\.\.current, pageIndex: 0 \}\)\)/);
  assert.match(source, /type="button"[\s\S]*?<span className="sr-only">다음<\/span>/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /href=\{row\.original\.xPostUrl\}/);
  assert.match(source, />\s*X 게시글\s*</);
  assert.match(source, />\s*Threads 원문\s*</);
});

test("dashboard removes the previous table synchronously when its view changes", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "dashboard", "src", "main.jsx"), "utf8");
  assert.match(source, /function changeView\(nextView\) \{[\s\S]*?setLoading\(true\);[\s\S]*?setView\(nextView\);/);
  assert.doesNotMatch(source, /onViewChange=\{setView\}/);
  assert.match(source, /onViewChange=\{changeView\}/);
});

test("automation dashboard exposes a dedicated cancellable own-post comment-heart control", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "dashboard", "src", "main.jsx"), "utf8");
  assert.match(source, /<CardTitle>내 글 댓글 자동하트<\/CardTitle>/);
  assert.match(source, /자동하트 OFF·즉시 중단/);
  assert.match(source, /\/api\/terafabx\/own-post-heart/);
  assert.match(source, /onOwnPostHeartAction/);
});

test("legacy today-post reply controls and endpoint are removed", () => {
  const dashboard = fs.readFileSync(path.join(__dirname, "..", "dashboard", "src", "main.jsx"), "utf8");
  const server = fs.readFileSync(path.join(__dirname, "..", "mirror_server.js"), "utf8");
  assert.doesNotMatch(dashboard, /오늘 게시글 대댓글 순회|today-post-reply|todayPostReply/);
  assert.doesNotMatch(server, /\/api\/terafabx\/today-post-reply|terafabxTodayPostReplyBusy|maybeRunTerafabxTodayPostReplyAutomation/);
});
