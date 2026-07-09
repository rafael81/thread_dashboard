import {
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  CommandIcon,
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

type AutomationData = {
  summary?: {
    commentCount?: number
    heartCount?: number
    commentQualityScore?: number
    commentReviewCount?: number
    pendingCommentReviewCount?: number
  }
}

function compact(value: unknown) {
  return Number(value || 0).toLocaleString("ko-KR")
}

function AutomationSidebarGroup({
  automation,
  isActive,
  onOpen,
}: {
  automation?: AutomationData
  isActive: boolean
  onOpen: () => void
}) {
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>자동화</SidebarGroupLabel>
      <SidebarGroupContent className="grid gap-2 px-2">
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary">{compact(automation?.summary?.commentCount)} 댓글</Badge>
          <Badge variant="outline">검수 {compact(automation?.summary?.pendingCommentReviewCount)} / 288</Badge>
          <Badge variant="outline">품질 {compact(automation?.summary?.commentQualityScore)}점</Badge>
          <Badge variant="outline">{compact(automation?.summary?.heartCount)} 하트</Badge>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="자동화 타임라인"
              isActive={isActive}
              onClick={onOpen}
            >
              <MessageCircleIcon />
              <span>타임라인</span>
              <Badge variant="secondary" className="ml-auto">
                {compact(automation?.summary?.pendingCommentReviewCount || automation?.summary?.commentReviewCount || automation?.summary?.commentCount)}
              </Badge>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
          isActive={view === "automation"}
          onOpen={() => onViewChange("automation")}
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
