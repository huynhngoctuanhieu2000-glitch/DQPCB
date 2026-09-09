/**
 * Xuất báo giá ra PDF.
 *
 * Không dùng jsPDF/pdfmake: chúng không có sẵn glyph tiếng Việt, phải nhúng cả bộ
 * font Roboto/Noto rồi tự tính ngắt dòng, ngắt trang. Thay vào đó dựng lại đúng bản
 * Xem trước thành một trang HTML rồi nhờ Electron in ra PDF — chữ tiếng Việt dùng
 * font hệ thống nên hiện đúng, và bố cục thì khỏi phải viết lần thứ hai.
 *
 * Ảnh (logo, mã QR) đã là data URL nên trang HTML đứng một mình được, không phải
 * kèm file rời.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import type { Quotation } from './QuotationModel'
import { suggestedFileName } from './QuotationModel'
import { QuotationPreview } from './QuotationPreview'

interface IpcBridge {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

declare global {
  interface Window {
    ipcRenderer?: IpcBridge
  }
}

export interface PdfSaveResult {
  canceled: boolean
  filePath?: string
}

/** Bản Xem trước → một trang HTML tự chứa, in ra là ra đúng cái đang nhìn. */
export const quotationToHtml = (q: Quotation): string => {
  const body = renderToStaticMarkup(createElement(QuotationPreview, { q }))
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>${escapeHtml(suggestedFileName(q).replace(/\.[^.]+$/, ''))}</title>
<style>
  /* Khổ A4 ngang, đúng như hai form mẫu (%pageSetup orientation="landscape"). */
  @page { size: A4 landscape; margin: 8mm; }
  html, body { margin: 0; padding: 0; background: #fff; }
  /* Bản xem trước trong app bọc nền trắng và bo góc cho dễ nhìn; in thì bỏ đi. */
  body > div { padding: 0 !important; border-radius: 0 !important; overflow: visible !important; }
  table { width: 100% !important; min-width: 0 !important; }
  /* Không cắt đôi một dòng hàng khi sang trang. */
  tr, td { page-break-inside: avoid; }
</style>
</head>
<body>${body}</body>
</html>`
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  )

/**
 * Chạy trong Electron thì main dựng trang rồi in ra PDF và mở hộp thoại lưu.
 * Chạy trên trình duyệt thì mở một cửa sổ in — người dùng chọn "Save as PDF".
 */
export const exportQuotationToPdf = async (
  q: Quotation,
  /** Thư mục gợi ý sẵn ở hộp thoại lưu — thường là chỗ chứa file gerber. */
  defaultDir = ''
): Promise<PdfSaveResult> => {
  const html = quotationToHtml(q)
  const fileName = suggestedFileName(q).replace(/\.xlsx$/, '.pdf')

  const ipc = window.ipcRenderer
  if (ipc?.invoke) {
    return (await ipc.invoke('quotation:pdf', { fileName, html, defaultDir })) as PdfSaveResult
  }

  // Trình duyệt: không ghi thẳng ra file được, nhờ hộp thoại in của trình duyệt.
  const win = window.open('', '_blank')
  if (!win) throw new Error('Trình duyệt chặn cửa sổ in. Cho phép pop-up rồi thử lại.')
  win.document.write(html)
  win.document.close()
  // Đợi ảnh nạp xong, không thì bản in mất logo.
  await new Promise((resolve) => {
    if (win.document.readyState === 'complete') resolve(null)
    else win.addEventListener('load', () => resolve(null), { once: true })
  })
  win.focus()
  win.print()
  return { canceled: false }
}

/**
 * Mở thư mục chứa file vừa lưu, bôi sẵn file đó. Chỉ chạy được trong Electron —
 * trên trình duyệt không có đường dẫn nên nút gọi hàm này cũng không hiện.
 */
export const revealInFolder = async (filePath: string): Promise<void> => {
  const ipc = window.ipcRenderer
  if (!ipc?.invoke || !filePath) return
  await ipc.invoke('shell:showInFolder', filePath)
}
