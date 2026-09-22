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
import { ZoomBox } from '../../ui/ZoomBox'

/**
 * Bề rộng 9 cột, coi như px trên bảng rộng 1062px — đúng khổ in (xem PREVIEW_W).
 *
 * Theo tỉ lệ của form mẫu (bản Excel gửi khách thật, vd báo giá FRIWO 22/09/2026):
 * TÊN FILE và GHI CHÚ chiếm phần lớn bề ngang, gần bằng nhau — tên bo và ghi chú là
 * chữ dài nhất trong bảng. 7 cột số liệu chỉ vừa đủ cho tiêu đề (chữ đậm 11px +
 * lề ô) nằm một dòng, cộng ít dư cho dữ liệu hay gặp nhất: "Xanh dương" ở MÀU PHỦ,
 * "1000" ở SL, "1,725,000" ở THÀNH TIỀN.
 *
 * Khối cột D–I (KÍCH THƯỚC → GHI CHÚ) còn là ô tên công ty ở đầu trang (colSpan 6),
 * phải đủ cho dòng tên đỏ 18px không xuống hàng.
 */
const COL_WIDTHS = [38, 298, 60, 93, 72, 36, 89, 72, 304]
const TOTAL_W = COL_WIDTHS.reduce((a, b) => a + b, 0)

/**
 * Bề rộng dựng bản xem trước (px). Bằng đúng bề ngang in được của khổ A4 ngang, lề
 * 8mm mỗi bên (297mm - 16mm ≈ 281mm ≈ 1062px ở 96dpi — cùng con số PAGE_W/MARGIN
 * dùng khi xuất PDF ở exportImage.ts), cộng lề trắng 14px hai bên của khung xem
 * trước. Rộng hơn không làm trang in bị "rộng hơn A4": cả hai đường xuất PDF đều co
 * vừa khổ A4 sau đó (Electron ép `table{width:100%}` trong trang in;
 * html2canvas+pdf-lib co ảnh vừa trang) — ở đây chỉ là rộng hơn để mỗi cột có thêm
 * chỗ, xem trước cũng đúng bằng khổ in nên không phải đoán co lại thế nào.
 */
export const PREVIEW_W = 1062 + 2 * 14

/** Số dòng trống có sẵn viền dưới bảng — phải khớp SPARE_ROWS của exportExcel.ts. */
const SPARE_ROWS = 1

const HEADER_BG = '#3B618E'
const TITLE_BG = '#95B3D7'
const NOTE_BG = '#FFFF00'
const SPEC_BG = '#92D050'

const money = (n: number | null) => (n === null ? '' : n.toLocaleString('en-US'))

// Tên file gerber thật không có khoảng trắng (vd "ESP32_Multi_Purpose_IoT_Kit") —
// trình duyệt chỉ tự xuống dòng ở chỗ có khoảng trắng, nên một chuỗi dài dính liền
// bị coi là "một từ" và tràn ra ngoài ô thay vì xuống dòng. overflowWrap: 'break-word'
// (+ wordBreak cho trình duyệt cũ) cho phép ngắt giữa từ khi nó dài hơn cả ô.
const breakWord: React.CSSProperties = { overflowWrap: 'break-word', wordBreak: 'break-word' }

const cell: React.CSSProperties = {
  border: '1px solid #000',
  padding: '3px 5px',
  textAlign: 'center',
  verticalAlign: 'middle',
  fontSize: '12px',
  ...breakWord,
}
/** Dòng thông tin khách + lời mở đầu: không kẻ ô, chỉ có khung ngoài như file mẫu. */
const info: React.CSSProperties = {
  padding: '3px 5px',
  textAlign: 'left',
  verticalAlign: 'middle',
  fontSize: '12px',
  ...breakWord,
}
const tag: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', whiteSpace: 'nowrap' }
const plain: React.CSSProperties = { padding: '2px 5px', fontSize: '11px', verticalAlign: 'middle', ...breakWord }

