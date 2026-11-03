"use strict";
const fs = require("node:fs");
const path = require("node:path");

function statusUrl(value) {
  try {
    const u = new URL(value);
    const m = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)\/?$/.exec(u.pathname);
    if (!m || !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(u.hostname) || u.protocol !== "https:") return null;
    return { id: m[2], handle: m[1], url: `https://x.com/${m[1]}/status/${m[2]}` };
  } catch { return null; }
}

// Own-post coverage replies can have another author's URL as their immediate target.
// Exclude that entire workflow, not merely URLs bearing our own handle.
function repostCandidate(record, { since, ownHandle = "terafabXai", ownReplies = [], ownRootIds = [] } = {}) {
  const target = statusUrl(record?.targetUrl), reply = statusUrl(record?.replyUrl);
  const own = ownHandle.toLowerCase();
  if (!target || !reply || reply.handle.toLowerCase() !== own || target.id === reply.id) return null;
  if (target.handle.toLowerCase() === own || String(record.authorHandle || "").replace(/^@/, "").toLowerCase() === own) return null;
  if (/own[_-]post|own[_-]reply/i.test(`${record.source || ""} ${record.kind || ""}`)) return null;
  if (record.isOwnPostReply || record.ownPostReply || record.isOwnPost) return null;
  if (ownReplies.some(row => statusUrl(row.replyUrl)?.id === reply.id)) return null;
  if (ownRootIds.includes(target.id)) return null;
  if ([record.rootUrl, record.rootPostUrl].some(url => statusUrl(url)?.handle.toLowerCase() === own)) return null;
  if (record.deletedAt || /deleted|error|fail|uncertain|verification_required|queued|pending/i.test(record.status || "")) return null;
  const at = record.postedAt || record.at;
  if (!Number.isFinite(Date.parse(at)) || (since && Date.parse(at) < Date.parse(since))) return null;
  return { id: target.id, targetUrl: target.url, authorHandle: target.handle, commentReplyUrl: reply.url,
    commentSource: record.source || "ordinary_comment", commentPostedAt: at, comment: record.comment || "" };
}

