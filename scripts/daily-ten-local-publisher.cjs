"use strict";
// Local (launchd) publisher for daily-ten fiction. User instruction 2026-11-03:
// "창작글 게시할때 gemini, codex 역할 제외" — no AI review or agent at publish time.
// Publishes only the currently due slot when its lineup item is `planned`, through
// scripts/publish-daily-ten.cjs (which keeps the account/text/duplicate/timing gates).
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { slotAt } = require("../lib/daily-publishing");
const root = path.resolve(__dirname, "..");
const base = path.join(root, ".data/story-drafts");
const lineupFile = path.join(base, "daily-ten", "lineup.json");
const logFile = path.join(base, "daily-ten", "local-publisher.log");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const log = entry => fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");

function main() {
  const policy = read(path.join(base, "daily-ten-policy.json"));
  if (!policy.enabled) return log({ skipped: "policy_disabled" });
  const due = slotAt(Date.now(), policy);
  if (!due) return log({ skipped: "no_due_slot" });
  const key = `daily-ten:${due.operatingDate}:${String(due.slotNumber).padStart(2, "0")}`;
  const item = read(lineupFile).items.find(entry => entry.key === key);
  if (!item || item.status !== "planned") return log({ key, skipped: `lineup_${item?.status || "missing"}` });
  const dir = path.resolve(root, item.storyDir);
  if (fs.existsSync(path.join(dir, "final-verification.json"))) return log({ key, skipped: "already_verified" });
  const result = spawnSync(process.execPath, [path.join(root, "scripts/publish-daily-ten.cjs"), "publish", dir], { cwd: root, encoding: "utf8", timeout: 600000 });
  const tail = text => String(text || "").trim().split("\n").slice(-3).join("\n").slice(-800);
  if (result.status !== 0) return log({ key, failed: true, status: result.status, stderr: tail(result.stderr), stdout: tail(result.stdout) });
  const final = read(path.join(dir, "final-verification.json"));
  const rootReceipt = read(path.join(dir, "root-receipt.json"));
  const lineup = read(lineupFile);
  const entry = lineup.items.find(candidate => candidate.key === key);
  Object.assign(entry, { status: "posted", postUrl: final.postUrl, replyUrl: final.replyUrl, postedAt: rootReceipt.verifiedAt, threadCompletedAt: final.verifiedAt, updatedAt: new Date().toISOString(), publishedBy: "local_launchd" });
  lineup.updatedAt = entry.updatedAt;
  const temporary = `${lineupFile}.local-publisher.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(lineup, null, 2) + "\n");
  fs.renameSync(temporary, lineupFile);
  log({ key, posted: true, postUrl: final.postUrl, replyUrl: final.replyUrl });
}
(async () => {
  // Legacy image-carousel stories (11:30/16:30/21:30) publish headless first.
  try { await require("./legacy-image-headless.cjs").main(); } catch (error) { log({ legacyError: error.message }); }
  try { main(); } catch (error) { log({ error: error.message }); process.exitCode = 1; }
})();
