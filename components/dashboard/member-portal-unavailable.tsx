import { UserRound } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface MemberPortalUnavailableProps {
  userName?: string | null
}

export function MemberPortalUnavailable({
  userName,
}: MemberPortalUnavailableProps) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-12">
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <UserRound className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>마이페이지를 불러올 수 없습니다</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-center text-sm text-muted-foreground">
          {userName ? (
            <p>
              <span className="font-medium text-foreground">{userName}</span> 님
              계정은 로그인되었지만, 센터 회원 프로필과 연결되지 않았습니다.
            </p>
          ) : (
            <p>계정은 로그인되었지만, 센터 회원 프로필과 연결되지 않았습니다.</p>
          )}
          <p>
            센터 관리자에게 <strong className="text-foreground">설정 → 가입 승인</strong>
            또는 <strong className="text-foreground">가입 계정</strong>에서 회원 연동을
            요청해주세요.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
