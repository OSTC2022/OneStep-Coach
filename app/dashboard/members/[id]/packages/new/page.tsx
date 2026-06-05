import { getMember } from '@/lib/actions/members'
import { notFound } from 'next/navigation'
import { SessionPackageForm } from './session-package-form'

export default async function NewPackagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const member = await getMember(id)

  if (!member) {
    notFound()
  }

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <SessionPackageForm member={{ id: member.id, name: member.name }} />
    </div>
  )
}
