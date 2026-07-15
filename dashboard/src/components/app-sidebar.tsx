import {
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleHelpIcon,
  CommandIcon,
  LinkIcon,
  CircleDollarSignIcon,
  SearchIcon,
  Settings2Icon,
  FileTextIcon,
  ScaleIcon,
  SparklesIcon,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavSecondary } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

const viewItems = [
  { id: "discovered", title: "발굴됨", icon: <SparklesIcon /> },
  { id: "scheduled", title: "게시예정", icon: <CalendarClockIcon /> },
  { id: "posted", title: "게시됨", icon: <CheckCircle2Icon /> },
  { id: "coupang-performance", title: "쿠팡 실적", icon: <LinkIcon /> },
  { id: "naver-adpost", title: "애드포스트 수익", icon: <CircleDollarSignIcon /> },
  { id: "automation", title: "자동화", icon: <Settings2Icon /> },
  { id: "inssider-pending", title: "인싸이더 판결중", icon: <ScaleIcon /> },
  { id: "naver-blog", title: "네이버 블로그", icon: <FileTextIcon /> },
]

export function AppSidebar({
  view,
  onViewChange,
  summary,
  terafabx,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  view: string
  onViewChange: (view: string) => void
  summary: Record<string, unknown>
  terafabx?: {
    comment?: { enabled?: boolean }
    heart?: { enabled?: boolean }
  }
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
            : item.id === "coupang-performance"
              ? "실적"
              : item.id === "naver-adpost"
                ? "수익"
              : item.id === "automation"
                ? "운영"
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
