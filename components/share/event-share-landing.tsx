'use client'

import { useEffect, useState } from 'react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { Loader2 } from 'lucide-react'

function isLinkPreviewBot() {
  if (typeof navigator === 'undefined') return false
  return /kakaotalk|facebookexternalhit|twitterbot|slackbot|linkedinbot|discordbot|whatsapp|telegrambot|embedly|pinterest/i.test(
    navigator.userAgent,
  )
}

export function EventShareLanding({ href }: { href: string }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (isLinkPreviewBot()) return
    const timer = window.setTimeout(() => {
      try {
        window.location.replace(href)
      } catch {
        setFailed(true)
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [href])

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-[#070d18] px-6 text-center text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,rgba(170,255,0,0.18),transparent_55%)]"
      />
      <BrandPulseAppIcon glow className="relative h-20 w-20" />
      <p className="relative mt-4 text-3xl font-black tracking-tight">원스텝</p>
      <p className="relative mt-2 text-sm font-semibold text-[#aaff00]">기록 맞추기</p>
      <p className="relative mt-3 max-w-xs text-sm leading-relaxed text-white/65">
        대회 예상 기록을 맞추고, 가장 가까운 사람이 상품을 받습니다.
      </p>
      {failed ? (
        <a
          href={href}
          className="relative mt-8 inline-flex rounded-xl bg-[#aaff00] px-5 py-2.5 text-sm font-bold text-[#070d18]"
        >
          이벤트로 이동
        </a>
      ) : (
        <p className="relative mt-8 inline-flex items-center gap-2 text-xs text-white/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          이벤트로 이동 중…
        </p>
      )}
    </main>
  )
}
