'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Plus, Save, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  addMarathonEventFromCatalog,
  deleteMarathonEvent,
  getCenterMarathonScheduleForAdmin,
  listMarathonRecommendations,
  removeMarathonEventFromCatalog,
  saveMarathonEvent,
  type CenterMarathonScheduleBundle,
} from '@/lib/actions/center-marathon-schedule'
import {
  MARATHON_CATALOG_PAGE_SIZE,
  MARATHON_CATALOG_SOURCE,
  MARATHON_REGIONS,
  catalogRegistrationOpenActive,
  type MarathonCatalogItem,
} from '@/lib/running-league/marathon-catalog-2026'
import {
  createEmptyMarathonEventInput,
  formatMarathonEventDateLabel,
  formatMarathonMonthLabel,
  listNearbyMarathonMonthKeys,
  MARATHON_LABEL_TONES,
  MARATHON_SCHEDULE_ALL_KEY,
  marathonWeekdayLabel,
  type MarathonCustomLabel,
  type MarathonEventInput,
  type MarathonLabelTone,
} from '@/lib/running-league/marathon-schedule'
import { MarathonEventLabels } from '@/components/dashboard/marathon-event-labels'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

function eventToInput(event: CenterMarathonScheduleBundle['events'][number]): MarathonEventInput {
  return {
    id: event.id,
    title: event.title,
    event_date: event.event_date,
    location_label: event.location_label,
    registration_url: event.registration_url ?? '',
    notes: event.notes,
    is_hidden: event.is_hidden,
    region: event.region,
    is_featured: event.is_featured,
    registration_open: event.registration_open,
    registration_end_date: event.registration_end_date ?? '',
    is_pinned: event.is_pinned,
    custom_labels: event.custom_labels,
    catalog_key: event.catalog_key,
  }
}

function catalogToDraft(item: MarathonCatalogItem): MarathonEventInput {
  return {
    id: null,
    title: item.title,
    event_date: item.event_date,
    location_label: item.location_label,
    registration_url: item.registration_url,
    notes: item.notes,
    is_hidden: false,
    region: item.region,
    is_featured: item.is_featured,
    registration_open: item.registration_open,
    registration_end_date: item.registration_end_date ?? '',
    is_pinned: false,
    custom_labels: [],
    catalog_key: item.key,
  }
}

