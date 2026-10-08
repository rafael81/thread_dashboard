"use strict";

// An operating day crosses midnight: 06:00 KST through 01:00 KST next day.
const DAILY_STORY_LIMIT = 30;
function storySlots(operatingDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(operatingDate)) throw new Error("Expected YYYY-MM-DD");
  const start = new Date(`${operatingDate}T06:00:00+09:00`);
  if (!Number.isFinite(start.getTime()) || new Date(start.getTime() + 9 * 3600000).toISOString().slice(0, 10) !== operatingDate) {
    throw new Error("Invalid operating date");
  }
  return Array.from({ length: DAILY_STORY_LIMIT }, (_, index) => ({
    slot: index + 1,
    scheduledAt: new Date(start.getTime() + Math.round(index * 228 / (DAILY_STORY_LIMIT - 1)) * 300000).toISOString(),
  }));
}

module.exports = { storySlots, DAILY_STORY_LIMIT };
