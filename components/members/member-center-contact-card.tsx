'use client'

import { useMemo, useState, type ReactNode } from 'react'
import {
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  Globe,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { KakaoChannelInquiryDialog } from '@/components/members/kakao-channel-inquiry-dialog'
import { PhoneContactDialog } from '@/components/members/phone-contact-dialog'
import {
  CENTER_CONTACT_TOPICS,
  KAKAO_CHANNEL_DEFAULT_ID,
  COACH_INQUIRY_HINT,
  COACH_UNASSIGNED_HINT,
  formatCoachDisplayName,
  hasExternalUrl,
  hasTelLink,
  isUnassignedCoach,
  openBlog,
  openInstagram,
  type MemberCenterContactView,
  type MemberCoachContactView,
} from '@/lib/center-contact'
import { cn } from '@/lib/utils'

interface MemberCenterContactCardProps {
  coach: MemberCoachContactView
  center: MemberCenterContactView
}

function RoleCard({
  title,
  subtitle,
  hint,
}: {
  title: string
  subtitle: string
  hint: string
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/10 px-3.5 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary/90">
        {title}
      </p>
      <p className="mt-1.5 text-sm font-medium text-foreground">{subtitle}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{hint}</p>
    </div>
  )
}

function ButtonGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  )
}

