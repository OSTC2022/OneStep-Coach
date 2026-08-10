import { cn } from '@/lib/utils'

type MedalTone = 'gold' | 'silver' | 'bronze'

const MEDAL_BY_RANK: Record<number, MedalTone> = {
  1: 'gold',
  2: 'silver',
  3: 'bronze',
}

const TONE_STYLE: Record<
  MedalTone,
  {
    disc: string
    rim: string
    number: string
    glow: string
    ribbonLeft: string
    ribbonRight: string
  }
> = {
  gold: {
    disc: 'from-[#fff3a8] via-[#f5c542] to-[#b8860b]',
    rim: 'from-[#ffe9a0] via-[#d4a017] to-[#8b6914]',
    number: 'text-[#5c3d0a] drop-shadow-[0_1px_0_rgba(255,236,170,0.85)]',
    glow: 'shadow-[0_2px_8px_rgba(245,197,66,0.55),0_0_14px_rgba(245,197,66,0.28)]',
    ribbonLeft: 'from-[#5eb8ff] to-[#1d6fb8]',
    ribbonRight: 'from-[#7ec8ff] to-[#2a7fc4]',
  },
  silver: {
    disc: 'from-[#ffffff] via-[#d7dee8] to-[#8e9aab]',
    rim: 'from-[#f4f7fb] via-[#a8b4c4] to-[#6b788a]',
    number: 'text-[#2f3a48] drop-shadow-[0_1px_0_rgba(255,255,255,0.9)]',
    glow: 'shadow-[0_2px_8px_rgba(180,190,205,0.5),0_0_12px_rgba(200,210,225,0.25)]',
    ribbonLeft: 'from-[#6bbfff] to-[#2a6fad]',
    ribbonRight: 'from-[#8fd0ff] to-[#3a82bc]',
  },
  bronze: {
    disc: 'from-[#ffd2a8] via-[#cd7f32] to-[#8a4b1f]',
    rim: 'from-[#f0b888] via-[#a85c28] to-[#6a3514]',
    number: 'text-[#3d1f0c] drop-shadow-[0_1px_0_rgba(255,210,170,0.75)]',
    glow: 'shadow-[0_2px_8px_rgba(205,127,50,0.5),0_0_12px_rgba(205,127,50,0.25)]',
    ribbonLeft: 'from-[#5eb8ff] to-[#1d6fb8]',
    ribbonRight: 'from-[#7ec8ff] to-[#2a7fc4]',
  },
}

/** 1~3위 금·은·동 3D 메달 */
export function RankMedalDisplay({
  rank,
  className,
  size = 'md',
}: {
  rank: number
  className?: string
  size?: 'sm' | 'md'
}) {
  const tone = MEDAL_BY_RANK[rank]
  const compact = size === 'sm'
  if (!tone) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center leading-none',
          compact ? 'h-8 w-8' : 'w-11',
          className,
        )}
        aria-label={`${rank}위`}
        title={`${rank}위`}
      >
        <span
          className={cn(
            'font-bold tabular-nums text-zinc-200',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {rank}위
        </span>
      </span>
    )
  }

  const style = TONE_STYLE[tone]

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-end justify-center',
        compact ? 'h-8 w-8' : 'h-9 w-11',
        className,
      )}
      aria-label={`${rank}위`}
      title={`${rank}위`}
    >
      {/* ribbon */}
      <span
        className={cn(
          'pointer-events-none absolute top-0 z-0 flex justify-center',
          compact ? 'h-3 w-4' : 'h-3.5 w-5',
        )}
      >
        <span
          className={cn(
            'absolute top-0 origin-top -skew-x-[14deg] rounded-[1px] bg-gradient-to-b shadow-[inset_-1px_0_0_rgba(255,255,255,0.35)]',
            compact ? 'left-[2px] h-3 w-[6px]' : 'left-[3px] h-3.5 w-[7px]',
            style.ribbonLeft,
          )}
        />
        <span
          className={cn(
            'absolute top-0 origin-top skew-x-[14deg] rounded-[1px] bg-gradient-to-b shadow-[inset_1px_0_0_rgba(255,255,255,0.4)]',
            compact ? 'right-[2px] h-3 w-[6px]' : 'right-[3px] h-3.5 w-[7px]',
            style.ribbonRight,
          )}
        />
      </span>

      {/* medal disc */}
      <span
        className={cn(
          'relative z-10 flex items-center justify-center rounded-full bg-gradient-to-br p-[2px]',
          compact ? 'mb-0 h-6 w-6' : 'mb-0.5 h-7 w-7',
          style.rim,
          style.glow,
        )}
        style={{
          transform: 'perspective(40px) rotateX(12deg)',
        }}
      >
        <span
          className={cn(
            'relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br',
            style.disc,
          )}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[2px] rounded-full bg-[radial-gradient(circle_at_30%_22%,rgba(255,255,255,0.85)_0%,rgba(255,255,255,0.2)_28%,transparent_55%)]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-[3px] rounded-full border border-black/10 shadow-[inset_0_1px_2px_rgba(255,255,255,0.55),inset_0_-1px_2px_rgba(0,0,0,0.22)]"
          />
          <span
            className={cn(
              'relative z-10 font-black leading-none tabular-nums',
              compact ? 'text-[10px]' : 'text-[11px]',
              style.number,
            )}
          >
            {rank}
          </span>
        </span>
      </span>
    </span>
  )
}
