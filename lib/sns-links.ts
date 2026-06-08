/** 인스타그램 프로필 URL */
export function buildInstagramUrl(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const username = trimmed.replace(/^@/, '')
  return `https://www.instagram.com/${encodeURIComponent(username)}/`
}

export type KakaoLink =
  | { kind: 'external'; href: string }
  | { kind: 'channel_friend'; href: string }
  | { kind: 'personal_id'; id: string }
  | { kind: 'empty' }

/** 카카오톡 채널 친구 추가 URL (채널 전용) */
export function buildKakaoChannelFriendUrl(channelPublicId: string): string {
  const id = channelPublicId.trim().replace(/\/friend$/i, '')
  return `https://pf.kakao.com/${id}/friend`
}

function extractChannelPublicId(value: string): string | null {
  const trimmed = value.trim()

  if (/^https?:\/\//i.test(trimmed)) {
    const match = trimmed.match(/pf\.kakao\.com\/([^/?#]+)/i)
    if (match) return match[1].replace(/\/friend$/i, '')
    return null
  }

  const normalized = trimmed.replace(/^\/+/, '')
  if (/^pf\.kakao\.com\//i.test(normalized)) {
    const id = normalized.replace(/^pf\.kakao\.com\//i, '').split(/[/?#]/)[0]
    return id ? id.replace(/\/friend$/i, '') : null
  }

  if (/^_[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed

  return null
}

function isOpenChatUrl(value: string): boolean {
  return /open\.kakao\.com\/o\//i.test(value) || /^o\/[a-zA-Z0-9_-]+/i.test(value)
}

/**
 * 카카오톡 링크 해석
 * - 오픈채팅 URL → 채팅방 연결
 * - 채널 ID (pf.kakao.com, _로 시작) → 채널 친구추가
 * - 개인 아이디 → 웹 링크 없음 (앱에서 ID 검색 필요)
 */
export function resolveKakaoLink(value: string | null | undefined): KakaoLink {
  const trimmed = value?.trim()
  if (!trimmed) return { kind: 'empty' }

  if (/^https?:\/\//i.test(trimmed)) {
    if (isOpenChatUrl(trimmed)) {
      return { kind: 'external', href: trimmed }
    }
    const channelId = extractChannelPublicId(trimmed)
    if (channelId) {
      return { kind: 'channel_friend', href: buildKakaoChannelFriendUrl(channelId) }
    }
    return { kind: 'external', href: trimmed }
  }

  const normalized = trimmed.replace(/^\/+/, '')
  if (/^o\/[a-zA-Z0-9_-]+/i.test(normalized)) {
    return { kind: 'external', href: `https://open.kakao.com/${normalized}` }
  }

  const channelId = extractChannelPublicId(trimmed)
  if (channelId) {
    return { kind: 'channel_friend', href: buildKakaoChannelFriendUrl(channelId) }
  }

  return { kind: 'personal_id', id: trimmed }
}

/** 블로그·홈페이지 URL */
export function buildBlogUrl(value: string): string {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function hasSnsLinkValue(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

export function hasAnySnsValue(
  fields: {
    kakaoId?: string | null
    instagramId?: string | null
    blogUrl?: string | null
  },
): boolean {
  return (
    hasSnsLinkValue(fields.kakaoId) ||
    hasSnsLinkValue(fields.instagramId) ||
    hasSnsLinkValue(fields.blogUrl)
  )
}
