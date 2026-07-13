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
const X_SCHEDULE_MONITOR_INTERVAL_MS = Number(process.env.X_SCHEDULE_MONITOR_INTERVAL_MS || 10 * 60 * 1000);
const X_SCHEDULE_MONITOR_STATE_PATH = process.env.X_SCHEDULE_MONITOR_STATE_PATH || path.join(__dirname, ".data", "x-schedule-monitor-state.json");
const TERAFABX_COMMENT_MONITOR_INTERVAL_MS = Number(process.env.TERAFABX_COMMENT_MONITOR_INTERVAL_MS || 10 * 60 * 1000);
const TERAFABX_COMMENT_MONITOR_STATE_PATH = process.env.TERAFABX_COMMENT_MONITOR_STATE_PATH || path.join(__dirname, ".data", "terafabx-comment-monitor-state.json");
const TERAFABX_PREFILL_GENERICITY_ROLLOUT_AT = Date.parse(process.env.TERAFABX_PREFILL_GENERICITY_ROLLOUT_AT || "2026-07-13T13:00:00.000Z");
const TERAFABX_OWN_POST_REPLY_INTERVAL_MS = Number(process.env.TERAFABX_OWN_POST_REPLY_INTERVAL_MS || 10 * 60 * 1000);
const TERAFABX_OWN_POST_REPLY_MAX_SCROLLS = Number(process.env.TERAFABX_OWN_POST_REPLY_MAX_SCROLLS || 20);
const TERAFABX_BROWSER_CONCURRENCY_CAP = 5;
const TERAFABX_OWN_POST_REPLY_CONCURRENCY = Number(process.env.TERAFABX_OWN_POST_REPLY_CONCURRENCY || TERAFABX_BROWSER_CONCURRENCY_CAP);
const TERAFABX_OWN_POST_REPLY_BATCH_LIMIT = Number(process.env.TERAFABX_OWN_POST_REPLY_BATCH_LIMIT || 200);
const TERAFABX_OWN_POST_REPLY_SINGLE_CANDIDATE_LIMIT = Number(process.env.TERAFABX_OWN_POST_REPLY_SINGLE_CANDIDATE_LIMIT || 5);
const TERAFABX_IMAGE_ONLY_REPLY_EMOJI = process.env.TERAFABX_IMAGE_ONLY_REPLY_EMOJI || "❤️";
const TERAFABX_OWN_POST_REPLY_DELAY_MIN_MS = Number(process.env.TERAFABX_OWN_POST_REPLY_DELAY_MIN_MS || 10_000);
const TERAFABX_OWN_POST_REPLY_DELAY_MAX_MS = Number(process.env.TERAFABX_OWN_POST_REPLY_DELAY_MAX_MS || 20_000);
const TERAFABX_OWN_POST_REPLY_GEMINI_PORT_BASE = Number(process.env.TERAFABX_OWN_POST_REPLY_GEMINI_PORT_BASE || 9264);
const DISCOVERY_MIN_VIRAL_SCORE = Number(process.env.DISCOVERY_MIN_VIRAL_SCORE || 3);
const DISCOVERY_MAX_SCROLLS = Number(process.env.DISCOVERY_MAX_SCROLLS || 20);
const GROK_BIN = process.env.GROK_BIN || "/Users/user/.local/bin/grok";
const AGENT_BROWSER_BIN = process.env.AGENT_BROWSER_BIN || "npx";
const TERAFABX_GROK_PROVIDER = String(process.env.TERAFABX_GROK_PROVIDER || "web").toLowerCase();
const TERAFABX_GROK_WEB_STATE_PATH = process.env.TERAFABX_GROK_WEB_STATE_PATH || path.join(__dirname, ".data", "agent-browser", "terafabx-grok-state.json");
const TERAFABX_GROK_WEB_RUN_DIR = process.env.TERAFABX_GROK_WEB_RUN_DIR || path.join(__dirname, ".data", "terafabx-grok-web-runs");
const TERAFABX_GROK_WEB_SESSION = process.env.TERAFABX_GROK_WEB_SESSION || "terafabx-grok-headless";
const TERAFABX_GROK_WEB_URL = process.env.TERAFABX_GROK_WEB_URL || "https://x.com/i/grok";
const TERAFABX_GROK_WEB_TIMEOUT_MS = Number(process.env.TERAFABX_GROK_WEB_TIMEOUT_MS || 180_000);
const TERAFABX_GROK_WEB_SOURCE_CDP_PORT = Number(process.env.TERAFABX_GROK_WEB_SOURCE_CDP_PORT || CHROME_PORT);
const TERAFABX_GROK_WEB_REFRESH_STATE = process.env.TERAFABX_GROK_WEB_REFRESH_STATE !== "false";
const TERAFABX_GROK_WEB_SCRIPT_PATH = path.join(__dirname, "scripts", "terafabx-grok-web-agent.js");
const TERAFABX_STATE_PATH = process.env.TERAFABX_STATE_PATH || path.join(__dirname, ".data", "terafabx-automation-state.json");
const TERAFABX_COMMENT_REVIEW_QUEUE_PATH = process.env.TERAFABX_COMMENT_REVIEW_QUEUE_PATH || path.join(__dirname, ".data", "terafabx-comment-review-queue.json");
const TERAFABX_LOCK_PATH = process.env.TERAFABX_LOCK_PATH || path.join(os.tmpdir(), "terafabx-cdp9224.lock");
const TERAFABX_COMMENT_DAILY_TARGET = Number(process.env.TERAFABX_COMMENT_DAILY_TARGET || 600);
const TERAFABX_COMMENT_HISTORY_LIMIT = Number(process.env.TERAFABX_COMMENT_HISTORY_LIMIT || 2000);
const TERAFABX_COMMENT_MIN_INTERVAL_MS = Number(process.env.TERAFABX_COMMENT_MIN_INTERVAL_MS || 60 * 1000);
const TERAFABX_COMMENT_INTERVAL_MS = Number(process.env.TERAFABX_COMMENT_INTERVAL_MS || 137 * 1000);
const TERAFABX_VERIFIED_REVIEW_INTERVAL_MS = Number(process.env.TERAFABX_VERIFIED_REVIEW_INTERVAL_MS || 5 * 60 * 1000);
const TERAFABX_VERIFIED_REVIEW_TARGET_COUNT = Number(process.env.TERAFABX_VERIFIED_REVIEW_TARGET_COUNT || 288);
const TERAFABX_VERIFIED_REVIEW_BATCH_SIZE = Number(process.env.TERAFABX_VERIFIED_REVIEW_BATCH_SIZE || 5);
const TERAFABX_VERIFIED_REVIEW_MAX_TARGETS_PER_RUN = Number(process.env.TERAFABX_VERIFIED_REVIEW_MAX_TARGETS_PER_RUN || 5);
const TERAFABX_VERIFIED_REVIEW_CONCURRENCY = Number(process.env.TERAFABX_VERIFIED_REVIEW_CONCURRENCY || TERAFABX_BROWSER_CONCURRENCY_CAP);
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
const TERAFABX_COMMENT_PREFILL_TARGET = Number(process.env.TERAFABX_COMMENT_PREFILL_TARGET || 200);
const TERAFABX_COMMENT_PREFILL_CONCURRENCY = Number(process.env.TERAFABX_COMMENT_PREFILL_CONCURRENCY || TERAFABX_BROWSER_CONCURRENCY_CAP);
const TERAFABX_COMMENT_PREFILL_GEMINI_PORT_BASE = Number(process.env.TERAFABX_COMMENT_PREFILL_GEMINI_PORT_BASE || 9254);
const TERAFABX_PENDING_COMMENT_MAX_ATTEMPTS = Number(process.env.TERAFABX_PENDING_COMMENT_MAX_ATTEMPTS || 3);
const CDP_HTTP_TIMEOUT_MS = Number(process.env.CDP_HTTP_TIMEOUT_MS || 10_000);
const CDP_WS_OPEN_TIMEOUT_MS = Number(process.env.CDP_WS_OPEN_TIMEOUT_MS || 10_000);
const TERAFABX_REVIEW_COMMENT_MIN_SCORE = Number(process.env.TERAFABX_REVIEW_COMMENT_MIN_SCORE || 90);
const TERAFABX_REVIEW_COMMENT_AUTO_POST = process.env.TERAFABX_REVIEW_COMMENT_AUTO_POST !== "false";
const TERAFABX_REVIEW_COMMENT_AUTO_POST_LIMIT = Number(process.env.TERAFABX_REVIEW_COMMENT_AUTO_POST_LIMIT || 5);
const TERAFABX_REVIEW_COMMENT_DELAY_MS = Number(process.env.TERAFABX_REVIEW_COMMENT_DELAY_MS || 30_000);
const TERAFABX_QUIET_POSTING_START_HOUR = Number(process.env.TERAFABX_QUIET_POSTING_START_HOUR || 1);
const TERAFABX_QUIET_POSTING_END_HOUR = Number(process.env.TERAFABX_QUIET_POSTING_END_HOUR || 7);
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
const TERAFABX_JOB_GAP_MS = Math.max(0, Number(process.env.TERAFABX_JOB_GAP_MS || 0));
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
const TERAFABX_OWN_POST_REPLY_BATCH_REVIEW_ENABLED = process.env.TERAFABX_OWN_POST_REPLY_BATCH_REVIEW_ENABLED !== "false";
const TERAFABX_OWN_POST_REPLY_BATCH_REVIEW_TIMEOUT_MS = Number(process.env.TERAFABX_OWN_POST_REPLY_BATCH_REVIEW_TIMEOUT_MS || 300_000);
const TERAFABX_GEMINI_GENERATION_FALLBACK_ENABLED = process.env.TERAFABX_GEMINI_GENERATION_FALLBACK_ENABLED !== "false";
const TERAFABX_GEMINI_CHROME_PORT = Number(process.env.TERAFABX_GEMINI_CHROME_PORT || 9234);
const TERAFABX_BROWSER_USER_AGENT = process.env.TERAFABX_BROWSER_USER_AGENT || "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const TERAFABX_VERIFIED_REVIEW_GEMINI_PORT_BASE = Number(process.env.TERAFABX_VERIFIED_REVIEW_GEMINI_PORT_BASE || TERAFABX_GEMINI_CHROME_PORT + 10);
const TERAFABX_GEMINI_PROFILE_DIR = process.env.TERAFABX_GEMINI_PROFILE_DIR || path.join(__dirname, ".data", "chrome-profiles", "terafabx-gemini-review");
const TERAFABX_GEMINI_PROFILE_TEMPLATE_DIR = process.env.TERAFABX_GEMINI_PROFILE_TEMPLATE_DIR || path.join(__dirname, ".data", "chrome-profiles", "pink-default-visible-9224");
const TERAFABX_GEMINI_REVIEW_DIR = process.env.TERAFABX_GEMINI_REVIEW_DIR || path.join(__dirname, ".data", "terafabx-gemini-reviews");
const TERAFABX_VERIFIED_REVIEW_GROK_TIMEOUT_MS = Number(process.env.TERAFABX_VERIFIED_REVIEW_GROK_TIMEOUT_MS || 90_000);
const FXTWITTER_API_BASE = process.env.FXTWITTER_API_BASE || "https://api.fxtwitter.com";

let naverBlogSchedulerBusy = false;
let naverBlogManualBusy = false;

let busy = false;
let discoveryScanBusy = false;
let discoveryDbPromise = null;
let terafabxBusy = false;
let terafabxOwnPostReplyBusy = false;
let terafabxOwnPostReplySchedulerBusy = false;
let terafabxCommentPrefillBusy = false;
let terafabxSchedulerBusy = false;
let terafabxCommentSchedulerBusy = false;
let terafabxSchedulerStartedAt = null;
let terafabxManualActionPending = false;
let autoScheduleQueue = Promise.resolve();
let autoScheduleQueueDepth = 0;
let scheduledReplyBusy = false;
let xScheduleMonitorBusy = false;
let terafabxCommentMonitorBusy = false;
const terafabxActiveGrokSessions = new Set();
const activeAutomationChildProcesses = new Set();
const xScheduleRecoveryInFlight = new Set();
const DISCOVERY_STARTUP_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    startGracefulServerShutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    startGracefulServerShutdown("SIGINT");
  });
  process.on("SIGHUP", () => {
    logProcessEvent("server_process_signal", { signal: "SIGHUP", action: "ignored" });
  });
}

let gracefulServerShutdownStarted = false;

function startGracefulServerShutdown(signal) {
  if (gracefulServerShutdownStarted) return;
  gracefulServerShutdownStarted = true;
  logProcessEvent("server_process_signal", { signal, action: "cleanup_automation_browsers" });
  try { server.close(); } catch {}
  const timeoutMs = 15_000;
  Promise.race([
    cleanupTerafabxAutomationBrowsersOnShutdown(),
    sleep(timeoutMs).then(() => ({ timedOut: true, timeoutMs })),
  ]).then((cleanup) => {
    logProcessEvent("server_shutdown_cleanup", { signal, cleanup });
    process.exit(0);
  }).catch((error) => {
    logProcessEvent("server_shutdown_cleanup_error", { signal, error: serializeProcessError(error) });
    process.exit(0);
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

function truncateXText(text, maxLength = 270) {
  const value = String(text || "").trim();
  if (xWeightedLength(value) <= maxLength) return value;
  const ellipsis = "…";
  const contentLimit = Math.max(0, maxLength - xWeightedLength(ellipsis));
  let result = "";
  let length = 0;
  for (const char of value) {
    const weight = xWeightedLength(char);
    if (length + weight > contentLimit) break;
    result += char;
    length += weight;
  }
  return `${result.trimEnd()}${ellipsis}`;
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
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed";
      const lineNumber = Number(result.exceptionDetails.lineNumber);
      const sourceLine = Number.isFinite(lineNumber) ? String(expression).split("\n")[lineNumber] || "" : "";
      throw new Error(`${detail} at ${result.exceptionDetails.lineNumber ?? "?"}:${result.exceptionDetails.columnNumber ?? "?"} source=${JSON.stringify(sourceLine.slice(0, 240))}`);
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
      const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime evaluation failed";
      const lineNumber = Number(result.exceptionDetails.lineNumber);
      const sourceLine = Number.isFinite(lineNumber) ? String(expression).split("\n")[lineNumber] || "" : "";
      throw new Error(`${detail} at ${result.exceptionDetails.lineNumber ?? "?"}:${result.exceptionDetails.columnNumber ?? "?"} source=${JSON.stringify(sourceLine.slice(0, 240))}`);
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
    for (const method of ["PUT", "GET"]) {
      try {
        await requestJsonForPort(this.port, method, `/json/close/${this.tab.id}`);
      } catch {}
      await sleep(100);
      try {
        const tabs = await requestJsonForPort(this.port, "GET", "/json/list");
        if (!tabs.some((tab) => tab.id === this.tab.id)) return;
      } catch {}
    }
    logEvent("cdp_tab_close_failed", {
      tabId: this.tab.id,
      port: this.port,
      url: this.tab.url || null,
    });
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

function removeScheduledReplyItem(canonicalUrl) {
  const state = loadScheduledReplyState();
  saveScheduledReplyState({
    items: (state.items || []).filter((entry) => entry.canonicalUrl !== canonicalUrl),
  });
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
    ownPostReplyEnabled: false,
    ownPostReplyTargets: [],
    ownPostReplyHistory: [],
    ownPostReplyManualQueue: [],
    lastOwnPostReplyRunAt: null,
    lastOwnPostReplyStatus: null,
    lastOwnPostReplyError: null,
    lastOwnPostReplyTarget: null,
    lastOwnPostReplyUrl: null,
  };
  return { ...defaults, ...readJsonFile(TERAFABX_STATE_PATH, defaults) };
}

function normalizeTerafabxOwnPostReplyManualQueue(value) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && item.id && item.postUrl)
    .map((item) => ({
      ...item,
      postUrl: normalizeXStatusUrl(item.postUrl),
      status: String(item.status || "queued"),
    }))
    .slice(-30);
}

function terafabxOwnPostReplyQueueItemForUrl(queue, postUrl) {
  const normalized = normalizeXStatusUrl(postUrl);
  return [...(Array.isArray(queue) ? queue : [])]
    .reverse()
    .find((item) => normalizeXStatusUrl(item?.postUrl || "") === normalized) || null;
}

function saveTerafabxOwnPostReplyQueue(queue) {
  return saveTerafabxState({ ownPostReplyManualQueue: (Array.isArray(queue) ? queue : []).slice(-30) });
}

function enqueueTerafabxOwnPostReplyBatch(postUrl, options = {}) {
  const normalized = normalizeXStatusUrl(postUrl);
  const state = loadTerafabxState();
  const queue = normalizeTerafabxOwnPostReplyManualQueue(state.ownPostReplyManualQueue);
  const existing = [...queue].reverse().find((item) =>
    normalizeXStatusUrl(item.postUrl) === normalized && ["queued", "running"].includes(item.status)
  );
  if (existing) {
    setImmediate(() => maybeRunTerafabxOwnPostReplyAutomation().catch((error) => {
      logEvent("terafabx_own_post_reply_manual_queue_start_error", { id: existing.id, postUrl: normalized, error: error.message });
    }));
    return { item: existing, duplicate: true };
  }
  const now = new Date().toISOString();
  const item = {
    id: `own-post-reply-${Date.now()}-${(parseXStatusUrl(normalized)?.id || "post")}`,
    postUrl: normalized,
    status: "queued",
    stage: "queued",
    stageLabel: "대기 중",
    queuedAt: now,
    startedAt: null,
    completedAt: null,
    candidateCount: null,
    preparedCount: 0,
    reviewedCount: 0,
    postedCount: 0,
    rejectedCount: 0,
    error: null,
    options: {
      concurrency: terafabxBrowserConcurrency(options.concurrency || TERAFABX_OWN_POST_REPLY_CONCURRENCY),
      limit: terafabxOwnPostReplyBatchLimit(options.limit || TERAFABX_OWN_POST_REPLY_BATCH_LIMIT),
      delayMinMs: Number(options.delayMinMs || TERAFABX_OWN_POST_REPLY_DELAY_MIN_MS),
      delayMaxMs: Number(options.delayMaxMs || TERAFABX_OWN_POST_REPLY_DELAY_MAX_MS),
    },
  };
  saveTerafabxOwnPostReplyQueue([...queue, item]);
  logEvent("terafabx_own_post_reply_manual_queued", { id: item.id, postUrl: normalized });
  setImmediate(() => {
    maybeRunTerafabxOwnPostReplyAutomation().catch((error) => {
      logEvent("terafabx_own_post_reply_manual_queue_start_error", { id: item.id, postUrl: normalized, error: error.message });
    });
  });
  return { item, duplicate: false };
}

function updateTerafabxOwnPostReplyQueueItem(id, patchValue) {
  const state = loadTerafabxState();
  const queue = normalizeTerafabxOwnPostReplyManualQueue(state.ownPostReplyManualQueue);
  let updated = null;
  const next = queue.map((item) => {
    if (item.id !== id) return item;
    updated = { ...item, ...patchValue, updatedAt: new Date().toISOString() };
    return updated;
  });
  saveTerafabxOwnPostReplyQueue(next);
  return updated;
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

function terafabxDailyCommentProgress(state = loadTerafabxState(), nowValue = new Date(), options = {}) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue || Date.now());
  const dailyTarget = Math.max(0, Number(options.dailyTarget ?? TERAFABX_COMMENT_DAILY_TARGET));
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const minuteOfDay = (Number(parts.hour) * 60) + Number(parts.minute) + (Number(parts.second) / 60);
  const quietStart = TERAFABX_QUIET_POSTING_START_HOUR;
  const quietEnd = TERAFABX_QUIET_POSTING_END_HOUR;
  const isActiveHour = (hour) => {
    if (quietStart === quietEnd) return true;
    const quiet = quietStart < quietEnd
      ? hour >= quietStart && hour < quietEnd
      : hour >= quietStart || hour < quietEnd;
    return !quiet;
  };
  let activeMinutesTotal = 0;
  let activeMinutesElapsed = 0;
  for (let hour = 0; hour < 24; hour += 1) {
    if (!isActiveHour(hour)) continue;
    activeMinutesTotal += 60;
    activeMinutesElapsed += Math.max(0, Math.min(60, minuteOfDay - (hour * 60)));
  }
  const todayKey = formatKstDateKey(now);
  const postedKeys = new Set();
  for (const record of state?.commentHistory || []) {
    const time = record?.postedAt || record?.at;
    if (!record?.replyUrl || !time || formatKstDateKey(time) !== todayKey) continue;
    postedKeys.add(String(record.replyUrl || record.targetUrl || `${time}:${record.comment || ""}`));
  }
  const postedToday = postedKeys.size;
  const remaining = Math.max(0, dailyTarget - postedToday);
  const targetByNow = activeMinutesTotal > 0
    ? Math.min(dailyTarget, Math.floor((activeMinutesElapsed / activeMinutesTotal) * dailyTarget))
    : dailyTarget;
  const activeMinutesRemaining = Math.max(0, activeMinutesTotal - activeMinutesElapsed);
  const baseIntervalMs = dailyTarget > 0
    ? Math.max(TERAFABX_COMMENT_MIN_INTERVAL_MS, Math.floor((activeMinutesTotal * 60 * 1000) / dailyTarget))
    : TERAFABX_COMMENT_INTERVAL_MS;
  const requiredIntervalMs = remaining > 0 && activeMinutesRemaining > 0
    ? Math.min(baseIntervalMs, Math.max(TERAFABX_COMMENT_MIN_INTERVAL_MS, Math.floor((activeMinutesRemaining * 60 * 1000) / remaining)))
    : baseIntervalMs;
  return {
    date: todayKey,
    dailyTarget,
    postedToday,
    remaining,
    targetByNow,
    behindBy: Math.max(0, targetByNow - postedToday),
    activeMinutesTotal: Math.round(activeMinutesTotal),
    activeMinutesElapsed: Math.round(activeMinutesElapsed),
    activeMinutesRemaining: Math.round(activeMinutesRemaining),
    baseIntervalMs,
    requiredIntervalMs,
    reached: remaining === 0,
  };
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
  if (length >= 10 && length <= 45) {
    score += 10;
    reasons.push("good_length");
  } else if (length >= 6 && length < 10) {
    score += 2;
    reasons.push("short_but_usable");
  } else if (length < 6) {
    score -= 25;
    reasons.push("too_short");
  } else {
    score -= 8;
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
      const finalJudgeScore = Number(item.geminiReview?.finalJudge?.score ?? item.geminiReview?.score);
      const hasFinalJudgeScore = Number.isFinite(finalJudgeScore);
      const qualityScore = hasFinalJudgeScore ? finalJudgeScore : localQuality.score;
      return {
        at: item.at,
        date: formatKstDateKey(item.at),
        source: item.source || "",
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
        qualitySource: hasFinalJudgeScore ? "independent_headless_judge" : "local",
        qualityGrade: commentQualityGrade(qualityScore),
        qualityReasons: hasFinalJudgeScore ? [item.geminiReview?.finalJudge?.reason || item.geminiReview?.reason || "independent_headless_judge_score"].filter(Boolean) : localQuality.reasons,
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

function stripTerafabxListPrefix(value) {
  return String(value || "")
    .replace(/^\s*(?:(?:[-*•])\s+|(?:\d{1,3})[.)]\s+)/, "")
    .trim();
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
    .map((item) => cleanSocialText(stripTerafabxListPrefix(item)))
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
    reply: validateTerafabxReply(stripTerafabxListPrefix(replyRaw)),
    contextSummary: cleanSocialText(source.contextSummary || source.context_summary || source.analysis || source.context || "").slice(0, 1200),
    keyPoints: normalizeTerafabxGrokKeyPoints(source.keyPoints || source.key_points || source.points || []),
    rawPreview: String(source.rawPreview || source.raw || "").slice(0, 1200),
  };
}

function normalizeTerafabxContextResult(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    contextSummary: cleanSocialText(source.contextSummary || source.context_summary || source.analysis || source.context || "").slice(0, 1200),
    keyPoints: normalizeTerafabxGrokKeyPoints(source.keyPoints || source.key_points || source.points || []),
    rawPreview: String(source.rawPreview || source.raw || "").slice(0, 1200),
  };
}

function parseTerafabxGrokContext(raw) {
  const source = String(raw || "").trim();
  const parsed = JSON.parse(extractJsonObjectText(source));
  return normalizeTerafabxContextResult({
    contextSummary: parsed.context_summary || parsed.contextSummary || parsed.analysis || parsed.context,
    keyPoints: parsed.key_points || parsed.keyPoints || parsed.points,
    rawPreview: source,
  });
}

