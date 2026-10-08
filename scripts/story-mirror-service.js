#!/usr/bin/env node
// Keep the existing server owner intact. Take over only when port 3131 is free.
const net = require("node:net");
const { spawn } = require("node:child_process");
const path = require("node:path");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function portOccupied() {
  return new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port: 3131 });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.setTimeout(2000);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(true));
  });
}
(async () => {
  if (await portOccupied()) console.log("Existing mirror server owns port 3131; standing by.");
  while (await portOccupied()) await sleep(5000);
  const child = spawn(process.execPath, [path.join(__dirname, "start-mirror-server.js")], { stdio: "inherit", cwd: path.resolve(__dirname, "..") });
  for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
  child.once("exit", code => process.exit(code || 0));
  child.once("error", error => { console.error(error); process.exit(1); });
})().catch(error => { console.error(error); process.exit(1); });
