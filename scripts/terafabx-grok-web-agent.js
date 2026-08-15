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
const INITIAL_BATCH_POLL_CHUNK_SIZE = 4;
const BATCH_POLL_CHUNK_SIZE = 4;
const DEBUG = process.env.TERAFABX_GROK_WEB_DEBUG === "true";
const DEFAULT_SYSTEM_CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEFAULT_OWNED_PROFILE_ROOT = process.env.TERAFABX_GROK_BROWSER_PROFILE_ROOT
  || path.join(process.cwd(), ".data", "agent-browser", "grok-profiles");
const DEFAULT_OWNED_RUNTIME_ROOT = process.env.TERAFABX_GROK_BROWSER_RUNTIME_ROOT
  || path.join(process.cwd(), ".data", "agent-browser", "grok-runtime");
const activeAgentBrowserChildren = new Set();
let activeSession = null;
let signalShutdownStarted = false;

function agentBrowserNamespace(session) {
  return `tg-${crypto.createHash("sha1").update(String(session || DEFAULT_SESSION)).digest("hex").slice(0, 12)}`;
}

function agentBrowserProfileDir(session, options = {}) {
  const profileRoot = path.resolve(options.profileRoot || DEFAULT_OWNED_PROFILE_ROOT);
  return path.join(profileRoot, agentBrowserNamespace(session));
}

function agentBrowserOwnedRuntimeDir(session, options = {}) {
  const runtimeRoot = path.resolve(options.runtimeRoot || DEFAULT_OWNED_RUNTIME_ROOT);
  return path.join(runtimeRoot, agentBrowserNamespace(session));
}

function isOwnedGrokProfileDir(profileDir) {
  return /^tg-[0-9a-f]{12}$/.test(path.basename(path.resolve(String(profileDir || ""))));
}

