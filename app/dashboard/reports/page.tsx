import dynamic from 'next/dynamic'
import { getReportDashboardData } from '@/lib/actions/reports'
import { StatCardsSkeleton } from '@/components/dashboard/page-skeletons'

const ReportDashboard = dynamic(
  () =>
    import('./report-dashboard').then((mod) => ({
      default: mod.ReportDashboard,
    })),
  { loading: () => <StatCardsSkeleton count={4} /> },
)

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const params = await searchParams
  const data = await getReportDashboardData(params.month)

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">리포트</h1>
        <p className="text-muted-foreground mt-1">
          센터 운영 현황을 분석합니다.
        </p>
      </div>

      <ReportDashboard
        selectedMonth={data.selectedMonth}
        previousMonth={data.previousMonth}
        isCurrentMonth={data.isCurrentMonth}
        daysInSelectedMonth={data.daysInSelectedMonth}
        stats={data.stats}
        instructorStats={data.instructorStats}
        instructorPayroll={data.instructorPayroll}
        sportStats={data.sportStats}
        monthlyRevenueTrend={data.monthlyRevenueTrend}
      />
    </div>
  )
}
