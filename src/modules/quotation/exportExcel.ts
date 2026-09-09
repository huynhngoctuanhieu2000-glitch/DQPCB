/**
 * Dựng workbook báo giá từ một `Quotation`.
 *
 * Bám bố cục của hai form Thiên Lam PCB đang dùng (templates/bao-gia/), nhưng
 * KHÔNG bê nguyên xi: file mẫu còn 33 dòng `=F11*#REF!`, một loạt dòng rác lệch
 * cột, và công thức tổng dùng INDIRECT để tự dò vùng dữ liệu. Sinh bằng code thì
 * ta biết chính xác vùng nào là dữ liệu nên viết thẳng `=SUM(G10:G13)`.
 */
import ExcelJS from 'exceljs'
import type { Quotation } from './QuotationModel'
import { brandingFor, splitDataUrl } from './branding'

const FONT = 'Times New Roman'

// Màu lấy từ file mẫu: accent1 của theme, đậm 25% cho dải tiêu đề bảng và
// nhạt 40% cho dòng tên báo giá.
const HEADER_BG = 'FF3B618E'
const TITLE_BG = 'FF95B3D7'
const NOTE_BG = 'FFFFFF00'
const SPEC_BG = 'FF92D050'
const RED = 'FFFF0000'
const WHITE = 'FFFFFFFF'

/** Số dòng trống có sẵn viền dưới bảng, để người lập gõ thêm mà tổng vẫn đúng. */
const SPARE_ROWS = 2

const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
const boxed = { top: thin, left: thin, bottom: thin, right: thin }

interface StyleOpts {
  text?: ExcelJS.CellValue
  size?: number
  bold?: boolean
  color?: string
  fill?: string
  align?: 'left' | 'center' | 'right'
  wrap?: boolean
  border?: boolean
  numFmt?: string
  underline?: boolean
}

const style = (cell: ExcelJS.Cell, opts: StyleOpts = {}) => {
  if (opts.text !== undefined) cell.value = opts.text
  cell.font = {
    name: FONT,
    size: opts.size ?? 12,
    bold: opts.bold ?? false,
    underline: opts.underline ?? false,
    color: { argb: opts.color ?? 'FF000000' },
  }
  cell.alignment = {
    horizontal: opts.align ?? 'center',
    vertical: 'middle',
    wrapText: opts.wrap ?? false,
  }
  if (opts.fill) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } }
  }
  if (opts.border) cell.border = boxed
  if (opts.numFmt) cell.numFmt = opts.numFmt
  return cell
}

/** Viền cho cả dải ô — ô gộp chỉ đủ viền khi từng ô con được đặt. */
const borderRange = (ws: ExcelJS.Worksheet, row: number, from: number, to: number) => {
  for (let c = from; c <= to; c++) ws.getCell(row, c).border = boxed
}

