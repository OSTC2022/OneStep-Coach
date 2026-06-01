import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDefaultDashboardPath, profileRoleToAppRole } from '@/lib/roles'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, CalendarCheck, ClipboardList, CalendarDays } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  let role = profileRoleToAppRole(profile?.role ?? null)
  if (!profile?.role) {
    const { data: legacy } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    role = profileRoleToAppRole(legacy?.role ?? 'member')
  }

  if (role === 'member' || role === 'guardian') {
    redirect('/dashboard/my')
  }

  const quickLinks = [
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="transition-colors hover:bg-muted/40">
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
