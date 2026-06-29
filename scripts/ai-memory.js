#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DIMENSIONS = 384;
const MEMORY_DIR = path.join(__dirname, "..", ".memory");
const DB_PATH = process.env.AI_MEMORY_DB || path.join(MEMORY_DIR, "agent.db");

function usage() {
  console.log(`Usage:
  node scripts/ai-memory.js init
  node scripts/ai-memory.js add <kind> <content> [tags]
  node scripts/ai-memory.js search <query> [limit]
  node scripts/ai-memory.js seed-current-project

Examples:
  node scripts/ai-memory.js add rule "Threads-to-X changes require E2E" e2e,rule
  node scripts/ai-memory.js search "android app server async endpoint" 5`);
}

async function openDb() {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
  const { connect } = await import("@tursodatabase/database");
  return connect(DB_PATH);
}

async function initDb(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      embedding F32_BLOB(${DIMENSIONS}) NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      embedding F32_BLOB(${DIMENSIONS}) NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[^a-z0-9가-힣_@./:-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function hashEmbedding(text) {
  const vector = new Float32Array(DIMENSIONS);
  const tokens = tokenize(text);
  const source = tokens.length ? tokens : [String(text || "")];
  for (const token of source) {
    const digest = crypto.createHash("sha256").update(token).digest();
    const index = digest.readUInt32BE(0) % DIMENSIONS;
    const sign = digest[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vector, (value) => value / norm);
}

async function addMemory(db, kind, content, tags = "") {
  const embedding = JSON.stringify(hashEmbedding(`${kind} ${tags} ${content}`));
  const existing = await db.prepare(`
    SELECT id FROM memories
    WHERE kind = ? AND content = ?
    LIMIT 1
  `).get(kind, content);
  if (existing) {
    await db.prepare(`
      UPDATE memories
      SET tags = ?, embedding = vector32(?), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(tags, embedding, existing.id);
    return { id: existing.id, updated: true };
  }
  const result = await db.prepare(`
    INSERT INTO memories (kind, content, tags, embedding)
    VALUES (?, ?, ?, vector32(?))
  `).run(kind, content, tags, embedding);
  return { id: Number(result.lastInsertRowid), updated: false };
}

async function searchMemories(db, query, limit = 8) {
  const embedding = JSON.stringify(hashEmbedding(query));
  await db.prepare(`
    INSERT INTO tasks (description, embedding)
    VALUES (?, vector32(?))
  `).run(query, embedding);
  return db.prepare(`
    SELECT
      id,
      kind,
      content,
      tags,
      created_at,
      vector_distance_cos(embedding, vector32(?)) AS distance
    FROM memories
    ORDER BY distance ASC
    LIMIT ?
  `).all(embedding, limit);
}

async function seedCurrentProject(db) {
  const memories = [
    ["path", "Mirror server lives at /Users/user/Documents/thread_download/mirror_server.js.", "server,path"],
    ["path", "Android share app lives at /Users/user/project/personal/thread-android-share.", "android,path"],
    ["config", "Android app default mirror server URL is http://100.81.231.118:3131.", "android,server"],
    ["config", "Mirror server uses headed Chrome remote debugging port 9224 and must verify X account @terafabXai before posting.", "x,chrome,security"],
    ["behavior", "Android app has no queue, schedule toggle, or title editing; sharing a Threads URL posts immediately to /api/mirror-thread-async.", "android,async"],
    ["behavior", "/api/mirror-thread-async validates and accepts quickly, then runs real X posting in the server background.", "server,async"],
    ["behavior", "Duplicate prevention is server-side via mirror-history.json; already posted or scheduled canonical Threads URLs return duplicate/409.", "server,dedupe"],
    ["bugfix", "Threads text extraction removes standalone non-author social handle lines such as destination_now_ to avoid leaking recommendation/comment account names.", "threads,extraction"],
    ["rule", "Any Threads-to-X mirroring or scheduling change requires E2E before claiming completion.", "e2e,rule"],
    ["rule", "For X scheduling changes, E2E must operate real X schedule date, time, and minute controls in Chrome.", "e2e,schedule"],
  ];
  for (const [kind, content, tags] of memories) {
    const result = await addMemory(db, kind, content, tags);
    console.log(`${result.updated ? "updated" : "added"} #${result.id}: ${kind} ${tags}`);
  }
}

async function main() {
  const command = process.argv[2];
  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  const db = await openDb();
  await initDb(db);

  if (command === "init") {
    console.log(`AI memory ready: ${DB_PATH}`);
    return;
  }

  if (command === "add") {
    const kind = process.argv[3];
    const content = process.argv[4];
    const tags = process.argv[5] || "";
    if (!kind || !content) {
      usage();
      process.exitCode = 1;
      return;
    }
    const result = await addMemory(db, kind, content, tags);
    console.log(`${result.updated ? "updated" : "added"} memory #${result.id}`);
    return;
  }

  if (command === "search") {
    const query = process.argv[3];
    const limit = Number(process.argv[4] || 8);
    if (!query) {
      usage();
      process.exitCode = 1;
      return;
    }
    const rows = await searchMemories(db, query, Number.isFinite(limit) ? limit : 8);
    for (const row of rows) {
      console.log(`#${row.id} ${row.kind} [${row.tags}] distance=${row.distance.toFixed(4)}`);
      console.log(row.content);
    }
    return;
  }

  if (command === "seed-current-project") {
    await seedCurrentProject(db);
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
