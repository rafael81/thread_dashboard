const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "..", "mirror_server.js"), "utf8");

test("gemini script runner detects timeout results and recycles the instance before one retry", () => {
  const runner = source.slice(
    source.indexOf("async function runTerafabxGeminiScript"),
    source.indexOf("function execFileOutput"),
  );
  assert.match(runner, /isTerafabxGeminiScriptTimeout\(result\)/);
  assert.match(runner, /terafabxRecycleGeminiInstance\(options\.chromePort, options\.profileDir\)/);
  assert.match(runner, /terafabx_gemini_instance_recycle/);
  // The retry must run inside the same web slot so the wedged instance is never used concurrently.
  assert.ok(runner.indexOf("withTerafabxGeminiWebSlot") < runner.indexOf("terafabxRecycleGeminiInstance"));
});

test("recycle closes the agent-browser session, kills the port, and relaunches Chrome", () => {
  const recycle = source.slice(
    source.indexOf("async function terafabxRecycleGeminiInstance"),
    source.indexOf("async function runTerafabxGeminiScript"),
  );
  assert.match(recycle, /agentBrowserInvocation\(`http:\/\/127\.0\.0\.1:\$\{port\}`, \["close"\]\)/);
  assert.match(recycle, /chromePidsForPort\(port\)/);
  assert.match(recycle, /SIGKILL/);
  assert.match(recycle, /ensureTerafabxGeminiHeadlessBrowser\(\{ port, profileDir \}\)/);
});

test("timeout matcher only fires on the runNodeScript timeout marker with nonzero exit", () => {
  const matcher = source.slice(
    source.indexOf("function isTerafabxGeminiScriptTimeout"),
    source.indexOf("async function terafabxRecycleGeminiInstance"),
  );
  assert.match(matcher, /result\.code !== 0/);
  assert.match(matcher, /Node script timed out after \\d\+ms/);
});

test("worker clone carries the identical self-healing patch", () => {
  const workerPath = "/Users/macmini/project/thread_dashboard-home-verified-comment/mirror_server.js";
  if (!fs.existsSync(workerPath)) return;
  const worker = fs.readFileSync(workerPath, "utf8");
  assert.match(worker, /isTerafabxGeminiScriptTimeout/);
  assert.match(worker, /terafabxRecycleGeminiInstance/);
});
