import { cn } from '@/lib/utils'
import {
  isMarathonRegistrationOpenActive,
  type MarathonCustomLabel,
  type MarathonLabelTone,
} from '@/lib/running-league/marathon-schedule'

const TONE_CLASS: Record<MarathonLabelTone, string> = {
  amber: 'border-amber-400/45 bg-amber-500/15 text-amber-100',
  sky: 'border-sky-400/40 bg-sky-500/15 text-sky-100',
  lime: 'border-lime-400/45 bg-lime-500/15 text-lime-100',
  rose: 'border-rose-400/40 bg-rose-500/15 text-rose-100',
  violet: 'border-violet-400/40 bg-violet-500/15 text-violet-100',
  zinc: 'border-zinc-500/40 bg-zinc-700/50 text-zinc-200',
}

export function marathonToneClass(tone: MarathonLabelTone): string {
  return TONE_CLASS[tone] ?? TONE_CLASS.zinc
}

type MarathonEventLabelsProps = {
  isFeatured?: boolean
  /** 신청가능 플래그 (기간 지나면 자동 숨김) */
  registrationOpen?: boolean
  eventDate?: string | null
  registrationEndDate?: string | null
  customLabels?: MarathonCustomLabel[]
  className?: string
  size?: 'sm' | 'md'
}

export function MarathonEventLabels({
  isFeatured,
  registrationOpen,
  eventDate,
  registrationEndDate,
  customLabels = [],
  className,
  size = 'sm',
}: MarathonEventLabelsProps) {
  const badges: Array<{ key: string; text: string; tone: MarathonLabelTone }> = []

  if (isFeatured) {
    badges.push({ key: 'featured', text: '인지도', tone: 'amber' })
  }
  if (
    isMarathonRegistrationOpenActive({
      registration_open: registrationOpen,
      event_date: eventDate,
      registration_end_date: registrationEndDate,
    })
  ) {
    badges.push({ key: 'reg-open', text: '신청가능', tone: 'lime' })
  }
  for (const [index, label] of customLabels.entries()) {
    const text = label.text.trim()
    if (!text) continue
    badges.push({
      key: `custom-${index}-${text}`,
      text,
      tone: label.tone ?? 'zinc',
    })
  }

  if (badges.length === 0) return null

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={cn(
            'rounded-full border font-semibold',
            size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]',
            marathonToneClass(badge.tone),
          )}
        >
          {badge.text}
        </span>
      ))}
    </span>
  )
}
