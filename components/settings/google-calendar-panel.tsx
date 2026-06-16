'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  CalendarSync,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Unplug,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  disconnectGoogleCalendar,
  getGoogleCalendarSyncStatus,
  refreshGoogleCalendarWatchAction,
  runGoogleCalendarSyncNow,
} from '@/lib/actions/google-calendar-sync'
import type { GoogleCalendarSyncStatus } from '@/lib/google-calendar/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface GoogleCalendarPanelProps {
  initialStatus: GoogleCalendarSyncStatus
}

export function GoogleCalendarPanel({ initialStatus }: GoogleCalendarPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState(initialStatus)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  useEffect(() => {
    if (searchParams.get('connected') === '1') {
      toast.success('Google 캘린더 연동 완료', {
        description: '「수업」「수업2」 캘린더를 찾으면 자동 반영됩니다.',
      })
      router.replace('/dashboard/settings/google-calendar')
    }

    const error = searchParams.get('error')
    if (error) {
      toast.error('Google 캘린더 연결 실패', {
        description: decodeURIComponent(error),
      })
      router.replace('/dashboard/settings/google-calendar')
    }
  }, [router, searchParams])

  async function handleManualSync() {
    setIsSyncing(true)
    try {
      const result = await runGoogleCalendarSyncNow()

      if (result.error) {
        toast.error('동기화 실패', { description: result.error })
        return
      }

      const nextStatus = await getGoogleCalendarSyncStatus()
      setStatus(nextStatus)

      if (nextStatus.lastSyncError?.includes('복구했습니다')) {
        toast.info('동기화 복구', { description: nextStatus.lastSyncError })
      } else {
        toast.success('동기화 완료', {
          description: `신규 ${result.data?.created ?? 0} · 수정 ${result.data?.updated ?? 0} · 기존 연결 ${result.data?.linked ?? 0} · 회원 미연결 ${result.data?.pendingMember ?? 0}`,
        })
      }
    } catch {
      toast.error('동기화 실패', {
        description: '요청 시간이 초과되었거나 연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요.',
      })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true)
    const result = await disconnectGoogleCalendar()
    setIsDisconnecting(false)

    if (result.error) {
      toast.error('연결 해제 실패', { description: result.error })
      return
    }

    setStatus(await getGoogleCalendarSyncStatus())
    toast.success('Google 캘린더 연결이 해제되었습니다.')
    router.refresh()
  }

  async function handleRefreshWatch() {
    const result = await refreshGoogleCalendarWatchAction()
    if (result.error) {
      toast.error('Push 채널 갱신 실패', { description: result.error })
      return
    }
    setStatus(await getGoogleCalendarSyncStatus())
    toast.success('Push 알림 채널이 갱신되었습니다.')
  }

  if (!status.configured) {
    return (
      <Card className="w-full min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarSync className="h-4 w-4" />
            Google 캘린더 연동
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            센터 공용 Google 계정의{' '}
            <strong className="text-foreground">「수업」</strong>,{' '}
            <strong className="text-foreground">「수업2」</strong> 캘린더와 연동하려면
            환경 변수 설정이 필요합니다.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>GOOGLE_CLIENT_ID</li>
            <li>GOOGLE_CLIENT_SECRET</li>
            <li>GOOGLE_CALENDAR_WEBHOOK_SECRET</li>
          </ul>
          <p>
            Google Cloud Console에서 Calendar API를 활성화하고 OAuth 리디렉션 URI에{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">/auth/google/calendar/callback</code>
            을 등록해 주세요.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      <Card className="w-full min-w-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarSync className="h-4 w-4" />
            Google 캘린더 연동 (센터 공용)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Google Calendar의 <strong className="text-foreground">「수업」</strong>,{' '}
            <strong className="text-foreground">「수업2」</strong> 캘린더에 등록한 일정이
            원스텝 코치 캘린더에 자동으로 반영됩니다. 회원 이름을 찾지 못하면 임시 등록 후
            알림을 보냅니다.
          </p>

          <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">연결 상태</span>
              {status.connected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  연결됨
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  미연결
                </span>
              )}
            </div>

            {status.connected ? (
              <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Google 계정</dt>
                  <dd className="font-medium">{status.connectedEmail ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">가져오는 캘린더</dt>
                  <dd className="font-medium">
                    {status.calendarNames.length > 0
                      ? status.calendarNames.map((name) => `「${name}」`).join(', ')
                      : '수업'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Push 알림</dt>
                  <dd className="font-medium">
                    {status.watchActive ? '활성' : '비활성 / 갱신 필요'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">마지막 동기화</dt>
                  <dd className="font-medium">
                    {status.lastSyncedAt
                      ? format(parseISO(status.lastSyncedAt), 'M월 d일 HH:mm', { locale: ko })
                      : '-'}
                  </dd>
                </div>
              </dl>
            ) : null}

            {status.lastSyncError ? (
              <p
                className={
                  status.lastSyncError.includes('복구했습니다')
                    ? 'mt-3 text-xs text-amber-600 dark:text-amber-400'
                    : 'mt-3 text-xs text-destructive'
                }
              >
                {status.lastSyncError}
              </p>
            ) : null}

            {status.pendingMemberCount > 0 ? (
              <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                회원 미연결 임시 등록 {status.pendingMemberCount}건 — 상단 알림에서 확인하세요.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {!status.connected ? (
              <Button asChild>
                <Link href="/auth/google/calendar">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Google 계정 연결
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSyncing}
                  onClick={() => void handleManualSync()}
                >
                  {isSyncing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  지금 동기화
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleRefreshWatch()}
                >
                  Push 채널 갱신
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isDisconnecting}
                  onClick={() => void handleDisconnect()}
                >
                  {isDisconnecting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Unplug className="mr-2 h-4 w-4" />
                  )}
                  연결 해제
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="w-full min-w-0">
        <CardHeader>
          <CardTitle className="text-base">사용 방법</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            1. Google Calendar에 캘린더 이름을 정확히{' '}
            <strong className="text-foreground">수업</strong>,{' '}
            <strong className="text-foreground">수업2</strong>로 만듭니다. (수업은 필수,
            수업2는 선택)
          </p>
          <p>2. 일정 제목은 <strong className="text-foreground">회원명(나이종목)</strong> 형식을 권장합니다. 예: 윤찬민(14축구)</p>
          <p>3. iPhone 캘린더를 쓰는 경우, iCloud/Google과 「수업」「수업2」 캘린더를 동기화해 두면 같은 일정이 반영됩니다.</p>
          <p>
            4. 「지금 동기화」는 최근 90일~앞으로 1년 구간의 일정을 전부 다시 가져옵니다. 누락된
            일정이 있으면 이 버튼을 눌러 주세요.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
