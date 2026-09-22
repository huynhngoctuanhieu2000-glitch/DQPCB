/**
 * Ô nhập số dùng chung — viết cho điện thoại.
 *
 * Ô số điều khiển thẳng bằng state (value = số đang có) gây ba lỗi khó chịu khi gõ trên
 * điện thoại, gặp ở thẻ tính giá và form báo giá (22/09/2026):
 *   - XOÁ KHÔNG ĐƯỢC: onChange kẹp giá trị ngay (Math.max(1, …), `?? 0`) nên xoá hết là ô
 *     tự hiện lại "1"/"0"; gõ 4 thành "14".
 *   - MẤT DẤU CHẤM: "12." đọc ra 12 rồi hiện lại "12" — không gõ nổi số lẻ.
 *   - CON TRỎ NHẢY: ô tiền chèn dấu chấm nghìn sau mỗi phím, con trỏ bị đẩy về cuối.
 *
 * Cách làm: lúc đang gõ, ô hiện đúng chữ người dùng gõ (bản nháp riêng), số vẫn báo lên
 * ngay để giá tính lại tức thì; rời ô mới định dạng lại theo `format` và điền `fallback`
 * nếu để trống. Chạm vào là bôi đen cả số để gõ đè. Bàn phím điện thoại mở kiểu số
 * (inputMode), có dấu chấm khi `decimals`.
 */
import React, { useRef, useState } from 'react'

export const NumberInput: React.FC<{
  value: number | null | undefined
  /** Báo số mới mỗi phím gõ; null = ô đang trống. */
  onChange: (v: number | null) => void
  /** Cho gõ số lẻ (dấu chấm hoặc phẩy). */
  decimals?: boolean
  /** Cách hiện số khi KHÔNG gõ (vd tiền có dấu chấm nghìn). Mặc định: số thô. */
  format?: (n: number) => string
  /** Rời ô mà trống thì báo số này (vd 1 cho "số bo mỗi cạnh"). Không có thì để trống. */
  fallback?: number
  style?: React.CSSProperties
  placeholder?: string
  title?: string
}> = ({ value, onChange, decimals, format, fallback, style, placeholder, title }) => {
  /** Chữ đang gõ; null = không gõ, hiện theo `value`. */
  const [draft, setDraft] = useState<string | null>(null)
  const ref = useRef<HTMLInputElement>(null)

  const shown =
    draft !== null
      ? draft
      : value === null || value === undefined || Number.isNaN(value)
        ? ''
        : format
          ? format(value)
          : String(value)

  const parse = (text: string): number | null => {
    if (text === '' || text === '.' || text === '-') return null
    const n = Number(text)
    return Number.isFinite(n) ? n : null
  }

  return (
    <input
      ref={ref}
      style={style}
      value={shown}
      placeholder={placeholder}
      title={title}
      inputMode={decimals ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      autoComplete="off"
      onFocus={() => {
        setDraft(value === null || value === undefined || Number.isNaN(value) ? '' : String(value))
        // Bôi đen cả số để gõ đè. Phải đợi một nhịp: trình duyệt điện thoại tự đặt con trỏ
        // SAU sự kiện focus, chọn ngay thì bị đè mất.
        window.setTimeout(() => ref.current?.select(), 0)
      }}
      onChange={(e) => {
        // Chỉ giữ chữ số (và MỘT dấu thập phân khi cho phép); dấu phẩy coi như dấu chấm —
        // bàn phím số tiếng Việt hay đưa dấu phẩy.
        let text = e.target.value.replace(',', '.')
        text = decimals ? text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : text.replace(/\D/g, '')
        setDraft(text)
        onChange(parse(text))
      }}
      onBlur={() => {
        const n = parse(draft ?? '')
        setDraft(null)
        if (n === null && fallback !== undefined) onChange(fallback)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') ref.current?.blur()
      }}
    />
  )
}
