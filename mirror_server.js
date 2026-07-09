const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const { URL } = require("url");
const { execFile, spawn } = require("child_process");
const WebSocket = require("ws");

function loadDotEnvFile(filePath = path.join(__dirname, ".env")) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
  }
}

loadDotEnvFile();

const PORT = Number(process.env.PORT || 3131);
const CHROME_PORT = Number(process.env.CHROME_PORT || 9224);
const REQUIRED_X_HANDLE = (process.env.X_HANDLE || "terafabXai").toLowerCase();
const MAX_MEDIA = 4;
const LOG_PATH = path.join(__dirname, "mirror-events.jsonl");
const SCHEDULE_SLOTS_PATH = path.join(__dirname, "x-scheduled-slots.json");
const MIRROR_HISTORY_PATH = path.join(__dirname, "mirror-history.json");
const SCHEDULED_REPLY_STATE_PATH = path.join(__dirname, ".data", "scheduled-inssider-replies.json");
const DISCOVERY_SETTINGS_PATH = path.join(__dirname, "discovery-settings.json");
const SCHEDULE_SPACING_MS = 15 * 60 * 1000;
const DISCOVERY_DB_PATH = process.env.DISCOVERY_DB_PATH || path.join(__dirname, ".data", "thread-discovery.db");
const DASHBOARD_DIST_DIR = path.join(__dirname, "dashboard", "dist");
const DASHBOARD_INDEX_PATH = path.join(DASHBOARD_DIST_DIR, "index.html");
const GENERATED_MEDIA_DIR = path.join(__dirname, ".data", "generated-media");
const DISCOVERY_MIN_LIKES = Number(process.env.DISCOVERY_MIN_LIKES || 1000);
const DISCOVERY_POST_INTERVAL_MS = Number(process.env.DISCOVERY_POST_INTERVAL_MS || 10 * 60 * 1000);
const DISCOVERY_WORKER_INTERVAL_MS = Number(process.env.DISCOVERY_WORKER_INTERVAL_MS || 60 * 1000);
const DISCOVERY_SCAN_INTERVAL_MS = Number(process.env.DISCOVERY_SCAN_INTERVAL_MS || 5 * 60 * 1000);
const DISCOVERY_MIN_VIRAL_SCORE = Number(process.env.DISCOVERY_MIN_VIRAL_SCORE || 3);
const DISCOVERY_MAX_SCROLLS = Number(process.env.DISCOVERY_MAX_SCROLLS || 20);
const GROK_BIN = process.env.GROK_BIN || "/Users/user/.local/bin/grok";
const AGENT_BROWSER_BIN = process.env.AGENT_BROWSER_BIN || "npx";
const TERAFABX_GROK_PROVIDER = String(process.env.TERAFABX_GROK_PROVIDER || "web").toLowerCase();
const TERAFABX_GROK_WEB_STATE_PATH = process.env.TERAFABX_GROK_WEB_STATE_PATH || path.join(__dirname, ".data", "agent-browser", "terafabx-grok-state.json");
const TERAFABX_GROK_WEB_RUN_DIR = process.env.TERAFABX_GROK_WEB_RUN_DIR || path.join(__dirname, ".data", "terafabx-grok-web-runs");
const TERAFABX_GROK_WEB_SESSION = process.env.TERAFABX_GROK_WEB_SESSION || "terafabx-grok-headless";
const TERAFABX_GROK_WEB_URL = process.env.TERAFABX_GROK_WEB_URL || "https://grok.com/";
const TERAFABX_GROK_WEB_TIMEOUT_MS = Number(process.env.TERAFABX_GROK_WEB_TIMEOUT_MS || 180_000);
const TERAFABX_GROK_WEB_SOURCE_CDP_PORT = Number(process.env.TERAFABX_GROK_WEB_SOURCE_CDP_PORT || CHROME_PORT);
const TERAFABX_GROK_WEB_REFRESH_STATE = process.env.TERAFABX_GROK_WEB_REFRESH_STATE !== "false";
const TERAFABX_GROK_WEB_SCRIPT_PATH = path.join(__dirname, "scripts", "terafabx-grok-web-agent.js");
const TERAFABX_STATE_PATH = process.env.TERAFABX_STATE_PATH || path.join(__dirname, ".data", "terafabx-automation-state.json");
const TERAFABX_COMMENT_REVIEW_QUEUE_PATH = process.env.TERAFABX_COMMENT_REVIEW_QUEUE_PATH || path.join(__dirname, ".data", "terafabx-comment-review-queue.json");
const TERAFABX_LOCK_PATH = process.env.TERAFABX_LOCK_PATH || path.join(os.tmpdir(), "terafabx-cdp9224.lock");
const TERAFABX_COMMENT_INTERVAL_MS = Number(process.env.TERAFABX_COMMENT_INTERVAL_MS || 3 * 60 * 1000);
const TERAFABX_VERIFIED_REVIEW_INTERVAL_MS = Number(process.env.TERAFABX_VERIFIED_REVIEW_INTERVAL_MS || 5 * 60 * 1000);
const TERAFABX_VERIFIED_REVIEW_TARGET_COUNT = Number(process.env.TERAFABX_VERIFIED_REVIEW_TARGET_COUNT || 288);
const TERAFABX_VERIFIED_REVIEW_BATCH_SIZE = Number(process.env.TERAFABX_VERIFIED_REVIEW_BATCH_SIZE || 5);
const TERAFABX_VERIFIED_REVIEW_MAX_TARGETS_PER_RUN = Number(process.env.TERAFABX_VERIFIED_REVIEW_MAX_TARGETS_PER_RUN || 5);
const TERAFABX_VERIFIED_REVIEW_CONCURRENCY = Number(process.env.TERAFABX_VERIFIED_REVIEW_CONCURRENCY || 5);
const TERAFABX_VERIFIED_REVIEW_WORKER_TIMEOUT_MS = Number(process.env.TERAFABX_VERIFIED_REVIEW_WORKER_TIMEOUT_MS || 150_000);
const TERAFABX_VERIFIED_REVIEW_MAX_PROFILE_CHECKS = Number(process.env.TERAFABX_VERIFIED_REVIEW_MAX_PROFILE_CHECKS || 40);
const TERAFABX_VERIFIED_REVIEW_PROFILE_DELAY_MS = Number(process.env.TERAFABX_VERIFIED_REVIEW_PROFILE_DELAY_MS || 1_000);
const TERAFABX_VERIFIED_REVIEW_BACKOFF_MS = Number(process.env.TERAFABX_VERIFIED_REVIEW_BACKOFF_MS || 15 * 60 * 1000);
const TERAFABX_VERIFIED_FOLLOWERS_MAX_SCROLLS = Number(process.env.TERAFABX_VERIFIED_FOLLOWERS_MAX_SCROLLS || 12);
const TERAFABX_VERIFIED_FOLLOWERS_URL = process.env.TERAFABX_VERIFIED_FOLLOWERS_URL || "https://x.com/terafabXai/verified_followers";
const TERAFABX_VERIFIED_REVIEW_X_CHROME_PORT = Number(process.env.TERAFABX_VERIFIED_REVIEW_X_CHROME_PORT || 9235);
const TERAFABX_VERIFIED_REVIEW_X_PROFILE_DIR = process.env.TERAFABX_VERIFIED_REVIEW_X_PROFILE_DIR || path.join(__dirname, ".data", "chrome-profiles", "terafabx-verified-review-x");
const TERAFABX_COMMENT_X_CHROME_PORT = Number(process.env.TERAFABX_COMMENT_X_CHROME_PORT || 9236);
const TERAFABX_COMMENT_X_PROFILE_DIR = process.env.TERAFABX_COMMENT_X_PROFILE_DIR || path.join(__dirname, ".data", "chrome-profiles", "terafabx-comment-x");
const TERAFABX_COMMENT_X_LOCK_PATH = process.env.TERAFABX_COMMENT_X_LOCK_PATH || path.join(os.tmpdir(), `terafabx-comment-x${TERAFABX_COMMENT_X_CHROME_PORT}.lock`);
const TERAFABX_COMMENT_PREFILL_TARGET = Number(process.env.TERAFABX_COMMENT_PREFILL_TARGET || 5);
const TERAFABX_COMMENT_PREFILL_CONCURRENCY = Number(process.env.TERAFABX_COMMENT_PREFILL_CONCURRENCY || 5);
const TERAFABX_COMMENT_PREFILL_GEMINI_PORT_BASE = Number(process.env.TERAFABX_COMMENT_PREFILL_GEMINI_PORT_BASE || 9254);
const TERAFABX_PENDING_COMMENT_MAX_ATTEMPTS = Number(process.env.TERAFABX_PENDING_COMMENT_MAX_ATTEMPTS || 3);
const CDP_HTTP_TIMEOUT_MS = Number(process.env.CDP_HTTP_TIMEOUT_MS || 10_000);
const CDP_WS_OPEN_TIMEOUT_MS = Number(process.env.CDP_WS_OPEN_TIMEOUT_MS || 10_000);
const TERAFABX_REVIEW_COMMENT_MIN_SCORE = Number(process.env.TERAFABX_REVIEW_COMMENT_MIN_SCORE || 90);
const TERAFABX_REVIEW_COMMENT_AUTO_POST = process.env.TERAFABX_REVIEW_COMMENT_AUTO_POST !== "false";
const TERAFABX_REVIEW_COMMENT_AUTO_POST_LIMIT = Number(process.env.TERAFABX_REVIEW_COMMENT_AUTO_POST_LIMIT || 5);
const TERAFABX_REVIEW_COMMENT_DELAY_MS = Number(process.env.TERAFABX_REVIEW_COMMENT_DELAY_MS || 30_000);
const TERAFABX_QUIET_POSTING_START_HOUR = Number(process.env.TERAFABX_QUIET_POSTING_START_HOUR || 1);
const TERAFABX_QUIET_POSTING_END_HOUR = Number(process.env.TERAFABX_QUIET_POSTING_END_HOUR || 6);
const AUTO_SCHEDULE_QUIET_START_HOUR = Number(process.env.AUTO_SCHEDULE_QUIET_START_HOUR || 1);
const AUTO_SCHEDULE_QUIET_END_HOUR = Number(process.env.AUTO_SCHEDULE_QUIET_END_HOUR || 7);
const TERAFABX_HEART_INTERVAL_MS = Number(process.env.TERAFABX_HEART_INTERVAL_MS || 10 * 60 * 1000);
const TERAFABX_HEART_LIMIT = Number(process.env.TERAFABX_HEART_LIMIT || 5);
const TERAFABX_AFFILIATE_DEFAULT_LINK = process.env.TERAFABX_AFFILIATE_DEFAULT_LINK || "";
const TERAFABX_AFFILIATE_DEFAULT_TARGET_URL = process.env.TERAFABX_AFFILIATE_DEFAULT_TARGET_URL || "";
const COUPANG_PARTNERS_ACCESS_KEY = process.env.COUPANG_PARTNERS_ACCESS_KEY || process.env.COUPANG_ACCESS_KEY || "";
const COUPANG_PARTNERS_SECRET_KEY = process.env.COUPANG_PARTNERS_SECRET_KEY || process.env.COUPANG_SECRET_KEY || "";
const COUPANG_PARTNERS_SUB_ID = process.env.COUPANG_PARTNERS_SUB_ID || "terafabx";
const COUPANG_PARTNERS_BASE_URL = process.env.COUPANG_PARTNERS_BASE_URL || "https://api-gateway.coupang.com";
const TERAFABX_FOLLOW_INTERVAL_MS = Number(process.env.TERAFABX_FOLLOW_INTERVAL_MS || 30 * 60 * 1000);
const TERAFABX_FOLLOW_LIMIT = Number(process.env.TERAFABX_FOLLOW_LIMIT || 10);
const DISCOVERY_EXCLUDED_KEYWORDS = ["배재고", "배제고", "이재명"];
const TERAFABX_JOB_GAP_MS = Number(process.env.TERAFABX_JOB_GAP_MS || 90 * 1000);
const NAVER_BLOG_STATE_PATH = process.env.NAVER_BLOG_STATE_PATH || path.join(__dirname, ".data", "naver-blog-ops-state.json");
const NAVER_BLOG_EVENTS_PATH = process.env.NAVER_BLOG_EVENTS_PATH || path.join(__dirname, ".data", "naver-blog-ops-events.jsonl");
const NAVER_BLOG_LOCK_PATH = process.env.NAVER_BLOG_LOCK_PATH || path.join(os.tmpdir(), "naver-blog-ops.lock");
const NAVER_BLOG_CHROME_PORT = Number(process.env.NAVER_BLOG_CHROME_PORT || 9233);
const NAVER_BLOG_PROFILE_DIR = process.env.NAVER_BLOG_PROFILE_DIR || path.join(__dirname, ".data", "chrome-profiles", "naver-blog-writer");
const NAVER_BLOG_ADPOST_ROOT = process.env.NAVER_BLOG_ADPOST_ROOT || "/Users/user/Documents/adpost";
const NAVER_BLOG_INTERVAL_MS = Number(process.env.NAVER_BLOG_INTERVAL_MS || 60 * 1000);
const NAVER_BLOG_DEFAULT_SCHEDULE = ["08:00", "15:00", "21:00"];
const INSSIDER_BASE_URL = "https://inssider.kr";
const INSSIDER_PENDING_CATEGORIES = [
  { code: "003011", name: "[연애·결혼] 누구잘못?" },
  { code: "003001", name: "[직장·사회] 리얼사회생활" },
];
const INSSIDER_CATEGORY_CODES = new Set(INSSIDER_PENDING_CATEGORIES.map((category) => category.code));
const NAVER_BLOG_START_URL = "https://blog.naver.com/cury8282?Redirect=Write&";
const TERAFABX_GEMINI_REVIEW_ENABLED = process.env.TERAFABX_GEMINI_REVIEW_ENABLED !== "false";
const TERAFABX_GEMINI_REVIEW_REQUIRED = process.env.TERAFABX_GEMINI_REVIEW_REQUIRED !== "false";
const TERAFABX_GEMINI_GENERATION_FALLBACK_ENABLED = process.env.TERAFABX_GEMINI_GENERATION_FALLBACK_ENABLED !== "false";
const TERAFABX_GEMINI_CHROME_PORT = Number(process.env.TERAFABX_GEMINI_CHROME_PORT || 9234);
const TERAFABX_VERIFIED_REVIEW_GEMINI_PORT_BASE = Number(process.env.TERAFABX_VERIFIED_REVIEW_GEMINI_PORT_BASE || TERAFABX_GEMINI_CHROME_PORT + 10);
const TERAFABX_GEMINI_PROFILE_DIR = process.env.TERAFABX_GEMINI_PROFILE_DIR || path.join(__dirname, ".data", "chrome-profiles", "terafabx-gemini-review");
const TERAFABX_GEMINI_REVIEW_DIR = process.env.TERAFABX_GEMINI_REVIEW_DIR || path.join(__dirname, ".data", "terafabx-gemini-reviews");
const TERAFABX_VERIFIED_REVIEW_GROK_TIMEOUT_MS = Number(process.env.TERAFABX_VERIFIED_REVIEW_GROK_TIMEOUT_MS || 90_000);
const FXTWITTER_API_BASE = process.env.FXTWITTER_API_BASE || "https://api.fxtwitter.com";

let naverBlogSchedulerBusy = false;
let naverBlogManualBusy = false;

let busy = false;
let discoveryScanBusy = false;
let discoveryDbPromise = null;
let terafabxBusy = false;
let terafabxCommentPrefillBusy = false;
let terafabxSchedulerBusy = false;
let terafabxManualActionPending = false;
let autoScheduleQueue = Promise.resolve();
let autoScheduleQueueDepth = 0;
let scheduledReplyBusy = false;

function loadDiscoverySettings() {
  try {
    const settings = JSON.parse(fs.readFileSync(DISCOVERY_SETTINGS_PATH, "utf8"));
    return {
      autoDiscoveryEnabled: settings.autoDiscoveryEnabled !== false,
    };
  } catch {
    return { autoDiscoveryEnabled: true };
  }
}

function saveDiscoverySettings(settings) {
  fs.writeFileSync(DISCOVERY_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function isAutoDiscoveryEnabled() {
  return loadDiscoverySettings().autoDiscoveryEnabled;
}

function setAutoDiscoveryEnabled(enabled) {
  const settings = loadDiscoverySettings();
  settings.autoDiscoveryEnabled = Boolean(enabled);
  saveDiscoverySettings(settings);
  logEvent("discovery_auto_scan_setting_changed", { autoDiscoveryEnabled: settings.autoDiscoveryEnabled });
  return settings;
}

function logEvent(type, data = {}) {
  const entry = {
    ts: new Date().toISOString(),
    type,
    ...data,
  };
  try {
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.error("failed to write mirror event log", error.message);
  }
}

function serializeProcessError(error) {
  if (!error) return { message: "" };
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    };
  }
  return { message: String(error) };
}

function logProcessEvent(type, data = {}) {
  const payload = { pid: process.pid, ...data };
  logEvent(type, payload);
  console.error(`[${type}]`, JSON.stringify(payload));
}

function installProcessDiagnostics() {
  if (installProcessDiagnostics.installed) return;
  installProcessDiagnostics.installed = true;

  process.on("uncaughtException", (error) => {
    logProcessEvent("server_uncaught_exception", { error: serializeProcessError(error) });
  });
  process.on("unhandledRejection", (reason) => {
    logProcessEvent("server_unhandled_rejection", { error: serializeProcessError(reason) });
  });
  process.on("warning", (warning) => {
    logProcessEvent("server_process_warning", { warning: serializeProcessError(warning) });
  });
  process.on("exit", (code) => {
    logProcessEvent("server_process_exit", { code });
  });
  process.on("SIGTERM", () => {
    logProcessEvent("server_process_signal", { signal: "SIGTERM" });
    process.exit(0);
  });
  process.on("SIGINT", () => {
    logProcessEvent("server_process_signal", { signal: "SIGINT" });
    process.exit(0);
  });
  process.on("SIGHUP", () => {
    logProcessEvent("server_process_signal", { signal: "SIGHUP", action: "ignored" });
  });
}

function compactKeywordText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function excludedDiscoveryKeywordForText(value) {
  const compact = compactKeywordText(value);
  return DISCOVERY_EXCLUDED_KEYWORDS.find((keyword) => compact.includes(compactKeywordText(keyword))) || "";
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function html(res, status, body) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function parseKoreanDateTime(value) {
  if (!value) return null;
  const normalized = String(value).trim().replace(" ", "T");
  const date = new Date(`${normalized}+09:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stripHtmlToText(htmlText) {
  return String(htmlText || "")
    .replace(/<img\b[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function firstImageFromHtml(htmlText) {
  const match = String(htmlText || "").match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return match ? new URL(match[1], INSSIDER_BASE_URL).toString() : "";
}

function wrapKoreanText(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if ([...next].length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function buildCuriosityExcerptParts(text) {
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const selected = [];
  let charCount = 0;
  const stopPatterns = [
    /문제는|그런데|하지만|근데|며칠 뒤|나중에|이후부터|반면|그러자/,
    /말해주더군요|들었습니다|달라졌습니다|분위기/,
    /["“].+["”]/,
  ];
  for (const line of lines) {
    selected.push(line);
    charCount += [...line].length;
    if (selected.length >= 4 && stopPatterns.some((pattern) => pattern.test(line))) break;
    if (selected.length >= 6 || charCount >= 230) break;
  }
  const rest = lines.slice(selected.length).join("\n");
  const excerpt = selected.join("\n");
  return {
    excerpt: excerpt.endsWith("...") || excerpt.endsWith("…") ? excerpt : `${excerpt}\n\n...`,
    continuation: rest,
  };
}

function xWeightedLength(text) {
  return [...String(text || "")].reduce((total, char) => total + (char.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
}

function splitInssiderReplyChunks(text, maxLength = 180) {
  const cleaned = String(text || "").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return [];
  const paragraphs = cleaned.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  const pushCurrent = () => {
    const value = current.trim();
    if (value) chunks.push(value);
    current = "";
  };
  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n${paragraph}` : paragraph;
    if (xWeightedLength(next) <= maxLength) {
      current = next;
      continue;
    }
    pushCurrent();
    if (xWeightedLength(paragraph) <= maxLength) {
      current = paragraph;
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (xWeightedLength(candidate) <= maxLength) {
        line = candidate;
        continue;
      }
      if (line) chunks.push(line);
      if (xWeightedLength(word) <= maxLength) {
        line = word;
      } else {
        const chars = [...word];
        let slice = "";
        for (const char of chars) {
          const candidateSlice = `${slice}${char}`;
          if (slice && xWeightedLength(candidateSlice) > maxLength) {
            chunks.push(slice);
            slice = char;
          } else {
            slice = candidateSlice;
          }
        }
        if (slice) chunks.push(slice);
        line = "";
      }
    }
    if (line) chunks.push(line);
  }
  pushCurrent();
  return chunks;
}

function buildInssiderPostText(post) {
  return String(post.postTitle || "").trim().slice(0, 280);
}

async function fetchInssiderPostDetail(categoryCode, postSeq) {
  if (!INSSIDER_CATEGORY_CODES.has(categoryCode)) throw new Error("허용되지 않은 인싸이더 카테고리입니다.");
  const response = await fetch(`${INSSIDER_BASE_URL}/api/posts/detail`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
      referer: `${INSSIDER_BASE_URL}/posts/${categoryCode}/${postSeq}`,
    },
    body: JSON.stringify({ postSeq: String(postSeq) }),
  });
  const payload = await response.json();
  if (!response.ok || payload.status !== "SUCCESS") {
    throw new Error(payload.message || `인싸이더 상세 조회 실패: HTTP ${response.status}`);
  }
  const data = payload.data || {};
  if (String(data.categoryCd || "") !== categoryCode) throw new Error("인싸이더 상세 카테고리가 요청과 다릅니다.");
  return data;
}

async function imageUrlToDataUri(url) {
  if (!url) return "";
  try {
    const response = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

async function createInssiderCaptureImage(post) {
  fs.mkdirSync(GENERATED_MEDIA_DIR, { recursive: true });
  const sharp = (await import("sharp")).default;
  const contentText = stripHtmlToText(post.content);
  const excerptParts = buildCuriosityExcerptParts(contentText);
  const excerpt = excerptParts.excerpt;
  const imageUrl = firstImageFromHtml(post.content);
  const imageDataUri = await imageUrlToDataUri(imageUrl);
  const textLines = excerpt.split("\n").flatMap((line) => line ? wrapKoreanText(line, 21) : [""]);
  const width = 1080;
  const height = 1350;
  const textStartY = imageDataUri ? 650 : 130;
  const bodyFontSize = 41;
  const bodyLineHeight = 64;
  const maxTextLines = imageDataUri ? 8 : 15;
  const textSvg = textLines.slice(0, maxTextLines).map((line, index) => {
    const y = textStartY + index * bodyLineHeight;
    if (!line) return "";
    const fill = line === "..." ? "#8a8a8a" : "#1f1f1f";
    return `<text x="92" y="${y}" font-size="${bodyFontSize}" font-weight="600" fill="${fill}">${xmlEscape(line)}</text>`;
  }).join("");
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="1080" height="1350" fill="#f7f3ec"/>
  <rect x="54" y="54" width="972" height="1242" rx="34" fill="#fffdf8"/>
  ${imageDataUri ? `<image href="${imageDataUri}" x="92" y="92" width="896" height="520" preserveAspectRatio="xMidYMid slice"/>` : ""}
  ${textSvg}
  <text x="92" y="1248" font-size="30" font-weight="700" fill="#d84a1b">댓글에서 이어보기</text>
</svg>`;
  const filename = `inssider-${post.categoryCd}-${post.postSeq}-${Date.now()}.png`;
  const outputPath = path.join(GENERATED_MEDIA_DIR, filename);
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return {
    filePath: outputPath,
    url: `http://127.0.0.1:${PORT}/generated-media/${filename}`,
    excerpt,
    continuation: excerptParts.continuation,
    sourceImageUrl: imageUrl,
  };
}

async function fetchInssiderCategoryPendingPosts(category) {
  const response = await fetch(`${INSSIDER_BASE_URL}/api/posts/list`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Mozilla/5.0",
      referer: `${INSSIDER_BASE_URL}/posts/${category.code}`,
    },
    body: JSON.stringify({
      categoryCd: category.code,
      currPage: 1,
      pageSize: 500,
      sort: "R",
      postKind: "D",
      includeTopPosts: true,
    }),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Inssider ${category.code} HTTP ${response.status}: ${raw.slice(0, 160)}`);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new Error(`Inssider ${category.code} returned non-JSON response`);
  }
  if (payload.status !== "SUCCESS") {
    throw new Error(payload.message || `Inssider ${category.code} request failed`);
  }
  const posts = Array.isArray(payload.data?.posts) ? payload.data.posts : [];
  const now = Date.now();
  return posts
    .filter((post) => post?.postKind === "D")
    .filter((post) => {
      const endAt = parseKoreanDateTime(post.debateEndAt);
      return endAt && endAt.getTime() > now;
    })
    .map((post) => ({
      id: String(post.postSeq || ""),
      title: String(post.postTitle || "").trim(),
      preview: String(post.previewContent || "").trim(),
      url: `${INSSIDER_BASE_URL}/posts/${category.code}/${post.postSeq}`,
      categoryCode: category.code,
      categoryName: post.categoryName || category.name,
      debateEndAt: post.debateEndAt || "",
      prosText: post.prosText || "",
      consText: post.consText || "",
      prosCnt: Number(post.prosCnt || 0),
      consCnt: Number(post.consCnt || 0),
      viewCntDisplay: post.viewCntDisplay || String(post.viewCnt || 0),
      commentCntDisplay: post.commentCntDisplay || String(post.commentCnt || 0),
      likeCntDisplay: post.likeCntDisplay || String(post.likeCnt || 0),
      thumbnailUrl: post.thumbnailPath ? new URL(post.thumbnailPath, INSSIDER_BASE_URL).toString() : "",
      regDate: post.regDate || "",
      regTime: post.regTime || "",
      nickname: post.nickname || "",
    }));
}

async function getInssiderPendingDashboardData() {
  const groups = await Promise.all(INSSIDER_PENDING_CATEGORIES.map(async (category) => ({
    ...category,
    rows: await fetchInssiderCategoryPendingPosts(category),
  })));
  const rows = groups.flatMap((group) => group.rows)
    .sort((a, b) => (parseKoreanDateTime(a.debateEndAt)?.getTime() || 0) - (parseKoreanDateTime(b.debateEndAt)?.getTime() || 0));
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    summary: {
      totalCount: rows.length,
      categoryCounts: Object.fromEntries(groups.map((group) => [group.code, group.rows.length])),
    },
    categories: groups.map(({ rows, ...category }) => ({ ...category, count: rows.length })),
    rows,
  };
}

function serveFile(res, filePath) {
  const body = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentTypeFor(filePath) });
  res.end(body);
}

function mediaDownloadFilename(url) {
  try {
    const parsed = new URL(url);
    const base = path.basename(decodeURIComponent(parsed.pathname)).replace(/[^\w.-]+/g, "-");
    if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
    if (/\.mp4|\/o1\/v\/t16\//i.test(url)) return `discovery-video-${Date.now()}.mp4`;
    return `discovery-media-${Date.now()}.jpg`;
  } catch {
    return `discovery-media-${Date.now()}`;
  }
}

function attachmentHeader(filename) {
  const safe = String(filename || "discovery-media").replace(/["\\\r\n]/g, "_");
  return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function proxyMediaDownload(url, res, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("media download redirect limit exceeded"));
      return;
    }
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      reject(new Error("unsupported media URL"));
      return;
    }
    if ((parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") && parsed.pathname.startsWith("/generated-media/")) {
      const requested = decodeURIComponent(parsed.pathname.replace(/^\/generated-media\//, ""));
      const fullPath = path.resolve(GENERATED_MEDIA_DIR, requested);
      const rootPath = path.resolve(GENERATED_MEDIA_DIR);
      if (!fullPath.startsWith(rootPath + path.sep) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        reject(new Error("generated media not found"));
        return;
      }
      res.writeHead(200, {
        "content-type": contentTypeFor(fullPath),
        "content-disposition": attachmentHeader(path.basename(fullPath)),
      });
      fs.createReadStream(fullPath).on("error", reject).on("end", resolve).pipe(res);
      return;
    }
    const client = parsed.protocol === "https:" ? https : http;
    const req = client.get(url, { headers: { "user-agent": "Mozilla/5.0" } }, (remote) => {
      if (remote.statusCode >= 300 && remote.statusCode < 400 && remote.headers.location) {
        remote.resume();
        const nextUrl = new URL(remote.headers.location, url).toString();
        proxyMediaDownload(nextUrl, res, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (remote.statusCode < 200 || remote.statusCode >= 300) {
        remote.resume();
        reject(new Error(`media download failed: HTTP ${remote.statusCode}`));
        return;
      }
      res.writeHead(200, {
        "content-type": remote.headers["content-type"] || (/\.(mp4|mov|webm)(\?|$)/i.test(url) ? "video/mp4" : "application/octet-stream"),
        "content-length": remote.headers["content-length"] || undefined,
        "content-disposition": attachmentHeader(mediaDownloadFilename(url)),
      });
      remote.on("error", reject);
      remote.on("end", resolve);
      remote.pipe(res);
    });
    req.on("error", reject);
  });
}

function tryServeDashboardAsset(req, res) {
  if (!req.url.startsWith("/assets/")) return false;
  const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname.slice(1));
  const fullPath = path.resolve(DASHBOARD_DIST_DIR, requested);
  const rootPath = path.resolve(DASHBOARD_DIST_DIR);
  if (!fullPath.startsWith(rootPath + path.sep) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return false;
  }
  serveFile(res, fullPath);
  return true;
}

function tryServeGeneratedMedia(req, res) {
  if (!req.url.startsWith("/generated-media/")) return false;
  const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname.replace(/^\/generated-media\//, ""));
  const fullPath = path.resolve(GENERATED_MEDIA_DIR, requested);
  const rootPath = path.resolve(GENERATED_MEDIA_DIR);
  if (!fullPath.startsWith(rootPath + path.sep) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return false;
  }
  serveFile(res, fullPath);
  return true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function requestJson(method, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: CHROME_PORT, method, path: pathname, timeout: CDP_HTTP_TIMEOUT_MS }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(data || `Chrome returned HTTP ${res.statusCode}`));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Chrome ${CHROME_PORT} ${method} ${pathname} timed out after ${CDP_HTTP_TIMEOUT_MS}ms`)));
    req.on("error", reject);
    req.end();
  });
}

function requestExternalJson(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.request(parsed, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "user-agent": "thread-dashboard/1.0",
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
        if (data.length > 1024 * 1024) req.destroy(new Error("External JSON response too large"));
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

class CdpPage {
  constructor(tab, port = CHROME_PORT) {
    this.tab = tab;
    this.port = port;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(tab.webSocketDebuggerUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        try { this.ws.close(); } catch {}
        reject(new Error(`CDP websocket open timed out port=${this.port} url=${this.tab.url || ""}`));
      }, CDP_WS_OPEN_TIMEOUT_MS);
      const cleanup = () => {
        clearTimeout(timer);
        this.ws.off("open", onOpen);
        this.ws.off("error", onError);
      };
      const onOpen = () => {
        cleanup();
        resolve();
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      this.ws.once("open", onOpen);
      this.ws.once("error", onError);
    });
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw);
      if (msg.id && this.pending.has(msg.id)) {
        this.pending.get(msg.id).resolve(msg.result);
        this.pending.delete(msg.id);
        return;
      }
      this.events.push(msg);
    });
    await this.send("Network.enable");
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("DOM.enable");
  }

  send(method, params = {}, timeoutMs = 45000) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} timed out`));
        }
      }, timeoutMs);
    });
  }

  async eval(expression, awaitPromise = true) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result.value;
  }

  async evalFast(expression, timeoutMs = 8000, awaitPromise = true) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise,
      returnByValue: true,
    }, timeoutMs);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
    }
    return result.result.value;
  }

  async navigate(url, waitMs = 6000) {
    try {
      await this.send("Page.navigate", { url }, 12000);
    } catch (error) {
      if (!/Page\.navigate timed out/.test(error.message)) throw error;
      logEvent("cdp_navigate_timeout_ignored", { url });
    }
    await sleep(waitMs);
  }

  async close() {
    try {
      this.ws.close();
    } catch {}
    try {
      await requestJsonForPort(this.port, "PUT", `/json/close/${this.tab.id}`);
    } catch {}
  }
}

class DuplicateMirrorError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DuplicateMirrorError";
    this.details = details;
  }
}

async function newPage(url = "about:blank") {
  const tab = await requestJson("PUT", `/json/new?${encodeURIComponent(url)}`);
  const page = new CdpPage(tab, CHROME_PORT);
  await page.open();
  return page;
}

async function newPageForPort(port, url = "about:blank") {
  const tab = await requestJsonForPort(port, "PUT", `/json/new?${encodeURIComponent(url)}`);
  const page = new CdpPage(tab, port);
  await page.open();
  return page;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, message) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function acquireMirrorBusy(options = {}) {
  const wait = Boolean(options.wait);
  const timeoutMs = Number(options.timeoutMs || 20 * 60 * 1000);
  const pollMs = Number(options.pollMs || 1000);
  const startedAt = Date.now();
  let loggedWait = false;
  while (busy) {
    if (!wait) throw new Error("다른 미러링 작업이 진행 중입니다.");
    if (!loggedWait) {
      loggedWait = true;
      logEvent("mirror_busy_wait_start", {
        canonicalUrl: options.canonicalUrl || null,
        source: options.source || null,
      });
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("다른 미러링 작업이 끝나기를 기다리다 시간 초과했습니다.");
    }
    await sleep(pollMs);
  }
  busy = true;
  if (loggedWait) {
    logEvent("mirror_busy_wait_end", {
      canonicalUrl: options.canonicalUrl || null,
      source: options.source || null,
      waitedMs: Date.now() - startedAt,
    });
  }
}

function readJsonFile(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonFile(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function loadScheduledReplyState() {
  return readJsonFile(SCHEDULED_REPLY_STATE_PATH, { items: [] });
}

function saveScheduledReplyState(state) {
  writeJsonFile(SCHEDULED_REPLY_STATE_PATH, { items: state.items || [] });
}

function upsertScheduledReplyItem(item) {
  const state = loadScheduledReplyState();
  const items = (state.items || []).filter((entry) => entry.canonicalUrl !== item.canonicalUrl);
  items.push({
    status: "pending",
    attempts: 0,
    createdAt: new Date().toISOString(),
    ...item,
    updatedAt: new Date().toISOString(),
  });
  saveScheduledReplyState({ items });
  logEvent("inssider_scheduled_reply_queued", item);
}

function patchScheduledReplyItem(canonicalUrl, patch) {
  const state = loadScheduledReplyState();
  const items = (state.items || []).map((entry) => (
    entry.canonicalUrl === canonicalUrl
      ? { ...entry, ...patch, updatedAt: new Date().toISOString() }
      : entry
  ));
  saveScheduledReplyState({ items });
}

function loadTerafabxState() {
  const defaults = {
    commentEnabled: false,
    heartEnabled: false,
    followEnabled: false,
    verifiedCommentReviewEnabled: false,
    verifiedCommentReviewLastRunAt: null,
    verifiedCommentReviewStatus: null,
    verifiedCommentReviewError: null,
    verifiedCommentReviewLastAdded: 0,
    verifiedCommentReviewLastChecked: 0,
    verifiedCommentReviewBackoffUntil: null,
    verifiedCommentReviewRecentProfiles: [],
    lastCommentRunAt: null,
    lastCommentStartedAt: null,
    lastCommentStatus: null,
    lastCommentError: null,
    lastComment: null,
    lastCommentTarget: null,
    lastReplyUrl: null,
    commentHistory: [],
    pendingCommentPosts: [],
    seenTargets: [],
    lastHeartRunAt: null,
    lastHeartStatus: null,
    lastHeartError: null,
    lastHeartCount: 0,
    heartHistory: [],
    affiliateDefaultTargetUrl: TERAFABX_AFFILIATE_DEFAULT_TARGET_URL,
    affiliateDefaultLink: TERAFABX_AFFILIATE_DEFAULT_LINK,
    affiliateDefaultComment: buildDefaultAffiliateComment(TERAFABX_AFFILIATE_DEFAULT_LINK),
    affiliateHistory: [],
    lastAffiliateRunAt: null,
    lastAffiliateStatus: null,
    lastAffiliateError: null,
    lastFollowRunAt: null,
    lastFollowStatus: null,
    lastFollowError: null,
    lastFollowCount: 0,
    followHistory: [],
    seenFollowProfiles: [],
  };
  return { ...defaults, ...readJsonFile(TERAFABX_STATE_PATH, defaults) };
}

function saveTerafabxState(patchValue) {
  const next = { ...loadTerafabxState(), ...patchValue, updatedAt: new Date().toISOString() };
  writeJsonFile(TERAFABX_STATE_PATH, next);
  return next;
}

function buildDefaultAffiliateComment(link = "") {
  return [
    "초음파 사진으로 누구 닮았는지 보는 방법 여기요 ㅋㅋ",
    link || "[쿠팡 파트너스 링크]",
    "이 포스팅은 쿠팡 파트너스 활동의 일환으로 수수료를 받을 수 있습니다.",
  ].join("\n");
}

function loadTerafabxCommentReviewQueue() {
  const raw = readJsonFile(TERAFABX_COMMENT_REVIEW_QUEUE_PATH, []);
  return Array.isArray(raw) ? raw : [];
}

function saveTerafabxCommentReviewQueue(rows) {
  writeJsonFile(TERAFABX_COMMENT_REVIEW_QUEUE_PATH, rows);
  return rows;
}

function kstHour(date = new Date()) {
  const value = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return Number(value);
}

function isTerafabxQuietPostingTime(date = new Date()) {
  const start = TERAFABX_QUIET_POSTING_START_HOUR;
  const end = TERAFABX_QUIET_POSTING_END_HOUR;
  const hour = kstHour(date);
  if (!Number.isFinite(hour) || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function nextTerafabxQuietPostingEnd(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const hour = kstHour(date);
  const end = TERAFABX_QUIET_POSTING_END_HOUR;
  const endKst = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), end - 9, 0, 0));
  if (Number.isFinite(hour) && hour >= end) endKst.setUTCDate(endKst.getUTCDate() + 1);
  return endKst.toISOString();
}

function upsertTerafabxCommentReview(record) {
  const rows = loadTerafabxCommentReviewQueue();
  const key = String(record.targetUrl || "").split("?")[0];
  const index = rows.findIndex((item) => String(item.targetUrl || "").split("?")[0] === key);
  const next = index >= 0 ? { ...rows[index], ...record, updatedAt: new Date().toISOString() } : record;
  if (index >= 0) rows[index] = next;
  else rows.unshift(next);
  return { record: next, queue: saveTerafabxCommentReviewQueue(rows.slice(0, TERAFABX_VERIFIED_REVIEW_TARGET_COUNT * 2)) };
}

function pendingTerafabxCommentPosts(state = loadTerafabxState()) {
  const postedTargets = new Set((state.commentHistory || [])
    .map((item) => normalizeXStatusUrl(item.targetUrl || ""))
    .filter(Boolean));
  return Array.isArray(state.pendingCommentPosts)
    ? state.pendingCommentPosts.filter((item) => {
      if (!item || item.status === "posted") return false;
      const targetUrl = normalizeXStatusUrl(item.targetUrl || "");
      return !postedTargets.has(targetUrl);
    })
    : [];
}

function enqueueTerafabxPendingCommentPost(record, options = {}) {
  const previous = loadTerafabxState();
  const pending = pendingTerafabxCommentPosts(previous);
  const targetUrl = normalizeXStatusUrl(record.targetUrl || "");
  const alreadyPosted = (previous.commentHistory || []).some((item) => normalizeXStatusUrl(item.targetUrl || "") === targetUrl);
  if (alreadyPosted) {
    logEvent("terafabx_comment_pending_enqueue_skipped", { targetUrl, reason: "already_posted", source: options.source || record.source || "" });
    return { ...record, targetUrl, skipped: true, reason: "already_posted" };
  }
  const filtered = pending.filter((item) => normalizeXStatusUrl(item.targetUrl || "") !== targetUrl);
  const item = {
    ...record,
    targetUrl,
    status: "pending",
    queuedAt: record.queuedAt || new Date().toISOString(),
    attempts: Number(record.attempts || 0),
  };
  const seenTargets = Array.from(new Set([targetUrl, ...(previous.seenTargets || [])])).slice(0, 500);
  const update = {
    pendingCommentPosts: [item, ...filtered].slice(0, 300),
    seenTargets,
  };
  if (options.updateLastRun !== false) {
    Object.assign(update, {
      lastCommentRunAt: item.queuedAt,
      lastCommentStatus: "deferred",
      lastCommentError: null,
      lastComment: item.comment,
      lastCommentTarget: targetUrl,
    });
  }
  saveTerafabxState(update);
  logEvent(options.eventType || "terafabx_comment_deferred", {
    targetUrl,
    comment: item.comment,
    quietUntil: nextTerafabxQuietPostingEnd(),
    source: options.source || item.source || "",
    pendingCount: filtered.length + 1,
  });
  return item;
}

function removeTerafabxPendingCommentPost(targetUrl) {
  const previous = loadTerafabxState();
  const normalized = normalizeXStatusUrl(targetUrl || "");
  const pending = pendingTerafabxCommentPosts(previous);
  const nextPending = pending.filter((item) => normalizeXStatusUrl(item.targetUrl || "") !== normalized);
  saveTerafabxState({ pendingCommentPosts: nextPending });
  return { before: pending.length, after: nextPending.length };
}

function formatKstDateKey(value) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function recentKstDateKeys(totalDays = 30) {
  const now = new Date();
  const keys = [];
  for (let i = totalDays - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    keys.push(formatKstDateKey(date));
  }
  return keys;
}

const COMMENT_QUALITY_STOPWORDS = new Set([
  "구독하기",
  "관련",
  "조회수",
  "오전",
  "오후",
  "2026년",
  "입니다",
  "있습니다",
  "같아요",
  "이네요",
  "하네요",
  "그렇군요",
  "저도",
  "정말",
  "너무",
  "오늘",
  "이번",
  "그냥",
]);

function commentQualityTokens(value) {
  return Array.from(new Set(String(value || "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .match(/[가-힣A-Za-z]{2,}/g) || []))
    .map((token) => token.toLowerCase())
    .filter((token) => token.length >= 2 && !COMMENT_QUALITY_STOPWORDS.has(token));
}

function commentQualityGrade(score) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  return "D";
}

function scoreTerafabxCommentQuality(comment, targetText, duplicateCount = 1) {
  const text = String(comment || "").trim();
  if (!text) {
    return { score: 0, grade: "D", reasons: ["empty_comment"] };
  }
  let score = 70;
  const reasons = [];
  const length = Array.from(text).length;
  if (length >= 16 && length <= 70) {
    score += 10;
    reasons.push("good_length");
  } else if (length >= 8 && length < 16) {
    score += 2;
    reasons.push("short_but_usable");
  } else if (length < 8) {
    score -= 25;
    reasons.push("too_short");
  } else {
    score -= 12;
    reasons.push("too_long");
  }

  const targetTokens = commentQualityTokens(targetText);
  const commentTokens = commentQualityTokens(text);
  const overlap = commentTokens.filter((token) => targetTokens.includes(token));
  if (overlap.length >= 2) {
    score += 12;
    reasons.push("specific_to_target");
  } else if (overlap.length === 1) {
    score += 6;
    reasons.push("some_target_context");
  } else {
    score -= 18;
    reasons.push("no_target_keyword_overlap");
  }

  if (/^(아\s*)?(그렇군요|좋네요|재밌네요|대박|맞아요|그러네요)[.!~\s]*$/i.test(text) || (/^(아\s*)?(그렇군요|좋네요|재밌네요|대박|맞아요|그러네요)/i.test(text) && overlap.length < 2)) {
    score -= 10;
    reasons.push("generic_reply");
  }
  if (/https?:\/\/|@\w+/.test(text)) {
    score -= 12;
    reasons.push("contains_link_or_handle");
  }
  if (duplicateCount > 1) {
    score -= Math.min(25, (duplicateCount - 1) * 12);
    reasons.push("duplicate_comment_text");
  }
  if (/[?？]$/.test(text) && overlap.length >= 1) {
    score += 3;
    reasons.push("engaging_question");
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: finalScore,
    grade: commentQualityGrade(finalScore),
    reasons,
  };
}

function publishedDiscoveryTime(row, nowMs = Date.now()) {
  if (!row) return "";
  if (row.status === "posted") return row.postedAt || row.scheduledPostAt || "";
  if (row.status === "scheduled") {
    const scheduledMs = new Date(row.scheduledPostAt || 0).getTime();
    if (Number.isFinite(scheduledMs) && scheduledMs <= nowMs) {
      return row.scheduledPostAt || row.postedAt || "";
    }
  }
  return "";
}

function isPublishedDiscoveryRow(row, nowMs = Date.now()) {
  return Boolean(publishedDiscoveryTime(row, nowMs));
}

function dashboardDiscoveryRow(row, nowMs = Date.now()) {
  if (row?.status === "scheduled" && isPublishedDiscoveryRow(row, nowMs)) {
    return {
      ...row,
      status: "posted",
      postedAt: row.scheduledPostAt || row.postedAt,
      scheduledPostAt: null,
    };
  }
  return row;
}

function mirrorHistoryPublishedTime(entry, nowMs = Date.now()) {
  if (!entry) return "";
  if (entry.status === "posted") return entry.completedAt || entry.postedAt || entry.scheduledAt || "";
  if (entry.status === "scheduled") {
    const scheduledMs = new Date(entry.scheduledAt || 0).getTime();
    if (Number.isFinite(scheduledMs) && scheduledMs <= nowMs) {
      return entry.scheduledAt || entry.completedAt || "";
    }
  }
  return "";
}

function mirrorHistoryDashboardRow(entry, nowMs = Date.now()) {
  const canonicalUrl = String(entry?.canonicalUrl || "").trim();
  if (!canonicalUrl) return null;
  const publishedAt = mirrorHistoryPublishedTime(entry, nowMs);
  const scheduledMs = new Date(entry.scheduledAt || 0).getTime();
  const isFutureScheduled = entry.status === "scheduled" && Number.isFinite(scheduledMs) && scheduledMs > nowMs;
  if (!publishedAt && !isFutureScheduled) return null;
  let author = "mirror-history";
  try {
    author = new URL(canonicalUrl).pathname.split("/")[1]?.replace("@", "") || author;
  } catch {}
  return {
    canonicalUrl,
    author,
    textPreview: "이전 미러링 이력",
    mediaPreviewUrl: "",
    likeCount: 0,
    mediaCount: Number(entry.mediaCount || 0),
    viralScore: 0,
    criteria: JSON.stringify({ mirrorHistory: true }),
    status: publishedAt ? "posted" : "scheduled",
    scheduledPostAt: publishedAt ? null : entry.scheduledAt,
    discoveredAt: entry.completedAt || entry.scheduledAt || "",
    postedAt: publishedAt || null,
    lastError: null,
    attempts: 0,
  };
}

function mergeDiscoveryRowsWithMirrorHistory(rows, nowMs = Date.now(), historyEntries = loadMirrorHistory()) {
  const byUrl = new Map((rows || []).map((row) => [row.canonicalUrl, row]));
  for (const entry of historyEntries || []) {
    const historyRow = mirrorHistoryDashboardRow(entry, nowMs);
    if (!historyRow) continue;
    const existing = byUrl.get(historyRow.canonicalUrl);
    if (!existing) {
      byUrl.set(historyRow.canonicalUrl, historyRow);
      continue;
    }
    const next = { ...existing };
    next.mediaCount = Math.max(Number(existing.mediaCount || 0), Number(historyRow.mediaCount || 0));
    if (historyRow.status === "posted") {
      next.status = "posted";
      next.postedAt = historyRow.postedAt;
      next.scheduledPostAt = null;
      next.lastError = null;
    } else if (!isPublishedDiscoveryRow(existing, nowMs)) {
      next.status = "scheduled";
      next.scheduledPostAt = historyRow.scheduledPostAt;
    }
    byUrl.set(historyRow.canonicalUrl, next);
  }
  return Array.from(byUrl.values());
}

function buildAutomationDashboardData(allRows = [], nowMs = Date.now()) {
  const state = loadTerafabxState();
  const reviewQueue = loadTerafabxCommentReviewQueue()
    .filter((item) => item && item.at)
    .map((item) => ({
      id: item.id || `${item.at}-${item.targetUrl || item.targetId || ""}`,
      at: item.at,
      date: formatKstDateKey(item.at),
      status: item.status || "review",
      source: item.source || "",
      follower: item.follower || null,
      targetUrl: item.targetUrl || "",
      targetId: item.targetId || "",
      targetText: item.targetText || "",
      grokComment: item.grokComment || "",
      grokContext: item.grokContext || null,
      comment: item.comment || "",
      geminiReview: item.geminiReview || null,
      generator: item.generator || "",
      posted: Boolean(item.posted),
      manual: Boolean(item.manual),
    }))
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const pendingReviewQueue = reviewQueue.filter((item) => !item.posted && item.status !== "error");
  const postedReviewQueue = reviewQueue.filter((item) => item.posted);
  const errorReviewQueue = reviewQueue.filter((item) => !item.posted && item.status === "error");
  const commentTextCounts = (state.commentHistory || []).reduce((acc, item) => {
    const key = String(item?.comment || "").trim();
    if (key) acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());
  const commentTimeline = (state.commentHistory || [])
    .filter((item) => item && item.at)
    .map((item) => {
      const localQuality = scoreTerafabxCommentQuality(
        item.comment || "",
        item.targetText || "",
        commentTextCounts.get(String(item.comment || "").trim()) || 1,
      );
      const geminiScore = Number(item.geminiReview?.score);
      const hasGeminiScore = Number.isFinite(geminiScore);
      const qualityScore = hasGeminiScore ? geminiScore : localQuality.score;
      return {
        at: item.at,
        date: formatKstDateKey(item.at),
        targetUrl: item.targetUrl || "",
        targetId: item.targetId || "",
        targetText: item.targetText || "",
        comment: item.comment || "",
        grokComment: item.grokComment || "",
        grokContext: item.grokContext || null,
        replyUrl: item.replyUrl || "",
        generator: item.generator || "",
        manual: Boolean(item.manual),
        follower: {
          handle: getXStatusUrlHandle(item.targetUrl || ""),
          profileUrl: getXStatusUrlHandle(item.targetUrl || "") ? `https://x.com/${getXStatusUrlHandle(item.targetUrl || "")}` : "",
          avatarUrl: item.follower?.avatarUrl || "",
          avatarSource: item.follower?.avatarSource || "",
        },
        geminiReview: item.geminiReview || null,
        qualityScore,
        qualitySource: hasGeminiScore ? "gemini" : "local",
        qualityGrade: commentQualityGrade(qualityScore),
        qualityReasons: hasGeminiScore ? [item.geminiReview?.reason || "gemini_review_score"].filter(Boolean) : localQuality.reasons,
        localQualityScore: localQuality.score,
        localQualityGrade: localQuality.grade,
      };
    })
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const heartTimeline = (state.heartHistory || [])
    .filter((item) => item && item.at)
    .map((item) => ({
      at: item.at,
      date: formatKstDateKey(item.at),
      count: Number(item.count || 0),
      manual: Boolean(item.manual),
    }))
    .filter((item) => item.date)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const flowDays = new Map(recentKstDateKeys(30).map((date) => [
    date,
    { date, posted: 0, comments: 0, hearts: 0 },
  ]));

  for (const row of allRows) {
    const publishedAt = publishedDiscoveryTime(row, nowMs);
    if (!publishedAt) continue;
    const date = formatKstDateKey(publishedAt);
    if (flowDays.has(date)) flowDays.get(date).posted += 1;
  }
  for (const item of commentTimeline) {
    if (flowDays.has(item.date)) flowDays.get(item.date).comments += 1;
  }
  for (const item of heartTimeline) {
    if (flowDays.has(item.date)) flowDays.get(item.date).hearts += item.count;
  }

  const availableDates = Array.from(new Set([
    ...commentTimeline.map((item) => item.date),
    ...reviewQueue.map((item) => item.date),
  ])).sort((a, b) => b.localeCompare(a));
  const postedCount = allRows.filter((row) => isPublishedDiscoveryRow(row, nowMs)).length;
  const heartCount = heartTimeline.reduce((total, item) => total + item.count, 0);
  const commentQualityScore = commentTimeline.length
    ? Math.round(commentTimeline.reduce((total, item) => total + Number(item.qualityScore || 0), 0) / commentTimeline.length)
    : 0;
  return {
    summary: {
      postedCount,
      commentCount: commentTimeline.length,
      heartCount,
      commentQualityScore,
      commentQualityGrade: commentQualityGrade(commentQualityScore),
      lowQualityCommentCount: commentTimeline.filter((item) => Number(item.qualityScore || 0) < 70).length,
      commentReviewCount: reviewQueue.length,
      pendingCommentReviewCount: pendingReviewQueue.length,
      postedCommentReviewCount: postedReviewQueue.length,
      errorCommentReviewCount: errorReviewQueue.length,
      lastCommentAt: commentTimeline[0]?.at || null,
      lastHeartAt: heartTimeline[0]?.at || null,
    },
    flowDays: Array.from(flowDays.values()),
    commentTimeline,
    commentReviewQueue: pendingReviewQueue,
    postedCommentReviewQueue: postedReviewQueue,
    errorCommentReviewQueue: errorReviewQueue,
    heartTimeline,
    availableDates,
  };
}

function getTerafabxLockState() {
  try {
    const raw = fs.readFileSync(TERAFABX_LOCK_PATH, "utf8");
    const lock = JSON.parse(raw);
    const ageMs = Date.now() - new Date(lock.at || 0).getTime();
    if (lock.pid && lock.pid !== process.pid) {
      try {
        process.kill(lock.pid, 0);
      } catch {
        try { fs.unlinkSync(TERAFABX_LOCK_PATH); } catch {}
        logEvent("terafabx_stale_lock_removed", { path: TERAFABX_LOCK_PATH, ...lock, ageMs });
        return { busy: false, path: TERAFABX_LOCK_PATH, staleRemoved: true };
      }
    }
    return { busy: true, path: TERAFABX_LOCK_PATH, ageMs, ...lock };
  } catch {
    return { busy: false, path: TERAFABX_LOCK_PATH };
  }
}

function getTerafabxCommentXLockState() {
  try {
    const raw = fs.readFileSync(TERAFABX_COMMENT_X_LOCK_PATH, "utf8");
    const lock = JSON.parse(raw);
    const ageMs = Date.now() - new Date(lock.at || 0).getTime();
    if (lock.pid && lock.pid !== process.pid) {
      try {
        process.kill(lock.pid, 0);
      } catch {
        try { fs.unlinkSync(TERAFABX_COMMENT_X_LOCK_PATH); } catch {}
        logEvent("terafabx_comment_x_stale_lock_removed", { path: TERAFABX_COMMENT_X_LOCK_PATH, ...lock, ageMs });
        return { busy: false, path: TERAFABX_COMMENT_X_LOCK_PATH, staleRemoved: true };
      }
    }
    return { busy: true, path: TERAFABX_COMMENT_X_LOCK_PATH, ageMs, ...lock };
  } catch {
    return { busy: false, path: TERAFABX_COMMENT_X_LOCK_PATH };
  }
}

async function withTerafabxCommentXLock(action, fn, options = {}) {
  const wait = options.wait !== false;
  const timeoutMs = Number(options.timeoutMs || 6 * 60 * 1000);
  const staleMs = Number(options.staleMs || 10 * 60 * 1000);
  const pollMs = Number(options.pollMs || 1000);
  const startedAt = Date.now();
  let loggedWait = false;
  while (true) {
    const existing = getTerafabxCommentXLockState();
    if (!existing.busy || Number(existing.ageMs || 0) >= staleMs) {
      if (existing.busy && Number(existing.ageMs || 0) >= staleMs) {
        try { fs.unlinkSync(TERAFABX_COMMENT_X_LOCK_PATH); } catch {}
        logEvent("terafabx_comment_x_expired_lock_removed", { action, existingAction: existing.action || "unknown", ageMs: existing.ageMs });
      }
      break;
    }
    if (!wait) {
      throw new Error(`9236 headless X writer 사용 중: ${existing.action || "unknown"}`);
    }
    if (!loggedWait) {
      loggedWait = true;
      logEvent("terafabx_comment_x_lock_wait_start", { action, existingAction: existing.action || "unknown" });
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`9236 headless X writer 대기 시간 초과: ${existing.action || "unknown"}`);
    }
    await sleep(pollMs);
  }
  fs.writeFileSync(TERAFABX_COMMENT_X_LOCK_PATH, JSON.stringify({
    at: new Date().toISOString(),
    pid: process.pid,
    action,
    port: TERAFABX_COMMENT_X_CHROME_PORT,
  }, null, 2));
  try {
    return await fn();
  } finally {
    if (loggedWait) logEvent("terafabx_comment_x_lock_wait_end", { action, waitedMs: Date.now() - startedAt });
    try { fs.unlinkSync(TERAFABX_COMMENT_X_LOCK_PATH); } catch {}
  }
}

async function withTerafabxLock(action, fn, options = {}) {
  const wait = Boolean(options.wait);
  const timeoutMs = Number(options.timeoutMs || 10 * 60 * 1000);
  const pollMs = Number(options.pollMs || 1000);
  const startedAt = Date.now();
  let loggedWait = false;
  while (true) {
    const existing = getTerafabxLockState();
    if (!existing.busy || Number(existing.ageMs || 0) >= 10 * 60 * 1000) break;
    if (!wait) {
      throw new Error(`9224 CDP lock 사용 중: ${existing.action || "unknown"}`);
    }
    if (!loggedWait) {
      loggedWait = true;
      logEvent("cdp_lock_wait_start", { action, existingAction: existing.action || "unknown" });
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`9224 CDP lock 대기 시간 초과: ${existing.action || "unknown"}`);
    }
    await sleep(pollMs);
  }
  fs.writeFileSync(TERAFABX_LOCK_PATH, JSON.stringify({ at: new Date().toISOString(), pid: process.pid, action }, null, 2));
  try {
    return await fn();
  } finally {
    if (loggedWait) logEvent("cdp_lock_wait_end", { action, waitedMs: Date.now() - startedAt });
    try { fs.unlinkSync(TERAFABX_LOCK_PATH); } catch {}
  }
}

async function withMirrorChromeLock(action, fn) {
  return withTerafabxLock(action, fn, { wait: true, timeoutMs: 20 * 60 * 1000 });
}

function cleanSocialText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function validateTerafabxReply(value) {
  const text = cleanSocialText(value).replace(/^['"“”‘’]+|['"“”‘’]+$/g, "");
  if (!text) throw new Error("자동댓글이 비어 있습니다.");
  if (/[\r\n]/.test(text)) throw new Error("댓글은 한 줄이어야 합니다.");
  if (/(감정 회계|가성비 최고|독특하네요|훈훈하다|선남선녀|와 진짜|대박|ㄷㄷ|저격수|때려야|죽이네요|보고서|분석)/i.test(text)) {
    throw new Error(`금지/저품질 표현 감지: ${text}`);
  }
  if (/(죽|살인|칼|총|포탄|전쟁|성폭|강간|자살|마약|카지노|도박|투자|주식|주가|매수|매도|매매|포지션|손실|수익|차트|거래소|거래|암호화폐|코인|비트코인|에어드랍|에어드롭|토큰|스테이킹|온체인|블록체인|crypto|airdrop|token|exchange|wallet|blockchain|finance|financial|profit|loss|leverage|futures)/i.test(text)) {
    throw new Error(`민감 표현 감지: ${text}`);
  }
  return text;
}

function normalizeTerafabxGrokKeyPoints(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "").split(/\n|[•·]|(?:^|\s)[-\d]+[.)]?\s+/);
  return source
    .map((item) => cleanSocialText(item).replace(/^[-*\d.)\s]+/, ""))
    .filter(Boolean)
    .slice(0, 5)
    .map((item) => item.slice(0, 240));
}

function normalizeTerafabxGrokResult(value) {
  const source = value && typeof value === "object" ? value : { reply: value };
  const replyRaw = source.reply
    || source.comment
    || source.finalReply
    || source.final_reply
    || source.grokComment
    || "";
  return {
    reply: validateTerafabxReply(String(replyRaw || "").replace(/^[-*\d.)\s]+/, "")),
    contextSummary: cleanSocialText(source.contextSummary || source.context_summary || source.analysis || source.context || "").slice(0, 1200),
    keyPoints: normalizeTerafabxGrokKeyPoints(source.keyPoints || source.key_points || source.points || []),
    rawPreview: String(source.rawPreview || source.raw || "").slice(0, 1200),
  };
}

function terafabxGrokContextForRecord(value) {
  const grok = normalizeTerafabxGrokResult(value);
  return {
    summary: grok.contextSummary,
    keyPoints: grok.keyPoints,
    rawPreview: grok.rawPreview,
  };
}

function hasDetailedTerafabxGrokContext(value) {
  const grok = normalizeTerafabxGrokResult(value);
  return grok.contextSummary.length >= 30 && grok.keyPoints.length >= 1;
}

function parseTerafabxGrokResult(raw) {
  const source = String(raw || "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(extractJsonObjectText(source));
  } catch {}
  if (parsed && typeof parsed === "object") {
    return normalizeTerafabxGrokResult({
      reply: parsed.reply || parsed.comment || parsed.final_reply || parsed.finalReply,
      contextSummary: parsed.context_summary || parsed.contextSummary || parsed.analysis || parsed.context,
      keyPoints: parsed.key_points || parsed.keyPoints || parsed.points,
      rawPreview: source,
    });
  }
  const firstLine = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !/^```/.test(line)) || source;
  return normalizeTerafabxGrokResult({ reply: firstLine, rawPreview: source });
}

function terafabxGeminiReviewPrompt(target, grokInput) {
  const grok = normalizeTerafabxGrokResult(grokInput);
  const keyPoints = grok.keyPoints.length
    ? grok.keyPoints.map((item) => `- ${item}`).join("\n")
    : "- 제공 없음";
  return [
    "너는 X 계정 @terafabXai(과즙루피)의 한국어 자동댓글 품질 검수자다.",
    "아래 원문 문맥, Grok의 원문 해석, Grok 후보 댓글을 그대로 검토한 뒤 공개 답글로 올릴 최고품질 댓글 1개를 반환해라.",
    "Grok 문맥 분석은 보조 정보다. 원문과 충돌하면 원문을 우선하고, Grok의 틀린 추정은 바로잡아라.",
    "Grok 후보가 충분히 좋으면 유지하고, 어색하거나 원문 맥락과 덜 맞으면 자연스럽게 다시 써라.",
    "규칙: 한국어 한 줄, 6~80자, 가능하면 40~70자, 원문 맥락에 구체적으로 반응, 과장/밈 남발 금지, 분석 보고서 말투 금지.",
    "금지: 폭력/무기/성/도박/정치/투자 표현, 조롱, 단정적 비난, 링크, 해시태그, 이모지, 후보 목록, 따옴표.",
    "반드시 JSON 한 줄만 출력해라. 형식: {\"final_reply\":\"댓글\",\"score\":0,\"decision\":\"keep|rewrite\",\"reason\":\"짧은 이유\"}",
    "",
    `원문 URL: ${target.url || ""}`,
    `원문: ${String(target.targetText || target.text || "").slice(0, 1800)}`,
    `Grok 문맥 분석: ${grok.contextSummary || "제공 없음"}`,
    `Grok 핵심 포인트:\n${keyPoints}`,
    `Grok 후보 댓글: ${grok.reply}`,
  ].join("\n");
}

function extractJsonObjectText(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function parseTerafabxGeminiReview(raw) {
  const source = String(raw || "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(extractJsonObjectText(source));
  } catch {}
  const reply = parsed
    ? parsed.final_reply || parsed.reply || parsed.comment || parsed.finalReply
    : source.split("\n").map((line) => line.trim()).filter(Boolean).find((line) => !/^```/.test(line));
  const finalReply = validateTerafabxReply(String(reply || "").replace(/^[-*\d.)\s]+/, ""));
  return {
    finalReply,
    score: Number.isFinite(Number(parsed?.score)) ? Number(parsed.score) : null,
    decision: parsed?.decision || null,
    reason: parsed?.reason || null,
    rawPreview: source.slice(0, 1200),
  };
}

async function chromePidsForPort(port) {
  const result = await execFileOutput("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"]);
  return result.stdout
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

async function dedicatedChromePidsForPort(port, profileDir) {
  const dedicated = [];
  for (const pid of await chromePidsForPort(port)) {
    const command = await execFileOutput("ps", ["-p", String(pid), "-o", "command="]);
    const isDedicatedBrowser = command.stdout.includes(`--remote-debugging-port=${port}`)
      && command.stdout.includes(profileDir);
    if (isDedicatedBrowser) dedicated.push(pid);
  }
  return dedicated;
}

async function waitForChromePort(port, timeoutMs = 15000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await requestJsonForPort(port, "GET", "/json/version");
      return true;
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw new Error(`Chrome ${port} 시작 대기 실패: ${lastError?.message || "timeout"}`);
}

async function ensureTerafabxGeminiHeadlessBrowser(options = {}) {
  const port = Number(options.port || TERAFABX_GEMINI_CHROME_PORT);
  const profileDir = options.profileDir || TERAFABX_GEMINI_PROFILE_DIR;
  const existingPids = await chromePidsForPort(port);
  if (existingPids.length) {
    await waitForChromePort(port, 3000);
    return { launched: false, port, profileDir, pids: existingPids };
  }
  fs.mkdirSync(profileDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ];
  const child = spawn(chromeExecutablePath(), args, { detached: true, stdio: "ignore" });
  let childExit = null;
  child.once("exit", (code, signal) => {
    childExit = { code, signal };
  });
  child.unref();
  try {
    await waitForChromePort(port, 20000);
  } catch (error) {
    if (childExit) {
      throw new Error(`${error.message}; Chrome exited code=${childExit.code ?? "null"} signal=${childExit.signal || "null"} profile=${profileDir}`);
    }
    throw error;
  }
  return { launched: true, port, profileDir, pid: child.pid };
}

async function closeTerafabxGeminiHeadlessBrowser(options = {}) {
  const port = Number(options.port || TERAFABX_GEMINI_CHROME_PORT);
  const profileDir = options.profileDir || TERAFABX_GEMINI_PROFILE_DIR;
  const closedTabs = [];
  try {
    const tabs = await requestJsonForPort(port, "GET", "/json/list");
    for (const tab of tabs) {
      try {
        await requestJsonForPort(port, "PUT", `/json/close/${tab.id}`);
        closedTabs.push({ id: tab.id, title: tab.title, url: tab.url, ok: true });
      } catch (error) {
        closedTabs.push({ id: tab.id, title: tab.title, url: tab.url, ok: false, error: error.message });
      }
    }
  } catch {}
  await sleep(700);
  const killedPids = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const pids = await dedicatedChromePidsForPort(port, profileDir);
    if (!pids.length) break;
    const signal = attempt >= 2 ? "SIGKILL" : "SIGTERM";
    for (const pid of pids) {
      try {
        process.kill(pid, signal);
        killedPids.push(pid);
      } catch {}
    }
    await sleep(signal === "SIGKILL" ? 700 : 1000);
  }
  return { closedTabs, killedPids: Array.from(new Set(killedPids)), remainingPids: await dedicatedChromePidsForPort(port, profileDir) };
}

async function reviewTerafabxReplyWithGemini(target, grokInput, options = {}) {
  const grok = normalizeTerafabxGrokResult(grokInput);
  if (!TERAFABX_GEMINI_REVIEW_ENABLED) {
    return { finalReply: grok.reply, usedGemini: false, disabled: true };
  }
  const reviewId = `terafabx-gemini-${new Date().toISOString().replace(/[:.]/g, "-")}-${target.targetId || "target"}`;
  const runDir = path.join(TERAFABX_GEMINI_REVIEW_DIR, reviewId);
  fs.mkdirSync(runDir, { recursive: true });
  const promptPath = path.join(runDir, "prompt.md");
  const outPath = path.join(runDir, "gemini-review.txt");
  const chromePort = Number(options.chromePort || TERAFABX_GEMINI_CHROME_PORT);
  const profileDir = options.profileDir || TERAFABX_GEMINI_PROFILE_DIR;
  fs.writeFileSync(promptPath, terafabxGeminiReviewPrompt(target, grok));
  logEvent("terafabx_gemini_review_start", {
    targetUrl: target.url,
    grokReply: grok.reply,
    grokContextPreview: grok.contextSummary.slice(0, 240),
    port: chromePort,
    headless: true,
    runDir,
  });
  let browser = null;
  try {
    browser = await ensureTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir });
    const scriptPath = path.join(NAVER_BLOG_ADPOST_ROOT, "scripts", "gemini_custom_prompt.js");
    if (!fs.existsSync(scriptPath)) throw new Error(`Gemini Web 스크립트가 없습니다: ${scriptPath}`);
    const result = await runNodeScript(scriptPath, ["--prompt", promptPath, "--out", outPath, "--cdp", `http://127.0.0.1:${chromePort}`, "--min-length", "6"], {
      cwd: NAVER_BLOG_ADPOST_ROOT,
      timeoutMs: 240000,
    });
    fs.writeFileSync(path.join(runDir, "gemini.stdout.txt"), result.stdout || "");
    fs.writeFileSync(path.join(runDir, "gemini.stderr.txt"), result.stderr || "");
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Gemini Web 댓글 검수 실패");
    if (!fs.existsSync(outPath)) throw new Error("Gemini Web 댓글 검수 출력 파일이 생성되지 않았습니다.");
    const review = parseTerafabxGeminiReview(fs.readFileSync(outPath, "utf8"));
    logEvent("terafabx_gemini_review_ok", { targetUrl: target.url, grokReply: grok.reply, finalReply: review.finalReply, score: review.score, decision: review.decision, reason: review.reason, runDir });
    return { ...review, usedGemini: true, browser };
  } catch (error) {
    logEvent("terafabx_gemini_review_error", { targetUrl: target.url, grokReply: grok.reply, error: error.message, runDir });
    if (TERAFABX_GEMINI_REVIEW_REQUIRED) throw error;
    return { finalReply: grok.reply, usedGemini: false, fallback: true, error: error.message, browser };
  } finally {
    if (options.cleanupBrowser !== false) {
      const cleanup = await closeTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir }).catch((error) => ({ error: error.message }));
      logEvent("terafabx_gemini_review_cleanup", { targetUrl: target.url, cleanup });
    }
  }
}

async function generateTerafabxReplyWithGeminiFallback(target, options = {}) {
  if (!TERAFABX_GEMINI_GENERATION_FALLBACK_ENABLED) {
    throw new Error("Gemini 생성 fallback이 꺼져 있습니다.");
  }
  const attempt = Number(options.attempt || 1);
  const prompt = terafabxReplyPrompt(
    target,
    attempt >= 2 ? "원문 내용이 민감하거나 판단이 어렵다면 중립적인 짧은 공감 답글을 써라." : "",
    "Gemini",
  );
  const runId = `terafabx-gemini-generate-${new Date().toISOString().replace(/[:.]/g, "-")}-${target.targetId || "target"}-attempt${attempt}`;
  const runDir = path.join(TERAFABX_GEMINI_REVIEW_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const promptPath = path.join(runDir, "prompt.md");
  const outPath = path.join(runDir, "gemini-generate.txt");
  const chromePort = Number(options.chromePort || TERAFABX_GEMINI_CHROME_PORT);
  const profileDir = options.profileDir || TERAFABX_GEMINI_PROFILE_DIR;
  fs.writeFileSync(promptPath, prompt);
  logEvent("terafabx_gemini_generate_start", { targetUrl: target.url, attempt, port: chromePort, runDir });
  let browser = null;
  try {
    browser = await ensureTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir });
    const scriptPath = path.join(NAVER_BLOG_ADPOST_ROOT, "scripts", "gemini_custom_prompt.js");
    if (!fs.existsSync(scriptPath)) throw new Error(`Gemini Web 스크립트가 없습니다: ${scriptPath}`);
    const result = await runNodeScript(scriptPath, ["--prompt", promptPath, "--out", outPath, "--cdp", `http://127.0.0.1:${chromePort}`, "--min-length", "30"], {
      cwd: NAVER_BLOG_ADPOST_ROOT,
      timeoutMs: 240000,
    });
    fs.writeFileSync(path.join(runDir, "gemini.stdout.txt"), result.stdout || "");
    fs.writeFileSync(path.join(runDir, "gemini.stderr.txt"), result.stderr || "");
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Gemini Web 댓글 생성 실패");
    if (!fs.existsSync(outPath)) throw new Error("Gemini Web 댓글 생성 출력 파일이 생성되지 않았습니다.");
    const parsed = parseTerafabxGrokResult(fs.readFileSync(outPath, "utf8"));
    if (!hasDetailedTerafabxGrokContext(parsed)) throw new Error("Gemini 상세 문맥 분석 JSON이 비어 있거나 부족합니다.");
    logEvent("terafabx_gemini_generate_ok", {
      targetUrl: target.url,
      attempt,
      reply: parsed.reply,
      contextPreview: parsed.contextSummary.slice(0, 240),
      keyPointCount: parsed.keyPoints.length,
      runDir,
    });
    return { ...parsed, provider: "gemini-web-headless-fallback" };
  } catch (error) {
    logEvent("terafabx_gemini_generate_error", { targetUrl: target.url, attempt, error: error.message, runDir });
    throw error;
  } finally {
    if (options.cleanupBrowser !== false) {
      const cleanup = await closeTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir }).catch((error) => ({ error: error.message }));
      logEvent("terafabx_gemini_generate_cleanup", { targetUrl: target.url, cleanup });
    }
  }
}

async function getExistingXPage(url = "https://x.com/home") {
  const tab = await requestJson("PUT", `/json/new?${encodeURIComponent(url)}`);
  const page = new CdpPage(tab, CHROME_PORT);
  await page.open();
  await sleep(2500);
  return page;
}

async function getCookieSourcePage() {
  const tabs = await requestJson("GET", "/json/list").catch(() => []);
  const list = Array.isArray(tabs) ? tabs : [];
  const existing = list.find((tab) => (
    tab?.type === "page"
    && tab.webSocketDebuggerUrl
    && /^https:\/\/(x|twitter)\.com\//.test(String(tab.url || ""))
  )) || list.find((tab) => (
    tab?.type === "page"
    && tab.webSocketDebuggerUrl
    && !/^chrome:\/\//.test(String(tab.url || ""))
  ));
  if (existing) {
    const page = new CdpPage(existing, CHROME_PORT);
    await page.open();
    return { page, closeTab: false };
  }
  const page = await newPage("about:blank");
  return { page, closeTab: true };
}

async function ensureTerafabxVerifiedReviewXHeadlessBrowser() {
  return ensureTerafabxGeminiHeadlessBrowser({
    port: TERAFABX_VERIFIED_REVIEW_X_CHROME_PORT,
    profileDir: TERAFABX_VERIFIED_REVIEW_X_PROFILE_DIR,
  });
}

async function closeTerafabxVerifiedReviewXHeadlessBrowser() {
  return closeTerafabxGeminiHeadlessBrowser({
    port: TERAFABX_VERIFIED_REVIEW_X_CHROME_PORT,
    profileDir: TERAFABX_VERIFIED_REVIEW_X_PROFILE_DIR,
  });
}

async function ensureTerafabxCommentXHeadlessBrowser() {
  return ensureTerafabxGeminiHeadlessBrowser({
    port: TERAFABX_COMMENT_X_CHROME_PORT,
    profileDir: TERAFABX_COMMENT_X_PROFILE_DIR,
  });
}

async function closeTerafabxCommentXHeadlessBrowser() {
  return closeTerafabxGeminiHeadlessBrowser({
    port: TERAFABX_COMMENT_X_CHROME_PORT,
    profileDir: TERAFABX_COMMENT_X_PROFILE_DIR,
  });
}

async function copyXCookiesToPage(page) {
  const source = await getCookieSourcePage();
  try {
    const all = await source.page.send("Network.getAllCookies", {}, 10000);
    const cookies = (all.cookies || [])
      .filter((cookie) => /(^|\.)x\.com$|(^|\.)twitter\.com$|(^|\.)twimg\.com$/.test(String(cookie.domain || "").replace(/^\./, ".")))
      .map((cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || "/",
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly),
        sameSite: cookie.sameSite,
        expires: cookie.expires,
      }))
      .filter((cookie) => cookie.name && cookie.value);
    if (!cookies.length) throw new Error("복사할 X 로그인 쿠키를 찾지 못했습니다.");
    await page.send("Network.setCookies", { cookies }, 10000);
    logEvent("terafabx_verified_review_x_cookies_copied", { count: cookies.length, port: page.port });
    return { count: cookies.length };
  } finally {
    if (source.closeTab) await source.page.close();
    else {
      try { source.page.ws.close(); } catch {}
    }
  }
}

async function getVerifiedReviewXHeadlessPage(url = "https://x.com/home") {
  await ensureTerafabxVerifiedReviewXHeadlessBrowser();
  const page = await newPageForPort(TERAFABX_VERIFIED_REVIEW_X_CHROME_PORT, "about:blank");
  await copyXCookiesToPage(page);
  await page.navigate(url, 2500);
  return page;
}

async function getTerafabxCommentXHeadlessPage(url = "https://x.com/home") {
  logEvent("terafabx_comment_x_headless_open_start", { port: TERAFABX_COMMENT_X_CHROME_PORT, url });
  await ensureTerafabxCommentXHeadlessBrowser();
  logEvent("terafabx_comment_x_headless_browser_ready", { port: TERAFABX_COMMENT_X_CHROME_PORT, url });
  const page = await newPageForPort(TERAFABX_COMMENT_X_CHROME_PORT, "about:blank");
  logEvent("terafabx_comment_x_headless_page_opened", { port: TERAFABX_COMMENT_X_CHROME_PORT, url, tabId: page.tab.id });
  await copyXCookiesToPage(page);
  logEvent("terafabx_comment_x_headless_cookies_ready", { port: TERAFABX_COMMENT_X_CHROME_PORT, url, tabId: page.tab.id });
  await page.navigate(url, 2500);
  logEvent("terafabx_comment_x_headless_navigated", { port: TERAFABX_COMMENT_X_CHROME_PORT, url, tabId: page.tab.id });
  return page;
}

async function closeXDialogs(page) {
  await page.eval(`(() => {
    for (const el of Array.from(document.querySelectorAll('[role="dialog"] [aria-label="Close"], [role="dialog"] [aria-label="닫기"], [data-testid="app-bar-close"], [aria-label="Back"], [aria-label="뒤로"]'))) {
      try { el.click(); } catch {}
    }
    return true;
  })()`).catch(() => false);
}

const TERAFABX_REPLY_RESTRICTED_RE = /(일부 계정만 답글|답글을 쓸 수 있습니다|답글을 달 수 없습니다|답글 권한|Who can reply|Only people|Replies are disabled|can reply)/i;

async function discoverTerafabxCommentTargets(limit = 1) {
  const targetLimit = Math.max(1, Number(limit || 1));
  const state = loadTerafabxState();
  const seen = new Set([
    ...(state.seenTargets || []),
    ...(state.commentHistory || []).map((item) => item.targetUrl),
    ...pendingTerafabxCommentPosts(state).map((item) => item.targetUrl),
  ].filter(Boolean).map((url) => String(url).split("?")[0]));
  logEvent("terafabx_comment_target_discovery_start", { seenCount: seen.size });
  const page = await getTerafabxCommentXHeadlessPage("https://x.com/home");
  try {
    await closeXDialogs(page);
    await verifyXAccount(page);
    await page.navigate("https://x.com/home", 8000);
    for (let i = 0; i < 4; i++) {
      await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 700, deltaX: 0, deltaY: 650 }).catch(() => {});
      await sleep(900);
    }
    const articles = await page.eval(`(() => {
      function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
      return Array.from(document.querySelectorAll("article")).map((article, idx) => {
        const links = Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.href).filter((href) => !href.includes('/photo/') && !href.includes('/analytics'));
        const url = links.find((href) => /x\\.com\\/[^/]+\\/status\\/\\d+/.test(href));
        const text = clean(article.innerText || "");
        return {
          idx,
          url: url ? url.split("?")[0] : null,
          text: text.slice(0, 1200),
          replyCtx: /Replying to|님에게 보내는 답글|답글 대상|멘션/.test(text),
          replyRestricted: /(일부 계정만 답글|답글을 쓸 수 있습니다|답글을 달 수 없습니다|답글 권한|Who can reply|Only people|Replies are disabled|can reply)/i.test(text),
          promoted: /프로모션|Promoted|광고/.test(text),
        };
      }).filter((item) => item.url);
    })()`);
    const banned = /(crypto|airdrop|카지노|도박|정치|대통령|국회|살인|사망|참사|재난|전쟁|섹스|성관계|야동|미성년|중학생|초등|아동|성폭|강간|자살|폭행|칼|총|마약|투자권유|코인|비트코인|에어드랍)/i;
    const candidates = articles.filter((item) => !item.replyCtx && !item.replyRestricted && !item.promoted && item.url && !item.url.includes("/terafabXai/status/") && !seen.has(item.url) && !banned.test(item.text));
    logEvent("terafabx_comment_target_candidates", { articleCount: articles.length, candidateCount: candidates.length, limit: targetLimit });
    const selected = [];
    for (const candidate of candidates.slice(0, 12)) {
      logEvent("terafabx_comment_target_check", { url: candidate.url });
      await page.navigate(candidate.url, 6500);
      const id = (candidate.url.match(/status\/(\d+)/) || [])[1] || "";
      const root = await page.eval(`(() => {
        const id = ${JSON.stringify(id)};
        function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
        const articles = Array.from(document.querySelectorAll("article"));
        const rows = articles.map((article, idx) => ({
          idx,
          text: clean(article.innerText || "").slice(0, 1200),
          hrefs: Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.href),
          replyRestricted: /(일부 계정만 답글|답글을 쓸 수 있습니다|답글을 달 수 없습니다|답글 권한|Who can reply|Only people|Replies are disabled|can reply)/i.test(clean(article.innerText || "")),
          replyDisabled: Array.from(article.querySelectorAll('[data-testid="reply"], button, [role="button"]')).some((el) => /Reply|답글/.test(el.getAttribute("aria-label") || el.innerText || "") && (el.disabled || el.getAttribute("aria-disabled") === "true")),
        }));
        const match = rows.find((row) => row.hrefs.some((href) => href.includes('/status/' + id)));
        return { match, first: rows[0] || null, url: location.href };
      })()`);
      if (root.match && root.match.idx === 0 && root.first && (root.first.replyRestricted || root.first.replyDisabled || TERAFABX_REPLY_RESTRICTED_RE.test(root.first.text))) {
        logEvent("terafabx_comment_target_skip", { url: candidate.url, reason: "reply_restricted", textPreview: root.first.text.slice(0, 180), replyDisabled: root.first.replyDisabled });
        continue;
      }
      if (root.match && root.match.idx === 0 && root.first && !/Replying to|님에게 보내는 답글|답글 대상|멘션/.test(root.first.text)) {
        logEvent("terafabx_comment_target_selected", { url: candidate.url, targetId: id, textPreview: root.first.text.slice(0, 180) });
        selected.push({ ...candidate, targetId: id, targetText: root.first.text });
        seen.add(candidate.url);
        if (selected.length >= targetLimit) return selected;
      }
    }
    if (selected.length) return selected;
    throw new Error(`댓글 후보 없음: seen=${articles.length}, candidates=${candidates.length}`);
  } finally {
    await page.close();
    const cleanup = await closeTerafabxCommentXHeadlessBrowser().catch((error) => ({ error: error.message }));
    logEvent("terafabx_comment_target_headless_cleanup", { cleanup });
  }
}

async function discoverTerafabxCommentTarget() {
  const targets = await discoverTerafabxCommentTargets(1);
  return targets[0];
}

const TERAFABX_COMMENT_TARGET_BANNED_RE = /(crypto|airdrop|staking|token|on-?chain|binance|exchange|wallet|blockchain|finance|financial|market|profit|loss|leverage|futures|\blong\b|\bshort\b|\binvest(?:ment|ing)?\b|\bfunding\b|\bfundrais(?:e|ing)\b|\brwa\b|\bnft\b|\bdefi\b|\bweb3\b|bullish|bearish|candle|slap|hit|fight|assault|violence|weapon|gun|war|death|killed|shoot|cruel|카지노|도박|정치|대통령|국회|살인|사망|참사|재난|전쟁|섹스|성관계|야동|미성년|중학생|초등|아동|성폭|강간|자살|폭행|폭력|잔인|때리|뺨|칼|총|포탄|마약|투자|주식|주가|양봉|음봉|장대양봉|상한가|하한가|매수|매도|매매|포지션|손실|수익|차트|트레이딩|금융|거래소|거래|암호화폐|코인|비트코인|에어드랍|에어드롭|토큰|스테이킹|온체인|블록체인|지갑|바이낸스)/i;

function normalizeXStatusUrl(value) {
  try {
    const parsed = new URL(value);
    return `https://x.com${parsed.pathname}`.split("?")[0];
  } catch {
    return String(value || "").split("?")[0];
  }
}

function getXStatusUrlHandle(value) {
  const normalized = normalizeXStatusUrl(value);
  const match = normalized.match(/^https:\/\/x\.com\/([^/]+)\/status\/\d+/i);
  return match ? match[1].toLowerCase() : "";
}

function isXStatusUrlForHandle(value, handle) {
  const expected = String(handle || "").replace(/^@/, "").toLowerCase();
  return Boolean(expected && getXStatusUrlHandle(value) === expected);
}

function parseXStatusUrl(value) {
  const normalized = normalizeXStatusUrl(value);
  const match = normalized.match(/^https:\/\/x\.com\/([^/]+)\/status\/(\d+)/i);
  return match ? { handle: match[1], id: match[2], normalized } : null;
}

async function fetchFxTwitterAuthorProfile(statusUrl) {
  const parsed = parseXStatusUrl(statusUrl);
  if (!parsed?.id) return null;
  const apiUrl = `${FXTWITTER_API_BASE.replace(/\/$/, "")}/${encodeURIComponent(parsed.handle)}/status/${encodeURIComponent(parsed.id)}`;
  const data = await requestExternalJson(apiUrl);
  if (Number(data?.code) !== 200 || !data?.tweet?.author) {
    throw new Error(data?.message || "fxtwitter author profile missing");
  }
  const author = data.tweet.author;
  return {
    handle: author.screen_name || parsed.handle,
    profileUrl: author.url || `https://x.com/${author.screen_name || parsed.handle}`,
    avatarUrl: author.avatar_url || "",
    name: author.name || "",
    description: author.description || "",
    source: "fxtwitter",
    apiUrl,
  };
}

async function enrichTerafabxRecordAvatar(record, { eventType = "terafabx_fxtwitter_avatar" } = {}) {
  const targetUrl = normalizeXStatusUrl(record?.targetUrl || record?.url || "");
  if (!targetUrl) return { record, changed: false };
  const existingAvatar = String(record?.follower?.avatarUrl || "").trim();
  if (existingAvatar) return { record, changed: false };
  const profile = await fetchFxTwitterAuthorProfile(targetUrl);
  if (!profile?.avatarUrl) return { record, changed: false };
  const next = {
    ...record,
    follower: {
      ...(record.follower || {}),
      handle: profile.handle || record.follower?.handle || getXStatusUrlHandle(targetUrl),
      profileUrl: profile.profileUrl || record.follower?.profileUrl || "",
      avatarUrl: profile.avatarUrl,
      avatarSource: profile.source || "fxtwitter",
      name: profile.name || record.follower?.name || "",
    },
  };
  logEvent(eventType, { targetUrl, handle: next.follower.handle || "", source: next.follower.avatarSource });
  return { record: next, changed: true };
}

async function enrichTerafabxAvatarList(rows, { limit = 20, eventType } = {}) {
  const next = [];
  let changed = false;
  let fetched = 0;
  for (const row of rows || []) {
    if (!row || row.follower?.avatarUrl || fetched >= limit) {
      next.push(row);
      continue;
    }
    try {
      const result = await enrichTerafabxRecordAvatar(row, { eventType });
      next.push(result.record);
      changed = changed || result.changed;
      fetched += 1;
    } catch (error) {
      next.push(row);
      logEvent("terafabx_fxtwitter_avatar_error", { targetUrl: row.targetUrl || "", error: error.message });
    }
  }
  return { rows: next, changed, fetched };
}

async function ensureTerafabxFxTwitterAvatars({ limit = 20 } = {}) {
  const queue = loadTerafabxCommentReviewQueue();
  const queueResult = await enrichTerafabxAvatarList(queue, { limit, eventType: "terafabx_review_queue_avatar_enriched" });
  if (queueResult.changed) saveTerafabxCommentReviewQueue(queueResult.rows);

  const state = loadTerafabxState();
  let remaining = Math.max(0, Number(limit || 0) - queueResult.fetched);
  const historyResult = await enrichTerafabxAvatarList(state.commentHistory || [], {
    limit: remaining,
    eventType: "terafabx_comment_history_avatar_enriched",
  });
  remaining = Math.max(0, remaining - historyResult.fetched);
  const pendingResult = await enrichTerafabxAvatarList(state.pendingCommentPosts || [], {
    limit: remaining,
    eventType: "terafabx_pending_comment_avatar_enriched",
  });
  if (historyResult.changed || pendingResult.changed) {
    saveTerafabxState({
      commentHistory: historyResult.rows,
      pendingCommentPosts: pendingResult.rows,
    });
  }
  return {
    queueChanged: queueResult.changed,
    historyChanged: historyResult.changed,
    pendingChanged: pendingResult.changed,
    fetched: queueResult.fetched + historyResult.fetched + pendingResult.fetched,
  };
}

function terafabxReviewBackoffUntil(reason, durationMs = TERAFABX_VERIFIED_REVIEW_BACKOFF_MS) {
  const until = new Date(Date.now() + durationMs).toISOString();
  saveTerafabxState({
    verifiedCommentReviewStatus: "backoff",
    verifiedCommentReviewError: reason,
    verifiedCommentReviewBackoffUntil: until,
  });
  logEvent("terafabx_verified_review_backoff", { reason, until, durationMs });
  return until;
}

async function readXTemporaryError(page) {
  return page.evalFast(`(() => {
    const text = (document.body?.innerText || "").replace(/\\s+/g, " ").trim();
    const patterns = [
      /문제가 발생했습니다/i,
      /새로고침해 보세요/i,
      /Something went wrong/i,
      /Try reloading/i,
      /Rate limit/i,
      /잠시 후 다시/i,
    ];
    if (!patterns.some((pattern) => pattern.test(text))) return null;
    return text.slice(0, 220);
  })()`, 2500).catch(() => null);
}

async function assertNoXTemporaryError(page, stage) {
  const message = await readXTemporaryError(page);
  if (!message) return;
  const until = terafabxReviewBackoffUntil(`X 임시 오류 감지(${stage}): ${message}`);
  throw new Error(`X 임시 오류 감지(${stage}). ${until}까지 자동댓글 검수 백오프`);
}

function terafabxProfileTextShowsFollowsMe(value) {
  return /나를\s*팔로우합니다|Follows\s+you/i.test(String(value || ""));
}

async function discoverTerafabxVerifiedFollowerProfiles(limit = TERAFABX_VERIFIED_REVIEW_TARGET_COUNT) {
  const page = await getVerifiedReviewXHeadlessPage(TERAFABX_VERIFIED_FOLLOWERS_URL);
  const profiles = new Map();
  try {
    await closeXDialogs(page);
    await verifyXAccount(page);
    await page.navigate(TERAFABX_VERIFIED_FOLLOWERS_URL, 9000);
    await assertNoXTemporaryError(page, "verified_followers");
    const maxScrolls = Math.min(TERAFABX_VERIFIED_FOLLOWERS_MAX_SCROLLS, Math.max(4, Math.ceil(limit / 6)));
    for (let scroll = 0; scroll < maxScrolls && profiles.size < limit; scroll += 1) {
      await assertNoXTemporaryError(page, "verified_followers_scroll");
      const batch = await page.eval(`(() => {
        function clean(value) { return (value || "").replace(/\\s+/g, " ").trim(); }
        function handleFromHref(href) {
          try {
            const parsed = new URL(href, location.href);
            const part = parsed.pathname.split("/").filter(Boolean)[0] || "";
            if (!/^[A-Za-z0-9_]{1,15}$/.test(part)) return "";
            if (["home", "search", "explore", "messages", "notifications", "i", "settings", "compose"].includes(part.toLowerCase())) return "";
            return part;
          } catch { return ""; }
        }
        const rows = [...document.querySelectorAll('[data-testid="UserCell"]')];
        const fromCells = rows.map((cell) => {
          const anchors = [...cell.querySelectorAll('a[href^="/"], a[href^="https://x.com/"]')];
          const handle = anchors.map((a) => handleFromHref(a.getAttribute("href") || a.href)).find(Boolean);
          const avatar = [...cell.querySelectorAll("img")]
            .map((img) => img.currentSrc || img.src || "")
            .find((src) => /profile_images|pbs\\.twimg\\.com/i.test(src));
          const text = clean(cell.innerText || "");
          const followsMe = /나를\\s*팔로우합니다|Follows\\s+you/i.test(text);
          return handle ? { handle, profileUrl: "https://x.com/" + handle, avatarUrl: avatar || "", text: text.slice(0, 500), followsMe, source: "verified_followers_user_cell" } : null;
        }).filter(Boolean);
        return fromCells;
      })()`);
      for (const profile of batch) {
        const handleKey = String(profile.handle || "").toLowerCase();
        if (!handleKey || handleKey === REQUIRED_X_HANDLE || profiles.has(handleKey)) continue;
        if (!profile.followsMe && !terafabxProfileTextShowsFollowsMe(profile.text)) {
          logEvent("terafabx_verified_review_profile_skip", { handle: profile.handle, reason: "not_follower_badge", textPreview: String(profile.text || "").slice(0, 180) });
          continue;
        }
        profiles.set(handleKey, { ...profile, handle: profile.handle.replace(/^@/, ""), followsMe: true });
        if (profiles.size >= limit) break;
      }
      if (profiles.size >= limit) break;
      await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 760, deltaX: 0, deltaY: 900 }).catch(() => {});
      await sleep(Math.max(1800, Math.min(TERAFABX_VERIFIED_REVIEW_PROFILE_DELAY_MS, 5000)));
    }
    const result = Array.from(profiles.values()).slice(0, limit);
    logEvent("terafabx_verified_followers_profiles", { requested: limit, count: result.length });
    return result;
  } finally {
    await page.close();
  }
}

async function findLatestPostForVerifiedFollower(page, profile) {
  const handle = String(profile.handle || "").replace(/^@/, "");
  if (!handle) return null;
  await page.navigate(`https://x.com/${handle}`, 3500).catch(() => {});
  await assertNoXTemporaryError(page, `profile:${handle}`);
  const profileText = await page.evalFast(`(() => (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 2000))()`, 3500).catch(() => "");
  if (!terafabxProfileTextShowsFollowsMe(profileText)) {
    logEvent("terafabx_verified_review_latest_skip", { handle, reason: "not_follower_profile", textPreview: String(profileText || profile.text || "").slice(0, 180) });
    return null;
  }
  for (let scroll = 0; scroll < 2; scroll += 1) {
    await assertNoXTemporaryError(page, `profile_scroll:${handle}`);
    const latest = await page.evalFast(`(() => {
      const handle = ${JSON.stringify(handle)};
      function clean(value) { return (value || "").replace(/\\s+/g, " ").trim(); }
      const articles = [...document.querySelectorAll("article")].map((article, idx) => {
        const text = clean(article.innerText || "");
        const hrefs = [...article.querySelectorAll('a[href*="/status/"]')]
          .map((a) => a.href)
          .filter((href) => !href.includes('/photo/') && !href.includes('/analytics'));
        const own = hrefs.find((href) => new RegExp('/' + handle + '/status/\\\\d+', 'i').test(href));
        return {
          idx,
          url: own || null,
          text: text.slice(0, 1400),
          replyCtx: /Replying to|님에게 보내는 답글|답글 대상|멘션/.test(text),
          promoted: /프로모션|Promoted|광고/.test(text),
          pinned: /Pinned|고정됨|프로필에 고정/.test(text),
        };
      }).filter((item) => item.url);
      return articles.find((item) => !item.replyCtx && !item.promoted && !item.pinned) || null;
    })()`, 4500).catch(() => null);
    if (latest?.url && latest?.text) {
      const url = normalizeXStatusUrl(latest.url);
      if (!isXStatusUrlForHandle(url, handle)) {
        logEvent("terafabx_verified_review_latest_skip", { handle, reason: "wrong_handle", url });
        return null;
      }
      if (TERAFABX_COMMENT_TARGET_BANNED_RE.test(latest.text)) {
        logEvent("terafabx_verified_review_latest_skip", { handle, reason: "banned_context", url, textPreview: latest.text.slice(0, 180) });
        return null;
      }
      const targetId = (url.match(/status\/(\d+)/) || [])[1] || "";
      return {
        profile,
        url,
        targetId,
        targetText: latest.text,
      };
    }
    await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 760, deltaX: 0, deltaY: 700 }).catch(() => {});
    await sleep(1200);
  }
  logEvent("terafabx_verified_review_latest_skip", { handle, reason: "no_latest_post" });
  return null;
}

async function buildTerafabxVerifiedReviewRecord({ profile, target, manual, workerIndex = 0 }) {
  const worker = Number(workerIndex || 0);
  const grokSession = `${TERAFABX_GROK_WEB_SESSION}-review-${worker + 1}`;
  const geminiPort = TERAFABX_VERIFIED_REVIEW_GEMINI_PORT_BASE + worker;
  const geminiProfileDir = `${TERAFABX_GEMINI_PROFILE_DIR}-review-${worker + 1}`;
  let grokResult = null;
  let grokComment = "";
  let geminiReview = null;
  let comment = "";
  try {
    grokResult = await generateTerafabxReplyWithGrok(target, {
      timeoutMs: TERAFABX_VERIFIED_REVIEW_GROK_TIMEOUT_MS,
      maxAttempts: 2,
      requireContext: true,
      session: grokSession,
    });
    grokComment = normalizeTerafabxGrokResult(grokResult).reply;
    geminiReview = await reviewTerafabxReplyWithGemini(target, grokResult, {
      cleanupBrowser: false,
      chromePort: geminiPort,
      profileDir: geminiProfileDir,
    });
    comment = validateTerafabxReply(geminiReview.finalReply);
    const grokContext = terafabxGrokContextForRecord(grokResult);
    const finalContext = [target.targetText, grokContext.summary, ...(grokContext.keyPoints || []), grokComment, comment, geminiReview.reason].join("\n");
    if (TERAFABX_COMMENT_TARGET_BANNED_RE.test(finalContext)) {
      logEvent("terafabx_verified_review_skip_banned_context", { handle: profile.handle, targetUrl: target.url, workerIndex: worker });
      return null;
    }
  } catch (error) {
    logEvent("terafabx_verified_review_generate_error", { handle: profile.handle, targetUrl: target.url, workerIndex: worker, error: error.message });
    return null;
  }
  const fxProfile = await fetchFxTwitterAuthorProfile(target.url).catch((error) => {
    logEvent("terafabx_fxtwitter_author_error", { handle: profile.handle, targetUrl: target.url, error: error.message });
    return null;
  });
  return {
    id: `verified-review-${Date.now()}-${target.targetId || profile.handle}`,
    at: new Date().toISOString(),
    status: "review",
    source: "verified_followers",
    follower: {
      handle: fxProfile?.handle || profile.handle,
      profileUrl: fxProfile?.profileUrl || profile.profileUrl,
      avatarUrl: fxProfile?.avatarUrl || profile.avatarUrl || "",
      avatarSource: fxProfile?.source || (profile.avatarUrl ? "x-user-cell" : ""),
      name: fxProfile?.name || "",
      text: profile.text || "",
      followsMe: true,
    },
    targetUrl: normalizeXStatusUrl(target.url),
    targetId: target.targetId,
    targetText: target.targetText,
    grokComment,
    grokContext: terafabxGrokContextForRecord(grokResult),
    comment,
    geminiReview: {
      used: Boolean(geminiReview.usedGemini),
      score: geminiReview.score ?? null,
      decision: geminiReview.decision || null,
      reason: geminiReview.reason || null,
      fallback: Boolean(geminiReview.fallback),
      error: geminiReview.error || null,
    },
    generator: geminiReview.usedGemini ? `${grokResult.provider || terafabxGrokGeneratorLabel()}+gemini-web-headless` : (grokResult.provider || terafabxGrokGeneratorLabel()),
    posted: false,
    manual,
  };
}

async function runTerafabxVerifiedCommentReviewOnce({ manual = false, limit = TERAFABX_VERIFIED_REVIEW_BATCH_SIZE } = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  terafabxBusy = true;
  try {
      const startedAt = new Date().toISOString();
      const queueBefore = loadTerafabxCommentReviewQueue();
      const stateBefore = loadTerafabxState();
      const backoffUntilMs = stateBefore.verifiedCommentReviewBackoffUntil ? new Date(stateBefore.verifiedCommentReviewBackoffUntil).getTime() : 0;
      if (Number.isFinite(backoffUntilMs) && backoffUntilMs > Date.now()) {
        throw new Error(`X 임시 오류 백오프 중입니다. ${stateBefore.verifiedCommentReviewBackoffUntil} 이후 다시 실행합니다.`);
      }
      const seen = new Set([
        ...queueBefore.map((item) => item.targetUrl),
        ...(stateBefore.commentHistory || []).map((item) => item.targetUrl),
      ].filter(Boolean).map(normalizeXStatusUrl));
      const seenFollowerHandles = new Set([
        ...queueBefore.map((item) => item.follower?.handle),
        ...(stateBefore.commentHistory || []).map((item) => item.handle || item.author || item.follower?.handle),
      ].filter(Boolean).map((handle) => String(handle).replace(/^@/, "").toLowerCase()));
      const recentProfiles = Array.isArray(stateBefore.verifiedCommentReviewRecentProfiles) ? stateBefore.verifiedCommentReviewRecentProfiles : [];
      const recentProfileHandles = new Set(recentProfiles
        .filter((item) => Date.now() - new Date(item.at || 0).getTime() < 12 * 60 * 60 * 1000)
        .map((item) => String(item.handle || "").replace(/^@/, "").toLowerCase())
        .filter(Boolean));
      const pendingQueueCount = queueBefore.filter((item) => item && !item.posted && item.status !== "error").length;
      const targetLimit = Math.max(1, Math.min(Number(limit || TERAFABX_VERIFIED_REVIEW_BATCH_SIZE), TERAFABX_VERIFIED_REVIEW_TARGET_COUNT, TERAFABX_VERIFIED_REVIEW_MAX_TARGETS_PER_RUN));
      const queueRemaining = Math.max(0, TERAFABX_VERIFIED_REVIEW_TARGET_COUNT - pendingQueueCount);
      const effectiveLimit = Math.min(targetLimit, queueRemaining || targetLimit);
      const concurrency = Math.max(1, Math.min(TERAFABX_VERIFIED_REVIEW_CONCURRENCY, effectiveLimit));
      logEvent("terafabx_verified_review_start", { manual, limit: effectiveLimit, concurrency, queueCount: pendingQueueCount, totalQueueCount: queueBefore.length });
      const profileSearchLimit = Math.min(120, Math.max(24, targetLimit * 24, Math.min(queueRemaining, TERAFABX_VERIFIED_REVIEW_MAX_PROFILE_CHECKS) * 8));
      const profiles = await discoverTerafabxVerifiedFollowerProfiles(profileSearchLimit);
      const page = await getVerifiedReviewXHeadlessPage("about:blank");
      const records = [];
      let checked = 0;
      const checkedProfiles = [];
      const targets = [];
      try {
        await closeXDialogs(page);
        await verifyXAccount(page);
        for (const profile of profiles) {
          if (targets.length >= effectiveLimit) break;
          if (checked >= TERAFABX_VERIFIED_REVIEW_MAX_PROFILE_CHECKS) break;
          const handleKey = String(profile.handle || "").replace(/^@/, "").toLowerCase();
          if (!handleKey || seenFollowerHandles.has(handleKey) || recentProfileHandles.has(handleKey)) {
            logEvent("terafabx_verified_review_profile_skip", { handle: profile.handle, reason: seenFollowerHandles.has(handleKey) ? "already_queued_handle" : "recently_checked" });
            continue;
          }
          if (checked > 0) await sleep(TERAFABX_VERIFIED_REVIEW_PROFILE_DELAY_MS);
          checked += 1;
          checkedProfiles.push({ handle: profile.handle, at: new Date().toISOString() });
          logEvent("terafabx_verified_review_profile_check", { handle: profile.handle, checked, added: records.length });
          recentProfileHandles.add(handleKey);
          const target = await findLatestPostForVerifiedFollower(page, profile).catch((error) => {
            logEvent("terafabx_verified_review_latest_error", { handle: profile.handle, error: error.message });
            if (/X 임시 오류|백오프/.test(error.message)) throw error;
            return null;
          });
          if (!target?.url || seen.has(normalizeXStatusUrl(target.url))) continue;
          seen.add(normalizeXStatusUrl(target.url));
          seenFollowerHandles.add(handleKey);
          targets.push({ profile, target });
          logEvent("terafabx_verified_review_target_collected", { handle: profile.handle, targetUrl: target.url, collected: targets.length, limit: effectiveLimit });
        }
      } finally {
        await page.close();
        const cleanup = await closeTerafabxVerifiedReviewXHeadlessBrowser().catch((error) => ({ error: error.message }));
        logEvent("terafabx_verified_review_x_cleanup", { cleanup });
      }
      for (let offset = 0; offset < targets.length; offset += concurrency) {
        const batch = targets.slice(offset, offset + concurrency);
        logEvent("terafabx_verified_review_parallel_batch_start", { offset, size: batch.length, concurrency });
        const results = await Promise.all(batch.map((item, index) => withTimeout(
          buildTerafabxVerifiedReviewRecord({
            ...item,
            manual,
            workerIndex: index,
          }),
          TERAFABX_VERIFIED_REVIEW_WORKER_TIMEOUT_MS,
          `verified-review worker ${index + 1} timed out after ${TERAFABX_VERIFIED_REVIEW_WORKER_TIMEOUT_MS}ms`,
        ).catch((error) => {
          logEvent("terafabx_verified_review_worker_timeout_or_error", {
            targetUrl: item.target?.url || "",
            handle: item.profile?.handle || "",
            workerIndex: index,
            error: error.message,
          });
          return null;
        })));
        for (const record of results.filter(Boolean)) {
          upsertTerafabxCommentReview(record);
          records.push(record);
          logEvent("terafabx_verified_review_saved", { targetUrl: record.targetUrl, handle: record.follower?.handle || "", comment: record.comment, score: record.geminiReview.score });
        }
        logEvent("terafabx_verified_review_parallel_batch_done", { offset, requested: batch.length, saved: results.filter(Boolean).length });
      }
      const geminiCleanups = await Promise.all(Array.from({ length: concurrency }, (_, index) => closeTerafabxGeminiHeadlessBrowser({
        port: TERAFABX_VERIFIED_REVIEW_GEMINI_PORT_BASE + index,
        profileDir: `${TERAFABX_GEMINI_PROFILE_DIR}-review-${index + 1}`,
      }).catch((error) => ({ error: error.message, index }))));
      await Promise.all(Array.from({ length: concurrency }, (_, index) => closeTerafabxGrokWebSession(`${TERAFABX_GROK_WEB_SESSION}-review-${index + 1}`).catch(() => null)));
      logEvent("terafabx_verified_review_worker_cleanup", { geminiCleanups });
      const queueAfter = loadTerafabxCommentReviewQueue();
      const queueAfterPending = queueAfter.filter((item) => item && !item.posted && item.status !== "error").length;
      saveTerafabxState({
        verifiedCommentReviewLastRunAt: new Date().toISOString(),
        verifiedCommentReviewStatus: "ok",
        verifiedCommentReviewError: null,
        verifiedCommentReviewLastAdded: records.length,
        verifiedCommentReviewLastChecked: checked,
        verifiedCommentReviewLastConcurrency: concurrency,
        verifiedCommentReviewLastBatchCompletedAt: new Date().toISOString(),
        verifiedCommentReviewTargetCount: TERAFABX_VERIFIED_REVIEW_TARGET_COUNT,
        verifiedCommentReviewPendingCount: queueAfterPending,
        verifiedCommentReviewBackoffUntil: null,
        verifiedCommentReviewRecentProfiles: [...checkedProfiles, ...recentProfiles].slice(0, 1000),
      });
      logEvent("terafabx_verified_review_done", { startedAt, checked, added: records.length, queueCount: queueAfterPending, totalQueueCount: queueAfter.length, concurrency });
      return { ok: true, action: "verified-review", startedAt, checked, added: records.length, queueCount: queueAfterPending, totalQueueCount: queueAfter.length, concurrency, records };
  } catch (error) {
    const isBackoff = /백오프|X 임시 오류/.test(error.message);
    saveTerafabxState({ verifiedCommentReviewLastRunAt: new Date().toISOString(), verifiedCommentReviewStatus: isBackoff ? "backoff" : "error", verifiedCommentReviewError: error.message });
    logEvent("terafabx_verified_review_error", { error: error.message });
    throw error;
  } finally {
    terafabxBusy = false;
  }
}

function runGrokCli(prompt, timeout = 90_000) {
  return new Promise((resolve, reject) => {
    execFile(GROK_BIN, ["--no-alt-screen", "--disable-web-search", "--output-format", "plain", "-p", prompt], {
      cwd: __dirname,
      timeout,
      maxBuffer: 1024 * 1024,
    }, (error, stdout, stderr) => {
      const output = `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim();
      if (error) {
        error.message = `${error.message}${output ? `\n${output}` : ""}`;
        reject(error);
        return;
      }
      resolve(output);
    });
  });
}

function agentBrowserCommandArgs(args = []) {
  return AGENT_BROWSER_BIN === "npx" ? ["--yes", "agent-browser", ...args] : args;
}

function terafabxGrokGeneratorLabel() {
  return TERAFABX_GROK_PROVIDER === "web" ? "grok-web-headless" : "grok-cli";
}

function isFastFallbackGrokWebError(error) {
  const message = String(error?.message || error || "");
  return /Grok 입력창을 찾지 못했습니다|lastState=.*https:\/\/x\.com\/|hasEditor":false|agent-browser.*open https:\/\/grok\.com/i.test(message);
}

function terafabxReplyPrompt(target, extraRule = "", actor = "Grok") {
  return [
    "너는 X 계정 @terafabXai(과즙루피)의 한국어 답글 작성기다.",
    "아래 원문을 먼저 자세히 해석한 뒤, 공개 답글 후보 1개를 작성해라.",
    "context_summary: 원문 주제, 인용/답글 구조, 감정/상황, 안전하게 반응할 포인트를 2~4문장으로 써라.",
    "key_points: 댓글 품질 검수자가 참고할 핵심 소재와 관찰 포인트 2~5개를 써라.",
    "reply: 자연스러운 한국어 한 줄, 6~80자, 가능하면 40~70자, 원문 맥락에 구체적으로 반응하되 과장/밈 남발과 분석 보고서 말투를 피하라.",
    `${actor}이 확신할 수 없는 내용은 context_summary에서 추정이라고 표시하고, reply에는 단정하지 마라.`,
    "금지: 폭력/무기/성/도박/정치/투자 표현, 조롱, 단정적 비난, 링크, 해시태그, 이모지.",
    "금지어: 감정 회계, 가성비 최고네요, 독특하네요, 훈훈하다, 선남선녀, 와 진짜, 대박, ㄷㄷ, 저격수, 때려야죠, 죽이네요.",
    "반드시 JSON 한 줄만 출력해라. 형식: {\"context_summary\":\"원문 이해\",\"key_points\":[\"포인트1\",\"포인트2\"],\"reply\":\"댓글\"}",
    extraRule,
    "",
    `원문: ${target.targetText || target.text}`,
  ].filter(Boolean).join("\n");
}

async function syncTerafabxGrokWebState() {
  if (!TERAFABX_GROK_WEB_REFRESH_STATE && fs.existsSync(TERAFABX_GROK_WEB_STATE_PATH)) {
    return { ok: true, skipped: true, statePath: TERAFABX_GROK_WEB_STATE_PATH };
  }

  fs.mkdirSync(path.dirname(TERAFABX_GROK_WEB_STATE_PATH), { recursive: true });
  const result = await execFileOutput(AGENT_BROWSER_BIN, agentBrowserCommandArgs([
    "--cdp",
    String(TERAFABX_GROK_WEB_SOURCE_CDP_PORT),
    "state",
    "save",
    TERAFABX_GROK_WEB_STATE_PATH,
  ]), {
    cwd: __dirname,
    timeout: 45_000,
    maxBuffer: 4 * 1024 * 1024,
  });

  const ok = result.code === 0 && !result.error && fs.existsSync(TERAFABX_GROK_WEB_STATE_PATH);
  if (ok) {
    logEvent("terafabx_grok_web_state_saved", {
      sourceCdpPort: TERAFABX_GROK_WEB_SOURCE_CDP_PORT,
      statePath: TERAFABX_GROK_WEB_STATE_PATH,
    });
    return { ok: true, statePath: TERAFABX_GROK_WEB_STATE_PATH };
  }

  const message = [result.error, result.stderr, result.stdout].filter(Boolean).join("\n").trim() || "agent-browser state save failed";
  if (fs.existsSync(TERAFABX_GROK_WEB_STATE_PATH)) {
    logEvent("terafabx_grok_web_state_refresh_failed_using_existing", {
      sourceCdpPort: TERAFABX_GROK_WEB_SOURCE_CDP_PORT,
      statePath: TERAFABX_GROK_WEB_STATE_PATH,
      error: message.slice(0, 500),
    });
    return { ok: false, fallbackExisting: true, statePath: TERAFABX_GROK_WEB_STATE_PATH, error: message };
  }

  throw new Error(`Grok Web 쿠키 state 저장 실패: ${message}`);
}

async function closeTerafabxGrokWebSession(session = TERAFABX_GROK_WEB_SESSION) {
  return execFileOutput(AGENT_BROWSER_BIN, agentBrowserCommandArgs(["--session", session, "--headed", "false", "close"]), {
    cwd: __dirname,
    timeout: 15_000,
    maxBuffer: 1024 * 1024,
  });
}

function terafabxGrokWebRunId(options = {}) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = String(options.targetId || options.targetUrl || "target").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 80);
  return `${timestamp}-${target}-attempt${Number(options.attempt || 1)}`;
}

async function runGrokWebAgent(prompt, options = {}) {
  if (!fs.existsSync(TERAFABX_GROK_WEB_SCRIPT_PATH)) {
    throw new Error(`Grok Web runner가 없습니다: ${TERAFABX_GROK_WEB_SCRIPT_PATH}`);
  }

  const timeoutMs = Math.max(30_000, Number(options.timeoutMs || TERAFABX_GROK_WEB_TIMEOUT_MS));
  const session = options.session || TERAFABX_GROK_WEB_SESSION;
  await syncTerafabxGrokWebState();

  const runDir = path.join(TERAFABX_GROK_WEB_RUN_DIR, terafabxGrokWebRunId(options));
  fs.mkdirSync(runDir, { recursive: true });
  const promptPath = path.join(runDir, "prompt.md");
  const outPath = path.join(runDir, "grok-response.txt");
  fs.writeFileSync(promptPath, prompt);

  logEvent("terafabx_grok_web_start", {
    targetUrl: options.targetUrl || null,
    attempt: Number(options.attempt || 1),
    session,
    statePath: TERAFABX_GROK_WEB_STATE_PATH,
    runDir,
  });

  const result = await runNodeScript(TERAFABX_GROK_WEB_SCRIPT_PATH, [
    "--prompt",
    promptPath,
    "--out",
    outPath,
    "--state",
    TERAFABX_GROK_WEB_STATE_PATH,
    "--session",
    session,
    "--timeout",
    String(timeoutMs),
    "--url",
    TERAFABX_GROK_WEB_URL,
  ], {
    cwd: __dirname,
    timeoutMs: timeoutMs + 60_000,
  });

  fs.writeFileSync(path.join(runDir, "runner.stdout.txt"), result.stdout || "");
  fs.writeFileSync(path.join(runDir, "runner.stderr.txt"), result.stderr || "");
  if (result.code !== 0 || !fs.existsSync(outPath)) {
    await closeTerafabxGrokWebSession(session).catch(() => {});
    const message = [result.stderr, result.stdout, `exit=${result.code}`].filter(Boolean).join("\n").trim();
    logEvent("terafabx_grok_web_error", {
      targetUrl: options.targetUrl || null,
      attempt: Number(options.attempt || 1),
      runDir,
      error: message.slice(0, 500),
    });
    throw new Error(`Grok Web 호출 실패: ${message}`);
  }

  const raw = fs.readFileSync(outPath, "utf8").trim();
  if (!raw) {
    await closeTerafabxGrokWebSession(session).catch(() => {});
    throw new Error("Grok Web 응답 파일이 비어 있습니다.");
  }
  logEvent("terafabx_grok_web_ok", {
    targetUrl: options.targetUrl || null,
    attempt: Number(options.attempt || 1),
    responseLength: raw.length,
    runDir,
  });
  return raw;
}

async function generateTerafabxReplyWithGrok(target, options = {}) {
  const provider = TERAFABX_GROK_PROVIDER === "cli" ? "cli" : "web";
  logEvent("terafabx_grok_reply_start", { provider, targetUrl: target.url, textLength: String(target.targetText || target.text || "").length });
  const timeoutMs = Number(options.timeoutMs || 90_000);
  const maxAttempts = Math.max(1, Math.min(Number(options.maxAttempts || 2), 2));
  const requireContext = Boolean(options.requireContext);
  for (const [attempt, extraRule] of [
    [1, ""],
    [2, "원문 내용이 민감하거나 판단이 어렵다면 중립적인 짧은 공감 답글을 써라."],
  ].slice(0, maxAttempts)) {
    try {
      const prompt = terafabxReplyPrompt(target, extraRule, "Grok");
      const raw = provider === "web"
        ? await runGrokWebAgent(prompt, {
          attempt,
          targetId: target.targetId,
          targetUrl: target.url,
          timeoutMs: Math.max(timeoutMs, TERAFABX_GROK_WEB_TIMEOUT_MS),
          session: options.session,
        })
        : await runGrokCli(prompt, timeoutMs);
      const result = parseTerafabxGrokResult(raw);
      if (requireContext && !hasDetailedTerafabxGrokContext(result)) {
        throw new Error("Grok 상세 문맥 분석 JSON이 비어 있거나 부족합니다.");
      }
      logEvent("terafabx_grok_reply_ok", { provider, attempt, reply: result.reply, contextPreview: result.contextSummary.slice(0, 240), keyPointCount: result.keyPoints.length });
      return result;
    } catch (error) {
      logEvent("terafabx_grok_reply_attempt_failed", { provider, attempt, error: error.message });
      if (requireContext && provider === "web" && TERAFABX_GEMINI_GENERATION_FALLBACK_ENABLED && isFastFallbackGrokWebError(error)) {
        logEvent("terafabx_grok_reply_fast_gemini_fallback", { targetUrl: target.url, attempt, error: error.message.slice(0, 300) });
        break;
      }
    }
  }
  if (requireContext && provider === "web" && TERAFABX_GEMINI_GENERATION_FALLBACK_ENABLED) {
    for (const attempt of [1, 2].slice(0, maxAttempts)) {
      try {
        const result = await generateTerafabxReplyWithGeminiFallback(target, { attempt });
        logEvent("terafabx_grok_reply_gemini_fallback_ok", {
          targetUrl: target.url,
          attempt,
          reply: result.reply,
          contextPreview: result.contextSummary.slice(0, 240),
          keyPointCount: result.keyPoints.length,
        });
        return result;
      } catch (error) {
        logEvent("terafabx_grok_reply_gemini_fallback_failed", { targetUrl: target.url, attempt, error: error.message });
      }
    }
  }
  const fallback = /\?/.test(String(target.targetText || target.text || ""))
    ? "이 관점은 한번 더 볼 만하네요"
    : "이건 한번 더 생각해볼 만하네요";
  if (requireContext) {
    logEvent("terafabx_grok_reply_required_context_failed", { fallback });
    throw new Error("Grok 상세 문맥 분석 생성 실패");
  }
  logEvent("terafabx_grok_reply_fallback", { fallback });
  return {
    reply: validateTerafabxReply(fallback),
    contextSummary: "Grok 문맥 분석 생성에 실패해 중립 fallback 후보를 사용함.",
    keyPoints: [],
    rawPreview: "",
  };
}

async function postTerafabxReplyViaIntent(page, targetUrl, comment, id) {
  const intentUrl = `https://x.com/intent/tweet?in_reply_to=${encodeURIComponent(id)}&text=${encodeURIComponent(comment)}`;
  await page.navigate(intentUrl, 6000);
  await sleep(900);
  logEvent("terafabx_reply_intent_opened", { targetUrl });
  const clickedPost = await page.eval(`(async () => {
    async function wait(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const buttons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'))
        .filter((el) => el.offsetWidth && el.offsetHeight && !(el.disabled || el.getAttribute("aria-disabled") === "true"));
      const button = buttons.pop();
      if (button) {
        button.click();
        return { clicked: true, text: button.innerText || button.getAttribute("aria-label") || "", attempt };
      }
      await wait(300);
    }
    return { clicked: false };
  })()`);
  if (!clickedPost.clicked) throw new Error("quick intent 답글 게시 버튼을 찾지 못했습니다.");
  logEvent("terafabx_reply_submit_clicked", { targetUrl, button: clickedPost.text, quick: true, mode: "intent" });
  await sleep(1600);
  const verifyNeedle = String(comment).split(/\n+/).map((line) => line.trim()).filter(Boolean).join(" ").slice(0, 64);
  await page.navigate("https://x.com/terafabXai/with_replies", 5000);
  const verify = await page.eval(`(() => {
    const needle = ${JSON.stringify(verifyNeedle)};
    function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
    for (const article of Array.from(document.querySelectorAll("article")).slice(0, 12)) {
      const text = clean(article.innerText || "");
      if (!needle || !text.includes(needle)) continue;
      const href = Array.from(article.querySelectorAll('a[href*="/status/"]'))
        .map((a) => a.href)
        .find((href) => href.includes('/terafabXai/status/') && !href.includes('/analytics'));
      if (href) return { found: true, href: href.split("?")[0], text: text.slice(0, 800), url: location.href };
    }
    return { found: false, url: location.href };
  })()`);
  if (!verify.found || !verify.href) throw new Error(`quick intent 답글 게시 검증 실패: ${JSON.stringify(verify)}`);
  logEvent("terafabx_reply_verified_quick", { targetUrl, replyUrl: verify.href, mode: "intent" });
  return { ok: true, replyUrl: verify.href, verify: { ...verify, quick: true, mode: "intent" } };
}

async function postTerafabxReply(targetUrl, comment, options = {}) {
  if (options.headless) {
    return withTerafabxCommentXLock(options.lockAction || "reply-post", () => postTerafabxReplyUnlocked(targetUrl, comment, options), {
      wait: options.lockWait !== false,
      timeoutMs: Number(options.lockTimeoutMs || 6 * 60 * 1000),
    });
  }
  return postTerafabxReplyUnlocked(targetUrl, comment, options);
}

async function postTerafabxReplyUnlocked(targetUrl, comment, options = {}) {
  logEvent("terafabx_reply_post_start", { targetUrl, comment });
  const id = (targetUrl.match(/status\/(\d+)/) || [])[1] || "";
  const useHeadless = Boolean(options.headless);
  const page = useHeadless
    ? await getTerafabxCommentXHeadlessPage(options.quick && options.validate === false && id ? "https://x.com/home" : targetUrl)
    : (options.quick && options.validate === false && id
      ? await newPage("https://x.com/home")
      : await getExistingXPage(targetUrl));
  try {
    await closeXDialogs(page);
    await verifyXAccount(page);
    if (options.quick && options.validate === false && id) {
      try {
        return await postTerafabxReplyViaIntent(page, targetUrl, comment, id);
      } catch (error) {
        logEvent("terafabx_reply_quick_intent_fallback", { targetUrl, error: error.message });
      }
    }
    await page.navigate(targetUrl, 7500);
    const pre = await page.eval(`(() => {
      const id = ${JSON.stringify(id)};
      const article = document.querySelector("article");
      function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
      const text = article ? clean(article.innerText) : "";
      const replyRestricted = /(일부 계정만 답글|답글을 쓸 수 있습니다|답글을 달 수 없습니다|답글 권한|Who can reply|Only people|Replies are disabled|can reply)/i.test(text);
      const replyDisabled = article ? Array.from(article.querySelectorAll('[data-testid="reply"], button, [role="button"]')).some((el) => /Reply|답글/.test(el.getAttribute("aria-label") || el.innerText || "") && (el.disabled || el.getAttribute("aria-disabled") === "true")) : false;
      return { ok: Boolean(article && Array.from(article.querySelectorAll('a[href*="/status/"]')).some((a) => a.href.includes('/status/' + id))), text: text.slice(0, 900), url: location.href, replyRestricted, replyDisabled };
    })()`);
    if (!pre.ok) {
      if (options.validate === false && pre.text) {
        logEvent("terafabx_reply_target_verify_relaxed", { targetUrl, url: pre.url, textPreview: pre.text.slice(0, 180) });
      } else {
        throw new Error(`target root 검증 실패: ${JSON.stringify(pre)}`);
      }
    }
    if (pre.replyRestricted || pre.replyDisabled || TERAFABX_REPLY_RESTRICTED_RE.test(pre.text)) {
      throw new Error(`답글 제한 글입니다: ${JSON.stringify({ url: pre.url, replyRestricted: pre.replyRestricted, replyDisabled: pre.replyDisabled, textPreview: pre.text.slice(0, 180) })}`);
    }
    logEvent("terafabx_reply_target_verified", { targetUrl, url: pre.url, textPreview: pre.text.slice(0, 180) });
    const clickedReply = await page.eval(`(() => {
      const article = document.querySelector("article");
      const button = article && (article.querySelector('[data-testid="reply"]') || Array.from(article.querySelectorAll('button, [role="button"]')).find((el) => /Reply|답글/.test(el.getAttribute("aria-label") || el.innerText || "")));
      if (!button) return false;
      button.scrollIntoView({ block: "center" });
      button.click();
      return true;
    })()`);
    if (!clickedReply) throw new Error("답글 버튼을 찾지 못했습니다.");
    logEvent("terafabx_reply_button_clicked", { targetUrl });
    await sleep(options.quick ? 450 : 1400);
    const focused = await page.eval(`(() => {
      const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter((el) => el.offsetWidth && el.offsetHeight);
      const editor = editors.pop();
      if (!editor) return false;
      editor.scrollIntoView({ block: "center" });
      editor.click();
      editor.focus();
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand("delete");
      return true;
    })()`);
    if (!focused) throw new Error("답글 입력창을 찾지 못했습니다.");
    await page.send("Input.insertText", { text: comment });
    await sleep(700);
    let typed = await page.eval(`(() => {
      const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter((el) => el.offsetWidth && el.offsetHeight);
      const editor = editors.pop();
      return editor ? (editor.innerText || editor.textContent || "") : "";
    })()`);
    if (cleanSocialText(typed) !== cleanSocialText(comment)) {
      typed = await page.eval(`((comment) => {
        const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter((el) => el.offsetWidth && el.offsetHeight);
        const editor = editors.pop();
        if (!editor) return "";
        editor.focus();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("delete");
        document.execCommand("insertText", false, comment);
        editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: comment }));
        return editor.innerText || editor.textContent || "";
      })(${JSON.stringify(comment)})`);
      await sleep(options.quick ? 250 : 700);
    }
    if (cleanSocialText(typed) !== cleanSocialText(comment)) {
      if (options.validate === false) {
        logEvent("terafabx_reply_text_mismatch_ignored", { targetUrl, expected: comment, typed });
      } else {
        throw new Error(`입력 텍스트 불일치: ${typed}`);
      }
    }
    await page.eval(`(() => {
      const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter((el) => el.offsetWidth && el.offsetHeight);
      const editor = editors.pop();
      if (!editor) return false;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: editor.innerText || editor.textContent || "" }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`).catch(() => false);
    logEvent("terafabx_reply_text_typed", { targetUrl, comment });
    if (options.validate !== false) validateTerafabxReply(typed);
    let clickedPost = await page.eval(`(async () => {
      async function wait(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }
      function visible(el) {
        const rect = el && el.getBoundingClientRect();
        const style = el && getComputedStyle(el);
        return Boolean(rect && rect.width && rect.height && style.visibility !== "hidden" && style.display !== "none");
      }
      function enabled(el) {
        return visible(el) && !(el.disabled || el.getAttribute("aria-disabled") === "true");
      }
      function buttonText(el) {
        return (el?.innerText || el?.getAttribute("aria-label") || el?.getAttribute("data-testid") || "").trim();
      }
      function isSubmitButton(el) {
        const testid = el.getAttribute("data-testid") || "";
        const text = buttonText(el).replace(/\\s+/g, " ");
        return /^(tweetButton|tweetButtonInline)$/.test(testid)
          || /^(답글|게시|Post|Reply|Tweet)$/i.test(text);
      }
      function findSubmitButton() {
        const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter(visible);
        const editor = editors.pop();
        const scope = editor?.closest('[role="dialog"], [data-testid="sheetDialog"], article, main') || document;
        const scopedButtons = Array.from(scope.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"], button, [role="button"]'));
        const globalButtons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'));
        return [...scopedButtons, ...globalButtons]
          .filter(enabled)
          .find(isSubmitButton);
      }
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const button = findSubmitButton();
        if (button) {
          button.click();
          return { clicked: true, text: button.innerText || button.getAttribute("aria-label") || "", attempt };
        }
        await wait(500);
      }
      const editor = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter(visible).pop();
      if (editor) {
        editor.focus();
        editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", metaKey: true, ctrlKey: true }));
        editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", metaKey: true, ctrlKey: true }));
        await wait(1200);
      }
      return {
        clicked: false,
        keyboardFallbackAttempted: Boolean(editor),
        candidates: Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => ({
          text: el.innerText || "",
          label: el.getAttribute("aria-label") || "",
          testid: el.getAttribute("data-testid") || "",
          disabled: Boolean(el.disabled || el.getAttribute("aria-disabled") === "true"),
        })).slice(-12),
      };
    })()`);
    if (!clickedPost.clicked) {
      logEvent("terafabx_reply_submit_not_found", {
        targetUrl,
        weightedLength: xWeightedLength(comment),
        length: [...String(comment || "")].length,
        candidates: clickedPost.candidates,
      });
      if (id) {
        const intentUrl = `https://x.com/intent/tweet?in_reply_to=${encodeURIComponent(id)}&text=${encodeURIComponent(comment)}`;
        logEvent("terafabx_reply_submit_intent_fallback_start", { targetUrl, validate: options.validate !== false });
        await page.navigate(intentUrl, 8000);
        await sleep(1800);
        clickedPost = await page.eval(`(async () => {
          async function wait(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }
          function visible(el) {
            const rect = el && el.getBoundingClientRect();
            const style = el && getComputedStyle(el);
            return Boolean(rect && rect.width && rect.height && style.visibility !== "hidden" && style.display !== "none");
          }
          function enabled(el) {
            return visible(el) && !(el.disabled || el.getAttribute("aria-disabled") === "true");
          }
          function buttonText(el) {
            return (el?.innerText || el?.getAttribute("aria-label") || el?.getAttribute("data-testid") || "").trim();
          }
          function isSubmitButton(el) {
            const testid = el.getAttribute("data-testid") || "";
            const text = buttonText(el).replace(/\\s+/g, " ");
            return /^(tweetButton|tweetButtonInline)$/.test(testid)
              || /^(답글|게시|Post|Reply|Tweet)$/i.test(text);
          }
          function findSubmitButton() {
            const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter(visible);
            const editor = editors.pop();
            const scope = editor?.closest('[role="dialog"], [data-testid="sheetDialog"], article, main') || document;
            const scopedButtons = Array.from(scope.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"], button, [role="button"]'));
            const globalButtons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'));
            return [...scopedButtons, ...globalButtons]
              .filter(enabled)
              .find(isSubmitButton);
          }
          for (let attempt = 0; attempt < 18; attempt += 1) {
            const button = findSubmitButton();
            if (button) {
              button.click();
              return { clicked: true, text: button.innerText || button.getAttribute("aria-label") || "", attempt, fallback: "intent" };
            }
            await wait(500);
          }
          const editor = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter(visible).pop();
          if (editor) {
            editor.focus();
            editor.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", code: "Enter", metaKey: true, ctrlKey: true }));
            editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter", code: "Enter", metaKey: true, ctrlKey: true }));
            await wait(1200);
          }
          return {
            clicked: false,
            fallback: "intent",
            keyboardFallbackAttempted: Boolean(editor),
            candidates: Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => ({
              text: el.innerText || "",
              label: el.getAttribute("aria-label") || "",
              testid: el.getAttribute("data-testid") || "",
              disabled: Boolean(el.disabled || el.getAttribute("aria-disabled") === "true"),
            })).slice(-12),
          };
        })()`);
      }
      if (!clickedPost.clicked) throw new Error("활성화된 답글 게시 버튼을 찾지 못했습니다.");
    }
    logEvent("terafabx_reply_submit_clicked", { targetUrl, button: clickedPost.text });
    if (options.quick) {
      await sleep(1200);
      const quickNeedle = String(comment).split(/\n+/).map((line) => line.trim()).filter(Boolean).join(" ").slice(0, 64);
      const quickVerify = await page.eval(`(() => {
        const needle = ${JSON.stringify(quickNeedle)};
        function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
        const articles = Array.from(document.querySelectorAll("article"));
        for (const article of articles) {
          const text = clean(article.innerText || "");
          if (!needle || !text.includes(needle)) continue;
          const href = Array.from(article.querySelectorAll('a[href*="/status/"]'))
            .map((a) => a.href)
            .find((href) => href.includes('/terafabXai/status/') && !href.includes('/analytics'));
          if (href) return { found: true, href: href.split("?")[0], text: text.slice(0, 500), url: location.href };
        }
        return { found: false, href: null, url: location.href };
      })()`).catch((error) => ({ found: false, error: error.message }));
      if (quickVerify.found && quickVerify.href) {
        logEvent("terafabx_reply_verified_quick", { targetUrl, replyUrl: quickVerify.href });
        return { ok: true, replyUrl: quickVerify.href, verify: { ...quickVerify, quick: true } };
      }
      logEvent("terafabx_reply_quick_verify_miss", { targetUrl, quickVerify });
    }
    await sleep(options.quick ? 1500 : 5000);
    logEvent("terafabx_reply_verify_start", { targetUrl });
    const verifyNeedle = options.validate === false
      ? String(comment).split(/\n+/).map((line) => line.trim()).filter(Boolean).join(" ").slice(0, 48)
      : comment;
    let verify = { found: false, url: "https://x.com/terafabXai/with_replies" };
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await page.navigate("https://x.com/terafabXai/with_replies", 7000);
      verify = await page.eval(`(() => {
        const want = ${JSON.stringify(comment)};
        const needle = ${JSON.stringify(verifyNeedle)};
        function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
        for (const article of Array.from(document.querySelectorAll("article"))) {
          const text = clean(article.innerText || "");
          if (text.includes(want) || (needle && text.includes(needle))) {
            const href = Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.href).find((href) => href.includes('/terafabXai/status/'));
            return { found: true, href: href ? href.split("?")[0] : null, text: text.slice(0, 800), url: location.href };
          }
        }
        return { found: false, url: location.href };
      })()`);
      if (verify.found && verify.href) break;
      if (attempt < 4) {
        logEvent("terafabx_reply_verify_retry", { targetUrl, attempt, verify });
        await sleep(3500);
      }
    }
    if (!verify.found || !verify.href) {
      const replyPageVerify = await page.eval(`(() => {
        const requiredHandle = ${JSON.stringify(REQUIRED_X_HANDLE)};
        const title = String(document.title || "");
        const ownStatusHref = Array.from(document.querySelectorAll('article a[href*="/status/"]'))
          .map((a) => a.href)
          .find((href) => href.includes('/' + requiredHandle + '/status/') && !href.includes('/analytics'));
        const titleLooksLikeOwnReply = title.includes('@' + requiredHandle) && /답글|replied/i.test(title);
        return {
          found: Boolean(titleLooksLikeOwnReply && ownStatusHref),
          href: ownStatusHref ? ownStatusHref.split("?")[0] : null,
          title,
          url: location.href,
        };
      })()`).catch((error) => ({ found: false, href: null, error: error.message }));
      if (replyPageVerify.found && replyPageVerify.href) {
        logEvent("terafabx_reply_verified_reply_page", { targetUrl, replyUrl: replyPageVerify.href, verify: replyPageVerify });
        return { ok: true, replyUrl: replyPageVerify.href, verify: { ...replyPageVerify, replyPageFallback: true } };
      }
      if (options.validate === false) {
        const fallbackHref = await page.eval(`(() => {
          const href = Array.from(document.querySelectorAll('article a[href*="/status/"]'))
            .map((a) => a.href)
            .find((href) => href.includes('/terafabXai/status/') && !href.includes('/analytics'));
          return href ? href.split("?")[0] : null;
        })()`).catch(() => null);
        const replyUrl = fallbackHref || targetUrl;
        logEvent("terafabx_reply_verify_relaxed", { targetUrl, replyUrl, verify });
        return { ok: true, replyUrl, verify: { ...verify, relaxed: true } };
      }
      throw new Error(`답글 게시 검증 실패: ${JSON.stringify(verify)}`);
    }
    logEvent("terafabx_reply_verified", { targetUrl, replyUrl: verify.href });
    return { ok: true, replyUrl: verify.href, verify };
  } finally {
    logEvent("terafabx_reply_page_close_start", { targetUrl });
    await page.close();
    if (useHeadless && options.cleanupHeadless !== false) {
      const cleanup = await closeTerafabxCommentXHeadlessBrowser().catch((error) => ({ error: error.message }));
      logEvent("terafabx_reply_headless_cleanup", { targetUrl, cleanup });
    }
    logEvent("terafabx_reply_page_closed", { targetUrl });
  }
}

async function buildTerafabxPreparedCommentRecord(target, options = {}) {
  const worker = Math.max(0, Number(options.workerIndex || 0));
  const chromePort = Number(options.chromePort || (TERAFABX_COMMENT_PREFILL_GEMINI_PORT_BASE + worker));
  const profileDir = options.profileDir || `${TERAFABX_GEMINI_PROFILE_DIR}-comment-prefill-${worker + 1}`;
  const geminiOptions = options.parallel
    ? { chromePort, profileDir }
    : {};
  const grokResult = await generateTerafabxReplyWithGeminiFallback(target, { attempt: 1, ...geminiOptions });
  logEvent("terafabx_comment_gemini_direct", {
    targetUrl: target.url,
    reply: grokResult.reply,
    contextPreview: grokResult.contextSummary.slice(0, 240),
    keyPointCount: grokResult.keyPoints.length,
    workerIndex: worker,
    port: geminiOptions.chromePort || TERAFABX_GEMINI_CHROME_PORT,
  });
  const grokComment = normalizeTerafabxGrokResult(grokResult).reply;
  let geminiReview;
  let comment;
  try {
    geminiReview = await reviewTerafabxReplyWithGemini(target, grokResult, geminiOptions);
    comment = validateTerafabxReply(geminiReview.finalReply);
  } catch (reviewError) {
    comment = validateTerafabxReply(grokComment);
    geminiReview = {
      usedGemini: true,
      score: null,
      decision: "fallback_to_grok",
      reason: "Gemini review output failed local validation; using validated Grok/Gemini generation candidate.",
      fallback: true,
      error: reviewError.message,
    };
    logEvent("terafabx_comment_review_fallback_to_grok", { targetUrl: target.url, error: reviewError.message, comment, workerIndex: worker });
  }
  return {
    at: new Date().toISOString(),
    targetUrl: target.url,
    targetId: target.targetId,
    targetText: target.targetText,
    comment,
    grokComment,
    grokContext: terafabxGrokContextForRecord(grokResult),
    geminiReview: {
      used: Boolean(geminiReview.usedGemini),
      score: geminiReview.score ?? null,
      decision: geminiReview.decision || null,
      reason: geminiReview.reason || null,
      fallback: Boolean(geminiReview.fallback),
      error: geminiReview.error || null,
    },
    replyUrl: null,
    generator: geminiReview.usedGemini ? `${grokResult.provider || terafabxGrokGeneratorLabel()}+gemini-web-headless` : (grokResult.provider || terafabxGrokGeneratorLabel()),
    manual: Boolean(options.manual),
    source: options.source || "comment",
  };
}

async function runTerafabxCommentOnce({ manual = false } = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  terafabxBusy = true;
  const startedAt = new Date().toISOString();
  try {
      const target = await discoverTerafabxCommentTarget();
      const record = await buildTerafabxPreparedCommentRecord(target, { manual });
      const comment = record.comment;
      if (!manual && isTerafabxQuietPostingTime()) {
        return { ok: true, action: "comment", deferred: true, quietUntil: nextTerafabxQuietPostingEnd(), ...enqueueTerafabxPendingCommentPost(record) };
      }
      const posted = await postTerafabxReply(target.url, comment, { headless: true });
      const previous = loadTerafabxState();
      record.replyUrl = posted.replyUrl;
      const nextHistory = [record, ...(previous.commentHistory || [])].slice(0, 100);
      const seenTargets = Array.from(new Set([target.url, ...(previous.seenTargets || [])])).slice(0, 300);
      saveTerafabxState({ lastCommentRunAt: record.at, lastCommentStartedAt: startedAt, lastCommentStatus: "ok", lastCommentError: null, lastComment: comment, lastCommentTarget: target.url, lastReplyUrl: posted.replyUrl, commentHistory: nextHistory, seenTargets });
      logEvent("terafabx_comment_posted", record);
      return { ok: true, action: "comment", ...record };
  } catch (error) {
    saveTerafabxState({ lastCommentRunAt: new Date().toISOString(), lastCommentStartedAt: startedAt, lastCommentStatus: "error", lastCommentError: error.message });
    logEvent("terafabx_comment_error", { error: error.message });
    throw error;
  } finally {
    terafabxBusy = false;
  }
}

function validateAffiliateTargetUrl(value) {
  const url = String(value || "").trim();
  if (!/^https:\/\/(x\.com|twitter\.com)\/[^/]+\/status\/\d+/i.test(url)) {
    throw new Error("대상은 X 게시글 URL이어야 합니다.");
  }
  return url.split("?")[0];
}

function validateAffiliateComment(comment, link) {
  const text = String(comment || "").trim();
  if (!text) throw new Error("댓글 본문이 비어 있습니다.");
  if (!/^https?:\/\/\S+/i.test(String(link || "").trim())) throw new Error("쿠팡 파트너스 링크를 입력해 주세요.");
  if (!text.includes(String(link).trim())) throw new Error("댓글 본문에 쿠팡 파트너스 링크가 포함되어야 합니다.");
  if (!/쿠팡\s*파트너스|수수료|파트너스\s*활동/i.test(text)) {
    throw new Error("댓글 본문에 쿠팡 파트너스 고지 문구가 필요합니다.");
  }
  const xLength = xWeightedLength(text.replace(/https?:\/\/\S+/g, "https://t.co/1234567890"));
  if (xLength > 280) throw new Error(`X 댓글 길이 초과: ${xLength}/280`);
  return text;
}

function coupangSignedAuthorization(method, requestPath, query = "") {
  if (!COUPANG_PARTNERS_ACCESS_KEY || !COUPANG_PARTNERS_SECRET_KEY) {
    throw new Error("쿠팡 파트너스 API 키가 필요합니다. COUPANG_PARTNERS_ACCESS_KEY / COUPANG_PARTNERS_SECRET_KEY를 설정해 주세요.");
  }
  const signedDate = new Date().toISOString().replace(/^20(\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d).*$/, "$1$2$3T$4$5$6Z");
  const message = `${signedDate}${method.toUpperCase()}${requestPath}${query}`;
  const signature = crypto.createHmac("sha256", COUPANG_PARTNERS_SECRET_KEY).update(message).digest("hex");
  return `CEA algorithm=HmacSHA256,access-key=${COUPANG_PARTNERS_ACCESS_KEY},signed-date=${signedDate},signature=${signature}`;
}

async function callCoupangPartnersApi(method, requestPath, { query = "", body = null } = {}) {
  const url = `${COUPANG_PARTNERS_BASE_URL}${requestPath}${query ? `?${query}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: {
      authorization: coupangSignedAuthorization(method, requestPath, query),
      "content-type": "application/json;charset=UTF-8",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || (data.rCode && data.rCode !== "0")) {
    throw new Error(`쿠팡 파트너스 API 실패: HTTP ${response.status} ${data.rMessage || data.message || text}`);
  }
  return data;
}

function fallbackAffiliateKeyword(text = "") {
  const compact = String(text || "").replace(/\s+/g, " ");
  if (/초음파|태아|아기|임신|출산|신생아|육아/.test(compact)) return "초음파 사진 액자";
  const words = compact
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => [...word].length >= 2 && !/^(https?|www|com|ㅋㅋ|ㅎㅎ|진짜|댓글|게시물|사진|영상)$/i.test(word));
  return words.slice(0, 3).join(" ") || "육아 선물";
}

async function generateCoupangSearchKeyword(row) {
  const text = String(row?.textPreview || "");
  return fallbackAffiliateKeyword(text);
}

function scoreCoupangProduct(product, keyword, index) {
  const name = String(product.productName || "");
  const keywordTerms = String(keyword || "").split(/\s+/).filter(Boolean);
  const overlap = keywordTerms.reduce((total, term) => total + (name.includes(term) ? 1 : 0), 0);
  const price = Number(product.productPrice || 0);
  const priceScore = price >= 5000 && price <= 80000 ? 8 : price > 0 ? 3 : 0;
  const rocketScore = product.isRocket ? 6 : 0;
  return overlap * 12 + priceScore + rocketScore + Math.max(0, 10 - index);
}

async function searchBestCoupangProduct(keyword) {
  const requestPath = "/v2/providers/affiliate_open_api/apis/openapi/v1/products/search";
  const query = new URLSearchParams({ keyword, limit: "10", imageSize: "230x230" }).toString();
  const data = await callCoupangPartnersApi("GET", requestPath, { query });
  const products = data?.data?.productData || [];
  if (!products.length) throw new Error(`쿠팡 상품 검색 결과가 없습니다: ${keyword}`);
  return products
    .map((product, index) => ({ ...product, affiliateScore: scoreCoupangProduct(product, keyword, index) }))
    .sort((a, b) => b.affiliateScore - a.affiliateScore)[0];
}

async function createCoupangDeepLink(productUrl) {
  if (/^https:\/\/link\.coupang\.com\//i.test(String(productUrl || ""))) return productUrl;
  const requestPath = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";
  try {
    const data = await callCoupangPartnersApi("POST", requestPath, {
      body: { coupangUrls: [productUrl], subId: COUPANG_PARTNERS_SUB_ID },
    });
    const item = data?.data?.[0] || {};
    return item.shortenUrl || item.landingUrl || item.originalUrl || productUrl;
  } catch (error) {
    logEvent("coupang_deeplink_fallback", { error: error.message });
    return productUrl;
  }
}

function buildCoupangAffiliateReply(link) {
  return [
    "게시물은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.",
    link,
  ].join("\n");
}

function formatCoupangDate(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replace(/-/g, "");
}

function parseCoupangDate(value) {
  const text = String(value || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(text)) return "";
  return text;
}

function defaultCoupangReportRange() {
  const now = new Date();
  const today = formatCoupangDate(now);
  const monthStart = `${today.slice(0, 6)}01`;
  return { startDate: monthStart, endDate: today };
}

function normalizeCoupangPerformanceRows(rows = []) {
  return rows.map((row) => {
    const click = Number(row.click || 0);
    const order = Number(row.order || 0);
    const cancel = Number(row.cancel || 0);
    const gmv = Number(row.gmv || 0);
    const commission = Number(row.commission || 0);
    return {
      date: String(row.date || ""),
      trackingCode: row.trackingCode || "",
      subId: row.subId || "",
      click,
      order,
      cancel,
      gmv,
      commission,
      conversionRate: click > 0 ? order / click : 0,
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

async function getCoupangPerformanceData(options = {}) {
  const defaults = defaultCoupangReportRange();
  const startDate = parseCoupangDate(options.startDate) || defaults.startDate;
  const endDate = parseCoupangDate(options.endDate) || defaults.endDate;
  const requestPath = "/v2/providers/affiliate_open_api/apis/openapi/v1/reports/commission";
  const query = new URLSearchParams({ startDate, endDate }).toString();
  const data = await callCoupangPartnersApi("GET", requestPath, { query });
  const rows = normalizeCoupangPerformanceRows(data?.data || []);
  const totals = rows.reduce((acc, row) => {
    acc.click += row.click;
    acc.order += row.order;
    acc.cancel += row.cancel;
    acc.gmv += row.gmv;
    acc.commission += row.commission;
    return acc;
  }, { click: 0, order: 0, cancel: 0, gmv: 0, commission: 0 });
  totals.conversionRate = totals.click > 0 ? totals.order / totals.click : 0;
  const latest = rows.slice().reverse().find((row) => row.click || row.order || row.commission) || rows.at(-1) || null;
  return {
    ok: true,
    startDate,
    endDate,
    currency: "KRW",
    totals,
    latest,
    rows,
    fetchedAt: new Date().toISOString(),
  };
}

async function postTerafabxAffiliateComment(payload = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  const state = loadTerafabxState();
  const targetUrl = validateAffiliateTargetUrl(payload.targetUrl || state.affiliateDefaultTargetUrl);
  const link = String(payload.link || state.affiliateDefaultLink || "").trim();
  const comment = validateAffiliateComment(payload.comment || buildDefaultAffiliateComment(link), link);
  terafabxBusy = true;
  try {
    const posted = await postTerafabxReply(targetUrl, comment, { validate: false, headless: true });
    const previous = loadTerafabxState();
    const record = {
      at: new Date().toISOString(),
      targetUrl,
      comment,
      link,
      replyUrl: posted.replyUrl,
      manual: true,
      generator: "affiliate-manual",
    };
    saveTerafabxState({
      affiliateDefaultTargetUrl: targetUrl,
      affiliateDefaultLink: link,
      affiliateDefaultComment: comment,
      lastAffiliateRunAt: record.at,
      lastAffiliateStatus: "ok",
      lastAffiliateError: null,
      affiliateHistory: [record, ...(previous.affiliateHistory || [])].slice(0, 50),
      commentHistory: [record, ...(previous.commentHistory || [])].slice(0, 100),
    });
    logEvent("terafabx_affiliate_comment_posted", record);
    return { ok: true, action: "affiliate-comment", ...record };
  } catch (error) {
    saveTerafabxState({
      affiliateDefaultTargetUrl: targetUrl,
      affiliateDefaultLink: link,
      affiliateDefaultComment: comment,
      lastAffiliateRunAt: new Date().toISOString(),
      lastAffiliateStatus: "error",
      lastAffiliateError: error.message,
    });
    logEvent("terafabx_affiliate_comment_error", { targetUrl, error: error.message });
    throw error;
  } finally {
    terafabxBusy = false;
  }
}

async function findPostedXTargetForDiscoveryRow(row) {
  const completed = findCompletedMirror(row.canonicalUrl);
  if (completed?.postUrl) return completed.postUrl;
  const postUrl = await findOwnXPostByText(row.textPreview || "");
  if (!postUrl) throw new Error("게시된 X 글 URL을 찾지 못했습니다. X 게시 직후 히스토리에 postUrl이 없으면 with_replies에서 본문으로 복구합니다.");
  if (completed) recordCompletedMirror({ ...completed, canonicalUrl: row.canonicalUrl, postUrl });
  return postUrl;
}

async function postDiscoveryCoupangAffiliateReply(canonicalUrl) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  const row = await getDiscoveryRow(canonicalUrl);
  if (!row) throw new Error("대시보드 행을 찾지 못했습니다.");
  const dashboardRow = dashboardDiscoveryRow(row);
  if (dashboardRow.status !== "posted") throw new Error("쿠팡 파트너스 댓글은 게시됨 글에서만 실행할 수 있습니다.");
  const targetUrl = await findPostedXTargetForDiscoveryRow(dashboardRow);
  const keyword = await generateCoupangSearchKeyword(dashboardRow);
  const product = await searchBestCoupangProduct(keyword);
  const productUrl = product.productUrl || product.productUrlPC || product.productUrlMobile;
  if (!productUrl) throw new Error("선택된 쿠팡 상품에 상품 URL이 없습니다.");
  const link = await createCoupangDeepLink(productUrl);
  const comment = validateAffiliateComment(buildCoupangAffiliateReply(link), link);
  const result = await postTerafabxAffiliateComment({ targetUrl, link, comment });
  logEvent("discovery_coupang_affiliate_reply_done", {
    canonicalUrl,
    targetUrl,
    keyword,
    productName: product.productName || "",
    productPrice: product.productPrice || null,
    link,
    replyUrl: result.replyUrl,
  });
  return {
    canonicalUrl,
    targetUrl,
    keyword,
    product: {
      productName: product.productName || "",
      productPrice: product.productPrice || null,
      productImage: product.productImage || "",
      isRocket: Boolean(product.isRocket),
      score: product.affiliateScore,
    },
    link,
    comment,
    replyUrl: result.replyUrl,
  };
}

async function runTerafabxCommentPrefillQueue({ manual = false, targetCount = TERAFABX_COMMENT_PREFILL_TARGET, concurrency = TERAFABX_COMMENT_PREFILL_CONCURRENCY } = {}) {
  if (terafabxCommentPrefillBusy) {
    logEvent("terafabx_comment_prefill_skip_busy", { manual });
    return { ok: true, action: "comment-prefill", skipped: "busy" };
  }
  if (!manual && terafabxManualActionPending) {
    logEvent("terafabx_comment_prefill_skip_manual_pending", { manual });
    return { ok: true, action: "comment-prefill", skipped: "manual_pending" };
  }
  if (terafabxBusy) {
    logEvent("terafabx_comment_prefill_skip_main_busy", { manual });
    return { ok: true, action: "comment-prefill", skipped: "main_busy" };
  }
  if (isTerafabxQuietPostingTime()) {
    logEvent("terafabx_comment_prefill_quiet_continue", { quietUntil: nextTerafabxQuietPostingEnd() });
  }
  terafabxCommentPrefillBusy = true;
  const startedAt = new Date().toISOString();
  try {
    const currentPending = pendingTerafabxCommentPosts();
    const target = Math.max(0, Number(targetCount || 0));
    const missing = Math.max(0, target - currentPending.length);
    const workerCount = Math.max(1, Math.min(Number(concurrency || 1), missing));
    logEvent("terafabx_comment_prefill_start", { manual, pendingCount: currentPending.length, targetCount: target, missing, concurrency: workerCount });
    if (missing <= 0) return { ok: true, action: "comment-prefill", queued: 0, pendingCount: currentPending.length };
    const targets = await discoverTerafabxCommentTargets(missing);
    const selected = targets.slice(0, missing);
    const results = await Promise.all(selected.map(async (targetItem, index) => {
      try {
        const workerIndex = index % workerCount;
        const record = await buildTerafabxPreparedCommentRecord(targetItem, {
          manual,
          parallel: true,
          workerIndex,
          source: "prefill",
        });
        const queued = enqueueTerafabxPendingCommentPost(record, {
          updateLastRun: false,
          eventType: "terafabx_comment_prefill_queued",
          source: "prefill",
        });
        if (queued.skipped) return { ok: false, skipped: true, targetUrl: queued.targetUrl, reason: queued.reason, workerIndex };
        return { ok: true, targetUrl: queued.targetUrl, comment: queued.comment, workerIndex };
      } catch (error) {
        logEvent("terafabx_comment_prefill_item_error", { targetUrl: targetItem.url, error: error.message, workerIndex: index % workerCount });
        return { ok: false, targetUrl: targetItem.url, error: error.message };
      }
    }));
    const queued = results.filter((item) => item.ok);
    const failed = results.filter((item) => !item.ok);
    logEvent("terafabx_comment_prefill_done", { startedAt, requested: missing, selected: selected.length, queued: queued.length, failed: failed.length, pendingCount: pendingTerafabxCommentPosts().length });
    return { ok: failed.length === 0, action: "comment-prefill", requested: missing, selected: selected.length, queued, failed, pendingCount: pendingTerafabxCommentPosts().length };
  } catch (error) {
    logEvent("terafabx_comment_prefill_error", { startedAt, error: error.message });
    return { ok: false, action: "comment-prefill", error: error.message };
  } finally {
    terafabxCommentPrefillBusy = false;
  }
}

function maybeStartTerafabxCommentPrefill(reason = "tick") {
  const state = loadTerafabxState();
  if (!state.commentEnabled) return;
  if (terafabxManualActionPending) return;
  const pendingCount = pendingTerafabxCommentPosts(state).length;
  if (pendingCount >= TERAFABX_COMMENT_PREFILL_TARGET) return;
  if (terafabxCommentPrefillBusy) return;
  setTimeout(() => {
    runTerafabxCommentPrefillQueue({ manual: false })
      .then((result) => logEvent("terafabx_comment_prefill_background_done", { reason, ...result }))
      .catch((error) => logEvent("terafabx_comment_prefill_background_error", { reason, error: error.message }));
  }, 0);
}

async function runTerafabxPendingCommentPosts({ manual = false, limit = 5 } = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  if (!manual && isTerafabxQuietPostingTime()) {
    const pendingCount = pendingTerafabxCommentPosts().length;
    logEvent("terafabx_pending_comment_quiet_skip", { pendingCount, quietUntil: nextTerafabxQuietPostingEnd() });
    return { ok: true, action: "pending-comment", deferred: true, pendingCount, quietUntil: nextTerafabxQuietPostingEnd() };
  }
  terafabxBusy = true;
  try {
      const candidates = pendingTerafabxCommentPosts().slice(0, Math.max(0, Number(limit || 0)) || 5);
      const posted = [];
      const failed = [];
      logEvent("terafabx_pending_comment_post_start", { count: candidates.length, manual });
      for (let index = 0; index < candidates.length; index += 1) {
        const record = candidates[index];
        const targetUrl = normalizeXStatusUrl(record.targetUrl || "");
        const startedAt = new Date().toISOString();
        try {
          const comment = validateTerafabxReply(record.comment);
          logEvent("terafabx_pending_comment_post_item_start", { index: index + 1, total: candidates.length, targetUrl });
          const result = await postTerafabxReply(targetUrl, comment, { headless: true });
          const at = new Date().toISOString();
          const previous = loadTerafabxState();
          const historyRecord = { ...record, at, targetUrl, comment, replyUrl: result.replyUrl, manual, deferred: true, posted: true, status: "posted", postedAt: at };
          const nextHistory = [historyRecord, ...(previous.commentHistory || [])].slice(0, 200);
          const seenTargets = Array.from(new Set([targetUrl, ...(previous.seenTargets || [])])).slice(0, 500);
          removeTerafabxPendingCommentPost(targetUrl);
          saveTerafabxState({
            lastCommentRunAt: at,
            lastCommentStartedAt: startedAt,
            lastCommentStatus: "ok",
            lastCommentError: null,
            lastComment: comment,
            lastCommentTarget: targetUrl,
            lastReplyUrl: result.replyUrl,
            commentHistory: nextHistory,
            seenTargets,
          });
          posted.push({ targetUrl, replyUrl: result.replyUrl, comment, at });
          logEvent("terafabx_pending_comment_post_item_done", { index: index + 1, total: candidates.length, targetUrl, replyUrl: result.replyUrl });
        } catch (error) {
          const previous = loadTerafabxState();
          const failedAt = new Date().toISOString();
          let failedRecord = null;
          const pending = pendingTerafabxCommentPosts(previous).flatMap((item) => {
            if (normalizeXStatusUrl(item.targetUrl || "") !== targetUrl) return [item];
            const attempts = Number(item.attempts || 0) + 1;
            const nextItem = { ...item, attempts, lastError: error.message, lastAttemptAt: failedAt, updatedAt: failedAt };
            if (attempts >= TERAFABX_PENDING_COMMENT_MAX_ATTEMPTS) {
              failedRecord = { ...nextItem, status: "error", errorAt: failedAt, failedReason: "max_attempts" };
              return [];
            }
            return [nextItem];
          });
          const failedPendingCommentPosts = failedRecord
            ? [failedRecord, ...(previous.failedPendingCommentPosts || [])].slice(0, 100)
            : (previous.failedPendingCommentPosts || []);
          saveTerafabxState({
            pendingCommentPosts: pending,
            failedPendingCommentPosts,
            lastCommentRunAt: failedAt,
            lastCommentStartedAt: startedAt,
            lastCommentStatus: "error",
            lastCommentError: error.message,
            lastCommentTarget: targetUrl,
          });
          failed.push({ targetUrl, error: error.message });
          logEvent("terafabx_pending_comment_post_item_error", {
            index: index + 1,
            total: candidates.length,
            targetUrl,
            error: error.message,
            removedFromPending: Boolean(failedRecord),
            maxAttempts: TERAFABX_PENDING_COMMENT_MAX_ATTEMPTS,
          });
          break;
        }
      }
      logEvent("terafabx_pending_comment_post_done", { requested: candidates.length, posted: posted.length, failed: failed.length, remaining: pendingTerafabxCommentPosts().length });
      return { ok: failed.length === 0, action: "pending-comment", requested: candidates.length, posted, failed, remaining: pendingTerafabxCommentPosts().length };
  } finally {
    terafabxBusy = false;
  }
}

function assessTerafabxCommentReviewRecord(record, minScore = TERAFABX_REVIEW_COMMENT_MIN_SCORE) {
  const errors = [];
  const targetUrl = normalizeXStatusUrl(record?.targetUrl || "");
  const handle = String(record?.follower?.handle || "").replace(/^@/, "");
  if (!targetUrl || !parseXStatusUrl(targetUrl)) errors.push("invalid_target_url");
  if (handle && !isXStatusUrlForHandle(targetUrl, handle)) errors.push("target_handle_mismatch");
  if (!record?.comment) {
    errors.push("missing_comment");
  } else {
    try {
      validateTerafabxReply(record.comment);
    } catch (error) {
      errors.push(`invalid_comment:${error.message}`);
    }
  }
  const score = Number(record?.geminiReview?.score);
  if (!Number.isFinite(score)) errors.push("missing_gemini_score");
  else if (score < minScore) errors.push(`low_gemini_score:${score}`);
  if (record?.geminiReview?.fallback) errors.push("gemini_fallback");
  const relationshipText = [record?.follower?.text, record?.targetText].filter(Boolean).join(" ");
  if (record?.follower?.followsMe !== true && !terafabxProfileTextShowsFollowsMe(relationshipText)) {
    errors.push("not_follower");
  }
  if (record?.posted || record?.replyUrl) errors.push("already_posted");
  return {
    ok: errors.length === 0,
    errors,
    score: Number.isFinite(score) ? score : null,
    targetUrl,
    handle,
  };
}

function removeTerafabxCommentReviewFromQueue(targetUrl) {
  const normalized = normalizeXStatusUrl(targetUrl);
  const rows = loadTerafabxCommentReviewQueue();
  const next = rows.filter((item) => normalizeXStatusUrl(item.targetUrl || "") !== normalized);
  saveTerafabxCommentReviewQueue(next);
  return { before: rows.length, after: next.length };
}

function findTerafabxCommentReviewRecord(identifier) {
  const key = String(identifier || "").trim();
  if (!key) throw new Error("검수대기 항목 식별자가 필요합니다.");
  const normalizedUrl = normalizeXStatusUrl(key);
  const rows = loadTerafabxCommentReviewQueue();
  const record = rows.find((item) => {
    if (!item) return false;
    return String(item.id || "") === key
      || normalizeXStatusUrl(item.targetUrl || "") === normalizedUrl
      || String(item.targetId || "") === key;
  });
  if (!record) throw new Error("검수대기 항목을 찾을 수 없습니다.");
  return record;
}

function removeTerafabxCommentReviewRecord(identifier, { reason = "manual_delete" } = {}) {
  const record = findTerafabxCommentReviewRecord(identifier);
  const targetUrl = normalizeXStatusUrl(record.targetUrl || "");
  const rows = loadTerafabxCommentReviewQueue();
  const next = rows.filter((item) => item && normalizeXStatusUrl(item.targetUrl || "") !== targetUrl && String(item.id || "") !== String(record.id || ""));
  saveTerafabxCommentReviewQueue(next);
  logEvent("terafabx_review_queue_manual_delete", { targetUrl, id: record.id || "", reason, before: rows.length, after: next.length });
  return { ok: true, action: "delete", targetUrl, id: record.id || "", before: rows.length, after: next.length };
}

function completeTerafabxCommentReviewRecord(identifier) {
  const record = findTerafabxCommentReviewRecord(identifier);
  const targetUrl = normalizeXStatusUrl(record.targetUrl || "");
  const now = new Date().toISOString();
  const rows = loadTerafabxCommentReviewQueue();
  const next = rows.map((item) => {
    if (!item) return item;
    const same = normalizeXStatusUrl(item.targetUrl || "") === targetUrl || String(item.id || "") === String(record.id || "");
    if (!same) return item;
    return {
      ...item,
      posted: true,
      status: "completed",
      completedAt: now,
      manual: true,
      completedReason: "manual_complete_without_post",
    };
  });
  saveTerafabxCommentReviewQueue(next);
  logEvent("terafabx_review_queue_manual_complete", { targetUrl, id: record.id || "", completedAt: now });
  return { ok: true, action: "complete", targetUrl, id: record.id || "", completedAt: now };
}

function markTerafabxCommentReviewError(targetUrl, error) {
  const normalized = normalizeXStatusUrl(targetUrl);
  const rows = loadTerafabxCommentReviewQueue();
  const now = new Date().toISOString();
  const next = rows.map((item) => {
    if (normalizeXStatusUrl(item.targetUrl || "") !== normalized) return item;
    return {
      ...item,
      status: "error",
      lastError: error.message || String(error),
      errorAt: now,
      attempts: Number(item.attempts || 0) + 1,
    };
  });
  saveTerafabxCommentReviewQueue(next);
}

function savePostedTerafabxReviewComment(record, posted, { manual = true } = {}) {
  const at = new Date().toISOString();
  const targetUrl = normalizeXStatusUrl(record.targetUrl);
  const previous = loadTerafabxState();
  const historyRecord = {
    at,
    targetUrl,
    targetId: record.targetId || parseXStatusUrl(targetUrl)?.id || "",
    targetText: record.targetText || "",
    comment: validateTerafabxReply(record.comment),
    grokComment: record.grokComment || "",
    grokContext: record.grokContext || null,
    geminiReview: record.geminiReview || null,
    replyUrl: posted.replyUrl,
    generator: record.generator || "",
    follower: record.follower || null,
    source: "comment_review_queue",
    manual,
  };
  const existingHistory = previous.commentHistory || [];
  const nextHistory = [
    historyRecord,
    ...existingHistory.filter((item) => normalizeXStatusUrl(item.targetUrl || "") !== targetUrl),
  ].slice(0, 200);
  const seenTargets = Array.from(new Set([targetUrl, ...(previous.seenTargets || [])])).slice(0, 500);
  saveTerafabxState({
    lastCommentRunAt: at,
    lastCommentStatus: "ok",
    lastCommentError: null,
    lastComment: historyRecord.comment,
    lastCommentTarget: targetUrl,
    lastReplyUrl: posted.replyUrl,
    commentHistory: nextHistory,
    seenTargets,
  });
  removeTerafabxCommentReviewFromQueue(targetUrl);
  return historyRecord;
}

async function postSingleTerafabxCommentReviewRecord(identifier, { manual = true } = {}) {
  const waitStartedAt = Date.now();
  let ownsBusy = false;
  let record = null;
  let targetUrl = "";
  terafabxManualActionPending = true;
  try {
    while (terafabxBusy) {
      if (Date.now() - waitStartedAt > 180_000) {
        throw new Error("자동 댓글 게시가 아직 진행 중입니다. 잠시 후 다시 시도해 주세요.");
      }
      await sleep(1000);
    }
    record = findTerafabxCommentReviewRecord(identifier);
    targetUrl = normalizeXStatusUrl(record.targetUrl || "");
    if (!targetUrl || !parseXStatusUrl(targetUrl)) throw new Error("유효한 X 원문 URL이 아닙니다.");
    terafabxBusy = true;
    ownsBusy = true;
    const comment = validateTerafabxReply(record.comment);
    logEvent("terafabx_review_queue_manual_post_start", { targetUrl, id: record.id || "", handle: record.follower?.handle || null });
    const result = await postTerafabxReply(targetUrl, comment, { headless: true });
    const historyRecord = savePostedTerafabxReviewComment(record, result, { manual });
    logEvent("terafabx_review_queue_manual_post_done", { targetUrl, id: record.id || "", replyUrl: result.replyUrl });
    return { ok: true, action: "post", targetUrl, replyUrl: result.replyUrl, comment, at: historyRecord.at };
  } catch (error) {
    if (targetUrl) {
      markTerafabxCommentReviewError(targetUrl, error);
      saveTerafabxState({ lastCommentRunAt: new Date().toISOString(), lastCommentStatus: "error", lastCommentError: error.message, lastCommentTarget: targetUrl });
    }
    logEvent("terafabx_review_queue_manual_post_error", { targetUrl, id: record?.id || "", error: error.message });
    throw error;
  } finally {
    if (ownsBusy) terafabxBusy = false;
    terafabxManualActionPending = false;
  }
}

async function runTerafabxCommentReviewQueue({ manual = true, limit = 0, minScore = TERAFABX_REVIEW_COMMENT_MIN_SCORE, delayMs = TERAFABX_REVIEW_COMMENT_DELAY_MS } = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  if (!manual && isTerafabxQuietPostingTime()) {
    const pendingCount = loadTerafabxCommentReviewQueue().filter((item) => item && !item.posted && item.status !== "error").length;
    const quietUntil = nextTerafabxQuietPostingEnd();
    logEvent("terafabx_review_queue_post_quiet_skip", { pendingCount, minScore, quietUntil });
    return { ok: true, action: "review-comment", deferred: true, requested: 0, posted: [], failed: [], skipped: [], remaining: pendingCount, quietUntil };
  }
  terafabxBusy = true;
  try {
      const state = loadTerafabxState();
      const seenTargets = new Set([
        ...(state.commentHistory || []).map((item) => item.targetUrl),
        ...(state.seenTargets || []),
      ].filter(Boolean).map(normalizeXStatusUrl));
      const pending = loadTerafabxCommentReviewQueue()
        .filter((record) => record && record.status !== "error")
        .filter((record) => !seenTargets.has(normalizeXStatusUrl(record.targetUrl || "")));
      const assessments = pending.map((record) => ({ record, assessment: assessTerafabxCommentReviewRecord(record, minScore) }));
      const blocked = assessments.filter((item) => !item.assessment.ok);
      const skipped = blocked.map((item) => ({
        handle: item.record.follower?.handle || "",
        targetUrl: item.record.targetUrl || "",
        errors: item.assessment.errors,
        score: item.assessment.score,
      }));
      const eligible = assessments.filter((item) => item.assessment.ok);
      const max = Number(limit) > 0 ? Math.min(Number(limit), eligible.length) : eligible.length;
      const candidates = eligible.slice(0, max).map((item) => item.record);
      const posted = [];
      const failed = [];
      logEvent("terafabx_review_queue_post_start", { count: candidates.length, skipped: skipped.length, minScore, delayMs, manual });
      for (let index = 0; index < candidates.length; index += 1) {
        const record = candidates[index];
        const targetUrl = normalizeXStatusUrl(record.targetUrl);
        try {
          logEvent("terafabx_review_queue_post_item_start", { index: index + 1, total: candidates.length, targetUrl, handle: record.follower?.handle || null });
          const comment = validateTerafabxReply(record.comment);
          const result = await postTerafabxReply(targetUrl, comment, { headless: true });
          const historyRecord = savePostedTerafabxReviewComment(record, result, { manual });
          posted.push({ targetUrl, replyUrl: result.replyUrl, comment, handle: record.follower?.handle || "", at: historyRecord.at });
          logEvent("terafabx_review_queue_post_item_done", { index: index + 1, total: candidates.length, targetUrl, replyUrl: result.replyUrl });
        } catch (error) {
          markTerafabxCommentReviewError(targetUrl, error);
          saveTerafabxState({ lastCommentRunAt: new Date().toISOString(), lastCommentStatus: "error", lastCommentError: error.message, lastCommentTarget: targetUrl });
          failed.push({ targetUrl, handle: record.follower?.handle || "", error: error.message });
          logEvent("terafabx_review_queue_post_item_error", { index: index + 1, total: candidates.length, targetUrl, error: error.message });
          break;
        }
        if (index < candidates.length - 1) {
          await sleep(Math.max(0, Number(delayMs || 0)));
        }
      }
      logEvent("terafabx_review_queue_post_done", { requested: candidates.length, posted: posted.length, failed: failed.length, skipped: skipped.length });
      return { ok: failed.length === 0, action: "review-comment", requested: candidates.length, posted, failed, skipped, remaining: loadTerafabxCommentReviewQueue().length };
  } finally {
    terafabxBusy = false;
  }
}

async function runTerafabxHeartOnce({ limit = TERAFABX_HEART_LIMIT, manual = false } = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  terafabxBusy = true;
  try {
    return await withTerafabxCommentXLock("heart", async () => {
      const page = await getTerafabxCommentXHeadlessPage("https://x.com/home");
      try {
        await closeXDialogs(page);
        await verifyXAccount(page);
        await page.navigate("https://x.com/home", 8000);
        let liked = [];
        for (let round = 0; round < 5 && liked.length < limit; round++) {
          const batch = await page.eval(`(() => {
            function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
            const out = [];
            for (const article of Array.from(document.querySelectorAll("article"))) {
              if (out.length >= ${Number(limit)}) break;
              const text = clean(article.innerText || "");
              if (/Replying to|님에게 보내는 답글|답글 대상|프로모션|Promoted|광고/.test(text)) continue;
              const unlike = article.querySelector('[data-testid="unlike"]');
              if (unlike) continue;
              const like = article.querySelector('[data-testid="like"]');
              if (!like || like.disabled || like.getAttribute("aria-disabled") === "true") continue;
              const href = Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.href).find((href) => /x\\.com\\/[^/]+\\/status\\/\\d+/.test(href));
              if (!href || href.includes('/terafabXai/status/')) continue;
              like.scrollIntoView({ block: "center" });
              like.click();
              out.push({ url: href.split("?")[0], text: text.slice(0, 240) });
            }
            return out;
          })()`);
          liked = liked.concat(batch || []);
          if (liked.length >= limit) break;
          await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 500, y: 700, deltaX: 0, deltaY: 650 }).catch(() => {});
          await sleep(1000);
        }
        const now = new Date().toISOString();
        const previous = loadTerafabxState();
        const record = { at: now, count: liked.length, liked, manual };
        saveTerafabxState({ lastHeartRunAt: now, lastHeartStatus: "ok", lastHeartError: null, lastHeartCount: liked.length, heartHistory: [record, ...(previous.heartHistory || [])].slice(0, 100) });
        logEvent("terafabx_heart_done", record);
        return { ok: true, action: "heart", ...record };
      } finally {
        await page.close();
        const cleanup = await closeTerafabxCommentXHeadlessBrowser().catch((error) => ({ error: error.message }));
        logEvent("terafabx_heart_headless_cleanup", { cleanup });
      }
    });
  } catch (error) {
    saveTerafabxState({ lastHeartRunAt: new Date().toISOString(), lastHeartStatus: "error", lastHeartError: error.message });
    logEvent("terafabx_heart_error", { error: error.message });
    throw error;
  } finally {
    terafabxBusy = false;
  }
}

async function runTerafabxFollowOnce({ limit = TERAFABX_FOLLOW_LIMIT, manual = false } = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  terafabxBusy = true;
  try {
    return await withTerafabxCommentXLock("follow", async () => {
      const page = await getTerafabxCommentXHeadlessPage("https://x.com/terafabXai");
      try {
        const previous = loadTerafabxState();
        const seen = Array.from(new Set([...(previous.seenFollowProfiles || []), ...((previous.followHistory || []).flatMap((item) => (item.followed || []).map((row) => row.url)))]).values()).filter(Boolean);
        await closeXDialogs(page);
        await verifyXAccount(page);
        await page.navigate("https://x.com/terafabXai", 8000);
        const account = await page.eval(`(() => {
          const text = document.body.innerText || "";
          return { ok: text.includes("프로필 수정") || text.includes("Edit profile"), text: text.slice(0, 300), url: location.href };
        })()`);
        if (!account.ok) throw new Error(`X 계정 검증 실패: ${JSON.stringify(account)}`);
        let followed = [];
        const badPattern = "광고|Promoted|성인|도박|카지노|토토|정치|대통령|국힘|민주당|혐오|전쟁|사망|살인|강간|자살|폭행|참사|분쟁|야동|19금|코인|리딩방|bot|봇|맞팔|홍보|수익|부업";
        for (let round = 0; round < 10 && followed.length < limit; round += 1) {
          const batch = await page.eval(`(async () => {
            const limit = ${Number(limit)};
            const already = new Set(${JSON.stringify(seen)}.map((url) => String(url || "").toLowerCase()));
            const bad = new RegExp(${JSON.stringify(badPattern)}, "i");
            function clean(value) { return (value || "").replace(/\\s+/g, " ").trim(); }
            function handleFromHref(href) {
              try {
                const parsed = new URL(href, location.href);
                const part = parsed.pathname.split("/").filter(Boolean)[0] || "";
                if (!/^[A-Za-z0-9_]{1,15}$/.test(part)) return "";
                if (["home", "search", "explore", "messages", "notifications", "i", "settings", "compose", "terafabXai"].includes(part)) return "";
                return part;
              } catch { return ""; }
            }
            const out = [];
            const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter((button) => ["팔로우", "Follow"].includes(clean(button.innerText || button.getAttribute("aria-label") || "")));
            for (const button of buttons) {
              if (out.length >= limit) break;
              const box = button.closest('[data-testid="UserCell"]') || button.closest('[role="presentation"]') || button.closest('div');
              const text = clean(box?.innerText || "");
              if (!text || bad.test(text)) continue;
              const anchors = Array.from((box || document).querySelectorAll('a[href^="/"], a[href^="https://x.com/"]'));
              const handle = anchors.map((a) => handleFromHref(a.getAttribute("href") || a.href)).find(Boolean);
              if (!handle) continue;
              const url = "https://x.com/" + handle;
              if (already.has(url.toLowerCase()) || handle.toLowerCase() === "terafabxai") continue;
              button.scrollIntoView({ block: "center" });
              await new Promise((resolve) => setTimeout(resolve, 350));
              button.click();
              await new Promise((resolve) => setTimeout(resolve, 1400));
              const now = clean(button.innerText || button.getAttribute("aria-label") || "");
              const ok = /팔로잉|Following|언팔로우|Unfollow/.test(now) || /팔로잉|Following|언팔로우|Unfollow/.test(clean(box?.innerText || ""));
              if (ok) {
                already.add(url.toLowerCase());
                out.push({ handle, url, label: text.slice(0, 160), button: now });
              }
            }
            return out;
          })()`);
          followed = followed.concat((batch || []).filter((item) => item?.url && !followed.some((row) => row.url === item.url)));
          if (followed.length >= limit) break;
          await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 760, deltaX: 0, deltaY: 700 }).catch(() => {});
          await sleep(900);
        }
        const now = new Date().toISOString();
        const record = { at: now, count: followed.length, followed, manual };
        const seenFollowProfiles = Array.from(new Set([...(followed || []).map((item) => item.url), ...(previous.seenFollowProfiles || [])])).slice(0, 500);
        saveTerafabxState({
          lastFollowRunAt: now,
          lastFollowStatus: "ok",
          lastFollowError: null,
          lastFollowCount: followed.length,
          followHistory: [record, ...(previous.followHistory || [])].slice(0, 100),
          seenFollowProfiles,
        });
        logEvent("terafabx_follow_done", record);
        return { ok: true, action: "follow", ...record };
      } finally {
        await page.close();
        const cleanup = await closeTerafabxCommentXHeadlessBrowser().catch((error) => ({ error: error.message }));
        logEvent("terafabx_follow_headless_cleanup", { cleanup });
      }
    });
  } catch (error) {
    saveTerafabxState({ lastFollowRunAt: new Date().toISOString(), lastFollowStatus: "error", lastFollowError: error.message });
    logEvent("terafabx_follow_error", { error: error.message });
    throw error;
  } finally {
    terafabxBusy = false;
  }
}

function getTerafabxAutomationStatus() {
  const state = loadTerafabxState();
  const now = Date.now();
  const lastCommentScheduleRef = state.lastCommentStartedAt || state.lastCommentRunAt;
  const lastCommentMs = lastCommentScheduleRef ? new Date(lastCommentScheduleRef).getTime() : 0;
  const lastHeartMs = state.lastHeartRunAt ? new Date(state.lastHeartRunAt).getTime() : 0;
  const lastFollowMs = state.lastFollowRunAt ? new Date(state.lastFollowRunAt).getTime() : 0;
  const lastVerifiedReviewMs = state.verifiedCommentReviewLastRunAt ? new Date(state.verifiedCommentReviewLastRunAt).getTime() : 0;
  const verifiedReviewBackoffMs = state.verifiedCommentReviewBackoffUntil ? new Date(state.verifiedCommentReviewBackoffUntil).getTime() : 0;
  const verifiedReviewBackoffActive = Number.isFinite(verifiedReviewBackoffMs) && verifiedReviewBackoffMs > now;
  const reviewQueue = loadTerafabxCommentReviewQueue();
  const pendingReviewQueue = reviewQueue.filter((item) => item && !item.posted && item.status !== "error");
  const quietPostingActive = isTerafabxQuietPostingTime();
  const pendingCommentPosts = pendingTerafabxCommentPosts(state);
  return {
    ok: true,
    grokBin: GROK_BIN,
    grokProvider: TERAFABX_GROK_PROVIDER === "cli" ? "cli" : "web",
    grokWeb: {
      enabled: TERAFABX_GROK_PROVIDER !== "cli",
      statePath: TERAFABX_GROK_WEB_STATE_PATH,
      runDir: TERAFABX_GROK_WEB_RUN_DIR,
      session: TERAFABX_GROK_WEB_SESSION,
      sourceCdpPort: TERAFABX_GROK_WEB_SOURCE_CDP_PORT,
      refreshState: TERAFABX_GROK_WEB_REFRESH_STATE,
      headless: true,
    },
    chromePort: CHROME_PORT,
    commentX: {
      chromePort: TERAFABX_COMMENT_X_CHROME_PORT,
      profileDir: TERAFABX_COMMENT_X_PROFILE_DIR,
      headless: true,
      writerLock: getTerafabxCommentXLockState(),
    },
    geminiReview: {
      enabled: TERAFABX_GEMINI_REVIEW_ENABLED,
      required: TERAFABX_GEMINI_REVIEW_REQUIRED,
      chromePort: TERAFABX_GEMINI_CHROME_PORT,
      profileDir: TERAFABX_GEMINI_PROFILE_DIR,
      headless: true,
    },
    reviewCommentPost: {
      autoPost: TERAFABX_REVIEW_COMMENT_AUTO_POST,
      minScore: TERAFABX_REVIEW_COMMENT_MIN_SCORE,
      limit: TERAFABX_REVIEW_COMMENT_AUTO_POST_LIMIT,
      delayMs: TERAFABX_REVIEW_COMMENT_DELAY_MS,
    },
    quietPosting: {
      active: quietPostingActive,
      timezone: "Asia/Seoul",
      startHour: TERAFABX_QUIET_POSTING_START_HOUR,
      endHour: TERAFABX_QUIET_POSTING_END_HOUR,
      quietUntil: quietPostingActive ? nextTerafabxQuietPostingEnd() : null,
    },
    requiredXHandle: REQUIRED_X_HANDLE,
    busy: terafabxBusy,
    schedulerBusy: terafabxSchedulerBusy,
    manualActionPending: terafabxManualActionPending,
    commentPrefill: {
      busy: terafabxCommentPrefillBusy,
      targetCount: TERAFABX_COMMENT_PREFILL_TARGET,
      concurrency: TERAFABX_COMMENT_PREFILL_CONCURRENCY,
      geminiPortBase: TERAFABX_COMMENT_PREFILL_GEMINI_PORT_BASE,
    },
    jobGapMs: TERAFABX_JOB_GAP_MS,
    lock: getTerafabxLockState(),
    commentXLock: getTerafabxCommentXLockState(),
    verifiedReview: {
      enabled: Boolean(state.verifiedCommentReviewEnabled),
      sourceUrl: TERAFABX_VERIFIED_FOLLOWERS_URL,
      intervalMs: TERAFABX_VERIFIED_REVIEW_INTERVAL_MS,
      batchSize: TERAFABX_VERIFIED_REVIEW_BATCH_SIZE,
      maxTargetsPerRun: TERAFABX_VERIFIED_REVIEW_MAX_TARGETS_PER_RUN,
      maxProfileChecks: TERAFABX_VERIFIED_REVIEW_MAX_PROFILE_CHECKS,
      profileDelayMs: TERAFABX_VERIFIED_REVIEW_PROFILE_DELAY_MS,
      targetCount: TERAFABX_VERIFIED_REVIEW_TARGET_COUNT,
      queuePath: TERAFABX_COMMENT_REVIEW_QUEUE_PATH,
      queueCount: pendingReviewQueue.length,
      totalQueueCount: reviewQueue.length,
      backoffUntil: state.verifiedCommentReviewBackoffUntil,
      backoffActive: verifiedReviewBackoffActive,
      nextRunAt: state.verifiedCommentReviewEnabled && pendingReviewQueue.length < TERAFABX_VERIFIED_REVIEW_TARGET_COUNT
        ? new Date(Math.max(now, lastVerifiedReviewMs + TERAFABX_VERIFIED_REVIEW_INTERVAL_MS, verifiedReviewBackoffActive ? verifiedReviewBackoffMs : 0)).toISOString()
        : null,
      lastRunAt: state.verifiedCommentReviewLastRunAt,
      lastStatus: state.verifiedCommentReviewStatus,
      lastError: state.verifiedCommentReviewError,
      lastAdded: Number(state.verifiedCommentReviewLastAdded || 0),
      lastChecked: Number(state.verifiedCommentReviewLastChecked || 0),
      lastConcurrency: Number(state.verifiedCommentReviewLastConcurrency || TERAFABX_VERIFIED_REVIEW_CONCURRENCY),
      lastBatchCompletedAt: state.verifiedCommentReviewLastBatchCompletedAt || null,
      pendingToTarget: Math.max(0, TERAFABX_VERIFIED_REVIEW_TARGET_COUNT - pendingReviewQueue.length),
      recent: pendingReviewQueue.slice(0, 10),
    },
    comment: {
      enabled: Boolean(state.commentEnabled),
      intervalMs: TERAFABX_COMMENT_INTERVAL_MS,
      nextRunAt: state.commentEnabled ? new Date(Math.max(now, lastCommentMs + TERAFABX_COMMENT_INTERVAL_MS)).toISOString() : null,
      lastRunAt: state.lastCommentRunAt,
      lastStartedAt: state.lastCommentStartedAt || null,
      lastStatus: state.lastCommentStatus,
      lastError: state.lastCommentError,
      lastComment: state.lastComment,
      lastTarget: state.lastCommentTarget,
      lastReplyUrl: state.lastReplyUrl,
      pendingPostCount: pendingCommentPosts.length,
      pendingPosts: pendingCommentPosts.slice(0, 5),
      history: (state.commentHistory || []).slice(0, 5),
    },
    affiliate: {
      defaultTargetUrl: state.affiliateDefaultTargetUrl || "",
      defaultLink: state.affiliateDefaultLink || "",
      defaultComment: state.affiliateDefaultComment || buildDefaultAffiliateComment(state.affiliateDefaultLink || ""),
      lastRunAt: state.lastAffiliateRunAt,
      lastStatus: state.lastAffiliateStatus,
      lastError: state.lastAffiliateError,
      history: (state.affiliateHistory || []).slice(0, 5),
    },
    heart: {
      enabled: Boolean(state.heartEnabled),
      intervalMs: TERAFABX_HEART_INTERVAL_MS,
      nextRunAt: state.heartEnabled ? new Date(Math.max(now, lastHeartMs + TERAFABX_HEART_INTERVAL_MS)).toISOString() : null,
      lastRunAt: state.lastHeartRunAt,
      lastStatus: state.lastHeartStatus,
      lastError: state.lastHeartError,
      lastCount: state.lastHeartCount || 0,
      history: (state.heartHistory || []).slice(0, 5),
    },
    follow: {
      enabled: Boolean(state.followEnabled),
      intervalMs: TERAFABX_FOLLOW_INTERVAL_MS,
      limit: TERAFABX_FOLLOW_LIMIT,
      nextRunAt: state.followEnabled ? new Date(Math.max(now, lastFollowMs + TERAFABX_FOLLOW_INTERVAL_MS)).toISOString() : null,
      lastRunAt: state.lastFollowRunAt,
      lastStatus: state.lastFollowStatus,
      lastError: state.lastFollowError,
      lastCount: state.lastFollowCount || 0,
      history: (state.followHistory || []).slice(0, 5),
    },
  };
}

async function maybeRunTerafabxAutomation() {
  if (terafabxSchedulerBusy || terafabxBusy || terafabxManualActionPending) return;
  terafabxSchedulerBusy = true;
  const runStartedAt = new Date().toISOString();
  const jobs = [];
  const state = loadTerafabxState();
  const now = Date.now();
  const lastCommentScheduleRef = state.lastCommentStartedAt || state.lastCommentRunAt;
  const lastCommentMs = lastCommentScheduleRef ? new Date(lastCommentScheduleRef).getTime() : 0;
  const lastHeartMs = state.lastHeartRunAt ? new Date(state.lastHeartRunAt).getTime() : 0;
  const lastFollowMs = state.lastFollowRunAt ? new Date(state.lastFollowRunAt).getTime() : 0;
  const lastVerifiedReviewMs = state.verifiedCommentReviewLastRunAt ? new Date(state.verifiedCommentReviewLastRunAt).getTime() : 0;
  const verifiedReviewBackoffMs = state.verifiedCommentReviewBackoffUntil ? new Date(state.verifiedCommentReviewBackoffUntil).getTime() : 0;
  const verifiedReviewBackoffActive = Number.isFinite(verifiedReviewBackoffMs) && verifiedReviewBackoffMs > now;
  const reviewQueue = loadTerafabxCommentReviewQueue();
  const reviewQueueCount = reviewQueue.filter((item) => item && !item.posted && item.status !== "error").length;
  const eligibleReviewPostCount = reviewQueue
    .filter((item) => item && !item.posted && item.status !== "error")
    .filter((item) => assessTerafabxCommentReviewRecord(item, TERAFABX_REVIEW_COMMENT_MIN_SCORE).ok)
    .length;
  const pendingCommentPostCount = pendingTerafabxCommentPosts(state).length;
  if (state.commentEnabled && pendingCommentPostCount > 0 && !isTerafabxQuietPostingTime() && now - lastCommentMs >= TERAFABX_COMMENT_INTERVAL_MS) {
    jobs.push({ name: "pending-comment", overdueMs: pendingCommentPostCount });
  }
  if (state.commentEnabled && pendingCommentPostCount <= 0 && !terafabxCommentPrefillBusy && now - lastCommentMs >= TERAFABX_COMMENT_INTERVAL_MS) {
    jobs.push({ name: "comment", overdueMs: now - lastCommentMs - TERAFABX_COMMENT_INTERVAL_MS });
  }
  if (state.verifiedCommentReviewEnabled && !verifiedReviewBackoffActive && reviewQueueCount < TERAFABX_VERIFIED_REVIEW_TARGET_COUNT && now - lastVerifiedReviewMs >= TERAFABX_VERIFIED_REVIEW_INTERVAL_MS) {
    jobs.push({ name: "verified-review", overdueMs: now - lastVerifiedReviewMs - TERAFABX_VERIFIED_REVIEW_INTERVAL_MS });
  } else if (state.verifiedCommentReviewEnabled && verifiedReviewBackoffActive) {
    logEvent("terafabx_verified_review_backoff_skip", { until: state.verifiedCommentReviewBackoffUntil });
  }
  if (TERAFABX_REVIEW_COMMENT_AUTO_POST && eligibleReviewPostCount > 0 && !isTerafabxQuietPostingTime()) {
    jobs.push({ name: "review-comment", overdueMs: eligibleReviewPostCount });
  }
  if (state.heartEnabled && now - lastHeartMs >= TERAFABX_HEART_INTERVAL_MS) {
    jobs.push({ name: "heart", overdueMs: now - lastHeartMs - TERAFABX_HEART_INTERVAL_MS });
  }
  if (state.followEnabled && now - lastFollowMs >= TERAFABX_FOLLOW_INTERVAL_MS) {
    const commentJobQueued = jobs.some((job) => job.name === "pending-comment" || job.name === "comment");
    if (commentJobQueued) {
      logEvent("terafabx_follow_deferred_for_comment_sla", {
        pendingCommentPostCount,
        overdueMs: now - lastFollowMs - TERAFABX_FOLLOW_INTERVAL_MS,
      });
    } else {
      jobs.push({ name: "follow", overdueMs: now - lastFollowMs - TERAFABX_FOLLOW_INTERVAL_MS });
    }
  }
  const jobPriority = { "pending-comment": 0, comment: 1, "verified-review": 2, "review-comment": 3, heart: 4, follow: 5 };
  jobs.sort((a, b) => (jobPriority[a.name] ?? 99) - (jobPriority[b.name] ?? 99) || b.overdueMs - a.overdueMs);
  if (!jobs.length) {
    maybeStartTerafabxCommentPrefill("idle_tick");
    terafabxSchedulerBusy = false;
    return;
  }
  logEvent("terafabx_auto_queue_start", { runStartedAt, jobs });
  try {
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      try {
        logEvent("terafabx_auto_job_start", { job: job.name, index, total: jobs.length });
        if (job.name === "pending-comment") {
          await runTerafabxPendingCommentPosts({ manual: false, limit: 1 });
        } else if (job.name === "comment") {
          await runTerafabxCommentOnce({ manual: false });
        } else if (job.name === "verified-review") {
          await runTerafabxVerifiedCommentReviewOnce({ manual: false, limit: TERAFABX_VERIFIED_REVIEW_BATCH_SIZE });
          if (TERAFABX_REVIEW_COMMENT_AUTO_POST) {
            await runTerafabxCommentReviewQueue({
              manual: false,
              limit: TERAFABX_REVIEW_COMMENT_AUTO_POST_LIMIT,
              minScore: TERAFABX_REVIEW_COMMENT_MIN_SCORE,
              delayMs: TERAFABX_REVIEW_COMMENT_DELAY_MS,
            });
          }
        } else if (job.name === "review-comment") {
          await runTerafabxCommentReviewQueue({
            manual: false,
            limit: TERAFABX_REVIEW_COMMENT_AUTO_POST_LIMIT,
            minScore: TERAFABX_REVIEW_COMMENT_MIN_SCORE,
            delayMs: TERAFABX_REVIEW_COMMENT_DELAY_MS,
          });
        } else if (job.name === "heart") {
          await runTerafabxHeartOnce({ manual: false });
        } else {
          await runTerafabxFollowOnce({ manual: false });
        }
        logEvent("terafabx_auto_job_done", { job: job.name, index, total: jobs.length });
      } catch (error) {
        logEvent(`terafabx_auto_${job.name}_error`, { error: error.message });
      }
      if (index < jobs.length - 1) {
        logEvent("terafabx_auto_job_gap", { after: job.name, gapMs: TERAFABX_JOB_GAP_MS });
        await sleep(TERAFABX_JOB_GAP_MS);
      }
    }
  } finally {
    maybeStartTerafabxCommentPrefill("after_scheduler");
    terafabxSchedulerBusy = false;
    logEvent("terafabx_auto_queue_done", { runStartedAt });
  }
}

function validateThreadsUrl(value) {
  const parsed = new URL(value);
  if (!/^www\.threads\.(com|net)$|^threads\.(com|net)$/.test(parsed.hostname)) {
    throw new Error("threads.com 또는 threads.net URL만 허용됩니다.");
  }
  const match = parsed.pathname.match(/^\/@([^/]+)\/post\/([^/]+)/);
  if (!match) throw new Error("Threads 원글 URL 형식이 아닙니다.");
  return `https://www.threads.com/@${match[1]}/post/${match[2]}`;
}

function isInssiderPostUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname === "inssider.kr" && /^\/posts\/\d+\/\d+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

function validateInssiderUrl(value) {
  const parsed = new URL(value);
  if (parsed.hostname !== "inssider.kr") throw new Error("inssider.kr URL만 허용됩니다.");
  const match = parsed.pathname.match(/^\/posts\/(\d+)\/(\d+)/);
  if (!match) throw new Error("인싸이더 글 URL 형식이 아닙니다.");
  if (!INSSIDER_CATEGORY_CODES.has(match[1])) throw new Error("허용되지 않은 인싸이더 카테고리입니다.");
  return {
    canonicalUrl: `${INSSIDER_BASE_URL}/posts/${match[1]}/${match[2]}`,
    categoryCode: match[1],
    postSeq: match[2],
  };
}

function normalizeDiscoveryUrl(value) {
  return isInssiderPostUrl(value) ? validateInssiderUrl(value).canonicalUrl : validateThreadsUrl(value);
}

function parseCompactCount(value) {
  const text = String(value || "").trim().replace(/,/g, "");
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([천만kKmM]?)$/);
  if (!match) return null;
  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;
  const unit = match[2].toLowerCase();
  if (unit === "천" || unit === "k") return Math.round(number * 1000);
  if (unit === "만") return Math.round(number * 10000);
  if (unit === "m") return Math.round(number * 1000000);
  return Math.round(number);
}

function assessDiscoveryCandidate(candidate, post) {
  const text = String(post.text || candidate.textPreview || "").trim();
  const compactText = text.replace(/\s+/g, " ");
  const mediaCandidates = post.diagnostics?.mediaCandidates || [];
  const firstMedia = mediaCandidates[0] || {};
  const hasStrongMedia = post.mediaUrls.length > 0 && (
    post.mediaUrls.length >= 2 ||
    ((firstMedia.width || 0) >= 240 && (firstMedia.height || 0) >= 240)
  );
  const isShortHook = compactText.length >= 8 && compactText.length <= 120 && text.split("\n").filter(Boolean).length <= 4;
  const controversyPattern = /(논란|민폐|이해|어디까지|vs|VS|맞다|틀리|최악|충격|소름|욕|왜|뭐가|가능|해야|말아|남편|아내|직장|회사|상사|알바|손님|부모|시댁|결혼|연애|이혼|돈|월급|사장|아이|엄마|아빠|교사|학생|빌런|개념|무개념|진상|사퇴|아웃|선넘|꼰대|갑질|을질|차별|불륜|바람|싸움|분노|황당|실화|ㄷㄷ|ㅋㅋ|\\?)/;
  const hasControversy = controversyPattern.test(compactText);
  const isLongInfoPost = /(정리했|방법|꿀팁|전자책|프로젝트|오픈소스|깃허브|1\\.|2\\.|3\\.|4\\.|5\\.)/.test(compactText) || compactText.length > 140;
  let viralScore = 0;
  if (isShortHook) viralScore += 1;
  if (hasStrongMedia) viralScore += 1;
  if (hasControversy) viralScore += 1;
  if (candidate.likeCount >= 3000) viralScore += 1;
  if (isLongInfoPost) viralScore -= 2;
  const pass = viralScore >= DISCOVERY_MIN_VIRAL_SCORE && isShortHook && hasStrongMedia && hasControversy && !isLongInfoPost;
  const reasons = [];
  if (!isShortHook) reasons.push("not_short_hook");
  if (!hasStrongMedia) reasons.push("not_strong_media");
  if (!hasControversy) reasons.push("not_controversial");
  if (isLongInfoPost) reasons.push("long_info_post");
  return {
    pass,
    viralScore,
    reasons,
    isShortHook,
    hasStrongMedia,
    hasControversy,
  };
}

function looksLikeSocialHandle(line) {
  return /^@?[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9_])$/i.test(String(line || "").trim());
}

function looksLikeLocationLine(line) {
  const text = String(line || "").trim();
  if (!text || text.length > 80) return false;
  if (/^[A-Z][A-Za-z .'-]{1,40},\s*(?:A[LKSZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEHINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])$/.test(text)) return true;
  return /^[A-Z][A-Za-z .'-]{1,40},\s*[A-Z][A-Za-z .'-]{1,40}$/.test(text);
}

function cleanDiscoveryPreviewText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 1 && looksLikeSocialHandle(lines[0])) return "";
  lines = lines.filter((line) => !looksLikeSocialHandle(line) && !looksLikeLocationLine(line));
  const normalizeComparableLine = (line) => line
    .replace(/[.。!！?？"'“”‘’()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  while (lines.length >= 2 && normalizeComparableLine(lines[0]) && normalizeComparableLine(lines[0]) === normalizeComparableLine(lines[1])) {
    lines = lines.slice(1);
  }
  return lines.join("\n").trim();
}

function cleanThreadText(raw, expectedHandle = "") {
  const lines = String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const skipped = new Set(["로그인", "스레드", "인기순", "활동 보기"]);
  const normalizedExpectedHandle = String(expectedHandle || "").replace(/^@/, "").toLowerCase();
  const kept = [];
  for (const line of lines) {
    if (skipped.has(line)) continue;
    const normalizedLine = line.replace(/^@/, "").toLowerCase();
    if (looksLikeSocialHandle(line)) {
      if (normalizedLine === normalizedExpectedHandle) continue;
      if (kept.length > 0) break;
    }
    if (/^\d+$/.test(line)) {
      if (kept.length > 0) break;
      continue;
    }
    if (/^\d+\s*\/?$/.test(line)) continue;
    if (/^\d+\s*\/\s*\d+$/.test(line)) continue;
    if (line === "/") continue;
    if (/^\d+[.,]?\d*[천만]?$/.test(line)) {
      if (kept.length > 0) break;
      continue;
    }
    if (/^\d+\s*(초|분|시간|일)$/.test(line)) continue;
    if (/님에게 답글 남기기/.test(line)) break;
    if (looksLikeLocationLine(line)) continue;
    if (/^\d+\s*(초|분|시간|일)전?$/.test(line)) continue;
    if (line === "·" || line === "작성자") continue;
    kept.push(line);
    if (kept.length >= 12) break;
  }
  let text = kept.join("\n").trim();
  if (text.length > 280) text = `${text.slice(0, 279)}…`;
  return text;
}

async function extractThreadPost(sourceUrl, options = {}) {
  const page = await newPage(sourceUrl);
  try {
    const expectedHandle = new URL(sourceUrl).pathname.split("/")[1].replace("@", "");
    await sleep(9000);
    await page.eval(`(() => {
      const video = document.querySelector("video");
      if (video) {
        video.scrollIntoView({ block: "center" });
        video.muted = true;
        video.play().catch(() => {});
      }
      return true;
    })()`);
    await sleep(5000);
    const data = await page.eval(`(() => {
      const expectedHandle = "${expectedHandle}";
      const looksLikeSocialHandle = (value) => /^@?[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9_])$/i.test((value || "").trim());
      const article = document.querySelector('div[role="article"]') || document.body;
      const rectOk = (el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 120 && r.height >= 120;
      };
      const handleNode = Array.from(article.querySelectorAll("span, a, div"))
        .find((el) => (el.innerText || "").trim().replace(/^@/, "") === expectedHandle);
      const handleRect = handleNode ? handleNode.getBoundingClientRect() : null;
      const mediaInfo = (el, kind) => {
        const r = el.getBoundingClientRect();
        return {
          kind,
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          src: kind === "video" ? (el.currentSrc || el.src) : (el.currentSrc || el.src),
        };
      };
      const allMedia = [
        ...Array.from(article.querySelectorAll("video")).map((el) => mediaInfo(el, "video")),
        ...Array.from(article.querySelectorAll("img")).filter(rectOk).map((el) => mediaInfo(el, "image")),
      ]
        .filter((item) => item.src && (item.kind === "video" || /cdninstagram|fbcdn/.test(item.src)))
        .filter((item) => !handleRect || item.top > handleRect.bottom)
        .sort((a, b) => a.top - b.top || a.left - b.left);
      const firstMediaTop = allMedia[0]?.top;
      const mediaBand = Number.isFinite(firstMediaTop)
        ? allMedia.filter((item) => item.top <= firstMediaTop + 260)
        : [];
      const getPostText = () => {
        const text = article.innerText || "";
        const lines = text.split("\\n").map((line) => line.trim()).filter(Boolean);
        const handleIndex = lines.findIndex((line) => /^@?[^\\s]+$/.test(line) && line.replace(/^@/, "") === "${new URL(sourceUrl).pathname.split("/")[1].replace("@", "")}");
        const start = handleIndex >= 0 ? handleIndex + 1 : 0;
        const out = [];
        for (let i = start; i < lines.length; i++) {
          const line = lines[i];
          if (/^\\d+$/.test(line) && out.length > 0) break;
          if (/^\\d+[.,]?\\d*[천만]?$/.test(line) && out.length > 0) break;
          if (/^\\d+\\s*(초|분|시간|일)$/.test(line)) continue;
          if (/^\\d+\\s*(초|분|시간|일)전?$/.test(line)) continue;
          if (line === "·" || line === "작성자") continue;
          if (looksLikeSocialHandle(line)) {
            if (line.replace(/^@/, "").toLowerCase() === expectedHandle.toLowerCase()) continue;
            if (out.length > 0) break;
          }
          out.push(line);
          if (out.length >= 10) break;
        }
        return out.join("\\n");
      };
      const getActionCounts = () => {
        const lines = (document.body.innerText || "").split("\\n").map((line) => line.trim()).filter(Boolean);
        const handleIndex = lines.findIndex((line) => line.replace(/^@/, "") === expectedHandle);
        const counts = [];
        for (let i = Math.max(0, handleIndex + 1); i < lines.length; i++) {
          const line = lines[i];
          if (/인기순|활동 보기|님에게 답글 남기기/.test(line)) break;
          if (/^\\d+(?:\\.\\d+)?\\s*([천만kKmM]?)$/.test(line.replace(/,/g, ""))) counts.push(line);
          if (counts.length >= 4) break;
        }
        return counts;
      };
      const selectedMedia = [];
      for (const item of mediaBand) {
        if (selectedMedia.length >= ${MAX_MEDIA}) break;
        const duplicateSlot = selectedMedia.some((existing) =>
          Math.abs(existing.top - item.top) < 8 &&
          Math.abs(existing.left - item.left) < 8 &&
          Math.abs(existing.width - item.width) < 8 &&
          Math.abs(existing.height - item.height) < 8
        );
        if (duplicateSlot && item.kind === "image") continue;
        selectedMedia.push(item);
      }
      const videos = mediaBand.filter((item) => item.kind === "video").map((item) => item.src);
      const images = mediaBand.filter((item) => item.kind === "image").map((item) => item.src);
      const links = Array.from(article.querySelectorAll("a[href]"))
        .map((a) => a.href)
        .filter((href) => href && !href.includes("threads.com") && !href.includes("instagram.com"))
        .slice(0, 3);
      return {
        text: getPostText(),
        selectedMedia: selectedMedia.map((item) => ({ kind: item.kind, src: item.src })),
        actionCounts: getActionCounts(),
        videos,
        images,
        links,
        diagnostics: {
          handleFound: Boolean(handleRect),
          mediaCandidateCount: allMedia.length,
          mediaBandCount: mediaBand.length,
          mediaCandidates: allMedia.slice(0, 8).map((item) => ({
            kind: item.kind,
            top: Math.round(item.top),
            width: Math.round(item.width),
            height: Math.round(item.height),
            src: item.src.slice(0, 160),
          })),
        },
      };
    })()`);
    const videoUrls = unique(data.videos || []);
    const imageUrls = unique(data.images || []);
    const mediaUrls = unique((data.selectedMedia || []).map((item) => item.src)).slice(0, MAX_MEDIA);
    const actionCounts = Array.isArray(data.actionCounts) ? data.actionCounts : [];
    const detailLikeCount = parseCompactCount(actionCounts[0]);
    const extraLinks = unique(data.links || []);
    let text = cleanThreadText(data.text, expectedHandle);
    if (extraLinks.length) {
      const linkText = extraLinks.join("\n");
      text = text ? `${text}\n\n${linkText}` : linkText;
    }
    if (!text && !options.allowEmptyText) throw new Error("Threads 원문 텍스트를 추출하지 못했습니다.");
    return {
      text,
      mediaUrls,
      imageMediaUrls: imageUrls.slice(0, MAX_MEDIA),
      videoMediaUrls: videoUrls.slice(0, MAX_MEDIA),
      likeCount: Number.isFinite(detailLikeCount) ? detailLikeCount : null,
      diagnostics: {
        ...(data.diagnostics || {}),
        actionCounts,
        videoCount: videoUrls.length,
        imageCount: imageUrls.length,
        selectedMediaCount: mediaUrls.length,
        selectedMedia: mediaUrls.map((url) => url.slice(0, 160)),
      },
    };
  } finally {
    await page.close();
  }
}

async function discoverThreadsTimeline(options = {}) {
  const minLikes = Number(options.minLikes || DISCOVERY_MIN_LIKES);
  const maxScrolls = Number(options.maxScrolls || DISCOVERY_MAX_SCROLLS);
  const page = await newPage("https://www.threads.com/");
  try {
    await sleep(9000);
    const candidatesByUrl = new Map();
    for (let scroll = 0; scroll <= maxScrolls; scroll += 1) {
      const batch = await page.eval(`((minLikes) => {
        const parseCompactCount = (value) => {
          const text = String(value || "").trim().replace(/,/g, "");
          const match = text.match(/^(\\d+(?:\\.\\d+)?)\\s*([천만kKmM]?)$/);
          if (!match) return null;
          const number = Number(match[1]);
          if (!Number.isFinite(number)) return null;
          const unit = match[2].toLowerCase();
          if (unit === "천" || unit === "k") return Math.round(number * 1000);
          if (unit === "만") return Math.round(number * 10000);
          if (unit === "m") return Math.round(number * 1000000);
          return Math.round(number);
        };
        const canonical = (href) => {
          try {
            const url = new URL(href);
            const match = url.pathname.match(/^\\/@([^/]+)\\/post\\/([^/]+)/);
            if (!match) return null;
            return "https://www.threads.com/@" + match[1] + "/post/" + match[2];
          } catch {
            return null;
          }
        };
      const linesOf = (node) => String(node?.innerText || "")
          .split("\\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const looksLikeLocationLine = (line) => {
          const text = String(line || "").trim();
          if (!text || text.length > 80) return false;
          if (/^[A-Z][A-Za-z .'-]{1,40},\\s*(?:A[LKSZR]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEHINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AIT]|W[AIVY])$/.test(text)) return true;
          return /^[A-Z][A-Za-z .'-]{1,40},\\s*[A-Z][A-Za-z .'-]{1,40}$/.test(text);
        };
        const looksLikeSocialHandle = (line) => /^@?[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9_])$/i.test(String(line || "").trim());
        const mediaCountOf = (node) => Array.from(node.querySelectorAll("img, video"))
          .filter((el) => {
            const rect = el.getBoundingClientRect();
            const src = el.currentSrc || el.src || "";
            return rect.width >= 100 && rect.height >= 100 && /cdninstagram|fbcdn/.test(src);
          }).length;
        const postLinks = Array.from(document.querySelectorAll('a[href*="/post/"]'))
          .map((link) => ({ link, canonicalUrl: canonical(link.href) }))
          .filter((item) => item.canonicalUrl);
        const seen = new Set();
        const out = [];
        for (const item of postLinks) {
          if (seen.has(item.canonicalUrl)) continue;
          seen.add(item.canonicalUrl);
          const parsed = item.canonicalUrl.match(/\\/(@[^/]+)\\/post\\//);
          const author = parsed ? parsed[1].slice(1) : "";
          let best = null;
          let node = item.link;
          for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
            const rect = node.getBoundingClientRect();
            if (rect.width < 240 || rect.height < 40 || rect.height > 1800) continue;
            const lines = linesOf(node);
            if (!lines.includes(author)) continue;
            const postLinkCount = new Set(Array.from(node.querySelectorAll('a[href*="/post/"]'))
              .map((link) => canonical(link.href))
              .filter(Boolean)).size;
            if (postLinkCount !== 1) continue;
            const mediaCount = mediaCountOf(node);
            const buttons = Array.from(node.querySelectorAll('button, [role="button"]'))
              .map((button) => linesOf(button).join(""))
              .filter(Boolean);
            const likeCount = parseCompactCount(buttons[0]);
            best = {
              lines,
              mediaCount,
              likeCount,
              buttonTexts: buttons,
            };
            if (mediaCount > 0 && likeCount !== null) break;
          }
          if (!best || best.mediaCount <= 0 || !Number.isFinite(best.likeCount) || best.likeCount < minLikes) continue;
          const stopIndex = best.lines.findIndex((line) => parseCompactCount(line) !== null && best.buttonTexts.includes(line));
          const textLines = best.lines
            .slice(0, stopIndex >= 0 ? stopIndex : Math.min(best.lines.length, 8))
            .filter((line) => line !== author && !/^\\d+\\s*(초|분|시간|일|주|개월|년)$/.test(line))
            .filter((line) => !/^\\d+\\s*\\/?$/.test(line) && line !== "/" && !/^\\d+\\s*\\/\\s*\\d+$/.test(line))
            .filter((line) => !looksLikeLocationLine(line))
            .filter((line) => !looksLikeSocialHandle(line))
            .slice(0, 5);
          out.push({
            canonicalUrl: item.canonicalUrl,
            author,
            textPreview: textLines.join("\\n").slice(0, 240),
            likeCount: best.likeCount,
            mediaCount: Math.min(best.mediaCount, 4),
          });
        }
        return out;
      })(${minLikes})`);
      for (const item of batch) {
        const current = candidatesByUrl.get(item.canonicalUrl);
        if (!current || item.likeCount > current.likeCount) {
          candidatesByUrl.set(item.canonicalUrl, item);
        }
      }
      await page.eval(`window.scrollBy(0, Math.max(900, window.innerHeight * 1.5)); true`);
      await sleep(1800);
    }
    const candidates = Array.from(candidatesByUrl.values())
      .sort((a, b) => b.likeCount - a.likeCount);
    logEvent("discovery_scan_done", { found: candidates.length, minLikes, maxScrolls });
    return candidates;
  } finally {
    await page.close();
  }
}

async function processDueDiscoveryPost(options = {}) {
  return { ok: true, processed: false, disabled: true, reason: "discovery_requires_manual_dashboard_post" };
}

async function processDiscoveryDraft(options = {}) {
  if (busy) return { ok: false, skipped: true, reason: "busy" };
  const db = await getDiscoveryDb();
  const row = await db.prepare(`
    SELECT canonical_url AS canonicalUrl, attempts
    FROM thread_discoveries
    WHERE status IN ('draft', 'failed_draft')
    ORDER BY discovered_at ASC
    LIMIT 1
  `).get();
  if (!row) return { ok: true, processed: false };

  busy = true;
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'drafting', attempts = attempts + 1, last_error = NULL
    WHERE canonical_url = ?
  `).run(row.canonicalUrl);
  logEvent("discovery_x_draft_start", { canonicalUrl: row.canonicalUrl, source: options.source || null });
  try {
    const result = await createXDraftFromThread(row.canonicalUrl);
    await db.prepare(`
      UPDATE thread_discoveries
      SET status = 'x_draft', posted_at = CURRENT_TIMESTAMP, last_error = NULL
      WHERE canonical_url = ?
    `).run(row.canonicalUrl);
    logEvent("discovery_x_draft_success", { canonicalUrl: row.canonicalUrl, mediaCount: result.mediaCount });
    return { ok: true, processed: true, canonicalUrl: row.canonicalUrl, result };
  } catch (error) {
    await db.prepare(`
      UPDATE thread_discoveries
      SET status = 'failed_draft', last_error = ?
      WHERE canonical_url = ?
    `).run(error.message, row.canonicalUrl);
    logEvent("discovery_x_draft_error", { canonicalUrl: row.canonicalUrl, error: error.message });
    return { ok: false, processed: true, canonicalUrl: row.canonicalUrl, error: error.message };
  } finally {
    busy = false;
  }
}

async function runDiscoveryScan(options = {}) {
  if (!options.manual && !isAutoDiscoveryEnabled()) {
    return { ok: true, skipped: true, reason: "auto_discovery_disabled" };
  }
  if (discoveryScanBusy) return { ok: true, skipped: true, reason: "scan_busy" };
  discoveryScanBusy = true;
  try {
    const candidates = await discoverThreadsTimeline({
      minLikes: options.minLikes || DISCOVERY_MIN_LIKES,
      maxScrolls: options.maxScrolls || DISCOVERY_MAX_SCROLLS,
    });
    const validated = [];
    const rejected = [];
    for (const candidate of candidates) {
      try {
        const post = await extractThreadPost(candidate.canonicalUrl, { allowEmptyText: true });
        if (post.mediaUrls.length <= 0) {
          rejected.push({ canonicalUrl: candidate.canonicalUrl, reason: "no_media_after_detail_extract" });
          continue;
        }
        const assessment = assessDiscoveryCandidate(candidate, post);
        const likeCount = Number.isFinite(post.likeCount) ? post.likeCount : candidate.likeCount;
        if (!Number.isFinite(likeCount) || likeCount < (options.minLikes || DISCOVERY_MIN_LIKES)) {
          rejected.push({ canonicalUrl: candidate.canonicalUrl, reason: "detail_like_count_below_threshold", likeCount });
          continue;
        }
        const textPreview = cleanDiscoveryPreviewText(post.text || candidate.textPreview || "");
        if (!textPreview) {
          rejected.push({ canonicalUrl: candidate.canonicalUrl, reason: "no_valid_text_after_detail_extract" });
          continue;
        }
        validated.push({
          ...candidate,
          likeCount,
          textPreview: textPreview.slice(0, 240),
          mediaPreviewUrl: post.mediaUrls[0] || post.imageMediaUrls?.[0] || "",
          mediaCount: post.mediaUrls.length,
          viralScore: assessment.viralScore,
          criteria: JSON.stringify({
            minLikes: true,
            hasMedia: true,
            shortHook: assessment.isShortHook,
            strongMedia: assessment.hasStrongMedia,
            controversy: assessment.hasControversy,
            reasons: assessment.reasons,
          }),
        });
      } catch (error) {
        rejected.push({ canonicalUrl: candidate.canonicalUrl, reason: error.message });
      }
    }
    const saved = await saveDiscoveryCandidates(validated);
    logEvent("discovery_saved", { found: candidates.length, validated: validated.length, rejected: rejected.length, ...saved });
    return { ok: true, found: candidates.length, validated: validated.length, rejected, saved, candidates: validated };
  } finally {
    discoveryScanBusy = false;
  }
}

function unique(values) {
  return Array.from(new Set(values.filter((value) => {
    if (!value) return false;
    return /^https?:\/\//i.test(value);
  })));
}

async function downloadMedia(urls) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "thread-mirror-"));
  const files = [];
  for (let i = 0; i < urls.length; i++) {
    const parsed = new URL(urls[i]);
    const ext = parsed.pathname.includes(".mp4") ? ".mp4" : ".jpg";
    const file = path.join(dir, `media-${i + 1}${ext}`);
    await downloadFile(urls[i], file);
    files.push(file);
  }
  return { dir, files };
}

function downloadFile(url, file) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? require("https") : require("http");
    const req = client.get(url, { headers: { "user-agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadFile(res.headers.location, file).then(resolve, reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`media download failed: HTTP ${res.statusCode}`));
        return;
      }
      const out = fs.createWriteStream(file);
      res.pipe(out);
      out.on("finish", () => out.close(resolve));
      out.on("error", reject);
    });
    req.on("error", reject);
  });
}

async function verifyXAccount(page) {
  let accountState = null;
  const verifyUrls = [
    "https://x.com/home",
    "https://x.com/i/flow/login",
    "https://x.com/intent/post?text=",
    `https://x.com/${REQUIRED_X_HANDLE}`,
  ];
  for (const url of verifyUrls) {
    await page.navigate(url, 15000).catch(() => {});
    for (let attempt = 0; attempt < 24; attempt += 1) {
      accountState = await page.eval(`(() => {
        const button = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
        const profileLink = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
        const avatars = Array.from(document.querySelectorAll('[data-testid^="UserAvatar-Container-"]'));
        const canonical = document.querySelector('link[rel="canonical"]');
        return {
          url: location.href,
          title: document.title,
          accountText: button?.innerText || "",
          profileHref: profileLink?.href || "",
          canonicalHref: canonical?.href || "",
          avatarTestIds: avatars.map((avatar) => avatar.getAttribute("data-testid")).filter(Boolean).slice(0, 8),
          bodyText: (document.body.innerText || "").slice(0, 1000),
        };
      })()`);
      const haystack = [
        accountState.accountText,
        accountState.profileHref,
        accountState.canonicalHref,
        accountState.url,
        ...(accountState.avatarTestIds || []),
      ].join("\n").toLowerCase();
      if (
        haystack.includes(`@${REQUIRED_X_HANDLE}`) ||
        haystack.includes(`/${REQUIRED_X_HANDLE}`) ||
        haystack.includes(`-${REQUIRED_X_HANDLE}`)
      ) {
        if (url !== "https://x.com/home") {
          logEvent("x_account_verify_fallback_ok", { required: REQUIRED_X_HANDLE, url: accountState.url, profileHref: accountState.profileHref });
          await closeXDialogs(page).catch(() => {});
        }
        return;
      }
      if (!accountState.bodyText && attempt === 7) {
        await page.navigate(accountState.url || url, 15000).catch(() => {});
      }
      await sleep(1000);
    }
  }
  logEvent("x_account_verify_failed_state", { required: REQUIRED_X_HANDLE, accountState });
  throw new Error(`X 로그인 계정 검증 실패: @${REQUIRED_X_HANDLE}가 아닙니다.`);
}

async function waitForComposer(page) {
  for (let i = 0; i < 20; i++) {
    const ok = await page.eval(`Boolean(document.querySelector('[data-testid="tweetTextarea_0"]'))`);
    if (ok) return;
    await sleep(500);
  }
  throw new Error("X 작성창을 찾지 못했습니다.");
}

async function postToX(threadPost, mediaFiles, options = {}) {
  return withMirrorChromeLock(options.schedule ? "mirror_schedule" : "mirror_post", async () => {
    const page = await newPage("https://x.com/home");
    try {
      await verifyXAccount(page);
      await page.navigate("https://x.com/compose/post", 5000);
      await waitForComposer(page);
      await page.eval(`(() => {
        const box = document.querySelector('[data-testid="tweetTextarea_0"]');
        box.focus();
        return true;
      })()`);
      await page.send("Input.insertText", { text: threadPost.text });
      await sleep(1000);

      if (mediaFiles.length) {
        const root = await page.send("DOM.getDocument", { depth: -1, pierce: true });
        const node = await page.send("DOM.querySelector", {
          nodeId: root.root.nodeId,
          selector: 'input[type="file"]',
        });
        if (!node.nodeId) throw new Error("X 미디어 업로드 input을 찾지 못했습니다.");
        await page.send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: mediaFiles });
        await waitForUploadToSettle(page, mediaFiles.length, mediaFiles);
      }

      let scheduledAt = null;
      if (options.schedule) {
        scheduledAt = options.scheduledAt || nextAvailableScheduleTime();
        await setXSchedule(page, scheduledAt);
      }

      const canPost = await waitForPostButton(page, mediaFiles.length);
      if (!canPost.ok) {
        throw new Error(`X 게시 버튼이 활성화되지 않았습니다: ${canPost.reason}`);
      }
      const clicked = await page.eval(`(() => {
        const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
        const buttons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')).filter(visible);
        const button = buttons.find((btn) => btn.getAttribute("aria-disabled") !== "true" && !btn.disabled);
        if (!button) return false;
        button.click();
        return true;
      })()`);
      if (!clicked) throw new Error("X 게시 버튼을 클릭하지 못했습니다.");
      await sleep(5000);
      if (scheduledAt) recordScheduleSlot(scheduledAt);
      let postUrl = null;
      if (!scheduledAt) {
        const verifyText = String(threadPost.text || "").slice(0, 80);
        try {
          await page.navigate(`https://x.com/${REQUIRED_X_HANDLE}/with_replies`, 7000);
          const found = await page.eval(`((verifyText) => {
            function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
            for (const article of Array.from(document.querySelectorAll("article")).slice(0, 8)) {
              const text = clean(article.innerText || "");
              if (!text.includes(verifyText)) continue;
              const href = Array.from(article.querySelectorAll('a[href*="/status/"]'))
                .map((a) => a.href)
                .find((href) => /x\\.com\\/[^/]+\\/status\\/\\d+/.test(href) && !href.includes("/analytics"));
              if (href) return href.split("?")[0];
            }
            return null;
          })(${JSON.stringify(verifyText)})`);
          postUrl = found || null;
        } catch (error) {
          logEvent("x_post_url_lookup_error", { error: error.message, textPreview: verifyText });
        }
      }
      return { scheduledAt, postUrl };
    } finally {
      await page.close();
      logEvent("x_tab_closed", {});
    }
  });
}

async function saveComposeAsXDraft(page) {
  const closeClicked = await page.eval(`(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"]'));
    const closeButton = candidates.find((el) => {
      const label = (el.getAttribute("aria-label") || el.innerText || "").trim();
      return /^(Close|닫기|Back|뒤로)$/i.test(label);
    });
    if (!closeButton) return false;
    closeButton.click();
    return true;
  })()`);
  if (!closeClicked) {
    throw new Error("X 초안 저장용 닫기 버튼을 찾지 못했습니다.");
  }
  await sleep(1000);
  const saved = await page.eval(`(() => {
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const saveButton = buttons.find((el) => {
      const text = (el.innerText || el.getAttribute("aria-label") || "").trim();
      return /^(Save|저장|초안 저장|Save draft)$/i.test(text);
    });
    if (!saveButton) return false;
    saveButton.click();
    return true;
  })()`);
  if (!saved) {
    const state = await page.eval(`(() => ({
      bodyText: (document.body.innerText || "").slice(0, 1000),
      buttons: Array.from(document.querySelectorAll('button, [role="button"]')).map((el) => ({
        text: (el.innerText || "").trim(),
        label: (el.getAttribute("aria-label") || "").trim(),
      })).slice(0, 40),
    }))()`);
    throw new Error(`X 초안 저장 버튼을 찾지 못했습니다: ${JSON.stringify(state)}`);
  }
  await sleep(1500);
}

async function createXDraft(threadPost, mediaFiles) {
  return withMirrorChromeLock("mirror_draft", async () => {
    const page = await newPage("https://x.com/home");
    try {
      await verifyXAccount(page);
      await page.navigate("https://x.com/compose/post", 5000);
      await waitForComposer(page);
      await page.eval(`(() => {
        const box = document.querySelector('[data-testid="tweetTextarea_0"]');
        box.focus();
        return true;
      })()`);
      await page.send("Input.insertText", { text: threadPost.text });
      await sleep(1000);

      if (mediaFiles.length) {
        const root = await page.send("DOM.getDocument", { depth: -1, pierce: true });
        const node = await page.send("DOM.querySelector", {
          nodeId: root.root.nodeId,
          selector: 'input[type="file"]',
        });
        if (!node.nodeId) throw new Error("X 미디어 업로드 input을 찾지 못했습니다.");
        await page.send("DOM.setFileInputFiles", { nodeId: node.nodeId, files: mediaFiles });
        await waitForUploadToSettle(page, mediaFiles.length, mediaFiles);
      }

      const canPost = await waitForPostButton(page, mediaFiles.length);
      if (!canPost.ok) {
        throw new Error(`X 초안 저장 전 작성 상태가 준비되지 않았습니다: ${canPost.reason}`);
      }
      await saveComposeAsXDraft(page);
      return {};
    } finally {
      await page.close();
      logEvent("x_tab_closed", { draft: true });
    }
  });
}

function loadScheduleSlots() {
  try {
    const raw = fs.readFileSync(SCHEDULE_SLOTS_PATH, "utf8");
    const slots = JSON.parse(raw);
    return Array.isArray(slots) ? slots : [];
  } catch {
    return [];
  }
}

function saveScheduleSlots(slots) {
  fs.writeFileSync(SCHEDULE_SLOTS_PATH, JSON.stringify(slots.slice(-200), null, 2));
}

function nextAvailableScheduleTime() {
  const now = new Date();
  let candidate = new Date(now.getTime() + 20 * 60 * 1000);
  candidate.setSeconds(0, 0);
  const minute = candidate.getMinutes();
  candidate.setMinutes(Math.ceil(minute / 5) * 5);
  const slots = loadScheduleSlots()
    .map((entry) => new Date(entry.scheduledAt).getTime())
    .filter((time) => Number.isFinite(time) && time > now.getTime() - 24 * 60 * 60 * 1000);
  let changed;
  do {
    changed = false;
    for (const slot of slots) {
      if (Math.abs(slot - candidate.getTime()) < SCHEDULE_SPACING_MS) {
        candidate = new Date(slot + SCHEDULE_SPACING_MS);
        changed = true;
      }
    }
  } while (changed);
  return candidate;
}

function autoScheduleQuietEndForKstDay(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    AUTO_SCHEDULE_QUIET_END_HOUR - 9,
    0,
    0,
    0,
  ));
}

function isAutoScheduleQuietTime(date) {
  const start = AUTO_SCHEDULE_QUIET_START_HOUR;
  const end = AUTO_SCHEDULE_QUIET_END_HOUR;
  const hour = kstHour(date);
  if (!Number.isFinite(hour) || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

function normalizeAutoScheduleCandidate(date) {
  const candidate = new Date(date);
  if (candidate.getSeconds() || candidate.getMilliseconds()) {
    candidate.setMinutes(candidate.getMinutes() + 1);
  }
  candidate.setSeconds(0, 0);
  const minuteStep = 5;
  const remainder = candidate.getMinutes() % minuteStep;
  if (remainder) {
    candidate.setMinutes(candidate.getMinutes() + (minuteStep - remainder));
  }
  if (isAutoScheduleQuietTime(candidate)) {
    return autoScheduleQuietEndForKstDay(candidate);
  }
  return candidate;
}

async function nextAutoScheduleTime() {
  const now = Date.now();
  const times = [
    ...loadScheduleSlots().map((entry) => entry.scheduledAt),
    ...loadMirrorHistory().filter((entry) => entry.status === "scheduled").map((entry) => entry.scheduledAt),
  ]
    .map((value) => new Date(value).getTime())
    .filter((time) => Number.isFinite(time) && time > now);
  try {
    const db = await getDiscoveryDb();
    const rows = await db.prepare(`
      SELECT scheduled_post_at AS scheduledAt
      FROM thread_discoveries
      WHERE scheduled_post_at IS NOT NULL
    `).all();
    for (const row of rows) {
      const time = new Date(row.scheduledAt).getTime();
      if (Number.isFinite(time) && time > now) times.push(time);
    }
  } catch (error) {
    logEvent("auto_schedule_time_db_error", { error: error.message });
  }
  const latest = times.length ? Math.max(...times) : 0;
  let candidate = normalizeAutoScheduleCandidate(new Date(Math.max(latest, now) + 30 * 60 * 1000));
  while (isAutoScheduleQuietTime(candidate)) {
    candidate = normalizeAutoScheduleCandidate(autoScheduleQuietEndForKstDay(candidate));
  }
  return candidate;
}

function recordScheduleSlot(scheduledAt) {
  const slots = loadScheduleSlots();
  slots.push({ scheduledAt: scheduledAt.toISOString(), recordedAt: new Date().toISOString() });
  saveScheduleSlots(slots);
}

function loadMirrorHistory() {
  try {
    const raw = fs.readFileSync(MIRROR_HISTORY_PATH, "utf8");
    const history = JSON.parse(raw);
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function saveMirrorHistory(history) {
  fs.writeFileSync(MIRROR_HISTORY_PATH, JSON.stringify(history.slice(-500), null, 2));
}

function findCompletedMirror(canonicalUrl) {
  return loadMirrorHistory()
    .slice()
    .reverse()
    .find((entry) => entry.canonicalUrl === canonicalUrl && ["posted", "scheduled"].includes(entry.status));
}

function recordCompletedMirror(entry) {
  const history = loadMirrorHistory();
  const withoutSameUrl = history.filter((item) => item.canonicalUrl !== entry.canonicalUrl);
  withoutSameUrl.push({
    canonicalUrl: entry.canonicalUrl,
    status: entry.status,
    scheduledAt: entry.scheduledAt || null,
    postUrl: entry.postUrl || null,
    mediaCount: entry.mediaCount,
    completedAt: new Date().toISOString(),
  });
  saveMirrorHistory(withoutSameUrl);
}

async function getDiscoveryDb() {
  if (!discoveryDbPromise) {
    discoveryDbPromise = (async () => {
      fs.mkdirSync(path.dirname(DISCOVERY_DB_PATH), { recursive: true });
      const { connect } = await import("@tursodatabase/database");
      const db = await connect(DISCOVERY_DB_PATH);
      await db.exec(`
        CREATE TABLE IF NOT EXISTS thread_discoveries (
          canonical_url TEXT PRIMARY KEY,
          author TEXT NOT NULL,
          text_preview TEXT NOT NULL DEFAULT '',
          media_preview_url TEXT NOT NULL DEFAULT '',
          like_count INTEGER NOT NULL DEFAULT 0,
          media_count INTEGER NOT NULL DEFAULT 0,
          viral_score INTEGER NOT NULL DEFAULT 0,
          criteria TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'queued',
          scheduled_post_at TEXT,
          discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          posted_at TEXT,
          last_error TEXT,
          attempts INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_thread_discoveries_status_time
          ON thread_discoveries(status, scheduled_post_at);
      `);
      const columns = await db.prepare(`PRAGMA table_info(thread_discoveries)`).all();
      const columnNames = new Set(columns.map((column) => column.name));
      if (!columnNames.has("viral_score")) {
        await db.exec(`ALTER TABLE thread_discoveries ADD COLUMN viral_score INTEGER NOT NULL DEFAULT 0`);
      }
      if (!columnNames.has("criteria")) {
        await db.exec(`ALTER TABLE thread_discoveries ADD COLUMN criteria TEXT NOT NULL DEFAULT ''`);
      }
      if (!columnNames.has("media_preview_url")) {
        await db.exec(`ALTER TABLE thread_discoveries ADD COLUMN media_preview_url TEXT NOT NULL DEFAULT ''`);
      }
      await repairStuckDiscoveryRows(db);
      return db;
    })();
  }
  return discoveryDbPromise;
}

async function getNextDiscoveryPostTime(db) {
  const row = await db.prepare(`
    SELECT scheduled_post_at, posted_at
    FROM thread_discoveries
    WHERE scheduled_post_at IS NOT NULL OR posted_at IS NOT NULL
    ORDER BY COALESCE(posted_at, scheduled_post_at) DESC
    LIMIT 1
  `).get();
  const now = Date.now();
  const base = row ? new Date(row.posted_at || row.scheduled_post_at).getTime() : 0;
  const next = Math.max(now, Number.isFinite(base) ? base + DISCOVERY_POST_INTERVAL_MS : now);
  return new Date(next);
}

async function saveDiscoveryCandidates(candidates) {
  const db = await getDiscoveryDb();
  let inserted = 0;
  let updated = 0;
  let skippedCompleted = 0;
  let skippedExcluded = 0;
  for (const candidate of candidates) {
    const excludedKeyword = excludedDiscoveryKeywordForText(
      `${candidate.author || ""} ${candidate.textPreview || ""} ${candidate.criteria || ""}`
    );
    if (excludedKeyword) {
      skippedExcluded += 1;
      await db.prepare(`
        UPDATE thread_discoveries
        SET status = 'skipped', last_error = ?, discovered_at = CURRENT_TIMESTAMP
        WHERE canonical_url = ?
      `).run(`excluded_keyword:${excludedKeyword}`, candidate.canonicalUrl);
      logEvent("discovery_candidate_excluded", {
        canonicalUrl: candidate.canonicalUrl,
        keyword: excludedKeyword,
      });
      continue;
    }
    if (findCompletedMirror(candidate.canonicalUrl)) {
      skippedCompleted += 1;
      continue;
    }
    const existing = await db.prepare(`
      SELECT canonical_url, status FROM thread_discoveries WHERE canonical_url = ?
    `).get(candidate.canonicalUrl);
    if (existing) {
      await db.prepare(`
        UPDATE thread_discoveries
        SET author = ?, text_preview = ?, media_preview_url = COALESCE(NULLIF(?, ''), media_preview_url), like_count = ?,
            media_count = ?, viral_score = ?, status = 'review',
            criteria = ?, discovered_at = CURRENT_TIMESTAMP
        WHERE canonical_url = ? AND status IN ('review', 'draft', 'queued', 'failed', 'failed_post', 'failed_draft', 'failed_schedule', 'discovered', 'skipped')
      `).run(candidate.author, candidate.textPreview, candidate.mediaPreviewUrl || "", candidate.likeCount, candidate.mediaCount, candidate.viralScore || 0, candidate.criteria || "", candidate.canonicalUrl);
      updated += 1;
      continue;
    }
    await db.prepare(`
      INSERT INTO thread_discoveries
        (canonical_url, author, text_preview, media_preview_url, like_count, media_count, viral_score, criteria, status, scheduled_post_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'review', NULL)
    `).run(
      candidate.canonicalUrl,
      candidate.author,
      candidate.textPreview,
      candidate.mediaPreviewUrl || "",
      candidate.likeCount,
      candidate.mediaCount,
      candidate.viralScore || 0,
      candidate.criteria || "",
    );
    inserted += 1;
  }
  return { inserted, updated, skippedCompleted, skippedExcluded };
}

function isDiscoveryPlaceholderText(value) {
  const text = String(value || "").trim();
  return !text || text === "수집 중" || text === "(본문 없음)";
}

function discoveryFailurePreviewText(error, kind = "detail") {
  const message = String(error?.message || error || "");
  if (/Runtime\.evaluate timed out|timed out/i.test(message)) return "Threads 수집 시간 초과";
  if (/미디어를 찾지 못해|no media|media/i.test(message)) return "미디어 없음";
  if (kind === "schedule") return "예약 실패";
  return "Threads 수집 실패";
}

async function repairStuckDiscoveryRows(db) {
  const result = await db.prepare(`
    UPDATE thread_discoveries
    SET status = CASE
          WHEN status IN ('review', 'draft', 'queued', 'discovered', 'failed') THEN 'failed'
          ELSE status
        END,
        text_preview = CASE
          WHEN last_error LIKE '%Runtime.evaluate timed out%' THEN 'Threads 수집 시간 초과'
          WHEN last_error LIKE '%미디어를 찾지 못해%' THEN '미디어 없음'
          WHEN status = 'failed_schedule' THEN '예약 실패'
          ELSE 'Threads 수집 실패'
        END
    WHERE last_error IS NOT NULL
      AND (text_preview = '' OR text_preview = '수집 중' OR text_preview = '(본문 없음)')
      AND status NOT IN ('scheduled', 'posted', 'x_draft', 'skipped')
  `).run();
  if (result.changes) logEvent("discovery_stuck_rows_repaired", { changes: result.changes });
}

async function markDiscoveryExtractionFailed(canonicalUrl, details = {}) {
  const db = await getDiscoveryDb();
  const author = String(details.author || new URL(canonicalUrl).pathname.split("/")[1].replace("@", ""));
  const textPreview = String(details.textPreview || "").trim() || discoveryFailurePreviewText(details.error);
  const likeCount = Number.isFinite(details.likeCount) ? details.likeCount : 0;
  const errorMessage = String(details.error?.message || details.error || "Threads 디테일 추출 실패");
  const criteria = JSON.stringify({
    manualShare: true,
    minLikes: likeCount >= DISCOVERY_MIN_LIKES,
    hasMedia: false,
    reason: details.reason || "detail_extract_failed",
    diagnostics: details.diagnostics || null,
  });
  await db.prepare(`
    INSERT OR IGNORE INTO thread_discoveries
      (canonical_url, author, text_preview, media_preview_url, like_count, media_count, viral_score, criteria, status, scheduled_post_at, last_error, attempts)
    VALUES (?, ?, ?, '', ?, 0, 0, ?, 'failed', NULL, ?, 0)
  `).run(canonicalUrl, author, textPreview.slice(0, 240), likeCount, criteria, errorMessage);
  await db.prepare(`
    UPDATE thread_discoveries
    SET author = ?,
        text_preview = ?,
        like_count = ?,
        media_count = 0,
        viral_score = 0,
        criteria = ?,
        last_error = ?,
        attempts = attempts + 1,
        status = CASE WHEN status = 'failed_schedule' THEN status ELSE 'failed' END,
        discovered_at = CURRENT_TIMESTAMP
    WHERE canonical_url = ?
      AND status NOT IN ('scheduled', 'posted', 'x_draft', 'skipped')
  `).run(author, textPreview.slice(0, 240), likeCount, criteria, errorMessage, canonicalUrl);
}

async function addDiscoveryPlaceholder(url, options = {}) {
  const canonicalUrl = validateThreadsUrl(url);
  const db = await getDiscoveryDb();
  const author = new URL(canonicalUrl).pathname.split("/")[1].replace("@", "");
  const textPreview = String(options.text || "").trim() || "수집 중";
  const excludedKeyword = excludedDiscoveryKeywordForText(`${author} ${textPreview}`);
  if (excludedKeyword) {
    await db.prepare(`
      UPDATE thread_discoveries
      SET status = 'skipped', last_error = ?, discovered_at = CURRENT_TIMESTAMP
      WHERE canonical_url = ?
    `).run(`excluded_keyword:${excludedKeyword}`, canonicalUrl);
    logEvent("discovery_placeholder_excluded", { canonicalUrl, keyword: excludedKeyword });
    return { canonicalUrl, inserted: 0, updated: 0, skippedExcluded: 1 };
  }
  const criteria = JSON.stringify({ pendingDetailExtract: true, source: options.origin || "manual" });
  const existing = await db.prepare(`
    SELECT canonical_url, status FROM thread_discoveries WHERE canonical_url = ?
  `).get(canonicalUrl);
  if (existing) {
    await db.prepare(`
      UPDATE thread_discoveries
      SET author = ?,
          text_preview = CASE
            WHEN text_preview = '' OR text_preview = '수집 중' OR text_preview = '(본문 없음)' THEN ?
            ELSE text_preview
          END,
          criteria = CASE WHEN criteria = '' THEN ? ELSE criteria END,
          status = 'review',
          last_error = NULL,
          discovered_at = CURRENT_TIMESTAMP
      WHERE canonical_url = ? AND status IN ('review', 'draft', 'queued', 'failed', 'failed_post', 'failed_draft', 'failed_schedule', 'discovered', 'skipped')
    `).run(author, textPreview, criteria, canonicalUrl);
    return { canonicalUrl, inserted: 0, updated: 1, skippedCompleted: 0 };
  }
  if (findCompletedMirror(canonicalUrl)) {
    return { canonicalUrl, inserted: 0, updated: 0, skippedCompleted: 1 };
  }
  await db.prepare(`
    INSERT INTO thread_discoveries
      (canonical_url, author, text_preview, media_preview_url, like_count, media_count, viral_score, criteria, status, scheduled_post_at)
    VALUES (?, ?, ?, '', 0, 0, 0, ?, 'review', NULL)
  `).run(canonicalUrl, author, textPreview, criteria);
  logEvent("discovery_placeholder_added", { canonicalUrl, origin: options.origin || null });
  return { canonicalUrl, inserted: 1, updated: 0, skippedCompleted: 0 };
}

async function markDiscoveryDetailError(canonicalUrl, error) {
  const db = await getDiscoveryDb();
  const message = error.message || String(error);
  const failurePreview = discoveryFailurePreviewText(error);
  await db.prepare(`
    UPDATE thread_discoveries
    SET last_error = ?,
        attempts = attempts + 1,
        status = CASE
          WHEN status IN ('review', 'draft', 'queued', 'failed', 'discovered') THEN 'failed'
          ELSE status
        END,
        text_preview = CASE
          WHEN text_preview = '' OR text_preview = '수집 중' OR text_preview = '(본문 없음)' THEN ?
          ELSE text_preview
        END,
        discovered_at = CURRENT_TIMESTAMP
    WHERE canonical_url = ? AND status IN ('review', 'draft', 'queued', 'failed', 'failed_post', 'failed_draft', 'failed_schedule', 'discovered')
  `).run(message, failurePreview, canonicalUrl);
}

async function markDiscoverySkipped(canonicalUrl, reason) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'skipped', last_error = ?, discovered_at = CURRENT_TIMESTAMP
    WHERE canonical_url = ?
  `).run(reason, canonicalUrl);
}

async function addThreadToDiscoveryReview(url, options = {}) {
  const canonicalUrl = validateThreadsUrl(url);
  const post = await extractThreadPost(canonicalUrl, { allowEmptyText: true });
  const author = new URL(canonicalUrl).pathname.split("/")[1].replace("@", "");
  const textPreview = String(options.text || post.text || "").trim() || "(본문 없음)";
  if (post.mediaUrls.length <= 0) {
    const error = new Error("Threads 원글에서 미디어를 찾지 못해 대시보드에 추가하지 않았습니다.");
    await markDiscoveryExtractionFailed(canonicalUrl, {
      author,
      textPreview: isDiscoveryPlaceholderText(textPreview) ? discoveryFailurePreviewText(error) : textPreview,
      likeCount: Number.isFinite(post.likeCount) ? post.likeCount : 0,
      error,
      reason: "no_media_after_detail_extract",
      diagnostics: post.diagnostics,
    });
    throw error;
  }
  const excludedKeyword = excludedDiscoveryKeywordForText(`${author} ${textPreview}`);
  if (excludedKeyword) {
    await markDiscoverySkipped(canonicalUrl, `excluded_keyword:${excludedKeyword}`);
    logEvent("share_excluded_from_discovery", { canonicalUrl, keyword: excludedKeyword });
    return {
      canonicalUrl,
      skipped: true,
      reason: "excluded_keyword",
      keyword: excludedKeyword,
      message: "제외 키워드가 포함되어 대시보드에 추가하지 않았습니다.",
    };
  }
  const likeCount = Number.isFinite(post.likeCount) ? post.likeCount : 0;
  const assessment = assessDiscoveryCandidate({
    canonicalUrl,
    author,
    textPreview,
    likeCount,
    mediaCount: post.mediaUrls.length,
  }, post);
  const saved = await saveDiscoveryCandidates([{
    canonicalUrl,
    author,
    textPreview: textPreview.slice(0, 240),
    mediaPreviewUrl: post.mediaUrls[0] || post.imageMediaUrls?.[0] || "",
    likeCount,
    mediaCount: post.mediaUrls.length,
    viralScore: assessment.viralScore,
    criteria: JSON.stringify({
      manualShare: true,
      minLikes: likeCount >= DISCOVERY_MIN_LIKES,
      hasMedia: true,
      shortHook: assessment.isShortHook,
      strongMedia: assessment.hasStrongMedia,
      controversy: assessment.hasControversy,
      reasons: assessment.reasons,
    }),
  }]);
  logEvent("share_added_to_discovery", { canonicalUrl, likeCount, mediaCount: post.mediaUrls.length, ...saved });
  return {
    canonicalUrl,
    likeCount,
    mediaCount: post.mediaUrls.length,
    saved,
    message: "대시보드에 추가됨",
  };
}

async function addInssiderToDiscoveryReview(url) {
  const { canonicalUrl, categoryCode, postSeq } = validateInssiderUrl(url);
  const post = await fetchInssiderPostDetail(categoryCode, postSeq);
  const debateEndAt = parseKoreanDateTime(post.debateInfo?.debateEndAt);
  if (post.postKind !== "D" || !debateEndAt || debateEndAt.getTime() <= Date.now()) {
    throw new Error("판결중인 인싸이더 글만 대시보드에 저장할 수 있습니다.");
  }
  const capture = await createInssiderCaptureImage(post);
  const textPreview = buildInssiderPostText(post);
  const saved = await saveDiscoveryCandidates([{
    canonicalUrl,
    author: "inssider",
    textPreview,
    mediaPreviewUrl: capture.url,
    likeCount: Number(post.likeCnt || 0),
    mediaCount: 1,
    viralScore: 3,
    criteria: JSON.stringify({
      source: "inssider",
      categoryCode,
      postSeq,
      pendingDebate: true,
      captureExcerpt: capture.excerpt,
      inssiderReplyChunks: splitInssiderReplyChunks(capture.continuation),
      sourceImageUrl: capture.sourceImageUrl,
      debateEndAt: post.debateInfo?.debateEndAt || null,
    }),
  }]);
  logEvent("inssider_saved_to_discovery", { canonicalUrl, categoryCode, postSeq, capture: path.basename(capture.filePath), ...saved });
  return {
    canonicalUrl,
    saved,
    mediaPreviewUrl: capture.url,
    textPreview,
    message: "인싸이더 글이 대시보드에 저장됨",
  };
}

async function postInssiderContinuationReplies(targetUrl, sourceUrl, options = {}) {
  const { categoryCode, postSeq, canonicalUrl } = validateInssiderUrl(sourceUrl);
  const post = await fetchInssiderPostDetail(categoryCode, postSeq);
  const contentText = stripHtmlToText(post.content);
  const parts = buildCuriosityExcerptParts(contentText);
  const chunks = splitInssiderReplyChunks(parts.continuation);
  const skipChunks = Math.max(0, Number(options.skipChunks || 0));
  const pendingChunks = chunks.slice(skipChunks);
  if (!pendingChunks.length) {
    return { canonicalUrl, targetUrl, replyCount: 0, skipped: skipChunks, message: "추가로 달 답글이 없습니다." };
  }
  let replyTargetUrl = String(targetUrl || "").split("?")[0];
  const replies = [];
  for (let index = 0; index < pendingChunks.length; index += 1) {
    const chunk = pendingChunks[index];
    const result = await postTerafabxReply(replyTargetUrl, chunk, { validate: false, quick: true });
    replies.push({ index: skipChunks + index, replyUrl: result.replyUrl, length: chunk.length });
    replyTargetUrl = result.replyUrl || replyTargetUrl;
    logEvent("inssider_continuation_reply_posted", {
      canonicalUrl,
      targetUrl,
      replyUrl: result.replyUrl,
      index: skipChunks + index,
      total: chunks.length,
      length: chunk.length,
    });
    if (index < pendingChunks.length - 1) await sleep(300);
  }
  return { canonicalUrl, targetUrl, skipped: skipChunks, replyCount: replies.length, replies };
}

async function postReplyTextChain(targetUrl, texts) {
  const chunks = (Array.isArray(texts) ? texts : [])
    .map((text) => String(text || "").trim())
    .filter(Boolean);
  if (!chunks.length) throw new Error("답글 텍스트가 비어 있습니다.");
  let replyTargetUrl = String(targetUrl || "").split("?")[0];
  const replies = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const result = await postTerafabxReply(replyTargetUrl, chunks[index], { validate: false, quick: true });
    replies.push({ index, replyUrl: result.replyUrl, length: chunks[index].length });
    replyTargetUrl = result.replyUrl || replyTargetUrl;
    logEvent("reply_text_chain_posted", { targetUrl, replyUrl: result.replyUrl, index, total: chunks.length, length: chunks[index].length });
    if (index < chunks.length - 1) await sleep(300);
  }
  return { targetUrl, replyCount: replies.length, replies };
}

async function findOwnXPostByText(text, options = {}) {
  const needle = String(text || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!needle) return null;
  const page = await newPage(`https://x.com/${REQUIRED_X_HANDLE}/with_replies`);
  try {
    await verifyXAccount(page);
    await page.navigate(`https://x.com/${REQUIRED_X_HANDLE}/with_replies`, 8000);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const found = await page.eval(`(() => {
        const needle = ${JSON.stringify(needle)};
        function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
        for (const article of Array.from(document.querySelectorAll("article")).slice(0, 20)) {
          const text = clean(article.innerText || "");
          if (!text.includes(needle)) continue;
          const href = Array.from(article.querySelectorAll('a[href*="/status/"]'))
            .map((a) => a.href)
            .find((href) => href.toLowerCase().includes('/${REQUIRED_X_HANDLE}/status/') && !href.includes('/analytics'));
          if (href) return href.split("?")[0];
        }
        return null;
      })()`);
      if (found) return found;
      await page.send("Runtime.evaluate", {
        expression: "window.scrollBy(0, 900)",
        returnByValue: true,
      }).catch(() => {});
      await sleep(1500);
    }
    return null;
  } finally {
    await page.close();
  }
}

async function maybeRunScheduledInssiderReplies() {
  if (scheduledReplyBusy) return { ok: true, skipped: true, reason: "busy" };
  scheduledReplyBusy = true;
  try {
    await enqueueMissingScheduledInssiderReplyItems();
    const state = loadScheduledReplyState();
    const now = Date.now();
    const pending = (state.items || [])
      .filter((item) => item.status === "pending")
      .filter((item) => new Date(item.scheduledAt || 0).getTime() + 30 * 1000 <= now)
      .sort((a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime());
    for (const item of pending) {
      const attempts = Number(item.attempts || 0) + 1;
      patchScheduledReplyItem(item.canonicalUrl, { attempts, lastAttemptAt: new Date().toISOString(), lastError: null });
      try {
        const row = await getDiscoveryRow(item.canonicalUrl);
        let criteria = {};
        try { criteria = JSON.parse(row?.criteria || "{}"); } catch {}
        const storedReplyChunks = Array.isArray(item.replyChunks) && item.replyChunks.length
          ? item.replyChunks
          : Array.isArray(criteria.inssiderReplyChunks)
            ? criteria.inssiderReplyChunks
            : [];
        const replyChunks = splitInssiderReplyChunks(storedReplyChunks.join("\n"), 180);
        if (!row || !replyChunks.length) throw new Error("예약 댓글에 필요한 대시보드 행 또는 replyChunks가 없습니다.");
        const postUrl = item.postUrl || await findOwnXPostByText(item.text || row.textPreview || "");
        if (!postUrl) {
          if (attempts >= 20) patchScheduledReplyItem(item.canonicalUrl, { status: "failed", lastError: "예약 게시글 URL을 찾지 못했습니다." });
          else patchScheduledReplyItem(item.canonicalUrl, { lastError: "예약 게시글 URL을 아직 찾지 못했습니다." });
          logEvent("inssider_scheduled_reply_post_not_found", { canonicalUrl: item.canonicalUrl, attempts });
          continue;
        }
        const replies = Array.isArray(item.replies) ? item.replies.filter((reply) => reply && reply.replyUrl) : [];
        let replyTargetUrl = replies.length ? replies[replies.length - 1].replyUrl : postUrl;
        for (let index = replies.length; index < replyChunks.length; index += 1) {
          const replyText = String(replyChunks[index] || "").trim();
          if (!replyText) continue;
          const replyResult = await postTerafabxReply(replyTargetUrl, replyText, { validate: false, quick: true });
          replies.push({ index, replyUrl: replyResult.replyUrl, length: replyText.length });
          replyTargetUrl = replyResult.replyUrl || replyTargetUrl;
          patchScheduledReplyItem(item.canonicalUrl, {
            postUrl,
            replies,
            lastReplyAt: new Date().toISOString(),
            lastError: null,
          });
          if (index < replyChunks.length - 1) await sleep(300);
        }
        patchScheduledReplyItem(item.canonicalUrl, {
          status: "done",
          postUrl,
          replies,
          completedAt: new Date().toISOString(),
          lastError: null,
        });
        logEvent("inssider_scheduled_replies_done", { canonicalUrl: item.canonicalUrl, postUrl, replyCount: replies.length });
      } catch (error) {
        patchScheduledReplyItem(item.canonicalUrl, {
          status: attempts >= 20 ? "failed" : "pending",
          attempts,
          lastError: error.message,
        });
        logEvent("inssider_scheduled_replies_error", { canonicalUrl: item.canonicalUrl, attempts, error: error.message });
      }
    }
    return { ok: true, processed: pending.length };
  } finally {
    scheduledReplyBusy = false;
  }
}

async function enqueueMissingScheduledInssiderReplyItems() {
  const state = loadScheduledReplyState();
  const existing = new Set((state.items || []).map((item) => item.canonicalUrl));
  const scheduledHistory = loadMirrorHistory().filter((entry) => entry.status === "scheduled" && isInssiderPostUrl(entry.canonicalUrl));
  if (!scheduledHistory.length) return;
  const rows = await listDiscoveryRows(500);
  for (const history of scheduledHistory) {
    if (existing.has(history.canonicalUrl)) continue;
    const row = rows.find((item) => item.canonicalUrl === history.canonicalUrl);
    if (!row) continue;
    let criteria = {};
    try { criteria = JSON.parse(row.criteria || "{}"); } catch {}
    const replyChunks = Array.isArray(criteria.inssiderReplyChunks)
      ? criteria.inssiderReplyChunks.map((chunk) => String(chunk || "").trim()).filter(Boolean)
      : [];
    if (!replyChunks.length) continue;
    upsertScheduledReplyItem({
      canonicalUrl: history.canonicalUrl,
      scheduledAt: history.scheduledAt,
      text: row.textPreview,
      replyChunks,
      source: "backfill",
    });
  }
}

async function listDiscoveryRows(limit = 20) {
  const db = await getDiscoveryDb();
  return db.prepare(`
    SELECT canonical_url AS canonicalUrl, author, text_preview AS textPreview,
      media_preview_url AS mediaPreviewUrl, like_count AS likeCount, media_count AS mediaCount, viral_score AS viralScore,
      criteria, status,
      scheduled_post_at AS scheduledPostAt, discovered_at AS discoveredAt,
      posted_at AS postedAt, last_error AS lastError, attempts
    FROM thread_discoveries
    WHERE status != 'skipped'
    ORDER BY discovered_at DESC
    LIMIT ?
  `).all(limit);
}

async function getDiscoveryRow(canonicalUrl) {
  const db = await getDiscoveryDb();
  return db.prepare(`
    SELECT canonical_url AS canonicalUrl, author, text_preview AS textPreview,
      media_preview_url AS mediaPreviewUrl, like_count AS likeCount, media_count AS mediaCount, viral_score AS viralScore,
      criteria, status,
      scheduled_post_at AS scheduledPostAt, discovered_at AS discoveredAt,
      posted_at AS postedAt, last_error AS lastError, attempts
    FROM thread_discoveries
    WHERE canonical_url = ? AND status != 'skipped'
  `).get(canonicalUrl);
}

async function markDiscoveryPosted(canonicalUrl, mediaCount) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'posted', posted_at = CURRENT_TIMESTAMP, last_error = NULL, media_count = MAX(media_count, ?)
    WHERE canonical_url = ?
  `).run(mediaCount || 0, canonicalUrl);
}

async function markDiscoveryPostFailed(canonicalUrl, error) {
  const db = await getDiscoveryDb();
  const message = error.message || String(error);
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'failed_post',
        last_error = ?,
        attempts = attempts + 1,
        text_preview = CASE
          WHEN text_preview = '' OR text_preview = '수집 중' OR text_preview = '(본문 없음)' THEN ?
          ELSE text_preview
        END,
        discovered_at = CURRENT_TIMESTAMP
    WHERE canonical_url = ?
  `).run(message, discoveryFailurePreviewText(error, "post"), canonicalUrl);
}

async function markDiscoveryDrafted(canonicalUrl, mediaCount) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'x_draft', posted_at = CURRENT_TIMESTAMP, last_error = NULL, media_count = MAX(media_count, ?)
    WHERE canonical_url = ?
  `).run(mediaCount || 0, canonicalUrl);
}

async function markDiscoveryDraftFailed(canonicalUrl, error) {
  const db = await getDiscoveryDb();
  const message = error.message || String(error);
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'failed_draft',
        last_error = ?,
        attempts = attempts + 1,
        text_preview = CASE
          WHEN text_preview = '' OR text_preview = '수집 중' OR text_preview = '(본문 없음)' THEN ?
          ELSE text_preview
        END,
        discovered_at = CURRENT_TIMESTAMP
    WHERE canonical_url = ?
  `).run(message, discoveryFailurePreviewText(error, "draft"), canonicalUrl);
}

async function markDiscoveryScheduled(canonicalUrl, mediaCount, scheduledAt) {
  const db = await getDiscoveryDb();
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'scheduled', scheduled_post_at = ?, posted_at = CURRENT_TIMESTAMP,
        last_error = NULL, media_count = MAX(media_count, ?)
    WHERE canonical_url = ?
  `).run(scheduledAt || null, mediaCount || 0, canonicalUrl);
}

async function markDiscoveryScheduleFailed(canonicalUrl, error) {
  const db = await getDiscoveryDb();
  const message = error.message || String(error);
  const failurePreview = discoveryFailurePreviewText(error, "schedule");
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'failed_schedule',
        last_error = ?,
        attempts = attempts + 1,
        text_preview = CASE
          WHEN text_preview = '' OR text_preview = '수집 중' OR text_preview = '(본문 없음)' THEN ?
          ELSE text_preview
        END,
        discovered_at = CURRENT_TIMESTAMP
    WHERE canonical_url = ?
  `).run(message, failurePreview, canonicalUrl);
}

async function discardDiscoveredRows() {
  const db = await getDiscoveryDb();
  const result = await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'skipped', last_error = 'discarded_by_user'
    WHERE status IN ('review', 'draft', 'failed', 'failed_post', 'failed_draft', 'failed_schedule')
  `).run();
  logEvent("discovery_discovered_rows_discarded", { changes: result.changes || 0 });
  return { discarded: result.changes || 0 };
}

async function discardDiscoveryRow(canonicalUrl) {
  const url = validateThreadsUrl(canonicalUrl);
  const db = await getDiscoveryDb();
  const result = await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'skipped', last_error = 'discarded_by_user', discovered_at = CURRENT_TIMESTAMP
    WHERE canonical_url = ?
      AND status IN ('review', 'draft', 'failed', 'failed_post', 'failed_draft', 'failed_schedule', 'discovered')
  `).run(url);
  if (!result.changes) {
    throw new Error("삭제할 수 있는 대시보드 항목을 찾지 못했습니다.");
  }
  logEvent("discovery_row_discarded", { canonicalUrl: url });
  return { canonicalUrl: url, discarded: result.changes || 0 };
}

async function updateDiscoveryTitle(canonicalUrl, text) {
  const title = String(text || "").trim();
  if (!title) {
    throw new Error("제목을 비워둘 수 없습니다.");
  }
  if (title.length > 280) {
    throw new Error("제목은 280자 이하로 입력해 주세요.");
  }
  const db = await getDiscoveryDb();
  const result = await db.prepare(`
    UPDATE thread_discoveries
    SET text_preview = ?, last_error = NULL
    WHERE canonical_url = ? AND status != 'skipped'
  `).run(title, canonicalUrl);
  if (!result.changes) {
    throw new Error("대시보드 항목을 찾지 못했습니다.");
  }
  logEvent("discovery_title_updated", { canonicalUrl, length: title.length });
  return { canonicalUrl, text: title };
}

async function refreshDiscoveryPreviews(limit = 20) {
  const db = await getDiscoveryDb();
  const rows = await db.prepare(`
    SELECT canonical_url AS canonicalUrl
    FROM thread_discoveries
    WHERE media_preview_url = '' OR text_preview LIKE '%\\n1\\n/%' OR text_preview LIKE '%\\n/%'
    ORDER BY discovered_at DESC
    LIMIT ?
  `).all(limit);
  const refreshed = [];
  const failed = [];
  for (const row of rows) {
    try {
      const post = await extractThreadPost(row.canonicalUrl);
      await db.prepare(`
        UPDATE thread_discoveries
        SET text_preview = ?, media_preview_url = COALESCE(NULLIF(?, ''), media_preview_url),
            media_count = ?, last_error = NULL
        WHERE canonical_url = ?
      `).run(post.text.slice(0, 240), post.mediaUrls[0] || post.imageMediaUrls?.[0] || "", post.mediaUrls.length, row.canonicalUrl);
      refreshed.push(row.canonicalUrl);
    } catch (error) {
      failed.push({ canonicalUrl: row.canonicalUrl, error: error.message });
    }
  }
  return { refreshed, failed };
}

async function refetchDiscoveryRow(canonicalUrl, options = {}) {
  const url = validateThreadsUrl(canonicalUrl);
  const db = await getDiscoveryDb();
  const existing = await db.prepare(`
    SELECT canonical_url AS canonicalUrl, status
    FROM thread_discoveries
    WHERE canonical_url = ?
  `).get(url);
  if (!existing) {
    throw new Error("대시보드 항목을 찾지 못했습니다.");
  }
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'review',
        text_preview = '수집 중',
        media_preview_url = '',
        media_count = 0,
        last_error = NULL,
        discovered_at = CURRENT_TIMESTAMP
    WHERE canonical_url = ?
      AND status NOT IN ('scheduled', 'posted', 'x_draft')
  `).run(url);
  try {
    const result = await addThreadToDiscoveryReview(url, { text: options.text });
    logEvent("discovery_refetch_ok", { canonicalUrl: url, mediaCount: result.mediaCount });
    return result;
  } catch (error) {
    await markDiscoveryDetailError(url, error).catch(() => {});
    logEvent("discovery_refetch_error", { canonicalUrl: url, error: error.message });
    throw error;
  }
}

function formatDashboardDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return parts.replace("T", " ");
}

async function renderDiscoveryDashboard(requestUrl = "/discovery") {
  const parsedUrl = new URL(requestUrl, "http://localhost");
  const activeView = parsedUrl.searchParams.get("view") || "discovered";
  const autoDiscoveryEnabled = isAutoDiscoveryEnabled();
  const terafabx = getTerafabxAutomationStatus();
  const grokEngineLabel = terafabx.grokProvider === "web" ? "Grok Web Headless" : `Grok CLI(${path.basename(GROK_BIN)})`;
  const nowMs = Date.now();
  const allRows = mergeDiscoveryRowsWithMirrorHistory(await listDiscoveryRows(300), nowMs);
  const dashboardRows = allRows.map((row) => dashboardDiscoveryRow(row, nowMs));
  const discoveredStatuses = new Set(["review", "draft", "failed", "failed_post", "failed_draft", "failed_schedule"]);
  const viewRows = {
    discovered: dashboardRows.filter((row) => discoveredStatuses.has(row.status)),
    scheduled: dashboardRows.filter((row) => {
      const time = new Date(row.scheduledPostAt || 0).getTime();
      return row.status === "scheduled" && Number.isFinite(time) && time > nowMs;
    }),
    posted: dashboardRows.filter((row) => row.status === "posted"),
  };
  const rows = (viewRows[activeView] || viewRows.discovered).sort((a, b) => {
    if (activeView === "scheduled") {
      return new Date(a.scheduledPostAt || 0).getTime() - new Date(b.scheduledPostAt || 0).getTime();
    }
    if (activeView === "posted") {
      return new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime();
    }
    return new Date(b.discoveredAt || 0).getTime() - new Date(a.discoveredAt || 0).getTime();
  });
  const counts = allRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const discoveredCount = viewRows.discovered.length;
  const scheduledCount = viewRows.scheduled.length;
  const postedCount = viewRows.posted.length;
  const failedCount = Number((counts.failed || 0) + (counts.failed_post || 0) + (counts.failed_draft || 0) + (counts.failed_schedule || 0));
  const nextScheduledAt = viewRows.scheduled
    .map((row) => new Date(row.scheduledPostAt || 0).getTime())
    .filter((time) => Number.isFinite(time) && time > nowMs)
    .sort((a, b) => a - b)[0];
  const latestPostedAt = viewRows.posted
    .map((row) => new Date(row.postedAt || 0).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  const activeViewLabel = {
    discovered: "발굴됨",
    scheduled: "게시예정",
    posted: "게시됨",
  }[activeView] || "발굴됨";
  const cards = rows.map((row) => {
    const canPost = ["review", "draft", "failed", "failed_post", "failed_draft", "failed_schedule"].includes(row.status);
    const criteria = (() => {
      try {
        return JSON.parse(row.criteria || "{}");
      } catch {
        return {};
      }
    })();
    const badges = [
      `좋아요 ${Number(row.likeCount || 0).toLocaleString("ko-KR")}`,
      `미디어 ${row.mediaCount}`,
      `점수 ${row.viralScore}`,
      row.status,
    ];
    if (row.scheduledPostAt) badges.push(`예약 ${formatDashboardDateTime(row.scheduledPostAt)}`);
    if (row.postedAt && !row.scheduledPostAt) badges.push(`게시 ${formatDashboardDateTime(row.postedAt)}`);
    const timelineTime = row.scheduledPostAt || row.postedAt || row.discoveredAt;
    const timelineLabel = row.scheduledPostAt ? "예약" : row.postedAt ? "처리" : "발굴";
    const timelineText = `${timelineLabel} ${formatDashboardDateTime(timelineTime)}`;
    const timelineState = row.scheduledPostAt ? "is-scheduled" : row.postedAt ? "is-posted" : "is-review";
    const publishTimeHtml = row.scheduledPostAt
      ? `<div class="publish-time is-scheduled"><span>게시 예정 시간</span><strong>${escapeHtml(formatDashboardDateTime(row.scheduledPostAt))}</strong></div>`
      : row.postedAt
        ? `<div class="publish-time is-posted"><span>게시된 시간</span><strong>${escapeHtml(formatDashboardDateTime(row.postedAt))}</strong></div>`
        : "";
    const mediaPreview = row.mediaPreviewUrl
      ? (/\.mp4|\/o1\/v\/t16\//i.test(row.mediaPreviewUrl)
        ? `<video class="media-preview" src="${escapeHtml(row.mediaPreviewUrl)}" muted playsinline controls loop preload="metadata"></video>`
        : `<img class="media-preview" src="${escapeHtml(row.mediaPreviewUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`)
      : `<a class="media-empty" href="${escapeHtml(row.canonicalUrl)}" target="_blank" rel="noreferrer">미리보기 보강 필요</a>`;
    const mediaDownload = row.mediaPreviewUrl
      ? `<a class="media-download" href="/api/discovery/media-download?url=${encodeURIComponent(row.mediaPreviewUrl)}">미디어 다운로드</a>`
      : "";
    const previewText = row.textPreview || "(본문 없음)";
    const previewNeedsMore = previewText.split("\n").length > 2 || previewText.length > 54;
    const previewHtml = previewNeedsMore
      ? `<details class="preview-box">
          <summary><span class="preview">${escapeHtml(previewText)}</span><span class="more">더보기</span></summary>
          <p>${escapeHtml(previewText)}</p>
        </details>`
      : `<div class="preview-box"><p class="preview-full">${escapeHtml(previewText)}</p></div>`;
    const titleEditor = `
      <label class="title-editor">
        <span>게시 제목</span>
        <textarea data-title-input="${escapeHtml(row.canonicalUrl)}" maxlength="280" rows="3">${escapeHtml(previewText)}</textarea>
      </label>
      <button type="button" class="save-title" data-save-title="${escapeHtml(row.canonicalUrl)}">제목 저장</button>
    `;
    return `
      <article class="card ${timelineState}" data-url="${escapeHtml(row.canonicalUrl)}" data-time="${escapeHtml(timelineText)}">
        <div class="media-frame">${mediaPreview}${mediaDownload}</div>
        <div class="meta">
          ${badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
        </div>
        ${publishTimeHtml}
        <h2>@${escapeHtml(row.author)}</h2>
        ${previewHtml}
        ${titleEditor}
        <div class="criteria">
          <span>짧은 훅: ${criteria.shortHook ? "Y" : "N"}</span>
          <span>강한 미디어: ${criteria.strongMedia ? "Y" : "N"}</span>
          <span>논쟁성: ${criteria.controversy ? "Y" : "N"}</span>
        </div>
        <div class="actions">
          <a class="source-link" href="${escapeHtml(row.canonicalUrl)}" target="_blank" rel="noreferrer">원문 열기</a>
          <button ${canPost ? "" : "disabled"} data-post="${escapeHtml(row.canonicalUrl)}">${canPost ? "게시" : "처리됨"}</button>
          <button ${canPost ? "" : "disabled"} data-draft="${escapeHtml(row.canonicalUrl)}">${canPost ? "초안 저장" : "처리됨"}</button>
          <input ${canPost ? "" : "disabled"} class="schedule-input" data-schedule-input="${escapeHtml(row.canonicalUrl)}" type="datetime-local" />
          <button ${canPost ? "" : "disabled"} data-schedule="${escapeHtml(row.canonicalUrl)}">${canPost ? "예약 게시" : "처리됨"}</button>
          <button ${canPost ? "" : "disabled"} class="auto-schedule" data-auto-schedule="${escapeHtml(row.canonicalUrl)}">${canPost ? "자동 예약" : "처리됨"}</button>
        </div>
        ${row.lastError && !/superseded by short_hook_strong_media_controversy filter/i.test(row.lastError) ? `<details class="diagnostic"><summary>오류 로그</summary><p>${escapeHtml(row.lastError)}</p></details>` : ""}
      </article>
    `;
  }).join("");
  const terafabxPanel = `
    <section class="terafabx-panel" id="terafabx-automation">
      <div class="terafabx-head">
        <div>
          <h2>과즙루피 자동화</h2>
          <p>Hermes CLI 미사용 · 댓글 생성: ${escapeHtml(grokEngineLabel)} · 댓글/하트 실행: mirror_server.js CDP 코드 · Chrome ${escapeHtml(CHROME_PORT)}</p>
        </div>
        <button type="button" id="terafabx-refresh">상태 새로고침</button>
      </div>
      <div class="terafabx-grid">
        <article class="terafabx-card">
          <div class="terafabx-title"><strong>자동댓글</strong><span>${terafabx.comment.enabled ? "ON" : "OFF"}</span></div>
          <p>엔진: ${escapeHtml(grokEngineLabel)} + Gemini Web Headless ${terafabx.geminiReview.enabled ? `(Chrome ${Number(terafabx.geminiReview.chromePort || 0)})` : "(OFF)"} · 상태: ${escapeHtml(terafabx.comment.lastStatus || "대기")}</p>
          <p>최근 실행: ${escapeHtml(terafabx.comment.lastRunAt ? formatDashboardDateTime(terafabx.comment.lastRunAt) : "-")}</p>
          <p>다음 자동: ${escapeHtml(terafabx.comment.nextRunAt ? formatDashboardDateTime(terafabx.comment.nextRunAt) : "OFF")}</p>
          <p class="terafabx-last">최근 댓글: ${escapeHtml(terafabx.comment.lastComment || "-")}</p>
          ${terafabx.comment.lastReplyUrl ? `<a href="${escapeHtml(terafabx.comment.lastReplyUrl)}" target="_blank" rel="noreferrer">최근 답글 열기</a>` : ""}
          ${terafabx.comment.lastError ? `<p class="terafabx-error">오류: ${escapeHtml(terafabx.comment.lastError)}</p>` : ""}
          <div class="terafabx-actions">
            <button type="button" data-terafabx-action="run" data-terafabx-job="comment">지금 댓글 1회</button>
            <button type="button" data-terafabx-action="enable" data-terafabx-job="comment">ON</button>
            <button type="button" data-terafabx-action="disable" data-terafabx-job="comment">OFF</button>
          </div>
        </article>
        <article class="terafabx-card">
          <div class="terafabx-title"><strong>하트</strong><span>${terafabx.heart.enabled ? "ON" : "OFF"}</span></div>
          <p>엔진: 로컬 CDP 스크립트 · 상태: ${escapeHtml(terafabx.heart.lastStatus || "대기")}</p>
          <p>최근 실행: ${escapeHtml(terafabx.heart.lastRunAt ? formatDashboardDateTime(terafabx.heart.lastRunAt) : "-")} · 최근 ${Number(terafabx.heart.lastCount || 0)}개</p>
          <p>다음 자동: ${escapeHtml(terafabx.heart.nextRunAt ? formatDashboardDateTime(terafabx.heart.nextRunAt) : "OFF")}</p>
          <p class="terafabx-last">대상: X 홈/For You/Following 공개 타임라인</p>
          ${terafabx.heart.lastError ? `<p class="terafabx-error">오류: ${escapeHtml(terafabx.heart.lastError)}</p>` : ""}
          <div class="terafabx-actions">
            <button type="button" data-terafabx-action="run" data-terafabx-job="heart">지금 하트 1회</button>
            <button type="button" data-terafabx-action="enable" data-terafabx-job="heart">ON</button>
            <button type="button" data-terafabx-action="disable" data-terafabx-job="heart">OFF</button>
          </div>
        </article>
      </div>
      <pre id="terafabx-result">락: ${terafabx.lock.busy ? `사용 중 ${escapeHtml(terafabx.lock.action || "")}` : "대기"}</pre>
    </section>
  `;
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Threads 발굴 대시보드</title>
  <style>
    :root { --bg: #f8fafc; --card: #fff; --border: #e5e7eb; --muted: #64748b; --soft: #f1f5f9; --ink: #0f172a; --primary: #111827; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--ink); }
    header { position: sticky; top: 0; z-index: 3; background: rgba(255,255,255,.94); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); padding: 14px 18px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h1 { margin: 0; font-size: 18px; }
    .summary { color: var(--muted); font-size: 13px; }
    .add-url { max-width: 1180px; margin: 0 auto; padding: 14px 16px 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .add-url input { min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 9px 10px; font-size: 14px; background: var(--card); }
    .add-url button { flex: none; }
    .timeline-summary { max-width: 1180px; margin: 0 auto; padding: 14px 16px 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .summary-card { min-width: 0; border: 1px solid var(--border); border-radius: 14px; background: var(--card); padding: 14px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
    .summary-card span { display: block; color: var(--muted); font-size: 12px; }
    .summary-card strong { display: block; margin-top: 6px; font-size: 22px; line-height: 1.1; }
    .posting-timeline { max-width: 1180px; margin: 14px auto 24px; border: 1px solid var(--border); border-radius: 16px; background: var(--card); color: var(--ink); overflow: hidden; }
    .view-tabs { max-width: 1180px; margin: 0 auto; padding: 14px 16px 0; display: flex; flex-wrap: wrap; gap: 8px; }
    .view-tab { flex: 0 0 auto; border: 1px solid var(--border); border-radius: 999px; padding: 8px 12px; background: var(--card); color: var(--ink); font-size: 13px; text-decoration: none; }
    .view-tab[aria-current="page"] { background: var(--primary); border-color: var(--primary); color: #fff; }
    .timeline-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--border); padding: 12px 16px; }
    .toolbar-badges { display: flex; flex-wrap: wrap; gap: 8px; }
    .toolbar-badges span, .meta span, .criteria span { background: var(--soft); border: 1px solid transparent; border-radius: 999px; padding: 4px 8px; color: #334155; font-size: 12px; }
    main { padding: 0 16px 16px; display: flex; flex-direction: column; }
    .card { position: relative; min-width: 0; display: grid; grid-template-columns: minmax(7.5rem, .24fr) 2.5rem minmax(0, 1fr); gap: 12px; padding: 16px 0; background: linear-gradient(to right, transparent calc(24% + 1.25rem - .5px), var(--border) calc(24% + 1.25rem - .5px), var(--border) calc(24% + 1.25rem + .5px), transparent calc(24% + 1.25rem + .5px)); border: 0; }
    .card::before { content: attr(data-time); grid-column: 1; align-self: start; padding-top: 4px; color: var(--muted); font-size: 12px; line-height: 1.45; text-align: right; }
    .card::after { content: ""; grid-column: 2; grid-row: 1; width: 36px; height: 36px; border-radius: 999px; border: 1px solid var(--border); background: var(--soft); box-shadow: inset 0 0 0 9px var(--card); justify-self: center; align-self: start; z-index: 1; }
    .card.is-scheduled::after { border-color: var(--primary); background: var(--primary); box-shadow: inset 0 0 0 10px var(--primary); }
    .card.is-posted::after { background: #e2e8f0; }
    .card.is-review::after { background: #fff; }
    .card > * { grid-column: 3; min-width: 0; }
    .card > .media-frame, .card > .meta, .card > h2, .card > .preview-box, .card > .title-editor, .card > .save-title, .card > .criteria, .card > .actions, .card > .diagnostic { background: var(--card); }
    .card > .media-frame { border-top-left-radius: 14px; border-top-right-radius: 14px; }
    .card > .meta { order: -1; border: 1px solid var(--border); border-bottom: 0; border-radius: 14px 14px 0 0; padding: 14px 14px 0; }
    .card > h2 { margin: 0; border-left: 1px solid var(--border); border-right: 1px solid var(--border); padding: 10px 14px 0; font-size: 15px; }
    .card > .preview-box, .card > .title-editor, .card > .save-title, .card > .criteria, .card > .actions, .card > .diagnostic { border-left: 1px solid var(--border); border-right: 1px solid var(--border); padding-left: 14px; padding-right: 14px; }
    .card > .actions, .card > .diagnostic { border-bottom: 1px solid var(--border); }
    .card > .actions { border-radius: 0 0 14px 14px; padding-bottom: 14px; }
    .card > .diagnostic { border-radius: 0 0 14px 14px; padding-bottom: 14px; }
    .media-frame { position: relative; width: 100%; height: clamp(260px, 28vw, 420px); background: #111; overflow: hidden; display: grid; place-items: center; border-left: 1px solid var(--border); border-right: 1px solid var(--border); }
    .media-preview { width: 100%; height: 100%; object-fit: contain; display: block; background: #111; }
    .media-empty { color: #555; font-size: 12px; border: 0; padding: 0; background: transparent; text-decoration: underline; }
    .media-download { position: absolute; right: 10px; bottom: 10px; border-radius: 6px; background: rgba(255,255,255,.92); color: #111; padding: 7px 10px; font-size: 12px; font-weight: 700; text-decoration: none; box-shadow: 0 8px 20px rgba(0,0,0,.25); }
    .meta, .criteria { display: flex; flex-wrap: wrap; gap: 6px; font-size: 12px; }
    .publish-time { display: grid; gap: 3px; border: 1px solid #d8dee8; border-radius: 6px; background: #f8fafc; padding: 7px 8px; overflow-wrap: anywhere; }
    .publish-time span { color: var(--muted); font-size: 11px; line-height: 1.2; }
    .publish-time strong { color: #0f172a; font-size: 13px; line-height: 1.25; white-space: normal; }
    .publish-time.is-scheduled { border-color: #111827; background: #eef2ff; }
    .publish-time.is-posted { background: #f1f5f9; }
    .preview-box { min-height: 48px; font-size: 13px; }
    .preview-box summary { list-style: none; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
    .preview-box summary::-webkit-details-marker { display: none; }
    .preview { white-space: pre-wrap; line-height: 1.4; margin: 0; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; min-height: 36px; }
    .more { color: #555; font-size: 12px; text-decoration: underline; }
    .preview-box:not([open]) .more::after { content: ""; }
    .preview-box[open] summary { display: none; }
    .preview-box p { white-space: pre-wrap; line-height: 1.4; margin: 0; overflow-wrap: anywhere; }
    .preview-full { min-height: 36px; }
    .title-editor { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
    .title-editor textarea { width: 100%; box-sizing: border-box; resize: vertical; min-height: 76px; max-height: 160px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 9px; font: inherit; font-size: 13px; color: #111; line-height: 1.45; background: #fff; }
    .save-title { background: #fff; color: #111; }
    .diagnostic { color: #8a1f11; font-size: 12px; }
    .diagnostic p { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 10px; }
    a, button { flex: 0 0 auto; min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; font-size: 12px; line-height: 1.3; text-align: center; text-decoration: none; color: #111; background: #fff; cursor: pointer; }
    .schedule-input { min-width: 190px; box-sizing: border-box; border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 12px; color: #111; background: #fff; }
    .schedule-input:disabled { opacity: .45; cursor: not-allowed; }
    .auto-schedule { background: #111; color: #fff; }
    button { background: #111; color: #fff; border-color: #111; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    #scan, #refresh, #auto-refresh-toggle, #auto-discovery-toggle { background: #fff; color: #111; }
    #auto-refresh-toggle[data-enabled="false"] { background: #111; color: #fff; }
    #auto-discovery-toggle[data-enabled="false"] { background: #111; color: #fff; }
    .header-actions { display: flex; gap: 8px; }
    .header-actions button { flex: none; }
    .dashboard-overview { max-width: 1800px; margin: 0 auto; padding: 12px 14px 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .terafabx-panel { max-width: 1800px; margin: 12px auto 0; padding: 14px; border: 1px solid var(--border); border-radius: 10px; background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
    .terafabx-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .terafabx-head h2 { margin: 0; font-size: 16px; }
    .terafabx-head p, .terafabx-card p { margin: 5px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; }
    .terafabx-grid { margin-top: 12px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .terafabx-card { min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: #f8fafc; }
    .terafabx-title { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
    .terafabx-title strong { font-size: 14px; }
    .terafabx-title span { border-radius: 999px; background: #111; color: #fff; font-size: 11px; padding: 3px 7px; }
    .terafabx-last { overflow-wrap: anywhere; }
    .terafabx-error { color: #b42318 !important; }
    .terafabx-actions { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
    .terafabx-actions button, #terafabx-refresh { flex: 0 0 auto; }
    #terafabx-result { margin: 12px 0 0; max-height: 180px; overflow: auto; border: 1px solid var(--border); border-radius: 8px; background: #0f172a; color: #e2e8f0; padding: 10px; font-size: 12px; white-space: pre-wrap; }
    .metric-card { min-width: 0; border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 14px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
    .metric-card span { display: block; color: var(--muted); font-size: 12px; font-weight: 600; }
    .metric-card strong { display: block; margin-top: 8px; color: var(--ink); font-size: 24px; line-height: 1; letter-spacing: 0; }
    .metric-card p { margin: 8px 0 0; color: var(--muted); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
    .empty-state { grid-column: 1 / -1; margin: 0; border: 1px dashed var(--border); border-radius: 8px; background: #fff; padding: 32px 16px; color: var(--muted); text-align: center; font-size: 14px; }
    .view-tabs, .timeline-summary, .add-url { max-width: 1800px; }
    header { padding: 12px 18px; }
    header h1 { font-size: 17px; font-weight: 700; letter-spacing: 0; }
    .add-url { padding-top: 12px; }
    .add-url input { border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
    .view-tabs { padding-top: 12px; border: 0; }
    .view-tab { border-radius: 8px; padding: 8px 11px; box-shadow: 0 1px 2px rgba(15, 23, 42, .03); }
    .posting-timeline { max-width: 1800px; margin: 12px auto 24px; border: 0; border-radius: 0; background: transparent; overflow: visible; }
    .timeline-toolbar { display: none; }
    main { max-width: 1800px; margin: 0 auto; padding: 0 14px 14px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; align-items: start; }
    .card { min-width: 0; min-height: 430px; display: flex; flex-direction: column; gap: 8px; padding: 10px; background: #fff; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
    .card:hover { box-shadow: 0 4px 12px rgba(15, 23, 42, .07); }
    .card::before, .card::after { content: none; display: none; }
    .card > * { grid-column: auto; min-width: 0; }
    .card > .media-frame, .card > .meta, .card > .publish-time, .card > h2, .card > .preview-box, .card > .title-editor, .card > .save-title, .card > .criteria, .card > .actions, .card > .diagnostic { border: 0; padding-left: 0; padding-right: 0; background: transparent; }
    .card > .publish-time { border: 1px solid #d8dee8; padding: 7px 8px; background: #f8fafc; }
    .card > .publish-time.is-scheduled { border-color: #111827; background: #eef2ff; }
    .card > .publish-time.is-posted { background: #f1f5f9; }
    .card > .meta { order: 0; padding: 0; }
    .card > h2 { padding: 0; }
    .card > .actions, .card > .diagnostic { border: 0; }
    .card > .actions { border-radius: 0; padding-bottom: 0; }
    .card > .diagnostic { border-radius: 0; padding-bottom: 0; }
    .media-frame { border: 0; border-radius: 6px; height: clamp(220px, 18vw, 320px); }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: auto; padding-top: 0; }
    .schedule-input { min-width: 0; width: 100%; }
    .source-link, .auto-schedule { grid-column: 1 / -1; }
    a, button { flex: 1; padding: 8px 8px; font-size: 13px; }
    .meta span, .criteria span { border-radius: 6px; padding: 4px 7px; font-size: 11px; font-weight: 500; }
    .preview-box { color: #111827; }
    .title-editor span { font-weight: 600; }
    .save-title { border-color: var(--border); }
    .actions button, .actions a { border-radius: 6px; font-weight: 600; }
    .actions a, .save-title { background: #fff; color: #111827; border-color: var(--border); }
    @media (max-width: 1400px) { main { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
    @media (max-width: 1100px) { main { grid-template-columns: repeat(3, minmax(0, 1fr)); } .dashboard-overview { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      header { align-items: flex-start; flex-direction: column; }
      .add-url { grid-template-columns: 1fr; padding: 10px 10px 0; }
      .dashboard-overview { grid-template-columns: 1fr 1fr; padding: 10px 10px 0; gap: 8px; }
      .timeline-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 10px 10px 0; }
      .view-tabs { padding: 10px 10px 0; }
      .posting-timeline { margin: 10px 10px 20px; }
      main { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 0 10px 10px; }
      .actions { display: grid; grid-template-columns: 1fr 1fr; }
      .source-link, .schedule-input, .auto-schedule { grid-column: 1 / -1; width: 100%; }
    }
    @media (max-width: 520px) { .timeline-summary, .dashboard-overview { grid-template-columns: 1fr; } main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Threads 발굴 대시보드</h1>
      <div class="summary">5분마다 스캔 · 좋아요 1000+ · 미디어 포함 · X 초안 저장 안 함 · ${escapeHtml(JSON.stringify(counts))}</div>
    </div>
    <div class="header-actions">
      <button id="auto-discovery-toggle" type="button" aria-pressed="${autoDiscoveryEnabled ? "true" : "false"}" data-enabled="${autoDiscoveryEnabled ? "true" : "false"}">${autoDiscoveryEnabled ? "자동 발굴 중지" : "자동 발굴 재개"}</button>
      <button id="auto-refresh-toggle" type="button" aria-pressed="true" data-enabled="true">자동새로고침 끄기</button>
      <button id="refresh">미리보기 보강</button>
      <button id="scan">지금 스캔</button>
    </div>
  </header>
  <form class="add-url" id="add-url-form">
    <input id="add-url-input" type="url" placeholder="Threads URL 추가" autocomplete="off" />
    <button id="add-url-button" type="submit">추가</button>
  </form>
  <section class="dashboard-overview" aria-label="대시보드 요약">
    <article class="metric-card">
      <span>발굴 대기</span>
      <strong>${Number(discoveredCount).toLocaleString("ko-KR")}</strong>
      <p>수동 검토 대상</p>
    </article>
    <article class="metric-card">
      <span>게시 예정</span>
      <strong>${Number(scheduledCount).toLocaleString("ko-KR")}</strong>
      <p>다음 ${nextScheduledAt ? escapeHtml(formatDashboardDateTime(nextScheduledAt)) : "-"}</p>
    </article>
    <article class="metric-card">
      <span>게시됨</span>
      <strong>${Number(postedCount).toLocaleString("ko-KR")}</strong>
      <p>최근 ${latestPostedAt ? escapeHtml(formatDashboardDateTime(latestPostedAt)) : "-"}</p>
    </article>
    <article class="metric-card">
      <span>자동 발굴</span>
      <strong>${autoDiscoveryEnabled ? "ON" : "OFF"}</strong>
      <p>${failedCount ? `재시도 ${Number(failedCount).toLocaleString("ko-KR")}개` : "오류 없음"}</p>
    </article>
  </section>
  ${terafabxPanel}
  <nav class="view-tabs" aria-label="대시보드 보기">
    <a class="view-tab" href="/discovery?view=discovered" ${activeView === "discovered" ? 'aria-current="page"' : ""}>발굴됨 ${Number(discoveredCount).toLocaleString("ko-KR")}</a>
    <a class="view-tab" href="/discovery?view=scheduled" ${activeView === "scheduled" ? 'aria-current="page"' : ""}>게시예정 ${Number(scheduledCount).toLocaleString("ko-KR")}</a>
    <a class="view-tab" href="/discovery?view=posted" ${activeView === "posted" ? 'aria-current="page"' : ""}>게시됨 ${Number(postedCount).toLocaleString("ko-KR")}</a>
  </nav>
  <section class="posting-timeline" aria-label="게시 타임라인">
    <div class="timeline-toolbar">
      <div class="toolbar-badges">
        <span>예약 예정 ${Number(counts.scheduled || 0).toLocaleString("ko-KR")}</span>
        <span>게시 완료 ${Number(counts.posted || 0).toLocaleString("ko-KR")}</span>
      </div>
      <span class="summary">예약은 위, 최신 발굴은 아래 흐름으로 확인합니다.</span>
    </div>
    <main>${cards || `<p class="empty-state">${escapeHtml(activeViewLabel)} 항목이 없습니다.</p>`}</main>
  </section>
  <script>
    const initialDashboardState = {
      firstUrl: ${JSON.stringify(allRows[0]?.canonicalUrl || "")},
      rowCount: ${allRows.length},
      view: ${JSON.stringify(activeView)}
    };
    const autoRefreshStorageKey = "threadDashboard.autoRefreshEnabled";
    const autoRefreshToggle = document.getElementById("auto-refresh-toggle");
    const autoDiscoveryToggle = document.getElementById("auto-discovery-toggle");
    function isAutoRefreshEnabled() {
      return localStorage.getItem(autoRefreshStorageKey) !== "false";
    }
    function renderAutoRefreshToggle() {
      const enabled = isAutoRefreshEnabled();
      autoRefreshToggle.dataset.enabled = String(enabled);
      autoRefreshToggle.setAttribute("aria-pressed", String(enabled));
      autoRefreshToggle.textContent = enabled ? "자동새로고침 끄기" : "자동새로고침 켜기";
    }
    renderAutoRefreshToggle();
    autoRefreshToggle.addEventListener("click", () => {
      localStorage.setItem(autoRefreshStorageKey, String(!isAutoRefreshEnabled()));
      renderAutoRefreshToggle();
    });
    function renderAutoDiscoveryToggle(enabled) {
      autoDiscoveryToggle.dataset.enabled = String(enabled);
      autoDiscoveryToggle.setAttribute("aria-pressed", String(enabled));
      autoDiscoveryToggle.textContent = enabled ? "자동 발굴 중지" : "자동 발굴 재개";
    }
    autoDiscoveryToggle.addEventListener("click", async () => {
      const nextEnabled = autoDiscoveryToggle.dataset.enabled !== "true";
      autoDiscoveryToggle.disabled = true;
      autoDiscoveryToggle.textContent = nextEnabled ? "재개 중" : "중지 중";
      try {
        const data = await postJson("/api/discovery/auto-scan", { enabled: nextEnabled });
        renderAutoDiscoveryToggle(data.autoDiscoveryEnabled);
      } catch (error) {
        alert(error.message);
      } finally {
        autoDiscoveryToggle.disabled = false;
      }
    });
    async function postJson(url, body) {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "요청 실패");
      return data;
    }
    async function getJson(url) {
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "요청 실패");
      return data;
    }
    function setTerafabxResult(value) {
      const el = document.getElementById("terafabx-result");
      if (el) el.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    }
    document.getElementById("terafabx-refresh")?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "조회 중";
      try {
        setTerafabxResult(await getJson("/api/terafabx/automation"));
      } catch (error) {
        setTerafabxResult(error.message);
      } finally {
        button.disabled = false;
        button.textContent = "상태 새로고침";
      }
    });
    document.querySelectorAll("[data-terafabx-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const action = button.dataset.terafabxAction;
        const job = button.dataset.terafabxJob;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = "요청 중";
        try {
          const result = await postJson("/api/terafabx/automation", { action, job });
          setTerafabxResult(result);
          setTimeout(() => location.reload(), action === "run" ? 1500 : 600);
        } catch (error) {
          setTerafabxResult(error.message);
          button.disabled = false;
          button.textContent = originalText;
        }
      });
    });
    function toDatetimeLocalValue(date) {
      const pad = (value) => String(value).padStart(2, "0");
      return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate())
      ].join("-") + "T" + [pad(date.getHours()), pad(date.getMinutes())].join(":");
    }
    const defaultScheduleTime = new Date(Date.now() + 15 * 60 * 1000);
    const minScheduleTime = new Date(Date.now() + 5 * 60 * 1000);
    document.querySelectorAll("[data-schedule-input]").forEach((input) => {
      input.min = toDatetimeLocalValue(minScheduleTime);
      if (!input.value) input.value = toDatetimeLocalValue(defaultScheduleTime);
    });
    document.getElementById("add-url-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const input = document.getElementById("add-url-input");
      const button = document.getElementById("add-url-button");
      const url = input.value.trim();
      if (!url) return;
      button.disabled = true;
      button.textContent = "추가 중";
      try {
        await postJson("/api/discovery/add-url-async", { url, origin: "dashboard" });
        location.reload();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "추가";
      }
    });
    document.getElementById("scan").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "스캔 중";
      try {
        await postJson("/api/discovery/run", { minLikes: 1000, maxScrolls: 20 });
        location.reload();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "지금 스캔";
      }
    });
    document.getElementById("refresh").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = "보강 중";
      try {
        await postJson("/api/discovery/refresh-previews", { limit: 5 });
        location.reload();
      } catch (error) {
        alert(error.message);
        button.disabled = false;
        button.textContent = "미리보기 보강";
      }
    });
    document.querySelectorAll("[data-save-title]").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const url = button.dataset.saveTitle;
        const input = document.querySelector('[data-title-input="' + CSS.escape(url) + '"]');
        const text = input ? input.value.trim() : "";
        if (!text) {
          alert("제목을 입력해 주세요.");
          return;
        }
        button.disabled = true;
        button.textContent = "저장 중";
        try {
          await postJson("/api/discovery/title", { url, text });
          const card = button.closest(".card");
          if (card) {
            card.querySelectorAll(".preview, .preview-full, .preview-box p").forEach((node) => {
              node.textContent = text;
            });
          }
          button.textContent = "저장됨";
          setTimeout(() => {
            button.disabled = false;
            button.textContent = "제목 저장";
          }, 900);
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "제목 저장";
        }
      });
    });
    document.querySelectorAll("[data-title-input]").forEach((input) => {
      ["pointerdown", "click", "keydown"].forEach((eventName) => {
        input.addEventListener(eventName, (event) => {
          event.stopPropagation();
        });
      });
    });
    document.querySelectorAll("[data-post]").forEach((button) => {
      button.addEventListener("click", async () => {
        const input = document.querySelector('[data-title-input="' + CSS.escape(button.dataset.post) + '"]');
        const text = input ? input.value.trim() : "";
        button.disabled = true;
        button.textContent = "게시 중";
        try {
          await postJson("/api/discovery/post", { url: button.dataset.post, text });
          location.reload();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "게시";
        }
      });
    });
    document.querySelectorAll("[data-draft]").forEach((button) => {
      button.addEventListener("click", async () => {
        const input = document.querySelector('[data-title-input="' + CSS.escape(button.dataset.draft) + '"]');
        const text = input ? input.value.trim() : "";
        button.disabled = true;
        button.textContent = "초안 저장 중";
        try {
          await postJson("/api/discovery/draft", { url: button.dataset.draft, text });
          location.reload();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "초안 저장";
        }
      });
    });
    document.querySelectorAll("[data-schedule]").forEach((button) => {
      button.addEventListener("click", async () => {
        const titleInput = document.querySelector('[data-title-input="' + CSS.escape(button.dataset.schedule) + '"]');
        const scheduleInput = document.querySelector('[data-schedule-input="' + CSS.escape(button.dataset.schedule) + '"]');
        const text = titleInput ? titleInput.value.trim() : "";
        const scheduledAt = scheduleInput ? scheduleInput.value : "";
        if (!scheduledAt) {
          alert("예약 시간을 선택해 주세요.");
          return;
        }
        button.disabled = true;
        button.textContent = "예약 중";
        try {
          await postJson("/api/discovery/schedule", {
            url: button.dataset.schedule,
            text,
            scheduledAt,
            scheduledAtTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            scheduledAtOffsetMinutes: new Date(scheduledAt).getTimezoneOffset(),
          });
          location.reload();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "예약 게시";
        }
      });
    });
    document.querySelectorAll("[data-auto-schedule]").forEach((button) => {
      button.addEventListener("click", async () => {
        const titleInput = document.querySelector('[data-title-input="' + CSS.escape(button.dataset.autoSchedule) + '"]');
        const text = titleInput ? titleInput.value.trim() : "";
        button.disabled = true;
        button.textContent = "자동 예약 중";
        try {
          await postJson("/api/discovery/auto-schedule", { url: button.dataset.autoSchedule, text });
          location.reload();
        } catch (error) {
          alert(error.message);
          button.disabled = false;
          button.textContent = "자동 예약";
        }
      });
    });
    setInterval(async () => {
      if (!isAutoRefreshEnabled()) return;
      try {
        const res = await fetch("/api/discovery/status", { cache: "no-store" });
        const data = await res.json();
        if (!data.ok) return;
        const firstUrl = data.rows && data.rows[0] ? data.rows[0].canonicalUrl : "";
        if (data.rows.length !== initialDashboardState.rowCount || firstUrl !== initialDashboardState.firstUrl) {
          location.reload();
        }
      } catch {}
    }, 30000);
  </script>
</body>
</html>`;
}

async function getDiscoveryDashboardData(requestUrl = "/api/discovery/dashboard") {
  const parsedUrl = new URL(requestUrl, "http://localhost");
  const activeView = parsedUrl.searchParams.get("view") || "discovered";
  const autoDiscoveryEnabled = isAutoDiscoveryEnabled();
  const nowMs = Date.now();
  const allRows = mergeDiscoveryRowsWithMirrorHistory(await listDiscoveryRows(300), nowMs);
  const avatarEnrichment = activeView === "automation"
    ? await ensureTerafabxFxTwitterAvatars({ limit: 20 }).catch((error) => {
      logEvent("terafabx_dashboard_avatar_enrichment_error", { error: error.message });
      return { error: error.message };
    })
    : null;
  const coupang = await getCoupangPerformanceData().catch((error) => {
    logEvent("coupang_performance_dashboard_error", { error: error.message });
    return { ok: false, error: error.message, rows: [], totals: { click: 0, order: 0, cancel: 0, gmv: 0, commission: 0, conversionRate: 0 } };
  });
  const automation = buildAutomationDashboardData(allRows, nowMs);
  const dashboardRows = allRows.map((row) => dashboardDiscoveryRow(row, nowMs));
  const discoveredStatuses = new Set(["review", "draft", "failed", "failed_post", "failed_draft", "failed_schedule"]);
  const viewRows = {
    discovered: dashboardRows.filter((row) => discoveredStatuses.has(row.status)),
    scheduled: dashboardRows.filter((row) => {
      const time = new Date(row.scheduledPostAt || 0).getTime();
      return row.status === "scheduled" && Number.isFinite(time) && time > nowMs;
    }),
    posted: dashboardRows.filter((row) => row.status === "posted"),
  };
  const rows = (viewRows[activeView] || viewRows.discovered).sort((a, b) => {
    if (activeView === "scheduled") {
      return new Date(a.scheduledPostAt || 0).getTime() - new Date(b.scheduledPostAt || 0).getTime();
    }
    if (activeView === "posted") {
      return new Date(b.postedAt || 0).getTime() - new Date(a.postedAt || 0).getTime();
    }
    return new Date(b.discoveredAt || 0).getTime() - new Date(a.discoveredAt || 0).getTime();
  });
  const counts = allRows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const failedCount = Number((counts.failed || 0) + (counts.failed_post || 0) + (counts.failed_draft || 0) + (counts.failed_schedule || 0));
  const nextScheduledAt = viewRows.scheduled
    .map((row) => new Date(row.scheduledPostAt || 0).getTime())
    .filter((time) => Number.isFinite(time) && time > nowMs)
    .sort((a, b) => a - b)[0];
  const latestPostedAt = viewRows.posted
    .map((row) => new Date(row.postedAt || 0).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  return {
    ok: true,
    view: activeView,
    terafabx: getTerafabxAutomationStatus(),
    coupang,
    automation,
    avatarEnrichment,
    summary: {
      discoveredCount: viewRows.discovered.length,
      scheduledCount: viewRows.scheduled.length,
      postedCount: viewRows.posted.length,
      completedPostCount: automation.summary.postedCount,
      commentCount: automation.summary.commentCount,
      heartCount: automation.summary.heartCount,
      commentQualityScore: automation.summary.commentQualityScore,
      commentQualityGrade: automation.summary.commentQualityGrade,
      lowQualityCommentCount: automation.summary.lowQualityCommentCount,
      commentReviewCount: automation.summary.commentReviewCount,
      pendingCommentReviewCount: automation.summary.pendingCommentReviewCount,
      failedCount,
      autoDiscoveryEnabled,
      nextScheduledAt: nextScheduledAt ? new Date(nextScheduledAt).toISOString() : null,
      latestPostedAt: latestPostedAt ? new Date(latestPostedAt).toISOString() : null,
      lastCommentAt: automation.summary.lastCommentAt,
      lastHeartAt: automation.summary.lastHeartAt,
    },
    rows: rows.map((row) => {
      let criteria = {};
      try {
        criteria = JSON.parse(row.criteria || "{}");
      } catch {}
      return {
        ...row,
        criteria,
        canPost: ["review", "draft", "failed", "failed_post", "failed_draft", "failed_schedule"].includes(row.status),
      };
    }),
  };
}

function scheduleParts(date) {
  const hour24 = date.getHours();
  let hour = hour24;
  const ampm = hour24 >= 12 ? "PM" : "AM";
  hour %= 12;
  if (hour === 0) hour = 12;
  const month = String(date.getMonth() + 1);
  const day = String(date.getDate());
  const year = String(date.getFullYear());
  const minute = String(date.getMinutes()).padStart(2, "0");
  return {
    month,
    day,
    year,
    hour: String(hour),
    minute,
    minuteSelect: String(date.getMinutes()),
    ampm,
    isoDate: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    time24: `${String(hour24).padStart(2, "0")}:${minute}`,
  };
}

async function setXSchedule(page, scheduledAt) {
  const parts = scheduleParts(scheduledAt);
  logEvent("schedule_start", { scheduledAt: scheduledAt.toISOString(), parts });
  const opened = await page.eval(`(() => {
    const direct = document.querySelector('[data-testid="scheduleOption"]');
    if (direct) {
      direct.click();
      return true;
    }
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    const scheduleButton = buttons.find((button) => {
      const text = [
        button.innerText || "",
        button.getAttribute("aria-label") || "",
        button.getAttribute("data-testid") || "",
      ].join(" ");
      return /schedule|예약/i.test(text);
    });
    if (!scheduleButton) return false;
    scheduleButton.click();
    return true;
  })()`);
  if (!opened) throw new Error("X 예약 버튼을 찾지 못했습니다.");
  await sleep(500);

  let filled = null;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    filled = await page.eval(`((parts) => {
      const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible);
      const scope = dialogs[dialogs.length - 1] || document;
      const setValue = (el, value) => {
        if (!el) return;
        if (el.tagName === "SELECT") {
          const exact = Array.from(el.options || []).find((option) => option.value === value);
          const numeric = Array.from(el.options || []).find((option) => String(Number(option.value)) === String(Number(value)));
          el.value = (exact || numeric)?.value || value;
        } else {
          const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value")?.set;
          if (setter) setter.call(el, value);
          else el.value = value;
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const fields = Array.from(scope.querySelectorAll('input, select')).filter(visible);
      const selects = fields.filter((field) => field.tagName === "SELECT");
      const inputs = fields.filter((field) => field.tagName === "INPUT");
      const find = (patterns, pool = fields) => pool.find((field) => {
        const label = [
          field.getAttribute("aria-label") || "",
          field.getAttribute("name") || "",
          field.getAttribute("placeholder") || "",
          field.id || "",
          field.type || "",
        ].join(" ");
        return patterns.some((pattern) => pattern.test(label));
      });
      const month = selects[0] || find([/month/i, /월/]);
      const day = selects[1] || find([/day/i, /일/]);
      const year = selects[2] || find([/year/i, /년/]);
      const hour = selects[3] || find([/hour/i, /시/], selects);
      const minute = selects[4] || find([/minute/i, /분/], selects);
      const ampm = selects[5] || find([/am\\/?pm/i, /오전|오후/], selects);
      const dateInput = find([/^date$/i, /날짜/], inputs);
      const timeInput = find([/^time$/i, /시간/], inputs);
      const required = [month, day, year, hour, minute];
      const diagnostics = {
        dialogCount: dialogs.length,
        fieldCount: fields.length,
        selectCount: selects.length,
        inputCount: inputs.length,
        fields: fields.map((field, index) => ({
          index,
          tag: field.tagName,
          type: field.type || "",
          label: field.getAttribute("aria-label") || "",
          name: field.getAttribute("name") || "",
          id: field.id || "",
          value: field.value || "",
        })).slice(0, 12),
        buttons: Array.from(scope.querySelectorAll('button, [role="button"]')).filter(visible).map((button) => ({
          text: (button.innerText || "").trim(),
          label: (button.getAttribute("aria-label") || "").trim(),
          testid: button.getAttribute("data-testid") || "",
          disabled: Boolean(button.disabled || button.getAttribute("aria-disabled") === "true"),
        })).slice(-12),
        bodyText: (scope.innerText || "").slice(0, 500),
        url: location.href,
      };
      if (required.some((field) => !field)) {
        return { ok: false, reason: "예약 날짜/시간 입력 필드를 찾지 못했습니다.", ...diagnostics };
      }
      setValue(month, parts.month);
      setValue(day, parts.day);
      setValue(year, parts.year);
      setValue(hour, parts.hour);
      setValue(minute, parts.minuteSelect || parts.minute);
      if (ampm) setValue(ampm, parts.ampm.toLowerCase());
      if (dateInput) setValue(dateInput, parts.isoDate);
      if (timeInput) setValue(timeInput, parts.time24);
      return {
        ok: true,
        ...diagnostics,
        values: {
          month: month.value,
          day: day.value,
          year: year.value,
          hour: hour.value,
          minute: minute.value,
          ampm: ampm?.value || "",
          date: dateInput?.value || "",
          time: timeInput?.value || "",
        },
      };
    })(${JSON.stringify(parts)})`);
    if (filled.ok) break;
    if (attempt === 1 || attempt % 5 === 0) {
      logEvent("schedule_fields_wait", { scheduledAt: scheduledAt.toISOString(), attempt, state: filled });
    }
    await sleep(500);
  }
  if (!filled?.ok) {
    throw new Error(`X 예약 시간을 입력하지 못했습니다: ${JSON.stringify(filled)}`);
  }
  logEvent("schedule_fields_filled", { scheduledAt: scheduledAt.toISOString(), filled });
  let scheduleReady = null;
  for (let i = 0; i < 10; i++) {
    scheduleReady = await page.eval(`((parts) => {
      const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible);
      const scope = dialogs[dialogs.length - 1] || document;
      const selects = Array.from(scope.querySelectorAll('select')).filter(visible);
      const setSelect = (index, value) => {
        const el = selects[index];
        if (!el) return;
        const exact = Array.from(el.options || []).find((option) => option.value === value);
        const numeric = Array.from(el.options || []).find((option) => String(Number(option.value)) === String(Number(value)));
        el.value = (exact || numeric)?.value || value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      setSelect(0, parts.month);
      setSelect(1, parts.day);
      setSelect(2, parts.year);
      setSelect(3, parts.hour);
      setSelect(4, parts.minuteSelect || parts.minute);
      setSelect(5, parts.ampm.toLowerCase());
      const button = scope.querySelector('[data-testid="scheduledConfirmationPrimaryAction"]');
      return {
        values: selects.map((select) => select.value),
        hasButton: Boolean(button),
        disabled: button ? (button.disabled || button.getAttribute("aria-disabled") === "true") : true,
        buttonText: button?.innerText || "",
      };
    })(${JSON.stringify(parts)})`);
    logEvent("schedule_fields_state", { scheduledAt: scheduledAt.toISOString(), state: scheduleReady });
    if (scheduleReady.hasButton && !scheduleReady.disabled) break;
    await sleep(500);
  }
  if (!scheduleReady || scheduleReady.disabled) {
    throw new Error(`X 예약 확인 버튼이 활성화되지 않았습니다: ${JSON.stringify(scheduleReady)}`);
  }

  const confirmed = await page.eval(`(() => {
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible);
    const scope = dialogs[dialogs.length - 1] || document;
    const confirmButton = scope.querySelector('[data-testid="scheduledConfirmationPrimaryAction"]');
    if (!confirmButton) return false;
    if (confirmButton.disabled || confirmButton.getAttribute("aria-disabled") === "true") return false;
    confirmButton.click();
    return true;
  })()`);
  if (!confirmed) throw new Error("X 예약 확인 버튼을 찾지 못했습니다.");
  await sleep(1600);
  logEvent("schedule_set", { scheduledAt: scheduledAt.toISOString() });
}

async function getComposerState(page) {
  return page.eval(`(() => {
    const attachmentNodes = Array.from(document.querySelectorAll(
      '[data-testid="attachments"] img, [data-testid="attachments"] video, [data-testid="media"] img, [data-testid="media"] video'
    ));
    const busyNodes = Array.from(document.querySelectorAll('[role="progressbar"], [aria-busy="true"]'));
    const busy = busyNodes.some((node) => {
      const text = node.innerText || node.getAttribute("aria-label") || "";
      return !/트렌드|timeline|feed/i.test(text);
    });
    const errorText = Array.from(document.querySelectorAll('[role="alert"]'))
      .map((el) => el.innerText)
      .filter((text) => text && !/게시물을 전송했습니다|posted|sent/i.test(text))
      .filter(Boolean)
      .join("\\n");
    const readyText = /준비 완료|ready|uploaded|업로드 완료/i.test(document.body.innerText || "");
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const activePostButton = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'))
      .filter(visible)
      .some((btn) => btn.getAttribute("aria-disabled") !== "true" && !btn.disabled);
    return {
      busy,
      errorText,
      readyText,
      activePostButton,
      attachmentCount: attachmentNodes.length,
      attachmentKinds: attachmentNodes.map((node) => node.tagName.toLowerCase()),
    };
  })()`);
}

async function waitForUploadToSettle(page, expectedMediaCount, mediaFiles = []) {
  let stableReadyTicks = 0;
  let sawExpectedAttachment = false;
  let lastState = null;
  const hasVideo = mediaFiles.some((file) => /\.mp4$/i.test(file));
  for (let i = 0; i < 120; i++) {
    const state = await getComposerState(page);
    lastState = state;
    if (i % 5 === 0) logEvent("upload_wait_state", state);
    if (state.errorText) throw new Error(`X 미디어 업로드 실패: ${state.errorText}`);
    if (state.attachmentCount >= expectedMediaCount) sawExpectedAttachment = true;
    if (sawExpectedAttachment && state.attachmentCount < expectedMediaCount) {
      throw new Error(`X가 업로드된 미디어를 제거했습니다: ${JSON.stringify(state)}`);
    }
    if (state.attachmentCount >= expectedMediaCount && state.readyText && state.activePostButton) {
      stableReadyTicks += 1;
      if (stableReadyTicks >= 2) return;
    } else if (!hasVideo && state.attachmentCount >= expectedMediaCount && state.activePostButton) {
      stableReadyTicks += 1;
      if (stableReadyTicks >= 3) return;
    } else if (state.attachmentCount >= expectedMediaCount && !state.busy && state.activePostButton) {
      stableReadyTicks += 1;
      if (stableReadyTicks >= 5) return;
    } else {
      stableReadyTicks = 0;
    }
    await sleep(1000);
  }
  throw new Error(`X 미디어 업로드 완료를 확인하지 못했습니다: ${JSON.stringify(lastState)}`);
}

async function waitForPostButton(page, expectedMediaCount = 0) {
  let lastState = null;
  for (let i = 0; i < 120; i++) {
    const buttonState = await page.eval(`(() => {
      const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const buttons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')).filter(visible);
      const activeButtons = buttons.filter((btn) => btn.getAttribute("aria-disabled") !== "true" && !btn.disabled);
      const button = activeButtons[0] || buttons[0] || null;
      const textboxes = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"]')).filter(visible);
      const textboxText = textboxes.map((node) => node.innerText || "").find((text) => text.trim()) || textboxes[0]?.innerText || "";
      const alerts = Array.from(document.querySelectorAll('[role="alert"]')).map((el) => el.innerText).filter(Boolean);
      return {
        hasButton: Boolean(button),
        disabled: activeButtons.length <= 0,
        activeButtonCount: activeButtons.length,
        buttonText: button?.innerText || "",
        buttonStates: buttons.map((btn) => ({
          text: btn.innerText || "",
          disabled: btn.getAttribute("aria-disabled") === "true" || btn.disabled,
        })).slice(0, 8),
        textLength: textboxText.length,
        textbox: textboxText,
        alerts,
      };
    })()`);
    const composerState = await getComposerState(page);
    const state = { ...buttonState, ...composerState };
    lastState = state;
    if (expectedMediaCount > 0 && state.attachmentCount < expectedMediaCount) {
      await sleep(1000);
      continue;
    }
    if (state.hasButton && !state.disabled) return { ok: true };
    await sleep(1000);
  }
  return { ok: false, reason: JSON.stringify(lastState) };
}

async function mirrorThread(url, options = {}) {
  const canonicalUrl = validateThreadsUrl(url);
  const requestedScheduledAt = parseRequestedScheduleTime(options.scheduledAt);
  const completed = findCompletedMirror(canonicalUrl);
  if (completed) {
    throw new DuplicateMirrorError("이미 X에 게시 또는 예약된 Threads URL입니다.", {
      canonicalUrl,
      previousStatus: completed.status,
      previousScheduledAt: completed.scheduledAt,
      previousCompletedAt: completed.completedAt,
    });
  }
  logEvent("mirror_start", {
    canonicalUrl,
    hasTextOverride: Boolean(options.textOverride && String(options.textOverride).trim()),
    schedule: Boolean(options.schedule),
    requestedScheduledAt: requestedScheduledAt?.toISOString(),
  });
  const threadPost = await extractThreadPost(canonicalUrl, {
    allowEmptyText: Boolean(options.textOverride && String(options.textOverride).trim()),
  });
  logEvent("thread_extracted", {
    canonicalUrl,
    textPreview: threadPost.text.slice(0, 120),
    mediaCount: threadPost.mediaUrls.length,
    diagnostics: threadPost.diagnostics,
  });
  if ((threadPost.diagnostics?.mediaCandidateCount || 0) > 0 && threadPost.mediaUrls.length === 0) {
    throw new Error("Threads 원글에서 미디어 후보를 발견했지만 첨부 대상으로 확정하지 못해 게시를 중단했습니다.");
  }
  if (options.textOverride && String(options.textOverride).trim()) {
    threadPost.text = String(options.textOverride).trim().slice(0, 280);
  }
  if (options.schedule) {
    logEvent("schedule_media_strategy", {
      canonicalUrl,
      reason: "keep_original_media_for_x_scheduled_post",
      mediaCount: threadPost.mediaUrls.length,
      videoCount: threadPost.videoMediaUrls?.length || 0,
      imageCount: threadPost.imageMediaUrls.length,
    });
  }
  const media = await downloadMedia(threadPost.mediaUrls);
  try {
    logEvent("media_downloaded", {
      canonicalUrl,
      downloadedCount: media.files.length,
      files: media.files.map((file) => path.basename(file)),
    });
    const postResult = await postToX(threadPost, media.files, {
      schedule: Boolean(options.schedule),
      scheduledAt: requestedScheduledAt,
    });
    recordCompletedMirror({
      canonicalUrl,
      status: postResult.scheduledAt ? "scheduled" : "posted",
      scheduledAt: postResult.scheduledAt?.toISOString(),
      postUrl: postResult.postUrl || null,
      mediaCount: media.files.length,
    });
    logEvent("mirror_success", { canonicalUrl, mediaCount: media.files.length, scheduledAt: postResult.scheduledAt?.toISOString() });
    return {
      canonicalUrl,
      mediaCount: media.files.length,
      scheduledAt: postResult.scheduledAt?.toISOString(),
      message: postResult.scheduledAt ? `X 예약됨 · ${postResult.scheduledAt.toLocaleString("ko-KR")}` : "X 게시됨",
    };
  } finally {
    fs.rmSync(media.dir, { recursive: true, force: true });
    logEvent("cleanup_done", { canonicalUrl, dir: media.dir });
  }
}

async function createXDraftFromThread(url, options = {}) {
  const canonicalUrl = validateThreadsUrl(url);
  logEvent("x_draft_start", {
    canonicalUrl,
    hasTextOverride: Boolean(options.textOverride && String(options.textOverride).trim()),
  });
  const threadPost = await extractThreadPost(canonicalUrl, {
    allowEmptyText: Boolean(options.textOverride && String(options.textOverride).trim()),
  });
  logEvent("thread_extracted_for_draft", {
    canonicalUrl,
    textPreview: threadPost.text.slice(0, 120),
    mediaCount: threadPost.mediaUrls.length,
    diagnostics: threadPost.diagnostics,
  });
  if ((threadPost.diagnostics?.mediaCandidateCount || 0) > 0 && threadPost.mediaUrls.length === 0) {
    throw new Error("Threads 원글에서 미디어 후보를 발견했지만 첨부 대상으로 확정하지 못해 초안 저장을 중단했습니다.");
  }
  if (options.textOverride && String(options.textOverride).trim()) {
    threadPost.text = String(options.textOverride).trim().slice(0, 280);
  }
  const media = await downloadMedia(threadPost.mediaUrls);
  try {
    logEvent("media_downloaded_for_draft", {
      canonicalUrl,
      downloadedCount: media.files.length,
      files: media.files.map((file) => path.basename(file)),
    });
    await createXDraft(threadPost, media.files);
    logEvent("x_draft_success", { canonicalUrl, mediaCount: media.files.length });
    return {
      canonicalUrl,
      mediaCount: media.files.length,
      message: "X 초안 저장됨",
    };
  } finally {
    fs.rmSync(media.dir, { recursive: true, force: true });
    logEvent("cleanup_done", { canonicalUrl, dir: media.dir, draft: true });
  }
}

async function postDiscoveryRowToX(canonicalUrl, options = {}) {
  if (!isInssiderPostUrl(canonicalUrl)) {
    return mirrorThread(canonicalUrl, options);
  }
  const completed = findCompletedMirror(canonicalUrl);
  if (completed) {
    throw new DuplicateMirrorError("이미 X에 게시 또는 예약된 인싸이더 URL입니다.", {
      canonicalUrl,
      previousStatus: completed.status,
      previousScheduledAt: completed.scheduledAt,
      previousCompletedAt: completed.completedAt,
    });
  }
  const row = await getDiscoveryRow(canonicalUrl);
  if (!row) throw new Error("저장된 인싸이더 대시보드 항목을 찾지 못했습니다.");
  let criteria = {};
  try { criteria = JSON.parse(row.criteria || "{}"); } catch {}
  if (criteria.source !== "inssider") throw new Error("인싸이더 저장 항목 정보가 올바르지 않습니다.");
  if (!row.mediaPreviewUrl) throw new Error("인싸이더 캡처 이미지가 없습니다.");
  const requestedScheduledAt = parseRequestedScheduleTime(options.scheduledAt);
  const post = {
    url: canonicalUrl,
    text: String(options.textOverride || row.textPreview || "").trim().slice(0, 280),
    mediaUrls: [row.mediaPreviewUrl],
    imageMediaUrls: [row.mediaPreviewUrl],
    videoMediaUrls: [],
    diagnostics: { source: "inssider_saved_capture" },
  };
  const media = await downloadMedia(post.mediaUrls);
  try {
    const postResult = await postToX(post, media.files, {
      schedule: Boolean(options.schedule),
      scheduledAt: requestedScheduledAt,
    });
    const replyResults = [];
    const replyChunks = Array.isArray(criteria.inssiderReplyChunks)
      ? criteria.inssiderReplyChunks.map((chunk) => String(chunk || "").trim()).filter(Boolean)
      : String(criteria.inssiderReplyText || "").trim()
        ? [String(criteria.inssiderReplyText || "").trim()]
        : [];
    if (!postResult.scheduledAt && replyChunks.length) {
      if (!postResult.postUrl) throw new Error("인싸이더 이어보기 답글을 달 새 X 게시글 URL을 찾지 못했습니다.");
      let replyTargetUrl = postResult.postUrl;
      for (let index = 0; index < replyChunks.length; index += 1) {
        const replyText = replyChunks[index];
        const replyResult = await postTerafabxReply(replyTargetUrl, replyText, { validate: false, quick: true });
        replyResults.push({ index, replyUrl: replyResult.replyUrl, length: replyText.length });
        replyTargetUrl = replyResult.replyUrl || replyTargetUrl;
        logEvent("inssider_x_reply_success", {
          canonicalUrl,
          postUrl: postResult.postUrl,
          replyUrl: replyResult.replyUrl,
          index,
          total: replyChunks.length,
          length: replyText.length,
        });
        if (index < replyChunks.length - 1) await sleep(300);
      }
    }
    recordCompletedMirror({
      canonicalUrl,
      status: postResult.scheduledAt ? "scheduled" : "posted",
      scheduledAt: postResult.scheduledAt?.toISOString(),
      postUrl: postResult.postUrl || null,
      mediaCount: media.files.length,
    });
    if (postResult.scheduledAt && replyChunks.length) {
      upsertScheduledReplyItem({
        canonicalUrl,
        scheduledAt: postResult.scheduledAt.toISOString(),
        text: post.text,
        replyChunks,
      });
    }
    logEvent("inssider_x_post_success", { canonicalUrl, mediaCount: media.files.length, scheduledAt: postResult.scheduledAt?.toISOString() });
    return {
      canonicalUrl,
      mediaCount: media.files.length,
      scheduledAt: postResult.scheduledAt?.toISOString(),
      postUrl: postResult.postUrl || null,
      replyUrl: replyResults.at(-1)?.replyUrl || null,
      replyCount: replyResults.length,
      message: postResult.scheduledAt ? `X 예약됨 · ${postResult.scheduledAt.toLocaleString("ko-KR")}` : "X 게시됨",
    };
  } finally {
    fs.rmSync(media.dir, { recursive: true, force: true });
    logEvent("cleanup_done", { canonicalUrl, dir: media.dir, source: "inssider" });
  }
}

async function createXDraftFromDiscoveryRow(canonicalUrl, options = {}) {
  if (!isInssiderPostUrl(canonicalUrl)) {
    return createXDraftFromThread(canonicalUrl, options);
  }
  const row = await getDiscoveryRow(canonicalUrl);
  if (!row) throw new Error("저장된 인싸이더 대시보드 항목을 찾지 못했습니다.");
  if (!row.mediaPreviewUrl) throw new Error("인싸이더 캡처 이미지가 없습니다.");
  const post = {
    url: canonicalUrl,
    text: String(options.textOverride || row.textPreview || "").trim().slice(0, 280),
    mediaUrls: [row.mediaPreviewUrl],
    imageMediaUrls: [row.mediaPreviewUrl],
    videoMediaUrls: [],
    diagnostics: { source: "inssider_saved_capture" },
  };
  const media = await downloadMedia(post.mediaUrls);
  try {
    await createXDraft(post, media.files);
    logEvent("inssider_x_draft_success", { canonicalUrl, mediaCount: media.files.length });
    return {
      canonicalUrl,
      mediaCount: media.files.length,
      message: "X 초안 저장됨",
    };
  } finally {
    fs.rmSync(media.dir, { recursive: true, force: true });
    logEvent("cleanup_done", { canonicalUrl, dir: media.dir, draft: true, source: "inssider" });
  }
}

async function runDiscoveryAutoSchedule(canonicalUrl, options = {}) {
  await acquireMirrorBusy({
    wait: Boolean(options.waitForBusy),
    canonicalUrl,
    source: options.source || null,
  });
  try {
    if (options.text && String(options.text).trim()) {
      await updateDiscoveryTitle(canonicalUrl, options.text);
    }
    const scheduledAt = await nextAutoScheduleTime();
    logEvent("discovery_auto_schedule_request", {
      canonicalUrl,
      scheduledAt: scheduledAt.toISOString(),
      source: options.source || null,
    });
    const result = await postDiscoveryRowToX(canonicalUrl, {
      textOverride: options.text,
      schedule: true,
      scheduledAt,
    });
    await markDiscoveryScheduled(canonicalUrl, result.mediaCount, result.scheduledAt);
    return result;
  } finally {
    busy = false;
  }
}

function enqueueDiscoveryAutoScheduleJob(canonicalUrl, source, job) {
  autoScheduleQueueDepth += 1;
  const queuePosition = autoScheduleQueueDepth;
  logEvent("discovery_auto_schedule_queued", {
    canonicalUrl,
    source,
    queuePosition,
  });
  const queued = autoScheduleQueue.catch(() => {}).then(async () => {
    autoScheduleQueueDepth = Math.max(0, autoScheduleQueueDepth - 1);
    logEvent("discovery_auto_schedule_dequeued", {
      canonicalUrl,
      source,
      remainingQueueDepth: autoScheduleQueueDepth,
    });
    return job();
  });
  autoScheduleQueue = queued.catch((error) => {
    logEvent("discovery_auto_schedule_queue_error", {
      canonicalUrl,
      source,
      error: error.message,
    });
  });
  return queued;
}

function parseRequestedScheduleTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new Error(`예약 시간을 해석하지 못했습니다: ${value}`);
    }
    if (value.getTime() <= Date.now() + 5 * 60 * 1000) {
      throw new Error("예약 시간은 현재보다 최소 5분 이후여야 합니다.");
    }
    return value;
  }
  const raw = String(value).trim();
  const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!localMatch && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
    throw new Error(`예약 시간은 대시보드 로컬 시간 형식이어야 합니다. 시간대가 포함된 값은 거부합니다: ${raw}`);
  }
  const date = localMatch
    ? new Date(
      Number(localMatch[1]),
      Number(localMatch[2]) - 1,
      Number(localMatch[3]),
      Number(localMatch[4]),
      Number(localMatch[5]),
      Number(localMatch[6] || 0),
    )
    : new Date(raw);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`예약 시간을 해석하지 못했습니다: ${value}`);
  }
  if (date.getTime() <= Date.now() + 5 * 60 * 1000) {
    throw new Error("예약 시간은 현재보다 최소 5분 이후여야 합니다.");
  }
  return date;
}


function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function appendNaverBlogEvent(type, data = {}) {
  const entry = { ts: new Date().toISOString(), type, ...data };
  try {
    ensureParentDir(NAVER_BLOG_EVENTS_PATH);
    fs.appendFileSync(NAVER_BLOG_EVENTS_PATH, `${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.error("failed to write naver blog event log", error.message);
  }
  logEvent(`naver_blog_${type}`, data);
}

function defaultNaverBlogState() {
  return {
    enabled: true,
    schedule: NAVER_BLOG_DEFAULT_SCHEDULE,
    timezone: "Asia/Seoul",
    blogId: "cury8282",
    mode: "draft-save-only",
    writer: "gemini-web-only",
    chrome: {
      port: NAVER_BLOG_CHROME_PORT,
      profileDir: NAVER_BLOG_PROFILE_DIR,
      status: "unknown",
    },
    lastRun: null,
    nextRunAt: null,
    recentRuns: [],
    rules: {
      noHermesCron: true,
      geminiOnly: true,
      publish: false,
      newBrowserProfile: true,
      closeTabsAfterDraft: true,
      representativeImageBelowTitle: true,
      realImagesForEntertainment: true,
    },
  };
}

function loadNaverBlogState() {
  try {
    const state = JSON.parse(fs.readFileSync(NAVER_BLOG_STATE_PATH, "utf8"));
    return { ...defaultNaverBlogState(), ...state, chrome: { ...defaultNaverBlogState().chrome, ...(state.chrome || {}) }, rules: { ...defaultNaverBlogState().rules, ...(state.rules || {}) } };
  } catch {
    return defaultNaverBlogState();
  }
}

function saveNaverBlogState(patch = {}) {
  const current = loadNaverBlogState();
  const next = {
    ...current,
    ...patch,
    chrome: { ...(current.chrome || {}), ...(patch.chrome || {}) },
    rules: { ...(current.rules || {}), ...(patch.rules || {}) },
    updatedAt: new Date().toISOString(),
  };
  if (!next.enabled) {
    next.nextRunAt = null;
  } else if (
    Object.prototype.hasOwnProperty.call(patch, "enabled")
    || Object.prototype.hasOwnProperty.call(patch, "schedule")
    || !next.nextRunAt
  ) {
    next.nextRunAt = computeNextNaverBlogRun(next.schedule).toISOString();
  }
  ensureParentDir(NAVER_BLOG_STATE_PATH);
  fs.writeFileSync(NAVER_BLOG_STATE_PATH, JSON.stringify(next, null, 2));
  return next;
}

function parseKstScheduleMinute(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error(`스케줄은 HH:mm 형식이어야 합니다: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error(`잘못된 스케줄 시간: ${value}`);
  return hour * 60 + minute;
}

function nowKstParts(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date).reduce((acc, item) => {
    if (item.type !== "literal") acc[item.type] = Number(item.value);
    return acc;
  }, {});
}

function kstDateToUtc(year, month, day, hour, minute, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour - 9, minute, second));
}

function computeNextNaverBlogRun(schedule = NAVER_BLOG_DEFAULT_SCHEDULE, from = new Date()) {
  const normalized = [...new Set((schedule || []).map(String).filter(Boolean))]
    .map((value) => {
      const total = parseKstScheduleMinute(value);
      return { value, hour: Math.floor(total / 60), minute: total % 60, total };
    })
    .sort((a, b) => a.total - b.total);
  if (!normalized.length) throw new Error("최소 1개 이상의 스케줄이 필요합니다.");
  const p = nowKstParts(from);
  const today = normalized
    .map((slot) => kstDateToUtc(p.year, p.month, p.day, slot.hour, slot.minute, 0))
    .find((candidate) => candidate.getTime() > from.getTime() + 30 * 1000);
  if (today) return today;
  const first = normalized[0];
  const tomorrowUtcNoon = kstDateToUtc(p.year, p.month, p.day + 1, 12, 0, 0);
  const t = nowKstParts(tomorrowUtcNoon);
  return kstDateToUtc(t.year, t.month, t.day, first.hour, first.minute, 0);
}

function validateGeminiOnlyWorkflowConfig(config = {}) {
  const writer = String(config.writer || "gemini-web-only").toLowerCase();
  if (writer !== "gemini-web-only" && writer !== "gemini") {
    throw new Error("네이버 블로그 작성 워크플로우는 Gemini Web만 허용됩니다.");
  }
  return true;
}

function recentNaverBlogEvents(limit = 20) {
  try {
    return fs.readFileSync(NAVER_BLOG_EVENTS_PATH, "utf8")
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function requestJsonForPort(port, method, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, timeout: CDP_HTTP_TIMEOUT_MS }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(data || `Chrome ${port} returned HTTP ${res.statusCode}`)); }
      });
    });
    req.on("timeout", () => req.destroy(new Error(`Chrome ${port} ${method} ${pathname} timed out after ${CDP_HTTP_TIMEOUT_MS}ms`)));
    req.on("error", reject);
    req.end();
  });
}

async function getNaverBlogChromeTabs() {
  try {
    return await requestJsonForPort(NAVER_BLOG_CHROME_PORT, "GET", "/json/list");
  } catch {
    return [];
  }
}

async function naverBlogBrowserStatus() {
  const tabs = await getNaverBlogChromeTabs();
  const pids = await naverBlogChromePids();
  return {
    running: tabs.length > 0 || pids.length > 0,
    port: NAVER_BLOG_CHROME_PORT,
    profileDir: NAVER_BLOG_PROFILE_DIR,
    processCount: pids.length,
    tabCount: tabs.length,
    blogTabs: tabs.filter((tab) => /blog\.naver\.com|PostWriteForm|Redirect=Write|TempPostList/.test(tab.url || "")).length,
    geminiTabs: tabs.filter((tab) => /gemini\.google\.com/.test(tab.url || "")).length,
  };
}

function chromeExecutablePath() {
  const candidates = [
    process.env.NAVER_BLOG_CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error("Chrome/Brave 실행 파일을 찾지 못했습니다. NAVER_BLOG_CHROME_BIN을 지정하세요.");
  return found;
}

async function openNaverBlogStartTab() {
  await requestJsonForPort(NAVER_BLOG_CHROME_PORT, "PUT", `/json/new?${encodeURIComponent(NAVER_BLOG_START_URL)}`);
  await sleep(1200);
  return naverBlogBrowserStatus();
}

async function ensureNaverBlogBrowser() {
  const before = await naverBlogBrowserStatus();
  if (before.running) {
    const tabs = await getNaverBlogChromeTabs();
    const hasBlogTab = tabs.some((tab) => /blog\.naver\.com|PostWriteForm|Redirect=Write|TempPostList/.test(tab.url || ""));
    const onlyBlankPages = tabs.length === 0 || tabs.every((tab) => tab.type !== "page" || !tab.url || tab.url === "about:blank");
    if (!hasBlogTab || onlyBlankPages) {
      try {
        const afterReuse = await openNaverBlogStartTab();
        appendNaverBlogEvent("browser_reuse_open_start", { port: NAVER_BLOG_CHROME_PORT, profileDir: NAVER_BLOG_PROFILE_DIR, running: afterReuse.running, blogTabs: afterReuse.blogTabs });
        return { ...afterReuse, launched: false, openedTab: true };
      } catch (error) {
        appendNaverBlogEvent("browser_reuse_open_start_error", { error: error.message });
      }
    }
    return { ...before, launched: false, openedTab: false };
  }
  fs.mkdirSync(NAVER_BLOG_PROFILE_DIR, { recursive: true });
  const args = [
    `--remote-debugging-port=${NAVER_BLOG_CHROME_PORT}`,
    `--user-data-dir=${NAVER_BLOG_PROFILE_DIR}`,
    "--no-first-run",
    "--no-default-browser-check",
    NAVER_BLOG_START_URL,
  ];
  const child = spawn(chromeExecutablePath(), args, { detached: true, stdio: "ignore" });
  child.unref();
  await sleep(3500);
  const after = await naverBlogBrowserStatus();
  appendNaverBlogEvent("browser_launch", { port: NAVER_BLOG_CHROME_PORT, profileDir: NAVER_BLOG_PROFILE_DIR, running: after.running });
  return { ...after, launched: true };
}

async function closeNaverBlogWorkTabs() {
  const tabs = await getNaverBlogChromeTabs();
  const close = tabs.filter((tab) => /blog\.naver\.com|PostWriteForm|Redirect=Write|TempPostList|gemini\.google\.com/.test(tab.url || ""));
  const results = [];
  for (const tab of close) {
    try {
      await requestJsonForPort(NAVER_BLOG_CHROME_PORT, "PUT", `/json/close/${tab.id}`);
      results.push({ id: tab.id, title: tab.title, url: tab.url, ok: true });
    } catch (error) {
      results.push({ id: tab.id, title: tab.title, url: tab.url, ok: false, error: error.message });
    }
  }
  const after = await naverBlogBrowserStatus();
  appendNaverBlogEvent("tabs_cleanup", { closed: results.length, remainingBlogTabs: after.blogTabs, remainingGeminiTabs: after.geminiTabs });
  return { closed: results.length, results, remainingBlogTabs: after.blogTabs, remainingGeminiTabs: after.geminiTabs };
}

function runNodeScript(scriptPath, args = [], options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: options.cwd || __dirname,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeoutMs = Number(options.timeoutMs || 0);
    const timer = timeoutMs > 0 ? setTimeout(() => {
      stderr += `\nNode script timed out after ${timeoutMs}ms: ${scriptPath}`;
      try { child.kill("SIGTERM"); } catch {}
      setTimeout(() => {
        if (!child.killed) {
          try { child.kill("SIGKILL"); } catch {}
        }
      }, 3000).unref();
    }, timeoutMs) : null;
    if (timer) timer.unref();
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? (signal ? 124 : 0), signal, stdout: stdout.slice(-12000), stderr: stderr.slice(-12000) });
    });
  });
}

function execFileOutput(file, args = [], options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, options, (error, stdout = "", stderr = "") => {
      resolve({ code: error?.code || 0, stdout: String(stdout), stderr: String(stderr), error: error?.message || null });
    });
  });
}

async function naverBlogChromePids() {
  const result = await execFileOutput("lsof", [`-tiTCP:${NAVER_BLOG_CHROME_PORT}`, "-sTCP:LISTEN"]);
  return result.stdout
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
}

async function dedicatedNaverBlogChromePids() {
  const dedicated = [];
  for (const pid of await naverBlogChromePids()) {
    const command = await execFileOutput("ps", ["-p", String(pid), "-o", "command="]);
    const isDedicatedBrowser = command.stdout.includes(`--remote-debugging-port=${NAVER_BLOG_CHROME_PORT}`)
      && command.stdout.includes(NAVER_BLOG_PROFILE_DIR);
    if (isDedicatedBrowser) dedicated.push(pid);
  }
  return dedicated;
}

async function closeNaverBlogBrowser() {
  const tabs = await getNaverBlogChromeTabs();
  const closedTabs = [];
  for (const tab of tabs) {
    try {
      await requestJsonForPort(NAVER_BLOG_CHROME_PORT, "PUT", `/json/close/${tab.id}`);
      closedTabs.push({ id: tab.id, title: tab.title, url: tab.url, ok: true });
    } catch (error) {
      closedTabs.push({ id: tab.id, title: tab.title, url: tab.url, ok: false, error: error.message });
    }
  }
  await sleep(1000);
  const killedPids = new Set();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const pids = await dedicatedNaverBlogChromePids();
    if (!pids.length) break;
    const signal = attempt >= 2 ? "SIGKILL" : "SIGTERM";
    for (const pid of pids) {
      try {
        process.kill(pid, signal);
        killedPids.add(pid);
      } catch {}
    }
    await sleep(signal === "SIGKILL" ? 800 : 1200);
  }
  const after = await naverBlogBrowserStatus();
  const killedPidList = Array.from(killedPids);
  appendNaverBlogEvent("browser_shutdown", {
    closedTabs: closedTabs.length,
    killedPids: killedPidList,
    running: after.running,
    tabCount: after.tabCount,
  });
  return { closedTabs, killedPids: killedPidList, running: after.running, tabCount: after.tabCount };
}

async function runNaverBlogDraftWorkflow(options = {}) {
  validateGeminiOnlyWorkflowConfig({ writer: "gemini-web-only" });
  const startedAt = new Date().toISOString();
  const run = { id: `naver-blog-${startedAt.replace(/[:.]/g, "-")}`, startedAt, source: options.source || "manual", status: "running", title: null, logNo: null, steps: [] };
  appendNaverBlogEvent("draft_run_start", run);
  let cleanedTabs = false;
  try {
    const browser = await ensureNaverBlogBrowser();
    run.steps.push({ step: "browser", ok: browser.running, browser });
    const workflowScript = path.join(__dirname, "scripts", "naver-blog-gemini-workflow.js");
    if (!fs.existsSync(workflowScript)) throw new Error(`워크플로우 스크립트가 없습니다: ${workflowScript}`);
    const scriptResult = await runNodeScript(workflowScript, ["--source", run.source], {
      cwd: __dirname,
      env: { NAVER_BLOG_CHROME_PORT: String(NAVER_BLOG_CHROME_PORT), NAVER_BLOG_PROFILE_DIR, NAVER_BLOG_ADPOST_ROOT, NAVER_BLOG_WRITER: "gemini-web-only" },
      timeoutMs: 960000,
    });
    run.steps.push({ step: "workflow", ok: scriptResult.code === 0, code: scriptResult.code, stdout: scriptResult.stdout, stderr: scriptResult.stderr });
    if (scriptResult.code !== 0) throw new Error(scriptResult.stderr || scriptResult.stdout || "네이버 블로그 워크플로우 실패");
    let parsed = null;
    try { parsed = JSON.parse(scriptResult.stdout.trim().split("\n").pop() || "{}"); } catch {}
    const cleanup = await closeNaverBlogWorkTabs();
    cleanedTabs = true;
    run.steps.push({ step: "cleanup", ok: cleanup.remainingBlogTabs === 0 && cleanup.remainingGeminiTabs === 0, cleanup });
    run.status = "ok";
    run.finishedAt = new Date().toISOString();
    run.title = parsed?.title || null;
    run.logNo = parsed?.logNo || null;
    run.result = parsed;
    const state = loadNaverBlogState();
    const recentRuns = [run, ...(state.recentRuns || [])].slice(0, 20);
    saveNaverBlogState({ lastRun: run, recentRuns });
    appendNaverBlogEvent("draft_run_ok", { id: run.id, title: run.title, logNo: run.logNo });
    return run;
  } catch (error) {
    run.status = "error";
    run.finishedAt = new Date().toISOString();
    run.error = error.message;
    error.naverBlogRun = run;
    throw error;
  } finally {
    if (!cleanedTabs) {
      try {
        const cleanup = await closeNaverBlogWorkTabs();
        run.steps.push({ step: "cleanup", ok: cleanup.remainingBlogTabs === 0 && cleanup.remainingGeminiTabs === 0, cleanup });
      } catch (error) {
        run.steps.push({ step: "cleanup", ok: false, error: error.message });
        appendNaverBlogEvent("tabs_cleanup_error", { id: run.id, error: error.message });
      }
    }
    try {
      const shutdown = await closeNaverBlogBrowser();
      run.steps.push({ step: "browser_shutdown", ok: shutdown.running === false, shutdown });
    } catch (error) {
      run.steps.push({ step: "browser_shutdown", ok: false, error: error.message });
      appendNaverBlogEvent("browser_shutdown_error", { id: run.id, error: error.message });
    }
    if (run.status === "ok") {
      const state = loadNaverBlogState();
      if (state.lastRun?.id === run.id) {
        const recentRuns = [run, ...(state.recentRuns || []).filter((item) => item.id !== run.id)].slice(0, 20);
        saveNaverBlogState({ lastRun: run, recentRuns });
      }
    }
  }
}

async function maybeRunNaverBlogScheduler() {
  const state = loadNaverBlogState();
  if (!state.enabled) return { ok: true, skipped: true, reason: "disabled" };
  const nextRunAt = state.nextRunAt || computeNextNaverBlogRun(state.schedule).toISOString();
  if (new Date(nextRunAt).getTime() > Date.now()) return { ok: true, skipped: true, nextRunAt };
  if (naverBlogSchedulerBusy || naverBlogManualBusy) return { ok: true, skipped: true, reason: "busy" };
  naverBlogSchedulerBusy = true;
  try {
    const result = await runNaverBlogDraftWorkflow({ source: "scheduler" });
    saveNaverBlogState({ nextRunAt: computeNextNaverBlogRun(state.schedule).toISOString() });
    return { ok: true, result };
  } catch (error) {
    const failed = error.naverBlogRun || { id: `naver-blog-error-${Date.now()}`, status: "error", source: "scheduler", error: error.message, finishedAt: new Date().toISOString() };
    const latest = loadNaverBlogState();
    saveNaverBlogState({ lastRun: failed, recentRuns: [failed, ...(latest.recentRuns || [])].slice(0, 20), nextRunAt: computeNextNaverBlogRun(latest.schedule).toISOString() });
    appendNaverBlogEvent("draft_run_error", failed);
    return { ok: false, error: error.message };
  } finally {
    naverBlogSchedulerBusy = false;
  }
}

async function getNaverBlogOpsDashboard() {
  const state = saveNaverBlogState({});
  const browser = await naverBlogBrowserStatus();
  return { ok: true, state, browser, events: recentNaverBlogEvents(30), scheduler: { busy: naverBlogSchedulerBusy || naverBlogManualBusy, intervalMs: NAVER_BLOG_INTERVAL_MS, noHermesCron: true, writer: "gemini-web-only" } };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && tryServeDashboardAsset(req, res)) {
    return;
  }
  if (req.method === "GET" && tryServeGeneratedMedia(req, res)) {
    return;
  }
  if ((req.method === "GET" || req.method === "HEAD") && req.url === "/") {
    res.writeHead(302, { location: "/discovery?view=automation" });
    res.end();
    return;
  }
  if (req.method === "GET" && (req.url === "/health" || req.url === "/api/health")) {
    json(res, 200, { ok: true, port: PORT, chromePort: CHROME_PORT, requiredXHandle: REQUIRED_X_HANDLE, pid: process.pid });
    return;
  }
  if (req.method === "GET" && req.url === "/naver-blog") {
    try {
      if (fs.existsSync(DASHBOARD_INDEX_PATH)) serveFile(res, DASHBOARD_INDEX_PATH);
      else html(res, 200, "<h1>Naver Blog Ops</h1><p>Run npm run build:dashboard first.</p>");
    } catch (error) {
      logEvent("naver_blog_dashboard_error", { error: error.message });
      html(res, 500, `<pre>${escapeHtml(error.message)}</pre>`);
    }
    return;
  }
  if (req.method === "GET" && req.url === "/inssider-pending") {
    try {
      if (fs.existsSync(DASHBOARD_INDEX_PATH)) serveFile(res, DASHBOARD_INDEX_PATH);
      else html(res, 200, "<h1>Inssider Pending</h1><p>Run npm run build:dashboard first.</p>");
    } catch (error) {
      logEvent("inssider_pending_dashboard_error", { error: error.message });
      html(res, 500, `<pre>${escapeHtml(error.message)}</pre>`);
    }
    return;
  }
  if (req.method === "GET" && req.url === "/api/naver-blog/ops") {
    try { json(res, 200, await getNaverBlogOpsDashboard()); }
    catch (error) { appendNaverBlogEvent("status_error", { error: error.message }); json(res, 500, { ok: false, error: error.message }); }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/inssider/pending")) {
    try { json(res, 200, await getInssiderPendingDashboardData()); }
    catch (error) { logEvent("inssider_pending_error", { error: error.message }); json(res, 500, { ok: false, error: error.message }); }
    return;
  }
  if (req.method === "POST" && req.url === "/api/inssider/save-to-discovery") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      json(res, 200, { ok: true, ...(await addInssiderToDiscoveryReview(payload.url)) });
    } catch (error) {
      logEvent("inssider_save_to_discovery_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/inssider/reply-continuation") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      json(res, 200, {
        ok: true,
        ...(await postInssiderContinuationReplies(payload.targetUrl, payload.sourceUrl, {
          skipChunks: payload.skipChunks,
        })),
      });
    } catch (error) {
      logEvent("inssider_reply_continuation_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/inssider/reply-text-chain") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      json(res, 200, { ok: true, ...(await postReplyTextChain(payload.targetUrl, payload.texts)) });
    } catch (error) {
      logEvent("reply_text_chain_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/naver-blog/settings") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(payload, "enabled")) patch.enabled = payload.enabled === true;
      if (Array.isArray(payload.schedule)) patch.schedule = payload.schedule.map(String).filter(Boolean);
      if (payload.blogId) patch.blogId = String(payload.blogId);
      validateGeminiOnlyWorkflowConfig({ writer: "gemini-web-only" });
      const state = saveNaverBlogState(patch);
      appendNaverBlogEvent("settings_update", { enabled: state.enabled, schedule: state.schedule });
      json(res, 200, { ok: true, state });
    } catch (error) {
      appendNaverBlogEvent("settings_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/naver-blog/browser") {
    try { json(res, 200, { ok: true, browser: await ensureNaverBlogBrowser() }); }
    catch (error) { appendNaverBlogEvent("browser_error", { error: error.message }); json(res, 500, { ok: false, error: error.message }); }
    return;
  }
  if (req.method === "POST" && req.url === "/api/naver-blog/cleanup-tabs") {
    try { json(res, 200, { ok: true, ...(await closeNaverBlogWorkTabs()) }); }
    catch (error) { appendNaverBlogEvent("cleanup_error", { error: error.message }); json(res, 500, { ok: false, error: error.message }); }
    return;
  }
  if (req.method === "POST" && req.url === "/api/naver-blog/run") {
    if (naverBlogManualBusy || naverBlogSchedulerBusy) { json(res, 429, { ok: false, error: "네이버 블로그 작성 작업이 이미 진행 중입니다." }); return; }
    naverBlogManualBusy = true;
    try {
      const result = await runNaverBlogDraftWorkflow({ source: "dashboard" });
      json(res, 200, { ok: true, result, state: loadNaverBlogState() });
    } catch (error) {
      const failed = error.naverBlogRun || { id: `naver-blog-error-${Date.now()}`, status: "error", source: "dashboard", error: error.message, finishedAt: new Date().toISOString() };
      const latest = loadNaverBlogState();
      saveNaverBlogState({ lastRun: failed, recentRuns: [failed, ...(latest.recentRuns || [])].slice(0, 20) });
      appendNaverBlogEvent("manual_run_error", failed);
      json(res, 500, { ok: false, error: error.message, state: loadNaverBlogState() });
    } finally { naverBlogManualBusy = false; }
    return;
  }
  if (req.method === "GET" && (req.url === "/api/terafabx/automation" || req.url === "/api/terafabx/status")) {
    try {
      json(res, 200, getTerafabxAutomationStatus());
    } catch (error) {
      logEvent("terafabx_status_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if ((req.method === "GET" || req.method === "HEAD") && req.url.startsWith("/api/terafabx/avatar")) {
    try {
      const parsed = new URL(req.url, "http://localhost");
      const targetUrl = parsed.searchParams.get("url") || "";
      const profile = await fetchFxTwitterAuthorProfile(targetUrl);
      if (!profile?.avatarUrl) throw new Error("avatar not found");
      res.writeHead(302, {
        location: profile.avatarUrl,
        "cache-control": "public, max-age=3600",
      });
      res.end();
    } catch (error) {
      logEvent("terafabx_avatar_proxy_error", { error: error.message });
      json(res, 404, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "GET" && req.url === "/api/terafabx/comment-reviews") {
    try {
      const avatarEnrichment = await ensureTerafabxFxTwitterAvatars({ limit: 20 }).catch((error) => {
        logEvent("terafabx_comment_reviews_avatar_enrichment_error", { error: error.message });
        return { error: error.message };
      });
      const rows = loadTerafabxCommentReviewQueue();
      json(res, 200, { ok: true, path: TERAFABX_COMMENT_REVIEW_QUEUE_PATH, count: rows.length, avatarEnrichment, rows });
    } catch (error) {
      logEvent("terafabx_comment_reviews_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/terafabx/comment-review-action") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const action = String(payload.action || "");
      const identifier = payload.targetUrl || payload.id || payload.targetId || "";
      if (!["post", "complete", "delete"].includes(action)) throw new Error("action은 post, complete, delete만 가능합니다.");
      let result;
      if (action === "post") result = await postSingleTerafabxCommentReviewRecord(identifier, { manual: true });
      else if (action === "complete") result = completeTerafabxCommentReviewRecord(identifier);
      else result = removeTerafabxCommentReviewRecord(identifier, { reason: "manual_dashboard_delete" });
      json(res, 200, { ok: true, action, result, status: getTerafabxAutomationStatus() });
    } catch (error) {
      logEvent("terafabx_comment_review_action_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/terafabx/automation") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const job = String(payload.job || "");
      const action = String(payload.action || "");
      if (!["comment", "comment-prefill", "heart", "follow", "verified-review", "review-comment"].includes(job)) throw new Error("job은 comment, comment-prefill, heart, follow, verified-review, review-comment만 가능합니다.");
      if (!["run", "enable", "disable"].includes(action)) throw new Error("action은 run, enable, disable만 가능합니다.");
      let result;
      if (action === "enable") {
        if (job === "comment") result = saveTerafabxState({ commentEnabled: true });
        else if (job === "comment-prefill") throw new Error("comment-prefill은 수동 run만 지원합니다.");
        else if (job === "verified-review") result = saveTerafabxState({ verifiedCommentReviewEnabled: true, commentEnabled: false });
        else if (job === "review-comment") throw new Error("review-comment는 수동 run만 지원합니다.");
        else if (job === "follow") result = saveTerafabxState({ followEnabled: true });
        else result = saveTerafabxState({ heartEnabled: true });
      } else if (action === "disable") {
        if (job === "comment") result = saveTerafabxState({ commentEnabled: false });
        else if (job === "comment-prefill") throw new Error("comment-prefill은 수동 run만 지원합니다.");
        else if (job === "verified-review") result = saveTerafabxState({ verifiedCommentReviewEnabled: false });
        else if (job === "review-comment") throw new Error("review-comment는 수동 run만 지원합니다.");
        else if (job === "follow") result = saveTerafabxState({ followEnabled: false });
        else result = saveTerafabxState({ heartEnabled: false });
      } else if (job === "comment") {
        result = await runTerafabxCommentOnce({ manual: true });
      } else if (job === "comment-prefill") {
        result = await runTerafabxCommentPrefillQueue({
          manual: true,
          targetCount: Number(payload.targetCount || TERAFABX_COMMENT_PREFILL_TARGET),
          concurrency: Number(payload.concurrency || TERAFABX_COMMENT_PREFILL_CONCURRENCY),
        });
      } else if (job === "verified-review") {
        result = await runTerafabxVerifiedCommentReviewOnce({ manual: true, limit: Number(payload.limit || TERAFABX_VERIFIED_REVIEW_BATCH_SIZE) });
      } else if (job === "review-comment") {
        result = await runTerafabxCommentReviewQueue({
          manual: true,
          limit: Number(payload.limit || 0),
          minScore: Number(payload.minScore || TERAFABX_REVIEW_COMMENT_MIN_SCORE),
          delayMs: Number(payload.delayMs ?? TERAFABX_REVIEW_COMMENT_DELAY_MS),
        });
      } else if (job === "follow") {
        result = await runTerafabxFollowOnce({ manual: true, limit: Number(payload.limit || TERAFABX_FOLLOW_LIMIT) });
      } else {
        result = await runTerafabxHeartOnce({ manual: true });
      }
      json(res, 200, { ok: true, job, action, result, status: getTerafabxAutomationStatus() });
    } catch (error) {
      logEvent("terafabx_action_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/terafabx/affiliate-comment") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await postTerafabxAffiliateComment(payload);
      json(res, 200, { ok: true, result, status: getTerafabxAutomationStatus() });
    } catch (error) {
      logEvent("terafabx_affiliate_comment_action_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/coupang/performance")) {
    try {
      const parsedUrl = new URL(req.url, "http://localhost");
      const result = await getCoupangPerformanceData({
        startDate: parsedUrl.searchParams.get("startDate") || "",
        endDate: parsedUrl.searchParams.get("endDate") || "",
      });
      json(res, 200, result);
    } catch (error) {
      logEvent("coupang_performance_api_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/discovery")) {
    try {
      if (fs.existsSync(DASHBOARD_INDEX_PATH)) {
        serveFile(res, DASHBOARD_INDEX_PATH);
      } else {
        html(res, 200, await renderDiscoveryDashboard(req.url));
      }
    } catch (error) {
      logEvent("discovery_dashboard_error", { error: error.message });
      html(res, 500, `<pre>${escapeHtml(error.message)}</pre>`);
    }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/discovery/media-download")) {
    try {
      const parsedUrl = new URL(req.url, "http://localhost");
      const mediaUrl = parsedUrl.searchParams.get("url") || "";
      if (!/^https?:\/\//i.test(mediaUrl)) throw new Error("다운로드할 미디어 URL이 없습니다.");
      await proxyMediaDownload(mediaUrl, res);
      logEvent("discovery_media_download", { mediaUrl: mediaUrl.slice(0, 240) });
    } catch (error) {
      logEvent("discovery_media_download_error", { error: error.message });
      if (!res.headersSent) json(res, 500, { ok: false, error: error.message });
      else res.destroy(error);
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/inspect-thread") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const canonicalUrl = normalizeDiscoveryUrl(payload.url);
      const threadPost = await extractThreadPost(canonicalUrl);
      json(res, 200, {
        ok: true,
        canonicalUrl,
        text: threadPost.text,
        likeCount: threadPost.likeCount,
        mediaCount: threadPost.mediaUrls.length,
        mediaUrls: threadPost.mediaUrls,
        diagnostics: threadPost.diagnostics,
      });
    } catch (error) {
      logEvent("inspect_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/run") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await runDiscoveryScan({
        manual: true,
        minLikes: payload.minLikes || DISCOVERY_MIN_LIKES,
        maxScrolls: payload.maxScrolls || DISCOVERY_MAX_SCROLLS,
      });
      json(res, 200, {
        ok: true,
        found: result.found || 0,
        validated: result.validated || 0,
        saved: result.saved,
        rejected: result.rejected || [],
        candidates: (result.candidates || []).slice(0, 20),
      });
    } catch (error) {
      logEvent("discovery_run_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/process-due") {
    try {
      const result = await processDueDiscoveryPost();
      json(res, result.ok ? 200 : 500, result);
    } catch (error) {
      logEvent("discovery_process_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/refresh-previews") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await refreshDiscoveryPreviews(Number(payload.limit || 20));
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("discovery_refresh_previews_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/refetch") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await refetchDiscoveryRow(payload.url, { text: payload.text });
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("discovery_refetch_request_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/add-url") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const placeholder = await addDiscoveryPlaceholder(payload.url, { text: payload.text, origin: payload.origin || "sync_api" });
      json(res, 202, {
        ok: true,
        accepted: true,
        canonicalUrl: placeholder.canonicalUrl,
        saved: placeholder,
        message: "대시보드에 즉시 추가됨. 미리보기는 백그라운드에서 보강 중입니다.",
      });
      setImmediate(async () => {
        try {
          await addThreadToDiscoveryReview(placeholder.canonicalUrl, { text: payload.text });
        } catch (error) {
          await markDiscoveryDetailError(placeholder.canonicalUrl, error).catch(() => {});
          logEvent("discovery_add_url_async_error", {
            canonicalUrl: placeholder.canonicalUrl,
            origin: payload.origin || "sync_api",
            error: error.message,
          });
        }
      });
    } catch (error) {
      logEvent("discovery_add_url_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/add-url-async") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const placeholder = await addDiscoveryPlaceholder(payload.url, { text: payload.text, origin: payload.origin || "async_api" });
      json(res, 202, {
        ok: true,
        accepted: true,
        canonicalUrl: placeholder.canonicalUrl,
        saved: placeholder,
        message: "대시보드에 즉시 추가됨. 미리보기는 백그라운드에서 보강 중입니다.",
      });
      setImmediate(async () => {
        try {
          await addThreadToDiscoveryReview(placeholder.canonicalUrl, { text: payload.text });
        } catch (error) {
          await markDiscoveryDetailError(placeholder.canonicalUrl, error).catch(() => {});
          logEvent("discovery_add_url_async_error", {
            canonicalUrl: placeholder.canonicalUrl,
            origin: payload.origin || null,
            error: error.message,
          });
        }
      });
    } catch (error) {
      logEvent("discovery_add_url_async_accept_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/title") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const canonicalUrl = normalizeDiscoveryUrl(payload.url);
      const result = await updateDiscoveryTitle(canonicalUrl, payload.text);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("discovery_title_update_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/post") {
    if (busy) {
      json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
      return;
    }
    let canonicalUrl = "";
    busy = true;
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      canonicalUrl = normalizeDiscoveryUrl(payload.url);
      if (payload.text && String(payload.text).trim()) {
        await updateDiscoveryTitle(canonicalUrl, payload.text);
      }
      const result = await postDiscoveryRowToX(canonicalUrl, {
        textOverride: payload.text,
        schedule: false,
      });
      await markDiscoveryPosted(canonicalUrl, result.mediaCount);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      if (canonicalUrl) await markDiscoveryPostFailed(canonicalUrl, error);
      if (error instanceof DuplicateMirrorError) {
        logEvent("discovery_manual_post_duplicate", { error: error.message, ...error.details });
        json(res, 409, { ok: false, duplicate: true, error: error.message, ...error.details });
      } else {
        logEvent("discovery_manual_post_error", { canonicalUrl, error: error.message });
        json(res, 500, { ok: false, error: error.message });
      }
    } finally {
      busy = false;
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/draft") {
    if (busy) {
      json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
      return;
    }
    let canonicalUrl = "";
    busy = true;
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      canonicalUrl = normalizeDiscoveryUrl(payload.url);
      if (payload.text && String(payload.text).trim()) {
        await updateDiscoveryTitle(canonicalUrl, payload.text);
      }
      const result = await createXDraftFromDiscoveryRow(canonicalUrl, {
        textOverride: payload.text,
      });
      await markDiscoveryDrafted(canonicalUrl, result.mediaCount);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      if (canonicalUrl) await markDiscoveryDraftFailed(canonicalUrl, error);
      logEvent("discovery_manual_draft_error", { canonicalUrl, error: error.message });
      json(res, 500, { ok: false, error: error.message });
    } finally {
      busy = false;
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/coupang-affiliate-comment") {
    let canonicalUrl = "";
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      canonicalUrl = normalizeDiscoveryUrl(payload.url);
      const result = await postDiscoveryCoupangAffiliateReply(canonicalUrl);
      json(res, 200, { ok: true, result, status: getTerafabxAutomationStatus() });
    } catch (error) {
      logEvent("discovery_coupang_affiliate_comment_error", { canonicalUrl, error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/discovery/dashboard")) {
    try {
      json(res, 200, await getDiscoveryDashboardData(req.url));
    } catch (error) {
      logEvent("discovery_dashboard_api_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/auto-scan") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const settings = setAutoDiscoveryEnabled(payload.enabled === true);
      json(res, 200, { ok: true, autoDiscoveryEnabled: settings.autoDiscoveryEnabled });
    } catch (error) {
      logEvent("discovery_auto_scan_setting_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/discard-discovered") {
    try {
      const result = await discardDiscoveredRows();
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("discovery_discard_discovered_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/discard") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await discardDiscoveryRow(payload.url);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("discovery_discard_row_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/schedule") {
    if (busy) {
      json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
      return;
    }
    let canonicalUrl = "";
    busy = true;
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      canonicalUrl = normalizeDiscoveryUrl(payload.url);
      if (payload.text && String(payload.text).trim()) {
        await updateDiscoveryTitle(canonicalUrl, payload.text);
      }
      logEvent("discovery_manual_schedule_request", {
        canonicalUrl,
        scheduledAtRaw: payload.scheduledAt || null,
        browserTimezone: payload.scheduledAtTimezone || null,
        browserOffsetMinutes: Number.isFinite(Number(payload.scheduledAtOffsetMinutes)) ? Number(payload.scheduledAtOffsetMinutes) : null,
      });
      const result = await postDiscoveryRowToX(canonicalUrl, {
        textOverride: payload.text,
        schedule: true,
        scheduledAt: payload.scheduledAt,
      });
      await markDiscoveryScheduled(canonicalUrl, result.mediaCount, result.scheduledAt);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      if (canonicalUrl) await markDiscoveryScheduleFailed(canonicalUrl, error);
      if (error instanceof DuplicateMirrorError) {
        logEvent("discovery_manual_schedule_duplicate", { error: error.message, ...error.details });
        json(res, 409, { ok: false, duplicate: true, error: error.message, ...error.details });
      } else {
        logEvent("discovery_manual_schedule_error", { canonicalUrl, error: error.message });
        json(res, 500, { ok: false, error: error.message });
      }
    } finally {
      busy = false;
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/auto-schedule") {
    if (busy) {
      json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
      return;
    }
    let canonicalUrl = "";
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      canonicalUrl = normalizeDiscoveryUrl(payload.url);
      const result = await runDiscoveryAutoSchedule(canonicalUrl, {
        text: payload.text,
        source: "dashboard",
      });
      json(res, 200, { ok: true, autoScheduled: true, ...result });
    } catch (error) {
      if (canonicalUrl) await markDiscoveryScheduleFailed(canonicalUrl, error);
      if (error instanceof DuplicateMirrorError) {
        logEvent("discovery_auto_schedule_duplicate", { error: error.message, ...error.details });
        json(res, 409, { ok: false, duplicate: true, error: error.message, ...error.details });
      } else {
        logEvent("discovery_auto_schedule_error", { canonicalUrl, error: error.message });
        json(res, 500, { ok: false, error: error.message });
      }
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/discovery/auto-schedule-async") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const canonicalUrl = validateThreadsUrl(payload.url);
      const completed = findCompletedMirror(canonicalUrl);
      if (completed) {
        json(res, 409, {
          ok: false,
          duplicate: true,
          error: "이미 X에 게시 또는 예약된 Threads URL입니다.",
          canonicalUrl,
          previousStatus: completed.status,
          previousScheduledAt: completed.scheduledAt,
          previousCompletedAt: completed.completedAt,
        });
        return;
      }
      const placeholder = await addDiscoveryPlaceholder(canonicalUrl, {
        text: payload.text,
        origin: payload.origin || "auto_schedule_async",
      });
      json(res, 202, {
        ok: true,
        accepted: true,
        autoSchedule: true,
        canonicalUrl: placeholder.canonicalUrl,
        saved: placeholder,
        message: "자동 예약 접수됨. 대시보드에 저장하고 백그라운드에서 X 예약을 진행합니다.",
      });
      if (placeholder.skippedExcluded) {
        logEvent("discovery_auto_schedule_async_skipped", {
          canonicalUrl,
          source: payload.origin || "auto_schedule_async",
          reason: "excluded_keyword",
        });
        return;
      }
      setImmediate(() => {
        const source = payload.origin || "auto_schedule_async";
        enqueueDiscoveryAutoScheduleJob(canonicalUrl, source, async () => {
          try {
            logEvent("discovery_auto_schedule_async_start", { canonicalUrl, source });
            const detail = await addThreadToDiscoveryReview(canonicalUrl, { text: payload.text });
            if (detail.skipped) {
              logEvent("discovery_auto_schedule_async_skipped", {
                canonicalUrl,
                source,
                reason: detail.reason || null,
                keyword: detail.keyword || null,
              });
              return;
            }
            const result = await runDiscoveryAutoSchedule(canonicalUrl, {
              text: payload.text,
              source,
              waitForBusy: true,
            });
            logEvent("discovery_auto_schedule_async_success", {
              canonicalUrl,
              source,
              scheduledAt: result.scheduledAt || null,
              mediaCount: result.mediaCount,
            });
          } catch (error) {
            await markDiscoveryScheduleFailed(canonicalUrl, error).catch(() => {});
            logEvent("discovery_auto_schedule_async_error", {
              canonicalUrl,
              source,
              error: error.message,
            });
          }
        }).catch(() => {});
      });
    } catch (error) {
      logEvent("discovery_auto_schedule_async_accept_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/discovery/status")) {
    try {
      const rows = await listDiscoveryRows(50);
      json(res, 200, {
        ok: true,
        mode: "dashboard_manual_post",
        xDraftOnly: false,
        autoDiscoveryEnabled: isAutoDiscoveryEnabled(),
        minLikes: DISCOVERY_MIN_LIKES,
        maxScrolls: DISCOVERY_MAX_SCROLLS,
        scanIntervalMs: DISCOVERY_SCAN_INTERVAL_MS,
        rows,
      });
    } catch (error) {
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/mirror-thread-async") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const canonicalUrl = validateThreadsUrl(payload.url);
      json(res, 202, { ok: true, accepted: true, canonicalUrl, message: "대시보드 추가 접수됨" });
      setImmediate(async () => {
        try {
          await addThreadToDiscoveryReview(canonicalUrl, { text: payload.text });
        } catch (error) {
          logEvent("share_add_to_discovery_error", { canonicalUrl, error: error.message });
        }
      });
    } catch (error) {
      logEvent("share_accept_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method !== "POST" || req.url !== "/api/mirror-thread") {
    json(res, 404, { ok: false, error: "not found" });
    return;
  }
  if (busy) {
    json(res, 429, { ok: false, error: "다른 미러링 작업이 진행 중입니다." });
    return;
  }
  busy = true;
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const result = await mirrorThread(payload.url, {
      textOverride: payload.text,
      schedule: Boolean(payload.schedule),
      scheduledAt: payload.scheduledAt,
    });
    json(res, 200, { ok: true, ...result });
  } catch (error) {
    if (error instanceof DuplicateMirrorError) {
      logEvent("mirror_duplicate", { error: error.message, ...error.details });
      json(res, 409, { ok: false, duplicate: true, error: error.message, ...error.details });
      return;
    }
    logEvent("mirror_error", { error: error.message });
    json(res, 500, { ok: false, error: error.message });
  } finally {
    busy = false;
  }
});

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function startServer() {
  installProcessDiagnostics();
  server.on("error", (error) => {
    logProcessEvent("server_listen_error", { error: serializeProcessError(error), port: PORT });
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`thread mirror server listening on http://0.0.0.0:${PORT}`);
    console.log(`using Chrome remote debugging port ${CHROME_PORT}; required X account @${REQUIRED_X_HANDLE}`);
    logEvent("server_listening", { port: PORT, chromePort: CHROME_PORT, pid: process.pid });
  });

  setTimeout(() => {
    maybeRunScheduledInssiderReplies().catch((error) => {
      logEvent("inssider_scheduled_reply_startup_error", { error: error.message });
    });
  }, 5000);

  setInterval(() => {
    runDiscoveryScan().catch((error) => {
      logEvent("discovery_auto_scan_error", { error: error.message });
    });
  }, DISCOVERY_SCAN_INTERVAL_MS);

  setInterval(() => {
    maybeRunNaverBlogScheduler().catch((error) => {
      appendNaverBlogEvent("scheduler_tick_error", { error: error.message });
    });
  }, NAVER_BLOG_INTERVAL_MS);

  setInterval(() => {
    maybeRunTerafabxAutomation().catch((error) => {
      logEvent("terafabx_auto_tick_error", { error: error.message });
    });
  }, 60 * 1000);

  setInterval(() => {
    maybeRunScheduledInssiderReplies().catch((error) => {
      logEvent("inssider_scheduled_reply_tick_error", { error: error.message });
    });
  }, 60 * 1000);
}

if (require.main === module) {
  startServer();
}

module.exports = {
  cleanThreadText,
  dashboardDiscoveryRow,
  isPublishedDiscoveryRow,
  mergeDiscoveryRowsWithMirrorHistory,
  mirrorHistoryDashboardRow,
  mirrorHistoryPublishedTime,
  isTerafabxQuietPostingTime,
  publishedDiscoveryTime,
  splitInssiderReplyChunks,
  startServer,
  xWeightedLength,
};
