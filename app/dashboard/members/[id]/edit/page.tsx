import { getMember } from '@/lib/actions/members'
import { getInstructors } from '@/lib/actions/instructors'
import { requireMemberManager } from '@/lib/auth/member-access'
import { notFound } from 'next/navigation'
import { MemberEditForm } from './member-edit-form'

export const dynamic = 'force-dynamic'

export default async function MemberEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireMemberManager()
  const { id } = await params
  const [member, instructors] = await Promise.all([
    getMember(id),
    getInstructors({ isActive: true }),
  ])

  if (!member) {
    notFound()
  }

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <MemberEditForm
        member={member}
        instructors={instructors.map(({ id, name, calendar_color }) => ({
          id,
          name,
          calendar_color,
        }))}
      />
    </div>
  )
}
