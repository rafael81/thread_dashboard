import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

const chartConfig = {
  posted: {
    label: "게시됨",
    color: "var(--primary)",
  },
  comments: {
    label: "댓글",
    color: "var(--chart-2)",
  },
  hearts: {
    label: "하트",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig

function kstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function formatMonthDay(value: string) {
  const [, month, day] = String(value || "").split("-")
  return month && day ? `${month}.${day}` : String(value || "")
}

export function ChartAreaInteractive({
  flowDays,
}: {
  flowDays: {
    date: string
    posted: number
    comments: number
    hearts: number
  }[]
}) {
  const [timeRange, setTimeRange] = React.useState("30d")
  const todayKey = React.useMemo(() => kstDateKey(), [])
  const today = React.useMemo(() => (
    flowDays.find((day) => day.date === todayKey) || {
      date: todayKey,
      posted: 0,
      comments: 0,
      hearts: 0,
    }
  ), [flowDays, todayKey])

  const chartData = React.useMemo(() => {
    const totalDays = timeRange === "7d" ? 7 : timeRange === "14d" ? 14 : 30
    return flowDays.slice(-totalDays)
  }, [flowDays, timeRange])

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>게시/댓글/하트 흐름</CardTitle>
        <CardDescription className="space-y-2">
          <span className="hidden @[540px]/card:block">
            최근 기간의 게시 처리와 자동화 활동 추이
          </span>
          <span className="@[540px]/card:hidden">운영 활동 추이</span>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="secondary">Today {formatMonthDay(today.date)}</Badge>
            <span className="rounded-md border bg-background px-2 py-1 text-xs tabular-nums text-foreground">
              게시 {today.posted.toLocaleString("ko-KR")}
            </span>
            <span className="rounded-md border bg-background px-2 py-1 text-xs tabular-nums text-foreground">
              댓글 {today.comments.toLocaleString("ko-KR")}
            </span>
            <span className="rounded-md border bg-background px-2 py-1 text-xs tabular-nums text-foreground">
              하트 {today.hearts.toLocaleString("ko-KR")}
            </span>
          </div>
        </CardDescription>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={(value) => value && setTimeRange(value)}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex"
          >
            <ToggleGroupItem value="30d">30일</ToggleGroupItem>
            <ToggleGroupItem value="14d">14일</ToggleGroupItem>
            <ToggleGroupItem value="7d">7일</ToggleGroupItem>
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-28 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="기간 선택"
            >
              <SelectValue placeholder="30일" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectGroup>
                <SelectItem value="30d" className="rounded-lg">30일</SelectItem>
                <SelectItem value="14d" className="rounded-lg">14일</SelectItem>
                <SelectItem value="7d" className="rounded-lg">7일</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fillDiscovered" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-posted)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-posted)" stopOpacity={0.08} />
              </linearGradient>
              <linearGradient id="fillComments" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-comments)" stopOpacity={0.55} />
                <stop offset="95%" stopColor="var(--color-comments)" stopOpacity={0.06} />
              </linearGradient>
              <linearGradient id="fillHearts" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-hearts)" stopOpacity={0.45} />
                <stop offset="95%" stopColor="var(--color-hearts)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                return value === todayKey ? "Today" : formatMonthDay(value)
              }}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <Area
              dataKey="hearts"
              type="natural"
              fill="url(#fillHearts)"
              stroke="var(--color-hearts)"
            />
            <Area
              dataKey="comments"
              type="natural"
              fill="url(#fillComments)"
              stroke="var(--color-comments)"
            />
            <Area
              dataKey="posted"
              type="natural"
              fill="url(#fillDiscovered)"
              stroke="var(--color-posted)"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
