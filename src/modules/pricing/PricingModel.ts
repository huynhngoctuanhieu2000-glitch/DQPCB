/**
 * Tính giá — hàm thuần, không đọc file, không format, không đụng React.
 *
 * Port thẳng từ "Bản giá mới 7_26" (xem Tinh gia/bao-cao-cong-thuc-gia.html).
 * Các lỗi F-xx nêu trong báo cáo đã được vá ngay tại đây, chỗ nào vá thì có chú thích.
 *
 * Hai đường giá hoàn toàn tách nhau:
 *   - BẢNG TRA  : bo dưới 10x10cm không ghép panel. Nhà máy chỉ có 11 mốc số lượng,
 *                 ngoài mốc thì KHÔNG suy ra được — trả về 'off-table' để người lập nhập tay.
 *   - CÔNG THỨC : mọi trường hợp còn lại, tính từ diện tích.
 */
import rules from '../../config/pricing-rules.json'

// ── Kiểu cấu hình ────────────────────────────────────────────────

export interface PriceTier {
  qty: number
  priceVnd: number
}

export interface TableConfig {
  /**
   * Những phương án mà bảng giá này áp. Bảng nhà máy chỉ có một cột giá, không phân biệt
   * loại bo — nên chọn mạ vàng hay mạch dẻo thì bảng không còn đúng nữa và phải chuyển
   * sang công thức, kẻo báo giá bo mạ vàng bằng giá bo thường.
   *
   * Nhà máy tính bo 1 lớp và 2 lớp dưới 10 × 10 cm cùng một bảng (chốt 26/09/2026), nên
   * mặc định là cả hai; sửa được trong Cài đặt → Công thức tính tiền.
   */
  coversOptions: string[]
  maxWidthMm: number
  maxHeightMm: number
  tiers: PriceTier[]
}

export interface OptionConfig {
  key: string
  label: string
  small: { base: number; area: number }
  large: { base: number; board: number; area: number }
}

export type PriceMode = 'flat' | 'tiered'

export interface FormulaConfig {
  vndPerCny: number
  flatMarkup: number
  marginMultiplier: number
  qtyBreak: number
  vatRate: number
  unitRoundVnd: number
  defaultMode: PriceMode
  weight: { kgPerCm2: number; packingKg: number; roundToKg: number }
  bigBoard: { thresholdCm2: number; stepCm2: number; cnyPerStep: number; areaDivisor: number }
  tiered: {
    vndPerCny: number
    domesticShip: { baseCny: number; firstKg: number; stepKg: number; cnyPerStep: number }
    freightVndPerKg: number
    fixedFeeVnd: number
    finalFactor: number
    /** maxVnd = null nghĩa là bậc cuối, không có trần. */
    tiers: { maxVnd: number | null; factor: number }[]
  }
}

/** Một cỡ stencil khung nhôm. Mọi kích thước tính bằng cm. */
export interface StencilTier {
  /** Kích thước khung (tấm) */
  frameW: number
  frameH: number
  /** Tấm trần, không có khung nhôm — cỡ nhỏ nhất */
  noFrame?: boolean
  /** Vùng mạch: bo lớn nhất đặt vừa khung này */
  areaW: number
  areaH: number
  /** Giá một tấm */
  priceVnd: number
  /** Khối lượng, để tính cước gửi */
  weightKg: number
}

export interface StencilConfig {
  tiers: StencilTier[]
}

/** Ghép panel. */
export interface PanelConfig {
  note?: string
  /** Bề rộng rail MỖI CẠNH (mm) điền sẵn khi chọn kiểu rail trên thẻ tính giá. */
  defaultRailMm: number
}

export interface PricingConfig {
  table: TableConfig
  formula: FormulaConfig
  options: OptionConfig[]
  stencil: StencilConfig
  panel: PanelConfig
}

/** Cấu hình gốc đọc từ JSON. PricingStore phủ chỉnh sửa của người dùng lên trên. */
export const DEFAULT_CONFIG: PricingConfig = rules as unknown as PricingConfig

// ── ROUNDUP của Sheets ───────────────────────────────────────────

