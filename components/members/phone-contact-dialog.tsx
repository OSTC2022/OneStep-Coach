'use client'

import { useEffect, useState } from 'react'
import { Copy, MessageSquare, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { buildSmsHref, buildTelHref } from '@/lib/center-contact'
import { cn } from '@/lib/utils'

interface PhoneContactDialogProps {
  phones: string[]
  title?: string
  description?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PhoneContactDialog({
  phones,
  title = '연락처',
  description,
  open,
  onOpenChange,
}: PhoneContactDialogProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const validPhones = phones.filter((phone) => phone.replace(/\D/g, '').length > 0)
  const selectedPhone = validPhones[selectedIndex] ?? validPhones[0] ?? ''

  useEffect(() => {
    if (open) setSelectedIndex(0)
  }, [open, phones])

  async function handleCopy() {
    if (!selectedPhone) return
    try {
      await navigator.clipboard.writeText(selectedPhone)
      toast.success('연락처를 복사했습니다.')
      onOpenChange(false)
    } catch {
      toast.error('복사에 실패했습니다.')
    }
  }

  if (validPhones.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-4">
          {validPhones.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {validPhones.map((phone, index) => (
                <button
                  key={`${phone}-${index}`}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                    index === selectedIndex
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted/20 text-foreground hover:bg-muted/40',
                  )}
                >
                  {phone}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground">연락처</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{selectedPhone}</p>
            </div>
          )}

          <div className="grid gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full gap-2"
              onClick={() => void handleCopy()}
            >
              <Copy className="h-4 w-4" />
              연락처 복사
            </Button>
            <Button
              asChild
              className="min-h-11 w-full gap-2"
            >
              <a href={buildTelHref(selectedPhone)}>
                <Phone className="h-4 w-4" />
                전화하기
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="min-h-11 w-full gap-2 border-border/70 bg-background/40"
            >
              <a href={buildSmsHref(selectedPhone)}>
                <MessageSquare className="h-4 w-4" />
                문자하기
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
