import { endOfMonth, format, startOfMonth } from 'date-fns'
import { ko } from 'date-fns/locale'

/** 현재 날짜 기준 해당 월 1일 ~ 말일 (YYYY-MM-DD) */
export function currentMonthDateRange(reference = new Date()): { start: string; end: string } {
  return {
    start: format(startOfMonth(reference), 'yyyy-MM-dd'),
    end: format(endOfMonth(reference), 'yyyy-MM-dd'),
  }
}

export function formatCurrentMonthRankingLabel(reference = new Date()): string {
  return format(reference, 'yyyy년 M월', { locale: ko })
}

export function formatNextMonthRankingResetLabel(reference = new Date()): string {
  const nextMonth = new Date(reference.getFullYear(), reference.getMonth() + 1, 1)
  return format(nextMonth, 'M월 1일', { locale: ko })
}
