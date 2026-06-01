import { createClient } from '@/lib/supabase/server'
import { AttendanceCheck } from './attendance-check'

export default async function AttendancePage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]
  
  const { data: todayLessons } = await supabase
    .from('lessons')
    .select(`
      *,
      member:members(id, name, phone, sport),
      instructor:instructors(id, name)
    `)
    .eq('lesson_date', today)
    .order('start_time')

  const { data: instructors } = await supabase
    .from('instructors')
    .select('id, name')
    .eq('is_active', true)

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">출석 체크</h1>
        <p className="text-muted-foreground mt-1">
          오늘의 수업 출석 현황을 확인하고 관리합니다.
        </p>
      </div>
      
      <AttendanceCheck 
        initialLessons={todayLessons || []}
        instructors={instructors || []}
      />
    </div>
  )
}
