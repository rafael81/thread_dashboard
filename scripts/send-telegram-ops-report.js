#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const dashboardBaseUrl = process.env.DASHBOARD_BASE_URL || "http://127.0.0.1:3131";

function loadEnvFileIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath) || typeof process.loadEnvFile !== "function") return false;
  process.loadEnvFile(filePath);
  return true;
}

function loadTelegramEnvironment() {
  loadEnvFileIfPresent(path.join(projectRoot, ".env"));
  if (!process.env.TELEGRAM_BOT_TOKEN || !(process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID)) {
    loadEnvFileIfPresent(
      process.env.TELEGRAM_ENV_FILE
        || path.join(os.homedir(), "project", "personal", "tweet-persona", ".env"),
    );
  }
  return {
    token: String(process.env.TELEGRAM_BOT_TOKEN || "").trim(),
    chatId: String(process.env.TELEGRAM_ALERT_CHAT_ID || process.env.TELEGRAM_CHAT_ID || "").trim(),
  };
}

function kstDateKey(value = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function kstDateTime(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

async function fetchJson(url, timeoutMs = 15_000) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok === false) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

function compactError(value, maxLength = 100) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "-";
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function buildTelegramOpsReport({
  automation,
  discovery,
  scheduleMonitor = {},
  checkedAt = new Date(),
  responseMs = 0,
} = {}) {
  const summary = automation?.summary || {};
  const terafabx = automation?.terafabx || {};
  const pipeline = terafabx.commentPipeline || {};
  const comment = terafabx.comment || {};
  const prefill = terafabx.commentPrefill || {};
  const rows = Array.isArray(discovery?.rows) ? discovery.rows : [];
  const scheduling = rows.filter((row) => ["queued_schedule", "scheduling"].includes(row.status));
  const failures = rows.filter((row) => row.status === "failed_schedule");
  const recentErrors = [...failures, ...scheduling.filter((row) => row.lastError)]
    .slice(0, 3)
    .map((row) => `• @${row.author || "unknown"}: ${compactError(row.lastError || row.status)}`);
  const quota = prefill.quotaLimited
    ? `제한 · 재시도 ${kstDateTime(prefill.quotaRetryAt)}`
    : "정상";
  const lines = [
    `📊 TerafabX 운영보고 · ${kstDateTime(checkedAt)}`,
    "",
    `서버: 정상 · 응답 ${Math.round(Number(responseMs || 0))}ms`,
    `예약: 예정 ${Number(discovery?.summary?.scheduledCount || 0)} · 진행 ${scheduling.length} · 실패 ${failures.length}`,
    `자동댓글: 오늘 ${Number(comment.daily?.postedToday || 0)}/${Number(comment.daily?.dailyTarget || 0)} · 대기 ${Number(comment.pendingPostCount || 0)}`,
    `댓글 파이프라인: ${pipeline.label || pipeline.status || "대기"}${pipeline.blocker ? ` · ${compactError(pipeline.blocker, 80)}` : ""}`,
    `대댓글 순회: ${comment.coverage?.lastStatus || pipeline.coverage?.lastStatus || "-"} · 백로그 ${Number(comment.coverage?.backlogCount || pipeline.coverage?.backlogCount || 0)}`,
    `하트: 최근 ${Number(terafabx.heart?.lastCount || 0)}개 · 상태 ${terafabx.heart?.lastStatus || "-"}`,
    `Grok: ${quota}`,
    `X 예약 모니터: ${scheduleMonitor.lastStatus || "-"} · 이상 ${Number(scheduleMonitor.anomalyCount || 0)}`,
    `최근 자동댓글: ${kstDateTime(summary.lastCommentAt)}`,
  ];
  if (recentErrors.length) {
    lines.push("", "⚠️ 예약 오류", ...recentErrors);
  }
  return lines.join("\n").slice(0, 3900);
}

async function collectTelegramOpsReport() {
  const startedAt = Date.now();
  const date = kstDateKey();
  const [automation, discovery] = await Promise.all([
    fetchJson(`${dashboardBaseUrl}/api/discovery/dashboard?view=automation&date=${encodeURIComponent(date)}`),
    fetchJson(`${dashboardBaseUrl}/api/discovery/dashboard?view=discovered`),
  ]);
  let scheduleMonitor = {};
  try {
    scheduleMonitor = JSON.parse(fs.readFileSync(path.join(projectRoot, ".data", "x-schedule-monitor-state.json"), "utf8"));
  } catch {}
  return {
    text: buildTelegramOpsReport({
      automation,
      discovery,
      scheduleMonitor,
      checkedAt: new Date(),
      responseMs: Date.now() - startedAt,
    }),
    automation,
    discovery,
  };
}

async function sendTelegramMessage(text, credentials = loadTelegramEnvironment()) {
  if (!credentials.token || !credentials.chatId) {
    throw new Error("TELEGRAM_BOT_TOKEN 또는 TELEGRAM_ALERT_CHAT_ID가 설정되지 않았습니다.");
  }
  const response = await fetch(`https://api.telegram.org/bot${credentials.token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: credentials.chatId,
      text,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.ok !== true) {
    throw new Error(body.description || `Telegram HTTP ${response.status}`);
  }
  return {
    ok: true,
    messageId: body.result?.message_id || null,
    sentAt: new Date().toISOString(),
  };
}

async function main() {
  const report = await collectTelegramOpsReport();
  if (process.argv.includes("--dry-run")) {
    console.log(report.text);
    return;
  }
  const result = await sendTelegramMessage(report.text);
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Telegram 운영보고 실패: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildTelegramOpsReport,
  collectTelegramOpsReport,
  compactError,
  kstDateKey,
  kstDateTime,
  loadTelegramEnvironment,
  sendTelegramMessage,
};
