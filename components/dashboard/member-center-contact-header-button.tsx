'use client'

import { useEffect, useState } from 'react'
import { Loader2, Users } from 'lucide-react'
import { BrandPulseAppIcon } from '@/components/brand/brand-pulse-mark'
import { MemberCenterContactCard } from '@/components/members/member-center-contact-card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  getMemberPortalContact,
  type MemberPortalContactPayload,
} from '@/lib/actions/member-portal-contact'
import { cn } from '@/lib/utils'

export function MemberCenterContactHeaderButton({
  className,
}: {
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [contact, setContact] = useState<MemberPortalContactPayload | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    void getMemberPortalContact()
      .then((payload) => {
        if (!cancelled) setContact(payload)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          'h-9 w-9 shrink-0 rounded-full p-0 hover:bg-muted/60',
          className,
        )}
        aria-label="코치 & 센터 연락"
        title="코치 & 센터 연락"
        onClick={() => setOpen(true)}
      >
        <BrandPulseAppIcon className="onestep-symbol-soft-blink h-8 w-8" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          mobileSheet
          showCloseButton
          className="max-h-[min(92dvh,720px)] gap-0 overflow-y-auto p-0 sm:max-w-md"
        >
          <DialogHeader className="border-b border-border/60 px-5 pb-3 pt-5 text-left">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              코치 &amp; 센터 연락
            </DialogTitle>
            <DialogDescription className="sr-only">
              담당 코치와 센터 연락처, 빠른 문의 채널
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4">
            {loading && !contact ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : contact ? (
              <MemberCenterContactCard
                coach={contact.coach}
                center={contact.center}
                bare
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                연락처 정보를 불러오지 못했습니다.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
