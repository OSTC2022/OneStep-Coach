'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, CreditCard, AlertTriangle, TrendingUp, Edit, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import {
  adjustPriceForPaymentMethod,
  formatPackagePlanLabel,
  getPresetPrice,
  isMonthlyPlanPackage,
  isPackageUsableForLesson,
  isSessionPackageOverage,
} from '@/lib/session-package-utils'
import { GroupedPackageUsageDisplay } from '@/components/sessions/grouped-package-usage-display'
import {
  deleteSessionPackage,
  getSessionPackagesPage,
  updateSessionPackage,
  type SessionPackageListOrderBy,
} from '@/lib/actions/sessions'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import {
  flattenGroupedSessionPackages,
  groupSessionPackagesForDisplay,
} from '@/lib/session-package-grouping'
import { cn } from '@/lib/utils'
import { RecentLessonSortIcon } from '@/components/dashboard/recent-lesson-sort-icon'
import { SessionPackageTrashSheet } from '@/app/dashboard/members/[id]/session-package-trash-sheet'

function formatPackageDate(value: string | null | undefined) {
  if (!value) return '-'
  return value.split('T')[0]
}

interface SessionPackage {
  id: string
  member_id: string
  total_sessions: number
  remaining_sessions: number
  price: number | null
  paid_at: string | null
  expires_at: string | null
  payment_method: string | null
  note: string | null
  is_active: boolean
  created_at: string
  deleted_at?: string | null
  member: {
    id: string
    name: string
    phone: string | null
    deleted_at?: string | null
  } | null
}

function isMemberDeleted(member: SessionPackage['member']) {
  return Boolean(member?.deleted_at)
}

interface SessionsListProps {
  initialPackages: SessionPackage[]
  totalCount: number
  monthlyRevenue: number
  pageSize?: number
  members: { id: string; name: string }[]
  selectedMemberId?: string
  initialOrderBy?: SessionPackageListOrderBy
  initialTrashCount?: number
}

function formatRevenueMan(value: number) {
  if (value >= 10000) {
    return `${Math.round(value / 10000)}만원`
  }
  return `${value.toLocaleString()}원`
}

