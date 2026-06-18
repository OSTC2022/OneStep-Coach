import { executePublicSignup } from '@/lib/auth/public-signup'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const result = await executePublicSignup(formData)
    if (result.error) {
      return Response.json(result, { status: 400 })
    }
    return Response.json(result)
  } catch (error) {
    console.error('[api/auth/signup]', error)
    const message =
      error instanceof Error ? error.message : 'Unknown signup error'
    return Response.json(
      {
        error: '가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
        ...(process.env.NODE_ENV === 'development' ? { detail: message } : {}),
      },
      { status: 500 },
    )
  }
}
