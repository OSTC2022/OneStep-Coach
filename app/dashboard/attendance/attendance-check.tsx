'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { markAttendance } from '@/lib/actions/lessons'
import { toast } from 'sonner'
import { Lesson, AttendanceStatus } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  CalendarX,
  User,
  Phone,
  Filter,
  RefreshCw
} from 'lucide-react'

interface LessonWithRelations extends Lesson {
  member?: { id: string; name: string; phone: string | null; sport: string | null } | null
  instructor?: { id: string; name: string } | null
  signature?: { id: string; signature_data: string } | null
}

interface AttendanceCheckProps {
  initialLessons: LessonWithRelations[]
  instructors: { id: string; name: string }[]
}

const ATTENDANCE_OPTIONS: { value: AttendanceStatus; label: string; icon: React.ElementType; color: string }[] = [
  { value: 'present', label: '출석', icon: CheckCircle2, color: 'text-green-400' },
  { value: 'absent', label: '결석', icon: XCircle, color: 'text-red-400' },
  { value: 'makeup', label: '보강', icon: Clock, color: 'text-yellow-400' },
  { value: 'cancelled', label: '취소', icon: CalendarX, color: 'text-muted-foreground' },
]

export function AttendanceCheck({ initialLessons, instructors }: AttendanceCheckProps) {
  const router = useRouter()
  const [lessons, setLessons] = useState(initialLessons)
  const [instructorFilter, setInstructorFilter] = useState<string>('all')
  const [isUpdating, setIsUpdating] = useState<string | null>(null)

  const filteredLessons = lessons.filter((lesson) => 
    instructorFilter === 'all' || lesson.instructor_id === instructorFilter
  )

  const stats = {
    total: lessons.length,
    present: lessons.filter(l => l.attendance_status === 'present').length,
    absent: lessons.filter(l => l.attendance_status === 'absent').length,
    makeup: lessons.filter(l => l.attendance_status === 'makeup').length,
    cancelled: lessons.filter(l => l.attendance_status === 'cancelled').length,
  }

  const handleStatusChange = async (lessonId: string, newStatus: AttendanceStatus) => {
    setIsUpdating(lessonId)

    const result = await markAttendance(lessonId, newStatus)

    if (result.error) {
      toast.error('출석 처리 실패', { description: result.error })
    } else if (result.data) {
      setLessons(lessons.map(l =>
        l.id === lessonId ? { ...l, ...result.data, attendance_status: newStatus } : l
      ))
    }

    setIsUpdating(null)
    router.refresh()
  }

  const getStatusBadge = (status: AttendanceStatus) => {
    const option = ATTENDANCE_OPTIONS.find(o => o.value === status)
    if (!option) return null
    
    const Icon = option.icon
    return (
      <Badge 
        variant={status === 'present' ? 'default' : status === 'absent' ? 'destructive' : 'secondary'}
        className="gap-1"
      >
        <Icon className="h-3 w-3" />
        {option.label}
      </Badge>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards - Mobile optimized */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">전체</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{stats.present}</p>
            <p className="text-xs text-muted-foreground">출석</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-red-400">{stats.absent}</p>
            <p className="text-xs text-muted-foreground">결석</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-3xl font-bold text-yellow-400">{stats.makeup + stats.cancelled}</p>
            <p className="text-xs text-muted-foreground">보강/취소</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <Select value={instructorFilter} onValueChange={setInstructorFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="강사 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 강사</SelectItem>
            {instructors.map((instructor) => (
              <SelectItem key={instructor.id} value={instructor.id}>
                {instructor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" onClick={() => router.refresh()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Lesson Cards - Mobile optimized */}
      {filteredLessons.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            오늘 예정된 수업이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredLessons.map((lesson) => (
            <Card key={lesson.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col sm:flex-row">
                  {/* Member Info */}
                  <div className="flex-1 p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{lesson.member?.name}</h3>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {lesson.instructor?.name || '강사 미배정'}
                        </p>
                      </div>
                      {getStatusBadge(lesson.attendance_status)}
                    </div>
                    
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      {lesson.member?.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {lesson.member.phone}
                        </span>
                      )}
                      {lesson.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {lesson.start_time}{lesson.end_time && ` - ${lesson.end_time}`}
                        </span>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {lesson.lesson_type}
                      </Badge>
                    </div>

                    {lesson.content && (
                      <p className="text-sm bg-secondary/50 p-2 rounded">
                        {lesson.content}
                      </p>
                    )}
                  </div>

                  {/* Status Buttons - Mobile optimized */}
                  <div className="flex sm:flex-col border-t sm:border-t-0 sm:border-l border-border">
                    {ATTENDANCE_OPTIONS.map((option) => {
                      const Icon = option.icon
                      const isActive = lesson.attendance_status === option.value
                      const isLoading = isUpdating === lesson.id
                      
                      return (
                        <button
                          key={option.value}
                          onClick={() => handleStatusChange(lesson.id, option.value)}
                          disabled={isLoading}
                          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 p-3 sm:p-4 transition-colors ${
                            isActive 
                              ? 'bg-primary/20' 
                              : 'hover:bg-secondary'
                          } ${isLoading ? 'opacity-50' : ''}`}
                        >
                          <Icon className={`h-5 w-5 ${option.color}`} />
                          <span className="text-xs sm:sr-only">{option.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Signature indicator */}
                {lesson.signature && (
                  <div className="px-4 pb-2">
                    <span className="text-xs text-primary">서명 완료</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
