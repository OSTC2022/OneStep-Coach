'use client'

import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { listPendingAccounts } from '@/lib/actions/auth-registration'
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

const ASSIGNABLE_ROLES: {
  value: SettingsAssignableRole
  label: string
}[] = [
  { value: 'member', label: '회원' },
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

function appRoleToAssignable(account: RegisteredAccount): SettingsAssignableRole | null {
  if (account.isProtected) return null
  if (account.appRole === 'instructor') return 'instructor'
  if (account.appRole === 'guardian') return 'guardian'
  if (account.appRole === 'admin') return 'admin'
  return 'member'
}

interface AccountRoleManagementProps {
  initialAccounts: RegisteredAccount[]
  initialInstructors: InstructorRoleRow[]
  initialPending: PendingAccountRow[]
}

export function AccountRoleManagement({
  initialAccounts,
  initialInstructors,
  initialPending,
}: AccountRoleManagementProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('pending')
  const [accounts, setAccounts] = useState(initialAccounts)
  const [pending, setPending] = useState(initialPending)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [pendingRole, setPendingRole] = useState<SettingsAssignableRole>('member')
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

  async function refreshAccountLists() {
    const [acc, pend] = await Promise.all([
      listRegisteredAccounts(),
      listPendingAccounts(),
    ])
    setAccounts(acc)
    setPending(pend)
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accounts
    return accounts.filter((a) => {
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
  }, [accounts, query])

  const selected = accounts.find((a) => a.id === selectedId) ?? null
  const selectedAssignable = selected ? appRoleToAssignable(selected) : null

  function selectAccount(account: RegisteredAccount) {
    setSelectedId(account.id)
    const assignable = appRoleToAssignable(account)
    if (assignable) setPendingRole(assignable)
    setMemberId(account.linkedMemberId ?? '')
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const data = await listRegisteredAccounts()
      setAccounts(data)
    } catch {
      toast.error('계정 목록을 불러오지 못했습니다.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleSaveRole() {
    if (!selected || selectedAssignable === null) return

    if (
      pendingRole === 'member' &&
      !memberId &&
      !selected.linkedMemberId
    ) {
      toast.error('연결할 센터 회원을 선택해주세요.')
      return
    }

    setSaving(true)
    const result = await updateAccountRole(selected.id, pendingRole, {
      memberId: pendingRole === 'member' ? memberId || selected.linkedMemberId : null,
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

    toast.success(
      pendingRole === 'member' ? '회원 연결이 저장되었습니다.' : '권한이 변경되었습니다.',
      {
        description:
          pendingRole === 'member' && updated?.linkedMemberName
            ? `${selected.full_name || selected.email} → ${updated.linkedMemberName}`
            : `${selected.full_name || selected.email} → ${
                ASSIGNABLE_ROLES.find((r) => r.value === pendingRole)?.label
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

          <div className="rounded-md border">
            <Table>
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
                      <TableCell className="font-medium">
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
                      <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate">
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
          ) : selectedAssignable === null ? (
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
                  value={pendingRole}
                  onValueChange={(v) => {
                    setPendingRole(v as SettingsAssignableRole)
                    if (v !== 'member') setMemberId('')
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  강사: 캘린더·수업·출석 메뉴 · 학부모: 마이페이지(보호자) · 회원: 일반
                  회원 마이페이지
                </p>
              </div>

              {pendingRole === 'member' ? (
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
                  (pendingRole === selectedAssignable && pendingRole !== 'member')
                }
                onClick={() => void handleSaveRole()}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중…
                  </>
                ) : pendingRole === 'member' ? (
                  '회원 연결 · 권한 저장'
                ) : (
                  '권한 저장'
                )}
              </Button>

              {selected.appRole !== 'member' && (
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

              {accountDangerActions}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const pendingCount = pending.length

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
      <TabsList className="w-full max-w-2xl grid grid-cols-2 sm:grid-cols-4 h-auto">
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
      </TabsList>
      <TabsContent value="pending" className="mt-4">
        <PendingApprovalsPanel
          initialPending={pending}
          instructors={initialInstructors}
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
    </Tabs>
  )
}