/**
 * Luôn làm tròn RA XA số 0, ở mọi bậc: roundUp(x, -3) lên bội 1.000,
 * roundUp(x, 1) lên bội 0,1.
 *
 * Đây là chỗ port sang JS hay sai nhất — Math.round() cho kết quả khác, và qua bốn
 * bậc làm tròn liên tiếp thì lệch thấy được. toPrecision(12) để khử nhiễu dấu phẩy
 * động: 4.25*10 ra 42.499999999999996, Math.ceil sẽ cho 43 thay vì 42.5.
 */
export function roundUp(x: number, digits = 0): number {
  const f = Math.pow(10, digits)
  const scaled = Number((x * f).toPrecision(12))
  return (scaled < 0 ? -Math.ceil(-scaled) : Math.ceil(scaled)) / f
}

// ── Đầu vào / đầu ra ─────────────────────────────────────────────

export interface PriceInput {
  /** cm, một tấm (B6, C6) */
  boardW: number
  boardH: number
  /** số tấm ghép mỗi chiều (B5, C5) */
  panelX?: number
  panelY?: number
  /** rail cộng thêm mỗi chiều, cm (B4, C4) */
  railX?: number
  railY?: number
  /** số lượng đặt (D3) */
  qty: number
  /** khoá phương án trong config.options */
  option: string
  /** phụ phí thủ công, CNY (O3) — F-04: cộng cho MỌI phương án */
  extraFeeCny?: number
  /** F-02: hai đường giá phải gọi tên rõ, không để cạnh nhau như sheet */
  mode?: PriceMode
}

export interface FormulaResult {
  kind: 'formula'
  mode: PriceMode
  /** kích thước panel thành phẩm, cm (B3, C3) */
  panelW: number
  panelH: number
  /** diện tích một panel, cm² (S) */
  boardAreaCm2: number
  /** F-13: diện tích ĐÃ nhân số lượng, cm² (F3) — sheet gọi nhầm là "Diện tích" */
  totalAreaCm2: number
  /** kg cả đơn (G3) */
  weightKg: number
  /** phí bo lớn, CNY (N3) */
  bigBoardFeeCny: number
  /** giá vốn quy đổi, CNY (M3) */
  costCny: number
  priceVnd: number
  unitPriceVnd: number
  /** K3: làm tròn XUỐNG bội 100 của đơn giá — F-05: không phải VAT như nhãn sheet */
  priceRoundedVnd: number
  /** K8..K12: cộng thuế — F-05 tách hẳn khỏi priceRoundedVnd */
  priceWithVatVnd: number
}

export interface TableResult {
  kind: 'table'
  qty: number
  priceVnd: number
  unitPriceVnd: number
}

/**
 * Số lượng không nằm trong các mốc của nhà máy. Không nội suy, không ngoại suy —
 * nhà máy không có mốc đó nên mọi con số suy ra đều là bịa. Trả về hai mốc kề để
 * người lập tự quyết rồi nhập tay.
 */
export interface OffTableResult {
  kind: 'off-table'
  qty: number
  below: PriceTier | null
  above: PriceTier | null
  message: string
}

export type PriceResult = FormulaResult | TableResult | OffTableResult

// ── Đường bảng tra ───────────────────────────────────────────────

/** Bo có đủ nhỏ để dùng bảng giá cố định không (chưa xét ghép panel). */
export function fitsTable(widthMm: number, heightMm: number, table: TableConfig): boolean {
  // Bo xoay 90° vẫn là bo đó — so cạnh dài với cạnh dài.
  const long = Math.max(widthMm, heightMm)
  const short = Math.min(widthMm, heightMm)
  const maxLong = Math.max(table.maxWidthMm, table.maxHeightMm)
  const maxShort = Math.min(table.maxWidthMm, table.maxHeightMm)
  return long <= maxLong && short <= maxShort
}

// ── Stencil ──────────────────────────────────────────────────────

/** Bo (cm) có đặt vừa vùng mạch của cỡ khung này không — xoay 90° vẫn tính là vừa. */
export function fitsStencil(boardW: number, boardH: number, t: StencilTier): boolean {
  const long = Math.max(boardW, boardH)
  const short = Math.min(boardW, boardH)
  return long <= Math.max(t.areaW, t.areaH) && short <= Math.min(t.areaW, t.areaH)
}

/**
 * Cỡ khung rẻ nhất mà bo đặt vừa. Rẻ nhất chứ không phải nhỏ nhất: bảng giá không
 * tăng đều theo cỡ (khung 50×70 giá 800.000 trong khi khung 58.4×58.4 nhỏ hơn lại
 * 850.000), nên chọn theo cỡ sẽ báo giá đắt hơn mức cần thiết.
 */
