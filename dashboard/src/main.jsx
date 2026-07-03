import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FilePenLine,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCcw,
  Send,
  Sparkles,
} from "lucide-react";
import "./styles.css";

const views = [
  { id: "discovered", label: "발굴됨" },
  { id: "scheduled", label: "게시예정" },
  { id: "posted", label: "게시됨" },
];

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.error || "요청 실패");
  return data;
}

function isVideo(url = "") {
  return /\.mp4|\/o1\/v\/t16\//i.test(url);
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

function Dashboard() {
  const [view, setView] = useState(new URLSearchParams(location.search).get("view") || "discovered");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [titleEdits, setTitleEdits] = useState({});
  const [scheduleEdits, setScheduleEdits] = useState({});
  const [autoRefresh, setAutoRefresh] = useState(localStorage.getItem("threadDashboard.autoRefreshEnabled") !== "false");
  const [error, setError] = useState("");

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

  const metrics = useMemo(() => {
    const summary = data?.summary || {};
    return [
      { label: "발굴 대기", value: summary.discoveredCount ?? 0, note: "수동 검토 대상", icon: Sparkles },
      { label: "게시 예정", value: summary.scheduledCount ?? 0, note: `다음 ${formatDate(summary.nextScheduledAt)}`, icon: CalendarClock },
      { label: "게시됨", value: summary.postedCount ?? 0, note: `최근 ${formatDate(summary.latestPostedAt)}`, icon: CheckCircle2 },
      { label: "자동 발굴", value: summary.autoDiscoveryEnabled ? "ON" : "OFF", note: summary.failedCount ? `재시도 ${summary.failedCount}개` : "오류 없음", icon: summary.autoDiscoveryEnabled ? PlayCircle : PauseCircle },
    ];
  }, [data]);

  async function runAction(label, fn) {
    setBusy(label);
    setError("");
    try {
      await fn();
      await load(view);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function rowText(url) {
    return (titleEdits[url] || "").trim();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Threads 발굴 대시보드</h1>
          <p>좋아요 1000+ · 미디어 포함 · X 수동 검토/예약 워크플로우</p>
        </div>
        <div className="topbar-actions">
          <button
            className={cx("btn", data?.summary?.autoDiscoveryEnabled ? "btn-outline" : "btn-primary")}
            disabled={Boolean(busy)}
            onClick={() => runAction("auto-scan", () => api("/api/discovery/auto-scan", {
              method: "POST",
              body: JSON.stringify({ enabled: !data?.summary?.autoDiscoveryEnabled }),
            }))}
          >
            {data?.summary?.autoDiscoveryEnabled ? <PauseCircle /> : <PlayCircle />}
            {data?.summary?.autoDiscoveryEnabled ? "자동 발굴 중지" : "자동 발굴 재개"}
          </button>
          <button className="btn btn-outline" onClick={() => { const next = !autoRefresh; setAutoRefresh(next); localStorage.setItem("threadDashboard.autoRefreshEnabled", String(next)); }}>
            <RefreshCcw />
            {autoRefresh ? "자동새로고침 끄기" : "자동새로고침 켜기"}
          </button>
          <button className="btn btn-outline" disabled={Boolean(busy)} onClick={() => runAction("refresh", () => api("/api/discovery/refresh-previews", { method: "POST", body: JSON.stringify({ limit: 5 }) }))}>
            {busy === "refresh" ? <Loader2 className="spin" /> : <RefreshCcw />}
            미리보기 보강
          </button>
          <button className="btn btn-primary" disabled={Boolean(busy)} onClick={() => runAction("scan", () => api("/api/discovery/run", { method: "POST", body: JSON.stringify({ minLikes: 1000, maxScrolls: 20 }) }))}>
            {busy === "scan" ? <Loader2 className="spin" /> : <Sparkles />}
            지금 스캔
          </button>
        </div>
      </header>

      <section className="url-card">
        <input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="Threads URL 추가" />
        <button className="btn btn-primary" disabled={!urlInput.trim() || Boolean(busy)} onClick={() => runAction("add", async () => {
          await api("/api/discovery/add-url", { method: "POST", body: JSON.stringify({ url: urlInput.trim() }) });
          setUrlInput("");
        })}>추가</button>
      </section>

      <section className="metrics-grid">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article className="metric-card" key={metric.label}>
              <div className="metric-head">
                <span>{metric.label}</span>
                <Icon />
              </div>
              <strong>{typeof metric.value === "number" ? compact(metric.value) : metric.value}</strong>
              <p>{metric.note}</p>
            </article>
          );
        })}
      </section>

      <nav className="tabs">
        {views.map((item) => (
          <button key={item.id} className={cx("tab", view === item.id && "active")} onClick={() => setView(item.id)}>
            {item.label}
            <span>{compact(data?.summary?.[`${item.id}Count`] || 0)}</span>
          </button>
        ))}
      </nav>

      {error ? <div className="error">{error}</div> : null}

      <main className="content-grid">
        {loading ? <div className="empty-state">불러오는 중...</div> : null}
        {!loading && !data?.rows?.length ? <div className="empty-state">{views.find((item) => item.id === view)?.label} 항목이 없습니다.</div> : null}
        {data?.rows?.map((row) => (
          <article className="post-card" key={row.canonicalUrl}>
            <div className="media-frame">
              {row.mediaPreviewUrl ? (
                isVideo(row.mediaPreviewUrl)
                  ? <video src={row.mediaPreviewUrl} muted playsInline controls loop preload="metadata" />
                  : <img src={row.mediaPreviewUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <a href={row.canonicalUrl} target="_blank" rel="noreferrer">미리보기 보강 필요</a>
              )}
            </div>

            <div className="badge-row">
              <span>좋아요 {compact(row.likeCount)}</span>
              <span>미디어 {compact(row.mediaCount)}</span>
              <span>점수 {compact(row.viralScore)}</span>
              <span>{row.status}</span>
            </div>

            {row.scheduledPostAt ? <div className="time-box"><span>게시 예정 시간</span><strong>{formatDate(row.scheduledPostAt)}</strong></div> : null}
            {row.postedAt && !row.scheduledPostAt ? <div className="time-box muted"><span>게시된 시간</span><strong>{formatDate(row.postedAt)}</strong></div> : null}

            <div className="author">@{row.author || "unknown"}</div>
            <p className="preview">{row.textPreview || "(본문 없음)"}</p>

            <label className="editor">
              <span>게시글</span>
              <textarea value={titleEdits[row.canonicalUrl] ?? row.textPreview ?? ""} maxLength={280} rows={3} onChange={(event) => setTitleEdits((prev) => ({ ...prev, [row.canonicalUrl]: event.target.value }))} />
            </label>
            <button className="btn btn-outline full" disabled={Boolean(busy)} onClick={() => runAction(`save-${row.canonicalUrl}`, () => api("/api/discovery/title", { method: "POST", body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row.canonicalUrl) }) }))}>
              <FilePenLine />
              제목 저장
            </button>

            <div className="criteria">
              <span>짧은 훅 {row.criteria?.shortHook ? "Y" : "N"}</span>
              <span>강한 미디어 {row.criteria?.strongMedia ? "Y" : "N"}</span>
              <span>논쟁성 {row.criteria?.controversy ? "Y" : "N"}</span>
            </div>

            <div className="card-actions">
              <a className="btn btn-outline full" href={row.canonicalUrl} target="_blank" rel="noreferrer"><ExternalLink /> 원문 열기</a>
              <button className="btn btn-primary" disabled={!row.canPost || Boolean(busy)} onClick={() => runAction(`post-${row.canonicalUrl}`, () => api("/api/discovery/post", { method: "POST", body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row.canonicalUrl) }) }))}><Send /> 게시</button>
              <button className="btn btn-outline" disabled={!row.canPost || Boolean(busy)} onClick={() => runAction(`draft-${row.canonicalUrl}`, () => api("/api/discovery/draft", { method: "POST", body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row.canonicalUrl) }) }))}>초안 저장</button>
              <input className="schedule-input" type="datetime-local" value={scheduleEdits[row.canonicalUrl] || ""} onChange={(event) => setScheduleEdits((prev) => ({ ...prev, [row.canonicalUrl]: event.target.value }))} />
              <button className="btn btn-outline" disabled={!row.canPost || Boolean(busy)} onClick={() => runAction(`schedule-${row.canonicalUrl}`, () => api("/api/discovery/schedule", { method: "POST", body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row.canonicalUrl), scheduledAt: scheduleEdits[row.canonicalUrl] }) }))}><Clock3 /> 예약 게시</button>
              <button className="btn btn-primary full" disabled={!row.canPost || Boolean(busy)} onClick={() => runAction(`auto-${row.canonicalUrl}`, () => api("/api/discovery/auto-schedule", { method: "POST", body: JSON.stringify({ url: row.canonicalUrl, text: rowText(row.canonicalUrl) }) }))}><CalendarClock /> 자동 예약</button>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<Dashboard />);
