/**
 * Tên file tải về: không dấu, và báo giá công ty phải có chữ VAT sau tên khách —
 * một khách nhận cả bản lẻ lẫn bản VAT thì nhìn tên file là biết bản nào.
 */
import { describe, it, expect } from 'vitest'
import { createQuotation, suggestedFileName } from '../src/modules/quotation/QuotationModel'

const named = (hasVat: boolean, name: string) => {
  const q = createQuotation(hasVat)
  q.customer.name = name
  q.date = '26/09/2026'
  return suggestedFileName(q)
}

describe('tên file báo giá', () => {
  it('báo giá công ty có chữ VAT ngay sau tên khách', () => {
    expect(named(true, 'Công ty Viko')).toBe('Bao gia Cong ty Viko VAT 26_09_2026.xlsx')
  })

  it('báo giá khách lẻ không có chữ VAT', () => {
    expect(named(false, 'Công ty Viko')).toBe('Bao gia Cong ty Viko 26_09_2026.xlsx')
  })

  it('chưa nhập tên khách thì vẫn đặt được tên', () => {
    expect(named(true, '  ')).toBe('Bao gia khach hang VAT 26_09_2026.xlsx')
  })
})
