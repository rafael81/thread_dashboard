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
    const timeoutMs = Number(options.timeoutMs || 0);
    const timer = timeoutMs > 0 ? setTimeout(() => {
      stderr += `\nCommand timed out after ${timeoutMs}ms: ${command} ${args.join(" ")}`;
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
      resolve({ code: code ?? (signal ? 124 : 0), signal, stdout, stderr });
    });
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
  const source = String(text || "").trim();
  try { return JSON.parse(source); } catch {}
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try { return JSON.parse(source.slice(firstBrace, lastBrace + 1)); } catch {}
  }
  const lines = source.split("\n").reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch {}
  }
  return null;
}

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function fileAgeMs(filePath) {
  try { return Date.now() - fs.statSync(filePath).mtimeMs; } catch { return Infinity; }
}

function candidateListFromJson(candidateJson) {
  const candidates = candidateJson?.scoreboard || candidateJson?.candidates || candidateJson?.top || [];
  return Array.isArray(candidates) ? candidates : [];
}

function candidateTitle(candidate) {
  return String(candidate?.recommended_title || candidate?.title || candidate?.topic || "").trim();
}

function candidateScore(candidate) {
  const score = candidate?.scores?.total ?? candidate?.score;
  return Number.isFinite(Number(score)) ? Number(score) : null;
}

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/경우의\s*수/g, "경우의수")
    .replace(/1\s*등/g, "1등")
    .replace(/당첨지역까지/g, "당첨지역")
    .replace(/까지\b/g, "")
    .replace(/[^0-9a-z가-힣]+/g, " ")
    .trim();
}

const DUPLICATE_STOPWORDS = new Set([
  "정리", "최신", "흐름과", "흐름", "체크", "포인트", "지금", "확인해야", "핵심", "한번에", "한", "번에",
  "방법", "이유", "근황", "2026", "보기", "보는", "좋은", "활용", "순서",
]);

function titleTokens(title) {
  return normalizeTitle(title)
    .split(/\s+/)
    .filter((token) => token && token.length > 1 && !DUPLICATE_STOPWORDS.has(token));
}

function titleKeyPhrases(title) {
  const normalized = normalizeTitle(title);
  const phrases = new Set();
  const patterns = [
    /32강\s+경우의수/g,
    /로또\s+당첨번호/g,
    /로또\s+1등\s+당첨지역/g,
    /1등\s+당첨지역/g,
    /하트시그널\s+출연자\s+결혼/g,
    /같이삽시다\s+출연자\s+고백/g,
    /부업\s+현실/g,
    /ai\s+도구\s+추천/g,
    /구글\s+ai\s+신기능/g,
    /비오는날데이트\s+코스/g,
    /7월\s+재산세/g,
  ];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) phrases.add(match[0].replace(/\s+/g, " "));
  }
  return phrases;
}

function duplicateSimilarity(a, b) {
  const aNorm = normalizeTitle(a);
  const bNorm = normalizeTitle(b);
  if (!aNorm || !bNorm) return { duplicate: false, score: 0, reason: "empty" };
  if (aNorm === bNorm || aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    return { duplicate: true, score: 1, reason: "normalized-title-match" };
  }
  const aPhrases = titleKeyPhrases(a);
  const bPhrases = titleKeyPhrases(b);
  for (const phrase of aPhrases) {
    if (bPhrases.has(phrase)) return { duplicate: true, score: 0.95, reason: `key-phrase:${phrase}` };
  }
  const aTokens = new Set(titleTokens(a));
  const bTokens = new Set(titleTokens(b));
  const intersection = [...aTokens].filter((token) => bTokens.has(token));
  const union = new Set([...aTokens, ...bTokens]);
  const score = union.size ? intersection.length / union.size : 0;
  const hasStrongOverlap = intersection.length >= 3 || (intersection.includes("32강") && intersection.includes("경우의수"));
  return { duplicate: score >= 0.42 || hasStrongOverlap, score, reason: `token-overlap:${intersection.join(",")}` };
}

