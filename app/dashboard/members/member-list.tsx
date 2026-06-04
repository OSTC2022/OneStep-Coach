'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createMember, deleteMember, getMembers } from '@/lib/actions/members'
import { LIST_PAGE_SIZE } from '@/lib/list-pagination'
import { formatMemberAge, formatMemberAgeFromBirthDate, AUTO_INSTRUCTOR_ID, formatPrimaryInstructorName } from '@/lib/member-utils'
import { BirthDateInput } from '@/components/members/birth-date-input'
import { SportSelectField } from '@/components/members/sport-select-field'
import { InstructorSelectField } from '@/components/members/instructor-select-field'
import { Member, Instructor, MemberFormData } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Plus, Search, Eye, Edit, Trash2 } from 'lucide-react'

interface MemberListProps {
  initialMembers: (Member & { primary_instructor?: { id: string; name: string } | null })[]
  totalCount: number
  pageSize?: number
  instructors: { id: string; name: string }[]
}

export function MemberList({
  initialMembers,
  totalCount,
  pageSize = LIST_PAGE_SIZE,
  instructors,
}: MemberListProps) {
  const [members, setMembers] = useState(initialMembers)
  const [loadedCount, setLoadedCount] = useState(initialMembers.length)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setMembers(initialMembers)
    setLoadedCount(initialMembers.length)
  }, [initialMembers])

  const hasMore = loadedCount < totalCount

  async function handleLoadMore() {
    if (!hasMore || loadingMore) return
    setLoadingMore(true)
    try {
      const { data } = await getMembers({
        orderBy: 'created_at',
        orderAsc: false,
        limit: pageSize,
        offset: loadedCount,
      })
      if (data.length > 0) {
        setMembers((prev) => {
          const ids = new Set(prev.map((m) => m.id))
          return [...prev, ...data.filter((m) => !ids.has(m.id))]
        })
        setLoadedCount((n) => n + data.length)
      }
    } finally {
      setLoadingMore(false)
    }
  }

  const [formData, setFormData] = useState<MemberFormData>({
    name: '',
    birth_date: '',
    grade: '',
    phone: '',
    parent_phone: '',
    sport: '',
    height_cm: undefined,
    weight_kg: undefined,
    goal: '',
    injury_history: '',
    memo: '',
    primary_instructor_id: AUTO_INSTRUCTOR_ID,
  })

  const filteredMembers = members.filter((member) => {
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.phone?.includes(searchTerm) ||
      member.sport?.toLowerCase().includes(searchTerm.toLowerCase())
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && member.is_active) ||
      (statusFilter === 'inactive' && !member.is_active)
    
    return matchesSearch && matchesStatus
  })

  const handleAddMember = async () => {
    if (!formData.name.trim()) return

    setIsLoading(true)

    const result = await createMember(formData)

    if (result.error) {
      toast.error('회원 등록 실패', { description: result.error })
      setIsLoading(false)
      return
    }

    if (result.data) {
      setMembers([{ ...result.data, primary_instructor: null }, ...members])
      setFormData({
        name: '',
        birth_date: '',
        grade: '',
        phone: '',
        parent_phone: '',
        sport: '',
        height_cm: undefined,
        weight_kg: undefined,
        goal: '',
        injury_history: '',
        memo: '',
        primary_instructor_id: AUTO_INSTRUCTOR_ID,
      })
      setIsAddDialogOpen(false)
      toast.success('새 회원이 등록되었습니다.')
    }

    setIsLoading(false)
    router.refresh()
  }

  const handleDeleteMember = async (memberId: string) => {
    if (!confirm('정말 이 회원을 삭제하시겠습니까?')) return

    const result = await deleteMember(memberId)

    if (result.error) {
      toast.error('삭제 실패', { description: result.error })
      return
    }

    setMembers(members.filter(m => m.id !== memberId))
    toast.success('회원이 삭제되었습니다.')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름, 연락처, 종목 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full sm:w-64"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'inactive')}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="active">활성</SelectItem>
              <SelectItem value="inactive">비활성</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/dashboard/members/new">
              <Plus className="h-4 w-4 mr-2" />
              상세 등록
            </Link>
          </Button>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                빠른 등록
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>새 회원 등록</DialogTitle>
              <DialogDescription>
                새로운 회원 정보를 입력하세요.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">이름 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="홍길동"
                  />
                </div>
                <BirthDateInput
                  id="quick-birth_date"
                  value={formData.birth_date}
                  onChange={(birth_date) => setFormData({ ...formData, birth_date })}
                />
                <div className="space-y-2">
                  <Label>나이 (자동)</Label>
                  <Input
                    value={formatMemberAgeFromBirthDate(formData.birth_date)}
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">연락처</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="010-1234-5678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent_phone">보호자 연락처</Label>
                  <Input
                    id="parent_phone"
                    value={formData.parent_phone}
                    onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
                    placeholder="010-9876-5432"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="grade">학년/직업</Label>
                  <Input
                    id="grade"
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    placeholder="중학교 2학년"
                  />
                </div>
                <SportSelectField
                  id="quick-sport"
                  label="종목"
                  value={formData.sport}
                  onChange={(sport) => setFormData({ ...formData, sport })}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="height_cm">키 (cm)</Label>
                  <Input
                    id="height_cm"
                    type="number"
                    value={formData.height_cm || ''}
                    onChange={(e) => setFormData({ ...formData, height_cm: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="170"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight_kg">몸무게 (kg)</Label>
                  <Input
                    id="weight_kg"
                    type="number"
                    value={formData.weight_kg || ''}
                    onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder="65"
                  />
                </div>
                <div className="space-y-2">
                  <Label>BMI (자동계산)</Label>
                  <Input
                    value={
                      formData.height_cm && formData.weight_kg
                        ? (formData.weight_kg / Math.pow(formData.height_cm / 100, 2)).toFixed(1)
                        : '-'
                    }
                    disabled
                    className="bg-muted"
                  />
                </div>
              </div>

              <InstructorSelectField
                id="instructor"
                value={formData.primary_instructor_id}
                onChange={(primary_instructor_id) =>
                  setFormData({ ...formData, primary_instructor_id })
                }
                instructors={instructors}
              />

              <div className="space-y-2">
                <Label htmlFor="goal">운동 목표</Label>
                <Input
                  id="goal"
                  value={formData.goal}
                  onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                  placeholder="체력 향상, 대회 준비 등"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="injury_history">부상 이력</Label>
                <Input
                  id="injury_history"
                  value={formData.injury_history}
                  onChange={(e) => setFormData({ ...formData, injury_history: e.target.value })}
                  placeholder="좌측 발목 인대 손상 (2023년)"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="memo">메모</Label>
                <Input
                  id="memo"
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  placeholder="특이사항"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddMember} disabled={isLoading || !formData.name.trim()}>
                {isLoading ? '등록 중...' : '등록'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>전체 {members.length}명</span>
        <span>검색 결과 {filteredMembers.length}명</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead className="hidden sm:table-cell">나이</TableHead>
              <TableHead className="hidden md:table-cell">연락처</TableHead>
              <TableHead className="hidden lg:table-cell">종목</TableHead>
              <TableHead className="hidden lg:table-cell">담당 강사</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <p>
                      {searchTerm || statusFilter !== 'all'
                        ? '검색 결과가 없습니다.'
                        : '등록된 회원이 없습니다.'}
                    </p>
                    {!searchTerm && statusFilter === 'all' && (
                      <Button asChild>
                        <Link href="/dashboard/members/new">
                          <Plus className="h-4 w-4 mr-2" />
                          첫 회원 추가하기
                        </Link>
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {formatMemberAge(member)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {member.phone || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {member.sport || '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatPrimaryInstructorName(member.primary_instructor)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.is_active ? 'default' : 'secondary'}>
                      {member.is_active ? '활성' : '비활성'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/dashboard/members/${member.id}`}>
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/dashboard/members/${member.id}/edit`}>
                        <Button variant="ghost" size="icon">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleDeleteMember(member.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {hasMore && !searchTerm && statusFilter === 'all' && (
        <div className="flex justify-center pt-2">
          <Button
            type="button"
            variant="outline"
            disabled={loadingMore}
            onClick={() => void handleLoadMore()}
          >
            {loadingMore ? '불러오는 중…' : `더보기 (${loadedCount}/${totalCount})`}
          </Button>
        </div>
      )}
    </div>
  )
}
