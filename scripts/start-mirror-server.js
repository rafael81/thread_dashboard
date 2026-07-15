#!/usr/bin/env node

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { spawn } = require("node:child_process");

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(__dirname, "..");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chromePort = 9224;
const chromeProfileRoot = path.join(projectRoot, ".data", "chrome-profiles", "gwajeuplupi-visible-9224");
const chromeProfileName = "Profile 1";

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

async function listenerCommands() {
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync("lsof", ["-tiTCP:9224", "-sTCP:LISTEN"]));
  } catch (error) {
    if (error.code === 1) return [];
    throw error;
  }

  const commands = [];
  for (const pid of stdout.split(/\s+/).filter(Boolean)) {
    try {
      const result = await execFileAsync("ps", ["-p", pid, "-o", "command="]);
      commands.push(result.stdout.trim());
    } catch {
      // The process may exit between lsof and ps.
    }
  }
  return commands;
}

function isExpectedChromeCommand(command) {
  return command.includes(`--remote-debugging-port=${chromePort}`)
    && command.includes(`--user-data-dir=${chromeProfileRoot}`)
    && command.includes(`--profile-directory=${chromeProfileName}`);
}

async function waitForExpectedChrome(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await chromeCdpIsReady()) {
      const commands = await listenerCommands();
      if (commands.some(isExpectedChromeCommand)) return;
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
    const commands = await listenerCommands();
    if (!commands.some(isExpectedChromeCommand)) {
      throw new Error(`포트 ${chromePort}가 지정된 Chrome 프로필이 아닌 다른 프로세스에서 사용 중입니다.`);
    }
    console.log(`Chrome ${chromePort}가 이미 지정 프로필로 실행 중입니다.`);
    return;
  }

  fs.mkdirSync(chromeProfileRoot, { recursive: true });
  const child = spawn(chromePath, [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfileRoot}`,
    `--profile-directory=${chromeProfileName}`,
  ], {
    cwd: projectRoot,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  await waitForExpectedChrome();
  console.log(`Chrome ${chromePort}를 지정 프로필로 실행했습니다.`);
}

async function main() {
  await ensureChrome();
  process.chdir(projectRoot);
  require(path.join(projectRoot, "mirror_server.js")).startServer();
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
  ensureChrome,
  isExpectedChromeCommand,
};
