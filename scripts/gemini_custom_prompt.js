#!/usr/bin/env node
const fs = require("fs");
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

function runAgentBrowser(cdp, args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    execFile(process.env.AGENT_BROWSER_BIN || "npx", [
      ...(process.env.AGENT_BROWSER_BIN ? [] : ["--yes", "agent-browser"]),
      "--cdp", cdp,
      ...args,
    ], {
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, AGENT_BROWSER_DEFAULT_TIMEOUT: String(Math.max(timeoutMs, 30000)) },
    }, (error, stdout = "", stderr = "") => {
      if (error) {
        error.message = [error.message, stderr, stdout].filter(Boolean).join("\n");
        reject(error);
      } else resolve(String(stdout || ""));
    });
  });
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt || !args.out || !args.cdp) throw new Error("--prompt, --out, --cdp가 필요합니다.");
  const prompt = fs.readFileSync(args.prompt, "utf8");
  const minLength = Math.max(1, Number(args["min-length"] || 6));
  const timeoutMs = Math.max(60000, Number(process.env.TERAFABX_GEMINI_SCRIPT_TIMEOUT_MS || 300000));
  await runAgentBrowser(args.cdp, ["open", process.env.TERAFABX_GEMINI_WEB_URL || "https://gemini.google.com/app"], 45000);
  await runAgentBrowser(args.cdp, ["wait", "3500"], 15000);
  const filled = normalizeEvalOutput(await runAgentBrowser(args.cdp, ["eval", "-b", encodeEval(fillScript(prompt))], 45000));
  if (!filled?.ok) throw new Error(`Gemini 입력 실패: ${JSON.stringify(filled)}`);
  await runAgentBrowser(args.cdp, ["press", "Enter"], 15000);
  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    last = normalizeEvalOutput(await runAgentBrowser(args.cdp, ["eval", "-b", encodeEval(readScript(minLength))], 30000));
    if (last?.done && last.text) {
      fs.writeFileSync(args.out, last.text);
      process.stdout.write(JSON.stringify({ ok: true, outputLength: last.text.length, responseCount: last.responseCount }));
      return;
    }
  }
  throw new Error(`Gemini 응답 시간 초과: ${JSON.stringify(last).slice(0, 1200)}`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
