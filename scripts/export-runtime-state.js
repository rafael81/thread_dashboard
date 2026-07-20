const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(process.env.THREAD_DASHBOARD_ROOT || path.join(__dirname, ".."));
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const output = path.resolve(process.argv[2] || path.join(root, `thread-dashboard-runtime-${stamp}.zip`));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "thread-dashboard-runtime-"));

const regularFiles = [
  "discovery-settings.json",
  "mirror-history.json",
  "x-scheduled-slots.json",
  ".data/scheduled-inssider-replies.json",
  ".data/terafabx-automation-state.json",
  ".data/terafabx-comment-monitor-state.json",
  ".data/terafabx-comment-review-queue.json",
  ".data/x-schedule-monitor-state.json",
];

const sqliteFiles = [
  ".data/thread-discovery.db",
  ".memory/agent.db",
];

function fail(message) {
  fs.rmSync(temp, { recursive: true, force: true });
  console.error(message);
  process.exit(1);
}

function copyFile(relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) return false;
  const target = path.join(temp, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function sqliteBackup(relativePath) {
  const source = path.join(root, relativePath);
  if (!fs.existsSync(source)) return false;
  const target = path.join(temp, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const escapedTarget = target.replace(/'/g, "''");
  let result;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    fs.rmSync(target, { force: true });
    result = spawnSync("sqlite3", [source, ".timeout 5000", `.backup '${escapedTarget}'`], { encoding: "utf8" });
    if (result.status === 0) break;
  }
  if (result?.status !== 0) {
    fail(`SQLite snapshot failed for ${relativePath} after 3 attempts. Stop the dashboard server and retry. ${result?.stderr || result?.stdout || "unknown error"}`);
  }
  return true;
}

const included = [];
for (const file of regularFiles) {
  if (copyFile(file)) included.push({ path: file, type: "file" });
}
for (const file of sqliteFiles) {
  if (sqliteBackup(file)) included.push({ path: file, type: "sqlite-snapshot" });
}

if (!included.some((item) => item.path === ".data/thread-discovery.db")) {
  fail("Required discovery database is missing: .data/thread-discovery.db");
}

const gitCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
const manifest = {
  format: "thread-dashboard-runtime",
  version: 2,
  exportedAt: new Date().toISOString(),
  sourceCommit: gitCommit.status === 0 ? gitCommit.stdout.trim() : null,
  files: included,
  excluded: [
    "Chrome profiles and cookies",
    "logs and downloaded media",
    "node_modules",
    "Codex application databases",
  ],
};
fs.writeFileSync(path.join(temp, "runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (fs.existsSync(output)) fs.rmSync(output, { force: true });
fs.mkdirSync(path.dirname(output), { recursive: true });
const result = spawnSync("zip", ["-qr", output, "."], { cwd: temp, stdio: "inherit" });
fs.rmSync(temp, { recursive: true, force: true });

if (result.status !== 0) process.exit(result.status || 1);
console.log(JSON.stringify({ ok: true, output, fileCount: included.length, files: included }, null, 2));
