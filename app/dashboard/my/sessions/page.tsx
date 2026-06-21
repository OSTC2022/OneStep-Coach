import { redirect } from 'next/navigation'
import { getMemberPortalData } from '@/lib/actions/member-portal'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'
import { MemberPortalUnavailable } from '@/components/dashboard/member-portal-unavailable'
import { isMemberPortalRole } from '@/lib/member-portal-routes'
import { loadMemberLessonRecords } from '@/lib/member-portal-lessons'
import { MemberSessionsPage } from '../member-sessions-page'

export default async function MySessionsPage() {
  const [profile, data] = await Promise.all([
    getDashboardProfile(),
    getMemberPortalData(),
  ])

  if (!data) {
    if (profile && isMemberPortalRole(profile.role)) {
      return <MemberPortalUnavailable userName={profile.full_name} />
    }
    redirect('/auth/login')
  }

  const lessonRecords = await loadMemberLessonRecords(data.member.id)

  return <MemberSessionsPage data={data} lessonRecords={lessonRecords} />
}
