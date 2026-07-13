export function formatKstDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function matchesDate(item, date) {
  return date === "all" || item?.date === date;
}

function reviewKey(item) {
  return String(item?.targetUrl || item?.targetId || item?.id || `${item?.at || ""}:${item?.comment || ""}`);
}

function normalizeReview(item, fallbackStatus) {
  return {
    ...item,
    status: item?.status || fallbackStatus,
    posted: item?.posted === true || fallbackStatus === "posted",
  };
}

export function buildAutomationScopeMetrics({
  date,
  todayDate,
  comments = [],
  pendingReviews = [],
  postedReviews = [],
  errorReviews = [],
  heartTimeline = [],
  dailyTarget = 500,
  intervalMs = 0,
} = {}) {
  const selectedComments = comments.filter((item) => matchesDate(item, date));
  const selectedHearts = heartTimeline.filter((item) => matchesDate(item, date));
  const reviewRecords = new Map();

  for (const item of errorReviews) reviewRecords.set(reviewKey(item), normalizeReview(item, "error"));
  for (const item of pendingReviews) reviewRecords.set(reviewKey(item), normalizeReview(item, "review"));
  for (const item of postedReviews) reviewRecords.set(reviewKey(item), normalizeReview(item, "posted"));
  for (const item of comments.filter((row) => row?.source === "comment_review_queue")) {
    reviewRecords.set(reviewKey(item), normalizeReview(item, "posted"));
  }

  const selectedReviews = Array.from(reviewRecords.values()).filter((item) => matchesDate(item, date));
  const selectedPendingReviews = selectedReviews.filter((item) => !item.posted && item.status !== "error");
  const selectedPostedReviews = selectedReviews.filter((item) => item.posted);
  const selectedErrorReviews = selectedReviews.filter((item) => !item.posted && item.status === "error");
  const qualityScores = selectedComments
    .map((item) => Number(item?.qualityScore))
    .filter(Number.isFinite);
  const isToday = date === todayDate;
  const target = Math.max(0, Number(dailyTarget || 0));

  return {
    date,
    isToday,
    isAll: date === "all",
    comments: selectedComments,
    pendingReviews: selectedPendingReviews,
    commentCount: selectedComments.length,
    reviewCount: selectedReviews.length,
    pendingReviewCount: selectedPendingReviews.length,
    postedReviewCount: selectedPostedReviews.length,
    errorReviewCount: selectedErrorReviews.length,
    qualityCount: qualityScores.length,
    qualityAverage: qualityScores.length
      ? Math.round(qualityScores.reduce((sum, score) => sum + score, 0) / qualityScores.length)
      : null,
    heartCount: selectedHearts.reduce((sum, item) => sum + Number(item?.count || 0), 0),
    heartRunCount: selectedHearts.length,
    displayCount: selectedComments.length + selectedPendingReviews.length,
    dailyTarget: target,
    remaining: isToday ? Math.max(0, target - selectedComments.length) : null,
    intervalMs: isToday ? Math.max(0, Number(intervalMs || 0)) : null,
  };
}
