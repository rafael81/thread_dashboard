const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const command = process.argv[2] || "status";

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: options.cwd || root,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe",
  });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${program} ${args.join(" ")} failed: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
  return result;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function sourceRepo() {
  return run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).stdout.trim();
}

function runtimeRepo() {
  const explicit = argument("--runtime-repo") || process.env.THREAD_DASHBOARD_RUNTIME_REPO;
  if (explicit) return explicit;
  const [owner] = sourceRepo().split("/");
  return `${owner}/thread_dashboard_runtime`;
}

function ensureGhAuth() {
  run("gh", ["auth", "status"]);
}

function ensurePrivateRuntimeRepo(repo) {
  const current = run("gh", ["repo", "view", repo, "--json", "isPrivate", "--jq", ".isPrivate"], { allowFailure: true });
  if (current.status !== 0) {
    run("gh", ["repo", "create", repo, "--private", "--add-readme", "--description", "Private runtime snapshots for thread_dashboard"], { inherit: true });
    return;
  }
  if (current.stdout.trim() !== "true") {
    throw new Error(`Runtime repository must be private: ${repo}`);
  }
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function syncSource() {
  const branch = run("git", ["branch", "--show-current"]).stdout.trim();
  if (!branch) throw new Error("Detached HEAD cannot be synchronized");
  const dirty = run("git", ["status", "--porcelain", "--untracked-files=no"]).stdout.trim();
  if (dirty) throw new Error("Tracked source changes are not committed. Commit them before upload.");
  run("git", ["push", "origin", branch], { inherit: true });
  return { branch, commit: run("git", ["rev-parse", "HEAD"]).stdout.trim() };
}

function exportRuntime(output) {
  const result = run(process.execPath, [path.join(root, "scripts", "export-runtime-state.js"), output]);
  const parsed = JSON.parse(result.stdout);
  return parsed.output;
}

function exportWithDashboardPaused(output) {
  if (process.platform !== "darwin" || typeof process.getuid !== "function") {
    return exportRuntime(output);
  }

  const label = "com.terafabx.mirror-server";
  const domain = `gui/${process.getuid()}`;
  const service = `${domain}/${label}`;
  const plist = path.join(os.homedir(), "Library", "LaunchAgents", `${label}.plist`);
  const loaded = fs.existsSync(plist) && run("launchctl", ["print", service], { allowFailure: true }).status === 0;
  if (!loaded) return exportRuntime(output);

  run("launchctl", ["bootout", service]);
  let exported;
  let exportError = null;
  try {
    exported = exportRuntime(output);
  } catch (error) {
    exportError = error;
  }

  const bootstrap = run("launchctl", ["bootstrap", domain, plist], { allowFailure: true });
  const kickstart = bootstrap.status === 0
    ? run("launchctl", ["kickstart", "-k", service], { allowFailure: true })
    : bootstrap;
  if (bootstrap.status !== 0 || kickstart.status !== 0) {
    const original = exportError ? ` Export also failed: ${exportError.message}` : "";
    throw new Error(`Dashboard LaunchAgent restart failed: ${bootstrap.stderr || kickstart.stderr || "unknown error"}.${original}`);
  }
  if (exportError) throw exportError;
  return exported;
}

function upload() {
  ensureGhAuth();
  const source = syncSource();
  const repo = runtimeRepo();
  ensurePrivateRuntimeRepo(repo);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const archive = path.join(root, `thread-dashboard-runtime-${stamp}.zip`);
  exportWithDashboardPaused(archive);
  const checksumPath = `${archive}.sha256`;
  fs.writeFileSync(checksumPath, `${sha256(archive)}  ${path.basename(archive)}\n`);
  const tag = `runtime-${stamp}`;
  run("gh", [
    "release", "create", tag, archive, checksumPath,
    "--repo", repo,
    "--target", "main",
    "--title", `Runtime ${stamp}`,
    "--notes", `Source ${source.commit} from ${source.branch}. Browser profiles and cookies are intentionally excluded.`,
  ], { inherit: true });
  console.log(JSON.stringify({ ok: true, source, runtimeRepo: repo, tag, archive }, null, 2));
}

function latestRuntimeTag(repo) {
  const result = run("gh", [
    "release", "list", "--repo", repo, "--limit", "100",
    "--json", "tagName,createdAt",
    "--jq", '[.[] | select(.tagName | startswith("runtime-"))] | sort_by(.createdAt) | reverse | .[0].tagName // ""',
  ]);
  const tag = result.stdout.trim();
  if (!tag) throw new Error(`No runtime release found in ${repo}`);
  return tag;
}

function optionalLatestRuntimeTag(repo) {
  try {
    return latestRuntimeTag(repo);
  } catch (error) {
    if (String(error.message).includes("No runtime release found")) return null;
    throw error;
  }
}

function restore() {
  ensureGhAuth();
  const repo = runtimeRepo();
  ensurePrivateRuntimeRepo(repo);
  const tag = argument("--tag") || latestRuntimeTag(repo);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "thread-dashboard-remote-runtime-"));
  try {
    run("gh", ["release", "download", tag, "--repo", repo, "--dir", temp, "--pattern", "thread-dashboard-runtime-*.zip", "--pattern", "thread-dashboard-runtime-*.zip.sha256"], { inherit: true });
    const archive = fs.readdirSync(temp).map((name) => path.join(temp, name)).find((file) => file.endsWith(".zip"));
    const checksumFile = fs.readdirSync(temp).map((name) => path.join(temp, name)).find((file) => file.endsWith(".sha256"));
    if (!archive || !checksumFile) throw new Error("Runtime archive or checksum is missing from release");
    const expected = fs.readFileSync(checksumFile, "utf8").trim().split(/\s+/)[0];
    const actual = sha256(archive);
    if (expected !== actual) throw new Error(`Runtime checksum mismatch: expected ${expected}, got ${actual}`);
    run(process.execPath, [path.join(root, "scripts", "import-runtime-state.js"), archive], { inherit: true });
    console.log(JSON.stringify({ ok: true, runtimeRepo: repo, tag, checksum: actual }, null, 2));
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function status() {
  ensureGhAuth();
  const repo = runtimeRepo();
  const visibility = run("gh", ["repo", "view", repo, "--json", "isPrivate,url"], { allowFailure: true });
  const latest = visibility.status === 0 ? optionalLatestRuntimeTag(repo) : null;
  console.log(JSON.stringify({
    ok: true,
    sourceRepo: sourceRepo(),
    runtimeRepo: repo,
    runtimeRepoExists: visibility.status === 0,
    latestRuntimeTag: latest,
  }, null, 2));
}

try {
  if (command === "upload") upload();
  else if (command === "restore") restore();
  else if (command === "status") status();
  else throw new Error("Usage: npm run migrate:mac -- <upload|restore|status> [--runtime-repo owner/repo] [--tag runtime-tag]");
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
