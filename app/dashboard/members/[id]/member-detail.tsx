'use client'

import Link from 'next/link'
import { Member, SessionPackage, Lesson } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ArrowLeft, Edit, User, Phone, Calendar, Target, AlertTriangle, FileText, CreditCard } from 'lucide-react'
import { formatMemberAge, formatBirthDateDisplay, formatPrimaryInstructorName } from '@/lib/member-utils'
import { MemberAccountLink } from '@/components/members/member-account-link'

interface MemberDetailProps {
  member: Member & { primary_instructor?: { id: string; name: string } | null }
  sessionPackages: SessionPackage[]
  lessons: (Lesson & { instructor?: { name: string } | null })[]
}

export function MemberDetail({ member, sessionPackages, lessons }: MemberDetailProps) {
  const activePackage = sessionPackages.find(p => p.is_active && p.remaining_sessions > 0)
  const totalRemainingSessions = sessionPackages
    .filter(p => p.is_active)
    .reduce((sum, p) => sum + p.remaining_sessions, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/members">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-bold">{member.name}</h1>
              <Badge variant={member.is_active ? 'default' : 'secondary'}>
                {member.is_active ? '활성' : '비활성'}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              등록일: {new Date(member.registered_at).toLocaleDateString('ko-KR')}
            </p>
          </div>
        </div>
        <Link href={`/dashboard/members/${member.id}/edit`}>
          <Button>
            <Edit className="h-4 w-4 mr-2" />
            수정
          </Button>
        </Link>
      </div>

      {/* Info Cards Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              기본 정보
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">생년월일</span>
              <span>{formatBirthDateDisplay(member.birth_date)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">나이</span>
              <span>{formatMemberAge(member)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">학년/직업</span>
              <span>{member.grade || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">종목</span>
              <span>{member.sport || '-'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Phone className="h-5 w-5 text-primary" />
              연락처
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">본인</span>
              <span>{member.phone || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">보호자</span>
              <span>{member.parent_phone || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">담당 강사</span>
              <span>{formatPrimaryInstructorName(member.primary_instructor)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Physical Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              신체 정보
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">키</span>
              <span>{member.height_cm ? `${member.height_cm}cm` : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">몸무게</span>
              <span>{member.weight_kg ? `${member.weight_kg}kg` : '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">BMI</span>
              <span className={member.bmi ? (
                member.bmi < 18.5 ? 'text-blue-400' :
                member.bmi < 23 ? 'text-green-400' :
                member.bmi < 25 ? 'text-yellow-400' : 'text-red-400'
              ) : ''}>
                {member.bmi ? member.bmi.toFixed(1) : '-'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Session Info */}
        <Card className={totalRemainingSessions <= 3 && totalRemainingSessions > 0 ? 'border-warning' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" />
              수업권 현황
              {totalRemainingSessions <= 3 && totalRemainingSessions > 0 && (
                <AlertTriangle className="h-4 w-4 text-warning" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4">
              <p className="text-4xl font-bold text-primary">
                {totalRemainingSessions}
              </p>
              <p className="text-sm text-muted-foreground mt-1">잔여 수업</p>
            </div>
            {activePackage && (
              <div className="text-sm text-muted-foreground space-y-1 border-t border-border pt-3 mt-3">
                <p>현재 수업권: {activePackage.total_sessions}회</p>
                {activePackage.expires_at && (
                  <p>만료일: {activePackage.expires_at}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Goals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Target className="h-5 w-5 text-primary" />
              운동 목표
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{member.goal || '설정된 목표가 없습니다.'}</p>
          </CardContent>
        </Card>

        {/* Injury History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-warning" />
              부상 이력
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{member.injury_history || '기록된 부상 이력이 없습니다.'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Memo */}
      {member.memo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              메모
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{member.memo}</p>
          </CardContent>
        </Card>
      )}

      {/* Session Packages */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            수업권 내역
          </CardTitle>
          <Link href={`/dashboard/members/${member.id}/packages/new`}>
            <Button size="sm">수업권 추가</Button>
          </Link>
        </CardHeader>
        <CardContent>
          {sessionPackages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">등록된 수업권이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>총 회차</TableHead>
                  <TableHead>잔여</TableHead>
                  <TableHead>금액</TableHead>
                  <TableHead>결제일</TableHead>
                  <TableHead>만료일</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap text-center">상태</TableHead>
                  <TableHead className="w-[1%] whitespace-nowrap text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessionPackages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell>{pkg.total_sessions}회</TableCell>
                    <TableCell className={pkg.remaining_sessions <= 3 ? 'text-warning font-medium' : ''}>
                      {pkg.remaining_sessions}회
                    </TableCell>
                    <TableCell>{pkg.price ? `${pkg.price.toLocaleString()}원` : '-'}</TableCell>
                    <TableCell>{pkg.paid_at || '-'}</TableCell>
                    <TableCell>{pkg.expires_at || '-'}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                        {pkg.is_active ? '사용중' : '종료'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/dashboard/members/${member.id}/packages/${pkg.id}/edit`}>
                        <Button variant="ghost" size="sm" className="h-7 px-2">
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          수정
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Lessons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5 text-primary" />
            최근 수업 기록
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lessons.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">수업 기록이 없습니다.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>날짜</TableHead>
                  <TableHead>강사</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead>출석</TableHead>
                  <TableHead>내용</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lessons.map((lesson) => (
                  <TableRow key={lesson.id}>
                    <TableCell>{lesson.lesson_date}</TableCell>
                    <TableCell>{lesson.instructor?.name || '-'}</TableCell>
                    <TableCell>{lesson.lesson_type}</TableCell>
                    <TableCell>
                      <Badge variant={
                        lesson.attendance_status === 'present' ? 'default' :
                        lesson.attendance_status === 'absent' ? 'destructive' : 'secondary'
                      }>
                        {lesson.attendance_status === 'present' ? '출석' :
                         lesson.attendance_status === 'absent' ? '결석' :
                         lesson.attendance_status === 'makeup' ? '보강' : '취소'}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{lesson.content || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MemberAccountLink
        memberId={member.id}
        memberName={member.name}
        linkedAuthUserId={
          ('auth_user_id' in member ? member.auth_user_id : null) ?? member.user_id
        }
      />
    </div>
  )
}
