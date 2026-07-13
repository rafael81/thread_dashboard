#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const statePath = process.env.TERAFABX_STATE_PATH || path.join(root, ".data", "terafabx-automation-state.json");
const monitorPath = process.env.TERAFABX_COMMENT_MONITOR_STATE_PATH || path.join(root, ".data", "terafabx-comment-monitor-state.json");
const eventsPath = path.join(root, "mirror-events.jsonl");
const args = process.argv.slice(2);
const argValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const since = new Date(argValue("--since") || process.env.PREFILL_REPORT_SINCE || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
if (!Number.isFinite(since.getTime())) throw new Error("--since 값이 올바른 ISO 날짜가 아닙니다.");
const until = new Date(argValue("--until") || new Date().toISOString());
if (!Number.isFinite(until.getTime())) throw new Error("--until 값이 올바른 ISO 날짜가 아닙니다.");

const readJson = (file, fallback) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch {
      if (attempt < 2) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  return fallback;
};
const recordTime = (record) => new Date(record.postedAt || record.queuedAt || record.at || 0).getTime();
const inWindow = (record) => {
  const time = recordTime(record);
  return Number.isFinite(time) && time >= since.getTime() && time <= until.getTime();
};
const state = readJson(statePath, {});
const monitor = readJson(monitorPath, {});
const records = [
  ...(state.pendingCommentPosts || []),
  ...(state.commentHistory || []),
  ...(state.failedPendingCommentPosts || []),
].filter((record) => record?.source === "prefill" && inWindow(record));
const recordRank = (record) => record.posted || record.replyUrl || record.status === "posted"
  ? 3
  : (record.status !== "error" && !record.failedReason ? 2 : 1);
const byKey = new Map();
for (const record of records) {
  const key = `${record.targetUrl || ""}|${record.queuedAt || record.at || ""}`;
  const existing = byKey.get(key);
  if (!existing || recordRank(record) >= recordRank(existing)) byKey.set(key, record);
}
const unique = [...byKey.values()];
const posted = unique.filter((record) => record.posted || record.replyUrl || record.status === "posted");
const pending = unique.filter((record) => !record.posted && !record.replyUrl && record.status !== "error");
const failed = unique.filter((record) => record.status === "error" || record.failedReason);
const genericityRejected = failed.filter((record) => /genericity|source_anchor|cross_post|headline|specificity/i.test(`${record.lastError || ""} ${record.failedReason || ""}`));
const manualAuditRejected = failed.filter((record) => record.failedReason === "manual_quality_audit" || /manual_quality_audit/i.test(String(record.lastError || "")));
const unsupportedClaimRejected = failed.filter((record) => /unsupported|ungrounded|invented|원문에 없는|근거 없는|image_says/i.test(String(record.lastError || "")));
const events = fs.existsSync(eventsPath)
  ? fs.readFileSync(eventsPath, "utf8").split("\n").flatMap((line) => {
      try {
        const event = JSON.parse(line);
        const time = new Date(event.ts || 0).getTime();
        return time >= since.getTime() && time <= until.getTime() ? [event] : [];
      } catch { return []; }
    })
  : [];
const eventCount = (type) => events.filter((event) => event.type === type).length;
const eventSum = (type, field = "count") => events
  .filter((event) => event.type === type)
  .reduce((sum, event) => sum + Number(event[field] || 0), 0);
const batchStarts = events.filter((event) => event.type === "terafabx_grok_context_batch_start");
const batchSuccesses = events.filter((event) => event.type === "terafabx_grok_context_batch_ok");
const batchFailures = events.filter((event) => event.type === "terafabx_grok_context_batch_failed");
const batchLimitFailures = batchFailures.filter((event) => /limit 문구|reached your limit/i.test(String(event.error || "")));
const xHomeFailures = events.filter((event) => event.type === "terafabx_comment_prefill_error" && /X home 로딩 실패/i.test(String(event.error || "")));
const statusOf = (record) => record.posted || record.replyUrl || record.status === "posted"
  ? "게시"
  : (record.status === "error" || record.failedReason ? "격리/실패" : "대기");
const qualityIssueText = (record) => {
  const judge = record?.geminiReview?.finalJudge || {};
  const flags = judge.qualityFlags || {};
  const issues = Object.entries(flags).filter(([, value]) => value === true).map(([key]) => key);
  return issues.length ? issues.join(", ") : "없음";
};
const audit = monitor.prefillQualityAudit || {};
const auditItems = Array.isArray(audit.items) ? audit.items : [];
const auditPendingItems = auditItems.filter((item) => item.status !== "posted");
const auditPendingCount = Number(audit.pendingCount ?? auditItems.filter((item) => item.status !== "posted").length);
const auditPendingFailedCount = Number(audit.pendingFailedCount ?? auditItems.filter((item) => item.status !== "posted" && !item.ok).length);
const auditPendingScores = auditPendingItems.map((item) => Number(item.score)).filter(Number.isFinite);
const auditPendingMinScore = auditPendingScores.length ? Math.min(...auditPendingScores) : null;
const auditPendingAverageScore = auditPendingScores.length
  ? Math.round(auditPendingScores.reduce((sum, score) => sum + score, 0) / auditPendingScores.length)
  : null;
const auditPostedCount = Number(audit.postedCount ?? auditItems.filter((item) => item.status === "posted").length);
const auditPostedFailedCount = Number(audit.postedFailedCount ?? auditItems.filter((item) => item.status === "posted" && !item.ok).length);
const auditPostedLegacyUnverifiableCount = Number(audit.postedLegacyUnverifiableCount ?? auditItems.filter((item) => (
  item.status === "posted"
  && !item.ok
  && Array.isArray(item.errors)
  && item.errors.length > 0
  && item.errors.every((error) => ["genericity_quality_flags_missing", "source_anchor_unverifiable"].includes(error))
)).length);
const auditPostedQualityFailedCount = Number(audit.postedQualityFailedCount ?? Math.max(0, auditPostedFailedCount - auditPostedLegacyUnverifiableCount));
let commits = [];
try {
  commits = execFileSync("git", [
    "log",
    `--since=${since.toISOString()}`,
    `--until=${until.toISOString()}`,
    "--format=%h %s",
    "--",
    "mirror_server.js",
    "scripts/prefill-quality-report.js",
    "test",
  ], { cwd: root, encoding: "utf8" }).trim().split("\n").filter(Boolean);
} catch {}
const lines = [
  "# Prefill 품질 모니터링 보고서",
  "",
  `- 기간: ${since.toISOString()} ~ ${until.toISOString()}`,
  `- 고유 Prefill: ${unique.length}개`,
  `- 게시: ${posted.length}개`,
  `- 기간 내 대기: ${pending.length}개`,
  `- 격리/실패: ${failed.length}개`,
  `- 범용성·근거 게이트 격리: ${genericityRejected.length}개`,
  `- 수동 개별 감사 격리: ${manualAuditRejected.length}개`,
  `- 근거 없는 구체 주장 격리: ${unsupportedClaimRejected.length}개`,
  `- 최근 자동 감사: ${Number(audit.checkedCount || 0)}개 검사 / ${auditPostedLegacyUnverifiableCount}개 레거시 미검증 / ${auditPostedQualityFailedCount + auditPendingFailedCount}개 확정 품질 탈락`,
  `- 현재 대기 Prefill 감사: ${auditPendingCount}개 검사 / ${auditPendingFailedCount}개 탈락`,
  `- 현재 대기 Prefill 독립심사 점수: 최저 ${auditPendingMinScore ?? "없음"}점 / 평균 ${auditPendingAverageScore ?? "없음"}점`,
  `- 이미 게시된 Prefill 자동 감사: ${auditPostedCount}개 검사 / ${auditPostedLegacyUnverifiableCount}개 레거시 스키마 미검증 / ${auditPostedQualityFailedCount}개 확정 품질 탈락`,
  `- 생성 완료 이벤트: ${eventCount("terafabx_comment_prefill_queued")}회`,
  `- 품질 격리: ${eventCount("terafabx_comment_monitor_prefill_quality_quarantined")}회 / ${eventSum("terafabx_comment_monitor_prefill_quality_quarantined")}개`,
  `- 일시 오류 복구: ${eventCount("terafabx_comment_monitor_transient_prefill_recovered")}회 / ${eventSum("terafabx_comment_monitor_transient_prefill_recovered")}개`,
  `- Prefill 오류 이벤트: ${eventCount("terafabx_comment_prefill_error")}회`,
  `- X 홈 로딩 실패: ${xHomeFailures.length}회`,
  `- Grok 묶음 호출: ${batchStarts.length}회 / ${batchStarts.reduce((sum, event) => sum + Number(event.count || 0), 0)}개 문맥`,
  `- Grok 묶음 성공: ${batchSuccesses.length}회 / ${batchSuccesses.reduce((sum, event) => sum + Number(event.passed || 0), 0)}개 성공 / ${batchSuccesses.reduce((sum, event) => sum + Number(event.failed || 0), 0)}개 누락`,
  `- Grok 묶음 전체 실패: ${batchFailures.length}회 / ${batchFailures.reduce((sum, event) => sum + Number(event.count || 0), 0)}개 미생성`,
  `- Grok 한도 응답: ${batchLimitFailures.length}회 / ${batchLimitFailures.reduce((sum, event) => sum + Number(event.count || 0), 0)}개 미생성`,
  "",
  "## 항목별 감사",
  "",
  ...(unique.length
    ? unique.slice(0, 200).map((record) => {
      const judge = record?.geminiReview?.finalJudge || {};
      return `- [${statusOf(record)}] ${record.comment || "(댓글 없음)"} — 점수 ${Number.isFinite(Number(judge.score)) ? Number(judge.score) : "없음"}, 근거 ${judge.sourceAnchor || "없음"}, 근거확인 ${judge.sourceAnchorGrounded === true ? "통과" : "미확인"}, 품질이슈 ${qualityIssueText(record)} — ${record.targetUrl || ""}`;
    })
    : ["- 없음"]),
  "",
  "## 탈락 항목",
  "",
  ...(failed.slice(0, 100).length
    ? failed.slice(0, 100).map((record) => `- ${record.comment || "(댓글 없음)"} — ${record.lastError || record.failedReason || "unknown"} — ${record.targetUrl || ""}`)
    : ["- 없음"]),
  "",
  "## 적용 커밋",
  "",
  ...(commits.length ? commits.map((commit) => `- ${commit}`) : ["- 없음"]),
];
const output = lines.join("\n");
const outputPath = argValue("--out");
if (outputPath) {
  const resolved = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, `${output}\n`);
}
process.stdout.write(`${output}\n`);
