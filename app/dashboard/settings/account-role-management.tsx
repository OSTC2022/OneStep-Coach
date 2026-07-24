'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { listPendingAccounts, listOnHoldAccounts, putAccountOnHold } from '@/lib/actions/auth-registration'
import { HoldAccountsPanel } from '@/components/settings/hold-accounts-panel'
import { useRouter } from 'next/navigation'
import { Loader2, Search, Shield, Trash2, UserMinus, Ban } from 'lucide-react'
import { toast } from 'sonner'
import {
  deleteAccount,
  listRegisteredAccounts,
  revokeAccountApproval,
  revokeAccountRole,
  updateAccountRole,
} from '@/lib/actions/settings-accounts'
import type {
  RegisteredAccount,
  SettingsAssignableRole,
} from '@/lib/settings-accounts-types'
import { requiresMemberLinkRole } from '@/lib/settings-accounts-types'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { InstructorRolePanel } from './instructor-role-panel'
import { PendingApprovalsPanel } from './pending-approvals-panel'
import { AdminCreateAccountPanel } from './admin-create-account-panel'
import { AccountMemberLinkSelect } from '@/components/settings/account-member-link-select'
import type { PendingAccountRow } from '@/lib/actions/auth-registration'
import type { InstructorRoleRow } from '@/lib/settings-accounts-types'
import {
  adultProgramDisplayLabel,
  adultProgramFromRoleSelect,
  resolveAdultMemberProgram,
  roleSelectFromAdultProgram,
  type AdultMemberProgram,
} from '@/lib/adult-member-programs'

/** 설정 UI 권한 셀렉트 — 성인회원은 육상/일반로 분리 표시 */
type RoleSelectValue =
  | SettingsAssignableRole
  | 'adult_member_athletics'
  | 'adult_member_general'
  | 'on_hold'

const ROLE_SELECT_OPTIONS: { value: RoleSelectValue; label: string }[] = [
  { value: 'member', label: '회원' },
  { value: 'adult_member_athletics', label: '성인회원(육상)' },
  { value: 'adult_member_general', label: '성인회원(일반)' },
  { value: 'guardian', label: '학부모' },
  { value: 'admin', label: '관리자' },
  { value: 'instructor', label: '강사' },
  { value: 'on_hold', label: '보류' },
]

function parseRoleSelect(value: RoleSelectValue): {
  role: SettingsAssignableRole | null
  adultProgram: AdultMemberProgram | null
  onHold: boolean
} {
  if (value === 'on_hold') {
    return { role: null, adultProgram: null, onHold: true }
  }
  const adultProgram = adultProgramFromRoleSelect(value)
  if (adultProgram) {
    return { role: 'adult_member', adultProgram, onHold: false }
  }
  return {
    role: value as SettingsAssignableRole,
    adultProgram: null,
    onHold: false,
  }
}

function accountToRoleSelect(account: RegisteredAccount): RoleSelectValue | null {
  if (account.isProtected) return null
  if (account.appRole === 'instructor') return 'instructor'
  if (account.appRole === 'guardian') return 'guardian'
  if (account.appRole === 'admin') return 'admin'
  if (account.appRole === 'adult_member') {
    return roleSelectFromAdultProgram(
      resolveAdultMemberProgram(account.linkedMemberSport),
    )
  }
  return 'member'
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  } catch {
    return iso
  }
}

