import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

const rankingCardClass =
  'overflow-hidden rounded-xl border border-lime-500/25 bg-zinc-900/70'

export function MemberRunningLeagueRankingsSkeleton({
  className,
}: {
  className?: string
} = {}) {
  return (
    <section
      className={cn(
        'flex w-full max-w-full flex-col gap-2.5 overflow-x-hidden sm:gap-4',
        className,
      )}
    >
      <div className="flex flex-col gap-2.5 lg:hidden">
        <Skeleton className="h-[280px] w-full rounded-xl bg-zinc-800/70" />
        <Skeleton className="h-36 w-full rounded-xl bg-zinc-800/60" />
        <Skeleton className="h-12 w-full rounded-lg bg-lime-500/10" />
        <Skeleton className="h-20 w-full rounded-xl bg-zinc-800/50" />
        <Skeleton className="h-28 w-full rounded-xl bg-zinc-800/60" />
      </div>

      <div className={cn(rankingCardClass, 'hidden lg:block')}>
        <div className="space-y-3 border-b border-lime-500/15 bg-black/20 px-4 py-3.5 sm:px-5">
          <Skeleton className="h-6 w-40 bg-lime-500/10" />
          <Skeleton className="h-4 w-64 max-w-full bg-zinc-800" />
          <Skeleton className="h-10 w-full max-w-full rounded-lg bg-zinc-800/60" />
        </div>
        <div className="space-y-4 px-4 py-4 sm:px-5">
          <div className="space-y-2 rounded-xl border border-lime-500/20 bg-black/25 p-3 sm:p-4">
            <Skeleton className="h-10 w-full rounded-lg bg-zinc-800/80" />
            <Skeleton className="h-10 w-full rounded-lg bg-zinc-800/80" />
            <Skeleton className="h-10 w-full rounded-lg bg-zinc-800/80" />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-4">
            <div className={cn(rankingCardClass, 'border-lime-400/25')}>
              <div className="border-b border-lime-500/15 bg-black/20 px-4 py-3.5">
                <Skeleton className="h-5 w-44 bg-lime-500/10" />
                <Skeleton className="mt-2 h-4 w-56 max-w-full bg-zinc-800" />
              </div>
              <div className="space-y-2 px-4 py-4">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-11 w-full rounded-lg bg-zinc-800/80" />
                ))}
                <Skeleton className="h-10 w-full rounded-lg bg-zinc-800/60" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-28 bg-zinc-800" />
              <Skeleton className="min-h-[360px] w-full rounded-xl bg-zinc-800/60" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
