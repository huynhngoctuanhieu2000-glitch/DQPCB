/**
 * Đối chiếu với sheet "Bản giá mới 7_26".
 *
 * Bảy ca T1-T7 lấy thẳng số đang hiện trong sheet (Bảng 6, mục 07 của báo cáo), nên
 * mỗi lần đụng vào PricingModel là biết ngay có làm lệch giá không. Phần còn lại khoá
 * lại các quyết định đã chốt ở chỗ sheet đang sai.
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_CONFIG,
  computePrice,
  fitsTable,
  fitsStencil,
  pickStencil,
  priceFromFormula,
  priceFromTable,
  roundUp,
  type PricingConfig,
} from '../src/modules/pricing/PricingModel'

const CFG = DEFAULT_CONFIG

/** Mọi ca trong Bảng 6 đều là 20 × 35 cm, 15 pcs, không rail, không phí thêm. */
const base = { boardW: 20, boardH: 35, qty: 15 }

describe('roundUp — ROUNDUP của Sheets, không phải Math.round', () => {
  it('làm tròn lên ở mọi bậc', () => {
    expect(roundUp(2852500, -3)).toBe(2853000)
    expect(roundUp(3717700, -3)).toBe(3718000)
    expect(roundUp(4.25, 1)).toBe(4.3)
    expect(roundUp(6.6, 0)).toBe(7)
  })

  it('đã là bội số thì đứng yên, không nhảy lên bậc kế', () => {
    expect(roundUp(4446000, -3)).toBe(4446000)
    expect(roundUp(587, 0)).toBe(587)
  })

  it('làm tròn RA XA số 0 với số âm', () => {
    expect(roundUp(-1200, -3)).toBe(-2000)
  })

  it('khử được nhiễu dấu phẩy động', () => {
    // 4.25*10 ra 42.499999999999996 — Math.ceil trần trụi sẽ cho 4.3 -> sai thành 4.3
    // ở ca này thì đúng, nhưng 0.29*100 = 28.999999999999996 thì cho 29 chứ không phải 30.
    expect(roundUp(0.29, 2)).toBe(0.29)
    expect(roundUp(3.99 + 0.26, 1)).toBe(4.3)
  })
})

describe('Bảng 6 — bảy ca đối chiếu sheet', () => {
  const cases = [
    { id: 'T1', option: 'L2', mode: 'tiered', costCny: 617.5, priceVnd: 3718000, rounded: 3717000 },
    { id: 'T2', option: 'L2', mode: 'flat', costCny: 617.5, priceVnd: 4446000, vat: 4669000 },
    { id: 'T3', option: 'L1', mode: 'flat', costCny: 523.5, priceVnd: 3770000, vat: 3959000 },
    { id: 'T4', option: 'L4', mode: 'flat', costCny: 863.5, priceVnd: 6218000, vat: 6529000 },
    { id: 'T5', option: 'ENIG2', mode: 'flat', costCny: 812.5, priceVnd: 5850000, vat: 6143000 },
    { id: 'T6', option: 'OZ2', mode: 'flat', costCny: 822.5, priceVnd: 5922000, vat: 6219000 },
    { id: 'T7', option: 'FLEX', mode: 'flat', costCny: 1020.5, priceVnd: 7348000, vat: 7716000 },
  ] as const

  for (const c of cases) {
    it(`${c.id} — ${c.option} · ${c.mode}`, () => {
      const r = priceFromFormula({ ...base, option: c.option, mode: c.mode }, CFG)
      expect(r.costCny).toBe(c.costCny)
      expect(r.priceVnd).toBe(c.priceVnd)
      if ('rounded' in c) expect(r.priceRoundedVnd).toBe(c.rounded)
      if ('vat' in c) expect(r.priceWithVatVnd).toBe(c.vat)
    })
  }

  it('các đại lượng trung gian khớp sheet (F3, G3, N3)', () => {
    const r = priceFromFormula({ ...base, option: 'L2' }, CFG)
    expect(r.boardAreaCm2).toBe(700)
    expect(r.totalAreaCm2).toBe(10500)
    expect(r.weightKg).toBe(4.3)
    expect(r.bigBoardFeeCny).toBe(30.5)
  })

  it('T1 và T2 cùng giá vốn nhưng hai giá bán lệch nhau (F-02)', () => {
    const a = priceFromFormula({ ...base, option: 'L2', mode: 'tiered' }, CFG)
    const b = priceFromFormula({ ...base, option: 'L2', mode: 'flat' }, CFG)
    expect(a.costCny).toBe(b.costCny)
    expect(b.priceVnd).toBeGreaterThan(a.priceVnd)
  })

  it('đơn giá là giá chia số lượng (J3)', () => {
    const r = priceFromFormula({ ...base, option: 'L2', mode: 'tiered' }, CFG)
    expect(r.unitPriceVnd).toBeCloseTo(247866.67, 2)
  })
})