function isTerafabxGrokNonJsonLimitText(raw) {
  const text = String(raw || "").trim();
  return !text.startsWith("{")
    && /you['’]?ve\s+reached|limit\s+of\s+\d+\s+grok|questions?\s+per\s+\d+\s+hours?/i.test(text);
}

function terafabxGrokContextForRecord(value) {
  const grok = normalizeTerafabxContextResult(value);
  return {
    summary: grok.contextSummary,
    keyPoints: grok.keyPoints,
    rawPreview: grok.rawPreview,
  };
}

function hasDetailedTerafabxGrokContext(value) {
  const grok = normalizeTerafabxContextResult(value);
  return grok.contextSummary.length >= 30 && grok.keyPoints.length >= 1;
}

function isTerafabxGrokContextFallback(value) {
  const grok = normalizeTerafabxContextResult(value);
  return grok.rawPreview === "local_text_context_after_grok_failure"
    || grok.contextSummary.startsWith("Grok 문맥 분석 실패 후 원문 텍스트를 직접 사용한다.");
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

function terafabxPromptContextLines(target = {}) {
  const targetText = cleanSocialText(target.targetText || target.text || "");
  const rootPostText = cleanSocialText(target.rootPostText || "");
  const rootPostUrl = normalizeXStatusUrl(target.rootPostUrl || "");
  if (rootPostUrl || rootPostText) {
    if (!rootPostText) throw new Error("부모 원글 문맥이 비어 있어 대댓글을 생성하지 않습니다.");
    return [
      "대댓글 문맥 규칙: 부모 원글과 답글 대상 댓글을 하나의 대화로 함께 해석해라.",
      "대상 댓글이 주어·장면을 생략하면 부모 원글에서 상속하고, 이미 보이는 대상을 누구·무엇·어떤 대상인지 모르는 듯 되묻지 마라.",
      `부모 원글 URL: ${rootPostUrl}`,
      `부모 원글: ${rootPostText.slice(0, 1800)}`,
      `답글 대상 댓글 URL: ${target.url || ""}`,
      `답글 대상 댓글: ${targetText.slice(0, 1800)}`,
    ];
  }
  return [
    `원문 URL: ${target.url || ""}`,
    `원문: ${targetText.slice(0, 1800)}`,
  ];
}

function assessTerafabxParentContextMismatch(target = {}, reply = "") {
  const rootPostText = cleanSocialText(target.rootPostText || "");
  const targetText = cleanSocialText(target.targetText || target.text || "");
  const comment = cleanSocialText(reply);
  const praisesVisibleSubject = /귀엽|기특|예쁘|멋지|착하|사랑스럽/.test(targetText);
  const asksUnknownSubject = /도대체\s*(?:어떤|누구|무슨)|(?:어떤|누구|무슨)\s*.{0,14}(?:길래|인가요|일까요|거예요)/.test(comment);
  const mismatch = Boolean(rootPostText && praisesVisibleSubject && asksUnknownSubject);
  return {
    ok: !mismatch,
    reason: mismatch ? "부모 원글에 보이는 대상을 모르는 듯 되묻는 문구" : null,
  };
}

function terafabxGeminiReviewPrompt(target, grokInput, qualityFeedback = null) {
  const grok = normalizeTerafabxGrokResult(grokInput);
  const keyPoints = grok.keyPoints.length
    ? grok.keyPoints.map((item) => `- ${item}`).join("\n")
    : "- 제공 없음";
  return [
    "너는 X 계정 @terafabXai(과즙루피)의 한국어 자동댓글 품질 검수자다.",
    "아래 원문 문맥, Grok의 원문 해석, Gemini 후보 댓글을 그대로 검토한 뒤 공개 답글로 올릴 최고품질 댓글 1개를 반환해라.",
    "Grok 문맥 분석은 보조 정보다. 원문과 충돌하면 원문을 우선하고, Grok의 틀린 추정은 바로잡아라.",
    "Gemini 후보가 충분히 좋으면 유지하고, 어색하거나 원문 맥락과 덜 맞으면 자연스럽게 다시 써라.",
    "규칙: 한국어 한 줄, 8~45자, 가능하면 12~30자. 길이를 늘리기보다 원문의 구체적인 장면·행동·감정 한 가지에 정확히 반응해라.",
    "짧더라도 문맥이 정확하고 자연스러우면 유지한다. 원문에 없는 정보, 범용 덕담, 요약 반복은 다시 써라.",
    "금지: 폭력/무기/성/도박/정치/투자 표현, 조롱, 단정적 비난, 링크, 해시태그, 이모지, 후보 목록, 따옴표.",
    ...terafabxCommentQualityPromptLines(),
    "너는 이 단계에서 점수를 매기지 않는다. 수정 여부와 최종 댓글만 결정해라.",
    "반드시 JSON 한 줄만 출력해라. 형식: {\"final_reply\":\"댓글\",\"decision\":\"keep|rewrite\",\"reason\":\"짧은 이유\"}",
    "",
    ...terafabxPromptContextLines(target),
    `Grok 문맥 분석: ${grok.contextSummary || "제공 없음"}`,
    `Grok 핵심 포인트:\n${keyPoints}`,
    `Gemini 후보 댓글: ${grok.reply}`,
    qualityFeedback ? `직전 독립 심사 탈락 사유: ${cleanSocialText(qualityFeedback)}` : null,
  ].filter(Boolean).join("\n");
}

function normalizeTerafabxBatchReviewInput(item = {}, index = 0) {
  const prepared = item.prepared || item;
  const target = item.target || prepared.target || {};
  const context = prepared.grokContext || {};
  const grok = normalizeTerafabxGrokResult({
    reply: prepared.grokComment || prepared.comment || prepared.reply || "",
    contextSummary: context.summary || context.contextSummary || prepared.contextSummary || "",
    keyPoints: context.keyPoints || prepared.keyPoints || [],
    rawPreview: context.rawPreview || prepared.rawPreview || "",
  });
  return {
    index,
    target,
    prepared,
    grok,
    candidate: item.candidate || null,
    review: item.review || prepared.review || null,
    finalReply: item.finalReply || item.review?.finalReply || prepared.finalReply || null,
    workerIndex: item.workerIndex,
  };
}

function terafabxGeminiBatchReviewPrompt(items = []) {
  const normalized = (Array.isArray(items) ? items : []).map(normalizeTerafabxBatchReviewInput);
  const blocks = normalized.map((item) => {
    const keyPoints = item.grok.keyPoints.length
      ? item.grok.keyPoints.map((point) => `  - ${point}`).join("\n")
      : "  - 제공 없음";
    return [
      `### index=${item.index}`,
      ...terafabxPromptContextLines(item.target).map((line) => `- ${line}`),
      `- Grok 문맥 분석: ${item.grok.contextSummary || "제공 없음"}`,
      `- Grok 핵심 포인트:\n${keyPoints}`,
      `- Gemini 후보 댓글: ${item.grok.reply}`,
    ].join("\n");
  }).join("\n\n");
  return [
    "너는 X 계정 @terafabXai(과즙루피)의 한국어 자동댓글 묶음 품질 검수자다.",
    "아래 여러 대댓글 후보를 index별로 서로 독립적으로 검토한 뒤 공개 답글로 올릴 최종 댓글을 반환해라.",
    "Grok 문맥 분석은 보조 정보다. 원문·부모 원글·답글 대상 댓글과 충돌하면 원문을 우선하고, Grok의 틀린 추정은 바로잡아라.",
    "후보가 충분히 좋으면 keep, 어색하거나 문맥이 덜 맞으면 rewrite, 안전하게 고칠 수 없거나 광고/민감/대상혼동이면 reject로 표시해라.",
    "규칙: 한국어 한 줄, 8~45자, 가능하면 12~30자. 원문의 구체적인 장면·행동·감정 한 가지에 정확히 반응해라.",
    "짧더라도 문맥이 정확하고 자연스러우면 유지한다. 원문에 없는 정보, 범용 덕담, 요약 반복은 다시 써라.",
    "금지: 폭력/무기/성/도박/정치/투자 표현, 조롱, 단정적 비난, 링크, 해시태그, 이모지, 후보 목록, 따옴표.",
    ...terafabxCommentQualityPromptLines(),
    "너는 이 단계에서 점수를 매기지 않는다. 수정 여부와 최종 댓글만 결정해라.",
    "반드시 JSON 배열 한 줄만 출력해라. 형식: [{\"index\":0,\"final_reply\":\"댓글\",\"decision\":\"keep|rewrite|reject\",\"reason\":\"짧은 이유\"}]",
    "",
    blocks,
  ].join("\n");
}

function terafabxGeminiBatchGeneratePrompt(items = []) {
  const blocks = (Array.isArray(items) ? items : []).map((item, index) => {
    const target = item.target || {};
    const context = normalizeTerafabxContextResult(item.grokContext || item.grok || {});
    return [
      `### index=${index}`,
      ...terafabxPromptContextLines(target).map((line) => `- ${line}`),
      `- Grok 문맥 분석: ${context.contextSummary || "제공 없음"}`,
      `- Grok 핵심 포인트: ${context.keyPoints.join(" / ") || "제공 없음"}`,
      item.qualityFeedback ? `- 직전 독립 심사 탈락 사유: ${cleanSocialText(item.qualityFeedback)}` : null,
    ].filter(Boolean).join("\n");
  }).join("\n\n");
  return [
    "너는 X 계정 @terafabXai(과즙루피)의 한국어 자동댓글 묶음 작성기다.",
    "각 index를 서로 독립적으로 처리해 댓글을 하나씩 작성하고, 공개 전에 문맥과 말투를 스스로 한 번 다듬어 최종 문장만 반환해라.",
    "이 단계에서는 점수를 매기지 마라. 다음 단계의 독립 심사자가 별도로 평가한다.",
    "규칙: 한국어 한 줄, 8~45자, 가능하면 12~30자. 원문의 구체적인 장면·행동·감정 한 가지에 정확히 반응해라.",
    "금지: 상투적 덕담, 작성자님, 원문 요약 반복, 원문에 없는 정보, 링크, 해시태그, 이모지, 따옴표, 후보 목록.",
    ...terafabxCommentQualityPromptLines(),
    "반드시 JSON 배열 한 줄만 출력해라. 형식: [{\"index\":0,\"final_reply\":\"댓글\",\"decision\":\"rewrite\",\"reason\":\"짧은 작성 근거\"}]",
    "",
    blocks,
  ].join("\n");
}

function terafabxGeminiBatchFinalJudgePrompt(items = []) {
  const normalized = (Array.isArray(items) ? items : []).map(normalizeTerafabxBatchReviewInput);
  const blocks = normalized.map((item) => {
    const finalReply = item.finalReply || item.review?.finalReply || item.prepared?.comment || item.grok.reply;
    return [
      `### index=${item.index}`,
      ...terafabxPromptContextLines(item.target).map((line) => `- ${line}`),
      `- 원문 분석: ${item.grok.contextSummary || "제공 없음"}`,
      `- 최종 심사 대상 댓글: ${finalReply}`,
    ].join("\n");
  }).join("\n\n");
  return [
    "너는 X 한국어 자동댓글의 독립 묶음 최종 심사자다. 댓글을 새로 쓰거나 수정하지 말고 품질만 엄격히 평가해라.",
    "제시된 댓글을 만든 모델의 자기평가는 제공되지 않으며 참고해서도 안 된다.",
    "각 index별 항목별 정수 점수: context 0~40, naturalness 0~25, specificity 0~15, concision 0~10, non_ai_style 0~10.",
    "context가 최우선이다. 짧더라도 원문 장면과 정확히 맞으면 높게 평가하고, 길이가 길다는 이유만으로 가점을 주지 마라.",
    "상투적 덕담, 원문 요약 반복, '작성자님', 어색한 명사 연결, 문장부호 없는 장문은 naturalness와 non_ai_style에서 크게 감점해라.",
    "최종 심사 대상 댓글의 실제 문자열만 평가해라. 원문에 있는 숫자가 댓글에서 빠졌다면 그 숫자가 있다고 가정하거나 보완해서 읽지 마라.",
    "오기·오타·조사 오류·문법 오류·불완전한 종결어미·번역체를 발견하면 reason에 문제 구절을 그대로 적고 naturalness를 최대 10점으로 제한해라.",
    "상투적 덕담이나 AI식 추상 요약체를 발견하면 non_ai_style을 최대 4점으로 제한해라.",
    "'진짜 신기하게', '딱 보이지 않나요', '계속 보게 되네요'처럼 여러 댓글에 반복될 법한 감탄 템플릿은 non_ai_style에서 크게 감점해라.",
    "Grok 분석의 대응 조언을 사실 근거로 취급하지 마라. source_anchor에는 반드시 원문 또는 부모 원글에 실제로 적힌 고유 명사·숫자·행동 구절을 원문 그대로 적어라.",
    "댓글이 같은 분야의 다른 글에도 그대로 붙을 수 있으면 cross_post_reusable=true다. 예: '폭로성 스캔들은 사실 확인이 먼저 필요합니다'처럼 일반 원칙만 말하는 문장.",
    "대화형 반응이 아니라 기사 제목·안전 표어·교훈 문장처럼 들리면 headline_tone=true다.",
    "댓글이 source_anchor의 구체적인 대상을 실제로 언급하거나 명확히 가리키지 않으면 specificity_error=true다.",
    "fatal_error는 대상 혼동, 원문과 반대되는 말, 사실 날조, 민감·금지 표현이 있을 때 true다.",
    "language_error는 오기·오타·맞춤법·조사·문법·불완전한 종결어미가 있으면 true다.",
    "awkward_korean은 뜻은 통하지만 한국어 구어체로 어색하거나 명사 연결이 부자연스러우면 true다.",
    "translation_tone은 직역체·번역체·과도하게 딱딱한 표현이면 true다.",
    "cliche는 범용 덕담·추상적 감탄·다른 글에도 붙일 수 있는 AI식 요약체면 true다.",
    "context_error는 원문과 어긋나거나 이미 보이는 대상을 모르는 듯 묻거나 사실을 추측하면 true다.",
    "부모 원글에 대상이나 장면이 이미 드러났는데도 댓글이 누구·무엇·어떤 대상인지 모르는 듯 되물으면 대상 혼동으로 보고 fatal_error=true로 판정해라.",
    "반드시 JSON 배열 한 줄만 출력해라. 모든 필드를 빠짐없이 포함해라. 형식: [{\"index\":0,\"context\":0,\"naturalness\":0,\"specificity\":0,\"concision\":0,\"non_ai_style\":0,\"fatal_error\":false,\"language_error\":false,\"awkward_korean\":false,\"translation_tone\":false,\"cliche\":false,\"context_error\":false,\"cross_post_reusable\":false,\"headline_tone\":false,\"specificity_error\":false,\"source_anchor\":\"원문에 실제로 있는 구절\",\"reason\":\"짧은 이유\"}]",
    "",
    blocks,
  ].join("\n");
}

function extractJsonObjectText(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function extractJsonValueText(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (!starts.length) return text;
  const start = Math.min(...starts);
  const close = text[start] === "[" ? "]" : "}";
  const end = text.lastIndexOf(close);
  if (end > start) return text.slice(start, end + 1);
  return text;
}

function parseTerafabxJsonCollection(raw, keys = []) {
  const parsed = JSON.parse(extractJsonValueText(raw));
  if (Array.isArray(parsed)) return parsed;
  for (const key of keys) {
    if (Array.isArray(parsed?.[key])) return parsed[key];
  }
  const firstArray = Object.values(parsed || {}).find(Array.isArray);
  if (firstArray) return firstArray;
  throw new Error("Gemini 묶음 JSON 배열을 찾지 못했습니다.");
}

function terafabxBatchResultIndex(row = {}, fallbackIndex = 0, expectedCount = Number.POSITIVE_INFINITY) {
  const index = Number(row.index ?? row.id ?? row.item_index ?? fallbackIndex);
  if (!Number.isInteger(index) || index < 0 || index >= expectedCount) {
    throw new Error(`Gemini 묶음 결과 index 오류: ${row.index ?? row.id ?? fallbackIndex}`);
  }
  return index;
}

function parseTerafabxGeminiBatchReview(raw, expectedItems = []) {
  const expectedCount = Array.isArray(expectedItems) ? expectedItems.length : Math.max(0, Number(expectedItems) || 0);
  const rows = parseTerafabxJsonCollection(raw, ["reviews", "results", "items"]);
  const mapped = new Map();
  rows.forEach((row, fallbackIndex) => {
    const index = terafabxBatchResultIndex(row, fallbackIndex, expectedCount || rows.length);
    if (mapped.has(index)) throw new Error(`Gemini 묶음 검수 결과 index 중복: ${index}`);
    const decisionRaw = cleanSocialText(row.decision || row.action || (row.reject === true ? "reject" : "rewrite")).toLowerCase();
    const decision = decisionRaw === "keep" || decisionRaw === "rewrite" || decisionRaw === "reject" ? decisionRaw : "rewrite";
    const reject = decision === "reject" || row.rejected === true || row.reject === true;
    const replyRaw = row.final_reply || row.finalReply || row.reply || row.comment || "";
    let finalReply = "";
    let validationError = null;
    if (!reject) {
      try {
        finalReply = validateTerafabxReply(stripTerafabxListPrefix(replyRaw));
      } catch (error) {
        validationError = error.message;
      }
    }
    mapped.set(index, {
      index,
      decision: validationError ? "reject" : decision,
      rejected: reject || Boolean(validationError),
      finalReply,
      reason: validationError || cleanSocialText(row.reason || row.rationale || "").slice(0, 500),
      raw: row,
    });
  });
  return Array.from({ length: expectedCount || rows.length }, (_, index) => {
    if (!mapped.has(index)) throw new Error(`Gemini 묶음 검수 결과 누락: index=${index}`);
    return mapped.get(index);
  });
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
  const finalReply = validateTerafabxReply(stripTerafabxListPrefix(reply));
  return {
    finalReply,
    decision: parsed?.decision || null,
    reason: parsed?.reason || null,
    rawPreview: source.slice(0, 1200),
  };
}

function parseTerafabxGeminiGeneratedReply(raw) {
  const source = String(raw || "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(extractJsonObjectText(source));
  } catch {}
  const reply = parsed
    ? parsed.reply || parsed.comment || parsed.final_reply || parsed.finalReply
    : source.split("\n").map((line) => line.trim()).filter(Boolean).find((line) => !/^```/.test(line));
  return {
    reply: validateTerafabxReply(stripTerafabxListPrefix(reply)),
    reason: parsed?.reason || null,
    rawPreview: source.slice(0, 1200),
  };
}

const TERAFABX_CLICHE_PENALTIES = [
  { pattern: /마음이 (?:참 )?훈훈해지네요|훈훈한 마음/i, points: 18, label: "훈훈함 상투 표현" },
  { pattern: /작성자님(?:도|께서|의)?/i, points: 12, label: "작성자님 호칭" },
  { pattern: /재충전의 시간 보내세요|행복한 하루 보내세요|좋은 일만 가득/i, points: 12, label: "정형화된 덕담" },
  { pattern: /인상적이네요|응원합니다|따뜻한 글 감사합니다/i, points: 8, label: "범용 자동댓글 표현" },
  { pattern: /진짜\s*신기하게|딱\s*보이지\s*않나요|계속\s*보게\s*되네요|완전\s*신세계(?:네요)?|신박해서\s*계속/i, points: 16, label: "반복 감탄 자동댓글" },
  { pattern: /실용적인\s*팁이네요|효율성은\s*대단하네요|현실이\s*씁쓸하네요/i, points: 18, label: "추상적 AI 요약체" },
  { pattern: /힘들어도\s*힘내세요/i, points: 18, label: "문맥 없는 상투적 응원" },
];

function assessTerafabxLanguageQuality(reply) {
  const text = cleanSocialText(reply);
  const errors = [];
  if (/^년\s*전(?:이나|에도|부터|과|보다|\s)/.test(text)) errors.push("missing_leading_year_number");
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    styleWarnings: [],
  };
}

function scoreTerafabxClichePenalty(reply) {
  const text = cleanSocialText(reply);
  const matches = TERAFABX_CLICHE_PENALTIES
    .filter((item) => item.pattern.test(text))
    .map((item) => ({ label: item.label, points: item.points }));
  return {
    penalty: matches.reduce((sum, item) => sum + item.points, 0),
    matches,
  };
}

function deriveTerafabxCommentQualityFeedback(commentHistory = [], options = {}) {
  const sampleSize = Math.max(1, Number(options.sampleSize || 20));
  const records = (Array.isArray(commentHistory) ? commentHistory : [])
    .filter((item) => item && cleanSocialText(item.comment))
    .slice(0, sampleSize);
  const judged = records.filter((item) => Number.isFinite(Number(item.geminiReview?.finalJudge?.score)));
  const averageIndependentScore = judged.length
    ? Math.round(judged.reduce((sum, item) => sum + Number(item.geminiReview.finalJudge.score), 0) / judged.length)
    : null;
  const clicheCounts = new Map();
  for (const record of records) {
    for (const match of scoreTerafabxClichePenalty(record.comment).matches) {
      clicheCounts.set(match.label, Number(clicheCounts.get(match.label) || 0) + 1);
    }
  }
  const clicheMatches = Array.from(clicheCounts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const rules = [];
  if (clicheCounts.has("훈훈함 상투 표현")) rules.push("'마음이 훈훈해지네요'처럼 감상을 뭉뚱그린 표현을 쓰지 말고 원문의 구체적인 장면에 반응한다.");
  if (clicheCounts.has("작성자님 호칭")) rules.push("'작성자님' 호칭을 쓰지 않는다.");
  if (clicheCounts.has("정형화된 덕담")) rules.push("'재충전의 시간 보내세요', '행복한 하루 보내세요' 같은 끝인사를 쓰지 않는다.");
  if (clicheCounts.has("범용 자동댓글 표현")) rules.push("'인상적이네요', '응원합니다', '따뜻한 글 감사합니다' 같은 어느 글에나 붙는 표현을 쓰지 않는다.");
  if (clicheCounts.has("반복 감탄 자동댓글")) rules.push("'진짜 신기하게', '딱 보이지 않나요', '계속 보게 되네요'처럼 반복되는 감탄 템플릿을 쓰지 않는다.");
  if (averageIndependentScore !== null && averageIndependentScore < 90) {
    rules.push("독립 심사 평균이 낮으므로 원문 고유 명사나 행동 한 가지를 짚고, 요약 반복 대신 짧은 개인 반응을 쓴다.");
  }
  return {
    sampleSize: records.length,
    independentlyJudgedCount: judged.length,
    averageIndependentScore,
    belowThresholdCount: judged.filter((item) => Number(item.geminiReview.finalJudge.score) < 85).length,
    clicheCommentCount: records.filter((item) => scoreTerafabxClichePenalty(item.comment).penalty > 0).length,
    clicheMatches,
    rules,
  };
}

function terafabxCommentQualityPromptLines() {
  const feedback = readJsonFile(TERAFABX_COMMENT_MONITOR_STATE_PATH, {}).qualityFeedback || {};
  const dynamicRules = Array.isArray(feedback.rules) ? feedback.rules.slice(0, 5) : [];
  return [
    "상투 표현 금지: 마음이 훈훈해지네요, 작성자님, 재충전의 시간 보내세요, 행복한 하루 보내세요, 인상적이네요, 응원합니다.",
    ...dynamicRules.map((rule) => `최근 10분 품질 피드백: ${rule}`),
  ];
}

function terafabxFinalJudgePrompt(target, grokInput, finalReply) {
  const grok = normalizeTerafabxGrokResult(grokInput);
  return [
    "너는 X 한국어 자동댓글의 독립 최종 심사자다. 댓글을 새로 쓰거나 수정하지 말고 품질만 엄격히 평가해라.",
    "제시된 댓글을 만든 모델의 자기평가는 제공되지 않으며 참고해서도 안 된다.",
    "항목별 정수 점수: context 0~40, naturalness 0~25, specificity 0~15, concision 0~10, non_ai_style 0~10.",
    "context가 최우선이다. 짧더라도 원문 장면과 정확히 맞으면 높게 평가하고, 길이가 길다는 이유만으로 가점을 주지 마라.",
    "상투적 덕담, 원문 요약 반복, '작성자님', 어색한 명사 연결, 문장부호 없는 장문은 naturalness와 non_ai_style에서 크게 감점해라.",
    "최종 심사 대상 댓글의 실제 문자열만 평가해라. 원문에 있는 숫자가 댓글에서 빠졌다면 그 숫자가 있다고 가정하거나 보완해서 읽지 마라.",
    "오기·오타·조사 오류·문법 오류·불완전한 종결어미·번역체를 발견하면 reason에 문제 구절을 그대로 적고 naturalness를 최대 10점으로 제한해라.",
    "상투적 덕담이나 AI식 추상 요약체를 발견하면 non_ai_style을 최대 4점으로 제한해라.",
    "'진짜 신기하게', '딱 보이지 않나요', '계속 보게 되네요'처럼 여러 댓글에 반복될 법한 감탄 템플릿은 non_ai_style에서 크게 감점해라.",
    "Grok 분석의 대응 조언을 사실 근거로 취급하지 마라. source_anchor에는 반드시 원문 또는 부모 원글에 실제로 적힌 고유 명사·숫자·행동 구절을 원문 그대로 적어라.",
    "댓글이 같은 분야의 다른 글에도 그대로 붙을 수 있으면 cross_post_reusable=true다. 기사 제목·표어·교훈 문장처럼 들리면 headline_tone=true다.",
    "댓글이 source_anchor의 구체적인 대상을 실제로 언급하거나 명확히 가리키지 않으면 specificity_error=true다.",
    "fatal_error는 대상 혼동, 원문과 반대되는 말, 사실 날조, 민감·금지 표현이 있을 때 true다.",
    "language_error는 오기·오타·맞춤법·조사·문법·불완전한 종결어미가 있으면 true다.",
    "awkward_korean은 뜻은 통하지만 한국어 구어체로 어색하거나 명사 연결이 부자연스러우면 true다.",
    "translation_tone은 직역체·번역체·과도하게 딱딱한 표현이면 true다.",
    "cliche는 범용 덕담·추상적 감탄·다른 글에도 붙일 수 있는 AI식 요약체면 true다.",
    "context_error는 원문과 어긋나거나 이미 보이는 대상을 모르는 듯 묻거나 사실을 추측하면 true다.",
    "부모 원글에 대상이나 장면이 이미 드러났는데도 댓글이 누구·무엇·어떤 대상인지 모르는 듯 되물으면 대상 혼동으로 보고 fatal_error=true로 판정해라.",
    "반드시 JSON 한 줄만 출력해라. 모든 필드를 빠짐없이 포함해라. 형식: {\"context\":0,\"naturalness\":0,\"specificity\":0,\"concision\":0,\"non_ai_style\":0,\"fatal_error\":false,\"language_error\":false,\"awkward_korean\":false,\"translation_tone\":false,\"cliche\":false,\"context_error\":false,\"cross_post_reusable\":false,\"headline_tone\":false,\"specificity_error\":false,\"source_anchor\":\"원문에 실제로 있는 구절\",\"reason\":\"짧은 이유\"}",
    "",
    ...terafabxPromptContextLines(target),
    `원문 분석: ${grok.contextSummary || "제공 없음"}`,
    `최종 심사 대상 댓글: ${finalReply}`,
  ].join("\n");
}

function normalizeTerafabxFinalJudgeParsed(parsed, finalReply, rawPreview = "") {
  const limits = { context: 40, naturalness: 25, specificity: 15, concision: 10, non_ai_style: 10 };
  const dimensions = {};
  for (const [key, max] of Object.entries(limits)) {
    const value = Number(parsed[key]);
    if (!Number.isFinite(value) || value < 0 || value > max) throw new Error(`최종 심사 점수 오류: ${key}=${parsed[key]}`);
    dimensions[key] = Math.round(value);
  }
  const cliche = scoreTerafabxClichePenalty(finalReply);
  const rawScore = Object.values(dimensions).reduce((sum, value) => sum + value, 0);
  const score = rawScore;
  const qualityFlagKeys = ["language_error", "awkward_korean", "translation_tone", "cliche", "context_error"];
  const genericityFlagKeys = ["cross_post_reusable", "headline_tone", "specificity_error"];
  const qualityFlagsComplete = qualityFlagKeys.every((key) => typeof parsed[key] === "boolean");
  const genericityFlagsComplete = genericityFlagKeys.every((key) => typeof parsed[key] === "boolean") && cleanSocialText(parsed.source_anchor || "").length > 0;
  const qualityFlags = Object.fromEntries([...qualityFlagKeys, ...genericityFlagKeys].map((key) => [key, parsed[key] === true]));
  const flaggedQualityIssues = [...qualityFlagKeys, ...genericityFlagKeys].filter((key) => qualityFlags[key]);
  const fatalError = parsed.fatal_error === true;
  const languageQuality = assessTerafabxLanguageQuality(finalReply);
  return {
    dimensions,
    rawScore,
    clichePenalty: cliche.penalty,
    clicheMatches: cliche.matches,
    score,
    contextPassed: dimensions.context >= 30,
    passed: qualityFlagsComplete && genericityFlagsComplete && !fatalError && flaggedQualityIssues.length === 0 && languageQuality.ok && dimensions.context >= 30 && score >= 85,
    fatalError,
    qualityFlagsComplete,
    genericityFlagsComplete,
    qualityFlags,
    flaggedQualityIssues,
    sourceAnchor: cleanSocialText(parsed.source_anchor || ""),
    languageQuality,
    reason: cleanSocialText(parsed.reason || ""),
    rawPreview: String(rawPreview || "").slice(0, 1200),
  };
}

function applyTerafabxJudgeSourceGrounding(judge, target = null) {
  if (!target) return judge;
  const source = cleanSocialText([target.rootPostText, target.targetText, target.text].filter(Boolean).join(" ")).toLowerCase();
  const anchor = cleanSocialText(judge.sourceAnchor || "").toLowerCase();
  const sourceAnchorGrounded = Boolean(source && anchor && source.includes(anchor));
  const flaggedQualityIssues = sourceAnchorGrounded
    ? judge.flaggedQualityIssues
    : [...new Set([...(judge.flaggedQualityIssues || []), "source_anchor_unverifiable"])];
  return {
    ...judge,
    sourceAnchorGrounded,
    flaggedQualityIssues,
    passed: Boolean(judge.passed && sourceAnchorGrounded),
  };
}

function parseTerafabxFinalJudge(raw, finalReply, target = null) {
  const parsed = JSON.parse(extractJsonObjectText(raw));
  return applyTerafabxJudgeSourceGrounding(normalizeTerafabxFinalJudgeParsed(parsed, finalReply, raw), target);
}

function parseTerafabxGeminiBatchFinalJudge(raw, judgedItems = []) {
  const expectedCount = Array.isArray(judgedItems) ? judgedItems.length : Math.max(0, Number(judgedItems) || 0);
  const rows = parseTerafabxJsonCollection(raw, ["judges", "scores", "results", "items"]);
  const mapped = new Map();
  rows.forEach((row, fallbackIndex) => {
    const index = terafabxBatchResultIndex(row, fallbackIndex, expectedCount || rows.length);
    if (mapped.has(index)) throw new Error(`Gemini 묶음 최종심사 결과 index 중복: ${index}`);
    const finalReply = judgedItems[index]?.finalReply || judgedItems[index]?.review?.finalReply || judgedItems[index]?.prepared?.comment || "";
    mapped.set(index, applyTerafabxJudgeSourceGrounding({
      index,
      ...normalizeTerafabxFinalJudgeParsed(row, finalReply, raw),
      raw: row,
    }, judgedItems[index]?.target || judgedItems[index]?.prepared?.target || null));
  });
  return Array.from({ length: expectedCount || rows.length }, (_, index) => {
    if (!mapped.has(index)) throw new Error(`Gemini 묶음 최종심사 결과 누락: index=${index}`);
    return mapped.get(index);
  });
}

async function judgeTerafabxReplyWithGeminiHeadless(target, grokInput, finalReply, options = {}) {
  const prompt = terafabxFinalJudgePrompt(target, grokInput, finalReply);
  const judgeId = `terafabx-gemini-final-judge-${new Date().toISOString().replace(/[:.]/g, "-")}-${target.targetId || "target"}`;
  const runDir = path.join(TERAFABX_GEMINI_REVIEW_DIR, judgeId);
  fs.mkdirSync(runDir, { recursive: true });
  const promptPath = path.join(runDir, "prompt.md");
  const outPath = path.join(runDir, "gemini-final-judge.txt");
  const chromePort = Number(options.chromePort || TERAFABX_GEMINI_CHROME_PORT);
  const profileDir = options.profileDir || TERAFABX_GEMINI_PROFILE_DIR;
  fs.writeFileSync(promptPath, prompt);
  logEvent("terafabx_gemini_final_judge_start", { targetUrl: target.url, finalReply, port: chromePort, runDir });
  try {
    await ensureTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir });
    const scriptPath = path.join(NAVER_BLOG_ADPOST_ROOT, "scripts", "gemini_custom_prompt.js");
    if (!fs.existsSync(scriptPath)) throw new Error(`Gemini Web 스크립트가 없습니다: ${scriptPath}`);
    const result = await runTerafabxGeminiScript(scriptPath, ["--prompt", promptPath, "--out", outPath, "--cdp", `http://127.0.0.1:${chromePort}`, "--min-length", "6"], {
      cwd: NAVER_BLOG_ADPOST_ROOT,
      timeoutMs: Number(options.finalJudgeTimeoutMs || 240000),
      chromePort,
      profileDir,
      priority: options.priority || options.geminiPriority,
      label: `final-judge:${target.targetId || "target"}`,
    });
    fs.writeFileSync(path.join(runDir, "gemini.stdout.txt"), result.stdout || "");
    fs.writeFileSync(path.join(runDir, "gemini.stderr.txt"), result.stderr || "");
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Gemini Web 최종 심사 실패");
    if (!fs.existsSync(outPath)) throw new Error("Gemini Web 최종 심사 출력 파일이 생성되지 않았습니다.");
    const raw = fs.readFileSync(outPath, "utf8");
    const judged = parseTerafabxFinalJudge(raw, finalReply, target);
    logEvent("terafabx_gemini_final_judge_ok", { targetUrl: target.url, finalReply, runDir, ...judged });
    if (!judged.passed) {
      throw new Error(`Gemini 최종 심사 탈락: ${judged.score}점${judged.fatalError ? " (치명적 오류)" : ""} - ${judged.reason || "품질 기준 미달"}`);
    }
    return { ...judged, provider: "gemini-web-headless", runDir };
  } finally {
    if (options.cleanupBrowser !== false) {
      const cleanup = await closeTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir }).catch((error) => ({ error: error.message }));
      logEvent("terafabx_gemini_final_judge_cleanup", { targetUrl: target.url, cleanup });
    }
  }
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

function isManagedTerafabxGeminiProfileDir(profileDir) {
  const resolved = path.resolve(profileDir || "");
  const managedRoot = path.resolve(path.join(__dirname, ".data", "chrome-profiles", "terafabx-gemini-review"));
  return resolved === managedRoot || resolved.startsWith(`${managedRoot}-`);
}

function shouldCopyTerafabxGeminiProfileEntry(src) {
  const name = path.basename(src);
  if (/^(Singleton|SingletonCookie|SingletonLock|SingletonSocket|DevToolsActivePort|RunningChromeVersion)$/i.test(name)) return false;
  if (/^(BrowserMetrics|Crash Reports|Crashpad|ShaderCache|GrShaderCache|GraphiteDawnCache|DawnCache|GPUCache|Code Cache)$/i.test(name)) return false;
  if (src.includes(`${path.sep}Crashpad${path.sep}`)) return false;
  return true;
}

function largestChromeCookieFileSize(profileDir) {
  let largest = 0;
  const root = path.resolve(profileDir || "");
  if (!root || !fs.existsSync(root)) return 0;
  const visit = (dir, depth) => {
    if (depth > 2) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "Cookies") {
        try {
          largest = Math.max(largest, fs.statSync(fullPath).size);
        } catch {}
      } else if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
      }
    }
  };
  visit(root, 0);
  return largest;
}

function terafabxGeminiProfileLooksSeeded(profileDir, templateDir = TERAFABX_GEMINI_PROFILE_TEMPLATE_DIR) {
  const templateCookieSize = largestChromeCookieFileSize(templateDir);
  const targetCookieSize = largestChromeCookieFileSize(profileDir);
  if (!templateCookieSize || !targetCookieSize) return false;
  const threshold = Math.max(64 * 1024, Math.floor(templateCookieSize * 0.5));
  return targetCookieSize >= threshold;
}

function seedTerafabxGeminiProfileFromTemplate(profileDir) {
  const templateDir = path.resolve(TERAFABX_GEMINI_PROFILE_TEMPLATE_DIR || "");
  const targetDir = path.resolve(profileDir || "");
  if (!templateDir || !targetDir || templateDir === targetDir) return { seeded: false, reason: "same_or_empty" };
  if (!fs.existsSync(templateDir)) return { seeded: false, reason: "template_missing", templateDir };
  if (!isManagedTerafabxGeminiProfileDir(targetDir) && process.env.TERAFABX_GEMINI_PROFILE_TEMPLATE_FORCE !== "true") {
    return { seeded: false, reason: "target_not_managed", templateDir, targetDir };
  }
  if (process.env.TERAFABX_GEMINI_PROFILE_TEMPLATE_REFRESH !== "true" && terafabxGeminiProfileLooksSeeded(targetDir, templateDir)) {
    return { seeded: false, reason: "already_seeded", templateDir, targetDir };
  }
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.cpSync(templateDir, targetDir, {
    recursive: true,
    force: true,
    errorOnExist: false,
    preserveTimestamps: true,
    filter: shouldCopyTerafabxGeminiProfileEntry,
  });
  try {
    fs.writeFileSync(path.join(targetDir, ".terafabx-gemini-template.json"), JSON.stringify({ templateDir, seededAt: new Date().toISOString() }, null, 2));
  } catch {}
  return { seeded: true, templateDir, targetDir };
}

function terafabxOwnPostReplyGeminiProfileDir(workerIndex) {
  return `${TERAFABX_GEMINI_PROFILE_DIR}-own-post-reply-${workerIndex + 1}`;
}

function terafabxCommentPrefillWorkerResources(workerIndex) {
  const index = Math.max(0, Number(workerIndex || 0));
  return {
    workerIndex: index,
    grokContextSession: `${TERAFABX_GROK_WEB_SESSION}-comment-prefill-${index + 1}`,
    chromePort: TERAFABX_COMMENT_PREFILL_GEMINI_PORT_BASE + index,
    profileDir: `${TERAFABX_GEMINI_PROFILE_DIR}-comment-prefill-${index + 1}`,
  };
}

async function prepareTerafabxCommentPrefillWorkers(workerCount) {
  const resources = Array.from({ length: Math.max(0, Number(workerCount || 0)) }, (_, index) => (
    terafabxCommentPrefillWorkerResources(index)
  ));
  await syncTerafabxGrokWebState();
  const profiles = resources.map((resource) => ({
    ...resource,
    ...seedTerafabxGeminiProfileFromTemplate(resource.profileDir),
  }));
  const invalidProfiles = profiles.filter((item) => !terafabxGeminiProfileLooksSeeded(item.profileDir));
  if (invalidProfiles.length) {
    throw new Error(`Gemini worker 프로필 준비 실패: ${invalidProfiles.map((item) => item.workerIndex + 1).join(", ")}`);
  }
  logEvent("terafabx_comment_prefill_workers_ready", {
    count: resources.length,
    workers: resources.map((item) => ({
      workerIndex: item.workerIndex,
      grokContextSession: item.grokContextSession,
      chromePort: item.chromePort,
      profileDir: item.profileDir,
    })),
  });
  return resources;
}

async function cleanupTerafabxCommentPrefillWorkers(resources = []) {
  const results = await Promise.all(resources.map(async (resource) => ({
    workerIndex: resource.workerIndex,
    grok: { keptAlive: true, session: resource.grokContextSession },
    gemini: await cleanupTerafabxGeminiWorkTabs({
      port: resource.chromePort,
      profileDir: resource.profileDir,
    }).catch((error) => ({ error: error.message })),
  })));
  logEvent("terafabx_comment_prefill_workers_cleanup", {
    count: results.length,
    workers: results.map((item) => ({
      workerIndex: item.workerIndex,
      grokError: item.grok?.error || null,
      geminiError: item.gemini?.error || null,
      keptAlive: true,
      remainingGeminiPids: item.gemini?.remainingPids || [],
    })),
  });
  return results;
}

function seedTerafabxOwnPostReplyGeminiProfiles(workerIndexes = []) {
  const results = [];
  for (const workerIndex of workerIndexes) {
    const profileDir = terafabxOwnPostReplyGeminiProfileDir(workerIndex);
    const result = seedTerafabxGeminiProfileFromTemplate(profileDir);
    results.push({ workerIndex, profileDir, ...result });
  }
  logEvent("terafabx_own_post_reply_gemini_profiles_ready", {
    count: results.length,
    seededCount: results.filter((item) => item.seeded).length,
    skipped: results.filter((item) => !item.seeded).map((item) => ({ workerIndex: item.workerIndex, reason: item.reason })),
  });
  return results;
}

