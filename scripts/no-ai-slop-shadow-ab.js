#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const {
  ensureTerafabxGeminiHeadlessBrowser,
  closeTerafabxGeminiHeadlessBrowser,
} = require("../mirror_server");

const PROJECT_DIR = path.resolve(__dirname, "..");
const STATE_PATH = path.join(PROJECT_DIR, ".data", "terafabx-automation-state.json");
const REPORT_DIR = path.join(PROJECT_DIR, ".data", "reports");
const RUN_ROOT = path.join(PROJECT_DIR, ".data", "terafabx-gemini-reviews");
const GEMINI_SCRIPT = path.join(__dirname, "gemini_custom_prompt.js");
const DEFAULT_PORT = 9284;
const DEFAULT_PROFILE_DIR = path.join(PROJECT_DIR, ".data", "chrome-profiles", "terafabx-gemini-review-no-ai-slop-shadow");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    result[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--")
      ? argv[++index]
      : "true";
  }
  return result;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stableVariantOrder(index, targetUrl) {
  const seed = `${index}:${targetUrl || ""}`;
  let hash = 0;
  for (const char of seed) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return hash % 2 === 0 ? "ab" : "ba";
}

function recentPostedCommentSamples(state, limit = 30) {
  return (Array.isArray(state?.commentHistory) ? state.commentHistory : [])
    .filter((item) => (
      item
      && cleanText(item.comment)
      && cleanText(item.targetText)
      && cleanText(item.rootPostText || item.grokContext?.summary || item.grokContext?.contextSummary)
      && !/^❤️$/.test(cleanText(item.comment))
    ))
    .sort((a, b) => Date.parse(b.postedAt || b.at || 0) - Date.parse(a.postedAt || a.at || 0))
    .slice(0, Math.max(1, Math.min(100, Number(limit || 30))))
    .map((item, index) => ({
      index,
      at: item.postedAt || item.at || null,
      rootPostUrl: item.rootPostUrl || "",
      rootPostText: cleanText(item.rootPostText || item.grokContext?.summary || item.grokContext?.contextSummary),
      targetUrl: item.targetUrl || "",
      targetText: cleanText(item.targetText),
      draft: cleanText(item.grokComment || item.comment),
      a: cleanText(item.comment),
    }));
}

function noAiSlopEditorPrompt(samples) {
  const blocks = samples.map((item) => [
    `### index=${item.index}`,
    `- 부모 원글: ${item.rootPostText}`,
    `- 답글 대상 댓글: ${item.targetText}`,
    `- 교정할 생성 초안: ${item.draft}`,
  ].join("\n")).join("\n\n");
  return [
    "너는 @terafabXai의 짧은 한국어 X 대댓글을 다듬는 편집자다.",
    "아래 A안을 실제로 게시하지 않는 섀도 B안으로 교정해라.",
    "각 댓글의 의미, 구체적 장면, 거친 말맛, 유머와 말투를 보존하고 최소한만 고쳐라.",
    "이미 자연스럽고 구체적인 문장은 keep하고 그대로 반환해라.",
    "rewrite 기준: 중복 단어, 번역체, 설명조, 범용 감탄, 원문 재진술, 로봇 같은 문장 모양, 같은 부모 원글에서 반복되는 명사·어미·문장 틀.",
    "같은 부모 원글에서 생성 초안이 같거나 핵심 표현이 반복되면 가장 자연스러운 한 건만 유지하고 나머지는 답글 대상 댓글의 표현을 받아쳐 서로 다르게 rewrite해라.",
    "decision이 rewrite이면 shadow_reply는 반드시 생성 초안과 실제로 달라야 한다. 다르게 고치지 않았다면 keep으로 표시해라.",
    "답글 대상 댓글에 직접 맞장구치고, 부모 원글이나 대상 댓글에 없는 사실·행동·감정·수치·원인을 추가하지 마라.",
    "한국어 한 줄, 8~45자. 링크, 해시태그, 이모지, 따옴표, 후보 목록을 넣지 마라.",
    "같은 부모 원글의 여러 항목은 함께 보고 서로 비슷한 댓글이 되지 않게 하되, 억지로 다른 말을 만들지 마라.",
    "반드시 JSON 배열 한 줄만 출력해라.",
    '형식: [{"index":0,"shadow_reply":"댓글","decision":"keep|rewrite","patterns":["짧은 패턴명"],"reason":"짧은 이유"}]',
    "",
    blocks,
  ].join("\n");
}

