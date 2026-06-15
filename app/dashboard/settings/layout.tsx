import type { ReactNode } from 'react'
import { SettingsNav } from './settings-nav'

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="w-full min-w-0 max-w-full space-y-6 pt-12 lg:pt-0">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold lg:text-3xl">설정</h1>
          <p className="mt-1 text-muted-foreground">
            계정·권한·센터 연락 채널을 관리합니다.
          </p>
        </div>
        <SettingsNav />
      </div>
      {children}
    </div>
  )
}
