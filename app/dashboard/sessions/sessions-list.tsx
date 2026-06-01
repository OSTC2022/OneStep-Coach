'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Search, CreditCard, AlertTriangle, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { KoreanDatePicker } from '@/components/ui/korean-date-picker'
import { getPresetPrice } from '@/lib/session-package-utils'

interface SessionPackage {
  id: string
  member_id: string
  total_sessions: number
  remaining_sessions: number
  price: number | null
  paid_at: string | null
  expires_at: string | null
  payment_method: string | null
  note: string | null
  is_active: boolean
  created_at: string
  member: { id: string; name: string; phone: string | null } | null
}

interface SessionsListProps {
  initialPackages: SessionPackage[]
  members: { id: string; name: string }[]
  selectedMemberId?: string
}

export function SessionsList({ initialPackages, members, selectedMemberId }: SessionsListProps) {
  const [packages, setPackages] = useState(initialPackages)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(!!selectedMemberId)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const [formData, setFormData] = useState({
    member_id: selectedMemberId || '',
    total_sessions: 10,
    price: 0,
    paid_at: new Date().toISOString().split('T')[0],
    expires_at: '',
    payment_method: '카드',
    note: '',
  })

  const filteredPackages = packages.filter((pkg) => {
    const matchesSearch = pkg.member?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pkg.member?.phone?.includes(searchTerm)
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && pkg.is_active && pkg.remaining_sessions > 0) ||
      (statusFilter === 'inactive' && (!pkg.is_active || pkg.remaining_sessions === 0))
    
    return matchesSearch && matchesStatus
  })

  // Stats
  const totalActivePackages = packages.filter(p => p.is_active && p.remaining_sessions > 0).length
  const lowSessionPackages = packages.filter(p => p.is_active && p.remaining_sessions > 0 && p.remaining_sessions <= 3).length
  const totalRevenue = packages.reduce((sum, p) => sum + (p.price || 0), 0)

  const handleAddPackage = async () => {
    if (!formData.member_id || formData.total_sessions <= 0) {
      toast.error('회원과 수업 횟수를 입력해주세요.')
      return
    }
    
    setIsLoading(true)
    const supabase = createClient()
    
    // Calculate expiry date (3 months from now if not specified)
    const expiresAt = formData.expires_at || 
      new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('session_packages')
      .insert({
        member_id: formData.member_id,
        total_sessions: formData.total_sessions,
        remaining_sessions: formData.total_sessions,
        price: formData.price || null,
        paid_at: formData.paid_at || null,
        expires_at: expiresAt,
        payment_method: formData.payment_method || null,
        note: formData.note || null,
        is_active: true,
      })
      .select(`
        *,
        member:members(id, name, phone)
      `)
      .single()

    if (error) {
      toast.error('수업권 등록 실패', { description: error.message })
    } else if (data) {
      toast.success('수업권이 등록되었습니다.')
      setPackages([data, ...packages])
      setFormData({
        member_id: '',
        total_sessions: 10,
        price: 0,
        paid_at: new Date().toISOString().split('T')[0],
        expires_at: '',
        payment_method: '카드',
        note: '',
      })
      setIsAddDialogOpen(false)
    }
    
    setIsLoading(false)
    router.refresh()
  }

  const handleToggleStatus = async (packageId: string, isActive: boolean) => {
    const nextActive = !isActive
    const message = nextActive
      ? '이 수업권을 활성화하시겠습니까?'
      : '이 수업권을 비활성화하시겠습니까?'
    if (!confirm(message)) return

    const supabase = createClient()
    const { error } = await supabase
      .from('session_packages')
      .update({ is_active: nextActive })
      .eq('id', packageId)

    if (error) {
      toast.error(nextActive ? '활성화 실패' : '비활성화 실패', { description: error.message })
    } else {
      toast.success(nextActive ? '수업권이 활성화되었습니다.' : '수업권이 비활성화되었습니다.')
      setPackages(packages.map(p => p.id === packageId ? { ...p, is_active: nextActive } : p))
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">활성 수업권</CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalActivePackages}</div>
            <p className="text-xs text-muted-foreground">전체 {packages.length}개</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">만료 임박</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{lowSessionPackages}</div>
            <p className="text-xs text-muted-foreground">3회 이하 남음</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 결제액</CardTitle>
            <TrendingUp className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(totalRevenue / 10000).toFixed(0)}만원</div>
            <p className="text-xs text-muted-foreground">누적 금액</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="회원명, 연락처 검색..."
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
              <SelectItem value="inactive">완료/비활성</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              수업권 등록
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>수업권 등록</DialogTitle>
              <DialogDescription>
                회원의 새 수업권을 등록합니다.
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="member">회원 선택 *</Label>
                <Select
                  value={formData.member_id}
                  onValueChange={(v) => setFormData({ ...formData, member_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="회원 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total_sessions">수업 횟수 *</Label>
                  <Select
                    value={formData.total_sessions.toString()}
                    onValueChange={(v) => {
                      const total_sessions = parseInt(v)
                      const presetPrice = getPresetPrice(total_sessions, formData.payment_method)
                      setFormData({
                        ...formData,
                        total_sessions,
                        ...(presetPrice != null ? { price: presetPrice } : {}),
                      })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="8">8회</SelectItem>
                      <SelectItem value="5">5회</SelectItem>
                      <SelectItem value="10">10회</SelectItem>
                      <SelectItem value="20">20회</SelectItem>
                      <SelectItem value="30">30회</SelectItem>
                      <SelectItem value="50">50회</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price">결제 금액 (원)</Label>
                  <Input
                    id="price"
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: parseInt(e.target.value) || 0 })}
                    placeholder="500000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paid_at">결제일</Label>
                  <KoreanDatePicker
                    id="paid_at"
                    value={formData.paid_at}
                    onChange={(paid_at) => setFormData({ ...formData, paid_at })}
                    placeholder="결제일 선택"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expires_at">만료일</Label>
                  <KoreanDatePicker
                    id="expires_at"
                    value={formData.expires_at}
                    onChange={(expires_at) => setFormData({ ...formData, expires_at })}
                    placeholder="만료일 선택"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment_method">결제 방법</Label>
                <Select
                  value={formData.payment_method}
                  onValueChange={(v) => {
                    const presetPrice = getPresetPrice(formData.total_sessions, v)
                    setFormData({
                      ...formData,
                      payment_method: v,
                      ...(presetPrice != null ? { price: presetPrice } : {}),
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="카드">카드</SelectItem>
                    <SelectItem value="현금">현금</SelectItem>
                    <SelectItem value="계좌이체">계좌이체</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="note">메모</Label>
                <Textarea
                  id="note"
                  value={formData.note}
                  onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                  placeholder="특이사항"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleAddPackage} disabled={isLoading}>
                {isLoading ? '등록 중...' : '등록'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>회원</TableHead>
              <TableHead>수업권</TableHead>
              <TableHead className="hidden sm:table-cell">잔여/전체</TableHead>
              <TableHead className="hidden md:table-cell">결제액</TableHead>
              <TableHead className="hidden lg:table-cell">만료일</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPackages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  등록된 수업권이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredPackages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <div>
                      {pkg.member_id ? (
                        <Link
                          href={`/dashboard/members/${pkg.member_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {pkg.member?.name}
                        </Link>
                      ) : (
                        <p className="font-medium">{pkg.member?.name}</p>
                      )}
                      <p className="text-sm text-muted-foreground">{pkg.member?.phone}</p>
                    </div>
                  </TableCell>
                  <TableCell>{pkg.total_sessions}회권</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${
                        pkg.remaining_sessions <= 3 ? 'text-warning' : 
                        pkg.remaining_sessions === 0 ? 'text-destructive' : 'text-primary'
                      }`}>
                        {pkg.remaining_sessions}
                      </span>
                      <span className="text-muted-foreground">/ {pkg.total_sessions}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {pkg.price ? `${pkg.price.toLocaleString()}원` : '-'}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {pkg.expires_at || '-'}
                  </TableCell>
                  <TableCell>
                    {pkg.remaining_sessions === 0 ? (
                      <Badge variant="secondary">완료</Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(pkg.id, pkg.is_active)}
                        className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {pkg.is_active ? (
                          <Badge className="cursor-pointer bg-success text-success-foreground hover:opacity-80">
                            활성
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="cursor-pointer hover:opacity-80">
                            비활성
                          </Badge>
                        )}
                      </button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {pkg.remaining_sessions > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleStatus(pkg.id, pkg.is_active)}
                      >
                        {pkg.is_active ? '비활성화' : '활성화'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
