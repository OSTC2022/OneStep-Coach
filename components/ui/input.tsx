import * as React from 'react'

import { cn } from '@/lib/utils'

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function adjustNumberInputValue(input: HTMLInputElement, direction: 1 | -1) {
  const step = Number(input.step) || 1
  const min = input.min !== '' ? Number(input.min) : Number.NEGATIVE_INFINITY
  const max = input.max !== '' ? Number(input.max) : Number.POSITIVE_INFINITY
  const parsed = Number(input.value)
  const base = Number.isFinite(parsed)
    ? parsed
    : Number.isFinite(min)
      ? min
      : 0
  const next = Math.min(max, Math.max(min, base + direction * step))
  if (next === base && input.value !== '') return
  setNativeInputValue(input, String(next))
}

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  function Input({ className, type, ...props }, ref) {
    const innerRef = React.useRef<HTMLInputElement | null>(null)

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node
        if (typeof ref === 'function') {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref],
    )

    React.useEffect(() => {
      const el = innerRef.current
      if (!el || type !== 'number') return

      const handleWheel = (event: WheelEvent) => {
        if (el.disabled || el.readOnly) return
        if (document.activeElement !== el && !el.matches(':hover')) return

        event.preventDefault()
        event.stopPropagation()
        adjustNumberInputValue(el, event.deltaY < 0 ? 1 : -1)
      }

      el.addEventListener('wheel', handleWheel, { passive: false })
      return () => el.removeEventListener('wheel', handleWheel)
    }, [type])

    return (
      <input
        ref={setRefs}
        type={type}
        data-slot="input"
        className={cn(
          'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          className,
        )}
        {...props}
      />
    )
  },
)

Input.displayName = 'Input'

export { Input }