export function SessionsList({
  initialPackages,
  totalCount,
  monthlyRevenue,
  pageSize = LIST_PAGE_SIZE,
  members,
  selectedMemberId,
  initialOrderBy = 'created_at',
  initialTrashCount = 0,
}: SessionsListProps) {
  const router = useRouter()
  const [packages, setPackages] = useState(initialPackages)
  const removedPackageIdsRef = useRef(new Set<string>())
  const [trashCount, setTrashCount] = useState(initialTrashCount)
  const [recentTrashItems, setRecentTrashItems] = useState<SessionPackage[]>([])
  const [listOrderBy, setListOrderBy] =
    useState<SessionPackageListOrderBy>(initialOrderBy)
  const [loadedCount, setLoadedCount] = useState(initialPackages.length)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(!!selectedMemberId)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [editTarget, setEditTarget] = useState<SessionPackage | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SessionPackage | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [editForm, setEditForm] = useState({
    total_sessions: 10,
    remaining_sessions: 10,
    price: '',
    paid_at: '',
    expires_at: '',
    payment_method: '카드',
    note: '',
  })
  const hasMore = loadedCount < totalCount

  useEffect(() => {
    setPackages(
      initialPackages.filter((pkg) => !removedPackageIdsRef.current.has(pkg.id)),
    )
    setLoadedCount(
      initialPackages.filter((pkg) => !removedPackageIdsRef.current.has(pkg.id)).length,
    )
    setListOrderBy(initialOrderBy)
  }, [initialPackages, initialOrderBy])

  useEffect(() => {
    setTrashCount(initialTrashCount)
  }, [initialTrashCount])

  async function handleRecentLessonSort() {
    if (listOrderBy === 'recent_lesson') return
    setLoadingMore(true)
    try {
      const { data } = await getSessionPackagesPage({
        memberId: selectedMemberId,
        limit: pageSize,
        offset: 0,
        orderBy: 'recent_lesson',
      })
      setPackages(data as SessionPackage[])
      setLoadedCount(data.length)
      setListOrderBy('recent_lesson')
      router.replace('/dashboard/sessions?sort=recent_lesson', { scroll: false })
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleLoadMore() {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const { data } = await getSessionPackagesPage({
        memberId: selectedMemberId,
        limit: pageSize,
        offset: loadedCount,
        orderBy: listOrderBy,
      })
      if (data.length > 0) {
        setPackages((prev) => {
          const ids = new Set(prev.map((p) => p.id))
          return [...prev, ...(data as SessionPackage[]).filter((p) => !ids.has(p.id))]
        })
        setLoadedCount((n) => n + data.length)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  const [formData, setFormData] = useState({
    member_id: selectedMemberId || '',
    total_sessions: 10,
    price: 0,
    paid_at: new Date().toISOString().split('T')[0],
    expires_at: '',
    payment_method: '카드',
    note: '',
  })

  const filteredPackages = packages.filter((pkg) => {
    const matchesSearch = pkg.member?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.member?.phone?.includes(searchTerm)
    
    const usable = isPackageUsableForLesson(pkg)
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && usable) ||
      (statusFilter === 'inactive' && !usable)
    
    return matchesSearch && matchesStatus
  })

  const groupedFilteredPackages = useMemo(
    () => groupSessionPackagesForDisplay(filteredPackages),
    [filteredPackages],
  )

  const primaryPackages = useMemo(
    () => flattenGroupedSessionPackages(groupSessionPackagesForDisplay(packages)),
    [packages],
  )

  // Stats
  const totalActivePackages = primaryPackages.filter((p) => isPackageUsableForLesson(p)).length
  const lowSessionPackages = primaryPackages.filter(
    (p) =>
      p.is_active &&
      !isMonthlyPlanPackage(p.note) &&
      p.remaining_sessions > 0 &&
      p.remaining_sessions <= 3,
  ).length
  const listedRevenue = packages.reduce((sum, p) => sum + (p.price || 0), 0)

  const handleAddPackage = async () => {
    if (!formData.member_id || formData.total_sessions <= 0) {
      toast.error('회원과 수업 횟수를 입력해주세요.')
      return
    }
    
    setIsLoading(true)
    const supabase = createClient()
    
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
      .select(`
        *,
        member:members(id, name, phone)
      `)
      .single()

    if (error) {
      toast.error('수업권 등록 실패', { description: error.message })
    } else if (data) {
      toast.success('수업권이 등록되었습니다.')
      setPackages([data, ...packages])
      setFormData({
        member_id: '',
        total_sessions: 10,
        price: 0,
        paid_at: new Date().toISOString().split('T')[0],
        expires_at: '',
        payment_method: '카드',
        note: '',
      })
      setIsAddDialogOpen(false)
    }
    
    setIsLoading(false)
    router.refresh()
  }

  const handleToggleStatus = async (pkg: SessionPackage) => {
    const nextActive = !pkg.is_active
    const result = await updateSessionPackage(pkg.id, { is_active: nextActive })
    if (result.error) {
      toast.error(nextActive ? '활성화 실패' : '비활성화 실패', { description: result.error })
      return
    }

    toast.success(nextActive ? '수업권이 활성화되었습니다.' : '수업권이 비활성화되었습니다.')
    setPackages((prev) =>
      prev.map((item) =>
        item.id === pkg.id ? { ...item, is_active: nextActive } : item,
      ),
    )
    router.refresh()
  }

  function openEditDialog(pkg: SessionPackage) {
    setEditTarget(pkg)
    setEditForm({
      total_sessions: pkg.total_sessions,
      remaining_sessions: pkg.remaining_sessions,
      price: pkg.price != null ? String(pkg.price) : '',
      paid_at: pkg.paid_at?.split('T')[0] ?? '',
      expires_at: pkg.expires_at?.split('T')[0] ?? '',
      payment_method: pkg.payment_method || '카드',
      note: pkg.note || '',
    })
  }

  async function handleSaveEdit() {
    if (!editTarget) return
    setIsLoading(true)

    const result = await updateSessionPackage(editTarget.id, {
      total_sessions: editForm.total_sessions,
      remaining_sessions: editForm.remaining_sessions,
      price: editForm.price ? Number(editForm.price) : undefined,
      paid_at: editForm.paid_at.trim() ? editForm.paid_at : null,
      expires_at: editForm.expires_at.trim() ? editForm.expires_at : null,
      payment_method: editForm.payment_method || undefined,
      note: editForm.note || undefined,
    })

    setIsLoading(false)
    if (result.error) {
      toast.error('수업권 수정 실패', { description: result.error })
      return
    }

    if (result.data) {
      setPackages((prev) =>
        prev.map((item) =>
          item.id === editTarget.id
            ? {
                ...item,
                total_sessions: result.data!.total_sessions,
                remaining_sessions: result.data!.remaining_sessions,
                price: result.data!.price,
                paid_at: result.data!.paid_at,
                expires_at: result.data!.expires_at,
                payment_method: result.data!.payment_method,
                note: result.data!.note,
              }
            : item,
        ),
      )
    }

    toast.success('수업권이 수정되었습니다.')
    setEditTarget(null)
    router.refresh()
  }

  async function handleDeletePackage() {
    if (!deleteTarget) return
    setDeleting(true)

    const result = await deleteSessionPackage(deleteTarget.id)
    setDeleting(false)

    if (result.error) {
      toast.error('삭제 실패', { description: result.error })
      return
    }

    removedPackageIdsRef.current.add(deleteTarget.id)
    const trashedPackage: SessionPackage = {
      ...deleteTarget,
      deleted_at: new Date().toISOString(),
    }
    setPackages((prev) => prev.filter((item) => item.id !== deleteTarget.id))
    setLoadedCount((count) => Math.max(0, count - 1))
    setRecentTrashItems((prev) => [
      trashedPackage,
      ...prev.filter((item) => item.id !== trashedPackage.id),
    ])
    setTrashCount((count) => count + 1)
    setDeleteTarget(null)
    toast.success('수업권이 휴지통으로 이동했습니다.')
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">활성 수업권</CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActivePackages}</div>
            <p className="text-xs text-muted-foreground">전체 {packages.length}개</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">만료 임박</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{lowSessionPackages}</div>
            <p className="text-xs text-muted-foreground">3회 이하 남음</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">이번 달 결제</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatRevenueMan(monthlyRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              목록 누적 {formatRevenueMan(listedRevenue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="회원명, 연락처 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="active">활성</SelectItem>
              <SelectItem value="inactive">완료/비활성</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SessionPackageTrashSheet
            initialCount={trashCount}
            recentTrashItems={recentTrashItems}
            showLabel
            onTrashCountChange={setTrashCount}
            onRestore={(pkg) => {
              removedPackageIdsRef.current.delete(pkg.id)
              setPackages((prev) => {
                const ids = new Set(prev.map((item) => item.id))
                if (ids.has(pkg.id)) return prev
                return [pkg as SessionPackage, ...prev]
              })
              setLoadedCount((count) => count + 1)
              setRecentTrashItems((prev) => prev.filter((item) => item.id !== pkg.id))
            }}
          />
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              수업권 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>수업권 등록</DialogTitle>
              <DialogDescription>
                회원의 새 수업권을 등록합니다.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="member">회원 선택 *</Label>
                <Select
                  value={formData.member_id}
                  onValueChange={(v) => setFormData({ ...formData, member_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="회원 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total_sessions">수업 횟수 *</Label>
                  <Select
                    value={formData.total_sessions.toString()}
                    onValueChange={(v) => {
                      const total_sessions = parseInt(v)
                      const presetPrice = getPresetPrice(total_sessions, formData.payment_method)
                      setFormData({
                        ...formData,
                        total_sessions,
                        ...(presetPrice != null ? { price: presetPrice } : {}),
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">8회</SelectItem>
                      <SelectItem value="5">5회</SelectItem>
                      <SelectItem value="10">10회</SelectItem>
                      <SelectItem value="20">20회</SelectItem>
                      <SelectItem value="30">30회</SelectItem>
                      <SelectItem value="50">50회</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">결제 금액 (원)</Label>
                  <Input
                    id="price"
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                    placeholder="500000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paid_at">결제일</Label>
                  <KoreanDatePicker
                    id="paid_at"
                    value={formData.paid_at}
                    onChange={(paid_at) => setFormData({ ...formData, paid_at })}
                    placeholder="결제일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expires_at">만료일</Label>
                  <KoreanDatePicker
                    id="expires_at"
                    value={formData.expires_at}
                    onChange={(expires_at) => setFormData({ ...formData, expires_at })}
                    placeholder="미지정"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment_method">결제 방법</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(v) => {
                    const currentPrice = formData.price || 0
                    const nextPrice =
                      currentPrice > 0
                        ? adjustPriceForPaymentMethod(
                            currentPrice,
                            formData.payment_method,
                            v,
                          )
                        : getPresetPrice(formData.total_sessions, v)
                    setFormData({
                      ...formData,
                      payment_method: v,
                      ...(nextPrice != null ? { price: nextPrice } : {}),
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="카드">카드</SelectItem>
                    <SelectItem value="현금">현금</SelectItem>
                    <SelectItem value="계좌이체">계좌이체</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">메모</Label>
                <Textarea
                  id="note"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="특이사항"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddPackage} disabled={isLoading}>
                {isLoading ? '등록 중...' : '등록'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Table */}
      <div className="min-w-0 rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <div className="inline-flex items-center gap-0.5">
                  <RecentLessonSortIcon
                    active={listOrderBy === 'recent_lesson'}
                    onClick={() => void handleRecentLessonSort()}
                  />
                  <span className="font-medium">회원</span>
                </div>
              </TableHead>
              <TableHead>수업권</TableHead>
              <TableHead className="hidden sm:table-cell">잔여/최근/누적</TableHead>
              <TableHead className="hidden md:table-cell">결제액</TableHead>
              <TableHead className="hidden lg:table-cell">만료일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groupedFilteredPackages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  등록된 수업권이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              groupedFilteredPackages.map(
                ({
                  primary: pkg,
                  duplicateCount,
                  latestPurchaseTotalSessions,
                  cumulativeTotalSessions,
                  cumulativeRemainingSessions,
                }) => (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <div>
                      {pkg.member_id && !isMemberDeleted(pkg.member) ? (
                        <Link
                          href={`/dashboard/members/${pkg.member_id}`}
                          className="font-medium text-primary visited:text-primary hover:text-primary hover:underline"
                        >
                          {pkg.member?.name}
                        </Link>
                      ) : (
                        <p className="font-medium text-muted-foreground">
                          {pkg.member?.name ?? '(삭제된 회원)'}
                        </p>
                      )}
                      {isMemberDeleted(pkg.member) && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          삭제된 회원
                        </Badge>
                      )}
                      <p className="text-sm text-muted-foreground">{pkg.member?.phone}</p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatPackagePlanLabel(pkg.total_sessions, pkg.note, {
                      duplicateCount,
                      cumulativeTotalSessions,
                    })}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      <GroupedPackageUsageDisplay
                        remainingSessions={cumulativeRemainingSessions}
                        latestPurchaseTotalSessions={latestPurchaseTotalSessions}
                        cumulativeTotalSessions={cumulativeTotalSessions}
                        note={pkg.note}
                        isActive={pkg.is_active}
                        expiresAt={pkg.expires_at}
                        paidAt={pkg.paid_at}
                      />
                      {isSessionPackageOverage(cumulativeRemainingSessions, pkg.note) ? (
                        <Badge variant="destructive" className="text-[10px]">
                          초과
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {pkg.price ? `${pkg.price.toLocaleString()}원` : '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatPackageDate(pkg.expires_at)}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={pkg.is_active}
                      onCheckedChange={() => void handleToggleStatus(pkg)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDialog(pkg)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget(pkg)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {hasMore && !searchTerm && statusFilter === 'all' && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={loadingMore}
            onClick={() => void handleLoadMore()}
          >
            {loadingMore ? '불러오는 중…' : `더보기 (${loadedCount}/${totalCount})`}
          </Button>
        </div>
      )}

      <Dialog open={editTarget != null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>수업권 수정</DialogTitle>
            <DialogDescription>
              {editTarget?.member?.name ?? '회원'} ·{' '}
              {formatPackagePlanLabel(editTarget?.total_sessions ?? 0, editTarget?.note)}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-total">전체 횟수</Label>
                <Input
                  id="edit-total"
                  type="number"
                  min={1}
                  value={editForm.total_sessions}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      total_sessions: Number(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-remaining">잔여 횟수</Label>
                <Input
                  id="edit-remaining"
                  type="number"
                  min={0}
                  value={editForm.remaining_sessions}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      remaining_sessions: Number(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-price">결제액</Label>
              <Input
                id="edit-price"
                value={editForm.price}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    price: e.target.value.replace(/[^\d]/g, ''),
                  })
                }
                placeholder="880000"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>결제일</Label>
                <KoreanDatePicker
                  value={editForm.paid_at}
                  onChange={(value) => setEditForm({ ...editForm, paid_at: value })}
                />
              </div>
              <div className="space-y-2">
                <Label>만료일</Label>
                <KoreanDatePicker
                  value={editForm.expires_at}
                  onChange={(value) => setEditForm({ ...editForm, expires_at: value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-payment">결제 수단</Label>
              <Select
                value={editForm.payment_method}
                onValueChange={(value) => {
                  const currentPrice = Number(editForm.price) || 0
                  const nextPrice =
                    currentPrice > 0
                      ? adjustPriceForPaymentMethod(
                          currentPrice,
                          editForm.payment_method,
                          value,
                        )
                      : undefined
                  setEditForm({
                    ...editForm,
                    payment_method: value,
                    ...(nextPrice != null ? { price: String(nextPrice) } : {}),
                  })
                }}
              >
                <SelectTrigger id="edit-payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="카드">카드</SelectItem>
                  <SelectItem value="현금">현금</SelectItem>
                  <SelectItem value="계좌이체">계좌이체</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-note">메모</Label>
              <Textarea
                id="edit-note"
                value={editForm.note}
                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              취소
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={isLoading}>
              {isLoading ? '저장 중…' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>수업권 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.member?.name ?? '회원'}의{' '}
              {formatPackagePlanLabel(deleteTarget?.total_sessions ?? 0, deleteTarget?.note)}을
              휴지통으로 이동합니다. 세션/결제 기록은 휴지통에서 복구할 수 있습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDeletePackage()
              }}
            >
              {deleting ? '삭제 중…' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
