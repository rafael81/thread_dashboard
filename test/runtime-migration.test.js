const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const projectRoot = path.resolve(__dirname, "..");

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd || projectRoot,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

function sqlite(db, sql) {
  return run("sqlite3", [db, sql]).trim();
}

test("runtime export snapshots databases, excludes browser data, and restores atomically", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "thread-dashboard-migration-test-"));
  const root = path.join(sandbox, "project");
  const archive = path.join(sandbox, "runtime.zip");
  fs.mkdirSync(path.join(root, ".data", "chrome-profiles", "private"), { recursive: true });
  fs.mkdirSync(path.join(root, ".memory"), { recursive: true });
  fs.writeFileSync(path.join(root, "mirror-history.json"), "{\"posts\":[1]}\n");
  fs.writeFileSync(path.join(root, ".data", "chrome-profiles", "private", "Cookies"), "secret");
  fs.writeFileSync(path.join(root, "mirror-server.log"), "large log");
  sqlite(path.join(root, ".data", "thread-discovery.db"), "CREATE TABLE items(value TEXT); INSERT INTO items VALUES('original');");
  sqlite(path.join(root, ".memory", "agent.db"), "CREATE TABLE facts(value TEXT); INSERT INTO facts VALUES('remembered');");

  try {
    run(process.execPath, [path.join(projectRoot, "scripts", "export-runtime-state.js"), archive], {
      env: { THREAD_DASHBOARD_ROOT: root },
    });
    const entries = run("unzip", ["-Z1", archive]).split("\n").filter(Boolean);
    assert(entries.includes("runtime-manifest.json"));
    assert(entries.includes(".data/thread-discovery.db"));
    assert(entries.includes(".memory/agent.db"));
    assert(!entries.some((entry) => entry.includes("chrome-profiles")));
    assert(!entries.some((entry) => entry.includes("mirror-server.log")));

    fs.writeFileSync(path.join(root, "mirror-history.json"), "{\"posts\":[999]}\n");
    sqlite(path.join(root, ".data", "thread-discovery.db"), "UPDATE items SET value='changed';");
    run(process.execPath, [path.join(projectRoot, "scripts", "import-runtime-state.js"), archive], {
      env: { THREAD_DASHBOARD_ROOT: root },
    });

    assert.equal(sqlite(path.join(root, ".data", "thread-discovery.db"), "SELECT value FROM items;"), "original");
    assert.equal(sqlite(path.join(root, ".memory", "agent.db"), "SELECT value FROM facts;"), "remembered");
    assert.equal(fs.readFileSync(path.join(root, "mirror-history.json"), "utf8"), "{\"posts\":[1]}\n");
    const backups = fs.readdirSync(path.join(root, ".migration-backups"));
    assert.equal(backups.length, 1);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
