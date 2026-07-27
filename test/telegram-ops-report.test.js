const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildTelegramOpsReport,
  compactError,
} = require("../scripts/send-telegram-ops-report");

test("Telegram operations report summarizes schedules and automation without secrets", () => {
  const text = buildTelegramOpsReport({
    checkedAt: new Date("2026-07-25T11:00:00.000Z"),
    responseMs: 432,
    automation: {
      summary: { lastCommentAt: "2026-07-25T10:59:00.000Z" },
      terafabx: {
        comment: {
          daily: { postedToday: 344, dailyTarget: 600 },
          pendingPostCount: 12,
          coverage: { lastStatus: "running", backlogCount: 8 },
        },
        commentPipeline: { status: "running", label: "전체 게시글 순회 중" },
        commentPrefill: { quotaLimited: false },
        heart: { lastCount: 5, lastStatus: "ok" },
      },
    },
    discovery: {
      summary: { scheduledCount: 7 },
      rows: [
        { author: "stale", status: "scheduling", lastError: null },
        { author: "failed", status: "failed_schedule", lastError: "X 작성창 로딩 실패" },
      ],
    },
  });

  assert.match(text, /예약: 예정 7 · 진행 1 · 실패 1/);
  assert.match(text, /자동댓글: 오늘 344\/600 · 대기 12/);
  assert.match(text, /@failed: X 작성창 로딩 실패/);
  assert.doesNotMatch(text, /BOT_TOKEN|CHAT_ID/);
});

test("Telegram operations report bounds long errors", () => {
  assert.equal(compactError("x".repeat(200), 20), `${"x".repeat(19)}…`);
});
