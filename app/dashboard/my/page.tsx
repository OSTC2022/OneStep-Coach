import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { MemberMyPage } from './member-my-page'

export default async function MyDashboardPage() {
  const data = await getMemberPortalData()

  if (!data) {
    redirect('/auth/login')
  }

  return <MemberMyPage data={data} />
}
