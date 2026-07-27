const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const test = require("node:test");

const {
  buildAutomationLiveSnapshot,
  streamAutomationLiveEvents,
} = require("../mirror_server");

test("live automation snapshot keeps coverage backlog out of the real X posting queue", () => {
  const now = Date.parse("2026-07-26T12:00:00.000Z");
  const snapshot = buildAutomationLiveSnapshot({
    now,
    state: {
      commentEnabled: true,
      commentMode: "own_post_full_coverage",
      commentHistory: [
        {
          at: "2026-07-26T11:59:00.000Z",
          targetUrl: "https://x.com/user/status/1",
          replyUrl: "https://x.com/terafabXai/status/2",
          targetText: "원문",
          comment: "자연스러운 댓글",
          qualityScore: 96,
        },
      ],
    },
    pendingPosts: [],
    reviewQueue: [],
    pipeline: {
      status: "running",
      label: "전체 게시글 순회 중",
      mode: "own_post_full_coverage",
      pendingCount: 12,
      coverage: {
        lastSummary: {
          pageCount: 5,
          apiPendingCount: 24,
          processed: [],
        },
      },
    },
    discovery: { candidateCount: 30, succeededCount: 10 },
    daily: {
      date: "2026-07-26",
      postedToday: 241,
      dailyTarget: 1000,
      remaining: 759,
      behindBy: 550,
      postedPerActiveHour: 16.9,
      requiredPerActiveHour: 55.6,
      onTrack: false,
    },
    writerBusy: false,
    prefillBusy: false,
    coverageBusy: false,
    coverageRuntime: { status: "complete", stage: "complete" },
    writerQueueDepth: 0,
    writerActiveCount: 0,
  });

  assert.equal(snapshot.stages.length, 6);
  assert.deepEqual(snapshot.stages.map((stage) => stage.id), [
    "collect",
    "context",
    "gemini",
    "queue",
    "x_post",
    "complete",
  ]);
  assert.equal(snapshot.stages.find((stage) => stage.id === "collect").count, 12);
  assert.equal(snapshot.stages.find((stage) => stage.id === "collect").metric.unit, "root_post");
  assert.equal(snapshot.stages.find((stage) => stage.id === "collect").metric.source, "coverage_backlog");
  assert.equal(snapshot.stages.find((stage) => stage.id === "queue").state, "idle");
  assert.equal(snapshot.stages.find((stage) => stage.id === "queue").count, 0);
  assert.equal(snapshot.summary.delayed, 0);
  assert.equal(snapshot.daily.posted, 241);
  assert.equal(snapshot.throughputPerMinute, 0.1);
  assert.equal(snapshot.activities[0].status, "complete");
  assert.equal(snapshot.activities[0].title, "자연스러운 댓글");
});

