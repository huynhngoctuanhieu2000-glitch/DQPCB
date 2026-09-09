/**
 * Logo và mã QR chuyển khoản của báo giá.
 *
 * Cả bốn ảnh lấy ra từ chính hai file mẫu ở templates/bao-gia/ (chúng nằm trong
 * `xl/media/` của file .xlsm, neo ở cột B dòng 1–2 cho logo và dưới khối tài khoản
 * cho mã QR).
 *
 * Nhúng thẳng dạng data URL (`?inline`) chứ không để Vite xuất ra file rời: bản
 * Electron đóng gói nạp trang bằng `file://`, mà `fetch()` một đường dẫn file://
 * thì Chromium chặn — ảnh sẽ mất. Data URL thì chạy ở mọi nơi, và cùng một chuỗi
 * dùng được cho cả bản in PDF (thẻ <img>) lẫn file Excel (exceljs đọc base64).
 *
 * Đổi ảnh: thay file trong src/assets/quotation/ rồi sửa bảng dưới đây.
 */
import logoThienLam from '../../assets/quotation/logo-thien-lam-pcb.jpeg?inline'
import logoBachVan from '../../assets/quotation/logo-bach-van.png?inline'
import qr1 from '../../assets/quotation/qr-1.png?inline'
import qr2 from '../../assets/quotation/qr-2.png?inline'

export interface BrandingImage {
  /** Ảnh dạng data URL, dùng thẳng cho <img src>. */
  dataUrl: string
  /** Kích thước gốc, để giữ đúng tỉ lệ khi đặt vào ô Excel. */
  width: number
  height: number
}

export interface QuotationBranding {
  logo: BrandingImage
  /** Mã QR chuyển khoản, xếp cạnh khối tài khoản. Form VAT không có. */
  qr: BrandingImage[]
}

const THIEN_LAM: BrandingImage = { dataUrl: logoThienLam, width: 485, height: 325 }
const BACH_VAN: BrandingImage = { dataUrl: logoBachVan, width: 453, height: 226 }
const QR_1: BrandingImage = { dataUrl: qr1, width: 427, height: 510 }
const QR_2: BrandingImage = { dataUrl: qr2, width: 302, height: 332 }

/**
 * Khách lẻ dùng logo Thiên Lam PCB kèm hai mã QR của tài khoản cá nhân;
 * khách công ty dùng logo Bạch Vân, và form mẫu không kèm QR nào.
 */
export const brandingFor = (hasVat: boolean): QuotationBranding =>
  hasVat ? { logo: BACH_VAN, qr: [] } : { logo: THIEN_LAM, qr: [QR_1, QR_2] }

/** exceljs cần phần base64 trần và đuôi ảnh, tách ra từ data URL. */
export const splitDataUrl = (dataUrl: string): { base64: string; extension: 'png' | 'jpeg' } => {
  const [head, body = ''] = dataUrl.split(',')
  return {
    base64: body,
    extension: head.includes('image/png') ? 'png' : 'jpeg',
  }
}
