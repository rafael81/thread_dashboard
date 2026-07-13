const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const archiveArg = process.argv[2];
if (!archiveArg) {
  console.error("Usage: node scripts/import-runtime-state.js <runtime-state.zip>");
  process.exit(1);
}

const root = path.resolve(process.env.THREAD_DASHBOARD_ROOT || path.join(__dirname, ".."));
const archive = path.resolve(archiveArg);
if (!fs.existsSync(archive)) {
  console.error(`Archive not found: ${archive}`);
  process.exit(1);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "thread-dashboard-import-"));

function cleanupAndFail(message) {
  fs.rmSync(temp, { recursive: true, force: true });
  console.error(message);
  process.exit(1);
}

const listing = spawnSync("unzip", ["-Z1", archive], { encoding: "utf8" });
if (listing.status !== 0) cleanupAndFail(listing.stderr || "Could not inspect runtime archive");
for (const entry of listing.stdout.split("\n").filter(Boolean)) {
  if (path.isAbsolute(entry) || entry.split(/[\\/]+/).includes("..")) {
    cleanupAndFail(`Unsafe archive entry: ${entry}`);
  }
}

const unzip = spawnSync("unzip", ["-q", archive, "-d", temp], { encoding: "utf8" });
if (unzip.status !== 0) cleanupAndFail(unzip.stderr || "Could not extract runtime archive");

const manifestPath = path.join(temp, "runtime-manifest.json");
if (!fs.existsSync(manifestPath)) cleanupAndFail("Runtime manifest is missing");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.format !== "thread-dashboard-runtime" || manifest.version !== 2 || !Array.isArray(manifest.files)) {
  cleanupAndFail("Unsupported runtime archive format");
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, ".migration-backups", stamp);
const restored = [];

for (const item of manifest.files) {
  const relativePath = String(item?.path || "");
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]+/).includes("..")) {
    cleanupAndFail(`Unsafe manifest path: ${relativePath}`);
  }
  const source = path.join(temp, relativePath);
  if (!fs.existsSync(source)) cleanupAndFail(`Manifest file is missing: ${relativePath}`);
  const target = path.join(root, relativePath);
  if (fs.existsSync(target)) {
    const backup = path.join(backupRoot, relativePath);
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target, backup);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const atomicTarget = `${target}.migration-tmp-${process.pid}`;
  fs.copyFileSync(source, atomicTarget);
  fs.renameSync(atomicTarget, target);
  if (item.type === "sqlite-snapshot") {
    fs.rmSync(`${target}-wal`, { force: true });
    fs.rmSync(`${target}-shm`, { force: true });
  }
  restored.push(relativePath);
}

fs.rmSync(temp, { recursive: true, force: true });
console.log(JSON.stringify({
  ok: true,
  archive,
  restored,
  previousFilesBackup: fs.existsSync(backupRoot) ? backupRoot : null,
  sourceCommit: manifest.sourceCommit || null,
}, null, 2));
