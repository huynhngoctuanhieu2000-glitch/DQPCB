/**
 * Thông số đặt hàng (kiểu JLC) → phương án trong bảng giá.
 *
 * Điểm quan trọng: tổ hợp nào bảng giá chưa có thì trả null để thẻ báo "chưa có công
 * thức", KHÔNG rơi về một phương án gần giống. Bo 6 lớp từng bị báo theo giá 4 lớp.
 */
import { describe, it, expect } from 'vitest'
import { defaultSpec, optionForSpec, specSummary, type BoardSpec } from '../src/modules/pricing/BoardSpec'
import rules from '../src/config/pricing-rules.json'

const KEYS = (rules as { options: { key: string }[] }).options.map((o) => o.key)
const spec = (patch: Partial<BoardSpec> = {}): BoardSpec => ({ ...defaultSpec(2), ...patch })

describe('optionForSpec', () => {
  it('bo FR4 thường: theo số lớp', () => {
    expect(optionForSpec(spec({ layers: 1 }), KEYS)).toBe('L1')
    expect(optionForSpec(spec(), KEYS)).toBe('L2')
    expect(optionForSpec(spec({ layers: 4 }), KEYS)).toBe('L4')
  })

  it('số lớp chưa có đơn giá thì không ra phương án', () => {
    expect(optionForSpec(spec({ layers: 6 }), KEYS)).toBeNull()
    expect(optionForSpec(spec({ layers: 16 }), KEYS)).toBeNull()
  })

  it('độ dày 0.6–1.6 mm tính như nhau, dày hơn thì chưa có giá', () => {
    for (const t of [0.6, 0.8, 1.0, 1.2, 1.6]) {
      expect(optionForSpec(spec({ thicknessMm: t }), KEYS)).toBe('L2')
    }
    expect(optionForSpec(spec({ thicknessMm: 2.0 }), KEYS)).toBeNull()
  })

  it('HASL chì và không chì cùng một giá', () => {
    expect(optionForSpec(spec({ finish: 'HASL_LF' }), KEYS)).toBe('L2')
  })

  it('mạ vàng chỉ có giá cho bo 2 lớp đồng 1oz', () => {
    expect(optionForSpec(spec({ finish: 'ENIG' }), KEYS)).toBe('ENIG2')
    expect(optionForSpec(spec({ finish: 'ENIG', layers: 4 }), KEYS)).toBeNull()
    expect(optionForSpec(spec({ finish: 'ENIG', copperOz: 2 }), KEYS)).toBeNull()
  })

  it('đồng dày: chỉ bo 2 lớp, theo đúng khoá OZ trong bảng giá', () => {
    expect(optionForSpec(spec({ copperOz: 2 }), KEYS)).toBe('OZ2')
    expect(optionForSpec(spec({ copperOz: 2.5 }), KEYS)).toBe('OZ2_5')
    expect(optionForSpec(spec({ copperOz: 4.5 }), KEYS)).toBe('OZ4_5')
    expect(optionForSpec(spec({ copperOz: 2, layers: 4 }), KEYS)).toBeNull()
  })

  it('mạch dẻo có giá, bo nhôm thì chưa', () => {
    expect(optionForSpec(spec({ material: 'FLEX' }), KEYS)).toBe('FLEX')
    expect(optionForSpec(spec({ material: 'FLEX', layers: 4 }), KEYS)).toBeNull()
    expect(optionForSpec(spec({ material: 'ALU' }), KEYS)).toBeNull()
  })

  it('phương án chưa có trong cấu hình thì trả null, không bịa khoá', () => {
    expect(optionForSpec(spec({ copperOz: 2.5 }), ['L1', 'L2'])).toBeNull()
  })
})

describe('specSummary', () => {
  it('ghi đủ năm thông số để dán vào cảnh báo hoặc báo giá', () => {
    expect(specSummary(spec({ copperOz: 2 }))).toBe('FR4 · 2 lớp · HASL chì · 1.6 mm · 2 oz')
  })
})
