export function EventNewMark({ label = '새 글' }: { label?: string }) {
  return (
    <span
      className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-primary px-0.5 text-[10px] font-black leading-none text-primary-foreground"
      aria-label={label}
      title={label}
    >
      N
    </span>
  )
}
