import 'server-only'

import { createServiceRoleClient } from '@/lib/supabase/admin'
import { extractMemberNameFromCalendarLabel } from '@/lib/member-utils'

const NOISE_WORDS = /수업|pt|PT|훈련|레슨|lesson|개인|그룹|group/gi

/** 회원 매칭용 이름 정규화 */
export function normalizeMemberMatchKey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[()（）\[\]【】]/g, '')
    .replace(NOISE_WORDS, '')
    .toLowerCase()
}

function normalizePhoneDigits(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(/\D/g, '')
}

export type MemberLookup = {
  resolveMemberId(calendarLabel: string): string | null
}

/**
 * 동기화 1회당 members 1회 조회 → Map 기반 O(1) 매칭
 */
export async function buildMemberLookup(
  supabase: ReturnType<typeof createServiceRoleClient>,
): Promise<MemberLookup> {
  const { data, error } = await supabase
    .from('members')
    .select('id, name, phone, parent_phone')
    .eq('is_active', true)

  if (error) throw new Error(error.message)

  const nameToIds = new Map<string, Set<string>>()
  const phoneToIds = new Map<string, Set<string>>()

  for (const row of data ?? []) {
    const id = row.id as string
    const name = (row.name as string | null)?.trim()
    if (name) {
      for (const key of memberNameKeys(name)) {
        const set = nameToIds.get(key) ?? new Set<string>()
        set.add(id)
        nameToIds.set(key, set)
      }
    }

    for (const phone of [row.phone, row.parent_phone] as (string | null)[]) {
      const digits = normalizePhoneDigits(phone)
      if (digits.length >= 4) {
        const set = phoneToIds.get(digits) ?? new Set<string>()
        set.add(id)
        phoneToIds.set(digits, set)
      }
    }
  }

  const uniqueNameMap = new Map<string, string>()
  for (const [key, ids] of nameToIds) {
    if (ids.size === 1) {
      uniqueNameMap.set(key, [...ids][0]!)
    }
  }

  const uniquePhoneMap = new Map<string, string>()
  for (const [key, ids] of phoneToIds) {
    if (ids.size === 1) {
      uniquePhoneMap.set(key, [...ids][0]!)
    }
  }

  return {
    resolveMemberId(calendarLabel: string): string | null {
      const raw = calendarLabel.trim()
      if (!raw) return null

      const extracted = extractMemberNameFromCalendarLabel(raw)
      for (const candidate of [extracted, raw]) {
        const key = normalizeMemberMatchKey(candidate)
        if (key && uniqueNameMap.has(key)) {
          return uniqueNameMap.get(key)!
        }
      }

      const phoneDigits = normalizePhoneDigits(raw)
      if (phoneDigits.length >= 4 && uniquePhoneMap.has(phoneDigits)) {
        return uniquePhoneMap.get(phoneDigits)!
      }

      return null
    },
  }
}

function memberNameKeys(name: string): string[] {
  const keys = new Set<string>()
  keys.add(normalizeMemberMatchKey(name))
  keys.add(normalizeMemberMatchKey(extractMemberNameFromCalendarLabel(name)))
  return [...keys].filter(Boolean)
}
