import { redirect } from 'next/navigation'
import { getDashboardProfile } from '@/lib/auth/dashboard-user'

export default async function MembersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getDashboardProfile()
  if (!user) redirect('/auth/login')
  if (user.role !== 'admin') redirect('/unauthorized')
  return <div className="min-h-0 flex-1">{children}</div>
}
