'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, X } from 'lucide-react'
import type { Instructor } from '@/lib/types'

interface MemberFiltersProps {
  instructors: Instructor[]
}

export function MemberFilters({ instructors }: MemberFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  const currentSearch = searchParams.get('search') || ''
  const currentActive = searchParams.get('active') || ''
  const currentInstructor = searchParams.get('instructor') || ''

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.delete('page') // Reset to first page when filtering
    router.push(`?${params.toString()}`)
  }

  function clearFilters() {
    router.push('/dashboard/members')
  }

  const hasFilters = currentSearch || currentActive || currentInstructor

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="이름 또는 전화번호로 검색..."
          defaultValue={currentSearch}
          onChange={(e) => {
            const value = e.target.value
            // Debounce search
            const timeout = setTimeout(() => {
              updateFilter('search', value)
            }, 300)
            return () => clearTimeout(timeout)
          }}
          className="pl-9 bg-input border-border"
        />
      </div>

      <Select value={currentActive} onValueChange={(value) => updateFilter('active', value)}>
        <SelectTrigger className="w-full sm:w-[150px] bg-input border-border">
          <SelectValue placeholder="상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체</SelectItem>
          <SelectItem value="true">활성</SelectItem>
          <SelectItem value="false">비활성</SelectItem>
        </SelectContent>
      </Select>

      <Select value={currentInstructor} onValueChange={(value) => updateFilter('instructor', value)}>
        <SelectTrigger className="w-full sm:w-[180px] bg-input border-border">
          <SelectValue placeholder="담당 강사" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">전체 강사</SelectItem>
          {instructors.map((instructor) => (
            <SelectItem key={instructor.id} value={instructor.id}>
              {instructor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {hasFilters && (
        <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground">
          <X className="mr-2 h-4 w-4" />
          초기화
        </Button>
      )}
    </div>
  )
}