export function CenterMarathonSchedulePanel() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [monthKey, setMonthKey] = useState(MARATHON_SCHEDULE_ALL_KEY)
  const [bundle, setBundle] = useState<CenterMarathonScheduleBundle | null>(null)
  const [draft, setDraft] = useState<MarathonEventInput>(() => createEmptyMarathonEventInput())
  const [loading, setLoading] = useState(true)

  const [recommendRegion, setRecommendRegion] = useState('전체')
  const [recommendMonth, setRecommendMonth] = useState(MARATHON_SCHEDULE_ALL_KEY)
  const [featuredOnly, setFeaturedOnly] = useState(false)
  const [openOnly, setOpenOnly] = useState(false)
  const [catalogItems, setCatalogItems] = useState<MarathonCatalogItem[]>([])
  const [addedKeys, setAddedKeys] = useState<string[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [customLabelDraft, setCustomLabelDraft] = useState('')
  const [customLabelTone, setCustomLabelTone] = useState<MarathonLabelTone>('violet')
  const [recommendPage, setRecommendPage] = useState(1)

  const year = new Date().getFullYear()
  const monthOptions = useMemo(
    () => [MARATHON_SCHEDULE_ALL_KEY, ...listNearbyMarathonMonthKeys()],
    [],
  )
  const recommendMonthOptions = useMemo(() => {
    const keys = [`${year}-01`, `${year}-02`, `${year}-03`, `${year}-04`, `${year}-05`, `${year}-06`, `${year}-07`, `${year}-08`, `${year}-09`, `${year}-10`, `${year}-11`, `${year}-12`]
    return [MARATHON_SCHEDULE_ALL_KEY, ...keys]
  }, [year])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getCenterMarathonScheduleForAdmin(monthKey).then((result) => {
      if (cancelled) return
      setBundle(result)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [monthKey])

  useEffect(() => {
    let cancelled = false
    setCatalogLoading(true)
    setRecommendPage(1)
    void listMarathonRecommendations({
      region: recommendRegion,
      monthKey: recommendMonth,
      featuredOnly,
      registrationOpenOnly: openOnly,
      year,
    }).then((result) => {
      if (cancelled) return
      setCatalogItems(result.items)
      setAddedKeys(result.addedKeys)
      setCatalogLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [recommendRegion, recommendMonth, featuredOnly, openOnly, year])

  const recommendTotalPages = Math.max(
    1,
    Math.ceil(catalogItems.length / MARATHON_CATALOG_PAGE_SIZE),
  )
  const recommendPageSafe = Math.min(recommendPage, recommendTotalPages)
  const pagedCatalogItems = useMemo(() => {
    const start = (recommendPageSafe - 1) * MARATHON_CATALOG_PAGE_SIZE
    return catalogItems.slice(start, start + MARATHON_CATALOG_PAGE_SIZE)
  }, [catalogItems, recommendPageSafe])

  const recommendPageNumbers = useMemo(() => {
    const total = recommendTotalPages
    const current = recommendPageSafe
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const pages = new Set<number>([1, total, current, current - 1, current + 1])
    if (current <= 3) {
      pages.add(2)
      pages.add(3)
      pages.add(4)
    }
    if (current >= total - 2) {
      pages.add(total - 1)
      pages.add(total - 2)
      pages.add(total - 3)
    }
    return [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  }, [recommendPageSafe, recommendTotalPages])

  function resetDraft(dateHint?: string) {
    const fallbackDate =
      monthKey !== MARATHON_SCHEDULE_ALL_KEY && /^\d{4}-\d{2}$/.test(monthKey)
        ? `${monthKey}-01`
        : undefined
    setDraft(createEmptyMarathonEventInput(dateHint ?? fallbackDate))
    setCustomLabelDraft('')
  }

  function refreshAll() {
    return Promise.all([
      getCenterMarathonScheduleForAdmin(monthKey),
      listMarathonRecommendations({
        region: recommendRegion,
        monthKey: recommendMonth,
        featuredOnly,
        registrationOpenOnly: openOnly,
        year,
      }),
    ]).then(([schedule, recommendations]) => {
      setBundle(schedule)
      setCatalogItems(recommendations.items)
      setAddedKeys(recommendations.addedKeys)
    })
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveMarathonEvent(draft)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(draft.id ? '대회를 수정했습니다.' : '대회를 추가했습니다.')
      await refreshAll()
      resetDraft()
      router.refresh()
    })
  }

  function handleDelete(eventId: string) {
    if (!window.confirm('이 대회 일정을 삭제할까요? 참가 명단도 함께 삭제됩니다.')) return
    startTransition(async () => {
      const result = await deleteMarathonEvent(eventId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('삭제했습니다.')
      if (draft.id === eventId) resetDraft()
      await refreshAll()
      router.refresh()
    })
  }

  function handleToggleCatalog(item: MarathonCatalogItem) {
    const already = addedKeySet.has(item.key)
    startTransition(async () => {
      if (already) {
        const result = await removeMarathonEventFromCatalog(item.key)
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success(`「${item.title}」 추가를 취소했습니다.`)
      } else {
        const result = await addMarathonEventFromCatalog(item.key)
        if (!result.ok) {
          toast.error(result.error)
          return
        }
        toast.success(`「${item.title}」을(를) 일정에 추가했습니다.`)
      }
      await refreshAll()
      router.refresh()
    })
  }

  function addCustomLabel() {
    const text = customLabelDraft.trim()
    if (!text) return
    setDraft((current) => ({
      ...current,
      custom_labels: [
        ...current.custom_labels,
        { text: text.slice(0, 20), tone: customLabelTone },
      ].slice(0, 8),
    }))
    setCustomLabelDraft('')
  }

  function removeCustomLabel(index: number) {
    setDraft((current) => ({
      ...current,
      custom_labels: current.custom_labels.filter((_, i) => i !== index),
    }))
  }

  const addedKeySet = useMemo(() => new Set(addedKeys), [addedKeys])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-3">
          <div>
            <CardTitle>{year}년 대회 추천</CardTitle>
            <CardDescription>
              <a
                href={MARATHON_CATALOG_SOURCE.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {MARATHON_CATALOG_SOURCE.label}
              </a>
              기준으로 날짜·지역별 대회를 보여 줍니다. 「대회 추가」로 아래 일정에 바로
              등록하고, 인지도·신청가능 라벨은 회원 화면에도 표시됩니다.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={recommendRegion} onValueChange={setRecommendRegion}>
              <SelectTrigger className="w-[7.5rem]">
                <SelectValue placeholder="지역" />
              </SelectTrigger>
              <SelectContent>
                {MARATHON_REGIONS.map((region) => (
                  <SelectItem key={region} value={region}>
                    {region}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={recommendMonth} onValueChange={setRecommendMonth}>
              <SelectTrigger className="w-[9rem]">
                <SelectValue placeholder="월" />
              </SelectTrigger>
              <SelectContent>
                {recommendMonthOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {formatMarathonMonthLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant={featuredOnly ? 'default' : 'outline'}
              onClick={() => setFeaturedOnly((v) => !v)}
            >
              <Star className="mr-1 h-3.5 w-3.5" />
              인지도
            </Button>
            <Button
              type="button"
              size="sm"
              variant={openOnly ? 'default' : 'outline'}
              onClick={() => setOpenOnly((v) => !v)}
            >
              신청가능
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {catalogLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              추천 대회 불러오는 중…
            </div>
          ) : catalogItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">조건에 맞는 추천 대회가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-2">
                {pagedCatalogItems.map((item) => {
                  const already = addedKeySet.has(item.key)
                  const openActive = catalogRegistrationOpenActive(item)
                  return (
                    <li
                      key={item.key}
                      className={cn(
                        'flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2.5',
                        item.is_featured && 'border-amber-400/35 bg-amber-500/[0.06]',
                        openActive && !item.is_featured && 'border-lime-400/30 bg-lime-500/[0.05]',
                      )}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="font-medium">{item.title}</p>
                          <MarathonEventLabels
                            isFeatured={item.is_featured}
                            registrationOpen={item.registration_open}
                            eventDate={item.event_date}
                            registrationEndDate={item.registration_end_date}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.region} · {marathonWeekdayLabel(item.event_date)}{' '}
                          {formatMarathonEventDateLabel(item.event_date)}
                          {item.location_label ? ` · ${item.location_label}` : ''}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() => setDraft(catalogToDraft(item))}
                        >
                          양식에 넣기
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={already ? 'outline' : 'default'}
                          disabled={pending}
                          onClick={() => handleToggleCatalog(item)}
                        >
                          {already ? null : <Plus className="mr-1 h-3.5 w-3.5" />}
                          {already ? '추가됨 · 취소' : '대회 추가'}
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
                <p className="text-xs text-muted-foreground">
                  전체 {catalogItems.length}건 · {recommendPageSafe}/{recommendTotalPages}페이지
                  (10개씩)
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2"
                    disabled={recommendPageSafe <= 1}
                    onClick={() => setRecommendPage((p) => Math.max(1, p - 1))}
                  >
                    이전
                  </Button>
                  {recommendPageNumbers.map((page, index) => {
                    const prev = recommendPageNumbers[index - 1]
                    const showEllipsis = prev != null && page - prev > 1
                    return (
                      <span key={page} className="inline-flex items-center gap-1">
                        {showEllipsis ? (
                          <span className="px-1 text-xs text-muted-foreground">…</span>
                        ) : null}
                        <Button
                          type="button"
                          size="sm"
                          variant={page === recommendPageSafe ? 'default' : 'outline'}
                          className="h-8 min-w-8 px-2"
                          onClick={() => setRecommendPage(page)}
                        >
                          {page}
                        </Button>
                      </span>
                    )
                  })}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 px-2"
                    disabled={recommendPageSafe >= recommendTotalPages}
                    onClick={() =>
                      setRecommendPage((p) => Math.min(recommendTotalPages, p + 1))
                    }
                  >
                    다음
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>마라톤 일정</CardTitle>
              <CardDescription>
                대회명·날짜·참가신청 홈페이지를 등록하면 내 러닝 포털에 표시됩니다.
              </CardDescription>
            </div>
            <Select value={monthKey} onValueChange={setMonthKey} disabled={pending || loading}>
              <SelectTrigger className="w-[10rem]">
                <SelectValue placeholder="월 선택" />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {formatMarathonMonthLabel(key)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!bundle?.tableReady ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              마라톤 일정 테이블이 아직 없습니다. Supabase SQL Editor에서{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                supabase/add-center-marathon-schedule.sql
              </code>{' '}
              을 실행한 뒤 새로고침해주세요.
            </p>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              불러오는 중…
            </div>
          ) : (bundle?.events.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              {monthKey === MARATHON_SCHEDULE_ALL_KEY
                ? '등록된 대회가 없습니다.'
                : '이 달에 등록된 대회가 없습니다.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {bundle?.events.map((event) => (
                <li
                  key={event.id}
                  className={cn(
                    'flex flex-wrap items-start justify-between gap-3 rounded-lg border px-3 py-2.5',
                    event.is_hidden && 'opacity-60',
                    event.is_pinned
                      ? 'border-amber-400/45 bg-amber-500/[0.06]'
                      : event.is_featured && 'border-amber-400/30',
                  )}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {event.is_pinned ? (
                        <span className="rounded-full border border-amber-400/45 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-100">
                          상단 고정
                        </span>
                      ) : null}
                      <p className="font-medium">{event.title}</p>
                      <MarathonEventLabels
                        isFeatured={event.is_featured}
                        registrationOpen={event.registration_open}
                        eventDate={event.event_date}
                        registrationEndDate={event.registration_end_date}
                        customLabels={event.custom_labels}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.region ? `${event.region} · ` : ''}
                      {event.weekday_label} {event.event_date_label} · {event.day_label}
                      {event.is_hidden ? ' · 숨김' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.location_label || '장소 미입력'}
                      {event.registration_url ? ` · ${event.registration_url}` : ''}
                      {` · ${event.signup_count}명 참여`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        setDraft(eventToInput(event))
                        setCustomLabelDraft('')
                      }}
                    >
                      수정
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => handleDelete(event.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{draft.id ? '대회 수정' : '대회 추가'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="marathon-title">대회명</Label>
              <Input
                id="marathon-title"
                value={draft.title}
                onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                placeholder="예: 서울국제마라톤"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5">
              <Label>대회 날짜</Label>
              <KoreanDatePicker
                value={draft.event_date}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    event_date: value || current.event_date,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>신청 마감일</Label>
              <KoreanDatePicker
                value={draft.registration_end_date}
                onChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    registration_end_date: value || '',
                  }))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                비우면 대회일까지 「신청가능」이 유지되고, 지나면 자동으로 사라집니다.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marathon-region">지역</Label>
              <Select
                value={draft.region || '__none__'}
                onValueChange={(value) =>
                  setDraft((current) => ({
                    ...current,
                    region: value === '__none__' ? '' : value,
                  }))
                }
              >
                <SelectTrigger id="marathon-region">
                  <SelectValue placeholder="지역 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">미지정</SelectItem>
                  {MARATHON_REGIONS.filter((region) => region !== '전체').map((region) => (
                    <SelectItem key={region} value={region}>
                      {region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="marathon-location">장소</Label>
              <Input
                id="marathon-location"
                value={draft.location_label}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, location_label: event.target.value }))
                }
                placeholder="예: 잠실종합운동장"
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="marathon-url">참가신청 홈페이지</Label>
              <Input
                id="marathon-url"
                value={draft.registration_url}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, registration_url: event.target.value }))
                }
                placeholder="https://..."
                disabled={pending}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="marathon-notes">메모 (종목·비고)</Label>
              <Textarea
                id="marathon-notes"
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                rows={2}
                placeholder="예: 풀/하프/10km"
                disabled={pending}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-lg border border-border/70 p-3">
            <p className="text-xs font-medium text-muted-foreground">라벨 (회원에게 표시)</p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={draft.is_pinned ? 'default' : 'outline'}
                disabled={pending}
                onClick={() =>
                  setDraft((current) => ({ ...current, is_pinned: !current.is_pinned }))
                }
              >
                상단 고정
              </Button>
              <Button
                type="button"
                size="sm"
                variant={draft.is_featured ? 'default' : 'outline'}
                disabled={pending}
                onClick={() =>
                  setDraft((current) => ({ ...current, is_featured: !current.is_featured }))
                }
              >
                인지도
              </Button>
              <Button
                type="button"
                size="sm"
                variant={draft.registration_open ? 'default' : 'outline'}
                disabled={pending}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    registration_open: !current.registration_open,
                  }))
                }
              >
                신청가능
              </Button>
            </div>
            <MarathonEventLabels
              isFeatured={draft.is_featured}
              registrationOpen={draft.registration_open}
              eventDate={draft.event_date}
              registrationEndDate={draft.registration_end_date}
              customLabels={draft.custom_labels}
              size="md"
            />
            {draft.custom_labels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {draft.custom_labels.map((label, index) => (
                  <button
                    key={`${label.text}-${index}`}
                    type="button"
                    className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:bg-muted"
                    onClick={() => removeCustomLabel(index)}
                    title="클릭하여 삭제"
                  >
                    {label.text} ×
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[10rem] flex-1 space-y-1">
                <Label htmlFor="custom-label">커스텀 라벨</Label>
                <Input
                  id="custom-label"
                  value={customLabelDraft}
                  onChange={(event) => setCustomLabelDraft(event.target.value)}
                  placeholder="예: 추천 · 마감임박"
                  maxLength={20}
                  disabled={pending}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addCustomLabel()
                    }
                  }}
                />
              </div>
              <Select
                value={customLabelTone}
                onValueChange={(value) => setCustomLabelTone(value as MarathonLabelTone)}
              >
                <SelectTrigger className="w-[7rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MARATHON_LABEL_TONES.map((tone) => (
                    <SelectItem key={tone} value={tone}>
                      {tone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="sm" variant="outline" disabled={pending} onClick={addCustomLabel}>
                라벨 추가
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                setDraft((current) => ({ ...current, is_hidden: !current.is_hidden }))
              }
            >
              {draft.is_hidden ? (
                <>
                  <EyeOff className="mr-1 h-3.5 w-3.5" />
                  숨김
                </>
              ) : (
                <>
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  공개
                </>
              )}
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={handleSave}>
              {pending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : draft.id ? (
                <Save className="mr-1 h-3.5 w-3.5" />
              ) : (
                <Plus className="mr-1 h-3.5 w-3.5" />
              )}
              {draft.id ? '수정 저장' : '추가'}
            </Button>
            {draft.id ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => resetDraft()}
              >
                새 대회 작성
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
