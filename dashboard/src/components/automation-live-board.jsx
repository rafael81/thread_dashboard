import React, { useMemo, useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDotIcon,
  Clock3Icon,
  ExternalLinkIcon,
  GaugeIcon,
  Loader2Icon,
  PauseCircleIcon,
  PlayCircleIcon,
  WifiIcon,
  WifiOffIcon,
  XCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

const STAGE_LABELS = {
  collect: "수집",
  context: "문맥·초안",
  gemini: "Gemini 검수",
  queue: "게시 대기",
  x_post: "X 게시",
  complete: "완료",
};

const STATE_LABELS = {
  active: "처리 중",
  waiting: "대기",
  delayed: "지연",
  error: "오류",
  complete: "완료",
  idle: "유휴",
};

const STATE_STYLES = {
  active: {
    border: "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
    text: "text-blue-600 dark:text-blue-400",
    badge: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  },
  waiting: {
    border: "border-border bg-background",
    text: "text-muted-foreground",
    badge: "border-border bg-muted/50 text-muted-foreground",
  },
  delayed: {
    border: "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20",
    text: "text-amber-700 dark:text-amber-400",
    badge: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
  error: {
    border: "border-destructive/60 bg-destructive/5",
    text: "text-destructive",
    badge: "border-destructive/30 bg-destructive/5 text-destructive",
  },
  complete: {
    border: "border-emerald-300 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20",
    text: "text-emerald-700 dark:text-emerald-400",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300",
  },
  idle: {
    border: "border-border bg-background",
    text: "text-muted-foreground",
    badge: "border-border bg-background text-muted-foreground",
  },
};

const UNIT_LABELS = {
  root_post: "원글",
  root_context: "원글 문맥",
  reply_candidate: "대댓글 후보",
  queued_reply: "게시 대기 댓글",
  active_x_write: "게시 중 댓글",
  posted_reply: "게시 완료 댓글",
};

const VALUE_KIND_LABELS = {
  available: "발견",
  active: "처리 중",
  completed: "완료",
  remaining: "남은",
};

function compact(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function normalizedStageMetric(stage) {
  if (stage?.metric) return stage.metric;
  return {
    unit: "unknown",
    valueKind: "remaining",
    value: Number(stage?.count || 0),
    total: Number(stage?.count || 0),
    completed: 0,
    remaining: Number(stage?.count || 0),
    source: "legacy",
    runId: null,
  };
}

function stageMetricCaption(metric) {
  const unit = UNIT_LABELS[metric?.unit] || "항목";
  const valueKind = VALUE_KIND_LABELS[metric?.valueKind] || "현재";
  return `${valueKind} ${unit}`;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function fallbackSnapshot({ pipeline, metrics, comments, reviewComments, enabled }) {
  const stageMap = {
    checking_queue: "collect",
    grok_context: "context",
    gemini_profiles: "gemini",
    gemini_batch: "gemini",
    queue_ready: "queue",
    blocked: "context",
  };
  const activeStage = stageMap[pipeline?.stage] || (Number(pipeline?.pendingCount || 0) ? "queue" : null);
  const failed = pipeline?.status === "blocked";
  const stages = Object.entries(STAGE_LABELS).map(([id, label]) => {
    const count = id === "queue"
      ? Number(pipeline?.pendingCount || 0)
      : id === "complete"
        ? Number(metrics.commentCount || 0)
        : id === "gemini"
          ? Number(metrics.pendingReviewCount || 0)
          : 0;
    const metricConfig = {
      collect: { unit: "root_post", valueKind: "available" },
      context: { unit: "root_context", valueKind: "active" },
      gemini: { unit: "reply_candidate", valueKind: "remaining" },
      queue: { unit: "queued_reply", valueKind: "remaining" },
      x_post: { unit: "active_x_write", valueKind: "active" },
      complete: { unit: "posted_reply", valueKind: "completed" },
    }[id];
    return {
      id,
      label,
      state: failed && id === activeStage
      ? "error"
      : id === activeStage
        ? "active"
        : id === "complete" && metrics.commentCount
          ? "complete"
          : id === "queue" && Number(pipeline?.pendingCount || 0)
            ? "waiting"
            : "idle",
      count,
      metric: {
        ...metricConfig,
        value: count,
        total: count,
        completed: id === "complete" ? count : 0,
        remaining: id === "complete" ? 0 : count,
        source: "dashboard_fallback",
        runId: null,
      },
      detail: id === "queue"
        ? `대기열 ${compact(pipeline?.pendingCount)}건`
        : id === "complete"
          ? "선택 날짜 기준"
          : "실시간 연결 대기",
    };
  });
  const activities = [
    ...reviewComments.slice(0, 3).map((item) => ({
      id: `review-${item.id || item.targetUrl}`,
      status: "waiting",
      stage: "gemini",
      title: item.comment || "Gemini 검수 대기",
      targetText: item.targetText || "",
      targetUrl: item.targetUrl || "",
      at: item.at,
      detail: item.geminiReview?.reason || "검수 대기열",
    })),
    ...comments.slice(0, 6).map((item) => ({
      id: `comment-${item.replyUrl || item.targetUrl || item.at}`,
      status: "complete",
      stage: "complete",
      title: item.comment || "자동댓글 게시 완료",
      targetText: item.targetText || "",
      targetUrl: item.replyUrl || item.targetUrl || "",
      at: item.at,
      detail: `${item.qualityScore || "-"}점 · @${item.follower?.handle || "terafabXai"}`,
    })),
  ];
  return {
    schemaVersion: 2,
    enabled,
    updatedAt: null,
    pipeline: {
      status: pipeline?.status || "idle",
      label: pipeline?.label || "대기",
      blocker: pipeline?.blocker || pipeline?.lastError || null,
    },
    daily: {
      posted: Number(metrics.commentCount || 0),
      target: Number(metrics.dailyTarget || 0),
      remaining: Number(metrics.remaining || 0),
    },
    throughputPerMinute: 0,
    runs: {
      current: null,
      lastCompleted: null,
    },
    stages,
    summary: {
      activeStages: stages.filter((stage) => stage.state === "active").length,
      waitingReplies: Number(pipeline?.pendingCount || 0),
      active: stages.filter((stage) => stage.state === "active").length,
      waiting: Number(pipeline?.pendingCount || 0),
      delayed: 0,
      failed: failed ? 1 : 0,
    },
    activities,
  };
}

function StateIcon({ state, className = "size-4" }) {
  if (state === "complete") return <CheckCircle2Icon className={className} />;
  if (state === "error") return <XCircleIcon className={className} />;
  if (state === "delayed" || state === "waiting") return <Clock3Icon className={className} />;
  return <CircleDotIcon className={`${className} ${state === "active" ? "motion-safe:animate-pulse" : ""}`} />;
}

function activityStatusLabel(status) {
  return {
    active: "진행 중",
    waiting: "대기 중",
    delayed: "지연",
    error: "실패",
    complete: "완료",
  }[status] || "대기";
}

function normalizeActivityDisplay(item, snapshot) {
  const currentRun = snapshot?.runs?.current;
  const isCurrentRun = item?.scope === "current"
    && item?.runId
    && item.runId === currentRun?.id;
  const isCompletedCoverageRoot = item?.scope === "history"
    && item?.status === "complete"
    && item?.stage === "collect"
    && String(item?.id || "").startsWith("coverage-");
  return {
    ...item,
    stage: isCompletedCoverageRoot ? "complete" : item.stage,
    at: isCurrentRun ? currentRun.startedAt || item.at : item.at,
    detail: isCompletedCoverageRoot
      ? `내 X 원글 댓글 확인 완료 · ${item.detail || "처리 결과 없음"}`
      : item.detail,
  };
}

export function AutomationLiveBoard({
  liveSnapshot,
  connectionState,
  comments = [],
  reviewComments = [],
  pipeline,
  metrics,
  enabled,
  actionBusy,
  onToggleEnabled,
  automationDate,
  availableDates,
  onAutomationDateChange,
  automationSort,
  onAutomationSortChange,
}) {
  const [activityFilter, setActivityFilter] = useState("all");
  const [expandedActivity, setExpandedActivity] = useState("");
  const snapshot = liveSnapshot || fallbackSnapshot({
    pipeline,
    metrics,
    comments,
    reviewComments,
    enabled,
  });
  const progress = snapshot.daily?.target
    ? Math.min(100, Math.round((Number(snapshot.daily.posted || 0) / Number(snapshot.daily.target)) * 100))
    : 0;
  const activities = useMemo(() => {
    const rows = (snapshot.activities || []).map((item) => normalizeActivityDisplay(item, snapshot));
    if (activityFilter === "all") return rows;
    if (activityFilter === "progress") return rows.filter((item) => ["active", "waiting"].includes(item.status));
    return rows.filter((item) => item.status === activityFilter);
  }, [activityFilter, snapshot]);
  const connected = connectionState === "connected";
  const reconnecting = connectionState === "reconnecting";
  const effectiveEnabled = typeof snapshot.enabled === "boolean" ? snapshot.enabled : enabled;

  return (
    <section className="overflow-hidden rounded-xl border bg-background" aria-label="실시간 자동댓글 파이프라인">
      <div className="flex flex-col gap-3 border-b px-4 py-4 lg:flex-row lg:items-center lg:justify-between lg:px-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <div
            className={`flex items-center gap-2 font-medium ${
              connected ? "text-emerald-700 dark:text-emerald-400" : reconnecting ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"
            }`}
            role="status"
            aria-live="polite"
          >
            {connected ? <WifiIcon className="size-4" /> : <WifiOffIcon className="size-4" />}
            {connected ? "SSE 연결됨" : reconnecting ? "재연결 중" : "연결 중"}
          </div>
          <div className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
          <div className="min-w-[230px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">오늘 진행도</span>
              <strong className="tabular-nums">
                {compact(snapshot.daily?.posted)} / {compact(snapshot.daily?.target)}
              </strong>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
                role="progressbar"
                aria-label="오늘 자동댓글 진행도"
                aria-valuemin={0}
                aria-valuemax={Number(snapshot.daily?.target || 0)}
                aria-valuenow={Number(snapshot.daily?.posted || 0)}
              />
            </div>
          </div>
          <div className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
          <div className="flex items-center gap-2">
            <GaugeIcon className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">현재 처리율</span>
            <strong className="tabular-nums">{Number(snapshot.throughputPerMinute || 0).toLocaleString("ko-KR")}건/분</strong>
          </div>
          <div className="text-xs text-muted-foreground">
            마지막 업데이트 {formatTime(snapshot.updatedAt)}
          </div>
        </div>
        <Button
          type="button"
          variant={effectiveEnabled ? "outline" : "default"}
          size="sm"
          disabled={actionBusy}
          onClick={() => onToggleEnabled?.(!effectiveEnabled)}
        >
          {actionBusy ? (
            <Loader2Icon data-icon="inline-start" className="animate-spin" />
          ) : effectiveEnabled ? (
            <PauseCircleIcon data-icon="inline-start" />
          ) : (
            <PlayCircleIcon data-icon="inline-start" />
          )}
          {effectiveEnabled ? "일시정지" : "자동화 재개"}
        </Button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[960px] grid-cols-6 gap-2 p-4 lg:p-5">
          {snapshot.stages.map((stage, index) => {
            const style = STATE_STYLES[stage.state] || STATE_STYLES.idle;
            const metric = normalizedStageMetric(stage);
            const item = (snapshot.activities || []).find((activity) => (
              activity.stage === stage.id
              && (activity.scope === "current" || (!activity.scope && stage.id !== "complete"))
            )) || (stage.id === "complete"
              ? (snapshot.activities || []).find((activity) => activity.stage === stage.id)
              : null);
            return (
              <div key={stage.id} className="relative min-w-0">
                <div className="mb-3 flex min-h-12 items-start justify-between gap-2 px-1">
                  <div>
                    <div className="text-sm font-medium">{stage.label || STAGE_LABELS[stage.id]}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{stage.detail || "상태 없음"}</div>
                  </div>
                  {index < snapshot.stages.length - 1 ? (
                    <ChevronRightIcon className="absolute -right-3 top-2.5 size-4 translate-x-1/2 text-muted-foreground/60" aria-hidden="true" />
                  ) : null}
                </div>
                <div className={`flex min-h-64 flex-col rounded-xl border p-3 transition-colors ${style.border}`}>
                  <div className={`flex items-center gap-1.5 text-sm font-medium ${style.text}`}>
                    <StateIcon state={stage.state} />
                    {STATE_LABELS[stage.state] || "대기"}
                  </div>
                  <div className="mt-3 text-3xl font-semibold tabular-nums">{compact(metric.value)}</div>
                  <div className="mt-1 text-xs font-medium text-foreground/70">{stageMetricCaption(metric)}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{stage.detail}</div>
                  {item ? (
                    <button
                      type="button"
                      className="mt-5 grid min-h-24 w-full gap-1 rounded-lg border bg-background/90 p-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setExpandedActivity((current) => current === item.id ? "" : item.id)}
                    >
                      <span className="line-clamp-2 text-sm font-medium">{item.title}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{item.detail}</span>
                      <span className="mt-auto text-xs tabular-nums text-muted-foreground">{formatTime(item.at)}</span>
                    </button>
                  ) : (
                    <div className="mt-5 flex min-h-24 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                      현재 항목 없음
                    </div>
                  )}
                  <div className="mt-auto pt-3 text-center text-xs text-muted-foreground">
                    {stage.footer || (stage.state === "active" ? "실시간 처리 중" : "2초마다 갱신")}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {snapshot.pipeline?.blocker ? (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive lg:mx-5">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">현재 차단 원인</div>
            <div className="mt-0.5 text-xs">{snapshot.pipeline.blocker}</div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y bg-muted/15 px-4 py-3 text-sm lg:px-5">
        <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <CircleDotIcon className="size-4" /> 진행 단계 <strong className="tabular-nums">{compact(snapshot.summary?.activeStages ?? snapshot.summary?.active)}</strong>
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock3Icon className="size-4" /> 게시 대기 <strong className="tabular-nums text-foreground">{compact(snapshot.summary?.waitingReplies ?? snapshot.summary?.waiting)}</strong>
        </span>
        <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
          <AlertTriangleIcon className="size-4" /> 지연 <strong className="tabular-nums">{compact(snapshot.summary?.delayed)}</strong>
        </span>
        <span className="flex items-center gap-1.5 text-destructive">
          <XCircleIcon className="size-4" /> 실패 <strong className="tabular-nums">{compact(snapshot.summary?.failed)}</strong>
        </span>
        <span className="ml-auto flex items-center gap-2 font-medium">
          <GaugeIcon className="size-4 text-muted-foreground" />
          파이프라인 총 처리율 <strong className="tabular-nums">{Number(snapshot.throughputPerMinute || 0).toLocaleString("ko-KR")}건/분</strong>
        </span>
      </div>

      <div>
        <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
          <div>
            <h2 className="font-semibold">최근 활동</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">각 행을 선택하면 실제 대상과 처리 내용을 확인할 수 있습니다.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="w-full sm:w-[130px]" size="sm" aria-label="활동 상태 필터">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="progress">진행·대기</SelectItem>
                <SelectItem value="complete">완료</SelectItem>
                <SelectItem value="error">실패</SelectItem>
              </SelectContent>
            </Select>
            <Select value={automationDate} onValueChange={onAutomationDateChange}>
              <SelectTrigger className="w-full sm:w-[150px]" size="sm" aria-label="댓글 날짜 선택">
                <SelectValue placeholder="날짜" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">전체 날짜</SelectItem>
                  {availableDates.map((date) => (
                    <SelectItem key={date} value={date}>{date}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              value={automationSort}
              onValueChange={(value) => value && onAutomationSortChange(value)}
              variant="outline"
              size="sm"
              aria-label="댓글 시간 정렬"
            >
              <ToggleGroupItem value="desc">최신순</ToggleGroupItem>
              <ToggleGroupItem value="asc">오래된순</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[130px_minmax(260px,1fr)_180px_120px_36px] gap-3 border-b bg-muted/20 px-4 py-2 text-xs font-medium text-muted-foreground lg:px-5">
              <span>상태</span>
              <span>제목</span>
              <span>현재 단계</span>
              <span>처리 시각</span>
              <span className="sr-only">상세</span>
            </div>
            {activities.length ? activities.map((item) => {
              const style = STATE_STYLES[item.status] || STATE_STYLES.waiting;
              const expanded = expandedActivity === item.id;
              return (
                <div key={item.id} className="border-b last:border-b-0">
                  <button
                    type="button"
                    className="grid w-full grid-cols-[130px_minmax(260px,1fr)_180px_120px_36px] items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:px-5"
                    aria-expanded={expanded}
                    onClick={() => setExpandedActivity(expanded ? "" : item.id)}
                  >
                    <span className={`flex items-center gap-1.5 text-sm font-medium ${style.text}`}>
                      <StateIcon state={item.status} />
                      {activityStatusLabel(item.status)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                    </span>
                    <span className="text-sm">{STAGE_LABELS[item.stage] || item.stage || "-"}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">{formatTime(item.at)}</span>
                    <ChevronRightIcon className={`size-4 text-muted-foreground transition-transform motion-reduce:transition-none ${expanded ? "rotate-90" : ""}`} />
                  </button>
                  {expanded ? (
                    <div className="grid gap-2 bg-muted/15 px-4 py-3 text-sm lg:px-5">
                      {item.targetText ? (
                        <p className="text-muted-foreground"><span className="font-medium text-foreground">대상 문맥</span> · {item.targetText}</p>
                      ) : null}
                      <p className="text-muted-foreground"><span className="font-medium text-foreground">처리 정보</span> · {item.detail || "상세 정보 없음"}</p>
                      {item.targetUrl ? (
                        <a className="inline-flex w-fit items-center gap-1 font-medium underline underline-offset-4" href={item.targetUrl} target="_blank" rel="noreferrer">
                          X에서 확인 <ExternalLinkIcon className="size-3.5" />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            }) : (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">선택한 조건의 최근 활동이 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