/** Tab Xem trước trong app: tờ báo giá đặt trong khung co vừa + zoom. */
export const QuotationPreview: React.FC<{ q: Quotation }> = ({ q }) => (
  // Xem trước luôn dựng đúng 928 px như bản in; ZoomBox co cho vừa khung (điện thoại
  // cũng thấy nguyên trang) rồi người xem phóng to chỗ cần đọc.
  <ZoomBox contentWidth={PREVIEW_W}>
    <QuotationSheet q={q} />
  </ZoomBox>
)

/**
 * Tờ báo giá thuần (bảng 928 px, nền trắng) — dùng cho cả xem trước, in PDF và
 * xuất ảnh, nên KHÔNG được có nút bấm hay thứ gì chỉ có ý nghĩa trên màn hình.
 */
export const QuotationSheet: React.FC<{ q: Quotation }> = ({ q }) => {
  const totals = { sub: subtotal(q), vat: vatAmount(q), total: grandTotal(q) }
  const branding = brandingFor(q.hasVat)
  // Có dòng giảm giá thì đã có một dòng "thừa" sẵn ở cuối bảng, không chừa thêm dòng trống nữa.
  const spare = Array.from({ length: q.items.some((it) => it.discount) ? 0 : SPARE_ROWS })
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
            <td style={{ ...cell, fontSize: '14px', fontWeight: 700, lineHeight: 1.35 }} colSpan={6}>
              {/* Không xuống dòng: trên iPhone font Times rộng hơn Times New Roman một chút,
                  20px là chữ "PCB" rớt xuống hàng dưới trong file PDF. */}
              <div style={{ fontSize: '18px', color: '#C00000', marginBottom: '2px', whiteSpace: 'nowrap' }}>{q.company.name}</div>
              <div>{q.company.address}</div>
              <div>{q.company.contact}</div>
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
            <td style={{ ...info, fontSize: '14px', fontWeight: 700 }} colSpan={9}>
              {`   Ngày báo giá: ${q.date}`}
            </td>
          </tr>
          <tr>
            <td style={{ ...info, fontSize: '14px', fontWeight: 700 }} colSpan={6}>
              {`   Kính gửi: ${q.customer.name}`}
            </td>
            <td style={{ ...info, fontSize: '14px', fontWeight: 700 }} colSpan={3}>
              {q.hasVat ? `MST: ${q.customer.taxCode}` : ''}
            </td>
          </tr>
          {q.hasVat ? (
            <tr>
              <td style={{ ...info, fontSize: '14px', fontWeight: 700 }} colSpan={2}>
                {`   Email: ${q.customer.email}`}
              </td>
              <td style={plain} />
              <td style={plain} />
              <td style={plain} />
              <td style={plain} />
              <td style={{ ...info, fontSize: '14px', fontWeight: 700 }} colSpan={3}>
                {`Địa chỉ: ${q.customer.address}`}
              </td>
            </tr>
          ) : (
            <tr>
              <td style={{ ...info, fontSize: '14px', fontWeight: 700 }} colSpan={3}>
                {`   SĐT: ${q.customer.phone}`}
              </td>
              <td style={{ ...info, fontSize: '14px', fontWeight: 700 }} colSpan={6}>
                {`          Địa chỉ: ${q.customer.address}`}
              </td>
            </tr>
          )}

          {/* Lời mở đầu */}
          <tr style={{ height: '45px' }}>
            <td style={{ ...info, fontStyle: 'italic' }} colSpan={9}>
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
                style={{ ...cell, backgroundColor: HEADER_BG, color: '#fff', fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap', height: '32px' }}
              >
                {h}
              </td>
            ))}
          </tr>

          {/* Dòng hàng */}
          {q.items.map((it, i) =>
            it.discount ? (
              // Dòng giảm giá: gộp STT → SL (6 cột) thành một ô, cùng bề rộng với ô "TỔNG CỘNG" bên dưới.
              <tr key={it.id}>
                <td style={{ ...cell, fontWeight: 700 }} colSpan={6}>
                  {it.name}
                </td>
                <td style={{ ...cell, color: '#FF0000' }}>{money(it.amount)}</td>
                <td style={cell} />
                <td style={{ ...cell, whiteSpace: 'pre-line' }}>{it.note}</td>
              </tr>
            ) : (
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
            ),
          )}
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
            {/* Nền màu chỉ ôm vừa chữ, không kéo dài hết cột. */}
            <td style={plain} colSpan={5}>
              <span style={{ ...tag, backgroundColor: NOTE_BG, fontWeight: 700, fontSize: '14px' }}>Ghi chú:</span>
            </td>
            <td style={plain} colSpan={3}>
              <span style={{ ...tag, backgroundColor: SPEC_BG, fontSize: '12px' }}>
                THÔNG SỐ MẶC ĐỊNH: (nếu không ghi chú)
              </span>
            </td>
          </tr>
          {Array.from({ length: noteRows }).map((_, i) => (
            <tr key={`note-${i}`}>
              <td style={plain} />
              <td style={plain} colSpan={5}>
                {q.notes[i] ?? ''}
              </td>
              <td style={plain} colSpan={3}>
                {q.defaultSpecs[i] ?? ''}
              </td>
            </tr>
          ))}

          <tr style={{ height: '20px' }}>
            <td colSpan={9} style={{ borderBottom: '1px solid #000' }} />
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
            <td style={{ ...plain, fontSize: '14px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }} colSpan={2}>
              Khách hàng
            </td>
            <td style={{ ...plain, fontSize: '14px', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>
              Người lập
            </td>
          </tr>
          {/* Mỗi số tài khoản kèm mã QR của chính nó ngay bên dưới, xếp cạnh nhau —
              để một dòng dài rồi thả hai mã QR bên dưới thì không biết mã nào của
              ngân hàng nào, mà dòng đó cũng bị ngắt lung tung.
              Form VAT không có mã QR: hàng này khi đó chỉ cao một dòng chữ, chữ ký dính
              sát ngay dưới "Khách hàng" — nên giữ chiều cao tối thiểu làm chỗ ký, và đặt
              số tài khoản lên đầu hàng thay vì lơ lửng giữa khoảng trống đó. */}
          <tr style={{ height: branding.qr.length > 0 ? undefined : '110px' }}>
            <td style={plain} />
            <td style={{ ...plain, verticalAlign: 'top' }}>
              <div style={{ display: 'flex', gap: '26px', alignItems: 'flex-start' }}>
                {q.bank.lines.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      // Không đặt alignItems thì flex kéo giãn ảnh ra bằng bề ngang cột,
                      // mà chiều cao lại cố định -> mã QR bị bẹp. Căn giữa để mã QR
                      // nằm đúng dưới số tài khoản của nó.
                      alignItems: 'center',
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
            <td style={plain} colSpan={4} />
            {/* Chữ ký và tên người lập nằm cùng hàng với mã QR, sát đáy mã. */}
            <td
              style={{ ...plain, fontSize: '13px', textAlign: 'center', verticalAlign: 'bottom', whiteSpace: 'nowrap' }}
              colSpan={2}
            >
              (Kí và ghi rõ họ tên)
            </td>
            <td
              style={{
                ...plain,
                fontSize: '13px',
                fontWeight: 700,
                color: '#FF0000',
                textAlign: 'center',
                verticalAlign: 'bottom',
                whiteSpace: 'nowrap',
              }}
            >
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
  width: PREVIEW_W,
  boxSizing: 'border-box',
}

const table: React.CSSProperties = {
  // Co vừa khung như lúc in: file mẫu cũng ép cả 9 cột vào một trang A4 ngang.
  width: '100%',
  borderCollapse: 'collapse',
  border: '1px solid #000',
  tableLayout: 'fixed',
  fontFamily: '"Times New Roman", Times, serif',
  color: '#000000',
  backgroundColor: '#ffffff',
}
