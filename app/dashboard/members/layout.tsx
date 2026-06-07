import { requireMemberViewer } from '@/lib/auth/member-access'

export default async function MembersLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireMemberViewer()
  return <div className="min-h-0 flex-1">{children}</div>
}
