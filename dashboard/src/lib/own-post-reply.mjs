const OWN_POST_ACTIONS = new Set(["preview", "batch", "enable", "disable"]);

export function normalizeOwnPostUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (!["x.com", "www.x.com"].includes(url.hostname.toLowerCase())) return "";
    const match = url.pathname.match(/^\/terafabxai\/status\/(\d+)(?:\/.*)?$/i);
    return match ? `https://x.com/terafabXai/status/${match[1]}` : "";
  } catch {
    return "";
  }
}

export function isValidOwnPostUrl(value) {
  return Boolean(normalizeOwnPostUrl(value));
}

export function buildOwnPostReplyPayload(action, value) {
  if (!OWN_POST_ACTIONS.has(action)) throw new Error("지원하지 않는 대댓글 작업입니다.");
  const postUrl = normalizeOwnPostUrl(value);
  if (!postUrl) throw new Error("@terafabXai의 올바른 X 게시물 URL을 입력하세요.");
  const payload = { action, postUrl };
  if (action === "batch") {
    return {
      ...payload,
      concurrency: 5,
      limit: 200,
      delayMinMs: 10_000,
      delayMaxMs: 20_000,
    };
  }
  return payload;
}

export function deriveOwnPostReplyViewState({ value, response, status } = {}) {
  const postUrl = normalizeOwnPostUrl(value);
  const targetUrls = Array.isArray(status?.targetUrls) ? status.targetUrls : [];
  const monitored = Boolean(status?.enabled && postUrl && targetUrls.some((item) => normalizeOwnPostUrl(item) === postUrl));
  const result = response?.result || null;
  const action = String(response?.action || "");
  const posted = Array.isArray(result?.posted) ? result.posted : [];
  const rejected = Array.isArray(result?.rejected) ? result.rejected : [];
  const skipped = Array.isArray(result?.skippedTargets) ? result.skippedTargets : [];
  const manualQueue = Array.isArray(status?.manualQueue) ? status.manualQueue : [];
  const responseRequest = result?.request || null;
  const queueItem = responseRequest && normalizeOwnPostUrl(responseRequest.postUrl) === postUrl
    ? responseRequest
    : manualQueue.find((item) => normalizeOwnPostUrl(item?.postUrl) === postUrl) || null;
  const queueActive = Boolean(queueItem && ["queued", "running"].includes(queueItem.status));
  return {
    postUrl,
    monitored,
    monitoringEnabled: Boolean(status?.enabled),
    nextRunAt: status?.nextRunAt || null,
    preview: action === "preview" ? result : null,
    batch: action === "batch" && !result?.queued ? result : null,
    queueItem,
    queueActive,
    queueStatus: queueItem?.status || null,
    queueStageLabel: queueItem?.stageLabel || null,
    pendingManualCount: Number(status?.pendingManualCount || 0),
    posted,
    rejected,
    skipped,
  };
}
