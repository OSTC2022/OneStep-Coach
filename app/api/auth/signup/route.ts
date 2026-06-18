import { signUpPublic } from '@/lib/actions/auth-registration'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const result = await signUpPublic(null, formData)
    return Response.json(result)
  } catch (error) {
    console.error('[api/auth/signup]', error)
    return Response.json(
      { error: '가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 },
    )
  }
}
