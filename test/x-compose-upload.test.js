const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  xUploadSettleDecision,
  xComposerUploadRetryDecision,
} = require("../mirror_server");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "mirror_server.js"), "utf8");

function settle(state, extra = {}) {
  let ticks = 0;
  let last = null;
  for (let i = 0; i < 8; i += 1) {
    last = xUploadSettleDecision(state, { expectedMediaCount: 1, hasVideo: true, stableReadyTicks: ticks, ...extra });
    ticks = last.nextStableTicks;
    if (last.action === "ready") return { ticks: i + 1, last };
  }
  return { ticks: 8, last };
}

test("stuck video processing does not settle while Post stays disabled", () => {
  const result = settle({
    busy: true,
    uploadBusy: true,
    processing: true,
    readyText: false,
    activePostButton: false,
    attachmentCount: 1,
    attachmentKinds: ["video"],
  });
  assert.equal(result.last.action, "wait");
  assert.equal(result.last.reason, "not_ready");
});

test("준비 완료 and enabled Post settle even if leftover unlabeled progressbars exist", () => {
  const result = settle({
    busy: false,
    uploadBusy: false,
    processing: false,
    readyText: true,
    activePostButton: true,
    attachmentCount: 1,
    attachmentKinds: ["video"],
  });
  assert.equal(result.last.action, "ready");
  assert.equal(result.ticks, 2);
});

test("video with enabled Post still waits while filename is 처리 중", () => {
  const result = settle({
    busy: true,
    uploadBusy: true,
    processing: true,
    readyText: false,
    activePostButton: true,
    attachmentCount: 1,
    attachmentKinds: ["video"],
  });
  assert.equal(result.last.action, "wait");
  assert.equal(result.last.reason, "video_processing");
});

test("composer upload retries once after 40 ticks of unfinished video processing", () => {
  assert.equal(xComposerUploadRetryDecision({
    tick: 20,
    retried: false,
    processing: true,
    readyText: false,
    activePostButton: false,
  }), "wait");
  assert.equal(xComposerUploadRetryDecision({
    tick: 40,
    retried: false,
    processing: true,
    readyText: false,
    activePostButton: false,
  }), "reattach");
  assert.equal(xComposerUploadRetryDecision({
    tick: 40,
    retried: true,
    processing: true,
    readyText: false,
    activePostButton: false,
  }), "wait");
  assert.equal(xComposerUploadRetryDecision({
    tick: 40,
    retried: false,
    processing: false,
    readyText: true,
    activePostButton: true,
  }), "wait");
});

test("X compose text insert primes editor and falls back to char events", () => {
  assert.match(SOURCE, /async function focusXComposerEditor/);
  assert.match(SOURCE, /async function typeXComposerTextByCharEvents/);
  assert.match(SOURCE, /method: "char_events"/);
  assert.match(SOURCE, /Input\.dispatchKeyEvent.*unmodifiedText/);
  assert.match(SOURCE, /await closeXDialogs\(page\);\s*\n\s*await page\.navigate\("https:\/\/x\.com\/compose\/post"/);
});

test("X compose upload uses dialog file input and reattaches stuck videos", () => {
  assert.match(SOURCE, /function selectXComposerFileInput/);
  assert.match(SOURCE, /setXComposerFileInputFiles\(page, mediaFiles\)/);
  assert.match(SOURCE, /data-x-composer-file/);
  assert.match(SOURCE, /upload_wait_reattach/);
  assert.match(SOURCE, /clickXComposerRemoveMedia/);
  assert.match(SOURCE, /input\[data-x-composer-file=/);
});
