'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Search, UserCog } from 'lucide-react'
import { toast } from 'sonner'
import { grantAccountAccess } from '@/lib/actions/auth-registration'
import {
  listInstructorsForSettings,
  listRegisteredAccountsResult,
} from '@/lib/actions/settings-accounts'
import type {
  InstructorRoleRow,
  RegisteredAccount,
  SettingsAssignableRole,
} from '@/lib/settings-accounts-types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'

const GRANT_ROLES: { value: SettingsAssignableRole; label: string }[] = [
  { value: 'member', label: '회원' },
  { value: 'adult_member', label: '성인회원' },
  { value: 'guardian', label: '학부모' },
  { value: 'instructor', label: '강사' },
]

function accountMatchesQuery(account: RegisteredAccount, q: string): boolean {
  if (!q) return true
  const tokens = q.split(/\s+/).filter(Boolean)
  const hay = [
    account.email,
    account.loginEmail,
    account.full_name,
    account.roleLabel,
    account.approvalLabel,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return tokens.every((t) => hay.includes(t))
}

function formatAccountContact(account: RegisteredAccount): string {
  if (account.email) return account.email
  if (account.loginEmail) return `로그인 ID: ${account.loginEmail}`
  return '이메일 없음'
}

interface InstructorRolePanelProps {
  initialInstructors: InstructorRoleRow[]
  linkableAccounts: RegisteredAccount[]
  onAccessChanged?: () => void | Promise<void>
}

export function InstructorRolePanel({
  initialInstructors,
  linkableAccounts,
  onAccessChanged,
}: InstructorRolePanelProps) {
  const router = useRouter()
  const grantPanelRef = useRef<HTMLDivElement>(null)
  const [instructors, setInstructors] = useState(initialInstructors)
  const [accounts, setAccounts] = useState(
    linkableAccounts.filter((a) => !a.isProtected),
  )
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [instructorQuery, setInstructorQuery] = useState('')
  const [accountQuery, setAccountQuery] = useState('')
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(
    null,
  )
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [grantRole, setGrantRole] = useState<SettingsAssignableRole>('instructor')
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setAccounts(linkableAccounts.filter((a) => !a.isProtected))
  }, [linkableAccounts])

  async function loadAccounts() {
    setAccountsLoading(true)
    try {
      const { accounts, error } = await listRegisteredAccountsResult()
      if (error) {
        toast.error('가입 계정 목록을 불러오지 못했습니다.', {
          description: error,
          duration: 12000,
        })
        setAccounts([])
        return
      }
      setAccounts(accounts.filter((a) => !a.isProtected))
    } catch {
      toast.error('가입 계정 목록을 불러오지 못했습니다.')
    } finally {
      setAccountsLoading(false)
    }
  }

  useEffect(() => {
    void loadAccounts()
  }, [])

  const filteredInstructors = useMemo(() => {
    const q = instructorQuery.trim().toLowerCase()
    if (!q) return instructors
    return instructors.filter((row) => {
      const hay = [row.name, row.phone, row.accountEmail, row.accountName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [instructors, instructorQuery])

  const filteredAccounts = useMemo(() => {
    const q = accountQuery.trim().toLowerCase()
    return accounts.filter((a) => accountMatchesQuery(a, q))
  }, [accounts, accountQuery])

  const selectedInstructor =
    instructors.find((i) => i.id === selectedInstructorId) ?? null

  const selectedAccount =
    accounts.find((a) => a.id === selectedAccountId) ?? null

  function selectInstructor(row: InstructorRoleRow) {
    setSelectedInstructorId(row.id)
    setGrantRole('instructor')
    setAccountQuery('')

    if (row.user_id) {
      setSelectedAccountId(row.user_id)
    } else {
      const nameMatch = accounts.find(
        (a) => a.full_name?.trim() === row.name.trim(),
      )
      setSelectedAccountId(nameMatch?.id ?? null)
    }
  }

  useEffect(() => {
    if (!selectedInstructorId) return
    grantPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedInstructorId])

  function selectAccount(account: RegisteredAccount) {
    setSelectedAccountId(account.id)
    if (selectedInstructor) {
      setGrantRole('instructor')
    } else if (account.appRole === 'guardian') {
      setGrantRole('guardian')
    } else if (account.appRole === 'instructor') {
      setGrantRole('instructor')
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const [inst, accResult] = await Promise.all([
        listInstructorsForSettings(),
        listRegisteredAccountsResult(),
      ])
      setInstructors(inst)
      if (accResult.error) {
        toast.error('가입 계정 목록을 불러오지 못했습니다.', {
          description: accResult.error,
        })
      } else {
        setAccounts(accResult.accounts.filter((a) => !a.isProtected))
      }
    } catch {
      toast.error('목록을 불러오지 못했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleGrantAccess() {
    if (!selectedInstructor) {
      toast.error('왼쪽에서 강사를 선택하세요.')
      return
    }
    if (!selectedAccount) {
      toast.error('연결할 가입 계정을 선택하세요.')
      return
    }

    setBusy(true)
    const result = await grantAccountAccess(
      selectedAccount.id,
      grantRole,
      grantRole === 'instructor' ? selectedInstructor.id : null,
    )
    setBusy(false)

    if (result.error) {
      toast.error('권한 부여 실패', { description: result.error })
      return
    }

    const loginHint = result.loginEmail
      ? `로그인: ${result.loginEmail}`
      : '이메일 없음 — 발급된 로그인 ID를 안내해주세요.'

    toast.success('권한이 부여되었습니다.', { description: loginHint, duration: 10000 })

    await handleRefresh()
    await onAccessChanged?.()
    router.refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <UserCog className="h-5 w-5" />
            강사 목록
          </CardTitle>
          <CardDescription>
            강사를 클릭하면 오른쪽에 권한 설정이 열립니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="강사 이름·전화 검색"
              value={instructorQuery}
              onChange={(e) => setInstructorQuery(e.target.value)}
              className="pl-8"
            />
          </div>

          <div className="rounded-md border max-h-[min(60vh,480px)] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>강사</TableHead>
                  <TableHead>연결</TableHead>
                  <TableHead>권한</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInstructors.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground py-8"
                    >
                      강사가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInstructors.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={
                        selectedInstructorId === row.id ? 'selected' : undefined
                      }
                      className="cursor-pointer"
                      onClick={() => selectInstructor(row)}
                    >
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.user_id
                          ? row.accountEmail || row.accountName || '연결됨'
                          : '미연결'}
                      </TableCell>
                      <TableCell>
                        {row.hasCoachAccess ? (
                          <Badge variant="secondary">강사</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
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
              onClick={() => void handleRefresh()}
            >
              {refreshing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              새로고침
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card
        ref={grantPanelRef}
        className={cn(
          'h-fit lg:sticky lg:top-4 transition-all',
          selectedInstructor
            ? 'ring-2 ring-primary/40 shadow-md'
            : 'opacity-80',
        )}
      >
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">권한 설정</CardTitle>
          <CardDescription>
            {selectedInstructor
              ? `${selectedInstructor.name} 강사에 연결할 계정과 권한을 정하세요.`
              : '왼쪽 목록에서 강사를 클릭하세요.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selectedInstructor ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              강사를 클릭하면
              <br />
              여기서 권한을 설정할 수 있습니다.
            </p>
          ) : (
            <>
              <div className="rounded-md border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
                <p className="text-xs text-muted-foreground">선택한 강사</p>
                <p className="font-medium text-base">{selectedInstructor.name}</p>
                {selectedInstructor.phone && (
                  <p className="text-muted-foreground text-xs">
                    {selectedInstructor.phone}
                  </p>
                )}
                {selectedInstructor.user_id && (
                  <p className="text-xs text-muted-foreground mt-1">
                    현재 연결:{' '}
                    {selectedInstructor.accountEmail ||
                      selectedInstructor.accountName ||
                      '—'}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">연결할 가입 계정</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="이름·이메일·로그인 ID"
                    value={accountQuery}
                    onChange={(e) => setAccountQuery(e.target.value)}
                    className="pl-8 h-9 text-sm"
                  />
                </div>

                <div className="rounded-md border max-h-[180px] overflow-y-auto">
                  <Table>
                    <TableBody>
                      {accountsLoading ? (
                        <TableRow>
                          <TableCell className="text-center py-6">
                            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : filteredAccounts.length === 0 ? (
                        <TableRow>
                          <TableCell className="text-center text-muted-foreground py-6 text-sm">
                            {accounts.length === 0
                              ? '가입 계정 없음'
                              : '검색 결과 없음'}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredAccounts.map((row) => (
                          <TableRow
                            key={row.id}
                            data-state={
                              selectedAccountId === row.id ? 'selected' : undefined
                            }
                            className="cursor-pointer"
                            onClick={() => selectAccount(row)}
                          >
                            <TableCell className="py-2">
                              <span className="font-medium block text-sm">
                                {row.full_name || '—'}
                              </span>
                              <span className="text-[11px] text-muted-foreground block truncate max-w-[240px]">
                                {row.email || row.loginEmail || '이메일 없음'}
                              </span>
                              <Badge
                                variant="outline"
                                className="mt-1 text-[10px] px-1 py-0"
                              >
                                {row.approvalLabel}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {selectedAccount ? (
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <p className="text-xs text-muted-foreground">선택한 계정</p>
                  <p className="font-medium">
                    {selectedAccount.full_name || '이름 없음'}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {formatAccountContact(selectedAccount)}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-amber-600 text-center">
                  아래 목록에서 계정을 클릭해 선택하세요.
                </p>
              )}

              <div className="space-y-1.5">
                <label className="text-sm font-medium">부여할 권한</label>
                <Select
                  value={grantRole}
                  onValueChange={(v) =>
                    setGrantRole(v as SettingsAssignableRole)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRANT_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  강사 권한은 위에서 선택한 강사 프로필과 연결됩니다.
                </p>
              </div>

              <Button
                type="button"
                className="w-full"
                disabled={busy || !selectedAccount}
                onClick={() => void handleGrantAccess()}
              >
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                권한 부여
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
