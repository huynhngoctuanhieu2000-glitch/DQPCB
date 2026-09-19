/**
 * Báo giá → file PDF ngay trong trình duyệt, để lưu hoặc gửi qua Zalo từ điện thoại.
 *
 * Trên web không có Electron để in ra PDF, còn jsPDF/pdfmake thì thiếu glyph tiếng
 * Việt. Cách làm: dựng bản Xem trước vào một div ẩn, bọc trong <svg><foreignObject>
 * rồi vẽ lên canvas — trình duyệt tự kết xuất HTML thành ảnh bằng font hệ thống —
 * sau đó đặt ảnh đó lên trang A4 ngang bằng pdf-lib. Chữ trong PDF không bôi chọn
 * được, nhưng nhìn đúng hệt bản Xem trước và mọi máy mở được.
 */
import { PDFDocument } from 'pdf-lib'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { Quotation } from './QuotationModel'
import { suggestedFileName } from './QuotationModel'
import { QuotationSheet, PREVIEW_W } from './QuotationPreview'

/** Vẽ nét gấp đôi để phóng to trên điện thoại vẫn đọc được số. */
const SCALE = 2

/** Kết xuất tờ báo giá thành canvas (nét gấp đôi). */
const renderSheet = async (q: Quotation): Promise<HTMLCanvasElement> => {
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
    return canvas
  } finally {
    root.unmount()
    host.remove()
  }
}

const toPngBytes = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('Không tạo được ảnh'))),
      'image/png'
    )
  )

/** Khổ A4 ngang theo điểm PDF (1 pt = 1/72 inch), lề 8 mm như bản in Electron. */
const PAGE_W = 841.89
const PAGE_H = 595.28
const MARGIN = (8 / 25.4) * 72

/**
 * Tờ báo giá → PDF A4 ngang. Tờ dài hơn một trang thì cắt ảnh thành từng trang,
 * không co nhỏ cho vừa (co thì chữ không đọc nổi trên điện thoại).
 */
export const quotationToPdf = async (q: Quotation): Promise<Blob> => {
  const sheet = await renderSheet(q)
  const pdf = await PDFDocument.create()
  pdf.setTitle(suggestedFileName(q).replace(/\.[^.]+$/, ''))
  const innerW = PAGE_W - 2 * MARGIN
  const innerH = PAGE_H - 2 * MARGIN
  // Ảnh rộng đúng bề ngang vùng in; mỗi trang ăn một lát cao tương ứng.
  const pxPerPt = sheet.width / innerW
  const sliceH = Math.floor(innerH * pxPerPt)
  for (let y = 0; y < sheet.height; y += sliceH) {
    const h = Math.min(sliceH, sheet.height - y)
    const part = document.createElement('canvas')
    part.width = sheet.width
    part.height = h
    part.getContext('2d')!.drawImage(sheet, 0, y, sheet.width, h, 0, 0, sheet.width, h)
    const png = await pdf.embedPng(await toPngBytes(part))
    const page = pdf.addPage([PAGE_W, PAGE_H])
    const drawH = h / pxPerPt
    page.drawImage(png, { x: MARGIN, y: PAGE_H - MARGIN - drawH, width: innerW, height: drawH })
  }
  const bytes = await pdf.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

const pdfFileName = (q: Quotation) => suggestedFileName(q).replace(/\.[^.]+$/, '.pdf')

/** Máy này có bảng chia sẻ nhận file không (iOS/Android có; Chrome máy tính tuỳ). */
export const canShareFiles = (): boolean =>
  typeof navigator.canShare === 'function' &&
  navigator.canShare({ files: [new File([''], 'x.pdf', { type: 'application/pdf' })] })

/**
 * Mở bảng chia sẻ của điện thoại với file PDF — chọn Zalo, Messenger, Lưu vào Tệp…
 * Không có bảng chia sẻ (trình duyệt máy tính) thì tải PDF về.
 */
export const shareQuotationPdf = async (q: Quotation): Promise<'shared' | 'downloaded' | 'canceled'> => {
  const blob = await quotationToPdf(q)
  const file = new File([blob], pdfFileName(q), { type: 'application/pdf' })
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
