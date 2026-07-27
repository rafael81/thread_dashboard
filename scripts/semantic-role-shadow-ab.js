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
const DEFAULT_PORT = 9294;
const DEFAULT_PROFILE_DIR = path.join(PROJECT_DIR, ".data", "chrome-profiles", "terafabx-gemini-semantic-shadow");
const KNOWN_BAD_REPLY = "체온계 대신 품고 출근해야겠네";

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

function selectSamples(state, limit) {
  const candidates = (Array.isArray(state?.ownPostReplyHistory) ? state.ownPostReplyHistory : [])
    .filter((item) => cleanText(item.comment) && cleanText(item.targetText) && cleanText(item.rootPostText))
    .sort((a, b) => Date.parse(b.postedAt || b.at || 0) - Date.parse(a.postedAt || a.at || 0));
  const knownBad = candidates.find((item) => cleanText(item.comment) === KNOWN_BAD_REPLY);
  const selected = [
    ...(knownBad ? [knownBad] : []),
    ...candidates.filter((item) => item !== knownBad),
  ].slice(0, limit);
  return selected.map((item, index) => ({
    index,
    postedAt: item.postedAt || item.at || null,
    rootPostUrl: item.rootPostUrl || "",
    rootPostText: cleanText(item.rootPostText),
    targetUrl: item.targetUrl || "",
    targetText: cleanText(item.targetText),
    reply: cleanText(item.comment),
    contextSummary: cleanText(item.grokContext?.summary || item.grokContext?.contextSummary),
    aPassed: item.geminiReview?.finalJudge?.passed === true,
    aScore: Number(item.geminiReview?.finalJudge?.score || 0),
    aReason: cleanText(item.geminiReview?.finalJudge?.reason),
    knownBad: cleanText(item.comment) === KNOWN_BAD_REPLY,
  }));
}

