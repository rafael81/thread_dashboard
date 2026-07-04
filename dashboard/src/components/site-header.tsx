import { RefreshCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader({
  title,
  subtitle,
  autoRefresh,
  busy,
  onRefresh,
  onToggleAutoRefresh,
}: {
  title: string
  subtitle: string
  autoRefresh: boolean
  busy: boolean
  onRefresh: () => void
  onToggleAutoRefresh: () => void
}) {
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-medium">{title}</h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onToggleAutoRefresh}
          >
            {autoRefresh ? "자동새로고침 ON" : "자동새로고침 OFF"}
          </Button>
          <Button variant="outline" size="icon-sm" disabled={busy} onClick={onRefresh}>
            <RefreshCcwIcon />
            <span className="sr-only">새로고침</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
