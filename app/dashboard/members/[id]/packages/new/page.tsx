import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { SessionPackageForm } from './session-package-form'

export default async function NewPackagePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: member } = await supabase
    .from('members')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!member) {
    notFound()
  }

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <SessionPackageForm member={member} />
    </div>
  )
}
