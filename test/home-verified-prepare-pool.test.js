const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "mirror_server.js"), "utf8");

function prepareCycleSlice(text) {
  return text.slice(
    text.indexOf("async function runTerafabxHomeVerifiedCommentPrepareCycle"),
    text.indexOf("async function maybeRunTerafabxHomeVerifiedCommentAutomation"),
  );
}

test("home-verified prepare cycle consumes the batch through the shared consumer group", () => {
  const cycle = prepareCycleSlice(source);
  assert.match(cycle, /createTerafabxGeminiConsumerGroup\(prepareConcurrency/);
  assert.match(cycle, /scheduling: "consumer_group_fifo"/);
  assert.match(cycle, /terafabx_home_verified_prepare_pool_start/);
  // The old serial round-robin assignment must be gone.
  assert.doesNotMatch(cycle, /index % Math\.max/);
});

test("prepare tasks are grouped per author so the daily author cap cannot race", () => {
  const cycle = prepareCycleSlice(source);
  assert.match(cycle, /authorGroups/);
  assert.match(cycle, /post\.authorHandle/);
  // One enqueue per author group; posts within a group run serially.
  assert.match(cycle, /Array\.from\(authorGroups\.values\(\), \(posts\) => prepareGroup\.enqueue/);
});

test("consumer group resources map to the fixed home-verified gemini ports and profiles", () => {
  const cycle = prepareCycleSlice(source);
  assert.match(cycle, /TERAFABX_HOME_VERIFIED_COMMENT_GEMINI_PORT_BASE \+ workerIndex/);
  assert.match(cycle, /home-verified-\$\{workerIndex \+ 1\}/);
  // Browsers persist between cycles: closing the group must not tear them down.
  assert.match(cycle, /closeResource: async \(\) => \{\}/);
});

test("grok quota failure stops remaining tasks instead of breaking a serial loop", () => {
  const cycle = prepareCycleSlice(source);
  assert.match(cycle, /grokQuotaHit = true/);
  assert.match(cycle, /if \(grokQuotaHit\) return;/);
});

test("prepare accepts explicit resource overrides from the consumer group", () => {
  const prepare = source.slice(
    source.indexOf("async function prepareTerafabxHomeVerifiedComment"),
    source.indexOf("function enqueueTerafabxHomeVerifiedWriteRecord"),
  );
  assert.match(prepare, /options\.chromePort \|\| TERAFABX_HOME_VERIFIED_COMMENT_GEMINI_PORT_BASE \+ worker/);
  assert.match(prepare, /options\.profileDir \|\|/);
});

test("worker clone carries the identical consumer-group prepare cycle", () => {
  const workerPath = "/Users/macmini/project/thread_dashboard-home-verified-comment/mirror_server.js";
  if (!fs.existsSync(workerPath)) return;
  const cycle = prepareCycleSlice(fs.readFileSync(workerPath, "utf8"));
  assert.match(cycle, /createTerafabxGeminiConsumerGroup\(prepareConcurrency/);
  assert.match(cycle, /Array\.from\(authorGroups\.values\(\), \(posts\) => prepareGroup\.enqueue/);
  assert.doesNotMatch(cycle, /index % Math\.max/);
});
