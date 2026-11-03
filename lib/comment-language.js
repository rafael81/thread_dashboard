// Public activity language, never a nationality/ethnicity inference.
const fs = require('node:fs');
const path = require('node:path');
const REGISTRY_FILE = process.env.COMMENT_LANGUAGE_REGISTRY_FILE || path.resolve(__dirname, '../.data/comment-language-accounts.json');
const GRAPH_TTL = 6 * 3600000;
const EVIDENCE_TTL = 7 * 86400000;
const registryCache = new Map();
const JA_SENSITIVE = /死ね|殺す|殺人|自殺|暴力|戦争|銃|爆弾|強姦|レイプ|ポルノ|児童ポルノ|賭博|カジノ|大統領|首相|選挙|政党|差別|炎上|誹謗|中傷|晒し|暴露|訴訟|抗がん|処方薬|副作用|投資|株価|株式|仮想通貨|暗号資産|ビットコイン|エアドロップ|ステーキング|レバレッジ|利益保証|購入推奨|新商品|新製品|予約販売|先行予約/u;
function languageOf(text = '') {
  const s = String(text).normalize('NFKC').replace(/https?:\/\/\S+|@[A-Za-z0-9_]+/g, '');
  const ko = (s.match(/[가-힣]/g) || []).length;
  const kana = (s.match(/[ぁ-ゖァ-ヺ]/g) || []).length;
  const han = (s.match(/[一-鿿]/g) || []).length;
  const latin = (s.match(/[A-Za-z]/g) || []).length;
  const total = ko + kana + han + latin;
  if (ko >= 4 && ko / Math.max(total, 1) >= .4) return 'ko';
  if (kana >= 4 && (kana + han) / Math.max(total, 1) >= .6 && ko < 4) return 'ja';
  return 'unknown';
}
function readRegistry(file = REGISTRY_FILE) {
  try {
    const stat = fs.statSync(file); const signature = `${stat.mtimeMs}:${stat.size}`;
    const cached = registryCache.get(file);
    if (cached?.signature === signature) return cached.data;
    const data = JSON.parse(fs.readFileSync(file, 'utf8')); registryCache.set(file, { signature, data }); return data;
  }
  catch { return { version: 1, enabled: false, accounts: {}, graphs: {} }; }
}
function saveRegistry(data, file = REGISTRY_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
  registryCache.delete(file);
}
function japaneseAccount(handle, registry = readRegistry(), now = Date.now()) {
  const a = registry.accounts?.[String(handle || '').replace(/^@/, '').toLowerCase()];
  if (!registry.enabled || !a || a.protected || a.language !== 'ja') return null;
  if (!a.following && !a.follower) return null;
  if (!(now - Date.parse(a.evidenceAt) >= 0 && now - Date.parse(a.evidenceAt) < EVIDENCE_TTL)) return null;
  // Relationship must have been observed recently, not merely remembered forever.
  if (!(now - Date.parse(a.relationshipCheckedAt) >= 0 && now - Date.parse(a.relationshipCheckedAt) < EVIDENCE_TTL)) return null;
  return a;
}
function sourceLanguage(target = {}, registry) {
  const text = target.targetText || target.text || '';
  const handle = target.authorHandle || String(target.url || target.targetUrl || '').match(/(?:x|twitter)\.com\/([^/]+)\/status/)?.[1];
  return languageOf(text) === 'ja' && japaneseAccount(handle, registry) ? 'ja' : 'ko';
}
// 2026-10-31 user: Japanese-language accounts also receive Korean comments.
// Keep source eligibility separate so their originals remain discoverable.
function replyLanguage() { return 'ko'; }
function koreanReplyRules() {
  return [
    '댓글 언어는 한국어다. 일본어 원글도 본문·대사·이미지 자막의 뜻을 정확히 이해한 뒤 자연스러운 한국어 한마디로 반응한다. 일본어 댓글이나 한일 번역 병기는 쓰지 않는다.',
    '원문을 한국어로 번역해서 옮기는 작업이 아니다. 원문의 구체 상황에 직접 반응하고 의미가 불분명하면 댓글을 만들지 않는다. 계정의 활동 언어만으로 국적·거주지·국민성을 단정하지 않는다.',
  ];
}
function registrySummary(registry = readRegistry()) {
  const accounts = Object.values(registry.accounts || {});
  const ja = accounts.filter(a => a.language === 'ja');
  return { enabled: registry.enabled === true, replyLanguage: replyLanguage(), identifiedBy: 'public_activity_language_not_nationality',
    total: accounts.length, following: accounts.filter(a => a.following).length,
    followers: accounts.filter(a => a.follower).length, japanese: ja.length,
    japaneseFollowing: ja.filter(a => a.following).length, japaneseFollowers: ja.filter(a => a.follower).length,
    mutualJapanese: ja.filter(a => a.following && a.follower).length,
    eligibleJapanese: ja.filter(a => japaneseAccount(a.handle, registry)).length,
    graphs: registry.graphs || {}, updatedAt: registry.updatedAt || null };
}
async function requestJson(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d?.code === 204) return { code: 200, results: [] };
  if (d?.code !== 200 || !Array.isArray(d.results)) throw new Error(d?.message || 'profile results missing');
  return d;
}
let refreshPromise;
async function refreshGraph(options = {}) {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const registry = readRegistry(options.file);
    if (!registry.enabled) return registrySummary(registry);
    const base = options.base || 'https://api.fxtwitter.com';
    const request = options.request || requestJson;
    registry.graphs ||= {}; registry.accounts ||= {};
    for (const relation of ['following', 'followers']) {
      const prior = registry.graphs[relation] || {};
      if (!options.force && Date.now() - Date.parse(prior.checkedAt) < GRAPH_TTL) continue;
      if (!options.force && Date.parse(prior.retryAt) > Date.now()) continue;
      const rows = new Map(); const cursors = new Set(); let cursor = ''; let complete = false;
      try {
        for (let page = 0; page < 200; page++) {
          const q = new URLSearchParams({ count: '100', ...(cursor ? { cursor } : {}) });
          const d = await request(`${base}/2/profile/terafabXai/${relation}?${q}`);
          let added = 0;
          for (const a of d.results) {
            const key = String(a.screen_name || '').toLowerCase();
            if (!/^[a-z0-9_]{1,15}$/.test(key) || key === 'terafabxai' || rows.has(key)) continue;
            rows.set(key, a); added++;
          }
          const next = String(d.cursor?.bottom || '');
          if (!next || !d.results.length) { complete = true; break; }
          if (cursors.has(next) || (!added && page > 0)) throw new Error('relationship pagination repeated before completion');
          cursors.add(next); cursor = next;
        }
        if (!complete) throw new Error('relationship pagination limit reached');
        const at = new Date().toISOString(); const field = relation === 'followers' ? 'follower' : 'following';
        for (const a of Object.values(registry.accounts)) a[field] = false;
        for (const [key, raw] of rows) {
          const old = registry.accounts[key] || {};
          const bio = String(raw.description || raw.raw_description?.text || '');
          const observed = languageOf(bio);
          registry.accounts[key] = { ...old, handle: raw.screen_name, id: String(raw.id || ''), name: raw.name || '',
            bio, location: raw.location || '', protected: raw.protected === true, verification: raw.verification || {},
            [field]: true, relationshipCheckedAt: at,
            language: observed === 'ja' ? 'ja' : old.language || observed,
            ...(observed === 'ja' ? { evidenceAt: at, evidence: { kind: 'public_bio', url: `https://x.com/${raw.screen_name}`, text: bio } } : {}),
          };
        }
        registry.graphs[relation] = { checkedAt: at, complete: true, count: rows.size, error: null };
      } catch (error) {
        registry.graphs[relation] = { ...prior, error: error.message, retryAt: new Date(Date.now() + 30 * 60000).toISOString() };
      }
      registry.updatedAt = new Date().toISOString(); saveRegistry(registry, options.file);
    }
    return registrySummary(registry);
  })();
  try { return await refreshPromise; } finally { refreshPromise = null; }
}
// Latest original posts strengthen profile evidence; quotes/RTs are not language evidence.
function observePosts(registry, handle, posts, at = new Date().toISOString()) {
  const a = registry.accounts?.[String(handle).toLowerCase()]; if (!a) return;
  const original = posts.filter(p => String(p.author?.screen_name || '').toLowerCase() === String(handle).toLowerCase()
    && !p.replying_to && !p.replying_to_status && !p.quote && !p.retweeted_status && !/^RT\s+@/.test(p.text || ''));
  const ja = original.filter(p => languageOf(p.text) === 'ja');
  if (ja.length >= 2 || (ja.length && languageOf(a.bio) === 'ja')) {
    a.language = 'ja'; a.evidenceAt = at;
    a.evidence = { kind: 'recent_original_posts', posts: ja.slice(0, 3).map(p => ({ url: p.url || `https://x.com/${handle}/status/${p.id}`, text: p.text, createdAt: p.created_at })) };
  }
  a.timelineCheckedAt = at;
}
async function collectJapaneseCandidates(options = {}) {
  await refreshGraph(options);
  const registry = readRegistry(options.file); if (!registry.enabled) return { candidates: [], summary: registrySummary(registry) };
  const accounts = Object.values(registry.accounts || {}).filter(a => japaneseAccount(a.handle, registry)
    && a.verification?.verified === true && ['individual', 'blue'].includes(a.verification.type));
  const cursor = Number(registry.cursor || 0); const selected = [];
  for (let i = 0; i < Math.min(accounts.length, options.batchSize || 12); i++) selected.push(accounts[(cursor + i) % accounts.length]);
  // Following timelines already rotate through everyone. Also discover Japanese
  // activity among follower-only accounts whose bios give no language evidence.
  const unknown = Object.values(registry.accounts || {}).filter(a => a.follower && !a.following && !a.protected
    && a.language !== 'ja' && a.verification?.verified === true && a.verification.type === 'individual');
  const unknownCursor = Number(registry.unknownCursor || 0);
  const unknownCount = Math.min(unknown.length, 6);
  for (let i = 0; i < unknownCount; i++) selected.push(unknown[(unknownCursor + i) % unknown.length]);
  const candidates = []; const now = Date.now();
  for (const a of selected) {
    if (Date.parse(a.retryAt) > now) continue;
    try {
      const d = await (options.request || requestJson)(`${options.base || 'https://api.fxtwitter.com'}/2/profile/${a.handle}/statuses?count=20&since=${Math.floor((now - 86400000) / 1000)}`);
      observePosts(registry, a.handle, d.results);
      a.retryAt = null; a.lastError = null;
      for (const p of d.results) {
        const at = Number(p.created_timestamp) * 1000 || Date.parse(p.created_at);
        if (!Number.isFinite(at) || at < now - 86400000 || at > now || p.replying_to || p.replying_to_status || p.quote || p.retweeted_status) continue;
        if (!japaneseAccount(a.handle, registry) || String(p.author?.screen_name || '').toLowerCase() !== a.handle.toLowerCase() || languageOf(p.text) !== 'ja') continue;
        candidates.push({ url: p.url || `https://x.com/${a.handle}/status/${p.id}`, text: p.text, authorHandle: a.handle, source: 'japanese-follow-graph' });
      }
    } catch (error) { a.lastError = error.message; a.retryAt = new Date(now + 30 * 60000).toISOString(); }
  }
  registry.cursor = accounts.length ? (cursor + Math.min(accounts.length, options.batchSize || 12)) % accounts.length : 0;
  registry.unknownCursor = unknown.length ? (unknownCursor + unknownCount) % unknown.length : 0;
  registry.updatedAt = new Date().toISOString(); saveRegistry(registry, options.file);
  return { candidates, checked: selected.length, summary: registrySummary(registry) };
}
function mixLanguages(items, japaneseEvery = 4) {
  const ja = [], other = []; const seen = new Set();
  for (const item of items) { const key = item.url || item.targetUrl; if (seen.has(key)) continue; seen.add(key); (sourceLanguage(item) === 'ja' ? ja : other).push(item); }
  const out = []; while (ja.length || other.length) { if (ja.length) out.push(ja.shift()); for (let n = 1; n < japaneseEvery && other.length; n++) out.push(other.shift()); if (!ja.length) { out.push(...other); break; } } return out;
}
module.exports = { REGISTRY_FILE, JA_SENSITIVE, languageOf, readRegistry, saveRegistry, japaneseAccount, sourceLanguage, replyLanguage, koreanReplyRules, registrySummary, refreshGraph, observePosts, collectJapaneseCandidates, mixLanguages };
