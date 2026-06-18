export const SITE_BRAND_NAME = '원스텝 트레이닝 센터'

/** 클라이언트 공유용 로그인 페이지 URL */
export function getShareLoginUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/auth/login`
  }
  return '/auth/login'
}
