import * as React from "react"
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import {
  CalendarClockIcon,
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
  RefreshCcwIcon,
  SendIcon,
  Trash2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
    shortHook?: boolean
    strongMedia?: boolean
    controversy?: boolean
  }
  status: string
  scheduledPostAt?: string | null
  postedAt?: string | null
  lastError?: string | null
  canPost?: boolean
}

type DataTableProps = {
  rows: DashboardRow[]
  view: string
  counts: Record<string, unknown>
  titleEdits: Record<string, string>
  scheduleEdits: Record<string, string>
  busy: string
  onViewChange: (view: string) => void
  onTitleChange: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onScheduleChange: React.Dispatch<React.SetStateAction<Record<string, string>>>
  onSaveTitle: (row: DashboardRow, text?: string) => void
  onPost: (row: DashboardRow, text?: string) => void
  onDraft: (row: DashboardRow, text?: string) => void
  onCoupangAffiliateComment: (row: DashboardRow) => void
  onSchedule: (row: DashboardRow, text?: string, scheduledAt?: string) => void
  onAutoSchedule: (row: DashboardRow, text?: string) => void
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
  return /\.mp4|\/o1\/v\/t16\//i.test(url)
}

function mediaDownloadUrl(url = "") {
  return `/api/discovery/media-download?url=${encodeURIComponent(url)}`
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    review: "검토",
    scheduled: "예약됨",
    posted: "게시됨",
    x_draft: "초안",
    failed_schedule: "예약 실패",
    failed_post: "게시 실패",
    failed_draft: "초안 실패",
  }
  return labels[status] || status
}

