'use client'

import Link from 'next/link'
import { CreditCard } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { RecentSessionPayment } from '@/lib/actions/sessions'

interface DashboardRecentPaymentsProps {
  payments: RecentSessionPayment[]
}

function formatPaymentDateTime(paidAt: string | null, createdAt: string) {
  const raw = paidAt ?? createdAt
  const hasTime = raw.includes('T') && !raw.endsWith('T00:00:00.000Z')
  const date = new Date(hasTime ? raw : `${raw.split('T')[0]}T12:00:00`)

  const dateLabel = date.toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  })

  if (!hasTime) {
    return dateLabel
  }

  const timeLabel = date.toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return `${dateLabel} ${timeLabel}`
}

export function DashboardRecentPayments({ payments }: DashboardRecentPaymentsProps) {
  const visible = payments.slice(0, 4)

  return (
    <Link href="/dashboard/sessions">
      <Card className="h-full transition-colors hover:bg-muted/40 active:bg-muted/60 max-md:transition-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            최근 세션 결제
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {visible.length === 0 ? (
            <p className="text-xs text-muted-foreground">결제 내역 없음</p>
          ) : (
            visible.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="truncate font-medium">
                  {payment.member?.name ?? '회원'}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {formatPaymentDateTime(payment.paid_at, payment.created_at)}
                </span>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">바로가기</p>
        </CardContent>
      </Card>
    </Link>
  )
}
