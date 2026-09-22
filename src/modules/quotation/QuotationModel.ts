/**
 * Dữ liệu một bản báo giá — độc lập hoàn toàn với Excel.
 * exportExcel.ts đọc kiểu này để dựng workbook; sau này muốn thêm PDF thì chỉ
 * viết thêm một bộ xuất đọc cùng kiểu, không phải sửa gì ở đây.
 */
import defaults from '../../config/quotation-defaults.json'
import { maskColorLabel } from '../../models/MaskColors'
import type { Board, BoardState } from '../../models/BoardDataModel'
import type { PriceBasis, StencilTier } from '../pricing/PricingModel'

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
  /**
   * Cỡ stencil của dòng này — chỉ có ở dòng thêm bằng "+ Thêm stencil". Giữ lại để đổi
   * cỡ ngay trên bảng (ô KÍCH THƯỚC thành danh sách chọn) và tính lại tiền theo SL.
   */
  stencil?: StencilTier
  /**
   * Cơ sở tính giá của bo (kích thước, phương án, panel…) — chỉ có ở dòng lấy từ bo
   * đã tính giá. Đổi SL trên form thì thành tiền tra lại từ đây. Không xuất ra file.
   */
  priceBasis?: PriceBasis
  /** Bo nguồn của dòng này — để dòng bám theo thẻ tính giá khi bên đó đổi. */
  sourceBoardId?: string
  /**
   * Dòng giảm giá. `amount` lưu SỐ ÂM nên tổng cộng tự trừ đi; luôn nằm cuối bảng
   * (xem `insertItems`).
   */
  discount?: boolean
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

/** Dòng giảm giá — người lập chỉ nhập số tiền giảm (dương), lưu thành số âm. */
export const discountItem = (): QuotationItem => ({
  ...emptyItem(),
  name: 'Giảm giá',
  discount: true,
})

/**
 * Thêm dòng mới vào bảng nhưng chừa dòng giảm giá ở cuối: giảm giá là bước sau cùng
 * trước dòng tổng, thêm bo hay stencil sau đó không được đẩy nó lên giữa bảng.
 */
export const insertItems = (items: QuotationItem[], added: QuotationItem[]): QuotationItem[] => [
  ...items.filter((it) => !it.discount),
  ...added,
  ...items.filter((it) => it.discount),
]

/** dd/MM/yyyy — đúng dạng ghi trong form mẫu. */
export const formatDate = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/**
 * Chuẩn hoá mọi chuỗi trong object về Unicode NFC (đệ quy qua object/mảng).
 *
 * Gõ tiếng Việt trên điện thoại hay dán từ một số nguồn (Zalo, bàn phím iOS) có
 * thể ra chữ ở dạng NFD — chữ cái và dấu là hai ký tự tổ hợp riêng thay vì một
 * ký tự dựng sẵn. Trên màn hình trông vẫn đúng, nhưng html2canvas (dùng khi xuất
 * PDF trên trình duyệt) vẽ dạng đó bị rớt mất dấu. Gọi hàm này ngay khi lưu vào
 * state để mọi nơi đọc ra đều là NFC, không phải sửa lại lúc xuất.
 */
export const normalizeStrings = <T>(value: T): T => {
  if (typeof value === 'string') return value.normalize('NFC') as unknown as T
  if (Array.isArray(value)) return value.map(normalizeStrings) as unknown as T
  if (value !== null && typeof value === 'object') {
    const out = {} as Record<string, unknown>
    for (const k of Object.keys(value as Record<string, unknown>)) {
      out[k] = normalizeStrings((value as Record<string, unknown>)[k])
    }
    return out as T
  }
  return value
}

/** dd/MM/yyyy -> yyyy-MM-dd cho ô chọn ngày; không đúng dạng thì trả rỗng. */
export const dateToInput = (s: string): string => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim())
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''
}

