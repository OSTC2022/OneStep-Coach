import Image from 'next/image'
import { cn } from '@/lib/utils'

export const BRAND_PULSE_ICON_SRC = '/brand-pulse-icon.png?v=10'

const GLOW_CLASS =
  'drop-shadow-[0_0_10px_rgba(170,255,0,0.9)] drop-shadow-[0_0_22px_rgba(170,255,0,0.55)] drop-shadow-[0_0_40px_rgba(170,255,0,0.28)]'

/** App icon — green squircle only, transparent outside */
export function BrandPulseAppIcon({
  className,
  glow = false,
}: {
  className?: string
  glow?: boolean
}) {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0',
        glow &&
          'before:pointer-events-none before:absolute before:inset-[8%] before:rounded-[22%] before:bg-[radial-gradient(circle,rgba(170,255,0,0.38)_0%,transparent_72%)] before:blur-md',
      )}
    >
      <Image
        src={BRAND_PULSE_ICON_SRC}
        alt=""
        width={512}
        height={512}
        unoptimized
        aria-hidden
        className={cn('relative bg-transparent', glow && GLOW_CLASS, className)}
      />
    </span>
  )
}

/** @deprecated Use BrandPulseAppIcon */
export const BrandPulseMark = BrandPulseAppIcon
