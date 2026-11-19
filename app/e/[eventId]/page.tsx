import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { buildEventMatchPortalPath } from '@/lib/event-match-share'

type PageProps = {
  params: Promise<{ eventId: string }>
}

const SHARE_TITLE = '원스텝'
const SHARE_DESCRIPTION =
  '원스텝 트레이닝센터 — 러닝과 트레이닝을 함께하는 공간. OneStep Training Center'

function isLinkPreviewScraper(userAgent: string) {
  // 실제 카카오톡 인앱 브라우저(UA에 Kakaotalk 포함)는 제외 — 스크래퍼만
  return /facebookexternalhit|kakaotalk-scrap|Twitterbot|Slackbot|LinkedInBot|Discordbot|WhatsApp|TelegramBot|embedly|Pinterest|bingbot|Googlebot|Yeti|naver|Daum/i.test(
    userAgent,
  )
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { eventId } = await params

  return {
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
    openGraph: {
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      url: `/e/${encodeURIComponent(eventId)}`,
      siteName: '원스텝',
      locale: 'ko_KR',
      type: 'website',
      images: [
        {
          url: '/og-default.jpg',
          width: 1200,
          height: 630,
          alt: '원스텝',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: SHARE_TITLE,
      description: SHARE_DESCRIPTION,
      images: ['/og-default.jpg'],
    },
  }
}

export default async function EventSharePage({ params }: PageProps) {
  const { eventId } = await params
  const href = buildEventMatchPortalPath(eventId.trim(), '/dashboard/running-portal')
  const ua = (await headers()).get('user-agent') ?? ''

  if (!isLinkPreviewScraper(ua)) {
    redirect(href)
  }

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#070d18] px-6 text-center text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(170,255,0,0.18),transparent_55%)]"
      />
      <BrandPulseAppIcon glow className="relative h-20 w-20" />
      <p className="relative mt-4 text-3xl font-black tracking-tight">원스텝</p>
      <p className="relative mt-3 max-w-xs text-sm leading-relaxed text-white/65">
        원스텝 트레이닝센터
      </p>
    </main>
  )
}
