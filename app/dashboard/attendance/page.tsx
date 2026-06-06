import { getTodayAttendanceData } from '@/lib/actions/attendance'
import { AttendanceCheck } from './attendance-check'
import type { ComponentProps } from 'react'

export default async function AttendancePage() {
  const { todayLessons, instructors } = await getTodayAttendanceData()

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">출석 체크</h1>
        <p className="text-muted-foreground mt-1">
          오늘의 수업 출석 현황을 확인하고 관리합니다.
        </p>
      </div>

      <AttendanceCheck
        initialLessons={
          todayLessons as ComponentProps<typeof AttendanceCheck>['initialLessons']
        }
        instructors={instructors}
      />
    </div>
  )
}
