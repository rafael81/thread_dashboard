const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  buildAutomationDashboardData,
  buildAutomationDashboardOverview,
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

  assert.deepEqual(Object.keys(overview).sort(), Object.keys(full).sort());
  assert.equal(overview.comment.enabled, full.comment.enabled);
  assert.equal(overview.comment.pendingPostCount, full.comment.pendingPostCount);
  assert.deepEqual(overview.comment.daily, full.comment.daily);
  assert.equal(overview.heart.enabled, full.heart.enabled);
  assert.equal(overview.follow.enabled, full.follow.enabled);
  assert.equal(Object.hasOwn(overview.comment, "history"), false);
  assert.equal(Object.hasOwn(overview.comment, "pendingPosts"), false);
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
    ensureAvatars: async () => {
      calls.push("avatars");
      return { ok: true };
    },
    getCoupang: async () => {
      calls.push("coupang");
      return { ok: true };
    },
    getTerafabx: () => {
      calls.push("terafabx");
      return { comment: { enabled: true } };
    },
    buildAutomation: (rows, nowMs) => {
      calls.push(`automation:${rows.length}:${nowMs}`);
      return { summary: { commentCount: 1 }, commentTimeline: [{ at: "now" }] };
    },
  });

  assert.deepEqual(calls.slice().sort(), ["automation:1:123", "avatars", "terafabx"]);
  assert.equal(details.automation.commentTimeline.length, 1);
  assert.equal(details.terafabx.comment.enabled, true);
  assert.deepEqual(details.avatarEnrichment, { ok: true });
  assert.equal(Object.hasOwn(details, "coupang"), false);
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
