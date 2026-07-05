import {
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  CommandIcon,
  ExternalLinkIcon,
  HeartIcon,
  MessageCircleIcon,
  SearchIcon,
  Settings2Icon,
  FileTextIcon,
  ScaleIcon,
  SparklesIcon,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const viewItems = [
  { id: "discovered", title: "발굴됨", icon: <SparklesIcon /> },
  { id: "scheduled", title: "게시예정", icon: <CalendarClockIcon /> },
  { id: "posted", title: "게시됨", icon: <CheckCircle2Icon /> },
  { id: "inssider-pending", title: "인싸이더 판결중", icon: <ScaleIcon /> },
  { id: "naver-blog", title: "네이버 블로그", icon: <FileTextIcon /> },
]

type CommentTimelineItem = {
  at?: string
  date?: string
  targetUrl?: string
  targetText?: string
  comment?: string
  replyUrl?: string
  manual?: boolean
}

type AutomationData = {
  summary?: {
    commentCount?: number
    heartCount?: number
  }
  commentTimeline?: CommentTimelineItem[]
  availableDates?: string[]
}

function compact(value: unknown) {
  return Number(value || 0).toLocaleString("ko-KR")
}

function formatSidebarTime(value?: string) {
  if (!value) return "-"
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "-"
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

function AutomationSidebarGroup({
  automation,
  automationDate,
  onAutomationDateChange,
}: {
  automation?: AutomationData
  automationDate: string
  onAutomationDateChange: (date: string) => void
}) {
  const comments = automation?.commentTimeline || []
  const dates = automation?.availableDates || []
  const visibleComments = automationDate === "all"
    ? comments
    : comments.filter((item) => item.date === automationDate)

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>자동화</SidebarGroupLabel>
      <SidebarGroupContent className="grid gap-3 px-2">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{compact(automation?.summary?.commentCount)} 댓글</Badge>
          <Badge variant="outline">{compact(automation?.summary?.heartCount)} 하트</Badge>
        </div>
        <Select value={automationDate} onValueChange={onAutomationDateChange}>
          <SelectTrigger className="h-8 w-full" size="sm" aria-label="자동화 날짜 선택">
            <SelectValue placeholder="날짜" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">전체 날짜</SelectItem>
              {dates.map((date) => (
                <SelectItem key={date} value={date}>{date}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div className="grid gap-2">
          {visibleComments.length ? (
            visibleComments.slice(0, 6).map((item) => (
              <a
                key={`${item.at}-${item.replyUrl || item.targetUrl}`}
                href={item.replyUrl || item.targetUrl || "#terafabx"}
                target={item.replyUrl || item.targetUrl ? "_blank" : undefined}
                rel={item.replyUrl || item.targetUrl ? "noreferrer" : undefined}
                className="grid gap-1 rounded-md border bg-sidebar-accent/25 px-2.5 py-2 text-left text-sm hover:bg-sidebar-accent"
              >
                <span className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>{formatSidebarTime(item.at)}</span>
                  {item.replyUrl || item.targetUrl ? <ExternalLinkIcon className="size-3" /> : null}
                </span>
                <span className="line-clamp-2 font-medium text-sidebar-foreground">
                  {item.comment || "댓글 내용 없음"}
                </span>
                {item.targetText ? (
                  <span className="line-clamp-1 text-[11px] text-muted-foreground">
                    {item.targetText}
                  </span>
                ) : null}
              </a>
            ))
          ) : (
            <div className="rounded-md border px-2.5 py-3 text-xs text-muted-foreground">
              선택한 날짜의 댓글 기록이 없습니다.
            </div>
          )}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar({
  view,
  onViewChange,
  summary,
  terafabx,
  automation,
  automationDate,
  onAutomationDateChange,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  view: string
  onViewChange: (view: string) => void
  summary: Record<string, unknown>
  terafabx?: {
    comment?: { enabled?: boolean }
    heart?: { enabled?: boolean }
  }
  automation?: AutomationData
  automationDate: string
  onAutomationDateChange: (date: string) => void
}) {
  const navMain = viewItems.map((item) => ({
    ...item,
    url: "#",
    isActive: view === item.id,
    badge:
      item.id === "discovered"
        ? summary.discoveredCount
        : item.id === "scheduled"
          ? summary.scheduledCount
          : item.id === "posted"
            ? summary.postedCount
            : item.id === "inssider-pending"
              ? summary.totalCount
            : "운영",
    onClick: () => onViewChange(item.id),
  }))

  const navSecondary = [
    {
      title: terafabx?.comment?.enabled ? "자동댓글 ON" : "자동댓글 OFF",
      url: "#terafabx",
      icon: <MessageCircleIcon />,
    },
    {
      title: terafabx?.heart?.enabled ? "하트 ON" : "하트 OFF",
      url: "#terafabx",
      icon: <HeartIcon />,
    },
    {
      title: "설정",
      url: "#controls",
      icon: <Settings2Icon />,
    },
    {
      title: "검색",
      url: "#queue",
      icon: <SearchIcon />,
    },
    {
      title: "도움말",
      url: "#",
      icon: <CircleHelpIcon />,
    },
  ]

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:p-1.5!"
            >
              <a href="/discovery">
                <CommandIcon className="size-5!" />
                <span className="text-base font-semibold">Thread Mirror</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <AutomationSidebarGroup
          automation={automation}
          automationDate={automationDate}
          onAutomationDateChange={onAutomationDateChange}
        />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: "@terafabXai",
            email: "Chrome 9224",
            avatar: "",
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