test("live automation snapshot exposes concurrent coverage, Gemini, and X-writer state", () => {
  const now = Date.parse("2026-07-26T12:00:00.000Z");
  const snapshot = buildAutomationLiveSnapshot({
    now,
    state: {
      commentEnabled: true,
      commentMode: "own_post_full_coverage",
      commentHistory: [],
    },
    pendingPosts: [{
      id: "pending-1",
      comment: "게시 대기 댓글",
      queuedAt: "2026-07-26T11:30:00.000Z",
    }],
    reviewQueue: [],
    pipeline: {
      status: "running",
      label: "전체 게시글 순회 중",
      mode: "own_post_full_coverage",
      pendingCount: 90,
      coverage: { backlogCount: 90, lastSummary: {} },
    },
    discovery: {},
    daily: {
      date: "2026-07-26",
      postedToday: 250,
      dailyTarget: 1000,
      remaining: 750,
      requiredIntervalMs: 60_000,
    },
    writerBusy: false,
    prefillBusy: false,
    coverageBusy: true,
    coverageRuntime: {
      status: "running",
      stage: "gemini",
      startedAt: "2026-07-26T11:59:00.000Z",
      updatedAt: "2026-07-26T11:59:59.000Z",
      selectedRootCount: 20,
      collectedRootCount: 20,
      candidateCount: 12,
      reviewedCount: 7,
      postedCount: 2,
    },
    writerQueueDepth: 4,
    writerActiveCount: 1,
  });

  assert.equal(snapshot.schemaVersion, 2);
  assert.equal(snapshot.stages.find((stage) => stage.id === "collect").count, 0);
  assert.deepEqual(
    {
      unit: snapshot.stages.find((stage) => stage.id === "collect").metric.unit,
      total: snapshot.stages.find((stage) => stage.id === "collect").metric.total,
      completed: snapshot.stages.find((stage) => stage.id === "collect").metric.completed,
      remaining: snapshot.stages.find((stage) => stage.id === "collect").metric.remaining,
    },
    { unit: "root_post", total: 20, completed: 20, remaining: 0 },
  );
  assert.equal(snapshot.stages.find((stage) => stage.id === "gemini").state, "active");
  assert.equal(snapshot.stages.find((stage) => stage.id === "gemini").count, 5);
  assert.deepEqual(
    {
      unit: snapshot.stages.find((stage) => stage.id === "gemini").metric.unit,
      valueKind: snapshot.stages.find((stage) => stage.id === "gemini").metric.valueKind,
      total: snapshot.stages.find((stage) => stage.id === "gemini").metric.total,
      completed: snapshot.stages.find((stage) => stage.id === "gemini").metric.completed,
      remaining: snapshot.stages.find((stage) => stage.id === "gemini").metric.remaining,
    },
    {
      unit: "reply_candidate",
      valueKind: "remaining",
      total: 12,
      completed: 7,
      remaining: 5,
    },
  );
  assert.equal(snapshot.stages.find((stage) => stage.id === "queue").count, 3);
  assert.equal(snapshot.stages.find((stage) => stage.id === "queue").state, "waiting");
  assert.match(
    snapshot.stages.find((stage) => stage.id === "queue").detail,
    /게시 중 1건 · 뒤 대기 3건/,
  );
  assert.equal(snapshot.stages.find((stage) => stage.id === "x_post").state, "active");
  assert.equal(snapshot.stages.find((stage) => stage.id === "x_post").count, 1);
  assert.equal(snapshot.activities[0].status, "active");
  assert.equal(snapshot.activities[0].scope, "current");
  assert.equal(snapshot.activities[0].runId, "2026-07-26T11:59:00.000Z");
  assert.equal(snapshot.activities[0].title, "대댓글 후보 12개 Gemini 검수");
  assert.equal(snapshot.activities[0].at, "2026-07-26T11:59:00.000Z");
  assert.doesNotMatch(snapshot.activities[0].title, /원글 20개 순회/);
  assert.match(snapshot.activities[0].detail, /Gemini 검수 7\/12/);
  assert.equal(snapshot.runs.current.id, "2026-07-26T11:59:00.000Z");
  assert.equal(snapshot.runs.current.counters.replyCandidates, 12);
  assert.equal(snapshot.summary.activeStages, 2);
  assert.equal(snapshot.summary.waitingReplies, 3);
});

test("completed coverage activity uses the saved post text instead of a generic status-id title", () => {
  const rootUrl = "https://x.com/terafabXai/status/2081295962048258233";
  const snapshot = buildAutomationLiveSnapshot({
    now: Date.parse("2026-07-26T12:00:00.000Z"),
    state: {
      commentEnabled: true,
      commentMode: "own_post_full_coverage",
      commentHistory: [],
      ownPostReplyCoverage: {
        [rootUrl]: {
          rootPostText: "와 미친거 아냐..? 음식이 바로 나온다더라",
        },
      },
    },
    pendingPosts: [],
    reviewQueue: [],
    pipeline: {
      status: "running",
      mode: "own_post_full_coverage",
      pendingCount: 1,
      coverage: {
        backlogCount: 1,
        lastSummary: {
          completedAt: "2026-07-26T11:00:00.000Z",
          processed: [{ rootUrl, postedCount: 0, remainingEligibleCount: 0 }],
        },
      },
    },
    discovery: {},
    daily: { date: "2026-07-26", postedToday: 0, dailyTarget: 1000, remaining: 1000 },
    coverageBusy: true,
    coverageRuntime: { status: "idle", stage: "idle" },
    writerBusy: false,
    writerQueueDepth: 0,
    writerActiveCount: 0,
  });

  const activity = snapshot.activities.find((item) => item.targetUrl === rootUrl);
  assert.equal(activity.title, "와 미친거 아냐..? 음식이 바로 나온다더라");
  assert.equal(activity.status, "complete");
  assert.equal(activity.stage, "complete");
  assert.equal(activity.scope, "history");
  assert.match(activity.detail, /내 X 원글 댓글 확인 완료/);
  assert.equal(activity.at, "2026-07-26T11:00:00.000Z");
  assert.equal(snapshot.runs.current, null);
  assert.equal(snapshot.runs.lastCompleted.id, "2026-07-26T11:00:00.000Z");
  assert.doesNotMatch(activity.title, /^내 게시글 /);
});

