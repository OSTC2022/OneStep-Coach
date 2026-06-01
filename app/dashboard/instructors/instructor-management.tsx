'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { createInstructor, updateInstructor } from '@/lib/actions/instructors'
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
import { Plus, Edit, Trash2, Calculator, User } from 'lucide-react'
import { InstructorColorPicker } from '@/components/instructors/instructor-color-picker'
import {
  DEFAULT_INSTRUCTOR_CALENDAR_COLOR,
  getDefaultInstructorCalendarColor,
  getInstructorCalendarColor,
} from '@/lib/instructor-colors'

interface InstructorManagementProps {
  instructors: Instructor[]
}

export function InstructorManagement({ instructors: initialInstructors }: InstructorManagementProps) {
  const router = useRouter()
  const [instructors, setInstructors] = useState(initialInstructors)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isCalcDialogOpen, setIsCalcDialogOpen] = useState(false)
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    speciality: '',
    hourly_rate_weekday: 30000,
    hourly_rate_weekend: 40000,
    extra_member_rate: 10000,
    calendar_color: DEFAULT_INSTRUCTOR_CALENDAR_COLOR,
  })

  const [calcData, setCalcData] = useState({
    weekdayHours: 0,
    weekendHours: 0,
    extraMembers: 0,
  })

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
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
    const supabase = createClient()
    const { error } = await supabase
      .from('instructors')
      .update({ is_active: !instructor.is_active })
      .eq('id', instructor.id)

    if (!error) {
      setInstructors(instructors.map(i => 
        i.id === instructor.id ? { ...i, is_active: !i.is_active } : i
      ))
    }
    router.refresh()
  }

  const handleDeleteInstructor = async (instructorId: string) => {
    if (!confirm('정말 이 강사를 삭제하시겠습니까?')) return

    const supabase = createClient()
    const { error } = await supabase
      .from('instructors')
      .delete()
      .eq('id', instructorId)

    if (!error) {
      setInstructors(instructors.filter(i => i.id !== instructorId))
    }
    router.refresh()
  }

  const openEditDialog = (instructor: Instructor) => {
    setSelectedInstructor(instructor)
    setFormData({
      name: instructor.name,
      phone: instructor.phone || '',
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
    setCalcData({ weekdayHours: 0, weekendHours: 0, extraMembers: 0 })
    setIsCalcDialogOpen(true)
  }

  const calculatePay = () => {
    if (!selectedInstructor) return 0
    const weekdayPay = calcData.weekdayHours * selectedInstructor.hourly_rate_weekday
    const weekendPay = calcData.weekendHours * selectedInstructor.hourly_rate_weekend
    const extraPay = calcData.extraMembers * selectedInstructor.extra_member_rate
    return weekdayPay + weekendPay + extraPay
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
                <Label>추가 회원 수당 (원/명)</Label>
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
                <TableHead className="hidden lg:table-cell">평일 시급</TableHead>
                <TableHead className="hidden lg:table-cell">주말 시급</TableHead>
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
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteInstructor(instructor.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
              <Label>추가 회원 수당 (원/명)</Label>
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
      <Dialog open={isCalcDialogOpen} onOpenChange={setIsCalcDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>강사료 계산</DialogTitle>
            <DialogDescription>
              {selectedInstructor?.name} 강사의 급여를 계산합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>평일 근무 시간</Label>
                <Input
                  type="number"
                  min="0"
                  value={calcData.weekdayHours}
                  onChange={(e) => setCalcData({ ...calcData, weekdayHours: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  시급: {selectedInstructor?.hourly_rate_weekday.toLocaleString()}원
                </p>
              </div>
              <div className="space-y-2">
                <Label>주말 근무 시간</Label>
                <Input
                  type="number"
                  min="0"
                  value={calcData.weekendHours}
                  onChange={(e) => setCalcData({ ...calcData, weekendHours: Number(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">
                  시급: {selectedInstructor?.hourly_rate_weekend.toLocaleString()}원
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>그룹레슨 추가 회원 수</Label>
              <Input
                type="number"
                min="0"
                value={calcData.extraMembers}
                onChange={(e) => setCalcData({ ...calcData, extraMembers: Number(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                인당: {selectedInstructor?.extra_member_rate.toLocaleString()}원
              </p>
            </div>

            <div className="bg-primary/20 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span>평일 급여</span>
                <span>{(calcData.weekdayHours * (selectedInstructor?.hourly_rate_weekday || 0)).toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>주말 급여</span>
                <span>{(calcData.weekendHours * (selectedInstructor?.hourly_rate_weekend || 0)).toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>추가 수당</span>
                <span>{(calcData.extraMembers * (selectedInstructor?.extra_member_rate || 0)).toLocaleString()}원</span>
              </div>
              <div className="flex justify-between text-lg font-bold border-t border-primary/30 pt-2 mt-2">
                <span>총 급여</span>
                <span className="text-primary">{calculatePay().toLocaleString()}원</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsCalcDialogOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
