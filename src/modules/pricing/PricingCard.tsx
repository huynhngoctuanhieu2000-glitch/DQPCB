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
import type { BoardState } from '../../models/BoardDataModel'
import type { QuotationSeed } from '../quotation/QuotationPanel'
import { PricingStore } from './PricingStore'
import {
  computePrice,
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

/**
 * Số lớp đồng đọc được từ Gerber → phương án giá mặc định.
 *
 * Chỉ suy ra được số lớp, không suy ra được bề mặt hay độ dày đồng — bo mạ vàng hay
 * 2oz nhìn từ Gerber vẫn là 2 lớp. Nên đây là điểm khởi đầu, người lập vẫn phải đổi
 * tay khi khách đặt loại khác.
 */
const optionFromLayers = (layerCount: number): string =>
  layerCount >= 4 ? 'L4' : layerCount <= 1 ? 'L1' : 'L2'

/** Những gì người lập đã nhập trên thẻ cho một bo. */
interface CardInputs {
  qty: number | null
  option: string
  optionTouched: boolean
  mode: PriceMode | null
  panelX: number
  panelY: number
  railX: number
  railY: number
  extraFeeCny: number
  forceFormula: boolean
  manualAmount: number | null
  sizeOverride: { w: number; h: number } | null
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

  const [qty, setQty] = useState<number | null>(5)
  const [option, setOption] = useState('L2')
  const [mode, setMode] = useState<PriceMode | null>(null)
  const [panelX, setPanelX] = useState(1)
  const [panelY, setPanelY] = useState(1)
  const [railX, setRailX] = useState(0)
  const [railY, setRailY] = useState(0)
  const [extraFeeCny, setExtraFeeCny] = useState(0)
  const [forceFormula, setForceFormula] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  /** Thành tiền gõ tay — chỉ dùng khi số lượng rơi ngoài bảng giá nhà máy. */
  const [manualAmount, setManualAmount] = useState<number | null>(null)
  /** Kích thước gõ tay, cm. null = bám theo bo đang mở. */
  const [sizeOverride, setSizeOverride] = useState<{ w: number; h: number } | null>(null)

  /** Người lập đã tự chọn phương án chưa — chọn rồi thì đổi bo mới được đạp lên. */
  const [optionTouched, setOptionTouched] = useState(false)

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
        qty, option, optionTouched, mode, panelX, panelY, railX, railY,
        extraFeeCny, forceFormula, manualAmount, sizeOverride,
      })
    }
    setSeenBoardId(board.activeBoardId)
    const saved = board.activeBoardId ? cardMemory.get(board.activeBoardId) : undefined
    if (saved) {
      setQty(saved.qty)
      setOption(saved.option)
      setOptionTouched(saved.optionTouched)
      setMode(saved.mode)
      setPanelX(saved.panelX)
      setPanelY(saved.panelY)
      setRailX(saved.railX)
      setRailY(saved.railY)
      setExtraFeeCny(saved.extraFeeCny)
      setForceFormula(saved.forceFormula)
      setManualAmount(saved.manualAmount)
      setSizeOverride(saved.sizeOverride)
    } else {
      setSizeOverride(null)
      setManualAmount(null)
      setOptionTouched(false)
      if (board.isLoaded) setOption(optionFromLayers(board.layerCount))
    }
  }

  // Phải memo theo GIÁ TRỊ kích thước, không theo object bounds: object mới mỗi lượt
  // render sẽ kéo basis → effect báo giá → Layout setState → render lại, lặp vô hạn.
  const boardW = board.bounds?.widthMM
  const boardH = board.bounds?.heightMM
  const boardCm = useMemo(
    () => (boardW !== undefined && boardH !== undefined ? { w: boardW / 10, h: boardH / 10 } : null),
    [boardW, boardH],
  )
  const size = sizeOverride ?? boardCm

  // Tách cơ sở (mọi thứ trừ số lượng) ra riêng vì nó theo dòng báo giá sang form —
  // đổi SL trên form thì form tra lại từ đúng cơ sở này.
  const basis = useMemo(
    (): PriceBasis | null =>
      size
        ? {
            boardW: size.w,
            boardH: size.h,
            option,
            panelX,
            panelY,
            railX,
            railY,
            extraFeeCny,
            forceFormula,
            ...(mode ? { mode } : null),
          }
        : null,
    [size, option, panelX, panelY, railX, railY, extraFeeCny, forceFormula, mode],
  )
  const input = useMemo(() => (basis && qty ? { ...basis, qty } : null), [basis, qty])

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
      ? panelX > 1 || panelY > 1
        ? 'đã ghép panel'
        : option !== cfg.table.coversOption
          ? `loại "${cfg.options.find((o) => o.key === option)?.label ?? option}" không nằm trong bảng giá nhà máy (bảng chỉ có ${cfg.options.find((o) => o.key === cfg.table.coversOption)?.label ?? cfg.table.coversOption})`
          : forceFormula
            ? 'đang ép dùng công thức'
            : null
      : null

  const amount =
    result?.kind === 'table' || result?.kind === 'formula' ? result.priceVnd : manualAmount
  const canSend = !!qty && amount !== null && amount > 0

  // Gõ tay đè lên kích thước Gerber thì báo giá phải ghi theo số đã tính giá, kẻo
  // dòng báo giá ghi một đằng mà tiền tính một nẻo. Dạng "200*350mm" khớp cột
  // KÍCH THƯỚC của form mẫu.
  const sizeText = sizeOverride
    ? `${Math.round(sizeOverride.w * 10)}*${Math.round(sizeOverride.h * 10)}mm`
    : undefined

  // Chỉ báo khi thẻ đã đồng bộ với bo đang mở — lượt render ngay sau khi đổi bo vẫn
  // còn cầm số của bo cũ, báo lúc đó là gắn giá bo cũ cho bo mới.
  const synced = board.activeBoardId === seenBoardId
  useEffect(() => {
    if (!board.activeBoardId || !synced) return
    onPriceChange(
      board.activeBoardId,
      canSend && basis
        ? {
            boardId: board.activeBoardId,
            quantity: qty!,
            amount: amount!,
            basis,
            ...(sizeText ? { size: sizeText } : null),
          }
        : null,
    )
  }, [onPriceChange, synced, canSend, board.activeBoardId, qty, amount, basis, sizeText])

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

      {/* Loại bo = số lớp đồng + bề mặt/độ dày đồng. Gerber chỉ cho biết số lớp, nên
          mặc định suy từ đó; mạ vàng, 2oz, mạch dẻo thì người lập chọn tay. */}
      <InfoRow label="Loại bo">
        <select
          style={S.select}
          value={option}
          onChange={(e) => {
            setOption(e.target.value)
            setOptionTouched(true)
          }}
        >
          {cfg.options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </InfoRow>
      {board.isLoaded && (
        <div style={S.originLine}>
          {optionTouched ? (
            <>
              <span style={S.originManual}>đã sửa tay</span>
              {option !== optionFromLayers(board.layerCount) && (
                <button
                  style={S.linkInline}
                  onClick={() => {
                    setOption(optionFromLayers(board.layerCount))
                    setOptionTouched(false)
                  }}
                >
                  ↺ về {board.layerCount} lớp theo Gerber
                </button>
              )}
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
          <span style={{ ...S.badge, ...(onTablePath ? S.badgeTable : S.badgeFormula) }}>
            {onTablePath ? 'Bảng tra' : 'Công thức'}
          </span>
        )}
        <button style={S.gear} onClick={onOpenSettings} title="Cài đặt → Công thức tính tiền">
          ⚙
        </button>
      </div>

      {/* Số lượng — mốc nhà máy bấm một phát, ô số để gõ trường hợp lạ */}
      <div style={S.row}>
        <span style={S.label}>Số lượng</span>
        <div style={S.qtyGroup}>
          <input
            style={S.qtyInput}
            value={qty ?? ''}
            onChange={(e) => setQty(parseDigits(e.target.value))}
          />
          <span style={S.unit}>pcs</span>
        </div>
      </div>

      {onTablePath && (
        <div style={S.chips}>
          {cfg.table.tiers.map((t) => (
            <button
              key={t.qty}
              onClick={() => setQty(t.qty)}
              style={{ ...S.chip, ...(qty === t.qty ? S.chipOn : null) }}
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
              <button style={S.neighbour} onClick={() => setQty(result.below!.qty)}>
                {result.below.qty} pcs · {money(result.below.priceVnd)}
              </button>
            )}
            {result.above && (
              <button style={S.neighbour} onClick={() => setQty(result.above!.qty)}>
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
          <div style={S.priceSub}>{money(result.unitPriceVnd)} đ / pcs</div>
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
                <div style={S.priceSub}>{money(r.unitPriceVnd)} đ / pcs</div>
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
            <BreakRow label="Khối lượng" value={`${result.weightKg} kg`} />
            {result.bigBoardFeeCny > 0 && (
              <BreakRow label="Phí bo lớn" value={`¥ ${result.bigBoardFeeCny.toFixed(1)}`} />
            )}
            <BreakRow label="Giá vốn" value={`¥ ${result.costCny.toFixed(1)}`} />
            <BreakRow label={`+ VAT ${(cfg.formula.vatRate * 100).toFixed(0)}%`} value={`${money(result.priceWithVatVnd)} đ`} />
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

      {/* ── Tuỳ chọn nâng cao ───────────────────────────── */}
      <button style={S.disclosure} onClick={() => setAdvanced((v) => !v)}>
        {advanced ? '▾' : '▸'} Tuỳ chọn {!advanced && onTablePath ? '(không cần cho bảng tra)' : ''}
      </button>

      {advanced && (
        <div style={S.advanced}>
          <div style={S.row}>
            <span style={S.label}>Ghép panel</span>
            <div style={S.sizeGroup}>
              <input
                style={S.sizeInput}
                value={panelX}
                onChange={(e) => setPanelX(parseDigits(e.target.value) ?? 1)}
              />
              <span style={S.times}>×</span>
              <input
                style={S.sizeInput}
                value={panelY}
                onChange={(e) => setPanelY(parseDigits(e.target.value) ?? 1)}
              />
            </div>
          </div>

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

          <label style={S.check}>
            <input
              type="checkbox"
              checked={forceFormula}
              onChange={(e) => setForceFormula(e.target.checked)}
            />
            Ép dùng công thức (bỏ qua bảng tra)
          </label>
        </div>
      )}
    </div>
  )
}

/** Một dòng thông tin bo — cùng kiểu với bảng thông tin cũ: nhãn trái, giá trị phải. */
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
    background: 'none',
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
