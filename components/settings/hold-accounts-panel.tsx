'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, PauseCircle, RotateCcw, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  approveAccount,
  listOnHoldAccounts,
  rejectAccount,
  restoreAccountToPending,
  type PendingAccountRow,
} from '@/lib/actions/auth-registration'
import type {
  InstructorRoleRow,
  SettingsAssignableRole,
} from '@/lib/settings-accounts-types'
import { requiresMemberLinkRole } from '@/lib/settings-accounts-types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import {
  adultProgramFromRoleSelect,
  type AdultMemberProgram,
} from '@/lib/adult-member-programs'

type RoleSelectValue =
  | SettingsAssignableRole
  | 'adult_member_athletics'
  | 'adult_member_general'

const ROLE_SELECT_OPTIONS: { value: RoleSelectValue; label: string }[] = [
  { value: 'member', label: '회원' },
  { value: 'adult_member_athletics', label: '성인회원(육상)' },
  { value: 'adult_member_general', label: '성인회원(일반)' },
  { value: 'guardian', label: '학부모' },
  { value: 'admin', label: '관리자' },
  { value: 'instructor', label: '강사' },
]

function parseRoleSelect(value: RoleSelectValue): {
  role: SettingsAssignableRole
  adultProgram: AdultMemberProgram | null
} {
  const adultProgram = adultProgramFromRoleSelect(value)
  if (adultProgram) {
    return { role: 'adult_member', adultProgram }
  }
  return { role: value as SettingsAssignableRole, adultProgram: null }
}

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

interface HoldAccountsPanelProps {
  initialHold: PendingAccountRow[]
  instructors: InstructorRoleRow[]
  onChanged?: () => void | Promise<void>
}

export function HoldAccountsPanel({
  initialHold,
  instructors,
  onChanged,
}: HoldAccountsPanelProps) {
  const router = useRouter()
  const [rows, setRows] = useState(initialHold)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [approveRoleSelect, setApproveRoleSelect] =
    useState<RoleSelectValue>('member')
  const [instructorId, setInstructorId] = useState('')
  const [memberId, setMemberId] = useState('')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setRows(initialHold)
  }, [initialHold])

  const approveParsed = parseRoleSelect(approveRoleSelect)
  const approveRole = approveParsed.role
  const adultProgram = approveParsed.adultProgram

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((p) =>
      [p.full_name, p.email, p.loginEmail, p.roleLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, query])

  const selected = rows.find((p) => p.id === selectedId) ?? null

  const unlinkedInstructors = useMemo(
    () => instructors.filter((i) => i.is_active && !i.hasCoachAccess),
    [instructors],
  )

  async function refresh() {
    setRefreshing(true)
    try {
      setRows(await listOnHoldAccounts())
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
      adultProgram,
    )
    setBusy(false)

    if (result.error) {
      toast.error('승인 실패', { description: result.error })
      return
    }

    toast.success('보류 계정을 승인했습니다.')
    const approvedId = selected.id
    setSelectedId(null)
    setInstructorId('')
    setMemberId('')
    setRows((prev) => prev.filter((p) => p.id !== approvedId))
    await onChanged?.()
    router.refresh()
  }

  async function handleRestorePending() {
    if (!selected) return
    setBusy(true)
    const result = await restoreAccountToPending(selected.id)
    setBusy(false)
    if (result.error) {
      toast.error('되돌리기 실패', { description: result.error })
      return
    }
    toast.success('승인 대기로 이동했습니다.')
    const id = selected.id
    setSelectedId(null)
    setRows((prev) => prev.filter((p) => p.id !== id))
    await onChanged?.()
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
    toast.success('가입을 거절했습니다.')
    const id = selected.id
    setSelectedId(null)
    setRows((prev) => prev.filter((p) => p.id !== id))
    await onChanged?.()
    router.refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <PauseCircle className="h-5 w-5 text-amber-500" />
            보류
          </CardTitle>
          <CardDescription>
            일시 정지·보류된 계정입니다. 로그인할 수 없으며, 승인하면 다시
            이용할 수 있습니다.
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
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead className="hidden sm:table-cell">권한</TableHead>
                  <TableHead className="hidden md:table-cell">등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      보류 계정이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer"
                      data-state={selectedId === row.id ? 'selected' : undefined}
                      onClick={() => {
                        setSelectedId(row.id)
                        setMemberId(row.signupMemberId ?? '')
                      }}
                    >
                      <TableCell className="font-medium">
                        {row.full_name || '—'}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate text-muted-foreground">
                        {row.email || row.loginEmail}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {row.roleLabel}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
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
              {refreshing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              새로고침
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">보류 처리</CardTitle>
          <CardDescription>
            승인하면 바로 로그인할 수 있습니다. 승인 대기로 되돌릴 수도
            있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              왼쪽에서 보류 계정을 선택하세요.
            </p>
          ) : (
            <>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">{selected.full_name || '이름 없음'}</p>
                <p className="truncate text-muted-foreground">
                  {selected.email || selected.loginEmail}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">부여할 권한</label>
                <Select
                  value={approveRoleSelect}
                  onValueChange={(v) => {
                    const next = v as RoleSelectValue
                    setApproveRoleSelect(next)
                    const parsed = parseRoleSelect(next)
                    if (parsed.role !== 'instructor') setInstructorId('')
                    if (!requiresMemberLinkRole(parsed.role)) setMemberId('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_SELECT_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {requiresMemberLinkRole(approveRole) ? (
                <AccountMemberLinkSelect
                  accountUserId={selected.id}
                  value={memberId}
                  onValueChange={setMemberId}
                />
              ) : null}

              {approveRole === 'instructor' ? (
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
              ) : null}

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
                variant="outline"
                className="w-full"
                disabled={busy}
                onClick={() => void handleRestorePending()}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                승인 대기로
              </Button>

              <Button
                type="button"
                variant="destructive"
                className="w-full"
                disabled={busy}
                onClick={() => void handleReject()}
              >
                <X className="mr-2 h-4 w-4" />
                거절
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
