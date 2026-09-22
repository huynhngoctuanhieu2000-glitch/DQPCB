/**
 * Form nhập báo giá. Bốn cột lấy sẵn từ bo đang mở (tên, số lớp, kích thước,
 * màu phủ); số lượng / thành tiền / ghi chú người lập tự nhập.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Board, BoardState } from '../../models/BoardDataModel'
import { MASK_COLORS } from '../../models/MaskColors'
import {
  applyNoteSuggestion,
  applyVatFlag,
  noteHas,
  withPanelNote,
  createQuotation,
  emptyItem,
  discountItem,
  dateToInput,
  dateFromInput,
  normalizeStrings,
  insertItems,
  itemFromBoard,
  itemFromStencil,
  sameStencil,
  stencilSideFromBoard,
  stencilSizeLabel,
  withStencil,
  QUOTATION_DEFAULTS,
  subtotal,
  vatAmount,
  grandTotal,
  suggestedFileName,
} from './QuotationModel'
import type { Quotation, QuotationItem } from './QuotationModel'
import { exportQuotationToPdf, revealInFolder } from './exportPdf'
import { canShareFiles, shareQuotationPdf } from './exportImage'
import { exportQuotationToXlsx } from './exportExcel'
import { saveXlsx } from './saveFile'
import { computePrice, pickStencil, type PriceBasis, type StencilTier } from '../pricing/PricingModel'
import { PricingStore } from '../pricing/PricingStore'
import { QuotationPreview } from './QuotationPreview'
import { useIsMobile } from '../../ui/useIsMobile'

const money = (n: number) => n.toLocaleString('vi-VN')

/**
 * Ô số lượng / thành tiền để người lập gõ tay: bỏ hết ký tự không phải chữ số
 * (kể cả dấu phân cách nghìn tự chèn) rồi mới đọc ra số. Xoá trắng = chưa nhập.
 */
