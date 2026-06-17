import { IOS_PWA_SPLASH_FALLBACK, IOS_PWA_SPLASH_SCREENS, PWA_ASSET_VERSION } from '@/lib/pwa-splash-links'

export function PwaSplashHeadLinks() {
  return (
    <>
      <link rel="manifest" href={`/manifest.webmanifest?v=${PWA_ASSET_VERSION}`} />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="원스텝" />
      <meta name="application-name" content="원스텝" />
      <meta name="theme-color" content="#070d18" />
      {IOS_PWA_SPLASH_SCREENS.map((screen) => (
        <link
          key={screen.href}
          rel="apple-touch-startup-image"
          href={`${screen.href}?v=${PWA_ASSET_VERSION}`}
          media={screen.media}
        />
      ))}
      <link
        rel="apple-touch-startup-image"
        href={IOS_PWA_SPLASH_FALLBACK}
        media="(orientation: portrait)"
      />
    </>
  )
}
