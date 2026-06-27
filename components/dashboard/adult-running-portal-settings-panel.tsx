'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { updateAdultRunningPortalSettings } from '@/lib/actions/adult-running-portal-settings'
import type { AdultRunningPortalAdminSettings } from '@/lib/actions/adult-running-portal-settings'
import {
  DEFAULT_ADULT_RUNNING_PORTAL_LEAGUE_LABEL,
  DEFAULT_ADULT_RUNNING_PORTAL_TITLE,
} from '@/lib/running-league/adult-running-portal-defaults'
import { toRankingMonthKey } from '@/lib/running-league/ranking-period'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export function AdultRunningPortalSettingsPanel({
  settings,
}: {
  settings: AdultRunningPortalAdminSettings
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [leagueLabel, setLeagueLabel] = useState(settings.leagueLabel)
  const [portalTitle, setPortalTitle] = useState(settings.portalTitle)
  const [notice, setNotice] = useState(settings.notice ?? '')
  const [beatRivalMemberId, setBeatRivalMemberId] = useState(settings.beatRivalMemberId ?? NONE_VALUE)
  const [rankingReferenceMonth, setRankingReferenceMonth] = useState(
    toRankingMonthKey(settings.rankingReferenceDate) ?? '',
  )
  const [rankingCaption, setRankingCaption] = useState(settings.rankingCaption ?? '')

  function handleSave() {
    startTransition(async () => {
      const result = await updateAdultRunningPortalSettings({
        leagueLabel,
        portalTitle,
        notice,
        beatRivalMemberId: beatRivalMemberId === NONE_VALUE ? null : beatRivalMemberId,
        leagueId: settings.leagueId,
        rankingReferenceDate: rankingReferenceMonth
          ? `${rankingReferenceMonth}-01`
          : null,
        rankingCaption,
      })

      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success('성인 러닝 포털 설정을 저장했습니다.')
      router.refresh()
    })
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
            <Label htmlFor="ranking-reference-month">랭킹 기본 월</Label>
            <Input
              id="ranking-reference-month"
              type="month"
              value={rankingReferenceMonth}
              onChange={(event) => setRankingReferenceMonth(event.target.value)}
              className="border-lime-500/20 bg-black/40"
            />
            <p className="text-[11px] text-zinc-500">
              비우면 매월 자동(당월) 기준입니다.{' '}
              {rankingReferenceMonth ? (
                <button
                  type="button"
                  className="text-lime-300/80 underline-offset-2 hover:underline"
                  onClick={() => setRankingReferenceMonth('')}
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
    </Card>
  )
}
