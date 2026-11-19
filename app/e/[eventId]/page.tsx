import type { Metadata } from 'next'
import { EventShareLanding } from '@/components/share/event-share-landing'
import { buildEventMatchPortalPath } from '@/lib/event-match-share'

type PageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { eventId } = await params
  const title = '기록 맞추기 · 원스텝'
  const description =
    '대회 예상 기록을 맞추고, 실제 기록과 가장 가까운 사람이 상품을 받습니다. OneStep Training Center'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/e/${encodeURIComponent(eventId)}`,
      siteName: '원스텝',
      locale: 'ko_KR',
      type: 'website',
      images: [
        {
          url: '/og/event.jpg',
          width: 1200,
          height: 630,
          alt: '원스텝 기록 맞추기',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og/event.jpg'],
    },
  }
}

export default async function EventSharePage({ params }: PageProps) {
  const { eventId } = await params
  const href = buildEventMatchPortalPath(eventId.trim(), '/dashboard/running-portal')
  return <EventShareLanding href={href} />
}
