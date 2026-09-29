'use client'

import type { CSSProperties, ReactNode } from 'react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { BRAND_PULSE_GREEN } from '@/lib/brand-pulse-svg'
import { cn } from '@/lib/utils'

const BRAND_NAME = '원스텝'

type MemberPortalHeroShellProps = {
  children: ReactNode
  className?: string
  /** SVG id 접두사 — 같은 페이지에 여러 히어로가 있을 때 충돌 방지 */
  idPrefix?: string
  eyebrow?: ReactNode
}

/** 심볼 + 원스텝 브랜드를 한 묶음으로, 이어지는 제목은 옆에 배치 */
export function PortalBrandTitleLockup({
  title,
  className,
  style,
}: {
  title: string
  className?: string
  style?: CSSProperties
}) {
  const trimmed = title.trim()
  const hasBrandPrefix = trimmed.startsWith(BRAND_NAME)
  const brandLabel = hasBrandPrefix ? BRAND_NAME : trimmed
  const rest = hasBrandPrefix ? trimmed.slice(BRAND_NAME.length).trimStart() : ''

  return (
    <h1 className="flex flex-wrap items-center gap-x-[0.32em] gap-y-1 leading-none tracking-tight">
      <span className="inline-flex items-center gap-2.5 sm:gap-3">
        <span className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center sm:h-14 sm:w-14">
          <span
            aria-hidden
            className="absolute inset-[-28%] rounded-full bg-[#AAFF00]/15 blur-xl"
          />
          <BrandPulseAppIcon
            glow
            className="onestep-symbol-soft-blink relative !h-full !w-full"
          />
        </span>
        <span className={cn('whitespace-nowrap', className)} style={style}>
          {brandLabel}
        </span>
      </span>
      {rest ? (
        <span className={cn('min-w-0', className)} style={style}>
          {rest}
        </span>
      ) : null}
    </h1>
  )
}

/**
 * 육상선수반 포털과 같은 트랙 히어로 프레임.
 * 배경·글로우·레인·대시 애니메이션을 공통으로 제공합니다.
 */
export function MemberPortalHeroShell({
  children,
  className,
  idPrefix = 'portal-hero',
  eyebrow,
}: MemberPortalHeroShellProps) {
  const glowId = `${idPrefix}-track-glow`
  const softId = `${idPrefix}-track-soft`

  return (
    <section
      className={cn(
        'relative isolate overflow-hidden rounded-[1.35rem] border border-[#AAFF00]/30 bg-[#070807] px-4 py-5 shadow-[0_0_0_1px_rgba(170,255,0,0.06),0_20px_60px_rgba(0,0,0,0.55)] sm:px-6 sm:py-6',
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-[-40%] h-[140%] w-[70%] rounded-full bg-[radial-gradient(circle,rgba(170,255,0,0.16)_0%,transparent_68%)] blur-2xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 bottom-[-30%] h-[90%] w-[55%] rounded-full bg-[radial-gradient(circle,rgba(170,255,0,0.1)_0%,transparent_70%)] blur-3xl"
      />

      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-[62%] origin-left opacity-40 [transform:perspective(700px)_rotateY(18deg)]"
        style={{
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0, transparent 16px, ${BRAND_PULSE_GREEN}55 16px, ${BRAND_PULSE_GREEN}55 17px)`,
          maskImage:
            'linear-gradient(90deg, black 8%, black 50%, transparent 95%), linear-gradient(180deg, transparent, black 18%, black 82%, transparent)',
          WebkitMaskImage:
            'linear-gradient(90deg, black 8%, black 50%, transparent 95%), linear-gradient(180deg, transparent, black 18%, black 82%, transparent)',
          maskComposite: 'intersect',
          WebkitMaskComposite: 'source-in',
        }}
      />

      <svg
        aria-hidden
        className="pointer-events-none absolute -left-[12%] top-1/2 h-[175%] w-[95%] -translate-y-1/2"
        viewBox="0 0 420 420"
        fill="none"
      >
        <defs>
          <linearGradient id={glowId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={BRAND_PULSE_GREEN} stopOpacity="0.05" />
            <stop offset="45%" stopColor={BRAND_PULSE_GREEN} stopOpacity="0.75" />
            <stop offset="100%" stopColor={BRAND_PULSE_GREEN} stopOpacity="0.1" />
          </linearGradient>
          <filter id={softId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <path
          d="M48 48 C 230 48, 372 128, 372 210 C 372 292, 230 372, 48 372"
          stroke={`url(#${glowId})`}
          strokeWidth="18"
          strokeLinecap="round"
          opacity="0.55"
          filter={`url(#${softId})`}
        />
        <path
          d="M78 78 C 220 78, 332 138, 332 210 C 332 282, 220 342, 78 342"
          className="youth-track-dash-flow"
          stroke={BRAND_PULSE_GREEN}
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.4"
        />
        <path
          d="M108 108 C 210 108, 292 148, 292 210 C 292 272, 210 312, 108 312"
          className="youth-track-dash-flow"
          stroke={BRAND_PULSE_GREEN}
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.85"
          style={{ animationDelay: '-1s' }}
        />
      </svg>

      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 top-1/2 -translate-y-1/2 opacity-[0.18] sm:-right-3 sm:opacity-[0.22]"
      >
        <div className="onestep-heartbeat">
          <BrandPulseAppIcon glow className="h-40 w-40 sm:h-52 sm:w-52" />
        </div>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#070807]/20 via-[#070807]/75 to-[#070807]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#AAFF00]/55 to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#AAFF00]/25 to-transparent"
      />

      {eyebrow ? <div className="relative z-10 mb-3">{eyebrow}</div> : null}
      <div className="relative z-10">{children}</div>
    </section>
  )
}
