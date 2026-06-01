import { createClient } from '@/lib/supabase/server'
import { SessionsList } from './sessions-list'

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ member?: string }>
}) {
  const params = await searchParams
  const supabase = await createClient()

  let query = supabase
    .from('session_packages')
    .select(`
      *,
      member:members(id, name, phone)
    `)
    .order('created_at', { ascending: false })

  if (params.member) {
    query = query.eq('member_id', params.member)
  }

  const { data: packages } = await query

  const { data: members } = await supabase
    .from('members')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">세션/결제 관리</h1>
        <p className="text-muted-foreground mt-1">
          회원 수업권 구매 및 잔여 횟수를 관리합니다.
        </p>
      </div>
      
      <SessionsList 
        initialPackages={packages || []} 
        members={members || []}
        selectedMemberId={params.member}
      />
    </div>
  )
}
