"use strict";
const fs = require("node:fs");
const path = require("node:path");

function storyCategory(item, source = {}) {
  if (item.type === "curation") return "curation";
  const category = item.storyCategory || source.storyCategory || source.category;
  return ["twist", "반전", "반전 사연"].includes(category) ? "twist" : "general";
}

function storyMediaPath(root, item, index = 0, replyIndex = null) {
  if (!Number.isInteger(index) || index < 0 || (replyIndex !== null && (!Number.isInteger(replyIndex) || replyIndex < 0))) throw new Error("Invalid story media index");
  const base = fs.realpathSync(path.join(root, ".data/story-drafts")) + path.sep;
  const media = replyIndex === null ? item?.media : item?.replyMedia?.[replyIndex];
  const filename = fs.realpathSync(media?.[index]?.path || "");
  if (!filename.startsWith(base) || !fs.statSync(filename).isFile()) throw new Error("Story media unavailable");
  return filename;
}

function mergeStoryDashboardRows(rows, items, root, { dispatchActive = true } = {}) {
  // Queue state wins over the generic mirror-history placeholder, including partial failures.
  // Unposted stories only count as scheduled while the dispatcher can still publish them.
  const byUrl = new Map(rows.filter(row => !String(row.canonicalUrl).startsWith("story:")).map(row => [row.canonicalUrl, row]));
  for (const item of items) {
    if (["cancelled", "deleted_by_user"].includes(item.status)) continue;
    let body = item.body || "", source = {};
    try {
      const dir = path.dirname(storyMediaPath(root, item));
      const readLocal = name => {
        const filename = fs.realpathSync(path.join(dir, name));
        if (!filename.startsWith(dir + path.sep)) throw new Error("Story metadata escapes directory");
        return fs.readFileSync(filename, "utf8");
      };
      try { source = JSON.parse(readLocal("source.json")); } catch { /* Legacy rows may lack metadata. */ }
      if (!body) { try { body = readLocal("body.txt").trim(); } catch { /* Keep the stored title/replies. */ } }
    } catch { /* The stored story remains visible if local files are unavailable. */ }
    const mediaUrl = (media, index, replyIndex = null) => `/api/story-schedules/media?id=${encodeURIComponent(item.id)}&index=${index}${replyIndex === null ? "" : `&reply=${replyIndex}`}&v=${encodeURIComponent(media.sha256 || "")}`;
    byUrl.set(`story:${item.id}`, {
      canonicalUrl: `story:${item.id}`, author: "terafabXai", textPreview: item.title || item.text,
      mediaPreviewUrl: `/api/story-schedules/media?id=${encodeURIComponent(item.id)}&v=${encodeURIComponent(item.media?.[0]?.sha256 || "")}`,
      mediaCount: item.media?.length || 0, likeCount: 0, viralScore: 0,
      criteria: JSON.stringify({ source: "story" }),
      status: item.status === "posted" ? "posted" : dispatchActive && ["scheduled", "continuing"].includes(item.status) ? "scheduled" : "review",
      scheduledPostAt: item.scheduledAt, postedAt: item.completedAt || null,
      discoveredAt: item.createdAt, scheduleDelivery: "local_post", canPost: false,
      xPostUrl: item.postUrl || null, lastError: item.lastError || null,
      story: { id: item.id, type: item.type, body, replies: item.replyTranscripts || item.replies || [], status: item.status,
        category: storyCategory(item, source),
        replyFormat: (item.replyMedia || []).some(group => group.length > 0) ? "images" : "text",
        format: item.format || "root_image_then_reply", replyMediaCount: (item.replyMedia || []).flat().length,
        ...(item.format === "image_carousel" ? { rootMediaUrls: item.media.map((media, index) => mediaUrl(media, index)),
          replyMediaUrls: item.replyMedia.map((group, replyIndex) => group.map((media, index) => mediaUrl(media, index, replyIndex))) } : {}),
        completedReplyCount: item.replyReceipts?.length || 0, operatingDate: item.operatingDate },
    });
  }
  return [...byUrl.values()];
}
module.exports = { mergeStoryDashboardRows, storyMediaPath, storyCategory };