function LinkedMemberName({
  memberId,
  name,
  className,
  onClick,
}: {
  memberId: string | null | undefined
  name: string
  className?: string
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  if (!memberId) {
    return <span className={className}>{name}</span>
  }

  return (
    <Link
      href={`/dashboard/members/${memberId}`}
      className={`text-primary hover:underline ${className ?? ''}`}
      onClick={onClick}
    >
      {name}
    </Link>
  )
}

function AccountDisplayName({
  account,
  className,
  onClick,
  fallback = '—',
}: {
  account: RegisteredAccount
  className?: string
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void
  fallback?: string
}) {
  const label = account.full_name || fallback
  if (!account.linkedMemberId) {
    return <span className={className}>{label}</span>
  }

  return (
    <LinkedMemberName
      memberId={account.linkedMemberId}
      name={label}
      className={className}
      onClick={onClick}
    />
  )
}

interface AccountRoleManagementProps {
  initialAccounts: RegisteredAccount[]
  initialInstructors: InstructorRoleRow[]
  initialPending: PendingAccountRow[]
  initialHold: PendingAccountRow[]
}

export function AccountRoleManagement({
  initialAccounts,
  initialInstructors,
  initialPending,
  initialHold,
}: AccountRoleManagementProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('pending')
  const [accounts, setAccounts] = useState(initialAccounts)
  const [pending, setPending] = useState(initialPending)
  const [hold, setHold] = useState(initialHold)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingRoleSelect, setPendingRoleSelect] =
    useState<RoleSelectValue>('member')
  const [memberId, setMemberId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    setAccounts(initialAccounts)
  }, [initialAccounts])

  useEffect(() => {
    setPending(initialPending)
  }, [initialPending])

  useEffect(() => {
    setHold(initialHold)
  }, [initialHold])

  async function refreshAccountLists() {
    const [acc, pend, held] = await Promise.all([
      listRegisteredAccounts(),
      listPendingAccounts(),
      listOnHoldAccounts(),
    ])
    setAccounts(acc)
    setPending(pend)
    setHold(held)
    router.refresh()
  }

  async function handleRevokeRole() {
    if (!selected) return
    setActionBusy(true)
    const result = await revokeAccountRole(selected.id)
    setActionBusy(false)
    if (result.error) {
      toast.error('권한 해제 실패', { description: result.error })
      return
    }
    toast.success('권한이 회원으로 변경되었습니다.')
    setSelectedId(null)
    await refreshAccountLists()
  }

  async function handleRevokeApproval() {
    if (!selected) return
    setActionBusy(true)
    const result = await revokeAccountApproval(selected.id)
    setActionBusy(false)
    if (result.error) {
      toast.error('승인 취소 실패', { description: result.error })
      return
    }
    toast.success('승인이 취소되었습니다. 다시 승인하기 전까지 로그인할 수 없습니다.')
    setSelectedId(null)
    await refreshAccountLists()
    setActiveTab('pending')
  }

  async function handleDeleteAccount() {
    if (!selected) return
    setActionBusy(true)
    const result = await deleteAccount(selected.id)
    setActionBusy(false)
    if (result.error) {
      toast.error('계정 삭제 실패', { description: result.error })
      return
    }
    toast.success('계정이 삭제되었습니다.')
    setSelectedId(null)
    await refreshAccountLists()
  }

  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.approvalStatus !== 'on_hold'),
    [accounts],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return activeAccounts
    return activeAccounts.filter((a) => {
      const hay = [
        a.email,
        a.loginEmail,
        a.full_name,
        a.roleLabel,
        a.linkedInstructorName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [activeAccounts, query])

  const selected = activeAccounts.find((a) => a.id === selectedId) ?? null
  const selectedRoleSelect = selected ? accountToRoleSelect(selected) : null
  const pendingParsed = parseRoleSelect(pendingRoleSelect)
  const pendingRole = pendingParsed.role
  const adultProgram = pendingParsed.adultProgram
  const isOnHoldAction = pendingParsed.onHold

  function selectAccount(account: RegisteredAccount) {
    setSelectedId(account.id)
    const roleSelect = accountToRoleSelect(account)
    if (roleSelect) setPendingRoleSelect(roleSelect)
    setMemberId(account.linkedMemberId ?? '')
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refreshAccountLists()
    } catch {
      toast.error('계정 목록을 불러오지 못했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleSaveRole() {
    if (!selected || selectedRoleSelect === null) return

    if (isOnHoldAction) {
      setSaving(true)
      const result = await putAccountOnHold(selected.id)
      setSaving(false)
      if (result.error) {
        toast.error('보류 실패', { description: result.error })
        return
      }
      toast.success('보류로 이동했습니다.', {
        description: '로그인 시 회원가입 대기중으로 안내됩니다.',
      })
      setSelectedId(null)
      await refreshAccountLists()
      setActiveTab('hold')
      return
    }

    if (!pendingRole) return

    if (
      requiresMemberLinkRole(pendingRole) &&
      !memberId &&
      !selected.linkedMemberId
    ) {
      toast.error('연결할 센터 회원을 선택해주세요.')
      return
    }

    setSaving(true)
    const result = await updateAccountRole(selected.id, pendingRole, {
      memberId: requiresMemberLinkRole(pendingRole)
        ? memberId || selected.linkedMemberId
        : null,
      adultProgram,
    })
    setSaving(false)

    if (result.error) {
      toast.error('권한 변경 실패', { description: result.error })
      return
    }

    const refreshed = await listRegisteredAccounts()
    setAccounts(refreshed)
    const updated = refreshed.find((a) => a.id === selected.id)
    if (updated?.linkedMemberId) {
      setMemberId(updated.linkedMemberId)
    }
    if (updated) {
      const nextSelect = accountToRoleSelect(updated)
      if (nextSelect) setPendingRoleSelect(nextSelect)
    }

    const adultLabel = adultProgram
      ? adultProgramDisplayLabel(adultProgram)
      : null

    toast.success(
      pendingRole === 'adult_member' && adultLabel
        ? `${adultLabel} 권한이 저장되었습니다.`
        : requiresMemberLinkRole(pendingRole)
          ? '회원 연결이 저장되었습니다.'
          : '권한이 변경되었습니다.',
      {
        description:
          pendingRole === 'adult_member' && adultLabel
            ? `${selected.full_name || selected.email} → ${adultLabel}${
                updated?.linkedMemberName ? ` (${updated.linkedMemberName})` : ''
              }`
            : requiresMemberLinkRole(pendingRole) && updated?.linkedMemberName
              ? `${selected.full_name || selected.email} → ${updated.linkedMemberName}`
              : `${selected.full_name || selected.email} → ${
                  ROLE_SELECT_OPTIONS.find((r) => r.value === pendingRoleSelect)
                    ?.label
                }`,
      },
    )
    router.refresh()
  }

  const accountDangerActions = selected ? (
    <div className="space-y-2 pt-2 border-t">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={actionBusy}
        onClick={() => void handleRevokeApproval()}
      >
        {actionBusy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Ban className="mr-2 h-4 w-4" />
        )}
        승인 취소 (접속 차단)
      </Button>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            disabled={actionBusy}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            계정 삭제
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>계정을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {selected.full_name || selected.email || '이 계정'}의 로그인 정보가
              완전히 삭제됩니다. 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDeleteAccount()}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  ) : null

  const accountsPanel = (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">가입 계정</CardTitle>
          <CardDescription>
            모든 가입·생성 계정 목록입니다. 승인 전에는 가입 승인 탭에서
            처리하세요.
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
                  <TableHead>권한</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="hidden sm:table-cell">가입일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      표시할 계정이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((account) => (
                    <TableRow
                      key={account.id}
                      data-state={selectedId === account.id ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => selectAccount(account)}
                    >
                      <TableCell className="max-w-0 truncate font-medium">
                        <AccountDisplayName
                          account={account}
                          className="font-medium"
                          onClick={(event) => event.stopPropagation()}
                          fallback="—"
                        />
                        {account.linkedInstructorName && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            강사: {account.linkedInstructorName}
                          </span>
                        )}
                        {account.linkedMemberName && (
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            회원:{' '}
                            <LinkedMemberName
                              memberId={account.linkedMemberId}
                              name={account.linkedMemberName}
                              onClick={(event) => event.stopPropagation()}
                            />
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-0 truncate text-sm text-muted-foreground">
                        {account.email || account.loginEmail || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={account.isProtected ? 'default' : 'secondary'}
                        >
                          {account.isProtected && (
                            <Shield className="mr-1 h-3 w-3" />
                          )}
                          {account.roleLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            account.approvalStatus === 'approved'
                              ? 'outline'
                              : account.approvalStatus === 'pending'
                                ? 'secondary'
                                : 'destructive'
                          }
                        >
                          {account.approvalLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground tabular-nums">
                        {formatDate(account.created_at)}
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

      <Card className="h-fit lg:sticky lg:top-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">권한 부여</CardTitle>
          <CardDescription>
            승인된 계정만 권한을 변경할 수 있습니다. 승인 취소·삭제도 여기서 할 수
            있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!selected ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              왼쪽 목록에서 계정을 선택하세요.
            </p>
          ) : selectedRoleSelect === null ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {selected.isProtected
                ? '시스템 관리자 계정은 권한을 변경할 수 없습니다.'
                : '관리자 계정은 이 화면에서 권한을 변경할 수 없습니다.'}
            </p>
          ) : selected.approvalStatus !== 'approved' ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">
                  <AccountDisplayName
                    account={selected}
                    className="font-medium"
                    fallback="이름 없음"
                  />
                </p>
                <p className="text-muted-foreground truncate">
                  {selected.email || selected.loginEmail}
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  상태: {selected.approvalLabel} — 가입 승인 탭에서 승인해주세요.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => setActiveTab('pending')}
              >
                가입 승인 탭으로 이동
              </Button>
              {accountDangerActions}
            </div>
          ) : (
            <>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <p className="font-medium">
                  <AccountDisplayName
                    account={selected}
                    className="font-medium"
                    fallback="이름 없음"
                  />
                </p>
                <p className="text-muted-foreground truncate">
                  {selected.email || selected.loginEmail}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  현재: {selected.roleLabel} · {selected.approvalLabel}
                  {selected.linkedMemberName ? (
                    <>
                      {' · 회원: '}
                      <LinkedMemberName
                        memberId={selected.linkedMemberId}
                        name={selected.linkedMemberName}
                        className="text-xs"
                      />
                    </>
                  ) : null}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">변경할 권한</label>
                <Select
                  value={pendingRoleSelect}
                  onValueChange={(v) => {
                    const next = v as RoleSelectValue
                    setPendingRoleSelect(next)
                    const parsed = parseRoleSelect(next)
                    if (
                      parsed.onHold ||
                      !parsed.role ||
                      !requiresMemberLinkRole(parsed.role)
                    ) {
                      setMemberId('')
                    }
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
                <p className="text-[11px] text-muted-foreground">
                  {isOnHoldAction
                    ? '보류로 보내면 가입 계정 목록에서 빠지고, 로그인 시 「회원가입 대기중」으로 안내됩니다.'
                    : '성인회원(육상): 러닝·육상 포털 · 성인회원(일반): 체중 관리 포털 · 회원: 일반 마이페이지 · 학부모: 보호자 · 강사: 캘린더·출석'}
                </p>
              </div>

              {!isOnHoldAction &&
              pendingRole &&
              requiresMemberLinkRole(pendingRole) ? (
                <AccountMemberLinkSelect
                  accountUserId={selected.id}
                  value={memberId}
                  onValueChange={setMemberId}
                />
              ) : null}

              <Button
                type="button"
                className="w-full"
                disabled={
                  saving ||
                  (!isOnHoldAction &&
                    pendingRoleSelect === selectedRoleSelect &&
                    !(pendingRole && requiresMemberLinkRole(pendingRole)))
                }
                onClick={() => void handleSaveRole()}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중…
                  </>
                ) : isOnHoldAction ? (
                  '보류로 이동'
                ) : pendingRole && requiresMemberLinkRole(pendingRole) ? (
                  '회원 연결 · 권한 저장'
                ) : (
                  '권한 저장'
                )}
              </Button>

              {!isOnHoldAction &&
                selected.appRole !== 'member' &&
                selected.appRole !== 'adult_member' && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={actionBusy}
                  onClick={() => void handleRevokeRole()}
                >
                  {actionBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <UserMinus className="mr-2 h-4 w-4" />
                  )}
                  권한 해제 (회원으로)
                </Button>
              )}

              {!isOnHoldAction ? accountDangerActions : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const pendingCount = pending.length
  const holdCount = hold.length

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
      <TabsList className="w-full max-w-3xl grid grid-cols-2 sm:grid-cols-5 h-auto">
        <TabsTrigger value="pending" className="text-xs sm:text-sm">
          가입 승인
          {pendingCount > 0 ? ` (${pendingCount})` : ''}
        </TabsTrigger>
        <TabsTrigger value="create" className="text-xs sm:text-sm">
          계정 만들기
        </TabsTrigger>
        <TabsTrigger value="instructors" className="text-xs sm:text-sm">
          강사
        </TabsTrigger>
        <TabsTrigger value="accounts" className="text-xs sm:text-sm">
          가입 계정
        </TabsTrigger>
        <TabsTrigger value="hold" className="text-xs sm:text-sm">
          보류
          {holdCount > 0 ? ` (${holdCount})` : ''}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pending" className="mt-4">
        <PendingApprovalsPanel
          initialPending={pending}
          instructors={initialInstructors}
          onChanged={async () => {
            await refreshAccountLists()
          }}
          onMovedToHold={async () => {
            await refreshAccountLists()
            setActiveTab('hold')
          }}
        />
      </TabsContent>
      <TabsContent value="create" className="mt-4">
        <AdminCreateAccountPanel
          instructors={initialInstructors}
          onAccountCreated={async () => {
            await refreshAccountLists()
            setActiveTab('pending')
          }}
        />
      </TabsContent>
      <TabsContent value="instructors" className="mt-4">
        <InstructorRolePanel
          initialInstructors={initialInstructors}
          linkableAccounts={accounts.filter((a) => !a.isProtected)}
          onAccessChanged={() => void refreshAccountLists()}
        />
      </TabsContent>
      <TabsContent value="accounts" className="mt-4">
        {accountsPanel}
      </TabsContent>
      <TabsContent value="hold" className="mt-4">
        <HoldAccountsPanel
          initialHold={hold}
          instructors={initialInstructors}
          onChanged={async () => {
            await refreshAccountLists()
          }}
        />
      </TabsContent>
    </Tabs>
  )
}
