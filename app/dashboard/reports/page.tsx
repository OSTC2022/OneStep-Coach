import { createClient } from '@/lib/supabase/server'
import { ReportDashboard } from './report-dashboard'

export default async function ReportsPage() {
  const supabase = await createClient()
  const today = new Date()
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  
  // Monthly revenue
  const { data: thisMonthPackages } = await supabase
    .from('session_packages')
    .select('price, paid_at')
    .gte('paid_at', thisMonth.toISOString().split('T')[0])

  const { data: lastMonthPackages } = await supabase
    .from('session_packages')
    .select('price, paid_at')
    .gte('paid_at', lastMonth.toISOString().split('T')[0])
    .lte('paid_at', lastMonthEnd.toISOString().split('T')[0])

  // Monthly lessons
  const { data: thisMonthLessons } = await supabase
    .from('lessons')
    .select('id, attendance_status, lesson_date')
    .gte('lesson_date', thisMonth.toISOString().split('T')[0])

  const { data: lastMonthLessons } = await supabase
    .from('lessons')
    .select('id, attendance_status, lesson_date')
    .gte('lesson_date', lastMonth.toISOString().split('T')[0])
    .lte('lesson_date', lastMonthEnd.toISOString().split('T')[0])

  // Member stats
  const { count: totalMembers } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })

  const { count: activeMembers } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  // New members this month
  const { count: newMembersThisMonth } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
    .gte('registered_at', thisMonth.toISOString().split('T')[0])

  // Instructor stats for lessons this month
  const { data: instructorLessons } = await supabase
    .from('lessons')
    .select(`
      instructor_id,
      instructor:instructors(name),
      attendance_status
    `)
    .gte('lesson_date', thisMonth.toISOString().split('T')[0])
    .eq('attendance_status', 'present')

  // Group lessons by instructor
  const instructorStats: Record<string, { name: string; count: number }> = {}
  instructorLessons?.forEach((lesson) => {
    if (lesson.instructor_id && lesson.instructor) {
      const instructorData = lesson.instructor as { name: string }
      if (!instructorStats[lesson.instructor_id]) {
        instructorStats[lesson.instructor_id] = {
          name: instructorData.name,
          count: 0,
        }
      }
      instructorStats[lesson.instructor_id].count++
    }
  })

  // Sport distribution
  const { data: memberSports } = await supabase
    .from('members')
    .select('sport')
    .eq('is_active', true)

  const sportStats: Record<string, number> = {}
  memberSports?.forEach((member) => {
    const sport = member.sport || '미지정'
    sportStats[sport] = (sportStats[sport] || 0) + 1
  })

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">리포트</h1>
        <p className="text-muted-foreground mt-1">
          센터 운영 현황을 분석합니다.
        </p>
      </div>
      
      <ReportDashboard 
        stats={{
          thisMonthRevenue: thisMonthPackages?.reduce((sum, p) => sum + (p.price || 0), 0) || 0,
          lastMonthRevenue: lastMonthPackages?.reduce((sum, p) => sum + (p.price || 0), 0) || 0,
          thisMonthLessons: thisMonthLessons?.filter(l => l.attendance_status === 'present').length || 0,
          lastMonthLessons: lastMonthLessons?.filter(l => l.attendance_status === 'present').length || 0,
          totalMembers: totalMembers || 0,
          activeMembers: activeMembers || 0,
          newMembersThisMonth: newMembersThisMonth || 0,
        }}
        instructorStats={Object.values(instructorStats)}
        sportStats={sportStats}
      />
    </div>
  )
}
