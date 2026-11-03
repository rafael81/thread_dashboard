const test = require("node:test");
const assert = require("node:assert/strict");
const { COMMENT_SPEECH_VERSION, recentCommentSpeech, commentSpeechHistoryLines, needsCommentSpeechReview, commentSpeechIssues } = require("../lib/comment-speech");
const { assessTerafabxLanguageQuality, parseTerafabxFinalJudge, homeVerifiedCommentLib } = require("../mirror_server");

test('automatic commentary endings require regeneration even when the model gives a perfect score', () => {
  const target = { targetText: '생수 추가요금 받으면 다시 갈 건가요?', commentSpeechVersion: COMMENT_SPEECH_VERSION };
  const flags = ['fatal_error', 'language_error', 'awkward_korean', 'translation_tone', 'cliche', 'context_error', 'unsupported_claim', 'semantic_role_error', 'direct_response_error', 'logical_leap_error', 'cross_post_reusable', 'headline_tone', 'specificity_error'];
  const raw = JSON.stringify({ ...Object.fromEntries(flags.map(k => [k, false])), context: 40, naturalness: 25, specificity: 15, concision: 10, non_ai_style: 10, source_anchor: '생수 추가요금', reason: '문맥 일치' });
  const bad = '생수까지 받으면 고민되긴 하네요ㅋㅋ';
  const judged = parseTerafabxFinalJudge(raw, bad, target);
  assert.equal(judged.passed, false);
  assert.equal(judged.qualityFlags.cliche, true);
  assert.equal(homeVerifiedCommentLib.reconcileHomeVerifiedFinalJudge(judged, target, bad).passed, false);
  assert.equal(parseTerafabxFinalJudge(raw, '물까지 받으면 안 가지', target).passed, true);
  assert.equal(parseTerafabxFinalJudge(raw, bad, { targetText: target.targetText }).passed, true);
  assert.equal(commentSpeechIssues('그랬군요...', target).length, 1);
  assert.equal(commentSpeechIssues('그것도 추가요금이에요?', target).length, 0);
});

test("speech history excludes manual, deleted, current-target and duplicate receipts", () => {
  const row = (id, comment, extra = {}) => ({ replyUrl: `https://x.com/terafabXai/status/${id}`, comment, ...extra });
  const history = [
    row(1, "수동", { manual: true }), row(2, "삭제", { status: "deleted_by_codex_supervision" }),
    row(3, "이번 대상", { targetUrl: "https://x.com/a/status/99" }),
    row(4, "그것도 제한?"), row(4, "중복 이력"), row(5, "왜 거기서 나와ㅋㅋ"),
    { comment: "게시 안 된 초안" },
  ];
  assert.deepEqual(recentCommentSpeech(history, { targetUrl: "https://x.com/a/status/99" }), ["그것도 제한?", "왜 거기서 나와ㅋㅋ"]);
  assert.deepEqual(recentCommentSpeech(history, { targetUrl: "https://x.com/a/status/99", limit: 1 }), ["그것도 제한?"]);
});

test("old queued approvals require the new speech review without clearing source checks", () => {
  assert.equal(needsCommentSpeechReview(), true);
  assert.equal(needsCommentSpeechReview({ passed: true, score: 100 }), true);
  assert.equal(needsCommentSpeechReview({ speechVersion: "old" }), true);
  assert.equal(needsCommentSpeechReview({ speechVersion: COMMENT_SPEECH_VERSION }), false);
});

test("history is bounded quoted data, with no invented default examples", () => {
  assert.deepEqual(commentSpeechHistoryLines(), []);
  const lines = commentSpeechHistoryLines(Array.from({ length: 20 }, () => '"quoted"\ntext'));
  const data = JSON.parse(lines[1].slice("최근 댓글(JSON): ".length));
  assert.equal(data.length, 12);
  assert.equal(data[0], '"quoted"\ntext');
});

test("colloquial fragments pass mechanical checks while invented experience remains blocked", () => {
  for (const reply of ["그것도 제한?", "타르타르 듬뿍...", "손은 공손하게", "왜 거기서 나와ㅋㅋ"]) {
    assert.equal(assessTerafabxLanguageQuality(reply).ok, true, reply);
  }
  assert.equal(assessTerafabxLanguageQuality("직접 가봤는데 훨씬 좋더라고요").ok, false);
});
