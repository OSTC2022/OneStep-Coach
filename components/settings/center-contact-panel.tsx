'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import {
  formatCenterPhonesForStorage,
  parseCenterPhones,
} from '@/lib/center-contact'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { CenterSettings } from '@/lib/types'

interface CenterContactPanelProps {
  centerSettings: CenterSettings
  defaultEditing?: boolean
}

function isContactEmpty(settings: CenterSettings): boolean {
  return ![
    settings.center_phone,
    settings.kakao_id,
    settings.instagram_id,
    settings.blog_url,
    settings.naver_place_url,
    settings.center_address,
    settings.business_hours,
  ].some((value) => value?.trim())
}

function toFormState(settings: CenterSettings) {
  const phones = parseCenterPhones(settings.center_phone)
  return {
    name: settings.name || '',
    center_phones: phones.length > 0 ? phones : [''],
    kakao_id: settings.kakao_id || '',
    instagram_id: settings.instagram_id || '',
    blog_url: settings.blog_url || '',
    naver_place_url: settings.naver_place_url || '',
    center_address: settings.center_address || '',
    business_hours: settings.business_hours || '',
    show_instructor_contact: settings.show_instructor_contact ?? false,
  }
}

export function CenterContactPanel({
  centerSettings,
  defaultEditing = false,
}: CenterContactPanelProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(
    defaultEditing || isContactEmpty(centerSettings),
  )
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState(() => toFormState(centerSettings))

  useEffect(() => {
    setFormData(toFormState(centerSettings))
  }, [centerSettings])

  function handleCancel() {
    setFormData(toFormState(centerSettings))
    setIsEditing(false)
  }

  async function handleSave() {
    setIsSaving(true)
    const result = await updateCenterSettings({
      name: formData.name,
      kakao_id: formData.kakao_id,
      instagram_id: formData.instagram_id,
      blog_url: formData.blog_url,
      center_phone: formatCenterPhonesForStorage(formData.center_phones),
      naver_place_url: formData.naver_place_url,
      center_address: formData.center_address,
      business_hours: formData.business_hours,
      show_instructor_contact: formData.show_instructor_contact,
    })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      if (result.data) {
        setIsEditing(false)
        router.refresh()
      }
      return
    }

    toast.success('센터 연락 정보가 저장되었습니다.')
    setIsEditing(false)
    router.refresh()
  }

  const viewContent = (
    <div className="space-y-4 text-sm">
      <Button
        type="button"
        className="min-h-11 w-full sm:w-auto"
        onClick={() => setIsEditing(true)}
      >
        <Pencil className="mr-2 h-4 w-4" />
        센터 연락 정보 수정
      </Button>
      <div className="grid gap-3 sm:grid-cols-2">
        <InfoRow label="센터명" value={centerSettings.name} />
        <InfoRow
          label="대표 전화"
          value={parseCenterPhones(centerSettings.center_phone).join(' · ') || null}
        />
        <InfoRow label="카카오톡 채널" value={centerSettings.kakao_id} />
        <InfoRow label="인스타그램" value={centerSettings.instagram_id} />
        <InfoRow label="블로그" value={centerSettings.blog_url} />
        <InfoRow label="네이버 플레이스" value={centerSettings.naver_place_url} />
      </div>
      <InfoRow label="주소" value={centerSettings.center_address} />
      <InfoRow label="운영 시간" value={centerSettings.business_hours} />
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
        <span className="text-muted-foreground">회원 포털 코치 전화 노출</span>
        <span className="font-medium">
          {centerSettings.show_instructor_contact ? '노출' : '숨김'}
        </span>
      </div>
    </div>
  )

  const editContent = (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="센터명"
          value={formData.name}
          onChange={(value) => setFormData((prev) => ({ ...prev, name: value }))}
          placeholder="OneStep 트레이닝"
        />
      </div>
      <div className="space-y-2">
        <Label>대표 전화</Label>
        <p className="text-xs text-muted-foreground">
          여러 번호를 추가할 수 있습니다. 첫 번째 번호가 회원 포털 기본 연락처로
          사용됩니다.
        </p>
        <div className="space-y-2">
          {formData.center_phones.map((phone, index) => (
            <div key={`center-phone-${index}`} className="flex gap-2">
              <Input
                value={phone}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    center_phones: prev.center_phones.map((value, phoneIndex) =>
                      phoneIndex === index ? e.target.value : value,
                    ),
                  }))
                }
                placeholder={index === 0 ? '031-375-6163' : '추가 대표 번호'}
              />
              {formData.center_phones.length > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      center_phones: prev.center_phones.filter(
                        (_, phoneIndex) => phoneIndex !== index,
                      ),
                    }))
                  }
                  aria-label="대표 번호 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setFormData((prev) => ({
              ...prev,
              center_phones: [...prev.center_phones, ''],
            }))
          }
        >
          <Plus className="mr-1.5 h-4 w-4" />
          대표 번호 추가
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="카카오톡 채널"
          value={formData.kakao_id}
          onChange={(value) => setFormData((prev) => ({ ...prev, kakao_id: value }))}
          placeholder="pf.kakao.com/_xxxxx 또는 채널 URL"
        />
        <Field
          label="인스타그램"
          value={formData.instagram_id}
          onChange={(value) =>
            setFormData((prev) => ({ ...prev, instagram_id: value }))
          }
          placeholder="@센터아이디"
        />
        <Field
          label="블로그"
          value={formData.blog_url}
          onChange={(value) => setFormData((prev) => ({ ...prev, blog_url: value }))}
          placeholder="https://blog.naver.com/아이디"
        />
        <Field
          label="네이버 플레이스"
          value={formData.naver_place_url}
          onChange={(value) =>
            setFormData((prev) => ({ ...prev, naver_place_url: value }))
          }
          placeholder="https://naver.me/..."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="center_address">주소</Label>
        <Input
          id="center_address"
          value={formData.center_address}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, center_address: e.target.value }))
          }
          placeholder="센터 주소"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="business_hours">운영 시간</Label>
        <Textarea
          id="business_hours"
          value={formData.business_hours}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, business_hours: e.target.value }))
          }
          placeholder="평일 10:00–22:00 · 토 09:00–18:00"
          rows={2}
        />
      </div>
      <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-3">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">담당 코치 전화 노출</p>
          <p className="text-xs text-muted-foreground">
            회원 마이페이지에 코치 개인 전화를 표시합니다.
          </p>
        </div>
        <Switch
          checked={formData.show_instructor_contact}
          onCheckedChange={(checked) =>
            setFormData((prev) => ({
              ...prev,
              show_instructor_contact: checked,
            }))
          }
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-11 flex-1"
          disabled={isSaving}
          onClick={() => void handleSave()}
        >
          <Check className="mr-1.5 h-4 w-4" />
          {isSaving ? '저장 중…' : '저장'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 flex-1"
          disabled={isSaving}
          onClick={handleCancel}
        >
          <X className="mr-1.5 h-4 w-4" />
          취소
        </Button>
      </div>
    </div>
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="h-5 w-5 text-primary" />
          센터 연락 · 채널 설정
        </CardTitle>
        {!isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-primary hover:text-primary"
            onClick={() => setIsEditing(true)}
            aria-label="센터 연락 정보 수정"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>{isEditing ? editContent : viewContent}</CardContent>
    </Card>
  )
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium break-all">{value?.trim() || '-'}</p>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
