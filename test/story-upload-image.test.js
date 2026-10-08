const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { stripPngMetadata, prepareStoryUpload } = require("../lib/story-upload-image");

function chunk(type, text) {
  const data = Buffer.from(text), encoded = Buffer.alloc(data.length + 12);
  encoded.writeUInt32BE(data.length); encoded.write(type, 4); data.copy(encoded, 8);
  let crc = 0xffffffff;
  for (const byte of encoded.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  encoded.writeUInt32BE((crc ^ 0xffffffff) >>> 0, encoded.length - 4);
  return encoded;
}

test("upload drops provenance/text metadata, preserves pixels and archived bytes", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "story-upload-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const png = await sharp({ create: { width: 7, height: 9, channels: 4, background: { r: 10, g: 60, b: 90, alpha: 0.5 } } }).png().toBuffer();
  const input = Buffer.concat([png.subarray(0, 33), chunk("caBX", "c2pa OpenAI trainedAlgorithmicMedia"), chunk("tEXt", "Software\0AI generator"), png.subarray(33)]);
  const source = path.join(directory, "original.png"); fs.writeFileSync(source, input);
  const result = await prepareStoryUpload(source, directory);
  assert.ok(fs.readFileSync(source).equals(input));
  assert.ok(fs.readFileSync(result.path).equals(png));
  assert.deepEqual(result.removed.map(item => item.type), ["caBX", "tEXt"]);
  assert.equal(result.pixelsIdentical, true);
  assert.notEqual(result.sourceSha256, result.uploadSha256);
  assert.ok(stripPngMetadata(fs.readFileSync(result.path)).buffer.equals(png));
});

test("invalid or truncated images fail before an upload copy is written", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "story-upload-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, "broken.png");
  fs.writeFileSync(source, "not a PNG");
  await assert.rejects(prepareStoryUpload(source, directory), /PNG/);
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } }).png().toBuffer();
  assert.throws(() => stripPngMetadata(png.subarray(0, -5)), /Truncated/);
  assert.throws(() => stripPngMetadata(Buffer.concat([png, Buffer.from("trailing provenance")])), /trailing/);
  assert.deepEqual(fs.readdirSync(directory), ["broken.png"]);
});
