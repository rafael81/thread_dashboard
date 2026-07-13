#!/usr/bin/env node
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { execFile } = require("child_process");

const DEFAULT_GROK_URL = "https://grok.com/";
const DEFAULT_SESSION = "terafabx-grok-headless";
const DEFAULT_TIMEOUT_MS = 180000;
const POLL_INTERVAL_MS = 2500;
const RESPONSE_STABLE_POLLS = 2;
const BATCH_POLL_CHUNK_SIZE = 12;
const DEBUG = process.env.TERAFABX_GROK_WEB_DEBUG === "true";
const DEFAULT_SYSTEM_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_HUMAN_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

function agentBrowserNamespace(session) {
  return `tg-${crypto.createHash("sha1").update(String(session || DEFAULT_SESSION)).digest("hex").slice(0, 12)}`;
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--")
      ? argv[++index]
      : "true";
    out[key] = value;
  }
  return out;
}

function agentBrowserInvocation(args, options = {}) {
  const bin = process.env.AGENT_BROWSER_BIN || "npx";
  const prefix = process.env.AGENT_BROWSER_BIN ? [] : ["--yes", "agent-browser"];
  const session = options.session || DEFAULT_SESSION;
  const namespace = agentBrowserNamespace(session);
  const state = options.state || "";
  const headed = options.headed === true || options.headed === "true";
  const userAgent = options.userAgent || process.env.TERAFABX_BROWSER_USER_AGENT || process.env.AGENT_BROWSER_USER_AGENT || DEFAULT_HUMAN_USER_AGENT;
  const executablePath = options.executablePath
    || process.env.TERAFABX_BROWSER_EXECUTABLE_PATH
    || process.env.AGENT_BROWSER_EXECUTABLE_PATH
    || (fs.existsSync(DEFAULT_SYSTEM_CHROME_PATH) ? DEFAULT_SYSTEM_CHROME_PATH : "");
  return {
    bin,
    args: [
      ...prefix,
      "--namespace", namespace,
      "--session", namespace,
      "--headed", headed ? "true" : "false",
      "--user-agent", userAgent,
      "--args", "--lang=ko-KR,--window-size=1440,900",
      ...(executablePath ? ["--executable-path", executablePath] : []),
      ...(state ? ["--state", state] : []),
      ...args,
    ],
  };
}

function randomHumanDelayMs(random, minMs, maxMs) {
  const value = Math.min(0.999999999999, Math.max(0, Number(random()) || 0));
  return minMs + Math.floor(value * (maxMs - minMs + 1));
}

