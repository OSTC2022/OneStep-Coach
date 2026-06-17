import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '원스텝',
    short_name: '원스텝',
    description: '회원, 수업, 출석 관리를 위한 OneStep Training Center',
    start_url: '/',
    display: 'standalone',
    background_color: '#070d18',
    theme_color: '#070d18',
    orientation: 'portrait-primary',
    lang: 'ko',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
