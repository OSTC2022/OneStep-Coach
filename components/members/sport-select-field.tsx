'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  MEMBER_SPORT_OPTIONS,
  SPORT_OTHER,
  parseMemberSport,
  resolveMemberSport,
} from '@/lib/member-utils'

interface SportSelectFieldProps {
  id?: string
  label?: string
  value?: string
  onChange: (sport: string) => void
  showLabel?: boolean
  className?: string
}

export function SportSelectField({
  id = 'sport',
  label = '종목 (선택)',
  value = '',
  onChange,
  showLabel = true,
  className,
}: SportSelectFieldProps) {
  const [preset, setPreset] = useState(() => parseMemberSport(value).preset)
  const [other, setOther] = useState(() => parseMemberSport(value).other)

  useEffect(() => {
    const parsed = parseMemberSport(value)
    setPreset(parsed.preset)
    setOther(parsed.other)
  }, [value])

  function handlePresetChange(nextPreset: string) {
    setPreset(nextPreset)
    if (nextPreset !== SPORT_OTHER) {
      setOther('')
    }
    onChange(resolveMemberSport(nextPreset, nextPreset === SPORT_OTHER ? other : ''))
  }

  function handleOtherChange(nextOther: string) {
    setOther(nextOther)
    onChange(resolveMemberSport(SPORT_OTHER, nextOther))
  }

  return (
    <div className={cn('space-y-2', className)}>
      {showLabel && <Label htmlFor={id}>{label}</Label>}
      <div className="flex gap-2">
        <Select value={preset || undefined} onValueChange={handlePresetChange}>
          <SelectTrigger id={id} className="bg-input border-border w-[140px] shrink-0">
            <SelectValue placeholder="종목 선택" />
          </SelectTrigger>
          <SelectContent>
            {MEMBER_SPORT_OPTIONS.map((sport) => (
              <SelectItem key={sport} value={sport}>
                {sport}
              </SelectItem>
            ))}
            <SelectItem value={SPORT_OTHER}>{SPORT_OTHER}</SelectItem>
          </SelectContent>
        </Select>
        {preset === SPORT_OTHER && (
          <Input
            value={other}
            onChange={(e) => handleOtherChange(e.target.value)}
            placeholder="종목 입력"
            className="bg-input border-border flex-1"
            aria-label="기타 종목"
          />
        )}
      </div>
    </div>
  )
}
