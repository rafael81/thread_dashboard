const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const lang = require('../lib/comment-language');
const home = require('../lib/home-verified-comment');
const now = Date.now();
const registry = () => ({ enabled: true, accounts: { alice: { handle: 'alice', language: 'ja', following: true, relationshipCheckedAt: new Date(now).toISOString(), evidenceAt: new Date(now).toISOString() } }, graphs: {} });
const jp = '散歩から帰ったら猫が玄関でずっと待っていました。';
test('language labels describe public text, not names, location or Han-only nationality guesses', () => {
  assert.equal(lang.languageOf(jp), 'ja');
  assert.equal(lang.languageOf('東京 中国 日本 上海'), 'unknown');
  assert.equal(lang.languageOf('오늘 고양이가 문 앞에서 기다리고 있네'), 'ko');
  assert.equal(lang.replyLanguage({ authorHandle: 'outsider', text: jp, replyLanguage: 'ja' }, registry()), 'ko');
  assert.equal(lang.sourceLanguage({ authorHandle: 'Alice', text: jp }, registry()), 'ja');
  assert.equal(lang.replyLanguage({ authorHandle: 'Alice', text: jp }, registry()), 'ko');
});
test('Japanese eligibility fails closed for disabled, expired, removed and private accounts', () => {
  for (const update of [{ protected: true }, { following: false }, { evidenceAt: '2025-01-01' }, { relationshipCheckedAt: '2025-01-01' }]) {
    const r = registry(); Object.assign(r.accounts.alice, update); assert.equal(lang.japaneseAccount('alice', r, now), null);
  }
  const r = registry(); r.enabled = false; assert.equal(lang.japaneseAccount('alice', r, now), null);
});
test('eligible Japanese originals pass language filter while sensitive content and unrelated languages remain blocked', () => {
  const options = { authorHandle: 'alice', languageRegistry: registry() };
  assert.equal(home.assessHomeVerifiedOriginalContentSafety(jp, options).ok, true);
  assert.equal(home.assessHomeVerifiedOriginalContentSafety('絶対に儲かる投資をみんなに教えます', options).reason, 'japanese_sensitive_original');
  assert.equal(home.assessHomeVerifiedOriginalContentSafety('A beautiful day for walking in the park', options).reason, 'foreign_language_dominant');
  assert.equal(home.assessHomeVerifiedOriginalContentSafety(jp, { ...options, authorHandle: 'outsider' }).ok, false);
  assert.equal(home.isHomeVerifiedLinkOrSpaceOnlyWeakText(jp), false);
  assert.equal(home.isHomeVerifiedLinkOrSpaceOnlyWeakText('今天出去吃早餐了'), true);
});
test('timeline evidence excludes quoted and other authors posts', () => {
  const r = registry(); r.accounts.alice.language = 'unknown';
  const row = { author: { screen_name: 'alice' }, text: jp };
  lang.observePosts(r, 'alice', [{ ...row, quote: {} }, { ...row, author: { screen_name: 'else' } }]);
  assert.equal(r.accounts.alice.language, 'unknown');
  lang.observePosts(r, 'alice', [{ ...row, id: '1' }, { ...row, id: '2' }]);
  assert.equal(r.accounts.alice.language, 'ja');
});
test('following and followers merge; failed partial scans preserve prior relationships', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-language-')); const file = path.join(dir, 'registry.json');
  try {
    lang.saveRegistry(registry(), file);
    await lang.refreshGraph({ file, force: true, request: async url => ({ code: 200, results: [{ screen_name: 'alice', description: jp }], cursor: {} }) });
    let r = lang.readRegistry(file); assert.equal(r.accounts.alice.following, true); assert.equal(r.accounts.alice.follower, true);
    assert.equal(lang.registrySummary(r).mutualJapanese, 1);
    await lang.refreshGraph({ file, force: true, request: async () => { throw new Error('HTTP 429'); } });
    r = lang.readRegistry(file); assert.equal(r.accounts.alice.following, true); assert.equal(r.graphs.followers.error, 'HTTP 429');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('Japanese source discovery keeps Korean generation, review and final judging', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-ja-prompt-')); const file = path.join(dir, 'registry.json');
  try {
    lang.saveRegistry(registry(), file);
    const script = `const p=require('./lib/home-verified-comment-prompts');const t={kind:'home_verified_original',authorHandle:'alice',text:${JSON.stringify(jp)}};console.log(JSON.stringify({draft:p.homeVerifiedGrokContextPrompt(t),review:p.homeVerifiedGeminiReviewPrompt(t),judge:p.homeVerifiedFinalJudgePrompt(t)}));`;
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, COMMENT_LANGUAGE_REGISTRY_FILE: file }, encoding: 'utf8' }));
    assert.match(out.draft, /자연스러운 한국어/); assert.doesNotMatch(out.draft, /자연스러운 일본어/);
    assert.match(out.review, /규칙: 한국어/); assert.match(out.judge, /일본어 원문을 정확히 이해한 한국어 반응은 허용/);
    assert.match(require('../lib/home-verified-comment-prompts').homeVerifiedGrokContextPrompt({ text: '고양이가 문 앞에서 계속 기다리네' }), /자연스러운 한국어/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('publication permits Korean and rejects superseded Japanese drafts while preserving source evidence', () => {
  const target = { authorHandle: 'alice', text: jp, replyLanguage: 'ja' };
  const korean = home.assessHomeVerifiedWriteQuality({ target, prepared: { comment: '고양이가 기다리네' } }, { languageRegistry: registry() });
  assert.ok(!korean.errors.includes('korean_reply_language_required'));
  assert.ok(!korean.errors.includes('japanese_account_evidence_expired'));
  const generic = home.assessHomeVerifiedWriteQuality({ target, prepared: { comment: 'おはよう！' } }, { languageRegistry: registry() });
  assert.ok(generic.errors.includes('korean_reply_language_required'));
  const prior = home.assessHomeVerifiedWriteQuality({ target, prepared: { comment: '玄関でずっと待っていたんですね' } }, { languageRegistry: registry() });
  assert.ok(prior.errors.includes('korean_reply_language_required'));
  const bilingual = home.assessHomeVerifiedWriteQuality({ target, prepared: { comment: '고양이가 기다리네 待っていました' } }, { languageRegistry: registry() });
  assert.ok(bilingual.errors.includes('korean_reply_language_required'));
  const expired = registry(); expired.accounts.alice.evidenceAt = '2025-01-01';
  const stale = home.assessHomeVerifiedWriteQuality({ target, prepared: { comment: '고양이가 기다리네' } }, { languageRegistry: expired });
  assert.ok(stale.errors.includes('japanese_account_evidence_expired'));
});
test('source-language mixing and independent media judge stay active with Korean output', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-ko-source-')); const file = path.join(dir, 'registry.json');
  try {
    lang.saveRegistry(registry(), file);
    const script = `const l=require('./lib/comment-language'),m=require('./lib/comment-media-context');const t={kind:'home_verified_original',authorHandle:'alice',url:'https://x.com/alice/status/1',text:${JSON.stringify(jp)}};console.log(JSON.stringify({mixed:l.mixLanguages([{url:'ko1',text:'오늘 고양이랑 산책했음'},t]).map(x=>x.url),judge:m.judgePrompt({...t,mediaReview:{sources:[],files:[],observations:[]}},'문 앞에서 기다렸구나'),summary:l.registrySummary()}));`;
    const out = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), env: { ...process.env, COMMENT_LANGUAGE_REGISTRY_FILE: file }, encoding: 'utf8' }));
    assert.deepEqual(out.mixed, ['https://x.com/alice/status/1', 'ko1']);
    assert.match(out.judge, /댓글 언어는 한국어/);
    assert.equal(out.summary.replyLanguage, 'ko');
    assert.equal(out.summary.eligibleJapanese, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