async function ensureTerafabxGeminiHeadlessBrowser(options = {}) {
  const port = Number(options.port || TERAFABX_GEMINI_CHROME_PORT);
  const profileDir = options.profileDir || TERAFABX_GEMINI_PROFILE_DIR;
  const existingPids = await chromePidsForPort(port);
  if (existingPids.length) {
    await waitForChromePort(port, 3000);
    return { launched: false, port, profileDir, pids: existingPids };
  }
  const seed = options.seedProfile !== false
    ? seedTerafabxGeminiProfileFromTemplate(profileDir)
    : { seeded: false, reason: "disabled" };
  if (seed.seeded) logEvent("terafabx_gemini_profile_seeded", { port, profileDir, templateDir: seed.templateDir });
  else if (seed.reason && seed.reason !== "target_not_managed") logEvent("terafabx_gemini_profile_seed_skipped", { port, profileDir, reason: seed.reason });
  fs.mkdirSync(profileDir, { recursive: true });
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--lang=ko-KR",
    "--window-size=1440,900",
    `--user-agent=${TERAFABX_BROWSER_USER_AGENT}`,
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

function isTerafabxGeminiWorkTab(tab = {}) {
  return Boolean(
    tab?.type === "page"
    && /(^https?:\/\/(?:gemini\.google\.com|www\.google\.com\/sorry)\/)|(^blob:https?:\/\/(?:gemini\.google\.com|www\.google\.com)\/)/i.test(String(tab.url || "")),
  );
}

async function cleanupTerafabxGeminiWorkTabs(options = {}) {
  const port = Number(options.port || TERAFABX_GEMINI_CHROME_PORT);
  const profileDir = options.profileDir || TERAFABX_GEMINI_PROFILE_DIR;
  const closedTabs = [];
  const tabs = await requestJsonForPort(port, "GET", "/json/list").catch(() => []);
  const workTabs = (Array.isArray(tabs) ? tabs : []).filter(isTerafabxGeminiWorkTab);
  for (const tab of workTabs) {
    try {
      await requestJsonForPort(port, "PUT", `/json/close/${tab.id}`);
      closedTabs.push({ id: tab.id, url: tab.url, ok: true });
    } catch (error) {
      closedTabs.push({ id: tab.id, url: tab.url, ok: false, error: error.message });
    }
  }
  const pids = await dedicatedChromePidsForPort(port, profileDir);
  return { keptAlive: true, closedTabs, remainingPids: pids };
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
    const result = await runTerafabxGeminiScript(scriptPath, ["--prompt", promptPath, "--out", outPath, "--cdp", `http://127.0.0.1:${chromePort}`, "--min-length", "6"], {
      cwd: NAVER_BLOG_ADPOST_ROOT,
      timeoutMs: 240000,
      chromePort,
      profileDir,
      priority: options.priority || options.geminiPriority,
      label: `review:${target.targetId || "target"}`,
    });
    fs.writeFileSync(path.join(runDir, "gemini.stdout.txt"), result.stdout || "");
    fs.writeFileSync(path.join(runDir, "gemini.stderr.txt"), result.stderr || "");
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Gemini Web 댓글 검수 실패");
    if (!fs.existsSync(outPath)) throw new Error("Gemini Web 댓글 검수 출력 파일이 생성되지 않았습니다.");
    let review = parseTerafabxGeminiReview(fs.readFileSync(outPath, "utf8"));
    logEvent("terafabx_gemini_review_ok", { targetUrl: target.url, grokReply: grok.reply, finalReply: review.finalReply, decision: review.decision, reason: review.reason, runDir });
    let finalJudge = await judgeTerafabxReplyWithGeminiHeadless(target, grok, review.finalReply, { ...options, cleanupBrowser: false });
    if (!finalJudge.passed && Number(options.repairAttempt || 0) < 1) {
      const repairPromptPath = path.join(runDir, "repair-prompt.md");
      const repairOutPath = path.join(runDir, "gemini-repair.txt");
      const repairFeedback = [finalJudge.flaggedQualityIssues.join(", "), finalJudge.reason].filter(Boolean).join(" - ");
      const repairGrok = { ...grok, reply: review.finalReply };
      fs.writeFileSync(repairPromptPath, terafabxGeminiReviewPrompt(target, repairGrok, repairFeedback));
      logEvent("terafabx_gemini_quality_rewrite_start", { targetUrl: target.url, repairFeedback, runDir });
      const repairRun = await runTerafabxGeminiScript(scriptPath, ["--prompt", repairPromptPath, "--out", repairOutPath, "--cdp", `http://127.0.0.1:${chromePort}`, "--min-length", "6"], {
        cwd: NAVER_BLOG_ADPOST_ROOT,
        timeoutMs: 240000,
        chromePort,
        profileDir,
        priority: options.priority || options.geminiPriority,
        label: `quality-rewrite:${target.targetId || "target"}`,
      });
      if (repairRun.code !== 0 || !fs.existsSync(repairOutPath)) {
        throw new Error(repairRun.stderr || repairRun.stdout || "Gemini Web 품질 재작성 실패");
      }
      review = parseTerafabxGeminiReview(fs.readFileSync(repairOutPath, "utf8"));
      finalJudge = await judgeTerafabxReplyWithGeminiHeadless(target, grok, review.finalReply, { ...options, cleanupBrowser: false, repairAttempt: 1 });
      logEvent("terafabx_gemini_quality_rewrite_done", { targetUrl: target.url, passed: finalJudge.passed, score: finalJudge.score, runDir });
    }
    return { ...review, score: finalJudge.score, finalJudge, usedGemini: true, browser };
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

async function generateTerafabxPreparedReplyBatchWithGemini(items = [], options = {}) {
  const inputs = Array.isArray(items) ? items : [];
  if (!inputs.length) return [];
  const runId = `terafabx-gemini-batch-generate-${new Date().toISOString().replace(/[:.]/g, "-")}-${inputs.length}`;
  const runDir = path.join(TERAFABX_GEMINI_REVIEW_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const promptPath = path.join(runDir, "batch-generate-prompt.md");
  const outPath = path.join(runDir, "gemini-batch-generate.txt");
  const chromePort = Number(options.chromePort || TERAFABX_COMMENT_PREFILL_GEMINI_PORT_BASE);
  const profileDir = options.profileDir || `${TERAFABX_GEMINI_PROFILE_DIR}-comment-prefill-1`;
  const scriptPath = path.join(NAVER_BLOG_ADPOST_ROOT, "scripts", "gemini_custom_prompt.js");
  const timeoutMs = Math.max(120_000, Number(options.timeoutMs || 300_000));
  fs.writeFileSync(promptPath, terafabxGeminiBatchGeneratePrompt(inputs));
  logEvent("terafabx_gemini_batch_generate_start", { count: inputs.length, chromePort, runDir });
  await ensureTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir });
  const run = await runTerafabxGeminiScript(scriptPath, ["--prompt", promptPath, "--out", outPath, "--cdp", `http://127.0.0.1:${chromePort}`, "--min-length", "20"], {
    cwd: NAVER_BLOG_ADPOST_ROOT,
    timeoutMs,
    chromePort,
    profileDir,
    priority: options.priority || "comment",
    label: `comment-batch-generate:${inputs.length}`,
  });
  fs.writeFileSync(path.join(runDir, "gemini.stdout.txt"), run.stdout || "");
  fs.writeFileSync(path.join(runDir, "gemini.stderr.txt"), run.stderr || "");
  if (run.code !== 0) throw new Error(run.stderr || run.stdout || "Gemini Web 묶음 댓글 생성 실패");
  if (!fs.existsSync(outPath)) throw new Error("Gemini Web 묶음 댓글 생성 출력 파일이 없습니다.");
  const generated = parseTerafabxGeminiBatchReview(fs.readFileSync(outPath, "utf8"), inputs);
  const results = inputs.map((item, index) => {
    const row = generated[index];
    if (row.rejected) return { ...item, ok: false, error: `Gemini 묶음 생성 거부: ${row.reason || "reject"}`, stage: "batch_generate" };
    const context = normalizeTerafabxContextResult(item.grokContext || {});
    return {
      ...item,
      ok: true,
      prepared: {
        at: new Date().toISOString(),
        targetUrl: item.target.url,
        targetId: item.target.targetId,
        targetText: item.target.targetText,
        rootPostUrl: item.target.rootPostUrl || null,
        rootPostText: item.target.rootPostText || null,
        comment: row.finalReply,
        grokComment: row.finalReply,
        grokContext: terafabxGrokContextForRecord(context),
        geminiReview: { used: true, score: null, decision: row.decision, reason: row.reason, fallback: false, error: null, finalJudge: null },
        pendingGeminiBatchReview: true,
        replyUrl: null,
        generator: "web-context+gemini-web-headless-batch-generate-rewrite",
        manual: Boolean(options.manual),
        source: options.source || "prefill",
      },
    };
  });
  logEvent("terafabx_gemini_batch_generate_ok", { count: results.filter((item) => item.ok).length, failed: results.filter((item) => !item.ok).length, runDir });
  return results;
}

async function reviewTerafabxPreparedReplyBatchWithGemini(items = [], options = {}) {
  const reviewable = (Array.isArray(items) ? items : [])
    .filter((item) => item?.ok && item?.target?.imageOnly !== true && item?.prepared?.generator !== "fixed-image-only-emoji");
  if (!reviewable.length) return [];
  if (!TERAFABX_GEMINI_REVIEW_ENABLED) {
    return reviewable.map((item) => ({
      ...item,
      ok: false,
      error: "Gemini 검수가 꺼져 있어 묶음 검수를 진행할 수 없습니다.",
      stage: "batch_review_disabled",
    }));
  }

  const inputs = reviewable.map(normalizeTerafabxBatchReviewInput);
  const runId = `terafabx-gemini-batch-review-${new Date().toISOString().replace(/[:.]/g, "-")}-${inputs.length}`;
  const runDir = path.join(TERAFABX_GEMINI_REVIEW_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const reviewPromptPath = path.join(runDir, "batch-review-prompt.md");
  const reviewOutPath = path.join(runDir, "gemini-batch-review.txt");
  const judgePromptPath = path.join(runDir, "batch-final-judge-prompt.md");
  const judgeOutPath = path.join(runDir, "gemini-batch-final-judge.txt");
  const chromePort = Number(options.chromePort || TERAFABX_GEMINI_CHROME_PORT);
  const profileDir = options.profileDir || TERAFABX_GEMINI_PROFILE_DIR;
  const timeoutMs = Math.max(120_000, Number(options.timeoutMs || TERAFABX_OWN_POST_REPLY_BATCH_REVIEW_TIMEOUT_MS));
  const scriptPath = path.join(NAVER_BLOG_ADPOST_ROOT, "scripts", "gemini_custom_prompt.js");
  if (!fs.existsSync(scriptPath)) throw new Error(`Gemini Web 스크립트가 없습니다: ${scriptPath}`);
  if (!options.skipReview) fs.writeFileSync(reviewPromptPath, terafabxGeminiBatchReviewPrompt(inputs));
  logEvent("terafabx_gemini_batch_review_start", {
    count: inputs.length,
    targetUrls: inputs.map((item) => item.target.url).slice(0, 10),
    port: chromePort,
    runDir,
  });
  try {
    await ensureTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir });
    let reviews;
    if (options.skipReview) {
      reviews = inputs.map((input, index) => ({
        index,
        decision: "keep",
        rejected: false,
        finalReply: validateTerafabxReply(input.prepared.comment),
        reason: "묶음 생성 단계에서 작성·수정 완료",
      }));
    } else {
      const reviewRun = await runTerafabxGeminiScript(scriptPath, ["--prompt", reviewPromptPath, "--out", reviewOutPath, "--cdp", `http://127.0.0.1:${chromePort}`, "--min-length", "20"], {
        cwd: NAVER_BLOG_ADPOST_ROOT,
        timeoutMs,
        chromePort,
        profileDir,
        priority: options.priority,
        label: `batch-review:${inputs.length}`,
      });
      fs.writeFileSync(path.join(runDir, "gemini-batch-review.stdout.txt"), reviewRun.stdout || "");
      fs.writeFileSync(path.join(runDir, "gemini-batch-review.stderr.txt"), reviewRun.stderr || "");
      if (reviewRun.code !== 0) throw new Error(reviewRun.stderr || reviewRun.stdout || "Gemini Web 묶음 댓글 검수 실패");
      if (!fs.existsSync(reviewOutPath)) throw new Error("Gemini Web 묶음 검수 출력 파일이 생성되지 않았습니다.");
      const reviewRaw = fs.readFileSync(reviewOutPath, "utf8");
      reviews = parseTerafabxGeminiBatchReview(reviewRaw, inputs);
    }
    const judgeInputs = inputs.map((input, index) => ({
      ...input,
      review: reviews[index],
      finalReply: reviews[index].finalReply,
      prepared: {
        ...input.prepared,
        comment: reviews[index].finalReply || input.prepared.comment,
      },
    }));
    fs.writeFileSync(judgePromptPath, terafabxGeminiBatchFinalJudgePrompt(judgeInputs));
    logEvent("terafabx_gemini_batch_final_judge_start", {
      count: judgeInputs.length,
      runDir,
    });
    let judgeRun;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      judgeRun = await runTerafabxGeminiScript(scriptPath, ["--prompt", judgePromptPath, "--out", judgeOutPath, "--cdp", `http://127.0.0.1:${chromePort}`, "--min-length", "20"], {
        cwd: NAVER_BLOG_ADPOST_ROOT,
        timeoutMs,
        chromePort,
        profileDir,
        priority: options.priority,
        label: `batch-final-judge:${inputs.length}:attempt-${attempt}`,
      });
      if (judgeRun.code === 0 && fs.existsSync(judgeOutPath)) break;
      if (attempt < 2) {
        logEvent("terafabx_gemini_batch_final_judge_retry", { count: inputs.length, attempt, error: String(judgeRun.stderr || judgeRun.stdout || "no_output").slice(0, 500) });
        await cleanupTerafabxGeminiWorkTabs({ port: chromePort }).catch(() => null);
        await ensureTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir });
        await sleep(1_000);
      }
    }
    fs.writeFileSync(path.join(runDir, "gemini-batch-final-judge.stdout.txt"), judgeRun.stdout || "");
    fs.writeFileSync(path.join(runDir, "gemini-batch-final-judge.stderr.txt"), judgeRun.stderr || "");
    if (judgeRun.code !== 0) throw new Error(judgeRun.stderr || judgeRun.stdout || "Gemini Web 묶음 최종 심사 실패");
    if (!fs.existsSync(judgeOutPath)) throw new Error("Gemini Web 묶음 최종 심사 출력 파일이 생성되지 않았습니다.");
    const judgeRaw = fs.readFileSync(judgeOutPath, "utf8");
    const judges = parseTerafabxGeminiBatchFinalJudge(judgeRaw, judgeInputs);
    let results = reviewable.map((item, index) => {
      const review = reviews[index];
      const judge = judges[index];
      if (review.rejected) {
        return {
          ...item,
          ok: false,
          error: `Gemini 묶음 검수 탈락: ${review.reason || "reject"}`,
          stage: "batch_review",
        };
      }
      if (!judge.passed) {
        return {
          ...item,
          ok: false,
          error: `Gemini 묶음 최종 심사 탈락: ${judge.score}점${judge.fatalError ? " (치명적 오류)" : ""} - ${judge.reason || "품질 기준 미달"}`,
          stage: "batch_final_judge",
        };
      }
      const finalReply = validateTerafabxReply(review.finalReply);
      const contextAssessment = assessTerafabxParentContextMismatch(item.target, finalReply);
      if (!contextAssessment.ok) {
        return {
          ...item,
          ok: false,
          error: `부모 원글 문맥 불일치: ${contextAssessment.reason}`,
          stage: "context_gate",
        };
      }
      const generator = [
        item.prepared.generator,
        "gemini-web-headless-batch-review",
        "gemini-web-headless-batch-judge",
      ].filter(Boolean).join("+");
      return {
        ...item,
        ok: true,
        prepared: {
          ...item.prepared,
          comment: finalReply,
          pendingGeminiBatchReview: false,
          geminiReview: {
            used: true,
            score: judge.score,
            decision: review.decision,
            reason: review.reason || judge.reason || null,
            fallback: false,
            error: null,
            finalJudge: {
              ...judge,
              provider: "gemini-web-headless-batch",
              runDir,
            },
          },
          generator,
        },
      };
    });
    const repairableIndexes = results
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => !result.ok && result.stage === "batch_final_judge")
      .map(({ index }) => index);
    if (repairableIndexes.length && Number(options.repairAttempt || 0) < 1) {
      logEvent("terafabx_gemini_batch_quality_rewrite_start", { count: repairableIndexes.length, runDir });
      const repairSeeds = repairableIndexes.map((index) => ({
        target: reviewable[index].target,
        grokContext: reviewable[index].prepared?.grokContext || {},
        qualityFeedback: [
          judges[index].flaggedQualityIssues.join(", "),
          judges[index].reason,
        ].filter(Boolean).join(" - "),
      }));
      const regenerated = await generateTerafabxPreparedReplyBatchWithGemini(repairSeeds, {
        ...options,
        cleanupBrowser: false,
        source: reviewable[repairableIndexes[0]]?.prepared?.source || options.source,
      });
      const rejudged = await reviewTerafabxPreparedReplyBatchWithGemini(regenerated, {
        ...options,
        cleanupBrowser: false,
        skipReview: true,
        repairAttempt: 1,
      });
      const repairedByUrl = new Map(rejudged.map((item) => [item.target?.url || item.prepared?.targetUrl || "", item]));
      results = results.map((result, index) => {
        if (!repairableIndexes.includes(index)) return result;
        const repaired = repairedByUrl.get(reviewable[index].target?.url || "");
        return repaired || result;
      });
      logEvent("terafabx_gemini_batch_quality_rewrite_done", {
        requested: repairableIndexes.length,
        passedCount: repairableIndexes.filter((index) => results[index]?.ok).length,
        runDir,
      });
    }
    logEvent("terafabx_gemini_batch_review_ok", {
      count: results.length,
      passedCount: results.filter((item) => item.ok).length,
      rejectedCount: results.filter((item) => !item.ok).length,
      runDir,
    });
    return results;
  } catch (error) {
    logEvent("terafabx_gemini_batch_review_error", { count: inputs.length, error: error.message, runDir });
    if (TERAFABX_GEMINI_REVIEW_REQUIRED) throw error;
    return reviewable.map((item) => ({
      ...item,
      ok: false,
      error: `Gemini 묶음 검수 실패: ${error.message}`,
      stage: "batch_review",
    }));
  } finally {
    if (options.cleanupBrowser !== false) {
      const cleanup = await closeTerafabxGeminiHeadlessBrowser({ port: chromePort, profileDir }).catch((error) => ({ error: error.message }));
      logEvent("terafabx_gemini_batch_review_cleanup", { count: inputs.length, cleanup });
    }
  }
}

async function generateTerafabxReplyWithGeminiFallback(target, options = {}) {
  if (!TERAFABX_GEMINI_GENERATION_FALLBACK_ENABLED) {
    throw new Error("Gemini 생성 fallback이 꺼져 있습니다.");
  }
  const attempt = Number(options.attempt || 1);
  const extraRule = attempt >= 2 ? "원문 내용이 민감하거나 판단이 어렵다면 중립적인 짧은 공감 답글을 써라." : "";
  const context = options.grokContext ? normalizeTerafabxContextResult(options.grokContext) : null;
  const prompt = context
    ? terafabxGeminiGeneratePrompt(target, context, extraRule)
    : terafabxReplyPrompt(target, extraRule, "Gemini");
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
    const result = await runTerafabxGeminiScript(scriptPath, ["--prompt", promptPath, "--out", outPath, "--cdp", `http://127.0.0.1:${chromePort}`, "--min-length", "30"], {
      cwd: NAVER_BLOG_ADPOST_ROOT,
      timeoutMs: 240000,
      chromePort,
      profileDir,
      priority: options.priority || options.geminiPriority,
      label: `generate:${target.targetId || "target"}`,
    });
    fs.writeFileSync(path.join(runDir, "gemini.stdout.txt"), result.stdout || "");
    fs.writeFileSync(path.join(runDir, "gemini.stderr.txt"), result.stderr || "");
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Gemini Web 댓글 생성 실패");
    if (!fs.existsSync(outPath)) throw new Error("Gemini Web 댓글 생성 출력 파일이 생성되지 않았습니다.");
    const raw = fs.readFileSync(outPath, "utf8");
    const parsed = context
      ? { ...parseTerafabxGeminiGeneratedReply(raw), ...context }
      : parseTerafabxGrokResult(raw);
    if (!hasDetailedTerafabxGrokContext(parsed)) throw new Error("댓글 생성 문맥 분석 JSON이 비어 있거나 부족합니다.");
    logEvent("terafabx_gemini_generate_ok", {
      targetUrl: target.url,
      attempt,
      reply: parsed.reply,
      contextPreview: parsed.contextSummary.slice(0, 240),
      keyPointCount: parsed.keyPoints.length,
      runDir,
    });
    return { ...parsed, provider: "gemini-web-headless-generate" };
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

async function withTerafabxBrowserSetupCleanup(setup, cleanup, onError = null) {
  try {
    return await setup();
  } catch (error) {
    const cleanupResult = await cleanup().catch((cleanupError) => ({ error: cleanupError.message }));
    if (typeof onError === "function") onError(error, cleanupResult);
    throw error;
  }
}

async function getVerifiedReviewXHeadlessPage(url = "https://x.com/home") {
  let page = null;
  return withTerafabxBrowserSetupCleanup(async () => {
    await ensureTerafabxVerifiedReviewXHeadlessBrowser();
    page = await newPageForPort(TERAFABX_VERIFIED_REVIEW_X_CHROME_PORT, "about:blank");
    await copyXCookiesToPage(page);
    await page.navigate(url, 2500);
    return page;
  }, async () => {
    if (page) await page.close().catch(() => null);
    return closeTerafabxVerifiedReviewXHeadlessBrowser();
  }, (error, cleanup) => {
    logEvent("terafabx_verified_review_x_setup_cleanup", { url, error: error.message, cleanup });
  });
}

async function getTerafabxCommentXHeadlessPage(url = "https://x.com/home") {
  logEvent("terafabx_comment_x_headless_open_start", { port: TERAFABX_COMMENT_X_CHROME_PORT, url });
  let page = null;
  return withTerafabxBrowserSetupCleanup(async () => {
    await ensureTerafabxCommentXHeadlessBrowser();
    logEvent("terafabx_comment_x_headless_browser_ready", { port: TERAFABX_COMMENT_X_CHROME_PORT, url });
    page = await newPageForPort(TERAFABX_COMMENT_X_CHROME_PORT, "about:blank");
    logEvent("terafabx_comment_x_headless_page_opened", { port: TERAFABX_COMMENT_X_CHROME_PORT, url, tabId: page.tab.id });
    await copyXCookiesToPage(page);
    logEvent("terafabx_comment_x_headless_cookies_ready", { port: TERAFABX_COMMENT_X_CHROME_PORT, url, tabId: page.tab.id });
    await page.navigate(url, 2500);
    logEvent("terafabx_comment_x_headless_navigated", { port: TERAFABX_COMMENT_X_CHROME_PORT, url, tabId: page.tab.id });
    return page;
  }, async () => {
    if (page) await page.close().catch(() => null);
    return closeTerafabxCommentXHeadlessBrowser();
  }, (error, cleanup) => {
    logEvent("terafabx_comment_x_setup_cleanup", { url, error: error.message, cleanup });
  });
}

async function closeXDialogs(page) {
  await page.eval(`(() => {
    for (const el of Array.from(document.querySelectorAll('[role="dialog"] [aria-label="Close"], [role="dialog"] [aria-label="닫기"], [data-testid="app-bar-close"], [aria-label="Back"], [aria-label="뒤로"]'))) {
      try { el.click(); } catch {}
    }
    return true;
  })()`).catch(() => false);
}

function xPageReadyState(snapshot = {}, mode = "page") {
  const bodyText = String(snapshot.bodyText || "").trim();
  const articleCount = Number(snapshot.articleCount || 0);
  const scheduleMarkerCount = Number(snapshot.scheduleMarkerCount || 0);
  const accountVisible = Boolean(String(snapshot.accountText || "").trim() || String(snapshot.profileHref || "").trim());
  const loginVisible = /로그인|가입하기|Log in|Sign up/i.test(bodyText);
  const errorVisible = /문제가 발생했습니다|다시 시도|Something went wrong|Try reloading/i.test(bodyText);
  const contentReady = mode === "home"
    ? articleCount > 0
    : mode === "schedule"
      ? scheduleMarkerCount > 0 || /예약 게시물이 없습니다|예약된 게시물이 없습니다|No scheduled posts/i.test(bodyText)
      : accountVisible;
  const ready = contentReady && !loginVisible && !errorVisible;
  return {
    ready,
    blank: !bodyText && articleCount === 0 && !accountVisible,
    loginVisible,
    errorVisible,
    articleCount,
    scheduleMarkerCount,
    bodyLength: bodyText.length,
  };
}

async function readXPageReadySnapshot(page) {
  return page.evalFast(`(() => ({
    url: location.href,
    title: document.title,
    bodyText: (document.body?.innerText || "").slice(0, 2000),
    articleCount: document.querySelectorAll("article").length,
    scheduleMarkerCount: Array.from(document.querySelectorAll('[role="button"]')).filter((el) => /전송 예정|scheduled for|will send on/i.test(el.innerText || el.textContent || "")).length,
    accountText: document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]')?.innerText || "",
    profileHref: document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.href || "",
  }))()`, 8000);
}

async function waitForXPageReady(page, mode, options = {}) {
  const attempts = Math.max(1, Number(options.attempts || 20));
  const intervalMs = Math.max(100, Number(options.intervalMs || 1000));
  const allowReload = options.allowReload !== false;
  let reloaded = false;
  let snapshot = null;
  let assessment = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    snapshot = await readXPageReadySnapshot(page).catch(() => null);
    assessment = xPageReadyState(snapshot || {}, mode);
    if (assessment.ready) return { snapshot, assessment, reloaded };
    if (assessment.loginVisible) throw new Error(`X ${mode} 로그인 화면으로 이동했습니다.`);
    if (allowReload && !reloaded && attempt >= Math.min(5, Math.floor(attempts / 3)) && (assessment.blank || assessment.errorVisible)) {
      reloaded = true;
      await page.send("Page.reload", { ignoreCache: true }, 12000).catch(() => null);
      logEvent("x_page_blank_reload", { mode, url: snapshot?.url || null, blank: assessment.blank, errorVisible: assessment.errorVisible });
    }
    await sleep(intervalMs);
  }
  throw new Error(`X ${mode} 로딩 실패: ${JSON.stringify({
    url: snapshot?.url || null,
    title: snapshot?.title || null,
    blank: assessment?.blank,
    articleCount: assessment?.articleCount || 0,
    bodyLength: assessment?.bodyLength || 0,
    reloaded,
  })}`);
}

const TERAFABX_REPLY_RESTRICTED_RE = /(일부 계정만 답글|답글을 쓸 수 있습니다|답글을 달 수 없습니다|답글 권한|Who can reply|Only people|Replies are disabled|can reply)/i;

async function discoverTerafabxCommentTargetsUnlocked(limit = 1) {
  const targetLimit = Math.max(1, Number(limit || 1));
  const state = loadTerafabxState();
  const seen = new Set([
    ...(state.seenTargets || []),
    ...(state.commentHistory || []).map((item) => item.targetUrl),
    ...pendingTerafabxCommentPosts(state).map((item) => item.targetUrl),
  ].filter(Boolean).map((url) => String(url).split("?")[0]));
  logEvent("terafabx_comment_target_discovery_start", { seenCount: seen.size });
  const page = await getTerafabxCommentXHeadlessPage(`https://x.com/${REQUIRED_X_HANDLE}`);
  try {
    await closeXDialogs(page);
    await verifyXAccount(page);
    await page.navigate("https://x.com/home", 8000);
    const homeReady = await waitForXPageReady(page, "home", { attempts: 25, intervalMs: 1000, allowReload: true });
    logEvent("terafabx_comment_home_ready", {
      articleCount: homeReady.assessment.articleCount,
      bodyLength: homeReady.assessment.bodyLength,
      reloaded: homeReady.reloaded,
    });
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
      logEvent("terafabx_comment_target_api_check", { url: candidate.url });
      try {
        const metadata = await fetchFxTwitterV2Status(candidate.url);
        if (!metadata.id || metadata.replyingToStatus || !metadata.text) {
          logEvent("terafabx_comment_target_skip", { url: candidate.url, reason: metadata.replyingToStatus ? "api_reply_status" : "api_missing_text" });
          continue;
        }
        if (TERAFABX_COMMENT_TARGET_BANNED_RE.test(metadata.text)) {
          logEvent("terafabx_comment_target_skip", { url: candidate.url, reason: "api_banned_context", textPreview: metadata.text.slice(0, 180) });
          continue;
        }
        logEvent("terafabx_comment_target_selected_api", { url: metadata.url, targetId: metadata.id, textPreview: metadata.text.slice(0, 180), verified: metadata.authorVerified });
        selected.push({
          ...candidate,
          url: metadata.url,
          targetId: metadata.id,
          targetText: metadata.text,
          authorHandle: metadata.authorHandle,
          authorVerified: metadata.authorVerified,
          authorVerificationType: metadata.authorVerificationType,
          mediaCount: metadata.mediaCount,
          collectionSource: "x-home-url+fxtwitter-v2-status",
        });
        seen.add(metadata.url);
        if (selected.length >= targetLimit) return selected;
      } catch (error) {
        logEvent("terafabx_comment_target_api_skip", { url: candidate.url, error: error.message });
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

async function discoverTerafabxCommentTargets(limit = 1) {
  return withTerafabxCommentXLock(
    "comment-target-discovery",
    async () => {
      let lastError = null;
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          return await discoverTerafabxCommentTargetsUnlocked(limit);
        } catch (error) {
          lastError = error;
          const retryable = /X home 로딩 실패|Runtime\.evaluate timed out|Chrome 9236 시작 대기 실패/i.test(error.message);
          logEvent("terafabx_comment_target_discovery_attempt_error", { attempt, retryable, error: error.message });
          if (!retryable || attempt >= 2) throw error;
          await closeTerafabxCommentXHeadlessBrowser().catch(() => null);
          await sleep(2_000);
        }
      }
      throw lastError || new Error("댓글 대상 수집 실패");
    },
    { wait: true, timeoutMs: 10 * 60 * 1000 },
  );
}

async function discoverTerafabxCommentTarget() {
  const targets = await discoverTerafabxCommentTargets(1);
  return targets[0];
}

const TERAFABX_COMMENT_TARGET_BANNED_RE = /(crypto|airdrop|staking|token|on-?chain|binance|exchange|wallet|blockchain|finance|financial|market|profit|loss|leverage|futures|\blong\b|\bshort\b|\binvest(?:ment|ing)?\b|\bfunding\b|\bfundrais(?:e|ing)\b|\brwa\b|\bnft\b|\bdefi\b|\bweb3\b|bullish|bearish|candle|slap|hit|fight|assault|violence|weapon|gun|war|death|killed|shoot|cruel|카지노|도박|정치|대통령|국회|살인|사망|참사|재난|전쟁|섹스|성관계|야동|미성년|중학생|초등|아동|성폭|강간|자살|폭행|폭력|잔인|때리|뺨|칼|총|포탄|마약|투자|주식|주가|양봉|음봉|장대양봉|상한가|하한가|매수|매도|매매|포지션|손실|수익|차트|트레이딩|금융|거래소|거래|암호화폐|코인|비트코인|에어드랍|에어드롭|토큰|스테이킹|온체인|블록체인|지갑|바이낸스)/i;

function terafabxAdCommentReason(tweet = {}) {
  const text = cleanSocialText([
    tweet.text,
    tweet.authorName,
    tweet.authorDescription,
  ].filter(Boolean).join(" "));
  if (!text) return null;
  if (/(https?:\/\/|www\.|t\.co\/|bit\.ly|linktr\.ee|smartstore|open\.kakao|카카오톡|텔레그램|telegram|오픈채팅)/i.test(text)) {
    return "external_link_or_contact";
  }
  if (/(광고|홍보|협찬|스폰서|sponsor|promo|promotion|제휴|affiliate|파트너스|쿠팡|coupang)/i.test(text)) {
    return "ad_keyword";
  }
  if (/(할인|특가|쿠폰|무료\s*상담|구매|주문|판매|공구|공동구매|체험단|이벤트|추천인|프로모션|입점|도매|쇼핑몰|예약|상담|가입|모집)/i.test(text)) {
    return "sales_keyword";
  }
  if (/(DM|디엠|문의|contact|inbox)/i.test(text) && /(주세요|가능|구매|판매|주문|상담|협업|제휴|광고|홍보|link|링크)/i.test(text)) {
    return "contact_solicitation";
  }
  if (/(부업|재택|월\s*\d+|하루\s*\d+|대출|보험|렌탈|리딩방)/i.test(text)) {
    return "leadgen_or_money";
  }
  if (/(프로필|계정|채널|피드|스토어|샵|상점|링크|홈페이지|사이트|바이오|소개글).{0,16}(봐\s*주세요|방문|확인|구경|놀러|들러|와\s*주세요|클릭|타고|문의)/i.test(text)
    || /(봐\s*주세요|방문|확인|구경|놀러|들러|와\s*주세요|클릭|타고|문의).{0,16}(프로필|계정|채널|피드|스토어|샵|상점|링크|홈페이지|사이트|바이오|소개글)/i.test(text)) {
    return "profile_or_account_promo";
  }
  if (/(팔로우|맞팔|선팔|구독|알림\s*설정|리트윗|공유).{0,16}(부탁|해\s*주세요|환영|추첨|이벤트|드려요|드림|드립니다)/i.test(text)) {
    return "engagement_bait";
  }
  if (/(무료\s*나눔|나눔\s*이벤트|경품|증정|당첨|체험단|리워드|캐시백|포인트\s*지급|giveaway)/i.test(text)) {
    return "giveaway_or_reward";
  }
  return null;
}

function isTerafabxAdComment(tweet = {}) {
  return Boolean(terafabxAdCommentReason(tweet));
}

function isTerafabxSkippableOwnPostReplyTargetError(error) {
  const message = String(error?.message || error || "");
  return /target_article_not_found|tweet_not_found|status_not_found|article_not_found|삭제|존재하지 않|찾을 수 없/i.test(message);
}

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

async function fetchFxTwitterTweetMetadata(statusUrl) {
  const parsed = parseXStatusUrl(statusUrl);
  if (!parsed?.id) throw new Error(`유효한 X 게시물 URL이 아닙니다: ${statusUrl}`);
  const apiUrl = `${FXTWITTER_API_BASE.replace(/\/$/, "")}/${encodeURIComponent(parsed.handle)}/status/${encodeURIComponent(parsed.id)}`;
  const data = await requestExternalJson(apiUrl);
  if (Number(data?.code) !== 200 || !data?.tweet?.author) {
    throw new Error(data?.message || "fxtwitter tweet metadata missing");
  }
  const tweet = data.tweet;
  const author = tweet.author || {};
  const authorHandle = String(tweet.author.screen_name || parsed.handle).replace(/^@/, "");
  const text = String(tweet.text || tweet.raw_text?.text || "")
    .replace(/^(?:@[A-Za-z0-9_]{1,15}\s*)+/, "")
    .trim();
  const imageCount = Array.isArray(tweet.media?.photos) ? tweet.media.photos.length : 0;
  const videoCount = Array.isArray(tweet.media?.videos) ? tweet.media.videos.length : 0;
  return {
    id: String(tweet.id || parsed.id),
    url: normalizeXStatusUrl(tweet.url || parsed.normalized),
    authorHandle,
    authorVerified: author.verification?.verified === true,
    authorVerificationType: String(author.verification?.type || ""),
    text,
    imageCount,
    videoCount,
    mediaCount: imageCount + videoCount,
    replyingTo: String(tweet.replying_to || "").replace(/^@/, ""),
    replyingToStatus: String(tweet.replying_to_status || ""),
    createdAt: tweet.created_at || null,
    createdTimestamp: Number(tweet.created_timestamp || 0),
    apiUrl,
  };
}

function normalizeFxTwitterV2Status(status = {}) {
  const author = status.author || {};
  const media = status.media || {};
  const allMedia = Array.isArray(media.all) ? media.all : [];
  const photos = Array.isArray(media.photos) ? media.photos : allMedia.filter((item) => item?.type === "photo");
  const videos = Array.isArray(media.videos) ? media.videos : allMedia.filter((item) => item?.type === "video" || item?.type === "gif");
  const replyingTo = status.replying_to || {};
  const authorHandle = String(author.screen_name || parseXStatusUrl(status.url || "")?.handle || "").replace(/^@/, "");
  return {
    id: String(status.id || ""),
    url: normalizeXStatusUrl(status.url || (status.id && authorHandle ? `https://x.com/${authorHandle}/status/${status.id}` : "")),
    authorHandle,
    authorVerified: author.verification?.verified === true,
    authorVerificationType: String(author.verification?.type || ""),
    authorName: String(author.name || ""),
    authorDescription: String(author.description || ""),
    text: String(status.text || status.raw_text?.text || "").replace(/^(?:@[A-Za-z0-9_]{1,15}\s*)+/, "").trim(),
    imageCount: photos.length,
    videoCount: videos.length,
    mediaCount: photos.length + videos.length,
    replyingTo: String(replyingTo.screen_name || status.replying_to || "").replace(/^@/, ""),
    replyingToStatus: String(replyingTo.status || status.replying_to_status || ""),
    createdAt: status.created_at || null,
    createdTimestamp: Number(status.created_timestamp || 0),
    source: "fxtwitter-v2",
  };
}

async function fetchFxTwitterV2Status(statusUrl) {
  const parsed = parseXStatusUrl(statusUrl);
  if (!parsed?.id) throw new Error(`유효한 X 게시물 URL이 아닙니다: ${statusUrl}`);
  const apiUrl = `${FXTWITTER_API_BASE.replace(/\/$/, "")}/2/status/${encodeURIComponent(parsed.id)}?about_account=1`;
  const data = await requestExternalJson(apiUrl, 20_000);
  if (Number(data?.code) !== 200 || !data?.status?.id) throw new Error(data?.message || "fxtwitter v2 status missing");
  return { ...normalizeFxTwitterV2Status(data.status), apiUrl };
}

function flattenFxTwitterConversationReplies(replies = []) {
  const rows = [];
  const seen = new Set();
  const visit = (items) => {
    for (const item of Array.isArray(items) ? items : []) {
      if (!item?.id || seen.has(String(item.id))) continue;
      seen.add(String(item.id));
      rows.push(item);
      if (Array.isArray(item.replies)) visit(item.replies);
    }
  };
  visit(replies);
  return rows;
}

async function fetchFxTwitterConversation(postUrl, options = {}) {
  const root = parseXStatusUrl(postUrl);
  if (!root?.id) throw new Error(`유효한 X 게시물 URL이 아닙니다: ${postUrl}`);
  const maxItems = Math.max(1, Math.min(200, Number(options.maxItems || 200)));
  const maxPages = Math.max(1, Math.min(20, Number(options.maxPages || 10)));
  const rankingMode = options.rankingMode === "likes" ? "likes" : "recency";
  const rowsById = new Map();
  let rootStatus = null;
  let cursor = "";
  const seenCursors = new Set();
  let pageCount = 0;
  do {
    const query = new URLSearchParams({ ranking_mode: rankingMode, about_account: "1" });
    if (cursor) query.set("cursor", cursor);
    const apiUrl = `${FXTWITTER_API_BASE.replace(/\/$/, "")}/2/conversation/${encodeURIComponent(root.id)}?${query}`;
    let data;
    try {
      data = await requestExternalJson(apiUrl, 5_000);
    } catch (error) {
      if (rootStatus) {
        logEvent("terafabx_fxtwitter_conversation_page_partial", { postUrl: root.normalized, pageCount, collectedCount: rowsById.size, error: error.message });
        break;
      }
      throw error;
    }
    if (Number(data?.code) !== 200 || !data?.status?.id) throw new Error(data?.message || "fxtwitter conversation missing");
    rootStatus ||= data.status;
    const pageReplies = flattenFxTwitterConversationReplies(data.replies || []);
    const beforeCount = rowsById.size;
    for (const reply of pageReplies) {
      if (rowsById.size >= maxItems) break;
      rowsById.set(String(reply.id), reply);
    }
    const nextCursor = String(data?.cursor?.bottom || "");
    pageCount += 1;
    if (rowsById.size === beforeCount || !nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor && pageCount < maxPages && rowsById.size < maxItems);
  const rootPost = normalizeFxTwitterV2Status(rootStatus);
  const tweets = [rootPost, ...Array.from(rowsById.values()).map(normalizeFxTwitterV2Status)];
  return { rootPost, tweets, pageCount, cursor, source: "fxtwitter-v2-conversation" };
}

function assessTerafabxReplyRelationship(metadata, targetUrl, requiredHandle = REQUIRED_X_HANDLE) {
  const target = parseXStatusUrl(targetUrl);
  const actualAuthor = String(metadata?.authorHandle || "").replace(/^@/, "").toLowerCase();
  const required = String(requiredHandle || "").replace(/^@/, "").toLowerCase();
  const actualParentId = String(metadata?.replyingToStatus || "");
  const expectedParentId = String(target?.id || "");
  const ok = Boolean(expectedParentId && actualAuthor === required && actualParentId === expectedParentId);
  return {
    ok,
    expectedParentId,
    actualParentId,
    expectedAuthor: required,
    actualAuthor,
    replyUrl: normalizeXStatusUrl(metadata?.url || ""),
  };
}

async function verifyTerafabxReplyRelationship(replyUrl, targetUrl) {
  const metadata = await fetchFxTwitterTweetMetadata(replyUrl);
  const relationship = assessTerafabxReplyRelationship(metadata, targetUrl);
  if (!relationship.ok) {
    throw new Error(`답글 관계 검증 실패: ${JSON.stringify({ targetUrl, replyUrl, ...relationship })}`);
  }
  logEvent("terafabx_reply_relationship_verified", { targetUrl, replyUrl, ...relationship });
  return relationship;
}

async function reconcileTerafabxOwnPostReplyHistory(rootUrl) {
  const normalizedRootUrl = normalizeXStatusUrl(rootUrl);
  const state = loadTerafabxState();
  const relevant = (state.ownPostReplyHistory || []).filter((record) => (
    normalizeXStatusUrl(record?.rootPostUrl || "") === normalizedRootUrl
    && record?.replyUrl
    && record?.targetUrl
  ));
  if (!relevant.length) return { checked: 0, removed: [] };
  const checks = await Promise.all(relevant.map(async (record) => {
    try {
      const metadata = await fetchFxTwitterTweetMetadata(record.replyUrl);
      return { record, relationship: assessTerafabxReplyRelationship(metadata, record.targetUrl) };
    } catch (error) {
      return { record, error: error.message };
    }
  }));
  const invalid = checks.filter((item) => item.relationship && !item.relationship.ok);
  if (!invalid.length) return { checked: relevant.length, removed: [] };
  const invalidReplyUrls = new Set(invalid.map((item) => normalizeXStatusUrl(item.record.replyUrl)));
  const invalidTargetUrls = new Set(invalid.map((item) => normalizeXStatusUrl(item.record.targetUrl)));
  saveTerafabxState({
    ownPostReplyHistory: (state.ownPostReplyHistory || []).filter((record) => !invalidReplyUrls.has(normalizeXStatusUrl(record?.replyUrl || ""))),
    commentHistory: (state.commentHistory || []).filter((record) => !(
      record?.source === "own_post_reply"
      && invalidReplyUrls.has(normalizeXStatusUrl(record?.replyUrl || ""))
      && invalidTargetUrls.has(normalizeXStatusUrl(record?.targetUrl || ""))
    )),
  });
  const removed = invalid.map((item) => ({
    targetUrl: item.record.targetUrl,
    replyUrl: item.record.replyUrl,
    actualParentId: item.relationship.actualParentId,
    expectedParentId: item.relationship.expectedParentId,
  }));
  logEvent("terafabx_own_post_reply_history_reconciled", { rootUrl: normalizedRootUrl, checked: relevant.length, removed });
  return { checked: relevant.length, removed };
}

function invalidateTerafabxOwnPostReplyRecord({ targetCommentUrl, replyUrl = "", reason = "manual_invalidate" } = {}) {
  const target = parseXStatusUrl(targetCommentUrl);
  if (!target?.id) throw new Error("무효화할 대상 댓글 URL이 필요합니다.");
  const normalizedReplyUrl = normalizeXStatusUrl(replyUrl);
  const state = loadTerafabxState();
  const matches = (record) => {
    const parsed = parseXStatusUrl(record?.targetUrl || record?.targetCommentUrl || "");
    if (parsed?.id !== target.id) return false;
    return !normalizedReplyUrl || normalizeXStatusUrl(record?.replyUrl || "") === normalizedReplyUrl;
  };
  const removedOwn = (state.ownPostReplyHistory || []).filter(matches);
  const removedComments = (state.commentHistory || []).filter((record) => record?.source === "own_post_reply" && matches(record));
  saveTerafabxState({
    ownPostReplyHistory: (state.ownPostReplyHistory || []).filter((record) => !matches(record)),
    commentHistory: (state.commentHistory || []).filter((record) => !(record?.source === "own_post_reply" && matches(record))),
    seenTargets: (state.seenTargets || []).filter((url) => parseXStatusUrl(url)?.id !== target.id),
    ...(parseXStatusUrl(state.lastOwnPostReplyTarget || "")?.id === target.id ? {
      lastOwnPostReplyStatus: "invalidated",
      lastOwnPostReplyError: reason,
      lastOwnPostReplyTarget: null,
      lastOwnPostReplyUrl: null,
    } : {}),
  });
  const result = { targetCommentUrl: normalizeXStatusUrl(target.normalized), replyUrl: normalizedReplyUrl || null, reason, removedOwn: removedOwn.length, removedComments: removedComments.length };
  logEvent("terafabx_own_post_reply_invalidated", result);
  return result;
}

function isTerafabxImageOnlyReply(tweet = {}) {
  return !cleanSocialText(tweet.text || "")
    && Number(tweet.imageCount || 0) > 0
    && Number(tweet.videoCount || 0) === 0;
}

function classifyTerafabxOwnPostReplies({ rootUrl, tweets = [], state = {}, requiredHandle = REQUIRED_X_HANDLE, verifiedOnly = false } = {}) {
  const root = parseXStatusUrl(rootUrl);
  const required = String(requiredHandle || "").replace(/^@/, "").toLowerCase();
  if (!root?.id || root.handle.toLowerCase() !== required) {
    throw new Error(`내 X 게시물만 대댓글 대상으로 사용할 수 있습니다: @${required}`);
  }
  const repliedTargetIds = new Set();
  for (const tweet of tweets) {
    if (String(tweet?.authorHandle || "").toLowerCase() === required && tweet?.replyingToStatus) {
      repliedTargetIds.add(String(tweet.replyingToStatus));
    }
  }
  for (const record of [...(state.commentHistory || []), ...(state.ownPostReplyHistory || [])]) {
    const parsed = parseXStatusUrl(record?.targetUrl || record?.targetCommentUrl || "");
    if (parsed?.id) repliedTargetIds.add(parsed.id);
  }

  const directReplies = tweets.filter((tweet) => String(tweet?.replyingToStatus || "") === root.id);
  const ownComments = directReplies.filter((tweet) => String(tweet?.authorHandle || "").toLowerCase() === required);
  const thirdPartyDirectReplies = directReplies.filter((tweet) => String(tweet?.authorHandle || "").toLowerCase() !== required);
  const alreadyReplied = thirdPartyDirectReplies.filter((tweet) => repliedTargetIds.has(String(tweet.id || "")));
  const banned = thirdPartyDirectReplies.filter((tweet) => TERAFABX_COMMENT_TARGET_BANNED_RE.test(String(tweet.text || "")));
  const advertisements = thirdPartyDirectReplies.filter((tweet) => isTerafabxAdComment(tweet));
  const unverified = thirdPartyDirectReplies.filter((tweet) => tweet?.authorVerified !== true);
  const candidates = thirdPartyDirectReplies.filter((tweet) => (
    tweet?.id
    && (cleanSocialText(tweet.text || "") || isTerafabxImageOnlyReply(tweet))
    && !repliedTargetIds.has(String(tweet.id))
    && !TERAFABX_COMMENT_TARGET_BANNED_RE.test(String(tweet.text || ""))
    && !isTerafabxAdComment(tweet)
    && (!verifiedOnly || tweet.authorVerified === true)
  ));
  return {
    root,
    candidates,
    directReplies,
    ownComments,
    alreadyReplied,
    banned,
    advertisements,
    unverified,
    nestedCount: tweets.filter((tweet) => tweet?.replyingToStatus && String(tweet.replyingToStatus) !== root.id).length,
    repliedTargetIds: Array.from(repliedTargetIds),
  };
}

function randomTerafabxOwnPostReplyDelayMs(random = Math.random, minMs = TERAFABX_OWN_POST_REPLY_DELAY_MIN_MS, maxMs = TERAFABX_OWN_POST_REPLY_DELAY_MAX_MS) {
  const min = Math.max(0, Math.floor(Number(minMs) || 0));
  const max = Math.max(min, Math.floor(Number(maxMs) || min));
  const value = Math.min(0.999999999999, Math.max(0, Number(random()) || 0));
  return min + Math.floor(value * (max - min + 1));
}

function terafabxBrowserConcurrency(requested, available = Number.POSITIVE_INFINITY) {
  return Math.max(1, Math.min(
    TERAFABX_BROWSER_CONCURRENCY_CAP,
    Math.floor(Number(requested) || 1),
    Math.max(1, Math.floor(Number(available) || 1)),
  ));
}

async function runFixedWorkerPool(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  const workerCount = Math.max(1, Math.min(list.length || 1, Math.floor(Number(concurrency) || 1)));
  const results = new Array(list.length);
  let cursor = 0;
  async function run(workerIndex) {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) return;
      results[index] = await worker(list[index], workerIndex, index);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, (_, workerIndex) => run(workerIndex)));
  return results;
}

