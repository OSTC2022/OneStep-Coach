import type { CSSProperties } from 'react'
import type { Lesson } from '@/lib/types'

/** 다크 배경에서 시인성 좋은 캘린더 색상 8종 */
export const INSTRUCTOR_CALENDAR_COLORS = [
  { id: 'sky', hex: '#38BDF8', label: '하늘' },
  { id: 'emerald', hex: '#10B981', label: '에메랄드' },
  { id: 'amber', hex: '#F59E0B', label: '앰버' },
  { id: 'rose', hex: '#FB7185', label: '로즈' },
  { id: 'indigo', hex: '#818CF8', label: '인디고' },
  { id: 'violet', hex: '#A78BFA', label: '바이올렛' },
  { id: 'cyan', hex: '#22D3EE', label: '시안' },
  { id: 'lime', hex: '#84CC16', label: '라임' },
] as const

export const DEFAULT_INSTRUCTOR_CALENDAR_COLOR = INSTRUCTOR_CALENDAR_COLORS[0].hex

/** DB 색상 미설정 시 센터 기본 강사 색 (이전 캘린더 표시와 동일) */
export const INSTRUCTOR_CALENDAR_COLOR_BY_NAME: Record<string, string> = {
  이교직: INSTRUCTOR_CALENDAR_COLORS[2].hex,
  장지용: INSTRUCTOR_CALENDAR_COLORS[0].hex,
}

/** 강사 미지정(자율배정) — 연한 회색·흰색 테두리 */
export const AUTO_INSTRUCTOR_BORDER_COLOR = '#E2E8F0'

/** @deprecated 테두리는 AUTO_INSTRUCTOR_BORDER_COLOR 사용 */
export const AUTO_INSTRUCTOR_CALENDAR_COLOR = AUTO_INSTRUCTOR_BORDER_COLOR

export type InstructorCalendarColorId =
  (typeof INSTRUCTOR_CALENDAR_COLORS)[number]['id']

export function isInstructorCalendarColor(value: string | null | undefined): boolean {
  if (!value) return false
  return INSTRUCTOR_CALENDAR_COLORS.some((c) => c.hex === value)
}

export function getDefaultInstructorCalendarColor(index = 0): string {
  return INSTRUCTOR_CALENDAR_COLORS[index % INSTRUCTOR_CALENDAR_COLORS.length].hex
}

export type InstructorColorSource = {
  id: string
  name: string
  calendar_color?: string | null
}

export function getInstructorCalendarColor(
  instructor?: { calendar_color?: string | null; name?: string | null } | null,
  catalogIndex?: number,
): string {
  if (instructor?.calendar_color && isInstructorCalendarColor(instructor.calendar_color)) {
    return instructor.calendar_color
  }

  const name = instructor?.name?.trim()
  if (name && INSTRUCTOR_CALENDAR_COLOR_BY_NAME[name]) {
    return INSTRUCTOR_CALENDAR_COLOR_BY_NAME[name]
  }

  if (catalogIndex != null) {
    return getDefaultInstructorCalendarColor(catalogIndex)
  }

  return DEFAULT_INSTRUCTOR_CALENDAR_COLOR
}

export function isAutoAssignedLesson(
  lesson: Pick<Lesson, 'instructor_id'>,
): boolean {
  const id = lesson.instructor_id?.trim()
  return !id || id === 'auto'
}

/** 자율배정 — 어두운 배경 + 밝은 테두리 (수업현황·출석 타일과 동일) */
export function getAutoAssignedLessonBlockStyle(): CSSProperties {
  return {
    backgroundColor: 'rgba(13, 27, 42, 0.92)',
    borderColor: AUTO_INSTRUCTOR_BORDER_COLOR,
    color: '#ffffff',
  }
}

export function getAutoAssignedLessonChipStyle(): CSSProperties {
  return {
    backgroundColor: 'rgba(226, 232, 240, 0.08)',
    color: '#ffffff',
    borderColor: 'rgba(226, 232, 240, 0.45)',
  }
}

export function resolveLessonDisplayColor(
  lesson: Pick<Lesson, 'instructor_id' | 'instructor'>,
  instructors?: ReadonlyArray<InstructorColorSource>,
): string {
  if (isAutoAssignedLesson(lesson)) {
    return AUTO_INSTRUCTOR_BORDER_COLOR
  }
  return getInstructorCalendarColor(resolveLessonInstructor(lesson, instructors))
}

/** instructor_id 기준으로 강사 색상 소스 결정 (저장 후 stale join 방지) */
export function resolveLessonInstructor(
  lesson: Pick<Lesson, 'instructor_id' | 'instructor'>,
  instructors?: ReadonlyArray<InstructorColorSource>,
): InstructorColorSource | null {
  const instructorId = lesson.instructor_id
  if (!instructorId) return null

  const fromCatalog = instructors?.find((item) => item.id === instructorId)
  if (fromCatalog) return fromCatalog

  if (lesson.instructor?.id === instructorId) {
    return {
      id: lesson.instructor.id,
      name: lesson.instructor.name,
      calendar_color: lesson.instructor.calendar_color ?? null,
    }
  }

  return null
}

