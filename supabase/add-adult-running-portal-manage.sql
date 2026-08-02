-- 러닝 포털 관리(월별 출석·룰렛) 권한 — 관리자 또는 관리자가 허용한 강사
alter table public.profiles
  add column if not exists adult_running_portal_manage boolean not null default false;

comment on column public.profiles.adult_running_portal_manage is
  'true면 승인된 강사도 러닝 포털 관리 페이지(월별 출석왕·룰렛) 접근 가능';
