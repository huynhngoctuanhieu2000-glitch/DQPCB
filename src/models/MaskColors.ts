/**
 * Các màu phủ bo (soldermask) nhà máy thực sự có.
 * Dùng chung: thanh công cụ chọn màu bo, và cột "MÀU PHỦ" của báo giá.
 * Trắng/vàng để cuối vì chúng đổi luôn màu chữ in lụa.
 */
export interface MaskColor {
  /**
   * Màu bo ở chỗ KHÔNG có đồng bên dưới — nền bo khi dựng, và mã nhận diện của màu
   * này trong cả app (báo giá, `setMaskColor`).
   */
  hex: string
  /**
   * Chấm chọn trên thanh công cụ. Bão hoà hơn `hex` nhiều vì đây là màu thương hiệu
   * JLC dùng cho nút bấm, không phải màu bo thật — lấy nó tô bo thì bo ra như đồ hoạ
   * poster, còn lấy `hex` tô chấm thì bảy chấm nhìn tối gần như nhau.
   */
  dot: string
  /** Màu bo ở chỗ CÓ đồng bên dưới. Đồng phản xạ nhiều hơn nên hầu hết là sáng hơn. */
  copper: string
  label: string
}

/**
 * Đo từ chính JLCPCB, hai nguồn khác nhau:
 *  - `dot`: ô chọn "PCB Color" trên cart.jlcpcb.com.
 *  - `hex` / `copper`: ảnh preview JLC dựng ra sau khi nhận gerber
 *    (/api/overseas-core-platform/file/downImg?color=…), lấy hai mảng màu lớn nhất —
 *    56.7% là vùng có đồng, 19.1% là vùng mask trần.
 *
 * Cặp màu của JLC rất sát nhau — tương phản đồng/nền bo chỉ 1.16-2.14:1, nên đường
 * mạch chỉ hiện lờ mờ dưới lớp mask. Đó là đúng như bo thật và là chủ ý: `realPalette`
 * dùng thẳng cặp này, không nắn lên cho "dễ nhìn", để bo dựng ra trùng với bo khách
 * thấy khi đặt hàng bên JLC.
 */
export const MASK_COLORS: MaskColor[] = [
  { hex: '#185428', dot: '#32b16c', copper: '#2c7834', label: 'Xanh lá' },
  { hex: '#002864', dot: '#00479d', copper: '#005cb4', label: 'Xanh dương' },
  { hex: '#940000', dot: '#e60012', copper: '#d80004', label: 'Đỏ' },
  { hex: '#1c1c1c', dot: '#000000', copper: '#040404', label: 'Đen' },
  { hex: '#682c94', dot: '#9a24db', copper: '#8044a8', label: 'Tím' },
  { hex: '#b8ac00', dot: '#fff100', copper: '#ecec00', label: 'Vàng' },
  { hex: '#e0e0e0', dot: '#f7fbff', copper: '#f0f0f0', label: 'Trắng' },
]

/** Nhãn tiếng Việt của một mã màu; màu lạ thì trả về chuỗi rỗng để người lập tự điền. */
export const maskColorLabel = (hex: string): string =>
  MASK_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.label ?? ''

/** Cặp màu JLC của một mã bo; màu lạ (người dùng tự nhập) thì không có. */
export const maskColorOf = (hex: string): MaskColor | undefined =>
  MASK_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())
