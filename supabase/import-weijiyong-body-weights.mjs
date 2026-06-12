import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const envPath = resolve(process.cwd(), '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq === -1) continue
  const key = trimmed.slice(0, eq).trim()
  let value = trimmed.slice(eq + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = value
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const MEMBER_NAME = '위지용'

const WEIGHTS = [
  ['2022-11-02', 33.0],
  ['2022-11-03', 32.3],
  ['2022-11-07', 33.0],
  ['2022-11-16', 32.8],
  ['2022-11-17', 33.0],
  ['2022-11-24', 33.0],
  ['2022-12-07', 33.8],
  ['2022-12-14', 33.1],
  ['2022-12-21', 33.7],
  ['2022-12-30', 33.7],
  ['2023-01-27', 35.0],
  ['2023-02-02', 35.4],
  ['2023-02-10', 35.5],
  ['2023-03-23', 34.8],
  ['2023-03-30', 35.0],
  ['2023-04-06', 35.4],
  ['2023-04-13', 35.7],
  ['2023-05-11', 35.4],
  ['2023-05-17', 36.0],
  ['2023-05-25', 35.2],
  ['2023-06-19', 35.5],
  ['2023-07-10', 35.9],
  ['2023-07-18', 36.1],
  ['2023-09-23', 37.8],
  ['2023-10-07', 38.5],
  ['2023-11-20', 38.4],
  ['2023-12-12', 38.3],
  ['2023-12-29', 38.6],
  ['2024-01-18', 38.3],
  ['2024-02-01', 38.9],
  ['2024-02-13', 38.9],
  ['2024-02-15', 45.9],
  ['2024-02-22', 46.0],
  ['2024-04-15', 40.0],
  ['2024-05-16', 47.7],
  ['2024-07-11', 48.9],
  ['2024-08-12', 48.8],
  ['2024-10-18', 50.6],
  ['2024-11-01', 50.7],
  ['2024-11-16', 50.3],
  ['2026-01-10', 50.5],
  ['2026-02-06', 50.5],
  ['2026-02-20', 50.6],
  ['2026-03-07', 50.4],
  ['2026-05-10', 50.7],
  ['2026-06-08', 52.0],
]

const { data: members, error: memberError } = await supabase
  .from('members')
  .select('id, name, height_cm')
  .eq('name', MEMBER_NAME)
  .is('deleted_at', null)

if (memberError) {
  console.error('Member lookup failed:', memberError.message)
  process.exit(1)
}

if (!members?.length) {
  console.error(`회원 "${MEMBER_NAME}"을(를) 찾을 수 없습니다.`)
  process.exit(1)
}

if (members.length > 1) {
  console.error(`회원 "${MEMBER_NAME}"이(가) ${members.length}명 있습니다. ID를 확인해주세요.`)
  for (const m of members) console.error(`  - ${m.id}`)
  process.exit(1)
}

const member = members[0]
console.log(`회원: ${member.name} (${member.id}), 키 ${member.height_cm ?? '미설정'}cm`)

let inserted = 0
let updated = 0
let failed = 0

for (const [recordedAt, weightKg] of WEIGHTS) {
  const { data: existing } = await supabase
    .from('member_body_records')
    .select('id')
    .eq('member_id', member.id)
    .eq('recorded_at', recordedAt)
    .maybeSingle()

  if (existing?.id) {
    const { error } = await supabase
      .from('member_body_records')
      .update({ weight_kg: weightKg })
      .eq('id', existing.id)

    if (error) {
      console.error(`UPDATE ${recordedAt}:`, error.message)
      failed++
    } else {
      updated++
    }
  } else {
    const { error } = await supabase.from('member_body_records').insert({
      member_id: member.id,
      recorded_at: recordedAt,
      weight_kg: weightKg,
      height_cm: member.height_cm,
      note: '과거 체중 일괄 입력',
    })

    if (error) {
      console.error(`INSERT ${recordedAt}:`, error.message)
      failed++
    } else {
      inserted++
    }
  }
}

console.log(`완료: 신규 ${inserted}건, 갱신 ${updated}건, 실패 ${failed}건 (총 ${WEIGHTS.length}건)`)
