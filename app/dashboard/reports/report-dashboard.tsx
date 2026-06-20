'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { InstructorPayrollRow } from '@/lib/actions/reports'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CalendarCheck, 
  Users,
  UserPlus,
  BarChart3
} from 'lucide-react'

interface ReportDashboardProps {
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
}

export function ReportDashboard({
  stats,
  instructorStats,
  instructorPayroll,
  sportStats,
}: ReportDashboardProps) {
  const revenueChange = stats.lastMonthRevenue > 0 
    ? ((stats.thisMonthRevenue - stats.lastMonthRevenue) / stats.lastMonthRevenue * 100).toFixed(1)
    : '0'
  const lessonsChange = stats.lastMonthLessons > 0
    ? ((stats.thisMonthLessons - stats.lastMonthLessons) / stats.lastMonthLessons * 100).toFixed(1)
    : '0'

  const sortedSports = Object.entries(sportStats).sort((a, b) => b[1] - a[1])
  const totalSportMembers = Object.values(sportStats).reduce((sum, count) => sum + count, 0)

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">이번 달 매출</CardTitle>
            <DollarSign className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(stats.thisMonthRevenue / 10000).toLocaleString()}만원
            </div>
            <div className="flex items-center gap-1 mt-1">
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
              <span className="text-xs text-muted-foreground">vs 지난달</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">이번 달 수업</CardTitle>
            <CalendarCheck className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisMonthLessons}회</div>
            <div className="flex items-center gap-1 mt-1">
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
              <span className="text-xs text-muted-foreground">vs 지난달</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">활성 회원</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeMembers}명</div>
            <p className="text-xs text-muted-foreground mt-1">
              전체 {stats.totalMembers}명 중
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">신규 회원</CardTitle>
            <UserPlus className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.newMembersThisMonth}명</div>
            <p className="text-xs text-muted-foreground mt-1">이번 달 가입</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Instructor Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              강사별 수업 현황 (이번 달)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {instructorStats.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">데이터가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {instructorStats
                  .sort((a, b) => b.count - a.count)
                  .map((instructor, index) => {
                    const maxCount = Math.max(...instructorStats.map(i => i.count))
                    const percentage = (instructor.count / maxCount) * 100
                    
                    return (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{instructor.name}</span>
                          <span className="text-primary font-bold">{instructor.count}회</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-primary rounded-full max-md:transition-none md:transition-all md:duration-200"
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

        {/* Sport Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              종목별 회원 분포
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sortedSports.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">데이터가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {sortedSports.slice(0, 6).map(([sport, count], index) => {
                  const percentage = ((count / totalSportMembers) * 100).toFixed(1)
                  
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
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary/70 rounded-full max-md:transition-none md:transition-all md:duration-200"
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
          <CardTitle>강사료 정산 (이번 달)</CardTitle>
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
                <TableHead className="text-center hidden sm:table-cell">평일 타임</TableHead>
                <TableHead className="text-center hidden sm:table-cell">주말 타임</TableHead>
                <TableHead className="text-right">강사료</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructorPayroll.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
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
                      <TableCell className="text-center">{row.totalLessons}</TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        {row.weekdaySlots}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
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
                      {instructorPayroll.reduce((sum, row) => sum + row.totalLessons, 0)}
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell font-bold">
                      {instructorPayroll.reduce((sum, row) => sum + row.weekdaySlots, 0)}
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell font-bold">
                      {instructorPayroll.reduce((sum, row) => sum + row.weekendSlots, 0)}
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

      {/* Monthly Summary */}
      <Card>
        <CardHeader>
          <CardTitle>월간 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="p-4 bg-secondary/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">평균 일일 수업</p>
              <p className="text-xl font-bold mt-1">
                {(stats.thisMonthLessons / new Date().getDate()).toFixed(1)}회
              </p>
            </div>
            <div className="p-4 bg-secondary/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">회원당 평균 수업</p>
              <p className="text-xl font-bold mt-1">
                {stats.activeMembers > 0 
                  ? (stats.thisMonthLessons / stats.activeMembers).toFixed(1) 
                  : '0'}회
              </p>
            </div>
            <div className="p-4 bg-secondary/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">회원 유지율</p>
              <p className="text-xl font-bold mt-1">
                {stats.totalMembers > 0 
                  ? ((stats.activeMembers / stats.totalMembers) * 100).toFixed(1) 
                  : '0'}%
              </p>
            </div>
            <div className="p-4 bg-secondary/50 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">수업당 평균 매출</p>
              <p className="text-xl font-bold mt-1">
                {stats.thisMonthLessons > 0 
                  ? Math.round(stats.thisMonthRevenue / stats.thisMonthLessons).toLocaleString()
                  : '0'}원
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