function terafabxStateHasReplyTarget(state, targetUrl) {
  const target = parseXStatusUrl(targetUrl);
  if (!target?.id) return false;
  return [...(state?.commentHistory || []), ...(state?.ownPostReplyHistory || [])].some((record) => {
    const parsed = parseXStatusUrl(record?.targetUrl || record?.targetCommentUrl || "");
    return parsed?.id === target.id && Boolean(record?.replyUrl || record?.posted);
  });
}

function buildTerafabxOwnPostReplyTarget(candidate = {}, discovery = {}) {
  const rootPostUrl = normalizeXStatusUrl(discovery.rootPost?.url || discovery.postUrl || "");
  const rootPostText = cleanSocialText(discovery.rootPost?.text || "");
  if (!rootPostUrl || !rootPostText) {
    throw new Error("부모 원글 문맥이 비어 있어 대댓글을 생성하지 않습니다.");
  }
  const imageOnly = isTerafabxImageOnlyReply(candidate);
  return {
    url: normalizeXStatusUrl(candidate.url),
    targetId: String(candidate.id || ""),
    targetText: cleanSocialText(candidate.text || "") || (imageOnly ? "(이미지만 첨부된 댓글)" : ""),
    rootPostUrl,
    rootPostText,
    imageOnly,
    imageCount: Number(candidate.imageCount || 0),
    videoCount: Number(candidate.videoCount || 0),
    fixedReply: imageOnly ? TERAFABX_IMAGE_ONLY_REPLY_EMOJI : null,
  };
}

function buildTerafabxOwnPostRootContextFallback(discovery = {}) {
  const rootText = cleanSocialText(discovery.rootPost?.text || "");
  const mediaHint = Number(discovery.rootPost?.mediaCount || 0) > 0 ? "미디어가 포함된 원글" : "텍스트 중심 원글";
  return {
    contextSummary: [
      `부모 원글은 "${rootText || "내용 확인 필요"}"라는 @terafabXai 게시물이며 ${mediaHint}이다.`,
      "이 배치는 해당 원글에 달린 인증 계정의 직접 댓글에 짧고 자연스럽게 맞장구치는 작업이다.",
      "각 대댓글은 상대 댓글의 웃음, 감탄, 질문, 공감 표현을 우선 반영해야 한다.",
    ].join(" "),
    keyPoints: [
      rootText ? `부모 원글: ${rootText.slice(0, 180)}` : "부모 원글 문맥 확인 필요",
      "인증 계정 직접 댓글에만 답함",
      "모르는 척 되묻지 말고 원글 소재를 알고 있는 톤으로 반응",
      "짧고 구어체인 한국어 맞장구 우선",
    ],
    rawPreview: "local-root-context-fallback",
    provider: "local-root-context-fallback",
  };
}

function buildTerafabxOwnPostTargetSharedContext(rootContextInput, target = {}) {
  const rootContext = normalizeTerafabxContextResult(rootContextInput);
  const targetText = cleanSocialText(target.targetText || "");
  const rootText = cleanSocialText(target.rootPostText || "");
  const contextSummary = [
    rootContext.contextSummary || (rootText ? `부모 원글: ${rootText}` : ""),
    targetText ? `답글 대상 댓글은 "${targetText}"이며, 이 댓글의 톤과 표현에 짧게 맞장구쳐야 한다.` : "답글 대상 댓글은 이미지/미디어 중심 반응일 수 있다.",
  ].filter(Boolean).join(" ").slice(0, 1200);
  const keyPoints = [
    ...(rootContext.keyPoints || []),
    targetText ? `대상 댓글: ${targetText.slice(0, 180)}` : "대상 댓글: 텍스트 없음",
    rootText ? `부모 원글: ${rootText.slice(0, 180)}` : "",
    "짧고 자연스러운 맞장구",
  ].filter(Boolean).slice(0, 5);
  return {
    contextSummary,
    keyPoints,
    rawPreview: rootContext.rawPreview || "",
    provider: rootContextInput?.provider || "shared-root-context",
  };
}

async function analyzeTerafabxOwnPostRootContext(rootUrl, discovery = {}) {
  const rootText = cleanSocialText(discovery.rootPost?.text || "");
  const fallback = buildTerafabxOwnPostRootContextFallback(discovery);
  if (!rootText) return fallback;
  try {
    const root = parseXStatusUrl(rootUrl);
    const rootTarget = {
      url: rootUrl,
      targetId: root?.id || "root",
      targetText: rootText,
      rootPostUrl: rootUrl,
      rootPostText: rootText,
    };
    const context = await analyzeTerafabxContextWithGrok(rootTarget, {
      maxAttempts: 1,
      session: `${TERAFABX_GROK_WEB_SESSION}-own-post-root-context`,
      skipGrokStateSync: true,
    });
    return {
      ...context,
      provider: context.provider || "web-root-context",
    };
  } catch (error) {
    logEvent("terafabx_own_post_reply_root_context_fallback", { rootUrl, error: error.message });
    return fallback;
  }
}

async function collectTerafabxOwnPostConversation(postUrl, options = {}) {
  const normalizedPostUrl = normalizeXStatusUrl(postUrl);
  const root = parseXStatusUrl(normalizedPostUrl);
  if (!root?.id || root.handle.toLowerCase() !== REQUIRED_X_HANDLE) {
    throw new Error(`내 X 게시물 URL이 필요합니다: @${REQUIRED_X_HANDLE}`);
  }
  if (options.apiFirst !== false) {
    try {
      const conversation = await fetchFxTwitterConversation(normalizedPostUrl, {
        rankingMode: "recency",
        maxItems: 200,
        maxPages: 10,
      });
      if (String(conversation.rootPost.authorHandle || "").toLowerCase() !== REQUIRED_X_HANDLE) {
        throw new Error(`대상 원문 계정 검증 실패: @${conversation.rootPost.authorHandle || "unknown"}`);
      }
      const classification = classifyTerafabxOwnPostReplies({
        rootUrl: normalizedPostUrl,
        tweets: conversation.tweets,
        state: loadTerafabxState(),
        verifiedOnly: true,
      });
      logEvent("terafabx_own_post_reply_candidates_api", {
        postUrl: normalizedPostUrl,
        source: conversation.source,
        pageCount: conversation.pageCount,
        metadataCount: conversation.tweets.length,
        directReplyCount: classification.directReplies.length,
        alreadyRepliedCount: classification.alreadyReplied.length,
        unverifiedCount: classification.unverified.length,
        candidateCount: classification.candidates.length,
      });
      return {
        postUrl: normalizedPostUrl,
        rootPost: conversation.rootPost,
        rows: conversation.tweets,
        tweets: conversation.tweets,
        collectionSource: conversation.source,
        pageCount: conversation.pageCount,
        ...classification,
      };
    } catch (error) {
      logEvent("terafabx_own_post_reply_conversation_api_fallback", { postUrl: normalizedPostUrl, error: error.message });
    }
  }
  return collectTerafabxOwnPostConversationHeadless(normalizedPostUrl, options);
}

async function collectTerafabxOwnPostConversationHeadless(postUrl, options = {}) {
  const normalizedPostUrl = normalizeXStatusUrl(postUrl);
  const root = parseXStatusUrl(normalizedPostUrl);
  if (!root?.id || root.handle.toLowerCase() !== REQUIRED_X_HANDLE) {
    throw new Error(`내 X 게시물 URL이 필요합니다: @${REQUIRED_X_HANDLE}`);
  }
  return withTerafabxCommentXLock("own-post-reply-discovery", async () => {
    const page = await getTerafabxCommentXHeadlessPage(normalizedPostUrl);
    const rowsByUrl = new Map();
    try {
      await closeXDialogs(page);
      await verifyXAccount(page);
      await page.navigate(normalizedPostUrl, 8000);
      const maxScrolls = Math.max(0, Math.min(Number(options.maxScrolls ?? TERAFABX_OWN_POST_REPLY_MAX_SCROLLS), 20));
      let stagnantRounds = 0;
      for (let scroll = 0; scroll <= maxScrolls; scroll += 1) {
        const rows = await page.eval(`(() => {
          function clean(value) { return (value || "").replace(/\\s+/g, " ").trim(); }
          return Array.from(document.querySelectorAll("article")).map((article, index) => {
            const hrefs = Array.from(article.querySelectorAll('a[href*="/status/"]')).map((a) => a.href.split("?")[0]);
            const url = hrefs.find((href) => /^https:\\/\\/x\\.com\\/[A-Za-z0-9_]{1,15}\\/status\\/\\d+$/.test(href));
            const text = clean(article.innerText || "");
            return { index, url: url || null, text: text.slice(0, 1400), promoted: /프로모션|Promoted|광고/.test(text) };
          }).filter((item) => item.url && !item.promoted);
        })()`);
        const before = rowsByUrl.size;
        for (const row of rows || []) rowsByUrl.set(normalizeXStatusUrl(row.url), row);
        stagnantRounds = rowsByUrl.size === before ? stagnantRounds + 1 : 0;
        if (scroll >= maxScrolls || stagnantRounds >= 2) break;
        await page.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 760, deltaX: 0, deltaY: 850 }).catch(() => {});
        await sleep(1000);
      }
    } finally {
      await page.close();
      const cleanup = await closeTerafabxCommentXHeadlessBrowser().catch((error) => ({ error: error.message }));
      logEvent("terafabx_own_post_reply_discovery_cleanup", { postUrl: normalizedPostUrl, cleanup });
    }

    const rows = Array.from(rowsByUrl.values()).slice(0, 200);
    const metadataResults = await Promise.all(rows.map(async (row) => {
      try {
        return await fetchFxTwitterTweetMetadata(row.url);
      } catch (error) {
        logEvent("terafabx_own_post_reply_metadata_skip", { postUrl: normalizedPostUrl, statusUrl: row.url, error: error.message });
        return null;
      }
    }));
    const tweets = metadataResults.filter(Boolean);
    const rootMetadata = tweets.find((tweet) => tweet.id === root.id) || await fetchFxTwitterTweetMetadata(normalizedPostUrl);
    if (String(rootMetadata.authorHandle || "").toLowerCase() !== REQUIRED_X_HANDLE) {
      throw new Error(`대상 원문 계정 검증 실패: @${rootMetadata.authorHandle || "unknown"}`);
    }
    const classification = classifyTerafabxOwnPostReplies({
      rootUrl: normalizedPostUrl,
      tweets,
      state: loadTerafabxState(),
      verifiedOnly: true,
    });
    logEvent("terafabx_own_post_reply_candidates", {
      postUrl: normalizedPostUrl,
      articleCount: rows.length,
      metadataCount: tweets.length,
      directReplyCount: classification.directReplies.length,
      ownCommentCount: classification.ownComments.length,
      alreadyRepliedCount: classification.alreadyReplied.length,
      bannedCount: classification.banned.length,
      advertisementCount: classification.advertisements.length,
      unverifiedCount: classification.unverified.length,
      candidateCount: classification.candidates.length,
      candidateUrls: classification.candidates.slice(0, 10).map((item) => item.url),
    });
    return {
      postUrl: normalizedPostUrl,
      rootPost: {
        url: normalizeXStatusUrl(rootMetadata.url || normalizedPostUrl),
        id: String(rootMetadata.id || root.id),
        text: cleanSocialText(rootMetadata.text || ""),
        authorHandle: String(rootMetadata.authorHandle || ""),
      },
      rows,
      tweets,
      ...classification,
    };
  }, { wait: true, timeoutMs: 3 * 60 * 1000 });
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
  let grokContext = null;
  let geminiDraft = null;
  let geminiReview = null;
  let comment = "";
  try {
    grokContext = await analyzeTerafabxContextWithGrok(target, {
      timeoutMs: TERAFABX_VERIFIED_REVIEW_GROK_TIMEOUT_MS,
      maxAttempts: 2,
      session: grokSession,
    });
    geminiDraft = await generateTerafabxReplyWithGeminiFallback(target, {
      attempt: 1,
      grokContext,
      cleanupBrowser: false,
      chromePort: geminiPort,
      profileDir: geminiProfileDir,
    });
    geminiReview = await reviewTerafabxReplyWithGemini(target, geminiDraft, {
      cleanupBrowser: false,
      chromePort: geminiPort,
      profileDir: geminiProfileDir,
    });
    comment = validateTerafabxReply(geminiReview.finalReply);
    const contextRecord = terafabxGrokContextForRecord(grokContext);
    const finalContext = [target.targetText, contextRecord.summary, ...(contextRecord.keyPoints || []), geminiDraft.reply, comment, geminiReview.reason].join("\n");
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
    grokComment: geminiDraft.reply,
    grokContext: terafabxGrokContextForRecord(grokContext),
    comment,
    geminiReview: {
      used: Boolean(geminiReview.usedGemini),
      score: geminiReview.score ?? null,
      decision: geminiReview.decision || null,
      reason: geminiReview.reason || null,
      fallback: Boolean(geminiReview.fallback),
      error: geminiReview.error || null,
      finalJudge: geminiReview.finalJudge || null,
    },
    generator: [
      grokContext.provider || `${terafabxGrokGeneratorLabel()}-context`,
      geminiDraft.provider || "gemini-web-headless-generate",
      geminiReview.usedGemini ? "gemini-web-headless-review" : null,
      geminiReview.finalJudge ? "gemini-web-headless-judge" : null,
    ].filter(Boolean).join("+"),
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
      const concurrency = terafabxBrowserConcurrency(TERAFABX_VERIFIED_REVIEW_CONCURRENCY, effectiveLimit);
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
    "reply: 자연스러운 한국어 한 줄, 8~45자, 가능하면 12~30자. 원문의 구체적인 장면·행동·감정 한 가지에 정확히 반응하라.",
    "짧아도 문맥이 맞는 댓글이 우선이다. 분량을 채우려고 덕담이나 원문 요약을 덧붙이지 마라.",
    `${actor}이 확신할 수 없는 내용은 context_summary에서 추정이라고 표시하고, reply에는 단정하지 마라.`,
    "금지: 폭력/무기/성/도박/정치/투자 표현, 조롱, 단정적 비난, 링크, 해시태그, 이모지.",
    "금지어: 감정 회계, 가성비 최고네요, 독특하네요, 훈훈하다, 선남선녀, 와 진짜, 대박, ㄷㄷ, 저격수, 때려야죠, 죽이네요.",
    ...terafabxCommentQualityPromptLines(),
    "반드시 JSON 한 줄만 출력해라. 형식: {\"context_summary\":\"원문 이해\",\"key_points\":[\"포인트1\",\"포인트2\"],\"reply\":\"댓글\"}",
    extraRule,
    "",
    ...terafabxPromptContextLines(target),
  ].filter(Boolean).join("\n");
}

function terafabxGrokContextPrompt(target, extraRule = "", actor = "Grok") {
  return [
    "너는 X 계정 @terafabXai(과즙루피)의 한국어 답글 문맥 분석기다.",
    "아래 원문 또는 부모글-댓글 대화를 자세히 해석하되, 공개 답글 후보는 절대 작성하지 마라.",
    "context_summary: 원문 주제, 인용/답글 구조, 감정/상황, 안전하게 반응할 포인트를 2~4문장으로 써라.",
    "key_points: 댓글 생성·검수자가 참고할 핵심 소재와 관찰 포인트 2~5개를 써라.",
    `${actor}이 확신할 수 없는 내용은 context_summary에서 추정이라고 표시해라.`,
    "reply, comment, final_reply 같은 댓글 필드는 출력하지 마라.",
    "반드시 JSON 한 줄만 출력해라. 형식: {\"context_summary\":\"원문 이해\",\"key_points\":[\"포인트1\",\"포인트2\"]}",
    extraRule,
    "",
    ...terafabxPromptContextLines(target),
  ].filter(Boolean).join("\n");
}

