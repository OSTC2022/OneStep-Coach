'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SessionPackage, SessionPackageFormData } from '@/lib/types'

export async function getSessionPackages(options?: {
  memberId?: string
  isActive?: boolean
}): Promise<SessionPackage[]> {
  const supabase = await createClient()
  
  let query = supabase
    .from('session_packages')
    .select('*, member:members(*)')
    .order('created_at', { ascending: false })

  if (options?.memberId) {
    query = query.eq('member_id', options.memberId)
  }

  if (options?.isActive !== undefined) {
    query = query.eq('is_active', options.isActive)
  }

  const { data, error } = await query

  if (error) {
    console.error('Error fetching session packages:', error)
    return []
  }

  return data as SessionPackage[]
}

export async function getActivePackageForMember(memberId: string): Promise<SessionPackage | null> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('session_packages')
    .select('*')
    .eq('member_id', memberId)
    .eq('is_active', true)
    .gt('remaining_sessions', 0)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    if (error.code !== 'PGRST116') { // No rows found
      console.error('Error fetching active package:', error)
    }
    return null
  }

  return data as SessionPackage
}

export async function createSessionPackage(formData: SessionPackageFormData): Promise<{ data?: SessionPackage; error?: string }> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('session_packages')
    .insert({
      member_id: formData.member_id,
      total_sessions: formData.total_sessions,
      remaining_sessions: formData.total_sessions,
      price: formData.price || null,
      paid_at: formData.paid_at || null,
      expires_at: formData.expires_at || null,
      payment_method: formData.payment_method || null,
      note: formData.note || null,
      is_active: true,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating session package:', error)
    const message =
      error.code === 'PGRST205'
        ? 'session_packages 테이블이 없습니다. supabase/fix-session-packages.sql 을 실행해주세요.'
        : error.message
    return { error: message }
  }

  const pkg = data as SessionPackage

  await supabase.from('session_transactions').insert({
    member_id: formData.member_id,
    session_package_id: pkg.id,
    delta: formData.total_sessions,
    balance_after: formData.total_sessions,
    reason: 'package_purchase',
    note: formData.note ?? null,
  })

  const { error: syncError } = await supabase.rpc('sync_member_remaining_sessions', {
    p_member_id: formData.member_id,
  })
  if (syncError) {
    console.warn('sync_member_remaining_sessions:', syncError.message)
  }

  revalidatePath('/dashboard/members')
  revalidatePath(`/dashboard/members/${formData.member_id}`)
  revalidatePath('/dashboard/sessions')
  return { data: data as SessionPackage }
}

export async function getSessionPackage(id: string): Promise<SessionPackage | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('session_packages')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error('Error fetching session package:', error)
    return null
  }

  return data as SessionPackage
}

export async function updateSessionPackage(
  id: string, 
  updates: Partial<SessionPackageFormData & { remaining_sessions?: number; is_active?: boolean }>
): Promise<{ data?: SessionPackage; error?: string }> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('session_packages')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Error updating session package:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/members')
  if (data?.member_id) {
    revalidatePath(`/dashboard/members/${data.member_id}`)
  }
  revalidatePath('/dashboard/sessions')
  return { data: data as SessionPackage }
}

export async function deductSession(packageId: string): Promise<{ data?: SessionPackage; error?: string }> {
  const supabase = await createClient()
  
  // First get current remaining sessions
  const { data: pkg } = await supabase
    .from('session_packages')
    .select('remaining_sessions')
    .eq('id', packageId)
    .single()

  if (!pkg || pkg.remaining_sessions <= 0) {
    return { error: '남은 수업 횟수가 없습니다.' }
  }

  const { data, error } = await supabase
    .from('session_packages')
    .update({ 
      remaining_sessions: pkg.remaining_sessions - 1,
      is_active: pkg.remaining_sessions - 1 > 0
    })
    .eq('id', packageId)
    .select()
    .single()

  if (error) {
    console.error('Error deducting session:', error)
    return { error: error.message }
  }

  revalidatePath('/dashboard/members')
  revalidatePath('/dashboard/sessions')
  return { data: data as SessionPackage }
}

export async function getExpiringPackages(days: number = 7): Promise<SessionPackage[]> {
  const supabase = await createClient()
  
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + days)
  
  const { data, error } = await supabase
    .from('session_packages')
    .select('*, member:members(*)')
    .eq('is_active', true)
    .lte('expires_at', futureDate.toISOString().split('T')[0])
    .order('expires_at', { ascending: true })

  if (error) {
    console.error('Error fetching expiring packages:', error)
    return []
  }

  return data as SessionPackage[]
}

export async function getLowSessionPackages(threshold: number = 3): Promise<SessionPackage[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('session_packages')
    .select('*, member:members(*)')
    .eq('is_active', true)
    .lte('remaining_sessions', threshold)
    .gt('remaining_sessions', 0)
    .order('remaining_sessions', { ascending: true })

  if (error) {
    console.error('Error fetching low session packages:', error)
    return []
  }

  return data as SessionPackage[]
}