describe('Chỗ sheet đang sai', () => {
  it('F-04 — phí thêm được cộng cả ở phương án 1 lớp', () => {
    const no = priceFromFormula({ ...base, option: 'L1', mode: 'flat' }, CFG)
    const yes = priceFromFormula({ ...base, option: 'L1', mode: 'flat', extraFeeCny: 50 }, CFG)
    expect(yes.costCny - no.costCny).toBe(50)
    expect(yes.priceVnd).toBeGreaterThan(no.priceVnd)
  })

  it('F-06 — mọi phương án đổi nhánh tại cùng một mốc 50 pcs', () => {
    // Sheet dùng `<=` riêng ở dòng 4 lớp nên tại đúng 50 pcs nó lệch nhánh với 5 dòng kia.
    // Ở đây cả sáu phải nhảy cùng lúc: 49 dùng nhánh nhỏ, 50 dùng nhánh lớn.
    for (const o of CFG.options) {
      const smallAt = (qty: number) =>
        o.small.base + o.small.area * (700 * qty)
      const at = (qty: number) => priceFromFormula({ ...base, qty, option: o.key }, CFG)

      const q49 = at(49)
      const q50 = at(50)
      // 49 pcs: giá vốn thô đúng bằng nhánh <50
      expect(q49.costCny - q49.bigBoardFeeCny).toBe(roundUp(smallAt(49), 0))
      // 50 pcs: đã sang nhánh có phí khuôn theo panel
      expect(q50.costCny - q50.bigBoardFeeCny).toBe(
        roundUp(o.large.base + o.large.board * 700 + o.large.area * (700 * 50), 0),
      )
    }
  })

  it('F-11 — số lượng 0 và kích thước âm thì ném lỗi, không trả Infinity', () => {
    expect(() => priceFromFormula({ ...base, qty: 0, option: 'L2' }, CFG)).toThrow(/Số lượng/)
    expect(() => priceFromFormula({ ...base, boardW: -1, option: 'L2' }, CFG)).toThrow(/Kích thước/)
    expect(() => computePrice({ boardW: 5, boardH: 5, qty: 0, option: 'L2' }, CFG)).toThrow(/Số lượng/)
  })

  it('F-05 — priceRounded và priceWithVat là hai thứ khác nhau', () => {
    const r = priceFromFormula({ ...base, option: 'L2', mode: 'flat' }, CFG)
    expect(r.priceRoundedVnd).toBeLessThanOrEqual(r.priceVnd)
    expect(r.priceWithVatVnd).toBeGreaterThan(r.priceVnd)
  })

  it('phương án không tồn tại thì ném lỗi có tên', () => {
    expect(() => priceFromFormula({ ...base, option: 'L8' }, CFG)).toThrow(/L8/)
  })
})

