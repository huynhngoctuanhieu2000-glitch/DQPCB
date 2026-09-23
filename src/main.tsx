import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

/**
 * Bản web: đăng ký service worker để mở được khi mất mạng (public/sw.js).
 *
 * Chỉ ở bản build thật và khi KHÔNG chạy trong Electron: trong Electron app đã nằm sẵn
 * trên máy, còn lúc `npm run dev` thì service worker giữ bản cũ, sửa code không thấy đổi.
 */
if (import.meta.env.PROD && !window.ipcRenderer && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Trình duyệt chặn (chế độ ẩn danh, chính sách công ty…) — app vẫn chạy bình thường.
    })
  })
}
