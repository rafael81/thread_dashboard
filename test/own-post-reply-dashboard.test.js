const assert = require("node:assert/strict");
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