function noAiSlopBlindJudgePrompt(samples, edits) {
  const byIndex = new Map(edits.map((item) => [Number(item.index), item]));
  const blocks = samples.map((item) => {
    const edit = byIndex.get(item.index);
    const b = cleanText(edit?.shadow_reply);
    const order = stableVariantOrder(item.index, item.targetUrl);
    const option1 = order === "ab" ? item.a : b;
    const option2 = order === "ab" ? b : item.a;
    return [
      `### index=${item.index}`,
      `- 부모 원글: ${item.rootPostText}`,
      `- 답글 대상 댓글: ${item.targetText}`,
      `- 선택지 1: ${option1}`,
      `- 선택지 2: ${option2}`,
    ].join("\n");
  }).join("\n\n");
  return [
    "너는 짧은 한국어 X 대댓글의 블라인드 품질 심사자다.",
    "각 index에서 선택지 1과 2 중 실제 사람이 문맥을 보고 쓴 것처럼 더 자연스럽고 구체적인 문장을 고르거나 완전히 같으면 tie로 표시해라.",
    "평가 기준: 부모 원글과 답글 대상 문맥 일치, 자연스러운 대화체, 구체성, 간결성, 비AI 말투.",
    "원문에 없는 사실을 추가한 선택지는 고르지 마라. 표현만 다르다고 가점을 주지 마라.",
    "후보를 수정하거나 새로 쓰지 마라.",
    "반드시 JSON 배열 한 줄만 출력해라.",
    '형식: [{"index":0,"choice":"1|2|tie","reason":"짧은 이유"}]',
    "",
    blocks,
  ].join("\n");
}

