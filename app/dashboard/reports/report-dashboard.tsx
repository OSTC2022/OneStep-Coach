'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type {
  InstructorPayrollRow,
  MonthlyRevenueTrendPoint,
} from '@/lib/actions/reports'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CalendarCheck,
  Users,
  UserPlus,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

interface ReportDashboardProps {
  selectedMonth: string
  previousMonth: string
  isCurrentMonth: boolean
  daysInSelectedMonth: number
  stats: {
    thisMonthRevenue: number
    lastMonthRevenue: number
    thisMonthLessons: number
    lastMonthLessons: number
    totalMembers: number
    activeMembers: number
    newMembersThisMonth: number
    totalInstructorPay: number
  }
  instructorStats: { name: string; count: number }[]
  instructorPayroll: InstructorPayrollRow[]
  sportStats: Record<string, number>
  monthlyRevenueTrend: MonthlyRevenueTrendPoint[]
}

const revenueChartConfig = {
  revenue: {
    label: '매출',
    theme: {
      light: '#84cc16',
      dark: '#a3e635',
    },
  },
} satisfies ChartConfig

function formatMonthTitle(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number)
  if (!year || !month) return monthKey
  return `${year}년 ${month}월`
}

function shiftMonthKey(monthKey: string, direction: 'prev' | 'next'): string {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 1 + (direction === 'next' ? 1 : -1), 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function ReportDashboard({
  selectedMonth,
  previousMonth,
  isCurrentMonth,
  daysInSelectedMonth,
  stats,
  instructorStats,
  instructorPayroll,
  sportStats,
  monthlyRevenueTrend,
}: ReportDashboardProps) {
  const router = useRouter()
  const monthTitle = formatMonthTitle(selectedMonth)
  const previousMonthTitle = formatMonthTitle(previousMonth)
  const periodLabel = isCurrentMonth ? '이번 달' : monthTitle

  const revenueChange =
    stats.lastMonthRevenue > 0
      ? (
          ((stats.thisMonthRevenue - stats.lastMonthRevenue) /
            stats.lastMonthRevenue) *
          100
        ).toFixed(1)
      : '0'
  const lessonsChange =
    stats.lastMonthLessons > 0
      ? (
          ((stats.thisMonthLessons - stats.lastMonthLessons) /
            stats.lastMonthLessons) *
          100
        ).toFixed(1)
      : '0'

  const sortedSports = Object.entries(sportStats).sort((a, b) => b[1] - a[1])
  const totalSportMembers = Object.values(sportStats).reduce(
    (sum, count) => sum + count,
    0,
  )

  const chartData = monthlyRevenueTrend.map((point) => ({
    ...point,
    shortLabel: `${Number(point.month.slice(5))}월`,
    revenueManwon: Math.round(point.revenue / 10000),
  }))

  function goToMonth(month: string) {
    if (!month) return
    router.push(`/dashboard/reports?month=${month}`)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="지난 달"
            onClick={() => goToMonth(shiftMonthKey(selectedMonth, 'prev'))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="month"
            value={selectedMonth}
            onChange={(event) => goToMonth(event.target.value)}
            className="w-auto"
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="다음 달"
            disabled={selectedMonth >= currentMonthKey()}
            onClick={() => goToMonth(shiftMonthKey(selectedMonth, 'next'))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          variant="outline"
          disabled={isCurrentMonth}
          onClick={() => goToMonth(currentMonthKey())}
        >
          이번 달
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {periodLabel} 매출
            </CardTitle>
            <DollarSign className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats.thisMonthRevenue / 10000).toLocaleString()}만원
            </div>
            <div className="mt-1 flex items-center gap-1">
              {Number(revenueChange) >= 0 ? (
                <>
                  <TrendingUp className="h-4 w-4 text-green-400" />
                  <span className="text-xs text-green-400">+{revenueChange}%</span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-red-400">{revenueChange}%</span>
                </>
              )}
              <span className="text-xs text-muted-foreground">
                vs {previousMonthTitle}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {periodLabel} 수업
            </CardTitle>
            <CalendarCheck className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisMonthLessons}회</div>
            <div className="mt-1 flex items-center gap-1">
              {Number(lessonsChange) >= 0 ? (
                <>
                  <TrendingUp className="h-4 w-4 text-green-400" />
                  <span className="text-xs text-green-400">+{lessonsChange}%</span>
                </>
              ) : (
                <>
                  <TrendingDown className="h-4 w-4 text-red-400" />
                  <span className="text-xs text-red-400">{lessonsChange}%</span>
                </>
              )}
              <span className="text-xs text-muted-foreground">
                vs {previousMonthTitle}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              활성 회원
            </CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeMembers}명</div>
            <p className="mt-1 text-xs text-muted-foreground">
              전체 {stats.totalMembers}명 중 (현재)
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              신규 회원
            </CardTitle>
            <UserPlus className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {stats.newMembersThisMonth}명
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{periodLabel} 가입</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            월별 매출 추이
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {formatMonthTitle(monthlyRevenueTrend[0]?.month ?? selectedMonth)} ~{' '}
            {monthTitle} (만원)
          </p>
        </CardHeader>
        <CardContent>
          {chartData.every((point) => point.revenue === 0) ? (
            <p className="py-10 text-center text-muted-foreground">
              표시할 매출 데이터가 없습니다.
            </p>
          ) : (
            <ChartContainer
              config={revenueChartConfig}
              className="aspect-[2/1] w-full max-md:aspect-[5/3]"
            >
              <BarChart
                data={chartData}
                margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="shortLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(value) => `${value}`}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => {
                        const revenue = Number(
                          item?.payload?.revenue ?? Number(value) * 10000,
                        )
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">
                              {item?.payload?.label}
                            </span>
                            <span>{revenue.toLocaleString()}원</span>
                          </div>
                        )
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="revenueManwon"
                  fill="var(--color-revenue)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              강사별 수업 현황 ({periodLabel})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {instructorStats.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                데이터가 없습니다.
              </p>
            ) : (
              <div className="space-y-4">
                {instructorStats
                  .sort((a, b) => b.count - a.count)
                  .map((instructor, index) => {
                    const maxCount = Math.max(
                      ...instructorStats.map((item) => item.count),
                    )
                    const percentage = (instructor.count / maxCount) * 100

                    return (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{instructor.name}</span>
                          <span className="font-bold text-primary">
                            {instructor.count}회
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-primary max-md:transition-none md:transition-all md:duration-200"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              종목별 회원 분포
            </CardTitle>
            <p className="text-sm text-muted-foreground">현재 활성 회원 기준</p>
          </CardHeader>
          <CardContent>
            {sortedSports.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                데이터가 없습니다.
              </p>
            ) : (
              <div className="space-y-4">
                {sortedSports.slice(0, 6).map(([sport, count], index) => {
                  const percentage = (
                    (count / totalSportMembers) *
                    100
                  ).toFixed(1)

                  return (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{sport}</span>
                          <Badge variant="secondary" className="text-xs">
                            {percentage}%
                          </Badge>
                        </div>
                        <span className="text-muted-foreground">{count}명</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-primary/70 max-md:transition-none md:transition-all md:duration-200"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>강사료 정산 ({periodLabel})</CardTitle>
          <p className="text-sm text-muted-foreground">
            같은 시간대 인원 기준 · 평일 3만/주말 4만 시작 + 추가 인원당 1만
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>강사</TableHead>
                <TableHead className="text-center">출석</TableHead>
                <TableHead className="hidden text-center sm:table-cell">
                  평일 타임
                </TableHead>
                <TableHead className="hidden text-center sm:table-cell">
                  주말 타임
                </TableHead>
                <TableHead className="text-right">강사료</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructorPayroll.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    출석 수업이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {instructorPayroll.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">
                        <Link
                          href={`/dashboard/instructors?pay=${row.id}`}
                          className="text-primary hover:underline"
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        {row.totalLessons}
                      </TableCell>
                      <TableCell className="hidden text-center sm:table-cell">
                        {row.weekdaySlots}
                      </TableCell>
                      <TableCell className="hidden text-center sm:table-cell">
                        {row.weekendSlots}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {row.totalPay.toLocaleString()}원
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-secondary/50">
                    <TableCell className="font-bold">합계</TableCell>
                    <TableCell className="text-center font-bold">
                      {instructorPayroll.reduce(
                        (sum, row) => sum + row.totalLessons,
                        0,
                      )}
                    </TableCell>
                    <TableCell className="hidden text-center font-bold sm:table-cell">
                      {instructorPayroll.reduce(
                        (sum, row) => sum + row.weekdaySlots,
                        0,
                      )}
                    </TableCell>
                    <TableCell className="hidden text-center font-bold sm:table-cell">
                      {instructorPayroll.reduce(
                        (sum, row) => sum + row.weekendSlots,
                        0,
                      )}
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {stats.totalInstructorPay.toLocaleString()}원
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>월간 요약 ({periodLabel})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">평균 일일 수업</p>
              <p className="mt-1 text-xl font-bold">
                {(stats.thisMonthLessons / Math.max(1, daysInSelectedMonth)).toFixed(
                  1,
                )}
                회
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">회원당 평균 수업</p>
              <p className="mt-1 text-xl font-bold">
                {stats.activeMembers > 0
                  ? (stats.thisMonthLessons / stats.activeMembers).toFixed(1)
                  : '0'}
                회
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">회원 유지율</p>
              <p className="mt-1 text-xl font-bold">
                {stats.totalMembers > 0
                  ? ((stats.activeMembers / stats.totalMembers) * 100).toFixed(1)
                  : '0'}
                %
              </p>
            </div>
            <div className="rounded-lg bg-secondary/50 p-4 text-center">
              <p className="text-sm text-muted-foreground">수업당 평균 매출</p>
              <p className="mt-1 text-xl font-bold">
                {stats.thisMonthLessons > 0
                  ? Math.round(
                      stats.thisMonthRevenue / stats.thisMonthLessons,
                    ).toLocaleString()
                  : '0'}
                원
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
