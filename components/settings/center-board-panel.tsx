'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Loader2, Pencil, Plus, Trash2, Trophy, Medal } from 'lucide-react'
import { toast } from 'sonner'
import {
  createCenterBoardPost,
  deleteCenterBoardPost,
  updateCenterBoardPost,
} from '@/lib/actions/center-board'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KoreanDateTimePicker } from '@/components/ui/korean-datetime-picker'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type {
  CenterBoardAudience,
  CenterBoardEventSubtype,
  CenterBoardKind,
  CenterBoardPost,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import {
  buildRunningLeagueSummaryBody,
  leagueMonthRange,
  RUNNING_LEAGUE_NAME,
} from '@/lib/running-league-content'

interface CenterBoardPanelProps {
  initialPosts: CenterBoardPost[]
  audience?: CenterBoardAudience
  enableMileageChallenge?: boolean
}

type FormState = {
  title: string
  body: string
  link_url: string
  event_starts_at: string
  event_ends_at: string
  event_subtype: CenterBoardEventSubtype
  challenge_goal_km: string
  is_published: boolean
  pinned: boolean
}

const EMPTY_FORM: FormState = {
  title: '',
  body: '',
  link_url: '',
  event_starts_at: '',
  event_ends_at: '',
  event_subtype: null,
  challenge_goal_km: '',
  is_published: true,
  pinned: false,
}

function buildMileageChallengeBody(goalKm: number): string {
  return `센터 러닝 마일리지 챌린지에 참여해 보세요!

목표 거리: ${goalKm}km
기간: 아래 시작·종료 일시를 참고해 주세요.

달성 방법
- 센터 러닝 프로그램 참여
- 개인 러닝 기록 누적
- 무리하지 않고 꾸준히 거리를 쌓아 가세요

※ 체중·컨디션 관리와 함께 회복을 우선하며 참여해 주세요.`
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return ''
  const date = parseISO(iso)
  if (!Number.isFinite(date.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function toForm(post: CenterBoardPost): FormState {
  return {
    title: post.title,
    body: post.body,
    link_url: post.link_url ?? '',
    event_starts_at: toLocalInputValue(post.event_starts_at),
    event_ends_at: toLocalInputValue(post.event_ends_at),
    event_subtype: post.event_subtype,
    challenge_goal_km:
      post.challenge_goal_km != null ? String(post.challenge_goal_km) : '',
    is_published: post.is_published,
    pinned: post.pinned,
  }
}

export function CenterBoardPanel({
  initialPosts,
  audience = 'general',
  enableMileageChallenge = false,
}: CenterBoardPanelProps) {
  const router = useRouter()
  const [tab, setTab] = useState<CenterBoardKind>('notice')
  const [posts, setPosts] = useState(initialPosts)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const filtered = useMemo(
    () => posts.filter((post) => post.kind === tab),
    [posts, tab],
  )

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setIsCreating(false)
  }

  function startCreate() {
    setIsCreating(true)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  function startRunningLeague() {
    const range = leagueMonthRange()
    setTab('event')
    setIsCreating(true)
    setEditingId(null)
    setForm({
      title: range.title,
      body: buildRunningLeagueSummaryBody(range),
      link_url: '',
      event_starts_at: range.startLocal,
      event_ends_at: range.endLocal,
      event_subtype: 'running_league',
      challenge_goal_km: '80',
      is_published: true,
      pinned: true,
    })
  }

  function startMileageChallenge() {
    const goalKm = 50
    const now = new Date()
    const end = new Date(now)
    end.setMonth(end.getMonth() + 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    const toLocal = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

    setTab('event')
    setIsCreating(true)
    setEditingId(null)
    setForm({
      title: '러닝 [마일리지 챌린지]',
      body: buildMileageChallengeBody(goalKm),
      link_url: '',
      event_starts_at: toLocal(now),
      event_ends_at: toLocal(end),
      event_subtype: 'mileage_challenge',
      challenge_goal_km: String(goalKm),
      is_published: true,
      pinned: true,
    })
  }

  function startEdit(post: CenterBoardPost) {
    setIsCreating(false)
    setEditingId(post.id)
    setForm(toForm(post))
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      const goalKm = form.challenge_goal_km.trim()
        ? Number(form.challenge_goal_km)
        : null
      const eventSubtype =
        tab === 'event' &&
        (form.event_subtype === 'mileage_challenge' ||
          form.event_subtype === 'running_league')
          ? form.event_subtype
          : null

      if (editingId) {
        const result = await updateCenterBoardPost(editingId, {
          title: form.title,
          body: form.body,
          link_url: form.link_url,
          event_starts_at: tab === 'event' ? form.event_starts_at : null,
          event_ends_at: tab === 'event' ? form.event_ends_at : null,
          event_subtype: eventSubtype,
          challenge_goal_km: eventSubtype === 'mileage_challenge' ? goalKm : null,
          is_published: form.is_published,
          pinned: form.pinned,
        })
        if (result.error) {
          toast.error(result.error)
          return
        }
        if (result.data) {
          setPosts((prev) =>
            prev.map((post) => (post.id === result.data!.id ? result.data! : post)),
          )
        }
        toast.success('수정되었습니다.')
      } else {
        const result = await createCenterBoardPost({
          kind: tab,
          audience,
          title: form.title,
          body: form.body,
          link_url: form.link_url,
          event_starts_at: tab === 'event' ? form.event_starts_at : null,
          event_ends_at: tab === 'event' ? form.event_ends_at : null,
          event_subtype: eventSubtype,
          challenge_goal_km: eventSubtype === 'mileage_challenge' ? goalKm : null,
          is_published: form.is_published,
          pinned: form.pinned,
        })
        if (result.error) {
          toast.error(result.error)
          return
        }
        if (result.data) {
          setPosts((prev) => [result.data!, ...prev])
        }
        toast.success('등록되었습니다.')
      }
      resetForm()
      router.refresh()
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('이 글을 삭제할까요?')) return
    const result = await deleteCenterBoardPost(id)
    if (result.error) {
      toast.error(result.error)
      return
    }
    setPosts((prev) => prev.filter((post) => post.id !== id))
    if (editingId === id) resetForm()
    toast.success('삭제되었습니다.')
    router.refresh()
  }

  const showForm = isCreating || editingId
  const audienceLabel = audience === 'adult' ? '성인 회원' : '회원'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(['notice', 'event'] as const).map((kind) => (
          <Button
            key={kind}
            type="button"
            variant={tab === kind ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTab(kind)
              resetForm()
            }}
          >
            {kind === 'notice' ? '공지사항' : '이벤트'}
          </Button>
        ))}
        <Button type="button" size="sm" className="ml-auto" onClick={startCreate}>
          <Plus className="mr-1 h-4 w-4" />
          {tab === 'notice' ? '공지 등록' : '이벤트 등록'}
        </Button>
        {enableMileageChallenge && tab === 'event' ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={startRunningLeague}
            >
              <Medal className="mr-1 h-4 w-4" />
              {RUNNING_LEAGUE_NAME}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={startMileageChallenge}>
              <Trophy className="mr-1 h-4 w-4" />
              마일리지 챌린지
            </Button>
          </>
        ) : null}
      </div>

      {showForm ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {editingId
                ? tab === 'notice'
                  ? '공지 수정'
                  : '이벤트 수정'
                : tab === 'notice'
                  ? '공지 등록'
                  : '이벤트 등록'}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({audienceLabel} 대상)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="board-title">제목</Label>
              <Input
                id="board-title"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                placeholder={
                  tab === 'notice'
                    ? audience === 'adult'
                      ? '예: 성인 러닝반 안내'
                      : '예: 6월 휴관 안내'
                    : '예: 여름 캠프 모집'
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="board-body">내용</Label>
              <Textarea
                id="board-body"
                value={form.body}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                rows={5}
                placeholder={`${audienceLabel}에게 보여질 내용을 입력하세요.`}
              />
            </div>
            {tab === 'event' ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="event-start">시작</Label>
                    <KoreanDateTimePicker
                      id="event-start"
                      value={form.event_starts_at}
                      onChange={(next) =>
                        setForm((prev) => ({ ...prev, event_starts_at: next }))
                      }
                      datePlaceholder="시작일 선택"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="event-end">종료</Label>
                    <KoreanDateTimePicker
                      id="event-end"
                      value={form.event_ends_at}
                      onChange={(next) =>
                        setForm((prev) => ({ ...prev, event_ends_at: next }))
                      }
                      datePlaceholder="종료일 선택"
                    />
                  </div>
                </div>
                {form.event_subtype === 'running_league' ? (
                  <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs font-semibold text-primary">
                      원스텝 러닝 리그 템플릿
                    </p>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      회원 이벤트 창에 점수표·4주 일정·시상 부문이 구조화되어 표시됩니다.
                      아래 요약 본문은 추가 안내용으로 사용됩니다.
                    </p>
                  </div>
                ) : null}
                {form.event_subtype === 'mileage_challenge' ? (
                  <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
                    <Label htmlFor="challenge-goal">마일리지 목표 (km)</Label>
                    <Input
                      id="challenge-goal"
                      type="number"
                      min={1}
                      step={1}
                      value={form.challenge_goal_km}
                      onChange={(e) => {
                        const next = e.target.value
                        const goal = Number(next)
                        setForm((prev) => ({
                          ...prev,
                          challenge_goal_km: next,
                          body:
                            prev.event_subtype === 'mileage_challenge' &&
                            Number.isFinite(goal) &&
                            goal > 0
                              ? buildMileageChallengeBody(goal)
                              : prev.body,
                        }))
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      회원 포털 이벤트에 목표 거리·기간이 강조되어 표시됩니다.
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="board-link">링크 (선택)</Label>
              <Input
                id="board-link"
                value={form.link_url}
                onChange={(e) => setForm((prev) => ({ ...prev, link_url: e.target.value }))}
                placeholder="https://"
              />
            </div>
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  id="board-published"
                  checked={form.is_published}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, is_published: checked }))
                  }
                />
                <Label htmlFor="board-published">{audienceLabel}에게 공개</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="board-pinned"
                  checked={form.pinned}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, pinned: checked }))
                  }
                />
                <Label htmlFor="board-pinned">상단 고정</Label>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                저장
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                취소
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            등록된 {tab === 'notice' ? '공지' : '이벤트'}가 없습니다.
          </p>
        ) : (
          filtered.map((post) => (
            <div
              key={post.id}
              className={cn(
                'rounded-lg border border-border bg-card px-4 py-3',
                !post.is_published && 'opacity-70',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {post.pinned ? '📌 ' : ''}
                    {post.event_subtype === 'running_league'
                      ? '🏅 '
                      : post.event_subtype === 'mileage_challenge'
                        ? '🏃 '
                        : ''}
                    {post.title}
                    {!post.is_published ? (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        (비공개)
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {post.body || '내용 없음'}
                  </p>
                  {post.challenge_goal_km != null ? (
                    <p className="mt-1 text-xs font-medium text-primary">
                      목표 {post.challenge_goal_km}km
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-muted-foreground/80">
                    {format(parseISO(post.updated_at), 'M월 d일 HH:mm', { locale: ko })}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => startEdit(post)}
                    aria-label="수정"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => void handleDelete(post.id)}
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
