import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export type PortalTextAlign = 'left' | 'center' | 'right'
export type PortalFontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl'
export type PortalFontWeight = 'normal' | 'medium' | 'semibold' | 'bold'

/** 포털 헤더·문구용 글꼴 프리셋 */
export type PortalFontFamily =
  | 'sans'
  | 'noto'
  | 'myeongjo'
  | 'blackhan'
  | 'dohyeon'
  | 'orbitron'
  | 'mono'
  | 'nanumpen'
  | 'gaegu'
  | 'pacifico'
  | 'dancing'
  | 'caveat'
  /** @deprecated myeongjo로 매핑 */
  | 'serif'

/** 텍스트 특수효과 */
export type PortalTextEffect =
  | 'glow'
  | 'neon'
  | 'fire'
  | 'ice'
  | 'chrome'
  | 'pulse'
  | 'shimmer'
  | 'outline'
  | 'shadow'

export type PortalTextStyleConfig = {
  color?: string | null
  fontSize?: PortalFontSize | null
  fontWeight?: PortalFontWeight | null
  textAlign?: PortalTextAlign | null
  fontFamily?: PortalFontFamily | null
  effect?: PortalTextEffect | null
}

export type AdultRunningPortalHeaderStyle = {
  containerAlign?: PortalTextAlign | null
  leagueLabel?: PortalTextStyleConfig | null
  portalTitle?: PortalTextStyleConfig | null
}

const FONT_SIZE_CLASS: Record<PortalFontSize, string> = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
}

const FONT_WEIGHT_CLASS: Record<PortalFontWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
}

const TEXT_ALIGN_CLASS: Record<PortalTextAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export const FONT_FAMILY_CLASS: Record<PortalFontFamily, string> = {
  sans: 'font-sans',
  noto: 'font-portal-noto',
  myeongjo: 'font-portal-myeongjo',
  serif: 'font-portal-myeongjo',
  blackhan: 'font-portal-blackhan',
  dohyeon: 'font-portal-dohyeon',
  orbitron: 'font-portal-orbitron',
  mono: 'font-mono',
  nanumpen: 'font-portal-nanumpen',
  gaegu: 'font-portal-gaegu',
  pacifico: 'font-portal-pacifico',
  dancing: 'font-portal-dancing',
  caveat: 'font-portal-caveat',
}

/** Tailwind 유틸 미생성 대비 — 인라인 font-family로 확실히 적용 */
export const FONT_FAMILY_STACK: Record<PortalFontFamily, string> = {
  sans: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
  noto: 'var(--font-noto-sans-kr), var(--font-geist-sans), sans-serif',
  myeongjo: 'var(--font-noto-serif-kr), ui-serif, Georgia, "Times New Roman", serif',
  serif: 'var(--font-noto-serif-kr), ui-serif, Georgia, "Times New Roman", serif',
  blackhan: 'var(--font-black-han-sans), var(--font-noto-sans-kr), sans-serif',
  dohyeon: 'var(--font-do-hyeon), var(--font-noto-sans-kr), sans-serif',
  orbitron: 'var(--font-orbitron), var(--font-geist-sans), sans-serif',
  mono: 'var(--font-geist-mono), ui-monospace, monospace',
  nanumpen: 'var(--font-nanum-pen), var(--font-noto-sans-kr), cursive',
  gaegu: 'var(--font-gaegu), var(--font-noto-sans-kr), cursive',
  pacifico: 'var(--font-pacifico), var(--font-geist-sans), cursive',
  dancing: 'var(--font-dancing-script), var(--font-geist-sans), cursive',
  caveat: 'var(--font-caveat), var(--font-geist-sans), cursive',
}

