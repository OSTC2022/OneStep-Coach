'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  createInstructor,
  deleteInstructor,
  getInstructor,
  getInstructorMonthlyPayDetail,
  getInstructorsPage,
  toggleInstructorStatus,
  updateInstructor,
} from '@/lib/actions/instructors'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import { Instructor } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
import { Plus, Edit, Trash2, Calculator, User, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  calcManualSlotPay,
  isWeekendOrHolidayRateDay,
} from '@/lib/instructor-pay'
import { InstructorPayDetailDialog } from '@/components/instructors/instructor-pay-detail-dialog'
import { InstructorColorPicker } from '@/components/instructors/instructor-color-picker'
import {
  DEFAULT_INSTRUCTOR_CALENDAR_COLOR,
  getDefaultInstructorCalendarColor,
  getInstructorCalendarColor,
} from '@/lib/instructor-colors'

interface InstructorManagementProps {
  initialInstructors: Instructor[]
  totalCount: number
  pageSize?: number
  isAdmin?: boolean
}

export function InstructorManagement({
  initialInstructors,
  totalCount,
  pageSize = LIST_PAGE_SIZE,
  isAdmin = false,
}: InstructorManagementProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [instructors, setInstructors] = useState(initialInstructors)
  const [loadedCount, setLoadedCount] = useState(initialInstructors.length)
  const [loadingMore, setLoadingMore] = useState(false)
  const hasMore = loadedCount < totalCount

  useEffect(() => {
    setInstructors(initialInstructors)
    setLoadedCount(initialInstructors.length)
  }, [initialInstructors])

  async function handleLoadMore() {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const { data } = await getInstructorsPage({
        limit: pageSize,
        offset: loadedCount,
      })
      if (data.length > 0) {
        setInstructors((prev) => {
          const ids = new Set(prev.map((i) => i.id))
          return [...prev, ...data.filter((i) => !ids.has(i.id))]
        })
        setLoadedCount((n) => n + data.length)
      }
    } finally {
      setLoadingMore(false)
    }
  }
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isCalcDialogOpen, setIsCalcDialogOpen] = useState(false)
  const [isPayDetailOpen, setIsPayDetailOpen] = useState(false)
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    kakao_id: '',
    instagram_id: '',
    blog_url: '',
    speciality: '',
    hourly_rate_weekday: 30000,
    hourly_rate_weekend: 40000,
    extra_member_rate: 10000,
    calendar_color: DEFAULT_INSTRUCTOR_CALENDAR_COLOR,
  })

  type CalcSlotRow = {
    id: string
    isWeekend: boolean
    memberCount: number
  }

  const [calcSlots, setCalcSlots] = useState<CalcSlotRow[]>([])
  const [todayPaySummary, setTodayPaySummary] = useState({
    weekdaySlots: 0,
    weekendSlots: 0,
    weekdayPay: 0,
    weekendPay: 0,
    totalPay: 0,
  })
  const [monthPaySummary, setMonthPaySummary] = useState<{
    weekdaySlots: number
    weekendSlots: number
    weekdayPay: number
    weekendPay: number
    totalPay: number
  } | null>(null)
  const [isMonthPayLoading, setIsMonthPayLoading] = useState(false)

  function getTodayDateKey() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  function formatTodayLabel() {
    const [year, month, day] = getTodayDateKey().split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
    return `${month}월 ${day}일 (${weekday})`
  }

  function summarizeDaySlots(
    slots: Array<{ isWeekendOrHoliday: boolean; pay: number }>,
  ) {
    let weekdaySlots = 0
    let weekendSlots = 0
    let weekdayPay = 0
    let weekendPay = 0

    for (const slot of slots) {
      if (slot.isWeekendOrHoliday) {
        weekendSlots++
        weekendPay += slot.pay
      } else {
        weekdaySlots++
        weekdayPay += slot.pay
      }
    }

    return {
      weekdaySlots,
      weekendSlots,
      weekdayPay,
      weekendPay,
      totalPay: weekdayPay + weekendPay,
    }
  }

  function getCurrentMonthValue() {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  function formatCurrentMonthLabel() {
    const now = new Date()
    return `${now.getFullYear()}년 ${now.getMonth() + 1}월`
  }

  function createDefaultCalcSlot(): CalcSlotRow {
    return {
      id: crypto.randomUUID(),
      isWeekend: isWeekendOrHolidayRateDay(getTodayDateKey()),
      memberCount: 1,
    }
  }

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      kakao_id: '',
      instagram_id: '',
      blog_url: '',
      speciality: '',
      hourly_rate_weekday: 30000,
      hourly_rate_weekend: 40000,
      extra_member_rate: 10000,
      calendar_color: getDefaultInstructorCalendarColor(instructors.length),
    })
  }

  const buildFormPayload = () => ({
    name: formData.name.trim(),
    phone: formData.phone || undefined,
    kakao_id: formData.kakao_id || undefined,
    instagram_id: formData.instagram_id || undefined,
    blog_url: formData.blog_url || undefined,
    speciality: formData.speciality
      ? formData.speciality.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    hourly_rate_weekday: formData.hourly_rate_weekday,
    hourly_rate_weekend: formData.hourly_rate_weekend,
    extra_member_rate: formData.extra_member_rate,
    calendar_color: formData.calendar_color,
  })

  const handleMutationResult = (
    result: { data?: Instructor; error?: string; warning?: string },
    successMessage: string,
    onSuccess: (data: Instructor) => void,
  ) => {
    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return false
    }
    if (!result.data) {
      toast.error('저장 실패', { description: '서버에서 응답이 없습니다.' })
      return false
    }

    onSuccess(result.data)
    toast.success(successMessage)
    if (result.warning) {
      toast.warning('캘린더 색상 미저장', { description: result.warning })
    }
    return true
  }

  const handleAddInstructor = async () => {
    if (!formData.name.trim()) {
      toast.error('이름을 입력해 주세요.')
      return
    }
    setIsLoading(true)

    const result = await createInstructor(buildFormPayload())
    const saved = handleMutationResult(result, '강사가 등록되었습니다.', (data) => {
      setInstructors([...instructors, data])
      resetForm()
      setIsAddDialogOpen(false)
    })

    setIsLoading(false)
    if (saved) router.refresh()
  }

  const handleEditInstructor = async () => {
    if (!selectedInstructor) {
      toast.error('수정할 강사를 찾을 수 없습니다.')
      return
    }
    if (!formData.name.trim()) {
      toast.error('이름을 입력해 주세요.')
      return
    }
    setIsLoading(true)

    const result = await updateInstructor(selectedInstructor.id, buildFormPayload())
    const saved = handleMutationResult(result, '강사 정보가 저장되었습니다.', (data) => {
      setInstructors(instructors.map((i) => (i.id === data.id ? data : i)))
      resetForm()
      setIsEditDialogOpen(false)
      setSelectedInstructor(null)
    })

    setIsLoading(false)
    if (saved) router.refresh()
  }

  const handleToggleActive = async (instructor: Instructor) => {
    const nextActive = !instructor.is_active
    const result = await toggleInstructorStatus(instructor.id, nextActive)

    if (result.error) {
      toast.error('상태 변경 실패', { description: result.error })
      return
    }

    setInstructors(
      instructors.map((i) =>
        i.id === instructor.id ? { ...i, is_active: nextActive } : i,
      ),
    )
    toast.success(nextActive ? '강사가 활성화되었습니다.' : '강사가 비활성화되었습니다.')
    router.refresh()
  }

  const handleDeleteInstructor = async (instructor: Instructor) => {
    if (!confirm(`정말 ${instructor.name} 강사를 삭제하시겠습니까?`)) return

    const result = await deleteInstructor(instructor.id)

    if (result.error) {
      toast.error('삭제 실패', { description: result.error })
      return
    }

    setInstructors(instructors.filter((i) => i.id !== instructor.id))
    setLoadedCount((n) => Math.max(0, n - 1))
    toast.success(`${instructor.name} 강사가 삭제되었습니다.`)
    if (instructor.user_id) {
      toast.warning('로그인 계정 연결 해제됨', {
        description:
          '해당 계정에 강사 권한이 남아 있으면 설정에서 권한을 변경해주세요. 그렇지 않으면 강사가 다시 생성될 수 있습니다.',
      })
    }
    router.refresh()
  }

  const openEditDialog = (instructor: Instructor) => {
    setSelectedInstructor(instructor)
    setFormData({
      name: instructor.name,
      phone: instructor.phone || '',
      kakao_id: instructor.kakao_id || '',
      instagram_id: instructor.instagram_id || '',
      blog_url: instructor.blog_url || '',
      speciality: instructor.speciality?.join(', ') || '',
      hourly_rate_weekday: instructor.hourly_rate_weekday,
      hourly_rate_weekend: instructor.hourly_rate_weekend,
      extra_member_rate: instructor.extra_member_rate,
      calendar_color: getInstructorCalendarColor(instructor),
    })
    setIsEditDialogOpen(true)
  }

  const openCalcDialog = (instructor: Instructor) => {
    setSelectedInstructor(instructor)
    setCalcSlots([])
    setTodayPaySummary({
      weekdaySlots: 0,
      weekendSlots: 0,
      weekdayPay: 0,
      weekendPay: 0,
      totalPay: 0,
    })
    setMonthPaySummary(null)
    setIsMonthPayLoading(true)
    setIsCalcDialogOpen(true)

    const today = getTodayDateKey()

    void getInstructorMonthlyPayDetail(instructor.id, getCurrentMonthValue(), {
      upToNow: true,
    }).then(
      (detail) => {
        setIsMonthPayLoading(false)
        if (!detail) return

        setMonthPaySummary({
          weekdaySlots: detail.weekdaySlots,
          weekendSlots: detail.weekendSlots,
          weekdayPay: detail.weekdayPay,
          weekendPay: detail.weekendPay,
          totalPay: detail.totalPay,
        })

        const todayGroup = detail.dayGroups.find((day) => day.lessonDate === today)
        setTodayPaySummary(
          todayGroup ? summarizeDaySlots(todayGroup.slots) : {
            weekdaySlots: 0,
            weekendSlots: 0,
            weekdayPay: 0,
            weekendPay: 0,
            totalPay: 0,
          },
        )
      },
    )
  }

  useEffect(() => {
    const payInstructorId = searchParams.get('pay')
    if (!payInstructorId) return

    let cancelled = false

    async function openPayFromQuery() {
      const instructor = await getInstructor(payInstructorId)
      if (cancelled) return

      if (instructor) {
        openCalcDialog(instructor)
      } else {
        toast.error('강사를 찾을 수 없습니다.')
      }

      router.replace('/dashboard/instructors', { scroll: false })
    }

    void openPayFromQuery()

    return () => {
      cancelled = true
    }
  }, [searchParams, router])

  const manualPaySummary = selectedInstructor
    ? calcManualSlotPay(
        calcSlots.map((slot) => ({
          isWeekendOrHoliday: slot.isWeekend,
          memberCount: slot.memberCount,
        })),
        selectedInstructor,
      )
    : null

  function addCalcSlot() {
    setCalcSlots((prev) => [...prev, createDefaultCalcSlot()])
  }

  function removeCalcSlot(id: string) {
    setCalcSlots((prev) => prev.filter((slot) => slot.id !== id))
  }

  function updateCalcSlot(id: string, patch: Partial<CalcSlotRow>) {
    setCalcSlots((prev) =>
      prev.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)),
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">전체 강사</p>
                <p className="text-2xl font-bold">{instructors.length}</p>
              </div>
              <User className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">활성 강사</p>
                <p className="text-2xl font-bold text-green-400">
                  {instructors.filter(i => i.is_active).length}
                </p>
              </div>
              <User className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">비활성 강사</p>
                <p className="text-2xl font-bold text-muted-foreground">
                  {instructors.filter(i => !i.is_active).length}
                </p>
              </div>
              <User className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Button */}
      <div className="flex justify-end">
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              강사 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>새 강사 등록</DialogTitle>
              <DialogDescription>새로운 강사 정보를 입력하세요.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>이름 *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="홍길동"
                />
              </div>
              <div className="space-y-2">
                <Label>연락처</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="010-1234-5678"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>카카오톡</Label>
                  <Input
                    value={formData.kakao_id}
                    onChange={(e) => setFormData({ ...formData, kakao_id: e.target.value })}
                    placeholder="카카오톡 개인 ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label>인스타그램</Label>
                  <Input
                    value={formData.instagram_id}
                    onChange={(e) => setFormData({ ...formData, instagram_id: e.target.value })}
                    placeholder="@아이디"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>블로그</Label>
                <Input
                  value={formData.blog_url}
                  onChange={(e) => setFormData({ ...formData, blog_url: e.target.value })}
                  placeholder="https://blog.naver.com/아이디"
                />
              </div>
              <div className="space-y-2">
                <Label>전문 분야 (쉼표로 구분)</Label>
                <Input
                  value={formData.speciality}
                  onChange={(e) => setFormData({ ...formData, speciality: e.target.value })}
                  placeholder="축구, 체력훈련, 재활"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>평일 1타임 기본료 (원)</Label>
                  <Input
                    type="number"
                    value={formData.hourly_rate_weekday}
                    onChange={(e) => setFormData({ ...formData, hourly_rate_weekday: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>주말·공휴일 1타임 기본료 (원)</Label>
                  <Input
                    type="number"
                    value={formData.hourly_rate_weekend}
                    onChange={(e) => setFormData({ ...formData, hourly_rate_weekend: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>추가 인원 수당 (원/명)</Label>
                <Input
                  type="number"
                  value={formData.extra_member_rate}
                  onChange={(e) => setFormData({ ...formData, extra_member_rate: Number(e.target.value) })}
                />
              </div>
              <InstructorColorPicker
                value={formData.calendar_color}
                onChange={(calendar_color) => setFormData({ ...formData, calendar_color })}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { resetForm(); setIsAddDialogOpen(false); }}>
                취소
              </Button>
              <Button
                type="button"
                onClick={handleAddInstructor}
                disabled={isLoading || !formData.name.trim()}
              >
                {isLoading ? '등록 중...' : '등록'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Instructors Table */}
      <Card>
        <CardHeader>
          <CardTitle>강사 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">색상</TableHead>
                <TableHead>이름</TableHead>
                <TableHead className="hidden sm:table-cell">연락처</TableHead>
                <TableHead className="hidden md:table-cell">전문 분야</TableHead>
                <TableHead className="hidden lg:table-cell">평일 1타임</TableHead>
                <TableHead className="hidden lg:table-cell">주말 1타임</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">관리</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    등록된 강사가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                instructors.map((instructor) => (
                  <TableRow key={instructor.id}>
                    <TableCell>
                      <span
                        className="inline-block h-4 w-4 rounded-full border border-border"
                        style={{ backgroundColor: getInstructorCalendarColor(instructor) }}
                        title={getInstructorCalendarColor(instructor)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{instructor.name}</TableCell>
                    <TableCell className="hidden sm:table-cell">{instructor.phone || '-'}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {instructor.speciality?.slice(0, 2).map((s, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                        {instructor.speciality && instructor.speciality.length > 2 && (
                          <Badge variant="outline" className="text-xs">+{instructor.speciality.length - 2}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {instructor.hourly_rate_weekday.toLocaleString()}원
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {instructor.hourly_rate_weekend.toLocaleString()}원
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={instructor.is_active}
                        onCheckedChange={() => handleToggleActive(instructor)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openCalcDialog(instructor)}>
                          <Calculator className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditDialog(instructor)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => void handleDeleteInstructor(instructor)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {hasMore && (
            <div className="flex justify-center pt-4">
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
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open)
          if (!open) setSelectedInstructor(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>강사 정보 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>이름 *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>연락처</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>카카오톡</Label>
                <Input
                  value={formData.kakao_id}
                  onChange={(e) => setFormData({ ...formData, kakao_id: e.target.value })}
                  placeholder="카카오톡 개인 ID"
                />
              </div>
              <div className="space-y-2">
                <Label>인스타그램</Label>
                <Input
                  value={formData.instagram_id}
                  onChange={(e) => setFormData({ ...formData, instagram_id: e.target.value })}
                  placeholder="@아이디"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>블로그</Label>
              <Input
                value={formData.blog_url}
                onChange={(e) => setFormData({ ...formData, blog_url: e.target.value })}
                placeholder="https://blog.naver.com/아이디"
              />
            </div>
            <div className="space-y-2">
              <Label>전문 분야 (쉼표로 구분)</Label>
              <Input
                value={formData.speciality}
                onChange={(e) => setFormData({ ...formData, speciality: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>평일 시급 (원)</Label>
                <Input
                  type="number"
                  value={formData.hourly_rate_weekday}
                  onChange={(e) => setFormData({ ...formData, hourly_rate_weekday: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>주말 시급 (원)</Label>
                <Input
                  type="number"
                  value={formData.hourly_rate_weekend}
                  onChange={(e) => setFormData({ ...formData, hourly_rate_weekend: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>추가 인원 수당 (원/명)</Label>
              <Input
                type="number"
                value={formData.extra_member_rate}
                onChange={(e) => setFormData({ ...formData, extra_member_rate: Number(e.target.value) })}
              />
            </div>
            <InstructorColorPicker
              value={formData.calendar_color}
              onChange={(calendar_color) => setFormData({ ...formData, calendar_color })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setIsEditDialogOpen(false); }}>
              취소
            </Button>
            <Button type="button" onClick={handleEditInstructor} disabled={isLoading || !formData.name.trim()}>
              {isLoading ? '저장 중...' : '저장'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Calculator Dialog */}
      <Dialog
        open={isCalcDialogOpen}
        onOpenChange={(open) => {
          setIsCalcDialogOpen(open)
          if (!open) {
            setCalcSlots([])
            setTodayPaySummary({
              weekdaySlots: 0,
              weekendSlots: 0,
              weekdayPay: 0,
              weekendPay: 0,
              totalPay: 0,
            })
            setMonthPaySummary(null)
            setIsMonthPayLoading(false)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>강사료 계산</DialogTitle>
            <DialogDescription>
              {selectedInstructor?.name} 강사 · {formatTodayLabel()} ·{' '}
              {formatCurrentMonthLabel()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p>
                <strong className="text-foreground">평일</strong> 1타임{' '}
                {selectedInstructor?.hourly_rate_weekday.toLocaleString()}원 + 추가 인원{' '}
                {selectedInstructor?.extra_member_rate.toLocaleString()}원
              </p>
              <p>
                <strong className="text-foreground">주말·공휴일</strong> 1타임{' '}
                {selectedInstructor?.hourly_rate_weekend.toLocaleString()}원 + 추가 인원{' '}
                {selectedInstructor?.extra_member_rate.toLocaleString()}원
              </p>
              <p>예) 평일 2명 → 4만원 · 평일 3명 → 5만원 · 주말 2명 → 5만원</p>
            </div>

            {isAdmin ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label>수동 계산</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addCalcSlot}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    타임 추가
                  </Button>
                </div>

                {calcSlots.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {calcSlots.map((slot) => (
                      <div key={slot.id} className="flex items-center gap-2">
                        <Select
                          value={slot.isWeekend ? 'weekend' : 'weekday'}
                          onValueChange={(value) =>
                            updateCalcSlot(slot.id, { isWeekend: value === 'weekend' })
                          }
                        >
                          <SelectTrigger className="w-[132px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekday">평일</SelectItem>
                            <SelectItem value="weekend">주말·공휴일</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          className="w-20"
                          value={slot.memberCount}
                          onChange={(e) =>
                            updateCalcSlot(slot.id, {
                              memberCount: Math.max(1, Number(e.target.value) || 1),
                            })
                          }
                        />
                        <span className="shrink-0 text-sm text-muted-foreground">명</span>
                        <span className="ml-auto text-sm font-medium tabular-nums">
                          {(selectedInstructor
                            ? calcManualSlotPay(
                                [
                                  {
                                    isWeekendOrHoliday: slot.isWeekend,
                                    memberCount: slot.memberCount,
                                  },
                                ],
                                selectedInstructor,
                              ).totalPay
                            : 0
                          ).toLocaleString()}
                          원
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => removeCalcSlot(slot.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <p className="text-right text-xs text-muted-foreground">
                      수동 합계{' '}
                      <span className="font-medium text-foreground">
                        {(manualPaySummary?.totalPay ?? 0).toLocaleString()}원
                      </span>
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="bg-primary/20 rounded-lg p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">오늘 합계</p>
              <div className="flex justify-between text-sm">
                <span>평일 ({todayPaySummary.weekdaySlots}타임)</span>
                <span>{todayPaySummary.weekdayPay.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>주말·공휴일 ({todayPaySummary.weekendSlots}타임)</span>
                <span>{todayPaySummary.weekendPay.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-primary/30 pt-2">
                <span>오늘 총액</span>
                <span className="text-primary">
                  {todayPaySummary.totalPay.toLocaleString()}원
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                {formatCurrentMonthLabel()} 합계
                <span className="mt-0.5 block font-normal text-[11px]">
                  현재 시각까지 반영 (이후 일정 제외)
                </span>
              </p>
              {isMonthPayLoading ? (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  불러오는 중…
                </p>
              ) : (
                <>
                  <div className="flex justify-between text-sm">
                    <span>평일 ({monthPaySummary?.weekdaySlots ?? 0}타임)</span>
                    <span>
                      {(monthPaySummary?.weekdayPay ?? 0).toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>
                      주말·공휴일 ({monthPaySummary?.weekendSlots ?? 0}타임)
                    </span>
                    <span>
                      {(monthPaySummary?.weekendPay ?? 0).toLocaleString()}원
                    </span>
                  </div>
                  <div className="flex justify-between text-lg font-bold border-t border-border pt-2">
                    <span>{formatCurrentMonthLabel()} 총액</span>
                    <span className="text-primary">
                      {(monthPaySummary?.totalPay ?? 0).toLocaleString()}원
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsPayDetailOpen(true)
              }}
            >
              자세히 보기
            </Button>
            <Button type="button" onClick={() => setIsCalcDialogOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InstructorPayDetailDialog
        open={isPayDetailOpen}
        onOpenChange={setIsPayDetailOpen}
        instructor={selectedInstructor}
        canEdit={isAdmin}
      />
    </div>
  )
}
