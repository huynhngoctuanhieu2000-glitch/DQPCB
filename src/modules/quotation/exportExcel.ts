/**
 * Dựng workbook báo giá từ một `Quotation`.
 *
 * Bám bố cục của hai form Thiên Lam PCB đang dùng (templates/bao-gia/) và của
 * QuotationSheet (QuotationPreview.tsx) — hai nơi phải khớp nhau: xem trước
 * trong app thấy sao thì mở file Excel thấy vậy, không phải xuất ra rồi mới
 * biết lệch. KHÔNG bê nguyên xi file mẫu: file mẫu còn 33 dòng `=F11*#REF!`,
 * một loạt dòng rác lệch cột, và công thức tổng dùng INDIRECT để tự dò vùng dữ
 * liệu. Sinh bằng code thì ta biết chính xác vùng nào là dữ liệu nên viết thẳng
 * `=SUM(G10:G13)`.
 */
import ExcelJS from 'exceljs'
import type { Quotation } from './QuotationModel'
import { suggestedFileName } from './QuotationModel'
import { brandingFor, splitDataUrl } from './branding'
import { canShareType, shareOrDownload } from './exportImage'
import { COL_PX, FONT_PX, IMG_PX, ROW_PX, colChars, pt } from './sheetLayout'

const FONT = 'Times New Roman'

// Màu lấy từ file mẫu: accent1 của theme, đậm 25% cho dải tiêu đề bảng và
// nhạt 40% cho dòng tên báo giá.
const HEADER_BG = 'FF3B618E'
const TITLE_BG = 'FF95B3D7'
const NOTE_BG = 'FFFFFF00'
const SPEC_BG = 'FF92D050'
const RED = 'FFFF0000'
const COMPANY_RED = 'FFC00000'
const WHITE = 'FFFFFFFF'

/** Số dòng trống có sẵn viền dưới bảng — phải khớp SPARE_ROWS của QuotationPreview.tsx. */
const SPARE_ROWS = 1

const thin = { style: 'thin' as const, color: { argb: 'FF000000' } }
const boxed = { top: thin, left: thin, bottom: thin, right: thin }

