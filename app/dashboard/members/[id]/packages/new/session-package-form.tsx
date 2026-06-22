'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  createSessionPackage,
  deleteSessionPackage,
  updateSessionPackage,
} from '@/lib/actions/sessions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import {
  MONTHLY_PLAN_PRESETS,
  MONTHLY_RECURRING_PLAN_LABEL,
  PACKAGE_PRESETS,
  UNLIMITED_SESSIONS_DISPLAY,
  addMonthsToDate,
  adjustPriceForPaymentMethod,
  calculateMonthlyPlanExpiryDate,
  calculateMonthlyRecurringExpiryDate,
  clearMonthlyPlanNote,
  formatPackageRemainingDisplay,
  formatPackageSessionsDisplay,
  getDefaultMonthlyRecurringPaidAt,
  getPresetPrice,
  isMonthlyRecurringPlan,
  mergeMonthlyPlanNote,
  mergeMonthlyRecurringPlanNote,
  parseMonthlyPlanMonthsFromNote,
  toMonthStartDate,
  type MonthlyPlanMonths,
} from '@/lib/session-package-utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { ArrowLeft, Check, CreditCard, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { SessionPackage } from '@/types/database'

interface SessionPackageFormProps {
  member: { id: string; name: string }
  sessionPackage?: SessionPackage
}

const PAYMENT_METHODS = [
  { value: 'card', label: '카드' },
  { value: 'cash', label: '현금' },
  { value: 'transfer', label: '계좌이체' },
  { value: 'mixed', label: '복합결제' },
]

function toDateInputValue(value: string | null | undefined) {
  if (!value) return ''
  return value.split('T')[0]
}

function buildInitialFormData(sessionPackage?: SessionPackage) {
  if (sessionPackage) {
    return {
      total_sessions: sessionPackage.total_sessions,
      remaining_sessions: sessionPackage.remaining_sessions,
      price: sessionPackage.price != null ? String(sessionPackage.price) : '',
      paid_at: toDateInputValue(sessionPackage.paid_at),
      expires_at: toDateInputValue(sessionPackage.expires_at),
      payment_method: sessionPackage.payment_method || 'card',
      note: sessionPackage.note || '',
      is_active: sessionPackage.is_active,
    }
  }

  return {
    total_sessions: 8,
    remaining_sessions: 8,
    price: '880000',
    paid_at: new Date().toISOString().split('T')[0],
    expires_at: '',
    payment_method: 'card',
    note: '',
    is_active: true,
  }
}

