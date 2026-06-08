import { redirect } from 'next/navigation'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import {
  getDashboardStats,
  getInstructorDashboardStats,
  getRecentActivity,
} from '@/lib/actions/dashboard'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Users,
  CalendarCheck,
  ClipboardList,
  CalendarDays,
  ListChecks,
  AlertTriangle,
} from 'lucide-react'
import { profileRoleToAppRole } from '@/lib/roles'
import { getCenterSettings } from '@/lib/actions/center-settings'
import { getInstructorForCurrentUser } from '@/lib/actions/instructors'
import { StaffSnsCard } from '@/components/instructors/staff-sns-card'
import { DashboardRecentPayments } from './dashboard-recent-payments'

export default async function DashboardPage() {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  if (profile.role === 'member' || profile.role === 'guardian') {
    redirect('/dashboard/my')
  }

  const appRole = profileRoleToAppRole(profile.role)
  const isAdmin = appRole === 'admin'

  const [stats, recentActivity, centerSettings, linkedInstructor] = await Promise.all([
    isAdmin ? getDashboardStats() : getInstructorDashboardStats(),
    isAdmin ? getRecentActivity(6) : Promise.resolve([]),
    getCenterSettings(),
    isAdmin ? Promise.resolve(null) : getInstructorForCurrentUser(),
  ])

  const quickLinks =
    isAdmin
      ? [
          { href: '/dashboard/lesson-status', label: '수업현황', icon: ListChecks },
          { href: '/dashboard/members', label: '회원 관리', icon: Users },
          { href: '/dashboard/attendance', label: '출석 체크', icon: CalendarCheck },
          { href: '/dashboard/lessons', label: '수업 등록', icon: ClipboardList },
          { href: '/dashboard/calendar', label: '캘린더', icon: CalendarDays },
        ]
      : [
          { href: '/dashboard/lesson-status', label: '수업현황', icon: ListChecks },
          { href: '/dashboard/members', label: '회원 관리', icon: Users },
          { href: '/dashboard/attendance', label: '출석 체크', icon: CalendarCheck },
          { href: '/dashboard/lessons', label: '수업 등록', icon: ClipboardList },
          { href: '/dashboard/calendar', label: '캘린더', icon: CalendarDays },
        ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-muted-foreground">OneStep Coach 센터 관리</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              오늘 수업
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.todayLessons}</p>
          </CardContent>
        </Card>

        {isAdmin && 'totalMembers' in stats ? (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="h-4 w-4" />
                  활성 회원
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.activeMembers}</p>
                <p className="text-xs text-muted-foreground">
                  전체 {stats.totalMembers}명
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <AlertTriangle className="h-4 w-4" />
                  주의
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  만료 임박 <strong>{stats.expiringPackages}</strong>건
                </p>
                <p className="text-sm text-muted-foreground">
                  잔여 3회 이하 <strong>{stats.lowSessionMembers}</strong>건
                </p>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="h-full transition-colors hover:bg-muted/40 active:bg-muted/60 max-md:transition-none">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">바로가기</p>
              </CardContent>
            </Card>
          </Link>
        ))}
        {isAdmin ? <DashboardRecentPayments payments={recentActivity} /> : null}
      </div>

      {!isAdmin ? (
        <StaffSnsCard
          role="instructor"
          instructor={linkedInstructor}
          centerSettings={centerSettings}
        />
      ) : null}
    </div>
  )
}
