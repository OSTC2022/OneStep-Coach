import { getMember } from '@/lib/actions/members'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { MemberDetail } from './member-detail'

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const member = await getMember(id)

  if (!member) {
    notFound()
  }

  const supabase = await createClient()

  const { data: sessionPackages } = await supabase
    .from('session_packages')
    .select(
      'id, member_id, total_sessions, remaining_sessions, price, paid_at, is_active, created_at',
    )
    .eq('member_id', id)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: lessons } = await supabase
    .from('lessons')
    .select(
      'id, lesson_date, start_time, end_time, lesson_type, attendance_status, instructor_id',
    )
    .eq('member_id', id)
    .order('lesson_date', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <MemberDetail
        member={member}
        sessionPackages={sessionPackages || []}
        lessons={lessons || []}
      />
    </div>
  )
}
