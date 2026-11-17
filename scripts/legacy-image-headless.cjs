"use strict";
// Headless publisher for the released legacy image-carousel stories in
// .data/story-drafts/local-queue.json (user 2026-11-08: "게시 헤드리스로해").
// Root (title text + one illustration card) goes through the dedicated headless
// story browser (9444) and the text reply through the headless ownReply writer
// (9239), reusing the verified info-post/daily-ten tools. The server's headed
// 9224 queue dispatcher stays disabled (operations-policy dispatchEnabled=false).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { prepareStoryUpload } = require("../lib/story-upload-image");
const root = path.resolve(__dirname, "..");
const base = path.join(root, ".data/story-drafts");
const queueFile = path.join(base, "local-queue.json");
const logFile = path.join(base, "daily-ten", "local-publisher.log");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const sha = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const log = entry => fs.appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), legacy: true, ...entry }) + "\n");

function patchRow(id, updates) {
  const state = read(queueFile);
  const row = state.items.find(item => item.id === id);
  Object.assign(row, updates, { updatedAt: new Date().toISOString() });
  const temporary = `${queueFile}.headless.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
  fs.renameSync(temporary, queueFile);
  return row;
}

function run(script, dir) {
  const result = spawnSync(process.execPath, [script, dir], { cwd: root, encoding: "utf8", timeout: 300000 });
  const tail = text => String(text || "").trim().split("\n").slice(-3).join("\n").slice(-600);
  return { ok: result.status === 0, stderr: tail(result.stderr), stdout: tail(result.stdout) };
}

async function main() {
  const policy = read(path.join(base, "operations-policy.json"));
  if (policy.headlessDispatchEnabled !== true) return;
  const now = Date.now();
  const row = read(queueFile).items.find(item => item.resumedAt && ["scheduled", "continuing"].includes(item.status)
    && !item.reviewRequired && Date.parse(item.scheduledAt) <= now
    && (item.postUrl || now - Date.parse(item.scheduledAt) <= 30 * 60000));
  if (!row) return;
  const dir = path.join(base, "legacy-headless", row.id);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(dir, "root-submit-intent.json")) && !fs.existsSync(path.join(dir, "root-receipt.json"))) {
    patchRow(row.id, { status: "needs_review", lastError: "Unconfirmed headless root submission; reconcile on X before retry" });
    return log({ id: row.id, failed: true, reason: "unconfirmed_root_intent" });
  }
  if (!fs.existsSync(path.join(dir, "root-receipt.json"))) {
    // Same gates as the server path: image inspection record and unchanged media.
    const media = row.media?.[0];
    const review = read(path.join(root, row.storyDir, "image-review.json"));
    if (row.media?.length !== 1 || review.status !== "passed" || review.rootImageSha256 !== media.sha256
      || sha(fs.readFileSync(media.path)) !== media.sha256) {
      patchRow(row.id, { status: "needs_review", lastError: "Image inspection/hash mismatch" });
      return log({ id: row.id, failed: true, reason: "image_review" });
    }
    const reply = String(row.replies?.[0] || "").trim();
    if (!row.text?.trim() || !reply || (row.replyMedia?.[0] || []).length) {
      return log({ id: row.id, failed: true, reason: "expects title root + single text reply" });
    }
    const prepared = await prepareStoryUpload(media.path, dir);
    const uploadName = "upload" + path.extname(prepared.path);
    // prepareStoryUpload returns path.join(directory, name); dir is absolute.
    fs.renameSync(path.resolve(root, prepared.path), path.join(dir, uploadName));
    fs.writeFileSync(path.join(dir, "post.txt"), row.text.trim() + "\n");
    fs.writeFileSync(path.join(dir, "reply_01.txt"), reply + "\n");
    fs.writeFileSync(path.join(dir, "source.json"), JSON.stringify({ type: "legacy_image_carousel", key: `story:${row.id}`,
      queueId: row.id, storyDir: row.storyDir, image: { file: uploadName, sha256: sha(fs.readFileSync(path.join(dir, uploadName))),
      originalSha256: media.sha256, visuallyInspected: true, metadataStripped: true } }, null, 2) + "\n");
    patchRow(row.id, { intent: { kind: "root", headless: true, at: new Date().toISOString() } });
    const result = run(path.join(base, "info-posts", "publish-info-root.cjs"), dir);
    if (!fs.existsSync(path.join(dir, "root-receipt.json"))) {
      patchRow(row.id, { status: fs.existsSync(path.join(dir, "root-submit-intent.json")) ? "needs_review" : "scheduled",
        intent: null, lastError: result.stderr || "headless root failed" });
      return log({ id: row.id, failed: true, step: "root", stderr: result.stderr });
    }
    const receipt = read(path.join(dir, "root-receipt.json"));
    patchRow(row.id, { postUrl: receipt.url, rootReceipt: receipt, status: "continuing", intent: null, lastError: null, publishedBy: "headless_local" });
  }
  if (!fs.existsSync(path.join(dir, "reply-receipt.json"))) {
    const result = run(path.join(base, "daily-ten-tools", "publish-reply.cjs"), dir);
    if (!fs.existsSync(path.join(dir, "reply-receipt.json"))) {
      patchRow(row.id, { status: fs.existsSync(path.join(dir, "reply-repair-submit-intent.json")) ? "needs_review" : "continuing",
        lastError: result.stderr || "headless reply failed" });
      return log({ id: row.id, failed: true, step: "reply", stderr: result.stderr });
    }
  }
  const replyReceipt = read(path.join(dir, "reply-receipt.json"));
  patchRow(row.id, { replyReceipts: [replyReceipt], status: "posted", completedAt: new Date().toISOString(), intent: null, lastError: null });
  const historyFile = path.join(root, "mirror-history.json");
  const history = read(historyFile);
  const entry = history.find(item => item.canonicalUrl === `story:${row.id}`);
  if (entry) {
    Object.assign(entry, { replyUrls: [replyReceipt.url], replyReceipts: [replyReceipt], threadCompletedAt: replyReceipt.verifiedAt, scheduleDelivery: "local_post", publishedBy: "headless_local" });
    fs.writeFileSync(`${historyFile}.legacy.tmp`, JSON.stringify(history, null, 2) + "\n");
    fs.renameSync(`${historyFile}.legacy.tmp`, historyFile);
  }
  log({ id: row.id, posted: true, postUrl: read(path.join(dir, "root-receipt.json")).url, replyUrl: replyReceipt.url });
}

module.exports = { main };
if (require.main === module) main().catch(error => { log({ error: error.message }); process.exitCode = 1; });
