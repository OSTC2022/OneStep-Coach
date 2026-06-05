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
import { PACKAGE_PRESETS, getPresetPrice } from '@/lib/session-package-utils'
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
import { ArrowLeft, Save, CreditCard, Trash2 } from 'lucide-react'
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
    router.refresh()
  }

  function applyPresetPrice(sessions: number, paymentMethod: string) {
    const presetPrice = getPresetPrice(sessions, paymentMethod)
    return presetPrice != null ? String(presetPrice) : undefined
  }

  function handlePresetSelect(sessions: number) {
    const price = applyPresetPrice(sessions, formData.payment_method)
    setFormData({
      ...formData,
      total_sessions: sessions,
      ...(isEditing ? {} : { remaining_sessions: sessions }),
      ...(price !== undefined ? { price } : {}),
    })
  }

  function handleSessionsChange(sessions: number) {
    const price = applyPresetPrice(sessions, formData.payment_method)
    setFormData({
      ...formData,
      total_sessions: sessions,
      ...(isEditing ? {} : { remaining_sessions: sessions }),
      ...(price !== undefined ? { price } : {}),
    })
  }

  function handlePaymentMethodChange(paymentMethod: string) {
    const price = applyPresetPrice(formData.total_sessions, paymentMethod)
    setFormData({
      ...formData,
      payment_method: paymentMethod,
      ...(price !== undefined ? { price } : {}),
    })
  }

  function handlePriceChange(value: string) {
    const digits = value.replace(/[^\d]/g, '')
    setFormData({ ...formData, price: digits })
  }

  function formatPriceDisplay(value: string) {
    if (!value) return ''
    return Number(value).toLocaleString('en-US')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    const payload = {
      total_sessions: formData.total_sessions,
      price: formData.price ? Number(formData.price) : undefined,
      paid_at: formData.paid_at || undefined,
      expires_at: formData.expires_at || undefined,
      payment_method: formData.payment_method || undefined,
      note: formData.note || undefined,
    }

    const result = isEditing && sessionPackage
      ? await updateSessionPackage(sessionPackage.id, {
          ...payload,
          remaining_sessions: formData.remaining_sessions,
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
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/members/${member.id}`}>
            <Button type="button" variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold">
              {isEditing ? '수업권 수정' : '수업권 추가'}
            </h1>
            <p className="text-muted-foreground">{member.name} 회원</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing && sessionPackage && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" disabled={isLoading || isDeleting}>
                  <Trash2 className="h-4 w-4 mr-2" />
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
          <Button type="submit" disabled={isLoading || isDeleting}>
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? '저장 중...' : '저장'}
          </Button>
        </div>
      </div>

      <div className="max-w-2xl">
        <Card>
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
                    variant={formData.total_sessions === preset.sessions ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handlePresetSelect(preset.sessions)}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className={`grid gap-4 ${isEditing ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="space-y-2">
                <Label htmlFor="total_sessions">총 회차</Label>
                <Input
                  id="total_sessions"
                  type="number"
                  min="1"
                  value={formData.total_sessions}
                  onChange={(e) => handleSessionsChange(Number(e.target.value))}
                  required
                />
              </div>
              {isEditing && (
                <div className="space-y-2">
                  <Label htmlFor="remaining_sessions">잔여 회차</Label>
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
                {formData.total_sessions === 8 && (
                  <p className="text-xs text-muted-foreground">
                    8회 기준 88만원 · 현금·계좌이체 선택 시 80만원
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="paid_at">결제일</Label>
                <KoreanDatePicker
                  id="paid_at"
                  value={formData.paid_at}
                  onChange={(paid_at) => setFormData({ ...formData, paid_at })}
                  placeholder="결제일 선택"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expires_at">만료일</Label>
                <KoreanDatePicker
                  id="expires_at"
                  value={formData.expires_at}
                  onChange={(expires_at) => setFormData({ ...formData, expires_at })}
                  placeholder="만료일 선택"
                />
                <p className="text-xs text-muted-foreground">
                  날짜를 선택하지 않으면 만료일 없이 저장됩니다.
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
                <span>{formData.total_sessions}회</span>
                {isEditing && (
                  <>
                    <span className="text-muted-foreground">잔여 회차:</span>
                    <span>{formData.remaining_sessions}회</span>
                  </>
                )}
                <span className="text-muted-foreground">금액:</span>
                <span>{formData.price ? `${Number(formData.price).toLocaleString()}원` : '-'}</span>
                <span className="text-muted-foreground">회당 금액:</span>
                <span>
                  {formData.price
                    ? `${Math.round(Number(formData.price) / formData.total_sessions).toLocaleString()}원`
                    : '-'}
                </span>
                <span className="text-muted-foreground">만료일:</span>
                <span>{formData.expires_at || '미선택'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  )
}
