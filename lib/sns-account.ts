export type VisibleSnsAccount = {
  name: string
  kakaoId: string | null
  instagramId: string | null
  blogUrl: string | null
}

export function toVisibleSnsAccount(
  name: string,
  fields?: {
    kakaoId?: string | null
    instagramId?: string | null
    blogUrl?: string | null
  },
): VisibleSnsAccount {
  return {
    name,
    kakaoId: fields?.kakaoId?.trim() || null,
    instagramId: fields?.instagramId?.trim() || null,
    blogUrl: fields?.blogUrl?.trim() || null,
  }
}
