"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { storySlots, DAILY_STORY_LIMIT } = require("./story-schedule");
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const normal = value => String(value || "").replace(/\s+/g, " ").trim();

function createStoryQueue({ root, publish, withPublishSession = run => run(publish), verifyAccount, recordHistory, log = () => {}, now = Date.now }) {
  root = fs.realpathSync(root);
  const base = path.join(root, ".data/story-drafts");
  const file = path.join(base, "local-queue.json");
  let running = false;
  function read() {
    if (!fs.existsSync(file)) return { version: 1, items: [] };
    const state = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(state.items)) throw new Error("Invalid story queue; refusing to reset it");
    return state;
  }
  function write(state) {
    fs.mkdirSync(base, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    const fd = fs.openSync(temporary, "w");
    try { fs.writeFileSync(fd, JSON.stringify(state, null, 2) + "\n"); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  }
  function patch(id, updates) {
    const state = read(), row = state.items.find(item => item.id === id);
    if (!row) throw new Error("Story queue item missing");
    Object.assign(row, updates, { updatedAt: new Date(now()).toISOString() });
    write(state);
    return row;
  }
  function history(row, status) {
    recordHistory({ canonicalUrl: `story:${row.id}`, status, scheduledAt: row.scheduledAt,
      postUrl: row.postUrl || null, mediaCount: row.media.length, scheduleDelivery: "local_post" });
  }
  function materialize(input) {
    if (!/^[a-zA-Z0-9_-]{1,90}$/.test(input.id || "")) throw new Error("Invalid story ID");
    const dir = fs.realpathSync(path.resolve(root, input.storyDir || ""));
    const safeBase = fs.realpathSync(base) + path.sep;
    if (!dir.startsWith(safeBase)) throw new Error("Story directory must be inside .data/story-drafts");
    const get = name => {
      const target = fs.realpathSync(path.join(dir, name));
      if (!target.startsWith(dir + path.sep)) throw new Error("Story file escapes directory");
      return fs.readFileSync(target, "utf8").trim();
    };
    const text = get("post.txt"), body = get("body.txt"), source = JSON.parse(get("source.json"));
    const replies = fs.readdirSync(dir).filter(n => /^reply_\d+\.txt$/.test(n)).sort().map(get).filter(Boolean);
    if (!text || !body || !replies.length) throw new Error("Complete story and ending required");
    if (!["fiction", "curation"].includes(source.type)) throw new Error("Story type must be fiction or curation");
    if (source.type === "curation" && !(source.source?.url || source.source_url)) throw new Error("Curation source required privately");
    const loadMedia = names => names.map(name => {
      if (typeof name !== "string" || path.basename(name) !== name || !/\.png$/i.test(name)) throw new Error("Invalid story media filename");
      const filename = fs.realpathSync(path.join(dir, name));
      if (!filename.startsWith(dir + path.sep)) throw new Error("Media escapes directory");
      const data = fs.readFileSync(filename);
      if (!data.length) throw new Error("Empty story image");
      return { path: filename, sha256: hash(data) };
    });
    let postText = text, postReplies = replies, media = loadMedia(["image.png"]), replyMedia = [];
    const manifestPath = path.join(dir, "thread.json");
    const manifest = fs.existsSync(manifestPath) ? JSON.parse(get("thread.json")) : null;
    if (manifest) {
      if (manifest.version !== 1 || manifest.format !== "image_carousel" || !Array.isArray(manifest.replies)
        || !manifest.replies.length || manifest.replies.length !== replies.length) throw new Error("Invalid story carousel manifest");
      const groups = [manifest.root, ...manifest.replies];
      for (const group of groups) {
        if (!group || typeof group.text !== "string" || !Array.isArray(group.media) || group.media.length < 1 || group.media.length > 4) {
          throw new Error("Story carousel requires 1–4 images and string text per post");
        }
      }
      if (manifest.replies.some(group => group.text !== "")) throw new Error("Story carousel replies must contain images only");
      if (manifest.root.media.length !== 1) throw new Error("Story root must contain exactly one image; put continuation images in replies");
      media = loadMedia(manifest.root.media);
      replyMedia = manifest.replies.map(group => loadMedia(group.media));
      // The short X caption is separate from labels embedded in the images.
      // Older manifests left it blank; retain their post.txt title publicly.
      postText = manifest.root.text.trim() || text;
      postReplies = manifest.replies.map(() => "");
    }
    const time = Date.parse(input.scheduledAt), slots = storySlots(input.operatingDate);
    if (!Number.isFinite(time) || time <= now()) throw new Error("Story must be scheduled in the future");
    if (time < Date.parse(slots[0].scheduledAt) || time > Date.parse(slots.at(-1).scheduledAt)) throw new Error("Outside 06:00–next-day 01:00 KST");
    return { id: input.id, storyDir: path.relative(root, dir), type: source.type, operatingDate: input.operatingDate,
      title: text, text: postText, replies: postReplies, media,
      ...(manifest ? { format: "image_carousel", replyMedia, replyTranscripts: replies } : {}),
      sourceUrl: source.source?.url || source.source_url || null,
      fingerprint: hash(normal([text, body, ...replies].join("\n"))),
      scheduledAt: new Date(time).toISOString(), status: "scheduled", replyReceipts: [], attempts: 0,
      createdAt: new Date(now()).toISOString() };
  }
  async function enqueue(inputs) {
    if (!Array.isArray(inputs) || !inputs.length || inputs.length > 50) throw new Error("Provide 1–50 stories");
    // Account verification is required even for a local reservation.
    await verifyAccount();
    const state = read(), added = [], existing = [];
    for (const input of inputs) {
      const old = state.items.find(item => item.id === input.id);
      if (old) {
        if (old.storyDir !== path.relative(root, path.resolve(root, input.storyDir)) || old.scheduledAt !== new Date(input.scheduledAt).toISOString()) throw new Error("Existing story ID has different reservation");
        existing.push(old); continue;
      }
      const row = materialize(input);
      const policyFile = path.join(base, "operations-policy.json");
      const policy = fs.existsSync(policyFile) ? JSON.parse(fs.readFileSync(policyFile, "utf8")) : {};
      if (policy.previewApprovalRequiredForNewOrChangedStories === true) {
        row.status = "awaiting_approval";
        row.reviewRequired = true;
        row.holdReason = "Upload requires user approval of the exact preview";
      }
      if (state.items.some(item => item.fingerprint === row.fingerprint || normal(item.title || item.text) === normal(row.title || row.text)
        || (row.sourceUrl && item.sourceUrl === row.sourceUrl))) throw new Error(`Duplicate story: ${row.id}`);
      const day = state.items.filter(item => item.operatingDate === row.operatingDate && item.status !== "cancelled");
      if (day.length >= DAILY_STORY_LIMIT || (row.type === "curation" && day.some(item => item.type === "curation"))) throw new Error(`Daily ${DAILY_STORY_LIMIT} stories / maximum 1 curation quota exceeded`);
      if (day.some(item => item.scheduledAt === row.scheduledAt)) throw new Error("Duplicate story slot");
      state.items.push(row); added.push(row);
    }
    write(state);
    for (const row of added) { history(row, row.status); log("story_local_queued", { id: row.id, scheduledAt: row.scheduledAt, status: row.status }); }
    return { added, existing };
  }
  function recover() {
    const state = read(); let changed = false;
    for (const row of state.items) {
      if (row.intent) { row.status = "needs_review"; row.lastError = "Server stopped during submission; verify X before retry"; changed = true; }
    }
    if (changed) write(state);
  }
  async function tick() {
    if (running) return { skipped: "busy" };
    running = true;
    try {
      const row = read().items.filter(item => ["scheduled", "continuing"].includes(item.status)
        && !item.reviewRequired && !item.doNotRepost
        && Date.parse(item.scheduledAt) <= now() && (!item.retryAt || Date.parse(item.retryAt) <= now()))
        .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))[0];
      if (!row) return { processed: false };
      // Persisted receipts keep separate stories at least one minute apart,
      // including after a restart. Replies within the current story stay immediate.
      if (!row.postUrl) {
        const latestPublishedAt = Math.max(0, ...read().items.filter(item => item.id !== row.id && item.postUrl)
          .map(item => Date.parse(item.completedAt || item.rootReceipt?.verifiedAt || "") || 0));
        if (now() < latestPublishedAt + 60000) {
          return { skipped: "story_post_interval", nextAllowedAt: new Date(latestPublishedAt + 60000).toISOString() };
        }
      }
      // Also enforce the limit for legacy reservations or manual queue imports.
      // A root already published may still finish its connected replies.
      if (!row.postUrl && read().items.filter(item => item.operatingDate === row.operatingDate
        && (item.postUrl || item.intent?.kind === "root")).length >= DAILY_STORY_LIMIT) {
        return { skipped: "daily_limit", operatingDate: row.operatingDate };
      }
      if (!row.postUrl && now() - Date.parse(row.scheduledAt) > 30 * 60000) {
        patch(row.id, { status: "missed", lastError: "More than 30 minutes late; not burst-posting missed stories" });
        log("story_local_missed", { id: row.id }); return { missed: row.id };
      }
      const step = async (send, text, media, targetUrl, index) => {
        await send({ text, media, targetUrl,
          beforeSubmit() { patch(row.id, { intent: { kind: targetUrl ? "reply" : "root", index, targetUrl, at: new Date(now()).toISOString() } }); },
          onReceipt(receipt) {
            const current = read().items.find(item => item.id === row.id);
            const updates = targetUrl
              ? { replyReceipts: [...current.replyReceipts, receipt] }
              : { postUrl: receipt.url, rootReceipt: receipt };
            const saved = patch(row.id, { ...updates, intent: null, status: "continuing", attempts: 0, retryAt: null, lastError: null });
            // Preserve the root immediately, even if a later reply fails.
            history(saved, "posted");
            log(targetUrl ? "story_local_reply_posted" : "story_local_root_posted", { storyId: row.id, index, ...receipt });
          },
        });
      };
      try {
        if (!row.postUrl && row.media.length !== 1) throw new Error("Story root must contain exactly one image");
        for (const media of [...row.media, ...(row.replyMedia || []).flat()]) if (hash(fs.readFileSync(media.path)) !== media.sha256) throw new Error("Scheduled media changed; restore or review before publishing");
        await withPublishSession(async send => {
          if (!row.postUrl) await step(send, row.text, row.media.map(item => item.path), null, 0);
          let current = read().items.find(item => item.id === row.id);
          if (!current.postUrl) throw new Error("Root receipt missing");
          for (let index = current.replyReceipts.length; index < row.replies.length; index++) {
            await step(send, row.replies[index], (row.replyMedia?.[index] || []).map(item => item.path), current.replyReceipts.at(-1)?.url || current.postUrl, index);
            current = read().items.find(item => item.id === row.id);
            if (current.replyReceipts.length !== index + 1) throw new Error("Reply receipt missing");
          }
        });
        const current = read().items.find(item => item.id === row.id);
        patch(row.id, { status: "posted", completedAt: new Date(now()).toISOString(), lastError: null, retryAt: null });
        log("story_local_complete", { id: row.id, postUrl: current.postUrl, replyUrls: current.replyReceipts.map(item => item.url) });
        return { posted: row.id, postUrl: current.postUrl };
      } catch (error) {
        const current = read().items.find(item => item.id === row.id), attempts = current.attempts + 1;
        const status = current.intent ? "needs_review" : attempts >= 3 ? "failed" : current.postUrl ? "continuing" : "scheduled";
        patch(row.id, { status, attempts, lastError: error.message, retryAt: new Date(now() + attempts * 60000).toISOString() });
        log("story_local_error", { id: row.id, status, error: error.message });
        return { failed: row.id, status, error: error.message };
      }
    } finally { running = false; }
  }
  return { read, enqueue, recover, tick };
}
module.exports = { createStoryQueue };
