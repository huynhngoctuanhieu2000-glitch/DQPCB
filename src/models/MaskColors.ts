/**
 * Các màu phủ bo (soldermask) nhà máy thực sự có.
 * Dùng chung: thanh công cụ chọn màu bo, và cột "MÀU PHỦ" của báo giá.
 * Trắng/vàng để cuối vì chúng đổi luôn màu chữ in lụa.
 */
export interface MaskColor {
  hex: string
  label: string
}

export const MASK_COLORS: MaskColor[] = [
  { hex: '#0f4f26', label: 'Xanh lá' },
  { hex: '#12395c', label: 'Xanh dương' },
  { hex: '#7a1c24', label: 'Đỏ' },
  { hex: '#1a1a1a', label: 'Đen' },
  { hex: '#4a1c6b', label: 'Tím' },
  { hex: '#c8b400', label: 'Vàng' },
  { hex: '#e8e8e8', label: 'Trắng' },
]

/** Nhãn tiếng Việt của một mã màu; màu lạ thì trả về chuỗi rỗng để người lập tự điền. */
export const maskColorLabel = (hex: string): string =>
  MASK_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.label ?? ''
