#!/usr/bin/env node
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { execFile } = require("child_process");

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    result[arg.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : "true";
  }
  return result;
}

function encodeEval(source) {
  return Buffer.from(source, "utf8").toString("base64");
}

function normalizeEvalOutput(raw) {
  const lines = String(raw || "").split(/\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    try {
      const first = JSON.parse(line);
      return typeof first === "string" ? JSON.parse(first) : first;
    } catch {}
  }
  return null;
}

function geminiAgentBrowserNamespace(cdp) {
  return `gm-${crypto.createHash("sha1").update(String(cdp || "gemini")).digest("hex").slice(0, 12)}`;
}

function resolveInstalledAgentBrowserBin() {
  if (process.env.AGENT_BROWSER_BIN) return process.env.AGENT_BROWSER_BIN;
  const candidates = [
    "/opt/homebrew/opt/agent-browser/bin/agent-browser",
    "/usr/local/opt/agent-browser/bin/agent-browser",
    "/opt/homebrew/bin/agent-browser",
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return candidate;
    } catch {}
  }
  return "npx";
}


function agentBrowserInvocation(cdp, args, options = {}) {
  const bin = options.bin || resolveInstalledAgentBrowserBin();
  const namespace = options.namespace || geminiAgentBrowserNamespace(cdp);
  return {
    bin,
    namespace,
    // agent-browser 0.26+ 는 --namespace 미지원. --session 만 사용.
    args: [
      ...(path.basename(String(bin)) === "npx" ? ["--yes", "agent-browser"] : []),
      "--session", namespace,
      "--cdp", cdp,
      ...args,
    ],
  };
}

function runAgentBrowser(cdp, args, timeoutMs = 30000, namespace = geminiAgentBrowserNamespace(cdp)) {
  return new Promise((resolve, reject) => {
    const invocation = agentBrowserInvocation(cdp, args, { namespace });
    execFile(invocation.bin, invocation.args, {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        AGENT_BROWSER_DEFAULT_TIMEOUT: String(Math.max(timeoutMs, 30000)),
        // Gemini connects to a separately owned CDP Chrome. Let only the
        // namespace daemon expire; browser cleanup remains the server's job.
        AGENT_BROWSER_IDLE_TIMEOUT_MS: process.env.AGENT_BROWSER_IDLE_TIMEOUT_MS || "30000",
      },
    }, (error, stdout = "", stderr = "") => {
      if (error) {
        error.message = [error.message, stderr, stdout].filter(Boolean).join("\n");
        reject(error);
      } else resolve(String(stdout || ""));
    });
  });
}

function prepareUploadScript() {
  return `(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (node) => { const r = node && node.getBoundingClientRect(); return Boolean(r && r.width > 8 && r.height > 8); };
    const labelOf = (node) => String((node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('mattooltip') || '')) || node.innerText || node.textContent || '').replace(/\\s+/g, ' ').trim();
    const clickMatching = async (pattern) => {
      const nodes = [...document.querySelectorAll('button, [role="button"], [role="menuitem"], div[role="button"]')].filter(visible);
      const target = nodes.find((node) => pattern.test(labelOf(node)));
      if (!target) return false;
      target.click();
      await sleep(700);
      return true;
    };
    await clickMatching(/업로드 및 도구|Open upload|Upload files|Add files|첨부|Insert assets/i);
    await clickMatching(/파일 업로드|Upload file|Upload from computer|내 컴퓨터|From device|Photos|이미지 업로드/i);
    let input = document.querySelector('input[type="file"]');
    if (!input) {
      await sleep(800);
      input = document.querySelector('input[type="file"]');
    }
    if (input) {
      try { input.style.display = 'block'; } catch {}
      try { input.removeAttribute('hidden'); } catch {}
      try { input.disabled = false; } catch {}
    }
    const loginWall = /로그인|Sign in/i.test(document.body.innerText || '');
    return JSON.stringify({
      ok: Boolean(input),
      inputCount: document.querySelectorAll('input[type="file"]').length,
      loginWall,
      disabledUpload: [...document.querySelectorAll('[role="menuitem"]')].some((node) => /파일 업로드|Upload file/i.test(labelOf(node)) && node.getAttribute('aria-disabled') === 'true'),
    });
  })()`;
}

function waitUploadsScript(expectedCount) {
  return `(() => {
    const chips = document.querySelectorAll('[data-test-id="file-name"], .uploaded-image, img[src^="blob:"], [class*="uploaded"] img, [class*="attachment"] img');
    const files = document.querySelectorAll('input[type="file"]');
    let selected = 0;
    for (const input of files) selected += (input.files && input.files.length) || 0;
    return JSON.stringify({ ok: true, chipCount: chips.length, selectedCount: selected, ready: chips.length >= ${Number(expectedCount)} || selected >= ${Number(expectedCount)} });
  })()`;
}

function fillScript(prompt) {
  return `(async () => {
    const prompt = ${JSON.stringify(prompt)};
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (node) => { const r = node && node.getBoundingClientRect(); return Boolean(r && r.width > 8 && r.height > 8); };
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const responses = () => [...document.querySelectorAll('model-response, [data-message-author-role="model"], .model-response-text, message-content')]
      .filter(visible).filter((node, index, rows) => rows.indexOf(node) === index);
    let editor = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      editor = [...document.querySelectorAll('rich-textarea [contenteditable="true"], .ql-editor[contenteditable="true"], textarea, [role="textbox"][contenteditable="true"]')].find(visible);
      if (editor) break;
      await sleep(500);
    }
    if (!editor) return JSON.stringify({ ok: false, stage: 'missing_editor', url: location.href, body: (document.body.innerText || '').slice(0, 1000) });
    window.__threadDashboardGeminiBaseline = responses().length;
    window.__threadDashboardGeminiLast = '';
    window.__threadDashboardGeminiStable = 0;
    editor.focus();
    if ('value' in editor) {
      editor.value = prompt;
    } else {
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, prompt);
      if (!clean(editor.innerText)) editor.textContent = prompt;
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    await sleep(500);
    return JSON.stringify({ ok: clean(editor.innerText || editor.value).length > 0, stage: 'filled', promptLength: prompt.length, responseCount: responses().length });
  })()`;
}

