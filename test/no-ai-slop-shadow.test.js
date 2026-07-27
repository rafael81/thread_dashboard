const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildShadowReport,
  extractJsonArray,
  noAiSlopBlindJudgePrompt,
  noAiSlopEditorPrompt,
  normalizeEdits,
  normalizeJudgments,
  recentPostedCommentSamples,
  stableVariantOrder,
} = require("../scripts/no-ai-slop-shadow-ab");

const samples = [{
  index: 0,
  rootPostText: "토끼가 수영한다",
  targetText: "신기하네요",
  targetUrl: "https://x.com/example/status/1234567890123456789",
  draft: "물에서 헤엄치는 모습 신기하네요",
  a: "진짜 물에서 여유롭게 헤엄치네요",
}];

test("no-ai-slop shadow samples use recent posted text comments only", () => {
  const selected = recentPostedCommentSamples({
    commentHistory: [
      { at: "2026-07-25T00:00:00Z", rootPostText: "원글", targetText: "댓글", comment: "이전 댓글" },
      { at: "2026-07-25T01:00:00Z", rootPostText: "원글", targetText: "GIF", comment: "❤️" },
      { at: "2026-07-25T02:00:00Z", rootPostText: "원글", targetText: "댓글", comment: "최근 댓글" },
    ],
  }, 2);
  assert.deepEqual(selected.map((item) => item.draft), ["최근 댓글", "이전 댓글"]);
});

test("no-ai-slop editor prompt is shadow-only and forbids invented context", () => {
  const prompt = noAiSlopEditorPrompt(samples);
  assert.match(prompt, /실제로 게시하지 않는 섀도 B안/);
  assert.match(prompt, /없는 사실·행동·감정·수치·원인을 추가하지 마라/);
  assert.match(prompt, /최소한만 고쳐라/);
  assert.match(prompt, /교정할 생성 초안/);
  assert.doesNotMatch(prompt, /현재 게시 댓글 A/);
});

test("no-ai-slop blind judge randomizes variants without identifying A or B", () => {
  const prompt = noAiSlopBlindJudgePrompt(samples, [{
    index: 0,
    shadow_reply: "토끼가 이렇게 자연스럽게 헤엄칠 줄은 몰랐네요",
  }]);
  assert.match(prompt, /선택지 1/);
  assert.match(prompt, /선택지 2/);
  assert.doesNotMatch(prompt, /노슬롭|현재 게시 댓글 A/);
});

test("no-ai-slop JSON normalization requires every shadow result", () => {
  const parsed = extractJsonArray('```json\n[{"index":0,"shadow_reply":"토끼가 이렇게 자연스럽게 헤엄칠 줄은 몰랐네요","decision":"rewrite"}]\n```');
  const edits = normalizeEdits(samples, parsed);
  assert.equal(edits[0].decision, "rewrite");
  assert.throws(() => normalizeEdits([...samples, { ...samples[0], index: 1 }], parsed), /결과 누락/);
});

test("no-ai-slop report maps a blinded choice back to B", () => {
  const order = stableVariantOrder(0, samples[0].targetUrl);
  const bChoice = order === "ab" ? "2" : "1";
  const edits = normalizeEdits(samples, [{
    index: 0,
    shadow_reply: "토끼가 이렇게 자연스럽게 헤엄칠 줄은 몰랐네요",
    decision: "rewrite",
  }]);
  const judgments = normalizeJudgments(samples, [{ index: 0, choice: bChoice, reason: "더 자연스러움" }]);
  const report = buildShadowReport(samples, edits, judgments);
  assert.equal(report.counts.b, 1);
  assert.equal(report.rows[0].winner, "b");
});
