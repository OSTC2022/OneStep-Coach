'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, ArrowLeft } from 'lucide-react'
import { createMember, updateMember } from '@/lib/actions/members'
import {
  getMemberAge,
  suggestAgeFromBirthDate,
  AUTO_INSTRUCTOR_ID,
} from '@/lib/member-utils'
import { BirthDateInput } from '@/components/members/birth-date-input'
import { PhoneInput } from '@/components/ui/phone-input'
import { formatKoreanPhoneInput } from '@/lib/phone-format'
import { SportSelectField } from '@/components/members/sport-select-field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { InstructorSelectField } from '@/components/members/instructor-select-field'
import { toast } from 'sonner'
import type { Member, Instructor, MemberFormData } from '@/lib/types'
import Link from 'next/link'

interface MemberFormProps {
  member?: Member
  instructors: Instructor[]
}

export function MemberForm({ member, instructors }: MemberFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState<MemberFormData>({
    name: member?.name || '',
    birth_date: member?.birth_date || '',
    age: member ? (getMemberAge(member) ?? undefined) : undefined,
    grade: member?.grade || '',
    phone: member?.phone ? formatKoreanPhoneInput(member.phone) : '',
    parent_phone: member?.parent_phone
      ? formatKoreanPhoneInput(member.parent_phone)
      : '',
    sport: member?.sport || '',
    gender: member?.gender ?? null,
    height_cm: member?.height_cm || undefined,
    weight_kg: member?.weight_kg || undefined,
    goal: member?.goal || '',
    injury_history: member?.injury_history || '',
    memo: member?.memo || '',
    primary_instructor_id: member?.primary_instructor_id || AUTO_INSTRUCTOR_ID,
  })

  // Calculate BMI preview
  const bmiPreview = formData.height_cm && formData.weight_kg
    ? (formData.weight_kg / Math.pow(formData.height_cm / 100, 2)).toFixed(1)
    : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast.error('이름을 입력해주세요.')
      return
    }

    setIsLoading(true)

    try {
      const result = member
        ? await updateMember(member.id, formData)
        : await createMember(formData)

      if (result.error) {
        toast.error(member ? '회원 수정 실패' : '회원 추가 실패', {
          description: result.error,
        })
        return
      }

      toast.success(member ? '회원 정보가 수정되었습니다.' : '새 회원이 추가되었습니다.')
      router.push(
        member ? `/dashboard/members/${member.id}` : '/dashboard/members?sort=recent_lesson',
      )
    } catch {
      toast.error('오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-6">
        {/* Basic Info */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">기본 정보</CardTitle>
            <p className="text-sm text-muted-foreground">
              이름만 입력해도 회원을 등록할 수 있습니다. 나머지는 나중에 수정 가능합니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">이름 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="홍길동"
                  required
                  className="bg-input border-border"
                />
              </div>
              <BirthDateInput
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
                <Label htmlFor="age">나이</Label>
                <Input
                  id="age"
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
                  className="bg-input border-border"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="grade">학년 / 포지션</Label>
                <Input
                  id="grade"
                  value={formData.grade}
                  onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                  placeholder="중3 / 공격수"
                  className="bg-input border-border"
                />
              </div>
              <SportSelectField
                value={formData.sport}
                onChange={(sport) => setFormData({ ...formData, sport })}
              />
              <div className="space-y-2">
                <Label htmlFor="gender">성별 (랭킹용)</Label>
                <Select
                  value={formData.gender ?? 'unset'}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      gender: value === 'unset' ? null : (value as 'male' | 'female'),
                    })
                  }
                >
                  <SelectTrigger id="gender" className="bg-input border-border">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">미입력</SelectItem>
                    <SelectItem value="male">남자</SelectItem>
                    <SelectItem value="female">여자</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">연락처</Label>
                <PhoneInput
                  id="phone"
                  value={formData.phone ?? ''}
                  onChange={(phone) => setFormData({ ...formData, phone })}
                  placeholder="010-1234-5678"
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="parent_phone">보호자 연락처</Label>
                <PhoneInput
                  id="parent_phone"
                  value={formData.parent_phone ?? ''}
                  onChange={(parent_phone) =>
                    setFormData({ ...formData, parent_phone })
                  }
                  placeholder="010-1234-5678"
                  className="bg-input border-border"
                />
              </div>
            </div>

            <InstructorSelectField
              value={formData.primary_instructor_id}
              onChange={(primary_instructor_id) =>
                setFormData({ ...formData, primary_instructor_id })
              }
              instructors={instructors}
            />
          </CardContent>
        </Card>

        {/* Physical Info */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">신체 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="height_cm">키 (cm)</Label>
                <Input
                  id="height_cm"
                  type="number"
                  step="0.1"
                  value={formData.height_cm || ''}
                  onChange={(e) => setFormData({ ...formData, height_cm: parseFloat(e.target.value) || undefined })}
                  placeholder="175"
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight_kg">몸무게 (kg)</Label>
                <Input
                  id="weight_kg"
                  type="number"
                  step="0.1"
                  value={formData.weight_kg || ''}
                  onChange={(e) => setFormData({ ...formData, weight_kg: parseFloat(e.target.value) || undefined })}
                  placeholder="70"
                  className="bg-input border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>BMI</Label>
                <div className="h-10 px-3 py-2 rounded-md bg-secondary border border-border flex items-center">
                  {bmiPreview ? (
                    <span className="font-mono">
                      {bmiPreview}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">자동 계산</span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="injury_history">부상 이력</Label>
              <Textarea
                id="injury_history"
                value={formData.injury_history}
                onChange={(e) => setFormData({ ...formData, injury_history: e.target.value })}
                placeholder="과거 부상 이력을 입력하세요..."
                className="bg-input border-border min-h-[80px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Goals & Notes */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-lg">목표 및 메모</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="goal">훈련 목표</Label>
              <Textarea
                id="goal"
                value={formData.goal}
                onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                placeholder="운동 목표를 입력하세요..."
                className="bg-input border-border min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">메모</Label>
              <Textarea
                id="memo"
                value={formData.memo}
                onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                placeholder="기타 참고사항..."
                className="bg-input border-border min-h-[80px]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-4">
          <Link href="/dashboard/members">
            <Button type="button" variant="outline" className="w-full sm:w-auto">
              <ArrowLeft className="mr-2 h-4 w-4" />
              취소
            </Button>
          </Link>
          <Button 
            type="submit" 
            disabled={isLoading}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                저장 중...
              </>
            ) : (
              member ? '수정 완료' : '회원 추가'
            )}
          </Button>
        </div>
      </div>
    </form>
  )
}
