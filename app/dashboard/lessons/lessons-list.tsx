'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SimpleTimeRangeInput } from '@/components/ui/simple-time-range-input'
import { Badge } from '@/components/ui/badge'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Calendar, Clock, Users } from 'lucide-react'
import { toast } from 'sonner'

interface Lesson {
  id: string
  member_id: string
  instructor_id: string | null
  lesson_date: string
  start_time: string | null
  end_time: string | null
  lesson_type: string
  content: string | null
  special_note: string | null
  attendance_status: string
  lesson_no: number | null
  member: { id: string; name: string; phone: string | null } | null
  instructor: { id: string; name: string } | null
}

interface LessonsListProps {
  initialLessons: Lesson[]
  members: { id: string; name: string }[]
  instructors: { id: string; name: string }[]
  selectedDate: string
  selectedMemberId?: string
}

export function LessonsList({ 
  initialLessons, 
  members, 
  instructors, 
  selectedDate,
  selectedMemberId 
}: LessonsListProps) {
  const [lessons, setLessons] = useState(initialLessons)
  const [dateFilter, setDateFilter] = useState(selectedDate)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(!!selectedMemberId)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const [formData, setFormData] = useState({
    member_id: selectedMemberId || '',
    instructor_id: '',
    lesson_date: selectedDate,
    start_time: '10:00',
    end_time: '11:00',
    lesson_type: '개인레슨',
    content: '',
    special_note: '',
  })

  const filteredLessons = lessons.filter((lesson) => {
    if (dateFilter && lesson.lesson_date !== dateFilter) return false
    return true
  })

  // Stats
  const todayLessons = lessons.filter(l => l.lesson_date === selectedDate).length
  const presentCount = lessons.filter(l => l.attendance_status === 'present').length
  const totalLessons = lessons.length

  const handleAddLesson = async () => {
    if (!formData.member_id) {
      toast.error('회원을 선택해주세요.')
      return
    }
    
    setIsLoading(true)
    const supabase = createClient()

    // Get current lesson count for this member to calculate lesson_no
    const { count } = await supabase
      .from('lessons')
      .select('*', { count: 'exact', head: true })
      .eq('member_id', formData.member_id)

    const { data, error } = await supabase
      .from('lessons')
      .insert({
        member_id: formData.member_id,
        instructor_id: formData.instructor_id || null,
        lesson_date: formData.lesson_date,
        start_time: formData.start_time || null,
        end_time: formData.end_time || null,
        lesson_type: formData.lesson_type,
        content: formData.content || null,
        special_note: formData.special_note || null,
        attendance_status: 'present',
        lesson_no: (count || 0) + 1,
      })
      .select(`
        *,
        member:members(id, name, phone),
        instructor:instructors(id, name)
      `)
      .single()

    if (error) {
      toast.error('수업 등록 실패', { description: error.message })
    } else if (data) {
      toast.success('수업이 등록되었습니다.')
      setLessons([data, ...lessons])
      setFormData({
        member_id: '',
        instructor_id: '',
        lesson_date: selectedDate,
        start_time: '10:00',
        end_time: '11:00',
        lesson_type: '개인레슨',
        content: '',
        special_note: '',
      })
      setIsAddDialogOpen(false)
    }
    
    setIsLoading(false)
    router.refresh()
  }

  const handleDateChange = (date: string) => {
    setDateFilter(date)
    router.push(`/dashboard/lessons?date=${date}`)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'present':
        return <Badge className="bg-success text-success-foreground">출석</Badge>
      case 'absent':
        return <Badge variant="destructive">결석</Badge>
      case 'makeup':
        return <Badge className="bg-warning text-warning-foreground">보강</Badge>
      case 'cancelled':
        return <Badge variant="secondary">취소</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">오늘 수업</CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayLessons}</div>
            <p className="text-xs text-muted-foreground">{selectedDate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">출석률</CardTitle>
            <Users className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalLessons > 0 ? Math.round((presentCount / totalLessons) * 100) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">{presentCount}/{totalLessons} 출석</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">전체 수업</CardTitle>
            <Clock className="h-4 w-4 text-chart-2" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLessons}</div>
            <p className="text-xs text-muted-foreground">누적 기록</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full sm:w-auto"
          />
          <Button 
            variant="outline" 
            onClick={() => handleDateChange(new Date().toISOString().split('T')[0])}
          >
            오늘
          </Button>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              수업 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>수업 등록</DialogTitle>
              <DialogDescription>
                새 수업을 등록합니다.
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

              <div className="space-y-2">
                <Label htmlFor="instructor">담당 강사</Label>
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

              <div className="space-y-2">
                <Label htmlFor="lesson_date">수업 날짜</Label>
                <Input
                  id="lesson_date"
                  type="date"
                  value={formData.lesson_date}
                  onChange={(e) => setFormData({ ...formData, lesson_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <Label htmlFor="start_time">시작 시간</Label>
                  <Label htmlFor="end_time">종료 시간</Label>
                </div>
                <SimpleTimeRangeInput
                  startId="start_time"
                  endId="end_time"
                  startValue={formData.start_time}
                  endValue={formData.end_time}
                  onStartChange={(start_time) =>
                    setFormData({ ...formData, start_time })
                  }
                  onEndChange={(end_time) =>
                    setFormData({ ...formData, end_time })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lesson_type">수업 유형</Label>
                <Select
                  value={formData.lesson_type}
                  onValueChange={(v) => setFormData({ ...formData, lesson_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="개인레슨">개인레슨</SelectItem>
                    <SelectItem value="그룹레슨">그룹레슨</SelectItem>
                    <SelectItem value="체험레슨">체험레슨</SelectItem>
                    <SelectItem value="러닝레슨">러닝레슨</SelectItem>
                    <SelectItem value="육상부">육상부</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="content">수업 내용</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="수업 내용을 입력하세요..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="special_note">특이사항</Label>
                <Textarea
                  id="special_note"
                  value={formData.special_note}
                  onChange={(e) => setFormData({ ...formData, special_note: e.target.value })}
                  placeholder="특이사항..."
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddLesson} disabled={isLoading}>
                {isLoading ? '등록 중...' : '등록'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="min-w-0 rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>회원</TableHead>
              <TableHead className="hidden sm:table-cell">강사</TableHead>
              <TableHead>날짜/시간</TableHead>
              <TableHead className="hidden md:table-cell">유형</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="hidden lg:table-cell">내용</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLessons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  등록된 수업이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredLessons.map((lesson) => (
                <TableRow key={lesson.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{lesson.member?.name}</p>
                      <p className="text-xs text-muted-foreground">#{lesson.lesson_no}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {lesson.instructor?.name || '-'}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{lesson.lesson_date}</p>
                      <p className="text-xs text-muted-foreground">
                        {lesson.start_time && lesson.end_time 
                          ? `${lesson.start_time} - ${lesson.end_time}`
                          : lesson.start_time || '-'}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{lesson.lesson_type}</Badge>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(lesson.attendance_status)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell max-w-[200px]">
                    <p className="truncate text-sm text-muted-foreground">
                      {lesson.content || '-'}
                    </p>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
