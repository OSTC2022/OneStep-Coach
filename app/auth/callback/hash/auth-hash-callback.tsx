'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export function AuthHashCallback() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('초대 링크를 확인하는 중…')

  useEffect(() => {
    const supabase = createClient()
    const next = searchParams.get('next') ?? '/auth/set-password'

    async function handleCallback() {
      const hash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash
      const params = new URLSearchParams(hash)
      const authError = params.get('error')
      const errorCode = params.get('error_code')
      const errorDescription = params.get('error_description')

      if (authError) {
        const query = new URLSearchParams()
        if (errorCode) query.set('error_code', errorCode)
        if (errorDescription) query.set('error_description', errorDescription)
        router.replace(`/auth/error?${query.toString()}`)
        return
      }

      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      const type = params.get('type')

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          setMessage('링크가 만료되었거나 유효하지 않습니다.')
          router.replace('/auth/error')
          return
        }
        const destination =
          type === 'invite' ||
          type === 'recovery' ||
          type === 'magiclink' ||
          next === '/auth/set-password'
            ? next
            : next
        router.replace(destination)
        return
      }

      const code = searchParams.get('code')
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setMessage('링크가 만료되었거나 유효하지 않습니다.')
          router.replace('/auth/error')
          return
        }
        router.replace(next)
        return
      }

      setMessage('링크를 처리할 수 없습니다.')
      router.replace('/auth/error')
    }

    void handleCallback()
  }, [router, searchParams])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
