import type { MetadataRoute } from 'next'
import { PWA_ASSET_VERSION } from '@/lib/pwa-splash-links'

export default function manifest(): MetadataRoute.Manifest {
  const iconQuery = `v=${PWA_ASSET_VERSION}`

  return {
    id: `/?pwa=v${PWA_ASSET_VERSION}`,
    name: ' ',
    short_name: '원스텝',
    description: 'OneStep Training Center',
    start_url: `/?pwa=v${PWA_ASSET_VERSION}`,
    display: 'standalone',
    display_override: ['standalone', 'fullscreen'],
    background_color: '#070d18',
    theme_color: '#070d18',
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
        src: `/icons/icon-512.png?${iconQuery}`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
