#!/usr/bin/env node
const language = require('../lib/comment-language');
(async () => {
  const action = process.argv[2] || 'status';
  if (action === 'enable') { const r = language.readRegistry(); r.enabled = true; r.authorization = { at: new Date().toISOString(), request: '팔로우, 팔로워 중 일본계정 미리 식별하고 자동댓글로 인게이지먼트' }; language.saveRegistry(r); }
  if (['sync', 'enable'].includes(action)) await language.refreshGraph({ force: true });
  if (action === 'collect') console.log(JSON.stringify(await language.collectJapaneseCandidates(), null, 2));
  else { const r = language.readRegistry(); console.log(JSON.stringify({ ...language.registrySummary(r), japaneseAccounts: Object.values(r.accounts || {}).filter(a => a.language === 'ja').map(a => ({ handle: a.handle, following: a.following, follower: a.follower, evidence: a.evidence })) }, null, 2)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
