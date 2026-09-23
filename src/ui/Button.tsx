/**
 * Nút dùng chung. Thay cho việc mỗi file tự đặt padding/màu/cỡ chữ (trước có 5–6 bộ số
 * cho cùng một loại nút, nút thấp 11–22px không bấm trúng trên điện thoại).
 *
 * - `variant`: primary (việc chính, nền đặc) · secondary (viền) · ghost (chữ trơn) ·
 *   danger (xoá) · chip (mốc/lựa chọn, có trạng thái `on`).
 * - `size`: md (mặc định) · sm (hàng dày đặc: dãy mốc số lượng, tab lọc lớp) · icon (vuông).
 * - `icon`: tên icon trong ui/Icon.tsx. Nút chỉ có icon BẮT BUỘC có `aria-label`
 *   (điện thoại không rê chuột xem `title` được).
 *
 * Cỡ lấy từ ui/theme.ts; sàn vùng chạm trên điện thoại vẫn do index.css đặt, nút này chỉ
 * cần không đặt chiều cao lớn hơn sàn đó.
 */
import React from 'react'
import { Icon, type IconName } from './Icon'
import { C, FS, RADIUS, TAP } from './theme'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'chip'
export type ButtonSize = 'md' | 'sm' | 'icon'

type Props = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconName
  /** Chip đang được chọn. */
  on?: boolean
  /** Chiếm hết bề ngang chỗ đặt. */
  block?: boolean
  children?: React.ReactNode
}

const base: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  borderRadius: RADIUS.sm,
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  border: '1px solid transparent',
  backgroundColor: 'transparent',
  color: C.text,
}

const sizes: Record<ButtonSize, React.CSSProperties> = {
  md: { minHeight: TAP.desktop, padding: '0 12px', fontSize: FS.md },
  sm: { minHeight: TAP.dense, padding: '0 10px', fontSize: FS.sm },
  icon: { minHeight: TAP.desktop, minWidth: TAP.desktop, padding: 0, fontSize: FS.md },
}

const variants: Record<ButtonVariant, React.CSSProperties> = {
  primary: { backgroundColor: C.primaryBg, color: '#ffffff' },
  secondary: { borderColor: C.border, color: C.text },
  ghost: { color: C.muted },
  danger: { color: C.dangerText },
  chip: { backgroundColor: C.raised, borderColor: C.borderSoft, color: C.text, fontWeight: 500 },
}

const chipOn: React.CSSProperties = { backgroundColor: C.primaryBg, borderColor: C.accent, color: '#ffffff', fontWeight: 600 }

export const Button: React.FC<Props> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  on,
  block,
  children,
  style,
  disabled,
  ...rest
}) => (
  <button
    disabled={disabled}
    {...rest}
    style={{
      ...base,
      ...sizes[size],
      ...variants[variant],
      ...(variant === 'chip' && on ? chipOn : null),
      ...(block ? { width: '100%' } : null),
      ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : null),
      ...style,
    }}
  >
    {icon && <Icon name={icon} size={size === 'sm' ? 14 : 15} />}
    {children}
  </button>
)
