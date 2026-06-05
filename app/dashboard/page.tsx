import { redirect } from 'next/navigation'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, CalendarCheck, ClipboardList, CalendarDays, ListChecks } from 'lucide-react'

export default async function DashboardPage() {
  const profile = await getDashboardProfile()
  if (!profile) redirect('/auth/login')

  if (profile.role === 'member' || profile.role === 'guardian') {
    redirect('/dashboard/my')
  }

  const quickLinks =
    profile.role === 'admin'
      ? [
          { href: '/dashboard/lesson-status', label: '수업현황', icon: ListChecks },
          { href: '/dashboard/members', label: '회원 관리', icon: Users },
          { href: '/dashboard/attendance', label: '출석 체크', icon: CalendarCheck },
          { href: '/dashboard/lessons', label: '수업 등록', icon: ClipboardList },
          { href: '/dashboard/calendar', label: '캘린더', icon: CalendarDays },
        ]
      : [
          { href: '/dashboard/lesson-status', label: '수업현황', icon: ListChecks },
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href} prefetch>
            <Card className="transition-colors hover:bg-muted/40 active:bg-muted/60 max-md:transition-none">
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
      </div>
    </div>
  )
}
