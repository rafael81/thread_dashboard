import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  CalendarClockIcon,
  CalendarX2Icon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Clock3Icon,
  DownloadIcon,
  ExternalLinkIcon,
  FilePenLineIcon,
  MoreVerticalIcon,
  PlayIcon,
  RefreshCcwIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

export type DashboardRow = {
  canonicalUrl: string
  author?: string
  textPreview?: string
  mediaPreviewUrl?: string
  likeCount?: number
  mediaCount?: number
  viralScore?: number
  criteria?: {
    source?: string
    mediaThumbnailUrl?: string
    thumbnailUrl?: string
    shortHook?: boolean
    strongMedia?: boolean
    controversy?: boolean
  }
  status: string
  candidateGroup?: "A" | "B" | "C" | string | null
  scheduleDelivery?: "x_native" | "local_post" | string | null
  scheduledPostAt?: string | null
  postedAt?: string | null
  lastError?: string | null
  canPost?: boolean
  xPostUrl?: string | null
  story?: {
    id: string
    type: "fiction" | "curation"
    body: string
    replies: string[]
    status: string
    completedReplyCount: number
    format?: string
    rootMediaUrls?: string[]
    replyMediaUrls?: string[][]
    operatingDate: string
  }
  replyCompletion?: {
    rootPostUrl: string
    completedCount: number
    totalCount: number | null
    remainingCount: number | null
    percentage: number | null
    exact: boolean
    scheduled?: boolean
    source: string
    checkedAt?: string | null
    rawReplyCount?: number | null
    xDisplayReplyCount?: number | null
    collectedDirectReplyCount?: number | null
  }
}

type DataTableProps = {
  rows: DashboardRow[]
  view: string
  group?: string
  groupCounts?: Record<string, number>
  approvalEnabled?: boolean
  counts: Record<string, unknown>
  titleEdits: Record<string, string>
  scheduleEdits: Record<string, string>
  busy: string
  autoScheduleSubmitting: string[]
  onViewChange: (view: string) => void
  onGroupChange?: (group: string) => void
  onApproveGroup?: (group: string, rows: DashboardRow[]) => void
  onUnapprove?: (rows: DashboardRow[]) => void
  onTitleChange: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onScheduleChange: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onSaveTitle: (row: DashboardRow, text?: string) => void
  onPost: (row: DashboardRow, text?: string) => void
  onDraft: (row: DashboardRow, text?: string) => void
  onSchedule: (row: DashboardRow, text?: string, scheduledAt?: string) => void
  onAutoSchedule: (row: DashboardRow, text?: string) => void
  onBatchAutoSchedule: (rows: DashboardRow[]) => Promise<void>
  onBatchDiscard: (rows: DashboardRow[]) => Promise<void>
  onBatchCancelSchedule: (rows: DashboardRow[]) => Promise<void>
  onCancelSchedule: (row: DashboardRow) => void
  onRefetch: (row: DashboardRow) => void
  onDiscard: (row: DashboardRow) => void
  formatDate: (value?: string | null) => string
  compact: (value: unknown) => string
}

const views = [
  { id: "discovered", label: "발굴됨", countKey: "discoveredCount" },
  { id: "scheduled", label: "게시예정", countKey: "scheduledCount" },
  { id: "posted", label: "게시됨", countKey: "postedCount" },
]

function isVideo(url = "") {
  return /\.mp4|\.mov|\.webm|\/o1\/v\/|\/t2\/f2\/m86\/|\/t16\/f2\/m69\//i.test(url)
}

function mediaDownloadUrl(url = "") {
  if (url.startsWith("/api/story-schedules/media?")) return url
  return `/api/discovery/media-download?url=${encodeURIComponent(url)}`
}

function mediaThumbnailUrl(url = "") {
  if (url.startsWith("/api/story-schedules/media?")) return `${url}&thumbnail=1`
  return `/api/discovery/media-thumbnail?url=${encodeURIComponent(url)}`
}

