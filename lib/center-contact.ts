import {
  buildBlogUrl,
  buildInstagramUrl,
  hasSnsLinkValue,
  resolveKakaoLink,
} from '@/lib/sns-links'
import type { CenterSettings } from '@/lib/types'

export const COACH_INQUIRY_HINT = '컨디션 · 통증 · 운동 관련 문의'
export const COACH_UNASSIGNED_HINT = '훈련 문의는 센터 채널로 먼저 남겨주세요.'

export const CENTER_CONTACT_TOPICS = [
  '예약',
  '수업 변경',
  '결제',
  '공지',
  '상담',
] as const

export const KAKAO_CHANNEL_QR_SRC = '/images/kakao-channel-qr.png'
export const KAKAO_CHANNEL_DEFAULT_ID = 'onesteptc'

const UNASSIGNED_COACH_LABEL = '자율배정'

export function isUnassignedCoach(coachName: string): boolean {
  return coachName.trim() === UNASSIGNED_COACH_LABEL
}

export function formatCoachDisplayName(coachName: string): string {
  const trimmed = coachName.trim()
  if (!trimmed || isUnassignedCoach(trimmed)) return UNASSIGNED_COACH_LABEL
  if (trimmed.endsWith('코치')) return trimmed
  return `${trimmed} 코치`
}

export type MemberCenterContactView = {
  centerName: string
  centerPhone: string | null
  centerPhones: string[]
  kakaoChannel: string | null
  instagram: string | null
  blogUrl: string | null
  naverPlaceUrl: string | null
  centerAddress: string | null
  businessHours: string | null
  showInstructorContact: boolean
}

/** 대표 전화 — 줄바꿈·쉼표로 여러 번호 저장 */
export function parseCenterPhones(centerPhone: string | null | undefined): string[] {
  if (!centerPhone?.trim()) return []
  const phones = centerPhone
    .split(/[\n,;|]+/)
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(phones)]
}

export function formatCenterPhonesForStorage(phones: string[]): string {
  return phones.map((value) => value.trim()).filter(Boolean).join('\n')
}

export function primaryCenterPhone(centerPhone: string | null | undefined): string | null {
  const phones = parseCenterPhones(centerPhone)
  return phones[0] ?? null
}

export type MemberCoachContactView = {
  name: string
  phone: string | null
}

export function buildTelHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits ? `tel:${digits}` : '#'
}

export function buildSmsHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '')
  return digits ? `sms:${digits}` : '#'
}

export function hasTelLink(phone: string | null | undefined): boolean {
  return Boolean(phone?.replace(/\D/g, ''))
}

export function hasExternalUrl(url: string | null | undefined): boolean {
  return Boolean(url?.trim())
}

export function hasKakaoChannelLink(kakao: string | null | undefined): boolean {
  if (!hasSnsLinkValue(kakao)) return false
  const link = resolveKakaoLink(kakao)
  return link.kind === 'external' || link.kind === 'channel_friend'
}

export function buildCenterContactView(
  settings: CenterSettings,
): MemberCenterContactView {
  const centerPhones = parseCenterPhones(settings.center_phone)
  return {
    centerName: settings.name,
    centerPhone: centerPhones[0] ?? settings.center_phone ?? null,
    centerPhones,
    kakaoChannel: settings.kakao_id,
    instagram: settings.instagram_id,
    blogUrl: settings.blog_url,
    naverPlaceUrl: settings.naver_place_url,
    centerAddress: settings.center_address,
    businessHours: settings.business_hours,
    showInstructorContact: settings.show_instructor_contact ?? false,
  }
}

export function buildCoachContactView(
  coachName: string,
  coachPhone: string | null | undefined,
  showInstructorContact: boolean,
): MemberCoachContactView {
  return {
    name: coachName,
    phone: showInstructorContact && hasTelLink(coachPhone) ? coachPhone!.trim() : null,
  }
}

export function openExternalUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function openKakaoChannel(kakao: string) {
  const link = resolveKakaoLink(kakao)
  if (link.kind === 'external' || link.kind === 'channel_friend') {
    openExternalUrl(link.href)
  }
}

export function openInstagram(instagram: string) {
  openExternalUrl(buildInstagramUrl(instagram))
}

export function openBlog(blogUrl: string) {
  openExternalUrl(buildBlogUrl(blogUrl))
}
