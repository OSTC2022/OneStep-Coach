'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Loader2, RotateCcw, Save, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateAdultRunningPortalSettings } from '@/lib/actions/adult-running-portal-settings'
import { resetPreviousMonthsMileageLogs } from '@/lib/actions/running-league'
import type { AdultRunningPortalAdminSettings } from '@/lib/actions/adult-running-portal-settings'
import {
  DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL,
  DEFAULT_ADULT_RUNNING_PORTAL_TITLE,
} from '@/lib/running-league/adult-running-portal-defaults'
import type {
  AdultRunningPortalHeaderStyle,
  PortalTextStyleConfig,
} from '@/lib/running-league/adult-running-portal-styles'
import { PORTAL_TEXT_ALIGN_OPTIONS } from '@/lib/running-league/adult-running-portal-styles'
import { PortalTextStyleFields } from '@/components/dashboard/portal-text-style-fields'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NONE_VALUE = '__none__'
const DEFAULT_OPTION = '__default__'

export function AdultRunningPortalSettingsPanel({
  settings,
}: {
  settings: AdultRunningPortalAdminSettings
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [resetOpen, setResetOpen] = useState(false)
  const [resetPending, setResetPending] = useState(false)
  const currentMonthLabel = format(new Date(), 'yyyy년 M월', { locale: ko })
  const [leagueLabel, setLeagueLabel] = useState(settings.leagueLabel)
  const [portalTitle, setPortalTitle] = useState(settings.portalTitle)
  const [notice, setNotice] = useState(settings.notice ?? '')
  const [beatRivalMemberId, setBeatRivalMemberId] = useState(settings.beatRivalMemberId ?? NONE_VALUE)
  const [rankingReferenceDate, setRankingReferenceDate] = useState(
    settings.rankingReferenceDate?.slice(0, 10) ?? '',
  )
  const [rankingCaption, setRankingCaption] = useState(settings.rankingCaption ?? '')
  const [headerStyle, setHeaderStyle] = useState<AdultRunningPortalHeaderStyle>(settings.headerStyle)
  const [rankingCaptionStyle, setRankingCaptionStyle] = useState<PortalTextStyleConfig>(
    settings.rankingCaptionStyle,
  )

  function handleSave() {
    startTransition(async () => {
      const result = await updateAdultRunningPortalSettings({
        leagueLabel,
        portalTitle,
        notice,
        beatRivalMemberId: beatRivalMemberId === NONE_VALUE ? null : beatRivalMemberId,
        leagueId: settings.leagueId,
        rankingReferenceDate: rankingReferenceDate || null,
        rankingCaption,
        headerStyle,
        rankingCaptionStyle,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success('성인 러닝 포털 설정을 저장했습니다.')
      router.refresh()
    })
  }

  async function handleResetPreviousMileage() {
    setResetPending(true)
    const result = await resetPreviousMonthsMileageLogs()
    setResetPending(false)
    setResetOpen(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    if (result.deletedCount === 0) {
      toast.message('삭제할 이전 마일리지 기록이 없습니다.', {
        description: `${result.keptMonthLabel} 기록만 유지 중입니다.`,
      })
    } else {
      toast.success('이전 달 마일리지를 초기화했습니다.', {
        description: `${result.deletedCount}건 삭제 · ${result.keptMonthLabel} 기록 유지`,
      })
    }

    router.refresh()
  }

  return (
    <Card className="border-lime-500/25 bg-zinc-950/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-lime-100">
          <Settings2 className="h-4 w-4 text-lime-400" />
          포털 설정
        </CardTitle>
        <p className="text-xs text-zinc-500">
          문구·공지·이겨라 대상은 성인회원 마이페이지에 바로 반영됩니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="portal-league-label">리그 문구</Label>
            <Input
              id="portal-league-label"
              value={leagueLabel}
              onChange={(event) => setLeagueLabel(event.target.value)}
              placeholder={DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL}
              className="border-lime-500/20 bg-black/40"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-title">포털 제목</Label>
            <Input
              id="portal-title"
              value={portalTitle}
              onChange={(event) => setPortalTitle(event.target.value)}
              placeholder={DEFAULT_ADULT_RUNNING_PORTAL_TITLE}
              className="border-lime-500/20 bg-black/40"
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-lime-500/15 bg-black/10 p-3">
          <div>
            <p className="text-sm font-semibold text-lime-100">헤더 스타일</p>
            <p className="text-[11px] text-zinc-500">
              상단 리그 문구·포털 제목의 색상, 크기, 정렬을 설정합니다.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-zinc-400">헤더 전체 정렬</Label>
            <Select
              value={headerStyle.containerAlign ?? DEFAULT_OPTION}
              onValueChange={(next) =>
                setHeaderStyle((current) => ({
                  ...current,
                  containerAlign:
                    next === DEFAULT_OPTION
                      ? null
                      : (next as AdultRunningPortalHeaderStyle['containerAlign']),
                }))
              }
            >
              <SelectTrigger className="border-lime-500/20 bg-black/40">
                <SelectValue placeholder="기본값 (왼쪽)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_OPTION}>기본값 (왼쪽)</SelectItem>
                {PORTAL_TEXT_ALIGN_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <PortalTextStyleFields
            label="리그 문구"
            value={headerStyle.leagueLabel ?? {}}
            onChange={(next) =>
              setHeaderStyle((current) => ({ ...current, leagueLabel: next }))
            }
          />
          <PortalTextStyleFields
            label="포털 제목"
            value={headerStyle.portalTitle ?? {}}
            onChange={(next) =>
              setHeaderStyle((current) => ({ ...current, portalTitle: next }))
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="portal-notice">공지사항</Label>
          <Textarea
            id="portal-notice"
            value={notice}
            onChange={(event) => setNotice(event.target.value)}
            placeholder="성인회원에게 보여줄 공지를 입력하세요. (접이식, 기본 접힘)"
            rows={4}
            className="border-lime-500/20 bg-black/40"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ranking-reference-date">랭킹 기준일 (관리자 전용)</Label>
            <Input
              id="ranking-reference-date"
              type="date"
              value={rankingReferenceDate}
              onChange={(event) => setRankingReferenceDate(event.target.value)}
              className="border-lime-500/20 bg-black/40"
            />
            <p className="text-[11px] text-zinc-500">
              회원 화면에는 기간만 표시됩니다. 비우면 당월 전체, 1일만 지정하면 해당 월 전체, 특정 일을
              지정하면 그날까지 집계됩니다.{' '}
              {rankingReferenceDate ? (
                <button
                  type="button"
                  className="text-lime-300/80 underline-offset-2 hover:underline"
                  onClick={() => setRankingReferenceDate('')}
                >
                  기본(당월)으로
                </button>
              ) : null}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ranking-caption">랭킹 헤더 한줄 문구</Label>
            <Input
              id="ranking-caption"
              value={rankingCaption}
              onChange={(event) => setRankingCaption(event.target.value)}
              placeholder="날짜 우측에 표시할 문구"
              className="border-lime-500/20 bg-black/40"
            />
          </div>
        </div>

        <PortalTextStyleFields
          label="랭킹 한줄 문구 스타일"
          value={rankingCaptionStyle}
          onChange={setRankingCaptionStyle}
        />

        <div className="space-y-2">
          <Label htmlFor="beat-rival-member">이겨라 대상 회원</Label>
          <Select value={beatRivalMemberId} onValueChange={setBeatRivalMemberId}>
            <SelectTrigger id="beat-rival-member" className="border-lime-500/20 bg-black/40">
              <SelectValue placeholder="성인회원 1명 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>지정 안 함</SelectItem>
              {settings.adultMemberOptions.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-zinc-500">
            지정한 회원 이름 옆에 네온 &quot;이겨라&quot; 라벨이 표시됩니다.
          </p>
        </div>

        <div className="space-y-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <div>
            <p className="text-sm font-semibold text-rose-100">마일리지 월 초기화</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              <strong className="text-zinc-300">{currentMonthLabel}</strong> 기록만 남기고, 그 이전·이후
              달 마일리지 로그를 모두 삭제합니다. (예: 7월이면 7월 1일 기록은 유지)
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-rose-500/30 text-rose-200 hover:bg-rose-500/10"
            disabled={resetPending || pending}
            onClick={() => setResetOpen(true)}
          >
            {resetPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-2 h-4 w-4" />
            )}
            이전 달 마일리지 초기화
          </Button>
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className="bg-lime-500 text-black hover:bg-lime-400"
        >
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          저장
        </Button>
      </CardContent>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이전 달 마일리지를 초기화할까요?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  <strong className="text-foreground">{currentMonthLabel}</strong>에 기록된 마일리지만
                  남기고, 그 외 모든 마일리지 로그가 삭제됩니다.
                </p>
                <p>참가자별 이번 달 마일리지 합계·랭킹 점수도 다시 계산됩니다. 되돌릴 수 없습니다.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault()
                void handleResetPreviousMileage()
              }}
            >
              {resetPending ? '초기화 중…' : '초기화'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
