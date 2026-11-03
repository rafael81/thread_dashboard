const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { repostCandidate, createCommentReposts } = require('../lib/comment-repost');
const at = '2026-10-29T12:00:00.000Z';
const comment = (overrides = {}) => ({ at, targetUrl: 'https://x.com/another/status/123',
  replyUrl: 'https://x.com/terafabXai/status/456', source: 'home_verified_comment', comment: '잘 봤어', ...overrides });
function setup(t, comments, publish) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-repost-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const history = [], context = { comments, ownReplies: [] };
  const service = createCommentReposts({ root, loadComments: () => context, publish,
    recordHistory: row => history.push(row), now: () => Date.parse(at) });
  return { root, history, context, service };
}
test('own-post replies are excluded by workflow, own reply receipt, root ownership, and case-insensitive author', () => {
  assert.ok(repostCandidate(comment()));
  for (const row of [comment({ source: 'own_post_full_coverage' }), comment({ source: 'own_post_reply' }),
    comment({ targetUrl: 'https://x.com/TeRaFaBxAi/status/123' }), comment({ authorHandle: '@terafabXai' }),
    comment({ rootUrl: 'https://x.com/terafabXai/status/111' }), comment({ isOwnPostReply: true })]) {
    assert.equal(repostCandidate(row), null);
  }
  assert.equal(repostCandidate(comment(), { ownReplies: [{ replyUrl: 'https://x.com/terafabXai/status/456' }] }), null);
  assert.equal(repostCandidate(comment(), { ownRootIds: ['123'] }), null);
});
test('only successful comments with our actual reply URL after activation qualify', () => {
  for (const row of [comment({ replyUrl: null }), comment({ replyUrl: 'https://x.com/someone/status/456' }),
    comment({ status: 'verification_required' }), comment({ status: 'deleted_by_codex_supervision' }),
    comment({ deletedAt: at }), comment({ at: 'invalid' }), comment({ targetUrl: 'https://evil.test/another/status/123' })]) {
    assert.equal(repostCandidate(row), null);
  }
  assert.equal(repostCandidate(comment(), { since: '2026-10-29T12:01:00Z' }), null);
});
test('disabled mode is inert; duplicate successful comment histories produce exactly one repost and receipt', async t => {
  let calls = 0;
  const { service, history } = setup(t, [comment(), comment(), comment({ source: 'own_post_reply', targetUrl: 'https://x.com/third/status/789' })],
    async (item, hooks) => { calls++; hooks.beforeSubmit(); return { verifiedBy: 'test' }; });
  assert.equal((await service.run()).skipped, 'disabled');
  service.configure(true);
  assert.equal((await service.run()).ok, true);
  assert.equal((await service.run()).skipped, 'no_pending');
  assert.equal(calls, 1); assert.equal(service.read().items.length, 1);
  assert.equal(history[0].status, 'reposted'); // Does not consume daily story root quota.
});
test('ambiguous submit is recorded, never retried as a fresh repost', async t => {
  let calls = 0;
  const { service } = setup(t, [comment()], async (item, hooks) => { calls++; hooks.beforeSubmit(); throw Error('connection lost'); });
  service.configure(true); await service.run(); await service.run();
  assert.equal(service.read().items[0].status, 'verification_required'); assert.equal(calls, 1);
});
test('a process restart reconciles an existing intent without permission to submit again', async t => {
  const { service, root } = setup(t, [comment()], async (item, hooks) => {
    assert.equal(hooks.reconcileOnly, true); return { alreadyReposted: true, verifiedBy: 'X UI' };
  });
  service.configure(true); const state = service.collect();
  state.items[0].status = 'submitting'; state.items[0].submitIntentAt = at;
  fs.writeFileSync(path.join(root, '.data/comment-reposts.json'), JSON.stringify(state));
  assert.equal((await service.run()).ok, true);
  assert.equal(service.read().items[0].alreadyReposted, true);
});
test('own-reply exclusion is checked again even if classification changes after enqueue', async t => {
  let calls = 0;
  const { service, context } = setup(t, [comment()], async () => { calls++; });
  service.configure(true); service.collect(); context.ownReplies.push(comment());
  assert.equal((await service.run()).skipped, 'comment_no_longer_eligible'); assert.equal(calls, 0);
});
test('manual target selection cannot override own-post exclusion or missing successful comment', async t => {
  const { service } = setup(t, [comment({ source: 'own_post_full_coverage' })], async () => assert.fail('must not write'));
  service.configure(true);
  await assert.rejects(service.run({ targetUrl: comment().targetUrl }), /own-post replies are excluded/);
});

test('browser publication fails closed without a headless provider or with a headed resource', async t => {
  for (const withBrowser of [undefined, async operation => operation({
    browser: { port: 9224, authSourcePort: 9224, headless: false },
    newPage: () => assert.fail('must not open a headed work tab'),
  })]) {
    const { root, context } = setup(t, [comment()]);
    const service = createCommentReposts({ root, loadComments: () => context, withBrowser, now: () => Date.parse(at) });
    service.configure(true);
    const result = await service.run();
    assert.equal(result.status, 'failed');
    assert.match(result.error, /headless/);
    assert.equal(service.read().items[0].submitIntentAt, undefined);
  }
});

test('disabling reposts while waiting for the browser prevents any work tab or write', async t => {
  const { root, context } = setup(t, [comment()]);
  const service = createCommentReposts({ root, loadComments: () => context,
    now: () => Date.parse(at),
    withBrowser: async operation => {
      service.configure(false);
      return operation({ browser: { port: 9445, authSourcePort: 9224, headless: true },
        newPage: () => assert.fail('must recheck enablement before opening a tab') });
    },
  });
  service.configure(true);
  assert.match((await service.run()).error, /disabled/);
  assert.equal(service.read().items[0].submitIntentAt, undefined);
});

test('existing repost is verified on the headless resource without toggling it and closes the work tab', async t => {
  const { root, context } = setup(t, [comment()]);
  let closed = false, accountChecks = 0;
  const browser = { port: 9445, authSourcePort: 9224, headless: true };
  const page = { navigate: async () => {}, close: async () => { closed = true; },
    eval: async expression => {
      assert.ok(!expression.includes('.click()'));
      return { profile: '/terafabXai', targetUrl: comment().targetUrl, reposted: true, canRepost: false };
    } };
  const service = createCommentReposts({ root, loadComments: () => context,
    now: () => Date.parse(at),
    withBrowser: operation => operation({ browser, newPage: async () => page }),
    verifyXAccount: async () => { accountChecks++; },
  });
  service.configure(true);
  const result = await service.run();
  assert.equal(result.ok, true);
  assert.equal(result.receipt.alreadyReposted, true);
  assert.deepEqual(result.receipt.browser, browser);
  assert.equal(accountChecks, 1);
  assert.equal(closed, true);
  assert.equal(service.read().items[0].submitIntentAt, undefined);
});
