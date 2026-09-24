/**
 * Kích thước tờ báo giá — một chỗ duy nhất cho cả bản xem trước (QuotationPreview)
 * và file Excel (exportExcel), tính bằng PX của bản xem trước.
 *
 * Vì sao px: bản xem trước dựng đúng 1062 px cho bề ngang in được của A4 ngang (lề
 * 8 mm), tức đúng 96 dpi. Excel đo bằng point (72 dpi) cho chiều cao hàng và cỡ chữ,
 * bằng "ký tự" cho bề rộng cột, nên chỉ là đổi đơn vị: 1 px = 0.75 pt, cột rộng w ký
 * tự = 7w + 5 px (theo font mặc định Calibri 11 của workbook).
 *
 * Lỗi đã gặp (24/09/2026): file Excel tự đặt bề rộng cột (tổng ~1870 px, gấp 1.8 lần
 * tờ PDF) và cỡ chữ ghi thẳng bằng POINT (12 pt = 16 px, to hơn chữ xem trước 1/3).
 * Tờ Excel vì thế rất "bè": in ra (ép vừa bề ngang) nó co còn hơn nửa trang, chữ nhỏ
 * tí, nửa dưới trang bỏ trắng — nhìn khác hẳn PDF xuất thẳng.
 */

/** Bề rộng 9 cột (px). Tổng 1062 px = bề ngang in được của A4 ngang, lề 8 mm. */
export const COL_PX = [38, 298, 60, 93, 72, 36, 89, 72, 304]

export const SHEET_W = COL_PX.reduce((a, b) => a + b, 0)

/**
 * Chiều cao từng loại hàng (px) — đo trên bản xem trước đã dựng, vì phần lớn hàng ở
 * đó để trình duyệt tự tính theo chữ. Excel không tự co giãn được nên phải ghi số.
 * Hàng nào Excel tự căn được theo chữ (dòng hàng hoá có tên dài xuống dòng) thì
 * KHÔNG đặt chiều cao, để Excel tự nới.
 */
export const ROW_PX = {
  /** Đầu trang: logo + tên công ty. */
  head: 94,
  title: 40,
  date: 23.2,
  customer: 22.8,
  contact: 22.8,
  intro: 45,
  tableHead: 32,
  total: 20.4,
  gap: 14,
  noteHead: 24.8,
  noteLine: 16.8,
  bankGap: 20,
  bankTitle: 22.8,
  sigHead: 20.8,
  /** Hàng đặt mã QR (form VAT không có mã: vẫn chừa chỗ ký). */
  qr: 112,
  qrNone: 110,
  sigFoot: 20,
}

/** Cỡ chữ (px) theo bản xem trước. */
export const FONT_PX = {
  company: 18,
  contact: 14,
  title: 18,
  info: 14,
  intro: 12,
  tableHead: 11,
  cell: 12,
  /** Tên hàng và kích thước — to hơn một chút, đúng bản xem trước. */
  cellWide: 13,
  noteHead: 14,
  specHead: 12,
  note: 11,
  bankTitle: 16,
  bank: 14,
  sig: 13,
}

/** Logo và mã QR (px) — khớp maxHeight của bản xem trước. */
export const IMG_PX = { logo: 84, qr: 112 }

/** px (96 dpi) → point (72 dpi): chiều cao hàng và cỡ chữ của Excel. */
export const pt = (px: number): number => Math.round(px * 75) / 100

/** px → bề rộng cột Excel tính bằng ký tự (font mặc định Calibri 11: 7w + 5 px). */
export const colChars = (px: number): number => Math.round(((px - 5) / 7) * 100) / 100