export const TEXT_EFFECT_CLASS: Record<PortalTextEffect, string> = {
  glow: 'portal-fx-glow',
  neon: 'portal-fx-neon',
  fire: 'portal-fx-fire',
  ice: 'portal-fx-ice',
  chrome: 'portal-fx-chrome',
  pulse: 'portal-fx-pulse',
  shimmer: 'portal-fx-shimmer',
  outline: 'portal-fx-outline',
  shadow: 'portal-fx-shadow',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseTextAlign(value: unknown): PortalTextAlign | null {
  return value === 'left' || value === 'center' || value === 'right' ? value : null
}

function parseFontSize(value: unknown): PortalFontSize | null {
  return value === 'xs' ||
    value === 'sm' ||
    value === 'base' ||
    value === 'lg' ||
    value === 'xl' ||
    value === '2xl'
    ? value
    : null
}

function parseFontWeight(value: unknown): PortalFontWeight | null {
  return value === 'normal' ||
    value === 'medium' ||
    value === 'semibold' ||
    value === 'bold'
    ? value
    : null
}

function parseFontFamily(value: unknown): PortalFontFamily | null {
  if (value === 'serif') return 'myeongjo'
  return value === 'sans' ||
    value === 'noto' ||
    value === 'myeongjo' ||
    value === 'blackhan' ||
    value === 'dohyeon' ||
    value === 'orbitron' ||
    value === 'mono' ||
    value === 'nanumpen' ||
    value === 'gaegu' ||
    value === 'pacifico' ||
    value === 'dancing' ||
    value === 'caveat'
    ? value
    : null
}

function parseTextEffect(value: unknown): PortalTextEffect | null {
  return value === 'glow' ||
    value === 'neon' ||
    value === 'fire' ||
    value === 'ice' ||
    value === 'chrome' ||
    value === 'pulse' ||
    value === 'shimmer' ||
    value === 'outline' ||
    value === 'shadow'
    ? value
    : null
}

function parseColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

export function parsePortalTextStyleConfig(value: unknown): PortalTextStyleConfig {
  if (!isRecord(value)) return {}
  return {
    color: parseColor(value.color),
    fontSize: parseFontSize(value.fontSize),
    fontWeight: parseFontWeight(value.fontWeight),
    textAlign: parseTextAlign(value.textAlign),
    fontFamily: parseFontFamily(value.fontFamily),
    effect: parseTextEffect(value.effect),
  }
}

export function parseAdultRunningPortalHeaderStyle(value: unknown): AdultRunningPortalHeaderStyle {
  if (!isRecord(value)) return {}
  return {
    containerAlign: parseTextAlign(value.containerAlign),
    leagueLabel: parsePortalTextStyleConfig(value.leagueLabel),
    portalTitle: parsePortalTextStyleConfig(value.portalTitle),
  }
}

export function resolvePortalTextPresentation(
  config: PortalTextStyleConfig | null | undefined,
  defaults: { className: string },
): { className: string; style?: CSSProperties } {
  const fontFamily = config?.fontFamily ?? null
  const effect = config?.effect ?? null
  const className = cn(
    defaults.className,
    config?.fontSize ? FONT_SIZE_CLASS[config.fontSize] : null,
    config?.fontWeight ? FONT_WEIGHT_CLASS[config.fontWeight] : null,
    config?.textAlign ? TEXT_ALIGN_CLASS[config.textAlign] : null,
    fontFamily ? FONT_FAMILY_CLASS[fontFamily] : null,
    effect ? TEXT_EFFECT_CLASS[effect] : null,
  )

  const style: CSSProperties = {}
  const color = config?.color?.trim()
  if (color) style.color = color
  if (fontFamily) style.fontFamily = FONT_FAMILY_STACK[fontFamily]

  if (!color && !fontFamily && !effect) {
    return { className }
  }

  return { className, style }
}

export function resolveContainerAlignClass(align: PortalTextAlign | null | undefined): string {
  if (!align) return ''
  return TEXT_ALIGN_CLASS[align]
}

export const PORTAL_FONT_SIZE_OPTIONS: Array<{ value: PortalFontSize; label: string }> = [
  { value: 'xs', label: '아주 작게' },
  { value: 'sm', label: '작게' },
  { value: 'base', label: '보통' },
  { value: 'lg', label: '크게' },
  { value: 'xl', label: '더 크게' },
  { value: '2xl', label: '가장 크게' },
]

export const PORTAL_FONT_WEIGHT_OPTIONS: Array<{ value: PortalFontWeight; label: string }> = [
  { value: 'normal', label: '보통' },
  { value: 'medium', label: '중간' },
  { value: 'semibold', label: '세미볼드' },
  { value: 'bold', label: '굵게' },
]

export const PORTAL_TEXT_ALIGN_OPTIONS: Array<{ value: PortalTextAlign; label: string }> = [
  { value: 'left', label: '왼쪽' },
  { value: 'center', label: '가운데' },
  { value: 'right', label: '오른쪽' },
]

export const PORTAL_FONT_FAMILY_OPTIONS: Array<{
  value: Exclude<PortalFontFamily, 'serif'>
  label: string
  sample: string
}> = [
  { value: 'sans', label: '기본 고딕', sample: 'ONE STEP' },
  { value: 'noto', label: '본고딕', sample: '원스텝 러닝' },
  { value: 'myeongjo', label: '명조', sample: '원스텝 러닝' },
  { value: 'blackhan', label: '임팩트', sample: '원스텝' },
  { value: 'dohyeon', label: '스포츠', sample: '원스텝' },
  { value: 'orbitron', label: '테크 영문', sample: 'ONE STEP' },
  { value: 'nanumpen', label: '한글 필기', sample: '원스텝 러닝' },
  { value: 'gaegu', label: '손글씨', sample: '원스텝 러닝' },
  { value: 'pacifico', label: '영문 필기', sample: 'No Limit' },
  { value: 'dancing', label: '영문 필기체', sample: 'Running' },
  { value: 'caveat', label: '캐주얼 필기', sample: 'ONE STEP' },
  { value: 'mono', label: '고정폭', sample: 'ONE STEP' },
]

export const PORTAL_TEXT_EFFECT_OPTIONS: Array<{
  value: PortalTextEffect
  label: string
}> = [
  { value: 'glow', label: '소프트 글로우' },
  { value: 'neon', label: '네온' },
  { value: 'fire', label: '파이어' },
  { value: 'ice', label: '아이스' },
  { value: 'chrome', label: '크롬 메탈' },
  { value: 'pulse', label: '펄스' },
  { value: 'shimmer', label: '샤인' },
  { value: 'outline', label: '아웃라인' },
  { value: 'shadow', label: '딥 섀도' },
]
