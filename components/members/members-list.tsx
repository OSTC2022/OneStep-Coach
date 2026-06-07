'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Member } from '@/lib/types'
import {
  formatMemberContactDisplay,
  formatPrimaryInstructorName,
  resolveMemberBmi,
} from '@/lib/member-utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { 
  MoreHorizontal, 
  Eye, 
  Edit, 
  UserX, 
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Search,
  Phone,
} from 'lucide-react'
import { toggleMemberStatus } from '@/lib/actions/members'
import { toast } from 'sonner'
import Link from 'next/link'

interface MembersListProps {
  members: Member[]
  currentPage: number
  totalPages: number
}

export function MembersList({ members, currentPage, totalPages }: MembersListProps) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')

  const filteredMembers = members.filter(member => 
    member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.phone?.includes(searchQuery)
  )

  async function handleToggleStatus(id: string, currentStatus: boolean) {
    const result = await toggleMemberStatus(id, !currentStatus)
    if (result.error) {
      toast.error('상태 변경 실패', { description: result.error })
    } else {
      toast.success(currentStatus ? '회원이 비활성화되었습니다.' : '회원이 활성화되었습니다.')
      router.refresh()
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-0">
        {/* Mobile Search */}
        <div className="p-4 border-b border-border md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="이름 또는 전화번호로 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-input border-border"
            />
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">이름</TableHead>
                <TableHead className="text-muted-foreground">연락처</TableHead>
                <TableHead className="text-muted-foreground">종목</TableHead>
                <TableHead className="text-muted-foreground">담당강사</TableHead>
                <TableHead className="text-muted-foreground">BMI</TableHead>
                <TableHead className="text-muted-foreground">상태</TableHead>
                <TableHead className="text-muted-foreground w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    등록된 회원이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                filteredMembers.map((member) => (
                  <TableRow key={member.id} className="border-border">
                    <TableCell>
                      <Link 
                        href={`/dashboard/members/${member.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {member.name}
                      </Link>
                      {member.grade && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({member.grade})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatMemberContactDisplay(member)}
                    </TableCell>
                    <TableCell>
                      {member.sport ? (
                        <Badge variant="secondary" className="bg-primary/10 text-primary">
                          {member.sport}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatPrimaryInstructorName(member.primary_instructor)}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const bmi = resolveMemberBmi(member)
                        if (bmi == null) return '-'
                        return (
                          <span
                            className={`font-mono ${
                              bmi < 18.5
                                ? 'text-chart-2'
                                : bmi < 25
                                  ? 'text-success'
                                  : bmi < 30
                                    ? 'text-warning'
                                    : 'text-destructive'
                            }`}
                          >
                            {bmi.toFixed(1)}
                          </span>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={member.is_active ? 'default' : 'secondary'}
                        className={member.is_active ? 'bg-success text-success-foreground' : ''}
                      >
                        {member.is_active ? '활성' : '비활성'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/members/${member.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              상세보기
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/dashboard/members/${member.id}/edit`}>
                              <Edit className="mr-2 h-4 w-4" />
                              수정
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleToggleStatus(member.id, member.is_active)}
                          >
                            {member.is_active ? (
                              <>
                                <UserX className="mr-2 h-4 w-4" />
                                비활성화
                              </>
                            ) : (
                              <>
                                <UserCheck className="mr-2 h-4 w-4" />
                                활성화
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden divide-y divide-border">
          {filteredMembers.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              등록된 회원이 없습니다.
            </div>
          ) : (
            filteredMembers.map((member) => (
              <Link 
                key={member.id} 
                href={`/dashboard/members/${member.id}`}
                className="block p-4 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{member.name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {member.phone && (
                          <>
                            <Phone className="h-3 w-3" />
                            {member.phone}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge 
                      variant={member.is_active ? 'default' : 'secondary'}
                      className={member.is_active ? 'bg-success text-success-foreground' : ''}
                    >
                      {member.is_active ? '활성' : '비활성'}
                    </Badge>
                    {member.sport && (
                      <p className="text-xs text-muted-foreground mt-1">{member.sport}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t border-border">
            <p className="text-sm text-muted-foreground">
              페이지 {currentPage} / {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => router.push(`?page=${currentPage - 1}`)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => router.push(`?page=${currentPage + 1}`)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
