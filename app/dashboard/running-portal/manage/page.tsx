import { requireAdultRunningPortalManageAccess, getAdultRunningPortalManageMonthData } from '@/lib/actions/adult-running-portal-manage'
import { RunningPortalManageView } from '@/components/dashboard/running-portal-manage-view'

export const dynamic = 'force-dynamic'

type PageProps = {
  searchParams?: Promise<{ month?: string | string[] }>
}

export default async function RunningPortalManagePage({ searchParams }: PageProps) {
  await requireAdultRunningPortalManageAccess()

  const params = searchParams ? await searchParams : {}
  const monthParam = Array.isArray(params.month) ? params.month[0] : params.month
  const data = await getAdultRunningPortalManageMonthData(monthParam)

  return <RunningPortalManageView data={data} />
}
