import { IOS_PWA_SPLASH_FALLBACK, IOS_PWA_SPLASH_SCREENS, PWA_ASSET_VERSION } from '@/lib/pwa-splash-links'

export function PwaSplashHeadLinks() {
  return (
    <>
      <link rel="manifest" href={`/manifest.webmanifest?v=${PWA_ASSET_VERSION}`} />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="원스텝" />
      <meta name="application-name" content="원스텝" />
      <meta name="color-scheme" content="dark" />
      <meta name="theme-color" content="#070d18" media="(prefers-color-scheme: dark)" />
      <meta name="theme-color" content="#070d18" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#070d18" />
      <link
        rel="apple-touch-icon"
        href={`/icons/apple-icon.png?v=${PWA_ASSET_VERSION}`}
      />
      {IOS_PWA_SPLASH_SCREENS.map((screen) => (
        <link
          key={`${screen.href}?v=${PWA_ASSET_VERSION}`}
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
