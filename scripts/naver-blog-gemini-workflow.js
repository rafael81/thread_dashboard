#!/usr/bin/env node
"use strict";

/**
 * Source-code only Naver Blog workflow runner for the thread_download dashboard.
 *
 * Invariants:
 * - No Hermes cron/job API is used.
 * - No non-Gemini LLM is called for article body writing.
 * - Browser automation must use the dedicated Naver profile/port supplied by the server.
 * - Publishing is not performed; the downstream writer must save a SmartEditor draft only.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; i += 1; }
  }
  return args;
}

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label} 파일을 찾지 못했습니다: ${filePath}`);
  return filePath;
}

function assertGeminiOnly() {
  const writer = String(process.env.NAVER_BLOG_WRITER || "gemini-web-only").toLowerCase();
  if (!["gemini-web-only", "gemini"].includes(writer)) {
    throw new Error(`Gemini Web 외 LLM은 금지입니다. NAVER_BLOG_WRITER=${writer}`);
  }
  const banned = ["grok", "openai", "claude", "codex-body", "hermes-body"];
  if (banned.some((word) => writer.includes(word))) {
    throw new Error(`본문 작성자는 Gemini Web만 허용됩니다: ${writer}`);
  }
}

function parseLatestJsonLine(text) {
  const lines = String(text || "").trim().split("\n").reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch {}
  }
  return null;
}

async function main() {
  assertGeminiOnly();
  const args = parseArgs(process.argv);
  const adpostRoot = process.env.NAVER_BLOG_ADPOST_ROOT || "/Users/user/Documents/adpost";
  const chromePort = Number(process.env.NAVER_BLOG_CHROME_PORT || 9233);
  const source = String(args.source || "manual");

  const dataScript = requireFile(path.join(adpostRoot, "scripts", "data_driven_blog_ops.py"), "검색수요 후보 스크립트");
  const geminiScript = requireFile(path.join(adpostRoot, "scripts", "gemini_custom_prompt.js"), "Gemini Web 프롬프트 스크립트");
  const writerScriptCandidates = [
    path.join(adpostRoot, "scripts", "naver_blog_gemini_draft_once.js"),
    path.join(adpostRoot, "scripts", "write_naver_blog_rich_draft.js"),
  ];
  const writerScript = writerScriptCandidates.find((candidate) => fs.existsSync(candidate));
  if (!writerScript) {
    throw new Error(`SmartEditor 임시저장 스크립트를 찾지 못했습니다. 후보: ${writerScriptCandidates.join(", ")}`);
  }

  const runId = `dashboard-naver-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runDir = path.join(process.cwd(), ".data", "naver-blog-runs", runId);
  fs.mkdirSync(runDir, { recursive: true });

  const candidates = await run("python3", [dataScript, "--limit", "24", "--json"], { cwd: adpostRoot });
  fs.writeFileSync(path.join(runDir, "candidates.stdout.txt"), candidates.stdout);
  fs.writeFileSync(path.join(runDir, "candidates.stderr.txt"), candidates.stderr);
  if (candidates.code !== 0) throw new Error(candidates.stderr || candidates.stdout || "검색수요 후보 산출 실패");

  const candidateJson = parseLatestJsonLine(candidates.stdout) || {};
  const scoreboard = candidateJson.scoreboard || candidateJson.candidates || [];
  const picked = Array.isArray(scoreboard)
    ? scoreboard.find((item) => item.decision === "PUBLISH_CANDIDATE") || scoreboard[0]
    : null;
  const title = picked?.recommended_title || picked?.title || picked?.topic || "검색수요 기반 네이버 블로그 임시글";

  const geminiPrompt = [
    "네이버 블로그 초안 작성 요청입니다.",
    "작성자는 반드시 Gemini Web입니다. 다른 LLM 문체나 출처를 언급하지 마세요.",
    `주제/제목: ${title}`,
    "조건: 한국어, 모바일 가독성, 짧은 문단, 중앙 정렬에 맞게 섹션 구분, 발행 금지, 임시저장용 초안.",
    "대표 이미지는 제목 바로 아래 들어갈 예정입니다. 본문은 이미지 위치 설명 없이 글 자체만 작성하세요.",
  ].join("\n");
  fs.writeFileSync(path.join(runDir, "gemini_prompt.md"), geminiPrompt);

  const geminiOutPath = path.join(runDir, "gemini_draft.txt");
  const gemini = await run("node", [geminiScript, "--prompt", path.join(runDir, "gemini_prompt.md"), "--out", geminiOutPath, "--cdp", `http://127.0.0.1:${chromePort}`], {
    cwd: adpostRoot,
    env: { NAVER_BLOG_WRITER: "gemini-web-only" },
  });
  fs.writeFileSync(path.join(runDir, "gemini.stdout.txt"), gemini.stdout);
  fs.writeFileSync(path.join(runDir, "gemini.stderr.txt"), gemini.stderr);
  if (gemini.code !== 0) throw new Error(gemini.stderr || gemini.stdout || "Gemini Web 초안 회수 실패");
  if (!fs.existsSync(geminiOutPath)) throw new Error("Gemini Web 초안 출력 파일이 생성되지 않았습니다.");

  const draftText = fs.readFileSync(geminiOutPath, "utf8").trim();
  const packPath = path.join(runDir, "pack.json");
  fs.writeFileSync(packPath, JSON.stringify({
    title,
    source,
    writer: "gemini-web-only",
    body: draftText,
    blocks: [
      { type: "center_text", text: draftText },
      { type: "tags", text: "#네이버블로그 #검색수요 #Gemini" },
    ],
  }, null, 2));

  let saveResult = null;
  if (path.basename(writerScript) === "write_naver_blog_rich_draft.js") {
    saveResult = await run("node", [writerScript, "--cdp", `http://127.0.0.1:${chromePort}`, "--fresh", "--execute", "--save", "--pack", packPath, "--no-images"], { cwd: adpostRoot });
  } else {
    saveResult = await run("node", [writerScript, "--cdp", `http://127.0.0.1:${chromePort}`, "--pack", packPath, "--save"], { cwd: adpostRoot });
  }
  fs.writeFileSync(path.join(runDir, "save.stdout.txt"), saveResult.stdout);
  fs.writeFileSync(path.join(runDir, "save.stderr.txt"), saveResult.stderr);
  if (saveResult.code !== 0) throw new Error(saveResult.stderr || saveResult.stdout || "SmartEditor 임시저장 실패");

  const parsedSave = parseLatestJsonLine(saveResult.stdout) || {};
  const result = {
    ok: true,
    runId,
    runDir,
    source,
    writer: "gemini-web-only",
    chromePort,
    title: parsedSave?.after?.titleText || title,
    logNo: parsedSave?.logNo || null,
    published: false,
    saved: parsedSave?.saved !== false,
    candidate: picked ? { topic: picked.topic, decision: picked.decision, score: picked.scores?.total } : null,
    verification: {
      hermesCronUsed: false,
      geminiOnly: true,
      newBrowserProfilePort: chromePort,
    },
  };
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
