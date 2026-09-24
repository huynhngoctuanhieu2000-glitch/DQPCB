/**
 * File Excel phải cùng bố cục với bản xem trước (cùng bề rộng cột, cùng cỡ chữ, cùng
 * khổ in) — in từ Excel ra phải giống PDF xuất thẳng. Đây là chỗ giữ giao kèo đó:
 * đổi số trong sheetLayout.ts thì cả hai bên cùng đổi, đổi lệch là test kêu.
 */
import { describe, it, expect } from 'vitest'
import { buildQuotationWorkbook } from '../src/modules/quotation/exportExcel'
import { createQuotation, emptyItem } from '../src/modules/quotation/QuotationModel'
import { COL_PX, FONT_PX, ROW_PX, colChars, pt } from '../src/modules/quotation/sheetLayout'

const sample = () => {
  const q = createQuotation(false)
  q.items = [
    { ...emptyItem(), name: 'Project Outputs for TDA7498E', layers: '2', quantity: 5, amount: 1174000 },
  ]
  return q
}

describe('file Excel khớp bản xem trước', () => {
  it('bề rộng cột đúng bằng cột của bản xem trước, đổi ra ký tự', () => {
    const ws = buildQuotationWorkbook(sample()).worksheets[0]
    expect(COL_PX.map((_, i) => ws.getColumn(i + 1).width)).toEqual(COL_PX.map(colChars))
    // Tổng bề ngang = bề ngang in được của A4 ngang, lề 8mm (1062 px ở 96 dpi).
    expect(COL_PX.reduce((a, b) => a + b, 0)).toBe(1062)
  })

  it('cỡ chữ ghi bằng point, đúng bằng cỡ px của bản xem trước', () => {
    const ws = buildQuotationWorkbook(sample()).worksheets[0]
    expect(ws.getCell('A9').font?.size).toBe(pt(FONT_PX.tableHead))
    expect(ws.getCell('B10').font?.size).toBe(pt(FONT_PX.cellWide))
    expect(ws.getCell('A8').font?.size).toBe(pt(FONT_PX.intro))
    expect(ws.getCell('A3').font?.size).toBe(pt(FONT_PX.title))
  })

  it('chiều cao hàng theo bản xem trước; dòng hàng để Excel tự nới', () => {
    const ws = buildQuotationWorkbook(sample()).worksheets[0]
    expect(ws.getRow(1).height! + ws.getRow(2).height!).toBe(pt(ROW_PX.head))
    expect(ws.getRow(9).height).toBe(pt(ROW_PX.tableHead))
    // Dòng hàng không đặt chiều cao: tên file dài xuống hai dòng phải hiện đủ.
    expect(ws.getRow(10).height).toBeUndefined()
  })

  it('in A4 ngang, lề 8mm, tờ ngắn thì ép vừa một trang', () => {
    const ws = buildQuotationWorkbook(sample()).worksheets[0]
    expect(ws.pageSetup.orientation).toBe('landscape')
    expect(ws.pageSetup.paperSize).toBe(9)
    expect(ws.pageSetup.fitToWidth).toBe(1)
    expect(ws.pageSetup.fitToHeight).toBe(1)
    expect(ws.pageSetup.margins?.left).toBeCloseTo(8 / 25.4, 3)
    expect(ws.pageSetup.margins?.top).toBeCloseTo(8 / 25.4, 3)
  })

  it('báo giá dài thì cho sang trang thứ hai thay vì co nhỏ tí', () => {
    const q = sample()
    q.items = Array.from({ length: 40 }, () => ({ ...emptyItem(), name: 'Bo', quantity: 1, amount: 1000 }))
    const ws = buildQuotationWorkbook(q).worksheets[0]
    expect(ws.pageSetup.fitToHeight).toBe(0)
  })
})
