'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Member } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Save } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { formatMemberAgeFromBirthDate, resolveMemberAgeAndBirthDate, AUTO_INSTRUCTOR_ID, normalizePrimaryInstructorId } from '@/lib/member-utils'
import { BirthDateInput } from '@/components/members/birth-date-input'
import { SportSelectField } from '@/components/members/sport-select-field'
import { InstructorSelectField } from '@/components/members/instructor-select-field'

interface MemberEditFormProps {
  member: Member
  instructors: { id: string; name: string }[]
}

export function MemberEditForm({ member, instructors }: MemberEditFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: member.name,
    birth_date: member.birth_date || '',
    grade: member.grade || '',
    phone: member.phone || '',
    parent_phone: member.parent_phone || '',
    sport: member.sport || '',
    height_cm: member.height_cm || '',
    weight_kg: member.weight_kg || '',
    goal: member.goal || '',
    injury_history: member.injury_history || '',
    memo: member.memo || '',
    primary_instructor_id: member.primary_instructor_id || AUTO_INSTRUCTOR_ID,
    is_active: member.is_active,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const supabase = createClient()
    const { birth_date, age } = resolveMemberAgeAndBirthDate(formData.birth_date)

    const { error } = await supabase
      .from('members')
      .update({
        name: formData.name,
        birth_date,
        age,
        grade: formData.grade || null,
        phone: formData.phone || null,
        parent_phone: formData.parent_phone || null,
        sport: formData.sport || null,
        height_cm: formData.height_cm ? Number(formData.height_cm) : null,
        weight_kg: formData.weight_kg ? Number(formData.weight_kg) : null,
        goal: formData.goal || null,
        injury_history: formData.injury_history || null,
        memo: formData.memo || null,
        primary_instructor_id: normalizePrimaryInstructorId(formData.primary_instructor_id),
        is_active: formData.is_active,
      })
      .eq('id', member.id)

    setIsLoading(false)

    if (!error) {
      router.push(`/dashboard/members/${member.id}`)
      router.refresh()
    }
  }

  const calculatedBMI = formData.height_cm && formData.weight_kg
    ? (Number(formData.weight_kg) / Math.pow(Number(formData.height_cm) / 100, 2)).toFixed(1)
    : '-'

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/members/${member.id}`}>
            <Button type="button" variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">회원 정보 수정</h1>
            <p className="text-muted-foreground">{member.name}</p>
          </div>
        </div>
        <Button type="submit" disabled={isLoading}>
          <Save className="h-4 w-4 mr-2" />
          {isLoading ? '저장 중...' : '저장'}
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">이름 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <BirthDateInput
              value={formData.birth_date}
              onChange={(birth_date) => setFormData({ ...formData, birth_date })}
            />

            <div className="space-y-2">
              <Label htmlFor="age-preview">나이 (자동)</Label>
              <Input
                id="age-preview"
                value={formatMemberAgeFromBirthDate(formData.birth_date)}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="grade">학년/직업</Label>
              <Input
                id="grade"
                value={formData.grade}
                onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
              />
            </div>

            <SportSelectField
              value={formData.sport}
              onChange={(sport) => setFormData({ ...formData, sport })}
              label="종목"
            />

            <InstructorSelectField
              value={formData.primary_instructor_id}
              onChange={(primary_instructor_id) =>
                setFormData({ ...formData, primary_instructor_id })
              }
              instructors={instructors}
            />

            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">활성 상태</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle>연락처</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">본인 연락처</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="010-1234-5678"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parent_phone">보호자 연락처</Label>
              <Input
                id="parent_phone"
                value={formData.parent_phone}
                onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                placeholder="010-9876-5432"
              />
            </div>
          </CardContent>
        </Card>

        {/* Physical Info */}
        <Card>
          <CardHeader>
            <CardTitle>신체 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="height_cm">키 (cm)</Label>
                <Input
                  id="height_cm"
                  type="number"
                  value={formData.height_cm}
                  onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="weight_kg">몸무게 (kg)</Label>
                <Input
                  id="weight_kg"
                  type="number"
                  value={formData.weight_kg}
                  onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>BMI (자동계산)</Label>
                <Input value={calculatedBMI} disabled className="bg-muted" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="injury_history">부상 이력</Label>
              <Textarea
                id="injury_history"
                value={formData.injury_history}
                onChange={(e) => setFormData({ ...formData, injury_history: e.target.value })}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Goals & Notes */}
        <Card>
          <CardHeader>
            <CardTitle>목표 및 메모</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="goal">운동 목표</Label>
              <Textarea
                id="goal"
                value={formData.goal}
                onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="memo">메모</Label>
              <Textarea
                id="memo"
                value={formData.memo}
                onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
