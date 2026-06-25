import { Eye } from 'lucide-react'

export function AdultRunningPortalSettingsBanner() {
  return (
    <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-200">
        <Eye className="h-4 w-4" />
        성인회원 러닝 포털 미리보기
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        성인 회원이 마이페이지에서 보는 러닝 포털 화면입니다. 기록 입력·참여 투표는 회원 본인만
        가능합니다.
      </p>
    </div>
  )
}
