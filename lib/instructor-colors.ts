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

/** 강사 미지정(자율배정) 수업 표시색 */
export const AUTO_INSTRUCTOR_CALENDAR_COLOR = '#94A3B8'

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
  instructor?: { calendar_color?: string | null } | null,
): string {
  if (instructor?.calendar_color && isInstructorCalendarColor(instructor.calendar_color)) {
    return instructor.calendar_color
  }
  return DEFAULT_INSTRUCTOR_CALENDAR_COLOR
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

export function getContrastTextColor(hex: string): string {
  const bg = relativeLuminance(hex)
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
      color,
      textShadow: '0 1px 2px rgba(0,0,0,0.35)',
    }
  }
  return { color }
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

  const color = getInstructorCalendarColor(resolveLessonInstructor(lesson, instructors))
  return {
    backgroundColor: hexToRgba(color, 0.18),
    color,
    borderColor: hexToRgba(color, 0.45),
  }
}
