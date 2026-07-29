const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "thread-android-share");
const activitySource = fs.readFileSync(
  path.join(root, "app", "src", "main", "java", "com", "threadshare", "app", "MainActivity.java"),
  "utf8",
);
const manifestSource = fs.readFileSync(
  path.join(root, "app", "src", "main", "AndroidManifest.xml"),
  "utf8",
);
const gradleSource = fs.readFileSync(path.join(root, "app", "build.gradle.kts"), "utf8");

test("Threads Android share parser accepts every standard Android URL payload channel", () => {
  assert.match(activitySource, /getCharSequenceExtra\(Intent\.EXTRA_TEXT\)/);
  assert.match(activitySource, /getCharSequenceExtra\(Intent\.EXTRA_TITLE\)/);
  assert.match(activitySource, /getDataString\(\)/);
  assert.match(activitySource, /getClipData\(\)/);
  assert.match(activitySource, /getItemAt\(index\)/);
  assert.match(activitySource, /extras\.get\(Intent\.EXTRA_STREAM\)/);
  assert.doesNotMatch(activitySource, /getStringExtra\(Intent\.EXTRA_TEXT\)/);
});

test("Threads Android share parser accepts and resolves current short share URLs", () => {
  assert.match(activitySource, /THREADS_SHORT_URL/);
  assert.match(activitySource, /threads\\\\\.\(\?:com\|net\)\/t\//);
  assert.match(activitySource, /resolveThreadUrlForServer\(threadUrl\)/);
  assert.match(activitySource, /setInstanceFollowRedirects\(true\)/);
  assert.match(activitySource, /body\.put\("url", resolvedThreadUrl\)/);
});

test("Threads Android share target accepts single and multiple send intents", () => {
  assert.equal((manifestSource.match(/android\.intent\.action\.SEND"/g) || []).length, 2);
  assert.equal((manifestSource.match(/android\.intent\.action\.SEND_MULTIPLE"/g) || []).length, 2);
});

test("Threads Android share parser fix increments the app version consistently", () => {
  assert.match(manifestSource, /android:versionCode="11"/);
  assert.match(manifestSource, /android:versionName="0\.6\.5"/);
  assert.match(gradleSource, /versionCode = 11/);
  assert.match(gradleSource, /versionName = "0\.6\.5"/);
});

test("Threads Android share app defaults to the current Tailscale dashboard address", () => {
  assert.match(activitySource, /DEFAULT_API_BASE_URL = "http:\/\/100\.74\.184\.62:3131"/);
});