function collectExistingNaverBlogTitles(adpostRoot, runRoot) {
  const titles = [];
  const pushTitle = (title, source) => {
    const clean = String(title || "").trim();
    if (clean && !titles.some((item) => item.title === clean)) titles.push({ title: clean, source });
  };
  const readJson = (filePath) => {
    try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
  };

  const performance = readJson(path.join(adpostRoot, "system", "published-performance.json"));
  for (const item of performance?.recent_visibility || []) pushTitle(item.title, "published-performance");

  const reportPath = path.join(adpostRoot, "system", "daily-topic-report.md");
  try {
    const report = fs.readFileSync(reportPath, "utf8");
    const existingSection = report.split(/## 최근 발행글 검색 노출 점검/)[0].split(/## 기존 글 회생 후보/)[1] || "";
    for (const match of existingSection.matchAll(/^###\s+\d+\.\s+(.+)$/gm)) pushTitle(match[1], "daily-topic-existing");
  } catch {}

  const state = readJson(path.join(runRoot, ".data", "naver-blog-ops-state.json"));
  for (const run of state?.recentRuns || []) pushTitle(run.title, "thread-download-recent-run");
  pushTitle(state?.lastRun?.title, "thread-download-last-run");

  const runsDir = path.join(runRoot, ".data", "naver-blog-runs");
  try {
    for (const entry of fs.readdirSync(runsDir).slice(-80)) {
      const pack = readJson(path.join(runsDir, entry, "pack.json"));
      pushTitle(pack?.title, "thread-download-run-pack");
    }
  } catch {}

  const adpostRunsDir = path.join(adpostRoot, "runs");
  try {
    const stack = [adpostRunsDir];
    while (stack.length) {
      const dir = stack.pop();
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/pack\d*\.json$/i.test(entry.name)) pushTitle(readJson(full)?.title, "adpost-run-pack");
      }
    }
  } catch {}
  return titles;
}

function duplicateCandidate(candidate, existingTitles) {
  const title = candidateTitle(candidate);
  for (const existing of existingTitles) {
    const similarity = duplicateSimilarity(title, existing.title);
    if (similarity.duplicate) return { duplicate: true, title, existing, similarity };
  }
  return { duplicate: false, title };
}

function fallbackSafeCandidates() {
  return [
    "장마철 집안 곰팡이 냄새 제거 방법, 습기 많은 날 관리 순서",
    "여름 모기 퇴치 방법, 집안에서 바로 해볼 수 있는 체크 포인트",
    "선풍기 청소 방법, 여름 전에 꼭 확인할 관리 순서",
    "냉장고 냄새 제거 방법, 여름철 음식 냄새 잡는 순서",
    "장마철 신발 냄새 제거 방법, 젖은 운동화 말리는 순서",
    "장마철 우산 보관 방법, 곰팡이 없이 말리는 생활 팁",
    "여름철 보냉백 세척 방법, 피크닉 전 위생 관리 순서",
    "습한 날 침구 관리 방법, 이불 눅눅함 줄이는 환기 순서",
    "여름 물병 세척 방법, 텀블러 냄새 없이 쓰는 관리 팁",
    "장마철 창문 결로 줄이는 방법, 환기와 물기 관리 체크 포인트",
    "여름철 수건 쉰내 제거 방법, 세탁 후 냄새 없이 말리는 순서",
    "장마철 빨래 실내 건조 방법, 꿉꿉한 냄새 줄이는 환기 팁",
    "욕실 실리콘 곰팡이 제거 방법, 다시 생기지 않게 말리는 순서",
    "여름철 배수구 냄새 제거 방법, 주방과 욕실 관리 체크 포인트",
    "장마철 옷장 습기 제거 방법, 옷 냄새와 곰팡이 줄이는 순서",
    "여름철 음식 보관 용기 세척 방법, 기름 냄새 없애는 관리 팁",
    "에어컨 실외기 주변 정리 방법, 냉방 효율 지키는 안전 체크",
    "여름철 베개 세탁 방법, 땀 냄새와 누런 자국 줄이는 순서",
    "장마철 현관 습기 관리 방법, 신발장 곰팡이 줄이는 환기 팁",
    "여름철 주방 행주 삶는 방법, 냄새와 세균 줄이는 관리 순서",
  ].map((title) => ({
    topic: title.replace(/,.+$/, ""),
    recommended_title: title,
    decision: "PUBLISH_CANDIDATE",
    score: 75,
    scores: { total: 75 },
    source: "seasonal_safe_fallback",
  }));
}

function pickFreshSearchDemandCandidate(candidateList, existingTitles) {
  const ordered = candidateList
    .filter(Boolean)
    .sort((a, b) => (candidateScore(b) ?? -1) - (candidateScore(a) ?? -1));
  const skipped = [];
  for (const candidate of ordered) {
    const title = candidateTitle(candidate);
    if (!title) continue;
    if (isGenericPlaceholderTitle(title)) {
      skipped.push({ title, reason: "generic-placeholder" });
      continue;
    }
    if (requiresRealImages(title, candidate)) {
      skipped.push({ title, reason: "requires-real-source-images" });
      continue;
    }
    const dup = duplicateCandidate(candidate, existingTitles);
    if (dup.duplicate) {
      skipped.push({ title, reason: dup.similarity.reason, existingTitle: dup.existing.title, source: dup.existing.source, score: dup.similarity.score });
      continue;
    }
    return { picked: candidate, skipped };
  }
  return { picked: null, skipped };
}

function isGenericPlaceholderTitle(title) {
  return /검색수요\s*기반\s*네이버\s*블로그\s*임시글|네이버\s*블로그\s*임시글|테스트\s*임시글/i.test(String(title || ""));
}

function requireSearchDemandCandidate(picked, title) {
  if (!picked || !title || isGenericPlaceholderTitle(title)) {
    throw new Error(`검색수요 후보 제목이 실제 주제로 선택되지 않아 임시저장을 중단합니다. title=${title || ""}`);
  }
  const score = candidateScore(picked);
  if (score !== null && score < 65) {
    throw new Error(`검색수요 후보 점수가 낮아 임시저장을 중단합니다. title=${title} score=${score}`);
  }
  return true;
}

function requiresRealImages(title, candidate = {}) {
  const text = [title, candidate.topic, candidate.title, candidate.recommended_title].filter(Boolean).join(" ");
  return /(동상이몽|하트시그널|나는솔로|환승연애|같이삽시다|출연자|근황|결혼|고백|방송|배우|가수|연예|문희준|소율)/.test(text);
}

function safeSlug(text) {
  return String(text || "draft")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "draft";
}

function isHeadingLine(line) {
  const text = String(line || "").trim();
  if (!text) return false;
  return /^(\d+[단계.]|\d+\.|[①-⑳]|📌|체크\s*\d+|STEP\s*\d+)/i.test(text)
    || /^(.+?)(정리|방법|순서|차이|포인트|주의사항|활용하기|유지하기|선택법|체크)$/.test(text);
}

function validatePackBeforeSave(pack) {
  const blocks = Array.isArray(pack?.blocks) ? pack.blocks : [];
  const imageIndexes = blocks.map((block, index) => block?.type === "image" ? index : -1).filter((index) => index >= 0);
  if (imageIndexes.length !== 4) throw new Error(`저장 전 QA 실패: 이미지 블록은 정확히 4개여야 합니다. count=${imageIndexes.length}`);
  if (imageIndexes[0] !== 0) throw new Error(`저장 전 QA 실패: 대표 이미지는 첫 블록이어야 합니다. index=${imageIndexes[0]}`);
  for (let i = 1; i < imageIndexes.length; i += 1) {
    if (imageIndexes[i] - imageIndexes[i - 1] < 2) {
      throw new Error(`저장 전 QA 실패: 이미지가 연속 배치되었습니다. indexes=${imageIndexes.join(",")}`);
    }
  }
  const text = blocks.map((block) => String(block?.text || "")).join("\n");
  if (/검색수요/.test(text)) throw new Error("저장 전 QA 실패: 내부용 검색수요 문자열이 포함됐습니다.");
  const standaloneEmoji = text.split("\n").filter(isStandaloneEmojiLine);
  if (standaloneEmoji.length) throw new Error(`저장 전 QA 실패: 단독 이모티콘이 포함됐습니다. ${standaloneEmoji.join(" ")}`);
  if (blocks.at(-1)?.type !== "tags") throw new Error("저장 전 QA 실패: 태그 블록은 마지막이어야 합니다.");
  for (const block of blocks.filter((item) => item?.type === "image")) {
    if (!block.path || !fs.existsSync(block.path) || fs.statSync(block.path).size < 10000) {
      throw new Error(`저장 전 QA 실패: 이미지 파일이 없거나 너무 작습니다. path=${block.path || ""}`);
    }
  }
  return { imageIndexes, imageCount: imageIndexes.length };
}

function buildRichPack({ title, draftText, imagePaths, source }) {
  if (!Array.isArray(imagePaths) || imagePaths.length !== 4) {
    throw new Error(`pack 생성 실패: 이미지 경로는 정확히 4개여야 합니다. count=${imagePaths?.length || 0}`);
  }
  const lines = String(draftText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isStandaloneEmojiLine(line));
  const content = [{ type: "quote", text: `${title} 핵심만 모바일에서 보기 좋게 정리했어요.` }];
  let buffer = [];
  const flush = () => {
    if (buffer.length) {
      content.push({ type: "center_text", text: buffer.join("\n\n") });
      buffer = [];
    }
  };
  for (const line of lines) {
    if (isHeadingLine(line)) {
      flush();
      content.push({ type: "center_heading", text: line.replace(/^#+\s*/, "") });
    } else {
      buffer.push(line);
    }
  }
  flush();
  if (content.length < 4) throw new Error(`pack 생성 실패: 이미지 분산 배치에 필요한 본문 블록이 부족합니다. blocks=${content.length}`);

  // Insert body images around the 25/50/75% content points, in reverse order
  // so earlier insertions do not shift later target indexes.
  const placements = imagePaths.slice(1).map((imagePath, index) => ({
    imagePath,
    index: Math.max(1, Math.min(content.length - 1, Math.round(content.length * (index + 1) / 4))),
  }));
  for (const placement of [...placements].reverse()) {
    content.splice(placement.index, 0, { type: "image", path: placement.imagePath });
  }

  const pack = {
    title,
    source,
    writer: "gemini-web-only",
    blocks: [{ type: "image", path: imagePaths[0] }, ...content, { type: "tags", text: "#생활정보 #살림팁 #생활꿀팁" }],
  };
  validatePackBeforeSave(pack);
  return pack;
}

async function generateAiImages({ title, runDir }) {
  const imageDir = path.join(runDir, "images");
  fs.mkdirSync(imageDir, { recursive: true });
  const slug = safeSlug(title);
  const imagePaths = [
    path.join(imageDir, `${slug}-cover.png`),
    path.join(imageDir, `${slug}-body-1.png`),
    path.join(imageDir, `${slug}-body-2.png`),
    path.join(imageDir, `${slug}-body-3.png`),
  ];
  const approvedCoverReferences = [
    "/Users/user/Documents/adpost/runs/update-3draft-images-20260709-100030/airfryer/images/airfryer-cleaning-cover.png",
    "/Users/user/Documents/adpost/runs/update-3draft-images-20260709-100030/summer-bottle/images/summer-bottle-cleaning-cover.png",
    "/Users/user/Documents/adpost/runs/update-3draft-images-20260709-100030/humid-bedding/images/humid-bedding-cover.png",
  ].filter((filePath) => fs.existsSync(filePath));
  const prompt = `Use GPT Image 2 / gpt-image-2 built-in image_gen to generate four real PNG image files for a Korean Naver Blog post. Do not use the REST/CLI fallback. Do not require OPENAI_API_KEY. Do not create HTML, SVG, screenshots, placeholders, mock files, or local font overlays.\n\nPost title: ${title}\n\nFirst inspect these existing approved representative covers and match their integrated image-and-typography style closely:\n${approvedCoverReferences.join("\n")}\n\nImage 1: a finished representative cover image for Naver Blog. GPT Image 2 must create the background, composition, and Korean typography together as one complete image, matching the approved references. Include the exact mobile-readable Korean title text verbatim: \"${title}\". Premium Korean lifestyle/blog style, bright realistic topic photo, large bold dark-navy Korean main phrase with a smaller supporting phrase where appropriate, natural upper-text/lower-photo composition. No outline, no drop shadow, no rounded card, no pink bar, no watermark, no extra words, and no misspelled Korean. Do not add text later with Pillow or any local renderer.\nImage 2: body image, no text, realistic high-quality Korean blog/lifestyle visual that supports the first practical section.\nImage 3: body image, no text, realistic high-quality Korean blog/lifestyle visual that supports the middle checklist section.\nImage 4: body image, no text, realistic high-quality Korean blog/lifestyle visual that supports the final summary/tips section.\n\nSave exactly these absolute PNG paths, creating parent directories if needed:\n${imagePaths.join("\n")}\n\nAfter saving, verify with file(1) or equivalent that all four are PNG images, visually inspect the cover for exact Korean title and approved-reference style, then print only the absolute paths and a short verification.`;
  // Keep image-generation routing independent from Hermes' default reasoning model.
  // The existing Codex OAuth image workflow works through gpt-5.5; inheriting
  // gpt-5.6-sol routes into a local REST helper that incorrectly requires OPENAI_API_KEY.
  const imageCodexModel = process.env.NAVER_BLOG_IMAGE_CODEX_MODEL || "gpt-5.5";
  const result = await run("codex", ["exec", "--model", imageCodexModel, "--config", 'model_reasoning_effort="low"', prompt], { cwd: process.cwd(), timeoutMs: 900000 });
  fs.writeFileSync(path.join(runDir, "imagegen.stdout.txt"), result.stdout);
  fs.writeFileSync(path.join(runDir, "imagegen.stderr.txt"), result.stderr);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "GPT Image 2 이미지 생성 실패");
  for (const filePath of imagePaths) {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 10000) {
      throw new Error(`이미지 생성 파일 검증 실패: ${filePath}`);
    }
  }

  return imagePaths;
}

function isStandaloneEmojiLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return false;
  if (/[0-9A-Za-z가-힣]/.test(trimmed)) return false;
  return /[\p{Extended_Pictographic}\uFE0F]/u.test(trimmed);
}

function sanitizeGeminiDraft(text) {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd());
  const cleaned = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/임시저장.*발행 전.*체크리스트|발행 전.*체크리스트|임시저장.*체크리스트/i.test(trimmed)) break;
    if (/^\[.*(임시저장|초안|Gemini|대표 이미지|이미지).*]$/.test(trimmed)) continue;
    if (/^안녕하세요[!.]?\s*Gemini\s*Web입니다[.!]?$/.test(trimmed)) continue;
    if (/본 글은.*(발행용|임시저장|초안|수정|보완)/.test(trimmed)) continue;
    if (/^(#\S+\s*)+$/.test(trimmed)) continue;
    if (isStandaloneEmojiLine(trimmed)) continue;
    cleaned.push(line);
  }
  return cleaned
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  const scoreboardPath = path.join(adpostRoot, "system", "keyword-scoreboard.json");
  const cacheMaxAgeMs = Number(process.env.NAVER_BLOG_CANDIDATE_CACHE_MAX_AGE_MS || 24 * 60 * 60 * 1000);
  let candidateJson = readJsonFile(scoreboardPath);
  let candidateSource = candidateListFromJson(candidateJson).length ? "cache" : "none";
  if (candidateSource === "cache") {
    fs.writeFileSync(path.join(runDir, "candidates.stdout.txt"), JSON.stringify(candidateJson || {}, null, 2));
    fs.writeFileSync(path.join(runDir, "candidates.stderr.txt"), "");
  }
  if (!candidateListFromJson(candidateJson).length) {
    candidateSource = "live-scan";
    const candidates = await run("python3", [dataScript, "--limit", "24", "--json"], { cwd: adpostRoot, timeoutMs: 45000 });
    fs.writeFileSync(path.join(runDir, "candidates.stdout.txt"), candidates.stdout);
    fs.writeFileSync(path.join(runDir, "candidates.stderr.txt"), candidates.stderr);
    if (candidates.code !== 0) throw new Error(candidates.stderr || candidates.stdout || "검색수요 후보 산출 실패");
    candidateJson = parseLatestJsonLine(candidates.stdout) || {};
  }
  fs.writeFileSync(path.join(runDir, "candidate-source.json"), JSON.stringify({ source: candidateSource, scoreboardPath, cacheAgeMs: fileAgeMs(scoreboardPath), cacheMaxAgeMs, staleCacheAllowed: true }, null, 2));

  const candidateList = [...candidateListFromJson(candidateJson), ...fallbackSafeCandidates()];
  const existingTitles = collectExistingNaverBlogTitles(adpostRoot, process.cwd());
  const { picked, skipped } = pickFreshSearchDemandCandidate(candidateList, existingTitles);
  fs.writeFileSync(path.join(runDir, "duplicate-skip-report.json"), JSON.stringify({ existingTitles, skipped }, null, 2));
  const title = candidateTitle(picked);
  if (!picked) {
    throw new Error(`중복되지 않은 검색수요 후보를 찾지 못해 임시저장을 중단합니다. skipped=${JSON.stringify(skipped).slice(0, 1500)}`);
  }
  requireSearchDemandCandidate(picked, title);
  if (requiresRealImages(title, picked)) {
    throw new Error(`엔터/출연자/근황 주제는 실제 이미지 확보·대표이미지 삽입 QA가 구현되기 전에는 대시보드 자동 임시저장을 중단합니다. title=${title}`);
  }

  const candidateBrief = JSON.stringify({
    title,
    topic: picked.topic || picked.title || null,
    decision: picked.decision || null,
    score: candidateScore(picked),
  }, null, 2);
  const geminiPrompt = [
    "네이버 블로그 초안 작성 요청입니다.",
    "작성자는 반드시 Gemini Web입니다. 다른 LLM 문체나 출처를 언급하지 마세요.",
    `주제/제목: ${title}`,
    `검색수요 후보 데이터: ${candidateBrief}`,
    "반드시 위 주제/제목의 검색 의도를 해결하는 글만 작성하세요. '검색수요 기반 네이버 블로그 임시글' 같은 일반론 제목/본문은 금지합니다.",
    "조건: 한국어, 모바일 가독성, 짧은 문단, 중앙 정렬에 맞게 섹션 구분, 발행 금지.",
    "대표 이미지는 제목 바로 아래 들어갈 예정입니다. 본문은 이미지 위치 설명 없이 글 자체만 작성하세요.",
    "출력 금지: 작성자 소개, Gemini 언급, 초안/임시저장 안내, 발행 전 체크리스트, 대표 이미지 자리 표시자, 해시태그.",
  ].join("\n");
  fs.writeFileSync(path.join(runDir, "gemini_prompt.md"), geminiPrompt);

  const geminiOutPath = path.join(runDir, "gemini_draft.txt");
  const gemini = await run("node", [geminiScript, "--prompt", path.join(runDir, "gemini_prompt.md"), "--out", geminiOutPath, "--cdp", `http://127.0.0.1:${chromePort}`], {
    cwd: adpostRoot,
    env: { NAVER_BLOG_WRITER: "gemini-web-only" },
    timeoutMs: 300000,
  });
  fs.writeFileSync(path.join(runDir, "gemini.stdout.txt"), gemini.stdout);
  fs.writeFileSync(path.join(runDir, "gemini.stderr.txt"), gemini.stderr);
  if (gemini.code !== 0) throw new Error(gemini.stderr || gemini.stdout || "Gemini Web 초안 회수 실패");
  if (!fs.existsSync(geminiOutPath)) throw new Error("Gemini Web 초안 출력 파일이 생성되지 않았습니다.");

  const rawDraftText = fs.readFileSync(geminiOutPath, "utf8").trim();
  const draftText = sanitizeGeminiDraft(rawDraftText);
  fs.writeFileSync(path.join(runDir, "gemini_draft_sanitized.txt"), draftText);
  if (draftText.length < 300) {
    throw new Error(`Gemini Web 초안이 정리 후 너무 짧아 저장하지 않습니다. length=${draftText.length}`);
  }
  const imagePaths = await generateAiImages({ title, runDir });
  const pack = buildRichPack({ title, draftText, imagePaths, source });
  const packPath = path.join(runDir, "pack.json");
  fs.writeFileSync(packPath, JSON.stringify(pack, null, 2));

  let saveResult = null;
  if (path.basename(writerScript) === "write_naver_blog_rich_draft.js") {
    saveResult = await run("node", [writerScript, "--cdp", `http://127.0.0.1:${chromePort}`, "--fresh", "--execute", "--save", "--pack", packPath], { cwd: adpostRoot, timeoutMs: 600000 });
  } else {
    throw new Error(`이미지 포함 SmartEditor 저장은 write_naver_blog_rich_draft.js만 허용합니다. writerScript=${writerScript}`);
  }
  fs.writeFileSync(path.join(runDir, "save.stdout.txt"), saveResult.stdout);
  fs.writeFileSync(path.join(runDir, "save.stderr.txt"), saveResult.stderr);
  if (saveResult.code !== 0) throw new Error(saveResult.stderr || saveResult.stdout || "SmartEditor 임시저장 실패");

  const parsedSave = parseLatestJsonLine(saveResult.stdout) || {};
  const after = parsedSave?.after || {};
  const explicitSaveFailure = parsedSave?.ok === false || parsedSave?.saved === false || parsedSave?.published === true;
  const hasSaveEvidence = parsedSave?.saved === true && after.titleText === title;
  const requiredImageCount = 4;
  const imageOk = Number(after.imageCount || 0) === requiredImageCount
    && Number(after.serverImageCount || 0) === requiredImageCount
    && Number(after.dataImageCount || 0) === 0
    && Number(after.imageLoadedCount || 0) === requiredImageCount
    && Number(after.brokenImageCount || 0) === 0;
  const placeholderOk = Number(after.placeholderTextCount || 0) === 0 && after.hasPlaceholderText !== true;
  const contentSafetyOk = Number(after.standaloneEmojiCount || 0) === 0 && after.hasInternalSearchDemandText !== true;
  if (explicitSaveFailure || !hasSaveEvidence || !imageOk || !placeholderOk || !contentSafetyOk) {
    throw new Error(`SmartEditor 임시저장 품질 검증 실패: ${JSON.stringify({ explicitSaveFailure, hasSaveEvidence, imageOk, placeholderOk, contentSafetyOk, parsedSave }).slice(0, 3000)}`);
  }
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
    imageQuality: {
      imageCount: Number(after.imageCount || 0),
      serverImageCount: Number(after.serverImageCount || 0),
      dataImageCount: Number(after.dataImageCount || 0),
      imageLoadedCount: Number(after.imageLoadedCount || 0),
      brokenImageCount: Number(after.brokenImageCount || 0),
      standaloneEmojiCount: Number(after.standaloneEmojiCount || 0),
      hasInternalSearchDemandText: after.hasInternalSearchDemandText === true,
      placeholderTextCount: Number(after.placeholderTextCount || 0),
    },
    candidate: picked ? { topic: picked.topic || picked.title || null, decision: picked.decision || null, score: candidateScore(picked) } : null,
    verification: {
      hermesCronUsed: false,
      geminiOnly: true,
      newBrowserProfilePort: chromePort,
    },
  };
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  buildRichPack,
  validatePackBeforeSave,
  sanitizeGeminiDraft,
  isStandaloneEmojiLine,
  isHeadingLine,
};