function semanticJudgePrompt(samples) {
  const blocks = samples.map((item) => [
    `### index=${item.index}`,
    `- 부모 원글: ${item.rootPostText}`,
    `- 답글 대상 댓글: ${item.targetText}`,
    `- 원문·미디어 분석: ${item.contextSummary || "제공 없음"}`,
    `- 심사할 대댓글: ${item.reply}`,
  ].join("\n")).join("\n\n");
  return [
    "너는 실제 게시를 하지 않는 X 대댓글 섀도 품질 심사자다.",
    "각 항목에서 심사할 대댓글이 답글 대상 댓글에 의미상 직접 반응하는지 엄격히 평가해라.",
    "판정 전에 반드시 ① 대상 댓글의 핵심 주장/질문 ② 대댓글에서 생략된 주어·목적어 ③ 주체-행동-대상 관계 ④ '대신/처럼/해서/그러니'가 만든 대체·비유·인과관계를 내부적으로 복원해라.",
    "semantic_role_error: 사람·동물·물건·도구의 의미 역할을 뒤바꾼 경우 true다.",
    "'A 대신 B'라고 썼다면 B가 A의 실제 기능을 수행할 수 있어야 한다. 기능이 다르면 가벼운 농담이어도 semantic_role_error=true다.",
    "실패 예: 대상 댓글이 '앵무새는 원래 체온이 높은가요?'이고 대댓글이 '체온계 대신 품고 출근해야겠네'라면 reject다. 생략된 목적어인 앵무새는 열을 가진 동물이지 체온을 재는 도구가 아니어서 체온계를 대신할 수 없다.",
    "통과 예: 같은 대상에 '40도면 품에 안고 있으면 따뜻하겠네요'는 동물의 높은 체온과 따뜻함의 관계가 성립하므로 이 세 오류만 놓고 보면 pass다.",
    "direct_response_error: 대상 댓글의 질문·주장·감정에 답하지 않고 부모 원글의 다른 농담만 이어가면 true다.",
    "logical_leap_error: 단어 연상만으로 원문에 없는 용도·행동·인과관계를 만들면 true다.",
    "부모 원글의 농담과 표면적으로 관련 있다는 이유만으로 통과시키지 마라. 문장 안의 주체·대상·도구·행동 관계가 논리적으로 성립해야 한다.",
    "세 오류 중 하나라도 true이면 decision=reject, 모두 false이면 decision=pass다.",
    "댓글을 새로 쓰거나 수정하지 마라.",
    "반드시 JSON 배열 한 줄만 출력해라.",
    '형식: [{"index":0,"target_claim":"대상 댓글의 핵심","reply_relation":"복원한 주체-행동-대상 관계","role_check":"역할·대체·인과 검증","semantic_role_error":false,"direct_response_error":false,"logical_leap_error":false,"decision":"pass|reject","reason":"짧은 이유"}]',
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

function normalizeResults(samples, rows) {
  const expected = new Set(samples.map((item) => item.index));
  const byIndex = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const index = Number(row?.index);
    if (!expected.has(index) || byIndex.has(index)) continue;
    const flags = {
      semantic_role_error: row.semantic_role_error === true,
      direct_response_error: row.direct_response_error === true,
      logical_leap_error: row.logical_leap_error === true,
    };
    byIndex.set(index, {
      index,
      ...flags,
      decision: Object.values(flags).some(Boolean) ? "reject" : "pass",
      reason: cleanText(row.reason),
    });
  }
  if (byIndex.size !== samples.length) {
    throw new Error(`Gemini 섀도 심사 결과 누락: expected=${samples.length}, actual=${byIndex.size}`);
  }
  return samples.map((item) => byIndex.get(item.index));
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout = "", stderr = "") => {
      if (error) {
        error.message = [error.message, stderr, stdout].filter(Boolean).join("\n");
        reject(error);
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      }
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

function markdownReport(report) {
  const lines = [
    "# 댓글 의미관계 최종검수 섀도 A/B",
    "",
    `- 생성: ${report.generatedAt}`,
    `- 표본: ${report.sampleCount}건`,
    "- 게시: 안 함",
    `- A(기존) 거절: ${report.counts.aRejected} · B(강화) 거절: ${report.counts.bRejected}`,
    `- B 신규 탐지: ${report.counts.newlyRejected} · B 회귀 의심: ${report.counts.regressionSuspects}`,
    `- 알려진 실패 사례 탐지: ${report.knownBadDetected ? "성공" : "실패"}`,
    "",
    "| # | 대상 댓글 | 실제 대댓글 | A | B | B 사유 |",
    "|---:|---|---|:---:|:---:|---|",
  ];
  const cell = (value) => cleanText(value).replace(/\|/g, "\\|");
  for (const row of report.rows) {
    lines.push(`| ${row.index + 1} | ${cell(row.targetText)} | ${cell(row.reply)} | ${row.aPassed ? "PASS" : "REJECT"} | ${row.bDecision.toUpperCase()} | ${cell(row.bReason)} |`);
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const limit = Math.max(1, Math.min(100, Number(args.limit || 30)));
  const chunkSize = Math.max(1, Math.min(15, Number(args.chunk || 10)));
  const port = Number(args.port || DEFAULT_PORT);
  const profileDir = path.resolve(args.profile || DEFAULT_PROFILE_DIR);
  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  const samples = selectSamples(state, limit);
  if (samples.length !== limit) throw new Error(`섀도 표본 부족: expected=${limit}, actual=${samples.length}`);
  if (!samples.some((item) => item.knownBad)) throw new Error("알려진 의미역할 실패 사례가 표본에 없습니다.");

  const runId = `semantic-role-shadow-${new Date().toISOString().replace(/[:.]/g, "-")}-${limit}`;
  const runDir = path.join(RUN_ROOT, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const allResults = [];
  try {
    await ensureTerafabxGeminiHeadlessBrowser({ port, profileDir });
    for (let offset = 0; offset < samples.length; offset += chunkSize) {
      const chunk = samples.slice(offset, offset + chunkSize);
      const promptPath = path.join(runDir, `prompt-${offset}.md`);
      const outPath = path.join(runDir, `output-${offset}.txt`);
      fs.writeFileSync(promptPath, semanticJudgePrompt(chunk));
      await runGeminiPrompt(promptPath, outPath, port);
      allResults.push(...normalizeResults(chunk, extractJsonArray(fs.readFileSync(outPath, "utf8"))));
    }
    const resultByIndex = new Map(allResults.map((item) => [item.index, item]));
    const rows = samples.map((sample) => {
      const b = resultByIndex.get(sample.index);
      return {
        ...sample,
        bDecision: b.decision,
        bReason: b.reason,
        bFlags: {
          semanticRoleError: b.semantic_role_error,
          directResponseError: b.direct_response_error,
          logicalLeapError: b.logical_leap_error,
        },
      };
    });
    const counts = {
      aRejected: rows.filter((row) => !row.aPassed).length,
      bRejected: rows.filter((row) => row.bDecision === "reject").length,
      newlyRejected: rows.filter((row) => row.aPassed && row.bDecision === "reject").length,
      regressionSuspects: rows.filter((row) => !row.aPassed && row.bDecision === "pass").length,
    };
    const report = {
      generatedAt: new Date().toISOString(),
      mode: "shadow_only_no_post",
      sampleCount: rows.length,
      knownBadDetected: rows.some((row) => row.knownBad && row.bDecision === "reject"),
      counts,
      rows,
    };
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const jsonPath = path.join(REPORT_DIR, `${runId}.json`);
    const markdownPath = path.join(REPORT_DIR, `${runId}.md`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(markdownPath, markdownReport(report));
    process.stdout.write(`${JSON.stringify({ ok: report.knownBadDetected, jsonPath, markdownPath, ...counts, sampleCount: rows.length, knownBadDetected: report.knownBadDetected })}\n`);
    if (!report.knownBadDetected) process.exitCode = 2;
  } finally {
    const cleanup = await closeTerafabxGeminiHeadlessBrowser({ port, profileDir }).catch((error) => ({ error: error.message }));
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
  extractJsonArray,
  normalizeResults,
  selectSamples,
  semanticJudgePrompt,
};
