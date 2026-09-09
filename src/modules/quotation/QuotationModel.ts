/**
 * Dữ liệu một bản báo giá — độc lập hoàn toàn với Excel.
 * exportExcel.ts đọc kiểu này để dựng workbook; sau này muốn thêm PDF thì chỉ
 * viết thêm một bộ xuất đọc cùng kiểu, không phải sửa gì ở đây.
 */
import defaults from '../../config/quotation-defaults.json'
import { maskColorLabel } from '../../models/MaskColors'
import type { Board, BoardState } from '../../models/BoardDataModel'

/** Một dòng hàng trong bảng báo giá. */
export interface QuotationItem {
  id: string
  /** TÊN FILE (khách lẻ) / TÊN HÀNG HOÁ (khách công ty) */
  name: string
  /** SỐ LỚP — để chuỗi vì có dòng không phải bo (stencil, phí ship) */
  layers: string
  /** KÍCH THƯỚC, ví dụ "56*58mm" */
  size: string
  /** MÀU PHỦ, nhãn tiếng Việt */
  maskColor: string
  /** SL */
  quantity: number | null
  /**
   * THÀNH TIỀN. Đúng chiều của form mẫu: người lập nhập thành tiền,
   * ĐƠN GIÁ là công thức =THÀNH TIỀN/SL tính ngược trong Excel.
   */
  amount: number | null
  /** GHI CHÚ */
  note: string
}

export interface QuotationCustomer {
  name: string
  /** SĐT — chỉ dùng ở form không VAT */
  phone: string
  /** MST — chỉ dùng ở form có VAT */
  taxCode: string
  /** Email — chỉ dùng ở form có VAT */
  email: string
  address: string
}

export interface BankAccount {
  holder: string
  lines: string[]
}

export interface Quotation {
  /** Ngày báo giá, dd/MM/yyyy */
  date: string
  customer: QuotationCustomer
  items: QuotationItem[]
  /** Có VAT → thêm 3 dòng tổng, đổi nhãn cột B, đổi tài khoản nhận tiền */
  hasVat: boolean
  /** Thuế suất dạng thập phân (0.08 = 8%) */
  vatRate: number
  preparedBy: string
  bank: BankAccount
  notes: string[]
  defaultSpecs: string[]
  company: { name: string; address: string; contact: string }
  title: string
  intro: string
}

export const QUOTATION_DEFAULTS = defaults

let itemSeq = 0
const nextItemId = () => `item-${++itemSeq}`

export const emptyItem = (): QuotationItem => ({
  id: nextItemId(),
  name: '',
  layers: '',
  size: '',
  maskColor: '',
  quantity: null,
  amount: null,
  note: '',
})

/** dd/MM/yyyy — đúng dạng ghi trong form mẫu. */
export const formatDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/**
 * Lấy 4 trong 9 cột từ bo đang mở. Số lượng / thành tiền / ghi chú vẫn nhập tay.
 * Kích thước làm tròn về mm nguyên như trong form mẫu ("56*58mm").
 */
export const itemFromBoard = (board: Board): QuotationItem => ({
  ...emptyItem(),
  name: board.projectName,
  layers: board.layers.length > 0 ? String(board.layerCount) : '',
  size: board.bounds
    ? `${Math.round(board.bounds.widthMM)}*${Math.round(board.bounds.heightMM)}mm`
    : '',
  maskColor: maskColorLabel(board.maskColor),
})

const bankFor = (hasVat: boolean): BankAccount => {
  const b = hasVat ? defaults.banks.company : defaults.banks.personal
  return { holder: b.holder, lines: [...b.lines] }
}

/** Báo giá trống, đã nạp sẵn mọi hằng số công ty theo cờ VAT. */
export const createQuotation = (hasVat: boolean, board?: BoardState): Quotation => ({
  date: formatDate(new Date()),
  customer: { name: '', phone: '', taxCode: '', email: '', address: '' },
  items: [board?.isLoaded ? itemFromBoard(board) : emptyItem()],
  hasVat,
  vatRate: defaults.vatRate,
  preparedBy: defaults.preparedBy,
  bank: bankFor(hasVat),
  notes: hasVat ? [...defaults.notesVat] : [...defaults.notesNoVat],
  defaultSpecs: [...defaults.defaultSpecs],
  company: { ...defaults.company },
  title: defaults.title,
  intro: defaults.intro,
})

/**
 * Đổi cờ VAT thì phần cố định (ghi chú, tài khoản) phải đổi theo — nhưng chỉ khi
 * người lập chưa sửa tay. Sửa rồi thì giữ nguyên, không đạp lên công sức của họ.
 */
export const applyVatFlag = (q: Quotation, hasVat: boolean): Quotation => {
  const untouchedNotes =
    sameList(q.notes, defaults.notesVat) || sameList(q.notes, defaults.notesNoVat)
  const untouchedBank =
    sameBank(q.bank, defaults.banks.company) || sameBank(q.bank, defaults.banks.personal)
  return {
    ...q,
    hasVat,
    notes: untouchedNotes ? (hasVat ? [...defaults.notesVat] : [...defaults.notesNoVat]) : q.notes,
    bank: untouchedBank ? bankFor(hasVat) : q.bank,
  }
}

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i])

const sameBank = (a: BankAccount, b: BankAccount) =>
  a.holder === b.holder && sameList(a.lines, b.lines)

/** Tổng trước thuế — chỉ để xem trước trong panel; trong file Excel là công thức. */
export const subtotal = (q: Quotation): number =>
  q.items.reduce((sum, it) => sum + (it.amount ?? 0), 0)

export const vatAmount = (q: Quotation): number =>
  q.hasVat ? Math.round(subtotal(q) * q.vatRate) : 0

export const grandTotal = (q: Quotation): number => subtotal(q) + vatAmount(q)

/** Tên file gợi ý: "Bao gia <khách> <ngày>.xlsx", đã bỏ ký tự cấm của Windows. */
export const suggestedFileName = (q: Quotation): string => {
  const who = q.customer.name.trim() || 'khach hang'
  const safe = `Bao gia ${who} ${q.date.replace(/\//g, '_')}`
  return `${safe.replace(/[\\:*?"<>|/]/g, '-')}.xlsx`
}