describe('Bảng giá cố định dưới 10x10cm', () => {
  const T = CFG.table

  it('cả 11 mốc trả đúng giá nhà máy', () => {
    const expected: [number, number][] = [
      [5, 180000],
      [10, 210000],
      [15, 348000],
      [20, 395000],
      [25, 472000],
      [30, 531000],
      [40, 683000],
      [50, 832000],
      [100, 1443000],
      [150, 2083000],
      [200, 2483000],
    ]
    for (const [qty, priceVnd] of expected) {
      const r = priceFromTable(qty, T)
      expect(r.kind).toBe('table')
      if (r.kind !== 'table') return
      expect(r.priceVnd).toBe(priceVnd)
      expect(r.unitPriceVnd).toBe(priceVnd / qty)
    }
  })

  it('số lượng ngoài mốc thì báo off-table chứ không nội suy', () => {
    const r = priceFromTable(60, T)
    expect(r.kind).toBe('off-table')
    if (r.kind !== 'off-table') return
    expect(r.below?.qty).toBe(50)
    expect(r.above?.qty).toBe(100)
  })

  it('vượt mốc cuối cũng là off-table, không ngoại suy', () => {
    const r = priceFromTable(300, T)
    expect(r.kind).toBe('off-table')
    if (r.kind !== 'off-table') return
    expect(r.above).toBeNull()
    expect(r.below?.qty).toBe(200)
  })

  it('dưới mốc nhỏ nhất cũng là off-table', () => {
    const r = priceFromTable(3, T)
    expect(r.kind).toBe('off-table')
    if (r.kind !== 'off-table') return
    expect(r.below).toBeNull()
    expect(r.above?.qty).toBe(5)
  })

  it('ngưỡng kích thước tính theo cạnh dài, bo xoay 90° vẫn lọt', () => {
    expect(fitsTable(100, 100, T)).toBe(true)
    expect(fitsTable(50, 90, T)).toBe(true)
    expect(fitsTable(90, 50, T)).toBe(true)
    expect(fitsTable(100.01, 50, T)).toBe(false)
    expect(fitsTable(121.4, 86.4, T)).toBe(false)
  })
})

describe('computePrice — chọn đường giá', () => {
  it('bo nhỏ, không ghép panel → bảng tra', () => {
    const r = computePrice({ boardW: 8, boardH: 6, qty: 10, option: 'L2' }, CFG)
    expect(r.kind).toBe('table')
    if (r.kind !== 'table') return
    expect(r.priceVnd).toBe(210000)
  })

  it('bo nhỏ nhưng CÓ ghép panel → công thức', () => {
    const r = computePrice({ boardW: 8, boardH: 6, qty: 10, option: 'L2', panelX: 2 }, CFG)
    expect(r.kind).toBe('formula')
  })

  it('bo nhỏ nhưng chọn loại bảng giá không có → công thức', () => {
    // Bảng nhà máy chỉ một cột giá, không phân biệt loại bo. Báo giá bo mạ vàng bằng
    // giá bo thường là sai tiền thật, nên phải rơi sang công thức.
    for (const key of ['L4', 'ENIG2', 'OZ2', 'FLEX']) {
      const r = computePrice({ boardW: 8, boardH: 6, qty: 10, option: key }, CFG)
      expect(r.kind, key).toBe('formula')
    }
    expect(computePrice({ boardW: 8, boardH: 6, qty: 10, option: 'L2' }, CFG).kind).toBe('table')
    // Nhà máy tính bo 1 lớp và 2 lớp dưới 10 x 10 cm cùng một bảng (26/09/2026).
    expect(computePrice({ boardW: 8, boardH: 6, qty: 10, option: 'L1' }, CFG).kind).toBe('table')
  })

  it('đổi danh sách loại bo trong cấu hình thì bảng áp theo đúng danh sách', () => {
    const cfg: PricingConfig = { ...CFG, table: { ...CFG.table, coversOptions: ['L1'] } }
    expect(computePrice({ boardW: 8, boardH: 6, qty: 10, option: 'L1' }, cfg).kind).toBe('table')
    expect(computePrice({ boardW: 8, boardH: 6, qty: 10, option: 'L2' }, cfg).kind).toBe('formula')
  })

  it('bo lớn → công thức, kể cả khi số lượng trùng mốc bảng', () => {
    const r = computePrice({ boardW: 20, boardH: 35, qty: 50, option: 'L2' }, CFG)
    expect(r.kind).toBe('formula')
  })

  it('ép dùng công thức thì bỏ qua bảng tra', () => {
    const r = computePrice({ boardW: 8, boardH: 6, qty: 10, option: 'L2', forceFormula: true }, CFG)
    expect(r.kind).toBe('formula')
  })
})

