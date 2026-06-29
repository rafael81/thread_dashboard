const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const archiveArg = process.argv[2];
if (!archiveArg) {
  console.error("Usage: node scripts/import-runtime-state.js <runtime-state.zip>");
  process.exit(1);
}

const root = path.resolve(__dirname, "..");
const archive = path.resolve(archiveArg);
if (!fs.existsSync(archive)) {
  console.error(`Archive not found: ${archive}`);
  process.exit(1);
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "thread-dashboard-import-"));
const unzipCommand = process.platform === "win32"
  ? {
      command: "powershell",
      args: ["-NoProfile", "-Command", `Expand-Archive -Path '${archive.replace(/'/g, "''")}' -DestinationPath '${temp.replace(/'/g, "''")}' -Force`],
    }
  : {
      command: "unzip",
      args: ["-q", archive, "-d", temp],
    };

const result = spawnSync(unzipCommand.command, unzipCommand.args, { stdio: "inherit" });
if (result.status !== 0) {
  fs.rmSync(temp, { recursive: true, force: true });
  process.exit(result.status || 1);
}

const items = [".data", "mirror-history.json", "x-scheduled-slots.json"];
for (const item of items) {
  const source = path.join(temp, item);
  const target = path.join(root, item);
  if (!fs.existsSync(source)) continue;
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}

fs.rmSync(temp, { recursive: true, force: true });
console.log(`Imported runtime state from ${archive}`);