export function pickStencil(
  boardW: number,
  boardH: number,
  stencil: StencilConfig
): StencilTier | null {
  const fit = stencil.tiers.filter((t) => fitsStencil(boardW, boardH, t))
  if (fit.length === 0) return null
  return fit.reduce((best, t) =>
    t.priceVnd !== best.priceVnd
      ? t.priceVnd < best.priceVnd
        ? t
        : best
      : // Cùng giá thì lấy khung nhỏ hơn cho dễ thao tác.
        t.frameW * t.frameH < best.frameW * best.frameH
        ? t
        : best
  )
}

export function priceFromTable(qty: number, table: TableConfig): TableResult | OffTableResult {
  const tiers = [...table.tiers].sort((a, b) => a.qty - b.qty)
  const hit = tiers.find((t) => t.qty === qty)
  if (hit) {
    return { kind: 'table', qty, priceVnd: hit.priceVnd, unitPriceVnd: hit.priceVnd / qty }
  }

  const below = [...tiers].reverse().find((t) => t.qty < qty) ?? null
  const above = tiers.find((t) => t.qty > qty) ?? null
  const last = tiers[tiers.length - 1]

  return {
    kind: 'off-table',
    qty,
    below,
    above,
    message: above
      ? `Nhà máy không có mốc ${qty} pcs — chỉ có ${below ? below.qty : tiers[0]?.qty} và ${above.qty} pcs.`
      : `Nhà máy không có mốc ${qty} pcs — bảng giá dừng ở ${last ? last.qty : 0} pcs.`,
  }
}

// ── Đường công thức ──────────────────────────────────────────────

export function priceFromFormula(input: PriceInput, cfg: PricingConfig): FormulaResult {
  const { boardW, boardH, qty } = input
  const panelX = input.panelX ?? 1
  const panelY = input.panelY ?? 1
  const railX = input.railX ?? 0
  const railY = input.railY ?? 0
  const extraFeeCny = input.extraFeeCny ?? 0
  const F = cfg.formula
  const mode = input.mode ?? F.defaultMode

  // F-11: chặn ngay đầu vào, đừng để chia cho 0 đi sâu vào trong rồi trả Infinity.
  if (!(qty > 0)) throw new Error('Số lượng phải lớn hơn 0')
  if (!(boardW > 0 && boardH > 0)) throw new Error('Kích thước phải lớn hơn 0')

  const option = cfg.options.find((o) => o.key === input.option)
  if (!option) throw new Error(`Không có phương án giá "${input.option}"`)

  // Rail cộng MỘT lần cho cả panel, không nhân theo số tấm.
  const panelW = boardW * panelX + railX // B3
  const panelH = boardH * panelY + railY // C3
  const boardAreaCm2 = panelW * panelH // S
  const totalAreaCm2 = boardAreaCm2 * qty // F3

  // G3 — hệ số kg/cm² ứng với FR4 1,6mm; bao bì cộng một lần cho cả đơn nên đơn
  // càng lớn càng loãng. Làm tròn lên 0,1 kg.
  const weightKg = roundUp(
    totalAreaCm2 * F.weight.kgPerCm2 + F.weight.packingKg,
    F.weight.roundToKg,
  )

  // N3 — phí bo lớn. F-12: vế thứ hai nhân tổng diện tích nên phí tăng tuyến tính
  // theo số lượng và không có trần. Giữ đúng sheet cho tới khi chính sách được chốt lại.
  let bigBoardFeeCny = 0
  const B = F.bigBoard
  if (boardAreaCm2 > B.thresholdCm2) {
    const steps = roundUp((boardAreaCm2 - B.thresholdCm2) / B.stepCm2, 0)
    bigBoardFeeCny = steps * B.cnyPerStep + (steps * totalAreaCm2) / B.areaDivisor
  }

  // M — giá vốn (CNY). F-06: một mốc qtyBreak, một toán tử `<` cho mọi phương án
  // (sheet dùng `<=` riêng ở dòng 4 lớp nên lệch nhánh đúng tại 50 pcs).
  const rawCny =
    qty < F.qtyBreak
      ? option.small.base + option.small.area * totalAreaCm2
      : option.large.base + option.large.board * boardAreaCm2 + option.large.area * totalAreaCm2

  // F-09: marginMultiplier thay cho hệ số *1 chết trong sheet.
  // F-04: phí thêm cộng ở một chỗ chung — sheet quên cộng ở dòng 1 lớp.
  const costCny = roundUp(rawCny * F.marginMultiplier, 0) + bigBoardFeeCny + extraFeeCny

  const priceVnd =
    mode === 'flat'
      ? roundUp(costCny * F.vndPerCny * F.flatMarkup, -3) // P3
      : tieredPrice(costCny, weightKg, F) // I3

  const unitPriceVnd = priceVnd / qty // J3

  return {
    kind: 'formula',
    mode,
    panelW,
    panelH,
    boardAreaCm2,
    totalAreaCm2,
    weightKg,
    bigBoardFeeCny,
    costCny,
    priceVnd,
    unitPriceVnd,
    priceRoundedVnd: priceVnd - (unitPriceVnd % F.unitRoundVnd) * qty,
    priceWithVatVnd: roundUp(priceVnd * (1 + F.vatRate), -3),
  }
}

