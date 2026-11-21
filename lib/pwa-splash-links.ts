/** iOS PWA — 픽셀 크기·media 쿼리가 정확해야 기본 스플래시 대신 커스텀 이미지 사용 */
export const PWA_ASSET_VERSION = 13

export const IOS_PWA_SPLASH_SCREENS = [
  {
    href: '/images/splash/iphone5_splash.png',
    media:
      'screen and (device-width: 320px) and (device-height: 568px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphone6_splash.png',
    media:
      'screen and (device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphoneplus_splash.png',
    media:
      'screen and (device-width: 621px) and (device-height: 1104px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphonex_splash.png',
    media:
      'screen and (device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphonexr_splash.png',
    media:
      'screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphonexsmax_splash.png',
    media:
      'screen and (device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphone12_splash.png',
    media:
      'screen and (device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphone12max_splash.png',
    media:
      'screen and (device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphone14pro_splash.png',
    media:
      'screen and (device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphone14promax_splash.png',
    media:
      'screen and (device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphone16pro_splash.png',
    media:
      'screen and (device-width: 402px) and (device-height: 874px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
  {
    href: '/images/splash/iphone16promax_splash.png',
    media:
      'screen and (device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
  },
] as const

/** 기기별 media가 맞지 않을 때 iOS 기본(아이콘+제목) 스플래시 대신 사용 */
export const IOS_PWA_SPLASH_FALLBACK = `/images/splash/iphone14promax_splash.png?v=${PWA_ASSET_VERSION}`
