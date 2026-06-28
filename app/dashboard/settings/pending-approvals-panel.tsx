'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  approveAccount,
  listPendingAccounts,
  rejectAccount,
  type PendingAccountRow,
} from '@/lib/actions/auth-registration'
import type {
  InstructorRoleRow,
  SettingsAssignableRole,
} from '@/lib/settings-accounts-types'
import { requiresMemberLinkRole } from '@/lib/settings-accounts-types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { MemberNameWithStaffBadges } from '@/components/members/member-new-signup-badge'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { AccountMemberLinkSelect } from '@/components/settings/account-member-link-select'
import { formatBirthDateDisplay } from '@/lib/member-utils'

const APPROVE_ROLES: { value: SettingsAssignableRole; label: string }[] = [
  { value: 'member', label: '회원' },
  { value: 'adult_member', label: '성인회원' },
  { value: 'guardian', label: '학부모' },
  { value: 'admin', label: '관리자' },
  { value: 'instructor', label: '강사' },
]

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

interface PendingApprovalsPanelProps {
  initialPending: PendingAccountRow[]
  instructors: InstructorRoleRow[]
}

export function PendingApprovalsPanel({
  initialPending,
  instructors,
}: PendingApprovalsPanelProps) {
  const router = useRouter()
  const [pending, setPending] = useState(initialPending)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [approveRole, setApproveRole] = useState<SettingsAssignableRole>('member')
  const [instructorId, setInstructorId] = useState<string>('')
  const [memberId, setMemberId] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pending
    return pending.filter((p) =>
      [p.full_name, p.email, p.loginEmail, p.roleLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [pending, query])

  const selected = pending.find((p) => p.id === selectedId) ?? null

  const unlinkedInstructors = useMemo(
    () => instructors.filter((i) => i.is_active && !i.hasCoachAccess),
    [instructors],
  )

  async function refresh() {
    setRefreshing(true)
    try {
      setPending(await listPendingAccounts())
    } catch {
      toast.error('목록을 불러오지 못했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleApprove() {
    if (!selected) return
    if (approveRole === 'instructor' && !instructorId) {
      toast.error('강사 프로필을 선택해주세요.')
      return
    }
    if (
      requiresMemberLinkRole(approveRole) &&
      !memberId &&
      !selected.signupMemberId
    ) {
      toast.error('연결할 센터 회원을 선택해주세요.')
      return
    }

    setBusy(true)
    const result = await approveAccount(
      selected.id,
      approveRole,
      approveRole === 'instructor' ? instructorId : null,
      requiresMemberLinkRole(approveRole)
        ? memberId || selected.signupMemberId
        : null,
    )
    setBusy(false)

    if (result.error) {
      toast.error('승인 실패', { description: result.error })
      return
    }

    const loginHint = result.loginEmail
      ? `로그인: ${result.loginEmail}`
      : '이메일 없이 가입 — 발급된 로그인 ID를 안내해주세요.'

    toast.success('가입이 승인되었습니다.', { description: loginHint })
    const approvedId = selected.id
    setSelectedId(null)
    setInstructorId('')
    setMemberId('')
    setPending((prev) => prev.filter((p) => p.id !== approvedId))
    await refresh()
    router.refresh()
  }

  async function handleReject() {
    if (!selected) return
    setBusy(true)
    const result = await rejectAccount(selected.id)
    setBusy(false)

    if (result.error) {
      toast.error('거절 실패', { description: result.error })
      return
    }

    toast.success('가입 신청을 거절했습니다.')
    setSelectedId(null)
    await refresh()
    router.refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">승인 대기</CardTitle>
          <CardDescription>
            로그인 화면 회원가입·계정 만들기로 등록된 <strong>승인 대기</strong>{' '}
            계정입니다. 승인해야 로그인할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="이름·이메일 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="min-w-0 overflow-hidden rounded-md border">
            <Table fitContainer>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>신청 유형</TableHead>
                  <TableHead className="hidden sm:table-cell">신청일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-8"
                    >
                      승인 대기 중인 계정이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={selectedId === row.id ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => {
                        setSelectedId(row.id)
                        setMemberId(row.signupMemberId ?? '')
                        setApproveRole(
                          row.role === 'guardian'
                            ? 'guardian'
                            : row.role === 'admin'
                              ? 'admin'
                              : 'member',
                        )
                      }}
                    >
                      <TableCell className="max-w-0 font-medium">
                        <MemberNameWithStaffBadges
                          name={row.full_name || '—'}
                          badgeUntil={row.newMemberBadgeUntil}
                          showStaffBadges
                        />
                      </TableCell>
                      <TableCell className="max-w-0 truncate text-sm text-muted-foreground">
                        {row.email ||
                          (row.loginEmail ? `로그인 ID: ${row.loginEmail}` : '(이메일 없음)')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.roleLabel}</Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground tabular-nums">
                        {formatDate(row.created_at)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void refresh()}
            >
              {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              새로고침
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">승인 · 거절</CardTitle>
          <CardDescription>권한을 정한 뒤 승인하면 바로 로그인할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              왼쪽에서 신청을 선택하세요.
            </p>
          ) : (
            <>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">{selected.full_name || '이름 없음'}</p>
                <p className="text-muted-foreground truncate">
                  {selected.email ||
                    (selected.loginEmail
                      ? `로그인 ID: ${selected.loginEmail}`
                      : '이메일 없음 — 승인 후 로그인 ID 안내')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  신청: {selected.roleLabel}
                </p>
                {(selected.birth_date || selected.phone || selected.parent_phone) && (
                  <dl className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    {selected.birth_date ? (
                      <div className="flex justify-between gap-2">
                        <dt>생년월일</dt>
                        <dd className="text-foreground tabular-nums">
                          {formatBirthDateDisplay(selected.birth_date)}
                        </dd>
                      </div>
                    ) : null}
                    {selected.phone ? (
                      <div className="flex justify-between gap-2">
                        <dt>개인 연락처</dt>
                        <dd className="text-foreground">{selected.phone}</dd>
                      </div>
                    ) : null}
                    {selected.parent_phone ? (
                      <div className="flex justify-between gap-2">
                        <dt>보호자 연락처</dt>
                        <dd className="text-foreground">{selected.parent_phone}</dd>
                      </div>
                    ) : null}
                  </dl>
                )}
                {selected.signupMemberId ? (
                  <p className="mt-2 text-[11px] text-primary">
                    가입 시 자동 생성된 회원 프로필이 있습니다. 센터에 먼저 등록한
                    회원을 선택하면 하나로 통합됩니다.
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">부여할 권한</label>
                <Select
                  value={approveRole}
                  onValueChange={(v) => {
                    setApproveRole(v as SettingsAssignableRole)
                    if (v !== 'instructor') setInstructorId('')
                    if (v !== 'member') setMemberId('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APPROVE_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {requiresMemberLinkRole(approveRole) && selected ? (
                <AccountMemberLinkSelect
                  accountUserId={selected.id}
                  value={memberId}
                  onValueChange={setMemberId}
                />
              ) : null}

              {approveRole === 'instructor' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">연결할 강사</label>
                  <Select value={instructorId} onValueChange={setInstructorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="강사 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {unlinkedInstructors.length === 0 ? (
                        <SelectItem value="_none" disabled>
                          연결 가능한 강사가 없습니다
                        </SelectItem>
                      ) : (
                        unlinkedInstructors.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Button
                type="button"
                className="w-full"
                disabled={busy}
                onClick={() => void handleApprove()}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                승인
              </Button>

              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={busy}
                onClick={() => void handleReject()}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-2 h-4 w-4" />
                )}
                거절
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