function createCommentReposts({ root, loadComments, withBrowser, verifyXAccount,
  recordHistory = () => {}, logEvent = () => {}, requiredHandle = "terafabXai", publish, now = () => Date.now() }) {
  const file = path.join(root, ".data/comment-reposts.json");
  const evidenceDir = path.join(root, ".data/comment-reposts");
  let busy = false;
  function read() {
    if (!fs.existsSync(file)) return { version: 1, enabled: false, enabledAt: null, items: [] };
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(state.items)) throw new Error("Invalid comment repost ledger");
    return state;
  }
  function write(state) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n"); fs.renameSync(tmp, file);
  }
  function patch(id, change) {
    const state = read(), item = state.items.find(row => row.id === id);
    if (!item) throw new Error("Repost ledger entry missing");
    Object.assign(item, change, { updatedAt: new Date(now()).toISOString() }); write(state); return item;
  }
  function evidence(id, name, value) {
    const dir = path.join(evidenceDir, id); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2) + "\n");
  }
  function collect({ targetUrl } = {}) {
    const state = read();
    if (!state.enabled) return state;
    const context = loadComments();
    const target = targetUrl ? statusUrl(targetUrl) : null;
    if (targetUrl && !target) throw new Error("Invalid repost target URL");
    const candidates = (context.comments || []).map(record => repostCandidate(record, {
      ...context, ownHandle: requiredHandle, since: target ? null : state.enabledAt,
    })).filter(Boolean).filter(row => !target || row.id === target.id);
    if (target && !candidates.length) throw new Error("Only successful other-author comments qualify; own-post replies are excluded");
    const ids = new Set(state.items.map(row => row.id));
    for (const candidate of candidates.sort((a, b) => Date.parse(a.commentPostedAt) - Date.parse(b.commentPostedAt))) {
      if (ids.has(candidate.id)) continue;
      ids.add(candidate.id);
      state.items.push({ ...candidate, status: "queued", queuedAt: new Date(now()).toISOString() });
      logEvent("comment_repost_queued", candidate);
    }
    write(state); return state;
  }
  function configure(enabled) {
    const state = read();
    if (enabled && !state.enabled) state.enabledAt = new Date(now()).toISOString();
    state.enabled = enabled === true;
    state.excludeOwnPostReplies = true;
    state.mode = "native_repost_after_successful_comment";
    write(state); logEvent("comment_repost_configured", { enabled: state.enabled, enabledAt: state.enabledAt });
    return state;
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  function articleExpression(id) {
    return `[...document.querySelectorAll('article')].find(a => [...a.querySelectorAll('a:has(time)')].some(l => new URL(l.href).pathname.endsWith('/status/${id}')))`;
  }
  async function snapshot(page, item) {
    return page.eval(`(() => { const a=${articleExpression(item.id)}; const link=a?.querySelector('a:has(time)');
      return {url:location.href, profile:document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href'),
        targetUrl:link?.href, text:a?.querySelector('[data-testid="tweetText"]')?.innerText || '',
        reposted:Boolean(a?.querySelector('[data-testid="unretweet"]')),
        canRepost:Boolean(a?.querySelector('[data-testid="retweet"]'))}; })()`);
  }
  function validateLive(state, item) {
    const target = statusUrl(state?.targetUrl);
    if (state?.profile?.toLowerCase() !== `/${requiredHandle.toLowerCase()}`) throw new Error("Repost account verification failed");
    if (!target || target.id !== item.id || target.handle.toLowerCase() === requiredHandle.toLowerCase()
      || target.handle.toLowerCase() !== item.authorHandle.toLowerCase()) throw new Error("Repost target account/ID mismatch");
    if (!state.reposted && !state.canRepost) throw new Error("Repost target unavailable or protected");
  }
  async function publishInBrowser(item, { beforeSubmit, reconcileOnly }) {
    if (typeof withBrowser !== "function") throw new Error("Dedicated headless repost browser is required");
    return withBrowser(async ({ newPage, browser }) => {
      if (browser?.headless !== true || browser.port !== 9445 || browser.authSourcePort !== 9224) {
        throw new Error("Reposts require the dedicated headless browser; no headed fallback");
      }
      // Authorization may have been disabled while waiting for the repost-only lock.
      if (!read().enabled) throw new Error("Comment repost disabled");
      const page = await newPage(item.targetUrl);
      try {
        await verifyXAccount(page);
        await page.navigate(item.targetUrl, 2200);
        let before;
        for (let n = 0; n < 12; n++) {
          before = await snapshot(page, item);
          if (before.targetUrl && (before.reposted || before.canRepost)) break;
          await sleep(500);
        }
        validateLive(before, item); evidence(item.id, "before.json", { ...before, browser });
        if (before.reposted) return { alreadyReposted: true, verifiedBy: "persisted X unretweet UI", live: before, browser };
        if (reconcileOnly) throw new Error("Unconfirmed submission: X is not showing a repost; no resend");
        await page.eval(`(() => { const a=${articleExpression(item.id)}; const b=a?.querySelector('[data-testid="retweet"]'); if(!b)throw Error('Repost button missing'); b.click(); })()`);
        let menu;
        for (let n = 0; n < 10; n++) {
          menu = await page.eval(`document.querySelector('[data-testid="retweetConfirm"]')?.innerText || ''`);
          if (menu) break;
          await sleep(200);
        }
        if (!/^(재게시|Repost|Retweet)$/i.test(menu.trim())) throw new Error("Native repost confirmation missing");
        const eventStart = page.events.length;
        beforeSubmit();
        await page.eval(`(() => { if(document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href')?.toLowerCase()!==${JSON.stringify('/' + requiredHandle.toLowerCase())})throw Error('Account changed'); const b=document.querySelector('[data-testid="retweetConfirm"]'); if(!b)throw Error('Repost confirm missing'); b.click(); })()`);
        let after;
        for (let n = 0; n < 30; n++) {
          await sleep(400); after = await snapshot(page, item); if (after.reposted) break;
        }
        const responses = [];
        for (const event of page.events.slice(eventStart).filter(e => e.method === "Network.responseReceived" && /\/CreateRetweet(?:\?|$)/.test(e.params?.response?.url || ""))) {
          const body = await page.send("Network.getResponseBody", { requestId: event.params.requestId }).catch(() => null);
          let data; try { data = JSON.parse(body?.base64Encoded ? Buffer.from(body.body, 'base64').toString() : body?.body); } catch {}
          responses.push({ status: event.params.response.status, body: data || null });
        }
        evidence(item.id, "create-retweet-responses.json", responses);
        // A fresh navigation excludes an optimistic button toggle from success evidence.
        await page.navigate(item.targetUrl, 2200);
        for (let n = 0; n < 12; n++) {
          after = await snapshot(page, item); if (after.reposted) break; await sleep(500);
        }
        validateLive(after, item);
        if (!after.reposted) throw new Error("Repost submission unconfirmed; reconcile without resending");
        evidence(item.id, "after.json", { ...after, browser });
        const shot = await page.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(evidenceDir, item.id, "x-reposted.png"), Buffer.from(shot.data, "base64"));
        return { alreadyReposted: false, verifiedBy: "X repost UI confirmed after fresh navigation", live: after,
          responseCount: responses.length, browser, evidenceDirectory: path.relative(root, path.join(evidenceDir, item.id)) };
      } finally { await page.close(); }
    });
  }
  async function run(options = {}) {
    if (busy) return { skipped: "busy" };
    busy = true;
    try {
      const state = collect(options);
      if (!state.enabled) return { skipped: "disabled" };
      const targetId = statusUrl(options.targetUrl)?.id;
      const item = state.items.find(row => (!targetId || row.id === targetId)
        && ["queued", "submitting"].includes(row.status));
      if (!item) return { skipped: "no_pending" };
      // Revalidate exclusions against the latest history immediately before any write.
      const context = loadComments();
      const current = (context.comments || []).find(row => statusUrl(row.replyUrl)?.id === statusUrl(item.commentReplyUrl)?.id);
      if (!repostCandidate(current, { ...context, ownHandle: requiredHandle })) {
        patch(item.id, { status: "skipped", reason: "comment_no_longer_eligible" });
        return { skipped: "comment_no_longer_eligible", targetUrl: item.targetUrl };
      }
      try {
        const result = await (publish || publishInBrowser)(item, {
          reconcileOnly: item.status === "submitting",
          beforeSubmit: () => {
            if (!read().enabled) throw new Error("Comment repost disabled");
            patch(item.id, { status: "submitting", submitIntentAt: new Date(now()).toISOString() });
            logEvent("comment_repost_submit_intent", { targetUrl: item.targetUrl, commentReplyUrl: item.commentReplyUrl });
          },
        });
        const receipt = patch(item.id, { status: "reposted", verifiedAt: new Date(now()).toISOString(), ...result });
        recordHistory({ canonicalUrl: `x-repost:${item.id}`, status: "reposted", postUrl: item.targetUrl, mediaCount: 0 });
        evidence(item.id, "receipt.json", receipt);
        logEvent("comment_repost_verified", receipt);
        return { ok: true, receipt };
      } catch (error) {
        const saved = read().items.find(row => row.id === item.id);
        const status = saved.submitIntentAt ? "verification_required" : "failed";
        patch(item.id, { status, error: error.message });
        logEvent("comment_repost_failed", { targetUrl: item.targetUrl, status, error: error.message });
        return { ok: false, targetUrl: item.targetUrl, status, error: error.message };
      }
    } finally { busy = false; }
  }
  return { read, configure, collect, run, get busy() { return busy; } };
}

module.exports = { statusUrl, repostCandidate, createCommentReposts };
