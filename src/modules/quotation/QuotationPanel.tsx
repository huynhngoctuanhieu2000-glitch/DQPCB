/**
 * Form nhập báo giá. Bốn cột lấy sẵn từ bo đang mở (tên, số lớp, kích thước,
 * màu phủ); số lượng / thành tiền / ghi chú người lập tự nhập.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { Board, BoardState } from '../../models/BoardDataModel'
import { MASK_COLORS } from '../../models/MaskColors'
import {
  applyVatFlag,
  createQuotation,
  emptyItem,
  itemFromBoard,
  QUOTATION_DEFAULTS,
  subtotal,
  vatAmount,
  grandTotal,
} from './QuotationModel'
import type { Quotation, QuotationItem } from './QuotationModel'
import { exportQuotationToPdf } from './exportPdf'
import { QuotationPreview } from './QuotationPreview'

const money = (n: number) => n.toLocaleString('vi-VN')

/**
 * Ô số lượng / thành tiền để người lập gõ tay: bỏ hết ký tự không phải chữ số
 * (kể cả dấu phân cách nghìn tự chèn) rồi mới đọc ra số. Xoá trắng = chưa nhập.
 */
const parseDigits = (raw: string): number | null => {
  const digits = raw.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

export const QuotationPanel: React.FC<{
  board: BoardState
  onClose: () => void
}> = ({ board, onClose }) => {
  const [q, setQ] = useState<Quotation>(() => createQuotation(false, board))
  const [tab, setTab] = useState<'form' | 'preview'>('form')
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const patch = (change: Partial<Quotation>) => setQ((prev) => ({ ...prev, ...change }))
  const patchCustomer = (change: Partial<Quotation['customer']>) =>
    setQ((prev) => ({ ...prev, customer: { ...prev.customer, ...change } }))

  const patchItem = (id: string, change: Partial<QuotationItem>) =>
    setQ((prev) => ({
      ...prev,
      items: prev.items.map((it) => (it.id === id ? { ...it, ...change } : it)),
    }))

  const removeItem = (id: string) =>
    setQ((prev) => ({
      ...prev,
      // Luôn chừa lại một dòng để bảng không rỗng hẳn.
      items: prev.items.length > 1 ? prev.items.filter((it) => it.id !== id) : prev.items,
    }))

  const addItem = () => setQ((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }))

  // Mở một bo thì thêm thẳng; mở nhiều bo thì xổ danh sách cho chọn.
  const [boardMenu, setBoardMenu] = useState(false)

  const addBoards = (list: Board[]) => {
    if (list.length === 0) return
    setQ((prev) => ({ ...prev, items: [...prev.items, ...list.map(itemFromBoard)] }))
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

  const handleExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      // Lưu mặc định ngay cạnh file gerber vừa nạp.
      const res = await exportQuotationToPdf(q, board.sourceDir)
      if (res.canceled) {
        setStatus(null)
      } else {
        setStatus({ kind: 'ok', text: res.filePath ? `Đã lưu: ${res.filePath}` : 'Đã xuất xong.' })
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
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        {/* Thanh tiêu đề */}
        <div style={S.header}>
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Xuất báo giá</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            {[
              { label: 'Khách lẻ (không VAT)', vat: false },
              { label: 'Công ty (VAT)', vat: true },
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
          <span style={S.tabHint}>
            Xem trước dựng đúng bố cục sẽ in ra PDF.
          </span>
        </div>

        <div style={S.body}>
          {tab === 'preview' ? (
            <QuotationPreview q={q} />
          ) : (
          <>
          {/* Thông tin khách */}
          <div style={S.sectionTitle}>Thông tin khách hàng</div>
          <div style={S.grid}>
            <Field label="Ngày báo giá">
              <input
                style={S.input}
                value={q.date}
                onChange={(e) => patch({ date: e.target.value })}
                placeholder="dd/mm/yyyy"
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
            <button onClick={addItem} style={S.smallBtn}>
              + Thêm dòng trống
            </button>
          </div>

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
                      <input
                        style={{ ...S.cellInput, width: '92px' }}
                        value={it.size}
                        onChange={(e) => patchItem(it.id, { size: e.target.value })}
                      />
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
                        onChange={(e) => patchItem(it.id, { quantity: parseDigits(e.target.value) })}
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
                        disabled={q.items.length === 1}
                        style={{ ...S.removeBtn, ...(q.items.length === 1 ? S.disabled : null) }}
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
            <span
              style={{
                fontSize: '11px',
                color: status.kind === 'ok' ? '#4ade80' : '#f87171',
                marginRight: 'auto',
                wordBreak: 'break-all',
              }}
            >
              {status.text}
            </span>
          )}
          <button onClick={onClose} style={S.secondaryBtn}>
            Đóng
          </button>
          <button
            onClick={handleExport}
            disabled={busy}
            style={{ ...S.primaryBtn, ...(busy ? S.disabled : null) }}
            title={board.sourceDir ? `Lưu vào ${board.sourceDir}` : 'Chọn chỗ lưu ở hộp thoại'}
          >
            {busy ? 'Đang xuất…' : '⬇ Xuất PDF'}
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

  const pick = (text: string) => {
    // Đã có chữ thì nối thêm dòng, không đạp lên cái đang gõ dở.
    onChange(value.trim() ? `${value.trim()}
${text}` : text)
    setMenu(false)
    areaRef.current?.focus()
  }

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
          {QUOTATION_DEFAULTS.noteSuggestions.map((text) => (
            <button key={text} onClick={() => pick(text)} style={S.menuItem}>
              {text}
            </button>
          ))}
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
    gap: '12px',
    padding: '10px 12px',
    backgroundColor: '#14161b',
    borderBottom: '1px solid #282b34',
  },
  body: { padding: '12px', overflowY: 'auto', flex: 1 },
  footer: {
    display: 'flex',
    alignItems: 'center',
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
    border: '1px solid #334155',
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
