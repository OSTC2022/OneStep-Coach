import type { ReactNode } from 'react'

export default function MemberPortalLayout({ children }: { children: ReactNode }) {
  return <div className="p-4 md:p-6">{children}</div>
}
