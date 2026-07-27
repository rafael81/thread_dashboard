const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  agentBrowserInvocation,
  agentBrowserOwnedRuntimeDir,
  agentBrowserProfileDir,
  closeAgentBrowserSession,
  cleanupOwnedGrokBrowserProfiles,
  ownedGrokBrowserPidsFromPs,
} = require("../scripts/terafabx-grok-web-agent.js");

test("state-backed Grok browsers get a deterministic project-owned temp root", () => {
  const runtimeRoot = "/tmp/thread-dashboard-owned-grok-runtime";
  const invocation = agentBrowserInvocation(["open", "https://grok.com/"], {
    bin: "/opt/homebrew/bin/npx",
    session: "state-owned-runtime-test",
    state: "/tmp/grok-state.json",
    runtimeRoot,
  });

  assert.equal(invocation.args.includes("--profile"), false);
  assert.equal(invocation.runtimeDir, agentBrowserOwnedRuntimeDir("state-owned-runtime-test", { runtimeRoot }));
  assert.match(invocation.runtimeDir, /\/tmp\/thread-dashboard-owned-grok-runtime\/tg-[0-9a-f]{12}$/);
});

test("owned runtime cleanup selects nested ephemeral Chrome profiles but not port 9224", () => {
  const runtimeDir = "/tmp/thread-dashboard-owned-grok-runtime/tg-123456789abc";
  const ps = [
    `201 1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=${runtimeDir}/agent-browser-chrome-one --headless=new`,
    `202 201 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Helper --user-data-dir=${runtimeDir}/agent-browser-chrome-one`,
    "203 1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --remote-debugging-port=9224 --user-data-dir=/Users/macmini/project/thread_dashboard/.data/chrome-profiles/gwajeuplupi-visible-9224",
    "204 1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/tmp/agent-browser-chrome-unowned --headless=new",
  ].join("\n");

  assert.deepEqual(
    ownedGrokBrowserPidsFromPs(ps, runtimeDir, 999, { allowDescendants: true }),
    [202, 201],
  );
  assert.deepEqual(ownedGrokBrowserPidsFromPs(ps, runtimeDir, 999), []);
});

test("startup orphan cleanup discovers both persistent and state-backed namespace roots", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "grok-cleanup-test-"));
  const profileRoot = path.join(root, "profiles");
  const runtimeRoot = path.join(root, "runtime");
  const profileNamespace = "tg-111111111111";
  const runtimeNamespace = "tg-222222222222";
  const unrelated = "user-owned-profile";

  fs.mkdirSync(path.join(profileRoot, profileNamespace), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, runtimeNamespace, "agent-browser-chrome-test"), { recursive: true });
  fs.mkdirSync(path.join(runtimeRoot, unrelated), { recursive: true });

  try {
    const results = await cleanupOwnedGrokBrowserProfiles(profileRoot, runtimeRoot);
    assert.deepEqual(
      results.map((item) => item.namespace).sort(),
      [profileNamespace, runtimeNamespace],
    );
    assert.equal(fs.existsSync(path.join(profileRoot, profileNamespace)), false);
    assert.equal(fs.existsSync(path.join(runtimeRoot, runtimeNamespace)), false);
    assert.equal(fs.existsSync(path.join(runtimeRoot, unrelated)), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistent Grok profiles remain deterministic and separate from temp ownership", () => {
  const profileRoot = "/tmp/thread-dashboard-owned-grok-profiles";
  const runtimeRoot = "/tmp/thread-dashboard-owned-grok-runtime";
  const session = "separate-owned-roots-test";

  assert.notEqual(
    agentBrowserProfileDir(session, { profileRoot }),
    agentBrowserOwnedRuntimeDir(session, { runtimeRoot }),
  );
});

test("closing a missing namespace skips the agent-browser close command", async () => {
  const result = await closeAgentBrowserSession(`missing-cleanup-${process.pid}-${Date.now()}`);

  assert.equal(result.requestedClose, false);
  assert.deepEqual(result.remainingPids, []);
});