export function SessionPackageForm({ member, sessionPackage }: SessionPackageFormProps) {
  const isEditing = Boolean(sessionPackage)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [formData, setFormData] = useState(() => buildInitialFormData(sessionPackage))
  const initialMonthlyMonths = parseMonthlyPlanMonthsFromNote(sessionPackage?.note)
  const initialMonthlyRecurring = isMonthlyRecurringPlan(sessionPackage?.note)
  const [activeMonthlyMonths, setActiveMonthlyMonths] = useState<MonthlyPlanMonths | null>(
    () => {
      if (initialMonthlyRecurring) return null
      if (initialMonthlyMonths === 1 || initialMonthlyMonths === 3 || initialMonthlyMonths === 6) {
        return initialMonthlyMonths
      }
      return null
    },
  )
  const [isMonthlyRecurring, setIsMonthlyRecurring] = useState(initialMonthlyRecurring)
  const [periodMonths, setPeriodMonths] = useState<number | null>(
    initialMonthlyRecurring ? null : initialMonthlyMonths,
  )
  const [expiresAtManual, setExpiresAtManual] = useState(false)

  async function handleDelete() {
    if (!sessionPackage) return
    setIsDeleting(true)
    const result = await deleteSessionPackage(sessionPackage.id)
    setIsDeleting(false)

    if (result.error) {
      toast.error('삭제 실패', { description: result.error })
      return
    }

    toast.success('수업권이 휴지통으로 이동했습니다.')
    router.push(`/dashboard/members/${member.id}`)
  }

  function applyPresetPrice(sessions: number, paymentMethod: string) {
    const presetPrice = getPresetPrice(sessions, paymentMethod)
    return presetPrice != null ? String(presetPrice) : undefined
  }

  function handlePresetSelect(sessions: number) {
    const price = applyPresetPrice(sessions, formData.payment_method)
    setActiveMonthlyMonths(null)
    setIsMonthlyRecurring(false)
    setPeriodMonths(null)
    setExpiresAtManual(false)
    setFormData({
      ...formData,
      total_sessions: sessions,
      remaining_sessions: sessions,
      expires_at: '',
      note: clearMonthlyPlanNote(formData.note),
      ...(price !== undefined ? { price } : {}),
    })
  }

  function applyMonthlyPeriod(
    months: number,
    options?: { extendFromExpiry?: boolean; autoExpiry?: boolean },
  ) {
    const paidAt = formData.paid_at || new Date().toISOString().split('T')[0]
    const presetMatch = MONTHLY_PLAN_PRESETS.find((item) => item.months === months)
    const shouldAutoExpiry = options?.autoExpiry !== false && !expiresAtManual
    const expiresAt =
      shouldAutoExpiry &&
      (options?.extendFromExpiry && formData.expires_at
        ? addMonthsToDate(formData.expires_at, 1)
        : calculateMonthlyPlanExpiryDate(paidAt, months))

    setPeriodMonths(months)
    setActiveMonthlyMonths(presetMatch ? presetMatch.months : null)
    setIsMonthlyRecurring(false)
    setFormData({
      ...formData,
      total_sessions: 0,
      ...(isEditing ? {} : { remaining_sessions: 0 }),
      paid_at: paidAt,
      ...(expiresAt ? { expires_at: expiresAt } : {}),
      note: mergeMonthlyPlanNote(formData.note, months),
    })
  }

  function handleMonthlyPlanSelect(months: MonthlyPlanMonths) {
    setExpiresAtManual(false)
    applyMonthlyPeriod(months, { autoExpiry: true })
  }

  function handleMonthlyRecurringSelect() {
    setExpiresAtManual(false)
    const paidAt = toMonthStartDate(formData.paid_at || getDefaultMonthlyRecurringPaidAt())
    setIsMonthlyRecurring(true)
    setActiveMonthlyMonths(null)
    setPeriodMonths(null)
    setFormData({
      ...formData,
      total_sessions: 0,
      ...(isEditing ? {} : { remaining_sessions: 0 }),
      paid_at: paidAt,
      expires_at: calculateMonthlyRecurringExpiryDate(paidAt),
      note: mergeMonthlyRecurringPlanNote(formData.note),
    })
  }

  function handlePeriodMonthsChange(rawMonths: number) {
    const months = Math.max(1, Math.floor(rawMonths) || 1)
    applyMonthlyPeriod(months)
  }

  function handleExtendPeriod() {
    const currentMonths = periodMonths ?? parseMonthlyPlanMonthsFromNote(formData.note) ?? 1
    setExpiresAtManual(false)
    applyMonthlyPeriod(currentMonths + 1, {
      extendFromExpiry: Boolean(formData.expires_at),
      autoExpiry: true,
    })
  }

  function handleExpiresAtChange(expires_at: string) {
    setExpiresAtManual(true)
    setFormData((prev) => ({ ...prev, expires_at }))
  }

  function handleSessionsChange(sessions: number) {
    const price = applyPresetPrice(sessions, formData.payment_method)
    setActiveMonthlyMonths(null)
    setIsMonthlyRecurring(false)
    setPeriodMonths(null)
    setExpiresAtManual(false)
    setFormData({
      ...formData,
      total_sessions: sessions,
      ...(isEditing ? {} : { remaining_sessions: sessions }),
      expires_at: '',
      note: clearMonthlyPlanNote(formData.note),
      ...(price !== undefined ? { price } : {}),
    })
  }

  function handlePaymentMethodChange(paymentMethod: string) {
    const currentPrice = Number(formData.price) || 0
    const isMonthly = periodMonths != null || isMonthlyRecurring
    const nextPrice =
      currentPrice > 0
        ? adjustPriceForPaymentMethod(
            currentPrice,
            formData.payment_method,
            paymentMethod,
          )
        : isMonthly
          ? null
          : getPresetPrice(formData.total_sessions, paymentMethod)

    setFormData({
      ...formData,
      payment_method: paymentMethod,
      ...(nextPrice != null ? { price: String(nextPrice) } : {}),
    })
  }

  function handlePaidAtChange(paidAt: string) {
    setFormData((prev) => ({
      ...prev,
      paid_at: paidAt,
      ...(periodMonths && !expiresAtManual
        ? { expires_at: calculateMonthlyPlanExpiryDate(paidAt, periodMonths) }
        : {}),
      ...(isMonthlyRecurring && !expiresAtManual
        ? { expires_at: calculateMonthlyRecurringExpiryDate(paidAt) }
        : {}),
    }))
  }

  function handlePriceChange(value: string) {
    const digits = value.replace(/[^\d]/g, '')
    setFormData({ ...formData, price: digits })
  }

  function formatPriceDisplay(value: string) {
    if (!value) return ''
    return Number(value).toLocaleString('en-US')
  }

  const isMonthlyPlanMode = periodMonths != null || isMonthlyRecurring

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const totalSessions = isMonthlyPlanMode ? 0 : formData.total_sessions

    const payload = {
      total_sessions: totalSessions,
      price: formData.price ? Number(formData.price) : undefined,
      paid_at: formData.paid_at.trim() ? formData.paid_at : null,
      expires_at: formData.expires_at.trim() ? formData.expires_at : null,
      payment_method: formData.payment_method || undefined,
      note: formData.note || undefined,
    }

    const result = isEditing && sessionPackage
      ? await updateSessionPackage(sessionPackage.id, {
          ...payload,
          remaining_sessions: isMonthlyPlanMode ? 0 : formData.remaining_sessions,
          is_active: formData.is_active,
        })
      : await createSessionPackage({
          member_id: member.id,
          ...payload,
        })

    setIsLoading(false)

    if (result.error) {
      toast.error(isEditing ? '수업권 수정 실패' : '수업권 저장 실패', {
        description: result.error,
      })
      return
    }

    toast.success(isEditing ? '수업권이 수정되었습니다.' : '수업권이 등록되었습니다.')
    router.push(`/dashboard/members/${member.id}`)
  }

  const confirmLabel = isLoading ? '저장 중…' : '확인'

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/dashboard/members/${member.id}`}>
            <Button type="button" variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold lg:text-3xl">
              {isEditing ? '수업권 수정' : '수업권 추가'}
            </h1>
            <p className="text-muted-foreground">{member.name} 회원</p>
          </div>
        </div>
        <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
          {isEditing && sessionPackage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  size="lg"
                  disabled={isLoading || isDeleting}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>수업권 삭제</AlertDialogTitle>
                  <AlertDialogDescription>
                    {sessionPackage.total_sessions}회 수업권을 삭제하시겠습니까? 휴지통으로
                    이동하며, 휴지통에서 복구할 수 있습니다.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={isDeleting}
                    onClick={(e) => {
                      e.preventDefault()
                      void handleDelete()
                    }}
                  >
                    {isDeleting ? '삭제 중…' : '삭제'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            type="submit"
            size="lg"
            className="min-w-[7.5rem]"
            disabled={isLoading || isDeleting}
          >
            <Check className="mr-2 h-4 w-4" />
            {confirmLabel}
          </Button>
        </div>
      </div>

      <Card className="w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              수업권 정보
            </CardTitle>
            <CardDescription>
              {isEditing
                ? '등록된 수업권 정보를 수정합니다.'
                : '새로운 수업권을 등록합니다. 잔여 회차는 총 회차와 동일하게 설정됩니다.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>빠른 선택</Label>
              <div className="flex gap-2 flex-wrap">
                {PACKAGE_PRESETS.map((preset) => (
                  <Button
                    key={preset.sessions}
                    type="button"
                    variant={
                      !isMonthlyPlanMode &&
                      activeMonthlyMonths == null &&
                      !isMonthlyRecurring &&
                      formData.total_sessions === preset.sessions
                        ? 'default'
                        : 'outline'
                    }
                    size="sm"
                    onClick={() => handlePresetSelect(preset.sessions)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>월 정액</Label>
              <div className="flex flex-wrap items-center gap-2">
                {MONTHLY_PLAN_PRESETS.map((preset) => (
                  <Button
                    key={preset.months}
                    type="button"
                    variant={
                      activeMonthlyMonths === preset.months ? 'default' : 'outline'
                    }
                    size="sm"
                    onClick={() => handleMonthlyPlanSelect(preset.months)}
                  >
                    {preset.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant={isMonthlyRecurring ? 'default' : 'outline'}
                  size="sm"
                  onClick={handleMonthlyRecurringSelect}
                >
                  {MONTHLY_RECURRING_PLAN_LABEL}
                </Button>
                <div className="flex flex-wrap items-center gap-2 border-l border-border pl-2">
                  <Label htmlFor="period_months" className="text-sm font-normal text-muted-foreground">
                    기간
                  </Label>
                  <Input
                    id="period_months"
                    type="number"
                    min={1}
                    value={periodMonths ?? ''}
                    onChange={(e) => handlePeriodMonthsChange(Number(e.target.value))}
                    disabled={!isMonthlyPlanMode || isMonthlyRecurring}
                    placeholder="-"
                    className="h-8 w-16 px-2 text-center"
                  />
                  <span className="text-sm text-muted-foreground">개월</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!isMonthlyPlanMode || isMonthlyRecurring}
                    onClick={handleExtendPeriod}
                  >
                    +1개월 연장
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                월정액은 횟수 제한 없음 · 금액 직접 입력 · 매월은 당월 1일 기준(결제일 변경 가능) · 기간형은 수정·연장 가능
              </p>
            </div>

            <div className={`grid gap-4 ${isEditing ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-2">
                <Label htmlFor="total_sessions">
                  총 회차
                  {isMonthlyRecurring ? (
                    <span className="ml-1 text-primary">({MONTHLY_RECURRING_PLAN_LABEL})</span>
                  ) : periodMonths != null ? (
                    <span className="ml-1 text-primary">({periodMonths}개월)</span>
                  ) : null}
                </Label>
                {isMonthlyPlanMode ? (
                  <Input
                    id="total_sessions"
                    value={UNLIMITED_SESSIONS_DISPLAY}
                    readOnly
                    disabled
                    className="text-muted-foreground"
                  />
                ) : (
                  <Input
                    id="total_sessions"
                    type="number"
                    min={1}
                    value={formData.total_sessions}
                    onChange={(e) => handleSessionsChange(Number(e.target.value))}
                    required
                  />
                )}
              </div>
              {isEditing && (
                <div className="space-y-2">
                  <Label htmlFor="remaining_sessions">잔여 회차</Label>
                  {isMonthlyPlanMode ? (
                    <Input
                      id="remaining_sessions"
                      value={UNLIMITED_SESSIONS_DISPLAY}
                      readOnly
                      disabled
                      className="text-muted-foreground"
                    />
                  ) : (
                    <Input
                      id="remaining_sessions"
                      type="number"
                      min="0"
                      max={formData.total_sessions}
                      value={formData.remaining_sessions}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          remaining_sessions: Math.min(
                            Number(e.target.value),
                            formData.total_sessions,
                          ),
                        })
                      }
                      required
                    />
                  )}
                </div>
              )}
            </div>

            <div className="min-w-0 space-y-4">
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_7.5rem] gap-3">
                  <Label htmlFor="price">결제 금액 (원)</Label>
                  <Label htmlFor="payment_method">결제 방식</Label>
                </div>
                <div className="grid grid-cols-[1fr_7.5rem] items-center gap-3">
                  <Input
                    id="price"
                    type="text"
                    inputMode="numeric"
                    value={formatPriceDisplay(formData.price)}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    placeholder="880,000"
                    className="w-full"
                  />
                  <Select
                    value={formData.payment_method}
                    onValueChange={handlePaymentMethodChange}
                  >
                    <SelectTrigger id="payment_method" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method.value} value={method.value}>
                          {method.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  {isMonthlyPlanMode
                    ? '월정액 금액은 직접 입력해주세요.'
                    : '카드·복합결제는 부가세 포함 · 현금·계좌이체는 부가세 제외 (8회 기준 88만/80만원)'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paid_at">결제일</Label>
                <KoreanDatePicker
                  id="paid_at"
                  value={formData.paid_at}
                  onChange={handlePaidAtChange}
                  placeholder="결제일 선택"
                />
                {isMonthlyRecurring ? (
                  <p className="text-xs text-muted-foreground">
                    매월 정액은 기본 당월 1일부터 계산됩니다. 필요하면 결제일을 변경할 수 있습니다.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expires_at">만료일</Label>
                <KoreanDatePicker
                  id="expires_at"
                  value={formData.expires_at}
                  onChange={handleExpiresAtChange}
                  placeholder="미지정"
                />
                <p className="text-xs text-muted-foreground">
                  {isMonthlyRecurring
                    ? '결제일 기준 1개월 후로 자동 설정됩니다. 직접 변경할 수도 있습니다.'
                    : '기본은 미지정입니다. 월 정액(기간형) 선택 시에만 기간에 맞춰 자동 설정됩니다.'}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">메모</Label>
              <Textarea
                id="note"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                placeholder="결제 관련 특이사항"
                rows={3}
              />
            </div>

            {isEditing && (
              <div className="space-y-2">
                <Label htmlFor="is_active">상태</Label>
                <Select
                  value={formData.is_active ? 'active' : 'inactive'}
                  onValueChange={(value) =>
                    setFormData({ ...formData, is_active: value === 'active' })
                  }
                >
                  <SelectTrigger id="is_active" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">사용중</SelectItem>
                    <SelectItem value="inactive">종료</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="bg-secondary/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">{isEditing ? '수정 정보 요약' : '등록 정보 요약'}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">총 회차:</span>
                <span>
                  {formatPackageSessionsDisplay(formData.total_sessions, formData.note)}
                </span>
                {isEditing && (
                  <>
                    <span className="text-muted-foreground">잔여 회차:</span>
                    <span>
                      {formatPackageRemainingDisplay(
                        formData.remaining_sessions,
                        formData.note,
                        formData.expires_at || null,
                        formData.paid_at || null,
                      )}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">금액:</span>
                <span>{formData.price ? `${Number(formData.price).toLocaleString()}원` : '-'}</span>
                <span className="text-muted-foreground">회당 금액:</span>
                <span>
                  {formData.price && !isMonthlyPlanMode && formData.total_sessions > 0
                    ? `${Math.round(Number(formData.price) / formData.total_sessions).toLocaleString()}원`
                    : '-'}
                </span>
                <span className="text-muted-foreground">만료일:</span>
                <span>{formData.expires_at || '미지정'}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
              <Button type="button" variant="outline" size="lg" className="min-w-[7.5rem]" asChild>
                <Link href={`/dashboard/members/${member.id}`}>취소</Link>
              </Button>
              <Button
                type="submit"
                size="lg"
                className="min-w-[7.5rem]"
                disabled={isLoading || isDeleting}
              >
                <Check className="mr-2 h-4 w-4" />
                {confirmLabel}
              </Button>
            </div>
          </CardContent>
        </Card>
    </form>
  )
}
