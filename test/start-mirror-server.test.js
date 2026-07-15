const assert = require("node:assert/strict");
const test = require("node:test");

const {
  chromePort,
  chromeProfileName,
  chromeProfileRoot,
  isExpectedChromeCommand,
} = require("../scripts/start-mirror-server");

test("mirror launcher recognizes only the dedicated 9224 Profile 1 Chrome", () => {
  const expected = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    `--remote-debugging-port=${chromePort}`,
    `--user-data-dir=${chromeProfileRoot}`,
    `--profile-directory=${chromeProfileName}`,
  ].join(" ");

  assert.equal(isExpectedChromeCommand(expected), true);
  assert.equal(isExpectedChromeCommand(expected.replace("Profile 1", "Default")), false);
  assert.equal(isExpectedChromeCommand(expected.replace("9224", "9223")), false);
  assert.equal(isExpectedChromeCommand(expected.replace("gwajeuplupi-visible-9224", "another-profile")), false);
});
