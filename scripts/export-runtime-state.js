const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
const output = path.resolve(process.argv[2] || path.join(root, `thread-dashboard-runtime-${stamp}.zip`));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "thread-dashboard-runtime-"));

const items = [".data", "mirror-history.json", "x-scheduled-slots.json"];

function copyRecursive(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}

for (const item of items) {
  copyRecursive(path.join(root, item), path.join(temp, item));
}

if (fs.existsSync(output)) fs.rmSync(output, { force: true });

const zipCommand = process.platform === "win32"
  ? {
      command: "powershell",
      args: ["-NoProfile", "-Command", `Compress-Archive -Path '${path.join(temp, "*").replace(/'/g, "''")}' -DestinationPath '${output.replace(/'/g, "''")}'`],
    }
  : {
      command: "zip",
      args: ["-qr", output, "."],
      cwd: temp,
    };

const result = spawnSync(zipCommand.command, zipCommand.args, {
  cwd: zipCommand.cwd || root,
  stdio: "inherit",
});

fs.rmSync(temp, { recursive: true, force: true });

if (result.status !== 0) {
  process.exit(result.status || 1);
}

console.log(`Exported runtime state to ${output}`);

