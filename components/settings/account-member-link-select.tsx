'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import {
  MemberSearchSelect,
  type MemberSearchOption,
} from '@/components/members/member-search-select'
import {
  getMemberLinkedToAccount,
  searchMembersForAccountLink,
} from '@/lib/actions/member-account'

interface AccountMemberLinkSelectProps {
  accountUserId: string
  value: string
  onValueChange: (memberId: string) => void
}

export function AccountMemberLinkSelect({
  accountUserId,
  value,
  onValueChange,
}: AccountMemberLinkSelectProps) {
  const [members, setMembers] = useState<
    Array<{
      id: string
      name: string
      sport?: string | null
      age?: number | null
      birth_date?: string | null
    }>
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [linked, suggestions] = await Promise.all([
          getMemberLinkedToAccount(accountUserId),
          searchMembersForAccountLink('', accountUserId),
        ])
        if (cancelled) return

        const rows = [...suggestions]
        if (linked && !rows.some((row) => row.id === linked.id)) {
          rows.unshift({
            id: linked.id,
            name: linked.name,
            linkedToOtherAccount: false,
          })
        }

        setMembers(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            sport: row.sport,
            age: row.age,
            birth_date: row.birth_date,
          })),
        )

        if (linked) {
          onValueChange(linked.id)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 계정 선택 시에만 초기 로드
  }, [accountUserId])

  return (
    <div className="space-y-1.5">
      <Label>연결할 센터 회원</Label>
      {loading ? (
        <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          회원 목록 불러오는 중…
        </div>
      ) : (
        <>
          <MemberSearchSelect
            value={value}
            onValueChange={(next, member) => {
              onValueChange(next)
              if (member) {
                setMembers((prev) =>
                  prev.some((row) => row.id === member.id)
                    ? prev
                    : [...prev, member],
                )
              }
            }}
            members={members}
            placeholder="이름·연락처로 회원 검색"
            inlineSearch
            enableRecentSearches
            onSearchMembers={async (query) => {
              const rows = await searchMembersForAccountLink(query, accountUserId)
              return rows as MemberSearchOption[]
            }}
          />
          {!value ? (
            <p className="text-[11px] text-amber-600">
              검색 결과에서 회원을 클릭해 선택해야 저장할 수 있습니다.
            </p>
          ) : null}
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        가입 계정을 센터에 등록된 회원과 연결하면 마이페이지·리포트 접근이
        활성화됩니다. 가입 시 자동 생성된 중복 프로필은 연결 시 하나로
        통합됩니다.
      </p>
    </div>
  )
}
