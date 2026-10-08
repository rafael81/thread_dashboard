const test = require('node:test');
const assert = require('node:assert/strict');
const { commentTimeContext, commentTimePromptLines } = require('../lib/comment-time-context');
const lib = require('../lib/home-verified-comment');
const prompts = require('../lib/home-verified-comment-prompts');
const now = Date.parse('2026-10-07T09:00:00Z');
const clear = { ambiguous_reference_error: false, temporal_context_error: false, time_sensitive: false };
function audited(target, reply, flags = clear, at = now) {
  return { target, prepared: { comment: reply, geminiReview: { finalJudge: lib.applyHomeVerifiedSourceAudit({
    passed: true, score: 96, qualityFlagsComplete: true, qualityFlags: {}, sourceAnchor: target.targetText,
  }, target, reply, flags, at) } } };
}
const quality = (record, nowMs = now) => lib.assessHomeVerifiedWriteQuality(record, { nowMs });

test('ambiguous subject fails even at 96 points; clearly identified child is allowed', () => {
  const bad = audited({ targetText: '아이가 웃기네 ??? : ICBM 우리나라도 있잖아요' }, '아이가 대답부터 범상치 않네', { ...clear, ambiguous_reference_error: true });
  assert.equal(quality(bad).ok, false);
  assert.equal(quality(audited({ targetText: '우리 아이가 유치원에서 선생님께 편지를 썼다' }, '선생님도 편지 받고 뿌듯하셨겠다')).ok, true);
});

test('source evidence cannot come from generated summary, judge reason or candidate reply', () => {
  const judge = { passed: false, score: 100, dimensions: { context: 40 }, sourceAnchor: '아들의 엉뚱한 대답', reason: '아들의 엉뚱한 대답', flaggedQualityIssues: ['source_anchor_unverifiable'] };
  const target = { targetText: '아이가 웃기네', groundingContext: { contextSummary: '아들의 엉뚱한 대답' }, grokContext: { keyPoints: ['아들의 엉뚱한 대답'] } };
  assert.equal(lib.reconcileHomeVerifiedFinalJudge(judge, target, '아들의 엉뚱한 대답').passed, false);
  const prompt = prompts.homeVerifiedFinalJudgePrompt(target, { contextSummary: '아들이라는거짓요약' }, '후보', now);
  assert.equal(prompt.includes('아들이라는거짓요약'), false);
});

test('missing flags and nonliteral anchors fail closed', () => {
  const target = { targetText: '고속도로에서 세 시간째' };
  const missing = audited(target, '많이 막혔구나', {});
  assert.equal(quality(missing).ok, false);
  const record = audited(target, '많이 막혔구나');
  record.prepared.geminiReview.finalJudge.sourceAnchor = '원문에 없는 근거';
  assert.ok(quality(record).errors.includes('source_anchor_not_literal'));
});

test('source and reply mutations invalidate approval', () => {
  const original = audited({ targetText: '휴게소 충전이 편해졌다' }, '충전하기 편해졌네');
  for (const mutate of [r => { r.target.targetText = '다른 원문'; }, r => { r.prepared.comment = '다른 댓글'; }]) {
    const record = structuredClone(original); mutate(record);
    assert.ok(quality(record).errors.includes('source_grounding_audit_stale'));
  }
});

test('post metadata survives target building; seconds and X status ID are fallback time sources', () => {
  const target = lib.buildHomeVerifiedCommentTarget({ url: 'https://x.com/a/status/2107690519027654867', text: '본문', createdAt: '2026-09-25T09:00:00Z', createdTimestamp: 1790326800 });
  assert.equal(target.createdAt, '2026-09-25T09:00:00Z');
  assert.equal(commentTimeContext(target, now).source, 'post_metadata');
  assert.equal(commentTimeContext({ createdTimestamp: Date.parse(target.createdAt) / 1000 }, now).postAt, new Date(target.createdAt).toISOString());
  assert.equal(commentTimeContext({ url: target.url }, now).postAt, '2026-10-07T04:32:33.389Z');
  assert.equal(commentTimeContext({ queuedAt: target.createdAt }, now).known, false);
  assert.equal(commentTimeContext({ createdAt: '2027-01-01' }, now).known, false);
});

test('prompt distinguishes source time and current KST; stale holiday advice fails regardless of score', () => {
  const target = { createdAt: '2026-09-25T09:00:00Z', targetText: '추석 연휴 마지막 날 귀경길이 막힌다' };
  const lines = commentTimePromptLines(target, now).join('\n');
  assert.match(lines, /2026-09-25 18:00:00 KST/);
  assert.match(lines, /2026-10-07 18:00:00 KST/);
  assert.match(lines, /17280분/);
  assert.equal(quality(audited(target, '귀경 조심하세요', { ...clear, time_sensitive: true, temporal_context_error: true })).ok, false);
  assert.equal(quality(audited(target, '연휴 정체가 심했네')).ok, true);
});

test('queued approvals expire with elapsed time and KST midnight, and are retained for fresh review', () => {
  const target = { createdAt: '2026-09-25T09:00:00Z', targetText: '길이 막힌다' };
  const ordinary = audited(target, '많이 막혔네');
  assert.equal(quality(ordinary).ok, true);
  assert.equal(lib.homeVerifiedNeedsReviewRefresh(quality(ordinary, now + 300001)), true);
  assert.equal(lib.homeVerifiedNeedsReviewRefresh(quality(audited(target, '천천히 가요', { ...clear, time_sensitive: true }), now + 60001)), true);
  const midnight = Date.parse('2026-10-07T14:59:50Z');
  assert.equal(lib.homeVerifiedNeedsReviewRefresh(quality(audited(target, '많이 막혔네', clear, midnight), midnight + 11000)), true);
  const legacy = structuredClone(ordinary); delete legacy.prepared.geminiReview.finalJudge.sourceAudit;
  assert.equal(lib.homeVerifiedNeedsReviewRefresh(quality(legacy)), true);
  assert.equal(lib.homeVerifiedNeedsReviewRefresh(quality(audited(target, '귀경 조심하세요', { ...clear, temporal_context_error: true }))), false);
});

test('explicit model abstention is a terminal discard instead of retrying the same misleading draft', () => {
  assert.throws(() => lib.assertHomeVerifiedReplyNotDeclined({ final_reply: '', reason: '불명확한 주어' }, 'final_reply'), error => error.code === 'HOME_VERIFIED_JUDGE_DISCARD' && error.noRetry && error.discard);
  assert.doesNotThrow(() => lib.assertHomeVerifiedReplyNotDeclined({ reply: '근거 있는 댓글' }));
});
