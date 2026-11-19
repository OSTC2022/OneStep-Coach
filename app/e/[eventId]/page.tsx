import type { Metadata } from 'next'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { ShareRedirect } from '@/components/share/share-redirect'
import { buildEventMatchPortalPath } from '@/lib/event-match-share'

type PageProps = {
  params: Promise<{ eventId: string }>
}

/** 카카오 미리보기용 — 이벤트 멘트 없이 센터 브랜드만 */
const SHARE_TITLE = '원스텝'
const SHARE_DESCRIPTION =
  '원스텝 트레이닝센터 — 러닝과 트레이닝을 함께하는 공간'
const SHARE_IMAGE = '/og/onestep-share.jpg?v=3'

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { eventId } = await params

  return {
    title: { absolute: SHARE_TITLE },
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
          url: SHARE_IMAGE,
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
      images: [SHARE_IMAGE],
    },
  }
}

export default async function EventSharePage({ params }: PageProps) {
  const { eventId } = await params
  const href = buildEventMatchPortalPath(eventId.trim(), '/dashboard/running-portal')

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#070d18] px-6 text-center text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(170,255,0,0.18),transparent_55%)]"
      />
      <BrandPulseAppIcon glow className="relative h-20 w-20" />
      <p className="relative mt-4 text-3xl font-black tracking-tight">원스텝</p>
      <p className="relative mt-3 text-sm text-white/60">원스텝 트레이닝센터</p>
      <ShareRedirect href={href} />
    </main>
  )
}
