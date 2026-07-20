const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  chromePort,
  chromeProfileName,
  chromeProfileRoot,
  classifyChromeSession,
  isExpectedChromeCommand,
  loadProjectEnv,
  parseCurrentGuiChromePids,
} = require("../scripts/start-mirror-server");
const {
  connectDiscoveryDbWithRetry,
  isDiscoveryDbLockError,
} = require("../mirror_server");

test("mirror launcher recognizes only the dedicated 9224 Profile 1 Chrome", () => {
  const expected = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfileRoot}`,
    `--profile-directory=${chromeProfileName}`,
  ].join(" ");

  assert.equal(isExpectedChromeCommand(expected), true);
  assert.equal(isExpectedChromeCommand(expected.replace("Profile 1", "Default")), false);
  assert.equal(isExpectedChromeCommand(expected.replace("9224", "9223")), false);
  assert.equal(isExpectedChromeCommand(expected.replace("gwajeuplupi-visible-9224", "another-profile")), false);
});

test("mirror launcher loads project .env without overriding inherited environment variables", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mirror-env-test-"));
  const envPath = path.join(directory, ".env");
  const loadedKey = `MIRROR_ENV_LOADED_${process.pid}`;
  const inheritedKey = `MIRROR_ENV_INHERITED_${process.pid}`;
  fs.writeFileSync(envPath, `${loadedKey}=from-file\n${inheritedKey}=from-file\n`, "utf8");
  process.env[inheritedKey] = "from-shell";
  t.after(() => {
    delete process.env[loadedKey];
    delete process.env[inheritedKey];
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const result = loadProjectEnv(envPath);

  assert.equal(result.loaded, true);
  assert.equal(process.env[loadedKey], "from-file");
  assert.equal(process.env[inheritedKey], "from-shell");
});

test("mirror launcher detects a dedicated Chrome orphaned from the current GUI session", () => {
  const command = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfileRoot}`,
    `--profile-directory=${chromeProfileName}`,
  ].join(" ");
  const orphaned = classifyChromeSession([{ pid: 8857, ppid: 1, command }], [54166]);
  assert.deepEqual(orphaned.visibleExpected, []);
  assert.deepEqual(orphaned.orphanedExpected.map((item) => item.pid), [8857]);

  const visible = classifyChromeSession([{ pid: 64369, ppid: 1, command }], [54166, 64369]);
  assert.deepEqual(visible.visibleExpected.map((item) => item.pid), [64369]);
  assert.deepEqual(visible.orphanedExpected, []);
});

test("mirror launcher parses only registered Google Chrome application pids", () => {
  const output = `
7) "Google Chrome" ASN:0x1:
    bundleID="com.google.Chrome"
    pid = 54166 type="Foreground"
8) "Google Chrome Helper" ASN:0x2:
    bundleID="com.google.Chrome.helper"
    pid = 54195 type="UIElement"
52) "Google Chrome" ASN:0x3:
    bundleID="com.google.Chrome"
    pid = 64369 type="Foreground"
`;
  assert.deepEqual(parseCurrentGuiChromePids(output), [54166, 64369]);
});

test("discovery database retries transient lock errors", async () => {
  let attempts = 0;
  const db = { open: true };
  const result = await connectDiscoveryDbWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error("Locking error: Failed locking file; File is locked by another process");
    return db;
  }, "/tmp/discovery.db", { maxAttempts: 3, delayMs: 10 });

  assert.equal(result, db);
  assert.equal(attempts, 3);
  assert.equal(isDiscoveryDbLockError(new Error("failed to open database: database is locked")), true);
  assert.equal(isDiscoveryDbLockError(new Error("permission denied")), false);
});
