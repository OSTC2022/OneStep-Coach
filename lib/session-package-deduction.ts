import { isPackageUsableForLesson } from '@/lib/session-package-utils'

export type SessionPackageDeductionCandidate = {
  id: string
  remaining_sessions: number
  note?: string | null
  expires_at?: string | null
  is_active: boolean
  created_at: string
  paid_at?: string | null
  deleted_at?: string | null
}

/** 등록(생성) 순 → 결제일 순 */
export function compareSessionPackagesForDeduction(
  a: Pick<SessionPackageDeductionCandidate, 'created_at' | 'paid_at'>,
  b: Pick<SessionPackageDeductionCandidate, 'created_at' | 'paid_at'>,
): number {
  const created = a.created_at.localeCompare(b.created_at)
  if (created !== 0) return created
  return (a.paid_at ?? '').localeCompare(b.paid_at ?? '')
}

/** 가장 먼저 등록한 사용 가능 수업권부터 차감. 모두 소진 시 최초 등록 수업권에 초과 반영 */
export function pickSessionPackageIdForDeduction(
  packages: SessionPackageDeductionCandidate[],
): string | null {
  const eligible = packages
    .filter((pkg) => !pkg.deleted_at)
    .sort(compareSessionPackagesForDeduction)

  if (eligible.length === 0) return null

  const usable = eligible.find((pkg) => isPackageUsableForLesson(pkg))
  if (usable) return usable.id

  return eligible[0]?.id ?? null
}

export function pickSessionPackageForDeduction<T extends SessionPackageDeductionCandidate>(
  packages: T[],
): T | null {
  const id = pickSessionPackageIdForDeduction(packages)
  if (!id) return null
  return packages.find((pkg) => pkg.id === id) ?? null
}