/**
 * I3 — đường giá bậc thang. base tính MỘT lần rồi gán biến; sheet lặp nguyên khối
 * biểu thức này 6 lần trong cùng một ô (F-07).
 */
function tieredPrice(costCny: number, weightKg: number, F: FormulaConfig): number {
  const T = F.tiered
  const D = T.domesticShip

  // Cước nội địa Trung Quốc, CNY: 13 cho 1 kg đầu, +1 mỗi 0,5 kg sau đó.
  const shipCny =
    weightKg < D.firstKg
      ? D.baseCny
      : D.baseCny + roundUp((weightKg - D.firstKg) / D.stepKg, 0) * D.cnyPerStep

  const base =
    roundUp((shipCny + costCny) * T.vndPerCny + weightKg * T.freightVndPerKg, -3) + T.fixedFeeVnd

  const tier = T.tiers.find((t) => t.maxVnd === null || base < t.maxVnd)
  if (!tier) throw new Error('Bậc giá cuối phải có maxVnd = null')

  return roundUp(roundUp(base * tier.factor, -3) * T.finalFactor, -3)
}

// ── Cửa vào chung ────────────────────────────────────────────────

export interface ComputeInput extends PriceInput {
  /** Người lập ép dùng công thức dù bo nhỏ (vd bo nhỏ nhưng có yêu cầu riêng). */
  forceFormula?: boolean
}

/**
 * Mọi thứ cần để tính giá TRỪ số lượng. Dòng báo giá lấy từ bo mang theo cái này,
 * để người lập đổi số lượng ngay trên form là thành tiền tính lại được, không phải
 * quay về thẻ tính giá.
 */
export type PriceBasis = Omit<ComputeInput, 'qty'>

/**
 * Bo này có đi đường bảng tra không: đủ nhỏ, không ghép panel, VÀ đúng loại bo mà
 * bảng giá nhà máy áp.
 */
export function usesTable(input: ComputeInput, cfg: PricingConfig): boolean {
  const panelised = (input.panelX ?? 1) > 1 || (input.panelY ?? 1) > 1
  return (
    !input.forceFormula &&
    !panelised &&
    tableCovers(cfg.table, input.option) &&
    fitsTable(input.boardW * 10, input.boardH * 10, cfg.table)
  )
}

/** Bảng giá nhà máy có áp cho phương án này không. */
export const tableCovers = (table: TableConfig, option: string | null | undefined): boolean =>
  !!option && (table.coversOptions ?? []).includes(option)

/** Tên các loại bo mà bảng giá áp, để ghi ra cho người lập đọc. */
export const tableCoverLabels = (cfg: PricingConfig): string =>
  (cfg.table.coversOptions ?? [])
    .map((k) => cfg.options.find((o) => o.key === k)?.label ?? k)
    .join(', ')

/** Chọn đường giá rồi tính. */
export function computePrice(input: ComputeInput, cfg: PricingConfig): PriceResult {
  if (!(input.qty > 0)) throw new Error('Số lượng phải lớn hơn 0')
  return usesTable(input, cfg) ? priceFromTable(input.qty, cfg.table) : priceFromFormula(input, cfg)
}