function extractJsonArray(raw) {
  const text = String(raw || "").trim();
  const candidates = [
    text,
    ...Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi), (match) => match[1].trim()),
  ];
  for (const candidate of candidates) {
    const start = candidate.indexOf("[");
    const end = candidate.lastIndexOf("]");
    if (start < 0 || end <= start) continue;
    try {
      const parsed = JSON.parse(candidate.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  throw new Error(`Gemini JSON 배열 파싱 실패: ${text.slice(0, 500)}`);
}

function normalizeEdits(samples, rawRows) {
  const sampleIndexes = new Set(samples.map((item) => item.index));
  const rows = new Map();
  for (const row of Array.isArray(rawRows) ? rawRows : []) {
    const index = Number(row?.index);
    if (!sampleIndexes.has(index) || rows.has(index)) continue;
    const shadowReply = cleanText(row.shadow_reply || row.shadowReply);
    if (!shadowReply) continue;
    rows.set(index, {
      index,
      shadow_reply: shadowReply,
      decision: row.decision === "keep" ? "keep" : "rewrite",
      patterns: Array.isArray(row.patterns) ? row.patterns.map(cleanText).filter(Boolean).slice(0, 8) : [],
      reason: cleanText(row.reason),
    });
  }
  if (rows.size !== samples.length) {
    throw new Error(`Gemini 섀도 교정 결과 누락: expected=${samples.length}, actual=${rows.size}`);
  }
  return samples.map((item) => rows.get(item.index));
}

function normalizeJudgments(samples, rawRows) {
  const sampleIndexes = new Set(samples.map((item) => item.index));
  const rows = new Map();
  for (const row of Array.isArray(rawRows) ? rawRows : []) {
    const index = Number(row?.index);
    if (!sampleIndexes.has(index) || rows.has(index)) continue;
    const choice = String(row.choice || "").toLowerCase();
    if (!["1", "2", "tie"].includes(choice)) continue;
    rows.set(index, { index, choice, reason: cleanText(row.reason) });
  }
  if (rows.size !== samples.length) {
    throw new Error(`Gemini 블라인드 심사 결과 누락: expected=${samples.length}, actual=${rows.size}`);
  }
  return samples.map((item) => rows.get(item.index));
}

function buildShadowReport(samples, edits, judgments) {
  const editByIndex = new Map(edits.map((item) => [item.index, item]));
  const judgeByIndex = new Map(judgments.map((item) => [item.index, item]));
  const rows = samples.map((sample) => {
    const edit = editByIndex.get(sample.index);
    const judgment = judgeByIndex.get(sample.index);
    const order = stableVariantOrder(sample.index, sample.targetUrl);
    const winner = judgment.choice === "tie"
      ? "tie"
      : (order === "ab" ? (judgment.choice === "1" ? "a" : "b") : (judgment.choice === "1" ? "b" : "a"));
    return {
      ...sample,
      b: edit.shadow_reply,
      editDecision: edit.decision,
      patterns: edit.patterns,
      editReason: edit.reason,
      blindOrder: order,
      blindChoice: judgment.choice,
      winner,
      judgeReason: judgment.reason,
    };
  });
  const counts = rows.reduce((acc, row) => {
    acc[row.winner] = (acc[row.winner] || 0) + 1;
    if (row.draft === row.b) acc.unchanged += 1;
    return acc;
  }, { a: 0, b: 0, tie: 0, unchanged: 0 });
  return {
    generatedAt: new Date().toISOString(),
    mode: "shadow_only_no_post",
    sampleCount: rows.length,
    counts,
    rows,
  };
}

function markdownReport(report) {
  const lines = [
    "# No-AI-Slop 댓글 섀도 A/B",
    "",
    `- 생성: ${report.generatedAt}`,
    `- 표본: ${report.sampleCount}건`,
    "- 게시: 안 함",
    `- A 승: ${report.counts.a} · B 승: ${report.counts.b} · 동률: ${report.counts.tie} · 무변경: ${report.counts.unchanged}`,
    "",
    "| # | 생성 초안 | A 기존 검수 | B 노슬롭 섀도 | 승자 | 교정 사유 |",
    "|---:|---|---|---|:---:|---|",
  ];
  for (const row of report.rows) {
    const cell = (value) => cleanText(value).replace(/\|/g, "\\|");
    lines.push(`| ${row.index + 1} | ${cell(row.draft)} | ${cell(row.a)} | ${cell(row.b)} | ${row.winner.toUpperCase()} | ${cell(row.editReason || row.judgeReason)} |`);
  }
  return `${lines.join("\n")}\n`;
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout = "", stderr = "") => {
      if (error) {
        error.message = [error.message, stderr, stdout].filter(Boolean).join("\n");
        reject(error);
      } else resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

async function runGeminiPrompt(promptPath, outPath, port) {
  return execFileAsync(process.execPath, [
    GEMINI_SCRIPT,
    "--prompt", promptPath,
    "--out", outPath,
    "--cdp", `http://127.0.0.1:${port}`,
    "--min-length", "20",
  ], {
    cwd: PROJECT_DIR,
    timeout: 12 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, TERAFABX_GEMINI_SCRIPT_TIMEOUT_MS: "600000" },
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Math.max(1, Math.min(100, Number(args.limit || 30)));
  const port = Number(args.port || DEFAULT_PORT);
  const profileDir = path.resolve(args.profile || DEFAULT_PROFILE_DIR);
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  const samples = recentPostedCommentSamples(state, limit);
  if (samples.length !== limit) throw new Error(`섀도 표본 부족: expected=${limit}, actual=${samples.length}`);

  const runId = `no-ai-slop-shadow-${new Date().toISOString().replace(/[:.]/g, "-")}-${limit}`;
  const runDir = path.join(RUN_ROOT, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const editPromptPath = path.join(runDir, "edit-prompt.md");
  const editOutPath = path.join(runDir, "edit-output.txt");
  const judgePromptPath = path.join(runDir, "judge-prompt.md");
  const judgeOutPath = path.join(runDir, "judge-output.txt");
  fs.writeFileSync(editPromptPath, noAiSlopEditorPrompt(samples));

  let cleanup = null;
  try {
    await ensureTerafabxGeminiHeadlessBrowser({ port, profileDir });
    await runGeminiPrompt(editPromptPath, editOutPath, port);
    const edits = normalizeEdits(samples, extractJsonArray(fs.readFileSync(editOutPath, "utf8")));
    fs.writeFileSync(judgePromptPath, noAiSlopBlindJudgePrompt(samples, edits));
    await runGeminiPrompt(judgePromptPath, judgeOutPath, port);
    const judgments = normalizeJudgments(samples, extractJsonArray(fs.readFileSync(judgeOutPath, "utf8")));
    const report = buildShadowReport(samples, edits, judgments);
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const jsonPath = path.join(REPORT_DIR, `${runId}.json`);
    const markdownPath = path.join(REPORT_DIR, `${runId}.md`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownPath, markdownReport(report));
    process.stdout.write(`${JSON.stringify({ ok: true, jsonPath, markdownPath, ...report.counts, sampleCount: report.sampleCount })}\n`);
  } finally {
    cleanup = await closeTerafabxGeminiHeadlessBrowser({ port, profileDir }).catch((error) => ({ error: error.message }));
    fs.writeFileSync(path.join(runDir, "cleanup.json"), `${JSON.stringify(cleanup, null, 2)}\n`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildShadowReport,
  extractJsonArray,
  markdownReport,
  noAiSlopBlindJudgePrompt,
  noAiSlopEditorPrompt,
  normalizeEdits,
  normalizeJudgments,
  recentPostedCommentSamples,
  stableVariantOrder,
};
