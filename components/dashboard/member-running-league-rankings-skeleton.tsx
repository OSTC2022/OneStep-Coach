import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function MemberRunningLeagueRankingsSkeleton({
  className,
}: {
  className?: string
} = {}) {
  return (
    <section
      className={cn(
        'flex w-full max-w-full flex-col gap-2.5 overflow-x-hidden sm:mx-auto sm:max-w-xl sm:gap-4 lg:max-w-2xl',
        className,
      )}
    >
      <Skeleton className="h-28 w-full rounded-xl bg-zinc-800/60" />
      <Skeleton className="h-[280px] w-full rounded-xl bg-zinc-800/70" />
      <Skeleton className="h-36 w-full rounded-xl bg-zinc-800/60" />
      <Skeleton className="h-12 w-full rounded-lg bg-lime-500/10" />
      <Skeleton className="h-20 w-full rounded-xl bg-zinc-800/50" />
    </section>
  )
}
