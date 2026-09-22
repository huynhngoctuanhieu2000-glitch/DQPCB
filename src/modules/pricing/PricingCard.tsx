/**
 * Cột phải: thông tin bo và báo giá gộp làm một.
 *
 * Kích thước và loại bo vừa là thông tin đọc từ Gerber vừa là đầu vào tính giá — để
 * hai bảng riêng thì mỗi thứ hiện hai lần (mm chỉ đọc ở trên, cm sửa được ở dưới).
 * Gộp lại: đọc từ Gerber sẵn, sửa tay ngay tại dòng đó nếu cần.
 *
 * Trường hợp thường gặp nhất — bo dưới 10x10cm, không ghép panel — thì chỉ có một
 * việc phải làm: bấm một mốc số lượng. Mọi thứ còn lại (panel, rail, phí thêm) nằm
 * trong phần xổ ra, chỉ bung khi bo lớn hoặc khi người lập cần.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { BoardDataModel, type BoardState } from '../../models/BoardDataModel'
import { MASK_COLORS } from '../../models/MaskColors'
import type { QuotationSeed } from '../quotation/QuotationPanel'
import { panelNote, stencilSideFromBoard, stencilSizeLabel, type StencilSide } from '../quotation/QuotationModel'
import { PricingStore } from './PricingStore'
import { PanelPreview, type BoardShape, type PanelKind } from './PanelPreview'
import { copperSamplePoints, detectPanel, loopPolygon, splitOutlineLoops } from '../../lib/gerber-reader'
import {
  COPPER_CHOICES,
  FINISHES,
  LAYER_CHOICES,
  MATERIALS,
  THICKNESS_CHOICES,
  defaultSpec,
  optionForSpec,
  specNoteParts,
  specSummary,
  type BoardSpec,
} from './BoardSpec'
import {
  computePrice,
  pickStencil,
  fitsTable,
  usesTable,
  type PriceBasis,
  type PriceMode,
  type PriceResult,
  type PricingConfig,
} from './PricingModel'

const money = (n: number) => Math.round(n).toLocaleString('vi-VN')

const parseNum = (raw: string): number | null => {
  const s = raw.replace(/[^\d.,-]/g, '').replace(',', '.')
  if (s === '' || s === '-') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

const parseDigits = (raw: string): number | null => {
  const s = raw.replace(/\D/g, '')
  return s === '' ? null : Number(s)
}

/** Những gì người lập đã nhập trên thẻ cho một bo. */
interface CardInputs {
  qty: number | null
  panelOn: boolean
  qtyFrom: 'pcs' | 'sets'
  setCount: number | null
  panelKind: PanelKind
  spec: BoardSpec
  specTouched: boolean
  mode: PriceMode | null
  panelX: number
  panelY: number
  railX: number
  railY: number
  extraFeeCny: number
  forceFormula: boolean
  manualAmount: number | null
  sizeOverride: { w: number; h: number } | null
  stencilOn: boolean
  stencilPick: number | null
  stencilSide: StencilSide | null
}

/**
 * Nhớ phần nhập của từng bo theo id, để đổi qua lại giữa các bo không mất số.
 * Để ở mức module chứ không phải state: chỉ có một thẻ tính giá trong app, và id bo
 * không bao giờ dùng lại nên bo đã đóng để lại một mục thừa vô hại.
 */
const cardMemory = new Map<string, CardInputs>()

