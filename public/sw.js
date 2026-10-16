/* OneStep Coach — 설치용 서비스 워커.
 * fetch를 가로채지 않는다. respondWith(fetch)는 캘린더·수업현황에서
 * 회원 페이지로 이동할 때 응답이 끊기며 "이 페이지를 읽을 수 없습니다"가 난다.
 */
const SW_VERSION = 'onestep-v2'
self.__SW_VERSION = SW_VERSION

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {
  // 설치 조건만 충족. 네트워크 요청은 브라우저가 그대로 처리한다.
})