function terafabxGeminiGeneratePrompt(target, contextInput, extraRule = "") {
  const context = normalizeTerafabxContextResult(contextInput);
  const keyPoints = context.keyPoints.length
    ? context.keyPoints.map((item) => `- ${item}`).join("\n")
    : "- 제공 없음";
  return [
    "너는 X 계정 @terafabXai(과즙루피)의 한국어 답글 작성기다.",
    "아래 원문과 Grok 문맥 분석을 바탕으로 공개 답글 후보 1개를 작성해라.",
    "Grok 문맥 분석은 보조 정보다. 원문과 충돌하면 원문을 우선하고, Grok의 틀린 추정은 바로잡아라.",
    "규칙: 한국어 한 줄, 8~45자, 가능하면 12~30자. 원문의 구체적인 장면·행동·감정 한 가지에 정확히 반응해라.",
    "짧아도 문맥이 맞는 댓글이 우선이다. 분량을 채우려고 덕담이나 원문 요약을 덧붙이지 마라.",
    "금지: 폭력/무기/성/도박/정치/투자 표현, 조롱, 단정적 비난, 링크, 해시태그, 이모지, 후보 목록, 따옴표.",
    "금지어: 감정 회계, 가성비 최고네요, 독특하네요, 훈훈하다, 선남선녀, 와 진짜, 대박, ㄷㄷ, 저격수, 때려야죠, 죽이네요.",
    ...terafabxCommentQualityPromptLines(),
    "반드시 JSON 한 줄만 출력해라. 형식: {\"reply\":\"댓글\",\"reason\":\"짧은 이유\"}",
    extraRule,
    "",
    ...terafabxPromptContextLines(target),
    `Grok 문맥 분석: ${context.contextSummary || "제공 없음"}`,
    `Grok 핵심 포인트:\n${keyPoints}`,
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
  const namespace = `tg-${crypto.createHash("sha1").update(String(session)).digest("hex").slice(0, 12)}`;
  try {
    return await execFileOutput(AGENT_BROWSER_BIN, agentBrowserCommandArgs(["--namespace", namespace, "--session", namespace, "--headed", "false", "close"]), {
      cwd: __dirname,
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
  } finally {
    terafabxActiveGrokSessions.delete(session);
  }
}

async function cleanupTerafabxAutomationBrowsersOnShutdown() {
  const childPids = Array.from(activeAutomationChildProcesses).map((child) => child.pid).filter(Boolean);
  for (const child of activeAutomationChildProcesses) {
    try { child.kill("SIGTERM"); } catch {}
  }
  const browserPlans = [
    { port: TERAFABX_GEMINI_CHROME_PORT, profileDir: TERAFABX_GEMINI_PROFILE_DIR },
    { port: TERAFABX_VERIFIED_REVIEW_X_CHROME_PORT, profileDir: TERAFABX_VERIFIED_REVIEW_X_PROFILE_DIR },
    { port: TERAFABX_COMMENT_X_CHROME_PORT, profileDir: TERAFABX_COMMENT_X_PROFILE_DIR },
  ];
  for (let index = 0; index < 5; index += 1) {
    browserPlans.push(
      { port: TERAFABX_VERIFIED_REVIEW_GEMINI_PORT_BASE + index, profileDir: `${TERAFABX_GEMINI_PROFILE_DIR}-review-${index + 1}` },
      { port: TERAFABX_OWN_POST_REPLY_GEMINI_PORT_BASE + index, profileDir: `${TERAFABX_GEMINI_PROFILE_DIR}-own-post-reply-${index + 1}` },
    );
  }
  const uniqueBrowserPlans = Array.from(new Map(browserPlans.map((plan) => [`${plan.port}:${plan.profileDir}`, plan])).values());
  const browserResults = await Promise.all(uniqueBrowserPlans.map(async (plan) => ({
    port: plan.port,
    ...(await closeTerafabxGeminiHeadlessBrowser(plan).catch((error) => ({ error: error.message }))),
  })));
  const sessions = new Set(Array.from(terafabxActiveGrokSessions).filter((session) => !String(session).includes("-comment-prefill-")));
  const grokResults = await Promise.all(Array.from(sessions).map(async (session) => {
    const result = await closeTerafabxGrokWebSession(session).catch((error) => ({ error: error.message }));
    return { session, ok: !result?.error, error: result?.error || null };
  }));
  return {
    childPids,
    browserPorts: browserResults.map((item) => ({ port: item.port, remainingPids: item.remainingPids || [], error: item.error || null })),
    grokSessions: grokResults,
  };
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
  if (!options.skipStateSync) await syncTerafabxGrokWebState();
  terafabxActiveGrokSessions.add(session);

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
  terafabxActiveGrokSessions.delete(session);
  return raw;
}

async function analyzeTerafabxContextWithGrok(target, options = {}) {
  const provider = TERAFABX_GROK_PROVIDER === "cli" ? "cli" : "web";
  logEvent("terafabx_grok_context_start", { provider, targetUrl: target.url, textLength: String(target.targetText || target.text || "").length });
  const timeoutMs = Number(options.timeoutMs || 90_000);
  const maxAttempts = Math.max(1, Math.min(Number(options.maxAttempts || 2), 2));
  for (const [attempt, extraRule] of [
    [1, ""],
    [2, "문맥이 애매하면 추정이라고 표시하고 안전하게 반응할 수 있는 관찰 포인트만 정리해라."],
  ].slice(0, maxAttempts)) {
    try {
      const prompt = terafabxGrokContextPrompt(target, extraRule, "Grok");
      const raw = provider === "web"
        ? await runGrokWebAgent(prompt, {
          attempt,
          targetId: `${target.targetId || "target"}-context`,
          targetUrl: target.url,
          timeoutMs: options.timeoutMs ? timeoutMs : Math.max(timeoutMs, TERAFABX_GROK_WEB_TIMEOUT_MS),
          session: options.session,
          skipStateSync: Boolean(options.skipGrokStateSync),
        })
        : await runGrokCli(prompt, timeoutMs);
      if (isTerafabxGrokNonJsonLimitText(raw)) {
        const error = new Error("Grok 문맥 응답이 JSON이 아닌 limit 문구입니다.");
        error.code = "TERAFABX_GROK_CONTEXT_LIMIT_TEXT";
        error.noRetry = true;
        logEvent("terafabx_grok_context_non_json_limit_text", {
          provider,
          attempt,
          targetUrl: target.url,
          preview: String(raw || "").slice(0, 240),
        });
        throw error;
      }
      const result = parseTerafabxGrokContext(raw);
      if (!hasDetailedTerafabxGrokContext(result)) {
        throw new Error("Grok 상세 문맥 분석 JSON이 비어 있거나 부족합니다.");
      }
      logEvent("terafabx_grok_context_ok", {
        provider,
        attempt,
        targetUrl: target.url,
        contextPreview: result.contextSummary.slice(0, 240),
        keyPointCount: result.keyPoints.length,
      });
      return { ...result, provider: `${provider}-context` };
    } catch (error) {
      logEvent("terafabx_grok_context_attempt_failed", { provider, attempt, targetUrl: target.url, error: error.message });
      if (error.noRetry) throw error;
    }
  }
  throw new Error("Grok 상세 문맥 분석 생성 실패");
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

function terafabxStatusHrefMatches(href, targetId) {
  const wanted = String(targetId || "").trim();
  if (!wanted) return false;
  try {
    const pathname = new URL(String(href || ""), "https://x.com").pathname;
    const match = pathname.match(/\/status\/(\d+)(?:\/|$)/);
    return Boolean(match && match[1] === wanted);
  } catch {
    return false;
  }
}

function isTerafabxReplySubmitCandidate(candidate = {}) {
  if (!candidate.withinReplyComposer) return false;
  const testid = String(candidate.testid || "").trim();
  const text = String(candidate.text || "").replace(/\s+/g, " ").trim();
  const recognizedControl = testid === "tweetButton" || testid === "tweetButtonInline" || candidate.role === "button";
  return recognizedControl && /^(답글|Reply)$/i.test(text);
}

function isTerafabxReplySubmissionUncertain(error) {
  return String(error?.code || "") === "TERAFABX_REPLY_SUBMISSION_UNCERTAIN";
}

function terafabxPendingCommentFailureDisposition(item = {}, error, maxAttempts = TERAFABX_PENDING_COMMENT_MAX_ATTEMPTS) {
  const attempts = Number(item.attempts || 0) + 1;
  const submissionUncertain = isTerafabxReplySubmissionUncertain(error);
  const removeFromPending = submissionUncertain || attempts >= maxAttempts;
  return {
    attempts,
    submissionUncertain,
    removeFromPending,
    failedReason: submissionUncertain ? "submission_uncertain" : (removeFromPending ? "max_attempts" : null),
  };
}

async function postTerafabxReply(targetUrl, comment, options = {}) {
  let result;
  if (options.headless) {
    result = await withTerafabxCommentXLock(options.lockAction || "reply-post", () => postTerafabxReplyUnlocked(targetUrl, comment, options), {
      wait: options.lockWait !== false,
      timeoutMs: Number(options.lockTimeoutMs || 6 * 60 * 1000),
    });
  } else {
    result = await postTerafabxReplyUnlocked(targetUrl, comment, options);
  }
  if (result?.ok && result.replyUrl && options.verifyRelationship !== false) {
    try {
      result.relationship = await verifyTerafabxReplyRelationship(result.replyUrl, targetUrl);
    } catch (error) {
      error.code = "TERAFABX_REPLY_SUBMISSION_UNCERTAIN";
      throw error;
    }
  }
  return result;
}

async function likeTerafabxTarget(targetUrl, options = {}) {
  const normalizedTargetUrl = normalizeXStatusUrl(targetUrl);
  const id = parseXStatusUrl(normalizedTargetUrl)?.id || "";
  if (!id) throw new Error("좋아요를 누를 X 댓글 URL이 필요합니다.");
  const run = async () => {
    const page = await getTerafabxCommentXHeadlessPage(normalizedTargetUrl);
    try {
      await closeXDialogs(page);
      await verifyXAccount(page);
      await page.navigate(normalizedTargetUrl, 7500);
      const clicked = await page.eval(`(() => {
        const id = ${JSON.stringify(id)};
        const statusHrefMatches = ${terafabxStatusHrefMatches.toString()};
        const article = Array.from(document.querySelectorAll("article")).find((candidate) =>
          Array.from(candidate.querySelectorAll('a[href*="/status/"]')).some((a) => statusHrefMatches(a.href, id))
        ) || null;
        if (!article) return { ok: false, reason: "target_article_not_found", url: location.href };
        if (article.querySelector('[data-testid="unlike"]')) return { ok: true, alreadyLiked: true, clicked: false, url: location.href };
        const button = article.querySelector('[data-testid="like"]');
        if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") {
          return { ok: false, reason: "like_button_not_available", url: location.href };
        }
        button.scrollIntoView({ block: "center" });
        button.click();
        return { ok: true, alreadyLiked: false, clicked: true, url: location.href };
      })()`);
      if (!clicked?.ok) throw new Error(`원 댓글 좋아요 실패: ${JSON.stringify(clicked)}`);
      if (clicked.clicked) await sleep(900);
      const verified = await page.eval(`(() => {
        const id = ${JSON.stringify(id)};
        const statusHrefMatches = ${terafabxStatusHrefMatches.toString()};
        const article = Array.from(document.querySelectorAll("article")).find((candidate) =>
          Array.from(candidate.querySelectorAll('a[href*="/status/"]')).some((a) => statusHrefMatches(a.href, id))
        ) || null;
        return { found: Boolean(article), liked: Boolean(article && article.querySelector('[data-testid="unlike"]')), url: location.href };
      })()`);
      if (!verified?.found || !verified?.liked) throw new Error(`원 댓글 좋아요 검증 실패: ${JSON.stringify(verified)}`);
      const result = { ok: true, targetUrl: normalizedTargetUrl, alreadyLiked: Boolean(clicked.alreadyLiked), liked: true };
      const at = new Date().toISOString();
      const previous = loadTerafabxState();
      const heartRecord = {
        at,
        count: result.alreadyLiked ? 0 : 1,
        liked: result.alreadyLiked ? [] : [{ url: normalizedTargetUrl }],
        alreadyLiked: result.alreadyLiked ? [{ url: normalizedTargetUrl }] : [],
        manual: true,
        source: "own_post_reply",
      };
      saveTerafabxState({
        lastHeartRunAt: at,
        lastHeartStatus: "ok",
        lastHeartError: null,
        lastHeartCount: heartRecord.count,
        heartHistory: [heartRecord, ...(previous.heartHistory || [])].slice(0, 100),
      });
      logEvent("terafabx_target_like_verified", result);
      return result;
    } finally {
      if (options.cleanupHeadless !== false) await closeTerafabxCommentXHeadlessBrowser().catch(() => null);
    }
  };
  return withTerafabxCommentXLock(options.lockAction || "target-like", run, {
    wait: options.lockWait !== false,
    timeoutMs: Number(options.lockTimeoutMs || 6 * 60 * 1000),
  });
}

function shouldUseTerafabxQuickIntent(options = {}, targetId = "") {
  // X intent may render a generic top-level composer. It cannot prove the
  // parent relationship before submit, so reply automation must never use it.
  return false;
}

async function postTerafabxReplyUnlocked(targetUrl, comment, options = {}) {
  logEvent("terafabx_reply_post_start", { targetUrl, comment });
  const id = (targetUrl.match(/status\/(\d+)/) || [])[1] || "";
  const useHeadless = Boolean(options.headless);
  let replySubmissionClicked = false;
  const page = useHeadless
    ? await getTerafabxCommentXHeadlessPage(targetUrl)
    : await getExistingXPage(targetUrl);
  try {
    await closeXDialogs(page);
    await verifyXAccount(page);
    await page.navigate(targetUrl, 7500);
    const pre = await page.eval(`(() => {
      const id = ${JSON.stringify(id)};
      const statusHrefMatches = ${terafabxStatusHrefMatches.toString()};
      const article = Array.from(document.querySelectorAll("article")).find((candidate) =>
        Array.from(candidate.querySelectorAll('a[href*="/status/"]')).some((a) => statusHrefMatches(a.href, id))
      ) || null;
      function clean(s) { return (s || "").replace(/\\s+/g, " ").trim(); }
      const text = article ? clean(article.innerText) : "";
      const replyRestricted = /(일부 계정만 답글|답글을 쓸 수 있습니다|답글을 달 수 없습니다|답글 권한|Who can reply|Only people|Replies are disabled|can reply)/i.test(text);
      const replyDisabled = article ? Array.from(article.querySelectorAll('[data-testid="reply"], button, [role="button"]')).some((el) => /Reply|답글/.test(el.getAttribute("aria-label") || el.innerText || "") && (el.disabled || el.getAttribute("aria-disabled") === "true")) : false;
      return { ok: Boolean(article), text: text.slice(0, 900), url: location.href, replyRestricted, replyDisabled };
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
      const id = ${JSON.stringify(id)};
      const statusHrefMatches = ${terafabxStatusHrefMatches.toString()};
      const article = Array.from(document.querySelectorAll("article")).find((candidate) =>
        Array.from(candidate.querySelectorAll('a[href*="/status/"]')).some((a) => statusHrefMatches(a.href, id))
      ) || null;
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
      function findSubmitButton() {
        const editors = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"], [role="textbox"][contenteditable="true"], [contenteditable="true"]')).filter(visible);
        const editor = editors.pop();
        const scope = editor?.closest('[role="dialog"], [data-testid="sheetDialog"]') || null;
        if (!scope) return null;
        const isReplySubmitCandidate = ${isTerafabxReplySubmitCandidate.toString()};
        return Array.from(scope.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"], button, [role="button"]'))
          .filter(enabled)
          .find((el) => isReplySubmitCandidate({
            withinReplyComposer: true,
            testid: el.getAttribute("data-testid") || "",
            text: buttonText(el),
            role: el.getAttribute("role") || (el.tagName === "BUTTON" ? "button" : ""),
          }));
      }
      for (let attempt = 0; attempt < 18; attempt += 1) {
        const button = findSubmitButton();
        if (button) {
          button.click();
          return { clicked: true, text: button.innerText || button.getAttribute("aria-label") || "", attempt };
        }
        await wait(500);
      }
      return {
        clicked: false,
        keyboardFallbackAttempted: false,
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
      if (!clickedPost.clicked) throw new Error("활성화된 답글 게시 버튼을 찾지 못했습니다.");
    }
    replySubmissionClicked = true;
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
      const error = new Error(`답글 게시 검증 실패: ${JSON.stringify(verify)}`);
      error.code = "TERAFABX_REPLY_SUBMISSION_UNCERTAIN";
      throw error;
    }
    logEvent("terafabx_reply_verified", { targetUrl, replyUrl: verify.href });
    return { ok: true, replyUrl: verify.href, verify };
  } catch (error) {
    if (replySubmissionClicked && !error.code) error.code = "TERAFABX_REPLY_SUBMISSION_UNCERTAIN";
    throw error;
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

function buildTerafabxFixedImageReplyRecord(target, options = {}) {
  const comment = validateTerafabxReply(target.fixedReply || TERAFABX_IMAGE_ONLY_REPLY_EMOJI);
  return {
    at: new Date().toISOString(),
    targetUrl: target.url,
    targetId: target.targetId,
    targetText: target.targetText,
    rootPostUrl: target.rootPostUrl || null,
    rootPostText: target.rootPostText || null,
    imageOnly: true,
    imageCount: Number(target.imageCount || 0),
    comment,
    grokComment: comment,
    grokContext: {
      summary: "인증 계정이 텍스트 없이 이미지만 첨부한 직속 댓글이라 고정 이모지 규칙을 적용함.",
      keyPoints: ["이미지 전용 댓글", "고정 이모지 응답"],
      rawPreview: "",
    },
    geminiReview: {
      used: false,
      score: null,
      decision: "fixed_image_only_emoji",
      reason: "이미지 전용 인증 댓글 고정 규칙",
      fallback: false,
      error: null,
      finalJudge: null,
    },
    replyUrl: null,
    generator: "fixed-image-only-emoji",
    manual: Boolean(options.manual),
    source: options.source || "comment",
  };
}

function terafabxSingleOwnPostCandidateLimit(value = TERAFABX_OWN_POST_REPLY_SINGLE_CANDIDATE_LIMIT) {
  return Math.max(1, Math.min(20, Math.floor(Number(value) || 1)));
}

function terafabxOwnPostReplyBatchLimit(value = TERAFABX_OWN_POST_REPLY_BATCH_LIMIT) {
  return Math.max(1, Math.min(200, Math.floor(Number(value) || TERAFABX_OWN_POST_REPLY_BATCH_LIMIT)));
}

function terafabxReplyReviewFinalScore(review = {}) {
  const score = Number(review?.finalJudge?.score ?? review?.score);
  return Number.isFinite(score) ? score : null;
}

function isTerafabxReplyReviewScoreQualified(review = {}, minScore = TERAFABX_REVIEW_COMMENT_MIN_SCORE) {
  const score = terafabxReplyReviewFinalScore(review);
  const minimum = Number.isFinite(Number(minScore)) ? Number(minScore) : TERAFABX_REVIEW_COMMENT_MIN_SCORE;
  return Number.isFinite(score) && score >= minimum;
}

function assertTerafabxReplyReviewScoreQualified(review = {}, minScore = TERAFABX_REVIEW_COMMENT_MIN_SCORE) {
  const score = terafabxReplyReviewFinalScore(review);
  const minimum = Number.isFinite(Number(minScore)) ? Number(minScore) : TERAFABX_REVIEW_COMMENT_MIN_SCORE;
  if (!Number.isFinite(score)) {
    throw new Error(`최종 심사 점수 없음: 최소 ${minimum}점 필요`);
  }
  if (score < minimum) {
    throw new Error(`최종 심사 점수 미달: ${score} < ${minimum}`);
  }
  return score;
}

async function buildTerafabxPreparedCommentRecord(target, options = {}) {
  if (target.imageOnly === true) return buildTerafabxFixedImageReplyRecord(target, options);
  const worker = Math.max(0, Number(options.workerIndex || 0));
  const chromePort = Number(options.chromePort || (TERAFABX_COMMENT_PREFILL_GEMINI_PORT_BASE + worker));
  const profileDir = options.profileDir || `${TERAFABX_GEMINI_PROFILE_DIR}-comment-prefill-${worker + 1}`;
  const geminiOptions = options.parallel
    ? {
      chromePort,
      profileDir,
      workerIndex: worker,
      grokContextSession: options.grokContextSession,
      skipGrokStateSync: Boolean(options.skipGrokStateSync),
      cleanupBrowser: options.cleanupBrowser,
      geminiPriority: options.geminiPriority,
    }
    : { workerIndex: worker, geminiPriority: options.geminiPriority };
  const grokContext = options.grokContext
    ? {
      ...normalizeTerafabxContextResult(options.grokContext),
      provider: options.grokContext.provider || "shared-context",
    }
    : await analyzeTerafabxContextWithGrok(target, {
      session: geminiOptions.grokContextSession,
      skipGrokStateSync: Boolean(geminiOptions.skipGrokStateSync),
    });
  const grokResult = await generateTerafabxReplyWithGeminiFallback(target, { attempt: 1, ...geminiOptions, grokContext });
  logEvent("terafabx_comment_gemini_direct", {
    targetUrl: target.url,
    reply: grokResult.reply,
    contextPreview: grokResult.contextSummary.slice(0, 240),
    keyPointCount: grokResult.keyPoints.length,
    workerIndex: worker,
    port: geminiOptions.chromePort || TERAFABX_GEMINI_CHROME_PORT,
  });
  const grokComment = normalizeTerafabxGrokResult(grokResult).reply;
  if (options.deferGeminiReview) {
    const generator = [
      grokContext.provider || `${terafabxGrokGeneratorLabel()}-context`,
      grokResult.provider || "gemini-web-headless-generate",
      "gemini-web-headless-batch-review-pending",
    ].filter(Boolean).join("+");
    return {
      at: new Date().toISOString(),
      targetUrl: target.url,
      targetId: target.targetId,
      targetText: target.targetText,
      rootPostUrl: target.rootPostUrl || null,
      rootPostText: target.rootPostText || null,
      comment: grokComment,
      grokComment,
      grokContext: terafabxGrokContextForRecord(grokResult),
      geminiReview: {
        used: false,
        score: null,
        decision: "pending_batch_review",
        reason: "Gemini 묶음 검수 대기",
        fallback: false,
        error: null,
        finalJudge: null,
      },
      pendingGeminiBatchReview: true,
      replyUrl: null,
      generator,
      manual: Boolean(options.manual),
      source: options.source || "comment",
    };
  }
  let geminiReview;
  let comment;
  try {
    geminiReview = await reviewTerafabxReplyWithGemini(target, grokResult, geminiOptions);
    assertTerafabxReplyReviewScoreQualified(geminiReview, TERAFABX_REVIEW_COMMENT_MIN_SCORE);
    comment = validateTerafabxReply(geminiReview.finalReply);
    const contextAssessment = assessTerafabxParentContextMismatch(target, comment);
    if (!contextAssessment.ok) throw new Error(`부모 원글 문맥 불일치: ${contextAssessment.reason}`);
  } catch (reviewError) {
    logEvent("terafabx_comment_review_rejected", { targetUrl: target.url, error: reviewError.message, workerIndex: worker });
    throw reviewError;
  }
  const generator = [
    grokContext.provider || `${terafabxGrokGeneratorLabel()}-context`,
    grokResult.provider || "gemini-web-headless-generate",
    geminiReview.usedGemini ? "gemini-web-headless-review" : null,
    geminiReview.finalJudge ? "gemini-web-headless-judge" : null,
  ].filter(Boolean).join("+");
  return {
    at: new Date().toISOString(),
    targetUrl: target.url,
    targetId: target.targetId,
    targetText: target.targetText,
    rootPostUrl: target.rootPostUrl || null,
    rootPostText: target.rootPostText || null,
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
      finalJudge: geminiReview.finalJudge || null,
    },
    replyUrl: null,
    generator,
    manual: Boolean(options.manual),
    source: options.source || "comment",
  };
}

async function runTerafabxCommentOnce({ manual = false } = {}) {
  if (terafabxBusy) throw new Error("다른 과즙루피 자동화 작업이 진행 중입니다.");
  if (terafabxCommentPrefillBusy) throw new Error("자동댓글 prefill 작업이 진행 중입니다.");
  const daily = terafabxDailyCommentProgress();
  if (!manual && daily.reached) {
    logEvent("terafabx_comment_daily_target_reached", daily);
    return { ok: true, action: "comment", skipped: "daily_target_reached", daily };
  }
  terafabxBusy = true;
  const startedAt = new Date().toISOString();
  try {
      const target = await discoverTerafabxCommentTarget();
      const record = await buildTerafabxPreparedCommentRecord(target, { manual, geminiPriority: "comment" });
      const comment = record.comment;
      if (!manual && isTerafabxQuietPostingTime()) {
        return { ok: true, action: "comment", deferred: true, quietUntil: nextTerafabxQuietPostingEnd(), ...enqueueTerafabxPendingCommentPost(record) };
      }
      const posted = await postTerafabxReply(target.url, comment, { headless: true });
      const previous = loadTerafabxState();
      record.postedAt = new Date().toISOString();
      record.replyUrl = posted.replyUrl;
      const nextHistory = [record, ...(previous.commentHistory || [])].slice(0, TERAFABX_COMMENT_HISTORY_LIMIT);
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

function saveTerafabxOwnPostReplySuccess({ prepared, candidate, target, rootPostUrl, replyUrl, manual, startedAt }) {
  const postedAt = new Date().toISOString();
  const previous = loadTerafabxState();
  const historyRecord = {
    ...prepared,
    at: postedAt,
    postedAt,
    posted: true,
    status: "posted",
    manual,
    source: "own_post_reply",
    rootPostUrl,
    targetUrl: target.url,
    targetId: target.targetId,
    targetAuthor: candidate.authorHandle || "",
    replyUrl,
  };
  const commentHistory = [
    historyRecord,
    ...(previous.commentHistory || []).filter((item) => normalizeXStatusUrl(item.targetUrl || "") !== target.url),
  ].slice(0, TERAFABX_COMMENT_HISTORY_LIMIT);
  const ownPostReplyHistory = [
    historyRecord,
    ...(previous.ownPostReplyHistory || []).filter((item) => normalizeXStatusUrl(item.targetUrl || item.targetCommentUrl || "") !== target.url),
  ].slice(0, 500);
  saveTerafabxState({
    lastOwnPostReplyRunAt: postedAt,
    lastOwnPostReplyStatus: "ok",
    lastOwnPostReplyError: null,
    lastOwnPostReplyTarget: target.url,
    lastOwnPostReplyUrl: replyUrl,
    ownPostReplyHistory,
    commentHistory,
    seenTargets: Array.from(new Set([target.url, ...(previous.seenTargets || [])])).slice(0, 500),
  });
  logEvent("terafabx_own_post_reply_posted", historyRecord);
  return historyRecord;
}

async function runTerafabxOwnPostReplyOnce({ postUrl = "", targetCommentUrl = "", manual = false } = {}) {
  if (terafabxOwnPostReplyBusy) throw new Error("다른 인증댓글 하트+답글 작업이 진행 중입니다.");
  const stateBefore = loadTerafabxState();
  const requestedTargets = postUrl
    ? [normalizeXStatusUrl(postUrl)]
    : (stateBefore.ownPostReplyTargets || []).map(normalizeXStatusUrl).filter(Boolean);
  const targetUrls = Array.from(new Set(requestedTargets));
  const requestedComment = targetCommentUrl ? parseXStatusUrl(targetCommentUrl) : null;
  if (targetCommentUrl && !requestedComment?.id) throw new Error("유효한 대상 댓글 URL이 필요합니다.");
  if (!targetUrls.length) throw new Error("대댓글을 모니터링할 내 X 게시물 URL이 없습니다.");
  if (!manual && isTerafabxQuietPostingTime()) {
    return { ok: true, action: "own-post-reply", deferred: true, quietUntil: nextTerafabxQuietPostingEnd(), targetUrls };
  }

  terafabxOwnPostReplyBusy = true;
  const startedAt = new Date().toISOString();
  try {
    for (const targetUrl of targetUrls) {
      await reconcileTerafabxOwnPostReplyHistory(targetUrl);
    }
    const candidateLimit = requestedComment ? 1 : terafabxSingleOwnPostCandidateLimit();
    const attempts = [];
    for (const targetUrl of targetUrls) {
      const discovery = await collectTerafabxOwnPostConversation(targetUrl);
      const candidates = requestedComment
        ? discovery.candidates.filter((item) => String(item.id || "") === requestedComment.id).slice(0, 1)
        : discovery.candidates.slice(0, candidateLimit);
      for (const candidate of candidates) {
        attempts.push({ selectedPostUrl: targetUrl, discovery, candidate });
      }
    }

    if (!attempts.length) {
      const checkedAt = new Date().toISOString();
      saveTerafabxState({
        lastOwnPostReplyRunAt: checkedAt,
        lastOwnPostReplyStatus: "no_candidate",
        lastOwnPostReplyError: null,
        lastOwnPostReplyTarget: null,
      });
      logEvent("terafabx_own_post_reply_no_candidate", { startedAt, checkedAt, targetUrls });
      return { ok: true, action: "own-post-reply", skipped: "no_candidate", targetUrls };
    }

    const rejected = [];
    const skippedTargets = [];
    let grokContextUnavailable = null;
    for (const attempt of attempts) {
      const { selectedPostUrl, discovery, candidate } = attempt;
      const target = buildTerafabxOwnPostReplyTarget(candidate, discovery);
      logEvent("terafabx_own_post_reply_selected", {
        postUrl: selectedPostUrl,
        targetUrl: target.url,
        targetId: target.targetId,
        authorHandle: candidate.authorHandle,
        textPreview: target.targetText.slice(0, 240),
        ownCommentCount: discovery.ownComments.length,
        alreadyRepliedCount: discovery.alreadyReplied.length,
      });

      let prepared = null;
      try {
        prepared = await buildTerafabxPreparedCommentRecord(target, {
          manual,
          source: "own_post_reply",
        });
      } catch (error) {
        rejected.push({ targetUrl: target.url, targetAuthor: candidate.authorHandle || "", error: error.message, stage: "prepare" });
        logEvent("terafabx_own_post_reply_prepare_rejected", {
          postUrl: selectedPostUrl,
          targetUrl: target.url,
          targetAuthor: candidate.authorHandle || "",
          error: error.message,
          code: error.code || "",
        });
        if (error.code === "TERAFABX_GROK_CONTEXT_LIMIT_TEXT") {
          grokContextUnavailable = error;
          break;
        }
        continue;
      }

      const recheck = await collectTerafabxOwnPostConversation(selectedPostUrl, { maxScrolls: 3 });
      const stillEligible = recheck.candidates.some((item) => String(item.id || "") === target.targetId);
      if (!stillEligible) {
        skippedTargets.push({ targetUrl: target.url, reason: "already_replied_or_no_longer_eligible" });
        logEvent("terafabx_own_post_reply_recheck_skipped", { postUrl: selectedPostUrl, targetUrl: target.url, targetId: target.targetId });
        continue;
      }

      try {
        const posted = await postTerafabxReply(target.url, prepared.comment, {
          headless: true,
          lockAction: "own-post-reply-post",
        });
        const historyRecord = saveTerafabxOwnPostReplySuccess({
          prepared,
          candidate,
          target,
          rootPostUrl: selectedPostUrl,
          replyUrl: posted.replyUrl,
          manual,
          startedAt,
        });
        return {
          ok: true,
          action: "own-post-reply",
          postUrl: selectedPostUrl,
          targetUrl: target.url,
          targetAuthor: candidate.authorHandle || "",
          targetText: target.targetText,
          comment: prepared.comment,
          score: prepared.geminiReview?.finalJudge?.score ?? prepared.geminiReview?.score ?? null,
          replyUrl: posted.replyUrl,
          postedAt: historyRecord.postedAt,
          rejected,
          skippedTargets,
        };
      } catch (error) {
        rejected.push({ targetUrl: target.url, targetAuthor: candidate.authorHandle || "", error: error.message, stage: "post_or_relationship_verify" });
        logEvent("terafabx_own_post_reply_post_rejected", {
          postUrl: selectedPostUrl,
          targetUrl: target.url,
          targetAuthor: candidate.authorHandle || "",
          error: error.message,
        });
      }
    }

    const checkedAt = new Date().toISOString();
    saveTerafabxState({
      lastOwnPostReplyRunAt: checkedAt,
      lastOwnPostReplyStatus: grokContextUnavailable ? "grok_context_unavailable" : rejected.length ? "no_qualified_candidate" : "skipped_already_replied",
      lastOwnPostReplyError: grokContextUnavailable
        ? grokContextUnavailable.message
        : rejected.map((item) => item.error).filter(Boolean).join(" | ").slice(0, 1000) || null,
      lastOwnPostReplyTarget: null,
    });
    logEvent(grokContextUnavailable ? "terafabx_own_post_reply_grok_context_unavailable" : "terafabx_own_post_reply_no_qualified_candidate", {
      startedAt,
      checkedAt,
      targetUrls,
      rejected,
      skippedTargets,
      error: grokContextUnavailable?.message || "",
    });
    return {
      ok: true,
      action: "own-post-reply",
      skipped: grokContextUnavailable ? "grok_context_unavailable" : rejected.length ? "no_qualified_candidate" : "already_replied_during_generation",
      targetUrls,
      rejected,
      skippedTargets,
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    saveTerafabxState({
      lastOwnPostReplyRunAt: failedAt,
      lastOwnPostReplyStatus: "error",
      lastOwnPostReplyError: error.message,
    });
    logEvent("terafabx_own_post_reply_error", { startedAt, failedAt, targetUrls, error: error.message });
    throw error;
  } finally {
    terafabxOwnPostReplyBusy = false;
  }
}

async function runTerafabxOwnPostReplyBatch({
  postUrl = "",
  manual = true,
  queueRequestId = "",
  concurrency = TERAFABX_OWN_POST_REPLY_CONCURRENCY,
  limit = TERAFABX_OWN_POST_REPLY_BATCH_LIMIT,
  delayMinMs = TERAFABX_OWN_POST_REPLY_DELAY_MIN_MS,
  delayMaxMs = TERAFABX_OWN_POST_REPLY_DELAY_MAX_MS,
} = {}) {
  if (terafabxOwnPostReplyBusy) throw new Error("다른 인증댓글 하트+답글 작업이 진행 중입니다.");
  const rootUrl = normalizeXStatusUrl(postUrl);
  const root = parseXStatusUrl(rootUrl);
  if (!root?.id || root.handle.toLowerCase() !== REQUIRED_X_HANDLE) throw new Error(`@${REQUIRED_X_HANDLE}의 원글 URL이 필요합니다.`);
  const workerCount = terafabxBrowserConcurrency(concurrency || TERAFABX_OWN_POST_REPLY_CONCURRENCY);
  const batchLimit = terafabxOwnPostReplyBatchLimit(limit);
  const minDelay = Math.min(20_000, Math.max(10_000, Math.floor(Number(delayMinMs) || TERAFABX_OWN_POST_REPLY_DELAY_MIN_MS)));
  const maxDelay = Math.min(20_000, Math.max(minDelay, Math.floor(Number(delayMaxMs) || TERAFABX_OWN_POST_REPLY_DELAY_MAX_MS)));
  const useBatchReview = TERAFABX_OWN_POST_REPLY_BATCH_REVIEW_ENABLED && TERAFABX_GEMINI_REVIEW_ENABLED;
  terafabxOwnPostReplyBusy = true;
  const startedAt = new Date().toISOString();
  const workerIndexes = Array.from({ length: workerCount }, (_, index) => index);
  try {
    if (queueRequestId) updateTerafabxOwnPostReplyQueueItem(queueRequestId, { stage: "collecting", stageLabel: "댓글 수집 중" });
    seedTerafabxOwnPostReplyGeminiProfiles(workerIndexes);
    await reconcileTerafabxOwnPostReplyHistory(rootUrl);
    const discovery = await collectTerafabxOwnPostConversation(rootUrl);
    const candidates = discovery.candidates.slice(0, batchLimit);
    if (queueRequestId) updateTerafabxOwnPostReplyQueueItem(queueRequestId, {
      stage: candidates.length ? "preparing" : "completed",
      stageLabel: candidates.length ? "답글 준비 중" : "완료 · 남은 대상 없음",
      candidateCount: discovery.candidates.length,
    });
    if (!candidates.length) {
      const checkedAt = new Date().toISOString();
      saveTerafabxState({ lastOwnPostReplyRunAt: checkedAt, lastOwnPostReplyStatus: "no_candidate", lastOwnPostReplyError: null, lastOwnPostReplyTarget: null });
      if (queueRequestId) updateTerafabxOwnPostReplyQueueItem(queueRequestId, {
        status: "completed",
        stage: "completed",
        stageLabel: "완료 · 남은 대상 없음",
        completedAt: checkedAt,
        candidateCount: 0,
        postedCount: 0,
        rejectedCount: 0,
        error: null,
      });
      return { ok: true, action: "own-post-reply-batch", skipped: "no_candidate", posted: [], rejected: [], skippedTargets: [] };
    }
    await syncTerafabxGrokWebState();
    const rootContext = await analyzeTerafabxOwnPostRootContext(rootUrl, discovery);
    logEvent("terafabx_own_post_reply_batch_prepare_start", {
      rootUrl,
      candidateCount: candidates.length,
      totalCandidateCount: discovery.candidates.length,
      limit: batchLimit,
      concurrency: workerCount,
      rootContextProvider: rootContext.provider || "",
      streaming: true,
      batchGeminiReview: useBatchReview,
    });
    let grokContextUnavailable = null;
    const posted = [];
    const rejected = [];
    const skippedTargets = [];
    const delays = [];
    const prepareCandidate = async (candidate, workerIndex) => {
      const target = buildTerafabxOwnPostReplyTarget(candidate, discovery);
      if (grokContextUnavailable && !target.imageOnly) {
        return { ok: false, candidate, target, workerIndex, error: grokContextUnavailable.message, skipped: "grok_context_unavailable" };
      }
      try {
        const grokContext = buildTerafabxOwnPostTargetSharedContext(rootContext, target);
        const prepared = await buildTerafabxPreparedCommentRecord(target, {
          manual,
          source: "own_post_reply",
          parallel: true,
          workerIndex,
          chromePort: TERAFABX_OWN_POST_REPLY_GEMINI_PORT_BASE + workerIndex,
          profileDir: terafabxOwnPostReplyGeminiProfileDir(workerIndex),
          grokContextSession: `${TERAFABX_GROK_WEB_SESSION}-own-post-reply-context-${workerIndex + 1}`,
          skipGrokStateSync: true,
          grokContext,
          deferGeminiReview: useBatchReview,
        });
        return { ok: true, candidate, target, prepared, workerIndex };
      } catch (error) {
        logEvent("terafabx_own_post_reply_batch_prepare_rejected", { rootUrl, targetUrl: target.url, workerIndex, error: error.message });
        if (error.code === "TERAFABX_GROK_CONTEXT_LIMIT_TEXT") grokContextUnavailable = error;
        return { ok: false, candidate, target, workerIndex, error: error.message };
      }
    };
    let writerStopped = false;
    for (let offset = 0; offset < candidates.length && !writerStopped; offset += workerCount) {
      const chunk = candidates.slice(offset, offset + workerCount);
      logEvent("terafabx_own_post_reply_batch_chunk_prepare_start", { rootUrl, offset, size: chunk.length, postedCount: posted.length, rejectedCount: rejected.length });
      let preparedResults = await runFixedWorkerPool(chunk, workerCount, prepareCandidate);
      logEvent("terafabx_own_post_reply_batch_chunk_prepare_done", {
        rootUrl,
        offset,
        preparedCount: preparedResults.filter((item) => item?.ok).length,
        rejectedCount: preparedResults.filter((item) => !item?.ok).length,
      });
      if (queueRequestId) updateTerafabxOwnPostReplyQueueItem(queueRequestId, {
        stage: useBatchReview ? "reviewing" : "posting",
        stageLabel: useBatchReview ? "Gemini 묶음 검수 중" : "하트·답글 게시 중",
        preparedCount: offset + preparedResults.filter((item) => item?.ok).length,
        rejectedCount: rejected.length + preparedResults.filter((item) => !item?.ok).length,
      });
      if (useBatchReview) {
        const reviewableResults = preparedResults.filter((item) =>
          item?.ok
          && item.target?.imageOnly !== true
          && item.prepared?.pendingGeminiBatchReview === true
        );
        if (reviewableResults.length) {
          try {
            const reviewedResults = await reviewTerafabxPreparedReplyBatchWithGemini(reviewableResults, {
              chromePort: TERAFABX_OWN_POST_REPLY_GEMINI_PORT_BASE,
              profileDir: terafabxOwnPostReplyGeminiProfileDir(0),
              cleanupBrowser: true,
            });
            const reviewedByTarget = new Map(reviewedResults.map((item) => [item.target?.url || item.prepared?.targetUrl || "", item]));
            preparedResults = preparedResults.map((item) => reviewedByTarget.get(item?.target?.url || "") || item);
            logEvent("terafabx_own_post_reply_batch_chunk_review_done", {
              rootUrl,
              offset,
              requested: reviewableResults.length,
              passedCount: reviewedResults.filter((item) => item.ok).length,
              rejectedCount: reviewedResults.filter((item) => !item.ok).length,
            });
            if (queueRequestId) updateTerafabxOwnPostReplyQueueItem(queueRequestId, {
              stage: "posting",
              stageLabel: "하트·답글 게시 중",
              reviewedCount: offset + reviewedResults.length,
            });
          } catch (error) {
            logEvent("terafabx_own_post_reply_batch_chunk_review_error", { rootUrl, offset, count: reviewableResults.length, error: error.message });
            const reviewableTargets = new Set(reviewableResults.map((item) => item.target?.url).filter(Boolean));
            preparedResults = preparedResults.map((item) => (
              reviewableTargets.has(item?.target?.url)
                ? { ...item, ok: false, error: `Gemini 묶음 검수 실패: ${error.message}`, stage: "batch_review" }
                : item
            ));
          }
        }
      }
      for (const item of preparedResults) {
        if (!item?.ok) {
          rejected.push({
            targetUrl: item?.target?.url || "",
            targetAuthor: item?.candidate?.authorHandle || "",
            error: item?.error || "prepare_failed",
            stage: item?.stage || "prepare",
          });
          continue;
        }
        if (terafabxStateHasReplyTarget(loadTerafabxState(), item.target.url)) {
          skippedTargets.push({ targetUrl: item.target.url, reason: "already_replied_or_no_longer_eligible" });
          continue;
        }
        if (item.target?.imageOnly !== true && item.prepared?.generator !== "fixed-image-only-emoji") {
          try {
            assertTerafabxReplyReviewScoreQualified(item.prepared?.geminiReview, TERAFABX_REVIEW_COMMENT_MIN_SCORE);
          } catch (error) {
            rejected.push({ targetUrl: item.target.url, targetAuthor: item.candidate.authorHandle || "", error: error.message, stage: "score_gate" });
            logEvent("terafabx_own_post_reply_batch_score_rejected", {
              rootUrl,
              targetUrl: item.target.url,
              targetAuthor: item.candidate.authorHandle || "",
              score: terafabxReplyReviewFinalScore(item.prepared?.geminiReview),
              error: error.message,
            });
            continue;
          }
        }
        if (posted.length > 0) {
          const delayMs = randomTerafabxOwnPostReplyDelayMs(Math.random, minDelay, maxDelay);
          delays.push(delayMs);
          logEvent("terafabx_own_post_reply_batch_wait", { rootUrl, delayMs, nextTargetUrl: item.target.url });
          await sleep(delayMs);
        }
        try {
          const liked = await likeTerafabxTarget(item.target.url, {
            lockAction: "own-post-reply-batch-like",
            cleanupHeadless: false,
          });
          const result = await postTerafabxReply(item.target.url, item.prepared.comment, {
            headless: true,
            quick: false,
            lockAction: "own-post-reply-batch-writer",
            cleanupHeadless: false,
          });
          const historyRecord = saveTerafabxOwnPostReplySuccess({
            prepared: item.prepared,
            candidate: item.candidate,
            target: item.target,
            rootPostUrl: rootUrl,
            replyUrl: result.replyUrl,
            manual,
            startedAt,
          });
          posted.push({
            targetUrl: item.target.url,
            targetAuthor: item.candidate.authorHandle || "",
            targetText: item.target.targetText,
            comment: item.prepared.comment,
            score: item.prepared.geminiReview?.finalJudge?.score ?? item.prepared.geminiReview?.score ?? null,
            replyUrl: result.replyUrl,
            liked: liked.liked,
            alreadyLiked: liked.alreadyLiked,
            postedAt: historyRecord.postedAt,
          });
          if (queueRequestId) updateTerafabxOwnPostReplyQueueItem(queueRequestId, {
            stage: "posting",
            stageLabel: "하트·답글 게시 중",
            postedCount: posted.length,
            rejectedCount: rejected.length,
          });
          logEvent("terafabx_own_post_reply_batch_progress", { rootUrl, postedCount: posted.length, rejectedCount: rejected.length, skippedCount: skippedTargets.length, targetUrl: item.target.url, replyUrl: result.replyUrl });
        } catch (error) {
          const stage = isTerafabxSkippableOwnPostReplyTargetError(error) ? "target_unavailable" : "post_or_relationship_verify";
          rejected.push({ targetUrl: item.target.url, targetAuthor: item.candidate.authorHandle || "", error: error.message, stage });
          if (stage === "target_unavailable") {
            logEvent("terafabx_own_post_reply_batch_target_skipped", { rootUrl, targetUrl: item.target.url, targetAuthor: item.candidate.authorHandle || "", error: error.message });
            continue;
          }
          logEvent("terafabx_own_post_reply_batch_writer_stopped", { rootUrl, targetUrl: item.target.url, error: error.message });
          writerStopped = true;
          break;
        }
      }
    }
    const completedAt = new Date().toISOString();
    if (!posted.length) {
      saveTerafabxState({
        lastOwnPostReplyRunAt: completedAt,
        lastOwnPostReplyStatus: grokContextUnavailable ? "grok_context_unavailable" : rejected.length ? "no_qualified_candidate" : "no_candidate",
        lastOwnPostReplyError: rejected.map((item) => item.error).filter(Boolean).join(" | ").slice(0, 1000) || null,
      });
    }
    const result = { ok: true, action: "own-post-reply-batch", rootUrl, startedAt, completedAt, concurrency: workerCount, limit: batchLimit, candidateCount: discovery.candidates.length, selectedCount: candidates.length, delayMinMs: minDelay, delayMaxMs: maxDelay, delays, posted, rejected, skippedTargets };
    if (queueRequestId) updateTerafabxOwnPostReplyQueueItem(queueRequestId, {
      status: "completed",
      stage: "completed",
      stageLabel: "완료",
      completedAt,
      candidateCount: discovery.candidates.length,
      postedCount: posted.length,
      rejectedCount: rejected.length,
      error: null,
    });
    logEvent("terafabx_own_post_reply_batch_done", { ...result, posted: posted.map((item) => ({ targetUrl: item.targetUrl, replyUrl: item.replyUrl, score: item.score })), rejectedCount: rejected.length });
    return result;
  } finally {
    await closeTerafabxCommentXHeadlessBrowser().catch(() => null);
    await Promise.all(workerIndexes.map(async (workerIndex) => {
      await closeTerafabxGeminiHeadlessBrowser({
        port: TERAFABX_OWN_POST_REPLY_GEMINI_PORT_BASE + workerIndex,
        profileDir: terafabxOwnPostReplyGeminiProfileDir(workerIndex),
      }).catch(() => null);
      await closeTerafabxGrokWebSession(`${TERAFABX_GROK_WEB_SESSION}-own-post-reply-context-${workerIndex + 1}`).catch(() => null);
    }));
    await closeTerafabxGrokWebSession(`${TERAFABX_GROK_WEB_SESSION}-own-post-root-context`).catch(() => null);
    terafabxOwnPostReplyBusy = false;
  }
}

async function runNextTerafabxOwnPostReplyManualQueueItem() {
  const state = loadTerafabxState();
  const queue = normalizeTerafabxOwnPostReplyManualQueue(state.ownPostReplyManualQueue);
  const item = queue.find((entry) => entry.status === "queued" || entry.status === "running");
  if (!item) return null;
  updateTerafabxOwnPostReplyQueueItem(item.id, {
    status: "running",
    stage: "collecting",
    stageLabel: "댓글 수집 중",
    startedAt: item.startedAt || new Date().toISOString(),
    error: null,
  });
  try {
    return await runTerafabxOwnPostReplyBatch({
      postUrl: item.postUrl,
      manual: true,
      queueRequestId: item.id,
      concurrency: item.options?.concurrency,
      limit: item.options?.limit,
      delayMinMs: item.options?.delayMinMs,
      delayMaxMs: item.options?.delayMaxMs,
    });
  } catch (error) {
    updateTerafabxOwnPostReplyQueueItem(item.id, {
      status: "error",
      stage: "error",
      stageLabel: "실패",
      completedAt: new Date().toISOString(),
      error: error.message,
    });
    throw error;
  }
}

async function runTerafabxOwnPostReplyAllMonitored({ manual = false } = {}) {
  const stateBefore = loadTerafabxState();
  const targetUrls = Array.from(new Set((stateBefore.ownPostReplyTargets || []).map(normalizeXStatusUrl).filter(Boolean)));
  if (!targetUrls.length) throw new Error("대댓글을 모니터링할 내 X 게시물 URL이 없습니다.");
  if (!manual && isTerafabxQuietPostingTime()) {
    return { ok: true, action: "own-post-reply-all", deferred: true, quietUntil: nextTerafabxQuietPostingEnd(), targetUrls };
  }
  const startedAt = new Date().toISOString();
  const results = [];
  const posted = [];
  const rejected = [];
  const skippedTargets = [];
  for (const targetUrl of targetUrls) {
    try {
      const result = await runTerafabxOwnPostReplyBatch({
        postUrl: targetUrl,
        manual,
        concurrency: TERAFABX_OWN_POST_REPLY_CONCURRENCY,
        limit: TERAFABX_OWN_POST_REPLY_BATCH_LIMIT,
        delayMinMs: TERAFABX_OWN_POST_REPLY_DELAY_MIN_MS,
        delayMaxMs: TERAFABX_OWN_POST_REPLY_DELAY_MAX_MS,
      });
      results.push(result);
      posted.push(...(Array.isArray(result.posted) ? result.posted : []));
      rejected.push(...(Array.isArray(result.rejected) ? result.rejected : []));
      skippedTargets.push(...(Array.isArray(result.skippedTargets) ? result.skippedTargets : []));
    } catch (error) {
      results.push({ ok: false, rootUrl: targetUrl, error: error.message });
      rejected.push({ rootUrl: targetUrl, error: error.message, stage: "root_batch" });
      logEvent("terafabx_own_post_reply_all_target_error", { rootUrl: targetUrl, error: error.message });
    }
  }
  const completedAt = new Date().toISOString();
  const latestPosted = posted[posted.length - 1] || null;
  saveTerafabxState({
    lastOwnPostReplyRunAt: completedAt,
    lastOwnPostReplyStatus: posted.length ? "ok" : rejected.length ? "no_qualified_candidate" : "no_candidate",
    lastOwnPostReplyError: rejected.map((item) => item.error).filter(Boolean).join(" | ").slice(0, 1000) || null,
    lastOwnPostReplyTarget: latestPosted?.targetUrl || null,
    lastOwnPostReplyUrl: latestPosted?.replyUrl || null,
  });
  const result = {
    ok: true,
    action: "own-post-reply-all",
    startedAt,
    completedAt,
    targetUrls,
    concurrency: terafabxBrowserConcurrency(TERAFABX_OWN_POST_REPLY_CONCURRENCY),
    limit: terafabxOwnPostReplyBatchLimit(),
    posted,
    rejected,
    skippedTargets,
    results,
  };
  logEvent("terafabx_own_post_reply_all_done", {
    ...result,
    posted: posted.map((item) => ({ targetUrl: item.targetUrl, replyUrl: item.replyUrl, score: item.score })),
    rejectedCount: rejected.length,
    skippedCount: skippedTargets.length,
  });
  return result;
}

async function withTerafabxManualActionGate(action, fn, timeoutMs = 5 * 60 * 1000) {
  const startedAt = Date.now();
  terafabxManualActionPending = true;
  try {
    while (terafabxBusy || terafabxSchedulerBusy || terafabxCommentPrefillBusy) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(`${action} 대기 시간 초과: 자동화 작업이 아직 진행 중입니다.`);
      }
      await sleep(1000);
    }
    return await fn();
  } finally {
    terafabxManualActionPending = false;
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
      commentHistory: [record, ...(previous.commentHistory || [])].slice(0, TERAFABX_COMMENT_HISTORY_LIMIT),
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
  if (isTerafabxQuietPostingTime()) {
    logEvent("terafabx_comment_prefill_quiet_continue", { quietUntil: nextTerafabxQuietPostingEnd() });
  }
  terafabxCommentPrefillBusy = true;
  const startedAt = new Date().toISOString();
  let workerResources = [];
  try {
    const currentPending = pendingTerafabxCommentPosts();
    const daily = terafabxDailyCommentProgress();
    const target = Math.min(Math.max(0, Number(targetCount || 0)), daily.remaining);
    const missing = Math.max(0, target - currentPending.length);
    const workerCount = terafabxBrowserConcurrency(concurrency, missing);
    logEvent("terafabx_comment_prefill_start", { manual, pendingCount: currentPending.length, targetCount: target, missing, concurrency: workerCount });
    if (missing <= 0) return { ok: true, action: "comment-prefill", queued: 0, pendingCount: currentPending.length };
    workerResources = await prepareTerafabxCommentPrefillWorkers(workerCount);
    const targets = await discoverTerafabxCommentTargets(missing);
    const selected = targets.slice(0, missing);
    const contextResults = await runFixedWorkerPool(selected, workerCount, async (targetItem, workerIndex) => {
      try {
        const resource = workerResources[workerIndex];
        const grokContext = await analyzeTerafabxContextWithGrok(targetItem, {
          session: resource.grokContextSession,
          skipGrokStateSync: true,
          timeoutMs: 60_000,
          maxAttempts: 1,
        });
        return { ok: true, target: targetItem, grokContext, workerIndex };
      } catch (error) {
        logEvent("terafabx_comment_prefill_item_error", { targetUrl: targetItem.url, error: error.message, workerIndex, stage: "grok_context" });
        return { ok: false, targetUrl: targetItem.url, error: error.message, workerIndex, stage: "grok_context" };
      }
    });
    const results = contextResults.filter((item) => !item.ok);
    const ready = contextResults.filter((item) => item.ok);
    for (let offset = 0; offset < ready.length; offset += 5) {
      const chunk = ready.slice(offset, offset + 5);
      try {
        const generated = await generateTerafabxPreparedReplyBatchWithGemini(chunk, {
          manual,
          source: "prefill",
          priority: "comment",
          chromePort: workerResources[0].chromePort,
          profileDir: workerResources[0].profileDir,
        });
        const reviewed = await reviewTerafabxPreparedReplyBatchWithGemini(generated, {
          skipReview: true,
          priority: "comment",
          cleanupBrowser: false,
          chromePort: workerResources[0].chromePort,
          profileDir: workerResources[0].profileDir,
        });
        for (const item of reviewed) {
          if (!item.ok) {
            results.push(item);
            continue;
          }
          const queued = enqueueTerafabxPendingCommentPost(item.prepared, {
          updateLastRun: false,
          eventType: "terafabx_comment_prefill_queued",
          source: "prefill",
          });
          results.push(queued.skipped
            ? { ok: false, skipped: true, targetUrl: queued.targetUrl, reason: queued.reason, workerIndex: item.workerIndex }
            : { ok: true, targetUrl: queued.targetUrl, comment: queued.comment, workerIndex: item.workerIndex });
        }
      } catch (error) {
        for (const item of chunk) {
          logEvent("terafabx_comment_prefill_item_error", { targetUrl: item.target.url, error: error.message, workerIndex: item.workerIndex, stage: "gemini_batch" });
          results.push({ ok: false, targetUrl: item.target.url, error: error.message, workerIndex: item.workerIndex, stage: "gemini_batch" });
        }
      }
    }
    const queued = results.filter((item) => item.ok);
    const failed = results.filter((item) => !item.ok);
    logEvent("terafabx_comment_prefill_done", { startedAt, requested: missing, selected: selected.length, queued: queued.length, failed: failed.length, pendingCount: pendingTerafabxCommentPosts().length });
    return { ok: failed.length === 0, action: "comment-prefill", requested: missing, selected: selected.length, queued, failed, pendingCount: pendingTerafabxCommentPosts().length };
  } catch (error) {
    logEvent("terafabx_comment_prefill_error", { startedAt, error: error.message });
    return { ok: false, action: "comment-prefill", error: error.message };
  } finally {
    if (workerResources.length) await cleanupTerafabxCommentPrefillWorkers(workerResources);
    terafabxCommentPrefillBusy = false;
  }
}

function maybeStartTerafabxCommentPrefill(reason = "tick") {
  const state = loadTerafabxState();
  if (!state.commentEnabled) return;
  if (terafabxDailyCommentProgress(state).reached) return;
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
  const daily = terafabxDailyCommentProgress();
  if (!manual && daily.reached) {
    logEvent("terafabx_pending_comment_daily_target_reached", daily);
    return { ok: true, action: "pending-comment", skipped: "daily_target_reached", daily, remaining: pendingTerafabxCommentPosts().length };
  }
  terafabxBusy = true;
  try {
      const requestedLimit = Math.max(0, Number(limit || 0)) || 5;
      const effectiveLimit = manual ? requestedLimit : Math.min(requestedLimit, daily.remaining);
      const candidates = pendingTerafabxCommentPosts().slice(0, effectiveLimit);
      const posted = [];
      const failed = [];
      logEvent("terafabx_pending_comment_post_start", { count: candidates.length, manual });
      for (let index = 0; index < candidates.length; index += 1) {
        const record = candidates[index];
        const targetUrl = normalizeXStatusUrl(record.targetUrl || "");
        const startedAt = new Date().toISOString();
        const policy = assessTerafabxCurrentCommentPolicy(record);
        if (!manual && !policy.ok) {
          const previous = loadTerafabxState();
          const failedAt = new Date().toISOString();
          const failedRecord = {
            ...record,
            status: "error",
            errorAt: failedAt,
            failedReason: "stale_comment_policy",
            lastError: policy.errors.join(","),
          };
          saveTerafabxState({
            pendingCommentPosts: pendingTerafabxCommentPosts(previous)
              .filter((item) => normalizeXStatusUrl(item.targetUrl || "") !== targetUrl),
            failedPendingCommentPosts: [failedRecord, ...(previous.failedPendingCommentPosts || [])].slice(0, 100),
          });
          failed.push({ targetUrl, error: `stale_comment_policy:${policy.errors.join(",")}` });
          logEvent("terafabx_pending_comment_policy_rejected", { targetUrl, ...policy });
          continue;
        }
        try {
          const comment = validateTerafabxReply(record.comment);
          logEvent("terafabx_pending_comment_post_item_start", { index: index + 1, total: candidates.length, targetUrl });
          const result = await postTerafabxReply(targetUrl, comment, { headless: true });
          const at = new Date().toISOString();
          const previous = loadTerafabxState();
          const historyRecord = { ...record, at, targetUrl, comment, replyUrl: result.replyUrl, manual, deferred: true, posted: true, status: "posted", postedAt: at };
          const nextHistory = [historyRecord, ...(previous.commentHistory || [])].slice(0, TERAFABX_COMMENT_HISTORY_LIMIT);
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
            const disposition = terafabxPendingCommentFailureDisposition(item, error);
            const nextItem = { ...item, attempts: disposition.attempts, lastError: error.message, lastAttemptAt: failedAt, updatedAt: failedAt };
            if (disposition.removeFromPending) {
              failedRecord = { ...nextItem, status: "error", errorAt: failedAt, failedReason: disposition.failedReason };
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
            submissionUncertain: isTerafabxReplySubmissionUncertain(error),
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

function assessTerafabxCurrentCommentPolicy(record) {
  const errors = [];
  const length = Array.from(cleanSocialText(record?.comment || "")).length;
  if (length < 8) errors.push(`comment_too_short:${length}`);
  if (length > 45) errors.push(`comment_too_long:${length}`);
  const finalJudge = record?.geminiReview?.finalJudge || {};
  if (isTerafabxGrokContextFallback(record?.grokContext)) errors.push("grok_context_fallback");
  const context = Number(finalJudge?.dimensions?.context);
  if (!Number.isFinite(context) || context < 30) errors.push(`context_gate_failed:${Number.isFinite(context) ? context : "missing"}`);
  if (finalJudge?.fatalError === true) errors.push("fatal_context_error");
  const languageQuality = assessTerafabxLanguageQuality(record?.comment || "");
  for (const error of languageQuality.errors) errors.push(`language_quality:${error}`);
  for (const warning of languageQuality.styleWarnings) errors.push(`style_quality:${warning}`);
  const structuredQualityRolloutAt = Date.parse("2026-07-13T00:46:00.000Z");
  const recordCreatedAt = Date.parse(record?.queuedAt || record?.at || record?.postedAt || "");
  const requiresStructuredQuality = !Number.isFinite(recordCreatedAt) || recordCreatedAt >= structuredQualityRolloutAt;
  if (requiresStructuredQuality && finalJudge?.qualityFlagsComplete !== true) errors.push("structured_quality_flags_missing");
  const requiresGenericityQuality = record?.source === "prefill"
    && (!Number.isFinite(recordCreatedAt) || recordCreatedAt >= TERAFABX_PREFILL_GENERICITY_ROLLOUT_AT);
  if (requiresGenericityQuality && finalJudge?.genericityFlagsComplete !== true) errors.push("genericity_quality_flags_missing");
  if (requiresGenericityQuality && finalJudge?.sourceAnchorGrounded !== true) errors.push("source_anchor_unverifiable");
  for (const issue of finalJudge?.flaggedQualityIssues || []) errors.push(`gemini_quality:${issue}`);
  if (finalJudge?.passed !== true) errors.push("independent_judge_not_passed");
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    length,
    context: Number.isFinite(context) ? context : null,
    languageQuality,
    requiresStructuredQuality,
    requiresGenericityQuality,
  };
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
  const currentPolicy = assessTerafabxCurrentCommentPolicy(record);
  errors.push(...currentPolicy.errors.map((error) => `current_policy:${error}`));
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
  ].slice(0, TERAFABX_COMMENT_HISTORY_LIMIT);
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
  const daily = terafabxDailyCommentProgress();
  if (!manual && daily.reached) {
    const remaining = loadTerafabxCommentReviewQueue().filter((item) => item && !item.posted && item.status !== "error").length;
    logEvent("terafabx_review_comment_daily_target_reached", daily);
    return { ok: true, action: "review-comment", skipped: "daily_target_reached", daily, requested: 0, posted: [], failed: [], skippedRecords: [], remaining };
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
      const configuredMax = Number(limit) > 0 ? Math.min(Number(limit), eligible.length) : eligible.length;
      const max = manual ? configuredMax : Math.min(configuredMax, daily.remaining);
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
  const dailyCommentProgress = terafabxDailyCommentProgress(state, new Date(now));
  const lastCommentScheduleRef = state.lastCommentStartedAt || state.lastCommentRunAt;
  const lastCommentMs = lastCommentScheduleRef ? new Date(lastCommentScheduleRef).getTime() : 0;
  const lastHeartMs = state.lastHeartRunAt ? new Date(state.lastHeartRunAt).getTime() : 0;
  const lastFollowMs = state.lastFollowRunAt ? new Date(state.lastFollowRunAt).getTime() : 0;
  const lastOwnPostReplyMs = state.lastOwnPostReplyRunAt ? new Date(state.lastOwnPostReplyRunAt).getTime() : 0;
  const lastVerifiedReviewMs = state.verifiedCommentReviewLastRunAt ? new Date(state.verifiedCommentReviewLastRunAt).getTime() : 0;
  const verifiedReviewBackoffMs = state.verifiedCommentReviewBackoffUntil ? new Date(state.verifiedCommentReviewBackoffUntil).getTime() : 0;
  const verifiedReviewBackoffActive = Number.isFinite(verifiedReviewBackoffMs) && verifiedReviewBackoffMs > now;
  const reviewQueue = loadTerafabxCommentReviewQueue();
  const pendingReviewQueue = reviewQueue.filter((item) => item && !item.posted && item.status !== "error");
  const quietPostingActive = isTerafabxQuietPostingTime();
  const pendingCommentPosts = pendingTerafabxCommentPosts(state);
  const ownPostReplyManualQueue = normalizeTerafabxOwnPostReplyManualQueue(state.ownPostReplyManualQueue);
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
    commentMonitor: loadTerafabxCommentMonitorState(),
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
      intervalMs: 0,
      baseIntervalMs: dailyCommentProgress.baseIntervalMs,
      daily: dailyCommentProgress,
      nextRunAt: state.commentEnabled && !dailyCommentProgress.reached
        ? new Date(now).toISOString()
        : null,
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
    ownPostReply: {
      enabled: Boolean(state.ownPostReplyEnabled),
      busy: terafabxOwnPostReplyBusy,
      schedulerBusy: terafabxOwnPostReplySchedulerBusy,
      verifiedOnly: true,
      intervalMs: TERAFABX_OWN_POST_REPLY_INTERVAL_MS,
      concurrency: terafabxBrowserConcurrency(TERAFABX_OWN_POST_REPLY_CONCURRENCY),
      batchLimit: terafabxOwnPostReplyBatchLimit(),
      batchGeminiReview: TERAFABX_OWN_POST_REPLY_BATCH_REVIEW_ENABLED && TERAFABX_GEMINI_REVIEW_ENABLED,
      delayMinMs: Math.min(20_000, Math.max(10_000, TERAFABX_OWN_POST_REPLY_DELAY_MIN_MS)),
      delayMaxMs: Math.min(20_000, Math.max(10_000, TERAFABX_OWN_POST_REPLY_DELAY_MAX_MS)),
      targetUrls: (state.ownPostReplyTargets || []).map(normalizeXStatusUrl).filter(Boolean),
      nextRunAt: state.ownPostReplyEnabled && (state.ownPostReplyTargets || []).length
        ? new Date(Math.max(now, lastOwnPostReplyMs + TERAFABX_OWN_POST_REPLY_INTERVAL_MS)).toISOString()
        : null,
      lastRunAt: state.lastOwnPostReplyRunAt,
      lastStatus: state.lastOwnPostReplyStatus,
      lastError: state.lastOwnPostReplyError,
      lastTarget: state.lastOwnPostReplyTarget,
      lastReplyUrl: state.lastOwnPostReplyUrl,
      history: (state.ownPostReplyHistory || []).slice(0, 10),
      manualQueue: ownPostReplyManualQueue.slice().reverse(),
      pendingManualCount: ownPostReplyManualQueue.filter((item) => ["queued", "running"].includes(item.status)).length,
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

async function maybeRunTerafabxCommentAutomation() {
  if (terafabxCommentSchedulerBusy || terafabxBusy || terafabxManualActionPending) return;
  const state = loadTerafabxState();
  const daily = terafabxDailyCommentProgress(state);
  if (!state.commentEnabled || daily.reached) return;
  const pendingCount = pendingTerafabxCommentPosts(state).length;
  if (pendingCount <= 0) {
    if (!terafabxCommentPrefillBusy) maybeStartTerafabxCommentPrefill("empty_comment_queue");
    return;
  }
  if (pendingCount > 0 && isTerafabxQuietPostingTime()) return;
  terafabxCommentSchedulerBusy = true;
  const startedAt = new Date().toISOString();
  try {
    logEvent("terafabx_comment_scheduler_start", { startedAt, pendingCount, intervalMs: 0 });
    if (pendingCount > 0) await runTerafabxPendingCommentPosts({ manual: false, limit: 1 });
    else await runTerafabxCommentOnce({ manual: false });
  } catch (error) {
    logEvent("terafabx_comment_scheduler_error", { startedAt, error: error.message });
  } finally {
    terafabxCommentSchedulerBusy = false;
    maybeStartTerafabxCommentPrefill("after_comment_scheduler");
    logEvent("terafabx_comment_scheduler_done", { startedAt });
  }
}

async function maybeRunTerafabxAutomation() {
  if (terafabxSchedulerBusy || terafabxBusy || terafabxCommentPrefillBusy || terafabxManualActionPending) return;
  terafabxSchedulerBusy = true;
  const runStartedAt = new Date().toISOString();
  terafabxSchedulerStartedAt = runStartedAt;
  const jobs = [];
  const state = loadTerafabxState();
  const now = Date.now();
  const dailyCommentProgress = terafabxDailyCommentProgress(state, new Date(now));
  const lastHeartMs = state.lastHeartRunAt ? new Date(state.lastHeartRunAt).getTime() : 0;
  const lastFollowMs = state.lastFollowRunAt ? new Date(state.lastFollowRunAt).getTime() : 0;
  const lastOwnPostReplyMs = state.lastOwnPostReplyRunAt ? new Date(state.lastOwnPostReplyRunAt).getTime() : 0;
  const lastVerifiedReviewMs = state.verifiedCommentReviewLastRunAt ? new Date(state.verifiedCommentReviewLastRunAt).getTime() : 0;
  const verifiedReviewBackoffMs = state.verifiedCommentReviewBackoffUntil ? new Date(state.verifiedCommentReviewBackoffUntil).getTime() : 0;
  const verifiedReviewBackoffActive = Number.isFinite(verifiedReviewBackoffMs) && verifiedReviewBackoffMs > now;
  const reviewQueue = loadTerafabxCommentReviewQueue();
  const reviewQueueCount = reviewQueue.filter((item) => item && !item.posted && item.status !== "error").length;
  const eligibleReviewPostCount = reviewQueue
    .filter((item) => item && !item.posted && item.status !== "error")
    .filter((item) => assessTerafabxCommentReviewRecord(item, TERAFABX_REVIEW_COMMENT_MIN_SCORE).ok)
    .length;
  if (state.verifiedCommentReviewEnabled && !verifiedReviewBackoffActive && reviewQueueCount < TERAFABX_VERIFIED_REVIEW_TARGET_COUNT && now - lastVerifiedReviewMs >= TERAFABX_VERIFIED_REVIEW_INTERVAL_MS) {
    jobs.push({ name: "verified-review", overdueMs: now - lastVerifiedReviewMs - TERAFABX_VERIFIED_REVIEW_INTERVAL_MS });
  } else if (state.verifiedCommentReviewEnabled && verifiedReviewBackoffActive) {
    logEvent("terafabx_verified_review_backoff_skip", { until: state.verifiedCommentReviewBackoffUntil });
  }
  if (TERAFABX_REVIEW_COMMENT_AUTO_POST && !dailyCommentProgress.reached && eligibleReviewPostCount > 0 && !isTerafabxQuietPostingTime()) {
    jobs.push({ name: "review-comment", overdueMs: eligibleReviewPostCount });
  }
  if (state.heartEnabled && now - lastHeartMs >= TERAFABX_HEART_INTERVAL_MS) {
    jobs.push({ name: "heart", overdueMs: now - lastHeartMs - TERAFABX_HEART_INTERVAL_MS });
  }
  if (state.followEnabled && now - lastFollowMs >= TERAFABX_FOLLOW_INTERVAL_MS) {
    jobs.push({ name: "follow", overdueMs: now - lastFollowMs - TERAFABX_FOLLOW_INTERVAL_MS });
  }
  const jobPriority = { "pending-comment": 1, comment: 2, "verified-review": 3, "review-comment": 4, heart: 5, follow: 6 };
  jobs.sort((a, b) => (jobPriority[a.name] ?? 99) - (jobPriority[b.name] ?? 99) || b.overdueMs - a.overdueMs);
  if (!jobs.length) {
    maybeStartTerafabxCommentPrefill("idle_tick");
    terafabxSchedulerBusy = false;
    terafabxSchedulerStartedAt = null;
    return;
  }
  logEvent("terafabx_auto_queue_start", { runStartedAt, jobs });
  try {
    for (let index = 0; index < jobs.length; index += 1) {
      const job = jobs[index];
      try {
        logEvent("terafabx_auto_job_start", { job: job.name, index, total: jobs.length });
        if (job.name === "verified-review") {
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
        if (TERAFABX_JOB_GAP_MS > 0) await sleep(TERAFABX_JOB_GAP_MS);
      }
    }
  } finally {
    maybeStartTerafabxCommentPrefill("after_scheduler");
    terafabxSchedulerBusy = false;
    terafabxSchedulerStartedAt = null;
    logEvent("terafabx_auto_queue_done", { runStartedAt });
  }
}

async function maybeRunTerafabxOwnPostReplyAutomation() {
  if (terafabxOwnPostReplySchedulerBusy || terafabxOwnPostReplyBusy || terafabxCommentPrefillBusy) return;
  terafabxOwnPostReplySchedulerBusy = true;
  try {
    const state = loadTerafabxState();
    const queue = normalizeTerafabxOwnPostReplyManualQueue(state.ownPostReplyManualQueue);
    const pendingManual = queue.find((item) => ["queued", "running"].includes(item.status));
    if (pendingManual) {
      await runNextTerafabxOwnPostReplyManualQueueItem();
      return;
    }
    const lastRunMs = state.lastOwnPostReplyRunAt ? new Date(state.lastOwnPostReplyRunAt).getTime() : 0;
    const monitoredDue = state.ownPostReplyEnabled
      && (state.ownPostReplyTargets || []).length > 0
      && !isTerafabxQuietPostingTime()
      && Date.now() - lastRunMs >= TERAFABX_OWN_POST_REPLY_INTERVAL_MS;
    if (monitoredDue) await runTerafabxOwnPostReplyAllMonitored({ manual: false });
  } catch (error) {
    logEvent("terafabx_own_post_reply_scheduler_error", { error: error.message });
  } finally {
    terafabxOwnPostReplySchedulerBusy = false;
    const state = loadTerafabxState();
    const hasMoreManual = normalizeTerafabxOwnPostReplyManualQueue(state.ownPostReplyManualQueue)
      .some((item) => ["queued", "running"].includes(item.status));
    if (hasMoreManual) setImmediate(() => maybeRunTerafabxOwnPostReplyAutomation());
  }
}

function loadTerafabxCommentMonitorState() {
  const daily = terafabxDailyCommentProgress();
  return {
    enabled: true,
    intervalMs: TERAFABX_COMMENT_MONITOR_INTERVAL_MS,
    busy: terafabxCommentMonitorBusy,
    lastRunAt: null,
    lastStatus: "idle",
    lastError: null,
    postedInWindow: 0,
    targetInWindow: Math.max(1, Math.floor(TERAFABX_COMMENT_MONITOR_INTERVAL_MS / daily.requiredIntervalMs)),
    daily,
    findings: [],
    actions: [],
    qualityFeedback: { rules: [] },
    ...readJsonFile(TERAFABX_COMMENT_MONITOR_STATE_PATH, {}),
    busy: terafabxCommentMonitorBusy,
    intervalMs: TERAFABX_COMMENT_MONITOR_INTERVAL_MS,
  };
}

function saveTerafabxCommentMonitorState(patchValue = {}) {
  const previous = loadTerafabxCommentMonitorState();
  const next = {
    ...previous,
    ...patchValue,
    busy: terafabxCommentMonitorBusy,
    intervalMs: TERAFABX_COMMENT_MONITOR_INTERVAL_MS,
  };
  writeJsonFile(TERAFABX_COMMENT_MONITOR_STATE_PATH, next);
  return next;
}

function terafabxCommentRecordTime(record) {
  for (const value of [record?.postedAt, record?.at]) {
    const time = new Date(value || 0).getTime();
    if (Number.isFinite(time) && time > 0) return time;
  }
  return 0;
}

function evaluateTerafabxCommentWorkflow(state, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const nowMs = now.getTime();
  const windowMs = Number(options.windowMs || TERAFABX_COMMENT_MONITOR_INTERVAL_MS);
  const quiet = options.quiet === undefined ? isTerafabxQuietPostingTime(now) : Boolean(options.quiet);
  const enabled = state?.commentEnabled !== false;
  const pending = pendingTerafabxCommentPosts(state || {});
  const daily = terafabxDailyCommentProgress(state || {}, now, { dailyTarget: options.dailyTarget });
  const posted = (state?.commentHistory || []).filter((item) => {
    const time = terafabxCommentRecordTime(item);
    return time >= nowMs - windowMs && time <= nowMs && Boolean(item.replyUrl || item.posted || item.status === "posted");
  });
  const target = enabled && !quiet
    ? Math.max(1, Math.floor(windowMs / daily.requiredIntervalMs))
    : 0;
  const findings = [];
  if (target > 0 && posted.length < target) {
    findings.push({
      type: "throughput_below_target",
      severity: "warning",
      actual: posted.length,
      target,
    });
  }
  if (enabled && !quiet && daily.postedToday < daily.targetByNow) {
    findings.push({
      type: "daily_pace_below_target",
      severity: "warning",
      actual: daily.postedToday,
      targetByNow: daily.targetByNow,
      dailyTarget: daily.dailyTarget,
      behindBy: daily.behindBy,
    });
  }
  const lastRunMs = new Date(state?.lastCommentRunAt || 0).getTime();
  if (state?.lastCommentStatus === "error" && Number.isFinite(lastRunMs) && lastRunMs >= nowMs - windowMs * 2) {
    findings.push({ type: "recent_comment_error", severity: "error", error: String(state.lastCommentError || "unknown") });
  }
  const oldestPendingAgeMs = pending.reduce((oldest, item) => {
    const queuedAt = new Date(item.queuedAt || item.at || 0).getTime();
    return Number.isFinite(queuedAt) && queuedAt > 0 ? Math.max(oldest, nowMs - queuedAt) : oldest;
  }, 0);
  if (!quiet && oldestPendingAgeMs > Math.max(windowMs * 1.5, daily.requiredIntervalMs * 3)) {
    findings.push({ type: "pending_queue_stalled", severity: "warning", pendingCount: pending.length, oldestPendingAgeMs });
  }
  const qualityFeedback = deriveTerafabxCommentQualityFeedback(state?.commentHistory || []);
  if (qualityFeedback.belowThresholdCount > 0) {
    findings.push({ type: "independent_judge_failures", severity: "warning", count: qualityFeedback.belowThresholdCount });
  }
  if (qualityFeedback.clicheCommentCount > 0) {
    findings.push({ type: "cliche_detected", severity: "warning", count: qualityFeedback.clicheCommentCount, matches: qualityFeedback.clicheMatches });
  }
  if (Number(options.schedulerBusyAgeMs || 0) > windowMs * 2) {
    findings.push({ type: "scheduler_stalled", severity: "error", ageMs: Number(options.schedulerBusyAgeMs) });
  }
  return {
    enabled,
    quiet,
    windowMs,
    windowStartedAt: new Date(nowMs - windowMs).toISOString(),
    checkedAt: now.toISOString(),
    postedInWindow: posted.length,
    targetInWindow: target,
    daily,
    pendingCount: pending.length,
    oldestPendingAgeMs,
    qualityFeedback,
    findings,
    status: !enabled ? "disabled" : quiet ? "quiet" : findings.length ? "degraded" : "ok",
  };
}

function shouldTerafabxCommentMonitorRequestPrefill(state = {}, evaluation = {}, options = {}) {
  const targetCount = Math.max(0, Number(options.targetCount ?? TERAFABX_COMMENT_PREFILL_TARGET) || 0);
  return Boolean(
    state.commentEnabled
    && !evaluation.daily?.reached
    && Number(evaluation.pendingCount || 0) < targetCount
    && !options.prefillBusy
    && !options.manualActionPending
  );
}

function quarantineExhaustedTerafabxPendingComments(state = loadTerafabxState()) {
  const failedAt = new Date().toISOString();
  const exhausted = [];
  const remaining = pendingTerafabxCommentPosts(state).filter((item) => {
    if (Number(item.attempts || 0) < TERAFABX_PENDING_COMMENT_MAX_ATTEMPTS) return true;
    exhausted.push({ ...item, status: "error", errorAt: failedAt, failedReason: "monitor_max_attempts" });
    return false;
  });
  if (!exhausted.length) return { count: 0, remainingCount: remaining.length };
  saveTerafabxState({
    pendingCommentPosts: remaining,
    failedPendingCommentPosts: [...exhausted, ...(state.failedPendingCommentPosts || [])].slice(0, 100),
  });
  logEvent("terafabx_comment_monitor_quarantined", { count: exhausted.length, remainingCount: remaining.length });
  return { count: exhausted.length, remainingCount: remaining.length };
}

function auditTerafabxPrefillQuality(state = loadTerafabxState(), options = {}) {
  const sinceMs = Number(options.sinceMs || TERAFABX_PREFILL_GENERICITY_ROLLOUT_AT);
  const limit = Math.max(1, Number(options.limit || 500));
  const pending = pendingTerafabxCommentPosts(state)
    .filter((item) => item?.source === "prefill");
  const posted = (state.commentHistory || [])
    .filter((item) => item?.source === "prefill")
    .filter((item) => terafabxCommentRecordTime(item) >= sinceMs);
  const seen = new Set();
  const items = [...pending, ...posted].flatMap((record) => {
    const key = `${normalizeXStatusUrl(record.targetUrl || "")}|${record.queuedAt || record.at || ""}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const policy = assessTerafabxCurrentCommentPolicy(record);
    return [{
      key,
      targetUrl: normalizeXStatusUrl(record.targetUrl || ""),
      comment: cleanSocialText(record.comment || ""),
      source: record.source,
      status: record.status || (record.posted ? "posted" : "pending"),
      queuedAt: record.queuedAt || null,
      postedAt: record.postedAt || record.at || null,
      replyUrl: record.replyUrl || null,
      score: Number.isFinite(Number(record.geminiReview?.finalJudge?.score)) ? Number(record.geminiReview.finalJudge.score) : null,
      sourceAnchor: record.geminiReview?.finalJudge?.sourceAnchor || null,
      sourceAnchorGrounded: record.geminiReview?.finalJudge?.sourceAnchorGrounded === true,
      genericityFlags: record.geminiReview?.finalJudge?.qualityFlags || {},
      ok: policy.ok,
      errors: policy.errors,
    }];
  }).slice(0, limit);
  return {
    checkedAt: new Date().toISOString(),
    since: new Date(sinceMs).toISOString(),
    checkedCount: items.length,
    passedCount: items.filter((item) => item.ok).length,
    failedCount: items.filter((item) => !item.ok).length,
    pendingCount: items.filter((item) => item.status !== "posted").length,
    postedCount: items.filter((item) => item.status === "posted").length,
    items,
  };
}

function quarantineInvalidTerafabxPrefillComments(state = loadTerafabxState()) {
  const failedAt = new Date().toISOString();
  const rejected = [];
  const remaining = pendingTerafabxCommentPosts(state).filter((item) => {
    if (item?.source !== "prefill") return true;
    const createdAt = Date.parse(item.queuedAt || item.at || "");
    if (Number.isFinite(createdAt) && createdAt < TERAFABX_PREFILL_GENERICITY_ROLLOUT_AT) return true;
    const policy = assessTerafabxCurrentCommentPolicy(item);
    if (policy.ok) return true;
    rejected.push({
      ...item,
      status: "error",
      errorAt: failedAt,
      failedReason: "monitor_prefill_quality_gate",
      lastError: policy.errors.join(","),
    });
    return false;
  });
  if (!rejected.length) return { count: 0, remainingCount: remaining.length, errors: [] };
  saveTerafabxState({
    pendingCommentPosts: remaining,
    failedPendingCommentPosts: [...rejected, ...(state.failedPendingCommentPosts || [])].slice(0, 300),
  });
  const errors = [...new Set(rejected.flatMap((item) => String(item.lastError || "").split(",").filter(Boolean)))];
  logEvent("terafabx_comment_monitor_prefill_quality_quarantined", { count: rejected.length, remainingCount: remaining.length, errors });
  return { count: rejected.length, remainingCount: remaining.length, errors };
}

async function runTerafabxCommentMonitor(options = {}) {
  if (terafabxCommentMonitorBusy) {
    return { ok: false, skipped: true, status: "skipped_busy", monitor: loadTerafabxCommentMonitorState() };
  }
  terafabxCommentMonitorBusy = true;
  const startedAt = new Date().toISOString();
  try {
    let state = loadTerafabxState();
    const quarantine = quarantineExhaustedTerafabxPendingComments(state);
    if (quarantine.count) state = loadTerafabxState();
    const prefillQualityAudit = auditTerafabxPrefillQuality(state);
    const prefillQualityQuarantine = quarantineInvalidTerafabxPrefillComments(state);
    if (prefillQualityQuarantine.count) state = loadTerafabxState();
    const schedulerStartedMs = new Date(terafabxSchedulerStartedAt || 0).getTime();
    const evaluation = evaluateTerafabxCommentWorkflow(state, {
      now: options.now,
      schedulerBusyAgeMs: terafabxSchedulerBusy && Number.isFinite(schedulerStartedMs) ? Math.max(0, Date.now() - schedulerStartedMs) : 0,
    });
    const runtime = {
      mainBusy: terafabxBusy,
      schedulerBusy: terafabxSchedulerBusy,
      schedulerStartedAt: terafabxSchedulerStartedAt,
      prefillBusy: terafabxCommentPrefillBusy,
      manualActionPending: terafabxManualActionPending,
      cdpLock: getTerafabxLockState(),
      commentXLock: getTerafabxCommentXLockState(),
    };
    const actions = [];
    if (quarantine.count) actions.push({ type: "quarantine_exhausted_pending", count: quarantine.count });
    if (prefillQualityQuarantine.count) actions.push({
      type: "quarantine_prefill_quality",
      count: prefillQualityQuarantine.count,
      errors: prefillQualityQuarantine.errors,
    });
    if (shouldTerafabxCommentMonitorRequestPrefill(state, evaluation, {
      targetCount: TERAFABX_COMMENT_PREFILL_TARGET,
      prefillBusy: terafabxCommentPrefillBusy,
      manualActionPending: terafabxManualActionPending,
    })) {
      maybeStartTerafabxCommentPrefill("comment_monitor");
      actions.push({ type: "prefill_requested", pendingCount: evaluation.pendingCount, targetCount: TERAFABX_COMMENT_PREFILL_TARGET, quiet: evaluation.quiet });
    }
    const overdue = evaluation.postedInWindow < evaluation.targetInWindow;
    if (state.commentEnabled && !evaluation.quiet && overdue && evaluation.pendingCount > 0 && !terafabxBusy && !terafabxSchedulerBusy && !terafabxManualActionPending) {
      setImmediate(() => maybeRunTerafabxCommentAutomation().catch((error) => {
        logEvent("terafabx_comment_monitor_scheduler_kick_error", { error: error.message });
      }));
      actions.push({ type: "scheduler_kicked", pendingCount: evaluation.pendingCount });
    }
    const completedAt = new Date().toISOString();
    const result = {
      ok: evaluation.status !== "degraded",
      status: evaluation.status,
      source: options.source || "timer",
      startedAt,
      completedAt,
      ...evaluation,
      runtime,
      actions,
      prefillQualityAudit,
    };
    saveTerafabxCommentMonitorState({
      lastRunAt: completedAt,
      lastStatus: result.status,
      lastError: null,
      postedInWindow: result.postedInWindow,
      targetInWindow: result.targetInWindow,
      daily: result.daily,
      pendingCount: result.pendingCount,
      findings: result.findings,
      actions,
      runtime,
      qualityFeedback: result.qualityFeedback,
      prefillQualityAudit,
    });
    logEvent("terafabx_comment_monitor_complete", result);
    return result;
  } catch (error) {
    const completedAt = new Date().toISOString();
    saveTerafabxCommentMonitorState({ lastRunAt: completedAt, lastStatus: "error", lastError: error.message });
    logEvent("terafabx_comment_monitor_error", { source: options.source || "timer", error: error.message });
    return { ok: false, status: "error", error: error.message, startedAt, completedAt };
  } finally {
    terafabxCommentMonitorBusy = false;
    saveTerafabxCommentMonitorState({});
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

function looksLikeMediaPlaybackMetadata(line) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  if (!text.includes(" · ")) return false;
  const [title, artist, ...rest] = text.split(" · ");
  if (rest.length > 0 || !title || !artist) return false;
  return /(?:음악|음원|오디오|music|audio)$/i.test(title)
    || /^(?:원본 오디오|original audio)$/i.test(title);
}

function looksLikeThreadTimestampMetadata(line) {
  const text = String(line || "").replace(/\s+/g, " ").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text);
}

function cleanDiscoveryPreviewText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  let lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 1 && looksLikeSocialHandle(lines[0])) return "";
  lines = lines.filter((line) =>
    !looksLikeSocialHandle(line)
    && !looksLikeLocationLine(line)
    && !looksLikeThreadTimestampMetadata(line)
  );
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

function cleanThreadText(raw, expectedHandle = "", ignoredLines = []) {
  const lines = String(raw || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const skipped = new Set(["로그인", "스레드", "인기순", "활동 보기", "번역하기", "번역 보기", "원본 보기", "AI 정보"]);
  const ignored = new Set((Array.isArray(ignoredLines) ? ignoredLines : [])
    .map((line) => String(line || "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter(Boolean));
  const normalizedExpectedHandle = String(expectedHandle || "").replace(/^@/, "").toLowerCase();
  const kept = [];
  for (const line of lines) {
    if (skipped.has(line)) continue;
    if (/^(?:번역하기|번역 보기|원본 보기|AI 정보)\s*[:：-]?$/.test(line)) continue;
    if (ignored.has(line.replace(/\s+/g, " ").trim().toLowerCase())) continue;
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
    if (looksLikeThreadTimestampMetadata(line)) continue;
    if (looksLikeMediaPlaybackMetadata(line)) continue;
    kept.push(line);
    if (kept.length >= 12) break;
  }
  return truncateXText(kept.join("\n"), 280);
}

function selectRootPostMediaCandidates(candidates = [], maxMedia = MAX_MEDIA) {
  const rootCandidates = candidates
    .filter((item) => item && item.rootOwned === true && item.matchesTargetPost === true)
    .filter((item) => item.src && (item.kind === "video" || /cdninstagram|fbcdn/.test(item.src)))
    .filter((item) => item.belowHandle !== false)
    .filter((item) => item.beforeRootBoundary !== false)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const firstMediaTop = rootCandidates[0]?.top;
  const mediaBand = Number.isFinite(firstMediaTop)
    ? rootCandidates.filter((item) => item.top <= firstMediaTop + 260)
    : [];
  const selectedMedia = [];
  for (const item of mediaBand) {
    if (selectedMedia.length >= maxMedia) break;
    const duplicateSlot = selectedMedia.some((existing) =>
      Math.abs(existing.top - item.top) < 8
      && Math.abs(existing.left - item.left) < 8
      && Math.abs(existing.width - item.width) < 8
      && Math.abs(existing.height - item.height) < 8
    );
    if (duplicateSlot && item.kind === "image") continue;
    selectedMedia.push(item);
  }
  return { rootCandidates, mediaBand, selectedMedia };
}

async function extractThreadPost(sourceUrl, options = {}) {
  const page = await newPage(sourceUrl);
  try {
    const expectedHandle = new URL(sourceUrl).pathname.split("/")[1].replace("@", "");
    await sleep(9000);
    const translation = await page.eval(`(() => {
      const expectedPostPath = ${JSON.stringify(new URL(sourceUrl).pathname.replace(/\/$/, ""))};
      const targetLink = Array.from(document.querySelectorAll('a[href*="/post/"]')).find((link) => {
        try {
          const path = new URL(link.href, location.href).pathname.replace(/\\\/$/, "");
          return path === expectedPostPath || path.startsWith(expectedPostPath + "/");
        } catch {
          return false;
        }
      });
      const article = targetLink?.closest('div[role="article"]') || document.querySelector('div[role="article"]') || document.body;
      const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const candidates = Array.from(article.querySelectorAll('button, [role="button"], span, div'))
        .filter(visible)
        .filter((el) => /^(?:번역하기|번역 보기|See translation)$/i.test((el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim()));
      const target = candidates.sort((a, b) => a.childElementCount - b.childElementCount)[0];
      if (!target) return { found: false, clicked: false };
      const clickable = target.closest('button, [role="button"]') || target;
      clickable.scrollIntoView({ block: "center" });
      clickable.click();
      return {
        found: true,
        clicked: true,
        label: (target.innerText || target.textContent || "").replace(/\\s+/g, " ").trim(),
      };
    })()`);
    if (translation?.clicked) {
      logEvent("threads_translation_clicked", { sourceUrl, label: translation.label || null });
      await sleep(2500);
    }
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
      const expectedPostPath = ${JSON.stringify(new URL(sourceUrl).pathname.replace(/\/$/, ""))};
      const looksLikeSocialHandle = (value) => /^@?[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9_])$/i.test((value || "").trim());
      const targetLink = Array.from(document.querySelectorAll('a[href*="/post/"]')).find((link) => {
        try {
          const path = new URL(link.href, location.href).pathname.replace(/\\\/$/, "");
          return path === expectedPostPath || path.startsWith(expectedPostPath + "/");
        } catch {
          return false;
        }
      });
      const article = targetLink?.closest('div[role="article"]') || document.querySelector('div[role="article"]') || document.body;
      const rectOk = (el) => {
        const r = el.getBoundingClientRect();
        return r.width >= 120 && r.height >= 120;
      };
      const handleNode = Array.from(article.querySelectorAll("span, a, div"))
        .find((el) => (el.innerText || "").trim().replace(/^@/, "") === expectedHandle);
      const handleRect = handleNode ? handleNode.getBoundingClientRect() : null;
      const rootBoundaryNode = Array.from(document.querySelectorAll("button, [role=button], span, div"))
        .filter((el) => {
          const r = el.getBoundingClientRect();
          if (!(r.width || r.height) || (handleRect && r.top <= handleRect.bottom)) return false;
          const text = (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
          return text.length <= 120 && (/^(?:활동 보기|View activity)$/i.test(text) || /님에게 답글 남기기|Reply to /i.test(text));
        })
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.childElementCount - b.childElementCount)[0] || null;
      const rootBoundaryTop = rootBoundaryNode ? rootBoundaryNode.getBoundingClientRect().top : null;
      const mediaInfo = (el, kind) => {
        const r = el.getBoundingClientRect();
        const ownerArticle = el.closest('div[role="article"]');
        const closestPostLink = el.closest('a[href*="/post/"]');
        let matchesTargetPost = true;
        if (closestPostLink) {
          try {
            const path = new URL(closestPostLink.href, location.href).pathname.replace(/\\\/$/, "");
            matchesTargetPost = path === expectedPostPath || path.startsWith(expectedPostPath + "/");
          } catch {
            matchesTargetPost = false;
          }
        }
        return {
          kind,
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          src: kind === "video" ? (el.currentSrc || el.src) : (el.currentSrc || el.src),
          rootOwned: article === document.body
            ? !ownerArticle && Number.isFinite(rootBoundaryTop) && r.top < rootBoundaryTop
            : ownerArticle === article,
          matchesTargetPost,
          belowHandle: !handleRect || r.top > handleRect.bottom,
          beforeRootBoundary: !Number.isFinite(rootBoundaryTop) || r.top < rootBoundaryTop,
        };
      };
      const rawMedia = [
        ...Array.from(article.querySelectorAll("video")).map((el) => mediaInfo(el, "video")),
        ...Array.from(article.querySelectorAll("img")).filter(rectOk).map((el) => mediaInfo(el, "image")),
      ];
      const mediaSelection = (${selectRootPostMediaCandidates.toString()})(rawMedia, ${MAX_MEDIA});
      const allMedia = mediaSelection.rootCandidates;
      const mediaBand = mediaSelection.mediaBand;
      const getPostText = () => {
        const text = article.innerText || "";
        const lines = text.split("\\n").map((line) => line.trim()).filter(Boolean);
        const mediaAttributionSet = new Set(mediaAttributionLabels.map((line) => line.toLowerCase()));
        const handleIndex = lines.findIndex((line) => /^@?[^\\s]+$/.test(line) && line.replace(/^@/, "") === "${new URL(sourceUrl).pathname.split("/")[1].replace("@", "")}");
        const start = handleIndex >= 0 ? handleIndex + 1 : 0;
        const out = [];
        for (let i = start; i < lines.length; i++) {
          const line = lines[i];
          if (/^\\d+$/.test(line) && out.length > 0) break;
          if (/^\\d+[.,]?\\d*[천만]?$/.test(line) && out.length > 0) break;
          if (/^\\d+\\s*(초|분|시간|일)$/.test(line)) continue;
          if (/^\\d+\\s*(초|분|시간|일)전?$/.test(line)) continue;
          if (/^\\d{4}-\\d{2}-\\d{2}$/.test(line)) continue;
          if (mediaAttributionSet.has(line.toLowerCase())) continue;
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
      const topicLabels = Array.from(article.querySelectorAll('a[href*="serp_type=tags"]'))
        .map((link) => (link.innerText || link.textContent || "").replace(/\\s+/g, " ").trim())
        .filter(Boolean);
      const mediaPlayerLabels = Array.from(article.querySelectorAll('a[href*="/audio/"], a[href*="/music/"]'))
        .map((link) => (link.innerText || link.textContent || "").replace(/\\s+/g, " ").trim())
        .filter(Boolean);
      const mediaAttributionLinks = Array.from(article.querySelectorAll('a[href*="/post/"]'))
        .map((link) => {
          const label = (link.innerText || link.textContent || "").replace(/\\s+/g, " ").trim();
          let path = "";
          try { path = new URL(link.href, location.href).pathname.replace(/\\\/$/, ""); } catch {}
          let parent = link.parentElement;
          let insideMediaCard = false;
          for (let depth = 0; depth < 6 && parent && parent !== article; depth += 1, parent = parent.parentElement) {
            if (parent.querySelector('video, img')) {
              insideMediaCard = true;
              break;
            }
          }
          return { label, href: link.href || "", path, insideMediaCard };
        })
        .filter((item) => item.label && looksLikeSocialHandle(item.label))
        .filter((item) => item.path && item.path !== expectedPostPath && !item.path.startsWith(expectedPostPath + "/"))
        .filter((item) => item.insideMediaCard);
      const mediaAttributionLabels = mediaAttributionLinks.map((item) => item.label);
      const timestampLabels = Array.from(article.querySelectorAll('time'))
        .flatMap((time) => [time.innerText, time.textContent, time.getAttribute('aria-label'), time.getAttribute('title')])
        .map((label) => String(label || "").replace(/\\s+/g, " ").trim())
        .filter(Boolean);
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
      const selectedMedia = mediaSelection.selectedMedia;
      const videos = mediaBand.filter((item) => item.kind === "video").map((item) => item.src);
      const images = mediaBand.filter((item) => item.kind === "image").map((item) => item.src);
      const links = Array.from(article.querySelectorAll("a[href]"))
        .map((a) => a.href)
        .filter((href) => href && !href.includes("threads.com") && !href.includes("instagram.com"))
        .slice(0, 3);
      return {
        text: getPostText(),
        topicLabels,
        mediaPlayerLabels,
        mediaAttributionLabels,
        timestampLabels,
        selectedMedia: selectedMedia.map((item) => ({ kind: item.kind, src: item.src })),
        actionCounts: getActionCounts(),
        videos,
        images,
        links,
        diagnostics: {
          handleFound: Boolean(handleRect),
          targetArticleFound: article !== document.body,
          mediaAttributions: mediaAttributionLinks.map((item) => ({ label: item.label, href: item.href })),
          rootBoundaryFound: Number.isFinite(rootBoundaryTop),
          rootBoundaryTop: Number.isFinite(rootBoundaryTop) ? Math.round(rootBoundaryTop) : null,
          rawMediaCandidateCount: rawMedia.length,
          rejectedNestedMediaCount: rawMedia.filter((item) => !item.rootOwned || !item.matchesTargetPost).length,
          mediaCandidateCount: allMedia.length,
          mediaBandCount: mediaBand.length,
          mediaCandidates: allMedia.slice(0, 8).map((item) => ({
            kind: item.kind,
            top: Math.round(item.top),
            width: Math.round(item.width),
            height: Math.round(item.height),
            rootOwned: item.rootOwned,
            matchesTargetPost: item.matchesTargetPost,
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
    let text = cleanThreadText(data.text, expectedHandle, [
      ...(data.topicLabels || []),
      ...(data.mediaPlayerLabels || []),
      ...(data.mediaAttributionLabels || []),
      ...(data.timestampLabels || []),
    ]);
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
        translation,
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
  const currentUrl = await page.evalFast("location.href", 5000).catch(() => "");
  const verifyUrls = currentUrl && currentUrl !== "about:blank"
    ? [currentUrl, `https://x.com/${REQUIRED_X_HANDLE}`]
    : [`https://x.com/${REQUIRED_X_HANDLE}`];
  for (const url of verifyUrls) {
    if (url !== currentUrl) await page.navigate(url, 5000).catch(() => {});
    for (let attempt = 0; attempt < 12; attempt += 1) {
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
      if (!accountState.bodyText && attempt === 4) {
        await page.send("Page.reload", { ignoreCache: true }, 12000).catch(() => null);
        logEvent("x_account_verify_blank_reload", { required: REQUIRED_X_HANDLE, url: accountState.url || url });
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

async function verifyComposerText(page, expectedText, stage = "compose", eventLogger = logEvent) {
  const expected = String(expectedText || "").replace(/\s+/g, " ").trim();
  if (!expected) return { ok: true, actual: "" };
  const state = await page.eval(`(() => {
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const submitButtons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')).filter(visible);
    const activeSubmit = submitButtons[0] || null;
    const activeScope = activeSubmit?.closest('[role="dialog"]') || activeSubmit?.parentElement?.closest('[role="dialog"]') || document;
    const boxes = Array.from(document.querySelectorAll('[data-testid="tweetTextarea_0"]'));
    const candidates = boxes.map((box, index) => ({
      index,
      visible: visible(box),
      active: activeScope === document ? visible(box) : activeScope.contains(box),
      text: (box?.innerText || box?.textContent || "").replace(/\\s+/g, " ").trim(),
    }));
    const activeCandidates = candidates.filter((candidate) => candidate.active);
    const visibleCandidates = activeCandidates.filter((candidate) => candidate.visible);
    const best =
      visibleCandidates.find((candidate) => candidate.text) ||
      activeCandidates.find((candidate) => candidate.text) ||
      visibleCandidates[0] ||
      activeCandidates[0] ||
      null;
    return {
      found: activeCandidates.length > 0,
      text: best?.text || "",
      candidates: candidates.slice(0, 8),
      bodyText: (document.body.innerText || "").slice(0, 1000),
    };
  })()`);
  const candidates = Array.isArray(state?.candidates) ? state.candidates : [];
  const activeCandidates = candidates.some((candidate) => candidate?.active === true)
    ? candidates.filter((candidate) => candidate?.active === true)
    : candidates;
  const visibleCandidates = activeCandidates.filter((candidate) => candidate?.visible);
  const searchableCandidates = visibleCandidates.length ? visibleCandidates : activeCandidates;
  const expectedPrefix = expected.slice(0, Math.min(80, expected.length));
  const matchedCandidate = searchableCandidates
    .map((candidate) => ({
      ...candidate,
      text: String(candidate?.text || "").replace(/\s+/g, " ").trim(),
    }))
    .find((candidate) => candidate.text.includes(expectedPrefix));
  const actual = String(matchedCandidate?.text || state?.text || "").replace(/\s+/g, " ").trim();
  const ok = Boolean(state?.found) && Boolean(matchedCandidate || actual.includes(expectedPrefix));
  eventLogger("x_compose_text_verified", {
    stage,
    ok,
    expectedLength: expected.length,
    actualLength: actual.length,
    expectedPreview: expected.slice(0, 120),
    actualPreview: actual.slice(0, 120),
    candidateCount: candidates.length,
    visibleCandidateCount: visibleCandidates.length,
  });
  if (!ok) {
    throw new Error(`X 작성창 텍스트 입력 검증 실패(${stage}): expected=${JSON.stringify(expected.slice(0, 80))}, actual=${JSON.stringify(actual.slice(0, 120))}`);
  }
  return { ok: true, actual };
}

async function insertXComposerText(page, text, stage = "compose") {
  await page.eval(`(() => {
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const submitButtons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')).filter(visible);
    const activeSubmit = submitButtons[0] || null;
    const activeScope = activeSubmit?.closest('[role="dialog"]') || activeSubmit?.parentElement?.closest('[role="dialog"]') || document;
    const boxes = Array.from(activeScope.querySelectorAll('[data-testid="tweetTextarea_0"]'));
    const box = boxes.find(visible) || boxes[0] || null;
    if (!box) return false;
    box.click();
    box.focus();
    return true;
  })()`);
  await page.send("Input.insertText", { text });
  await sleep(1000);
  try {
    return await verifyComposerText(page, text, `${stage}_cdp`);
  } catch (error) {
    logEvent("x_compose_text_insert_fallback", { stage, reason: error.message });
  }
  await page.eval(`((text) => {
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const submitButtons = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')).filter(visible);
    const activeSubmit = submitButtons[0] || null;
    const activeScope = activeSubmit?.closest('[role="dialog"]') || activeSubmit?.parentElement?.closest('[role="dialog"]') || document;
    const boxes = Array.from(activeScope.querySelectorAll('[data-testid="tweetTextarea_0"]'));
    const box = boxes.find(visible) || boxes[0] || null;
    if (!box) return false;
    box.click();
    box.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(box);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("delete");
    document.execCommand("insertText", false, text);
    box.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    box.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  })(${JSON.stringify(text)})`);
  await sleep(1000);
  return verifyComposerText(page, text, `${stage}_fallback`);
}

async function ensureComposerText(page, expectedText, stage = "compose", eventLogger = logEvent) {
  try {
    return await verifyComposerText(page, expectedText, stage, eventLogger);
  } catch (error) {
    eventLogger("x_compose_text_repair_start", { stage, reason: error.message });
    await insertXComposerText(page, expectedText, `${stage}_repair`);
    return verifyComposerText(page, expectedText, `${stage}_repair_verified`, eventLogger);
  }
}

function normalizeXScheduledText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function xScheduledTitleFingerprint(value) {
  return normalizeXScheduledText(value)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function xScheduledTimeNeedles(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return [];
  const parts = Object.fromEntries(new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const hour24 = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));
  const hour12 = hour24 % 12 || 12;
  const dayPeriod = hour24 < 12 ? "오전" : "오후";
  return [
    `${parts.year}년 ${Number(parts.month)}월 ${Number(parts.day)}일`,
    `${dayPeriod} ${hour12}:${parts.minute}에 전송 예정`,
  ];
}

function assessXScheduledEntry(expected, entry) {
  if (!entry) return { status: "missing", titlePresent: false, blankTitle: false };
  const rawText = String(entry.text || entry.rawText || "");
  const normalizedRaw = normalizeXScheduledText(rawText);
  const expectedTitle = normalizeXScheduledText(expected.text || expected.textPreview || "");
  const expectedFingerprint = xScheduledTitleFingerprint(expectedTitle);
  const rawFingerprint = xScheduledTitleFingerprint(rawText);
  const expectedIsoDates = new Set(expectedTitle.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []);
  const unexpectedIsoDate = (rawText.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])
    .find((value) => !expectedIsoDates.has(value));
  const titlePresent = Boolean(expectedTitle) && (
    normalizedRaw.includes(expectedTitle)
    || (expectedFingerprint.length >= 2 && rawFingerprint.includes(expectedFingerprint))
  );
  const contentLines = rawText.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/전송 예정|scheduled for|will send on/i.test(line))
    .filter((line) => !/^\d{1,2}:\d{2}$/.test(line))
    .filter((line) => !/^(?:사진|이미지|image|video|gif)$/i.test(line));
  const blankTitle = xScheduledTitleFingerprint(contentLines.join(" ")).length === 0;
  const expectsMediaOnly = !expectedTitle && Number(expected.mediaCount || 0) > 0;
  return {
    status: expectsMediaOnly
      ? blankTitle && !unexpectedIsoDate ? "ok" : "title_mismatch"
      : titlePresent && !unexpectedIsoDate ? "ok" : blankTitle ? "title_missing" : "title_mismatch",
    titlePresent,
    blankTitle,
    expectsMediaOnly,
    unexpectedIsoDate: unexpectedIsoDate || null,
    actualText: contentLines.join("\n"),
    rawText,
  };
}

function shouldAutoRecoverXScheduledAnomaly(item, actualCount, expectedCount, nowMs = Date.now()) {
  return item?.type === "missing"
    && item?.persistent === true
    && Number(actualCount) < Number(expectedCount)
    && new Date(item.scheduledAt || 0).getTime() > nowMs + 5 * 60 * 1000;
}

async function readXScheduledEntries(page) {
  await page.navigate("https://x.com/compose/post/unsent/scheduled", 5000);
  await waitForXPageReady(page, "schedule", { attempts: 20, intervalMs: 750, allowReload: true });
  const entries = new Map();
  for (let pass = 0; pass < 8; pass += 1) {
    const batch = await page.eval(`(() => {
      const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const rows = Array.from(document.querySelectorAll('[role="button"]'))
        .filter(visible)
        .map((el) => ({ text: (el.innerText || el.textContent || "").trim() }))
        .filter((row) => /전송 예정|scheduled for|will send on/i.test(row.text));
      const dialog = document.querySelector('[role="dialog"]') || document;
      const scrollables = Array.from(dialog.querySelectorAll('*')).filter((el) => el.scrollHeight > el.clientHeight + 20);
      const scroller = scrollables.sort((a, b) => b.scrollHeight - a.scrollHeight)[0] || null;
      const before = scroller?.scrollTop || 0;
      if (scroller) scroller.scrollTop = Math.min(scroller.scrollHeight, before + Math.max(scroller.clientHeight, 500));
      return { rows, before, after: scroller?.scrollTop || 0, max: scroller ? scroller.scrollHeight - scroller.clientHeight : 0 };
    })()`);
    for (const row of batch.rows || []) entries.set(normalizeXScheduledText(row.text), row);
    if (!batch.max || batch.after >= batch.max || batch.after === batch.before) break;
    await sleep(700);
  }
  return Array.from(entries.values());
}

function findXScheduledEntry(entries, scheduledAt) {
  const needles = xScheduledTimeNeedles(scheduledAt).map(normalizeXScheduledText);
  return (entries || []).find((entry) => {
    const text = normalizeXScheduledText(entry.text || entry.rawText || "");
    return needles.length > 0 && needles.every((needle) => text.includes(needle));
  }) || null;
}

async function openXScheduledEntry(page, scheduledAt) {
  const needles = xScheduledTimeNeedles(scheduledAt);
  const clicked = await page.eval(`((needles) => {
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const normalizedNeedles = needles.map(normalize);
    const rows = Array.from(document.querySelectorAll('[role="button"]')).filter(visible);
    const row = rows.find((el) => {
      const text = normalize(el.innerText || el.textContent || "");
      return normalizedNeedles.every((needle) => text.includes(needle));
    });
    if (!row) return false;
    row.click();
    return true;
  })(${JSON.stringify(needles)})`);
  if (!clicked) throw new Error(`X 예약 항목을 열지 못했습니다: ${needles.join(" / ")}`);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = await page.eval(`(() => {
      const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      return Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible).some((dialog) =>
        dialog.querySelector('[data-testid="tweetTextarea_0"]')
        && dialog.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')
      );
    })()`);
    if (ready) return;
    await sleep(250);
  }
  throw new Error(`X 예약 편집 모달이 열리지 않았습니다: ${needles.join(" / ")}`);
}

async function deleteXScheduledEntry(page, scheduledAt) {
  const needles = xScheduledTimeNeedles(scheduledAt);
  const beforeEntries = await readXScheduledEntries(page);
  if (!findXScheduledEntry(beforeEntries, scheduledAt)) {
    throw new Error(`X 예약 목록에서 취소할 항목을 찾지 못했습니다: ${needles.join(" / ")}`);
  }
  const selected = await page.eval(`((needles) => {
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(visible);
    const edit = buttons.find((el) => /^(?:수정|Edit)$/i.test(normalize(el.innerText || el.textContent || el.getAttribute('aria-label'))));
    if (!edit) return { ok: false, stage: "edit_button" };
    edit.click();
    return { ok: true };
  })(${JSON.stringify(needles)})`);
  if (!selected?.ok) throw new Error("X 예약 목록의 수정 버튼을 찾지 못했습니다.");
  await sleep(700);
  const checked = await page.eval(`((needles) => {
    const normalize = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const normalizedNeedles = needles.map(normalize);
    const boxes = Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"]'));
    const target = boxes.find((el) => {
      const describedBy = el.getAttribute('aria-describedby');
      const describedText = describedBy ? document.getElementById(describedBy)?.innerText : "";
      const innerLabel = el.closest('label');
      const rowLabel = innerLabel?.parentElement?.closest('label') || innerLabel;
      const text = normalize(el.getAttribute('aria-label') || describedText || rowLabel?.innerText || el.parentElement?.innerText || "");
      return normalizedNeedles.every((needle) => text.includes(needle));
    });
    if (!target) return false;
    const innerLabel = target.closest('label');
    const rowLabel = innerLabel?.parentElement?.closest('label') || innerLabel;
    (rowLabel || target).click();
    return true;
  })(${JSON.stringify(needles)})`);
  if (!checked) throw new Error(`X 예약 취소 체크박스를 찾지 못했습니다: ${needles.join(" / ")}`);
  await sleep(500);
  const deleteClicked = await page.eval(`(() => {
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(visible);
    const target = buttons.find((el) => {
      const text = String(el.innerText || el.textContent || el.getAttribute('aria-label') || "").replace(/\\s+/g, " ").trim();
      return /^(?:삭제하기|Delete)$/i.test(text) && el.getAttribute('aria-disabled') !== 'true' && !el.disabled;
    });
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!deleteClicked) throw new Error("X 예약 취소 삭제 버튼이 활성화되지 않았습니다.");
  await sleep(700);
  const confirmed = await page.eval(`(() => {
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const direct = Array.from(document.querySelectorAll('[data-testid="confirmationSheetConfirm"]')).find(visible);
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(visible);
    const scope = dialogs[dialogs.length - 1] || document;
    const fallback = Array.from(scope.querySelectorAll('button, [role="button"]')).filter(visible).find((el) => {
      const text = String(el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim();
      return /^(?:삭제|Delete)$/i.test(text);
    });
    const target = direct || fallback;
    if (!target) return false;
    target.click();
    return true;
  })()`);
  if (!confirmed) throw new Error("X 예약 취소 확인 버튼을 찾지 못했습니다.");
  await sleep(2500);
  const afterEntries = await readXScheduledEntries(page);
  if (findXScheduledEntry(afterEntries, scheduledAt)) {
    throw new Error(`X 예약 취소 사후 검증 실패: ${needles.join(" / ")}`);
  }
  return { beforeCount: beforeEntries.length, afterCount: afterEntries.length };
}

async function removeUnexpectedComposerMedia(page) {
  let removed = 0;
  for (let attempt = 0; attempt < MAX_MEDIA + 2; attempt += 1) {
    const state = await getComposerState(page);
    if (state.attachmentCount <= 0) return { removed, attachmentCount: 0 };
    const clicked = await page.eval(`(() => {
      const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const submit = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')).find(visible);
      const scope = submit?.closest('[role="dialog"]') || document;
      const buttons = Array.from(scope.querySelectorAll('button, [role="button"]')).filter(visible);
      const target = buttons.find((button) => {
        const label = [button.getAttribute('aria-label'), button.getAttribute('data-testid'), button.innerText]
          .filter(Boolean).join(' ');
        return /remove media|remove attachment|media-remove|미디어 (?:제거|삭제)|첨부.*삭제/i.test(label);
      });
      if (!target) return false;
      target.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`X 예약글의 잘못 첨부된 미디어 제거 버튼을 찾지 못했습니다: ${JSON.stringify(state)}`);
    removed += 1;
    await sleep(700);
  }
  const finalState = await getComposerState(page);
  if (finalState.attachmentCount > 0) throw new Error(`X 예약글 미디어 제거가 완료되지 않았습니다: ${JSON.stringify(finalState)}`);
  return { removed, attachmentCount: 0 };
}

async function repairXScheduledEntry(page, expected, assessment) {
  await openXScheduledEntry(page, expected.scheduledAt || expected.scheduledPostAt);
  const before = await getComposerState(page);
  logEvent("x_schedule_monitor_editor_state", {
    canonicalUrl: expected.canonicalUrl || null,
    scheduledAt: expected.scheduledAt || expected.scheduledPostAt || null,
    expectedMediaCount: Number(expected.mediaCount || 0),
    attachmentCount: before.attachmentCount,
    removeControls: before.removeControls,
  });
  let titleRepaired = false;
  let removedMedia = 0;
  if (assessment?.blankTitle) {
    await insertXComposerText(page, expected.text || expected.textPreview, "schedule_monitor_title_repair");
    titleRepaired = true;
  }
  if (Number(expected.mediaCount || 0) === 0 && before.attachmentCount > 0) {
    const removed = await removeUnexpectedComposerMedia(page);
    removedMedia = removed.removed;
  }
  if (!titleRepaired && removedMedia === 0) {
    await page.navigate("https://x.com/compose/post/unsent/scheduled", 2500);
    return { changed: false, titleRepaired, removedMedia };
  }
  await ensureComposerText(page, expected.text || expected.textPreview, "schedule_monitor_before_save");
  const ready = await waitForPostButton(page, Number(expected.mediaCount || 0));
  if (!ready.ok) throw new Error(`X 예약글 개선 저장 버튼이 비활성입니다: ${ready.reason}`);
  const submitted = await page.eval(`(() => {
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const button = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'))
      .filter(visible).find((el) => el.getAttribute('aria-disabled') !== 'true' && !el.disabled);
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!submitted) throw new Error("X 예약글 개선 내용을 저장하지 못했습니다.");
  await sleep(4000);
  return { changed: true, titleRepaired, removedMedia };
}

async function verifyScheduledPostSubmission(page, expected) {
  let last = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const entries = await readXScheduledEntries(page);
    const entry = findXScheduledEntry(entries, expected.scheduledAt);
    const assessment = assessXScheduledEntry(expected, entry);
    last = { entry, assessment };
    if (assessment.status === "ok") {
      if (Number(expected.mediaCount || 0) === 0) {
        const repair = await repairXScheduledEntry(page, expected, assessment);
        if (repair.changed) continue;
      }
      logEvent("x_schedule_post_submit_verified", {
        scheduledAt: new Date(expected.scheduledAt).toISOString(),
        titlePreview: String(expected.text || "").slice(0, 120),
        mediaCount: Number(expected.mediaCount || 0),
      });
      return { ok: true, assessment };
    }
    if (assessment.status === "title_missing") {
      const repair = await repairXScheduledEntry(page, expected, assessment);
      logEvent("x_schedule_post_submit_repaired", { scheduledAt: new Date(expected.scheduledAt).toISOString(), ...repair });
      continue;
    }
    await sleep(3000);
  }
  throw new Error(`X 예약 사후 검증 실패: ${JSON.stringify({
    scheduledAt: new Date(expected.scheduledAt).toISOString(),
    status: last?.assessment?.status,
    actualText: last?.assessment?.actualText,
  })}`);
}

async function postToX(threadPost, mediaFiles, options = {}) {
  return withMirrorChromeLock(options.schedule ? "mirror_schedule" : "mirror_post", async () => {
    const page = await newPage(`https://x.com/${REQUIRED_X_HANDLE}`);
    try {
      await verifyXAccount(page);
      await page.navigate("https://x.com/compose/post", 5000);
      await waitForComposer(page);
      if (String(threadPost.text || "").trim()) {
        await insertXComposerText(page, threadPost.text, "after_text_insert");
      }

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
        if (String(threadPost.text || "").trim()) {
          await ensureComposerText(page, threadPost.text, "after_schedule_set");
        }
      }

      if (String(threadPost.text || "").trim()) {
        await ensureComposerText(page, threadPost.text, scheduledAt ? "before_schedule_submit" : "before_post_submit");
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
      if (scheduledAt) {
        await verifyScheduledPostSubmission(page, {
          scheduledAt,
          text: threadPost.text,
          mediaCount: mediaFiles.length,
        });
        recordScheduleSlot(scheduledAt);
      }
      let postUrl = null;
      if (!scheduledAt) {
        const verifyText = String(threadPost.text || "").slice(0, 80);
        if (!verifyText) {
          logEvent("x_video_only_post_url_lookup_skipped", { mediaCount: mediaFiles.length });
          return { scheduledAt, postUrl: null };
        }
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
    const page = await newPage(`https://x.com/${REQUIRED_X_HANDLE}`);
    try {
      await verifyXAccount(page);
      await page.navigate("https://x.com/compose/post", 5000);
      await waitForComposer(page);
      await page.eval(`(() => {
        const box = document.querySelector('[data-testid="tweetTextarea_0"]');
        box.focus();
        return true;
      })()`);
      await insertXComposerText(page, threadPost.text, "draft_after_text_insert");

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

function removeScheduleSlot(scheduledAt) {
  const target = new Date(scheduledAt || 0).toISOString();
  const slots = loadScheduleSlots();
  saveScheduleSlots(slots.filter((entry) => {
    try {
      return new Date(entry.scheduledAt).toISOString() !== target;
    } catch {
      return true;
    }
  }));
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

function removeCompletedMirror(canonicalUrl) {
  saveMirrorHistory(loadMirrorHistory().filter((item) => item.canonicalUrl !== canonicalUrl));
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
  const allowTextOnly = options.allowTextOnly === true && !isDiscoveryPlaceholderText(textPreview);
  if (post.mediaUrls.length <= 0 && !allowTextOnly) {
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
      hasMedia: post.mediaUrls.length > 0,
      textOnly: post.mediaUrls.length === 0,
      mediaOnly: !String(post.text || "").trim() && post.mediaUrls.length > 0,
      shortHook: assessment.isShortHook,
      strongMedia: assessment.hasStrongMedia,
      controversy: assessment.hasControversy,
      reasons: assessment.reasons,
    }),
  }]);
  logEvent("share_added_to_discovery", { canonicalUrl, likeCount, mediaCount: post.mediaUrls.length, textOnly: post.mediaUrls.length === 0, ...saved });
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

async function cancelDiscoveryScheduledPost(canonicalUrl) {
  const url = validateThreadsUrl(canonicalUrl);
  const db = await getDiscoveryDb();
  const row = await db.prepare(`
    SELECT canonical_url AS canonicalUrl, status, scheduled_post_at AS scheduledPostAt,
      media_count AS mediaCount
    FROM thread_discoveries
    WHERE canonical_url = ?
  `).get(url);
  if (!row || row.status !== "scheduled" || !row.scheduledPostAt) {
    throw new Error("취소할 예약 항목을 찾지 못했습니다.");
  }
  const scheduledAt = new Date(row.scheduledPostAt);
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    throw new Error("미래 예약글만 취소할 수 있습니다.");
  }
  await db.prepare(`
    UPDATE thread_discoveries
    SET status = 'cancelling_schedule', last_error = NULL
    WHERE canonical_url = ? AND status = 'scheduled'
  `).run(url);
  try {
    const verification = await withMirrorChromeLock("dashboard_schedule_cancel", async () => {
      const page = await newPage(`https://x.com/${REQUIRED_X_HANDLE}`);
      try {
        await verifyXAccount(page);
        return await deleteXScheduledEntry(page, scheduledAt);
      } finally {
        await page.close();
        logEvent("x_tab_closed", { source: "dashboard_schedule_cancel" });
      }
    });
    await db.prepare(`
      UPDATE thread_discoveries
      SET status = 'review', scheduled_post_at = NULL, posted_at = NULL, last_error = NULL
      WHERE canonical_url = ? AND status = 'cancelling_schedule'
    `).run(url);
    removeCompletedMirror(url);
    removeScheduleSlot(scheduledAt);
    removeScheduledReplyItem(url);
    logEvent("discovery_schedule_cancelled", {
      canonicalUrl: url,
      scheduledAt: scheduledAt.toISOString(),
      ...verification,
    });
    return {
      canonicalUrl: url,
      scheduledAt: scheduledAt.toISOString(),
      status: "review",
      ...verification,
    };
  } catch (error) {
    await db.prepare(`
      UPDATE thread_discoveries
      SET status = 'scheduled', last_error = ?
      WHERE canonical_url = ? AND status = 'cancelling_schedule'
    `).run(`예약 취소 실패: ${error.message}`, url);
    throw error;
  }
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

async function reinspectScheduledDiscoverySource(canonicalUrl) {
  const url = validateThreadsUrl(canonicalUrl);
  const db = await getDiscoveryDb();
  const row = await db.prepare(`
    SELECT canonical_url AS canonicalUrl, status, criteria
    FROM thread_discoveries
    WHERE canonical_url = ?
  `).get(url);
  if (!row || row.status !== "scheduled") throw new Error("재검사할 예약 항목을 찾지 못했습니다.");
  const post = await withMirrorChromeLock("scheduled_source_reinspect", () => extractThreadPost(url, { allowEmptyText: true }));
  if (!String(post.text || "").trim() && post.mediaUrls.length === 0) {
    throw new Error("예약 원문의 텍스트와 미디어를 모두 확인하지 못했습니다.");
  }
  const criteria = {
    ...parseDiscoveryCriteria(row.criteria),
    hasMedia: post.mediaUrls.length > 0,
    textOnly: post.mediaUrls.length === 0,
    mediaOnly: !String(post.text || "").trim() && post.mediaUrls.length > 0,
    sourceReinspectedAt: new Date().toISOString(),
    extractionDiagnostics: post.diagnostics,
  };
  await db.prepare(`
    UPDATE thread_discoveries
    SET text_preview = ?, media_preview_url = ?, media_count = ?, criteria = ?, last_error = NULL
    WHERE canonical_url = ? AND status = 'scheduled'
  `).run(post.text.slice(0, 240) || "(본문 없음)", post.mediaUrls[0] || "", post.mediaUrls.length, JSON.stringify(criteria), url);
  logEvent("scheduled_source_reinspected", {
    canonicalUrl: url,
    textPreview: post.text.slice(0, 120),
    mediaCount: post.mediaUrls.length,
    diagnostics: post.diagnostics,
  });
  return { canonicalUrl: url, text: post.text, mediaCount: post.mediaUrls.length, diagnostics: post.diagnostics };
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
    const visible = (el) => Boolean(el) && (el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const activeSubmit = Array.from(document.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')).find(visible);
    const scope = activeSubmit?.closest('[role="dialog"]') || document;
    const primaryAttachmentNodes = Array.from(scope.querySelectorAll(
      '[data-testid="attachments"] img, [data-testid="attachments"] video, [data-testid="media"] img, [data-testid="media"] video'
    ));
    const fallbackAttachmentNodes = Array.from(scope.querySelectorAll('img, video')).filter((node) => {
      const r = node.getBoundingClientRect();
      const src = node.currentSrc || node.src || "";
      return r.width >= 80 && r.height >= 80
        && /^(?:blob:)|twimg[.]com[/]media|cdninstagram|fbcdn/i.test(src)
        && !/profile_images|emoji/i.test(src);
    });
    const attachmentNodes = Array.from(new Set([...primaryAttachmentNodes, ...fallbackAttachmentNodes]));
    const busyNodes = Array.from(scope.querySelectorAll('[role="progressbar"], [aria-busy="true"]'));
    const busy = busyNodes.some((node) => {
      const text = node.innerText || node.getAttribute("aria-label") || "";
      return !/트렌드|timeline|feed/i.test(text);
    });
    const errorText = Array.from(scope.querySelectorAll('[role="alert"]'))
      .map((el) => el.innerText)
      .filter((text) => text && !/게시물을 전송했습니다|posted|sent/i.test(text))
      .filter(Boolean)
      .join("\\n");
    const readyText = /준비 완료|ready|uploaded|업로드 완료/i.test(scope.innerText || "");
    const activePostButton = Array.from(scope.querySelectorAll('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]'))
      .filter(visible)
      .some((btn) => btn.getAttribute("aria-disabled") !== "true" && !btn.disabled);
    return {
      busy,
      errorText,
      readyText,
      activePostButton,
      attachmentCount: attachmentNodes.length,
      attachmentKinds: attachmentNodes.map((node) => node.tagName.toLowerCase()),
      removeControls: Array.from(scope.querySelectorAll('button, [role="button"]')).map((node) => ({
        label: node.getAttribute('aria-label') || "",
        testid: node.getAttribute('data-testid') || "",
        text: (node.innerText || "").trim(),
      })).filter((item) => /remove|삭제|제거|media/i.test(item.label + " " + item.testid + " " + item.text)).slice(0, 12),
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
    allowEmptyText: true,
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
  if (!String(threadPost.text || "").trim() && threadPost.mediaUrls.length === 0) {
    throw new Error("Threads 원글에서 본문과 미디어를 모두 찾지 못해 게시를 중단했습니다.");
  }
  if (options.textOverride && String(options.textOverride).trim()) {
    threadPost.text = truncateXText(options.textOverride, 280);
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

function shouldMarkDiscoveryScheduleFailed(error) {
  return !(error instanceof DuplicateMirrorError);
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

function parseDiscoveryCriteria(value) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    return {};
  }
}

function isDiscoveryAutoScheduleSource(source) {
  return /auto[_-]?schedule/i.test(String(source || ""));
}

function discoveryRowTimestamp(value) {
  const text = String(value || "").trim();
  if (!text) return NaN;
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text) ? text : `${text.replace(" ", "T")}Z`).getTime();
}

function shouldRecoverDiscoveryPlaceholder(row, nowMs = Date.now()) {
  const criteria = parseDiscoveryCriteria(row?.criteria);
  const discoveredAt = discoveryRowTimestamp(row?.discoveredAt);
  const ageMs = nowMs - discoveredAt;
  return row?.status === "review"
    && String(row?.textPreview || "").trim() === "수집 중"
    && Number(row?.mediaCount || 0) === 0
    && criteria.pendingDetailExtract === true
    && Number.isFinite(ageMs)
    && ageMs >= 0
    && ageMs <= DISCOVERY_STARTUP_RECOVERY_WINDOW_MS;
}

async function processDiscoveryAutoScheduleJob(canonicalUrl, source, text) {
  logEvent("discovery_auto_schedule_async_start", { canonicalUrl, source });
  const detail = await addThreadToDiscoveryReview(canonicalUrl, { text, allowTextOnly: true });
  if (detail.skipped) {
    logEvent("discovery_auto_schedule_async_skipped", {
      canonicalUrl,
      source,
      reason: detail.reason || null,
      keyword: detail.keyword || null,
    });
    return { skipped: true, detail };
  }
  const result = await runDiscoveryAutoSchedule(canonicalUrl, {
    text,
    source,
    waitForBusy: true,
  });
  logEvent("discovery_auto_schedule_async_success", {
    canonicalUrl,
    source,
    scheduledAt: result.scheduledAt || null,
    mediaCount: result.mediaCount,
  });
  return { skipped: false, detail, result };
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

async function recoverRecentDiscoveryPlaceholders() {
  const db = await getDiscoveryDb();
  const rows = await db.prepare(`
    SELECT canonical_url AS canonicalUrl, text_preview AS textPreview,
      media_count AS mediaCount, criteria, status, discovered_at AS discoveredAt
    FROM thread_discoveries
    WHERE status = 'review'
      AND text_preview = '수집 중'
      AND media_count = 0
      AND discovered_at >= datetime('now', '-24 hours')
    ORDER BY discovered_at ASC
  `).all();
  const recoverable = rows.filter((row) => shouldRecoverDiscoveryPlaceholder(row));
  logEvent("discovery_startup_recovery_scan", {
    candidateCount: rows.length,
    recoverableCount: recoverable.length,
    windowHours: 24,
  });
  for (const row of recoverable) {
    const criteria = parseDiscoveryCriteria(row.criteria);
    const originalSource = String(criteria.source || "startup_recovery");
    const source = `${originalSource}:startup_recovery`;
    enqueueDiscoveryAutoScheduleJob(row.canonicalUrl, source, async () => {
      const current = await getDiscoveryRow(row.canonicalUrl);
      if (!shouldRecoverDiscoveryPlaceholder(current)) {
        logEvent("discovery_startup_recovery_skip", {
          canonicalUrl: row.canonicalUrl,
          source,
          reason: "state_changed",
        });
        return;
      }
      try {
        if (isDiscoveryAutoScheduleSource(originalSource)) {
          await processDiscoveryAutoScheduleJob(row.canonicalUrl, source);
        } else {
          const detail = await addThreadToDiscoveryReview(row.canonicalUrl);
          logEvent("discovery_startup_recovery_success", {
            canonicalUrl: row.canonicalUrl,
            source,
            mode: "collect_only",
            mediaCount: detail.mediaCount || 0,
          });
        }
      } catch (error) {
        if (isDiscoveryAutoScheduleSource(originalSource)) {
          if (shouldMarkDiscoveryScheduleFailed(error)) {
            await markDiscoveryScheduleFailed(row.canonicalUrl, error).catch(() => {});
          }
        } else {
          await markDiscoveryDetailError(row.canonicalUrl, error).catch(() => {});
        }
        logEvent("discovery_startup_recovery_error", {
          canonicalUrl: row.canonicalUrl,
          source,
          error: error.message,
        });
      }
    }).catch(() => {});
  }
  return { candidateCount: rows.length, recoverableCount: recoverable.length };
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
    activeAutomationChildProcesses.add(child);
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
      activeAutomationChildProcesses.delete(child);
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? (signal ? 124 : 0), signal, stdout: stdout.slice(-12000), stderr: stderr.slice(-12000) });
    });
  });
}

const terafabxGeminiWebQueue = [];
let terafabxGeminiWebSlotBusy = false;

function terafabxGeminiPriorityValue(priority) {
  return priority === "comment" ? 0 : priority === "manual" ? 1 : 2;
}

async function pumpTerafabxGeminiWebQueue() {
  if (terafabxGeminiWebSlotBusy || !terafabxGeminiWebQueue.length) return;
  terafabxGeminiWebSlotBusy = true;
  terafabxGeminiWebQueue.sort((a, b) => a.priority - b.priority || a.sequence - b.sequence);
  const job = terafabxGeminiWebQueue.shift();
  logEvent("terafabx_gemini_slot_acquired", { label: job.label, priority: job.priorityName, waitMs: Date.now() - job.queuedAt, queueDepth: terafabxGeminiWebQueue.length });
  try {
    job.resolve(await job.fn());
  } catch (error) {
    job.reject(error);
  } finally {
    await sleep(3000);
    terafabxGeminiWebSlotBusy = false;
    logEvent("terafabx_gemini_slot_released", { label: job.label, priority: job.priorityName, queueDepth: terafabxGeminiWebQueue.length });
    setImmediate(() => pumpTerafabxGeminiWebQueue().catch((error) => logEvent("terafabx_gemini_queue_error", { error: error.message })));
  }
}

let terafabxGeminiWebSequence = 0;
function withTerafabxGeminiWebSlot(label, fn, priority = "normal") {
  return new Promise((resolve, reject) => {
    terafabxGeminiWebQueue.push({ label, fn, priorityName: priority, priority: terafabxGeminiPriorityValue(priority), sequence: terafabxGeminiWebSequence += 1, queuedAt: Date.now(), resolve, reject });
    pumpTerafabxGeminiWebQueue().catch(reject);
  });
}

async function terafabxGeminiChallengeUrl(chromePort) {
  const tabs = await requestJsonForPort(chromePort, "GET", "/json/list").catch(() => []);
  return (Array.isArray(tabs) ? tabs : []).find((tab) => /google\.com\/sorry\//i.test(String(tab.url || "")))?.url || null;
}

async function runTerafabxGeminiScript(scriptPath, args, options = {}) {
  const label = options.label || path.basename(scriptPath);
  return withTerafabxGeminiWebSlot(label, async () => {
    let result = await runNodeScript(scriptPath, args, options);
    const challengeUrl = options.chromePort ? await terafabxGeminiChallengeUrl(options.chromePort) : null;
    if (!challengeUrl) return result;
    logEvent("terafabx_gemini_google_challenge", { label, chromePort: options.chromePort, challengeUrl: challengeUrl.slice(0, 300) });
    await cleanupTerafabxGeminiWorkTabs({ port: options.chromePort, profileDir: options.profileDir }).catch(() => null);
    await sleep(Math.max(30_000, Number(options.challengeBackoffMs || 60_000)));
    await ensureTerafabxGeminiHeadlessBrowser({ port: options.chromePort, profileDir: options.profileDir });
    result = await runNodeScript(scriptPath, args, options);
    return result;
  }, options.priority || "normal");
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
    json(res, 200, {
      ok: true,
      port: PORT,
      chromePort: CHROME_PORT,
      requiredXHandle: REQUIRED_X_HANDLE,
      pid: process.pid,
      xScheduleMonitor: loadXScheduleMonitorState(),
      terafabxCommentMonitor: loadTerafabxCommentMonitorState(),
    });
    return;
  }
  if (req.method === "GET" && req.url === "/api/x-schedule-monitor/status") {
    json(res, 200, { ok: true, monitor: loadXScheduleMonitorState() });
    return;
  }
  if (req.method === "POST" && req.url === "/api/x-schedule-monitor/run") {
    const result = await runXScheduleMonitor({ source: "manual_api" });
    json(res, result.ok ? 200 : result.skipped ? 202 : 500, result);
    return;
  }
  if (req.method === "GET" && req.url === "/api/terafabx/comment-monitor/status") {
    json(res, 200, { ok: true, monitor: loadTerafabxCommentMonitorState() });
    return;
  }
  if (req.method === "POST" && req.url === "/api/terafabx/comment-monitor/run") {
    const result = await runTerafabxCommentMonitor({ source: "manual_api" });
    json(res, result.status === "error" ? 500 : result.skipped ? 202 : 200, result);
    return;
  }
  if (req.method === "POST" && req.url === "/api/x-schedule-monitor/recover-missing") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await recoverMissingXScheduledPost(payload.url);
      json(res, 200, result);
    } catch (error) {
      logEvent("x_schedule_monitor_missing_recovery_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
    return;
  }
  if (req.method === "POST" && req.url === "/api/x-schedule-monitor/confirm-existing") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await confirmExistingXScheduledPost(payload.url, payload.scheduledAt);
      json(res, 200, result);
    } catch (error) {
      logEvent("x_schedule_existing_confirm_error", { error: error.message });
      json(res, 500, { ok: false, error: error.message });
    }
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
  if (req.method === "POST" && req.url === "/api/terafabx/own-post-reply") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const action = String(payload.action || "run");
      if (!["preview", "run", "batch", "invalidate", "enable", "disable"].includes(action)) throw new Error("action은 preview, run, batch, invalidate, enable, disable만 가능합니다.");
      const postUrl = payload.postUrl ? normalizeXStatusUrl(payload.postUrl) : "";
      const targetCommentUrl = payload.targetCommentUrl ? normalizeXStatusUrl(payload.targetCommentUrl) : "";
      if (postUrl) {
        const parsed = parseXStatusUrl(postUrl);
        if (!parsed?.id || parsed.handle.toLowerCase() !== REQUIRED_X_HANDLE) {
          throw new Error(`@${REQUIRED_X_HANDLE}의 X 게시물 URL만 사용할 수 있습니다.`);
        }
      }
      let result;
      if (action === "preview") {
        if (!postUrl) throw new Error("미리 볼 내 X 게시물 URL이 필요합니다.");
        const preview = await withTerafabxManualActionGate("내 글 대댓글 미리보기", () => collectTerafabxOwnPostConversation(postUrl));
        result = {
          postUrl: preview.postUrl,
          collectionSource: preview.collectionSource || "x-headless",
          rootPostText: preview.rootPost?.text || "",
          directReplyCount: preview.directReplies.length,
          ownCommentCount: preview.ownComments.length,
          alreadyRepliedCount: preview.alreadyReplied.length,
          bannedCount: preview.banned.length,
          advertisementCount: preview.advertisements.length,
          unverifiedCount: preview.unverified.length,
          verifiedOnly: true,
          candidateCount: preview.candidates.length,
          candidates: preview.candidates.slice(0, 10).map((item) => ({
            id: item.id,
            url: item.url,
            authorHandle: item.authorHandle,
            authorVerified: item.authorVerified === true,
            authorVerificationType: item.authorVerificationType || "",
            text: item.text,
            imageOnly: isTerafabxImageOnlyReply(item),
            imageCount: Number(item.imageCount || 0),
          })),
        };
      } else if (action === "run") {
        result = await withTerafabxManualActionGate("내 글 대댓글 수동 실행", () => runTerafabxOwnPostReplyOnce({ postUrl, targetCommentUrl, manual: true }));
      } else if (action === "batch") {
        if (!postUrl) throw new Error("병렬 처리할 내 X 게시물 URL이 필요합니다.");
        const queued = enqueueTerafabxOwnPostReplyBatch(postUrl, {
          concurrency: Number(payload.concurrency || TERAFABX_OWN_POST_REPLY_CONCURRENCY),
          limit: Number(payload.limit || TERAFABX_OWN_POST_REPLY_BATCH_LIMIT),
          delayMinMs: Number(payload.delayMinMs || TERAFABX_OWN_POST_REPLY_DELAY_MIN_MS),
          delayMaxMs: Number(payload.delayMaxMs || TERAFABX_OWN_POST_REPLY_DELAY_MAX_MS),
        });
        result = { queued: true, duplicate: queued.duplicate, request: queued.item };
      } else if (action === "invalidate") {
        result = invalidateTerafabxOwnPostReplyRecord({
          targetCommentUrl,
          replyUrl: payload.replyUrl || "",
          reason: payload.reason || "manual_invalidate",
        });
      } else if (action === "enable") {
        if (!postUrl) throw new Error("활성화할 내 X 게시물 URL이 필요합니다.");
        const previous = loadTerafabxState();
        const targets = Array.from(new Set([postUrl, ...(previous.ownPostReplyTargets || []).map(normalizeXStatusUrl)])).slice(0, 20);
        result = saveTerafabxState({
          ownPostReplyEnabled: true,
          ownPostReplyTargets: targets,
          lastOwnPostReplyStatus: previous.lastOwnPostReplyStatus,
          lastOwnPostReplyError: previous.lastOwnPostReplyError,
        });
        logEvent("terafabx_own_post_reply_enabled", { postUrl, targetCount: targets.length });
      } else {
        const previous = loadTerafabxState();
        const targets = postUrl
          ? (previous.ownPostReplyTargets || []).map(normalizeXStatusUrl).filter((url) => url !== postUrl)
          : [];
        const enabled = postUrl ? Boolean(targets.length && previous.ownPostReplyEnabled) : false;
        result = saveTerafabxState({ ownPostReplyEnabled: enabled, ownPostReplyTargets: targets });
        logEvent("terafabx_own_post_reply_disabled", { postUrl: postUrl || null, targetCount: targets.length, enabled });
      }
      json(res, 200, { ok: true, action, result, status: getTerafabxAutomationStatus() });
    } catch (error) {
      logEvent("terafabx_own_post_reply_action_error", { error: error.message });
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
  if (req.method === "POST" && req.url === "/api/discovery/reinspect-scheduled-source") {
    try {
      const body = await readRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const result = await reinspectScheduledDiscoverySource(payload.url);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("scheduled_source_reinspect_request_error", { error: error.message });
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
  if (req.method === "POST" && req.url === "/api/discovery/cancel-schedule") {
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
      const result = await cancelDiscoveryScheduledPost(canonicalUrl);
      json(res, 200, { ok: true, ...result });
    } catch (error) {
      logEvent("discovery_schedule_cancel_error", { canonicalUrl, error: error.message });
      json(res, 500, { ok: false, error: error.message });
    } finally {
      busy = false;
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
      if (canonicalUrl && shouldMarkDiscoveryScheduleFailed(error)) {
        await markDiscoveryScheduleFailed(canonicalUrl, error);
      }
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
      if (canonicalUrl && shouldMarkDiscoveryScheduleFailed(error)) {
        await markDiscoveryScheduleFailed(canonicalUrl, error);
      }
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
            await processDiscoveryAutoScheduleJob(canonicalUrl, source, payload.text);
          } catch (error) {
            if (shouldMarkDiscoveryScheduleFailed(error)) {
              await markDiscoveryScheduleFailed(canonicalUrl, error).catch(() => {});
            }
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

function loadXScheduleMonitorState() {
  return {
    enabled: true,
    intervalMs: X_SCHEDULE_MONITOR_INTERVAL_MS,
    busy: xScheduleMonitorBusy,
    lastRunAt: null,
    lastStatus: "idle",
    lastError: null,
    checkedCount: 0,
    anomalyCount: 0,
    repairedCount: 0,
    anomalies: [],
    ...readJsonFile(X_SCHEDULE_MONITOR_STATE_PATH, {}),
    busy: xScheduleMonitorBusy,
    intervalMs: X_SCHEDULE_MONITOR_INTERVAL_MS,
  };
}

function saveXScheduleMonitorState(patch = {}) {
  const previous = loadXScheduleMonitorState();
  const next = { ...previous, ...patch, busy: xScheduleMonitorBusy, intervalMs: X_SCHEDULE_MONITOR_INTERVAL_MS };
  writeJsonFile(X_SCHEDULE_MONITOR_STATE_PATH, next);
  return next;
}

async function futureScheduledDiscoveryRows() {
  const db = await getDiscoveryDb();
  const rows = await db.prepare(`
    SELECT canonical_url AS canonicalUrl, text_preview AS textPreview,
      media_count AS mediaCount, scheduled_post_at AS scheduledAt
    FROM thread_discoveries
    WHERE status = 'scheduled' AND scheduled_post_at IS NOT NULL AND scheduled_post_at > ?
    ORDER BY scheduled_post_at ASC
    LIMIT 100
  `).all(new Date().toISOString());
  const now = Date.now();
  return rows
    .filter((row) => {
      const time = new Date(row.scheduledAt || 0).getTime();
      return Number.isFinite(time) && time > now;
    })
    .map((row) => ({
      ...row,
      textPreview: isDiscoveryPlaceholderText(row.textPreview) ? "" : row.textPreview,
    }));
}

async function recoverMissingXScheduledPost(canonicalUrl) {
  const url = validateThreadsUrl(canonicalUrl);
  const row = await getDiscoveryRow(url);
  if (!row || row.status !== "scheduled") throw new Error("복구할 예약 DB 항목을 찾지 못했습니다.");
  const scheduledAt = new Date(row.scheduledPostAt || 0);
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    throw new Error("복구할 예약 시각이 이미 지났거나 올바르지 않습니다.");
  }
  const threadPost = await extractThreadPost(url, { allowEmptyText: true });
  const storedText = isDiscoveryPlaceholderText(row.textPreview) ? "" : row.textPreview;
  threadPost.text = truncateXText(storedText || threadPost.text, 280);
  if (!threadPost.text && threadPost.mediaUrls.length === 0) throw new Error("복구할 예약 제목과 미디어가 없습니다.");
  if (Number(row.mediaCount || 0) > 0 && threadPost.mediaUrls.length === 0) {
    throw new Error("원문 미디어를 다시 확인하지 못해 누락 예약 자동 복구를 중단했습니다.");
  }
  const media = await downloadMedia(threadPost.mediaUrls);
  try {
    const result = await postToX(threadPost, media.files, { schedule: true, scheduledAt });
    recordCompletedMirror({
      canonicalUrl: url,
      status: "scheduled",
      scheduledAt: result.scheduledAt.toISOString(),
      postUrl: null,
      mediaCount: media.files.length,
    });
    await markDiscoveryScheduled(url, media.files.length, result.scheduledAt.toISOString());
    logEvent("x_schedule_monitor_missing_recovered", {
      canonicalUrl: url,
      scheduledAt: result.scheduledAt.toISOString(),
      mediaCount: media.files.length,
    });
    return { ok: true, canonicalUrl: url, scheduledAt: result.scheduledAt.toISOString(), mediaCount: media.files.length };
  } finally {
    fs.rmSync(media.dir, { recursive: true, force: true });
    logEvent("cleanup_done", { canonicalUrl: url, dir: media.dir, source: "x_schedule_monitor_missing_recovery" });
  }
}

async function confirmExistingXScheduledPost(canonicalUrl, scheduledAtValue) {
  const url = validateThreadsUrl(canonicalUrl);
  const row = await getDiscoveryRow(url);
  if (!row) throw new Error("확인할 대시보드 항목을 찾지 못했습니다.");
  const scheduledAt = new Date(scheduledAtValue || row.scheduledPostAt || 0);
  if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) {
    throw new Error("확인할 미래 예약 시각이 올바르지 않습니다.");
  }
  const verification = await withTerafabxLock("x_schedule_existing_confirm", async () => {
    const page = await newPage(`https://x.com/${REQUIRED_X_HANDLE}`);
    try {
      await verifyXAccount(page);
      const entries = await readXScheduledEntries(page);
      const entry = findXScheduledEntry(entries, scheduledAt);
      const assessment = assessXScheduledEntry({
        textPreview: isDiscoveryPlaceholderText(row.textPreview) ? "" : row.textPreview,
        mediaCount: Number(row.mediaCount || 0),
      }, entry);
      if (assessment.status !== "ok") {
        throw new Error(`기존 X 예약 확인 실패: ${JSON.stringify({ status: assessment.status, actualText: assessment.actualText || "" })}`);
      }
      return { actualCount: entries.length, assessment };
    } finally {
      await page.close();
      logEvent("x_tab_closed", { source: "x_schedule_existing_confirm" });
    }
  }, { wait: true, timeoutMs: 10 * 60 * 1000 });
  recordCompletedMirror({
    canonicalUrl: url,
    status: "scheduled",
    scheduledAt: scheduledAt.toISOString(),
    postUrl: null,
    mediaCount: Number(row.mediaCount || 0),
  });
  await markDiscoveryScheduled(url, Number(row.mediaCount || 0), scheduledAt.toISOString());
  logEvent("x_schedule_existing_confirmed", {
    canonicalUrl: url,
    scheduledAt: scheduledAt.toISOString(),
    mediaCount: Number(row.mediaCount || 0),
    actualCount: verification.actualCount,
  });
  return {
    ok: true,
    canonicalUrl: url,
    scheduledAt: scheduledAt.toISOString(),
    mediaCount: Number(row.mediaCount || 0),
    actualCount: verification.actualCount,
  };
}

async function runXScheduleMonitor(options = {}) {
  if (xScheduleMonitorBusy) {
    logEvent("x_schedule_monitor_skipped", { reason: "already_running", source: options.source || "timer" });
    return { ok: false, skipped: true, reason: "already_running" };
  }
  xScheduleMonitorBusy = true;
  const startedAt = new Date().toISOString();
  const previousState = loadXScheduleMonitorState();
  const previousMissing = new Set((previousState.anomalies || [])
    .filter((item) => item.type === "missing")
    .map((item) => `${item.canonicalUrl}|${item.scheduledAt}`));
  saveXScheduleMonitorState({ lastStartedAt: startedAt, lastStatus: "running", lastError: null });
  try {
    return await withTerafabxLock("x_schedule_monitor", async () => {
      const expectedRows = await futureScheduledDiscoveryRows();
      const page = await newPage(`https://x.com/${REQUIRED_X_HANDLE}`);
      try {
        await verifyXAccount(page);
        let actualEntries = await readXScheduledEntries(page);
        const anomalies = [];
        const repairs = [];
        for (const expected of expectedRows) {
          let entry = findXScheduledEntry(actualEntries, expected.scheduledAt);
          let assessment = assessXScheduledEntry(expected, entry);
          const shouldInspectTextOnlyMedia = assessment.status === "ok" && Number(expected.mediaCount || 0) === 0;
          if (assessment.status === "title_missing" || shouldInspectTextOnlyMedia) {
            try {
              const repair = await repairXScheduledEntry(page, expected, assessment);
              if (repair.changed) {
                repairs.push({ canonicalUrl: expected.canonicalUrl, scheduledAt: expected.scheduledAt, ...repair });
                logEvent("x_schedule_monitor_repaired", { canonicalUrl: expected.canonicalUrl, scheduledAt: expected.scheduledAt, ...repair });
              }
              actualEntries = await readXScheduledEntries(page);
              entry = findXScheduledEntry(actualEntries, expected.scheduledAt);
              assessment = assessXScheduledEntry(expected, entry);
            } catch (error) {
              anomalies.push({ canonicalUrl: expected.canonicalUrl, scheduledAt: expected.scheduledAt, type: "repair_failed", error: error.message });
              logEvent("x_schedule_monitor_repair_error", { canonicalUrl: expected.canonicalUrl, scheduledAt: expected.scheduledAt, error: error.message });
              continue;
            }
          }
          if (assessment.status !== "ok") {
            const anomalyKey = `${expected.canonicalUrl}|${expected.scheduledAt}`;
            anomalies.push({
              canonicalUrl: expected.canonicalUrl,
              scheduledAt: expected.scheduledAt,
              type: assessment.status,
              actualText: assessment.actualText || "",
              persistent: assessment.status === "missing" && previousMissing.has(anomalyKey),
            });
          }
        }
        const status = anomalies.length ? "degraded" : repairs.length ? "repaired" : "ok";
        const result = {
          ok: anomalies.length === 0,
          status,
          checkedCount: expectedRows.length,
          actualCount: actualEntries.length,
          anomalyCount: anomalies.length,
          repairedCount: repairs.length,
          anomalies: anomalies.slice(0, 20),
          repairs: repairs.slice(0, 20),
          expectedSlots: expectedRows.map((row) => ({
            canonicalUrl: row.canonicalUrl,
            scheduledAt: row.scheduledAt,
            mediaCount: Number(row.mediaCount || 0),
          })),
          startedAt,
          completedAt: new Date().toISOString(),
          source: options.source || "timer",
        };
        saveXScheduleMonitorState({
          lastRunAt: result.completedAt,
          lastStatus: status,
          lastError: null,
          checkedCount: result.checkedCount,
          actualCount: result.actualCount,
          anomalyCount: result.anomalyCount,
          repairedCount: result.repairedCount,
          anomalies: result.anomalies,
          repairs: result.repairs,
        });
        logEvent("x_schedule_monitor_complete", result);
        const persistentMissing = result.anomalies.filter((item) =>
          shouldAutoRecoverXScheduledAnomaly(item, actualEntries.length, expectedRows.length)
          && !xScheduleRecoveryInFlight.has(item.canonicalUrl)
        );
        for (const item of persistentMissing) {
          xScheduleRecoveryInFlight.add(item.canonicalUrl);
          logEvent("x_schedule_monitor_missing_recovery_queued", item);
          setTimeout(() => {
            recoverMissingXScheduledPost(item.canonicalUrl)
              .then(() => runXScheduleMonitor({ source: "auto_recovery_verify" }))
              .catch((error) => logEvent("x_schedule_monitor_missing_recovery_error", {
                canonicalUrl: item.canonicalUrl,
                scheduledAt: item.scheduledAt,
                error: error.message,
              }))
              .finally(() => xScheduleRecoveryInFlight.delete(item.canonicalUrl));
          }, 3000);
        }
        return result;
      } finally {
        await page.close();
        logEvent("x_tab_closed", { source: "x_schedule_monitor" });
      }
    }, { wait: false });
  } catch (error) {
    const skipped = /9224 CDP lock 사용 중/.test(error.message);
    const status = skipped ? "skipped_busy" : "error";
    saveXScheduleMonitorState({ lastRunAt: new Date().toISOString(), lastStatus: status, lastError: error.message });
    logEvent("x_schedule_monitor_error", { source: options.source || "timer", skipped, error: error.message });
    return { ok: false, skipped, status, error: error.message };
  } finally {
    xScheduleMonitorBusy = false;
    saveXScheduleMonitorState({});
  }
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

  setTimeout(() => {
    recoverRecentDiscoveryPlaceholders().catch((error) => {
      logEvent("discovery_startup_recovery_scan_error", { error: error.message });
    });
  }, 2000);

  setTimeout(() => {
    runXScheduleMonitor({ source: "startup" }).catch((error) => {
      logEvent("x_schedule_monitor_startup_error", { error: error.message });
    });
  }, 30000);

  setTimeout(() => {
    runTerafabxCommentMonitor({ source: "startup" }).catch((error) => {
      logEvent("terafabx_comment_monitor_startup_error", { error: error.message });
    });
  }, 45000);

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
    maybeRunTerafabxCommentAutomation().catch((error) => {
      logEvent("terafabx_comment_scheduler_tick_error", { error: error.message });
    });
  }, 5 * 1000);

  setInterval(() => {
    maybeRunTerafabxAutomation().catch((error) => {
      logEvent("terafabx_auto_tick_error", { error: error.message });
    });
  }, 60 * 1000);

  setInterval(() => {
    maybeRunTerafabxOwnPostReplyAutomation().catch((error) => {
      logEvent("terafabx_own_post_reply_tick_error", { error: error.message });
    });
  }, 60 * 1000);

  setInterval(() => {
    maybeRunScheduledInssiderReplies().catch((error) => {
      logEvent("inssider_scheduled_reply_tick_error", { error: error.message });
    });
  }, 60 * 1000);

  setInterval(() => {
    runXScheduleMonitor({ source: "timer" }).catch((error) => {
      logEvent("x_schedule_monitor_tick_error", { error: error.message });
    });
  }, X_SCHEDULE_MONITOR_INTERVAL_MS);

  setInterval(() => {
    runTerafabxCommentMonitor({ source: "timer" }).catch((error) => {
      logEvent("terafabx_comment_monitor_tick_error", { error: error.message });
    });
  }, TERAFABX_COMMENT_MONITOR_INTERVAL_MS);
}

if (require.main === module) {
  startServer();
}

module.exports = {
  cleanThreadText,
  dashboardDiscoveryRow,
  DuplicateMirrorError,
  isPublishedDiscoveryRow,
  mergeDiscoveryRowsWithMirrorHistory,
  mirrorHistoryDashboardRow,
  mirrorHistoryPublishedTime,
  isTerafabxQuietPostingTime,
  terafabxDailyCommentProgress,
  deriveTerafabxCommentQualityFeedback,
  evaluateTerafabxCommentWorkflow,
  shouldTerafabxCommentMonitorRequestPrefill,
  assessTerafabxCurrentCommentPolicy,
  auditTerafabxPrefillQuality,
  assessTerafabxLanguageQuality,
  stripTerafabxListPrefix,
  classifyTerafabxOwnPostReplies,
  assessTerafabxReplyRelationship,
  assessTerafabxParentContextMismatch,
  buildTerafabxFixedImageReplyRecord,
  buildTerafabxOwnPostReplyTarget,
  terafabxAdCommentReason,
  isTerafabxAdComment,
  isTerafabxSkippableOwnPostReplyTargetError,
  terafabxStatusHrefMatches,
  isTerafabxReplySubmitCandidate,
  isTerafabxReplySubmissionUncertain,
  terafabxPendingCommentFailureDisposition,
  terafabxBrowserConcurrency,
  terafabxCommentPrefillWorkerResources,
  isTerafabxGeminiWorkTab,
  ensureTerafabxGeminiHeadlessBrowser,
  cleanupTerafabxGeminiWorkTabs,
  terafabxGeminiPriorityValue,
  terafabxSingleOwnPostCandidateLimit,
  terafabxOwnPostReplyBatchLimit,
  normalizeFxTwitterV2Status,
  flattenFxTwitterConversationReplies,
  normalizeTerafabxOwnPostReplyManualQueue,
  terafabxOwnPostReplyQueueItemForUrl,
  terafabxReplyReviewFinalScore,
  isTerafabxReplyReviewScoreQualified,
  isTerafabxGrokNonJsonLimitText,
  withTerafabxBrowserSetupCleanup,
  xPageReadyState,
  randomTerafabxOwnPostReplyDelayMs,
  runFixedWorkerPool,
  shouldUseTerafabxQuickIntent,
  judgeTerafabxReplyWithGeminiHeadless,
  parseTerafabxFinalJudge,
  parseTerafabxGeminiBatchReview,
  parseTerafabxGeminiBatchFinalJudge,
  scoreTerafabxClichePenalty,
  selectRootPostMediaCandidates,
  shouldAutoRecoverXScheduledAnomaly,
  assessXScheduledEntry,
  findXScheduledEntry,
  xScheduledTimeNeedles,
  terafabxGrokContextPrompt,
  terafabxGeminiGeneratePrompt,
  terafabxGeminiReviewPrompt,
  terafabxGeminiBatchReviewPrompt,
  terafabxGeminiBatchGeneratePrompt,
  terafabxGeminiBatchFinalJudgePrompt,
  terafabxFinalJudgePrompt,
  terafabxPromptContextLines,
  terafabxReplyPrompt,
  isTerafabxImageOnlyReply,
  publishedDiscoveryTime,
  isDiscoveryAutoScheduleSource,
  shouldRecoverDiscoveryPlaceholder,
  shouldMarkDiscoveryScheduleFailed,
  splitInssiderReplyChunks,
  startServer,
  ensureComposerText,
  verifyComposerText,
  truncateXText,
  xWeightedLength,
};