export const buildQuotationWorkbook = (q: Quotation): ExcelJS.Workbook => {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DQPCB'
  wb.created = new Date()

  const ws = wb.addWorksheet(q.hasVat ? 'BAO GIA' : 'Bao Gia', {
    views: [{ showGridLines: false }],
  })

  // Bề rộng cột lấy từ form mẫu: B chứa ghi chú dài, I chứa thông số mặc định.
  const widths = [7.9, 80, 10.7, 18.4, 14, 7.4, 16.7, 16.7, 88.7]
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w))

  const branding = brandingFor(q.hasVat)

  // ---- 1. Đầu trang: logo + tên & liên hệ công ty ----
  ws.getRow(1).height = 90.75
  ws.getRow(2).height = 24.75
  ws.mergeCells('A1:C2')
  ws.mergeCells('D1:I2')

  // Hai dòng đầu cao 115.5pt ~ 154px. Chừa lề rồi co logo theo chiều cao, bề ngang
  // tính lại theo tỉ lệ gốc để không bị méo.
  const logoH = 132
  const logoW = Math.round(logoH * (branding.logo.width / branding.logo.height))
  const logo = splitDataUrl(branding.logo.dataUrl)
  ws.addImage(wb.addImage({ base64: logo.base64, extension: logo.extension }), {
    tl: { col: 0.15, row: 0.1 },
    ext: { width: logoW, height: logoH },
  })
  style(ws.getCell('D1'), {
    text: [q.company.name, q.company.address, q.company.contact].join('\r\n'),
    size: 13,
    bold: true,
    wrap: true,
  })
  borderRange(ws, 1, 1, 9)
  borderRange(ws, 2, 1, 9)

  // ---- 2. Tiêu đề ----
  ws.getRow(3).height = 15.75
  ws.getRow(4).height = 24
  ws.mergeCells('A3:I4')
  style(ws.getCell('A3'), { text: q.title, size: 18, bold: true, fill: TITLE_BG, wrap: true })
  borderRange(ws, 3, 1, 9)
  borderRange(ws, 4, 1, 9)

  // ---- 3. Thông tin khách ----
  ws.getRow(5).height = 21
  ws.mergeCells('A5:I5')
  style(ws.getCell('A5'), {
    text: `   Ngày báo giá: ${q.date}`,
    size: 14,
    bold: true,
    align: 'left',
  })
  borderRange(ws, 5, 1, 9)

  ws.getRow(6).height = 21
  ws.mergeCells('A6:F6')
  ws.mergeCells('G6:I6')
  style(ws.getCell('A6'), {
    text: `   Kính gửi: ${q.customer.name}`,
    size: 14,
    bold: true,
    align: 'left',
  })
  style(ws.getCell('G6'), {
    text: q.hasVat ? `MST: ${q.customer.taxCode}` : null,
    size: 14,
    bold: true,
    align: 'left',
  })
  borderRange(ws, 6, 1, 9)

  // Form không VAT hỏi SĐT, form VAT hỏi email — địa chỉ thì cả hai đều có.
  ws.getRow(7).height = 26.4
  if (q.hasVat) {
    ws.mergeCells('A7:B7')
    ws.mergeCells('G7:I7')
    style(ws.getCell('A7'), {
      text: `   Email: ${q.customer.email}`,
      size: 14,
      bold: true,
      align: 'left',
    })
    style(ws.getCell('G7'), {
      text: `Địa chỉ: ${q.customer.address}`,
      size: 14,
      bold: true,
      align: 'left',
      wrap: true,
    })
  } else {
    ws.mergeCells('A7:C7')
    ws.mergeCells('D7:I7')
    style(ws.getCell('A7'), {
      text: `   SĐT: ${q.customer.phone}`,
      size: 14,
      bold: true,
      align: 'left',
    })
    style(ws.getCell('D7'), {
      text: `          Địa chỉ: ${q.customer.address}`,
      size: 14,
      bold: true,
      align: 'left',
      wrap: true,
    })
  }
  borderRange(ws, 7, 1, 9)

  // ---- 4. Lời mở đầu ----
  ws.getRow(8).height = 45
  ws.mergeCells('A8:I8')
  style(ws.getCell('A8'), { text: q.intro, size: 12, align: 'left', wrap: true })
  borderRange(ws, 8, 1, 9)

  // ---- 5. Tiêu đề bảng ----
  const HEAD_ROW = 9
  ws.getRow(HEAD_ROW).height = 27
  const headers = [
    'STT ',
    q.hasVat ? 'TÊN HÀNG HOÁ' : 'TÊN FILE',
    'SỐ LỚP',
    'KÍCH THƯỚC',
    'MÀU PHỦ    ',
    'SL',
    'THÀNH TIỀN ',
    'ĐƠN GIÁ',
    'GHI CHÚ',
  ]
  headers.forEach((h, i) =>
    style(ws.getCell(HEAD_ROW, i + 1), {
      text: h,
      size: 11,
      bold: true,
      color: WHITE,
      fill: HEADER_BG,
      wrap: true,
      border: true,
    })
  )

  // ---- 6. Dòng hàng ----
  const FIRST_ITEM = HEAD_ROW + 1
  const rowCount = q.items.length + SPARE_ROWS
  const LAST_ITEM = FIRST_ITEM + rowCount - 1

  for (let i = 0; i < rowCount; i++) {
    const r = FIRST_ITEM + i
    const item: Quotation['items'][number] | undefined = q.items[i]
    ws.getRow(r).height = 22.8

    style(ws.getCell(r, 1), { text: item ? i + 1 : null, size: 12, wrap: true, border: true })
    style(ws.getCell(r, 2), { text: item?.name || null, size: 13, border: true })
    style(ws.getCell(r, 3), { text: item?.layers || null, size: 12, wrap: true, border: true })
    style(ws.getCell(r, 4), { text: item?.size || null, size: 13, border: true })
    style(ws.getCell(r, 5), { text: item?.maskColor || null, size: 12, wrap: true, border: true })
    style(ws.getCell(r, 6), {
      text: item?.quantity ?? null,
      size: 12,
      wrap: true,
      border: true,
      numFmt: '0',
    })
    style(ws.getCell(r, 7), {
      text: item?.amount ?? null,
      size: 12,
      wrap: true,
      border: true,
      numFmt: '#,##0',
    })
    // ĐƠN GIÁ tính ngược từ THÀNH TIỀN — đúng chiều của form mẫu. IFERROR để dòng
    // trống không hiện #DIV/0!, và người lập gõ thêm dòng là có ngay đơn giá.
    style(ws.getCell(r, 8), {
      text: { formula: `IFERROR(G${r}/F${r},"")` },
      size: 12,
      wrap: true,
      border: true,
      numFmt: '#,##0',
    })
    style(ws.getCell(r, 9), { text: item?.note || null, size: 12, wrap: true, border: true })
  }

  // ---- 7. Tổng cộng ----
  // Vùng SUM phủ luôn mấy dòng trống dưới bảng: chèn thêm dòng vào giữa thì Excel
  // tự nới công thức, tổng vẫn đúng.
  const sumRange = `G${FIRST_ITEM}:G${LAST_ITEM}`
  let row = LAST_ITEM + 1

  const totalRow = (label: string, formula: string, red: boolean, note?: string) => {
    const at = row
    ws.getRow(at).height = 24
    ws.mergeCells(at, 1, at, 6)
    style(ws.getCell(at, 1), { text: label, size: 12, bold: true, wrap: true })
    borderRange(ws, at, 1, 6)
    style(ws.getCell(at, 7), {
      text: { formula },
      size: 12,
      bold: true,
      color: red ? RED : undefined,
      wrap: true,
      border: true,
      numFmt: '#,##0',
    })
    style(ws.getCell(at, 8), { border: true })
    style(ws.getCell(at, 9), { text: note ?? null, size: 12, bold: true, wrap: true, border: true })
    row = at + 1
    return at
  }

  if (q.hasVat) {
    const sub = totalRow('Thành tiền trước thuế', `SUM(${sumRange})`, false)
    const pct = +(q.vatRate * 100).toFixed(2)
    const vat = totalRow(
      `Tiền thuế hóa đơn VAT (${pct}%)`,
      `G${sub}*${q.vatRate}`,
      false,
      `Thuế ${pct}%`
    )
    totalRow('TỔNG CỘNG:', `G${sub}+G${vat}`, true)
  } else {
    totalRow('TỔNG CỘNG', `SUM(${sumRange})`, true)
  }

  // ---- 8. Ghi chú (cột B) + thông số mặc định (cột G:I) ----
  row += 1
  const noteHead = row
  ws.getRow(noteHead).height = 20
  style(ws.getCell(noteHead, 2), {
    text: 'Ghi chú:',
    size: 14,
    bold: true,
    fill: NOTE_BG,
    align: 'left',
  })
  ws.mergeCells(noteHead, 7, noteHead, 9)
  style(ws.getCell(noteHead, 7), {
    text: 'THÔNG SỐ MẶC ĐỊNH: (nếu không ghi chú)',
    size: 12,
    fill: SPEC_BG,
    align: 'left',
  })
  row++

  const blockLen = Math.max(q.notes.length, q.defaultSpecs.length)
  for (let i = 0; i < blockLen; i++) {
    ws.getRow(row).height = 19.2
    if (q.notes[i]) style(ws.getCell(row, 2), { text: q.notes[i], size: 11, align: 'left' })
    if (q.defaultSpecs[i]) {
      ws.mergeCells(row, 7, row, 9)
      style(ws.getCell(row, 7), { text: q.defaultSpecs[i], size: 11, align: 'left' })
    }
    row++
  }

  // ---- 9. Tài khoản (cột B) + chữ ký (cột G, I) ----
  row += 2
  const bankTitle = row
  ws.getRow(bankTitle).height = 20.4
  style(ws.getCell(bankTitle, 2), {
    text: 'Thông tin tài khoản ',
    size: 16,
    bold: true,
    underline: true,
    align: 'left',
  })

  const sigHead = bankTitle + 1
  ws.getRow(sigHead).height = 18
  style(ws.getCell(sigHead, 2), { text: q.bank.holder, size: 14, align: 'left' })
  style(ws.getCell(sigHead, 7), { text: 'Khách hàng', size: 14, bold: true })
  style(ws.getCell(sigHead, 9), { text: 'Người lập ', size: 14, bold: true })

  q.bank.lines.forEach((line, i) => {
    const r = sigHead + 1 + i
    ws.getRow(r).height = 18
    style(ws.getCell(r, 2), { text: line, size: 14, align: 'left', wrap: true })
  })

  // Mã QR chuyển khoản, xếp cạnh nhau ngay dưới số tài khoản (form VAT không có).
  const qrTop = sigHead + q.bank.lines.length + 1
  let qrLeft = 1.1
  branding.qr.forEach((img) => {
    const h = 120
    const w = Math.round(h * (img.width / img.height))
    const { base64, extension } = splitDataUrl(img.dataUrl)
    ws.addImage(wb.addImage({ base64, extension }), {
      tl: { col: qrLeft, row: qrTop - 1 },
      ext: { width: w, height: h },
    })
    // Cột B rất rộng (80 ký tự ~ 560px) nên hai mã nằm vừa cạnh nhau trong đó.
    qrLeft += (w + 24) / 7
  })

  // Chừa chỗ ký — dòng ký tên phải nằm dưới cả khối tài khoản.
  // Có mã QR thì khối tài khoản cao thêm, dòng ký tên phải đẩy xuống theo.
  const qrRows = branding.qr.length > 0 ? 7 : 0
  const sigFoot = sigHead + Math.max(q.bank.lines.length, 2) + 3 + qrRows
  for (let r = sigHead + 1; r < sigFoot; r++) ws.getRow(r).height = 18
  ws.getRow(sigFoot).height = 20
  style(ws.getCell(sigFoot, 7), { text: '(Kí và ghi rõ họ tên)', size: 13 })
  style(ws.getCell(sigFoot, 9), { text: q.preparedBy, size: 13, bold: true, color: RED })

  // ---- 10. In: A4 ngang, ép vừa một trang bề ngang (form mẫu cũng ngang) ----
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0, footer: 0 },
    printArea: `A1:I${sigFoot}`,
  }

  return wb
}

/** Workbook → bytes, sẵn sàng ghi ra đĩa hoặc tải về. */
export const exportQuotationToXlsx = async (q: Quotation): Promise<Uint8Array> => {
  const wb = buildQuotationWorkbook(q)
  const buffer = await wb.xlsx.writeBuffer()
  return new Uint8Array(buffer as ArrayBuffer)
}
