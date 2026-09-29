'use client'

import { useMemo, useState, useTransition } from 'react'
import { format, parseISO } from 'date-fns'
import {
  Loader2,
  Plus,
  Save,
  Target,
  Trash2,
  TrendingDown,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  addYouthAthleticsPbRecord,
  deleteYouthAthleticsPbRecord,
  saveYouthAthleticsPrimaryEvents,
  type YouthAthleticsPbBundle,
} from '@/lib/actions/youth-athletics-pb'
import {
  YOUTH_ATHLETICS_EVENT_OPTIONS,
  formatYouthAthleticsResultValue,
  getYouthAthleticsEventKind,
  getYouthAthleticsEventLabel,
  sortYouthAthleticsEventsByDistance,
  type YouthAthleticsEventKey,
} from '@/lib/youth-athletics-events'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type YouthAthleticsPbPanelProps = {
  initial: YouthAthleticsPbBundle
  readOnly?: boolean
  onPrimaryEventsChange?: (next: {
    event1: YouthAthleticsEventKey | null
    event2: YouthAthleticsEventKey | null
  }) => void
}

const NONE_VALUE = '__none__'

export function YouthAthleticsPbPanel({
  initial,
  readOnly = false,
  onPrimaryEventsChange,
}: YouthAthleticsPbPanelProps) {
  const [pending, startTransition] = useTransition()
  const [bundle, setBundle] = useState(initial)
  const [event1, setEvent1] = useState(initial.primaryEvent1 ?? '')
  const [event2, setEvent2] = useState(initial.primaryEvent2 ?? '')
  const [selectedEvent, setSelectedEvent] = useState(
    initial.primaryEvent1 ?? initial.primaryEvent2 ?? '100m',
  )
  const [resultText, setResultText] = useState('')
  const [measuredAt, setMeasuredAt] = useState(
    () => new Date().toISOString().slice(0, 10),
  )
  const [editing, setEditing] = useState(
    () => !initial.primaryEvent1 && !initial.primaryEvent2,
  )

  const primaryKeys = useMemo(
    () =>
      sortYouthAthleticsEventsByDistance([
        bundle.primaryEvent1,
        bundle.primaryEvent2,
      ]),
    [bundle.primaryEvent1, bundle.primaryEvent2],
  )
  const hasPrimaryEvents = primaryKeys.length > 0
  const showEditor = editing || !hasPrimaryEvents

  const chartEvent = useMemo(() => {
    if (primaryKeys.includes(selectedEvent as YouthAthleticsEventKey)) {
      return selectedEvent as YouthAthleticsEventKey
    }
    return primaryKeys[0] ?? (selectedEvent as YouthAthleticsEventKey)
  }, [primaryKeys, selectedEvent])

  const chartKind = getYouthAthleticsEventKind(chartEvent)
  const chartRecords = useMemo(
    () =>
      bundle.records
        .filter((row) => row.event_key === chartEvent)
        .slice()
        .sort((a, b) => a.measured_at.localeCompare(b.measured_at)),
    [bundle.records, chartEvent],
  )

  const chartData = useMemo(
    () =>
      chartRecords.map((row) => ({
        date: row.measured_at,
        label: format(parseISO(row.measured_at), 'M/d'),
        value: row.result_value,
        text: row.result_text,
      })),
    [chartRecords],
  )

  const best = chartEvent ? bundle.bestByEvent[chartEvent] : null

  function refreshLocal(next: YouthAthleticsPbBundle) {
    setBundle(next)
    if (next.primaryEvent1) setEvent1(next.primaryEvent1)
    if (next.primaryEvent2) setEvent2(next.primaryEvent2)
  }

  function closeEditor() {
    setEvent1(bundle.primaryEvent1 ?? '')
    setEvent2(bundle.primaryEvent2 ?? '')
    setResultText('')
    setEditing(false)
  }

  function saveEvents() {
    startTransition(async () => {
      const result = await saveYouthAthleticsPrimaryEvents({
        event1: event1 || null,
        event2: event2 || null,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('주 종목을 저장했습니다.')
      const nextPrimary1 = (event1 || null) as YouthAthleticsEventKey | null
      const nextPrimary2 = (event2 || null) as YouthAthleticsEventKey | null
      refreshLocal({
        ...bundle,
        primaryEvent1: nextPrimary1,
        primaryEvent2: nextPrimary2,
      })
      if (nextPrimary1) setSelectedEvent(nextPrimary1)
      else if (nextPrimary2) setSelectedEvent(nextPrimary2)
      if (nextPrimary1 || nextPrimary2) setEditing(false)
      onPrimaryEventsChange?.({
        event1: nextPrimary1,
        event2: nextPrimary2,
      })
    })
  }

  function addRecord() {
    startTransition(async () => {
      const result = await addYouthAthleticsPbRecord({
        eventKey: selectedEvent,
        resultText,
        measuredAt,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('PB 기록을 추가했습니다.')
      setResultText('')
      const { getYouthAthleticsPbBundle } = await import(
        '@/lib/actions/youth-athletics-pb'
      )
      const fresh = await getYouthAthleticsPbBundle()
      refreshLocal(fresh)
    })
  }

  function removeRecord(recordId: string) {
    startTransition(async () => {
      const result = await deleteYouthAthleticsPbRecord(recordId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('기록을 삭제했습니다.')
      setBundle((current) => {
        const records = current.records.filter((row) => row.id !== recordId)
        const bestByEvent = { ...current.bestByEvent }
        for (const key of Object.keys(bestByEvent) as YouthAthleticsEventKey[]) {
          if (bestByEvent[key]?.id === recordId) {
            const remaining = records.filter((row) => row.event_key === key)
            if (remaining.length === 0) {
              delete bestByEvent[key]
            } else {
              bestByEvent[key] = remaining.reduce((bestRow, row) => {
                const better =
                  row.result_kind === 'mark'
                    ? row.result_value > bestRow.result_value
                    : row.result_value < bestRow.result_value
                return better ? row : bestRow
              })
            }
          }
        }
        return { ...current, records, bestByEvent }
      })
    })
  }

  if (!bundle.tableReady) {
    return (
      <Card className="border-dashed border-[#AAFF00]/30">
        <CardContent className="py-5 text-sm text-muted-foreground">
          주 종목·PB 테이블이 없습니다.{' '}
          <code className="text-xs">add-youth-athletics-pb-records.sql</code>을
          실행해주세요.
        </CardContent>
      </Card>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-[#AAFF00]" />
          <h2 className="text-base font-semibold sm:text-lg">주 종목 · PB</h2>
        </div>
        {!readOnly && hasPrimaryEvents && !showEditor ? (
          <Button
            type="button"
            size="sm"
            className="h-8 border border-[#AAFF00]/45 bg-[#AAFF00]/15 text-xs font-semibold text-[#AAFF00] hover:bg-[#AAFF00]/25 hover:text-[#f4ffe0]"
            onClick={() => setEditing(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5 text-[#AAFF00]" />
            종목·기록 추가
          </Button>
        ) : null}
        {!readOnly && hasPrimaryEvents && showEditor ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={pending}
            onClick={closeEditor}
          >
            접기
          </Button>
        ) : null}
      </div>

      <Card className="border-[#AAFF00]/25 bg-zinc-950/70">
        <CardContent className="space-y-3 p-4 sm:p-5">
          {showEditor && !readOnly ? (
            <div className="space-y-3 rounded-xl border border-[#AAFF00]/20 bg-black/30 p-3">
              <p className="text-xs font-medium text-[#AAFF00]/90">주 종목 설정</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <EventSelect
                  label="주 종목 1"
                  value={event1}
                  exclude={event2}
                  disabled={pending}
                  onChange={setEvent1}
                />
                <EventSelect
                  label="주 종목 2"
                  value={event2}
                  exclude={event1}
                  disabled={pending}
                  onChange={setEvent2}
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="bg-[#AAFF00] text-black hover:bg-[#c8ff4d]"
                disabled={pending}
                onClick={saveEvents}
              >
                {pending ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3.5 w-3.5" />
                )}
                주 종목 저장
              </Button>

              {hasPrimaryEvents ? (
                <div className="space-y-2 border-t border-[#AAFF00]/15 pt-3">
                  <p className="text-xs font-medium text-[#AAFF00]/90">PB 기록 추가</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <Select
                      value={selectedEvent}
                      onValueChange={setSelectedEvent}
                      disabled={pending}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="종목" />
                      </SelectTrigger>
                      <SelectContent>
                        {(primaryKeys.length > 0
                          ? YOUTH_ATHLETICS_EVENT_OPTIONS.filter((event) =>
                              primaryKeys.includes(event.key),
                            )
                          : YOUTH_ATHLETICS_EVENT_OPTIONS
                        ).map((event) => (
                          <SelectItem key={event.key} value={event.key}>
                            {event.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={resultText}
                      onChange={(event) => setResultText(event.target.value)}
                      placeholder={
                        getYouthAthleticsEventKind(selectedEvent) === 'mark'
                          ? '예: 6.45'
                          : '예: 11.45 · 18:30 · 1:32:10'
                      }
                      disabled={pending}
                    />
                    <KoreanDatePicker
                      value={measuredAt}
                      onChange={setMeasuredAt}
                      compact
                      placeholder="측정일"
                    />
                    <Button
                      type="button"
                      className="bg-[#AAFF00] text-black hover:bg-[#c8ff4d]"
                      disabled={pending || !resultText.trim()}
                      onClick={addRecord}
                    >
                      {pending ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="mr-1 h-3.5 w-3.5" />
                      )}
                      추가
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-2">
            {!hasPrimaryEvents ? (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                주 종목 2개를 선택·저장하면 PB가 표시됩니다.
              </p>
            ) : (
              primaryKeys.map((key) => {
                const pb = bundle.bestByEvent[key]
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-left transition-colors',
                      chartEvent === key
                        ? 'border-[#AAFF00]/60 bg-[#AAFF00]/15'
                        : 'border-[#AAFF00]/20 bg-[#AAFF00]/5 hover:border-[#AAFF00]/40',
                    )}
                    onClick={() => setSelectedEvent(key)}
                  >
                    <p className="text-[11px] font-medium text-[#AAFF00]/90">
                      {getYouthAthleticsEventLabel(key)}
                    </p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-[#f4ffe0]">
                      {pb?.result_text ?? '—'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {pb
                        ? `PB · ${format(parseISO(pb.measured_at), 'yyyy.M.d')}`
                        : '기록 없음'}
                    </p>
                  </button>
                )
              })
            )}
          </div>

          {hasPrimaryEvents ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-3.5 w-3.5 text-[#AAFF00]" />
                <p className="text-xs font-medium text-muted-foreground">
                  {getYouthAthleticsEventLabel(chartEvent)} 추이
                  {best ? (
                    <span className="ml-1.5 text-[#AAFF00]">
                      PB {best.result_text}
                    </span>
                  ) : null}
                </p>
              </div>

              {chartData.length === 0 ? (
                <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-[#AAFF00]/20 text-xs text-muted-foreground">
                  기록이 쌓이면 그래프가 표시됩니다.
                </div>
              ) : (
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(170,255,0,0.15)"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'rgba(170,255,0,0.75)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={['auto', 'auto']}
                        reversed={chartKind === 'time'}
                        tick={{ fill: 'rgba(170,255,0,0.75)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                        tickFormatter={(value: number) =>
                          formatYouthAthleticsResultValue(value, chartKind)
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#09090b',
                          border: '1px solid rgba(170,255,0,0.35)',
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload as
                            | { date?: string }
                            | undefined
                          return point?.date
                            ? format(parseISO(point.date), 'yyyy.M.d')
                            : ''
                        }}
                        formatter={(value: number) => [
                          formatYouthAthleticsResultValue(value, chartKind),
                          '기록',
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#AAFF00"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: '#AAFF00', strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {showEditor && !readOnly && chartRecords.length > 0 ? (
                <ul className="divide-y divide-border/50 rounded-xl border border-border/60">
                  {[...chartRecords].reverse().slice(0, 6).map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-semibold tabular-nums">{row.result_text}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {format(parseISO(row.measured_at), 'yyyy.M.d')}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={pending}
                        onClick={() => removeRecord(row.id)}
                        aria-label="기록 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

function EventSelect({
  label,
  value,
  exclude,
  disabled,
  onChange,
}: {
  label: string
  value: string
  exclude?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <Select
        value={value || NONE_VALUE}
        onValueChange={(next) => onChange(next === NONE_VALUE ? '' : next)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="종목 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>선택 안 함</SelectItem>
          {YOUTH_ATHLETICS_EVENT_OPTIONS.filter(
            (event) => !exclude || event.key !== exclude,
          ).map((event) => (
            <SelectItem key={event.key} value={event.key}>
              {event.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
