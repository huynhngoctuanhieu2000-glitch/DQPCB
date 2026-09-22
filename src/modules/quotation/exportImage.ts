/**
 * Báo giá → file PDF ngay trong trình duyệt, để lưu hoặc gửi qua Zalo từ điện thoại.
 *
 * Trên web không có Electron để in ra PDF, còn jsPDF/pdfmake thì thiếu glyph tiếng
 * Việt. Cách làm: dựng bản Xem trước vào một div ngoài màn hình, nhờ html2canvas
 * vẽ nó thành ảnh (font hệ thống, logo/QR là data URL), rồi đặt ảnh lên trang A4
 * ngang bằng pdf-lib. Chữ trong PDF không bôi chọn được, nhưng nhìn đúng hệt bản
 * Xem trước và mọi máy mở được.
 *
 * Không dùng <svg><foreignObject> → canvas: Safari trên iPhone dựng nội dung trong
 * foreignObject ở bề ngang màn hình (375 px) rồi kéo giãn, chữ gãy dòng, mất mã QR.
 */
import html2canvas from 'html2canvas'
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
  host.style.cssText = `position:absolute;left:0;top:0;width:${PREVIEW_W}px;background:#fff;z-index:-1;pointer-events:none`
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
    const sheet = host.firstElementChild as HTMLElement
    // windowWidth: html2canvas dựng lại DOM trong một iframe; trên điện thoại iframe
    // đó mặc định rộng bằng màn hình (375 px) và tờ báo giá sẽ bị bó lại.
    return await html2canvas(sheet, {
      scale: SCALE,
      backgroundColor: '#ffffff',
      width: PREVIEW_W,
      windowWidth: PREVIEW_W + 100,
      logging: false,
    })
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
 * Tờ báo giá → PDF A4 ngang. Tờ dài quá một trang chút ít (tới 1.4 trang — báo giá
 * thường chỉ dư phần mã QR) thì co lại cho vừa một trang, đỡ cắt ngang mã QR;
 * dài hơn nữa thì cắt ảnh thành từng trang chứ không co (co thì chữ không đọc nổi).
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

  if (sheet.height <= sliceH * 1.4) {
    const png = await pdf.embedPng(await toPngBytes(sheet))
    const page = pdf.addPage([PAGE_W, PAGE_H])
    const k = Math.min(1, sliceH / sheet.height)
    const w = innerW * k
    const h = (sheet.height / pxPerPt) * k
    page.drawImage(png, { x: MARGIN + (innerW - w) / 2, y: PAGE_H - MARGIN - h, width: w, height: h })
    const bytes = await pdf.save()
    return new Blob([bytes as BlobPart], { type: 'application/pdf' })
  }

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

/**
 * Máy này có bảng chia sẻ nhận file kiểu `type` không (iOS/Android có; Chrome máy
 * tính tuỳ; Edge trên Windows có qua bảng chia sẻ của hệ điều hành). Kiểm tra đúng
 * `type` MIME cần chia sẻ — có máy nhận PDF nhưng không nhận .xlsx hoặc ngược lại.
 */
export const canShareType = (type: string, extension: string): boolean =>
  typeof navigator.canShare === 'function' &&
  navigator.canShare({ files: [new File([''], `x.${extension}`, { type })] })

/** Máy này có bảng chia sẻ nhận file PDF không. */
export const canShareFiles = (): boolean => canShareType('application/pdf', 'pdf')

/**
 * Mở bảng chia sẻ của hệ điều hành với một file — chọn Zalo, Messenger, Lưu vào
 * Tệp… Không có bảng chia sẻ (hay trình duyệt không hỗ trợ kiểu file này) thì tải
 * file về thẳng. Dùng chung cho cả PDF và Excel, chỉ khác blob/tên/khả năng chia sẻ.
 */
export const shareOrDownload = async (
  blob: Blob,
  fileName: string,
  canShare: boolean
): Promise<'shared' | 'downloaded' | 'canceled'> => {
  const file = new File([blob], fileName, { type: blob.type })
  if (canShare) {
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

/**
 * Mở bảng chia sẻ của điện thoại với file PDF — chọn Zalo, Messenger, Lưu vào Tệp…
 * Không có bảng chia sẻ (trình duyệt máy tính) thì tải PDF về.
 */
export const shareQuotationPdf = async (
  q: Quotation,
  /** 'download' = tải thẳng về máy, kể cả khi máy có bảng chia sẻ. */
  mode: 'share' | 'download' = 'share'
): Promise<'shared' | 'downloaded' | 'canceled'> => {
  const blob = await quotationToPdf(q)
  return shareOrDownload(blob, pdfFileName(q), mode === 'share' && canShareFiles())
}