function ownedGrokBrowserPidsFromPs(raw, ownedDir, currentPid = process.pid, options = {}) {
  const exactOwnedDir = path.resolve(String(ownedDir || ""));
  if (!isOwnedGrokProfileDir(exactOwnedDir)) return [];
  const allowDescendants = options.allowDescendants === true;
  const ownedPrefix = `${exactOwnedDir}${path.sep}`;
  return Array.from(new Set(String(raw || "").split(/\r?\n/).flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\s\S]+)$/);
    if (!match) return [];
    const pid = Number(match[1]);
    const command = match[3];
    if (pid <= 1 || pid === currentPid) return [];
    if (!/Google Chrome(?: Helper)?/.test(command)) return [];
    const userDataDir = (command.match(/--user-data-dir=([^\s]+(?:\s(?!-{1,2})[^\s]+)*)/) || [])[1] || "";
    const resolvedUserDataDir = path.resolve(userDataDir);
    const owned = resolvedUserDataDir === exactOwnedDir
      || (allowDescendants && resolvedUserDataDir.startsWith(ownedPrefix));
    if (!owned) return [];
    return [pid];
  }))).sort((left, right) => right - left);
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
  const bin = options.bin || process.env.AGENT_BROWSER_BIN || "npx";
  const prefix = path.basename(String(bin)) === "npx" ? ["--yes", "agent-browser"] : [];
  const session = options.session || DEFAULT_SESSION;
  const namespace = agentBrowserNamespace(session);
  const profileDir = agentBrowserProfileDir(session, options);
  const runtimeDir = agentBrowserOwnedRuntimeDir(session, options);
  const state = options.state || "";
  const headed = options.headed === true || options.headed === "true";
  const executablePath = options.executablePath
    || process.env.TERAFABX_BROWSER_EXECUTABLE_PATH
    || process.env.AGENT_BROWSER_EXECUTABLE_PATH
    || (fs.existsSync(DEFAULT_SYSTEM_CHROME_PATH) ? DEFAULT_SYSTEM_CHROME_PATH : "");
  return {
    bin,
    namespace,
    profileDir,
    runtimeDir,
    args: [
      ...prefix,
      // agent-browser 0.26+ 는 --namespace 미지원. --session 만 사용.
      "--session", namespace,
      "--headed", headed ? "true" : "false",
      // agent-browser rejects storage_state together with a persistent
      // profile. Grok needs the saved login state, so state-backed runs use
      // the session-owned ephemeral browser; profile-only runs retain the
      // deterministic project-owned directory for cleanup.
      ...(!state && !options.resume ? ["--profile", profileDir] : []),
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
  const {
    bin,
    args: finalArgs,
    runtimeDir,
  } = agentBrowserInvocation(args, options);
  const timeout = Number(options.timeoutMs || options.timeout || 120000);
  fs.mkdirSync(runtimeDir, { recursive: true });
  if (DEBUG) {
    const safeArgs = finalArgs.map((arg, index) => {
      if (finalArgs[index - 1] === "inserttext") return `<text:${String(arg).length}>`;
      if (String(arg).startsWith("eval -b ")) return `<eval-b:${String(arg).length}>`;
      return arg;
    });
    process.stderr.write(`[agent-browser] ${bin} ${safeArgs.join(" ")}\n`);
  }
  return new Promise((resolve, reject) => {
    const child = execFile(bin, finalArgs, {
      cwd: options.cwd || process.cwd(),
      detached: true,
      env: {
        ...process.env,
        // A state-backed agent-browser cannot use --profile. Constrain its
        // otherwise random agent-browser-chrome-* directory to a project-owned
        // namespace so it remains discoverable after daemon/parent crashes.
        TMPDIR: runtimeDir,
        TMP: runtimeDir,
        TEMP: runtimeDir,
        AGENT_BROWSER_DEFAULT_TIMEOUT: String(Math.max(timeout, 25000)),
      },
      timeout,
      maxBuffer: 8 * 1024 * 1024,
    }, (error, stdout = "", stderr = "") => {
      activeAgentBrowserChildren.delete(child);
      if (error?.killed || error?.signal) {
        signalAgentBrowserProcessGroup(child, "SIGKILL");
      }
      const output = `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim();
      if (error) {
        error.message = `${error.message}${output ? `\n${output}` : ""}`;
        reject(error);
        return;
      }
      if (DEBUG && stdout) process.stderr.write(`[agent-browser:stdout] ${String(stdout).slice(0, 500)}\n`);
      resolve(String(stdout || "").trim());
    });
    activeAgentBrowserChildren.add(child);
  });
}

function signalAgentBrowserProcessGroup(child, signal = "SIGTERM") {
  const pid = Number(child?.pid || 0);
  if (!pid) return false;
  try {
    process.kill(-pid, signal);
    return true;
  } catch {
    try {
      child.kill(signal);
      return true;
    } catch {
      return false;
    }
  }
}

function namespaceHasRuntimeArtifacts(namespace) {
  const runtimeDir = namespaceRuntimeDir(namespace);
  try {
    return fs.readdirSync(runtimeDir).some((name) => (
      name === `${namespace}.sock`
      || name === `${namespace}.pid`
      || name === `${namespace}.engine`
    ));
  } catch {
    return false;
  }
}

async function closeAgentBrowserSession(session) {
  const bin = process.env.AGENT_BROWSER_BIN || "npx";
  const prefix = path.basename(String(bin)) === "npx" ? ["--yes", "agent-browser"] : [];
  const namespace = agentBrowserNamespace(session);
  const profileDir = agentBrowserProfileDir(session);
  const runtimeDir = agentBrowserOwnedRuntimeDir(session);
  fs.mkdirSync(runtimeDir, { recursive: true });
  const requestedClose = namespaceHasRuntimeArtifacts(namespace);
  if (requestedClose) {
    await new Promise((resolve) => {
      execFile(bin, [...prefix, "--session", namespace, "--headed", "false", "close"], {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
        env: {
          ...process.env,
          TMPDIR: runtimeDir,
          TMP: runtimeDir,
          TEMP: runtimeDir,
        },
      }, () => resolve());
    });
    // The close command can return just before its daemon exits. Give it a
    // short grace period so forced cleanup cannot race the next runner.
    await sleep(500);
  }
  return {
    requestedClose,
    ...(await forceCleanupAgentBrowserNamespace(namespace, profileDir, runtimeDir)),
  };
}

function namespaceProcessIds(raw) {
  return Array.from(new Set(String(raw || "")
    .split(/\s+/)
    .map((value) => Number(value))
    .filter((pid) => Number.isInteger(pid) && pid > 1 && pid !== process.pid)));
}

function namespaceRuntimeDir(namespace) {
  return path.join(process.env.HOME || "", ".agent-browser", "namespaces", namespace, "run");
}

function listNamespaceProcessIds(namespace) {
  const runtimeDir = namespaceRuntimeDir(namespace);
  if (!runtimeDir || !fs.existsSync(runtimeDir)) return Promise.resolve([]);
  return new Promise((resolve) => {
    execFile("lsof", ["-t", "+D", runtimeDir], {
      timeout: 5000,
      maxBuffer: 256 * 1024,
    }, (_error, stdout = "") => resolve(namespaceProcessIds(stdout)));
  });
}

function listOwnedGrokBrowserProcessIds(profileDir, runtimeDir) {
  return new Promise((resolve) => {
    execFile("ps", ["-axo", "pid=,ppid=,command="], {
      timeout: 5000,
      maxBuffer: 4 * 1024 * 1024,
    }, (_error, stdout = "") => resolve(Array.from(new Set([
      ...ownedGrokBrowserPidsFromPs(stdout, profileDir),
      ...ownedGrokBrowserPidsFromPs(stdout, runtimeDir, process.pid, { allowDescendants: true }),
    ]))));
  });
}

async function terminateProcessIds(pids = []) {
  for (const pid of pids) {
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
  if (pids.length) await sleep(500);
  return pids;
}

async function forceCleanupAgentBrowserNamespace(
  namespace,
  profileDir = agentBrowserProfileDir(namespace),
  ownedRuntimeDir = agentBrowserOwnedRuntimeDir(namespace),
) {
  let pids = Array.from(new Set([
    ...(await listNamespaceProcessIds(namespace)),
    ...(await listOwnedGrokBrowserProcessIds(profileDir, ownedRuntimeDir)),
  ]));
  await terminateProcessIds(pids);
  pids = Array.from(new Set([
    ...(await listNamespaceProcessIds(namespace)),
    ...(await listOwnedGrokBrowserProcessIds(profileDir, ownedRuntimeDir)),
  ]));
  for (const pid of pids) {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
  const runtimeDir = namespaceRuntimeDir(namespace);
  for (const suffix of ["sock", "pid", "engine", "stream", "version"]) {
    try { fs.rmSync(path.join(runtimeDir, `${namespace}.${suffix}`), { force: true }); } catch {}
  }
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(ownedRuntimeDir, { recursive: true, force: true }); } catch {}
  const remainingPids = Array.from(new Set([
    ...(await listNamespaceProcessIds(namespace)),
    ...(await listOwnedGrokBrowserProcessIds(profileDir, ownedRuntimeDir)),
  ]));
  return {
    namespace,
    profileDir,
    runtimeDir: ownedRuntimeDir,
    killedPids: pids,
    remainingPids,
  };
}

async function cleanupOwnedGrokBrowserProfiles(
  profileRoot = DEFAULT_OWNED_PROFILE_ROOT,
  runtimeRoot = DEFAULT_OWNED_RUNTIME_ROOT,
) {
  const resolvedRoot = path.resolve(profileRoot);
  const resolvedRuntimeRoot = path.resolve(runtimeRoot);
  const namespaces = new Set();
  for (const root of [resolvedRoot, resolvedRuntimeRoot]) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch {}
    for (const entry of entries) {
      if (entry.isDirectory() && /^tg-[0-9a-f]{12}$/.test(entry.name)) namespaces.add(entry.name);
    }
  }
  const results = [];
  for (const namespace of namespaces) {
    results.push(await forceCleanupAgentBrowserNamespace(
      namespace,
      path.join(resolvedRoot, namespace),
      path.join(resolvedRuntimeRoot, namespace),
    ));
  }
  return results;
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

function isGrokTitleResponse(title, responseMarker) {
  const text = String(title || "").trim();
  const marker = String(responseMarker || "").trim();
  if (!marker || !text.includes(marker)) return false;
  return /[\[{]/.test(text)
    || /"(?:request_?id|index|context_?summary|key_?points|reply)"\s*:/i.test(text);
}

function normalizeGrokTitleResponse(title, responseMarker) {
  const text = String(title || "").trim();
  const marker = String(responseMarker || "").trim();
  if (!marker || !text.includes(marker)) return "";
  if (/^[\[{]/.test(text)) return text;
  const requestId = (text.match(/"request_?id"\s*:\s*"([^"]+)"/i) || [])[1];
  const indexText = (text.match(/"index"\s*:\s*(\d+)/i) || [])[1];
  const contextSummary = (text.match(/"context_?summary"\s*:\s*"([\s\S]*?)"\s*,\s*"key_?points"/i) || [])[1];
  const keyPointsText = (text.match(/"key_?points"\s*:\s*([\s\S]*?)\s*,\s*"reply"\s*:/i) || [])[1];
  const reply = (text.match(/"reply"\s*:\s*"([\s\S]*?)"(?:\s*-\s*Grok)?\s*$/i) || [])[1];
  if (!requestId || requestId !== marker || indexText === undefined || !contextSummary || !reply) return "";
  const keyPoints = Array.from(String(keyPointsText || "").matchAll(/"([^"]+)"/g), (match) => match[1]);
  return JSON.stringify([{
    request_id: requestId,
    index: Number(indexText),
    context_summary: contextSummary,
    key_points: keyPoints,
    reply,
  }]);
}

function buildGrokHistoryRecoveryEvalScript(responseMarker) {
  return `(() => {
    const marker = ${JSON.stringify(String(responseMarker || ""))};
    if (!marker) return JSON.stringify({ ok: false, response: '', href: '' });
    const response = [...document.querySelectorAll('main p, main article, main [data-message-author-role="assistant"]')]
      .map((node) => (node.innerText || node.textContent || '').trim())
      .filter((text) => text.includes(marker) && /"context_?summary"\\s*:/.test(text) && /"reply"\\s*:/.test(text))
      .sort((left, right) => left.length - right.length)
      .find((text) => {
        try {
          const parsed = JSON.parse(text.replace(/^\x60\x60\x60(?:json)?\\s*/i, '').replace(/\\s*\x60\x60\x60$/, ''));
          return parsed?.request_id === marker && parsed?.context_summary && parsed?.reply;
        } catch { return false; }
      }) || '';
    const hrefs = [...new Set([...document.querySelectorAll('a[href*="/c/"]')]
      .map((node) => node.href || node.getAttribute('href') || '')
      .filter(Boolean))].slice(0, 5);
    return JSON.stringify({ ok: Boolean(response), response, href: hrefs[0] || '', hrefs });
  })()`;
}

async function recoverGrokResponseFromHistory(prompt, options, url) {
  const marker = (String(prompt || '').match(/gctx-[0-9a-f-]{12,}/i) || [])[0] || '';
  if (!marker) return '';
  await runAgentBrowser(['open', url], { ...options, state: '', resume: true, timeoutMs: 30000 });
  await sleep(6500);
  let recovered = await evalJson(buildGrokHistoryRecoveryEvalScript(marker), { ...options, state: '', resume: true, timeoutMs: 15000 });
  const hrefs = Array.isArray(recovered?.hrefs) ? recovered.hrefs : [recovered?.href].filter(Boolean);
  for (const href of hrefs) {
    if (recovered?.ok) break;
    await runAgentBrowser(['open', href], { ...options, state: '', resume: true, timeoutMs: 30000 });
    await sleep(3500);
    recovered = await evalJson(buildGrokHistoryRecoveryEvalScript(marker), { ...options, state: '', resume: true, timeoutMs: 15000 });
  }
  return recovered?.ok ? String(recovered.response || '').trim() : '';
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
    const cleanPrompt = clean(prompt);
    const promptFingerprint = cleanPrompt.replace(/\\s+/g, '').replace(/n/g, '');
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
          const textFingerprint = text.replace(/\\s+/g, '').replace(/n/g, '');
          if (promptFingerprint && textFingerprint.includes(promptFingerprint.slice(0, Math.min(promptFingerprint.length, 120)))) return false;
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
    if (!editor) throw new Error('TERAFABX_GROK_EDITOR_MISSING');
    window.__terafabxGrokPrompt = prompt;
    window.__terafabxGrokBaseline = readState();
    window.__terafabxGrokLastText = '';
    window.__terafabxGrokStableCount = 0;
    editor.focus();
    await sleep(800);
    editor.focus();
    return JSON.stringify({ ok: true, stage: 'editor_ready', url: location.href });
  })()`;
}

function buildGrokSendEvalScript(prompt) {
  return `(() => {
    const expected = ${JSON.stringify(normalizePromptEchoText(prompt))};
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const editor = [
      '[contenteditable][aria-label*="Grok" i]',
      '[contenteditable="true"]',
      '.ProseMirror',
      '[role="textbox"]',
      'textarea'
    ].flatMap((selector) => [...document.querySelectorAll(selector)])
      .find((node) => visible(node) && (node.isContentEditable || node.getAttribute('contenteditable') != null || /TEXTAREA|INPUT/.test(node.tagName) || node.getAttribute('role') === 'textbox'));
    if (!editor) throw new Error('TERAFABX_GROK_EDITOR_MISSING_AFTER_INPUT');
    const actual = clean(editor.innerText || editor.value || editor.textContent || '');
    if (actual !== expected) throw new Error('TERAFABX_GROK_PROMPT_INPUT_MISMATCH');
    const submit = [
      'button[data-testid="chat-submit"]',
      'button[aria-label="제출"]',
      'button[aria-label*="Submit" i]',
      'button[aria-label*="Send" i]'
    ].flatMap((selector) => [...document.querySelectorAll(selector)])
      .find((button) => visible(button) && !button.disabled);
    if (!submit) throw new Error('TERAFABX_GROK_SUBMIT_MISSING');
    submit.click();
    return JSON.stringify({ ok: true, stage: 'submitted', url: location.href, promptLength: actual.length });
  })()`;
}

function buildGrokReadEvalScript(expectedPrompt = "") {
  return `(() => {
    if (location.protocol === 'chrome-error:') {
      return JSON.stringify({ ok: false, stage: 'chrome_error', url: location.href, title: document.title });
    }
    // Grok navigates from / to /c/... after submit, which clears window
    // variables. Embed the prompt so user-message nodes remain excludable
    // across that navigation.
    const prompt = ${JSON.stringify(expectedPrompt)} || window.__terafabxGrokPrompt || '';
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 8 && rect.height >= 8 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const cleanPrompt = clean(prompt);
    const responseMarker = (cleanPrompt.match(/gctx-[0-9a-f-]{12,}/i) || [])[0] || '';
    const promptFingerprint = cleanPrompt.replace(/\\s+/g, '').replace(/n/g, '');
    const alertText = clean([...document.querySelectorAll('output[role="alert"], [role="alert"]')]
      .filter(visible)
      .map((node) => node.innerText || node.textContent || '')
      .join(' '));
    if (/주간 한도에 도달|일일 한도에 도달|weekly limit|daily limit|usage limit|rate limit/i.test(alertText)) {
      return JSON.stringify({ ok: false, stage: 'quota', error: alertText.slice(0, 500), url: location.href, title: document.title });
    }
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
        const textFingerprint = text.replace(/\\s+/g, '').replace(/n/g, '');
        if (promptFingerprint && textFingerprint.includes(promptFingerprint.slice(0, Math.min(promptFingerprint.length, 120)))) return false;
        return !/^(Grok|History|Today|New chat|새 채팅)$/i.test(text);
      });
    const last = nodes.at(-1);
    const nodeText = clean(last?.querySelector?.('.response-content-markdown, [class*="markdown" i]')?.innerText || last?.innerText || last?.textContent || '');
    // grok.com has shipped layouts where the completed answer is reflected in
    // document.title before an assistant-message selector becomes available.
    // Only accept this fallback when it carries this request's unique marker;
    // the server validates the marker and item count again before enqueueing.
    const titleText = clean(document.title || '');
    const normalizedTitleResponse = (${normalizeGrokTitleResponse.toString()})(titleText, responseMarker);
    const titleHasResponse = Boolean(normalizedTitleResponse);
    const text = nodeText || normalizedTitleResponse;
    const baseline = window.__terafabxGrokBaseline || { count: 0, text: '' };
    const isGenerating = [...document.querySelectorAll('button')].some((button) => /모델 응답 중지|Stop generating|Stop response/i.test(clean(button.getAttribute('aria-label') || button.innerText || '')));
    const looksNew = text && (nodes.length > Number(baseline.count || 0) || text !== clean(baseline.text || ''));
    const looksComplete = text.length >= 40 && !/^(Thinking|Analyzing|생각\s*중|분석\s*중)/i.test(text);
    const jsonCandidate = text.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '').trim();
    let looksJsonComplete = false;
    try {
      const parsed = JSON.parse(jsonCandidate);
      looksJsonComplete = Boolean(parsed && typeof parsed === 'object');
    } catch {}
    if (looksNew && text === window.__terafabxGrokLastText) window.__terafabxGrokStableCount = Number(window.__terafabxGrokStableCount || 0) + 1;
    else {
      window.__terafabxGrokStableCount = 0;
      window.__terafabxGrokLastText = text;
    }
    const markerMatched = !responseMarker || text.includes(responseMarker);
    const done = Boolean(looksNew && looksComplete && markerMatched && !isGenerating && Number(window.__terafabxGrokStableCount || 0) >= ${RESPONSE_STABLE_POLLS - 1});
    const payload = { ok: true, stage: 'read', done, response: done ? text : '', textPreview: text.slice(0, 500), responseSource: nodeText ? 'dom' : titleHasResponse ? 'title' : 'none', count: nodes.length, isGenerating, markerMatched, stableCount: Number(window.__terafabxGrokStableCount || 0), url: location.href, title: document.title };
    return JSON.stringify(payload);
  })()`;
}

function buildGrokBatchCommandChunks(prompt, url, timeoutMs = DEFAULT_TIMEOUT_MS, random = Math.random) {
  const readScript = buildGrokReadEvalScript(prompt);
  const initialCommands = [
    "batch",
    "--bail",
    `open ${url}`,
    `wait ${randomHumanDelayMs(random, 1800, 2800)}`,
    "reload",
    `wait ${randomHumanDelayMs(random, 4200, 6800)}`,
    `eval -b ${encodeEval(buildGrokSubmitEvalScript(prompt))}`,
    "press Control+a",
    "press Backspace",
    `keyboard inserttext ${JSON.stringify(normalizePromptEchoText(prompt))}`,
    `wait ${randomHumanDelayMs(random, 600, 1400)}`,
    `eval -b ${encodeEval(buildGrokSendEvalScript(prompt))}`,
    `wait ${randomHumanDelayMs(random, 900, 1800)}`,
  ];
  const pollMs = 3000;
  const maxPolls = Math.max(1, Math.min(72, Math.ceil(timeoutMs / pollMs)));
  const chunks = [];
  for (let offset = 0; offset < maxPolls;) {
    const commands = offset === 0 ? [...initialCommands] : ["batch", "--bail"];
    const chunkSize = offset === 0 ? INITIAL_BATCH_POLL_CHUNK_SIZE : BATCH_POLL_CHUNK_SIZE;
    const pollCount = Math.min(chunkSize, maxPolls - offset);
    for (let index = 0; index < pollCount; index += 1) {
      commands.push(`wait ${randomHumanDelayMs(random, 2600, 4200)}`, `eval -b ${encodeEval(readScript)}`);
    }
    chunks.push(commands);
    offset += pollCount;
  }
  return chunks;
}

function buildGrokBatchCommands(prompt, url, timeoutMs = DEFAULT_TIMEOUT_MS, random = Math.random) {
  return buildGrokBatchCommandChunks(prompt, url, timeoutMs, random)[0];
}

function normalizePromptEchoText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isGrokPromptEcho(response, prompt) {
  const text = normalizePromptEchoText(response);
  const source = normalizePromptEchoText(prompt);
  if (!text || source.length < 40) return false;
  const textFingerprint = text.replace(/\s+/g, '').replace(/n/g, '');
  const sourceFingerprint = source.replace(/\s+/g, '').replace(/n/g, '');
  const prefix = sourceFingerprint.slice(0, Math.min(sourceFingerprint.length, 160));
  return textFingerprint.includes(prefix);
}

function acceptGrokResponse(response, prompt) {
  if (isGrokPromptEcho(response, prompt)) {
    throw new Error('Grok Web 응답 대신 입력 프롬프트가 감지되었습니다.');
  }
  return response;
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
        resume: chunkIndex > 0,
        timeoutMs: Math.min(timeoutMs + 60000, 90000),
      });
    } catch (error) {
      output = error.message || "";
      const markedDone = parseDoneMarker(output);
      if (markedDone?.response) return acceptGrokResponse(markedDone.response, prompt);
      throw error;
    }
    const markedDone = parseDoneMarker(output);
    if (markedDone?.response) return acceptGrokResponse(markedDone.response, prompt);
    const parsedResults = String(output || "")
      .split(/\n/)
      .map((line) => parseBatchEvalJson(line))
      .filter(Boolean);
    const failed = parsedResults.find((item) => item.ok === false);
    if (failed) {
      if (failed.stage === 'chrome_error') {
        const recovered = await recoverGrokResponseFromHistory(prompt, options, url).catch(() => '');
        if (recovered) return acceptGrokResponse(recovered, prompt);
      }
      throw new Error(`Grok Web batch 실패(${failed.stage || "unknown"}): ${JSON.stringify(failed).slice(0, 1200)}`);
    }
    const done = parsedResults.filter((item) => item.done && item.response).at(-1);
    if (done) return acceptGrokResponse(done.response, prompt);
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
  if (args["cleanup-session"]) {
    const session = args["cleanup-session"];
    await closeAgentBrowserSession(session);
    process.stdout.write(JSON.stringify({ ok: true, cleanupSession: session }));
    return;
  }
  if (args["cleanup-orphans"] === "true") {
    const results = await cleanupOwnedGrokBrowserProfiles();
    process.stdout.write(JSON.stringify({ ok: true, cleanedProfiles: results.length, results }));
    return;
  }
  const promptPath = args.prompt;
  const outPath = args.out;
  if (!promptPath) throw new Error("--prompt 경로가 필요합니다.");
  if (!outPath) throw new Error("--out 경로가 필요합니다.");
  const prompt = fs.readFileSync(promptPath, "utf8");
  const session = args.session || process.env.TERAFABX_GROK_WEB_SESSION || DEFAULT_SESSION;
  activeSession = session;
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
  } catch (error) {
    const screenshotPath = args["error-screenshot"] || "";
    if (screenshotPath) {
      try {
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
        await runAgentBrowser(["screenshot", screenshotPath], {
          ...options,
          state: "",
          resume: true,
          timeoutMs: 15000,
        });
        if (fs.existsSync(screenshotPath)) error.screenshotPath = screenshotPath;
      } catch (screenshotError) {
        error.screenshotError = screenshotError.message;
      }
    }
    if (error.screenshotPath) error.message = `${error.message}\n오류 화면: ${error.screenshotPath}`;
    else if (error.screenshotError) error.message = `${error.message}\n오류 화면 캡처 실패: ${error.screenshotError}`;
    throw error;
  } finally {
    await closeAgentBrowserSession(session).catch(() => {});
    activeSession = null;
  }
}

if (require.main === module) {
  const handleSignal = (signal, exitCode) => {
    if (signalShutdownStarted) return;
    signalShutdownStarted = true;
    process.stderr.write(`[grok_runner_signal] pid=${process.pid} signal=${signal}\n`);
    for (const child of activeAgentBrowserChildren) {
      signalAgentBrowserProcessGroup(child, "SIGTERM");
    }
    const forceTimer = setTimeout(() => {
      for (const child of activeAgentBrowserChildren) {
        signalAgentBrowserProcessGroup(child, "SIGKILL");
      }
    }, 3000);
    closeAgentBrowserSession(activeSession || DEFAULT_SESSION)
      .catch(() => {})
      .finally(() => {
        clearTimeout(forceTimer);
        process.exit(exitCode);
      });
  };
  process.once("SIGTERM", () => handleSignal("SIGTERM", 143));
  process.once("SIGINT", () => handleSignal("SIGINT", 130));
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_GROK_URL,
  agentBrowserInvocation,
  agentBrowserOwnedRuntimeDir,
  agentBrowserProfileDir,
  buildGrokBatchCommandChunks,
  buildGrokBatchCommands,
  buildGrokHistoryRecoveryEvalScript,
  closeAgentBrowserSession,
  cleanupOwnedGrokBrowserProfiles,
  isGrokPromptEcho,
  isGrokTitleResponse,
  namespaceHasRuntimeArtifacts,
  namespaceProcessIds,
  normalizeGrokTitleResponse,
  ownedGrokBrowserPidsFromPs,
  parseDoneMarker,
  randomHumanDelayMs,
  runGrokPromptBatch,
};
