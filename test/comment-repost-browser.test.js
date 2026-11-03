"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { repostBrowserResource, assertRepostBrowserProcess } = require("../lib/comment-repost-browser");

test("reposts use a dedicated headless profile and lock, with 9224 only as authentication source", () => {
  const r = repostBrowserResource("/project");
  assert.equal(r.port, 9445);
  assert.equal(r.authSourcePort, 9224);
  assert.equal(r.headless, true);
  assert.match(r.profileDir, /terafabx-comment-repost-9445$/);
  assert.match(r.lockPath, /terafabx-comment-repost-9445\.lock$/);
  assert.doesNotThrow(() => assertRepostBrowserProcess(
    `Chrome --remote-debugging-port=9445 --user-data-dir=${r.profileDir} --headless=new`, r));
});

test("headed processes and similar but different ports or profiles are rejected", () => {
  const r = repostBrowserResource("/project");
  const base = `Chrome --remote-debugging-port=9445 --user-data-dir=${r.profileDir}`;
  for (const command of [base, `${base.replace("9445", "9224")} --headless=new`,
    `${base.replace("9445", "94450")} --headless=new`, `${base}-other --headless=new`]) {
    assert.throws(() => assertRepostBrowserProcess(command, r), /dedicated headless/);
  }
});
