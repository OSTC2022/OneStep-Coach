const fs = require('fs')

const html = new TextDecoder('euc-kr').decode(
  fs.readFileSync(process.env.TEMP + '/roadrun-2026.html'),
)

const REGION_MAP = {
  서울: '서울',
  경기: '경기',
  인천: '인천',
  강원: '강원',
  충북: '충북',
  충남: '충남',
  대전: '대전',
  세종: '세종',
  전북: '전북',
  전남: '전남',
  광주: '광주',
  경북: '경북',
  대구: '대구',
  경남: '경남',
  부산: '부산',
  울산: '울산',
  제주: '제주',
  해외: '해외',
}

function guessRegion(location) {
  const loc = location.replace(/\s+/g, '')
  for (const [key, region] of Object.entries(REGION_MAP)) {
    if (loc.includes(key)) return region
  }
  if (/잠실|광화문|여의도|상암|한강|올림픽|서울광장|뚝섬|암사|양재|목동|신정교|월드컵공원/.test(loc))
    return '서울'
  if (/일산|수원|성남|용인|고양|화성|파주|김포|부천|안양|킨텍스|분당/.test(loc)) return '경기'
  if (/부산|기장|광안|해운대|을숙도|태종대|스포원/.test(loc)) return '부산'
  if (/대구|신천/.test(loc)) return '대구'
  if (/인천|강화/.test(loc)) return '인천'
  if (/춘천|강릉|속초|평창|대관령|철원|양양|태백/.test(loc)) return '강원'
  if (/제주|한라/.test(loc)) return '제주'
  if (/공주|천안|아산/.test(loc)) return '충남'
  if (/청주|단양|증평|충주/.test(loc)) return '충북'
  if (/대전|엑스포/.test(loc)) return '대전'
  if (/세종/.test(loc)) return '세종'
  if (/경주|청도|청송|울진|포항|안동/.test(loc)) return '경북'
  if (/전주|익산|군산|장수/.test(loc)) return '전북'
  if (/여수|순천|해남|남원/.test(loc)) return '전남'
  if (/광주/.test(loc)) return '광주'
  if (/창원|양산|진주/.test(loc)) return '경남'
  if (/울산|태화/.test(loc)) return '울산'
  return ''
}

const FEATURED = [
  '서울마라톤',
  '동아마라톤',
  'jtbc',
  '춘천마라톤',
  '대구국제',
  '경주 벚꽃',
  '경주벚꽃',
  '경주 국제',
  '경주국제',
  '손기정',
  '부산국제',
  '조선일보',
  '서울하프',
  '공주백제',
  '공주마라톤',
  '인천국제',
  '제주MBC',
  '월드마스터즈',
  '한경서울',
  '서울오픈',
  '대구세계마스터즈',
]

const rowRe =
  /<tr>\s*<td[^>]*>\s*<div align="center"><b><font[^>]*>(\d{1,2})\/(\d{1,2})<\/font><\/b><br><font[^>]*>\((.)\)<\/font>([\s\S]*?)<\/div>\s*<\/td>\s*<td[^>]*><b><font[^>]*><a href="javascript:open_window\('win', 'view\.php\?no=(\d+)'[^>]*>([^<]+)<\/a><br><font[^>]*>([^<]*)<\/font>[\s\S]*?<div align="center">([^<]*)<\/div>[\s\S]*?(?:<a href="(https?:\/\/[^"]+)" target="_new">)?/g

const items = []
const seen = new Set()
let match
while ((match = rowRe.exec(html))) {
  const month = Number(match[1])
  const day = Number(match[2])
  const dateCell = match[4]
  const no = match[5]
  const title = match[6].replace(/\s+/g, ' ').trim()
  const notes = match[7].replace(/\s+/g, ' ').trim()
  const location = match[8].replace(/\s+/g, ' ').trim()
  if (!title) continue
  const key = `roadrun-${no}`
  if (seen.has(key)) continue
  seen.add(key)

  const rowStart = match.index
  const rowEnd = html.indexOf('<hr>', rowStart)
  const rowHtml = html.slice(rowStart, rowEnd > rowStart ? rowEnd : rowStart + 2500)
  const homeMatch = rowHtml.match(/<a href="(https?:\/\/[^"]+)" target="_new"><img src="image\/home\.gif"/)
  const registration_url = homeMatch?.[1]?.trim() || `http://www.roadrun.co.kr/schedule/view.php?no=${no}`

  items.push({
    key,
    title,
    event_date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    region: guessRegion(location) || guessRegion(title),
    location_label: location,
    registration_url,
    notes,
    is_featured: FEATURED.some((k) => title.toLowerCase().includes(k.toLowerCase())),
    registration_open: dateCell.includes('goingon.gif'),
  })
}

items.sort(
  (a, b) =>
    a.event_date.localeCompare(b.event_date) || a.title.localeCompare(b.title, 'ko'),
)

const out = 'lib/running-league/marathon-catalog-2026-data.json'
fs.writeFileSync(out, JSON.stringify(items))
console.log(
  JSON.stringify(
    {
      parsed: items.length,
      open: items.filter((i) => i.registration_open).length,
      featured: items.filter((i) => i.is_featured).length,
      sampleOpen: items.filter((i) => i.registration_open).slice(0, 3),
    },
    null,
    2,
  ),
)
