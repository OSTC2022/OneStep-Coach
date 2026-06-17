import { IOS_PWA_SPLASH_SCREENS } from '@/lib/pwa-splash-links'

export function PwaSplashHeadLinks() {
  return (
    <>
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="원스텝" />
      <meta name="application-name" content="원스텝" />
      {IOS_PWA_SPLASH_SCREENS.map((screen) => (
        <link
          key={screen.href}
          rel="apple-touch-startup-image"
          href={screen.href}
          media={screen.media}
        />
      ))}
    </>
  )
}