export const PricingCard: React.FC<{
  board: BoardState
  /**
   * Báo lên mỗi khi giá của bo đang mở đổi (null = chưa ra được giá), để form báo
   * giá — mở lúc nào cũng được — lấy đúng con số đã tính cho từng bo. Phải ổn định
   * (useCallback) vì nằm trong deps của effect.
   */
  onPriceChange: (boardId: string, price: QuotationSeed | null) => void
  onSendToQuotation: () => void
  onOpenSettings: () => void
}> = ({ board, onPriceChange, onSendToQuotation, onOpenSettings }) => {
  const [cfg, setCfg] = useState<PricingConfig>(PricingStore.getConfig())
  useEffect(() => PricingStore.subscribe(setCfg), [])

  /** Số PCB khách đặt (luôn là số bo lẻ, kể cả khi ghép panel). */
  const [qty, setQty] = useState<number | null>(5)
  /** Có ghép panel không. Tắt thì mọi ô panel/rail coi như 1×1, rail 0. */
  const [panelOn, setPanelOn] = useState(false)
  /**
   * Ghép panel nhập từ đâu:
   *   'pcs'  — xưởng ghép: nhập số PCB, ra số set; tấm = bo × X×Y + rail.
   *   'sets' — khách gửi file ĐÃ GHÉP SẴN: Gerber chính là tấm panel; nhập số set, ra số
   *            PCB. Không nhân X×Y vào kích thước, không cộng rail (rail nằm sẵn trong file).
   * Cả hai đều tính tiền theo số set × diện tích tấm (chốt 21/09/2026).
   */
  const [qtyFrom, setQtyFrom] = useState<'pcs' | 'sets'>('pcs')
  /** Số set nhập tay, chỉ dùng khi qtyFrom = 'sets'. */
  const [setCount, setSetCount] = useState<number | null>(1)
  /** Kiểu ghép: V-cut cần tấm đủ lớn cho máy cắt; mouse bite (phay + cầu) thì không. */
  const [panelKind, setPanelKind] = useState<PanelKind>('vcut')
  const [spec, setSpec] = useState<BoardSpec>(() => defaultSpec(2))
  const [mode, setMode] = useState<PriceMode | null>(null)
  const [panelX, setPanelX] = useState(1)
  const [panelY, setPanelY] = useState(1)
  const [railX, setRailX] = useState(0)
  const [railY, setRailY] = useState(0)
  const [extraFeeCny, setExtraFeeCny] = useState(0)
  const [forceFormula, setForceFormula] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  /** Khối thông số bo mở hay thu gọn. Thu gọn chỉ hiện một dòng tóm tắt — mở bo xong
   *  phần lớn lần chỉ cần liếc qua, không phải sửa. */
  const [specOpen, setSpecOpen] = useState(false)
  /** Thành tiền gõ tay — chỉ dùng khi số lượng rơi ngoài bảng giá nhà máy. */
  const [manualAmount, setManualAmount] = useState<number | null>(null)
  /** Kích thước gõ tay, cm. null = bám theo bo đang mở. */
  const [sizeOverride, setSizeOverride] = useState<{ w: number; h: number } | null>(null)

  /** Có làm stencil kèm bo không — có thì "Đưa vào báo giá" thêm một dòng stencil. */
  const [stencilOn, setStencilOn] = useState(false)
  /** Cỡ khung chọn tay (chỉ số trong bảng giá stencil); null = cỡ rẻ nhất vừa tấm. */
  const [stencilPick, setStencilPick] = useState<number | null>(null)
  /** Mặt stencil chọn tay; null = theo lớp kem hàn (paste) đọc được trong Gerber. */
  const [stencilSide, setStencilSide] = useState<StencilSide | null>(null)

  /** Người lập đã tự sửa thông số chưa — sửa rồi thì đổi bo mới được đạp lên. */
  const [specTouched, setSpecTouched] = useState(false)
  /** Sửa một ô thông số; mọi ô đều tính là "đã sửa tay". */
  const editSpec = (patch: Partial<BoardSpec>) => {
    setSpec((prev) => ({ ...prev, ...patch }))
    setSpecTouched(true)
  }

  // Đổi bo thì cất lại những gì đang nhập cho bo cũ và lấy ra bản đã nhập của bo mới —
  // mở hai bo, tính bo 1 xong sang bo 2 rồi quay lại bo 1 phải thấy đúng số lượng đã
  // nhập, không phải số của bo 2. Bo chưa từng nhập thì về mặc định, với phương án
  // suy từ số lớp Gerber (người lập chọn tay rồi thì không giật lại giữa chừng).
  //
  // Chỉnh ngay trong lúc render theo đúng khuôn "điều chỉnh state khi prop đổi" của
  // React, không dùng effect: effect sẽ vẽ một lượt bằng giá của bo cũ rồi mới sửa,
  // người dùng thấy giá nhấp nháy — và tệ hơn, lượt vẽ đó báo lên Layout giá SAI cho
  // bo mới trước khi kịp sửa.
  const [seenBoardId, setSeenBoardId] = useState(board.activeBoardId)
  if (board.activeBoardId !== seenBoardId) {
    if (seenBoardId) {
      cardMemory.set(seenBoardId, {
        qty, panelOn, qtyFrom, setCount, panelKind, spec, specTouched, mode, panelX, panelY, railX, railY,
        extraFeeCny, forceFormula, manualAmount, sizeOverride, stencilOn, stencilPick, stencilSide,
      })
    }
    setSeenBoardId(board.activeBoardId)
    const saved = board.activeBoardId ? cardMemory.get(board.activeBoardId) : undefined
    if (saved) {
      setQty(saved.qty)
      setPanelOn(saved.panelOn)
      setQtyFrom(saved.qtyFrom)
      setSetCount(saved.setCount)
      setPanelKind(saved.panelKind)
      setSpec(saved.spec)
      setSpecTouched(saved.specTouched)
      setMode(saved.mode)
      setPanelX(saved.panelX)
      setPanelY(saved.panelY)
      setRailX(saved.railX)
      setRailY(saved.railY)
      setExtraFeeCny(saved.extraFeeCny)
      setForceFormula(saved.forceFormula)
      setManualAmount(saved.manualAmount)
      setSizeOverride(saved.sizeOverride)
      setStencilOn(saved.stencilOn)
      setStencilPick(saved.stencilPick)
      setStencilSide(saved.stencilSide)
    } else {
      setPanelOn(false)
      setStencilOn(false)
      setStencilPick(null)
      setStencilSide(null)
      setQtyFrom('pcs')
      setSizeOverride(null)
      setManualAmount(null)
      setSpecTouched(false)
      if (board.isLoaded) setSpec(defaultSpec(board.layerCount))
    }
  }

  // Số lớp chọn tay báo lên model, để nhãn ở 2 Mặt và ảnh copy ghi đúng số lớp sẽ đặt.
  // Trùng số lớp Gerber thì coi như không sửa.
  const layersOverride = specTouched && spec.layers !== board.layerCount ? spec.layers : null
  useEffect(() => {
    if (board.activeBoardId) BoardDataModel.setLayersOverride(layersOverride)
  }, [board.activeBoardId, layersOverride])

  // Thông số đặt hàng → phương án trong bảng giá. Không có thì để rỗng: computePrice sẽ
  // báo lỗi "không có phương án", đúng ý không lấy giá loại khác thay vào.
  const optionKeys = useMemo(() => cfg.options.map((o) => o.key), [cfg])
  const option = useMemo(() => optionForSpec(spec, optionKeys), [spec, optionKeys])

  // Phải memo theo GIÁ TRỊ kích thước, không theo object bounds: object mới mỗi lượt
  // render sẽ kéo basis → effect báo giá → Layout setState → render lại, lặp vô hạn.
  const boardW = board.bounds?.widthMM
  const boardH = board.bounds?.heightMM
  const boardCm = useMemo(
    () => (boardW !== undefined && boardH !== undefined ? { w: boardW / 10, h: boardH / 10 } : null),
    [boardW, boardH],
  )
  const size = sizeOverride ?? boardCm

  // Ghép panel: công thức giá tính theo SỐ SET (diện tích = panel × số set), còn người lập
  // nghĩ theo số PCB khách đặt. Giữ số PCB làm gốc, số set = làm tròn lên PCB ÷ bo/set.
  const perSet = panelOn ? Math.max(1, panelX) * Math.max(1, panelY) : 1
  const fromSets = panelOn && qtyFrom === 'sets'
  /** Số đưa vào công thức giá: số set khi ghép panel, số PCB khi bo lẻ. */
  const orderQty = fromSets ? setCount : qty === null ? null : panelOn ? Math.ceil(qty / perSet) : qty
  /** Số PCB thật khách nhận. */
  const pcsCount = fromSets ? (setCount === null ? null : setCount * perSet) : qty
  // File ghép sẵn: Gerber đã là tấm panel → công thức coi như bo 1×1, không rail.
  const tiled = panelOn && !fromSets
  const usePanel = { panelX: tiled ? panelX : 1, panelY: tiled ? panelY : 1, railX: tiled ? railX : 0, railY: tiled ? railY : 0 }
  /** Gõ một số lượng (mốc bảng giá, nút gợi ý) vào đúng ô đang là ô nhập. */
  const setOrderInput = (n: number) => (fromSets ? setSetCount(n) : setQty(n))
  /** Đảo ô nhập ⇄ ô kết quả, giữ nguyên con số đang có. */
  const swapQtyInput = () => {
    if (fromSets) {
      setQty(pcsCount)
      setQtyFrom('pcs')
    } else {
      setSetCount(orderQty)
      setQtyFrom('sets')
    }
  }

  // Tách cơ sở (mọi thứ trừ số lượng) ra riêng vì nó theo dòng báo giá sang form —
  // đổi SL trên form thì form tra lại từ đúng cơ sở này.
  const basis = useMemo(
    (): PriceBasis | null =>
      // Chưa có phương án cho thông số đang chọn thì KHÔNG tính: ô đỏ phía trên đã nói
      // rõ vì sao, khỏi kèm thêm dòng lỗi thô của computePrice.
      size && option
        ? {
            boardW: size.w,
            boardH: size.h,
            option,
            ...usePanel,
            extraFeeCny,
            // Bảng tra nhà máy chỉ cho bo ĐƠN LẺ: không ghép panel, không nhiều thiết kế,
            // không mouse bite/V-cut. Tích Ghép panel (kể cả file ghép sẵn) là đi công thức.
            forceFormula: forceFormula || panelOn,
            ...(mode ? { mode } : null),
          }
        : null,
    [size, option, panelOn, qtyFrom, panelX, panelY, railX, railY, extraFeeCny, forceFormula, mode],
  )
  const input = useMemo(() => (basis && orderQty ? { ...basis, qty: orderQty } : null), [basis, orderQty])

  const { result, error } = useMemo((): { result: PriceResult | null; error: string | null } => {
    if (!input) return { result: null, error: null }
    try {
      return { result: computePrice(input, cfg), error: null }
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [input, cfg])

  const onTablePath = input ? usesTable(input, cfg) : false

  // Đi công thức thì tính luôn CẢ HAI đường giá để người lập nhìn hai số cạnh nhau
  // rồi tích chọn — số nào đang chọn mới là số đưa vào báo giá (qua `mode`).
  const bothModes = useMemo(() => {
    if (!input || result?.kind !== 'formula') return null
    try {
      const flat = computePrice({ ...input, mode: 'flat' }, cfg)
      const tiered = computePrice({ ...input, mode: 'tiered' }, cfg)
      return flat.kind === 'formula' && tiered.kind === 'formula' ? { flat, tiered } : null
    } catch {
      return null
    }
  }, [input, result, cfg])
  // Bo nhỏ mà vẫn phải đi công thức thì phải nói rõ vì sao, không để người lập đoán.
  const tableBlockedBy =
    size && fitsTable(size.w * 10, size.h * 10, cfg.table)
      ? panelOn
        ? 'đã ghép panel'
        : option && option !== cfg.table.coversOption
          ? `loại "${cfg.options.find((o) => o.key === option)?.label ?? option}" không nằm trong bảng giá nhà máy (bảng chỉ có ${cfg.options.find((o) => o.key === cfg.table.coversOption)?.label ?? cfg.table.coversOption})`
          : null // người lập tự gạt sang Công thức thì không cần giải thích
      : null

  // Bảng tra dùng được không, BỎ QUA lựa chọn của người lập — để nút gạt biết có
  // cho bấm "Bảng tra" hay không, và nói được vì sao không.
  const tableUnavailable = !size
    ? 'chưa có kích thước bo'
    : !option
      ? 'chưa có công thức cho thông số đang chọn'
    : !fitsTable(size.w * 10, size.h * 10, cfg.table)
      ? 'bo lớn hơn khổ bảng giá nhà máy'
      : panelOn
        ? 'đã ghép panel'
        : option !== cfg.table.coversOption
          ? `bảng giá nhà máy chỉ có loại ${cfg.options.find((o) => o.key === cfg.table.coversOption)?.label ?? cfg.table.coversOption}`
          : null

  const amount =
    result?.kind === 'table' || result?.kind === 'formula' ? result.priceVnd : manualAmount
  // Chưa có công thức giá (hoặc ngoài bảng mà chưa gõ tiền) vẫn đưa vào báo giá được:
  // dòng báo giá có đủ tên, số lớp, kích thước, màu, ghi chú — thành tiền để trống.
  const priced = amount !== null && amount > 0
  const canSend = board.isLoaded && !!orderQty

  // Gõ tay đè lên kích thước Gerber thì báo giá phải ghi theo số đã tính giá, kẻo
  // dòng báo giá ghi một đằng mà tiền tính một nẻo. Dạng "200*350mm" khớp cột
  // KÍCH THƯỚC của form mẫu.
  const sizeText = sizeOverride
    ? `${Math.round(sizeOverride.w * 10)}*${Math.round(sizeOverride.h * 10)}mm`
    : undefined


  // ── Nhắc nhở kỹ thuật (mốc của xưởng, chốt 21/09/2026) ──
  // Cạnh bo < 15 mm: máy không kẹp được bo lẻ, phải ghép V-cut → giá tính có V-cut.
  const MIN_BOARD_EDGE_MM = 15
  // Ghép V-cut: tấm panel phải có cả hai cạnh ≥ 70 mm cho máy cắt V; mouse bite thì không.
  const MIN_VCUT_PANEL_MM = 70
  const boardMinMm = size ? Math.min(size.w, size.h) * 10 : null
  const panelMm = size
    ? { w: (size.w * usePanel.panelX + usePanel.railX) * 10, h: (size.h * usePanel.panelY + usePanel.railY) * 10 }
    : null
  const smallBoardWarn =
    boardMinMm !== null && boardMinMm < MIN_BOARD_EDGE_MM
      ? `Bo có cạnh ${+boardMinMm.toFixed(2)} mm < ${MIN_BOARD_EDGE_MM} mm — phải ghép V-cut, tính giá có V-cut.`
      : null
  const vcutPanelWarn =
    panelOn && panelKind === 'vcut' && panelMm && Math.min(panelMm.w, panelMm.h) < MIN_VCUT_PANEL_MM
      ? `Tấm panel ${+panelMm.w.toFixed(2)} × ${+panelMm.h.toFixed(2)} mm có cạnh < ${MIN_VCUT_PANEL_MM} mm — V-cut cần cả hai cạnh ≥ ${MIN_VCUT_PANEL_MM} mm. Tăng số bo, thêm rail, hoặc ghép mouse bite.`
      : null

  // Hình viền thật của một bo (mm, gốc ở góc dưới-trái) cho sơ đồ ghép panel. Tính một
  // lần theo bộ lớp; kích thước sửa tay thì co giãn theo khi vẽ.
  const gerberShape = useMemo(() => {
    const ol = board.layers.find((l) => l.type === 'outline' && l.imageTree?.parts?.length)
    if (!ol) return null
    const sc = ol.imageTree.units === 'in' ? 25.4 : 1
    const parts = ol.imageTree.parts
    const sp = parts.length > 1
      ? splitOutlineLoops(parts, { scale: sc, copperPoints: copperSamplePoints(board.layers) })
      : { body: parts, cutouts: [] as any[] }
    const body = sp.body.map((pt: any) => loopPolygon(pt, sc)).filter((pl: number[][]) => pl.length >= 3)
    const holes = sp.cutouts.map((pt: any) => loopPolygon(pt, sc)).filter((pl: number[][]) => pl.length >= 3)
    if (body.length === 0) return null
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of body.flat()) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y)
    }
    const norm = (pl: number[][]) => pl.map(([x, y]) => [x - x0, y - y0])
    return { body: body.map(norm), holes: holes.map(norm), w: x1 - x0, h: y1 - y0 }
  }, [board.layers])
  const boardShape = useMemo((): BoardShape | null => {
    if (!gerberShape || !size || !(gerberShape.w > 0) || !(gerberShape.h > 0)) return null
    const sx = (size.w * 10) / gerberShape.w, sy = (size.h * 10) / gerberShape.h
    const fit = (pl: number[][]) => pl.map(([x, y]) => [x * sx, y * sy])
    return { body: gerberShape.body.map(fit), holes: gerberShape.holes.map(fit) }
  }, [gerberShape, size])

  // File có nhiều bo = khách gửi file đã ghép. Bảng tra chỉ cho bo lẻ, và số lượng phải
  // nhập theo set — nhắc để người lập không báo giá theo bảng tra như một bo đơn. Nhận biết
  // bằng viền rời HOẶC bo lặp lại (panel chỉ ngăn bằng rãnh / V-cut) — xem detectPanel.
  const boardsInFile = useMemo(
    () => (board.layers.length ? detectPanel(board.layers, { names: [board.projectName], bounds: board.bounds }) : null),
    [board.layers, board.projectName, board.bounds],
  )
  const multiBoards = boardsInFile && boardsInFile.verdict === 'yes' && boardsInFile.count >= 2 ? boardsInFile : null
  /** Bật chế độ "file ghép sẵn" với đúng số bo đọc được trong viền. */
  const useAsPrePanel = () => {
    if (!multiBoards) return
    const grid = multiBoards.cols * multiBoards.rows === multiBoards.count
    setPanelOn(true)
    setQtyFrom('sets')
    setPanelX(grid ? multiBoards.cols : multiBoards.count)
    setPanelY(grid ? multiBoards.rows : 1)
    // Giữ số PCB đang nhập: quy ra số set, làm tròn lên.
    setSetCount(Math.max(1, Math.ceil((qty ?? multiBoards.count) / multiBoards.count)))
  }

  // ── Gợi ý stencil: khung rẻ nhất vừa TẤM sẽ in (panel nếu ghép, bo lẻ nếu không),
  // mặt nào có lớp paste thì mặt đó cần một tấm. ──
  const pasteSides = ['top', 'bottom'].filter((side) => board.layers.some((l) => l.type === 'solderpaste' && l.side === side))
  const stencilTier = panelMm ? pickStencil(panelMm.w / 10, panelMm.h / 10, cfg.stencil) : null
  /** Mặt stencil theo Gerber: có kem cả hai mặt thì một tấm làm Top + Bot. */
  const autoSide = stencilSideFromBoard(board.isLoaded ? board : undefined)
  /** Stencil sẽ đưa vào báo giá: cỡ chọn tay hoặc cỡ gợi ý, mặt chọn tay hoặc theo Gerber. */
  const stencilChoice = useMemo(() => {
    if (!stencilOn) return null
    const tier = stencilPick !== null ? cfg.stencil.tiers[stencilPick] : stencilTier
    return tier ? { tier, side: stencilSide ?? autoSide } : null
  }, [stencilOn, stencilPick, stencilTier, stencilSide, autoSide, cfg])

  // Ghi chú tự điền cho dòng báo giá, gộp một dòng: thông số khác mặc định rồi đến panel.
  // Vd "Mạ vàng ENIG, Bo 0.8mm, Đồng 2oz, Panel 2*5 · 50 set · Rail 5mm".
  const autoNote = [
    ...specNoteParts(spec),
    ...(panelOn ? [panelNote(panelX, panelY, orderQty, tiled ? Math.max(railX, railY) * 10 : 0)] : []),
  ]
    .filter(Boolean)
    .join(', ')

  // Chỉ báo khi thẻ đã đồng bộ với bo đang mở — lượt render ngay sau khi đổi bo vẫn
  // còn cầm số của bo cũ, báo lúc đó là gắn giá bo cũ cho bo mới.
  const synced = board.activeBoardId === seenBoardId
  useEffect(() => {
    if (!board.activeBoardId || !synced) return
    onPriceChange(
      board.activeBoardId,
      canSend
        ? {
            boardId: board.activeBoardId,
            // Cột SL của báo giá ghi SỐ BO (400), không phải số set (50) — số set đã có
            // trong ghi chú panel. Giá vẫn tính theo set; pcsPerSet để báo giá quy ngược.
            quantity: pcsCount!,
            ...(panelOn ? { pcsPerSet: perSet } : null),
            amount: priced ? amount : null,
            basis: priced ? basis : null,
            ...(sizeText ? { size: sizeText } : null),
            note: autoNote,
            ...(stencilChoice ? { stencil: stencilChoice } : null),
          }
        : null,
    )
  }, [onPriceChange, synced, canSend, priced, board.activeBoardId, orderQty, pcsCount, perSet, panelOn, amount, basis, sizeText, autoNote, stencilChoice])

  /** Đơn giá dưới thành tiền: bo lẻ ghi / pcs; ghép panel ghi / set và quy ra / pcs. */
  const unitText = (priceVnd: number) =>
    panelOn && orderQty
      ? [`${money(priceVnd / orderQty)} đ / set`, `${money(priceVnd / (pcsCount || orderQty * perSet))} đ / pcs`].join('\n')
      : `${money(priceVnd / (orderQty || 1))} đ / pcs`

  // Kích thước hiện bằng mm cho khớp số đọc từ Gerber và cột KÍCH THƯỚC của báo giá;
  // state vẫn giữ cm vì công thức giá tính bằng cm.
  const mm = (cm: number) => +(cm * 10).toFixed(2)
  const folder = !board.isLoaded
    ? '--'
    : board.sourceDir || (window.electronFiles ? 'không đọc được đường dẫn' : 'chạy trên trình duyệt')

  return (
    <div>
      {/* ── Thông tin bo — đọc từ Gerber; kích thước và loại bo sửa được để báo giá ── */}
      <InfoRow label="Tên bo">{board.projectName || '--'}</InfoRow>

      <InfoRow label="Kích thước">
        <div style={S.sizeGroup}>
          <input
            style={S.sizeInput}
            value={size ? mm(size.w) : ''}
            placeholder="—"
            onChange={(e) => {
              const w = parseNum(e.target.value)
              setSizeOverride({ w: (w ?? 0) / 10, h: size?.h ?? 0 })
            }}
          />
          <span style={S.times}>×</span>
          <input
            style={S.sizeInput}
            value={size ? mm(size.h) : ''}
            placeholder="—"
            onChange={(e) => {
              const h = parseNum(e.target.value)
              setSizeOverride({ w: size?.w ?? 0, h: (h ?? 0) / 10 })
            }}
          />
          <span style={S.unit}>mm</span>
        </div>
      </InfoRow>
      {sizeOverride && boardCm && (
        <div style={S.originLine}>
          <span style={S.originManual}>đã sửa tay</span>
          <button style={S.linkInline} onClick={() => setSizeOverride(null)}>
            ↺ về {mm(boardCm.w)} × {mm(boardCm.h)} theo Gerber
          </button>
        </div>
      )}

      {smallBoardWarn && <div style={S.warn}>⚠ {smallBoardWarn}</div>}
      {multiBoards && !panelOn && (
        <div style={S.warn}>
          ⚠ File có <b>{multiBoards.count}{multiBoards.partial ? '+' : ''} bo</b> (
          {multiBoards.method === 'outline' ? 'viền rời' : 'bo lặp lại'}) — có vẻ đã ghép sẵn. Bảng tra chỉ cho bo
          lẻ; tính theo file ghép sẵn thì nhập số set.
          {multiBoards.partial && ' Có bo khác mẫu / xoay nên số bo có thể nhiều hơn — kiểm lại.'}
          <button style={S.warnBtn} onClick={useAsPrePanel}>
            Dùng: file ghép sẵn {multiBoards.count} bo/set
          </button>
        </div>
      )}
      {!multiBoards && !panelOn && boardsInFile?.verdict === 'maybe' && boardsInFile.method === 'repeat' && (
        <div style={S.warn}>
          ⚠ Có thể là file ghép: {boardsInFile.detail}. Nếu đúng là ghép sẵn thì tích Ghép panel và nhập số set.
        </div>
      )}
      {multiBoards && panelOn && fromSets && perSet !== multiBoards.count && (
        <div style={S.warn}>
          ⚠ File có {multiBoards.count}{multiBoards.partial ? '+' : ''} bo nhưng đang tính {perSet} bo/set — kiểm lại số bo mỗi cạnh.
        </div>
      )}

      {/* Ghép panel ngay dưới kích thước: là thông số của tấm sẽ sản xuất, không phải tuỳ
          chọn giá phụ. Tích vào mới hiện các ô, bo lẻ không phải nhìn thấy. */}
      <label style={S.panelToggle}>
        <input type="checkbox" checked={panelOn} onChange={(e) => setPanelOn(e.target.checked)} style={{ margin: 0 }} />
        <span>Ghép panel</span>
        {panelOn && <span style={S.panelHint}>{perSet} bo / set</span>}
      </label>
      {panelOn && (
        <div style={S.panelBox}>
          <div style={S.row}>
            <span style={S.label}>Kiểu ghép</span>
            <div style={S.kindGroup}>
              {(
                [
                  ['vcut', 'V-cut'],
                  ['mousebite', 'Mouse bite'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setPanelKind(k)}
                  style={{ ...S.chip, ...(panelKind === k ? S.chipOn : null) }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={S.row}>
            <span style={S.label}>Số bo mỗi cạnh</span>
            <div style={S.sizeGroup}>
              <input
                style={S.sizeInput}
                value={panelX}
                onChange={(e) => setPanelX(Math.max(1, parseDigits(e.target.value) ?? 1))}
              />
              <span style={S.times}>×</span>
              <input
                style={S.sizeInput}
                value={panelY}
                onChange={(e) => setPanelY(Math.max(1, parseDigits(e.target.value) ?? 1))}
              />
            </div>
          </div>
          {!fromSets && (
          <div style={S.row}>
            <span style={S.label}>Rail</span>
            <div style={S.sizeGroup}>
              <input
                style={S.sizeInput}
                value={mm(railX)}
                onChange={(e) => setRailX((parseNum(e.target.value) ?? 0) / 10)}
              />
              <span style={S.times}>×</span>
              <input
                style={S.sizeInput}
                value={mm(railY)}
                onChange={(e) => setRailY((parseNum(e.target.value) ?? 0) / 10)}
              />
              <span style={S.unit}>mm</span>
            </div>
          </div>
          )}
          {size && !fromSets && (
            <PanelPreview
              boardW={size.w * 10}
              boardH={size.h * 10}
              cols={Math.max(1, panelX)}
              rows={Math.max(1, panelY)}
              railX={railX * 10}
              railY={railY * 10}
              kind={panelKind}
              shape={boardShape}
            />
          )}
          {vcutPanelWarn && <div style={S.warn}>⚠ {vcutPanelWarn}</div>}
          {size && fromSets && (
            <div style={S.panelSize}>
              {fromSets
                ? `File ghép sẵn — tấm panel = kích thước Gerber ${mm(size.w)} × ${mm(size.h)} mm`
                : `Tấm panel: ${mm(size.w * panelX + railX)} × ${mm(size.h * panelY + railY)} mm`}
            </div>
          )}
        </div>
      )}

      {/* Stencil kèm bo: tích vào thì "Đưa vào báo giá" thêm một dòng stencil ngay dưới
          dòng bo. Một file chỉ làm một tấm — kem hai mặt thì tấm đó làm Top + Bot.
          Cỡ khung gợi ý là cỡ rẻ nhất vừa TẤM sẽ in (panel nếu ghép, bo lẻ nếu không). */}
      {board.isLoaded && size && (
        <>
          <label style={S.panelToggle}>
            <input
              type="checkbox"
              checked={stencilOn}
              onChange={(e) => setStencilOn(e.target.checked)}
              style={{ margin: 0 }}
            />
            <span>Stencil</span>
            {stencilOn && stencilChoice && (
              <span style={S.panelHint}>{money(stencilChoice.tier.priceVnd)} đ</span>
            )}
          </label>
          {!stencilOn && pasteSides.length === 0 && (
            <div style={{ ...S.stencilNote, padding: '0 0 6px 20px' }}>
              File không có lớp paste — thường không cần stencil.
            </div>
          )}
          {stencilOn && (
            <div style={S.panelBox}>
              <div style={S.row}>
                <span style={S.label}>Khung</span>
                <select
                  style={{ ...S.select, maxWidth: 170 }}
                  value={stencilPick ?? -1}
                  onChange={(e) => {
                    const i = Number(e.target.value)
                    setStencilPick(i < 0 ? null : i)
                  }}
                >
                  <option value={-1}>
                    {stencilTier
                      ? `Gợi ý: ${stencilSizeLabel(stencilTier)} · ${money(stencilTier.priceVnd)} đ`
                      : 'Gợi ý: không có cỡ vừa tấm'}
                  </option>
                  {cfg.stencil.tiers.map((t, i) => (
                    <option key={i} value={i}>
                      {stencilSizeLabel(t)} · {money(t.priceVnd)} đ
                    </option>
                  ))}
                </select>
              </div>
              <div style={S.row}>
                <span style={S.label}>Mặt</span>
                <div style={S.kindGroup}>
                  {(['Top', 'Bot', 'Top + Bot'] as const).map((side) => (
                    <button
                      key={side}
                      onClick={() => setStencilSide(side)}
                      style={{ ...S.chip, ...((stencilSide ?? autoSide) === side ? S.chipOn : null) }}
                    >
                      {side}
                    </button>
                  ))}
                </div>
              </div>
              {stencilChoice ? (
                <div style={S.stencilNote}>
                  Vùng mạch {stencilChoice.tier.areaW}×{stencilChoice.tier.areaH} cm ·{' '}
                  {stencilChoice.tier.noFrame ? 'Stencil Không Khung' : 'Stencil Khung'} {stencilChoice.side}
                </div>
              ) : (
                <div style={S.stencilNote}>
                  Tấm {panelMm ? `${+panelMm.w.toFixed(1)} × ${+panelMm.h.toFixed(1)} mm` : ''} lớn hơn mọi
                  khung — chọn cỡ khung tay.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Thông số đặt hàng, chọn kiểu JLC. Gerber chỉ cho biết số lớp nên chỉ số lớp là
          tự điền; bề mặt, độ dày bo, độ dày đồng do người lập chọn theo yêu cầu khách.
          Gấp lại khi không sửa: năm hàng ô chọn đẩy phần giá xuống quá sâu. */}
      <button style={S.specHead} onClick={() => setSpecOpen((v) => !v)}>
        {/* Thu gọn: chỉ một dòng thông số, không lặp lại nhãn cho đỡ chật cột 280px. */}
        <span style={S.specHeadArrow}>{specOpen ? '▾' : '▸'}</span>
        <span style={specOpen ? S.specHeadLabel : S.specHeadValue}>
          {specOpen ? 'Thông số bo' : specSummary(spec)}
        </span>
      </button>
      {specOpen && (
        <>
          <SpecRow label="Vật liệu">
            {MATERIALS.map((m) => (
              <Chip key={m.key} on={spec.material === m.key} onClick={() => editSpec({ material: m.key })}>
                {m.label}
              </Chip>
            ))}
          </SpecRow>
          <SpecRow label="Số lớp">
            {LAYER_CHOICES.map((n) => (
              <Chip key={n} on={spec.layers === n} onClick={() => editSpec({ layers: n })}>
                {n}
              </Chip>
            ))}
          </SpecRow>
          <SpecRow label="Bề mặt">
            {FINISHES.map((f) => (
              <Chip key={f.key} on={spec.finish === f.key} onClick={() => editSpec({ finish: f.key })}>
                {f.label}
              </Chip>
            ))}
          </SpecRow>
          <SpecRow label="Độ dày bo (mm)">
            {THICKNESS_CHOICES.map((t) => (
              <Chip key={t} on={spec.thicknessMm === t} onClick={() => editSpec({ thicknessMm: t })}>
                {t.toFixed(1)}
              </Chip>
            ))}
          </SpecRow>
          <SpecRow label="Độ dày đồng (oz)">
            {COPPER_CHOICES.map((c) => (
              <Chip key={c} on={spec.copperOz === c} onClick={() => editSpec({ copperOz: c })}>
                {c}
              </Chip>
            ))}
          </SpecRow>
        </>
      )}
      {/* Màu phủ bo — dùng chung cho Real 2D, 3D và 2 Mặt. Đặt cạnh thông số vì cùng là
          thứ đặt hàng, trước nằm lẻ trên thanh tab. */}
      {board.isLoaded && (
        <InfoRow label="Màu bo">
          <div style={S.swatches}>
            {MASK_COLORS.map((c) => (
              <button
                key={c.hex}
                title={c.label}
                onClick={() => BoardDataModel.setMaskColor(c.hex)}
                style={{
                  ...S.swatch,
                  // Chấm dùng màu thương hiệu JLC; bo dựng bằng c.hex tối hơn, bảy
                  // chấm tô bằng nó sẽ tối gần như nhau, khó bấm đúng.
                  backgroundColor: c.dot,
                  border: board.maskColor === c.hex ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.25)',
                }}
              />
            ))}
          </div>
        </InfoRow>
      )}
      {!option && (
        <div style={S.noRate}>
          Chưa có công thức giá cho: {specSummary(spec)}. App không lấy giá loại khác thay
          vào — thêm phương án trong pricing-rules.json, hoặc đổi thông số nếu khách đồng ý.
        </div>
      )}
      {board.isLoaded && specOpen && (
        <div style={S.originLine}>
          {specTouched ? (
            <>
              <span style={S.originManual}>đã sửa tay</span>
              <button
                style={S.linkInline}
                onClick={() => {
                  setSpec(defaultSpec(board.layerCount))
                  setSpecTouched(false)
                }}
              >
                ↺ về {board.layerCount} lớp theo Gerber
              </button>
            </>
          ) : (
            <span>theo Gerber: {board.layerCount} lớp đồng</span>
          )}
        </div>
      )}

      <InfoRow label="File khoan">{board.isLoaded ? `${board.drillCount}` : '--'}</InfoRow>
      <InfoRow label="Tổng lớp đọc được">{board.isLoaded ? `${board.layers.length}` : '--'}</InfoRow>
      {/* Thư mục là nguồn để đoán tên khách và chọn chỗ lưu báo giá. Chỉ có khi chạy
          trong Electron, nên hiện luôn ra đây để biết ngay app có đọc được đường dẫn không. */}
      <InfoRow label="Thư mục">{folder}</InfoRow>

      {/* ── Báo giá ──────────────────────────────────────── */}
      <div style={S.head}>
        <span style={S.title}>Báo giá</span>
        {input && (
          // Chọn đường tính giá ngay tại đây. Bảng tra chỉ bấm được khi bo đủ điều
          // kiện; không đủ thì mờ đi và di chuột vào sẽ thấy lý do.
          <div style={S.pathToggle}>
            <button
              style={{
                ...S.pathBtn,
                ...(onTablePath ? S.badgeTable : null),
                ...(tableUnavailable ? S.pathBtnOff : null),
              }}
              disabled={!!tableUnavailable}
              title={tableUnavailable ? `Không dùng được bảng tra: ${tableUnavailable}` : 'Tra bảng giá nhà máy'}
              onClick={() => setForceFormula(false)}
            >
              Bảng tra
            </button>
            <button
              style={{ ...S.pathBtn, ...(!onTablePath ? S.badgeFormula : null) }}
              title="Tính theo công thức kích thước"
              onClick={() => setForceFormula(true)}
            >
              Công thức
            </button>
          </div>
        )}
        <button style={S.gear} onClick={onOpenSettings} title="Cài đặt → Công thức tính tiền">
          ⚙
        </button>
      </div>

      {/* Số lượng — mốc nhà máy bấm một phát, ô số để gõ trường hợp lạ */}
      {/* Ô NHẬP ở trên, ô KẾT QUẢ (dấu =, chỉ đọc) ở dưới. Ghép panel thì có nút ⇅ để
          đảo: bình thường nhập số PCB ra số set; khách gửi file ghép sẵn thì nhập số set
          ra số PCB. Tiền luôn tính theo số set. */}
      <div style={S.row}>
        <span style={S.label}>{fromSets ? 'Số set' : 'Số lượng'}</span>
        <div style={S.qtyGroup}>
          <input
            style={S.qtyInput}
            value={(fromSets ? setCount : qty) ?? ''}
            onChange={(e) => (fromSets ? setSetCount : setQty)(parseDigits(e.target.value))}
          />
          <span style={S.unit}>{fromSets ? 'set' : 'pcs'}</span>
        </div>
      </div>
      {panelOn && (
        <div style={S.row}>
          <button
            style={S.swapBtn}
            onClick={swapQtyInput}
            title={fromSets ? 'Đảo: nhập số PCB → ra số set' : 'Đảo: file ghép sẵn — nhập số set → ra số PCB'}
          >
            ⇅
          </button>
          <span style={S.label}>= {fromSets ? 'Số lượng' : 'Số set'}</span>
          <div style={S.qtyGroup}>
            <span style={S.qtyResult}>{(fromSets ? pcsCount : orderQty) ?? '—'}</span>
            <span style={S.unit}>{fromSets ? 'pcs' : 'set'}</span>
          </div>
        </div>
      )}

      {onTablePath && (
        <div style={S.chips}>
          {cfg.table.tiers.map((t) => (
            <button
              key={t.qty}
              onClick={() => setOrderInput(t.qty)}
              style={{ ...S.chip, ...(orderQty === t.qty ? S.chipOn : null) }}
              title={`${t.qty} pcs — ${money(t.priceVnd)} đ`}
            >
              {t.qty}
            </button>
          ))}
        </div>
      )}

      {tableBlockedBy && (
        <div style={S.hint}>Bo dưới 10×10cm nhưng {tableBlockedBy} → tính bằng công thức.</div>
      )}

      {/* ── Kết quả ─────────────────────────────────────── */}
      {error && <div style={S.error}>{error}</div>}

      {result?.kind === 'off-table' && (
        <div style={S.offTable}>
          <div style={S.offTitle}>Ngoài bảng giá nhà máy</div>
          <div style={S.offMsg}>{result.message}</div>
          <div style={S.offNeighbours}>
            {result.below && (
              <button style={S.neighbour} onClick={() => setOrderInput(result.below!.qty)}>
                {result.below.qty} pcs · {money(result.below.priceVnd)}
              </button>
            )}
            {result.above && (
              <button style={S.neighbour} onClick={() => setOrderInput(result.above!.qty)}>
                {result.above.qty} pcs · {money(result.above.priceVnd)}
              </button>
            )}
          </div>
          <div style={{ ...S.row, marginTop: 8 }}>
            <span style={S.label}>Thành tiền</span>
            <div style={S.qtyGroup}>
              <input
                style={S.manualInput}
                placeholder="nhập tay"
                value={manualAmount === null ? '' : money(manualAmount)}
                onChange={(e) => setManualAmount(parseDigits(e.target.value))}
              />
              <span style={S.unit}>đ</span>
            </div>
          </div>
        </div>
      )}

      {result?.kind === 'table' && (
        <div style={S.priceBox}>
          <div style={S.priceMain}>{money(result.priceVnd)} đ</div>
          <div style={{ ...S.priceSub, whiteSpace: 'pre-line' }}>{unitText(result.priceVnd)}</div>
        </div>
      )}

      {result?.kind === 'formula' && bothModes && (
        <div style={S.priceChoice}>
          {(
            [
              ['flat', 'Hệ số phẳng', bothModes.flat],
              ['tiered', 'Bậc thang', bothModes.tiered],
            ] as const
          ).map(([key, label, r]) => {
            const on = result.mode === key
            return (
              <label key={key} style={{ ...S.priceOption, ...(on ? S.priceOptionOn : null) }}>
                <div style={S.priceOptionHead}>
                  <input
                    type="radio"
                    name="price-mode"
                    checked={on}
                    onChange={() => setMode(key)}
                    style={{ margin: 0 }}
                  />
                  <span style={{ ...S.modeTag, ...(on ? { color: '#e2e8f0' } : null) }}>{label}</span>
                </div>
                <div style={{ ...S.priceMain, ...(on ? null : S.priceMainOff) }}>{money(r.priceVnd)} đ</div>
                <div style={{ ...S.priceSub, whiteSpace: 'pre-line' }}>{unitText(r.priceVnd)}</div>
              </label>
            )
          })}
        </div>
      )}

      {result?.kind === 'formula' && (
        <table style={S.breakdown}>
          <tbody>
            <BreakRow
              label="Panel"
              value={`${+result.panelW.toFixed(2)} × ${+result.panelH.toFixed(2)} cm`}
            />
            <BreakRow label="Diện tích cả đơn" value={`${money(result.totalAreaCm2)} cm²`} />
            {result.bigBoardFeeCny > 0 && (
              <BreakRow label="Phí bo lớn" value={`¥ ${result.bigBoardFeeCny.toFixed(1)}`} />
            )}
            {/* Khối lượng, giá vốn (¥) và giá kèm VAT không hiện nữa (21/09/2026) — người lập
                chỉ cần giá bán; mấy số đó vẫn nằm trong result nếu sau cần. */}
          </tbody>
        </table>
      )}

      <button
        style={{ ...S.sendBtn, ...(canSend ? null : S.sendBtnOff) }}
        disabled={!canSend}
        onClick={() => canSend && onSendToQuotation()}
      >
        ↑ Đưa vào báo giá
      </button>
      {canSend && !priced && (
        <div style={{ ...S.stencilNote, textAlign: 'center' }}>
          Chưa có giá — dòng báo giá để trống thành tiền cho bạn nhập tay.
        </div>
      )}

      {/* ── Tuỳ chọn nâng cao ───────────────────────────── */}
      <button style={S.disclosure} onClick={() => setAdvanced((v) => !v)}>
        {advanced ? '▾' : '▸'} Tuỳ chọn {!advanced && onTablePath ? '(không cần cho bảng tra)' : ''}
      </button>

      {advanced && (
        <div style={S.advanced}>
          <div style={S.row}>
            <span style={S.label} title="Phụ phí thủ công, tính bằng CNY (ô O3 của sheet)">
              Phí thêm
            </span>
            <div style={S.qtyGroup}>
              <input
                style={S.sizeInput}
                value={extraFeeCny}
                onChange={(e) => setExtraFeeCny(parseNum(e.target.value) ?? 0)}
              />
              <span style={S.unit}>¥</span>
            </div>
          </div>

        </div>
      )}
    </div>
  )
}

/** Một dòng thông tin bo — cùng kiểu với bảng thông tin cũ: nhãn trái, giá trị phải. */
/** Một dòng thông số: nhãn ở trên, các ô chọn xuống dòng bên dưới — cột chỉ rộng 280px. */
const SpecRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={S.specRow}>
    <span style={S.specLabel}>{label}</span>
    <div style={S.chips}>{children}</div>
  </div>
)

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({
  on,
  onClick,
  children,
}) => (
  <button onClick={onClick} style={{ ...S.chip, ...(on ? S.chipOn : null) }}>
    {children}
  </button>
)

const InfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={S.infoRow}>
    <span style={S.infoLabel}>{label}</span>
    <div style={S.infoValue}>{children}</div>
  </div>
)

const BreakRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <tr>
    <td style={S.breakLabel}>{label}</td>
    <td style={S.breakValue}>{value}</td>
  </tr>
)

const inputBase: React.CSSProperties = {
  backgroundColor: '#0f1115',
  border: '1px solid #2c313c',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: 12,
  padding: '3px 6px',
  textAlign: 'right',
  minWidth: 0,
}

const S: Record<string, React.CSSProperties> = {
  warn: {
    margin: '6px 0',
    padding: '6px 8px',
    borderRadius: 5,
    fontSize: 11,
    lineHeight: 1.45,
    color: '#fde68a',
    backgroundColor: '#2a2208',
    border: '1px solid #6b5412',
  },
  kindGroup: { display: 'flex', gap: 4 },
  warnBtn: {
    display: 'block',
    marginTop: 6,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
    borderRadius: 5,
    cursor: 'pointer',
    color: '#1c1400',
    backgroundColor: '#fbbf24',
    border: 'none',
  },
  stencilBox: { margin: '10px 0 4px', padding: '8px 10px', borderRadius: 6, backgroundColor: '#12151c', border: '1px solid #262b36' },
  stencilHead: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 },
  stencilFor: { color: '#64748b' },
  stencilMain: { fontSize: 13, fontWeight: 600, color: '#e2e8f0' },
  stencilNote: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  panelToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    fontSize: 12,
    color: '#cbd5e1',
    cursor: 'pointer',
    borderBottom: '1px solid #1f2430',
  },
  panelHint: { marginLeft: 'auto', fontSize: 11, color: '#38bdf8', fontWeight: 600 },
  panelBox: { padding: '4px 0 6px 20px', borderBottom: '1px solid #1f2430' },
  swapBtn: {
    marginRight: 6,
    padding: '1px 6px',
    fontSize: 13,
    lineHeight: 1.2,
    borderRadius: 4,
    cursor: 'pointer',
    color: '#38bdf8',
    background: 'transparent',
    border: '1px solid #334155',
  },
  qtyResult: { minWidth: 60, textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#e2e8f0', padding: '4px 8px' },
  panelSize: { fontSize: 11, color: '#94a3b8', textAlign: 'right', paddingTop: 2 },
  specHead: {
    width: '100%',
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    padding: '8px 0',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid #1f2430',
    cursor: 'pointer',
    textAlign: 'left',
  },
  specHeadArrow: { fontSize: 11, color: '#64748b' },
  specHeadLabel: { fontSize: 12, color: '#94a3b8' },
  specHeadValue: { fontSize: 12, color: '#e2e8f0', fontWeight: 600, flex: 1, minWidth: 0 },
  specRow: { padding: '6px 0', display: 'flex', flexDirection: 'column', gap: 6 },
  specLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 },
  swatches: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' },
  swatch: { width: '16px', height: '16px', borderRadius: '3px', cursor: 'pointer', padding: 0 },
  infoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 30,
    padding: '4px 0',
    borderBottom: '1px solid #22252e',
  },
  infoLabel: { color: '#94a3b8', fontSize: 11, flexShrink: 0 },
  infoValue: {
    marginLeft: 'auto',
    display: 'flex',
    justifyContent: 'flex-end',
    color: '#f1f5f9',
    fontSize: 12,
    fontWeight: 500,
    textAlign: 'right',
    wordBreak: 'break-all',
    minWidth: 0,
  },
  // Tiêu đề mục Báo giá: một đường kẻ đậm hơn ngăn với phần thông tin bo phía trên.
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingTop: 10,
    marginBottom: 8,
    borderTop: '1px solid #2c313c',
  },
  title: { color: '#e2e8f0', fontWeight: 600, fontSize: 12 },
  badge: { fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600 },
  noRate: {
    fontSize: 11,
    lineHeight: 1.45,
    color: '#fca5a5',
    backgroundColor: '#2a1215',
    border: '1px solid #5b1f24',
    borderRadius: 6,
    padding: '6px 8px',
    margin: '4px 0 6px',
  },
  pathToggle: { display: 'flex', gap: 2, padding: 2, borderRadius: 999, backgroundColor: '#14161b', border: '1px solid #2c313c' },
  pathBtn: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: 999,
    border: '1px solid transparent',
    // backgroundColor, không phải shorthand: badgeFormula đè bằng backgroundColor.
    backgroundColor: 'transparent',
    color: '#64748b',
    cursor: 'pointer',
  },
  pathBtnOff: { opacity: 0.35, cursor: 'not-allowed' },
  badgeTable: { backgroundColor: '#0c4a3e', color: '#5eead4', border: '1px solid #115e52' },
  badgeFormula: { backgroundColor: '#3b2c09', color: '#fcd34d', border: '1px solid #57410d' },
  gear: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: 13,
    padding: 0,
  },
  row: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 },
  label: { color: '#94a3b8', fontSize: 11, flex: 1, whiteSpace: 'nowrap' },
  sizeGroup: { display: 'flex', alignItems: 'center', gap: 3 },
  qtyGroup: { display: 'flex', alignItems: 'center', gap: 4 },
  sizeInput: { ...inputBase, width: 56 },
  qtyInput: { ...inputBase, width: 60, fontWeight: 600 },
  // Viền vàng cho biết đây là số gõ tay, không phải số app tính ra. Phải ghi lại cả
  // shorthand `border` chứ không đắp thêm borderColor — React cảnh báo khi trộn hai loại.
  manualInput: { ...inputBase, width: 90, fontWeight: 600, border: '1px solid #7c5b1a' },
  times: { color: '#475569', fontSize: 11 },
  unit: { color: '#64748b', fontSize: 10 },
  originLine: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    color: '#64748b',
    fontSize: 10,
    justifyContent: 'flex-end',
    padding: '3px 0',
    borderBottom: '1px solid #22252e',
  },
  originManual: { color: '#fcd34d' },
  linkInline: {
    background: 'none',
    border: 'none',
    color: '#38bdf8',
    cursor: 'pointer',
    fontSize: 10,
    padding: 0,
  },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 2, marginBottom: 8 },
  chip: {
    backgroundColor: '#1c2029',
    border: '1px solid #2c313c',
    borderRadius: 4,
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 11,
    padding: '2px 6px',
    minWidth: 26,
  },
  chipOn: {
    backgroundColor: '#0ea5e9',
    border: '1px solid #38bdf8',
    color: '#ffffff',
    fontWeight: 600,
  },
  hint: {
    color: '#fcd34d',
    fontSize: 10,
    lineHeight: 1.5,
    marginBottom: 8,
  },
  error: {
    color: '#fca5a5',
    backgroundColor: '#2a1416',
    border: '1px solid #5b2326',
    borderRadius: 4,
    fontSize: 11,
    padding: '5px 7px',
    marginBottom: 8,
  },
  offTable: {
    backgroundColor: '#241c08',
    border: '1px solid #57410d',
    borderRadius: 5,
    padding: '7px 8px',
    marginBottom: 8,
  },
  offTitle: { color: '#fcd34d', fontSize: 11, fontWeight: 600, marginBottom: 2 },
  offMsg: { color: '#a8a29e', fontSize: 10, lineHeight: 1.5 },
  offNeighbours: { display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' },
  neighbour: {
    backgroundColor: '#1c2029',
    border: '1px solid #2c313c',
    borderRadius: 4,
    color: '#cbd5e1',
    cursor: 'pointer',
    fontSize: 10,
    padding: '2px 6px',
  },
  priceBox: {
    backgroundColor: '#0f1115',
    border: '1px solid #2c313c',
    borderRadius: 5,
    padding: '8px 10px',
    marginTop: 2,
    marginBottom: 8,
  },
  priceMain: { color: '#5eead4', fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' },
  priceMainOff: { color: '#94a3b8', fontWeight: 600 },
  // Hai đường giá cạnh nhau, tích ô nào thì ô đó sáng và là số đưa vào báo giá.
  priceChoice: { display: 'flex', gap: 8, marginBottom: 8 },
  priceOption: {
    flex: 1,
    minWidth: 0,
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid #2c313c',
    backgroundColor: '#14161b',
    cursor: 'pointer',
  },
  priceOptionOn: { border: '1px solid #2dd4bf', backgroundColor: '#0f1f1d' },
  priceOptionHead: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  priceSub: { color: '#94a3b8', fontSize: 11, marginTop: 2, display: 'flex', gap: 6 },
  modeTag: { color: '#64748b', fontSize: 10 },
  breakdown: { width: '100%', borderCollapse: 'collapse', marginBottom: 8 },
  breakLabel: { color: '#64748b', fontSize: 10, padding: '2px 0' },
  breakValue: { color: '#cbd5e1', fontSize: 10, padding: '2px 0', textAlign: 'right' },
  sendBtn: {
    width: '100%',
    backgroundColor: '#0ea5e9',
    border: 'none',
    borderRadius: 4,
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    padding: '6px 0',
  },
  sendBtnOff: { backgroundColor: '#1c2029', color: '#475569', cursor: 'not-allowed' },
  disclosure: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: 10,
    padding: '8px 0 0',
    width: '100%',
    textAlign: 'left',
  },
  advanced: { marginTop: 6, paddingTop: 8, borderTop: '1px solid #22252e' },
  select: {
    backgroundColor: '#0f1115',
    border: '1px solid #2c313c',
    borderRadius: 4,
    color: '#e2e8f0',
    fontSize: 11,
    padding: '3px 4px',
    maxWidth: 120,
  },
  segment: { display: 'flex', backgroundColor: '#0f1115', borderRadius: 4, padding: 1 },
  segBtn: {
    // backgroundColor (không phải shorthand background): segBtnOn đè bằng backgroundColor,
    // trộn hai kiểu trên cùng phần tử là React cảnh báo.
    backgroundColor: 'transparent',
    border: 'none',
    borderRadius: 3,
    color: '#64748b',
    cursor: 'pointer',
    fontSize: 10,
    padding: '2px 6px',
  },
  segBtnOn: { backgroundColor: '#334155', color: '#e2e8f0' },
  check: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 6,
    cursor: 'pointer',
  },
}
