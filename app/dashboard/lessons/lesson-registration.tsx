'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO, subDays } from 'date-fns'
import { ko } from 'date-fns/locale'
import { createClient } from '@/lib/supabase/client'
import {
  isPackageUsableForLesson,
  shouldDeductSessionOnLesson,
} from '@/lib/session-package-utils'
import { pickSessionPackageForDeduction } from '@/lib/session-package-deduction'
import { Lesson, SessionPackage } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { SimpleTimeRangeInput } from '@/components/ui/simple-time-range-input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { normalizeLessonType } from '@/lib/lesson-types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { 
  Plus, 
  Search, 
  PenTool, 
  Clock, 
  User,
  CalendarCheck,
  RotateCcw
} from 'lucide-react'

interface MemberWithPackages {
  id: string
  name: string
  phone: string | null
  sport: string | null
  session_packages: Pick<
    SessionPackage,
    | 'id'
    | 'total_sessions'
    | 'remaining_sessions'
    | 'is_active'
    | 'note'
    | 'expires_at'
    | 'created_at'
    | 'paid_at'
  >[]
}

interface LessonWithRelations extends Lesson {
  member?: { name: string; phone: string | null } | null
  instructor?: { name: string } | null
}

interface LessonRegistrationProps {
  members: MemberWithPackages[]
  instructors: { id: string; name: string }[]
  recentWeekLessons: LessonWithRelations[]
}

const RECENT_LESSON_DAYS = 7

function getRecentLessonDateRange() {
  const today = new Date()
  return {
    dateFrom: format(subDays(today, RECENT_LESSON_DAYS - 1), 'yyyy-MM-dd'),
    dateTo: format(today, 'yyyy-MM-dd'),
  }
}

function sortRecentLessons(lessons: LessonWithRelations[]) {
  return [...lessons].sort((a, b) => {
    const dateCmp = b.lesson_date.localeCompare(a.lesson_date)
    if (dateCmp !== 0) return dateCmp
    return (b.start_time ?? '').localeCompare(a.start_time ?? '')
  })
}

function formatLessonTime(time: string | null | undefined) {
  if (!time) return '-'
  return time.slice(0, 5)
}

function formatLessonDateLabel(date: string) {
  return format(parseISO(date), 'M/d (EEE)', { locale: ko })
}

const LESSON_TYPES = [
  { value: '개인레슨', label: '개인레슨' },
  { value: '그룹레슨', label: '그룹레슨' },
  { value: '체험레슨', label: '체험레슨' },
  { value: '러닝레슨', label: '러닝레슨' },
  { value: '육상부', label: '육상부' },
]

