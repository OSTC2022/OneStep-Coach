import { redirect } from 'next/navigation'
import { requireDashboardProfile } from '@/lib/auth/dashboard-user'

export default async function MembersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireDashboardProfile()
  if (user.role !== 'admin') redirect('/unauthorized')
  return <div className="min-h-0 flex-1">{children}</div>
}