function MediaPreview({ row, large = false }: { row: DashboardRow; large?: boolean }) {
  const className = large
    ? "flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-muted"
    : "flex size-16 items-center justify-center overflow-hidden rounded-md bg-muted"

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

  if (isVideo(row.mediaPreviewUrl)) {
    return (
      <div className={`${className} relative`}>
        <video
          className="size-full object-contain"
          src={row.mediaPreviewUrl}
          muted
          playsInline
          controls={large}
          loop
          preload="metadata"
        />
        <Button
          variant="secondary"
          size={large ? "sm" : "icon-sm"}
          className="absolute bottom-2 right-2 shadow-md"
          asChild
        >
          <a href={mediaDownloadUrl(row.mediaPreviewUrl)} aria-label="영상 다운로드">
            <DownloadIcon data-icon={large ? "inline-start" : undefined} />
            {large ? "영상 다운로드" : null}
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
        size={large ? "sm" : "icon-sm"}
        className="absolute bottom-2 right-2 shadow-md"
        asChild
      >
        <a href={mediaDownloadUrl(row.mediaPreviewUrl)} aria-label="미디어 다운로드">
          <DownloadIcon data-icon={large ? "inline-start" : undefined} />
          {large ? "미디어 다운로드" : null}
        </a>
      </Button>
    </div>
  )
}

function ThreadSheet({
  row,
  titleEdits,
  scheduleEdits,
  busy,
  onTitleChange,
  onScheduleChange,
  onSaveTitle,
  onPost,
  onDraft,
  onCoupangAffiliateComment,
  onSchedule,
  onAutoSchedule,
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
          <SheetTitle>@{row.author || "unknown"}</SheetTitle>
          <SheetDescription>
            좋아요 {compact(row.likeCount)} · 미디어 {compact(row.mediaCount)} · 점수 {compact(row.viralScore)}
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 overflow-y-auto px-4 pb-2 text-sm lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <MediaPreview row={row} large />
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{statusLabel(row.status)}</Badge>
              {row.scheduledPostAt ? (
                <Badge variant="secondary">예약 {formatDate(row.scheduledPostAt)}</Badge>
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
              <Button variant="outline" onClick={() => onDiscard(row)} disabled={Boolean(busy)}>
                <Trash2Icon data-icon="inline-start" />
                삭제
              </Button>
              <Button variant="outline" onClick={() => onCoupangAffiliateComment(row)} disabled={Boolean(busy) || row.status !== "posted"}>
                쿠팡 댓글
              </Button>
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
              <Button onClick={() => onAutoSchedule(row, draftText)} disabled={disabled}>
                <CalendarClockIcon data-icon="inline-start" />
                자동 예약
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
    counts,
    busy,
    onViewChange,
    formatDate,
    compact,
  } = props
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({})
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 12,
  })
  const [openRowUrl, setOpenRowUrl] = React.useState<string | null>(null)
  const openRow = React.useMemo(
    () => rows.find((row) => row.canonicalUrl === openRowUrl) || null,
    [openRowUrl, rows]
  )

  const columns = React.useMemo<ColumnDef<DashboardRow>[]>(
    () => [
      {
        id: "media",
        header: "미디어",
        cell: ({ row }) => <MediaPreview row={row.original} />,
        enableSorting: false,
        enableHiding: false,
      },
      {
        accessorKey: "textPreview",
        header: "Threads",
        cell: ({ row }) => (
          <Button
            variant="link"
            className="h-auto min-w-0 px-0 text-left text-foreground"
            onClick={() => setOpenRowUrl(row.original.canonicalUrl)}
          >
            <span className="line-clamp-2 max-w-[34rem] whitespace-normal">
              {props.titleEdits[row.original.canonicalUrl] || row.original.textPreview || "(본문 없음)"}
            </span>
          </Button>
        ),
        enableHiding: false,
      },
      {
        accessorKey: "status",
        header: "상태",
        cell: ({ row }) => (
          <Badge variant={row.original.canPost ? "outline" : "secondary"}>
            {row.original.status === "scheduled" ? <CalendarClockIcon /> : null}
            {row.original.status === "posted" ? <CheckCircle2Icon /> : null}
            {statusLabel(row.original.status)}
          </Badge>
        ),
      },
      {
        accessorKey: "likeCount",
        header: () => <div className="text-right">좋아요</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {compact(row.original.likeCount)}
          </div>
        ),
      },
      {
        accessorKey: "mediaCount",
        header: () => <div className="text-right">미디어</div>,
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            {compact(row.original.mediaCount)}
          </div>
        ),
      },
      {
        id: "signals",
        header: "신호",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            <Badge variant="outline">훅 {row.original.criteria?.shortHook ? "Y" : "N"}</Badge>
            <Badge variant="outline">미디어 {row.original.criteria?.strongMedia ? "Y" : "N"}</Badge>
            <Badge variant="outline">논쟁 {row.original.criteria?.controversy ? "Y" : "N"}</Badge>
          </div>
        ),
      },
      {
        id: "time",
        header: "시간",
        cell: ({ row }) => (
          <div className="min-w-36 text-sm">
            <div>{row.original.scheduledPostAt ? formatDate(row.original.scheduledPostAt) : formatDate(row.original.postedAt)}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.scheduledPostAt ? "예약" : row.original.postedAt ? "처리" : "미처리"}
            </div>
          </div>
        ),
      },
      {
        id: "actions",
        cell: ({ row }) => {
          const isPosted = row.original.status === "posted"

          return (
            <div className="flex items-center justify-end gap-2">
              {isPosted ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={row.original.canonicalUrl} target="_blank" rel="noreferrer">
                    <ExternalLinkIcon data-icon="inline-start" />
                    원문 열기
                  </a>
                </Button>
              ) : null}
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
                    <DropdownMenuItem onClick={() => props.onDiscard(row.original)} disabled={Boolean(busy)}>
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => props.onPost(row.original)} disabled={!row.original.canPost || Boolean(busy)}>
                      게시
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onDraft(row.original)} disabled={!row.original.canPost || Boolean(busy)}>
                      초안 저장
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onAutoSchedule(row.original)} disabled={!row.original.canPost || Boolean(busy)}>
                      자동 예약
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => props.onCoupangAffiliateComment(row.original)} disabled={row.original.status !== "posted" || Boolean(busy)}>
                      쿠팡 댓글
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
    [props, busy, compact, formatDate]
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: {
      sorting,
      columnVisibility,
      pagination,
    },
    getRowId: (row) => row.canonicalUrl,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <>
    <Tabs value={view} onValueChange={onViewChange} className="w-full flex-col justify-start gap-6" id="queue">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <Label htmlFor="view-selector" className="sr-only">
          보기
        </Label>
        <Select value={view} onValueChange={onViewChange}>
          <SelectTrigger
            className="flex w-fit @4xl/main:hidden"
            size="sm"
            id="view-selector"
          >
            <SelectValue placeholder="보기 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {views.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <TabsList className="hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex">
          {views.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
              <Badge variant="secondary">
                {compact(counts[item.countKey] || 0)}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex items-center gap-2">
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
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden size-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">처음</span>
                <ChevronsLeftIcon />
              </Button>
              <Button
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
    {openRow ? (
      <ThreadSheet
        row={openRow}
        {...props}
        onOpenRowChange={setOpenRowUrl}
      />
    ) : null}
    </>
  )
}
