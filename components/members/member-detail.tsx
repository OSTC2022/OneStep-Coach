'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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
import {
  ArrowLeft,
  Edit,
  Phone,
  Calendar,
  Target,
  Activity,
  AlertTriangle,
  CreditCard,
  ClipboardList,
  Trash2,
  Plus,
} from 'lucide-react'
import { deleteMember, toggleMemberStatus } from '@/lib/actions/members'
import {
  formatBodyMetric,
  formatMemberAge,
  formatMemberContactDisplay,
  formatBirthDateDisplay,
  formatPrimaryInstructorName,
  resolveMemberBmi,
} from '@/lib/member-utils'
import { toast } from 'sonner'
import type { Member, SessionPackage, Lesson } from '@/lib/types'

interface MemberDetailProps {
  member: Member
  packages: SessionPackage[]
  lessons: Lesson[]
}

export function MemberDetail({ member, packages, lessons }: MemberDetailProps) {
  const router = useRouter()
  const activePackage = packages.find(p => p.is_active && p.remaining_sessions > 0)
  const displayBmi = resolveMemberBmi(member)

  function getBmiCategory(bmi: number) {
    if (bmi < 18.5) return { label: '저체중', color: 'text-chart-2', bg: 'bg-chart-2/10' }
    if (bmi < 25) return { label: '정상', color: 'text-success', bg: 'bg-success/10' }
    if (bmi < 30) return { label: '과체중', color: 'text-warning', bg: 'bg-warning/10' }
    return { label: '비만', color: 'text-destructive', bg: 'bg-destructive/10' }
  }

  async function handleDelete() {
    const result = await deleteMember(member.id)
    if (result.error) {
      toast.error('회원 삭제 실패', { description: result.error })
    } else {
      toast.success('회원이 휴지통으로 이동했습니다.')
      router.push('/dashboard/members')
    }
  }

  async function handleToggleStatus() {
    const result = await toggleMemberStatus(member.id, !member.is_active)
    if (result.error) {
      toast.error('상태 변경 실패', { description: result.error })
    } else {
      toast.success(member.is_active ? '회원이 비활성화되었습니다.' : '회원이 활성화되었습니다.')
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/members">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground">{member.name}</h1>
              <Badge 
                variant={member.is_active ? 'default' : 'secondary'}
                className={member.is_active ? 'bg-success text-success-foreground' : ''}
              >
                {member.is_active ? '활성' : '비활성'}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              {member.sport && `${member.sport} · `}
              {member.grade && `${member.grade} · `}
              등록일: {member.registered_at}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/members/${member.id}/edit`}>
            <Button variant="outline">
              <Edit className="mr-2 h-4 w-4" />
              수정
            </Button>
          </Link>
          <Button variant="outline" onClick={handleToggleStatus}>
            {member.is_active ? '비활성화' : '활성화'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>회원 삭제</AlertDialogTitle>
                <AlertDialogDescription>
                  정말로 {member.name} 회원을 삭제하시겠습니까? 휴지통으로 이동하며, 회원
                  관리 화면의 휴지통에서 복구할 수 있습니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                  삭제
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact & Basic Info */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                연락처 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground">연락처</p>
                <p className="font-medium">{formatMemberContactDisplay(member)}</p>
              </div>
              {member.phone?.trim() && member.parent_phone?.trim() ? (
                <>
                  <div>
                    <p className="text-sm text-muted-foreground">본인</p>
                    <p className="font-medium">{member.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">보호자</p>
                    <p className="font-medium">{member.parent_phone}</p>
                  </div>
                </>
              ) : null}
              <div>
                <p className="text-sm text-muted-foreground">생년월일</p>
                <p className="font-medium">{formatBirthDateDisplay(member.birth_date)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">나이</p>
                <p className="font-medium">{formatMemberAge(member)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">담당 강사</p>
                <p className="font-medium">{formatPrimaryInstructorName(member.primary_instructor)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Physical Info */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-chart-2" />
                신체 정보
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="p-4 rounded-lg bg-secondary/50 text-center">
                  <p className="text-2xl font-bold">
                    {member.height_cm ? formatBodyMetric(member.height_cm) : '-'}
                  </p>
                  <p className="text-sm text-muted-foreground">키 (cm)</p>
                </div>
                <div className="p-4 rounded-lg bg-secondary/50 text-center">
                  <p className="text-2xl font-bold">
                    {member.weight_kg ? formatBodyMetric(member.weight_kg) : '-'}
                  </p>
                  <p className="text-sm text-muted-foreground">몸무게 (kg)</p>
                </div>
                <div
                  className={`p-4 rounded-lg text-center ${
                    displayBmi ? getBmiCategory(displayBmi).bg : 'bg-secondary/50'
                  }`}
                >
                  <p
                    className={`text-2xl font-bold font-mono ${
                      displayBmi ? getBmiCategory(displayBmi).color : ''
                    }`}
                  >
                    {displayBmi != null ? displayBmi.toFixed(1) : '-'}
                  </p>
                  <p className="text-sm text-muted-foreground">BMI</p>
                </div>
                <div className="p-4 rounded-lg bg-primary/10 text-center">
                  <p className="text-2xl font-bold text-primary">{member.sport || '-'}</p>
                  <p className="text-sm text-muted-foreground">종목</p>
                </div>
              </div>

              {member.injury_history && (
                <>
                  <Separator className="my-4" />
                  <div>
                    <div className="flex items-center gap-2 text-warning mb-2">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">부상 이력</span>
                    </div>
                    <p className="text-muted-foreground">{member.injury_history}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Goals & Notes */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5 text-success" />
                목표 및 메모
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {member.goal && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">훈련 목표</p>
                  <p className="text-foreground">{member.goal}</p>
                </div>
              )}
              {member.memo && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">메모</p>
                  <p className="text-foreground">{member.memo}</p>
                </div>
              )}
              {!member.goal && !member.memo && (
                <p className="text-muted-foreground">등록된 목표 및 메모가 없습니다.</p>
              )}
            </CardContent>
          </Card>

          {/* Recent Lessons */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-chart-3" />
                최근 수업
              </CardTitle>
              <Link href={`/dashboard/lessons?member=${member.id}`}>
                <Button variant="ghost" size="sm">전체보기</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {lessons.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  등록된 수업이 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {lessons.map((lesson) => (
                    <div 
                      key={lesson.id} 
                      className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
                    >
                      <div>
                        <p className="font-medium">#{lesson.lesson_no} {lesson.lesson_type}</p>
                        <p className="text-sm text-muted-foreground">
                          {lesson.instructor?.name || '강사 미정'}
                          {lesson.content && ` · ${lesson.content.substring(0, 30)}...`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm">{lesson.lesson_date}</p>
                        <Badge 
                          variant={lesson.attendance_status === 'present' ? 'default' : 'secondary'}
                          className={lesson.attendance_status === 'present' ? 'bg-success text-success-foreground' : ''}
                        >
                          {lesson.attendance_status === 'present' ? '출석' : 
                           lesson.attendance_status === 'absent' ? '결석' : 
                           lesson.attendance_status === 'makeup' ? '보강' : '취소'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Session Package */}
        <div className="space-y-6">
          {/* Active Package */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                수업권
              </CardTitle>
              <Link href={`/dashboard/sessions?member=${member.id}`}>
                <Button size="sm" variant="outline">
                  <Plus className="mr-1 h-4 w-4" />
                  추가
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {activePackage ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-primary/10 text-center">
                    <p className="text-4xl font-bold text-primary">
                      {activePackage.remaining_sessions}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      / {activePackage.total_sessions}회 남음
                    </p>
                  </div>
                  <div className="space-y-2 text-sm">
                    {activePackage.price && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">결제 금액</span>
                        <span className="font-medium">{activePackage.price.toLocaleString()}원</span>
                      </div>
                    )}
                    {activePackage.paid_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">결제일</span>
                        <span>{activePackage.paid_at}</span>
                      </div>
                    )}
                    {activePackage.expires_at && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">만료일</span>
                        <span className={
                          new Date(activePackage.expires_at) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                            ? 'text-warning font-medium'
                            : ''
                        }>
                          {activePackage.expires_at}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">활성 수업권이 없습니다.</p>
                  <Link href={`/dashboard/sessions?member=${member.id}`}>
                    <Button className="mt-4 bg-primary text-primary-foreground">
                      수업권 등록
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Past Packages */}
          {packages.filter(p => !p.is_active || p.remaining_sessions === 0).length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="text-lg">이전 수업권</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {packages
                  .filter(p => !p.is_active || p.remaining_sessions === 0)
                  .slice(0, 3)
                  .map((pkg) => (
                    <div key={pkg.id} className="p-3 rounded-lg bg-secondary/50">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{pkg.total_sessions}회권</span>
                        <Badge variant="secondary">완료</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {pkg.paid_at} 결제
                      </p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {/* Quick Actions */}
          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="text-lg">빠른 작업</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/dashboard/lessons/new?member=${member.id}`} className="block">
                <Button variant="outline" className="w-full justify-start">
                  <Calendar className="mr-2 h-4 w-4" />
                  수업 등록
                </Button>
              </Link>
              <Link href={`/dashboard/attendance?member=${member.id}`} className="block">
                <Button variant="outline" className="w-full justify-start">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  출석 체크
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