interface StyleOpts {
  text?: ExcelJS.CellValue
  /** Cỡ chữ tính bằng PX như bản xem trước (xem sheetLayout) — đổi sang point ở đây. */
  size?: number
  italic?: boolean
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
    size: pt(opts.size ?? FONT_PX.cell),
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
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

/**
 * Neo ảnh đúng vị trí px: ExcelJS cho truyền `col` dạng số lẻ, nhưng nó quy phần lẻ
 * ra EMU bằng "bề rộng cột tính theo KÝ TỰ × 10000" — nhỏ hơn bề rộng thật gần 7 lần
 * (1 ký tự ≈ 7 px ≈ 66675 EMU), nên đặt hai mã QR cạnh nhau thì mã sau đè lên mã
 * trước. Truyền thẳng EMU (1 px = 9525 EMU) thì đúng chỗ.
 */
const anchor = (col: number, row: number, xPx: number, yPx = 0) =>
  ({
    nativeCol: col,
    nativeColOff: Math.round(xPx * 9525),
    nativeRow: row,
    nativeRowOff: Math.round(yPx * 9525),
  }) as unknown as { col: number; row: number }

/** Thêm một cạnh viền, giữ nguyên các cạnh đã có. */
const edge = (cell: ExcelJS.Cell, side: 'top' | 'left' | 'bottom' | 'right') => {
  cell.border = { ...(cell.border ?? {}), [side]: thin }
}

export const buildQuotationWorkbook = (q: Quotation): ExcelJS.Workbook => {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'DQPCB'
  wb.created = new Date()

  const ws = wb.addWorksheet(q.hasVat ? 'BAO GIA' : 'Bao Gia', {
    views: [{ showGridLines: false }],
  })

  // Bề rộng cột = đúng bản xem trước, chỉ đổi px sang "ký tự" của Excel.
  COL_PX.forEach((px, i) => (ws.getColumn(i + 1).width = colChars(px)))

  const branding = brandingFor(q.hasVat)

  // ---- 1. Đầu trang: logo + tên & liên hệ công ty ----
  // Đầu trang cao đúng bản xem trước; vẫn chia hai hàng để ô logo và ô tên công ty
  // gộp qua cả hai như form mẫu.
  ws.getRow(1).height = pt(ROW_PX.head) - 12
  ws.getRow(2).height = 12
  ws.mergeCells('A1:C2')
  ws.mergeCells('D1:I2')

  // Co logo theo chiều cao như bản xem trước, bề ngang tính lại theo tỉ lệ gốc để
  // không bị méo.
  const logoH = IMG_PX.logo
  const logoW = Math.round(logoH * (branding.logo.width / branding.logo.height))
  const logo = splitDataUrl(branding.logo.dataUrl)
  // Căn giữa trong ô gộp A1:C2 như bản xem trước.
  const logoBox = COL_PX[0] + COL_PX[1] + COL_PX[2]
  ws.addImage(wb.addImage({ base64: logo.base64, extension: logo.extension }), {
    tl: anchor(0, 0, Math.max(0, (logoBox - logoW) / 2), (ROW_PX.head - logoH) / 2),
    ext: { width: logoW, height: logoH },
  })
  // Tên công ty đỏ, to hơn địa chỉ/hotline — đúng bản mẫu thật (khớp QuotationPreview).
  ws.getCell('D1').value = {
    richText: [
      { font: { name: FONT, size: pt(FONT_PX.company), bold: true, color: { argb: COMPANY_RED } }, text: `${q.company.name}\r\n` },
      { font: { name: FONT, size: pt(FONT_PX.contact), bold: true, color: { argb: 'FF000000' } }, text: `${q.company.address}\r\n` },
      { font: { name: FONT, size: pt(FONT_PX.contact), bold: true, color: { argb: 'FF000000' } }, text: q.company.contact },
    ],
  }
  ws.getCell('D1').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  borderRange(ws, 1, 1, 9)
  borderRange(ws, 2, 1, 9)

  // ---- 2. Tiêu đề ----
  ws.getRow(3).height = pt(ROW_PX.title) - 12
  ws.getRow(4).height = 12
  ws.mergeCells('A3:I4')
  style(ws.getCell('A3'), { text: q.title, size: FONT_PX.title, bold: true, fill: TITLE_BG, wrap: true })
  borderRange(ws, 3, 1, 9)
  borderRange(ws, 4, 1, 9)

  // ---- 3. Thông tin khách (không kẻ ô con, chỉ khung ngoài — đúng bản mẫu thật) ----
  ws.getRow(5).height = pt(ROW_PX.date)
  ws.mergeCells('A5:I5')
  style(ws.getCell('A5'), {
    text: `   Ngày báo giá: ${q.date}`,
    size: FONT_PX.info,
    bold: true,
    align: 'left',
  })
  borderRange(ws, 5, 1, 9)

  ws.getRow(6).height = pt(ROW_PX.customer)
  ws.mergeCells('A6:F6')
  ws.mergeCells('G6:I6')
  style(ws.getCell('A6'), {
    text: `   Kính gửi: ${q.customer.name}`,
    size: FONT_PX.info,
    bold: true,
    align: 'left',
  })
  style(ws.getCell('G6'), {
    text: q.hasVat ? `MST: ${q.customer.taxCode}` : null,
    size: FONT_PX.info,
    bold: true,
    align: 'left',
  })
  borderRange(ws, 6, 1, 9)

  // Form không VAT hỏi SĐT, form VAT hỏi email — địa chỉ thì cả hai đều có.
  ws.getRow(7).height = pt(ROW_PX.contact)
  if (q.hasVat) {
    ws.mergeCells('A7:B7')
    ws.mergeCells('G7:I7')
    style(ws.getCell('A7'), {
      text: `   Email: ${q.customer.email}`,
      size: FONT_PX.info,
      bold: true,
      align: 'left',
    })
    style(ws.getCell('G7'), {
      text: `Địa chỉ: ${q.customer.address}`,
      size: FONT_PX.info,
      bold: true,
      align: 'left',
      wrap: true,
    })
  } else {
    ws.mergeCells('A7:C7')
    ws.mergeCells('D7:I7')
    style(ws.getCell('A7'), {
      text: `   SĐT: ${q.customer.phone}`,
      size: FONT_PX.info,
      bold: true,
      align: 'left',
    })
    style(ws.getCell('D7'), {
      text: `          Địa chỉ: ${q.customer.address}`,
      size: FONT_PX.info,
      bold: true,
      align: 'left',
      wrap: true,
    })
  }
  borderRange(ws, 7, 1, 9)

  // ---- 4. Lời mở đầu ----
  ws.getRow(8).height = pt(ROW_PX.intro)
  ws.mergeCells('A8:I8')
  style(ws.getCell('A8'), { text: q.intro, size: FONT_PX.intro, italic: true, align: 'left', wrap: true })
  borderRange(ws, 8, 1, 9)

  // ---- 5. Tiêu đề bảng ----
  const HEAD_ROW = 9
  ws.getRow(HEAD_ROW).height = pt(ROW_PX.tableHead)
  const headers = [
    'STT',
    q.hasVat ? 'TÊN HÀNG HOÁ' : 'TÊN FILE',
    'SỐ LỚP',
    'KÍCH THƯỚC',
    'MÀU PHỦ',
    'SL',
    'THÀNH TIỀN',
    'ĐƠN GIÁ',
    'GHI CHÚ',
  ]
  headers.forEach((h, i) =>
    style(ws.getCell(HEAD_ROW, i + 1), {
      text: h,
      size: FONT_PX.tableHead,
      bold: true,
      color: WHITE,
      fill: HEADER_BG,
      wrap: true,
      border: true,
    })
  )

  // ---- 6. Dòng hàng ----
  // Có dòng giảm giá thì nó đã là dòng "thừa" cuối bảng, không chừa thêm dòng
  // trống nữa — khớp `spare` của QuotationSheet.
  const hasDiscount = q.items.some((it) => it.discount)
  const spareRows = hasDiscount ? 0 : SPARE_ROWS
  const FIRST_ITEM = HEAD_ROW + 1
  const rowCount = q.items.length + spareRows
  const LAST_ITEM = FIRST_ITEM + rowCount - 1

  for (let i = 0; i < rowCount; i++) {
    const r = FIRST_ITEM + i
    const item: Quotation['items'][number] | undefined = q.items[i]
    // KHÔNG đặt chiều cao: tên file dài xuống hai dòng thì để Excel tự nới, như bản
    // xem trước. Đặt cứng là chữ bị cắt mất nửa dưới.

    if (item?.discount) {
      // Dòng giảm giá: gộp STT → SL (A:F) thành một ô, cùng bề rộng với dòng tổng.
      ws.mergeCells(r, 1, r, 6)
      style(ws.getCell(r, 1), { text: item.name, size: FONT_PX.cell, bold: true, wrap: true })
      borderRange(ws, r, 1, 6)
      style(ws.getCell(r, 7), {
        text: item.amount ?? null,
        size: FONT_PX.cell,
        color: RED,
        wrap: true,
        border: true,
        numFmt: '#,##0',
      })
      style(ws.getCell(r, 8), { border: true })
      style(ws.getCell(r, 9), { text: item.note || null, size: FONT_PX.cell, wrap: true, border: true })
      continue
    }

    style(ws.getCell(r, 1), { text: item ? i + 1 : null, size: FONT_PX.cell, wrap: true, border: true })
    // wrap: true trên TÊN FILE và KÍCH THƯỚC — thiếu ở bản gốc, khiến tên file thật
    // (không khoảng trắng, vd "ESP32_Multi_Purpose_IoT_Kit") tràn sang cột bên cạnh
    // thay vì xuống dòng trong ô.
    style(ws.getCell(r, 2), { text: item?.name || null, size: FONT_PX.cellWide, wrap: true, border: true })
    style(ws.getCell(r, 3), { text: item?.layers || null, size: FONT_PX.cell, wrap: true, border: true })
    style(ws.getCell(r, 4), { text: item?.size || null, size: FONT_PX.cellWide, wrap: true, border: true })
    style(ws.getCell(r, 5), { text: item?.maskColor || null, size: FONT_PX.cell, wrap: true, border: true })
    style(ws.getCell(r, 6), {
      text: item?.quantity ?? null,
      size: FONT_PX.cell,
      wrap: true,
      border: true,
      numFmt: '0',
    })
    style(ws.getCell(r, 7), {
      text: item?.amount ?? null,
      size: FONT_PX.cell,
      wrap: true,
      border: true,
      numFmt: '#,##0',
    })
    // ĐƠN GIÁ tính ngược từ THÀNH TIỀN — đúng chiều của form mẫu. IFERROR để dòng
    // trống không hiện #DIV/0!, và người lập gõ thêm dòng là có ngay đơn giá.
    style(ws.getCell(r, 8), {
      text: { formula: `IFERROR(G${r}/F${r},"")` },
      size: FONT_PX.cell,
      wrap: true,
      border: true,
      numFmt: '#,##0',
    })
    style(ws.getCell(r, 9), { text: item?.note || null, size: FONT_PX.cell, wrap: true, border: true })
  }

  // ---- 7. Tổng cộng ----
  // Vùng SUM phủ luôn mấy dòng trống/dòng giảm giá dưới bảng: chèn thêm dòng vào
  // giữa thì Excel tự nới công thức, tổng vẫn đúng — kể cả dòng giảm giá có số âm.
  const sumRange = `G${FIRST_ITEM}:G${LAST_ITEM}`
  let row = LAST_ITEM + 1

  const totalRow = (label: string, formula: string, red: boolean, note?: string) => {
    const at = row
    ws.getRow(at).height = pt(ROW_PX.total)
    ws.mergeCells(at, 1, at, 6)
    style(ws.getCell(at, 1), { text: label, size: FONT_PX.cell, bold: true, wrap: true })
    borderRange(ws, at, 1, 6)
    style(ws.getCell(at, 7), {
      text: { formula },
      size: FONT_PX.cell,
      bold: true,
      color: red ? RED : undefined,
      wrap: true,
      border: true,
      numFmt: '#,##0',
    })
    style(ws.getCell(at, 8), { border: true })
    style(ws.getCell(at, 9), { text: note ?? null, size: FONT_PX.cell, bold: true, wrap: true, border: true })
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
  // Hàng trắng ngăn bảng với khối ghi chú.
  ws.getRow(row).height = pt(ROW_PX.gap)
  row += 1
  const noteHead = row
  ws.getRow(noteHead).height = pt(ROW_PX.noteHead)
  style(ws.getCell(noteHead, 2), {
    text: 'Ghi chú:',
    size: FONT_PX.noteHead,
    bold: true,
    fill: NOTE_BG,
    align: 'left',
  })
  ws.mergeCells(noteHead, 7, noteHead, 9)
  style(ws.getCell(noteHead, 7), {
    text: 'THÔNG SỐ MẶC ĐỊNH: (nếu không ghi chú)',
    size: FONT_PX.specHead,
    fill: SPEC_BG,
    align: 'left',
  })
  row++

  const blockLen = Math.max(q.notes.length, q.defaultSpecs.length)
  for (let i = 0; i < blockLen; i++) {
    ws.getRow(row).height = pt(ROW_PX.noteLine)
    if (q.notes[i]) style(ws.getCell(row, 2), { text: q.notes[i], size: FONT_PX.note, align: 'left' })
    if (q.defaultSpecs[i]) {
      ws.mergeCells(row, 7, row, 9)
      style(ws.getCell(row, 7), { text: q.defaultSpecs[i], size: FONT_PX.note, align: 'left' })
    }
    row++
  }

  // ---- 9. Tài khoản (cột B) + chữ ký (cột G, I) ----
  // Hàng trắng ngăn khối ghi chú với khối tài khoản, kẻ một gạch ngang dưới cùng —
  // đúng bản xem trước.
  ws.getRow(row).height = pt(ROW_PX.bankGap)
  for (let c = 1; c <= 9; c++) edge(ws.getCell(row, c), 'bottom')
  row += 1

  const bankTitle = row
  ws.getRow(bankTitle).height = pt(ROW_PX.bankTitle)
  style(ws.getCell(bankTitle, 2), {
    text: 'Thông tin tài khoản ',
    size: FONT_PX.bankTitle,
    bold: true,
    underline: true,
    align: 'left',
  })

  const sigHead = bankTitle + 1
  ws.getRow(sigHead).height = pt(ROW_PX.sigHead)
  style(ws.getCell(sigHead, 2), { text: q.bank.holder, size: FONT_PX.bank, align: 'left' })
  style(ws.getCell(sigHead, 7), { text: 'Khách hàng', size: FONT_PX.bank, bold: true })
  style(ws.getCell(sigHead, 9), { text: 'Người lập ', size: FONT_PX.bank, bold: true })

  // Bản xem trước xếp hai số tài khoản cạnh nhau (mỗi số một mã QR bên dưới); trong
  // Excel chữ chỉ đặt được ở đầu ô nên mỗi số một dòng, hai mã QR vẫn cạnh nhau.
  q.bank.lines.forEach((line, i) => {
    const r = sigHead + 1 + i
    ws.getRow(r).height = pt(ROW_PX.sigHead)
    // Không xuống dòng (như bản xem trước): số tài khoản dài thì tràn sang ô trống
    // bên cạnh, còn gói trong ô thì bị cắt mất nửa dưới.
    style(ws.getCell(r, 2), { text: line, size: FONT_PX.bank, align: 'left' })
  })

  // Một hàng cao đúng bằng mã QR, xếp hai mã cạnh nhau trong cột B (form VAT không
  // có mã: vẫn chừa chừng ấy chỗ để ký, như bản xem trước).
  const qrRow = sigHead + q.bank.lines.length + 1
  ws.getRow(qrRow).height = pt(branding.qr.length > 0 ? ROW_PX.qr : ROW_PX.qrNone)
  let qrLeft = 6
  branding.qr.forEach((img) => {
    const h = IMG_PX.qr
    const w = Math.round(h * (img.width / img.height))
    const { base64, extension } = splitDataUrl(img.dataUrl)
    ws.addImage(wb.addImage({ base64, extension }), {
      tl: anchor(1, qrRow - 1, qrLeft),
      ext: { width: w, height: h },
    })
    qrLeft += w + 26
  })

  // Dòng ký tên nằm ngay dưới mã QR, như bản xem trước (chữ ký căn đáy hàng mã QR).
  const sigFoot = qrRow + 1
  ws.getRow(sigFoot).height = pt(ROW_PX.sigFoot)
  style(ws.getCell(sigFoot, 7), { text: '(Kí và ghi rõ họ tên)', size: FONT_PX.sig, align: 'center' })
  style(ws.getCell(sigFoot, 9), {
    text: q.preparedBy,
    size: FONT_PX.sig,
    bold: true,
    color: RED,
    align: 'center',
  })

  // Khung ngoài bao cả tờ — bản xem trước là một cái bảng có viền ngoài, khối ghi chú
  // và tài khoản nằm trong khung đó.
  for (let r = 1; r <= sigFoot; r++) {
    edge(ws.getCell(r, 1), 'left')
    edge(ws.getCell(r, 9), 'right')
  }
  for (let c = 1; c <= 9; c++) edge(ws.getCell(sigFoot, c), 'bottom')

  // ---- 10. In: A4 ngang, lề 8mm, ép vừa bề ngang ----
  // Cùng khổ và cùng lề với bản xuất PDF (exportImage.ts) nên in từ Excel ra được
  // đúng trang PDF: tờ rộng 1062px vừa khít bề ngang in được.
  // Tờ dài hơn một trang chút ít (tới 1.4 trang) thì ép vừa một trang — cũng đúng
  // luật của bản PDF; dài hơn nữa mới cho sang trang thứ hai.
  const MARGIN_IN = 8 / 25.4
  const pageInnerPt = (210 / 25.4 - 2 * MARGIN_IN) * 72
  let sheetPt = 0
  for (let r = 1; r <= sigFoot; r++) sheetPt += ws.getRow(r).height ?? 15
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: sheetPt <= pageInnerPt * 1.4 ? 1 : 0,
    horizontalCentered: true,
    margins: {
      left: MARGIN_IN,
      right: MARGIN_IN,
      top: MARGIN_IN,
      bottom: MARGIN_IN,
      header: 0,
      footer: 0,
    },
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

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Máy này có bảng chia sẻ nhận file Excel không — kiểm tra riêng, có thể khác PDF. */
export const canShareXlsxFiles = (): boolean => canShareType(XLSX_MIME, 'xlsx')

/**
 * Trên trình duyệt: mở bảng chia sẻ của hệ điều hành với file Excel — cùng cách
 * với PDF (xem shareQuotationPdf) — không có thì tải về thẳng.
 */
export const shareQuotationXlsx = async (
  q: Quotation,
  /** 'download' = tải thẳng về máy, kể cả khi máy có bảng chia sẻ. */
  mode: 'share' | 'download' = 'share'
): Promise<'shared' | 'downloaded' | 'canceled'> => {
  const bytes = await exportQuotationToXlsx(q)
  // ArrayBuffer riêng cho Blob: bytes có thể là view vào buffer lớn hơn.
  const blob = new Blob([bytes.slice().buffer], { type: XLSX_MIME })
  return shareOrDownload(blob, suggestedFileName(q), mode === 'share' && canShareXlsxFiles())
}
