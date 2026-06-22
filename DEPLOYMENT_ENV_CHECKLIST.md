# Deployment Environment Checklist

운영 프로젝트: **one-step-coach-hlbv**  
운영 URL: **https://one-step-coach-hlbv.vercel.app**

로컬과 Vercel Production에서 동일하게 동작하려면 아래 환경 변수와 DB 마이그레이션을 설정하세요.

---

## 1-A. AI/OCR 환경변수 — `.env.local` ↔ 코드 ↔ Vercel

| `.env.local` / Vercel 변수명 | 코드 참조 (`process.env`) | 로컬 값 | Production 값 |
|------------------------------|---------------------------|---------|-----------------|
| `OPENAI_API_KEY` | `OPENAI_API_KEY` | `sk-...` | Vercel Production에 등록 (서버 전용) |
| `OPENAI_VISION_MODEL` | `OPENAI_VISION_MODEL` | (선택) `gpt-4o-mini` | (선택) 기본 `gpt-4o-mini` |
| `SCREENSHOT_AI_TIMEOUT_MS` | `SCREENSHOT_AI_TIMEOUT_MS` | (선택) 25000 | Hobby: 8000, Pro: 20000+ |
| `NEXT_PUBLIC_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | 동일 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key | 동일 |
| `SUPABASE_SERVICE_ROLE_KEY` | `SUPABASE_SERVICE_ROLE_KEY` | service role | 동일 (서버 전용) |
| `NEXT_PUBLIC_SITE_URL` | `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `https://one-step-coach-hlbv.vercel.app` |
| `ENABLE_OPENAI_ENV_DEBUG` | `ENABLE_OPENAI_ENV_DEBUG` | (선택) | 키 확인 시만 `true` |

**OCR(Tesseract)는 별도 API 키 없음** — 로컬에서만 fallback으로 동작. Vercel에서는 `OPENAI_API_KEY` 필수.

**스크린샷 분석 API:** `POST /api/running-league/analyze-screenshot` (상대경로, localhost 하드코딩 없음)

---

## 1. Vercel Environment Variables (Production 필수)

Vercel Dashboard → Project **one-step-coach-hlbv** → Settings → Environment Variables

| 변수 | 필수 | 노출 | 용도 |
|------|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | 브라우저 | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | 브라우저 | 로그인·RLS 클라이언트 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 서버만 | 회원 연동·러닝리그 저장·백업 |
| `NEXT_PUBLIC_SITE_URL` | ✅ | 브라우저 | 초대/비밀번호 재설정 링크 |
| `OPENAI_API_KEY` | ✅* | 서버만 | 러닝 스크린샷 AI 분석 (Vercel에서 OCR 불가) |

\* 스크린샷 자동 인식을 쓰지 않으면 선택. 운영에서 인식이 필요하면 **필수**.

### 권장 (기능별)

| 변수 | 기능 |
|------|------|
| `OPENAI_VISION_MODEL` | Vision 모델 (기본 `gpt-4o-mini`) |
| `SCREENSHOT_AI_TIMEOUT_MS` | Pro 플랜에서 AI 타임아웃(ms). Hobby는 8000 권장 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | 비밀번호 재설정 메일 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Calendar 연동 |
| `GOOGLE_CALENDAR_WEBHOOK_SECRET` | 캘린더 웹훅 검증 |
| `CRON_SECRET` 또는 `MEMBER_BACKUP_CRON_SECRET` | Cron 백업 인증 |
| `ENABLE_OPENAI_ENV_DEBUG` | `true` 시 관리자 디버그 API (확인 후 삭제) |

### 로컬 `.env.local` 예시

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
OPENAI_API_KEY=sk-...
```

### Production 예시

```env
NEXT_PUBLIC_SITE_URL=https://one-step-coach-hlbv.vercel.app
```

`NEXT_PUBLIC_SITE_URL`이 없으면 Production에서는 코드 fallback으로 위 URL을 사용합니다.

---

## 2. Supabase SQL (러닝 포털)

`/dashboard/my` 러닝 마일리지·PB·스크린샷 저장을 위해 Supabase SQL Editor에서 실행:

1. `supabase/expand-running-league-schema.sql`
2. `supabase/add-running-league-mileage-extraction.sql` (스크린샷 확장 필드·스토리지)

테이블이 없으면 UI에 **「DB 설정이 필요합니다」** 가 표시되고 저장이 되지 않습니다.

---

## 3. localStorage 사용 범위 (데이터 저장 아님)

다음은 **UI 캐시·개인 설정**만 localStorage/sessionStorage 사용합니다.

| 파일 | 용도 |
|------|------|
| `lib/dashboard-menu-order.ts` | 메뉴 순서 |
| `lib/dashboard-quick-links.ts` | 빠른 링크 |
| `lib/member-recent-search.ts` | 최근 검색 |
| `lib/calendar-panel-split.ts` | 캘린더 패널 너비 |
| `lib/center-board-storage.ts` | 게시판 읽음 표시 |
| `lib/member-body-period-settings.ts` | 체성분 기간 UI |
| `lib/food-quick-input-storage.ts` | 식단 빠른 입력 |
| `lib/member-detail-sync.ts` | 회원 편집 임시 동기화 (sessionStorage) |

**러닝 마일리지·PB·스크린샷 메타데이터는 Supabase에 저장** (`lib/actions/running-league.ts`).

---

## 4. API Route 환경 변수 의존성

| Route | 필요 env | env 없을 때 |
|-------|-----------|-------------|
| `POST /api/running-league/analyze-screenshot` | `NEXT_PUBLIC_SUPABASE_*`, `OPENAI_API_KEY` | 503 또는 AI 빈 결과 |
| `POST /api/auth/signup` | `SUPABASE_SERVICE_ROLE_KEY` | 가입 실패 |
| `POST /api/admin/member-backup` | `SUPABASE_SERVICE_ROLE_KEY`, Google OAuth | 500 |
| `GET/POST /api/cron/member-backup` | `CRON_SECRET`, service role | 401 |
| `GET /api/cron/google-calendar-sync` | `CRON_SECRET`, Google OAuth | 401 |
| `GET /api/admin/debug/openai-env` | `ENABLE_OPENAI_ENV_DEBUG=true`, 관리자 세션 | 404 |

---

## 5. 배포 후 검증 순서

1. **로그인** — `https://one-step-coach-hlbv.vercel.app/auth/login`
2. **마이페이지** — `/dashboard/my` (성인 회원 + 회원 프로필 연동)
3. **스크린샷 분석** — 러닝 기록 추가 → 이미지 첨부 → 값 자동 입력
4. **저장** — 마일리지·PB 저장 후 새로고침 시 유지 확인
5. **Vercel Logs** — `ai_status: success`, `openai_configured: true`

### OpenAI 키 확인 (임시)

1. Vercel에 `ENABLE_OPENAI_ENV_DEBUG=true` (Production)
2. 관리자 로그인 후 `GET /api/admin/debug/openai-env`
3. `hasOpenAIKey: true` 확인 후 env·route 삭제

---

## 6. 로컬 vs 운영 차이

| 항목 | 로컬 | Vercel |
|------|------|--------|
| OCR (Tesseract) | ✅ fallback | ❌ 미지원 |
| OpenAI Vision | ✅ | ✅ (필수) |
| 함수 시간 제한 | 없음 | Hobby ~10s / Pro 최대 60s |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `https://one-step-coach-hlbv.vercel.app` |

---

## 7. 빌드·검증 명령

```bash
npm run build
npm run lint
npm run type-check
```

배포 전 위 세 명령이 통과하는지 확인하세요.
