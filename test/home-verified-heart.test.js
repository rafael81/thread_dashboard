const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const WORKER_PATH = "/Users/macmini/project/thread_dashboard-home-verified-comment/mirror_server.js";

function writerSlice(source) {
  const start = source.indexOf("async function postTerafabxHomeVerifiedWriteRecord");
  assert.ok(start >= 0, "postTerafabxHomeVerifiedWriteRecord must exist");
  return source.slice(start, start + 12_000);
}

for (const [label, filePath] of [
  ["main", path.join(__dirname, "..", "mirror_server.js")],
  ["worker", WORKER_PATH],
]) {
  test(`${label}: home-verified writer hearts the target in the same session before commenting`, () => {
    if (label === "worker" && !fs.existsSync(filePath)) return;
    const writer = writerSlice(fs.readFileSync(filePath, "utf8"));
    const heartIdx = writer.indexOf("attemptTerafabxReplyHeart(latest.targetUrl");
    const postIdx = writer.indexOf("postTerafabxReply(latest.targetUrl");
    assert.ok(heartIdx >= 0, "heart attempt must exist");
    assert.ok(postIdx >= 0, "reply post must exist");
    // Heart runs first, on the same homeVerified browser resource, without closing it.
    assert.ok(heartIdx < postIdx, "heart must run before the comment post");
    const heartCall = writer.slice(heartIdx, postIdx);
    assert.match(heartCall, /xResourceKind: "homeVerified"/);
    assert.match(heartCall, /cleanupHeadless: false/);
    assert.match(heartCall, /terafabx_home_verified_heart_before_post/);
  });

  test(`${label}: heart outcome is recorded on the posted event and never blocks posting`, () => {
    if (label === "worker" && !fs.existsSync(filePath)) return;
    const source = fs.readFileSync(filePath, "utf8");
    const writer = writerSlice(source);
    assert.match(writer, /heartDeferred: heart\.deferred/);
    // attemptTerafabxReplyHeart swallows errors into { deferred: true } so posting continues.
    const attempt = source.slice(
      source.indexOf("async function attemptTerafabxReplyHeart"),
      source.indexOf("async function openTerafabxTargetArticle"),
    );
    assert.match(attempt, /deferred: true/);
    assert.doesNotMatch(attempt, /throw error/);
  });
}
