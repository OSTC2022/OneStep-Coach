import { getMember } from '@/lib/actions/members'
import { requireMemberManager } from '@/lib/auth/member-access'
import { notFound } from 'next/navigation'
import { SessionPackageForm } from './session-package-form'

export default async function NewPackagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireMemberManager()
  const { id } = await params
  const member = await getMember(id)

  if (!member) {
    notFound()
  }

  return (
    <div className="w-full pt-12 lg:pt-0">
      <SessionPackageForm member={{ id: member.id, name: member.name }} />
    </div>
  )
}
