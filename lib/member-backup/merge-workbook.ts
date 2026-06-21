import 'server-only'

import * as XLSX from 'xlsx'
import { BACKUP_ROW_KEY } from '@/lib/member-backup/fetch-monthly-data'

const SUMMARY_SHEET = '회원_요약'
const ATTENDANCE_SHEET = '출석_내역'
const MEMBER_ID_COL = '회원ID'

type Row = Record<string, unknown>

function sheetToRows(sheet: XLSX.WorkSheet | undefined): Row[] {
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: '' })
}

function rowsToSheet(rows: Row[]): XLSX.WorkSheet {
  if (rows.length === 0) {
    return XLSX.utils.aoa_to_sheet([[]])
  }
  return XLSX.utils.json_to_sheet(rows)
}

function deriveRowKey(row: Row, sheetName: string): string {
  const explicit = row[BACKUP_ROW_KEY]
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()

  if (sheetName === ATTENDANCE_SHEET) {
    const memberId = String(row['회원ID'] ?? row['회원명'] ?? '')
    const date = String(row['출석일'] ?? '')
    const start = String(row['시작시간'] ?? '').slice(0, 5)
    if (memberId && date) return `att|${memberId}|${date}|${start}`
  }

  if (sheetName.includes('월')) {
    const type = String(row['구분'] ?? '')
    if (type === '결제') {
      const pkgId = String(row['패키지ID'] ?? '')
      if (pkgId) return `pay|${pkgId}`
    }
    if (type === '출석') {
      const memberId = String(row['회원ID'] ?? row['회원명'] ?? '')
      const date = String(row['일자'] ?? '')
      const start = String(row['시작시간'] ?? '').slice(0, 5)
      if (memberId && date) return `att|${memberId}|${date}|${start}`
    }
  }

  return ''
}

/** 기존 행 유지 + 새 행 중 키가 없는 것만 추가 */
function mergeRowsPreserveExisting(
  existing: Row[],
  incoming: Row[],
  sheetName: string,
): Row[] {
  const merged = [...existing]
  const seen = new Set(
    existing.map((row) => deriveRowKey(row, sheetName)).filter(Boolean),
  )

  for (const row of incoming) {
    const key = deriveRowKey(row, sheetName)
    if (!key) {
      merged.push(row)
      continue
    }
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(row)
  }

  return merged
}

/** 회원_요약 — 회원ID 기준 최신 스냅샷 우선 */
function mergeSummaryRows(existing: Row[], incoming: Row[]): Row[] {
  const byMember = new Map<string, Row>()

  const memberKey = (row: Row) =>
    String(row[MEMBER_ID_COL] ?? row['회원명'] ?? '')

  for (const row of existing) {
    const id = memberKey(row)
    if (id) byMember.set(id, row)
  }
  for (const row of incoming) {
    const id = memberKey(row)
    if (id) byMember.set(id, row)
  }

  return Array.from(byMember.values())
}

function sortSheetNames(names: string[]): string[] {
  const priority = (name: string): number => {
    if (name === SUMMARY_SHEET) return 0
    if (name === ATTENDANCE_SHEET) return 1
    return 2
  }

  return [...names].sort((a, b) => {
    const pa = priority(a)
    const pb = priority(b)
    if (pa !== pb) return pa - pb
    return a.localeCompare(b, 'ko')
  })
}

export function mergeBackupWorkbooks(
  existingBuffer: Buffer | null,
  freshBuffer: Buffer,
): Buffer {
  const freshWb = XLSX.read(freshBuffer, { type: 'buffer' })
  const existingWb = existingBuffer
    ? XLSX.read(existingBuffer, { type: 'buffer' })
    : null

  const sheetNames = new Set<string>([
    ...(existingWb?.SheetNames ?? []),
    ...freshWb.SheetNames,
  ])

  const mergedWb = XLSX.utils.book_new()

  for (const name of sortSheetNames(Array.from(sheetNames))) {
    const existingRows = sheetToRows(existingWb?.Sheets[name])
    const freshRows = sheetToRows(freshWb.Sheets[name])

    let mergedRows: Row[]
    if (name === SUMMARY_SHEET) {
      mergedRows = mergeSummaryRows(existingRows, freshRows)
    } else if (freshRows.length === 0) {
      mergedRows = existingRows
    } else if (existingRows.length === 0) {
      mergedRows = freshRows
    } else {
      mergedRows = mergeRowsPreserveExisting(existingRows, freshRows, name)
    }

    XLSX.utils.book_append_sheet(mergedWb, rowsToSheet(mergedRows), name)
  }

  const arrayBuffer = XLSX.write(mergedWb, {
    type: 'array',
    bookType: 'xlsx',
  }) as ArrayBuffer

  return Buffer.from(arrayBuffer)
}
