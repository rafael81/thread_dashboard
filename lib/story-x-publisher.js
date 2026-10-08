"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomInt, randomUUID } = require("node:crypto");
const { prepareStoryUpload } = require("./story-upload-image");
const normal = value => String(value || "").replace(/\s+/g, " ").trim();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function receiptFromResponse(body, expected) {
  const matches = [];
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (value.rest_id && value.legacy) {
      let text = value.note_tweet?.note_tweet_results?.result?.text || value.legacy.full_text;
      // X appends its media t.co URL to full_text; it is not part of the authored text.
      for (const media of value.legacy.entities?.media || []) {
        if (media.url) text = String(text || "").replace(media.url, "").trim();
      }
      const parent = value.legacy.in_reply_to_status_id_str || null;
      const user = value.core?.user_results?.result;
      const handle = user?.core?.screen_name || user?.legacy?.screen_name;
      if (normal(text) === normal(expected.text) && parent === (expected.parentId || null)
        && (String(handle).toLowerCase() === "terafabxai" || String(user?.rest_id) === "1371642956088627200")) {
        matches.push({ id: String(value.rest_id), url: `https://x.com/terafabXai/status/${value.rest_id}`,
          parentId: parent, text, mediaCount: value.legacy.extended_entities?.media?.length || 0,
          verifiedBy: "X UI CreateTweet response" });
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(body);
  const receipt = matches.find(item => item.mediaCount === expected.mediaCount);
  return receipt || null;
}

function createStoryPublisher(api) {
  const wait = api.sleep || sleep;
  const replyDelay = api.replyDelay || (() => randomInt(200, 1001));
  async function verifyAccount() {
    return api.withMirrorChromeLock("story_account_verify", async () => {
      const page = await api.newPage("https://x.com/terafabXai");
      try { await api.verifyXAccount(page); }
      finally { await page.close(); }
    });
  }
  async function withPublishSession(run) {
    return api.withMirrorChromeLock("story_local_publish", async () => {
      const page = await api.newPage("https://x.com/terafabXai");
      const session = { id: randomUUID(), page, postedUrls: new Set(), lastTargetUrl: null };
      api.logEvent("story_x_session_opened", { sessionId: session.id, tabId: page.tab?.id });
      try {
        await api.verifyXAccount(page);
        return await run(options => publishOnPage(session, options));
      } finally {
        await page.close();
        api.logEvent("story_x_work_tab_closed", { sessionId: session.id, tabId: page.tab?.id, targetUrl: session.lastTargetUrl });
      }
    });
  }
  async function openReply(session, targetUrl, parentId) {
    const { page } = session;
    const sameSession = session.postedUrls.has(targetUrl);
    // Only a resumed thread needs an initial navigation. Fresh posts stay in the
    // same X screen; use the exact article or its post-success View link.
    if (!sameSession) await page.navigate(targetUrl, 4500);
    const delayMs = replyDelay();
    if (!Number.isInteger(delayMs) || delayMs < 200 || delayMs > 1000) throw new Error("Invalid story reply delay");
    api.logEvent("story_x_reply_delay", { sessionId: session.id, tabId: page.tab?.id, targetUrl, delayMs, sameSession });
    await wait(delayMs);
    let openedStatus = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await page.eval(`(() => {
        const id = ${JSON.stringify(parentId)};
        const exact = a => new RegExp('/status/' + id + '(?:[/?]|$)').test(a.href);
        if ([...document.querySelectorAll('[role="dialog"]')].some(d => d.querySelector('[data-testid="tweetTextarea_0"]'))) return 'waiting';
        const article = [...document.querySelectorAll('article')].find(a =>
          [...a.querySelectorAll('a[href*="/status/"]')].some(e => e.querySelector('time') && exact(e)));
        const button = article?.querySelector('[data-testid="reply"]');
        if (button) { button.click(); return 'reply'; }
        const link = ${openedStatus} ? null : [...document.querySelectorAll('a[href*="/status/"]')].find(a =>
          exact(a) && !/\\/(?:photo|video|analytics)(?:[/?]|$)/.test(a.href));
        if (link) { link.click(); return 'view'; }
        return 'waiting';
      })()`);
      if (result === "reply") {
        api.logEvent("story_x_reply_opened", { sessionId: session.id, tabId: page.tab?.id, targetUrl, sameSession, viaViewLink: openedStatus });
        return;
      }
      if (result === "view") openedStatus = true;
      await wait(250);
    }
    throw new Error("Could not open reply on exact parent post in current X screen");
  }
  async function publishOnPage(session, { text, media, targetUrl, beforeSubmit, onReceipt }) {
    if (!targetUrl && media.length !== 1) throw new Error("Story root must contain exactly one image");
    const { page } = session;
    session.lastTargetUrl = targetUrl || null;
    const parentId = targetUrl ? /\/status\/(\d+)/.exec(targetUrl)?.[1] : null;
    let uploadDirectory;
    if (targetUrl && !parentId) throw new Error("Invalid parent post URL");
    try {
      if (targetUrl) {
        await openReply(session, targetUrl, parentId);
      } else {
        const opened = await page.eval(`(() => {
          const button = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
          if (!button) return false; button.click(); return true;
        })()`);
        if (!opened) throw new Error("Could not open new post on current X screen");
      }
      await api.waitForComposer(page);
      await page.eval(`(() => {
        const dialogs = [...document.querySelectorAll('[role="dialog"]')];
        const dialog = dialogs.reverse().find(d => d.querySelector('[data-testid="tweetTextarea_0"]'));
        const editor = dialog?.querySelector('[data-testid="tweetTextarea_0"]');
        if (!editor) throw new Error('Story composer dialog missing');
        editor.click(); editor.focus();
      })()`);
      if (text) await page.send("Input.insertText", { text });
      if (media.length) {
        uploadDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "terafabx-story-upload-"));
        const uploads = [];
        for (const source of media) {
          const prepared = await prepareStoryUpload(source, uploadDirectory);
          uploads.push(prepared.path);
          api.logEvent("story_upload_metadata_removed", prepared);
        }
        await api.setXComposerFileInputFiles(page, uploads);
        await api.waitForUploadToSettle(page, uploads.length, uploads);
      }
      await wait(800);
      const state = await page.eval(`(() => {
        const d = [...document.querySelectorAll('[role="dialog"]')].reverse().find(d => d.querySelector('[data-testid="tweetTextarea_0"]'));
        const button = d?.querySelector('[data-testid="tweetButton"]');
        return { text: d?.querySelector('[data-testid="tweetTextarea_0"]')?.innerText,
          editors: d?.querySelectorAll('[contenteditable="true"]').length,
          button: button?.innerText, disabled: !button || button.disabled || button.getAttribute('aria-disabled') === 'true',
          account: document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href') };
      })()`);
      if (normal(state.text) !== normal(text) || state.editors !== 1 || state.disabled
        || /예약|schedule|모두|all/i.test(state.button || "") || state.account?.toLowerCase() !== "/terafabxai") {
        throw new Error(`Story composer verification failed: ${JSON.stringify(state)}`);
      }
      const eventStart = page.events.length;
      beforeSubmit();
      await page.eval(`(() => {
        const d = [...document.querySelectorAll('[role="dialog"]')].reverse().find(d => d.querySelector('[data-testid="tweetTextarea_0"]'));
        const b = d?.querySelector('[data-testid="tweetButton"]');
        if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') throw new Error('Submit unavailable');
        b.click();
      })()`);
      const checked = new Set();
      for (let attempt = 0; attempt < 30; attempt++) {
        await wait(1000);
        const responses = page.events.slice(eventStart).filter(event => event.method === "Network.responseReceived"
          && /\/graphql\/[^/]+\/Create(?:Note)?Tweet(?:\?|$)/.test(event.params?.response?.url || ""));
        for (const response of responses) {
          const id = response.params.requestId;
          if (checked.has(id)) continue;
          const content = await page.send("Network.getResponseBody", { requestId: id }).catch(() => null);
          if (!content?.body) continue;
          checked.add(id);
          const body = JSON.parse(content.body);
          const receipt = receiptFromResponse(body, { text, parentId, mediaCount: media.length });
          if (receipt) {
            onReceipt({ ...receipt, verifiedAt: new Date().toISOString() });
            session.postedUrls.add(receipt.url);
            api.logEvent("story_x_session_receipt", { sessionId: session.id, tabId: page.tab?.id, url: receipt.url, parentId });
            return receipt;
          }
          api.logEvent("story_x_receipt_unmatched", { status: response.params.response.status, errors: body.errors || null });
        }
      }
      throw new Error("X submission unconfirmed; do not resend without reconciling the account");
    } finally {
      if (uploadDirectory) fs.rmSync(uploadDirectory, { recursive: true, force: true });
    }
  }
  async function publish(options) {
    return withPublishSession(send => send(options));
  }
  return { publish, withPublishSession, verifyAccount };
}
module.exports = { createStoryPublisher, receiptFromResponse };
