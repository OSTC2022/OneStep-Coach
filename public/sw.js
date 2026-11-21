/* OneStep Coach — 설치용 서비스 워커 (비활성).
 * fetch / clients.claim 은 설치된 앱에서
 * "이 페이지를 읽을 수 없습니다" 를 유발한다.
 * 등록되어도 페이지를 제어하지 않는다.
 */
const SW_VERSION = 'onestep-v5'
self.__SW_VERSION = SW_VERSION

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
      // clients.claim() 금지 — 네비게이션/버튼 이동이 깨짐
    })(),
  )
})
