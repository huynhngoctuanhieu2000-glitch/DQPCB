/**
 * Bảng màu dựng bo "như thật" (chế độ Real 2D / 2 Mặt / 3D), suy từ màu soldermask
 * người dùng chọn.
 *
 * Tách khỏi Viewer2D.WebGL vì đây là thuần tính toán màu, không dính three.js — để
 * test được mà không phải nạp cả component WebGL.
 */
import { maskColorOf } from './MaskColors'

/** Lỗ khoan, lỗ phay, vòng khoét trên outline: tô TRẮNG cho ra cảm giác thủng bo. */
export const HOLE = 0xffffff

/**
 * Lỗ mở mask = pad. Màu đồng trần, đo từ preview JLC — họ dùng đúng một mã này cho cả
 * bảy màu bo, nên bo dựng ra trùng bo khách thấy khi đặt hàng.
 *
 * Trước đây để xám thiếc 0x9aa1a8 cho khớp HASL ghi trong báo giá; đổi theo JLC vì
 * người xem đối chiếu với preview của họ chứ không với bo thành phẩm.
 */
export const MASK_OPENING = 0xc49484
/** Lõi FR-4 lộ ra ở mép bo và trong lỗ phay. */
export const BASE_BOARD = 0xbfaf42

const hexToRgb = (hex: string) => {
  const n = parseInt(String(hex).replace('#', ''), 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [24, 84, 40]
}
const rgbToHex = ([r, g, b]: number[]) => (r << 16) | (g << 8) | b
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

/** Độ sáng tương đối WCAG — dùng để đo tương phản, khác `lum` BT.601 ở dưới. */
const relLuminance = ([r, g, b]: number[]) => {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

const contrastRatio = (a: number[], b: number[]) => {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const mixRgb = (a: number[], b: number[], t: number) => a.map((c, i) => clamp(c + (b[i] - c) * t))

/**
 * Mức chênh đồng/nền bo dùng cho màu LẠ (người dùng tự nhập, không có trong
 * MASK_COLORS). Lấy 1.6 vì đó là quãng JLC để giữa hai vùng trên bảy màu chuẩn của họ
 * (1.16-2.14, phần lớn quanh 1.6-1.8) — màu lạ nhìn ra cùng một chất bo.
 *
 * KHÔNG phải mốc 3:1 của WCAG. Đã thử ép lên 3.2 cho mạch nổi hẳn, nhưng vùng có đồng
 * chiếm tới 57% diện tích bo nên đẩy nó là cả bo sáng lên thành xanh xám, mất tông bo
 * thật. Chốt bám JLC.
 */
export const JLC_LIKE_CONTRAST = 1.6

/**
 * Màu đồng cho màu bo LẠ: trộn màu bo về phía trắng (hoặc đen nếu bo đã quá sáng) đến
 * khi chênh bằng JLC_LIKE_CONTRAST.
 *
 * Trộn theo tỉ lệ chứ không cộng thẳng một quãng vào từng kênh: màu bão hoà sẽ bị chặn
 * ở 255 (đỏ #d80004 cộng 80 thì kênh R đứng yên, chỉ G với B nhích, gần như không đổi
 * màu). Bảy màu chuẩn không đi qua đây — chúng dùng thẳng cặp đo từ JLC.
 */
const copperFor = (oil: number[]) => {
  // Trần của mỗi hướng, để không chọn hướng không với tới mức cần.
  const lumOil = relLuminance(oil)
  const toward = 1.05 / (lumOil + 0.05) >= JLC_LIKE_CONTRAST ? [255, 255, 255] : [0, 0, 0]
  let lo = 0
  let hi = 1
  // 12 vòng chia đôi: sai số tỉ lệ trộn dưới 1/4096, thừa mịn so với bước màu 1/255.
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2
    if (contrastRatio(oil, mixRgb(oil, toward, mid)) < JLC_LIKE_CONTRAST) lo = mid
    else hi = mid
  }
  return mixRgb(oil, toward, hi)
}

/**
 * Bảng màu Real/3D cho một màu bo.
 *  - Bảy màu nhà máy nhận: lấy THẲNG cặp đo từ preview JLC, không nắn lại, để bo dựng
 *    ra trùng với bo khách thấy khi đặt hàng bên JLC.
 *  - Màu lạ người dùng tự nhập thì suy ra theo `copperFor`.
 *  - In lụa: trên bo trắng/vàng phải in mực đen mới đọc được. Chỗ này KHÔNG theo JLC —
 *    preview của họ để lụa trắng cả trên bo vàng, đo ra 2.29:1, chữ nhoè.
 */
export const realPalette = (maskHex: string) => {
  const rgb = hexToRgb(maskHex)
  const jlc = maskColorOf(maskHex)
  // độ sáng cảm nhận (ITU-R BT.601)
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
  const light = lum > 0.6
  return {
    Oil: rgbToHex(rgb.map(clamp)),
    Copper: rgbToHex(jlc ? hexToRgb(jlc.copper) : copperFor(rgb)),
    Silkscreen: light ? 0x1a1a1a : 0xf2f2f2,
    MaskOpening: MASK_OPENING,
    BaseBoard: BASE_BOARD,
    Drill: HOLE,
  }
}
