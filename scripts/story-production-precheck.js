#!/usr/bin/env node
// Do not start a second scheduled producer while this session is making stock.
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(__dirname, "../.data/story-drafts/production-lease.json");
if (fs.existsSync(file)) {
  const lease = JSON.parse(fs.readFileSync(file, "utf8"));
  if (lease.active && Date.parse(lease.expiresAt) > Date.now()) {
    console.log("Continuous production is already running; skipping overlapping producer.");
    process.exit(1);
  }
}
