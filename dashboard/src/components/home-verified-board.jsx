import React, { useMemo } from "react";
import {
  BadgeCheckIcon,
  ExternalLinkIcon,
  Loader2Icon,
  PauseCircleIcon,
  PlayCircleIcon,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatKstDateTime } from "@/lib/automation-metrics.mjs";

function compact(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function stageLabel(item) {
  if (item.status === "posting") return "게시 중";
  if (item.stage === "verification_required") return "검증 필요";
  if (item.stage === "held") return "보류";
  if (item.lastError) return "재시도 대기";
  return "게시 대기";
}

function rejectReasonLabel(code) {
  const map = {
    foreign_language_dominant: "외국어",
    author_already_in_batch: "작성자 중복",
    not_verified: "미인증",
    not_personal_blue: "개인 파란체크 아님",
    sensitive_original_text: "민감 원글",
    medical_sensitive_original: "의료",
    tax_or_politics_original: "세금·정치",
    link_or_space_only_weak_text: "링크/스페이스",
    profanity_original: "욕설",
  };
  if (String(code || "").startsWith("not_personal_blue")) return "개인 파란체크 아님";
  return map[code] || code;
}

export function HomeVerifiedBoard({
  status,
  timeline = [],
  pending = [],
  availableDates = [],
  selectedDate,
  onDateChange,
  sort = "desc",
  onSortChange,
  lastDiscovery,
  lastDiscoveryAt,
  lastDeadTargetDiscard,
  actionBusy,
  actionBusyKey,
  onAction,
}) {
  const daily = status?.daily || {};
  const progressPct = Math.min(100, Math.round(Number(daily.progressRatio || 0) * 100));
  const rejectEntries = Object.entries(lastDiscovery?.rejectReasonCounts || {})
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, 8);
  const sortedTimeline = useMemo(() => {
    const rows = [...timeline];
    rows.sort((left, right) => {
      const delta = new Date(left.at || 0).getTime() - new Date(right.at || 0).getTime();
      return sort === "asc" ? delta : -delta;
    });
    return rows;
  }, [timeline, sort]);
  const sortedPending = useMemo(() => {
    const rows = [...pending];
    rows.sort((left, right) => new Date(right.at || 0).getTime() - new Date(left.at || 0).getTime());
    return rows;
  }, [pending]);

  const pipeline = [
    { id: "collect", label: "후보 수집", value: status?.backlogCount, hint: "팔로잉 합성" },
    { id: "prepare", label: "초안 준비", value: status?.busy ? 1 : 0, hint: status?.contextProvider || "gemini" },
    { id: "queue", label: "게시 대기", value: status?.pendingCount, hint: `버퍼 ${compact(status?.readyBuffer)}` },
    { id: "complete", label: "오늘 게시", value: status?.postedToday, hint: `목표 ${compact(status?.dailyTarget)}` },
  ];

  return (
    <div className="grid gap-4 px-4 lg:px-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="grid gap-1">
              <CardTitle className="flex items-center gap-2">
                <BadgeCheckIcon className="size-5" />
                파란체크 원글 자동댓글
              </CardTitle>
              <CardDescription>
                팔로잉 타임라인의 개인 파란체크 원글만. 과즙루피 맞장구 톤 · Gemini 초안/심사 · 자동화와 같은 타임라인으로 모니터링합니다.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={status?.enabled ? "secondary" : "outline"}>{status?.enabled ? "자동화 ON" : "자동화 OFF"}</Badge>
              <Badge variant={status?.prefillOnly === false ? "destructive" : "outline"}>
                {status?.prefillOnly === false ? "실게시" : "생성만"}
              </Badge>
              <Badge variant={status?.blocker ? "destructive" : "outline"}>{status?.label || "대기"}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {pipeline.map((stage) => (
              <div key={stage.id} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{stage.label}</div>
                <div className="text-2xl font-semibold tabular-nums">{compact(stage.value)}</div>
                <div className="text-xs text-muted-foreground">{stage.hint}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>오늘 진행 {compact(daily.postedToday)} / {compact(daily.dailyTarget)}</span>
              <span>대기 예약 {compact(daily.pendingReserved)} · 잔여 {compact(daily.remainingAfterPending)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          {status?.blocker ? (
            <Alert variant="destructive">
              <AlertTitle>차단</AlertTitle>
              <AlertDescription>{status.blocker}</AlertDescription>
            </Alert>
          ) : null}
          {status?.lastError ? (
            <Alert variant="destructive">
              <AlertTitle>최근 오류</AlertTitle>
              <AlertDescription className="break-all">{status.lastError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={status?.enabled ? "destructive" : "default"}
              disabled={actionBusy}
              onClick={() => onAction(status?.enabled ? "disable" : "enable")}
            >
              {actionBusyKey === `home-verified-${status?.enabled ? "disable" : "enable"}` ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : status?.enabled ? (
                <PauseCircleIcon data-icon="inline-start" />
              ) : (
                <PlayCircleIcon data-icon="inline-start" />
              )}
              {status?.enabled ? "자동화 OFF" : "자동화 ON"}
            </Button>
            <Button type="button" variant="outline" disabled={actionBusy} onClick={() => onAction("prefill_only")}>
              생성만
            </Button>
            <Button type="button" variant="outline" disabled={actionBusy} onClick={() => onAction("live")}>
              실게시 허용
            </Button>
            <Button type="button" variant="outline" disabled={actionBusy} onClick={() => onAction("discover")}>
              후보 수집
            </Button>
            <Button type="button" variant="outline" disabled={actionBusy} onClick={() => onAction("prepare")}>
              준비 1회
            </Button>
            <Button type="button" variant="outline" disabled={actionBusy} onClick={() => onAction("pump")}>
              게시 큐 pump
            </Button>
            <Button type="button" variant="outline" disabled={actionBusy} onClick={() => onAction("purge_dead_targets")}>
              죽은 타겟 청소
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            소스 {status?.discoverSource || "fxtwitter-following"} · 문맥 {status?.contextProvider || "gemini"} · writer {status?.writerPort || "—"}
            {status?.lastRunAt ? ` · 최근 실행 ${formatKstDateTime(status.lastRunAt)}` : ""}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>최근 수집</CardTitle>
            <CardDescription>{lastDiscoveryAt ? formatKstDateTime(lastDiscoveryAt) : "아직 수집 기록 없음"}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["스캔", lastDiscovery?.scanned],
                ["선정", lastDiscovery?.personalSelected],
                ["거부", lastDiscovery?.rejected],
                ["수율", lastDiscovery?.yieldRate != null ? `${Math.round(Number(lastDiscovery.yieldRate) * 100)}%` : "—"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold tabular-nums">{typeof value === "number" ? compact(value) : value}</div>
                </div>
              ))}
            </div>
            {rejectEntries.length ? (
              <div className="flex flex-wrap gap-2">
                {rejectEntries.map(([code, count]) => (
                  <Badge key={code} variant="outline">{rejectReasonLabel(code)} {compact(count)}</Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">거부 사유 히스토그램이 없습니다.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>필터</CardTitle>
            <CardDescription>자동화 타임라인과 같이 날짜·정렬로 게시 기록을 봅니다.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Select value={selectedDate} onValueChange={onDateChange}>
              <SelectTrigger className="w-[180px]">
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
            <Select value={sort} onValueChange={onSortChange}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="정렬" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">최신순</SelectItem>
                <SelectItem value="asc">오래된순</SelectItem>
              </SelectContent>
            </Select>
            {lastDeadTargetDiscard?.targetUrl ? (
              <p className="w-full text-xs text-muted-foreground">
                최근 죽은 타겟 폐기 @{lastDeadTargetDiscard.authorHandle || ""} {lastDeadTargetDiscard.reason || ""} · {formatKstDateTime(lastDeadTargetDiscard.at)}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border">
        <div className="border-b p-4">
          <div className="font-medium">게시 대기 큐</div>
          <div className="text-sm text-muted-foreground">준비된 초안 · {compact(sortedPending.length)}건</div>
        </div>
        {sortedPending.length ? (
          <div className="divide-y">
            {sortedPending.map((item) => (
              <article key={item.id || item.targetUrl} className="grid gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={item.status === "posting" ? "secondary" : item.lastError ? "destructive" : "outline"}>
                    {stageLabel(item)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">@{item.authorHandle || "?"}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{formatKstDateTime(item.at)}</span>
                  {item.targetUrl ? (
                    <Button variant="ghost" size="sm" asChild>
                      <a href={item.targetUrl} target="_blank" rel="noreferrer">
                        원글
                        <ExternalLinkIcon data-icon="inline-end" />
                      </a>
                    </Button>
                  ) : null}
                </div>
                <p className="text-base font-medium leading-relaxed">{item.comment || "초안 없음"}</p>
                {item.lastError ? (
                  <p className="text-xs break-all text-destructive">{item.lastError}</p>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">대기 중인 초안이 없습니다.</div>
        )}
      </div>

      <div className="rounded-lg border">
        <div className="border-b p-4">
          <div className="font-medium">게시 완료 타임라인</div>
          <div className="text-sm text-muted-foreground">
            파란체크 원글에 실제로 단 댓글 · {selectedDate === "all" ? "전체 날짜" : selectedDate} · {compact(sortedTimeline.length)}건
          </div>
        </div>
        {sortedTimeline.length ? (
          <div className="divide-y">
            {sortedTimeline.map((item) => (
              <article key={`${item.at}-${item.targetUrl || item.replyUrl}`} className="grid gap-2 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.manual ? "outline" : "secondary"}>{item.manual ? "수동" : "자동"}</Badge>
                    <span className="text-sm font-medium tabular-nums">{formatKstDateTime(item.at)}</span>
                    {item.authorHandle ? (
                      <span className="text-sm text-muted-foreground">@{item.authorHandle}</span>
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
              </article>
            ))}
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">선택한 날짜의 게시 기록이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
