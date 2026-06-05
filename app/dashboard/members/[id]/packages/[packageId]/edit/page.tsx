import { getMember } from '@/lib/actions/members'
import { notFound } from 'next/navigation'
import { getSessionPackage } from '@/lib/actions/sessions'
import { SessionPackageForm } from '../../new/session-package-form'

export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string; packageId: string }>
}) {
  const { id, packageId } = await params

  const [member, sessionPackage] = await Promise.all([
    getMember(id),
    getSessionPackage(packageId),
  ])

  if (!member || !sessionPackage || sessionPackage.member_id !== member.id) {
    notFound()
  }

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <SessionPackageForm
        member={{ id: member.id, name: member.name }}
        sessionPackage={sessionPackage}
      />
    </div>
  )
}
