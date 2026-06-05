import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string
    error_code?: string
    error_description?: string
  }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
          <svg 
            className="w-8 h-8 text-destructive" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">인증 오류</h1>
        <p className="text-muted-foreground">
          {params.error_code === 'otp_expired'
            ? '링크가 만료되었거나 이미 사용되었습니다. 로그인 화면에서 비밀번호 찾기로 새 링크를 받아주세요.'
            : params.error_description || params.error || '인증 중 오류가 발생했습니다.'}
        </p>
        <a 
          href="/auth/login" 
          className="inline-block px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          로그인 페이지로 돌아가기
        </a>
      </div>
    </div>
  )
}
