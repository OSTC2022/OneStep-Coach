'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, Megaphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MEMBER_PORTAL_CARD_CLASS } from '@/lib/running-league/member-portal-layout'

export type MemberPortalMenuKey = 'notice' | 'training' | 'marathon'

const OPEN_MENU_STORAGE_KEY = 'onestep:member-portal-menu-open'

type MenuDef = {
  key: MemberPortalMenuKey
  label: string
  icon: typeof Megaphone
  available: boolean
}

type MemberPortalAccordionMenusProps = {
  notice?: ReactNode
  training: ReactNode
  marathon?: ReactNode
  hasNotice?: boolean
  hasMarathon?: boolean
  className?: string
}

function readStoredOpenKey(): MemberPortalMenuKey | null {
  try {
    const value = sessionStorage.getItem(OPEN_MENU_STORAGE_KEY)
    if (value === 'notice' || value === 'training' || value === 'marathon') {
      return value
    }
  } catch {
    // ignore
  }
  return null
}

function writeStoredOpenKey(key: MemberPortalMenuKey | null) {
  try {
    if (key) sessionStorage.setItem(OPEN_MENU_STORAGE_KEY, key)
    else sessionStorage.removeItem(OPEN_MENU_STORAGE_KEY)
  } catch {
    // ignore
  }
}

export function MemberPortalAccordionMenus({
  notice,
  training,
  marathon,
  hasNotice = Boolean(notice),
  hasMarathon = Boolean(marathon),
  className,
}: MemberPortalAccordionMenusProps) {
  const [openKey, setOpenKey] = useState<MemberPortalMenuKey | null>(null)
  const restoredRef = useRef(false)

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const stored = readStoredOpenKey()
    if (stored === 'notice' && !hasNotice) return
    if (stored === 'marathon' && !hasMarathon) return
    // 대회 일정은 기본 닫힘 — 이전에 열어둔 세션만 복원
    if (stored) setOpenKey(stored)
  }, [hasMarathon, hasNotice])

  const menus: MenuDef[] = [
    {
      key: 'notice',
      label: '공지사항',
      icon: Megaphone,
      available: hasNotice,
    },
    {
      key: 'training',
      label: '훈련 일정',
      icon: CalendarDays,
      available: true,
    },
    {
      key: 'marathon',
      label: '대회 일정',
      icon: CalendarDays,
      available: hasMarathon,
    },
  ].filter((menu) => menu.available)

  function toggle(key: MemberPortalMenuKey) {
    const next = openKey === key ? null : key
    setOpenKey(next)
    writeStoredOpenKey(next)
  }

  const openContent =
    openKey === 'notice'
      ? notice
      : openKey === 'training'
        ? training
        : openKey === 'marathon'
          ? marathon
          : null

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div
        className={cn(
          'grid gap-1.5',
          menus.length === 1 && 'grid-cols-1',
          menus.length === 2 && 'grid-cols-2',
          menus.length >= 3 && 'grid-cols-3',
        )}
      >
        {menus.map((menu) => {
          const Icon = menu.icon
          const open = openKey === menu.key
          return (
            <button
              key={menu.key}
              type="button"
              onClick={() => toggle(menu.key)}
              aria-expanded={open}
              className={cn(
                'flex min-w-0 items-center justify-between gap-1 rounded-xl border px-2 py-2.5 text-left transition-colors sm:gap-2 sm:px-3',
                open
                  ? 'border-primary/55 bg-primary/15 shadow-[0_0_18px_-4px] shadow-primary/45'
                  : 'border-border/80 bg-zinc-950/80 hover:border-primary/35 hover:bg-primary/[0.06]',
              )}
            >
              <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                <Icon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4',
                    open ? 'text-primary' : 'text-primary/80',
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    'truncate text-xs font-semibold sm:text-sm',
                    open ? 'text-foreground' : 'text-foreground/90',
                  )}
                >
                  {menu.label}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 sm:h-4 sm:w-4',
                  open && 'rotate-180 text-primary',
                )}
                aria-hidden
              />
            </button>
          )
        })}
      </div>

      {openContent ? (
        <div className={cn(MEMBER_PORTAL_CARD_CLASS, 'min-w-0 overflow-hidden')}>
          <div className="min-w-0 p-1 sm:p-1.5">{openContent}</div>
        </div>
      ) : null}
    </div>
  )
}
