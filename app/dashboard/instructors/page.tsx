import { createClient } from '@/lib/supabase/server'
import { InstructorManagement } from './instructor-management'

export default async function InstructorsPage() {
  const supabase = await createClient()
  
  const { data: instructors } = await supabase
    .from('instructors')
    .select('*')
    .order('name')

  return (
    <div className="space-y-6 pt-12 lg:pt-0">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold">강사 관리</h1>
        <p className="text-muted-foreground mt-1">
          강사를 등록하고 강사료를 관리합니다.
        </p>
      </div>
      
      <InstructorManagement instructors={instructors || []} />
    </div>
  )
}
