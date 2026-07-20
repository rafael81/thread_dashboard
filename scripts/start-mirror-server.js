#!/usr/bin/env node

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, "..");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePort = 9224;
const chromeProfileRoot = path.join(projectRoot, ".data", "chrome-profiles", "gwajeuplupi-visible-9224");
const chromeProfileName = "Profile 1";

function loadProjectEnv(envPath = path.join(projectRoot, ".env")) {
  if (!fs.existsSync(envPath)) return { loaded: false, path: envPath };
  if (typeof process.loadEnvFile !== "function") {
    throw new Error(`현재 Node.js는 .env 로딩을 지원하지 않습니다: ${process.version}`);
  }
  const inheritedEnvironment = new Map(Object.entries(process.env));
  process.loadEnvFile(envPath);
  for (const [key, value] of inheritedEnvironment) process.env[key] = value;
  return { loaded: true, path: envPath };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function chromeCdpIsReady() {
  try {
    const response = await fetch(`http://127.0.0.1:${chromePort}/json/version`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function listenerProcesses() {
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync("lsof", ["-tiTCP:9224", "-sTCP:LISTEN"]));
  } catch (error) {
    if (error.code === 1) return [];
    throw error;
  }

  const processes = [];
  for (const pid of stdout.split(/\s+/).filter(Boolean)) {
    try {
      const result = await execFileAsync("ps", ["-p", pid, "-o", "ppid=,command="]);
      const match = result.stdout.trim().match(/^(\d+)\s+([\s\S]+)$/);
      if (match) processes.push({ pid: Number(pid), ppid: Number(match[1]), command: match[2] });
    } catch {
      // The process may exit between lsof and ps.
    }
  }
  return processes;
}

function isExpectedChromeCommand(command) {
  return command.includes(`--remote-debugging-port=${chromePort}`)
    && command.includes(`--user-data-dir=${chromeProfileRoot}`)
    && command.includes(`--profile-directory=${chromeProfileName}`);
}

function parseCurrentGuiChromePids(output) {
  return Array.from(String(output || "").matchAll(
    /"Google Chrome"[\s\S]*?bundleID="com\.google\.Chrome"[\s\S]*?\bpid\s*=\s*(\d+)/g,
  ), (match) => Number(match[1])).filter(Number.isInteger);
}

function classifyChromeSession(processes, guiPids) {
  const guiPidSet = new Set((guiPids || []).map(Number));
  const expected = (processes || []).filter((item) => isExpectedChromeCommand(item.command || ""));
  return {
    expected,
    unexpected: (processes || []).filter((item) => !isExpectedChromeCommand(item.command || "")),
    visibleExpected: expected.filter((item) => guiPidSet.has(Number(item.pid))),
    orphanedExpected: expected.filter((item) => !guiPidSet.has(Number(item.pid))),
  };
}

async function currentGuiChromePids() {
  const { stdout } = await execFileAsync("lsappinfo", ["list"]);
  return parseCurrentGuiChromePids(stdout);
}

async function chromeSessionStatus() {
  const [processes, guiPids] = await Promise.all([listenerProcesses(), currentGuiChromePids()]);
  return classifyChromeSession(processes, guiPids);
}

async function stopDedicatedChrome(processes, timeoutMs = 10000) {
  const pids = [...new Set((processes || []).map((item) => Number(item.pid)).filter(Number.isInteger))];
  for (const pid of pids) {
    try { process.kill(pid, "SIGTERM"); } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const alive = pids.filter((pid) => {
      try { process.kill(pid, 0); return true; } catch { return false; }
    });
    if (!alive.length) return;
    await sleep(250);
  }
  for (const pid of pids) {
    try { process.kill(pid, "SIGKILL"); } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}

async function launchVisibleChrome() {
  fs.mkdirSync(chromeProfileRoot, { recursive: true });
  await execFileAsync("open", [
    "-na", "Google Chrome", "--args",
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfileRoot}`,
    `--profile-directory=${chromeProfileName}`,
  ], { cwd: projectRoot });
}

async function activateChrome(pid) {
  await execFileAsync("osascript", [
    "-e",
    `tell application "System Events" to set frontmost of first process whose unix id is ${Number(pid)} to true`,
  ]);
}

async function waitForExpectedChrome(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await chromeCdpIsReady()) {
      const status = await chromeSessionStatus();
      if (status.visibleExpected.length) return status.visibleExpected[0];
      if (status.orphanedExpected.length) {
        throw new Error(`Chrome ${chromePort}가 현재 화면 세션에 등록되지 않았습니다.`);
      }
      throw new Error(`포트 ${chromePort}가 지정된 Chrome 프로필이 아닌 다른 프로세스에서 사용 중입니다.`);
    }
    await sleep(300);
  }
  throw new Error(`Chrome 원격 디버깅 포트 ${chromePort}가 ${timeoutMs / 1000}초 안에 준비되지 않았습니다.`);
}

async function ensureChrome() {
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Google Chrome 실행 파일을 찾을 수 없습니다: ${chromePath}`);
  }

  if (await chromeCdpIsReady()) {
    const status = await chromeSessionStatus();
    if (status.unexpected.length) {
      throw new Error(`포트 ${chromePort}가 지정된 Chrome 프로필이 아닌 다른 프로세스에서 사용 중입니다.`);
    }
    if (status.visibleExpected.length) {
      await activateChrome(status.visibleExpected[0].pid);
      console.log(`Chrome ${chromePort}가 현재 화면 세션에서 지정 프로필로 실행 중입니다.`);
      return;
    }
    if (status.orphanedExpected.length) {
      console.log(`Chrome ${chromePort} 고아 프로세스를 정리하고 현재 화면 세션에서 다시 실행합니다.`);
      await stopDedicatedChrome(status.orphanedExpected);
    }
  }

  await launchVisibleChrome();
  const chrome = await waitForExpectedChrome();
  await activateChrome(chrome.pid);
  console.log(`Chrome ${chromePort}를 현재 화면 세션에서 지정 프로필로 실행했습니다.`);
}

async function main() {
  const env = loadProjectEnv();
  if (env.loaded) console.log("프로젝트 .env 환경변수를 로드했습니다.");
  await ensureChrome();
  process.chdir(projectRoot);
  await require(path.join(projectRoot, "mirror_server.js")).startServer();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`통합 서버 시작 실패: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  chromePath,
  chromePort,
  chromeProfileName,
  chromeProfileRoot,
  classifyChromeSession,
  ensureChrome,
  isExpectedChromeCommand,
  loadProjectEnv,
  parseCurrentGuiChromePids,
};
