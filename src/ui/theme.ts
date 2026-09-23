/**
 * Token giao diện: màu, cỡ chữ, cỡ nút, bo góc — MỘT nơi duy nhất.
 *
 * Trước đây mỗi file tự gõ mã màu (395 chỗ) và tự đặt cỡ nút (5–6 bộ số khác nhau cho
 * cùng một loại nút), nên sửa vùng chạm hay tương phản phải mò từng chỗ và dễ sót; luật
 * cỡ nút trong index.css phải dùng `!important` để đè style inline.
 *
 * Quy ước dùng: lấy màu từ đây thay vì gõ mã hex; dựng nút bằng <Button> (ui/Button.tsx)
 * thay vì tự đặt padding/màu. Xem docs/ui-dien-thoai.md mục 6.
 */

/** Màu nền, viền, chữ — tên theo VAI TRÒ, không theo màu, để đổi tông một lần là xong. */
export const C = {
  /** Nền app và các tấm nền, từ tối nhất ra ngoài cùng. */
  bg: '#121316',
  panel: '#181a20',
  panelAlt: '#14161b',
  raised: '#1e293b',
  input: '#0f172a',
  line: '#282b34',
  lineSoft: '#22252e',
  border: '#334155',
  borderSoft: '#2c313c',

  /** Chữ. muted đủ tương phản ≥ 4.5:1 trên nền panel — #64748b thì KHÔNG đạt. */
  text: '#e2e8f0',
  textStrong: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#64748b',

  /** Nhấn. Nền đặc dùng cho chữ trắng nên phải đủ đậm (≥ 4.5:1). */
  accent: '#38bdf8',
  primaryBg: '#0369a1',
  primaryBgHover: '#075985',
  successBg: '#047857',
  dangerText: '#f87171',
  dangerBg: '#7f1d1d',
  warnText: '#fcd34d',
} as const

/** Cỡ chữ. Nhỏ nhất cho nút/nhãn bấm được là 12px — 10–11px đọc mỏi mắt. */
export const FS = { xs: 11, sm: 12, md: 13, lg: 14 } as const

/**
 * Chiều cao tối thiểu của thứ bấm được.
 * - `desktop`: 24px là sàn WCAG 2.5.8.
 * - `mobile`: 40px (iOS 44pt / Android 48dp cho vùng chạm chính), 36px cho hàng dày đặc.
 * KHÔNG đặt minHeight inline lớn hơn `mobile` — sàn trong index.css sẽ không kéo được nữa.
 */
export const TAP = { desktop: 28, dense: 26, mobile: 40, mobileDense: 36 } as const

export const RADIUS = { sm: 4, md: 6, pill: 999 } as const
