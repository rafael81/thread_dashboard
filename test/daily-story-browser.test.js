"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { storyBrowserResource, assertStoryBrowserProcess } = require("../lib/daily-story-browser");
test("story roots have a separate headless resource with the existing login source", () => {
  const r = storyBrowserResource("/project");
  assert.equal(r.port, 9444); assert.equal(r.authSourcePort, 9224); assert.equal(r.headless, true);
  assert.notEqual(r.port, 9239); assert.match(r.lockPath, /story-writer-9444/);
  assert.doesNotThrow(() => assertStoryBrowserProcess(`Chrome --remote-debugging-port=9444 --user-data-dir=${r.profileDir} --headless=new`, r));
});
test("refuses a headed, unrelated-profile, or unrelated-port process", () => {
  const r = storyBrowserResource("/project"), base = `Chrome --remote-debugging-port=9444 --user-data-dir=${r.profileDir}`;
  for (const command of [base, `${base.replace(r.profileDir, "/other")} --headless=new`, `${base.replace(r.profileDir, r.profileDir + "-other")} --headless=new`, `${base.replace("9444", "94440")} --headless=new`, `${base.replace("9444", "9224")} --headless=new`]) {
    assert.throws(() => assertStoryBrowserProcess(command, r), /dedicated headless/);
  }
});