function runAgentBrowser(args, options = {}) {
  const { bin, args: finalArgs } = agentBrowserInvocation(args, options);
  const timeout = Number(options.timeoutMs || options.timeout || 120000);
  if (DEBUG) {
    const safeArgs = finalArgs.map((arg, index) => {
      if (finalArgs[index - 1] === "inserttext") return `<text:${String(arg).length}>`;
      if (String(arg).startsWith("eval -b ")) return `<eval-b:${String(arg).length}>`;
      return arg;
    });
    process.stderr.write(`[agent-browser] ${bin} ${safeArgs.join(" ")}\n`);
  }
  return new Promise((resolve, reject) => {
    execFile(bin, finalArgs, {
      cwd: options.cwd || process.cwd(),
      env: {
        ...process.env,
        AGENT_BROWSER_DEFAULT_TIMEOUT: String(Math.max(timeout, 25000)),
      },
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout = "", stderr = "") => {
      const output = `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim();
      if (error) {
        error.message = `${error.message}${output ? `\n${output}` : ""}`;
        reject(error);
        return;
      }
      if (DEBUG && stdout) process.stderr.write(`[agent-browser:stdout] ${String(stdout).slice(0, 500)}\n`);
      resolve(String(stdout || "").trim());
    });
  });
}

function closeAgentBrowserSession(session) {
  const bin = process.env.AGENT_BROWSER_BIN || "npx";
  const prefix = process.env.AGENT_BROWSER_BIN ? [] : ["--yes", "agent-browser"];
  return new Promise((resolve) => {
    const namespace = agentBrowserNamespace(session);
    execFile(bin, [...prefix, "--namespace", namespace, "--session", namespace, "--headed", "false", "close"], {
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    }, () => resolve());
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeEval(script) {
  return Buffer.from(script, "utf8").toString("base64");
}

function normalizeBrowserEvalJson(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const first = JSON.parse(text);
    if (typeof first === "string") return JSON.parse(first);
    return first;
  } catch {
    try {
      return JSON.parse(text.replace(/^"|"$/g, ""));
    } catch {
      return null;
    }
  }
}

async function evalJson(script, options) {
  return normalizeBrowserEvalJson(await runAgentBrowser(["eval", "-b", encodeEval(script)], options));
}

function parseBatchEvalJson(raw) {
  const lines = String(raw || "").split(/\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines.reverse()) {
    const parsed = normalizeBrowserEvalJson(line);
    if (parsed && typeof parsed === "object") return parsed;
  }
  return null;
}

function parseDoneMarker(raw) {
  const match = String(raw || "").match(/TERAFABX_GROK_DONE:([^\s"\\]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function buildGrokPromptEvalScript(prompt, timeoutMs) {
  return `(async () => {
    const prompt = ${JSON.stringify(prompt)};
    const timeoutMs = ${Number(timeoutMs)};
    const pollMs = ${POLL_INTERVAL_MS};
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const findEditor = () => [
      '[contenteditable="true"]',
      'textarea',
      '[role="textbox"]',
      '[data-testid*="composer" i]',
      '[aria-label*="message" i]',
      '[aria-label*="prompt" i]',
      '[aria-label*="Ask" i]',
      '[placeholder*="Ask" i]',
      '[placeholder*="Message" i]',
      '[placeholder*="질문" i]',
      '[placeholder*="메시지" i]'
    ].flatMap((selector) => [...document.querySelectorAll(selector)])
      .find((node) => visible(node) && (node.isContentEditable || /TEXTAREA|INPUT/.test(node.tagName) || node.getAttribute('role') === 'textbox'));
    const readResponseState = () => {
      const assistantMessages = [
        '[data-testid="assistant-message"]',
        '[data-testid="primaryColumn"] [class*="r-bnwqim"][class*="r-11niif6"]',
        '[class*="r-bnwqim"][class*="r-11niif6"]',
        '[data-testid*="assistant" i]',
        '[data-testid*="message" i]',
        '[data-message-author-role="assistant"]',
        '[class*="assistant" i]',
        '[class*="response" i]',
        '[class*="markdown" i]',
        'article'
      ].flatMap((selector) => [...document.querySelectorAll(selector)])
        .filter(visible)
        .filter((node) => {
          const text = clean(node.innerText || node.textContent || '');
          if (text.length < 20) return false;
          if (node.closest('form')) return false;
          if (node.closest('aside, nav')) return false;
          return !/^(Grok|History|Today|New chat|새 채팅)$/i.test(text);
        });
      const last = assistantMessages.at(-1);
      const rawText = clean(last?.innerText || last?.textContent || '');
      const markdownText = clean(last?.querySelector('.response-content-markdown, [class*="markdown" i]')?.innerText || '');
      const isGenerating = [...document.querySelectorAll('button')].some((button) => {
        const label = clean(button.getAttribute('aria-label') || button.innerText || '');
        return /모델 응답 중지|Stop generating|Stop response/i.test(label);
      });
      return {
        url: location.href,
        title: document.title,
        assistantCount: assistantMessages.length,
        text: markdownText || rawText,
        isGenerating,
      };
    };
    const started = Date.now();
    let editor = null;
    while (Date.now() - started < 30000) {
      editor = findEditor();
      if (editor) break;
      await sleep(500);
    }
    if (!editor) {
      return JSON.stringify({
        ok: false,
        stage: 'missing_editor',
        url: location.href,
        title: document.title,
        textPreview: (document.body?.innerText || '').slice(0, 800),
      });
    }
    const baseline = readResponseState();
    editor.focus();
    if (/TEXTAREA|INPUT/.test(editor.tagName)) {
      editor.value = '';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
      editor.value = prompt;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    } else {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      document.execCommand('insertText', false, prompt);
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    }
    await sleep(800);
    const findSubmit = () => {
      const form = editor.closest('form') || editor.closest('[data-testid*="composer" i], [class*="composer" i]') || editor.parentElement;
      const scoped = form ? [...form.querySelectorAll('button')] : [];
      const all = [...scoped, ...document.querySelectorAll('button')].filter((button, index, arr) => arr.indexOf(button) === index);
      const candidates = all.filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.width >= 8
          && rect.height >= 8
          && !button.disabled
          && button.getAttribute('aria-disabled') !== 'true'
        && getComputedStyle(button).visibility !== 'hidden';
      });
      return candidates.find((button) => /^(제출|Submit|Send)$|send message|submit prompt|send prompt|보내기|전송/i.test(clean(button.getAttribute('aria-label') || button.innerText || '')))
        || candidates.find((button) => /arrow|paper|send|submit|전송|보내기/i.test([button.getAttribute('aria-label'), button.getAttribute('title'), button.innerText, button.innerHTML].filter(Boolean).join(' ')))
        || scoped.filter((button) => visible(button) && !button.disabled && button.getAttribute('aria-disabled') !== 'true').at(-1)
        || candidates.at(-1);
    };
    let submit = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      submit = findSubmit();
      if (submit) break;
      await sleep(250);
    }
    if (!submit) {
      return JSON.stringify({
        ok: false,
        stage: 'missing_submit',
        url: location.href,
        editorText: clean(editor.innerText || editor.value || ''),
        buttons: [...document.querySelectorAll('button')].map((button) => clean(button.getAttribute('aria-label') || button.innerText || '')).slice(-30),
      });
    }
    submit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    submit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    submit.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
    submit.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    submit.click();
    let lastText = '';
    let stableCount = 0;
    while (Date.now() - started < timeoutMs) {
      const state = readResponseState();
      const text = clean(state.text || '');
      const looksNew = text && (state.assistantCount > baseline.assistantCount || text !== baseline.text);
      if (looksNew && text === lastText) stableCount += 1;
      else {
        stableCount = 0;
        lastText = text;
      }
      if (looksNew && !state.isGenerating && stableCount >= ${RESPONSE_STABLE_POLLS - 1}) {
        return JSON.stringify({ ok: true, response: text, url: state.url, assistantCount: state.assistantCount });
      }
      await sleep(pollMs);
    }
    return JSON.stringify({
      ok: false,
      stage: 'timeout',
      url: location.href,
      title: document.title,
      lastText,
      bodyPreview: (document.body?.innerText || '').slice(0, 1200),
    });
  })()`;
}

function buildGrokSubmitEvalScript(prompt) {
  return `(async () => {
    const prompt = ${JSON.stringify(prompt)};
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const readState = () => {
      const nodes = [
        '[data-message-author-role="assistant"]',
        '[data-testid="assistant-message"]',
        '[data-testid="primaryColumn"] [class*="r-bnwqim"][class*="r-11niif6"]',
        '[class*="r-bnwqim"][class*="r-11niif6"]',
        '[data-testid*="assistant" i]',
        'main article',
        'main [class*="response" i]',
        'main [class*="markdown" i]'
      ].flatMap((selector) => [...document.querySelectorAll(selector)])
        .filter(visible)
        .filter((node, index, arr) => arr.indexOf(node) === index)
        .filter((node) => {
          const text = clean(node.innerText || node.textContent || '');
          if (text.length < 20) return false;
          if (node.closest('form, aside, nav')) return false;
          if (prompt && text.includes(prompt.slice(0, Math.min(prompt.length, 120)))) return false;
          return !/^(Grok|History|Today|New chat|새 채팅)$/i.test(text);
        });
      const last = nodes.at(-1);
      return { count: nodes.length, text: clean(last?.innerText || last?.textContent || ''), url: location.href };
    };
    const editor = [
      '[contenteditable]',
      '[contenteditable="true"]',
      '.ProseMirror',
      '[class*="ProseMirror"]',
      'textarea',
      '[role="textbox"]',
      '[aria-label*="Ask" i]',
      '[placeholder*="Ask" i]',
      '[placeholder*="질문" i]',
      '[placeholder*="메시지" i]'
    ].flatMap((selector) => [...document.querySelectorAll(selector)])
      .find((node) => visible(node) && (node.isContentEditable || node.getAttribute('contenteditable') != null || /TEXTAREA|INPUT/.test(node.tagName) || node.getAttribute('role') === 'textbox'));
    if (!editor) return JSON.stringify({ ok: false, stage: 'missing_editor', url: location.href, title: document.title, textPreview: (document.body?.innerText || '').slice(0, 800) });
    window.__terafabxGrokPrompt = prompt;
    window.__terafabxGrokBaseline = readState();
    window.__terafabxGrokLastText = '';
    window.__terafabxGrokStableCount = 0;
    editor.focus();
    if (/TEXTAREA|INPUT/.test(editor.tagName)) {
      editor.value = '';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
      editor.value = prompt;
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    } else {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(editor);
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, prompt);
      if (!clean(editor.innerText || editor.textContent || '')) {
        try {
          const data = new DataTransfer();
          data.setData('text/plain', prompt);
          editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
        } catch {}
      }
      if (!clean(editor.innerText || editor.textContent || '')) {
        editor.textContent = prompt;
      }
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
    }
    await sleep(800);
    editor.focus();
    return JSON.stringify({ ok: true, stage: 'filled', url: location.href, editorTextLength: clean(editor.innerText || editor.value || '').length });
  })()`;
}

function buildGrokReadEvalScript() {
  return `(() => {
    const prompt = window.__terafabxGrokPrompt || '';
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const nodes = [
      '[data-message-author-role="assistant"]',
      '[data-testid="assistant-message"]',
      '[data-testid="primaryColumn"] [class*="r-bnwqim"][class*="r-11niif6"]',
      '[class*="r-bnwqim"][class*="r-11niif6"]',
      '[data-testid*="assistant" i]',
      'main article',
      'main [class*="response" i]',
      'main [class*="markdown" i]'
    ].flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(visible)
      .filter((node, index, arr) => arr.indexOf(node) === index)
      .filter((node) => {
        const text = clean(node.innerText || node.textContent || '');
        if (text.length < 20) return false;
        if (node.closest('form, aside, nav')) return false;
        if (prompt && text.includes(prompt.slice(0, Math.min(prompt.length, 120)))) return false;
        return !/^(Grok|History|Today|New chat|새 채팅)$/i.test(text);
      });
    const last = nodes.at(-1);
    const text = clean(last?.querySelector?.('.response-content-markdown, [class*="markdown" i]')?.innerText || last?.innerText || last?.textContent || '');
    const baseline = window.__terafabxGrokBaseline || { count: 0, text: '' };
    const isGenerating = [...document.querySelectorAll('button')].some((button) => /모델 응답 중지|Stop generating|Stop response/i.test(clean(button.getAttribute('aria-label') || button.innerText || '')));
    const looksNew = text && (nodes.length > Number(baseline.count || 0) || text !== clean(baseline.text || ''));
    const looksComplete = text.length >= 40 && !/^(Thinking|Analyzing|생각\s*중|분석\s*중)/i.test(text);
    if (looksNew && text === window.__terafabxGrokLastText) window.__terafabxGrokStableCount = Number(window.__terafabxGrokStableCount || 0) + 1;
    else {
      window.__terafabxGrokStableCount = 0;
      window.__terafabxGrokLastText = text;
    }
    const done = Boolean(looksNew && looksComplete && !isGenerating && Number(window.__terafabxGrokStableCount || 0) >= ${RESPONSE_STABLE_POLLS - 1});
    const payload = { ok: true, stage: 'read', done, response: done ? text : '', textPreview: text.slice(0, 500), count: nodes.length, isGenerating, stableCount: Number(window.__terafabxGrokStableCount || 0), url: location.href, title: document.title };
    if (done) throw new Error('TERAFABX_GROK_DONE:' + encodeURIComponent(JSON.stringify({ response: text })));
    return JSON.stringify(payload);
  })()`;
}

function buildGrokBatchCommandChunks(prompt, url, timeoutMs = DEFAULT_TIMEOUT_MS, random = Math.random) {
  const readScript = buildGrokReadEvalScript();
  const initialCommands = [
    "batch",
    "--bail",
    `open ${url}`,
    `wait ${randomHumanDelayMs(random, 1800, 2800)}`,
    "reload",
    `wait ${randomHumanDelayMs(random, 4200, 6800)}`,
    `eval -b ${encodeEval(buildGrokSubmitEvalScript(prompt))}`,
    "press Control+a",
    `keyboard inserttext ${JSON.stringify(prompt)}`,
    `wait ${randomHumanDelayMs(random, 600, 1400)}`,
    "press Enter",
    `wait ${randomHumanDelayMs(random, 900, 1800)}`,
  ];
  const pollMs = 3000;
  const maxPolls = Math.max(1, Math.min(48, Math.ceil(timeoutMs / pollMs)));
  const chunks = [];
  for (let offset = 0; offset < maxPolls; offset += BATCH_POLL_CHUNK_SIZE) {
    const commands = offset === 0 ? [...initialCommands] : ["batch", "--bail"];
    const pollCount = Math.min(BATCH_POLL_CHUNK_SIZE, maxPolls - offset);
    for (let index = 0; index < pollCount; index += 1) {
      commands.push(`wait ${randomHumanDelayMs(random, 2600, 4200)}`, `eval -b ${encodeEval(readScript)}`);
    }
    chunks.push(commands);
  }
  return chunks;
}

function buildGrokBatchCommands(prompt, url, timeoutMs = DEFAULT_TIMEOUT_MS, random = Math.random) {
  return buildGrokBatchCommandChunks(prompt, url, timeoutMs, random)[0];
}

async function runGrokPromptBatch(prompt, options, url) {
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const chunks = buildGrokBatchCommandChunks(prompt, url, timeoutMs);
  let last = null;
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    let output = "";
    try {
      output = await runAgentBrowser(chunks[chunkIndex], {
        ...options,
        state: chunkIndex === 0 ? options.state : "",
        timeoutMs: Math.min(timeoutMs + 60000, 90000),
      });
    } catch (error) {
      output = error.message || "";
      const markedDone = parseDoneMarker(output);
      if (markedDone?.response) return markedDone.response;
      throw error;
    }
    const markedDone = parseDoneMarker(output);
    if (markedDone?.response) return markedDone.response;
    const parsedResults = String(output || "")
      .split(/\n/)
      .map((line) => parseBatchEvalJson(line))
      .filter(Boolean);
    const failed = parsedResults.find((item) => item.ok === false);
    if (failed) throw new Error(`Grok Web batch 실패(${failed.stage || "unknown"}): ${JSON.stringify(failed).slice(0, 1200)}`);
    const done = parsedResults.filter((item) => item.done && item.response).at(-1);
    if (done) return done.response;
    last = parsedResults.at(-1) || last;
    if (!last && chunkIndex === chunks.length - 1) {
      throw new Error(`Grok Web batch 응답을 해석하지 못했습니다: ${String(output || "").slice(-1000)}`);
    }
  }
  throw new Error(`Grok Web 응답 대기 시간 초과: ${JSON.stringify(last).slice(0, 1200)}`);
}

async function ensureGrokPageSelected(options, url) {
  const currentScript = `(() => JSON.stringify({ url: location.href, title: document.title }))()`;
  const current = await evalJson(currentScript, { ...options, timeoutMs: 15000 }).catch(() => null);
  if (/^https:\/\/grok\.com\//i.test(String(current?.url || ""))) return current;

  const tabs = await runAgentBrowser(["tab", "list"], { ...options, timeoutMs: 15000 }).catch(() => "");
  const grokLine = String(tabs || "").split(/\n/).find((line) => /https:\/\/grok\.com\//i.test(line) || /\bGrok\b/i.test(line));
  const tabId = (grokLine?.match(/\[t?(\d+)\]/i) || [])[1];
  if (tabId) {
    await runAgentBrowser(["tab", tabId], { ...options, timeoutMs: 15000 }).catch(() => {});
    const selected = await evalJson(currentScript, { ...options, timeoutMs: 15000 }).catch(() => null);
    if (/^https:\/\/grok\.com\//i.test(String(selected?.url || ""))) return selected;
  }

  await runAgentBrowser(["open", url], { ...options, timeoutMs: 60000 });
  await sleep(3000);
  return evalJson(currentScript, { ...options, timeoutMs: 15000 }).catch(() => null);
}

async function ensureGrokComposerReady(options) {
  const script = `(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const editor = [
      '[contenteditable]',
      '[contenteditable="true"]',
      '.ProseMirror',
      '[class*="ProseMirror"]',
      'textarea',
      '[role="textbox"]',
      '[data-testid*="composer" i]',
      '[aria-label*="message" i]',
      '[aria-label*="prompt" i]',
      '[aria-label*="Ask" i]',
      '[placeholder*="Ask" i]',
      '[placeholder*="Message" i]',
      '[placeholder*="질문" i]',
      '[placeholder*="메시지" i]'
    ].flatMap((selector) => [...document.querySelectorAll(selector)])
      .find((node) => visible(node) && (node.isContentEditable || node.getAttribute('contenteditable') != null || /TEXTAREA|INPUT/.test(node.tagName) || node.getAttribute('role') === 'textbox'));
    const submit = [...document.querySelectorAll('button')]
      .find((button) => /^(제출|Submit|Send)$|send message|submit prompt|send prompt|보내기|전송/i.test((button.getAttribute('aria-label') || button.innerText || '').trim()));
    return JSON.stringify({
      url: location.href,
      title: document.title,
      textPreview: (document.body?.innerText || '').slice(0, 600),
      hasEditor: Boolean(editor),
      hasSubmit: Boolean(submit),
      editorText: editor?.innerText || editor?.value || ''
    });
  })()`;

  let lastState = null;
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const state = await evalJson(script, { ...options, timeoutMs: 15000 });
    lastState = state;
    if (state?.hasEditor) return state;
    await sleep(1000);
  }

  throw new Error(`Grok 입력창을 찾지 못했습니다. grok.com 로그인 상태와 페이지 로딩을 확인해주세요. lastState=${JSON.stringify(lastState).slice(0, 900)}`);
}

async function focusAndClearGrokComposer(options) {
  const script = `(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const editor = [
      '[contenteditable]',
      '[contenteditable="true"]',
      '.ProseMirror',
      '[class*="ProseMirror"]',
      'textarea',
      '[role="textbox"]',
      '[data-testid*="composer" i]',
      '[aria-label*="message" i]',
      '[aria-label*="prompt" i]',
      '[aria-label*="Ask" i]',
      '[placeholder*="Ask" i]',
      '[placeholder*="Message" i]',
      '[placeholder*="질문" i]',
      '[placeholder*="메시지" i]'
    ].flatMap((selector) => [...document.querySelectorAll(selector)])
      .find((node) => visible(node) && (node.isContentEditable || node.getAttribute('contenteditable') != null || /TEXTAREA|INPUT/.test(node.tagName) || node.getAttribute('role') === 'textbox'));
    if (!editor) return 'missing_editor';
    editor.focus();
    if (/TEXTAREA|INPUT/.test(editor.tagName)) {
      editor.value = '';
    } else {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
    return 'ready';
  })()`;
  const result = String(await runAgentBrowser(["eval", "-b", encodeEval(script)], { ...options, timeoutMs: 15000 }) || "").trim();
  if (!/ready/.test(result)) throw new Error("Grok 입력창을 초기화하지 못했습니다.");
}

async function clickGrokSubmit(options) {
  const script = `(() => {
    const buttons = [...document.querySelectorAll('button')];
    const submit = buttons.find((button) => {
      const label = (button.getAttribute('aria-label') || button.innerText || '').trim();
      const rect = button.getBoundingClientRect();
      return rect.width >= 8
        && rect.height >= 8
        && !button.disabled
        && button.getAttribute('aria-disabled') !== 'true'
        && /^(제출|Submit|Send)$|send message|submit prompt|send prompt|보내기|전송/i.test(label);
    }) || buttons.reverse().find((button) => {
      const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.innerText].filter(Boolean).join(' ');
      const rect = button.getBoundingClientRect();
      return rect.width >= 8
        && rect.height >= 8
        && !button.disabled
        && button.getAttribute('aria-disabled') !== 'true'
        && /arrow|paper|send|submit|전송|보내기/i.test(label);
    });
    if (!submit) return 'missing_submit';
    submit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
    submit.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    submit.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
    submit.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    submit.click();
    return 'submitted';
  })()`;
  const result = String(await runAgentBrowser(["eval", "-b", encodeEval(script)], { ...options, timeoutMs: 15000 }) || "").trim();
  if (!/submitted/.test(result)) throw new Error("Grok 제출 버튼을 찾지 못했습니다.");
}

async function readGrokResponseState(options) {
  const script = `(() => {
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const assistantMessages = [
      '[data-testid="assistant-message"]',
      '[data-testid="primaryColumn"] [class*="r-bnwqim"][class*="r-11niif6"]',
      '[class*="r-bnwqim"][class*="r-11niif6"]',
      '[data-testid*="assistant" i]',
      '[data-message-author-role="assistant"]',
      '[class*="assistant" i]',
      '[class*="response" i]',
      '[class*="markdown" i]',
      'article'
    ].flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(visible)
      .filter((node) => {
        const text = (node.innerText || node.textContent || '').trim();
        if (text.length < 20) return false;
        if (node.closest('form')) return false;
        return !/^(Grok|History|Today|New chat|새 채팅)$/i.test(text);
      });
    const last = assistantMessages.at(-1);
    const rawText = (last?.innerText || last?.textContent || '').trim();
    const markdownText = (last?.querySelector('.response-content-markdown, [class*="markdown" i]')?.innerText || '').trim();
    const isGenerating = [...document.querySelectorAll('button')].some((button) => {
      const label = (button.getAttribute('aria-label') || button.innerText || '').trim();
      return /모델 응답 중지|Stop generating|Stop response/i.test(label);
    });
    return JSON.stringify({
      url: location.href,
      title: document.title,
      assistantCount: assistantMessages.length,
      text: markdownText || rawText,
      isGenerating
    });
  })()`;
  return evalJson(script, { ...options, timeoutMs: 15000 });
}

async function waitForGrokResponse(options, baseline = {}) {
  const started = Date.now();
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const baselineText = String(baseline.text || "").trim();
  const baselineCount = Number(baseline.assistantCount || 0);
  let lastText = "";
  let stableCount = 0;

  while (Date.now() - started < timeoutMs) {
    const state = await readGrokResponseState(options);
    const text = String(state?.text || "").trim();
    const assistantCount = Number(state?.assistantCount || 0);
    const looksNew = text && (assistantCount > baselineCount || text !== baselineText);
    if (looksNew && text === lastText) {
      stableCount += 1;
    } else {
      stableCount = 0;
      lastText = text;
    }
    if (looksNew && !state?.isGenerating && stableCount >= RESPONSE_STABLE_POLLS - 1) {
      return text;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error("Grok 응답 대기 시간이 초과되었습니다.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const promptPath = args.prompt;
  const outPath = args.out;
  if (!promptPath) throw new Error("--prompt 경로가 필요합니다.");
  if (!outPath) throw new Error("--out 경로가 필요합니다.");
  const prompt = fs.readFileSync(promptPath, "utf8");
  const session = args.session || process.env.TERAFABX_GROK_WEB_SESSION || DEFAULT_SESSION;
  const state = args.state || process.env.TERAFABX_GROK_WEB_STATE_PATH || "";
  const timeoutMs = Number(args.timeout || args["timeout-ms"] || DEFAULT_TIMEOUT_MS);
  const url = args.url || process.env.TERAFABX_GROK_WEB_URL || DEFAULT_GROK_URL;
  const headed = args.headed === "true" || process.env.TERAFABX_GROK_WEB_HEADED === "true";
  const options = { session, state, timeoutMs, headed };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await closeAgentBrowserSession(session).catch(() => {});
  try {
    // Keep state restore, navigation, submit, and response polling in one CLI
    // process. Reusing --state across separate commands restores its saved
    // active URL (often X/Threads), while reconnecting without it can lose the
    // restored browser context and land on about:blank.
    const response = await runGrokPromptBatch(prompt, options, url);
    fs.writeFileSync(outPath, response);
    process.stdout.write(JSON.stringify({
      ok: true,
      session,
      statePath: state || null,
      outPath,
      responseLength: response.length,
    }));
  } finally {
    await closeAgentBrowserSession(session).catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = { agentBrowserInvocation, buildGrokBatchCommandChunks, buildGrokBatchCommands, parseDoneMarker, randomHumanDelayMs, runGrokPromptBatch };
