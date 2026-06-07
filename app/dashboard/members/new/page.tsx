import { getInstructors } from '@/lib/actions/instructors'
import { requireMemberManager } from '@/lib/auth/member-access'
import { MemberForm } from '@/components/members/member-form'

export default async function NewMemberPage() {
  await requireMemberManager()
  const instructors = await getInstructors({ isActive: true })

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">회원 추가</h1>
        <p className="text-muted-foreground">이름만 입력해도 등록할 수 있습니다.</p>
      </div>

      <MemberForm instructors={instructors} />
    </div>
  )
}
