import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ExternalLinkIcon,
  DatabaseZapIcon,
  HeartIcon,
  LinkIcon,
  Loader2Icon,
  MessageCircleIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  RefreshCcwIcon,
  ScaleIcon,
  SparklesIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  UserPlusIcon,
  FileTextIcon
} from "lucide-react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/app-sidebar";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { SiteHeader } from "@/components/site-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  buildAutomationScopeMetrics,
  formatKstDateKey,
} from "@/lib/automation-metrics.mjs";
import {
  buildOwnPostReplyPayload,
  deriveOwnPostReplyViewState,
  normalizeOwnPostUrl,
} from "@/lib/own-post-reply.mjs";
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

function won(value) {
  return `${Math.round(Number(value || 0)).toLocaleString("ko-KR")}원`;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatCoupangDate(value) {
  const text = String(value || "");
  if (!/^\d{8}$/.test(text)) return value || "-";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function compactCoupangDate(value) {
  return String(value || "").replace(/\D/g, "");
}

function inputCoupangDate(value) {
  const text = compactCoupangDate(value);
  if (!/^\d{8}$/.test(text)) return "";
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

function kstDateInput(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function defaultCoupangRange() {
  const today = kstDateInput();
  return { startDate: kstDateInput(-29), endDate: today, preset: "30d" };
}

function ymdDate(value) {
  const text = compactCoupangDate(value);
  if (!/^\d{8}$/.test(text)) return null;
  return new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00+09:00`);
}

function shiftYmd(value, days) {
  const date = ymdDate(value);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return formatCoupangDateInput(date);
}

function formatCoupangDateInput(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).replace(/-/g, "");
}

function sumCoupangOrdersBetween(rows, startDate, endDate) {
  const start = compactCoupangDate(startDate);
  const end = compactCoupangDate(endDate);
  return rows.reduce((total, row) => {
    const date = compactCoupangDate(row.date);
    if (date && date >= start && date <= end) return total + Number(row.order || 0);
    return total;
  }, 0);
}

function coupangWeeklyGrowth(rows, endDate) {
  const end = compactCoupangDate(endDate);
  const recentStart = shiftYmd(end, -6);
  const previousEnd = shiftYmd(recentStart, -1);
  const previousStart = shiftYmd(previousEnd, -6);
  const recentOrders = sumCoupangOrdersBetween(rows, recentStart, end);
  const previousOrders = sumCoupangOrdersBetween(rows, previousStart, previousEnd);
  const rate = previousOrders > 0 ? ((recentOrders - previousOrders) / previousOrders) * 100 : recentOrders > 0 ? 100 : 0;
  const rounded = Math.abs(rate) >= 10 ? Math.round(rate) : Math.round(rate * 10) / 10;
  return {
    recentOrders,
    previousOrders,
    recentStart,
    recentEnd: end,
    previousStart,
    previousEnd,
    rate: rounded,
    trend: rounded >= 0 ? "증가" : "감소",
    label: `${rounded > 0 ? "+" : ""}${rounded}%`,
  };
}

function InssiderPending({ data, loading, error, onReload, onSave, busy }) {
  const rows = data?.rows || [];
  const categories = data?.categories || [];
  const categoryCounts = data?.summary?.categoryCounts || {};

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>판결중 글</CardDescription>
            <CardTitle>{loading ? "-" : compact(data?.summary?.totalCount)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            연애·결혼, 직장·사회만 필터링
          </CardContent>
        </Card>
        {categories.map((category) => (
          <Card key={category.code}>
            <CardHeader className="pb-2">
              <CardDescription>{category.name}</CardDescription>
              <CardTitle>{compact(categoryCounts[category.code])}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              카테고리 코드 {category.code}
            </CardContent>
          </Card>
        ))}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>인싸이더 조회 실패</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ScaleIcon className="size-5" />
              인싸이더 판결중
            </CardTitle>
            <CardDescription>
              `postKind=D`이고 판결 종료 시간이 아직 지나지 않은 글만 표시합니다.
            </CardDescription>
          </div>
          <Button variant="outline" disabled={busy || loading} onClick={onReload}>
            {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <RefreshCcwIcon data-icon="inline-start" />}
            새로고침
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          {loading ? (
            <>
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
              <Skeleton className="h-28 rounded-lg" />
            </>
          ) : rows.length ? rows.map((row) => (
            <article key={`${row.categoryCode}-${row.id}`} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[96px_minmax(0,1fr)]">
              <div className="aspect-square overflow-hidden rounded-md bg-muted">
                {row.thumbnailUrl ? (
                  <img className="h-full w-full object-cover" src={row.thumbnailUrl} alt="" loading="lazy" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <ScaleIcon className="size-6" />
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{row.categoryName}</Badge>
                  <Badge variant="outline">판결중 · {formatDate(row.debateEndAt)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    조회 {row.viewCntDisplay} · 댓글 {row.commentCntDisplay} · 추천 {row.likeCntDisplay}
                  </span>
                </div>
                <h3 className="line-clamp-2 text-base font-semibold">{row.title || "제목 없음"}</h3>
                <p className="line-clamp-2 text-sm text-muted-foreground">{row.preview || "미리보기 없음"}</p>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-md border px-3 py-2">
                    <div className="text-xs text-muted-foreground">찬성 {compact(row.prosCnt)}</div>
                    <div className="line-clamp-1 font-medium">{row.prosText || "-"}</div>
                  </div>
                  <div className="rounded-md border px-3 py-2">
                    <div className="text-xs text-muted-foreground">반대 {compact(row.consCnt)}</div>
                    <div className="line-clamp-1 font-medium">{row.consText || "-"}</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={Boolean(busy)} onClick={() => onSave(row)}>
                    {busy === `inssider-save-${row.id}` ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <SparklesIcon data-icon="inline-start" />}
                    대시보드 저장
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={row.url} target="_blank" rel="noreferrer">
                      <ExternalLinkIcon data-icon="inline-start" />
                      원문 열기
                    </a>
                  </Button>
                </div>
              </div>
            </article>
          )) : (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              현재 조건에 맞는 판결중 글이 없습니다.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


function profileInitial(handle) {
  return String(handle || "?").replace(/^@/, "").slice(0, 1).toUpperCase() || "?";
}

function profileAvatarUrl(profile, targetUrl) {
  const saved = String(profile?.avatarUrl || "").trim();
  if (saved) return saved;
  return targetUrl ? `/api/terafabx/avatar?url=${encodeURIComponent(targetUrl)}` : "";
}

function ProfileAvatar({ profile, targetUrl }) {
  const src = profileAvatarUrl(profile, targetUrl);
  const href = profile?.profileUrl || targetUrl || "#";
  const hasHref = Boolean(profile?.profileUrl || targetUrl);
  return (
    <a
      href={href}
      target={hasHref ? "_blank" : undefined}
      rel={hasHref ? "noreferrer" : undefined}
      className="relative mt-1 flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-sm font-semibold text-muted-foreground"
      aria-label={profile?.handle ? `@${profile.handle} 프로필` : "프로필"}
    >
      <span className="absolute inset-0 grid place-items-center">{profileInitial(profile?.handle)}</span>
      {src ? (
        <img
          src={src}
          alt=""
          className="relative size-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </a>
  );
}

function GrokContextBlock({ context }) {
  const summary = String(context?.summary || context?.contextSummary || "").trim();
  const keyPoints = Array.isArray(context?.keyPoints)
    ? context.keyPoints.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (!summary && !keyPoints.length) return null;
  return (
    <div className="grid gap-1">
      <div className="text-xs font-medium text-muted-foreground">Grok 문맥 분석</div>
      {summary ? <p className="text-muted-foreground">{summary}</p> : null}
      {keyPoints.length ? (
        <div className="flex flex-wrap gap-1">
          {keyPoints.map((point, index) => (
            <Badge key={`${point}-${index}`} variant="outline" className="max-w-full whitespace-normal text-left font-normal">
              {point}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}


function NaverBlogOps({ data, loading, busy, error, onRunAction, onReload }) {
  const state = data?.state || {};
  const browser = data?.browser || {};
  const scheduler = data?.scheduler || {};
  const events = data?.events || [];
  const [scheduleText, setScheduleText] = useState((state.schedule || ["08:00", "15:00", "21:00"]).join(", "));

  useEffect(() => {
    setScheduleText((state.schedule || ["08:00", "15:00", "21:00"]).join(", "));
  }, [state.schedule]);

  const schedule = scheduleText.split(",").map((item) => item.trim()).filter(Boolean);
  const disabled = Boolean(busy || loading || scheduler.busy);

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>자체 스케줄러</CardDescription>
            <CardTitle>{state.enabled ? "ON" : "OFF"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Hermes cron 미사용 · 다음 {formatDate(state.nextRunAt)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>작성자</CardDescription>
            <CardTitle>Gemini Web Only</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            다른 LLM 본문 작성 차단
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>브라우저 프로필</CardDescription>
            <CardTitle>{browser.running ? "실행 중" : "대기"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Chrome {browser.port || 9233} · 블로그 {browser.blogTabs || 0} · Gemini {browser.geminiTabs || 0}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>마지막 작업</CardDescription>
            <CardTitle>{state.lastRun?.status || "-"}</CardTitle>
          </CardHeader>
          <CardContent className="truncate text-sm text-muted-foreground">
            {state.lastRun?.title || state.lastRun?.error || "아직 실행 없음"}
          </CardContent>
        </Card>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>네이버 블로그 작업 실패</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileTextIcon className="size-5" /> 네이버 블로그 작성 운영</CardTitle>
            <CardDescription>
              검색수요 후보 → Gemini Web 초안 → SmartEditor 임시저장 흐름을 이 서버 자체 스케줄러로 운영합니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="naver-schedule">실행 시간(KST, 쉼표 구분)</label>
              <Input id="naver-schedule" value={scheduleText} onChange={(event) => setScheduleText(event.target.value)} placeholder="08:00, 15:00, 21:00" />
            </div>
            <div className="grid gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
              <div>블로그 ID: <span className="font-medium text-foreground">{state.blogId || "cury8282"}</span></div>
              <div>모드: <span className="font-medium text-foreground">임시저장 전용 / 발행 금지</span></div>
              <div>프로필: <span className="font-mono text-xs">{browser.profileDir || state.chrome?.profileDir}</span></div>
              <div>규칙: 제목 바로 아래 대표 이미지 · 엔터/방송/근황은 실제 이미지 우선 · 완료 후 탭 정리</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={disabled} onClick={() => onRunAction("naver-settings-enable", () => api("/api/naver-blog/settings", { method: "POST", body: JSON.stringify({ enabled: true, schedule }) }), "네이버 블로그 스케줄러 ON")}>ON</Button>
              <Button variant="outline" disabled={disabled} onClick={() => onRunAction("naver-settings-disable", () => api("/api/naver-blog/settings", { method: "POST", body: JSON.stringify({ enabled: false, schedule }) }), "네이버 블로그 스케줄러 OFF")}>OFF</Button>
              <Button variant="outline" disabled={disabled} onClick={() => onRunAction("naver-settings-save", () => api("/api/naver-blog/settings", { method: "POST", body: JSON.stringify({ schedule, enabled: state.enabled === true }) }), "스케줄 저장됨")}>스케줄 저장</Button>
              <Button disabled={disabled} onClick={() => onRunAction("naver-run", () => api("/api/naver-blog/run", { method: "POST", body: JSON.stringify({}) }), "네이버 임시저장 완료")}>{busy === "naver-run" ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <FileTextIcon data-icon="inline-start" />} 지금 1회 작성</Button>
              <Button variant="outline" disabled={disabled} onClick={() => onRunAction("naver-browser", () => api("/api/naver-blog/browser", { method: "POST", body: JSON.stringify({}) }), "전용 브라우저 실행됨")}><ExternalLinkIcon data-icon="inline-start" /> 전용 브라우저</Button>
              <Button variant="outline" disabled={disabled} onClick={() => onRunAction("naver-cleanup", () => api("/api/naver-blog/cleanup-tabs", { method: "POST", body: JSON.stringify({}) }), "작업 탭 정리됨")}>탭 정리</Button>
              <Button variant="ghost" disabled={disabled} onClick={onReload}>새로고침</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>최근 실행</CardTitle>
            <CardDescription>자체 스케줄러/수동 실행 결과</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {(state.recentRuns || []).length ? (state.recentRuns || []).slice(0, 8).map((run) => (
              <div key={run.id} className="grid gap-1 rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{run.status}</span>
                  <Badge variant={run.status === "ok" ? "secondary" : "destructive"}>{run.source}</Badge>
                </div>
                <div className="text-muted-foreground">{formatDate(run.finishedAt || run.startedAt)}</div>
                <div className="line-clamp-2">{run.title || run.error || "제목 없음"}</div>
                {run.logNo ? <div className="font-mono text-xs text-muted-foreground">logNo {run.logNo}</div> : null}
              </div>
            )) : (
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">아직 실행 기록이 없습니다.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>이벤트 로그</CardTitle>
          <CardDescription>브라우저 실행, 탭 정리, 스케줄러 tick 로그</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[360px] overflow-auto rounded-lg border bg-muted/20 p-0">
          {events.length ? events.slice().reverse().map((event, index) => (
            <div key={`${event.ts}-${index}`} className="grid gap-1 border-b p-3 text-sm last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{event.type}</span>
                <span className="text-xs text-muted-foreground">{formatDate(event.ts)}</span>
              </div>
              <pre className="overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{JSON.stringify(event, null, 2)}</pre>
            </div>
          )) : (
            <div className="p-4 text-sm text-muted-foreground">로그 없음</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CoupangPerformance({ data, loading, range, onRangeChange, onPreset, onReload, busy }) {
  const coupang = data?.coupang || {};
  const totals = coupang.totals || {};
  const rows = (coupang.rows || []).slice().reverse();
  const today = kstDateInput();
  const weeklyGrowth = coupangWeeklyGrowth(coupang.rows || [], coupang.endDate || compactCoupangDate(range.endDate));
  const GrowthIcon = weeklyGrowth.rate >= 0 ? TrendingUpIcon : TrendingDownIcon;

  return (
    <>
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>주문 증가율</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {loading ? "-" : weeklyGrowth.label}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <GrowthIcon />
              지난주 대비
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            최근 7일 {compact(weeklyGrowth.recentOrders)}건 · 이전 7일 {compact(weeklyGrowth.previousOrders)}건
          </div>
          <div className="text-muted-foreground">
            {formatCoupangDate(weeklyGrowth.recentStart)} ~ {formatCoupangDate(weeklyGrowth.recentEnd)}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>최근 30일 주문</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {loading ? "-" : compact(totals.order)}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <LinkIcon />
              {range.preset === "30d" ? "30일" : "선택기간"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            거래액 {loading ? "-" : won(totals.gmv)} · 수수료 {loading ? "-" : won(totals.commission)}
          </div>
          <div className="text-muted-foreground">
            {formatCoupangDate(coupang.startDate)} ~ {formatCoupangDate(coupang.endDate)}
          </div>
        </CardFooter>
      </Card>
    </div>
    <Card id="coupang-performance">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <LinkIcon className="size-5" />
            쿠팡 파트너스 실적
          </CardTitle>
          <CardDescription>
            {coupang.ok === false ? coupang.error : `${formatCoupangDate(coupang.startDate)} ~ ${formatCoupangDate(coupang.endDate)} · 최근 갱신 ${formatDate(coupang.fetchedAt)}`}
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" disabled={busy || loading} onClick={onReload}>
          {busy ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <RefreshCcwIcon data-icon="inline-start" />}
          새로고침
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={range.preset === "today" ? "default" : "outline"} disabled={busy || loading} onClick={() => onPreset("today")}>오늘</Button>
            <Button size="sm" variant={range.preset === "7d" ? "default" : "outline"} disabled={busy || loading} onClick={() => onPreset("7d")}>최근 7일</Button>
            <Button size="sm" variant={range.preset === "30d" ? "default" : "outline"} disabled={busy || loading} onClick={() => onPreset("30d")}>최근 30일</Button>
            <Button size="sm" variant={range.preset === "month" ? "default" : "outline"} disabled={busy || loading} onClick={() => onPreset("month")}>이번 달</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto]">
            <Input
              type="date"
              max={range.endDate || today}
              value={range.startDate}
              onChange={(event) => onRangeChange({ ...range, startDate: event.target.value, preset: "custom" })}
            />
            <Input
              type="date"
              min={range.startDate}
              max={today}
              value={range.endDate}
              onChange={(event) => onRangeChange({ ...range, endDate: event.target.value, preset: "custom" })}
            />
            <Button variant="outline" disabled={busy || loading} onClick={onReload}>
              적용
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">수수료</div>
            <div className="text-xl font-semibold tabular-nums">{loading ? "-" : won(totals.commission)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">거래액</div>
            <div className="text-xl font-semibold tabular-nums">{loading ? "-" : won(totals.gmv)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">주문</div>
            <div className="text-xl font-semibold tabular-nums">{loading ? "-" : compact(totals.order)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">클릭</div>
            <div className="text-xl font-semibold tabular-nums">{loading ? "-" : compact(totals.click)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">전환율</div>
            <div className="text-xl font-semibold tabular-nums">{loading ? "-" : percent(totals.conversionRate)}</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border">
          <div className="grid grid-cols-[1fr_72px_72px_92px_92px] gap-2 bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
            <span>일자</span>
            <span className="text-right">클릭</span>
            <span className="text-right">주문</span>
            <span className="text-right">거래액</span>
            <span className="text-right">수수료</span>
          </div>
          {rows.length ? rows.map((row) => (
            <div key={`${row.date}-${row.subId || "none"}`} className="grid grid-cols-[1fr_72px_72px_92px_92px] gap-2 border-t px-3 py-2 text-sm">
              <span className="tabular-nums">{formatCoupangDate(row.date)}</span>
              <span className="text-right tabular-nums">{compact(row.click)}</span>
              <span className="text-right tabular-nums">{compact(row.order)}</span>
              <span className="text-right tabular-nums">{won(row.gmv)}</span>
              <span className="text-right font-medium tabular-nums">{won(row.commission)}</span>
            </div>
          )) : (
            <div className="border-t px-3 py-4 text-sm text-muted-foreground">
              실적 데이터가 없습니다.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    </>
  );
}

function OwnPostReplyControl({
  value,
  onChange,
  onAction,
  busyKey,
  result,
  error,
  status,
}) {
  const viewState = deriveOwnPostReplyViewState({ value, response: result, status });
  const isBusy = String(busyKey || "").startsWith("own-post-reply-");
  const busyAction = String(busyKey || "").replace("own-post-reply-", "");
  const preview = viewState.preview;
  const batch = viewState.batch;
  const queueItem = viewState.queueItem;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-2 border-b bg-muted/30">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <CardTitle>내 글 인증댓글 답글</CardTitle>
            <CardDescription>
              입력한 내 X 게시글의 인증 직접댓글만 골라 하트 후 답글합니다. 자동 처리는 10분마다 새 인증댓글을 다시 확인합니다.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={viewState.monitored ? "secondary" : "outline"}>
              {viewState.monitored ? "이 글 10분 자동처리 ON" : "이 글 10분 자동처리 OFF"}
            </Badge>
            <Badge variant="outline">이미지만 댓글은 ❤️</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onAction("preview");
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="own-post-reply-url">@terafabXai 게시물 URL</Label>
            <p id="own-post-reply-hint" className="text-sm text-muted-foreground">
              예: https://x.com/terafabXai/status/1234567890
            </p>
            <Input
              id="own-post-reply-url"
              value={value}
              onChange={(event) => onChange(event.target.value)}
              onBlur={() => {
                const normalized = normalizeOwnPostUrl(value);
                if (normalized) onChange(normalized);
              }}
              placeholder="https://x.com/terafabXai/status/..."
              aria-describedby={`own-post-reply-hint${error ? " own-post-reply-error" : ""}`}
              aria-invalid={Boolean(error)}
              autoComplete="url"
            />
            {error ? (
              <p id="own-post-reply-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={isBusy}>
              {busyAction === "preview" ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <RefreshCcwIcon data-icon="inline-start" />}
              남은 인증댓글 확인
            </Button>
            <Button type="button" disabled={isBusy || viewState.queueActive} onClick={() => onAction("batch")}>
              {busyAction === "batch" || viewState.queueActive ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <HeartIcon data-icon="inline-start" />}
              {viewState.queueActive ? (viewState.queueStageLabel || "처리 대기 중") : "남은 인증댓글 하트+답글"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={() => onAction(viewState.monitored ? "disable" : "enable")}
            >
              {busyAction === "enable" || busyAction === "disable" ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
              {viewState.monitored ? "이 글 자동처리 끄기" : "이 글 자동처리 켜기"}
            </Button>
          </div>
        </form>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-live="polite">
          <span>인증 계정만</span>
          <span>동시 준비 5개</span>
          <span>현재 간격 10~20초</span>
          <span>다음 확인 {viewState.monitored ? formatDate(viewState.nextRunAt) : "-"}</span>
        </div>

        {queueItem ? (
          <div className="grid gap-2 rounded-lg border bg-muted/30 p-4" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">하트+답글 작업</span>
              <Badge variant={queueItem.status === "completed" ? "secondary" : queueItem.status === "error" ? "destructive" : "outline"}>
                {queueItem.stageLabel || queueItem.status}
              </Badge>
              {viewState.queueActive && viewState.pendingManualCount > 1 ? <Badge variant="outline">대기 {compact(viewState.pendingManualCount)}건</Badge> : null}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>대상 {compact(queueItem.candidateCount)}</span>
              <span>준비 {compact(queueItem.preparedCount)}</span>
              <span>검수 {compact(queueItem.reviewedCount)}</span>
              <span>게시 {compact(queueItem.postedCount)}</span>
              <span>제외 {compact(queueItem.rejectedCount)}</span>
            </div>
            {queueItem.error ? <p className="text-sm text-destructive">{queueItem.error}</p> : null}
            {viewState.queueActive ? <p className="text-sm text-muted-foreground">다른 자동화가 끝나면 자동으로 시작됩니다. 버튼을 다시 누를 필요가 없습니다.</p> : null}
          </div>
        ) : null}

        {preview ? (
          <div className="grid gap-3 rounded-lg border p-4" aria-live="polite">
            <div className="grid gap-1">
              <div className="font-medium">남은 인증댓글 확인 결과</div>
              <p className="line-clamp-2 text-sm text-muted-foreground">{preview.rootPostText || "원글 본문 없음"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                ["대상", preview.candidateCount],
                ["완료", preview.alreadyRepliedCount],
                ["미인증", preview.unverifiedCount],
                ["차단", preview.bannedCount],
                ["직접 댓글", preview.directReplyCount],
              ].map(([label, count], index) => (
                <div key={label} className={`rounded-lg border p-3 ${index === 0 ? "bg-muted/50" : ""}`}>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-xl font-semibold tabular-nums">{compact(count)}</div>
                </div>
              ))}
            </div>
            {preview.candidates?.length ? (
              <div className="grid gap-2">
                {preview.candidates.map((candidate) => (
                  <div key={candidate.id} className="flex min-w-0 items-center gap-2 text-sm">
                    <span className="shrink-0 font-medium">@{candidate.authorHandle}</span>
                    {candidate.imageOnly ? <Badge variant="outline">이미지 · ❤️</Badge> : null}
                    <span className="truncate text-muted-foreground">{candidate.text || "이미지만 첨부된 댓글"}</span>
                    <a className="ml-auto shrink-0 underline" href={candidate.url} target="_blank" rel="noreferrer">원문</a>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">처리할 인증 계정 댓글이 없습니다.</p>
            )}
          </div>
        ) : null}

        {batch ? (
          <div className="grid gap-3 rounded-lg border p-4" aria-live="polite">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">실행 결과</span>
              <Badge variant="secondary">게시 {compact(viewState.posted.length)}</Badge>
              <Badge variant="outline">제외 {compact(viewState.rejected.length)}</Badge>
              <Badge variant="outline">건너뜀 {compact(viewState.skipped.length)}</Badge>
            </div>
            {viewState.posted.map((item) => (
              <div key={item.replyUrl || item.targetUrl} className="flex min-w-0 items-center gap-2 text-sm">
                <span className="shrink-0 font-medium">@{item.targetAuthor || "-"}</span>
                <span className="truncate text-muted-foreground">{item.comment}</span>
                {item.replyUrl ? <a className="ml-auto shrink-0 underline" href={item.replyUrl} target="_blank" rel="noreferrer">대댓글</a> : null}
              </div>
            ))}
            {viewState.rejected.map((item, index) => (
              <p key={`${item.targetUrl || "rejected"}-${index}`} className="text-sm text-destructive">
                @{item.targetAuthor || "-"} 제외: {item.error || "검수 기준 미달"}
              </p>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AutomationTimelineView({
  comments,
  reviewComments,
  availableDates,
  automationDate,
  onAutomationDateChange,
  automationSort,
  onAutomationSortChange,
  metrics,
  onReviewAction,
  actionBusy,
  actionBusyKey,
  ownPostReplyUrl,
  onOwnPostReplyUrlChange,
  onOwnPostReplyAction,
  ownPostReplyResult,
  ownPostReplyError,
  ownPostReplyStatus,
}) {
  const scopeLabel = metrics.isAll ? "전체 기간" : metrics.isToday ? "오늘" : metrics.date;
  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid gap-1">
              <CardTitle>자동화 타임라인</CardTitle>
              <CardDescription>
                모든 지표와 목록을 같은 날짜 기준으로 확인합니다.
              </CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={automationDate} onValueChange={onAutomationDateChange}>
                <SelectTrigger className="w-full sm:w-[160px]" size="sm" aria-label="댓글 날짜 선택">
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
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border bg-muted/40 p-3">
              <div className="text-sm text-muted-foreground">{scopeLabel} 자동댓글</div>
              <div className="text-2xl font-semibold tabular-nums">
                {compact(metrics.commentCount)}{metrics.isToday ? ` / ${compact(metrics.dailyTarget)}` : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                {metrics.isToday
                  ? `남은 ${compact(metrics.remaining)} · 현재 간격 ${compact(Math.round(metrics.intervalMs / 1000))}초`
                  : "실제 X 게시 완료 기준"}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">{scopeLabel} 검수작성</div>
              <div className="text-2xl font-semibold tabular-nums">{compact(metrics.reviewCount)}</div>
              <div className="text-xs text-muted-foreground">
                게시 {compact(metrics.postedReviewCount)} · 대기 {compact(metrics.pendingReviewCount)} · 오류 {compact(metrics.errorReviewCount)}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">{scopeLabel} 심사 평균</div>
              <div className="text-2xl font-semibold tabular-nums">
                {metrics.qualityCount ? `${compact(metrics.qualityAverage)}점` : "-"}
              </div>
              <div className="text-xs text-muted-foreground">심사 완료 {compact(metrics.qualityCount)}개</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">{scopeLabel} 하트</div>
              <div className="text-2xl font-semibold tabular-nums">{compact(metrics.heartCount)}</div>
              <div className="text-xs text-muted-foreground">작업 {compact(metrics.heartRunCount)}회 합계</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-sm text-muted-foreground">{scopeLabel} 표시 항목</div>
              <div className="text-2xl font-semibold tabular-nums">{compact(metrics.displayCount)}</div>
              <div className="text-xs text-muted-foreground">
                게시 {compact(metrics.commentCount)} · 검수대기 {compact(metrics.pendingReviewCount)}
              </div>
            </div>
          </div>

          <OwnPostReplyControl
            value={ownPostReplyUrl}
            onChange={onOwnPostReplyUrlChange}
            onAction={onOwnPostReplyAction}
            busyKey={actionBusyKey}
            result={ownPostReplyResult}
            error={ownPostReplyError}
            status={ownPostReplyStatus}
          />

          <div className="rounded-lg border">
            <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-1">
                <div className="font-medium">작성된 댓글 검수 큐</div>
                <div className="text-sm text-muted-foreground">
                  인증 팔로워 최신글 기준 · 5분마다 최대 5개 · 동시 5개 · {automationDate === "all" ? "전체 날짜" : automationDate} · 검수대기 {compact(reviewComments.length)}개
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">목표 288개</Badge>
                <Badge variant="outline">게시 전용 큐</Badge>
                <Badge variant="outline">Gemini 검수</Badge>
              </div>
            </div>
            {reviewComments.length ? (
              <div className="max-h-[620px] divide-y overflow-auto">
                {reviewComments.map((item) => {
                  const itemKey = item.id || item.targetUrl || item.targetId || "";
                  const posting = actionBusyKey === `terafabx-review-post-${itemKey}`;
                  const completing = actionBusyKey === `terafabx-review-complete-${itemKey}`;
                  const deleting = actionBusyKey === `terafabx-review-delete-${itemKey}`;
                  return (
                  <article key={item.id || `${item.at}-${item.targetUrl}`} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 p-4">
                    <ProfileAvatar profile={item.follower} targetUrl={item.targetUrl} />
                    <div className="grid min-w-0 gap-3">
                      <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Badge variant={item.posted ? "secondary" : "outline"}>{item.posted ? "게시됨" : "검수대기"}</Badge>
                          <Badge variant="outline">독립 심사 {compact(item.geminiReview?.finalJudge?.score ?? item.geminiReview?.score)}점</Badge>
                          {item.geminiReview?.decision ? <Badge variant="outline">{item.geminiReview.decision}</Badge> : null}
                          <span className="text-sm font-medium tabular-nums">{formatDate(item.at)}</span>
                          {item.follower?.handle ? (
                            <span className="text-sm text-muted-foreground">@{item.follower.handle}</span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            disabled={actionBusy}
                            onClick={() => onReviewAction?.(item, "post")}
                          >
                            {posting ? "헤드리스 게시 중" : "게시"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionBusy}
                            onClick={() => onReviewAction?.(item, "complete")}
                          >
                            {completing ? "완료 처리 중" : "완료"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actionBusy}
                            onClick={() => onReviewAction?.(item, "delete")}
                          >
                            {deleting ? "삭제 중" : "삭제"}
                          </Button>
                          {item.follower?.profileUrl ? (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={item.follower.profileUrl} target="_blank" rel="noreferrer">
                                프로필
                                <ExternalLinkIcon data-icon="inline-end" />
                              </a>
                            </Button>
                          ) : null}
                          {item.targetUrl ? (
                            <Button variant="ghost" size="sm" asChild>
                              <a href={item.targetUrl} target="_blank" rel="noreferrer">
                                원문
                                <ExternalLinkIcon data-icon="inline-end" />
                              </a>
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-base font-medium leading-relaxed">{item.comment || "댓글 내용 없음"}</p>
                      {(item.targetText || item.grokContext || item.grokComment) ? (
                        <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                          {item.targetText ? (
                            <div className="grid gap-1">
                              <div className="text-xs font-medium text-muted-foreground">X 추출 문맥</div>
                              <p className="line-clamp-3 text-muted-foreground">{item.targetText}</p>
                            </div>
                          ) : null}
                          <GrokContextBlock context={item.grokContext} />
                          {item.grokComment ? (
                            <div className="grid gap-1">
                              <div className="text-xs font-medium text-muted-foreground">Gemini 후보</div>
                              <p className="text-muted-foreground">{item.grokComment}</p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {item.geminiReview?.reason ? (
                        <p className="text-xs text-muted-foreground">검수 사유: {item.geminiReview.reason}</p>
                      ) : null}
                    </div>
                  </article>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                선택한 날짜의 작성된 댓글이 없습니다.
              </div>
            )}
          </div>

          <div className="rounded-lg border">
            <div className="border-b p-4">
              <div className="font-medium">게시 완료 댓글 타임라인</div>
              <div className="text-sm text-muted-foreground">
                실제 X에 작성된 자동댓글 · {automationDate === "all" ? "전체 날짜" : automationDate} · {compact(comments.length)}개
              </div>
            </div>
            {comments.length ? (
              <div className="divide-y">
                {comments.map((item) => (
                  <article key={`${item.at}-${item.targetUrl || item.replyUrl}`} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 p-4">
                    <ProfileAvatar profile={item.follower} targetUrl={item.targetUrl} />
                    <div className="grid min-w-0 gap-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={item.manual ? "outline" : "secondary"}>{item.manual ? "수동" : "자동"}</Badge>
                          <Badge variant="outline">{item.qualitySource === "local" ? "로컬" : "독립 심사"} {compact(item.qualityScore)}점</Badge>
                          <span className="text-sm font-medium tabular-nums">{formatDate(item.at)}</span>
                          {item.follower?.handle ? (
                            <span className="text-sm text-muted-foreground">@{item.follower.handle}</span>
                          ) : null}
                        </div>
                        {item.replyUrl || item.targetUrl ? (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={item.replyUrl || item.targetUrl} target="_blank" rel="noreferrer">
                              X에서 보기
                              <ExternalLinkIcon data-icon="inline-end" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                      <p className="text-base font-medium leading-relaxed">{item.comment || "댓글 내용 없음"}</p>
                      {(item.targetText || item.grokContext || item.grokComment) ? (
                        <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                          {item.targetText ? (
                            <div className="grid gap-1">
                              <div className="text-xs font-medium text-muted-foreground">X 추출 문맥</div>
                              <p className="line-clamp-2 text-muted-foreground">{item.targetText}</p>
                            </div>
                          ) : null}
                          <GrokContextBlock context={item.grokContext} />
                          {item.grokComment ? (
                            <div className="grid gap-1">
                              <div className="text-xs font-medium text-muted-foreground">Gemini 후보</div>
                              <p className="text-muted-foreground">{item.grokComment}</p>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                선택한 날짜의 댓글 기록이 없습니다.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Dashboard() {
  const initialView = location.pathname.startsWith("/naver-blog")
    ? "naver-blog"
    : location.pathname.startsWith("/inssider-pending")
      ? "inssider-pending"
      : new URLSearchParams(location.search).get("view") || "discovered";
  const [view, setView] = useState(initialView);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [titleEdits, setTitleEdits] = useState({});
  const [scheduleEdits, setScheduleEdits] = useState({});
  const [terafabxResult, setTerafabxResult] = useState(null);
  const [ownPostReplyUrl, setOwnPostReplyUrl] = useState("");
  const [ownPostReplyResult, setOwnPostReplyResult] = useState(null);
  const [ownPostReplyError, setOwnPostReplyError] = useState("");
  const [coupangRange, setCoupangRange] = useState(defaultCoupangRange);
  const [autoRefresh, setAutoRefresh] = useState(localStorage.getItem("threadDashboard.autoRefreshEnabled") !== "false");
  const [error, setError] = useState("");
  const [automationDate, setAutomationDate] = useState(() => formatKstDateKey());
  const [automationSort, setAutomationSort] = useState("desc");

  async function load(nextView = view) {
    setError("");
    const result = nextView === "naver-blog"
      ? await api("/api/naver-blog/ops")
      : nextView === "inssider-pending"
        ? await api("/api/inssider/pending")
        : nextView === "coupang-performance"
          ? { ok: true, coupang: await api(`/api/coupang/performance?startDate=${compactCoupangDate(coupangRange.startDate)}&endDate=${compactCoupangDate(coupangRange.endDate)}`) }
          : await api(`/api/discovery/dashboard?view=${encodeURIComponent(nextView)}`);
    setData(result);
    setTitleEdits((current) => Object.fromEntries((result.rows || []).map((row) => [
      row.canonicalUrl,
      Object.prototype.hasOwnProperty.call(current, row.canonicalUrl)
        ? current[row.canonicalUrl]
        : row.textPreview || "",
    ])));
    setLoading(false);
  }

  useEffect(() => {
    const url = new URL(location.href);
    if (view === "naver-blog") {
      url.pathname = "/naver-blog";
      url.searchParams.delete("view");
    } else if (view === "inssider-pending") {
      url.pathname = "/inssider-pending";
      url.searchParams.delete("view");
    } else if (view === "coupang-performance") {
      url.pathname = "/discovery";
      url.searchParams.set("view", view);
    } else {
      url.pathname = "/discovery";
      url.searchParams.set("view", view);
    }
    history.replaceState(null, "", url);
    setLoading(true);
    load(view).catch((err) => {
      setError(err.message);
      setLoading(false);
    });
  }, [view, coupangRange.startDate, coupangRange.endDate]);

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
  const commentReviewQueue = automation.commentReviewQueue || [];
  const postedCommentReviewQueue = automation.postedCommentReviewQueue || [];
  const errorCommentReviewQueue = automation.errorCommentReviewQueue || [];
  const heartTimeline = automation.heartTimeline || [];
  const todayDate = data?.terafabx?.comment?.daily?.date || formatKstDateKey();
  const availableDates = useMemo(() => Array.from(new Set([
    todayDate,
    ...(automation.availableDates || []),
    ...heartTimeline.map((item) => item.date).filter(Boolean),
  ])).sort((a, b) => b.localeCompare(a)), [automation.availableDates, heartTimeline, todayDate]);
  const automationMetrics = useMemo(() => buildAutomationScopeMetrics({
    date: automationDate,
    todayDate,
    comments: commentTimeline,
    pendingReviews: commentReviewQueue,
    postedReviews: postedCommentReviewQueue,
    errorReviews: errorCommentReviewQueue,
    heartTimeline,
    dailyTarget: data?.terafabx?.comment?.daily?.dailyTarget || 500,
    intervalMs: data?.terafabx?.comment?.intervalMs || 0,
  }), [automationDate, todayDate, commentTimeline, commentReviewQueue, postedCommentReviewQueue, errorCommentReviewQueue, heartTimeline, data?.terafabx?.comment]);
  const selectedComments = automationMetrics.comments;
  const selectedReviewComments = automationMetrics.pendingReviews;
  const sortedComments = useMemo(() => (
    [...selectedComments].sort((a, b) => {
      const left = new Date(a.at || 0).getTime();
      const right = new Date(b.at || 0).getTime();
      return automationSort === "asc" ? left - right : right - left;
    })
  ), [automationSort, selectedComments]);
  const sortedReviewComments = useMemo(() => (
    [...selectedReviewComments].sort((a, b) => {
      const left = new Date(a.at || 0).getTime();
      const right = new Date(b.at || 0).getTime();
      return automationSort === "asc" ? left - right : right - left;
    })
  ), [automationSort, selectedReviewComments]);

  useEffect(() => {
    if (automationDate !== "all" && availableDates.length && !availableDates.includes(automationDate)) {
      setAutomationDate("all");
    }
  }, [automationDate, availableDates]);

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

  function rowText(row, textOverride) {
    const value = (textOverride ?? titleEdits[row.canonicalUrl] ?? row.textPreview ?? "").trim();
    return ["(본문 없음)", "수집 중"].includes(value) ? "" : value;
  }

  async function saveDiscoveryTitle(row, textOverride) {
    const savedText = rowText(row, textOverride);
    setBusy(`save-${row.canonicalUrl}`);
    setError("");
    try {
      await api("/api/discovery/title", {
        method: "POST",
        body: JSON.stringify({ url: row.canonicalUrl, text: savedText }),
      });
      setTitleEdits((current) => ({ ...current, [row.canonicalUrl]: savedText }));
      setData((current) => {
        if (!current?.rows) return current;
        return {
          ...current,
          rows: current.rows.map((item) => (
            item.canonicalUrl === row.canonicalUrl
              ? { ...item, textPreview: savedText, lastError: null }
              : item
          )),
        };
      });
      toast.success("제목 저장됨");
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setBusy("");
    }
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

  async function runOwnPostReplyAction(action) {
    let payload;
    try {
      payload = buildOwnPostReplyPayload(action, ownPostReplyUrl);
    } catch (err) {
      setOwnPostReplyError(err.message);
      return;
    }
    const actionLabel = {
      preview: "남은 인증댓글 확인",
      batch: "남은 인증댓글 하트+답글",
      enable: "이 글 10분 자동처리 켜기",
      disable: "이 글 10분 자동처리 끄기",
    }[action] || "처리";
    setBusy(`own-post-reply-${action}`);
    setError("");
    setOwnPostReplyError("");
    setOwnPostReplyUrl(payload.postUrl);
    try {
      const response = await api("/api/terafabx/own-post-reply", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setOwnPostReplyResult(response);
      await load(view);
      toast.success(action === "batch" && response?.result?.queued ? `${actionLabel} 대기열 등록됨` : `${actionLabel} 완료`);
    } catch (err) {
      setOwnPostReplyError(err.message);
      toast.error(err.message);
    } finally {
      setBusy("");
    }
  }

  async function runTerafabxReviewAction(item, action) {
    const labels = { post: "게시", complete: "완료 처리", delete: "삭제" };
    await runAction(`terafabx-review-${action}-${item.id || item.targetUrl}`, async () => {
      const result = await api("/api/terafabx/comment-review-action", {
        method: "POST",
        body: JSON.stringify({
          action,
          id: item.id,
          targetUrl: item.targetUrl,
          targetId: item.targetId,
        }),
      });
      setTerafabxResult(result);
    }, `검수대기 ${labels[action] || "처리"} 완료`);
  }

  function setCoupangPreset(preset) {
    const today = kstDateInput();
    const next = preset === "today"
      ? { startDate: today, endDate: today, preset }
      : preset === "7d"
        ? { startDate: kstDateInput(-6), endDate: today, preset }
        : preset === "30d"
          ? { startDate: kstDateInput(-29), endDate: today, preset }
          : { startDate: `${today.slice(0, 7)}-01`, endDate: today, preset: "month" };
    setCoupangRange(next);
  }

  const controlsBusy = Boolean(busy);
  const discoveryTable = loading ? (
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
      onSaveTitle={saveDiscoveryTitle}
      onPost={(row, text) =>
        runAction(`post-${row.canonicalUrl}`, () => api("/api/discovery/post", {
          method: "POST",
          body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row, text) }),
        }), "X에 게시됨")
      }
      onDraft={(row, text) =>
        runAction(`draft-${row.canonicalUrl}`, () => api("/api/discovery/draft", {
          method: "POST",
          body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row, text) }),
        }), "X 초안 저장됨")
      }
      onSchedule={(row, text, scheduledAt) =>
        runAction(`schedule-${row.canonicalUrl}`, () => api("/api/discovery/schedule", {
          method: "POST",
          body: JSON.stringify({
            url: row.canonicalUrl,
            text: rowText(row, text),
            scheduledAt: scheduledAt || scheduleEdits[row.canonicalUrl],
          }),
        }), "X 예약됨")
      }
      onAutoSchedule={(row, text) =>
        runAction(`auto-${row.canonicalUrl}`, () => api("/api/discovery/auto-schedule", {
          method: "POST",
          body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row, text) }),
        }), "자동 예약됨")
      }
      onCancelSchedule={(row) =>
        runAction(`cancel-schedule-${row.canonicalUrl}`, () => api("/api/discovery/cancel-schedule", {
          method: "POST",
          body: JSON.stringify({ url: row.canonicalUrl }),
        }), "X 예약이 취소되어 발굴됨으로 이동했습니다")
      }
      onRefetch={(row) =>
        runAction(`refetch-${row.canonicalUrl}`, async () => {
          await api("/api/discovery/refetch", {
            method: "POST",
            body: JSON.stringify({ url: row.canonicalUrl }),
          });
          setTitleEdits((current) => {
            const next = { ...current };
            delete next[row.canonicalUrl];
            return next;
          });
          setScheduleEdits((current) => {
            const next = { ...current };
            delete next[row.canonicalUrl];
            return next;
          });
        }, "재수집 완료")
      }
      onDiscard={(row) =>
        runAction(`discard-${row.canonicalUrl}`, async () => {
          await api("/api/discovery/discard", {
            method: "POST",
            body: JSON.stringify({ url: row.canonicalUrl }),
          });
          setTitleEdits((current) => {
            const next = { ...current };
            delete next[row.canonicalUrl];
            return next;
          });
          setScheduleEdits((current) => {
            const next = { ...current };
            delete next[row.canonicalUrl];
            return next;
          });
        }, "삭제됨")
      }
      formatDate={formatDate}
      compact={compact}
    />
  );

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
        />
        <SidebarInset>
          <SiteHeader
            title={view === "naver-blog" ? "네이버 블로그 운영" : view === "inssider-pending" ? "인싸이더 판결중" : view === "automation" ? "자동화 타임라인" : view === "coupang-performance" ? "쿠팡 파트너스 실적" : "Threads 발굴 대시보드"}
            subtitle={view === "naver-blog" ? "Gemini Web 전용 작성 · 자체 스케줄러 · 전용 Chrome 프로필" : view === "inssider-pending" ? "연애·결혼 / 직장·사회 카테고리의 진행 중인 판결글" : view === "automation" ? "자동댓글 기록 · 날짜별 필터 · 작성 시간 정렬" : view === "coupang-performance" ? "쿠팡 파트너스 월간 실적과 최근 일자별 수수료" : "좋아요 1000+ · 미디어 포함 · X 수동 검토/예약 워크플로우"}
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
              {view === "naver-blog" ? (
                <NaverBlogOps
                  data={data}
                  loading={loading}
                  busy={busy}
                  error={error}
                  onRunAction={runAction}
                  onReload={() => runAction("naver-refresh", () => load("naver-blog"), "새로고침 완료")}
                />
              ) : view === "inssider-pending" ? (
                <InssiderPending
                  data={data}
                  loading={loading}
                  error={error}
                  busy={busy}
                  onReload={() => runAction("inssider-refresh", () => load("inssider-pending"), "새로고침 완료")}
                  onSave={(row) => runAction(`inssider-save-${row.id}`, () => api("/api/inssider/save-to-discovery", {
                    method: "POST",
                    body: JSON.stringify({ url: row.url }),
                  }), "발굴 대시보드에 저장됨")}
                />
              ) : view === "coupang-performance" ? (
                <div className="px-4 lg:px-6">
                  <CoupangPerformance
                    data={data}
                    loading={loading}
                    range={coupangRange}
                    onRangeChange={setCoupangRange}
                    onPreset={setCoupangPreset}
                    busy={busy === "coupang-performance-refresh"}
                    onReload={() => runAction("coupang-performance-refresh", () => load(view), "쿠팡 실적 새로고침 완료")}
                  />
                </div>
              ) : (
                <>
              {error ? (
                <div className="px-4 lg:px-6">
                  <Alert variant="destructive">
                    <AlertTitle>작업 실패</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                </div>
              ) : null}

              {view === "automation" ? (
                <AutomationTimelineView
                  comments={sortedComments}
                  reviewComments={sortedReviewComments}
                  availableDates={availableDates}
                  automationDate={automationDate}
                  onAutomationDateChange={setAutomationDate}
                  automationSort={automationSort}
                  onAutomationSortChange={setAutomationSort}
                  metrics={automationMetrics}
                  onReviewAction={runTerafabxReviewAction}
                  actionBusy={controlsBusy}
                  actionBusyKey={busy}
                  ownPostReplyUrl={ownPostReplyUrl}
                  onOwnPostReplyUrlChange={(value) => {
                    setOwnPostReplyUrl(value);
                    setOwnPostReplyError("");
                  }}
                  onOwnPostReplyAction={runOwnPostReplyAction}
                  ownPostReplyResult={ownPostReplyResult}
                  ownPostReplyError={ownPostReplyError}
                  ownPostReplyStatus={data?.terafabx?.ownPostReply}
                />
              ) : (
                <>
              {discoveryTable}
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
                      Grok + Gemini Web Headless · X Chrome {data?.terafabx?.chromePort || 9224} · Gemini {data?.terafabx?.geminiReview?.chromePort || 9234} · 락 {data?.terafabx?.lock?.busy ? "사용 중" : "대기"}
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
                        <div className="text-xs text-muted-foreground">독립 심사 {compact(summary.commentQualityScore)}점</div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">하트수</div>
                        <div className="text-xl font-semibold tabular-nums">{compact(summary.heartCount)}</div>
                      </div>
                    </div>
                    <div className="grid gap-3 rounded-lg border p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 font-medium">
                            <SparklesIcon className="size-4" />
                            검수큐 병렬 작성
                            <Badge variant={Number(data?.terafabx?.verifiedReview?.pendingToTarget || 0) === 0 ? "secondary" : "outline"}>
                              {Number(data?.terafabx?.verifiedReview?.pendingToTarget || 0) === 0 ? "완료" : `남은 ${compact(data?.terafabx?.verifiedReview?.pendingToTarget)}`}
                            </Badge>
                            <Badge variant="outline">동시 {compact(data?.terafabx?.verifiedReview?.lastConcurrency || data?.terafabx?.verifiedReview?.batchSize || 5)}개</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            검수대기 {compact(summary.pendingCommentReviewCount)} / {compact(data?.terafabx?.verifiedReview?.targetCount || 288)} · 최근 배치 {compact(data?.terafabx?.verifiedReview?.lastAdded)}개 · 다음 {formatDate(data?.terafabx?.verifiedReview?.nextRunAt)}
                          </p>
                        </div>
                        <Badge variant={data?.terafabx?.verifiedReview?.enabled ? "secondary" : "outline"}>
                          {data?.terafabx?.verifiedReview?.enabled ? "ON" : "OFF"}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button size="sm" disabled={controlsBusy} onClick={() => runTerafabx("verified-review", "run")}>5개 작성</Button>
                        <Button size="sm" variant="outline" disabled={controlsBusy} onClick={() => runTerafabx("verified-review", "enable")}>ON</Button>
                        <Button size="sm" variant="outline" disabled={controlsBusy} onClick={() => runTerafabx("verified-review", "disable")}>OFF</Button>
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
                          <p className="text-xs text-muted-foreground">
                            오늘 {compact(data?.terafabx?.comment?.daily?.postedToday)} / {compact(data?.terafabx?.comment?.daily?.dailyTarget || 500)}개
                            {` · 남은 ${compact(data?.terafabx?.comment?.daily?.remaining)} · 간격 ${compact(Math.round(Number(data?.terafabx?.comment?.intervalMs || 0) / 1000))}초`}
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
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-medium">
                            <UserPlusIcon className="size-4" />
                            팔로우 {data?.terafabx?.follow?.enabled ? "ON" : "OFF"}
                          </div>
                          <p className="truncate text-sm text-muted-foreground">
                            최근 {compact(data?.terafabx?.follow?.lastCount || 0)}명 · 다음 {formatDate(data?.terafabx?.follow?.nextRunAt)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <Button size="sm" disabled={controlsBusy} onClick={() => runTerafabx("follow", "run")}>1회</Button>
                        <Button size="sm" variant="outline" disabled={controlsBusy} onClick={() => runTerafabx("follow", "enable")}>ON</Button>
                        <Button size="sm" variant="outline" disabled={controlsBusy} onClick={() => runTerafabx("follow", "disable")}>OFF</Button>
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
                          sortedComments.slice(0, 30).map((item) => (
                            <div key={`${item.at}-${item.targetUrl || item.replyUrl}`} className="grid gap-1 border-b p-3 last:border-b-0">
                              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span>{formatDate(item.at)}</span>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline">{item.qualitySource === "local" ? "로컬" : "독립 심사"} {compact(item.qualityScore)}점</Badge>
                                  <Badge variant={item.manual ? "outline" : "secondary"}>{item.manual ? "수동" : "자동"}</Badge>
                                </div>
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

                </>
              )}
              </>
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
