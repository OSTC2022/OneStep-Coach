import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import {
  fetchMemberBackupData,
  formatAttendanceStatus,
  type MemberAttendanceRow,
  type MemberBackupRow,
} from '@/lib/member-backup/fetch-data'

function buildSummarySheet(rows: MemberBackupRow[]) {
  return rows.map((row) => ({
    회원명: row.name,
    종목: row.sport ?? '',
    연락처: row.phone ?? '',
    활성: row.isActive ? 'Y' : 'N',
    '세션 총횟수': row.totalSessions,
    '남은 횟수': row.remainingSessions,
    '사용 횟수': row.usedSessions,
    '회원 잔여(캐시)': row.memberRemainingCached,
    출석횟수: row.attendanceCount,
    최근출석일: row.lastAttendanceDate ?? '',
  }))
}

function buildAttendanceSheet(rows: MemberAttendanceRow[]) {
  return rows.map((row) => ({
    회원명: row.memberName,
    출석일: row.lessonDate,
    시작시간: row.startTime?.slice(0, 5) ?? '',
    종료시간: row.endTime?.slice(0, 5) ?? '',
    상태: formatAttendanceStatus(row.status),
    '수업권 차감': row.sessionDeducted ? 'Y' : 'N',
  }))
}

export async function buildMemberBackupWorkbookBuffer(
  supabase: SupabaseClient,
): Promise<{
  buffer: Buffer
  memberCount: number
  attendanceCount: number
}> {
  const { members, attendance } = await fetchMemberBackupData(supabase)
  const workbook = XLSX.utils.book_new()

  const summarySheet = XLSX.utils.json_to_sheet(buildSummarySheet(members))
  XLSX.utils.book_append_sheet(workbook, summarySheet, '회원_요약')

  const attendanceSheet = XLSX.utils.json_to_sheet(buildAttendanceSheet(attendance))
  XLSX.utils.book_append_sheet(workbook, attendanceSheet, '출석_내역')

  const arrayBuffer = XLSX.write(workbook, {
    type: 'array',
    bookType: 'xlsx',
  }) as ArrayBuffer

  return {
    buffer: Buffer.from(arrayBuffer),
    memberCount: members.length,
    attendanceCount: attendance.length,
  }
}

/** Drive에 항상 덮어쓰는 단일 파일명 (날짜별 복사본 없음) */
export const MEMBER_BACKUP_DRIVE_FILENAME = '회원백업.xlsx'

/** PC 다운로드용 — 로컬 저장 시에만 날짜 포함 */
export function buildMemberBackupDownloadFilename(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `회원백업-${y}-${m}-${d}.xlsx`
}
