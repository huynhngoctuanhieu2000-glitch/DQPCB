/**
 * Service worker cho bản web: app mở được khi mất mạng.
 *
 * App đã có manifest + icon để "Thêm vào màn hình chính", nhưng thiếu cái này thì mất
 * mạng là trắng màn hình — trong khi mọi việc (đọc Gerber, tính giá, xuất PDF) đều chạy
 * ngay trên máy, không cần mạng.
 *
 * Luật đơn giản, hợp với app một trang:
 * - Trang HTML: hỏi mạng trước, hỏng thì lấy bản đã lưu (để bản mới deploy lên là thấy ngay).
 * - File tĩnh có mã băm trong tên (/assets/…): lấy bản đã lưu trước, chưa có thì tải và lưu
 *   (tên đổi mỗi lần build nên không sợ cũ).
 * - Thứ khác: cứ để trình duyệt lo.
 *
 * KHÔNG dùng trong Electron: ở đó app chạy từ file trên máy, không qua service worker.
 */
const VERSION = 'dqpcb-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-192.png']

self.addEventListener('install', (e) => {
  // Bản mới thay bản cũ ngay, không chờ đóng hết tab.
  self.skipWaiting()
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  const isDoc = req.mode === 'navigate' || req.destination === 'document'
  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put('/index.html', copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    )
    return
  }

  // File build (tên có mã băm) và icon: dùng bản đã lưu cho nhanh, chưa có thì tải rồi lưu.
  const cacheable = url.pathname.startsWith('/assets/') || /\.(png|svg|ico|webmanifest|woff2?)$/.test(url.pathname)
  if (!cacheable) return
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {})
          return res
        })
    )
  )
})
