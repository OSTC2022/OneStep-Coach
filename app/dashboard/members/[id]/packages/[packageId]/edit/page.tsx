import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { getSessionPackage } from '@/lib/actions/sessions'
import { SessionPackageForm } from '../../new/session-package-form'

export default async function EditPackagePage({
  params,
}: {
  params: Promise<{ id: string; packageId: string }>
}) {
  const { id, packageId } = await params
  const supabase = await createClient()

  const [{ data: member }, sessionPackage] = await Promise.all([
    supabase.from('members').select('id, name').eq('id', id).single(),
    getSessionPackage(packageId),
  ])

  if (!member || !sessionPackage || sessionPackage.member_id !== member.id) {
    notFound()
  }

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <SessionPackageForm member={member} sessionPackage={sessionPackage} />
    </div>
  )
}
