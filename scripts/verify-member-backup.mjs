import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()

const sourceRoots = [
  'lib/member-backup',
  'app/api/admin/member-backup',
  'app/api/cron/member-backup',
  'components/settings/member-backup-panel.tsx',
  'components/dashboard/member-backup-header-menu.tsx',
]

function listFiles(target) {
  const abs = join(root, target)
  if (!statSync(abs).isDirectory()) return [abs]
  const out = []
  for (const entry of readdirSync(abs)) {
    const full = join(abs, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...listFiles(relative(root, full)))
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) out.push(full)
  }
  return out
}

const forbidden = ['@/lib/supabase/admin']
const offenders = []

for (const target of sourceRoots) {
  for (const file of listFiles(target)) {
    const text = readFileSync(file, 'utf8')
    for (const token of forbidden) {
      if (text.includes(token)) {
        offenders.push(`${relative(root, file)} (${token})`)
      }
    }
  }
}

if (offenders.length > 0) {
  console.error('[verify-member-backup] backup chain must stay isolated:', offenders.join(', '))
  process.exit(1)
}

console.log('[verify-member-backup] OK — backup chain isolated from shared admin module')
