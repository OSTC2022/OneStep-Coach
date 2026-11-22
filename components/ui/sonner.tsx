'use client'

import { Toaster as Sonner, ToasterProps } from 'sonner'

/** 앱은 고정 dark — next-themes Provider 없이 useTheme 쓰면 라우트 전환 때 불안정해질 수 있음 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
