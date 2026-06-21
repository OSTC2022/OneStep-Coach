'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createRunningLeague } from '@/lib/actions/running-league'
import {
  EMPTY_RUNNING_LEAGUE_FORM,
  RunningLeagueForm,
  type RunningLeagueFormValues,
} from '@/components/settings/running-league/running-league-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function RunningLeagueCreateView() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<RunningLeagueFormValues>(EMPTY_RUNNING_LEAGUE_FORM)

  function submit() {
    startTransition(async () => {
      const result = await createRunningLeague(form)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('챌린지를 생성했습니다.')
      router.push(`/dashboard/settings/running-league/${result.id}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="w-fit px-2">
        <Link href="/dashboard/settings/running-league">
          <ArrowLeft className="mr-1 h-4 w-4" />
          챌린지 목록
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plus className="h-5 w-5 text-primary" />
            새 ONE STEP RUNNING LEAGUE
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            성인 러닝 리그 전용 챌린지입니다. 선수 성장 챌린지(신체·컨디션 리포트)와 별도로
            운영됩니다.
          </p>
          <RunningLeagueForm value={form} onChange={setForm} idPrefix="create" />
          <Button type="button" onClick={submit} disabled={pending} className="w-full sm:w-auto">
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            챌린지 생성
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
