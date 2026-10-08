"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const signature = Buffer.from("89504e470d0a1a0a", "hex");
const metadataChunks = new Set(["caBX", "eXIf", "tEXt", "iTXt", "zTXt"]);
const sha256 = data => crypto.createHash("sha256").update(data).digest("hex");

// Keep encoded pixels, palette, transparency and color-management chunks intact.
// Only the upload copy loses provenance/EXIF/text; the archived original stays intact.
function stripPngMetadata(input) {
  if (!input.subarray(0, 8).equals(signature)) throw new Error("Story upload requires a PNG image");
  const kept = [input.subarray(0, 8)], removed = [];
  let offset = 8, ended = false, hasPixels = false;
  while (offset < input.length) {
    if (offset + 12 > input.length) throw new Error("Truncated PNG chunk");
    const length = input.readUInt32BE(offset), end = offset + length + 12;
    if (end > input.length) throw new Error("Truncated PNG data");
    const type = input.toString("ascii", offset + 4, offset + 8);
    if (offset === 8 && (type !== "IHDR" || length !== 13)) throw new Error("Invalid PNG header");
    if (metadataChunks.has(type)) removed.push({ type, bytes: length });
    else kept.push(input.subarray(offset, end));
    if (type === "IDAT") hasPixels = true;
    offset = end;
    if (type === "IEND") {
      if (length !== 0 || offset !== input.length) throw new Error("Invalid PNG end or trailing data");
      ended = true; break;
    }
  }
  if (!ended || !hasPixels) throw new Error("Incomplete PNG image");
  return { buffer: Buffer.concat(kept), removed };
}

async function prepareStoryUpload(source, directory) {
  const original = fs.readFileSync(source);
  const { buffer, removed } = stripPngMetadata(original);
  const [before, after] = await Promise.all([
    sharp(original).raw().toBuffer({ resolveWithObject: true }),
    sharp(buffer).raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (JSON.stringify(before.info) !== JSON.stringify(after.info) || !before.data.equals(after.data)) {
    throw new Error("Story upload pixel verification failed");
  }
  const outputSha256 = sha256(buffer);
  const filename = path.join(directory, `${crypto.randomUUID()}-${outputSha256.slice(0, 12)}.png`);
  fs.writeFileSync(filename, buffer, { flag: "wx" });
  return { path: filename, source, sourceSha256: sha256(original), uploadSha256: outputSha256,
    removed, pixelsIdentical: true };
}

module.exports = { stripPngMetadata, prepareStoryUpload };
