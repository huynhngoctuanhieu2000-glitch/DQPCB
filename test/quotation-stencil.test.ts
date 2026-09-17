/**
 * Dòng stencil trên báo giá: thêm từ bảng giá, đổi cỡ lại bao nhiêu lần cũng được,
 * tiền đi theo cỡ và số lượng.
 */
import { describe, it, expect } from 'vitest'
import {
  applyNoteSuggestion,
  noteHas,
  panelNote,
  withPanelNote,
  itemFromStencil,
  stencilSideFromBoard,
  sameStencil,
  stencilNote,
  stencilSize,
  stencilSizeLabel,
  withStencil,
} from '../src/modules/quotation/QuotationModel'
import { DEFAULT_CONFIG, type StencilTier } from '../src/modules/pricing/PricingModel'

const TIERS = DEFAULT_CONFIG.stencil.tiers
const noFrame = TIERS[0] // 28*38, không khung, 380.000
const framed = TIERS[2] // 37*47, 450.000
const big = TIERS[8] // 50*70, 800.000

describe('Dòng stencil', () => {
  it('cỡ khung ở cột KÍCH THƯỚC, loại khung và mặt ở GHI CHÚ', () => {
    const item = itemFromStencil(noFrame, 'Demo_PCB')
    expect(item.size).toBe('28*38cm')
    expect(item.note).toBe('Stencil Không Khung Top')
    expect(item.name).toBe('Stencil Demo_PCB')
    expect(item.quantity).toBe(1)
    expect(item.amount).toBe(380000)
    // Không phải bo nên không có số lớp / màu phủ.
    expect(item.layers).toBe('')
    expect(item.maskColor).toBe('')
  })

  it('dòng có khung ghi theo mẫu "Stencil Khung <mặt>"', () => {
    expect(itemFromStencil(framed).note).toBe('Stencil Khung Top')
    expect(itemFromStencil(framed, undefined, 'Bot').note).toBe('Stencil Khung Bot')
    expect(itemFromStencil(framed).name).toBe('Stencil')
  })

  it('nhãn trong danh sách chọn mới kèm "(không khung)"', () => {
    expect(stencilSizeLabel(noFrame)).toBe('28*38cm (không khung)')
    expect(stencilSize(noFrame)).toBe('28*38cm')
    expect(stencilSizeLabel(framed)).toBe('37*47cm')
  })

  it('đổi cỡ nhiều lần: kích thước, tiền và ghi chú đều đi theo', () => {
    let item = itemFromStencil(noFrame)
    item = withStencil(item, framed)
    expect(item.size).toBe('37*47cm')
    expect(item.amount).toBe(450000)
    expect(item.note).toBe(stencilNote(framed, 'Top'))

    item = withStencil(item, big)
    expect(item.size).toBe('50*70cm')
    expect(item.amount).toBe(800000)

    item = withStencil(item, noFrame)
    expect(item.size).toBe('28*38cm')
    expect(item.amount).toBe(380000)
    expect(item.note).toBe(stencilNote(noFrame, 'Top'))
  })

  it('đổi cỡ khi đặt nhiều tấm thì nhân theo số lượng', () => {
    const item = withStencil({ ...itemFromStencil(noFrame), quantity: 3 }, framed)
    expect(item.amount).toBe(450000 * 3)
  })

  it('ghi chú đã sửa tay thì không bị đạp lên', () => {
    const edited = { ...itemFromStencil(noFrame), note: 'Khách dặn cắt lỗ to hơn 0.05' }
    expect(withStencil(edited, framed).note).toBe('Khách dặn cắt lỗ to hơn 0.05')
    // Ghi chú tự sinh thì vẫn cập nhật theo cỡ mới.
    expect(withStencil(itemFromStencil(noFrame), framed).note).toBe(stencilNote(framed, 'Top'))
  })

  it('nhận ra cùng một cỡ dù giá trong Cài đặt đã đổi', () => {
    const raised: StencilTier = { ...framed, priceVnd: 500000 }
    expect(sameStencil(framed, raised)).toBe(true)
    expect(sameStencil(framed, big)).toBe(false)
    // Khung cùng số đo nhưng một bên không khung thì là hai cỡ khác nhau.
    expect(sameStencil(noFrame, { ...noFrame, noFrame: false })).toBe(false)
  })

  it('đoán mặt từ lớp kem hàn: chỉ có kem mặt dưới thì là Bot', () => {
    const board = (sides: string[]) =>
      ({ layers: sides.map((side) => ({ type: 'solderpaste', side })) }) as any
    expect(stencilSideFromBoard(board(['bottom']))).toBe('Bot')
    expect(stencilSideFromBoard(board(['top']))).toBe('Top')
    // Bo có kem cả hai mặt, hoặc không có lớp kem nào, thì mặc định Top.
    expect(stencilSideFromBoard(board(['top', 'bottom']))).toBe('Top')
    expect(stencilSideFromBoard(board([]))).toBe('Top')
    expect(stencilSideFromBoard(undefined)).toBe('Top')
  })

  it('đổi cỡ thì giữ nguyên mặt đã chọn', () => {
    const bot = itemFromStencil(noFrame, undefined, 'Bot')
    expect(withStencil(bot, framed).note).toBe('Stencil Khung Bot')
  })

  it('chọn tay một ghi chú khác trong danh sách gợi ý thì giữ nguyên', () => {
    // Mặt hàng không khung nhưng người lập chọn "Stencil Khung Bot" — không đạp lên.
    const picked = { ...itemFromStencil(noFrame), note: 'Stencil Khung Bot' }
    expect(withStencil(picked, big).note).toBe('Stencil Khung Bot')
  })

  it('chọn ghi chú stencil khác thì THAY dòng cũ, không nối thêm', () => {
    expect(applyNoteSuggestion('Stencil Không Khung Top', 'Stencil Khung Bot')).toBe('Stencil Khung Bot')
    expect(applyNoteSuggestion('', 'Stencil Khung Top')).toBe('Stencil Khung Top')
  })

  it('chọn được nhiều dòng, bấm lại là bỏ chọn', () => {
    let note = applyNoteSuggestion('', 'Stencil Khung Top')
    note = applyNoteSuggestion(note, 'Hàng gấp - hoả tốc')
    note = applyNoteSuggestion(note, 'Phủ 2 mặt')
    expect(note.split('\n')).toEqual(['Stencil Khung Top', 'Hàng gấp - hoả tốc', 'Phủ 2 mặt'])
    expect(noteHas(note, 'Hàng gấp - hoả tốc')).toBe(true)

    // Bấm lại dòng giữa: chỉ dòng đó mất, hai dòng kia giữ nguyên thứ tự.
    note = applyNoteSuggestion(note, 'Hàng gấp - hoả tốc')
    expect(note.split('\n')).toEqual(['Stencil Khung Top', 'Phủ 2 mặt'])
    expect(noteHas(note, 'Hàng gấp - hoả tốc')).toBe(false)

    // Bỏ hết thì về rỗng.
    note = applyNoteSuggestion(applyNoteSuggestion(note, 'Phủ 2 mặt'), 'Stencil Khung Top')
    expect(note).toBe('')
  })

  it('ghi chú panel chỉ hiện khi thật sự ghép', () => {
    expect(panelNote(1, 1)).toBeNull()
    expect(panelNote()).toBeNull()
    expect(panelNote(2, 3)).toBe('Panel 2*3')
    expect(panelNote(1, 4)).toBe('Panel 1*4')
  })

  it('đổi cách ghép thì THAY dòng panel, giữ nguyên các dòng khác', () => {
    const gap = 'Hàng gấp - hoả tốc'
    expect(withPanelNote('', 2, 3)).toBe('Panel 2*3')
    expect(withPanelNote(gap, 2, 3)).toBe(`Panel 2*3\n${gap}`)
    // Ghép lại kiểu khác: một dòng panel duy nhất, không chồng thêm dòng thứ hai.
    expect(withPanelNote(`Panel 2*3\n${gap}`, 4, 1)).toBe(`Panel 4*1\n${gap}`)
    // Bỏ ghép panel thì dòng đó biến mất, ghi chú khác vẫn còn.
    expect(withPanelNote(`Panel 2*3\n${gap}`, 1, 1)).toBe(gap)
    expect(withPanelNote('Panel 2*3', 1, 1)).toBe('')
  })

  it('ghi chú thường vẫn cộng dồn, và dòng stencil chỉ thay đúng dòng của nó', () => {
    const gap = 'Hàng gấp - hoả tốc'
    expect(applyNoteSuggestion(gap, 'Phủ 2 mặt')).toBe(`${gap}\nPhủ 2 mặt`)
    expect(applyNoteSuggestion(gap, 'Stencil Khung Top')).toBe(`${gap}\nStencil Khung Top`)
    expect(applyNoteSuggestion(`Stencil Khung Top\n${gap}`, 'Stencil Khung Bot')).toBe(
      `Stencil Khung Bot\n${gap}`,
    )
  })
})