function readScript(minLength) {
  return `(() => {
    const visible = (node) => { const r = node && node.getBoundingClientRect(); return Boolean(r && r.width > 8 && r.height > 8); };
    const responses = [...document.querySelectorAll('model-response, [data-message-author-role="model"], .model-response-text, message-content')]
      .filter(visible).filter((node, index, rows) => rows.indexOf(node) === index);
    const last = responses.at(-1);
    const text = String(last?.innerText || last?.textContent || '').trim();
    const generating = [...document.querySelectorAll('button')].some((button) => /Stop response|Stop generating|응답 중지|생성 중지/i.test(button.getAttribute('aria-label') || button.innerText || ''));
    const baseline = Number(window.__threadDashboardGeminiBaseline || 0);
    const isNew = responses.length > baseline && text.length >= ${Number(minLength)};
    if (isNew && text === window.__threadDashboardGeminiLast) window.__threadDashboardGeminiStable = Number(window.__threadDashboardGeminiStable || 0) + 1;
    else { window.__threadDashboardGeminiStable = 0; window.__threadDashboardGeminiLast = text; }
    return JSON.stringify({ ok: true, done: isNew && !generating && Number(window.__threadDashboardGeminiStable || 0) >= 1, text, generating, responseCount: responses.length, baseline, url: location.href });
  })()`;
}

function collectImageArgs(argv) {
  const images = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--image" && argv[index + 1] && !argv[index + 1].startsWith("--")) {
      images.push(path.resolve(argv[++index]));
    }
  }
  return images;
}

async function uploadGeminiImages(cdp, namespace, imagePaths) {
  const files = (imagePaths || []).filter((file) => file && fs.existsSync(file));
  if (!files.length) return { uploaded: 0 };
  const prepared = normalizeEvalOutput(await runAgentBrowser(cdp, ["eval", "-b", encodeEval(prepareUploadScript())], 45000, namespace));
  if (!prepared?.ok) {
    const hint = prepared?.loginWall || prepared?.disabledUpload
      ? " (Gemini 로그인/업로드 권한 필요)"
      : "";
    throw new Error(`Gemini 파일 입력창을 찾지 못했습니다${hint}: ${JSON.stringify(prepared)}`);
  }
  await runAgentBrowser(cdp, ["upload", "input[type=file]", ...files], 60000, namespace);
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < 45000) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    last = normalizeEvalOutput(await runAgentBrowser(cdp, ["eval", "-b", encodeEval(waitUploadsScript(files.length))], 20000, namespace));
    if (last?.ready) return { uploaded: files.length, chipCount: last.chipCount, selectedCount: last.selectedCount };
  }
  // Gemini sometimes accepts files without a durable chip selector. Proceed if the
  // file input retained the selection; otherwise fail closed so captions alone are not used.
  if (Number(last?.selectedCount || 0) >= files.length) {
    return { uploaded: files.length, chipCount: last?.chipCount || 0, selectedCount: last.selectedCount, soft: true };
  }
  throw new Error(`Gemini 이미지 업로드 확인 실패: ${JSON.stringify(last)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt || !args.out || !args.cdp) throw new Error("--prompt, --out, --cdp가 필요합니다.");
  const prompt = fs.readFileSync(args.prompt, "utf8");
  const minLength = Math.max(1, Number(args["min-length"] || 6));
  const timeoutMs = Math.max(60000, Number(process.env.TERAFABX_GEMINI_SCRIPT_TIMEOUT_MS || 300000));
  const namespace = geminiAgentBrowserNamespace(args.cdp);
  const imagePaths = collectImageArgs(process.argv.slice(2));
  await runAgentBrowser(args.cdp, ["open", process.env.TERAFABX_GEMINI_WEB_URL || "https://gemini.google.com/app"], 45000, namespace);
  await runAgentBrowser(args.cdp, ["wait", "3500"], 15000, namespace);
  if (imagePaths.length) {
    const upload = await uploadGeminiImages(args.cdp, namespace, imagePaths);
    process.stderr.write(`gemini_images_uploaded ${JSON.stringify(upload)}\n`);
    await runAgentBrowser(args.cdp, ["wait", "1500"], 10000, namespace);
  }
  const filled = normalizeEvalOutput(await runAgentBrowser(args.cdp, ["eval", "-b", encodeEval(fillScript(prompt))], 45000, namespace));
  if (!filled?.ok) throw new Error(`Gemini 입력 실패: ${JSON.stringify(filled)}`);
  await runAgentBrowser(args.cdp, ["press", "Enter"], 15000, namespace);
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    last = normalizeEvalOutput(await runAgentBrowser(args.cdp, ["eval", "-b", encodeEval(readScript(minLength))], 30000, namespace));
    if (last?.done && last.text) {
      fs.writeFileSync(args.out, last.text);
      process.stdout.write(JSON.stringify({ ok: true, outputLength: last.text.length, responseCount: last.responseCount }));
      return;
    }
  }
  throw new Error(`Gemini 응답 시간 초과: ${JSON.stringify(last).slice(0, 1200)}`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { agentBrowserInvocation, geminiAgentBrowserNamespace };
