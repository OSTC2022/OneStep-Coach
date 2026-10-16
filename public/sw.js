/* OneStep Coach — 설치용 서비스 워커.
 * fetch 리스너를 두지 않는다.
 * 빈 fetch 리스너와 respondWith(fetch) 모두 설치된 앱에서
 * 화면이 열리지 않거나 "이 페이지를 읽을 수 없습니다"가 난다.
 */
const SW_VERSION = 'onestep-v3'
self.__SW_VERSION = SW_VERSION

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim()
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      await Promise.all(
        clients.map(async (client) => {
          try {
            const url = new URL(client.url)
            if (url.searchParams.get('sw') === '3') return
            url.searchParams.set('sw', '3')
            await client.navigate(url.href)
          } catch {
            /* 이미 닫힌 창은 무시 */
          }
        }),
      )
    })(),
  )
})