export function enrichLessonWithInstructorCatalog<T extends Lesson>(
  lesson: T,
  instructors?: ReadonlyArray<InstructorColorSource>,
): T {
  const instructor = resolveLessonInstructor(lesson, instructors)
  if (!instructor) {
    return lesson.instructor_id ? { ...lesson, instructor: null } : lesson
  }
  return { ...lesson, instructor }
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  }
}

function channelLuminance(value: number) {
  const normalized = value / 255
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  )
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function parseCssColorChannels(
  color: string,
): { r: number; g: number; b: number } | null {
  const rgba = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i)
  if (rgba) {
    return { r: Number(rgba[1]), g: Number(rgba[2]), b: Number(rgba[3]) }
  }
  if (color.startsWith('#')) {
    return hexToRgb(color)
  }
  return null
}

function relativeLuminanceFromChannels(r: number, g: number, b: number): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  )
}

export function getContrastTextColor(color: string): string {
  const channels = parseCssColorChannels(color)
  if (!channels) return '#ffffff'
  const bg = relativeLuminanceFromChannels(channels.r, channels.g, channels.b)
  const whiteContrast = contrastRatio(bg, 1)
  const blackContrast = contrastRatio(bg, 0)
  return whiteContrast >= blackContrast ? '#ffffff' : '#0f172a'
}

function shadeHex(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`
}

/** 캘린더 블록 라벨 — 배경색에 맞는 글자색, 최소 그림자만 */
export function getCalendarBlockTextStyle(
  backgroundColor: string,
): Pick<CSSProperties, 'color' | 'textShadow'> {
  const color = getContrastTextColor(backgroundColor)
  if (color === '#ffffff') {
    return {
      color: '#ffffff',
      textShadow: '0 1px 2px rgba(0,0,0,0.45)',
    }
  }
  return { color }
}

export function getLessonCalendarBlockTextStyle(
  lesson: Lesson,
  instructors?: ReadonlyArray<InstructorColorSource>,
): Pick<CSSProperties, 'color' | 'textShadow'> {
  if (isAutoAssignedLesson(lesson)) {
    return {
      color: '#ffffff',
      textShadow: '0 1px 2px rgba(0,0,0,0.45)',
    }
  }
  return getCalendarBlockTextStyle(
    getLessonCalendarBlockBackgroundColor(lesson, instructors),
  )
}

const STATUS_BLOCK_STYLES: Record<string, CSSProperties & { _bg: string }> = {
  absent: {
    _bg: '#dc2626',
    backgroundColor: '#dc2626',
    borderColor: '#b91c1c',
    color: '#ffffff',
  },
  makeup: {
    _bg: '#ca8a04',
    backgroundColor: '#ca8a04',
    borderColor: '#a16207',
    color: '#0f172a',
  },
  cancelled: {
    _bg: '#64748b',
    backgroundColor: '#64748b',
    borderColor: '#475569',
    color: '#f8fafc',
  },
}

export function getLessonCalendarBlockStyle(
  lesson: Lesson,
  instructors?: ReadonlyArray<InstructorColorSource>,
): CSSProperties {
  const status = lesson.attendance_status
  if (status !== 'present' && STATUS_BLOCK_STYLES[status]) {
    const { _bg: _, ...style } = STATUS_BLOCK_STYLES[status]
    return style
  }

  if (isAutoAssignedLesson(lesson)) {
    return getAutoAssignedLessonBlockStyle()
  }

  const color = getInstructorCalendarColor(resolveLessonInstructor(lesson, instructors))
  const textColor = getContrastTextColor(color)
  return {
    backgroundColor: color,
    borderColor: shadeHex(color, 0.82),
    color: textColor,
  }
}

export function getLessonCalendarBlockBackgroundColor(
  lesson: Lesson,
  instructors?: ReadonlyArray<InstructorColorSource>,
): string {
  const status = lesson.attendance_status
  if (status !== 'present' && STATUS_BLOCK_STYLES[status]) {
    return STATUS_BLOCK_STYLES[status]._bg
  }
  if (isAutoAssignedLesson(lesson)) {
    return getAutoAssignedLessonBlockStyle().backgroundColor as string
  }
  return getInstructorCalendarColor(resolveLessonInstructor(lesson, instructors))
}

export function getLessonCalendarChipStyle(
  lesson: Lesson,
  instructors?: ReadonlyArray<InstructorColorSource>,
): CSSProperties {
  const status = lesson.attendance_status
  if (status !== 'present' && STATUS_BLOCK_STYLES[status]) {
    const base = STATUS_BLOCK_STYLES[status]
    return {
      backgroundColor: base.backgroundColor?.toString().replace('0.85', '0.2'),
      color: base.color,
      borderColor: base.borderColor,
    }
  }

  if (isAutoAssignedLesson(lesson)) {
    return getAutoAssignedLessonChipStyle()
  }

  const color = getInstructorCalendarColor(resolveLessonInstructor(lesson, instructors))
  return {
    backgroundColor: hexToRgba(color, 0.18),
    color,
    borderColor: hexToRgba(color, 0.45),
  }
}
