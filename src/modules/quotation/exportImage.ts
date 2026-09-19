/**
 * Báo giá → ảnh PNG, để gửi qua Zalo/Messenger từ điện thoại.
 *
 * Trên web không in được thẳng ra file PDF (không có Electron), mà khách bên
 * Zalo thì nhận ảnh là tiện nhất. Cách làm: dựng bản Xem trước vào một div ẩn để
 * đo chiều cao, bọc nó trong <svg><foreignObject> rồi vẽ lên canvas — trình duyệt
 * tự kết xuất HTML thành ảnh, không cần thư viện. Logo và mã QR là data URL nên
 * không dính lỗi cross-origin.
 */
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { Quotation } from './QuotationModel'
import { suggestedFileName } from './QuotationModel'
import { QuotationSheet, PREVIEW_W } from './QuotationPreview'

/** Vẽ nét gấp đôi để phóng to trên điện thoại vẫn đọc được số. */
const SCALE = 2

export const quotationToPng = async (q: Quotation): Promise<Blob> => {
  // Dựng thật vào DOM (ngoài màn hình) để có chiều cao đúng với font hệ thống.
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${PREVIEW_W}px;background:#fff`
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(createElement(QuotationSheet, { q })))
    // Đợi ảnh (logo, QR) nạp xong, không thì ảnh xuất ra mất logo.
    await Promise.all(
      Array.from(host.querySelectorAll('img')).map(
        (img) =>
          img.complete ||
          new Promise((r) => {
            img.onload = img.onerror = () => r(null)
          })
      )
    )
    const height = Math.ceil(host.scrollHeight)
    // XMLSerializer cho ra XHTML hợp lệ (đóng thẻ img, xmlns) — foreignObject đòi XML.
    const xhtml = new XMLSerializer().serializeToString(host.firstElementChild as Element)
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_W}" height="${height}">` +
      `<foreignObject width="100%" height="100%">${xhtml}</foreignObject></svg>`

    const img = new Image()
    img.decoding = 'sync'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Trình duyệt không kết xuất được bản báo giá thành ảnh'))
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
    })
    const canvas = document.createElement('canvas')
    canvas.width = PREVIEW_W * SCALE
    canvas.height = height * SCALE
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không tạo được ảnh PNG'))), 'image/png')
    )
  } finally {
    root.unmount()
    host.remove()
  }
}

const pngFileName = (q: Quotation) => suggestedFileName(q).replace(/\.[^.]+$/, '.png')

/** Máy này có bảng chia sẻ nhận file không (iOS/Android có; Chrome máy tính tuỳ). */
export const canShareFiles = (): boolean =>
  typeof navigator.canShare === 'function' &&
  navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] })

/**
 * Mở bảng chia sẻ của điện thoại với ảnh báo giá — chọn Zalo, Messenger, Lưu ảnh…
 * Không có bảng chia sẻ thì tải ảnh về.
 */
export const shareQuotationImage = async (q: Quotation): Promise<'shared' | 'downloaded' | 'canceled'> => {
  const blob = await quotationToPng(q)
  const file = new File([blob], pngFileName(q), { type: 'image/png' })
  if (canShareFiles()) {
    try {
      await navigator.share({ files: [file], title: file.name })
      return 'shared'
    } catch (err) {
      // Người dùng đóng bảng chia sẻ thì không phải lỗi.
      if (err instanceof Error && err.name === 'AbortError') return 'canceled'
      throw err
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  return 'downloaded'
}
