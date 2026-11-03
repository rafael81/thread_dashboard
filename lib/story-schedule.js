"use strict";

// An operating day crosses midnight: 06:00 KST through 01:00 KST next day.
const DAILY_STORY_LIMIT = 15;
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

function planStoryReschedule(items, now = Date.now(), externalReservations = []) {
  const movable = items.filter(item => item.status === "scheduled" && !item.postUrl && !item.intent
    && !item.reviewRequired && Date.parse(item.scheduledAt) > now)
    .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
  const movableIds = new Set(movable.map(item => item.id));
  const fixed = [...items.filter(item => !movableIds.has(item.id)
    && !["cancelled", "deleted_by_user", "missed"].includes(item.status)), ...externalReservations];
  const today = new Date(now + 9 * 3600000).toISOString().slice(0, 10);
  const assignments = [];
  let operatingDate = today;
  let index = 0;
  while (index < movable.length) {
    const slots = storySlots(operatingDate);
    const occupied = fixed.filter(item => item.operatingDate === operatingDate);
    if (occupied.length > DAILY_STORY_LIMIT) throw new Error(`Existing stories exceed daily limit: ${operatingDate}`);
    const capacity = DAILY_STORY_LIMIT - occupied.length;
    let available;
    if (operatingDate === today && capacity > 0) {
      const latestFixed = Math.max(0, ...occupied.map(item => Date.parse(item.scheduledAt) || 0));
      const start = Math.ceil(Math.max(now + 5 * 60000, latestFixed + 40 * 60000,
        Date.parse(slots[0].scheduledAt)) / 300000) * 300000;
      const end = Date.parse(slots.at(-1).scheduledAt);
      available = start <= end ? Array.from({ length: capacity }, (_, slot) =>
        new Date(Math.round((start + (end - start) * slot / Math.max(1, capacity - 1)) / 300000) * 300000).toISOString()) : [];
    } else {
      available = slots.map(slot => slot.scheduledAt)
        .filter(time => Date.parse(time) > now + 15 * 60000)
        .filter(time => occupied.every(item => Math.abs(Date.parse(item.scheduledAt) - Date.parse(time)) >= 40 * 60000))
        .slice(0, capacity);
    }
    for (const scheduledAt of available) {
      if (index >= movable.length) break;
      const row = movable[index++];
      assignments.push({ id: row.id, from: row.scheduledAt, operatingDate, scheduledAt });
    }
    operatingDate = new Date(Date.parse(`${operatingDate}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }
  return assignments;
}

module.exports = { storySlots, planStoryReschedule, DAILY_STORY_LIMIT };