describe('Cấu hình sửa được mà không đụng code', () => {
  it('đổi tỉ giá thì đường flat đổi theo', () => {
    const cfg: PricingConfig = {
      ...CFG,
      formula: { ...CFG.formula, vndPerCny: 4200 },
    }
    const r = priceFromFormula({ ...base, option: 'L2', mode: 'flat' }, cfg)
    expect(r.priceVnd).toBe(roundUp(617.5 * 4200 * 1.8, -3))
  })

  it('thêm mốc số lượng mới vào bảng thì tra được ngay', () => {
    const cfg: PricingConfig = {
      ...CFG,
      table: { ...CFG.table, tiers: [...CFG.table.tiers, { qty: 60, priceVnd: 990000 }] },
    }
    const r = priceFromTable(60, cfg.table)
    expect(r.kind).toBe('table')
    if (r.kind !== 'table') return
    expect(r.priceVnd).toBe(990000)
  })
})

describe('Bảng giá stencil (Bang Gia STENCIL 8_8_22)', () => {
  const S = CFG.stencil.tiers

  it('đủ 18 cỡ khung, đúng thứ tự trong bảng giá', () => {
    expect(S).toHaveLength(18)
    expect(S[0]).toEqual({ frameW: 28, frameH: 38, noFrame: true, areaW: 19, areaH: 29, priceVnd: 380000, weightKg: 0.8 })
    expect(S[7]).toMatchObject({ frameW: 58.4, frameH: 58.4, areaW: 38, areaH: 38, priceVnd: 850000, weightKg: 3.2 })
    expect(S[17]).toMatchObject({ frameW: 50, frameH: 150, areaW: 32, areaH: 130, priceVnd: 1400000, weightKg: 8 })
  })

  it('chỉ cỡ nhỏ nhất là tấm không khung', () => {
    expect(S.filter((t) => t.noFrame)).toHaveLength(1)
  })

  it('vùng mạch luôn nhỏ hơn khung', () => {
    for (const t of S) {
      expect(t.areaW).toBeLessThan(t.frameW)
      expect(t.areaH).toBeLessThan(t.frameH)
    }
  })
})

describe('Chọn cỡ stencil cho bo', () => {
  const ST = CFG.stencil

  it('bo xoay 90° vẫn tính là vừa', () => {
    const t = ST.tiers[1] // khung 30*40, vùng mạch 14*24
    expect(fitsStencil(14, 24, t)).toBe(true)
    expect(fitsStencil(24, 14, t)).toBe(true)
    expect(fitsStencil(14.1, 24, t)).toBe(false)
  })

  it('chọn cỡ RẺ NHẤT vừa bo, không phải cỡ nhỏ nhất', () => {
    // Bo 30*45: vừa khung 50*70 (vùng 32*50, 800.000) lẫn khung 55*65 (vùng 35*45,
    // 950.000). Chọn theo cỡ khung thì ra 55*65 đắt hơn 150.000 mà không cần thiết.
    const pick = pickStencil(30, 45, ST)!
    expect(pick.priceVnd).toBe(800000)
    expect(pick.frameW).toBe(50)
    expect(pick.frameH).toBe(70)
  })

  it('bo nhỏ lấy tấm không khung 380.000', () => {
    expect(pickStencil(10, 15, ST)).toMatchObject({ noFrame: true, priceVnd: 380000 })
  })

  it('bo quá khổ thì không có cỡ nào', () => {
    expect(pickStencil(60, 200, ST)).toBeNull()
  })

  it('cùng giá thì lấy khung nhỏ hơn', () => {
    // 950.000 có ba khung: 40*100, 55*65, 50*80 — 55*65 (3575cm²) nhỏ nhất.
    const pick = pickStencil(34, 44, ST)!
    expect(pick.priceVnd).toBe(950000)
    expect(pick.frameW * pick.frameH).toBe(55 * 65)
  })
})
