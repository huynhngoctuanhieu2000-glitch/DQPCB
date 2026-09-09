/**
 * Xem trước báo giá — dựng lại đúng bố cục mà exportExcel.ts sẽ ghi ra file:
 * cùng 9 cột, cùng tỉ lệ bề rộng, cùng màu và cỡ chữ. Xem ở đây thấy sao thì mở
 * bằng Excel thấy vậy, không phải xuất ra rồi mới biết lệch.
 *
 * Đơn giá và các dòng tổng trong file là công thức; ở đây tính sẵn để hiển thị.
 */
import React from 'react'
import type { Quotation } from './QuotationModel'
import { grandTotal, subtotal, vatAmount } from './QuotationModel'
import { brandingFor } from './branding'

/** Bề rộng cột trong exportExcel.ts, quy ra phần trăm. */
const COL_WIDTHS = [7.9, 80, 10.7, 18.4, 14, 7.4, 16.7, 16.7, 88.7]
const TOTAL_W = COL_WIDTHS.reduce((a, b) => a + b, 0)

/** Số dòng trống có sẵn viền dưới bảng — phải khớp SPARE_ROWS của exportExcel.ts. */
const SPARE_ROWS = 2

const HEADER_BG = '#3B618E'
const TITLE_BG = '#95B3D7'
const NOTE_BG = '#FFFF00'
const SPEC_BG = '#92D050'

const money = (n: number | null) => (n === null ? '' : n.toLocaleString('en-US'))

const cell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '3px 5px',
  textAlign: 'center',
  verticalAlign: 'middle',
  fontSize: '12px',
}
const plain: React.CSSProperties = { padding: '2px 5px', fontSize: '11px', verticalAlign: 'middle' }

