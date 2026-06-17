import { Suspense } from 'react'
import { OnestepSplashScreen } from '@/components/brand/onestep-splash-screen'
import { AuthHashCallback } from './auth-hash-callback'

export default function AuthHashCallbackPage() {
  return (
    <Suspense fallback={<OnestepSplashScreen />}>
      <AuthHashCallback />
    </Suspense>
  )
}