function ContactActionButton({
  label,
  icon,
  ready,
  primary = false,
  onClick,
  href,
}: {
  label: string
  icon: ReactNode
  ready: boolean
  primary?: boolean
  onClick?: () => void
  href?: string
}) {
  const className = cn(
    'min-h-11 w-full gap-2',
    ready && primary && 'bg-primary text-primary-foreground hover:bg-primary/90',
    ready && !primary && 'border-border/70 bg-background/40',
    !ready && 'border-border/40 bg-muted/20 text-muted-foreground opacity-70',
  )

  if (!ready) {
    return (
      <Button type="button" variant="outline" disabled className={className}>
        {icon}
        <span className="truncate">{label}</span>
      </Button>
    )
  }

  if (href) {
    return (
      <Button
        asChild
        variant={primary ? 'default' : 'outline'}
        className={className}
      >
        <a href={href}>
          {icon}
          {label}
        </a>
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant={primary ? 'default' : 'outline'}
      className={className}
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  )
}

function buildUnavailableNotice(flags: {
  kakao: boolean
  phone: boolean
  place: boolean
}): string | null {
  const missing: string[] = []
  if (!flags.kakao) missing.push('카카오톡')
  if (!flags.phone) missing.push('전화')
  if (!flags.place) missing.push('위치')
  if (missing.length === 0) return null
  return `${missing.join(', ')} 정보는 준비 중입니다.`
}

export function MemberCenterContactCard({
  coach,
  center,
}: MemberCenterContactCardProps) {
  const [kakaoDialogOpen, setKakaoDialogOpen] = useState(false)
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false)
  const [phoneDialogPhones, setPhoneDialogPhones] = useState<string[]>([])
  const [phoneDialogTitle, setPhoneDialogTitle] = useState('연락처')
  const unassigned = isUnassignedCoach(coach.name)

  const kakaoChannel = center.kakaoChannel?.trim() || KAKAO_CHANNEL_DEFAULT_ID
  const kakaoReady = Boolean(kakaoChannel)
  const centerPhones =
    center.centerPhones.length > 0
      ? center.centerPhones
      : center.centerPhone
        ? [center.centerPhone]
        : []
  const phoneReady = centerPhones.some((phone) => hasTelLink(phone))
  const instagramReady = hasExternalUrl(center.instagram)
  const blogReady = hasExternalUrl(center.blogUrl)
  const placeReady = hasExternalUrl(center.naverPlaceUrl)

  const coachCardHint = unassigned ? COACH_UNASSIGNED_HINT : COACH_INQUIRY_HINT
  const coachCardSubtitle = unassigned
    ? '담당 코치: 자율배정'
    : `담당 코치: ${formatCoachDisplayName(coach.name)}`

  const unavailableNotice = useMemo(
    () =>
      buildUnavailableNotice({
        kakao: kakaoReady,
        phone: phoneReady,
        place: placeReady,
      }),
    [kakaoReady, phoneReady, placeReady],
  )

  const hasCenterInfo =
    centerPhones.length > 0 || center.centerAddress || center.businessHours

  function openPhoneDialog(phones: string[], title: string) {
    const valid = phones.filter((phone) => hasTelLink(phone))
    if (valid.length === 0) return
    setPhoneDialogPhones(valid)
    setPhoneDialogTitle(title)
    setPhoneDialogOpen(true)
  }

  return (
    <Card className="border-border/70">
      <CardHeader className="pb-2 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-base lg:text-lg">
          <Users className="h-4 w-4 text-primary" />
          코치 &amp; 센터 연락
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-6 sm:pt-0">
        <p className="text-sm leading-relaxed text-muted-foreground">
          궁금한 점이 있으면 아래 채널로 편하게 문의해주세요. 훈련 관련 내용은
          담당 코치가, 예약과 수업 변경은 센터가 안내합니다.
        </p>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <RoleCard
            title="훈련 문의"
            subtitle={coachCardSubtitle}
            hint={coachCardHint}
          />
          <RoleCard
            title="센터 문의"
            subtitle={center.centerName}
            hint={CENTER_CONTACT_TOPICS.join(' · ')}
          />
        </div>

        {!unassigned && coach.phone ? (
          <button
            type="button"
            onClick={() =>
              openPhoneDialog([coach.phone!], '담당 코치 연락')
            }
            className="inline-flex min-h-11 w-full items-center gap-2 rounded-lg border border-primary/20 bg-primary/[0.04] px-3.5 py-2 text-left text-sm text-primary transition-colors hover:bg-primary/10"
          >
            <Phone className="h-4 w-4 shrink-0" />
            <span>
              담당 코치 연락 · <span className="font-medium">{coach.phone}</span>
            </span>
          </button>
        ) : null}

        {hasCenterInfo ? (
          <div className="space-y-1 rounded-lg border border-border/50 bg-muted/5 px-3.5 py-2.5 text-sm">
            {centerPhones.length > 0 ? (
              <div className="text-foreground/90">
                <span className="text-muted-foreground">대표 전화 </span>
                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                  {centerPhones.map((phone, index) => (
                    <button
                      key={`${phone}-${index}`}
                      type="button"
                      onClick={() =>
                        openPhoneDialog([phone], '센터 대표 전화')
                      }
                      className="font-medium text-primary hover:underline"
                    >
                      {phone}
                    </button>
                  ))}
                </span>
              </div>
            ) : null}
            {center.centerAddress ? (
              <p className="text-foreground/90">{center.centerAddress}</p>
            ) : null}
            {center.businessHours ? (
              <p className="text-xs text-muted-foreground">{center.businessHours}</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3 border-t border-border/50 pt-4">
          <ButtonGroup label="빠른 문의">
            <ContactActionButton
              label="카카오톡 문의"
              icon={<MessageCircle className="h-4 w-4" />}
              ready={kakaoReady}
              primary
              onClick={() => setKakaoDialogOpen(true)}
            />
            <ContactActionButton
              label="전화하기"
              icon={<Phone className="h-4 w-4" />}
              ready={phoneReady}
              primary
              onClick={() =>
                openPhoneDialog(centerPhones, '센터 대표 전화')
              }
            />
          </ButtonGroup>

          <ButtonGroup label="센터 소식">
            <ContactActionButton
              label="센터 인스타"
              icon={<Instagram className="h-4 w-4" />}
              ready={instagramReady}
              onClick={() => openInstagram(center.instagram!)}
            />
            <ContactActionButton
              label="블로그"
              icon={<Globe className="h-4 w-4" />}
              ready={blogReady}
              onClick={() => openBlog(center.blogUrl!)}
            />
          </ButtonGroup>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">오시는 길</p>
            <ContactActionButton
              label="센터 위치 보기"
              icon={<MapPin className="h-4 w-4" />}
              ready={placeReady}
              onClick={() =>
                window.open(center.naverPlaceUrl!, '_blank', 'noopener,noreferrer')
              }
            />
          </div>
        </div>

        {unavailableNotice ? (
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            {unavailableNotice}
          </p>
        ) : null}
      </CardContent>

      <KakaoChannelInquiryDialog
        channelId={kakaoChannel}
        open={kakaoDialogOpen}
        onOpenChange={setKakaoDialogOpen}
      />

      <PhoneContactDialog
        phones={phoneDialogPhones}
        title={phoneDialogTitle}
        open={phoneDialogOpen}
        onOpenChange={setPhoneDialogOpen}
      />
    </Card>
  )
}
