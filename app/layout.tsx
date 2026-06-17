import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { AppInitialLoader } from '@/components/brand/app-initial-loader'
import { OnestepSplashStatic } from '@/components/brand/onestep-splash-static'
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
  title: '원스텝 트레이닝 센터',
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
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#070d18',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <style
          dangerouslySetInnerHTML={{
            __html:
              'html,body{background:#070d18!important}#onestep-app-splash{opacity:1}',
          }}
        />
        <link
          rel="apple-touch-startup-image"
          href="/images/onestep-splash-startup.png"
          media="(orientation: portrait)"
        />
      </head>
      <body
        className={`${geistSans.className} antialiased bg-[#070d18] text-foreground min-h-screen`}
      >
        <OnestepSplashStatic />
        <AppInitialLoader />
        {children}
        <Toaster richColors position="top-center" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
