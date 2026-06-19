import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '컨디션 & 신체변화 리포트',
  robots: { index: false, follow: false },
}

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-[1120px] px-4 py-2 sm:px-6">{children}</div>
    </div>
  )
}
