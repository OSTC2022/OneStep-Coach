'use client'

import { useEffect, useRef, useState } from 'react'
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
import { syncStatusLabelKo } from '@/lib/google-calendar/sync-status'
import type { GoogleCalendarSyncStatus } from '@/lib/google-calendar/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface GoogleCalendarPanelProps {
  initialStatus: GoogleCalendarSyncStatus
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  'admin-only': '관리자 계정으로 로그인한 뒤 연결해 주세요.',
  'invalid-state':
    '연결 세션이 만료되었거나 도메인이 달라 실패했습니다. 같은 주소에서 다시 시도해 주세요.',
  'not-configured': 'Google Calendar 환경 변수가 설정되지 않았습니다.',
  access_denied: 'Google 계정 연결을 취소했습니다.',
}

function describeOAuthError(raw: string): string {
  const decoded = decodeURIComponent(raw)
  return OAUTH_ERROR_MESSAGES[decoded] ?? decoded
}

function syncStatusClass(
  status: GoogleCalendarSyncStatus['syncStatus'],
  isSyncing: boolean,
): string {
  if (isSyncing || status === 'syncing') return 'text-primary'
  switch (status) {
    case 'success':
      return 'text-primary'
    case 'partial_success':
      return 'text-amber-600 dark:text-amber-400'
    case 'failure':
      return 'text-destructive'
    default:
      return 'text-muted-foreground'
  }
}

