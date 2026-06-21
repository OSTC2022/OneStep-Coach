'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createMember, deleteMember, getMembers, toggleMemberStatus } from '@/lib/actions/members'
import { getInstructors } from '@/lib/actions/instructors'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import {
  DEFAULT_MEMBER_LIST_SORT,
  memberListOrderByFromField,
  type MemberListSortField,
} from '@/lib/member-list-sort'
import {
  formatMemberAge,
  formatMemberContactDisplay,
  suggestAgeFromBirthDate,
  AUTO_INSTRUCTOR_ID,
  formatPrimaryInstructorName,
} from '@/lib/member-utils'
import { BirthDateInput } from '@/components/members/birth-date-input'
import { SportSelectField } from '@/components/members/sport-select-field'
import { InstructorSelectField } from '@/components/members/instructor-select-field'
import { Member, Instructor, MemberFormData } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PhoneInput } from '@/components/ui/phone-input'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { Edit, Plus, Search, Trash2, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { RecentLessonSortIcon } from '@/components/dashboard/recent-lesson-sort-icon'
import { MemberTrashSheet } from './member-trash-sheet'
import { LIST_ROW_LINK_PREFETCH } from '@/lib/navigation-prefetch'

interface MemberListProps {
  initialMembers: (Member & { primary_instructor?: { id: string; name: string } | null })[]
  totalCount: number
  pageSize?: number
  initialTrashCount?: number
  canManage?: boolean
  preferRecentLessonSort?: boolean
}

function MemberSortIcon({
  active,
  asc,
}: {
  active: boolean
  asc: boolean
}) {
  if (!active) return null
  return asc ? (
    <ArrowUp className="h-3 w-3 text-primary" aria-hidden />
  ) : (
    <ArrowDown className="h-3 w-3 text-primary" aria-hidden />
  )
}

function SortableMemberHead({
  label,
  field,
  sortField,
  sortAsc,
  recentLesson = false,
  className,
  onSort,
}: {
  label: string
  field: MemberListSortField
  sortField: MemberListSortField
  sortAsc: boolean
  recentLesson?: boolean
  className?: string
  onSort: (field: MemberListSortField) => void
}) {
  const isRecentLessonActive = recentLesson && sortField === field

  return (
    <TableHead className={className}>
      <div className="inline-flex items-center gap-0.5">
        {recentLesson ? (
          <RecentLessonSortIcon
            active={isRecentLessonActive}
            onClick={() => onSort(field)}
          />
        ) : null}
        <button
          type="button"
          className="inline-flex items-center gap-1 font-medium transition-colors hover:text-primary"
          onClick={() => onSort(field)}
        >
          {label}
          <MemberSortIcon active={sortField === field} asc={sortAsc} />
        </button>
      </div>
    </TableHead>
  )
}

export function MemberList({
  initialMembers,
  totalCount,
  pageSize = LIST_PAGE_SIZE,
  initialTrashCount = 0,
  canManage = true,
  preferRecentLessonSort = false,
}: MemberListProps) {
  const [members, setMembers] = useState(initialMembers)
  const [listTotalCount, setListTotalCount] = useState(totalCount)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<MemberListSortField>(
    DEFAULT_MEMBER_LIST_SORT.field,
  )
  const [sortAsc, setSortAsc] = useState(DEFAULT_MEMBER_LIST_SORT.asc)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [pageLoading, setPageLoading] = useState(false)
  const skipFetchRef = useRef(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [instructors, setInstructors] = useState<
    Array<{ id: string; name: string; calendar_color?: string | null }>
  >([])
  const [instructorsLoading, setInstructorsLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [trashCount, setTrashCount] = useState(initialTrashCount)
  const [recentTrashItems, setRecentTrashItems] = useState<Member[]>([])

  useEffect(() => {
    setMembers(initialMembers)
    setListTotalCount(totalCount)
  }, [initialMembers, totalCount])

  useEffect(() => {
    if (!preferRecentLessonSort) return
    setSortField('recent_lesson')
    setSortAsc(false)
    setCurrentPage(1)
    skipFetchRef.current = false
  }, [preferRecentLessonSort])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim())
      setCurrentPage(1)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  const loadMembers = useCallback(async () => {
    setPageLoading(true)
    try {
      const { data, count } = await getMembers({
        orderBy: memberListOrderByFromField(sortField),
        orderAsc: sortAsc,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        search: debouncedSearch || undefined,
        isActive:
          statusFilter === 'all'
            ? undefined
            : statusFilter === 'active',
      })
      setMembers(data)
      setListTotalCount(count)
    } finally {
      setPageLoading(false)
    }
  }, [sortField, sortAsc, currentPage, pageSize, debouncedSearch, statusFilter])

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false
      return
    }
    void loadMembers()
  }, [loadMembers])

  function handleSortClick(field: MemberListSortField) {
    if (sortField === field) {
      setSortAsc((prev) => !prev)
    } else {
      setSortField(field)
      setSortAsc(field === 'recent_lesson' ? false : true)
    }
    setCurrentPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(listTotalCount / pageSize))
  const pageStart = listTotalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const pageEnd = Math.min(currentPage * pageSize, listTotalCount)

  useEffect(() => {
    if (!isAddDialogOpen || instructors.length > 0 || instructorsLoading) return

    let cancelled = false
    setInstructorsLoading(true)
    void getInstructors({ isActive: true, picker: true, limit: 100 }).then((rows) => {
      if (cancelled) return
      setInstructors(
        rows.map(({ id, name, calendar_color }) => ({ id, name, calendar_color })),
      )
      setInstructorsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [isAddDialogOpen, instructors.length, instructorsLoading])

  const [formData, setFormData] = useState<MemberFormData>({
    name: '',
    birth_date: '',
    age: undefined,
    grade: '',
    phone: '',
    parent_phone: '',
    sport: '',
    height_cm: undefined,
    weight_kg: undefined,
    goal: '',
    injury_history: '',
    memo: '',
    primary_instructor_id: AUTO_INSTRUCTOR_ID,
  })

  const handleAddMember = async () => {
    if (!formData.name.trim()) return

    setIsLoading(true)

    const result = await createMember(formData)

    if (result.error) {
      toast.error('회원 등록 실패', { description: result.error })
      setIsLoading(false)
      return
    }

    if (result.data) {
      setIsAddDialogOpen(false)
      setSortField('recent_lesson')
      setSortAsc(false)
      setCurrentPage(1)
      setPageLoading(true)
      try {
        const { data, count } = await getMembers({
          orderBy: 'recent_lesson',
          orderAsc: false,
          limit: pageSize,
          offset: 0,
          search: debouncedSearch || undefined,
          isActive:
            statusFilter === 'all'
              ? undefined
              : statusFilter === 'active',
        })
        setMembers(data)
        setListTotalCount(count)
      } finally {
        setPageLoading(false)
      }
      skipFetchRef.current = true
      setFormData({
        name: '',
        birth_date: '',
        age: undefined,
        grade: '',
        phone: '',
        parent_phone: '',
        sport: '',
        height_cm: undefined,
        weight_kg: undefined,
        goal: '',
        injury_history: '',
        memo: '',
        primary_instructor_id: AUTO_INSTRUCTOR_ID,
      })
      toast.success('새 회원이 등록되었습니다.')
    }

    setIsLoading(false)
  }

  const handleToggleMemberStatus = async (member: Member) => {
    const nextActive = !member.is_active
    const result = await toggleMemberStatus(member.id, nextActive)
    if (result.error) {
      toast.error(nextActive ? '활성화 실패' : '비활성화 실패', {
        description: result.error,
      })
      return
    }

    setMembers((prev) =>
      prev.map((item) =>
        item.id === member.id ? { ...item, is_active: nextActive } : item,
      ),
    )
    toast.success(nextActive ? '회원이 활성화되었습니다.' : '회원이 비활성화되었습니다.')
  }

  const handleDeleteMember = async () => {
    if (!deleteTarget) return
    setDeleting(true)

    const result = await deleteMember(deleteTarget.id)

    if (result.error) {
      toast.error('삭제 실패', { description: result.error })
      setDeleting(false)
      return
    }

    const trashedMember: Member = {
      ...deleteTarget,
      deleted_at: new Date().toISOString(),
    }
    setMembers(members.filter((m) => m.id !== deleteTarget.id))
    setListTotalCount((count) => Math.max(0, count - 1))
    setRecentTrashItems((prev) => [
      trashedMember,
      ...prev.filter((m) => m.id !== trashedMember.id),
    ])
    setTrashCount((n) => n + 1)
    setDeleteTarget(null)
    setDeleting(false)
    toast.success(`${deleteTarget.name} 회원이 휴지통으로 이동했습니다.`)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름, 연락처, 종목 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as 'all' | 'active' | 'inactive')
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="active">활성</SelectItem>
              <SelectItem value="inactive">비활성</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2 items-center">
          {canManage ? (
            <>
          <MemberTrashSheet
            initialCount={trashCount}
            recentTrashItems={recentTrashItems}
            onTrashCountChange={setTrashCount}
          />
          <Button asChild variant="outline">
            <Link href="/dashboard/members/new">
              <Plus className="h-4 w-4 mr-2" />
              상세 등록
            </Link>
          </Button>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                빠른 등록
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>새 회원 등록</DialogTitle>
              <DialogDescription>
                새로운 회원 정보를 입력하세요.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">이름 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="홍길동"
                  />
                </div>
                <BirthDateInput
                  id="quick-birth_date"
                  value={formData.birth_date}
                  onChange={(birth_date) =>
                    setFormData((prev) => ({
                      ...prev,
                      birth_date,
                      age: suggestAgeFromBirthDate(birth_date) ?? prev.age,
                    }))
                  }
                />
                <div className="space-y-2">
                  <Label htmlFor="quick-age">나이</Label>
                  <Input
                    id="quick-age"
                    type="number"
                    min={0}
                    max={120}
                    value={formData.age ?? ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        age: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    placeholder="생년월일 입력 시 자동 계산"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">본인 연락처</Label>
                  <PhoneInput
                    id="phone"
                    value={formData.phone ?? ''}
                    onChange={(phone) => setFormData({ ...formData, phone })}
                    placeholder="010-1234-5678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent_phone">보호자</Label>
                  <PhoneInput
                    id="parent_phone"
                    value={formData.parent_phone ?? ''}
                    onChange={(parent_phone) =>
                      setFormData({ ...formData, parent_phone })
                    }
                    placeholder="010-9876-5432"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="grade">학년 / 포지션</Label>
                  <Input
                    id="grade"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    placeholder="중3 / 공격수"
                  />
                </div>
                <SportSelectField
                  id="quick-sport"
                  label="종목"
                  value={formData.sport}
                  onChange={(sport) => setFormData({ ...formData, sport })}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="height_cm">키 (cm)</Label>
                  <Input
                    id="height_cm"
                    type="number"
                    value={formData.height_cm || ''}
                    onChange={(e) => setFormData({ ...formData, height_cm: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="170"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight_kg">몸무게 (kg)</Label>
                  <Input
                    id="weight_kg"
                    type="number"
                    value={formData.weight_kg || ''}
                    onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="65"
                  />
                </div>
                <div className="space-y-2">
                  <Label>BMI (자동계산)</Label>
                  <Input
                    value={
                      formData.height_cm && formData.weight_kg
                        ? (formData.weight_kg / Math.pow(formData.height_cm / 100, 2)).toFixed(1)
                        : '-'
                    }
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <InstructorSelectField
                id="instructor"
                value={formData.primary_instructor_id}
                onChange={(primary_instructor_id) =>
                  setFormData({ ...formData, primary_instructor_id })
                }
                instructors={instructors}
              />

              <div className="space-y-2">
                <Label htmlFor="goal">운동 목표</Label>
                <Input
                  id="goal"
                  value={formData.goal}
                  onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                  placeholder="체력 향상, 대회 준비 등"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="injury_history">부상 이력</Label>
                <Input
                  id="injury_history"
                  value={formData.injury_history}
                  onChange={(e) => setFormData({ ...formData, injury_history: e.target.value })}
                  placeholder="좌측 발목 인대 손상 (2023년)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="memo">메모</Label>
                <Input
                  id="memo"
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  placeholder="특이사항"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddMember} disabled={isLoading || !formData.name.trim()}>
                {isLoading ? '등록 중...' : '등록'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
            </>
          ) : null}
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span>전체 {listTotalCount}명</span>
        {debouncedSearch || statusFilter !== 'all' ? (
          <span>현재 페이지 {pageStart}-{pageEnd}명</span>
        ) : (
          <span>
            {pageStart}-{pageEnd}명 표시
          </span>
        )}
        {pageLoading ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            불러오는 중
          </span>
        ) : null}
      </div>

      {/* Table */}
      <div className="min-w-0 overflow-hidden rounded-lg border border-border">
        <Table
          fitContainer
          className="[&_th]:px-2 [&_td]:px-2 [&_td]:align-middle"
        >
          <TableHeader>
            <TableRow>
              <SortableMemberHead
                label="이름"
                field="recent_lesson"
                sortField={sortField}
                sortAsc={sortAsc}
                recentLesson
                className="pr-8 lg:w-[6.5rem]"
                onSort={handleSortClick}
              />
              <SortableMemberHead
                label="나이"
                field="age"
                sortField={sortField}
                sortAsc={sortAsc}
                className="hidden w-[7rem] pl-0 pr-1 sm:table-cell"
                onSort={handleSortClick}
              />
              <SortableMemberHead
                label="종목"
                field="sport"
                sortField={sortField}
                sortAsc={sortAsc}
                className="hidden w-[4rem] lg:table-cell"
                onSort={handleSortClick}
              />
              <SortableMemberHead
                label="담당 강사"
                field="instructor"
                sortField={sortField}
                sortAsc={sortAsc}
                className="hidden w-[5rem] lg:table-cell"
                onSort={handleSortClick}
              />
              <TableHead className="hidden lg:table-cell">연락처</TableHead>
              <TableHead className="w-[3.5rem] whitespace-nowrap text-center">
                상태
              </TableHead>
              {canManage ? (
                <TableHead className="w-[4.75rem] whitespace-nowrap text-center">
                  관리
                </TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canManage ? 7 : 6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <p>
                      {debouncedSearch || statusFilter !== 'all'
                        ? '검색 결과가 없습니다.'
                        : '등록된 회원이 없습니다.'}
                    </p>
                    {canManage && !debouncedSearch && statusFilter === 'all' && (
                      <Button asChild>
                        <Link href="/dashboard/members/new">
                          <Plus className="h-4 w-4 mr-2" />
                          첫 회원 추가하기
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="pr-8 font-medium lg:w-[6.5rem]">
                    <Link
                      href={`/dashboard/members/${member.id}`}
                      prefetch={LIST_ROW_LINK_PREFETCH}
                      className="block truncate hover:text-primary hover:underline underline-offset-4"
                      title={member.name}
                    >
                      {member.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden w-[7rem] pl-0 pr-1 font-medium sm:table-cell whitespace-nowrap">
                    {formatMemberAge(member)}
                  </TableCell>
                  <TableCell className="hidden w-[4rem] lg:table-cell text-xs whitespace-nowrap">
                    {member.sport || '-'}
                  </TableCell>
                  <TableCell className="hidden w-[5rem] lg:table-cell text-xs whitespace-nowrap">
                    {formatPrimaryInstructorName(member.primary_instructor)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                    {formatMemberContactDisplay(member)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex justify-center">
                      {canManage ? (
                        <Switch
                          checked={member.is_active}
                          onCheckedChange={() => void handleToggleMemberStatus(member)}
                        />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {member.is_active ? '활성' : '비활성'}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  {canManage ? (
                    <TableCell className="whitespace-nowrap">
                      <div className="flex justify-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                          <Link
                            href={`/dashboard/members/${member.id}/edit`}
                            prefetch={LIST_ROW_LINK_PREFETCH}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setDeleteTarget(member)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>회원 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} 회원을 휴지통으로 이동합니다. 세션/결제 기록은 그대로
              유지되며 세션/결제 화면에서 계속 검색할 수 있습니다. 휴지통에서 복구도 가능합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault()
                void handleDeleteMember()
              }}
            >
              {deleting ? '삭제 중…' : '삭제'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {totalPages > 1 ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {pageStart}-{pageEnd} / 전체 {listTotalCount}명 · {currentPage}/{totalPages}페이지
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1 || pageLoading}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              이전
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages || pageLoading}
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            >
              다음
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
