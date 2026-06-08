'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MessageCircle, Pencil, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { updateMyInstructorSns } from '@/lib/actions/instructors'
import { updateCenterSettings } from '@/lib/actions/center-settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SnsIdLink } from '@/components/members/sns-id-link'
import { SnsIconLinks } from '@/components/members/sns-icon-links'
import type { CenterSettings, Instructor } from '@/lib/types'

interface StaffSnsCardProps {
  role: 'admin' | 'instructor'
  instructor?: Instructor | null
  centerSettings: CenterSettings
}

export function StaffSnsCard({ role, instructor, centerSettings }: StaffSnsCardProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    kakao_id:
      role === 'admin' ? centerSettings.kakao_id || '' : instructor?.kakao_id || '',
    instagram_id:
      role === 'admin' ? centerSettings.instagram_id || '' : instructor?.instagram_id || '',
    blog_url:
      role === 'admin' ? centerSettings.blog_url || '' : instructor?.blog_url || '',
  })

  const title = role === 'admin' ? '센터 SNS' : '내 SNS'
  const subtitle = role === 'admin' ? centerSettings.name : instructor?.name

  function handleCancel() {
    setFormData({
      kakao_id:
        role === 'admin' ? centerSettings.kakao_id || '' : instructor?.kakao_id || '',
      instagram_id:
        role === 'admin' ? centerSettings.instagram_id || '' : instructor?.instagram_id || '',
      blog_url:
        role === 'admin' ? centerSettings.blog_url || '' : instructor?.blog_url || '',
    })
    setIsEditing(false)
  }

  async function handleSave() {
    setIsSaving(true)
    const result =
      role === 'admin'
        ? await updateCenterSettings({
            kakao_id: formData.kakao_id,
            instagram_id: formData.instagram_id,
            blog_url: formData.blog_url,
          })
        : await updateMyInstructorSns({
            kakao_id: formData.kakao_id,
            instagram_id: formData.instagram_id,
            blog_url: formData.blog_url,
          })
    setIsSaving(false)

    if (result.error) {
      toast.error('저장 실패', { description: result.error })
      return
    }

    toast.success('SNS 정보가 저장되었습니다.')
    setIsEditing(false)
    router.refresh()
  }

  const ownKakao = role === 'admin' ? centerSettings.kakao_id : instructor?.kakao_id
  const ownInstagram = role === 'admin' ? centerSettings.instagram_id : instructor?.instagram_id
  const ownBlog = role === 'admin' ? centerSettings.blog_url : instructor?.blog_url

  const viewContent = (
    <div className="space-y-3">
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      <SnsIconLinks kakaoId={ownKakao} instagramId={ownInstagram} blogUrl={ownBlog} />
      <div className="space-y-2 border-t border-border pt-3 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground shrink-0">카카오톡</span>
          <SnsIdLink value={ownKakao} type="kakao" />
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground shrink-0">인스타그램</span>
          <SnsIdLink value={ownInstagram} type="instagram" />
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground shrink-0">블로그</span>
          <SnsIdLink value={ownBlog} type="blog" />
        </div>
      </div>
      {role === 'instructor' ? (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-sm font-medium">센터 · {centerSettings.name}</p>
          <SnsIconLinks
            kakaoId={centerSettings.kakao_id}
            instagramId={centerSettings.instagram_id}
            blogUrl={centerSettings.blog_url}
            size="sm"
          />
        </div>
      ) : null}
    </div>
  )

  const editContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">카카오톡</label>
        <Input
          value={formData.kakao_id}
          onChange={(e) => setFormData((prev) => ({ ...prev, kakao_id: e.target.value }))}
          placeholder="카카오톡 개인 ID"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">인스타그램</label>
        <Input
          value={formData.instagram_id}
          onChange={(e) => setFormData((prev) => ({ ...prev, instagram_id: e.target.value }))}
          placeholder="@아이디"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm text-muted-foreground">블로그</label>
        <Input
          value={formData.blog_url}
          onChange={(e) => setFormData((prev) => ({ ...prev, blog_url: e.target.value }))}
          placeholder="https://blog.naver.com/아이디"
        />
      </div>
      {role === 'instructor' ? (
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-sm font-medium">센터 · {centerSettings.name}</p>
          <SnsIconLinks
            kakaoId={centerSettings.kakao_id}
            instagramId={centerSettings.instagram_id}
            blogUrl={centerSettings.blog_url}
            size="sm"
          />
        </div>
      ) : null}
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

  const canEdit = role === 'admin' || Boolean(instructor)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <MessageCircle className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        {canEdit && !isEditing ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-primary hover:text-primary"
            onClick={() => setIsEditing(true)}
            aria-label="SNS 수정"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>{isEditing ? editContent : viewContent}</CardContent>
    </Card>
  )
}
