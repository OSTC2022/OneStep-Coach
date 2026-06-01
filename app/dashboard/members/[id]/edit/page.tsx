import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { MemberEditForm } from './member-edit-form'

export default async function MemberEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('id', id)
    .single()

  if (!member) {
    notFound()
  }

  const { data: instructors } = await supabase
    .from('instructors')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <MemberEditForm member={member} instructors={instructors || []} />
    </div>
  )
}