/** yyyy-MM-dd (từ ô chọn ngày) -> dd/MM/yyyy. */
export const dateFromInput = (s: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
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

/** "37*47cm" — bỏ số 0 thừa sau dấu phẩy (58.4 giữ nguyên, 40.0 thành 40). */
export const stencilSize = (t: StencilTier): string =>
  `${+t.frameW.toFixed(1)}*${+t.frameH.toFixed(1)}cm`

/** Nhãn đầy đủ cho danh sách chọn, có kèm "không khung". */
export const stencilSizeLabel = (t: StencilTier): string =>
  `${stencilSize(t)}${t.noFrame ? ' (không khung)' : ''}`

/**
 * Dòng stencil. Không phải bo nên bỏ trống SỐ LỚP và MÀU PHỦ; cột KÍCH THƯỚC chỉ ghi
 * cỡ khung cho vừa bề ngang, còn loại khung và vùng mạch đưa xuống ghi chú — vùng mạch
 * là thứ khách cần để biết bo mình có đặt vừa không.
 */
/**
 * Hai mục có phải cùng một cỡ khung không — so theo kích thước khung chứ không so
 * object, vì cỡ lưu trong dòng báo giá là bản sao chụp lúc thêm, còn bảng giá bên Cài
 * đặt có thể đã được sửa giá sau đó.
 */
export const sameStencil = (a: StencilTier, b: StencilTier): boolean =>
  a.frameW === b.frameW && a.frameH === b.frameH && !!a.noFrame === !!b.noFrame

/** Mặt cần làm stencil — theo cách gọi trong danh sách gợi ý ghi chú sẵn có. */
export type StencilSide = 'Top' | 'Bot'

/** "Stencil Khung Top" / "Stencil Không Khung Bot" — đúng mẫu ghi chú đang dùng. */
export const stencilNote = (t: StencilTier, side: StencilSide): string =>
  `Stencil ${t.noFrame ? 'Không Khung' : 'Khung'} ${side}`

/** Hai cách ghi tự sinh của một cỡ — để biết ghi chú có bị sửa tay hay chưa. */
const autoNotes = (t: StencilTier): string[] => [stencilNote(t, 'Top'), stencilNote(t, 'Bot')]

const isStencilNote = (s: string) => /^Stencil (Khung|Không Khung) (Top|Bot)$/.test(s.trim())

/** Dòng gợi ý này đã có trong ghi chú chưa. */
export const noteHas = (current: string, text: string): boolean =>
  current.split('\n').some((l) => l.trim() === text.trim())

/**
 * Bật/tắt một dòng trong danh sách gợi ý ghi chú. Bấm lần nữa là bỏ chọn, nên chọn
 * được nhiều dòng cùng lúc mà không phải gõ tay.
 *
 * Một dòng hàng mang được nhiều ghi chú (hàng gấp, phủ hai mặt, ghép panel…) nên mặc
 * định là nối thêm. Riêng ghi chú stencil thì LOẠI TRỪ nhau: chọn "Stencil Khung Bot"
 * khi đang là "Stencil Không Khung Top" phải thay chỗ, nối thêm sẽ ra hai dòng đá nhau.
 */
export const applyNoteSuggestion = (current: string, picked: string): string => {
  const lines = current.trim() ? current.trim().split('\n') : []
  const at = lines.findIndex((l) => l.trim() === picked.trim())
  if (at >= 0) return lines.filter((_, i) => i !== at).join('\n') // bấm lại = bỏ chọn
  if (lines.length === 0) return picked
  if (isStencilNote(picked)) {
    const i = lines.findIndex(isStencilNote)
    if (i >= 0) {
      lines[i] = picked
      return lines.join('\n')
    }
  }
  return [...lines, picked].join('\n')
}

/** Ghi chú panel, chỉ có khi thật sự ghép nhiều tấm. */
export const panelNote = (panelX = 1, panelY = 1): string | null =>
  panelX > 1 || panelY > 1 ? `Panel ${panelX}*${panelY}` : null

const PANEL_LINE = /^Panel\s+\d+\s*\*\s*\d+$/

/**
 * Đặt lại dòng panel trong ghi chú, giữ nguyên mọi dòng khác. Đổi cách ghép bên thẻ
 * tính giá thì dòng này đổi theo chứ không chồng thêm một dòng panel thứ hai.
 */
export const withPanelNote = (note: string, panelX = 1, panelY = 1): string => {
  const rest = note.split('\n').filter((l) => l.trim() && !PANEL_LINE.test(l.trim()))
  const line = panelNote(panelX, panelY)
  return (line ? [line, ...rest] : rest).join('\n')
}

/**
 * Bo này cần stencil mặt nào: nhìn lớp kem hàn (paste) đọc được từ Gerber. Chỉ có kem
 * mặt dưới thì là Bot, còn lại mặc định Top — người lập vẫn đổi được bằng tay ở ô ghi chú.
 */
export const stencilSideFromBoard = (board?: Board): StencilSide => {
  const paste = board?.layers.filter((l) => l.type === 'solderpaste') ?? []
  const hasTop = paste.some((l) => l.side === 'top')
  const hasBot = paste.some((l) => l.side === 'bottom')
  return hasBot && !hasTop ? 'Bot' : 'Top'
}

export const itemFromStencil = (
  tier: StencilTier,
  boardName?: string,
  side: StencilSide = 'Top'
): QuotationItem => ({
  ...emptyItem(),
  name: boardName ? `Stencil ${boardName}` : 'Stencil',
  size: stencilSize(tier),
  quantity: 1,
  amount: tier.priceVnd,
  note: stencilNote(tier, side),
  stencil: tier,
})

/**
 * Đổi cỡ stencil của một dòng: kích thước và tiền đi theo cỡ mới (tiền nhân số lượng
 * đang đặt). Ghi chú chỉ ghi đè khi người lập CHƯA sửa tay — sửa rồi thì giữ nguyên,
 * không đạp lên chữ họ viết.
 */
export const withStencil = (item: QuotationItem, tier: StencilTier): QuotationItem => {
  // Ghi chú đang là chữ app tự sinh thì viết lại theo cỡ mới, GIỮ NGUYÊN mặt đã chọn;
  // người lập gõ tay hay chọn tay trong danh sách gợi ý thì để y như vậy.
  const auto = item.stencil ? autoNotes(item.stencil) : []
  const keepNote = !auto.includes(item.note)
  const side: StencilSide = item.note === stencilNote(item.stencil ?? tier, 'Bot') ? 'Bot' : 'Top'
  return {
    ...item,
    stencil: tier,
    size: stencilSize(tier),
    amount: tier.priceVnd * (item.quantity ?? 1),
    note: keepNote ? item.note : stencilNote(tier, side),
  }
}

/**
 * Đoán tên khách từ đường dẫn thư mục chứa gerber.
 *
 * Cách sắp thư mục việc là  …\<TÊN KHÁCH>\<năm>\<ngày>\  — ví dụ
 * `D:\JobDatMach\Vu Nguyen Hoang Phuc\2026\08-09` thì khách là
 * "Vu Nguyen Hoang Phuc". Nên tìm đoạn trông như năm rồi lấy đoạn đứng ngay trước nó.
 *
 * Không thấy đoạn năm nào thì trả về rỗng chứ không đoán bừa — thà để người lập gõ
 * còn hơn điền sai tên khách lên báo giá.
 */
export const customerNameFromPath = (dir: string): string => {
  if (!dir) return ''
  const parts = dir.split(/[\\/]+/).filter(Boolean)
  // Quét từ cuối lên: thư mục ngày nằm sâu nhất, năm nằm ngay trên nó.
  for (let i = parts.length - 1; i > 0; i--) {
    if (/^(19|20)\d{2}$/.test(parts[i])) return parts[i - 1]
  }
  return ''
}

const bankFor = (hasVat: boolean): BankAccount => {
  const b = hasVat ? defaults.banks.company : defaults.banks.personal
  return { holder: b.holder, lines: [...b.lines] }
}

/** Báo giá trống, đã nạp sẵn mọi hằng số công ty theo cờ VAT. */
export const createQuotation = (hasVat: boolean, board?: BoardState): Quotation => ({
  date: formatDate(new Date()),
  customer: {
    name: customerNameFromPath(board?.sourceDir ?? ''),
    phone: '',
    taxCode: '',
    email: '',
    address: '',
  },
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

/**
 * Bỏ dấu tiếng Việt — dùng riêng cho tên file, không đụng tới nội dung file (nội
 * dung vẫn có dấu đầy đủ). Tên file không dấu để gõ, tìm và gửi qua Zalo/USB
 * không bị lỗi phông trên các máy/app cũ.
 *
 * "đ"/"Đ" không tách được bằng NFD (là một chữ cái riêng, không phải chữ + dấu tổ
 * hợp) nên phải thay tay.
 */
const stripDiacritics = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')

/** Tên file gợi ý: "Bao gia <khach> <ngay>.xlsx", không dấu, đã bỏ ký tự cấm của Windows. */
export const suggestedFileName = (q: Quotation): string => {
  const who = stripDiacritics(q.customer.name.trim() || 'khach hang')
  const safe = `Bao gia ${who} ${q.date.replace(/\//g, '_')}`
  return `${safe.replace(/[\\:*?"<>|/]/g, '-')}.xlsx`
}
