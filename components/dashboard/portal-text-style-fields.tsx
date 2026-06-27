'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PortalTextStyleConfig } from '@/lib/running-league/adult-running-portal-styles'
import {
  PORTAL_FONT_FAMILY_OPTIONS,
  PORTAL_FONT_SIZE_OPTIONS,
  PORTAL_FONT_WEIGHT_OPTIONS,
  PORTAL_TEXT_ALIGN_OPTIONS,
} from '@/lib/running-league/adult-running-portal-styles'

const DEFAULT_OPTION = '__default__'

function updateStyle(
  value: PortalTextStyleConfig,
  onChange: (next: PortalTextStyleConfig) => void,
  patch: Partial<PortalTextStyleConfig>,
) {
  onChange({ ...value, ...patch })
}

export function PortalTextStyleFields({
  label,
  value,
  onChange,
  showAlign = true,
}: {
  label: string
  value: PortalTextStyleConfig
  onChange: (next: PortalTextStyleConfig) => void
  showAlign?: boolean
}) {
  return (
    <div className="space-y-3 rounded-lg border border-lime-500/15 bg-black/20 p-3">
      <p className="text-xs font-semibold text-lime-200/90">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-zinc-400">글자 색</Label>
          <div className="flex items-center gap-2">
            <Input
              type="color"
              value={value.color?.trim() || '#a3e635'}
              onChange={(event) => updateStyle(value, onChange, { color: event.target.value })}
              className="h-9 w-12 shrink-0 cursor-pointer border-lime-500/20 bg-black/40 p-1"
              aria-label={`${label} 글자 색`}
            />
            <Input
              value={value.color ?? ''}
              onChange={(event) =>
                updateStyle(value, onChange, {
                  color: event.target.value.trim() ? event.target.value : null,
                })
              }
              placeholder="기본값"
              className="border-lime-500/20 bg-black/40 font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-zinc-400">글자 크기</Label>
          <Select
            value={value.fontSize ?? DEFAULT_OPTION}
            onValueChange={(next) =>
              updateStyle(value, onChange, {
                fontSize: next === DEFAULT_OPTION ? null : (next as PortalTextStyleConfig['fontSize']),
              })
            }
          >
            <SelectTrigger className="border-lime-500/20 bg-black/40">
              <SelectValue placeholder="기본값" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_OPTION}>기본값</SelectItem>
              {PORTAL_FONT_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-zinc-400">글자 굵기</Label>
          <Select
            value={value.fontWeight ?? DEFAULT_OPTION}
            onValueChange={(next) =>
              updateStyle(value, onChange, {
                fontWeight:
                  next === DEFAULT_OPTION ? null : (next as PortalTextStyleConfig['fontWeight']),
              })
            }
          >
            <SelectTrigger className="border-lime-500/20 bg-black/40">
              <SelectValue placeholder="기본값" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_OPTION}>기본값</SelectItem>
              {PORTAL_FONT_WEIGHT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-[11px] text-zinc-400">글꼴</Label>
          <Select
            value={value.fontFamily ?? DEFAULT_OPTION}
            onValueChange={(next) =>
              updateStyle(value, onChange, {
                fontFamily:
                  next === DEFAULT_OPTION ? null : (next as PortalTextStyleConfig['fontFamily']),
              })
            }
          >
            <SelectTrigger className="border-lime-500/20 bg-black/40">
              <SelectValue placeholder="기본값" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={DEFAULT_OPTION}>기본값</SelectItem>
              {PORTAL_FONT_FAMILY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showAlign ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-[11px] text-zinc-400">글 위치 (정렬)</Label>
            <Select
              value={value.textAlign ?? DEFAULT_OPTION}
              onValueChange={(next) =>
                updateStyle(value, onChange, {
                  textAlign:
                    next === DEFAULT_OPTION ? null : (next as PortalTextStyleConfig['textAlign']),
                })
              }
            >
              <SelectTrigger className="border-lime-500/20 bg-black/40">
                <SelectValue placeholder="기본값" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_OPTION}>기본값</SelectItem>
                {PORTAL_TEXT_ALIGN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
    </div>
  )
}