export function LessonRegistration({
  members,
  instructors,
  recentWeekLessons,
}: LessonRegistrationProps) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedMember, setSelectedMember] = useState<MemberWithPackages | null>(null)
  const [isRegistering, setIsRegistering] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showSignature, setShowSignature] = useState(false)
  const [lessons, setLessons] = useState(() => sortRecentLessons(recentWeekLessons))
  const { dateFrom, dateTo } = getRecentLessonDateRange()
  const today = dateTo

  useEffect(() => {
    setLessons(sortRecentLessons(recentWeekLessons))
  }, [recentWeekLessons])

  const todayLessonCount = useMemo(
    () => lessons.filter((lesson) => lesson.lesson_date === today).length,
    [lessons, today],
  )

  const [formData, setFormData] = useState({
    instructor_id: '',
    lesson_date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    lesson_type: '개인레슨',
    content: '',
    special_note: '',
  })

  // Signature Canvas
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [signatureData, setSignatureData] = useState<string | null>(null)

  const filteredMembers = members.filter((member) =>
    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.phone?.includes(searchTerm)
  )

  const getActivePackage = (member: MemberWithPackages) => {
    return pickSessionPackageForDeduction(member.session_packages)
  }

  const getRemainingSession = (member: MemberWithPackages) => {
    return member.session_packages
      .filter(p => p.is_active)
      .reduce((sum, p) => sum + p.remaining_sessions, 0)
  }

  const handleSelectMember = (member: MemberWithPackages) => {
    setSelectedMember(member)
    setIsRegistering(true)
  }

  // Canvas drawing functions
  const initCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    ctx.fillStyle = '#1B2838'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.strokeStyle = '#AAFF00'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  useEffect(() => {
    if (showSignature) {
      setTimeout(initCanvas, 100)
    }
  }, [showSignature])

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!isDrawing) return
    
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  const stopDrawing = () => {
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas) {
      setSignatureData(canvas.toDataURL())
    }
  }

  const clearSignature = () => {
    setSignatureData(null)
    initCanvas()
  }

  const handleSubmitLesson = async () => {
    if (!selectedMember) return
    
    setIsLoading(true)
    const supabase = createClient()

    // Get active package
    const activePackage = getActivePackage(selectedMember)
    if (!activePackage) {
      alert('활성 수업권이 없습니다.')
      setIsLoading(false)
      return
    }

    // Create signature record if exists
    let signatureId = null
    if (signatureData) {
      const { data: sigData } = await supabase
        .from('signatures')
        .insert({
          member_id: selectedMember.id,
          signature_data: signatureData,
        })
        .select('id')
        .single()
      
      signatureId = sigData?.id
    }

    // Create lesson
    const { data: lesson, error } = await supabase
      .from('lessons')
      .insert({
        member_id: selectedMember.id,
        instructor_id: formData.instructor_id || null,
        session_package_id: activePackage.id,
        lesson_date: formData.lesson_date,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        lesson_type: formData.lesson_type,
        content: formData.content || null,
        special_note: formData.special_note || null,
        attendance_status: 'present',
        session_deducted: true,
        signature_id: signatureId,
      })
      .select(`
        *,
        member:members(name, phone),
        instructor:instructors(name)
      `)
      .single()

    if (!error && lesson) {
      if (shouldDeductSessionOnLesson(activePackage.note)) {
        await supabase
          .from('session_packages')
          .update({
            remaining_sessions: activePackage.remaining_sessions - 1,
            is_active: activePackage.remaining_sessions - 1 > 0,
          })
          .eq('id', activePackage.id)
      }

      // Update signature with lesson_id
      if (signatureId) {
        await supabase
          .from('signatures')
          .update({ lesson_id: lesson.id })
          .eq('id', signatureId)
      }

      setLessons((prev) =>
        sortRecentLessons(
          [lesson as LessonWithRelations, ...prev].filter(
            (item) => item.lesson_date >= dateFrom && item.lesson_date <= dateTo,
          ),
        ),
      )
      resetForm()
    }

    setIsLoading(false)
    router.refresh()
  }

  const resetForm = () => {
    setSelectedMember(null)
    setIsRegistering(false)
    setShowSignature(false)
    setSignatureData(null)
    setFormData({
      instructor_id: '',
      lesson_date: new Date().toISOString().split('T')[0],
      start_time: '',
      end_time: '',
      lesson_type: '개인레슨',
      content: '',
      special_note: '',
    })
  }

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">오늘 수업</p>
                <p className="text-2xl font-bold">{todayLessonCount}</p>
              </div>
              <CalendarCheck className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">활성 회원</p>
                <p className="text-2xl font-bold">{members.length}</p>
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
                <p className="text-2xl font-bold">{instructors.length}</p>
              </div>
              <User className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Member Selection */}
        <Card>
          <CardHeader>
            <CardTitle>회원 선택</CardTitle>
            <CardDescription>수업을 등록할 회원을 선택하세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="이름 또는 연락처 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2">
              {filteredMembers.map((member) => {
                const remaining = getRemainingSession(member)
                return (
                  <div
                    key={member.id}
                    onClick={() => handleSelectMember(member)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors hover:border-primary/50 ${
                      selectedMember?.id === member.id ? 'border-primary bg-primary/10' : 'border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {member.phone} {member.sport && `| ${member.sport}`}
                        </p>
                      </div>
                      <Badge 
                        variant={remaining > 3 ? 'default' : remaining > 0 ? 'secondary' : 'destructive'}
                      >
                        {remaining}회 남음
                      </Badge>
                    </div>
                  </div>
                )
              })}
              {filteredMembers.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">검색 결과가 없습니다.</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent week lessons */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              최근 일주일 수업 현황
            </CardTitle>
            <CardDescription>오늘부터 역순 · 최근 7일</CardDescription>
          </CardHeader>
          <CardContent>
            {lessons.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                최근 일주일 등록된 수업이 없습니다.
              </p>
            ) : (
              <div className="max-h-[min(20rem,45vh)] overflow-y-auto overscroll-y-contain rounded-md border border-border [-ms-overflow-style:auto] [scrollbar-width:thin]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card">
                    <TableRow>
                      <TableHead>날짜</TableHead>
                      <TableHead>회원</TableHead>
                      <TableHead>강사</TableHead>
                      <TableHead>시간</TableHead>
                      <TableHead>유형</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lessons.map((lesson) => (
                      <TableRow key={lesson.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatLessonDateLabel(lesson.lesson_date)}
                        </TableCell>
                        <TableCell className="font-medium">{lesson.member?.name}</TableCell>
                        <TableCell>{lesson.instructor?.name || '-'}</TableCell>
                        <TableCell className="tabular-nums">
                          {formatLessonTime(lesson.start_time)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{normalizeLessonType(lesson.lesson_type)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Registration Dialog */}
      <Dialog open={isRegistering} onOpenChange={setIsRegistering}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>수업 등록</DialogTitle>
            <DialogDescription>
              {selectedMember?.name} 회원의 수업을 등록합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedMember && (
              <div className="p-3 rounded-lg bg-secondary/50">
                <div className="flex justify-between items-center">
                  <span className="text-sm">잔여 수업</span>
                  <span className="font-bold text-primary">
                    {getRemainingSession(selectedMember)}회
                  </span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>날짜</Label>
                <Input
                  type="date"
                  value={formData.lesson_date}
                  onChange={(e) => setFormData({ ...formData, lesson_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>강사</Label>
                <Select
                  value={formData.instructor_id}
                  onValueChange={(v) => setFormData({ ...formData, instructor_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="강사 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {instructors.map((instructor) => (
                      <SelectItem key={instructor.id} value={instructor.id}>
                        {instructor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-4">
                <Label htmlFor="reg-start-time">시작 시간</Label>
                <Label htmlFor="reg-end-time">종료 시간</Label>
              </div>
              <SimpleTimeRangeInput
                startId="reg-start-time"
                endId="reg-end-time"
                startValue={formData.start_time}
                endValue={formData.end_time}
                onStartChange={(start_time) =>
                  setFormData({ ...formData, start_time })
                }
                onEndChange={(end_time) =>
                  setFormData({ ...formData, end_time })
                }
              />
              <p className="text-xs text-muted-foreground">
                예: 18:00~19:30 (시작 칸에 한 번에 입력 가능)
              </p>
            </div>

            <div className="space-y-2">
              <Label>수업 유형</Label>
              <Select
                value={formData.lesson_type}
                onValueChange={(v) => setFormData({ ...formData, lesson_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LESSON_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>수업 내용</Label>
              <Textarea
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="오늘 진행한 수업 내용"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>
              취소
            </Button>
            <Button onClick={() => setShowSignature(true)}>
              <PenTool className="h-4 w-4 mr-2" />
              서명 받기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature Dialog */}
      <Dialog open={showSignature} onOpenChange={setShowSignature}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>서명</DialogTitle>
            <DialogDescription>
              아래에 서명해주세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="border border-border rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                width={400}
                height={200}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full touch-none cursor-crosshair"
              />
            </div>
            
            <Button variant="outline" onClick={clearSignature} className="w-full">
              <RotateCcw className="h-4 w-4 mr-2" />
              다시 서명
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignature(false)}>
              취소
            </Button>
            <Button 
              onClick={handleSubmitLesson} 
              disabled={isLoading || !signatureData}
            >
              <Plus className="h-4 w-4 mr-2" />
              {isLoading ? '등록 중...' : '수업 등록'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