export function GoogleCalendarPanel({ initialStatus }: GoogleCalendarPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState(initialStatus)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const completionNotifiedRef = useRef(false)

  useEffect(() => {
    if (searchParams.get('connected') === '1') {
      const created = searchParams.get('created')
      toast.success('Google 캘린더 연동 완료', {
        description: created
          ? `Google에 ${created
              .split(',')
              .map((name) => `「${name}」`)
              .join(', ')} 캘린더를 자동 생성했습니다.`
          : '「수업」「수업2」 캘린더를 찾으면 자동 반영됩니다.',
      })
      router.replace('/dashboard/settings/google-calendar')
    }

    const error = searchParams.get('error')
    if (error) {
      toast.error('Google 캘린더 연결 실패', {
        description: describeOAuthError(error),
      })
      router.replace('/dashboard/settings/google-calendar')
    }
  }, [router, searchParams])

  useEffect(() => {
    if (!status.isSyncing) return

    completionNotifiedRef.current = false
    const intervalId = window.setInterval(() => {
      void (async () => {
        const next = await getGoogleCalendarSyncStatus()
        setStatus(next)

        if (next.isSyncing || completionNotifiedRef.current) return

        completionNotifiedRef.current = true
        const run = next.runStats
        const summary = run
          ? `처리 ${run.processed} · 신규 ${run.created} · 수정 ${run.updated} · 미연결 ${run.pendingMember}`
          : undefined

        if (next.syncStatus === 'success') {
          toast.success('동기화 완료', { description: summary })
        } else if (next.syncStatus === 'partial_success') {
          toast.warning('부분 동기화', {
            description: next.lastSyncError ?? summary,
          })
        } else if (next.syncStatus === 'failure') {
          toast.error('동기화 실패', { description: next.lastSyncError ?? undefined })
        }
      })()
    }, 2000)

    return () => window.clearInterval(intervalId)
  }, [status.isSyncing])

  async function handleManualSync() {
    const result = await runGoogleCalendarSyncNow()

    if (result.error) {
      toast.error('동기화 시작 실패', { description: result.error })
      return
    }

    if (result.started === false) {
      toast.info('동기화 대기 중', { description: result.error })
      return
    }

    const nextStatus = await getGoogleCalendarSyncStatus()
    setStatus(nextStatus)
    toast.info('동기화 시작', {
      description: '변경분만 백그라운드에서 가져옵니다. 완료되면 알림이 표시됩니다.',
    })
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

  const runStats = status.runStats

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
            <strong className="text-foreground">양방향 동기화</strong> — 센터 캘린더에서
            추가·수정·삭제한 일정이 Google(폰/PC)의{' '}
            <strong className="text-foreground">「수업」</strong>,{' '}
            <strong className="text-foreground">「수업2」</strong> 캘린더에 반영되고, Google에서
            변경한 내용도 센터 캘린더에 반영됩니다.{' '}
            <strong className="text-foreground">가장 최근에 수정한 쪽</strong>이 우선합니다.
            회원 이름을 찾지 못하면 임시 등록 후 알림을 보냅니다.
          </p>
          {status.connected ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              쓰기 권한이 필요합니다. 예전에 연결했다면 한 번 연결 해제 후 Google 계정을 다시
              연결해 주세요.
            </p>
          ) : (
            <p className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
              폰에 Google 계정이 여러 개면 연결할 때{' '}
              <strong className="text-foreground">「수업」「수업2」가 있는 계정</strong>
              (예: allakj11@gmail.com)을 꼭 선택해 주세요. 다른 계정을 고르면 캘린더를 찾지
              못합니다.
            </p>
          )}

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
                  <dt className="text-muted-foreground">Push 알림 (웹훅)</dt>
                  <dd className="font-medium">
                    {status.watchActive ? '활성' : '비활성 / 갱신 필요'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">자동 동기화</dt>
                  <dd className="font-medium">캘린더 페이지 열림 시 · 지금 동기화</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">현재 상태</dt>
                  <dd
                    className={`inline-flex items-center gap-1 font-medium ${syncStatusClass(status.syncStatus, status.isSyncing)}`}
                  >
                    {status.isSyncing ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : null}
                    {syncStatusLabelKo(status.syncStatus, status.isSyncing)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">마지막 전체 성공</dt>
                  <dd className="font-medium">
                    {status.lastSyncedAt
                      ? format(parseISO(status.lastSyncedAt), 'M월 d일 HH:mm', { locale: ko })
                      : '-'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">마지막 시도</dt>
                  <dd className="font-medium">
                    {status.lastSyncAttemptAt
                      ? format(parseISO(status.lastSyncAttemptAt), 'M월 d일 HH:mm', { locale: ko })
                      : '-'}
                  </dd>
                </div>
                {runStats ? (
                  <>
                    <div>
                      <dt className="text-muted-foreground">처리된 일정</dt>
                      <dd className="font-medium">{runStats.processed}건</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">신규 / 수정</dt>
                      <dd className="font-medium">
                        {runStats.created} / {runStats.updated}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">미연결 일정</dt>
                      <dd className="font-medium">{runStats.pendingMember}건</dd>
                    </div>
                    {runStats.deduped ? (
                      <div>
                        <dt className="text-muted-foreground">중복 정리</dt>
                        <dd className="font-medium">{runStats.deduped}건</dd>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </dl>
            ) : null}

            {status.lastSyncError ? (
              <p className="mt-3 text-xs text-destructive">{status.lastSyncError}</p>
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
                <a href="/auth/google/calendar">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Google 계정 연결
                </a>
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={status.isSyncing}
                  onClick={() => void handleManualSync()}
                >
                  {status.isSyncing ? (
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
            <strong className="text-foreground">수업2</strong>로 만듭니다. (없으면 연결 시
            자동 생성됩니다)
          </p>
          <p>2. 일정 제목은 <strong className="text-foreground">회원명(나이종목)</strong> 형식을 권장합니다. 예: 윤찬민(14축구)</p>
          <p>3. iPhone 캘린더를 쓰는 경우, iCloud/Google과 「수업」「수업2」 캘린더를 동기화해 두면 같은 일정이 반영됩니다.</p>
          <p>
            4. 「수업」 캘린더 일정은 <strong className="text-foreground">이교직</strong>, 「수업2」는{' '}
            <strong className="text-foreground">장지용</strong> 강사·색상으로 자동 반영됩니다.
          </p>
          <p>
            5. 센터에서 일정을 바꾸면 Google에 자동 반영됩니다. 폰에서 바꾼 내용은 웹훅·
            <strong className="text-foreground">캘린더 페이지</strong>를 열면 백그라운드로
            가져오고, 설정의 <strong className="text-foreground">지금 동기화</strong>로
            수동 실행할 수 있습니다. Push 웹훅이 활성이면 Google 변경 시에도 반영됩니다.
          </p>
          <p>
            6. <strong className="text-foreground">맥·아이폰·안드로이드</strong>에서도 연결할 수
            있습니다. 홈 화면 앱(PWA)으로 열었다면 Safari/Chrome 주소창에서 같은 사이트로 접속한
            뒤 연결해 주세요. Google Cloud Console OAuth 리디렉션 URI에는 사용 중인 도메인별{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              /auth/google/calendar/callback
            </code>
            을 모두 등록해야 합니다.
          </p>
          <p>
            7. 같은 일정을 양쪽에서 수정하면 <strong className="text-foreground">더 최근에 저장한 쪽</strong>이
            적용됩니다.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
