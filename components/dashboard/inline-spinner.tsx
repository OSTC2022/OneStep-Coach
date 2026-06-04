import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InlineSpinner({
  className,
  minHeight = 'min-h-[280px]',
}: {
  className?: string
  minHeight?: string
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center text-muted-foreground',
        minHeight,
        className,
      )}
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  )
}