export const QuotationPreview: React.FC<{ q: Quotation }> = ({ q }) => {
  const totals = { sub: subtotal(q), vat: vatAmount(q), total: grandTotal(q) }
  const branding = brandingFor(q.hasVat)
  const spare = Array.from({ length: SPARE_ROWS })
  const noteRows = Math.max(q.notes.length, q.defaultSpecs.length)

  return (
    <div style={wrap}>
      <table style={table}>
        <colgroup>
          {COL_WIDTHS.map((w, i) => (
            <col key={i} style={{ width: `${(w / TOTAL_W) * 100}%` }} />
          ))}
        </colgroup>
        <tbody>
          {/* Đầu trang */}
          <tr style={{ height: '90px' }}>
            <td style={cell} colSpan={3}>
              <img
                src={branding.logo.dataUrl}
                alt=""
                style={{ maxHeight: '84px', maxWidth: '96%', objectFit: 'contain' }}
              />
            </td>
            <td style={{ ...cell, fontSize: '13px', fontWeight: 700, whiteSpace: 'pre-line' }} colSpan={6}>
              {[q.company.name, q.company.address, q.company.contact].join('\n')}
            </td>
          </tr>

          {/* Tiêu đề */}
          <tr style={{ height: '40px' }}>
            <td style={{ ...cell, fontSize: '18px', fontWeight: 700, backgroundColor: TITLE_BG }} colSpan={9}>
              {q.title}
            </td>
          </tr>

          {/* Thông tin khách */}
          <tr>
            <td style={{ ...cell, textAlign: 'left', fontSize: '14px', fontWeight: 700 }} colSpan={9}>
              {`   Ngày báo giá: ${q.date}`}
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, textAlign: 'left', fontSize: '14px', fontWeight: 700 }} colSpan={6}>
              {`   Kính gửi: ${q.customer.name}`}
            </td>
            <td style={{ ...cell, textAlign: 'left', fontSize: '14px', fontWeight: 700 }} colSpan={3}>
              {q.hasVat ? `MST: ${q.customer.taxCode}` : ''}
            </td>
          </tr>
          {q.hasVat ? (
            <tr>
              <td style={{ ...cell, textAlign: 'left', fontSize: '14px', fontWeight: 700 }} colSpan={2}>
                {`   Email: ${q.customer.email}`}
              </td>
              <td style={cell} />
              <td style={cell} />
              <td style={cell} />
              <td style={cell} />
              <td style={{ ...cell, textAlign: 'left', fontSize: '14px', fontWeight: 700 }} colSpan={3}>
                {`Địa chỉ: ${q.customer.address}`}
              </td>
            </tr>
          ) : (
            <tr>
              <td style={{ ...cell, textAlign: 'left', fontSize: '14px', fontWeight: 700 }} colSpan={3}>
                {`   SĐT: ${q.customer.phone}`}
              </td>
              <td style={{ ...cell, textAlign: 'left', fontSize: '14px', fontWeight: 700 }} colSpan={6}>
                {`          Địa chỉ: ${q.customer.address}`}
              </td>
            </tr>
          )}

          {/* Lời mở đầu */}
          <tr style={{ height: '45px' }}>
            <td style={{ ...cell, textAlign: 'left' }} colSpan={9}>
              {q.intro}
            </td>
          </tr>

          {/* Tiêu đề bảng */}
          <tr>
            {[
              'STT',
              q.hasVat ? 'TÊN HÀNG HOÁ' : 'TÊN FILE',
              'SỐ LỚP',
              'KÍCH THƯỚC',
              'MÀU PHỦ',
              'SL',
              'THÀNH TIỀN',
              'ĐƠN GIÁ',
              'GHI CHÚ',
            ].map((h) => (
              <td
                key={h}
                style={{ ...cell, backgroundColor: HEADER_BG, color: '#fff', fontWeight: 700, fontSize: '11px' }}
              >
                {h}
              </td>
            ))}
          </tr>

          {/* Dòng hàng */}
          {q.items.map((it, i) => (
            <tr key={it.id}>
              <td style={cell}>{i + 1}</td>
              <td style={{ ...cell, fontSize: '13px' }}>{it.name}</td>
              <td style={cell}>{it.layers}</td>
              <td style={{ ...cell, fontSize: '13px' }}>{it.size}</td>
              <td style={cell}>{it.maskColor}</td>
              <td style={cell}>{it.quantity ?? ''}</td>
              <td style={cell}>{money(it.amount)}</td>
              <td style={cell}>
                {it.quantity && it.amount ? money(Math.round(it.amount / it.quantity)) : ''}
              </td>
              <td style={{ ...cell, whiteSpace: 'pre-line' }}>{it.note}</td>
            </tr>
          ))}
          {/* Dòng trống có sẵn viền, để gõ thêm trong Excel mà tổng vẫn đúng */}
          {spare.map((_, i) => (
            <tr key={`spare-${i}`}>
              {COL_WIDTHS.map((_w, c) => (
                <td key={c} style={cell}>
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}

          {/* Tổng cộng */}
          {q.hasVat ? (
            <>
              <TotalRow label="Thành tiền trước thuế" value={totals.sub} />
              <TotalRow
                label={`Tiền thuế hóa đơn VAT (${+(q.vatRate * 100).toFixed(2)}%)`}
                value={totals.vat}
                note={`Thuế ${+(q.vatRate * 100).toFixed(2)}%`}
              />
              <TotalRow label="TỔNG CỘNG:" value={totals.total} red />
            </>
          ) : (
            <TotalRow label="TỔNG CỘNG" value={totals.total} red />
          )}

          <tr style={{ height: '14px' }}>
            <td colSpan={9} />
          </tr>

          {/* Ghi chú + thông số mặc định */}
          <tr>
            <td style={plain} />
            <td style={{ ...plain, backgroundColor: NOTE_BG, fontWeight: 700, fontSize: '14px' }}>
              Ghi chú:
            </td>
            <td style={plain} colSpan={4} />
            <td style={{ ...plain, backgroundColor: SPEC_BG, fontSize: '12px' }} colSpan={3}>
              THÔNG SỐ MẶC ĐỊNH: (nếu không ghi chú)
            </td>
          </tr>
          {Array.from({ length: noteRows }).map((_, i) => (
            <tr key={`note-${i}`}>
              <td style={plain} />
              <td style={plain}>{q.notes[i] ?? ''}</td>
              <td style={plain} colSpan={4} />
              <td style={plain} colSpan={3}>
                {q.defaultSpecs[i] ?? ''}
              </td>
            </tr>
          ))}

          <tr style={{ height: '20px' }}>
            <td colSpan={9} />
          </tr>

          {/* Tài khoản + chữ ký */}
          <tr>
            <td style={plain} />
            <td style={{ ...plain, fontSize: '16px', fontWeight: 700, textDecoration: 'underline' }}>
              Thông tin tài khoản
            </td>
            <td style={plain} colSpan={7} />
          </tr>
          <tr>
            <td style={plain} />
            <td style={{ ...plain, fontSize: '14px' }}>{q.bank.holder}</td>
            <td style={plain} colSpan={4} />
            <td style={{ ...plain, fontSize: '14px', fontWeight: 700, textAlign: 'center' }}>
              Khách hàng
            </td>
            <td style={plain} />
            <td style={{ ...plain, fontSize: '14px', fontWeight: 700, textAlign: 'center' }}>
              Người lập
            </td>
          </tr>
          {/* Mỗi số tài khoản kèm mã QR của chính nó ngay bên dưới, xếp cạnh nhau —
              để một dòng dài rồi thả hai mã QR bên dưới thì không biết mã nào của
              ngân hàng nào, mà dòng đó cũng bị ngắt lung tung. */}
          <tr>
            <td style={plain} />
            <td style={plain}>
              <div style={{ display: 'flex', gap: '26px', alignItems: 'flex-start' }}>
                {q.bank.lines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      // Không có dòng này thì flex kéo giãn ảnh ra bằng bề ngang cột,
                      // mà chiều cao lại cố định -> mã QR bị bẹp.
                      alignItems: 'flex-start',
                    }}
                  >
                    <span style={{ fontSize: '14px', whiteSpace: 'nowrap' }}>{line}</span>
                    {branding.qr[i] && (
                      <img
                        src={branding.qr[i].dataUrl}
                        alt=""
                        style={{ height: '112px', width: 'auto' }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </td>
            <td style={plain} colSpan={7} />
          </tr>

          {/* Chừa chỗ ký. Bên dưới đã có khối mã QR khá cao rồi thì chừa ít thôi,
              không thì hai chữ ký bị đẩy xuống tận đáy trang. */}
          <tr style={{ height: branding.qr.length > 0 ? '14px' : '54px' }}>
            <td colSpan={9} />
          </tr>
          <tr>
            <td style={plain} colSpan={6} />
            <td style={{ ...plain, fontSize: '13px', textAlign: 'center' }}>(Kí và ghi rõ họ tên)</td>
            <td style={plain} />
            <td style={{ ...plain, fontSize: '13px', fontWeight: 700, color: '#FF0000', textAlign: 'center' }}>
              {q.preparedBy}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const TotalRow: React.FC<{ label: string; value: number; red?: boolean; note?: string }> = ({
  label,
  value,
  red,
  note,
}) => (
  <tr>
    <td style={{ ...cell, fontWeight: 700 }} colSpan={6}>
      {label}
    </td>
    <td style={{ ...cell, fontWeight: 700, color: red ? '#FF0000' : undefined }}>{money(value)}</td>
    <td style={cell} />
    <td style={{ ...cell, fontWeight: 700 }}>{note ?? ''}</td>
  </tr>
)

const wrap: React.CSSProperties = {
  backgroundColor: '#ffffff',
  padding: '14px',
  borderRadius: '4px',
  overflowX: 'auto',
}

const table: React.CSSProperties = {
  // Co vừa khung như lúc in: file mẫu cũng ép cả 9 cột vào một trang A4 ngang.
  width: '100%',
  minWidth: '900px',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  fontFamily: '"Times New Roman", Times, serif',
  color: '#000000',
  backgroundColor: '#ffffff',
}
