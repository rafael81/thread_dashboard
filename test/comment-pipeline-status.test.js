const assert = require("node:assert/strict");
const test = require("node:test");

const { deriveTerafabxCommentPipelineHealth } = require("../mirror_server");

test("comment pipeline reports a Gemini preparation blocker before Grok workers start", () => {
  const health = deriveTerafabxCommentPipelineHealth({
    enabled: true,
    pendingCount: 0,
    prefillBusy: false,
    lastStatus: "error",
    lastError: "Gemini worker 프로필 준비 실패: 1, 2, 3, 4, 5",
    grokActiveSessionCount: 0,
    geminiReadyCount: 0,
    workerCount: 5,
  });

  assert.deepEqual(health, {
    status: "blocked",
    label: "생성 차단",
    blocker: "Gemini worker 프로필 준비 실패: 1, 2, 3, 4, 5",
  });
});

test("comment pipeline distinguishes ready comments from active Grok analysis", () => {
  assert.equal(deriveTerafabxCommentPipelineHealth({
    enabled: true,
    pendingCount: 4,
    geminiReadyCount: 5,
    workerCount: 5,
  }).status, "ready");

  assert.deepEqual(deriveTerafabxCommentPipelineHealth({
    enabled: true,
    prefillBusy: true,
    grokActiveSessionCount: 3,
    geminiReadyCount: 5,
    workerCount: 5,
  }), {
    status: "running",
    label: "Grok 분석 중",
    blocker: null,
  });
});

test("comment pipeline shows an explicit Grok quota blocker even with saved prefills", () => {
  assert.deepEqual(deriveTerafabxCommentPipelineHealth({
    enabled: true,
    pendingCount: 21,
    geminiReadyCount: 5,
    workerCount: 5,
    grokQuotaBlocker: "Grok 주간 사용량 제한: 7월 19일 초기화",
  }), {
    status: "blocked",
    label: "Grok 사용량 제한",
    blocker: "Grok 주간 사용량 제한: 7월 19일 초기화",
  });
});

test("comment pipeline labels a short individual Grok cooldown separately", () => {
  assert.deepEqual(deriveTerafabxCommentPipelineHealth({
    enabled: true,
    pendingCount: 23,
    geminiReadyCount: 1,
    workerCount: 1,
    grokQuotaBlocker: "Grok 개별 요청 일시 제한: 10분 후 재시도",
  }), {
    status: "blocked",
    label: "Grok 개별 요청 대기",
    blocker: "Grok 개별 요청 일시 제한: 10분 후 재시도",
  });
});
