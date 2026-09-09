/**
 * Logo và mã QR chuyển khoản của báo giá.
 *
 * Cả bốn ảnh lấy ra từ chính hai file mẫu ở templates/bao-gia/ (chúng nằm trong
 * `xl/media/` của file .xlsm, neo ở cột B dòng 1–2 cho logo và dưới khối tài khoản
 * cho mã QR).
 *
 * Nhúng thẳng dạng data URL (`?inline`) chứ không để Vite xuất ra file rời: bản
 * Electron đóng gói nạp trang bằng `file://`, mà `fetch()` một đường dẫn file://
 * thì Chromium chặn — ảnh sẽ mất. Data URL thì gắn thẳng vào thẻ <img> của trang
 * đem đi in nên chạy ở mọi nơi.
 *
 * Đổi ảnh: thay file trong src/assets/quotation/ rồi sửa bảng dưới đây.
 */
import logoThienLam from '../../assets/quotation/logo-thien-lam-pcb.jpeg?inline'
import logoBachVan from '../../assets/quotation/logo-bach-van.png?inline'
import qrVietcombank from '../../assets/quotation/qr-vietcombank.png?inline'
import qrTechcombank from '../../assets/quotation/qr-techcombank.png?inline'

export interface BrandingImage {
  /** Ảnh dạng data URL, dùng thẳng cho <img src>. */
  dataUrl: string
  /** Kích thước gốc, để giữ đúng tỉ lệ khi đặt vào ô Excel. */
  width: number
  height: number
}

export interface QuotationBranding {
  logo: BrandingImage
  /**
   * Mã QR chuyển khoản, XẾP CÙNG THỨ TỰ với `bank.lines` để mỗi mã nằm ngay dưới
   * đúng số tài khoản của nó. Form VAT không có mã nào.
   */
  qr: BrandingImage[]
}

const THIEN_LAM: BrandingImage = { dataUrl: logoThienLam, width: 485, height: 325 }
const BACH_VAN: BrandingImage = { dataUrl: logoBachVan, width: 453, height: 226 }
// Nội dung hai mã đã giải ra để chắc chắn không gán nhầm nhãn: mã dưới đây mang
// BIN 970436 + số 0331000508424 (Vietcombank), mã kia mang 970407 + 19035914489015
// (Techcombank) — khớp đúng hai dòng trong quotation-defaults.json.
const QR_VIETCOMBANK: BrandingImage = { dataUrl: qrVietcombank, width: 302, height: 332 }
const QR_TECHCOMBANK: BrandingImage = { dataUrl: qrTechcombank, width: 427, height: 510 }

/**
 * Khách lẻ dùng logo Thiên Lam PCB kèm hai mã QR của tài khoản cá nhân;
 * khách công ty dùng logo Bạch Vân, và form mẫu không kèm QR nào.
 */
export const brandingFor = (hasVat: boolean): QuotationBranding =>
  hasVat ? { logo: BACH_VAN, qr: [] } : { logo: THIEN_LAM, qr: [QR_VIETCOMBANK, QR_TECHCOMBANK] }
