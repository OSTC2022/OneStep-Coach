import { HomeLauncher } from '@/components/brand/home-launcher'
import { resolveHomeDestination } from '@/lib/home-destination'

export default async function Home() {
  const redirectTo = await resolveHomeDestination()
  return <HomeLauncher redirectTo={redirectTo} />
}
