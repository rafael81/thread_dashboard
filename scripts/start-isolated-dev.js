#!/usr/bin/env node
/**
 * 운영 대시보드(3131 / CDP 9224)와 분리된 개발 서버 기동.
 * 운영 Chrome 프로필·탭·락에 붙지 않는다.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const envFile = path.join(projectRoot, ".env");
const exampleFile = path.join(projectRoot, "env.isolated.example");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  if (typeof process.loadEnvFile !== "function") {
    throw new Error(`Node.js .env 로딩 미지원: ${process.version}`);
  }
  process.loadEnvFile(filePath);
  return true;
}

function applyExampleDefaults() {
  if (!fs.existsSync(exampleFile)) return;
  const text = fs.readFileSync(exampleFile, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(envFile);
applyExampleDefaults();

const port = Number(process.env.PORT || 4131);
const chromePort = Number(process.env.CHROME_PORT || 9424);
const writerPort = Number(process.env.TERAFABX_AUTO_COMMENT_WRITER_PORT || 9338);

const forbidden = [];
if (port === 3131) forbidden.push("PORT=3131 (운영 HTTP)");
if (chromePort === 9224 && process.env.E2E_ALLOW_OPS_CHROME !== "true") {
  forbidden.push("CHROME_PORT=9224 (운영 가시 Chrome) — E2E만 E2E_ALLOW_OPS_CHROME=true");
}
if (writerPort === 9238) forbidden.push("TERAFABX_AUTO_COMMENT_WRITER_PORT=9238 (운영 writer)");
if (String(process.env.TERAFABX_STATE_PATH || "").includes("/thread_dashboard/.data")
  && !String(process.env.TERAFABX_STATE_PATH || "").includes("home-verified")) {
  forbidden.push("TERAFABX_STATE_PATH points at ops tree .data");
}

if (forbidden.length) {
  console.error("[start-isolated-dev] 운영 충돌 위험 — 기동 중단:");
  for (const item of forbidden) console.error(`  - ${item}`);
  console.error("env.isolated.example 값을 사용하거나 .env를 수정하세요.");
  process.exit(1);
}

process.env.PORT = String(port);
process.env.CHROME_PORT = String(chromePort);
process.chdir(projectRoot);

console.log("[start-isolated-dev] project:", projectRoot);
console.log("[start-isolated-dev] PORT:", port);
console.log("[start-isolated-dev] CHROME_PORT:", chromePort, "(운영 9224 아님)");
console.log("[start-isolated-dev] writer:", process.env.TERAFABX_AUTO_COMMENT_WRITER_PORT || 9338);
console.log("[start-isolated-dev] 운영 Chrome 자동 기동 없음. HTTP only.");

const child = spawn(process.execPath, [path.join(projectRoot, "mirror_server.js")], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
