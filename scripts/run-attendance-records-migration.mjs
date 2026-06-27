/**
 * attendance_records 테이블 생성 SQL을 Supabase에 적용할 수 있는지 확인하고,
 * 없으면 SQL 파일 경로를 안내합니다.
 *
 * DDL은 Supabase JS로 실행할 수 없으므로, SQL Editor 수동 실행이 필요합니다.
 */

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8')
    for (const line of text.split('\n')) {
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
  } catch {
    // optional
  }
}

loadEnvFile('.env.local')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing Supabase env in .env.local')
  process.exit(1)
}

const supabase = createClient(url, key)

const { error } = await supabase.from('attendance_records').select('id').limit(1)

if (!error) {
  console.log('OK: attendance_records table already exists')
  process.exit(0)
}

console.log('attendance_records table is missing.')
console.log('')
console.log('Please run this file in Supabase Dashboard → SQL Editor:')
console.log('  supabase/add-attendance-records.sql')
console.log('')
console.log('Then verify with:')
console.log('  node scripts/debug-attendance-db.mjs 이현 2026-06-27')
console.log('')
console.log('Error from Supabase:', error.message)
