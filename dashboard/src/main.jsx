import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ExternalLinkIcon,
  CheckCircle2Icon,
  DatabaseZapIcon,
  HeartIcon,
  Loader2Icon,
  MessageCircleIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  RefreshCcwIcon,
  SparklesIcon,
  TrendingUpIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./styles.css";

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || "요청 실패");
  return data;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "-";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace("T", " ");
}

function compact(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function totalActivity(day) {
  return Number(day?.posted || 0) + Number(day?.comments || 0) + Number(day?.hearts || 0);
}

function growthSummary(flowDays = []) {
  const recent = flowDays.slice(-7).reduce((total, day) => total + totalActivity(day), 0);
  const previous = flowDays.slice(-14, -7).reduce((total, day) => total + totalActivity(day), 0);
  const rate = previous ? ((recent - previous) / previous) * 100 : recent ? 100 : 0;
  const rounded = Math.abs(rate) >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10;
  return {
    recent,
    previous,
    value: `${rounded > 0 ? "+" : ""}${rounded}%`,
    trend: rounded >= 0 ? "상승" : "하락",
  };
}

function Dashboard() {
  const [view, setView] = useState(new URLSearchParams(location.search).get("view") || "discovered");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [titleEdits, setTitleEdits] = useState({});
  const [scheduleEdits, setScheduleEdits] = useState({});
  const [terafabxResult, setTerafabxResult] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(localStorage.getItem("threadDashboard.autoRefreshEnabled") !== "false");
  const [error, setError] = useState("");
  const [automationDate, setAutomationDate] = useState("all");

  async function load(nextView = view) {
    setError("");
    const result = await api(`/api/discovery/dashboard?view=${encodeURIComponent(nextView)}`);
    setData(result);
    setTitleEdits(Object.fromEntries(result.rows.map((row) => [row.canonicalUrl, row.textPreview || ""])));
    setLoading(false);
  }

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set("view", view);
    history.replaceState(null, "", url);
    setLoading(true);
    load(view).catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, [view]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => {
      load(view).catch(() => undefined);
    }, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh, view]);

  const summary = data?.summary || {};
  const rows = data?.rows || [];
  const automation = data?.automation || {};
  const flowDays = automation.flowDays || [];
  const commentTimeline = automation.commentTimeline || [];
  const availableDates = automation.availableDates || [];
  const growth = useMemo(() => growthSummary(flowDays), [flowDays]);
  const selectedComments = useMemo(() => (
    automationDate === "all"
      ? commentTimeline
      : commentTimeline.filter((item) => item.date === automationDate)
  ), [automationDate, commentTimeline]);

  useEffect(() => {
    if (automationDate !== "all" && availableDates.length && !availableDates.includes(automationDate)) {
      setAutomationDate("all");
    }
  }, [automationDate, availableDates]);

  const metrics = useMemo(() => [
    {
      label: "게시됨",
      value: compact(summary.postedCount),
      note: `최근 ${formatDate(summary.latestPostedAt)}`,
      trend: "완료",
      icon: CheckCircle2Icon,
    },
    {
      label: "자동댓글",
      value: compact(summary.commentCount),
      note: `최근 ${formatDate(summary.lastCommentAt)}`,
      trend: data?.terafabx?.comment?.enabled ? "ON" : "OFF",
      icon: MessageCircleIcon,
    },
    {
      label: "하트수",
      value: compact(summary.heartCount),
      note: `최근 ${formatDate(summary.lastHeartAt)}`,
      trend: data?.terafabx?.heart?.enabled ? "ON" : "OFF",
      icon: HeartIcon,
    },
    {
      label: "성장률",
      value: growth.value,
      note: `최근 7일 ${compact(growth.recent)}건 · 이전 7일 ${compact(growth.previous)}건`,
      trend: growth.trend,
      icon: TrendingUpIcon,
    },
  ], [data?.terafabx, growth, summary]);

  async function runAction(label, fn, success = "완료됨") {
    setBusy(label);
    setError("");
    try {
      await fn();
      await load(view);
      toast.success(success);
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setBusy("");
    }
  }

  function rowText(row) {
    return (titleEdits[row.canonicalUrl] || row.textPreview || "").trim();
  }

  async function runTerafabx(job, action) {
    await runAction(`terafabx-${job}-${action}`, async () => {
      const result = await api("/api/terafabx/automation", {
        method: "POST",
        body: JSON.stringify({ job, action }),
      });
      setTerafabxResult(result);
    }, "자동화 상태 변경됨");
  }

  const controlsBusy = Boolean(busy);

  return (
    <TooltipProvider>
      <SidebarProvider
        style={{
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        }}
      >
        <AppSidebar
          variant="inset"
          view={view}
          onViewChange={setView}
          summary={summary}
          terafabx={data?.terafabx}
          automation={automation}
          automationDate={automationDate}
          onAutomationDateChange={setAutomationDate}
        />
        <SidebarInset>
          <SiteHeader
            title="Threads 발굴 대시보드"
            subtitle="좋아요 1000+ · 미디어 포함 · X 수동 검토/예약 워크플로우"
            autoRefresh={autoRefresh}
            busy={controlsBusy}
            onRefresh={() => runAction("refresh-data", () => load(view), "새로고침 완료")}
            onToggleAutoRefresh={() => {
              const next = !autoRefresh;
              setAutoRefresh(next);
              localStorage.setItem("threadDashboard.autoRefreshEnabled", String(next));
            }}
          />
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-4 py-4 md:gap-6 md:py-6">
              <SectionCards metrics={metrics} />

              <div className="grid gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:px-6" id="controls">
                <Card id="add-url">
                  <CardHeader>
                    <CardTitle>수동 추가</CardTitle>
                    <CardDescription>
                      Android 공유 없이 Threads URL을 대시보드에 바로 넣습니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <Input
                      value={urlInput}
                      onChange={(event) => setUrlInput(event.target.value)}
                      placeholder="https://www.threads.com/@..."
                    />
                    <Button
                      disabled={!urlInput.trim() || controlsBusy}
                      onClick={() =>
                        runAction("add", async () => {
                          await api("/api/discovery/add-url-async", {
                            method: "POST",
                            body: JSON.stringify({ url: urlInput.trim(), origin: "dashboard" }),
                          });
                          setUrlInput("");
                        }, "대시보드에 추가됨")
                      }
                    >
                      <SparklesIcon data-icon="inline-start" />
                      추가
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>스캔/보강</CardTitle>
                    <CardDescription>
                      발굴 스캔과 미리보기 보강 작업을 수동 실행합니다.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-2">
                    <Button
                      variant={summary.autoDiscoveryEnabled ? "outline" : "default"}
                      disabled={controlsBusy}
                      onClick={() =>
                        runAction("auto-scan", () => api("/api/discovery/auto-scan", {
                          method: "POST",
                          body: JSON.stringify({ enabled: !summary.autoDiscoveryEnabled }),
                        }), "자동 발굴 설정 변경됨")
                      }
                    >
                      {summary.autoDiscoveryEnabled ? <PauseCircleIcon data-icon="inline-start" /> : <PlayCircleIcon data-icon="inline-start" />}
                      {summary.autoDiscoveryEnabled ? "중지" : "재개"}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={controlsBusy}
                      onClick={() =>
                        runAction("refresh-previews", () => api("/api/discovery/refresh-previews", {
                          method: "POST",
                          body: JSON.stringify({ limit: 5 }),
                        }), "미리보기 보강 완료")
                      }
                    >
                      <RefreshCcwIcon data-icon="inline-start" />
                      보강
                    </Button>
                    <Button
                      className="col-span-2"
                      disabled={controlsBusy}
                      onClick={() =>
                        runAction("scan", () => api("/api/discovery/run", {
                          method: "POST",
                          body: JSON.stringify({ minLikes: 1000, maxScrolls: 20 }),
                        }), "스캔 완료")
                      }
                    >
                      {busy === "scan" ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <DatabaseZapIcon data-icon="inline-start" />}
                      지금 스캔
                    </Button>
                  </CardContent>
                </Card>
              </div>

              {error ? (
                <div className="px-4 lg:px-6">
                  <Alert variant="destructive">
                    <AlertTitle>작업 실패</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </div>
              ) : null}

              <div className="grid gap-4 px-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:px-6">
                {loading ? (
                  <Skeleton className="h-[350px] rounded-lg" />
                ) : (
                  <ChartAreaInteractive flowDays={flowDays} />
                )}

                <Card id="terafabx">
                  <CardHeader>
                    <CardTitle>과즙루피 자동화</CardTitle>
                    <CardDescription>
                      Grok CLI 댓글 · Chrome {data?.terafabx?.chromePort || 9224} · 락 {data?.terafabx?.lock?.busy ? "사용 중" : "대기"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">게시됨</div>
                        <div className="text-xl font-semibold tabular-nums">{compact(summary.postedCount)}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">자동댓글</div>
                        <div className="text-xl font-semibold tabular-nums">{compact(summary.commentCount)}</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">하트수</div>
                        <div className="text-xl font-semibold tabular-nums">{compact(summary.heartCount)}</div>
                      </div>
                    </div>
                    <div className="grid gap-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            <MessageCircleIcon className="size-4" />
                            자동댓글 {data?.terafabx?.comment?.enabled ? "ON" : "OFF"}
                          </div>
                          <p className="truncate text-sm text-muted-foreground">
                            최근 {data?.terafabx?.comment?.lastComment || "-"}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button size="sm" disabled={controlsBusy} onClick={() => runTerafabx("comment", "run")}>1회</Button>
                        <Button size="sm" variant="outline" disabled={controlsBusy} onClick={() => runTerafabx("comment", "enable")}>ON</Button>
                        <Button size="sm" variant="outline" disabled={controlsBusy} onClick={() => runTerafabx("comment", "disable")}>OFF</Button>
                      </div>
                    </div>
                    <div className="grid gap-3 rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            <HeartIcon className="size-4" />
                            하트 {data?.terafabx?.heart?.enabled ? "ON" : "OFF"}
                          </div>
                          <p className="truncate text-sm text-muted-foreground">
                            최근 {compact(data?.terafabx?.heart?.lastCount)}개 · 다음 {formatDate(data?.terafabx?.heart?.nextRunAt)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button size="sm" disabled={controlsBusy} onClick={() => runTerafabx("heart", "run")}>1회</Button>
                        <Button size="sm" variant="outline" disabled={controlsBusy} onClick={() => runTerafabx("heart", "enable")}>ON</Button>
                        <Button size="sm" variant="outline" disabled={controlsBusy} onClick={() => runTerafabx("heart", "disable")}>OFF</Button>
                      </div>
                    </div>
                    <div className="grid gap-3 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium">댓글 타임라인</div>
                          <p className="text-sm text-muted-foreground">
                            {automationDate === "all" ? "전체 날짜" : automationDate} · {compact(selectedComments.length)}개
                          </p>
                        </div>
                        <Select value={automationDate} onValueChange={setAutomationDate}>
                          <SelectTrigger className="w-[132px]" size="sm" aria-label="댓글 날짜 선택">
                            <SelectValue placeholder="날짜" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              <SelectItem value="all">전체</SelectItem>
                              {availableDates.map((date) => (
                                <SelectItem key={date} value={date}>{date}</SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="max-h-[360px] overflow-auto rounded-lg border bg-muted/20">
                        {selectedComments.length ? (
                          selectedComments.slice(0, 30).map((item) => (
                            <div key={`${item.at}-${item.targetUrl || item.replyUrl}`} className="grid gap-1 border-b p-3 last:border-b-0">
                              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span>{formatDate(item.at)}</span>
                                <Badge variant={item.manual ? "outline" : "secondary"}>{item.manual ? "수동" : "자동"}</Badge>
                              </div>
                              <p className="line-clamp-2 text-sm font-medium">{item.comment || "댓글 내용 없음"}</p>
                              {item.targetText ? (
                                <p className="line-clamp-1 text-xs text-muted-foreground">{item.targetText}</p>
                              ) : null}
                              {item.replyUrl || item.targetUrl ? (
                                <a
                                  className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
                                  href={item.replyUrl || item.targetUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  X에서 보기
                                  <ExternalLinkIcon className="size-3" />
                                </a>
                              ) : null}
                            </div>
                          ))
                        ) : (
                          <div className="p-4 text-sm text-muted-foreground">
                            선택한 날짜의 댓글 기록이 없습니다.
                          </div>
                        )}
                      </div>
                    </div>
                    <pre className="max-h-40 overflow-auto rounded-lg bg-muted p-3 text-xs">
                      {terafabxResult ? JSON.stringify(terafabxResult, null, 2) : "대기"}
                    </pre>
                  </CardContent>
                </Card>
              </div>

              {loading ? (
                <div className="px-4 lg:px-6">
                  <Skeleton className="h-[520px] rounded-lg" />
                </div>
              ) : (
                <DataTable
                  rows={rows}
                  view={view}
                  counts={summary}
                  titleEdits={titleEdits}
                  scheduleEdits={scheduleEdits}
                  busy={busy}
                  onViewChange={setView}
                  onTitleChange={setTitleEdits}
                  onScheduleChange={setScheduleEdits}
                  onSaveTitle={(row) =>
                    runAction(`save-${row.canonicalUrl}`, () => api("/api/discovery/title", {
                      method: "POST",
                      body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row) }),
                    }), "제목 저장됨")
                  }
                  onPost={(row) =>
                    runAction(`post-${row.canonicalUrl}`, () => api("/api/discovery/post", {
                      method: "POST",
                      body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row) }),
                    }), "X에 게시됨")
                  }
                  onDraft={(row) =>
                    runAction(`draft-${row.canonicalUrl}`, () => api("/api/discovery/draft", {
                      method: "POST",
                      body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row) }),
                    }), "X 초안 저장됨")
                  }
                  onSchedule={(row) =>
                    runAction(`schedule-${row.canonicalUrl}`, () => api("/api/discovery/schedule", {
                      method: "POST",
                      body: JSON.stringify({
                        url: row.canonicalUrl,
                        text: rowText(row),
                        scheduledAt: scheduleEdits[row.canonicalUrl],
                      }),
                    }), "X 예약됨")
                  }
                  onAutoSchedule={(row) =>
                    runAction(`auto-${row.canonicalUrl}`, () => api("/api/discovery/auto-schedule", {
                      method: "POST",
                      body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row) }),
                    }), "자동 예약됨")
                  }
                  formatDate={formatDate}
                  compact={compact}
                />
              )}
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster richColors closeButton />
    </TooltipProvider>
  );
}

createRoot(document.getElementById("root")).render(<Dashboard />);