test("every live stage declares a stable unit, source, and non-mixed numeric contract", () => {
  const snapshot = buildAutomationLiveSnapshot({
    now: Date.parse("2026-07-26T12:00:00.000Z"),
    state: {
      commentEnabled: true,
      commentMode: "own_post_full_coverage",
      commentHistory: [],
    },
    pendingPosts: [],
    reviewQueue: [],
    pipeline: {
      status: "running",
      mode: "own_post_full_coverage",
      pendingCount: 90,
      coverage: { backlogCount: 90, lastSummary: {} },
    },
    discovery: {},
    daily: { postedToday: 250, dailyTarget: 1000, remaining: 750 },
    coverageBusy: true,
    coverageRuntime: {
      status: "running",
      stage: "context",
      startedAt: "2026-07-26T11:59:00.000Z",
      updatedAt: "2026-07-26T11:59:30.000Z",
      selectedRootCount: 20,
      collectedRootCount: 20,
      contextRequestedCount: 13,
      contextRootCount: 4,
      candidateCount: 341,
      reviewedCount: 0,
      postedCount: 0,
    },
    writerBusy: false,
    writerQueueDepth: 0,
    writerActiveCount: 0,
  });

  assert.deepEqual(
    snapshot.stages.map((stage) => stage.metric.unit),
    [
      "root_post",
      "root_context",
      "reply_candidate",
      "queued_reply",
      "active_x_write",
      "posted_reply",
    ],
  );
  for (const stage of snapshot.stages) {
    assert.equal(stage.count, stage.metric.value);
    assert.equal(typeof stage.metric.source, "string");
    assert.equal(stage.metric.remaining >= 0, true);
    assert.equal(stage.metric.completed >= 0, true);
    assert.equal(stage.metric.total >= 0, true);
  }
  const context = snapshot.stages.find((stage) => stage.id === "context");
  assert.deepEqual(
    {
      valueKind: context.metric.valueKind,
      value: context.metric.value,
      total: context.metric.total,
      completed: context.metric.completed,
      remaining: context.metric.remaining,
    },
    { valueKind: "completed", value: 4, total: 13, completed: 4, remaining: 9 },
  );
  assert.deepEqual(snapshot.runs.current.activeStages, ["context"]);
});

test("live board uses stage-specific status copy instead of an unexplained bottleneck label", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(
    path.join(__dirname, "..", "dashboard", "src", "components", "automation-live-board.jsx"),
    "utf8",
  );
  assert.doesNotMatch(source, /병목 확인 필요/);
  assert.match(source, /stage\.footer/);
  assert.match(source, /normalizedStageMetric\(stage\)/);
  assert.match(source, /stageMetricCaption\(metric\)/);
  assert.doesNotMatch(source, /compact\(stage\.count\)/);
  assert.match(source, /activity\.scope === "current"/);
  assert.match(source, /처리 시각/);
  assert.doesNotMatch(source, />시작 시간</);
  assert.match(source, /normalizeActivityDisplay\(item, snapshot\)/);
  assert.match(source, /내 X 원글 댓글 확인 완료/);
});

class FakeStream extends EventEmitter {
  constructor() {
    super();
    this.headers = null;
    this.chunks = [];
    this.writableEnded = false;
    this.destroyed = false;
  }

  writeHead(status, headers) {
    this.status = status;
    this.headers = headers;
  }

  write(chunk) {
    this.chunks.push(String(chunk));
    return true;
  }

  end() {
    this.writableEnded = true;
  }
}

test("live automation SSE releases its timer and response when the client disconnects", () => {
  const req = new EventEmitter();
  const res = new FakeStream();
  let timerCleared = 0;
  const timer = { unref() {} };

  streamAutomationLiveEvents(req, res, {
    intervalMs: 500,
    snapshot: () => ({ ok: true, updatedAt: "2026-07-26T12:00:00.000Z" }),
    setInterval: () => timer,
    clearInterval: (received) => {
      assert.equal(received, timer);
      timerCleared += 1;
    },
  });

  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/event-stream/);
  assert.match(res.chunks.join(""), /event: snapshot/);

  req.emit("close");
  assert.equal(timerCleared, 1);
  assert.equal(res.writableEnded, true);

  req.emit("close");
  assert.equal(timerCleared, 1);
});
