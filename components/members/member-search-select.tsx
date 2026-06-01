'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { filterAndSortKoreanNames } from '@/lib/korean-search'

export interface MemberSearchOption {
  id: string
  name: string
}

interface MemberSearchSelectProps {
  value: string
  onValueChange: (value: string) => void
  members: MemberSearchOption[]
  placeholder?: string
  disabledIds?: string[]
  className?: string
  compact?: boolean
  /** 검색 입력을 항상 표시 (추가 모드용) */
  inlineSearch?: boolean
  /** 회원 검색 없이 아무 텍스트나 입력 가능 */
  allowFreeText?: boolean
  inputValue?: string
  onInputValueChange?: (value: string) => void
}

export function MemberSearchSelect({
  value,
  onValueChange,
  members,
  placeholder = '이름 검색',
  disabledIds = [],
  className,
  compact = false,
  inlineSearch = false,
  allowFreeText = false,
  inputValue,
  onInputValueChange,
}: MemberSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [internalQuery, setInternalQuery] = useState('')

  const selected = members.find((m) => m.id === value)
  const query = inputValue ?? internalQuery

  function setQuery(next: string) {
    if (onInputValueChange) {
      onInputValueChange(next)
    } else {
      setInternalQuery(next)
    }
  }

  useEffect(() => {
    if (inputValue !== undefined) return
    if (value && selected) {
      setInternalQuery(selected.name)
    } else if (!value) {
      setInternalQuery('')
    }
  }, [value, selected?.name, inputValue])

  const available = useMemo(
    () => members.filter((m) => m.id === value || !disabledIds.includes(m.id)),
    [members, value, disabledIds],
  )

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return available.slice(0, 12)
    return filterAndSortKoreanNames(available, q, 15)
  }, [available, query])

  if (inlineSearch || allowFreeText) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={query}
            onChange={(e) => {
              const next = e.target.value
              setQuery(next)
              if (value && selected && next !== selected.name) {
                onValueChange('')
              }
            }}
            className={cn('pl-8', compact && 'h-8 text-sm')}
          />
        </div>
        {query.trim() && filtered.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-sm">
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onValueChange(m.id)
                  setQuery(m.name)
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}
        {!allowFreeText && query.trim() && filtered.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">회원을 찾을 수 없습니다.</p>
        )}
        {!allowFreeText && selected && !query && (
          <p className="px-1 text-xs text-muted-foreground">선택: {selected.name}</p>
        )}
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'w-full justify-between font-normal',
            compact && 'h-8 text-sm',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            {!selected && <Search className="h-3.5 w-3.5 shrink-0 opacity-60" />}
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="이름 검색..."
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>회원을 찾을 수 없습니다.</CommandEmpty>
            <CommandGroup>
              {(query.trim() ? filtered : available.slice(0, 12)).map((m) => (
                <CommandItem
                  key={m.id}
                  value={m.name}
                  onSelect={() => {
                    onValueChange(m.id === value ? '' : m.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === m.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  {m.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