function storyStatusLabel(status: string) {
  return ({ scheduled: "예약됨", awaiting_approval: "미리보기 승인 대기", continuing: "결말 연결 중", needs_review: "확인 필요", failed: "게시 실패", missed: "예약 시각 지남", posted: "게시 완료" } as Record<string, string>)[status] || status
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    review: "검토",
    approved: "승인됨",
    scheduled: "예약됨",
    posted: "게시됨",
    x_draft: "초안",
    failed_schedule: "예약 실패",
    queued_schedule: "예약 대기",
    scheduling: "예약 진행 중",
    failed_post: "게시 실패",
    failed_draft: "초안 실패",
  }
  return labels[status] || status
}

function isLocalScheduleDelivery(row: { scheduleDelivery?: string | null }) {
  return row.scheduleDelivery === "local_post"
}

function scheduleDeliveryLabel(row: { scheduleDelivery?: string | null; scheduledPostAt?: string | null; postedAt?: string | null }) {
  if (isLocalScheduleDelivery(row)) {
    return row.scheduledPostAt ? "로컬 예약" : "로컬 게시"
  }
  if (row.scheduledPostAt) return "X 예약"
  if (row.postedAt) return "처리"
  return "미처리"
}

function MediaPreview({
  row,
  large = false,
  autoPlay = false,
}: {
  row: DashboardRow
  large?: boolean
  autoPlay?: boolean
}) {
  const className = large
    ? "flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-muted"
    : row.story ? "flex h-28 w-20 items-center justify-center overflow-hidden rounded-md bg-muted" : "flex size-16 items-center justify-center overflow-hidden rounded-md bg-muted"

  if (!row.mediaPreviewUrl) {
    return (
      <a
        className={`${className} px-2 text-center text-xs text-muted-foreground`}
        href={row.canonicalUrl}
        target="_blank"
        rel="noreferrer"
      >
        미리보기 없음
      </a>
    )
  }

  if (!large) {
    const thumbnailSource = row.criteria?.mediaThumbnailUrl
      || row.criteria?.thumbnailUrl
      || (!isVideo(row.mediaPreviewUrl) ? row.mediaPreviewUrl : "")
    return (
      <div className={`${className} relative`}>
        {thumbnailSource ? (
          <img
            className={row.story ? "size-full object-contain" : "size-full object-cover"}
            src={mediaThumbnailUrl(thumbnailSource)}
            alt=""
            width={64}
            height={64}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
          />
        ) : (
          <video
            className="size-full object-cover"
            src={row.mediaPreviewUrl}
            muted
            playsInline
            preload="metadata"
          />
        )}
        {isVideo(row.mediaPreviewUrl) ? (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/25">
            <PlayIcon className="size-5 text-white drop-shadow" />
          </span>
        ) : null}
      </div>
    )
  }

  if (isVideo(row.mediaPreviewUrl)) {
    return (
      <div className={`${className} relative`}>
        <video
          className="size-full object-contain"
          src={row.mediaPreviewUrl}
          muted
          playsInline
          controls
          loop
          autoPlay={autoPlay}
          preload="metadata"
        />
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-2 right-2 shadow-md"
          asChild
        >
          <a href={mediaDownloadUrl(row.mediaPreviewUrl)} aria-label="영상 다운로드">
            <DownloadIcon data-icon="inline-start" />
            영상 다운로드
          </a>
        </Button>
      </div>
    )
  }

  return (
    <div className={`${className} relative`}>
      <img
        className="size-full object-contain"
        src={row.mediaPreviewUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
      />
      <Button
        variant="secondary"
        size="sm"
        className="absolute bottom-2 right-2 shadow-md"
        asChild
      >
        <a href={mediaDownloadUrl(row.mediaPreviewUrl)} aria-label="미디어 다운로드">
          <DownloadIcon data-icon="inline-start" />
          미디어 다운로드
        </a>
      </Button>
    </div>
  )
}

function ListMediaPreview({ row, onOpenStory }: { row: DashboardRow; onOpenStory?: () => void }) {
  const [open, setOpen] = React.useState(false)
  const hasMedia = Boolean(row.mediaPreviewUrl)
  const video = hasMedia && isVideo(row.mediaPreviewUrl)

  if (row.story) return (
    <button type="button" className="rounded-md focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${row.textPreview} 이미지와 글 보기`} onClick={onOpenStory}>
      <MediaPreview row={row} />
    </button>
  )

  return (
    <>
      <button
        type="button"
        className="rounded-md text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={video ? "영상 미리보기" : hasMedia ? "미디어 미리보기" : "미리보기 없음"}
        onClick={(event) => {
          event.stopPropagation()
          if (hasMedia) setOpen(true)
        }}
      >
        <MediaPreview row={row} />
      </button>
      {hasMedia ? (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[88vh] rounded-t-xl">
            <SheetHeader className="gap-1">
              <SheetTitle>{video ? "영상 미리보기" : "미디어 미리보기"}</SheetTitle>
              <SheetDescription>
                @{row.author || "unknown"} · 좋아요 {row.likeCount ?? 0}
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-2">
              <MediaPreview row={row} large autoPlay={Boolean(video)} />
            </div>
            <SheetFooter>
              <Button variant="outline" asChild>
                <a href={row.canonicalUrl} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon data-icon="inline-start" />
                  원문 열기
                </a>
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>닫기</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  )
}

function StorySheet({ row, formatDate, onClose }: { row: DashboardRow; formatDate: DataTableProps["formatDate"]; onClose: () => void }) {
  const story = row.story!
  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="bottom" className="max-h-[92vh] rounded-t-xl">
        <SheetHeader>
          <SheetTitle>{row.textPreview}</SheetTitle>
          <SheetDescription>
            {story.type === "fiction" ? "수제 사연" : "큐레이션"} · @{row.author} · 로컬 예약 · {formatDate(row.scheduledPostAt)} (한국시간)
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-6 overflow-y-auto px-4 pb-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <div className="space-y-2">
            {story.format === "image_carousel" ? <div className="space-y-4">
              {[story.rootMediaUrls || [], ...(story.replyMediaUrls || [])].map((urls, group) => <section key={group} className="space-y-2">
                <h3 className="text-sm font-semibold">{group === 0 ? "본문 이미지" : `이어지는 댓글 이미지 ${group}`}</h3>
                <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
                  {urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="w-[85%] shrink-0 snap-start rounded-lg bg-muted">
                    <img src={url} alt={`${group === 0 ? "본문" : "댓글"} 카드 ${index + 1}`} className="w-full object-contain" loading="lazy" />
                  </a>)}
                </div>
              </section>)}
            </div> : <>
            <a href={row.mediaPreviewUrl} target="_blank" rel="noreferrer" className="block rounded-lg bg-muted" aria-label="사연 이미지 원본 열기">
              <img src={row.mediaPreviewUrl} alt={`${row.textPreview} 사연 이미지`} className="max-h-[65vh] w-full object-contain" />
            </a>
            <a href={row.mediaPreviewUrl} target="_blank" rel="noreferrer" className="text-sm underline">이미지 크게 열기</a>
            </>}
          </div>
          <div className="min-w-0 space-y-5 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{storyStatusLabel(story.status)}</Badge>
              <Badge variant="secondary">결말 답글 {story.completedReplyCount}/{story.replies.length}</Badge>
            </div>
            <section className="space-y-2">
              <h3 className="font-semibold">이미지 속 본문</h3>
              <p className="whitespace-pre-wrap break-words leading-relaxed">{story.body || "이미지에서 본문을 확인할 수 있습니다."}</p>
            </section>
            {story.replies.map((reply, index) => (
              <section className="space-y-2 rounded-lg border p-4" key={index}>
                <h3 className="font-semibold">결말 답글{story.replies.length > 1 ? ` ${index + 1}` : ""}</h3>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{reply}</p>
              </section>
            ))}
            {row.lastError ? <details className="rounded-lg border p-3 text-destructive"><summary className="cursor-pointer">게시 오류 확인</summary><p className="mt-2 whitespace-pre-wrap">{row.lastError}</p></details> : null}
          </div>
        </div>
        <SheetFooter>
          {row.xPostUrl ? <Button variant="outline" asChild><a href={row.xPostUrl} target="_blank" rel="noreferrer">X 게시글 보기</a></Button> : null}
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function ThreadSheet({
  row,
  titleEdits,
  scheduleEdits,
  busy,
  autoScheduleSubmitting,
  onTitleChange,
  onScheduleChange,
  onSaveTitle,
  onPost,
  onDraft,
  onSchedule,
  onAutoSchedule,
  onCancelSchedule,
  onRefetch,
  onDiscard,
  formatDate,
  compact,
  onOpenRowChange,
}: Omit<DataTableProps, "rows" | "view" | "counts" | "onViewChange"> & {
  row: DashboardRow
  onOpenRowChange: (url: string | null) => void
}) {
  const disabled = Boolean(busy) || !row.canPost
  const autoScheduleDisabled = !row.canPost || autoScheduleSubmitting.includes(row.canonicalUrl)
  const isScheduled = row.status === "scheduled" && Boolean(row.scheduledPostAt)
  const [draftText, setDraftText] = React.useState(titleEdits[row.canonicalUrl] ?? row.textPreview ?? "")
  const [draftSchedule, setDraftSchedule] = React.useState(scheduleEdits[row.canonicalUrl] || "")

  React.useEffect(() => {
    setDraftText(titleEdits[row.canonicalUrl] ?? row.textPreview ?? "")
    setDraftSchedule(scheduleEdits[row.canonicalUrl] || "")
  }, [row.canonicalUrl, row.textPreview])

  return (
    <Sheet open onOpenChange={(nextOpen) => {
      if (!nextOpen) onOpenRowChange(null)
    }}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] rounded-t-xl"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="gap-1">
          <SheetTitle>{row.criteria?.source === "youtube" ? "YouTube · " : "@"}{row.author || "unknown"}</SheetTitle>
          <SheetDescription>
            좋아요 {compact(row.likeCount)} · 미디어 {compact(row.mediaCount)} · 점수 {compact(row.viralScore)}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 overflow-y-auto px-4 pb-2 text-sm lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <MediaPreview row={row} large />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{statusLabel(row.status)}</Badge>
              {row.criteria?.source === "youtube" ? <Badge variant="secondary">YouTube</Badge> : null}
              {row.scheduledPostAt ? (
                <Badge variant="secondary">예약 {formatDate(row.scheduledPostAt)}</Badge>
              ) : null}
              {row.status === "scheduled" ? (
                <Badge variant={isLocalScheduleDelivery(row) ? "outline" : "secondary"}>
                  {isLocalScheduleDelivery(row) ? "로컬 직접게시" : "X 예약"}
                </Badge>
              ) : null}
              {row.postedAt && !row.scheduledPostAt ? (
                <Badge variant="secondary">게시 {formatDate(row.postedAt)}</Badge>
              ) : null}
            </div>
            {row.lastError ? (
              <details className="rounded-lg border bg-muted/30 p-3 text-destructive">
                <summary className="cursor-pointer font-medium">오류 로그</summary>
                <p className="mt-2 whitespace-pre-wrap break-words">{row.lastError}</p>
              </details>
            ) : null}
          </div>
          <div
            className="flex min-w-0 flex-col gap-4"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="grid gap-2">
              <Label htmlFor={`${row.canonicalUrl}-text`}>게시글</Label>
              <Textarea
                id={`${row.canonicalUrl}-text`}
                value={draftText}
                maxLength={280}
                rows={5}
                onChange={(event) => {
                  const nextText = event.target.value
                  setDraftText(nextText)
                  onTitleChange((current) => ({ ...current, [row.canonicalUrl]: nextText }))
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${row.canonicalUrl}-schedule`}>수동 예약 시간</Label>
              <Input
                id={`${row.canonicalUrl}-schedule`}
                type="datetime-local"
                value={draftSchedule}
                onChange={(event) => {
                  const nextSchedule = event.target.value
                  setDraftSchedule(nextSchedule)
                  onScheduleChange((current) => ({ ...current, [row.canonicalUrl]: nextSchedule }))
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => onSaveTitle(row, draftText)} disabled={Boolean(busy)}>
                <FilePenLineIcon data-icon="inline-start" />
                제목 저장
              </Button>
              <Button variant="outline" asChild>
                <a href={row.canonicalUrl} target="_blank" rel="noreferrer">
                  <ExternalLinkIcon data-icon="inline-start" />
                  원문 열기
                </a>
              </Button>
              <Button variant="outline" onClick={() => onRefetch(row)} disabled={Boolean(busy)}>
                <RefreshCcwIcon data-icon="inline-start" />
                재수집
              </Button>
              {isScheduled ? (
                <Button variant="destructive" onClick={() => onCancelSchedule(row)} disabled={Boolean(busy)}>
                  <CalendarX2Icon data-icon="inline-start" />
                  예약 취소
                </Button>
              ) : (
                <Button variant="outline" onClick={() => onDiscard(row)} disabled={Boolean(busy)}>
                  <Trash2Icon data-icon="inline-start" />
                  삭제
                </Button>
              )}
              {row.mediaPreviewUrl ? (
                <Button variant="outline" asChild>
                  <a href={mediaDownloadUrl(row.mediaPreviewUrl)}>
                    <DownloadIcon data-icon="inline-start" />
                    미디어 다운로드
                  </a>
                </Button>
              ) : null}
              <Button onClick={() => onPost(row, draftText)} disabled={disabled}>
                <SendIcon data-icon="inline-start" />
                게시
              </Button>
              <Button variant="outline" onClick={() => onDraft(row, draftText)} disabled={disabled}>
                초안 저장
              </Button>
              <Button variant="outline" onClick={() => onSchedule(row, draftText, draftSchedule)} disabled={disabled}>
                <Clock3Icon data-icon="inline-start" />
                예약 게시
              </Button>
              <Button onClick={() => onAutoSchedule(row, draftText)} disabled={autoScheduleDisabled}>
                <CalendarClockIcon data-icon="inline-start" />
                {autoScheduleSubmitting.includes(row.canonicalUrl) ? "접수 중" : "자동 예약"}
              </Button>
            </div>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenRowChange(null)}>닫기</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

export function DataTable(props: DataTableProps) {
  const {
    rows,
    view,
    group = "",
    groupCounts = {},
    approvalEnabled = false,
    counts,
    busy,
    onViewChange,
    formatDate,
    compact,
  } = props
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({})
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 12,
  })
  const previousViewRef = React.useRef(view)
  const [openRowUrl, setOpenRowUrl] = React.useState<string | null>(null)
  const openRow = React.useMemo(
    () => rows.find((row) => row.canonicalUrl === openRowUrl) || null,
    [openRowUrl, rows]
  )

  React.useLayoutEffect(() => {
    if (previousViewRef.current === view) return
    previousViewRef.current = view
    setRowSelection({})
    setPagination((current) => ({ ...current, pageIndex: 0 }))
  }, [view])

  React.useEffect(() => {
    setPagination((current) => {
      const lastPageIndex = Math.max(0, Math.ceil(rows.length / current.pageSize) - 1)
      return current.pageIndex > lastPageIndex
        ? { ...current, pageIndex: lastPageIndex }
        : current
    })
  }, [rows.length])

  const columns = React.useMemo<ColumnDef<DashboardRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => view === "discovered" || view === "scheduled" ? (
          <Checkbox
            aria-label="현재 페이지 전체 선택"
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(Boolean(value))}
          />
        ) : null,
        cell: ({ row }) => view === "discovered" || view === "scheduled" ? (
          <Checkbox
            aria-label={`${row.original.author || "항목"} 선택`}
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ) : null,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "media",
        header: "미디어",
        cell: ({ row }) => <ListMediaPreview row={row.original} onOpenStory={() => setOpenRowUrl(row.original.canonicalUrl)} />,
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "textPreview",
        header: "게시글",
        cell: ({ row }) => (
          <Button
            variant="link"
            className="h-auto min-w-0 px-0 text-left text-foreground"
            onClick={() => setOpenRowUrl(row.original.canonicalUrl)}
          >
            <span className="max-w-[34rem] whitespace-normal">
              {row.original.story ? <span className="mb-1 block text-xs text-muted-foreground">{row.original.story.type === "fiction" ? "수제 사연" : "큐레이션"} · 결말 답글 {row.original.story.replies.length}개</span> : null}
              <span className="line-clamp-2">
              {props.titleEdits[row.original.canonicalUrl] || row.original.textPreview || "(본문 없음)"}
              </span>
              {row.original.story?.body ? <span className="mt-1 line-clamp-2 text-xs font-normal text-muted-foreground">{row.original.story.body}</span> : null}
            </span>
          </Button>
        ),
        enableHiding: false,
      },
      {
        accessorKey: "status",
        header: "상태",
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1">
            <Badge variant={row.original.canPost ? "outline" : "secondary"}>
              {row.original.status === "scheduled" ? <CalendarClockIcon /> : null}
              {row.original.status === "posted" ? <CheckCircle2Icon /> : null}
              {row.original.story ? storyStatusLabel(row.original.story.status) : statusLabel(row.original.status)}
            </Badge>
            {row.original.candidateGroup ? (
              <Badge variant="secondary">{row.original.candidateGroup}</Badge>
            ) : null}
            {row.original.status === "scheduled" ? (
              <Badge variant={isLocalScheduleDelivery(row.original) ? "outline" : "secondary"}>
                {isLocalScheduleDelivery(row.original) ? "로컬" : "X"}
              </Badge>
            ) : null}
          </div>
        ),
      },
      ...(view === "posted" ? [{
        id: "replyCompletion",
        accessorFn: (row: DashboardRow) => row.replyCompletion?.percentage ?? -1,
        header: "대댓글 완료율",
        cell: ({ row }: { row: { original: DashboardRow } }) => {
          const completion = row.original.replyCompletion
          if (!completion) {
            return <span className="text-xs text-muted-foreground">집계 전</span>
          }
          const xDisplay = completion.xDisplayReplyCount ?? completion.rawReplyCount ?? null
          const metric = (
            <div
              className="min-w-28"
              title={completion.checkedAt ? `마지막 확인 ${formatDate(completion.checkedAt)}` : undefined}
            >
              <div className="flex items-center gap-2">
                <Badge variant={completion.percentage === 100 ? "default" : "outline"}>
                  {completion.percentage === null ? "계산 중" : `${completion.percentage}%`}
                </Badge>
                <span className="text-sm tabular-nums">
                  {completion.completedCount}/{completion.totalCount ?? "?"}
                </span>
              </div>
              {xDisplay != null ? (
                <div className="mt-1 text-xs tabular-nums text-muted-foreground">
                  X 표시 {compact(xDisplay)}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-muted-foreground">
                {completion.scheduled
                  ? "예약 갱신 · 대댓글 대상(직접 댓글)"
                  : completion.exact
                    ? "직접 전체수집 · 대댓글 대상"
                    : completion.source === "x-status-reply-count"
                      ? "status API · X 표시 수"
                      : "X 표시 수 추정"}
              </div>
            </div>
          )
          return row.original.xPostUrl ? (
            <a href={row.original.xPostUrl} target="_blank" rel="noreferrer" className="block hover:underline">
              {metric}
            </a>
          ) : metric
        },
      }] : []),
      {
        id: "time",
        header: "시간",
        cell: ({ row }) => (
          <div className="min-w-36 text-sm">
            <div>{row.original.scheduledPostAt ? formatDate(row.original.scheduledPostAt) : formatDate(row.original.postedAt)}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.scheduledPostAt || row.original.postedAt
                ? scheduleDeliveryLabel(row.original)
                : "미처리"}
            </div>
          </div>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => {
          if (row.original.story) return <Button variant="outline" size="sm" onClick={() => setOpenRowUrl(row.original.canonicalUrl)}>이미지·글 보기</Button>
          const isPosted = row.original.status === "posted"
          const isScheduled = row.original.status === "scheduled" && Boolean(row.original.scheduledPostAt)
          const autoSchedulePending = props.autoScheduleSubmitting.includes(row.original.canonicalUrl)
          const autoScheduleDisabled = !row.original.canPost || autoSchedulePending

          return (
            <div className="flex items-center justify-end gap-2">
              {isPosted ? (
                <>
                  {row.original.xPostUrl ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={row.original.xPostUrl} target="_blank" rel="noreferrer">
                        <ExternalLinkIcon data-icon="inline-start" />
                        X 게시글
                      </a>
                    </Button>
                  ) : null}
                  <Button variant="outline" size="sm" asChild>
                    <a href={row.original.canonicalUrl} target="_blank" rel="noreferrer">
                      <ExternalLinkIcon data-icon="inline-start" />
                      Threads 원문
                    </a>
                  </Button>
                </>
              ) : null}
              {isScheduled ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => props.onCancelSchedule(row.original)}
                  disabled={Boolean(busy)}
                >
                  <CalendarX2Icon data-icon="inline-start" />
                  예약 취소
                </Button>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => props.onDiscard(row.original)}
                  disabled={Boolean(busy)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  삭제
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                aria-label="자동 예약"
                onClick={() => props.onAutoSchedule(row.original)}
                disabled={autoScheduleDisabled}
              >
                <CalendarClockIcon data-icon="inline-start" />
                {autoSchedulePending ? "접수 중" : "자동 예약"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex size-8 text-muted-foreground data-[state=open]:bg-muted"
                    size="icon"
                  >
                    <MoreVerticalIcon />
                    <span className="sr-only">작업 메뉴</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => props.onSaveTitle(row.original)} disabled={Boolean(busy)}>
                      제목 저장
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={row.original.canonicalUrl} target="_blank" rel="noreferrer">
                        원문 열기
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onRefetch(row.original)} disabled={Boolean(busy)}>
                      재수집
                    </DropdownMenuItem>
                    {row.original.status === "scheduled" && row.original.scheduledPostAt ? (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => props.onCancelSchedule(row.original)}
                        disabled={Boolean(busy)}
                      >
                        예약 취소
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className={isPosted ? "text-destructive focus:text-destructive" : undefined}
                        onClick={() => props.onDiscard(row.original)}
                        disabled={Boolean(busy)}
                      >
                        {isPosted ? "대시보드에서 삭제" : "삭제"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => props.onPost(row.original)} disabled={!row.original.canPost || Boolean(busy)}>
                      게시
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onDraft(row.original)} disabled={!row.original.canPost || Boolean(busy)}>
                      초안 저장
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        },
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [props, busy, compact, formatDate, view]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnVisibility,
      pagination,
      rowSelection,
    },
    getRowId: (row) => row.canonicalUrl,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    autoResetPageIndex: false,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) => view === "discovered"
      ? Boolean(row.original.canPost)
        && !props.autoScheduleSubmitting.includes(row.original.canonicalUrl)
      : view === "scheduled"
        && !row.original.story
        && row.original.status === "scheduled"
        && Boolean(row.original.scheduledPostAt),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <>
    <Tabs value={view} onValueChange={onViewChange} className="w-full flex-col justify-start gap-6" id="queue">
      <div className="flex flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <TabsList className="grid h-auto w-full grid-cols-3 **:data-[slot=badge]:min-w-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 sm:w-auto">
          {views.map((item) => (
            <TabsTrigger key={item.id} value={item.id} className="min-h-9 px-3">
              {item.label}
              <Badge variant="secondary">
                {compact(counts[item.countKey] || 0)}
              </Badge>
            </TabsTrigger>
          ))}
          </TabsList>
        <div className="flex flex-wrap items-center gap-2">
          {view === "discovered" ? (
            <>
              {(["A", "B", "C"] as const).map((item) => (
                <Button
                  key={item}
                  variant={group === item ? "default" : "outline"}
                  size="sm"
                  onClick={() => props.onGroupChange?.(group === item ? "" : item)}
                >
                  {item === "A" ? "A 추천" : item === "B" ? "B 검토" : "C 보류"}
                  <Badge variant="secondary">{compact(groupCounts[item] || 0)}</Badge>
                </Button>
              ))}
              {group === "A" || group === "B" ? (
                <Button
                  variant="default"
                  size="sm"
                  disabled={!approvalEnabled || rows.filter((row) => row.status === "review").length === 0 || Boolean(busy)}
                  onClick={() => props.onApproveGroup?.(group, rows.filter((row) => row.status === "review"))}
                >
                  이 그룹 승인 ({rows.filter((row) => row.status === "review").length})
                </Button>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                disabled={table.getSelectedRowModel().rows.every((row) => row.original.status !== "approved") || Boolean(busy)}
                onClick={() => props.onUnapprove?.(table.getSelectedRowModel().rows.map((row) => row.original).filter((row) => row.status === "approved"))}
              >
                승인 취소
              </Button>
              <Button
                variant="default"
                size="sm"
                disabled={table.getSelectedRowModel().rows.length === 0}
                onClick={async () => {
                  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)
                  await props.onBatchAutoSchedule(selectedRows)
                  setRowSelection({})
                }}
              >
                <CalendarClockIcon data-icon="inline-start" />
                선택 {table.getSelectedRowModel().rows.length}개 자동 예약
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={table.getSelectedRowModel().rows.length === 0 || Boolean(props.busy)}
                onClick={async () => {
                  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)
                  await props.onBatchDiscard(selectedRows)
                  setRowSelection({})
                }}
              >
                <Trash2Icon data-icon="inline-start" />
                선택 {table.getSelectedRowModel().rows.length}개 삭제
              </Button>
            </>
          ) : view === "scheduled" ? (
            <Button
              variant="destructive"
              size="sm"
              disabled={table.getSelectedRowModel().rows.length === 0 || Boolean(props.busy)}
              onClick={async () => {
                const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original)
                await props.onBatchCancelSchedule(selectedRows)
                setRowSelection({})
              }}
            >
              <CalendarX2Icon data-icon="inline-start" />
              선택 {table.getSelectedRowModel().rows.length}개 예약 취소
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                컬럼
                <ChevronDownIcon data-icon="inline-end" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <TabsContent value={view} className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="sticky top-0 bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    항목이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
            총 {compact(table.getFilteredRowModel().rows.length)}개 항목
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                페이지당 행
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => table.setPageSize(Number(value))}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue placeholder={table.getState().pagination.pageSize} />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectGroup>
                    {[12, 24, 48, 96].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div
              className="flex w-fit items-center justify-center text-sm font-medium"
              aria-live="polite"
              aria-atomic="true"
            >
              {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                type="button"
                variant="outline"
                className="hidden size-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">처음</span>
                <ChevronsLeftIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">이전</span>
                <ChevronLeftIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">다음</span>
                <ChevronRightIcon />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">마지막</span>
                <ChevronsRightIcon />
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
    {openRow?.story ? (
      <StorySheet row={openRow} formatDate={formatDate} onClose={() => setOpenRowUrl(null)} />
    ) : openRow ? (
      <ThreadSheet
        row={openRow}
        {...props}
        onOpenRowChange={setOpenRowUrl}
      />
    ) : null}
    </>
  )
}
