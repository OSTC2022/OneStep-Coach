import dynamic from 'next/dynamic'
import { getLessonRegistrationPageData } from '@/lib/actions/lesson-registration-page'
import { StatCardsSkeleton } from '@/components/dashboard/page-skeletons'

const LessonRegistration = dynamic(
  () =>
    import('./lesson-registration').then((mod) => ({
      default: mod.LessonRegistration,
    })),
  { loading: () => <StatCardsSkeleton count={3} /> },
)

export default async function LessonsPage() {
  const { members, instructors, recentWeekLessons } =
    await getLessonRegistrationPageData()

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">수업 등록</h1>
        <p className="text-muted-foreground mt-1">
          수업을 등록하고 서명을 받습니다.
        </p>
      </div>

      <LessonRegistration
        members={members}
        instructors={instructors}
        recentWeekLessons={recentWeekLessons}
      />
    </div>
  )
}
