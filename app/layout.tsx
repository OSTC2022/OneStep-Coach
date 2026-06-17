import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { AppInitialLoader } from '@/components/brand/app-initial-loader'
import { OnestepSplashStatic } from '@/components/brand/onestep-splash-static'
import { PwaSplashHeadLinks } from '@/components/brand/pwa-splash-head-links'
import './globals.css'

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
  display: 'swap',
})
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: '원스텝',
    template: '%s · 원스텝',
  },
  description: '회원, 수업, 출석 관리를 위한 OneStep Training Center',
  applicationName: '원스텝',
  appleWebApp: {
    capable: true,
    title: '원스텝',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-32.png?v=3', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png?v=3', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-icon.png?v=3', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#070d18',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ko"
      className={`dark bg-[#070d18] ${geistSans.variable} ${geistMono.variable}`}
    >
      <head>
        <PwaSplashHeadLinks />
        <style
          dangerouslySetInnerHTML={{
            __html:
              'html,body{background:#070d18!important;margin:0;padding:0}' +
              'html.onestep-splash-active,html.onestep-splash-active body{overflow:hidden;position:fixed;inset:0;width:100%;height:100%;height:100dvh;overscroll-behavior:none}' +
              '#onestep-app-splash{position:fixed;inset:0;z-index:9999;width:100%;height:100%;height:100dvh;min-height:100dvh;min-height:-webkit-fill-available;opacity:1}',
          }}
        />
      </head>
      <body
        className={`${geistSans.className} antialiased bg-[#070d18] text-foreground min-h-screen`}
      >
        <OnestepSplashStatic />
        <AppInitialLoader />
        <div id="app-root" className="onestep-app-root">
          {children}
          <Toaster richColors position="top-center" />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </div>
      </body>
    </html>
  )
}
