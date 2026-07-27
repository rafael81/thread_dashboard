const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  buildAutomationDashboardData,
  buildAutomationDashboardOverview,
  compactAutomationGeminiReview,
  compactAutomationGrokContext,
  compactTerafabxDashboardStatus,
  getTerafabxAutomationStatus,
  getTerafabxDashboardOverview,
  listenBeforeStartingBackgroundWork,
  loadDiscoveryDashboardDetails,
} = require("../mirror_server");

test("compact automation overview preserves full dashboard summary and daily flow totals", () => {
  const nowMs = Date.now();
  const full = buildAutomationDashboardData([], nowMs);
  const overview = buildAutomationDashboardOverview([], nowMs);

  assert.deepEqual(overview.summary, full.summary);
  assert.deepEqual(overview.flowDays, full.flowDays);
  assert.equal(Object.hasOwn(overview, "commentTimeline"), false);
});

test("TerafabX overview preserves the control-panel state without history payloads", () => {
  const full = compactTerafabxDashboardStatus(getTerafabxAutomationStatus());
  const overview = getTerafabxDashboardOverview();

  assert.equal(overview.comment.enabled, full.comment.enabled);
  assert.equal(overview.comment.pendingPostCount, full.comment.pendingPostCount);
  assert.deepEqual(overview.comment.daily, full.comment.daily);
  assert.equal(overview.heart.enabled, full.heart.enabled);
  assert.equal(overview.follow.enabled, full.follow.enabled);
  assert.equal(Object.hasOwn(overview.comment, "history"), false);
  assert.equal(Object.hasOwn(overview.comment, "pendingPosts"), false);
  assert.equal(Object.hasOwn(full.ownPostReply, "history"), false);
  assert.equal(Object.hasOwn(full.heart, "history"), false);
  assert.equal(Object.hasOwn(full.follow, "history"), false);
});

test("ordinary discovery views load only compact accurate dashboard overview data", async () => {
  const calls = [];
  const dependencies = {
    ensureAvatars: async () => calls.push("avatars"),
    getCoupang: async () => calls.push("coupang"),
    getTerafabx: () => calls.push("terafabx"),
    buildAutomation: () => calls.push("automation"),
    getTerafabxOverview: () => {
      calls.push("terafabx-overview");
      return { comment: { enabled: true } };
    },
    buildAutomationOverview: () => {
      calls.push("automation-overview");
      return { summary: { commentCount: 2000, heartCount: 18 }, flowDays: [] };
    },
  };

  for (const view of ["discovered", "scheduled", "posted", "unknown"]) {
    const result = await loadDiscoveryDashboardDetails(view, [], Date.now(), dependencies);
    assert.equal(result.automation.summary.commentCount, 2000);
    assert.equal(result.automation.summary.heartCount, 18);
    assert.equal(result.terafabx.comment.enabled, true);
    assert.equal(Object.hasOwn(result.automation, "commentTimeline"), false);
  }
  assert.deepEqual(calls, [
    "automation-overview", "terafabx-overview",
    "automation-overview", "terafabx-overview",
    "automation-overview", "terafabx-overview",
    "automation-overview", "terafabx-overview",
  ]);
});

test("automation view loads automation details but not unrelated Coupang performance", async () => {
  const calls = [];
  const details = await loadDiscoveryDashboardDetails("automation", [{ status: "posted" }], 123, {
    scheduleAvatars: () => {
      calls.push("avatars");
      return { scheduled: true, busy: false };
    },
    getCoupang: async () => {
      calls.push("coupang");
      return { ok: true };
    },
    getTerafabx: () => {
      calls.push("terafabx");
      return { comment: { enabled: true } };
    },
    timelineDate: "2026-07-25",
    timelineLimit: "125",
    buildAutomation: (rows, nowMs, options) => {
      calls.push(`automation:${rows.length}:${nowMs}`);
      calls.push(`scope:${options.timelineDate}:${options.timelineLimit}`);
      return { summary: { commentCount: 1 }, commentTimeline: [{ at: "now" }] };
    },
  });

  assert.deepEqual(calls.slice().sort(), ["automation:1:123", "avatars", "scope:2026-07-25:125", "terafabx"]);
  assert.equal(details.automation.commentTimeline.length, 1);
  assert.equal(details.terafabx.comment.enabled, true);
  assert.deepEqual(details.avatarEnrichment, { scheduled: true, busy: false });
  assert.equal(Object.hasOwn(details, "coupang"), false);
});

test("automation timeline payload keeps only UI fields from large AI diagnostics", () => {
  const grok = compactAutomationGrokContext({
    summary: "원글 요약",
    keyPoints: ["핵심 1", "핵심 2"],
    provider: "grok",
    raw: "x".repeat(100_000),
    mediaAnalysis: { frames: Array(100).fill("large") },
  });
  const gemini = compactAutomationGeminiReview({
    score: 88,
    decision: "approve",
    reason: "자연스러움",
    finalJudge: { score: 91, reason: "통과", raw: "large" },
    rawPreview: "x".repeat(100_000),
    dimensions: { relevance: 10 },
  });

  assert.deepEqual(grok, {
    summary: "원글 요약",
    keyPoints: ["핵심 1", "핵심 2"],
    provider: "grok",
  });
  assert.deepEqual(gemini, {
    score: 88,
    decision: "approve",
    reason: "자연스러움",
    finalJudge: { score: 91, reason: "통과" },
  });
  assert.equal(JSON.stringify({ grok, gemini }).length < 500, true);
});

class FakeServer extends EventEmitter {
  listen(port, host, callback) {
    this.listenArgs = { port, host };
    this.listenCallback = callback;
  }
}

test("background work starts exactly once after HTTP listen succeeds", async () => {
  const server = new FakeServer();
  let starts = 0;
  const listening = listenBeforeStartingBackgroundWork(server, {
    port: 3131,
    host: "0.0.0.0",
    startBackgroundWork: () => { starts += 1; },
  });

  assert.equal(starts, 0);
  server.listenCallback();
  await listening;
  assert.equal(starts, 1);
  assert.deepEqual(server.listenArgs, { port: 3131, host: "0.0.0.0" });
});

test("HTTP listen failure rejects without starting background work", async () => {
  const server = new FakeServer();
  let starts = 0;
  const listening = listenBeforeStartingBackgroundWork(server, {
    port: 3131,
    host: "0.0.0.0",
    startBackgroundWork: () => { starts += 1; },
  });
  const error = Object.assign(new Error("address already in use"), { code: "EADDRINUSE" });

  server.emit("error", error);
  await assert.rejects(listening, (received) => received === error);
  assert.equal(starts, 0);
});
