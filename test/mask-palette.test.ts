/**
 * Bo dựng ra phải trùng màu với bo JLC dựng cho khách khi đặt hàng, nên bảy màu chuẩn
 * lấy thẳng cặp đo từ preview của JLC, không nắn lại.
 *
 * Đã có lúc ép tương phản mạch lên mốc 3:1 của WCAG cho dễ nhìn; bỏ, vì vùng có đồng
 * chiếm 57% diện tích bo nên đẩy nó là cả bo sáng lên thành xanh xám, lệch hẳn JLC.
 * Test khoá lại quyết định đó — cặp màu phải khớp MASK_COLORS từng mã một.
 */
import { describe, it, expect } from 'vitest'
import { MASK_COLORS } from '../src/models/MaskColors'
import { realPalette } from '../src/models/RealPalette'

const toRgb = (v: number | string): number[] => {
  const n = typeof v === 'string' ? parseInt(v.replace('#', ''), 16) : v
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const relLuminance = ([r, g, b]: number[]) => {
  const ch = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)
}

const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('realPalette — đồng trên nền bo', () => {
  it.each(MASK_COLORS.map((c) => [c.label, c.hex, c.copper] as const))(
    'bo %s (%s): dùng đúng màu đồng JLC đo được',
    (_label, hex, copper) => {
      expect(realPalette(hex).Copper).toBe(parseInt(copper.replace('#', ''), 16))
    },
  )

  it('màu lạ không có trong bảng thì suy ra, chênh cỡ JLC', () => {
    for (const hex of ['#3a5f8a', '#7a3d1f', '#cccccc']) {
      const p = realPalette(hex)
      const r = contrast(toRgb(p.Copper), toRgb(p.Oil))
      expect(r).toBeGreaterThanOrEqual(1.5)
      expect(r).toBeLessThan(2.2)
    }
  })

  it('giữ nguyên màu bo người dùng chọn, không tự nắn', () => {
    for (const c of MASK_COLORS) {
      expect(realPalette(c.hex).Oil).toBe(parseInt(c.hex.replace('#', ''), 16))
    }
  })

  it('bo sáng thì in lụa mực đen, bo tối thì mực trắng', () => {
    expect(realPalette('#b8ac00').Silkscreen).toBe(0x1a1a1a) // vàng
    expect(realPalette('#e0e0e0').Silkscreen).toBe(0x1a1a1a) // trắng
    expect(realPalette('#002864').Silkscreen).toBe(0xf2f2f2) // xanh dương
    expect(realPalette('#1c1c1c').Silkscreen).toBe(0xf2f2f2) // đen
  })

  it('màu hỏng thì lùi về xanh mặc định chứ không ra NaN', () => {
    const p = realPalette('không-phải-màu')
    expect(p.Oil).toBe(0x185428)
    expect(Number.isFinite(p.Copper)).toBe(true)
  })
})
