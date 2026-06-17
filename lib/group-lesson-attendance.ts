export const GROUP_ATTENDANCE_NOTE_TOKEN = '[수업출석]'

export function formatGroupAttendanceNote(checkedInAt: string) {
  return `${GROUP_ATTENDANCE_NOTE_TOKEN}${checkedInAt}`
}

export function parseGroupAttendanceCheckedInAt(
  note?: string | null,
): string | null {
  if (!note) return null
  const idx = note.indexOf(GROUP_ATTENDANCE_NOTE_TOKEN)
  if (idx < 0) return null
  const raw = note.slice(idx + GROUP_ATTENDANCE_NOTE_TOKEN.length)
  const iso = raw.split(/\s|·|\[/)[0]?.trim()
  return iso || null
}

export function mergeGroupAttendanceNote(
  currentNote: string | null | undefined,
  checkedInAt: string,
): string {
  const base = stripGroupAttendanceNote(currentNote) ?? ''
  const token = formatGroupAttendanceNote(checkedInAt)
  return base ? `${base} · ${token}` : token
}

export function stripGroupAttendanceNote(note?: string | null): string | null {
  if (!note) return null
  const cleaned = note
    .replace(/\s*·?\s*\[수업출석\][^\s·\[]*/g, '')
    .replace(/\s*·\s*$/g, '')
    .trim()
  return cleaned || null
}

export function isGroupLessonAttendanceMarked(lesson: {
  attendance_status: string
  special_note?: string | null
}): boolean {
  if (lesson.attendance_status === 'cancelled') return false
  return parseGroupAttendanceCheckedInAt(lesson.special_note) != null
}
