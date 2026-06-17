import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { AuthHashCallback } from './auth-hash-callback'

export default function AuthHashCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">초대 링크를 확인하는 중…</p>
        </div>
      }
    >
      <AuthHashCallback />
    </Suspense>
  )
}
