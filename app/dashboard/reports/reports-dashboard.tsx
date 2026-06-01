'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  DollarSign,
  Users,
  CalendarCheck,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Wallet,
  Building,
} from 'lucide-react'

interface InstructorPayroll {
  id: string
  name: string
  totalLessons: number
  weekdayLessons: number
  weekendLessons: number
  weekdayPay: number
  weekendPay: number
  totalPay: number
}

interface ReportsDashboardProps {
  currentMonth: string
  stats: {
    totalRevenue: number
    totalLessons: number
    attendanceRate: number
    totalMembers: number
    activeMembers: number
  }
  revenueByMethod: Record<string, number>
  lessonsByInstructor: Record<string, number>
  instructorPayroll: InstructorPayroll[]
}

export function ReportsDashboard({
  currentMonth,
  stats,
  revenueByMethod,
  lessonsByInstructor,
  instructorPayroll,
}: ReportsDashboardProps) {
  const router = useRouter()
  const [year, month] = currentMonth.split('-').map(Number)

  const navigateMonth = (direction: 'prev' | 'next') => {
    let newYear = year
    let newMonth = month + (direction === 'next' ? 1 : -1)
    
    if (newMonth > 12) {
      newMonth = 1
      newYear++
    } else if (newMonth < 1) {
      newMonth = 12
      newYear--
    }
    
    router.push(`/dashboard/reports?month=${newYear}-${String(newMonth).padStart(2, '0')}`)
  }

  const getPaymentMethodIcon = (method: string) => {
    switch (method) {
      case '카드': return <CreditCard className="h-4 w-4" />
      case '현금': return <Wallet className="h-4 w-4" />
      case '계좌이체': return <Building className="h-4 w-4" />
      default: return <DollarSign className="h-4 w-4" />
    }
  }

  const totalPayroll = instructorPayroll.reduce((sum, i) => sum + i.totalPay, 0)
  const netProfit = stats.totalRevenue - totalPayroll

  return (
    <div className="space-y-6">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => navigateMonth('prev')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="month"
            value={currentMonth}
            onChange={(e) => router.push(`/dashboard/reports?month=${e.target.value}`)}
            className="w-auto"
          />
          <Button variant="outline" size="icon" onClick={() => navigateMonth('next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button 
          variant="outline" 
          onClick={() => {
            const now = new Date()
            router.push(`/dashboard/reports?month=${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
          }}
        >
          이번 달
        </Button>
      </div>

      {/* Key Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">월 매출</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats.totalRevenue / 10000).toFixed(0)}만원</div>
            <p className="text-xs text-muted-foreground">{stats.totalRevenue.toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 수업</CardTitle>
            <CalendarCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalLessons}회</div>
            <p className="text-xs text-muted-foreground">출석률 {stats.attendanceRate}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">강사료</CardTitle>
            <Users className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(totalPayroll / 10000).toFixed(0)}만원</div>
            <p className="text-xs text-muted-foreground">{totalPayroll.toLocaleString()}원</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">순수익</CardTitle>
            <TrendingUp className={`h-4 w-4 ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-destructive'}`}>
              {netProfit >= 0 ? '+' : ''}{(netProfit / 10000).toFixed(0)}만원
            </div>
            <p className="text-xs text-muted-foreground">매출 - 강사료</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue by Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle>결제 수단별 매출</CardTitle>
            <CardDescription>{year}년 {month}월 결제 현황</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(revenueByMethod).length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">데이터가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(revenueByMethod).map(([method, amount]) => (
                  <div key={method} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        {getPaymentMethodIcon(method)}
                      </div>
                      <span className="font-medium">{method}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{(amount / 10000).toFixed(0)}만원</p>
                      <p className="text-xs text-muted-foreground">
                        {Math.round((amount / stats.totalRevenue) * 100)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lessons by Instructor */}
        <Card>
          <CardHeader>
            <CardTitle>강사별 수업 현황</CardTitle>
            <CardDescription>{year}년 {month}월 수업 수</CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(lessonsByInstructor).length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">데이터가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(lessonsByInstructor)
                  .sort((a, b) => b[1] - a[1])
                  .map(([instructor, count]) => (
                    <div key={instructor} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-chart-2/10 flex items-center justify-center font-medium">
                          {instructor.charAt(0)}
                        </div>
                        <span className="font-medium">{instructor}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-bold">{count}회</p>
                        <p className="text-xs text-muted-foreground">
                          {Math.round((count / stats.totalLessons) * 100)}%
                        </p>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Instructor Payroll Table */}
      <Card>
        <CardHeader>
          <CardTitle>강사료 정산</CardTitle>
          <CardDescription>{year}년 {month}월 강사별 급여 계산</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>강사명</TableHead>
                <TableHead className="text-center">총 수업</TableHead>
                <TableHead className="text-center hidden sm:table-cell">평일</TableHead>
                <TableHead className="text-center hidden sm:table-cell">주말</TableHead>
                <TableHead className="text-center hidden md:table-cell">평일 급여</TableHead>
                <TableHead className="text-center hidden md:table-cell">주말 급여</TableHead>
                <TableHead className="text-right">총 급여</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructorPayroll.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    데이터가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {instructorPayroll.map((instructor) => (
                    <TableRow key={instructor.id}>
                      <TableCell className="font-medium">{instructor.name}</TableCell>
                      <TableCell className="text-center">{instructor.totalLessons}</TableCell>
                      <TableCell className="text-center hidden sm:table-cell">{instructor.weekdayLessons}</TableCell>
                      <TableCell className="text-center hidden sm:table-cell">{instructor.weekendLessons}</TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        {instructor.weekdayPay.toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        {instructor.weekendPay.toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {instructor.totalPay.toLocaleString()}원
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-secondary/50">
                    <TableCell className="font-bold">합계</TableCell>
                    <TableCell className="text-center font-bold">
                      {instructorPayroll.reduce((sum, i) => sum + i.totalLessons, 0)}
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell font-bold">
                      {instructorPayroll.reduce((sum, i) => sum + i.weekdayLessons, 0)}
                    </TableCell>
                    <TableCell className="text-center hidden sm:table-cell font-bold">
                      {instructorPayroll.reduce((sum, i) => sum + i.weekendLessons, 0)}
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell font-bold">
                      {instructorPayroll.reduce((sum, i) => sum + i.weekdayPay, 0).toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-center hidden md:table-cell font-bold">
                      {instructorPayroll.reduce((sum, i) => sum + i.weekendPay, 0).toLocaleString()}원
                    </TableCell>
                    <TableCell className="text-right font-bold text-primary">
                      {totalPayroll.toLocaleString()}원
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Member Stats */}
      <Card>
        <CardHeader>
          <CardTitle>회원 현황</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-lg bg-secondary/50">
              <p className="text-sm text-muted-foreground">전체 회원</p>
              <p className="text-3xl font-bold">{stats.totalMembers}명</p>
            </div>
            <div className="p-4 rounded-lg bg-primary/10">
              <p className="text-sm text-muted-foreground">활성 회원</p>
              <p className="text-3xl font-bold text-primary">{stats.activeMembers}명</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