const parseDigits = (raw: string): number | null => {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

/**
 * Giá đã tính bên thẻ tính giá cho một bo. Gắn với id bo: kéo nhiều bo vào báo giá
 * thì bo nào đã tính được điền tiền của đúng bo đó, bo chưa tính để trống cho người
 * lập nhập tay — điền bừa giá bo này cho bo kia là sai tiền.
 */
export interface QuotationSeed {
  boardId: string
  quantity: number
  amount: number
  /** Cơ sở đã dùng để ra con số trên — để form tính lại khi đổi SL. */
  basis: PriceBasis
  /**
   * Kích thước đã tính giá, chỉ có khi người lập gõ tay đè lên số đọc từ Gerber.
   * Phải ghi đè cột KÍCH THƯỚC, nếu không báo giá gửi khách sẽ ghi một kích thước
   * mà giá lại tính theo kích thước khác.
   */
  size?: string
}

export const QuotationPanel: React.FC<{
  board: BoardState
  onClose: () => void
  /** Giá đã tính bên thẻ, theo id bo — điền vào dòng của bo tương ứng khi lấy từ bo. */
  prices?: Record<string, QuotationSeed>
}> = ({ board, onClose, prices = {} }) => {
  // Dòng lấy từ bo: bốn cột từ Gerber, cộng thêm số lượng + thành tiền nếu bo đó
  // đã được tính giá bên thẻ.
  const itemWithPrice = (b: Board): QuotationItem => {
    const it = itemFromBoard(b)
    const price = prices[b.id]
    if (!price) return it
    return {
      ...it,
      quantity: price.quantity,
      amount: price.amount,
      priceBasis: price.basis,
      sourceBoardId: b.id,
      ...(price.size ? { size: price.size } : null),
      // Panel là thứ khách phải biết và nhà máy phải làm, nên ghi thẳng vào báo giá.
      note: withPanelNote(it.note, price.basis.panelX, price.basis.panelY),
    }
  }

  /** Thành tiền theo cơ sở tính giá và số lượng; ngoài bảng giá nhà máy thì trả null. */
  const amountFor = (basis: PriceBasis, qty: number): number | null => {
    try {
      const r = computePrice({ ...basis, qty }, PricingStore.getConfig())
      return r.kind === 'off-table' ? null : r.priceVnd
    } catch {
      // Cấu hình giá đổi sau khi dòng được tạo (vd xoá phương án) — để tiền cho nhập tay.
      return null
    }
  }

  /**
   * Đổi SL của dòng lấy từ bo thì thành tiền phải đổi theo, không thì dòng ghi
   * "10 pcs" mà tiền vẫn của mốc 5 — đúng cái lỗi dễ lọt lên báo giá gửi khách nhất.
   * Ngoài mốc nhà máy thì xoá tiền để người lập buộc phải nhập tay, thay vì để lại
   * con số cũ trông như đúng.
   */
  const changeQuantity = (it: QuotationItem, quantity: number | null) => {
    if (it.stencil && quantity) {
      patchItem(it.id, { quantity, amount: it.stencil.priceVnd * quantity })
      return
    }
    if (!it.priceBasis || !quantity) {
      patchItem(it.id, { quantity })
      return
    }
    try {
      const r = computePrice({ ...it.priceBasis, qty: quantity }, PricingStore.getConfig())
      patchItem(it.id, { quantity, amount: r.kind === 'off-table' ? null : r.priceVnd })
    } catch {
      // Cấu hình giá đổi sau khi dòng được tạo (vd xoá phương án) — giữ SL, để tiền cho nhập tay.
      patchItem(it.id, { quantity, amount: null })
    }
  }

  const [q, setQ] = useState<Quotation>(() => {
    const base = createQuotation(false, board)
    if (!board.isLoaded) return base
    // Dòng đầu là bo đang mở — chính là bo vừa tính giá, nên điền thẳng vào đó.
    return { ...base, items: [itemWithPrice(board), ...base.items.slice(1)] }
  })
  const [tab, setTab] = useState<'form' | 'preview'>('form')
  const isMobile = useIsMobile()
  const [status, setStatus] = useState<{
    kind: 'ok' | 'err'
    text: string
    /** Có đường dẫn thật thì mới mở được thư mục (chỉ trong Electron). */
    filePath?: string
  } | null>(null)
  const [busy, setBusy] = useState(false)

  // normalizeStrings ở cả ba hàm dưới đây: mọi ô nhập tay (tên khách, ghi chú, tên
  // file…) được chuẩn về NFC ngay khi lưu vào state — xem lý do ở normalizeStrings.
  const patch = (change: Partial<Quotation>) =>
    setQ((prev) => ({ ...prev, ...normalizeStrings(change) }))
  const patchCustomer = (change: Partial<Quotation['customer']>) =>
    setQ((prev) => ({ ...prev, customer: { ...prev.customer, ...normalizeStrings(change) } }))

  const patchItem = (id: string, change: Partial<QuotationItem>) =>
    setQ((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...normalizeStrings(change) } : it)),
    }))

  const removeItem = (id: string) =>
    setQ((prev) => ({
      ...prev,
      // Luôn chừa lại một dòng hàng để bảng không rỗng hẳn (dòng giảm giá không tính).
      items:
        prev.items.find((it) => it.id === id)?.discount ||
        prev.items.filter((it) => !it.discount).length > 1
          ? prev.items.filter((it) => it.id !== id)
          : prev.items,
    }))

  const addItem = () => setQ((prev) => ({ ...prev, items: insertItems(prev.items, [emptyItem()]) }))
  const addDiscount = () =>
    setQ((prev) =>
      prev.items.some((it) => it.discount)
        ? prev
        : { ...prev, items: [...prev.items, discountItem()] },
    )

  /**
   * Dòng lấy từ bo bám theo thẻ tính giá: đổi kích thước, loại bo hay cách ghép panel
   * bên đó thì dòng này đổi theo ngay, không phải xoá đi thêm lại.
   *
   * SỐ LƯỢNG là của riêng dòng — người lập hay sửa để báo nhiều mức số lượng cho cùng
   * một bo, nên không kéo theo; tiền tính lại bằng chính số lượng đang có trên dòng.
   */
  // Chỉnh ngay trong lúc render theo khuôn "điều chỉnh state khi prop đổi" của React,
  // không dùng effect: effect sẽ vẽ một lượt bằng số cũ rồi mới sửa, người lập thấy
  // tiền nhấp nháy — mà đây là số tiền sắp gửi khách.
  const [seenPrices, setSeenPrices] = useState(prices)
  if (prices !== seenPrices) {
    setSeenPrices(prices)
    setQ((prev) => {
      let changed = false
      const items = prev.items.map((it) => {
        const price = it.sourceBoardId ? prices[it.sourceBoardId] : undefined
        if (!price) return it
        const qty = it.quantity ?? price.quantity
        const size = price.size ?? it.size
        const note = withPanelNote(it.note, price.basis.panelX, price.basis.panelY)
        const amount = amountFor(price.basis, qty)
        if (it.size === size && it.note === note && it.amount === amount && it.quantity === qty) {
          return it
        }
        changed = true
        return { ...it, size, note, amount, quantity: qty, priceBasis: price.basis }
      })
      return changed ? { ...prev, items } : prev
    })
  }

  // Mở một bo thì thêm thẳng; mở nhiều bo thì xổ danh sách cho chọn.
  const [boardMenu, setBoardMenu] = useState(false)

  // ── Stencil ──
  // Bảng giá stencil có thể vừa được sửa bên Cài đặt nên phải theo dõi, không chụp
  // một lần lúc mở form.
  const [pricingCfg, setPricingCfg] = useState(PricingStore.getConfig())
  useEffect(() => PricingStore.subscribe(setPricingCfg), [])
  const [stencilMenu, setStencilMenu] = useState(false)
  const stencilTiers = pricingCfg.stencil.tiers
  /** Cỡ rẻ nhất mà bo đang mở đặt vừa — để không phải tự dò trong 18 cỡ. */
  const suggestedStencil = board.bounds
    ? pickStencil(board.bounds.widthMM / 10, board.bounds.heightMM / 10, pricingCfg.stencil)
    : null

  const addStencil = (tier: StencilTier) => {
    setQ((prev) => ({
      ...prev,
      items: insertItems(prev.items, [
        itemFromStencil(
          tier,
          board.isLoaded ? board.projectName : undefined,
          stencilSideFromBoard(board.isLoaded ? board : undefined),
        ),
      ]),
    }))
    setStencilMenu(false)
  }

  const addBoards = (list: Board[]) => {
    if (list.length === 0) return
    setQ((prev) => ({ ...prev, items: insertItems(prev.items, list.map(itemWithPrice)) }))
    setBoardMenu(false)
  }

  const handleTakeFromBoard = () => {
    if (board.boards.length <= 1) addBoards(board.boards)
    else setBoardMenu((open) => !open)
  }

  const totals = useMemo(
    () => ({ sub: subtotal(q), vat: vatAmount(q), total: grandTotal(q) }),
    [q]
  )

  /**
   * Web (nhất là điện thoại): dựng PDF trong trình duyệt rồi mở bảng chia sẻ → Zalo,
   * Messenger, Lưu vào Tệp. Máy không có bảng chia sẻ thì tải PDF về.
   */
  const handleShare = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const how = await shareQuotationPdf(q)
      if (how === 'shared') setStatus({ kind: 'ok', text: 'Đã gửi file PDF.' })
      else if (how === 'downloaded') setStatus({ kind: 'ok', text: 'Đã tải PDF về máy.' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus({ kind: 'err', text: `Không chia sẻ được: ${message}` })
    } finally {
      setBusy(false)
    }
  }

  const handleExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      // Lưu mặc định ngay cạnh file gerber vừa nạp.
      const res = await exportQuotationToPdf(q, board.sourceDir)
      if (res.canceled) {
        setStatus(null)
      } else {
        setStatus({
          kind: 'ok',
          text: res.filePath ? `Đã lưu: ${res.filePath}` : 'Đã xuất xong.',
          filePath: res.filePath,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus({ kind: 'err', text: `Xuất thất bại: ${message}` })
    } finally {
      setBusy(false)
    }
  }

  const handleExportExcel = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const bytes = await exportQuotationToXlsx(q)
      // Lưu mặc định ngay cạnh file gerber vừa nạp, như PDF.
      const res = await saveXlsx(bytes, suggestedFileName(q), board.sourceDir)
      if (res.canceled) {
        setStatus(null)
      } else {
        setStatus({
          kind: 'ok',
          text: res.filePath ? `Đã lưu: ${res.filePath}` : 'Đã tải Excel về máy.',
          filePath: res.filePath,
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setStatus({ kind: 'err', text: `Xuất thất bại: ${message}` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={{ ...S.modal, ...(isMobile ? S.modalMobile : null) }} onClick={(e) => e.stopPropagation()}>
        {/* Thanh tiêu đề */}
        <div style={S.header}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Xuất báo giá</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            {[
              { label: isMobile ? 'Khách lẻ' : 'Khách lẻ (không VAT)', vat: false },
              { label: isMobile ? 'Công ty' : 'Công ty (VAT)', vat: true },
            ].map((opt) => (
              <button
                key={String(opt.vat)}
                onClick={() => setQ((prev) => applyVatFlag(prev, opt.vat))}
                style={{ ...S.toggle, ...(q.hasVat === opt.vat ? S.toggleOn : null) }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button onClick={onClose} style={S.close} title="Đóng">
            ✕
          </button>
        </div>

        <div style={S.tabs}>
          {([
            { key: 'form', label: '✎ Nhập liệu' },
            { key: 'preview', label: '👁 Xem trước' },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{ ...S.tab, ...(tab === t.key ? S.tabOn : null) }}
            >
              {t.label}
            </button>
          ))}
          {!isMobile && (
            <span style={S.tabHint}>
              Xem trước dựng đúng bố cục sẽ in ra PDF.
            </span>
          )}
        </div>

        {/* Tab xem trước: ZoomBox tự cuộn và zoom, nên thân hộp không cuộn và bỏ lề
            trên điện thoại để trang xem trước dùng hết bề ngang. */}
        <div style={tab === 'preview' ? { ...S.bodyPreview, padding: isMobile ? 0 : '12px' } : S.body}>
          {tab === 'preview' ? (
            <QuotationPreview q={q} />
          ) : (
          <>
          {/* Thông tin khách */}
          <div style={S.sectionTitle}>Thông tin khách hàng</div>
          <div style={S.grid}>
            <Field label="Ngày báo giá">
              {/* Chọn theo lịch; ô trả yyyy-MM-dd, báo giá vẫn lưu dd/MM/yyyy. Xoá trắng
                  thì giữ ngày cũ chứ không để báo giá mất ngày. */}
              <input
                type="date"
                style={{ ...S.input, colorScheme: 'dark' }}
                value={dateToInput(q.date)}
                onChange={(e) => {
                  const d = dateFromInput(e.target.value)
                  if (d) patch({ date: d })
                }}
              />
            </Field>
            <Field label="Kính gửi">
              <input
                style={S.input}
                value={q.customer.name}
                onChange={(e) => patchCustomer({ name: e.target.value })}
              />
            </Field>
            {q.hasVat ? (
              <>
                <Field label="MST">
                  <input
                    style={S.input}
                    value={q.customer.taxCode}
                    onChange={(e) => patchCustomer({ taxCode: e.target.value })}
                  />
                </Field>
                <Field label="Email">
                  <input
                    style={S.input}
                    value={q.customer.email}
                    onChange={(e) => patchCustomer({ email: e.target.value })}
                  />
                </Field>
              </>
            ) : (
              <Field label="SĐT">
                <input
                  style={S.input}
                  value={q.customer.phone}
                  onChange={(e) => patchCustomer({ phone: e.target.value })}
                />
              </Field>
            )}
            <Field label="Địa chỉ" wide>
              <input
                style={S.input}
                value={q.customer.address}
                onChange={(e) => patchCustomer({ address: e.target.value })}
              />
            </Field>
          </div>

          {/* Dòng hàng */}
          <div style={{ ...S.sectionTitle, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Dòng hàng</span>
            <div style={{ position: 'relative' }}>
              <button
                onClick={handleTakeFromBoard}
                disabled={board.boards.length === 0}
                style={{ ...S.smallBtn, ...(board.boards.length > 0 ? null : S.disabled) }}
                title={
                  board.boards.length === 0
                    ? 'Chưa mở bo nào'
                    : board.boards.some((b) => prices[b.id])
                      ? 'Thêm dòng điền sẵn tên, số lớp, kích thước, màu phủ — kèm số lượng và thành tiền đã tính bên thẻ'
                      : 'Thêm dòng điền sẵn tên, số lớp, kích thước, màu phủ lấy từ bo đã mở'
                }
              >
                ⤓ Lấy từ bo đang mở
                {board.boards.length > 1 && ` (${board.boards.length})`}
              </button>

              {boardMenu && (
                <div style={S.menu}>
                  {board.boards.map((b) => (
                    <button key={b.id} onClick={() => addBoards([b])} style={S.menuItem}>
                      <span>📁 {b.projectName}</span>
                      <span style={{ color: '#64748b', fontSize: '10px' }}>
                        {b.layerCount} lớp
                        {b.bounds
                          ? ` · ${Math.round(b.bounds.widthMM)}*${Math.round(b.bounds.heightMM)}mm`
                          : ''}
                        {prices[b.id] && (
                          <span style={{ color: '#5eead4' }}>
                            {` · ${prices[b.id].quantity} pcs · ${money(prices[b.id].amount)} đ`}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => addBoards(board.boards)}
                    style={{ ...S.menuItem, borderTop: '1px solid #334155', color: '#38bdf8' }}
                  >
                    + Thêm tất cả {board.boards.length} bo
                  </button>
                </div>
              )}
            </div>
            {/* Stencil — chọn cỡ khung từ bảng giá; cỡ vừa bo đang mở được gợi ý sẵn */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setStencilMenu((open) => !open)}
                style={S.smallBtn}
                title="Thêm dòng stencil, giá lấy theo cỡ khung trong Cài đặt → Stencil"
              >
                + Thêm stencil
              </button>

              {stencilMenu && (
                <div style={{ ...S.menu, maxHeight: 260, overflowY: 'auto' }}>
                  {suggestedStencil && (
                    <button
                      onClick={() => addStencil(suggestedStencil)}
                      style={{ ...S.menuItem, borderBottom: '1px solid #334155' }}
                    >
                      <span style={{ color: '#5eead4' }}>
                        ✓ {stencilSizeLabel(suggestedStencil)}
                      </span>
                      <span style={{ color: '#64748b', fontSize: '10px' }}>
                        vừa bo đang mở · {money(suggestedStencil.priceVnd)} đ
                      </span>
                    </button>
                  )}
                  {stencilTiers.map((t, i) => (
                    <button key={i} onClick={() => addStencil(t)} style={S.menuItem}>
                      <span>{stencilSizeLabel(t)}</span>
                      <span style={{ color: '#64748b', fontSize: '10px' }}>
                        vùng mạch {+t.areaW.toFixed(1)}*{+t.areaH.toFixed(1)}cm ·{' '}
                        {money(t.priceVnd)} đ
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={addItem} style={S.smallBtn}>
              + Thêm dòng trống
            </button>
            <button
              onClick={addDiscount}
              disabled={q.items.some((it) => it.discount)}
              style={{ ...S.smallBtn, ...(q.items.some((it) => it.discount) ? S.disabled : null) }}
              title="Thêm dòng giảm giá ở cuối bảng, số tiền giảm được trừ vào tổng"
            >
              + Thêm giảm giá
            </button>
          </div>

          {/* Bảng dòng hàng rộng hơn màn điện thoại: cuộn ngang trong khung riêng. */}
          <div style={{ overflowX: 'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {['#', q.hasVat ? 'Tên hàng hoá' : 'Tên file', 'Số lớp', 'Kích thước', 'Màu phủ', 'SL', 'Thành tiền', 'Đơn giá', 'Ghi chú', ''].map(
                  (h) => (
                    <th key={h} style={S.th}>
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {q.items.map((it, i) => {
                const unit =
                  it.quantity && it.amount !== null ? Math.round(it.amount / it.quantity) : null
                const canRemove = it.discount || q.items.filter((x) => !x.discount).length > 1
                if (it.discount) {
                  // Dòng giảm giá: chỉ có tên, số tiền giảm và ghi chú.
                  return (
                    <tr key={it.id}>
                      <td style={{ ...S.td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                      <td style={S.td} colSpan={5}>
                        <input
                          style={S.cellInput}
                          value={it.name}
                          onChange={(e) => patchItem(it.id, { name: e.target.value })}
                        />
                      </td>
                      <td style={S.td}>
                        <input
                          style={{ ...S.cellInput, width: '112px', textAlign: 'right', color: '#f87171' }}
                          inputMode="numeric"
                          placeholder="Số tiền giảm"
                          value={it.amount === null ? '' : money(-it.amount)}
                          onChange={(e) => {
                            const v = parseDigits(e.target.value)
                            patchItem(it.id, { amount: v === null ? null : -v })
                          }}
                        />
                      </td>
                      <td style={S.td} />
                      <td style={S.td}>
                        <NoteCell value={it.note} onChange={(note) => patchItem(it.id, { note })} />
                      </td>
                      <td style={S.td}>
                        <button onClick={() => removeItem(it.id)} style={S.removeBtn} title="Xoá dòng">
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={it.id}>
                    <td style={{ ...S.td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={it.name}
                        onChange={(e) => patchItem(it.id, { name: e.target.value })}
                      />
                    </td>
                    <td style={S.td}>
                      <input
                        style={{ ...S.cellInput, width: '48px', textAlign: 'center' }}
                        value={it.layers}
                        onChange={(e) => patchItem(it.id, { layers: e.target.value })}
                      />
                    </td>
                    <td style={S.td}>
                      {it.stencil ? (
                        // Dòng stencil: cỡ khung là một trong các cỡ nhà máy có, nên cho
                        // chọn lại bao nhiêu lần cũng được thay vì gõ tay.
                        <select
                          style={{ ...S.cellInput, width: '92px' }}
                          value={stencilTiers.findIndex((t) => sameStencil(t, it.stencil!))}
                          onChange={(e) =>
                            patchItem(it.id, withStencil(it, stencilTiers[Number(e.target.value)]))
                          }
                          title={stencilSizeLabel(it.stencil)}
                        >
                          {/* Cỡ đã chọn có thể vừa bị xoá trong Cài đặt — vẫn phải hiện ra
                              chứ không nhảy sang cỡ khác sau lưng người lập. */}
                          {stencilTiers.every((t) => !sameStencil(t, it.stencil!)) && (
                            <option value={-1}>{stencilSizeLabel(it.stencil)} (đã xoá)</option>
                          )}
                          {stencilTiers.map((t, i) => (
                            <option key={i} value={i}>
                              {stencilSizeLabel(t)} · {money(t.priceVnd)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          style={{ ...S.cellInput, width: '92px' }}
                          value={it.size}
                          onChange={(e) => patchItem(it.id, { size: e.target.value })}
                        />
                      )}
                    </td>
                    <td style={S.td}>
                      <input
                        style={{ ...S.cellInput, width: '92px' }}
                        list="mask-color-labels"
                        value={it.maskColor}
                        onChange={(e) => patchItem(it.id, { maskColor: e.target.value })}
                      />
                    </td>
                    <td style={S.td}>
                      <input
                        style={{ ...S.cellInput, width: '60px', textAlign: 'right' }}
                        inputMode="numeric"
                        value={it.quantity ?? ''}
                        onChange={(e) => changeQuantity(it, parseDigits(e.target.value))}
                      />
                    </td>
                    <td style={S.td}>
                      <input
                        style={{ ...S.cellInput, width: '112px', textAlign: 'right' }}
                        inputMode="numeric"
                        placeholder="0"
                        value={it.amount === null ? '' : money(it.amount)}
                        onChange={(e) => patchItem(it.id, { amount: parseDigits(e.target.value) })}
                      />
                    </td>
                    {/* Đơn giá là công thức trong Excel; ở đây chỉ xem trước. */}
                    <td style={{ ...S.td, textAlign: 'right', color: '#64748b', fontSize: '11px' }}>
                      {unit === null ? '--' : money(unit)}
                    </td>
                    <td style={S.td}>
                      <NoteCell
                        value={it.note}
                        onChange={(note) => patchItem(it.id, { note })}
                      />
                    </td>
                    <td style={S.td}>
                      <button
                        onClick={() => removeItem(it.id)}
                        disabled={!canRemove}
                        style={{ ...S.removeBtn, ...(!canRemove ? S.disabled : null) }}
                        title="Xoá dòng"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          <datalist id="mask-color-labels">
            {MASK_COLORS.map((c) => (
              <option key={c.hex} value={c.label} />
            ))}
          </datalist>

          {/* Tổng + người lập */}
          <div style={S.sectionTitle}>Tổng cộng &amp; người lập</div>
          <div style={S.grid}>
            <Field label="Người lập">
              <input
                style={S.input}
                value={q.preparedBy}
                onChange={(e) => patch({ preparedBy: e.target.value })}
              />
            </Field>
            {q.hasVat && (
              <Field label="Thuế suất (%)">
                <input
                  style={S.input}
                  type="number"
                  min={0}
                  step={0.5}
                  value={+(q.vatRate * 100).toFixed(2)}
                  onChange={(e) => patch({ vatRate: Number(e.target.value) / 100 })}
                />
              </Field>
            )}
            <Field label="Tài khoản nhận tiền" wide>
              <input
                style={S.input}
                value={q.bank.holder}
                onChange={(e) => patch({ bank: { ...q.bank, holder: e.target.value } })}
              />
              <input
                style={{ ...S.input, marginTop: '4px' }}
                value={q.bank.lines.join(' | ')}
                onChange={(e) =>
                  patch({
                    bank: { ...q.bank, lines: e.target.value.split('|').map((s) => s.trim()) },
                  })
                }
                title="Nhiều dòng thì ngăn nhau bằng dấu |"
              />
            </Field>
          </div>

          <div style={S.totals}>
            {q.hasVat && (
              <>
                <span>
                  Thành tiền trước thuế: <b>{money(totals.sub)}</b>
                </span>
                <span>
                  VAT {(q.vatRate * 100).toFixed(0)}%: <b>{money(totals.vat)}</b>
                </span>
              </>
            )}
            <span style={{ color: '#f87171' }}>
              TỔNG CỘNG: <b>{money(totals.total)}</b>
            </span>
          </div>
          </>
          )}
        </div>

        {/* Chân form */}
        <div style={S.footer}>
          {status && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginRight: 'auto',
                minWidth: 0,
              }}
            >
              <span
                style={{
                  fontSize: '11px',
                  color: status.kind === 'ok' ? '#4ade80' : '#f87171',
                  wordBreak: 'break-all',
                }}
              >
                {status.text}
              </span>
              {status.filePath && (
                <button
                  onClick={() => revealInFolder(status.filePath!)}
                  style={{ ...S.smallBtn, flexShrink: 0 }}
                  title="Mở thư mục chứa file vừa lưu"
                >
                  📂 Mở thư mục
                </button>
              )}
            </div>
          )}
          {/* Thứ tự trái→phải: PDF, Excel, In, Đóng. Trên web: PDF dựng trong trình
              duyệt là cách chính (điện thoại chia sẻ thẳng sang Zalo), hộp in của
              trình duyệt là phụ nên đứng sau Excel. Trong app Electron: nút "Xuất
              PDF" TỰ NÓ là nút PDF chính — không có nút In riêng — nên phải đứng
              trước Excel, không đi theo vị trí "In" ở nhánh web. */}
          {window.ipcRenderer ? (
            <button
              onClick={handleExport}
              disabled={busy}
              style={{ ...S.primaryBtn, ...(busy ? S.disabled : null) }}
              title={board.sourceDir ? `Lưu vào ${board.sourceDir}` : 'Chọn chỗ lưu ở hộp thoại'}
            >
              {busy ? 'Đang xuất…' : '⬇ Xuất PDF'}
            </button>
          ) : (
            <button
              onClick={handleShare}
              disabled={busy}
              style={{ ...S.primaryBtn, ...(busy ? S.disabled : null) }}
              title={canShareFiles() ? 'Mở bảng chia sẻ: Zalo, Messenger, Lưu vào Tệp…' : 'Tải file PDF về máy'}
            >
              {busy ? 'Đang tạo PDF…' : canShareFiles() ? '📤 Chia sẻ PDF' : '⬇ Tải PDF'}
            </button>
          )}
          {/* Bản có thể sửa lại — PDF mới là bản gửi khách, Excel để chỉnh tay khi cần. */}
          <button
            onClick={handleExportExcel}
            disabled={busy}
            style={{ ...S.secondaryBtn, ...(busy ? S.disabled : null) }}
            title={
              window.ipcRenderer
                ? board.sourceDir
                  ? `Lưu vào ${board.sourceDir}`
                  : 'Chọn chỗ lưu ở hộp thoại'
                : 'Tải file Excel về máy'
            }
          >
            {busy ? 'Đang xuất…' : '⬇ Xuất Excel'}
          </button>
          {/* Trong Electron, nút "Xuất PDF" ở trên đã lo phần in ra file rồi. */}
          {!window.ipcRenderer && (
            <button
              onClick={handleExport}
              disabled={busy}
              style={{ ...S.secondaryBtn, ...(busy ? S.disabled : null) }}
              title='Mở hộp in của trình duyệt, chọn "Lưu thành PDF"'
            >
              {busy ? 'Đang xuất…' : '🖨 In'}
            </button>
          )}
          <button onClick={onClose} style={S.secondaryBtn}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Ô GHI CHÚ: bấm vào thì nở ra nhiều dòng để gõ ghi chú dài, và có sẵn danh sách
 * ghi chú hay dùng để chọn nhanh (sửa trong quotation-defaults.json).
 * Xuống dòng ở đây thành xuống dòng thật trong ô Excel — ô đó đã bật wrap.
 */
const NoteCell: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange,
}) => {
  const [focused, setFocused] = useState(false)
  const [menu, setMenu] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Cao vừa nội dung: ghi chú hai dòng thì thấy cả hai dòng, kể cả khi đã rời ô —
  // thu về một dòng thì người lập không đọc được mình vừa ghi gì. Đang gõ thì cho
  // cao hơn, còn lại chặn lại kẻo bảng giãn quá tay.
  useEffect(() => {
    const el = areaRef.current
    if (!el) return
    el.style.height = 'auto'
    const max = focused ? 120 : 60
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 26), max)}px`
  }, [value, focused])

  // Bấm ra ngoài thì đóng danh sách gợi ý.
  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menu])

  // Bấm một dòng là bật/tắt dòng đó; danh sách KHÔNG đóng lại để chọn tiếp được nhiều
  // dòng. Đóng bằng cách bấm ra ngoài hoặc bấm lại nút ▾.
  const pick = (text: string) => onChange(applyNoteSuggestion(value, text))

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'flex', gap: '2px', width: '170px' }}>
      <textarea
        ref={areaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={1}
        placeholder="ghi chú…"
        style={{
          ...S.cellInput,
          resize: 'none',
          overflow: 'hidden',
          lineHeight: 1.4,
          fontFamily: 'inherit',
        }}
      />
      <button
        onClick={() => setMenu((open) => !open)}
        title="Chọn ghi chú hay dùng"
        style={S.noteMenuBtn}
      >
        ▾
      </button>

      {menu && (
        <div style={{ ...S.menu, right: 0, left: 'auto' }}>
          {QUOTATION_DEFAULTS.noteSuggestions.map((text) => {
            const on = noteHas(value, text)
            return (
              <button
                key={text}
                onClick={() => pick(text)}
                style={{ ...S.menuItem, ...S.noteMenuItem, ...(on ? S.menuItemOn : null) }}
                title={on ? 'Bấm lại để bỏ chọn' : undefined}
              >
                <span style={{ color: on ? '#5eead4' : '#475569', width: 12 }}>{on ? '✓' : ''}</span>
                <span>{text}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const Field: React.FC<{ label: string; wide?: boolean; children: React.ReactNode }> = ({
  label,
  wide,
  children,
}) => (
  <label style={{ display: 'flex', flexDirection: 'column', gap: '3px', gridColumn: wide ? '1 / -1' : undefined }}>
    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{label}</span>
    {children}
  </label>
)

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  modal: {
    width: 'min(1100px, 94vw)',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#181a20',
    border: '1px solid #334155',
    borderRadius: '8px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px 12px',
    padding: '10px 12px',
    backgroundColor: '#14161b',
    borderBottom: '1px solid #282b34',
  },
  body: { padding: '12px', overflowY: 'auto', flex: 1 },
  bodyPreview: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  /** Điện thoại: hộp thoại chiếm trọn màn hình, không viền không bo góc. */
  modalMobile: { width: '100vw', height: '100dvh', maxHeight: 'none', borderRadius: 0, border: 'none' },
  footer: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: '#14161b',
    borderTop: '1px solid #282b34',
    justifyContent: 'flex-end',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#38bdf8',
    margin: '14px 0 6px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '8px',
  },
  input: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '4px',
    color: '#e2e8f0',
    fontSize: '12px',
    padding: '5px 7px',
    width: '100%',
    boxSizing: 'border-box',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  th: {
    textAlign: 'left',
    padding: '4px 6px',
    color: '#94a3b8',
    fontSize: '11px',
    fontWeight: 600,
    borderBottom: '1px solid #334155',
    whiteSpace: 'nowrap',
  },
  td: { padding: '3px 6px', borderBottom: '1px solid #22252e', verticalAlign: 'middle' },
  cellInput: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '3px',
    color: '#e2e8f0',
    fontSize: '12px',
    padding: '4px 6px',
    width: '100%',
    boxSizing: 'border-box',
  },
  totals: {
    display: 'flex',
    gap: '18px',
    justifyContent: 'flex-end',
    marginTop: '10px',
    fontSize: '12px',
    color: '#cbd5e1',
  },
  toggle: {
    backgroundColor: '#1e293b',
    color: '#94a3b8',
    // Viết dạng dài: toggleOn chỉ đổi borderColor, trộn với `border` viết tắt là React cảnh báo.
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#334155',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  toggleOn: { backgroundColor: '#2563eb', color: '#ffffff', borderColor: '#60a5fa' },
  smallBtn: {
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    border: '1px solid #334155',
    borderRadius: '4px',
    padding: '3px 9px',
    fontSize: '11px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  removeBtn: {
    backgroundColor: 'transparent',
    color: '#f87171',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    padding: '2px 4px',
  },
  primaryBtn: {
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryBtn: {
    backgroundColor: '#334155',
    color: '#e2e8f0',
    border: 'none',
    borderRadius: '4px',
    padding: '6px 14px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  close: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '8px 12px 0',
    backgroundColor: '#181a20',
  },
  tab: {
    backgroundColor: 'transparent',
    color: '#94a3b8',
    // Viết dạng dài: S.tabOn chỉ đổi màu viền, trộn với `border` viết tắt thì
    // React cảnh báo và màu viền nhấp nháy giữa các lần render.
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '4px 4px 0 0',
    padding: '5px 14px',
    fontSize: '12px',
    cursor: 'pointer',
    fontWeight: 500,
  },
  tabOn: {
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    borderColor: '#334155',
    borderBottomColor: '#0f172a',
  },
  tabHint: { marginLeft: '8px', fontSize: '11px', color: '#475569' },
  menu: {
    position: 'absolute',
    top: 'calc(100% + 4px)',
    left: 0,
    zIndex: 10,
    minWidth: '210px',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '4px',
    boxShadow: '0 8px 20px rgba(0,0,0,0.5)',
    overflow: 'hidden',
  },
  menuItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '1px',
    backgroundColor: 'transparent',
    color: '#cbd5e1',
    border: 'none',
    textAlign: 'left',
    padding: '6px 10px',
    fontSize: '11px',
    cursor: 'pointer',
    width: '100%',
  },
  // Ghi chú chọn được nhiều dòng nên mỗi dòng là một hàng ngang có ô đánh dấu.
  noteMenuItem: { flexDirection: 'row', alignItems: 'center', gap: '6px' },
  menuItemOn: { backgroundColor: '#14303a', color: '#e2e8f0' },
  noteMenuBtn: {
    backgroundColor: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '3px',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: '10px',
    padding: '0 5px',
    flexShrink: 0,
  },
  disabled: { opacity: 0.45, cursor: 'not-allowed' },
}
