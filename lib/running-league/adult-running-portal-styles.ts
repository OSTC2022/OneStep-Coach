import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export type PortalTextAlign = 'left' | 'center' | 'right'
export type PortalFontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl'
export type PortalFontWeight = 'normal' | 'medium' | 'semibold' | 'bold'
export type PortalFontFamily = 'sans' | 'serif' | 'mono'

export type PortalTextStyleConfig = {
  color?: string | null
  fontSize?: PortalFontSize | null
  fontWeight?: PortalFontWeight | null
  textAlign?: PortalTextAlign | null
  fontFamily?: PortalFontFamily | null
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

const FONT_FAMILY_CLASS: Record<PortalFontFamily, string> = {
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
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
  return value === 'sans' || value === 'serif' || value === 'mono' ? value : null
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
  const className = cn(
    defaults.className,
    config?.fontSize ? FONT_SIZE_CLASS[config.fontSize] : null,
    config?.fontWeight ? FONT_WEIGHT_CLASS[config.fontWeight] : null,
    config?.textAlign ? TEXT_ALIGN_CLASS[config.textAlign] : null,
    config?.fontFamily ? FONT_FAMILY_CLASS[config.fontFamily] : null,
  )

  const color = config?.color?.trim()
  if (!color) {
    return { className }
  }

  return { className, style: { color } }
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

export const PORTAL_FONT_FAMILY_OPTIONS: Array<{ value: PortalFontFamily; label: string }> = [
  { value: 'sans', label: '고딕(기본)' },
  { value: 'serif', label: '명조' },
  { value: 'mono', label: '고정폭' },
]
