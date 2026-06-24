'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { ProfileSettingsForm } from '@/components/dashboard/profile-settings-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { MemberGender } from '@/lib/running-league/ranking-gender'
import type { User } from '@/lib/types'

interface ProfileEditPageProps {
  user: User
  backHref: string
  backLabel: string
  memberGender?: MemberGender | null
  showMemberGender?: boolean
}

export function ProfileEditPage({
  user,
  backHref,
  backLabel,
  memberGender = null,
  showMemberGender = false,
}: ProfileEditPageProps) {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href={backHref} aria-label={`${backLabel}으로`}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold lg:text-2xl">프로필 수정</h1>
          <p className="text-sm text-muted-foreground">
            사진·이름·연락처{showMemberGender ? '·성별' : ''}·SNS 정보를 변경합니다.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">내 프로필</CardTitle>
          <CardDescription>
            로그인 이메일은 변경할 수 없습니다. 저장 후 상단 프로필 사진에
            반영됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileSettingsForm
            user={user}
            idPrefix="profile-page"
            memberGender={memberGender}
            showMemberGender={showMemberGender}
          />
        </CardContent>
      </Card>
    </div>
  )
}
