import type { MetadataRoute } from 'next'
import { PWA_ASSET_VERSION } from '@/lib/pwa-splash-links'

export default function manifest(): MetadataRoute.Manifest {
  const iconQuery = `v=${PWA_ASSET_VERSION}`

  return {
    id: `onestep-coach-pwa-v${PWA_ASSET_VERSION}`,
    name: '원스텝',
    short_name: '원스텝',
    description: 'OneStep Training Center',
    scope: '/',
    // 모바일 설치 앱도 PC와 같은 / 진입 → 동일 HTML 스플래시
    start_url: '/?source=pwa',
    display: 'standalone',
    display_override: ['standalone', 'fullscreen'],
    background_color: '#070d18',
    theme_color: '#070d18',
    // 안드로이드 기본 스플래시 배경을 브랜드 톤으로 고정
    categories: ['sports', 'health'],
    orientation: 'portrait-primary',
    lang: 'ko',
    prefer_related_applications: false,
    icons: [
      {
        src: `/icons/icon-192.png?${iconQuery}`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/icons/icon-512.png?${iconQuery}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `/icons/icon-512-maskable.png?${iconQuery}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
