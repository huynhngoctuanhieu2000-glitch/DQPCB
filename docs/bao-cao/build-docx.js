// Tạo "Báo cáo DQPCB" dạng Word. Chạy: node build.js <đường-dẫn-output.docx>
const fs = require('fs')
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  HeadingLevel, AlignmentType, BorderStyle, LevelFormat, PageBreak, Footer, PageNumber,
} = require('docx')

const OUT = process.argv[2] || 'Bao-cao-DQPCB.docx'
const FONT = 'Arial'
const CONTENT_W = 9638 // A4 (11906) – lề 2 cm hai bên

// ── helpers ──────────────────────────────────────────────────────────────
const run = (text, o = {}) => new TextRun({ text, font: FONT, size: o.size ?? 21, bold: o.bold, italics: o.italic, color: o.color })
/** Đoạn văn; `**đậm**` trong chuỗi thành chữ đậm. */
const rich = (s, o = {}) =>
  s.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((part) =>
    part.startsWith('**') ? run(part.slice(2, -2), { ...o, bold: true }) : run(part, o),
  )
const P = (s, o = {}) => new Paragraph({ children: rich(s, o), spacing: { before: 100, after: 100, line: 276 }, alignment: o.align })
const H1 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [run(s, { size: 30, bold: true, color: '1F3864' })], spacing: { before: 240, after: 160 } })
const H2 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(s, { size: 25, bold: true, color: '2E5597' })], spacing: { before: 220, after: 100 } })
const H3 = (s) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [run(s, { size: 22, bold: true, color: '404040' })], spacing: { before: 160, after: 80 } })
const B = (s, level = 0) => new Paragraph({ numbering: { reference: 'bullets', level }, children: rich(s), spacing: { after: 60, line: 264 } })
const breakPage = () => new Paragraph({ children: [new PageBreak()] })

const border = { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF' }
const borders = { top: border, bottom: border, left: border, right: border }
/** Bảng: rows[0] là tiêu đề. widths là tỉ lệ, quy về DXA cho đủ bề ngang. */
const T = (rows, ratios) => {
  const sum = ratios.reduce((a, b) => a + b, 0)
  const widths = ratios.map((r) => Math.floor((r / sum) * CONTENT_W))
  widths[widths.length - 1] += CONTENT_W - widths.reduce((a, b) => a + b, 0)
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((cells, ri) =>
      new TableRow({
        tableHeader: ri === 0,
        children: cells.map((c, ci) =>
          new TableCell({
            borders,
            width: { size: widths[ci], type: WidthType.DXA },
            shading: ri === 0 ? { fill: 'DCE6F2', type: ShadingType.CLEAR, color: 'auto' } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: String(c).split('\n').map((line) =>
              new Paragraph({ children: rich(line, { size: 19, bold: ri === 0 }), spacing: { after: 20 } }),
            ),
          }),
        ),
      }),
    ),
  })
}
/** Bảng hai cột "Mục | Nội dung" cho một lỗi. */
const bugTable = (rows) => T([['Mục', 'Nội dung'], ...rows], [22, 78])
const gap = () => new Paragraph({ children: [], spacing: { after: 80 } })

// ── nội dung ──────────────────────────────────────────────────────────────
const children = []

// Trang bìa
children.push(
  new Paragraph({ children: [], spacing: { before: 2400 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [run('BÁO CÁO DQPCB', { size: 48, bold: true, color: '1F3864' })], spacing: { after: 200 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [run('Phần mềm xem Gerber & báo giá PCB — Thiên Lâm PCB', { size: 26, color: '404040' })], spacing: { after: 600 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [run('Đợt làm việc 21–22/09/2026', { size: 24 })], spacing: { after: 120 } }),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [run('Lỗi · Cách giải quyết · Vấn đề · Tính năng · Định dạng file · Outline / Drill / Slot', { size: 21, color: '595959' })], spacing: { after: 1200 } }),
  T(
    [
      ['Phần', 'Nội dung'],
      ['1. Báo cáo lỗi', '11 mục: hiện tượng, nguyên nhân, cách giải quyết, cách kiểm, bộ file thật'],
      ['2. Tính năng hiện có', 'Toàn bộ chức năng của app tính tới 22/09/2026'],
      ['3. Định dạng file', 'App đọc được gì, nhận diện lớp theo thứ tự nào, đọc số Excellon ra sao'],
      ['4. Outline · Drill · Slot', 'Luật quan trọng quyết định kích thước bo (→ giá) và hình bo'],
      ['5. Vấn đề còn tồn & checklist', 'Việc chưa làm, cách kiểm khi sửa luật đọc file'],
    ],
    [30, 70],
  ),
  breakPage(),
)

// ═══ 1. BÁO CÁO LỖI ═══
children.push(H1('1. Báo cáo lỗi — 21–22/09/2026'))
children.push(P('Phạm vi: phần **đọc file** (viền, khoan, slot), **báo giá ghép panel** và **mở file**. Mọi lỗi đều gặp trên bộ file thật của khách trong D:\\JobDatMach, có đường dẫn để mở lại.'))
children.push(
  T(
    [
      ['#', 'Lỗi', 'Bộ file', 'Trạng thái'],
      ['1', 'Lỗ slot / lỗ chữ nhật Altium không hiện', 'Vu Bao — AGVH7', 'Đã sửa · 8e2ada0'],
      ['2', 'Hai bo chung cạnh nối thành vòng "số 8", mất nửa thân bo', 'Le Quoc Huy — Dynamic Master, Slaver (panel)', 'Đã sửa · 8e2ada0'],
      ['3', 'Rail bị khoét thủng', 'Le Quoc Huy — Dynamic Master', 'Đã sửa · 8e2ada0, f9121a0'],
      ['4', 'Đường phay hở bị tô thành mảng bo', 'Le Quoc Huy — Slaver (panel)', 'Đã sửa · 8e2ada0, f9121a0'],
      ['5', 'Rãnh / lỗ khoét trong bo không hiện ở 2D, 3D', 'Le Quoc Huy — Ceiling Master', 'Đã sửa · 8e2ada0'],
      ['6', 'Hồi quy do lỗi 3–4: khấc mép, lỗ mouse-bite, bo con hở viền', 'AC_Board, Dual USB, SAL-66', 'Đã sửa · f9121a0'],
      ['7', 'Bảng tra giá vẫn áp cho bo ghép panel', '(luật giá)', 'Đã sửa · 9884463'],
      ['8', 'File khoan Altium FILE_FORMAT=4:3 co 100 lần, lỗ dồn ngoài góc', 'Nguyen Van Quang — ESP32_DR', 'Đã sửa · chưa commit'],
      ['9', 'Nhiều lớp viền: GM1 (khung linh kiện) thành thân bo', 'Le Quoc Huy — Slaver_Ceiling bản lẻ', 'Đã sửa · chưa commit'],
      ['10', 'J11: đồng/lỗ sát mép, vạch trắng có khấc', 'Nguyen Van Quang — ESP32_DR', 'Không phải lỗi — file vẽ vậy'],
      ['11', 'Hộp chọn file bản web không mở đúng thư mục vừa dùng', '(mở file)', 'Đã sửa · chưa commit'],
    ],
    [5, 42, 30, 23],
  ),
)

const bugs = [
  {
    t: 'Lỗi 1 — Lỗ slot / lỗ chữ nhật Altium không hiện',
    rows: [
      ['Bộ file', 'D:\\JobDatMach\\Vu Bao\\2026\\21-09\\Vu Bao 5pcs Green AGVH7.zip'],
      ['Hiện tượng', '6 lỗ slot trong AGVH7-SlotHoles.TXT không vẽ; badge chỉ ghi file lỗ tròn.'],
      ['Nguyên nhân', 'Altium vẽ slot và lỗ chữ nhật bằng lệnh **phay**: G00 tới điểm đầu → M15 hạ dao → G01 chạy → M16 nhấc dao. Bộ đếm cũ chỉ đếm dòng bắt đầu bằng X, nên file slot ra **0 lỗ** và bị viewer bỏ qua.\nRoundHoles.TXT chứa cả lỗ mạ lẫn lỗ Ø3.2 không mạ; chỉ đọc dòng ;TYPE= đầu tiên nên gán PTH. Sửa riêng cho "mixed" thì viewer lại coi nó là file GỘP và chỉ vẽ nó → slot vẫn mất.'],
      ['Cách giải quyết', 'countExcellonHoles: mỗi lần hạ dao M15 là một lỗ; dòng chỉ có Y… (giữ X cũ) cũng là một lỗ.\ndrillPlatingOf: đọc từng mục ;TYPE=, có cả hai loại mũi → mixed.\nisPartialDrillFile: file tách theo hình lỗ (RoundHoles, SlotHoles, RectHoles, SquareHoles, Slot.txt) là một phần của bộ khoan → vẽ hết.'],
      ['Kiểm', 'Hồi quy 238 bộ; số lỗ mới khớp số hình dựng (28→150 = 150; 453 = 445 tròn + 8 slot). 4 test mới.'],
    ],
  },
  {
    t: 'Lỗi 2 — Hai bo chung cạnh nối thành vòng "số 8"',
    rows: [
      ['Bộ file', 'D:\\JobDatMach\\Le Quoc Huy\\2026\\21-09\\Gerber\\ — Dynamic Master, Slaver_Ceiling'],
      ['Hiện tượng', 'Dynamic Master: vùng rơ-le bo dưới trắng giữa mạch. Slaver: 3D cắt chéo mất hai góc bo.'],
      ['Nguyên nhân', 'Panel V-cut vẽ mỗi bo một đường bao, hai bo chung một cạnh. Ở góc chung có 4 đoạn gặp nhau, bước nối viền đi thẳng sang bo bên cạnh → một vòng ôm cả hai bo, đi qua cạnh chung hai lần. Đa giác tự chạm thì tô sai.'],
      ['Cách giải quyết', 'stitchOutline → splitAtRepeats: tách chuỗi tại đỉnh bị đi qua hai lần (chỉ đỉnh trùng khít ≤ 0.001 mm, phần tách ≥ 1 mm², để không vỡ góc bo tròn KiCad 10). Xét cả chuỗi hở (cạnh chung bo–rail chỉ vẽ một lần).'],
      ['Kiểm', 'Test dựng lại đúng dáng Dynamic Master: bản cũ 1 vòng 12 đoạn, bản mới 2 vòng.'],
    ],
  },
  {
    t: 'Lỗi 3 — Rail bị khoét thủng',
    rows: [
      ['Bộ file', 'Dynamic Master (rail 5 mm trên/dưới) và nhiều bộ "Rail" trong corpus.'],
      ['Nguyên nhân', 'Luật cũ "vòng < 5% vòng lớn nhất là lỗ khoét" chạy trước khi xét vị trí; rail 144.8 × 5 mm chỉ bằng 2.4% khung.'],
      ['Cách giải quyết', 'Vòng không nằm trong vòng nào thì không phải lỗ — trừ vòng nhỏ mà không dài như rail (xem lỗi 6). "Dài như rail" = dài ≥ nửa một cạnh của cả tấm.'],
    ],
  },
  {
    t: 'Lỗi 4 — Đường phay hở bị tô thành mảng bo',
    rows: [
      ['Bộ file', 'Slaver_Ceiling (panel) — đường gấp khúc tách cụm đầu nối.'],
      ['Nguyên nhân', 'Nét hở ≥ 3 đoạn được giữ và tô như vòng kín → hai đầu hở nối thẳng thành một mảng lạ.'],
      ['Cách giải quyết', 'Loại thứ ba "nét phay": nét hở nằm trong một vòng khác và hở rõ (khoảng hở ≥ nửa chiều dài nét) → chỉ vẽ nét, không tô, không khoét.'],
    ],
  },
  {
    t: 'Lỗi 5 — Rãnh / lỗ khoét trong bo không hiện ở 2D, 3D',
    rows: [
      ['Bộ file', '…\\Gerber\\Le Quoc Huy Gerber Ceiling Master LAF 14072025.zip'],
      ['Hiện tượng', 'CAM thấy rãnh 38 × 1.24 mm và lỗ Ø3.5 mm; 2D/3D không thấy.'],
      ['Nguyên nhân', 'Viền theo **inch**. Ở 2D/3D lỗ khoét được tách sang cụm khoan (để xuyên suốt bề dày bo) nhưng không đổi inch → mm: nhỏ đi 25.4 lần, dồn về một góc. CAM không bị vì lỗ khoét ăn theo phép đổi đơn vị của lớp Outline.'],
      ['Cách giải quyết', 'Nhân 25.4 cho lỗ khoét khi tách ra (Viewer2D.WebGL.tsx). Áp cho mọi bộ có viền inch.'],
    ],
  },
  {
    t: 'Lỗi 6 — Hồi quy do lỗi 3–4',
    rows: [
      ['Phát hiện', 'Hồi quy 138 bộ sau 8e2ada0: 43 bộ đổi cách chia vòng, trong đó có 3 lỗi thật.'],
      ['AC_Board_Mon22_2', 'Khấc mép vẽ lấn ra ngoài cạnh 0.025–0.037 mm → không "nằm trong" → thành thân bo. Sửa: "nằm trong" = tâm trong vòng chứa và ≥ nửa ô bao chồng lên.'],
      ['Dual USB Switch-Panel', 'Lỗ mouse-bite giữa các bo (không nằm trong bo nào) thành thân bo. Sửa: vòng nhỏ lẻ vẫn là lỗ, trừ khi dài như rail.'],
      ['SAL-66', 'Bo con hở viền một khe nhỏ bị coi là nét phay → mất nền. Sửa: chỉ là nét khi khoảng hở ≥ nửa chiều dài.'],
      ['Kết quả', 'Còn 30 bộ khác bản cũ; xem hình cũ/mới từng bộ: không bộ nào tệ đi. Tốt hơn: rail hết bị khoét (Gerber Rail, pmtaudio, Rail mtfc, PCA 2x1, ph_analyzer), PHAONUOC hết tam giác chéo sai, Rosario rãnh móc câu nhất quán là lỗ.'],
    ],
  },
  {
    t: 'Lỗi 7 — Bảng tra giá vẫn áp cho bo ghép panel',
    rows: [
      ['Hiện tượng', 'Chế độ "file ghép sẵn" (⇅) vẫn tra bảng giá nhà máy.'],
      ['Luật đúng', 'Bảng tra chỉ cho **bo đơn lẻ**: không ghép panel, không nhiều thiết kế, không mouse bite, không V-cut.'],
      ['Cách giải quyết', 'Tích "Ghép panel" (bất kỳ kiểu nào) là buộc đi công thức; nút "Bảng tra" khoá, ghi lý do "đã ghép panel".'],
    ],
  },
  {
    t: 'Lỗi 8 — File khoan Altium FILE_FORMAT=4:3 co 100 lần',
    rows: [
      ['Bộ file', 'D:\\JobDatMach\\Nguyen Van Quang\\2026\\22-09\\Nguyen Van Quang 5pcs Green Project Outputs for ESP32_DR.zip'],
      ['Hiện tượng', 'Không lỗ khoan nào nằm trên bo; một cục trắng ngoài góc dưới trái. Pad oval hàng chân ESP32 không có lỗ.'],
      ['Nguyên nhân', 'File khai ;FILE_FORMAT=4:3 + METRIC,LZ: X0050419 = 50.419 mm. web-gerber **không đọc dòng chú thích** này, áp mặc định → 0.50419 mm. Luật cũ lại cố tình bỏ qua file có khai FILE_FORMAT. Inch 2:4 (AGVH7) vô tình trùng mặc định nên không lộ. **Có từ trước** (347bc53 cũng sai).'],
      ['Cách giải quyết', 'reader.ts: có FILE_FORMAT=a:b + kiểu số 0 (LZ/TZ) + toạ độ chưa có dấu chấm → tự chèn dấu thập phân đúng format (LZ bù đuôi, TZ bù đầu); dò mọi toạ độ X/Y kể cả sau G00/G01 (RectHoles/SlotHoles).'],
      ['Kiểm', 'Hồi quy 171 bộ có FILE_FORMAT: 5 bộ đổi, cả 5 từ 0 lỗ trong bo → đủ lỗ (RGBW_LED LINEAR 0→134/134; LOA_CADCAM 0→64/64; Bidirectional_Switch 0→203/203; Nguyen Tan Tai 0→153/153; GERBER_DRILL 0→182/182). Không bộ nào tệ đi. Test mới.'],
    ],
  },
  {
    t: 'Lỗi 9 — Nhiều lớp viền: GM1 thành thân bo',
    rows: [
      ['Bộ file', 'D:\\JobDatMach\\Le Quoc Huy\\2026\\21-09\\Slaver_Ceiling_ EC_21092026.zip (bản lẻ, Altium gốc)'],
      ['Hiện tượng', '2D chỉ có hai mảng xanh đậm; phần còn lại của bo không có nền.'],
      ['Nguyên nhân', 'Hai lớp nhận là viền: .GKO (viền thật) và .GM1 (Mechanical 1 — ở bộ này là khung hai rơ-le). Kích thước lấy đúng lớp lớn nhất, nhưng viewer lấy lớp viền dựng **sau cùng** làm thân bo → GM1. Có từ trước.'],
      ['Cách giải quyết', 'Chỉ lớp viền có ô bao lớn nhất (so bằng mm) dựng thân bo; lớp còn lại thành tài liệu "… (viền phụ)", tắt sẵn, vẫn bật xem được.'],
      ['Corpus', '34/614 bộ có nhiều lớp viền: 21 trùng khít (không đổi), 13 nằm trong (như Slaver), 1 lấn ra ngoài.'],
    ],
  },
  {
    t: 'Mục 10 — J11 của ESP32_DR (không phải lỗi)',
    rows: [
      ['Số liệu', 'Viền trên 90.80 mm · lỗ hàng trên J11 tới 90.05 (cách mép 0.75 mm) · đồng mặt trên tới 91.06 (vượt viền 0.26 mm) · mask 91.17 · in lụa 90.88.'],
      ['Giải thích', 'Vùng xám phía trên pad là ngoài bo — đúng như file. Vạch trắng có khấc nửa tròn là **in lụa** khung linh kiện (khấc = dấu chân số 1), không phải đường cắt.'],
      ['Đề xuất', 'Báo khách: đồng lấn ra ngoài viền, lỗ sát mép. Có thể thêm kiểm DFM tự động (xem Vấn đề còn tồn).'],
    ],
  },
  {
    t: 'Lỗi 11 — Hộp chọn file bản web không mở đúng thư mục vừa dùng',
    rows: [
      ['Hiện tượng', 'Bấm mở file, hộp thoại không vào thư mục vừa mở mà vào một thư mục cũ trong lịch sử.'],
      ['Nguyên nhân', 'Ảnh chụp là hộp chọn của **trình duyệt** (bộ lọc "Custom Files…", logo ứng dụng Claude ở góc) — tức đang dùng **bản web**, không phải app Electron. Tính năng nhớ thư mục (hộp chọn gốc Windows, lưu trong cấu hình app) chỉ có ở Electron; trên web trình duyệt tự quyết thư mục mở.\nKèm một lỗi nhỏ ở Electron: đường dẫn thư mục bo chỉ tách theo "/", đường dẫn Windows dùng "\\" nên dòng "Thư mục" có thể hiện cả đường dẫn file.'],
      ['Cách giải quyết', 'Bản web trên Chrome/Edge (kể cả khung trình duyệt của Claude, bản Vercel https) dùng File System Access API — showOpenFilePicker / showDirectoryPicker với id cố định "dqpcb-gerber": trình duyệt tự mở lại thư mục lần trước. Bấm Huỷ không báo lỗi. Trình duyệt chưa hỗ trợ (Firefox, Safari, điện thoại) dùng hộp chọn cũ. Sửa tách đường dẫn theo cả "/" và "\\".'],
      ['Kiểm', 'Trình duyệt preview có đủ hai API, trang là secure context. Việc trình duyệt mở lại đúng thư mục cần anh thử trực tiếp (hộp chọn là cửa sổ hệ điều hành).'],
    ],
  },
]
for (const b of bugs) children.push(H2(b.t), bugTable(b.rows), gap())
children.push(breakPage())

// ═══ 2. TÍNH NĂNG ═══
children.push(H1('2. Tính năng hiện có (22/09/2026)'))
const featureGroups = [
  ['2.1 Mở file', [
    'Mở **ZIP, RAR, file lẻ, cả thư mục**; kéo thả vào cửa sổ. Mỗi ZIP/RAR là một bo.',
    'Menu **File**: Mở file Gerber… · Mở thư mục… · Đóng bo đang xem · Đóng tất cả bo.',
    'Hộp chọn **nhớ thư mục vừa mở**: app Electron dùng hộp gốc Windows (nhớ cả sau khi tắt app, kéo thả cũng cập nhật); bản web Chrome/Edge dùng API của trình duyệt.',
    '**Màn chờ** phủ cả ba cột khi đang mở, chỉ tắt khi bo mới dựng xong — không lẫn bo cũ. Mở file mới luôn về chế độ **CAM**.',
    'Mở **nhiều bo** cùng lúc: tab trên máy tính, dropdown trên điện thoại; phần nhập giá nhớ riêng từng bo.',
    'Tự bỏ file phụ trợ (report, BOM, ảnh, PDF, file dự án KiCad…); danh sách file bỏ qua hiện ở đáy cột Lớp.',
  ]],
  ['2.2 Xem bo', [
    'Bốn chế độ: **CAM** (từng lớp màu CAM), **2 Mặt** (Top + Bot lật gương cạnh nhau), **2D** (ảnh thật), **3D** (xoay, lật xem mặt Bot).',
    'Danh sách lớp: bật/tắt từng lớp, All On / All Off, lọc Top Side / Bot Side, **solo** 🎯 một lớp, đổi màu lớp ở CAM. Lớp đồng giữa bo 4/6 lớp hiện ở CAM/3D.',
    '**7 màu bo kiểu JLC** (Xanh lá, Xanh dương, Đỏ, Đen, Tím, Vàng, Trắng); pad màu đồng trong lỗ mở mask; lỗ khoan trắng.',
    'Zoom / kéo, nút **Fit**. Badge góc khung: **Viền** lấy từ file nào · **Khoan** file nào, bao nhiêu lỗ · **Load** thời gian mở thật (đọc + dựng lần đầu).',
    'Hiển thị đúng: slot/lỗ chữ nhật, lỗ khoét trong viền, panel nhiều bo chung cạnh, rail, đường phay; lấp khe dải phủ đồng CAM350.',
  ]],
  ['2.3 Chụp ảnh 2 mặt', [
    'Nút **Copy ảnh 2 mặt** (chế độ 2 Mặt): ảnh vào clipboard để dán Zalo / mail; tự cắt sát bo, mỗi mặt ~2000 px.',
    'Nhãn dưới ảnh: **tên file | N lớp | rộng x cao mm** (tên dài cắt "…"; số lớp ưu tiên số chọn tay). Màn xem 2 Mặt hiện nhãn giống hệt.',
    '**Logo Thiên Lâm** mờ ở giữa, đè nhẹ mép trong hai bo; độ đậm chỉnh ở Cài đặt → Ảnh chụp (mặc định 8%).',
  ]],
  ['2.4 Thông tin bo & thông số đặt hàng', [
    'Tên bo, **kích thước** (sửa tay được, ↺ về Gerber), file khoan, tổng lớp đọc được, thư mục (Electron).',
    '**Thông số bo** kiểu JLC (thu gọn một dòng / mở ra): vật liệu FR4 · Nhôm · Mạch dẻo; số lớp 1–16 (tự theo Gerber); bề mặt HASL chì · HASL không chì · Mạ vàng ENIG; độ dày 0.6–2.0 mm; đồng 1–4.5 oz.',
    'Thông số → phương án giá; tổ hợp chưa có đơn giá báo **"chưa có công thức"**, không lấy giá loại khác thay vào.',
    'Hàng **Màu bo** ngay trong thẻ.',
  ]],
  ['2.5 Ghép panel', [
    'Ô tích **Ghép panel** ngay dưới kích thước: kiểu **V-cut / Mouse bite**, số bo mỗi cạnh X × Y, rail (mm).',
    '**Sơ đồ tấm** vẽ đúng hình viền thật của bo lặp X × Y, rail xám, vạch V-cut / chấm mouse bite, ghi kích thước tấm.',
    'Số lượng: nhập **số PCB → ra số set**; nút **⇅** cho file khách đã ghép sẵn: nhập **số set → ra số PCB** (Gerber chính là tấm panel). Tiền luôn = số set × diện tích tấm.',
    'Nhắc nhở: cạnh bo **< 15 mm** phải ghép V-cut; ghép V-cut mà tấm có cạnh **< 70 mm** (không nhắc với mouse bite).',
  ]],
  ['2.6 Tính giá', [
    '**Bảng tra** nhà máy cho bo đơn lẻ ≤ 10 × 10 cm (bấm mốc số lượng); ngoài mốc → gợi ý mốc gần nhất và ô nhập tay thành tiền.',
    '**Công thức** theo kích thước: hiện cả **Hệ số phẳng** và **Bậc thang**, tích chọn cái đưa vào báo giá; đơn giá / pcs (ghép panel: / set và / pcs); dòng Panel, Diện tích cả đơn, Phí bo lớn.',
    'Có ghép panel là bắt buộc công thức (nút Bảng tra khoá, ghi lý do).',
    '**Gợi ý stencil**: khung rẻ nhất vừa tấm panel (hoặc bo), số tấm theo lớp paste (Top/Bot).',
    'Nút **Đưa vào báo giá**; mục Tuỳ chọn: phí thêm (¥).',
  ]],
  ['2.7 Báo giá', [
    'Thông tin khách: Kính gửi (đoán từ tên thư mục), MST, Email, SĐT, Địa chỉ, **ngày báo giá** (chọn lịch); có / không VAT.',
    'Dòng hàng lấy từ bo đang mở (tên, số lớp, kích thước, màu phủ) kèm giá đã tính; thêm **stencil** (gợi ý cỡ vừa bo), dòng chiết khấu, **ghi chú hay dùng**.',
    'Tổng cộng, người lập, tài khoản nhận tiền.',
    'Xuất **Excel** (.xlsx) và **PDF**; mở thư mục chứa file vừa lưu (Electron). Trên web/điện thoại: tạo PDF trong trình duyệt, **chia sẻ** (Zalo, Messenger) hoặc lưu ảnh PNG.',
  ]],
  ['2.8 Cài đặt', [
    '**PCB**: bảng giá dưới 10 × 10 cm, phương án giá, hằng số công thức (tỉ giá, hệ số, thuế, làm tròn), khối lượng & phí bo lớn, đường giá bậc thang, **đối chiếu sheet** (chạy lại các ca mẫu, lệch là đỏ).',
    '**Stencil**: bảng giá khung nhôm. **Ảnh chụp**: độ đậm logo.',
    'Hiện phiên bản, commit, ngày build. Lưu trong máy (localStorage), "Về mặc định" từng mục.',
  ]],
  ['2.9 Điện thoại & web', [
    'Bản web trên Vercel (tự dựng lại mỗi lần push main); bố cục riêng cho điện thoại: chọn chế độ xem bằng dropdown, bảng trượt Lớp / Thông tin bo có nút ✕, dropdown chọn bo.',
    'Icon app, thêm vào màn hình chính điện thoại.',
  ]],
]
for (const [title, items] of featureGroups) {
  children.push(H2(title))
  for (const it of items) children.push(B(it))
}
children.push(breakPage())

// ═══ 3. ĐỊNH DẠNG FILE ═══
children.push(H1('3. App đang đọc file theo định dạng nào'))
children.push(P('Mã nguồn: src/lib/gerber-reader/ — README trong đó liệt kê từng hàm và ghi rõ luật nào của DQPCB, luật nào của thư viện ngoài.'))
children.push(H2('3.1 Đầu vào'))
children.push(T([
  ['Dạng', 'Cách đọc', 'Ghi chú'],
  ['ZIP', 'jszip', 'Mỗi ZIP là một bo'],
  ['RAR', 'node-unrar-js (WASM, nạp khi cần)', 'Chạy trên web và Electron'],
  ['File lẻ', 'Chọn / thả nhiều file', 'Gom thành một bo'],
  ['Thư mục', 'File → Mở thư mục', 'Lấy các file nằm ngay trong thư mục'],
], [15, 40, 45]))
children.push(P('Bỏ qua trước khi parse: report, aperture list, BOM, pick&place, readme, ảnh, PDF, Excel, STEP/DXF, file nén lồng, file dự án KiCad. File .txt chỉ bị bỏ khi tên rõ là tài liệu (vì .txt cũng là file khoan Altium).'))
children.push(H2('3.2 Định dạng dữ liệu'))
children.push(T([
  ['Định dạng', 'Đọc bằng', 'DQPCB xử lý thêm'],
  ['Gerber RS-274X', 'web-gerber', 'Chèn header %FS/%MO khi thiếu; đổi G91 → tuyệt đối; aperture list OrCAD'],
  ['Gerber X2 (%TF)', 'DQPCB đọc FileFunction', 'Nhận lớp, mặt, PTH/NPTH từ chính file'],
  ['Excellon (NC drill)', 'web-gerber', 'Đọc số theo FILE_FORMAT / metric 3.3 (mục 3.4)'],
  ['Gerber dạng file khoan (Proteus)', 'web-gerber', 'Chỉ dùng khi bộ file KHÔNG có Excellon'],
], [25, 25, 50]))
children.push(H2('3.3 Nhận diện lớp — thứ tự'))
children.push(B('**0. File tự khai**: mã lớp CAM350 trong header, rồi Gerber X2 FileFunction.'))
children.push(B('**1. Đuôi file** theo từng EDA (bảng dưới).'))
children.push(B('**2. Từ khoá trong tên** (ranh giới từ): drill → paste → mask → silk → copper → outline → documentation; luật riêng cho SMT/SMB/SST/SSB, "Top SMT Paste" (Proteus), "Overlay"/"Legend", "Drill.GBR" của Proteus là bản vẽ khoan.'))
children.push(B('**3. whats-that-gerber** — phương án cuối. Không khớp gì → unknown (vẫn hiện).'))
children.push(T([
  ['Lớp', 'Đuôi'],
  ['Đồng trên / dưới', '.gtl .cmp .top / .gbl .sol .bot (+ .l1 .l2, toplayer, bottomlayer)'],
  ['Đồng giữa', '.g1–.g9, .in1…, .l3–.l9'],
  ['Mask', '.gts .stc .smt / .gbs .sts .smb'],
  ['In lụa', '.gto .plc .sst / .gbo .pls .ssb'],
  ['Kem hàn', '.gtp .crc .spt / .gbp .crs .spb (DipTrace .stp/.sbt)'],
  ['Viền', '.gko .gml .oln .bor .dim .mil, .gm1'],
  ['Khoan', '.drl .txt .tap .xln .exc .ncd .nc .drill .drd'],
  ['Tài liệu (ẩn)', '.gd1 .gg1 .gpt .gpb .dts .fab, .gm2–.gm99'],
], [25, 75]))
children.push(P('EDA đã gặp và có luật riêng: **Altium, KiCad 5–10, Eagle, OrCAD, Proteus, EasyEDA / EasyEDA Pro, CAM350, DipTrace, Sprint-Layout, Pulsonix.**'))
children.push(H2('3.4 File khoan Excellon — đọc số'))
children.push(T([
  ['Trường hợp', 'Xử lý'],
  ['Toạ độ có dấu chấm', 'Để nguyên'],
  [';FILE_FORMAT=a:b + METRIC/INCH,LZ/TZ (Altium)', 'DQPCB chèn dấu thập phân theo a:b (LZ bù đuôi, TZ bù đầu) — web-gerber không đọc dòng chú thích này (22/09, chưa commit)'],
  ['METRIC, không khai format, không dấu chấm (Proteus)', 'Chèn theo chuẩn metric 3.3'],
  ['INCH không khai', 'Để web-gerber áp 2.4'],
  ['Lệnh phay G00 → M15 → G01 → M16', 'Slot / lỗ chữ nhật (mục 4.3)'],
  ['G85', 'Slot một dòng'],
], [42, 58]))
children.push(P('Mạ / không mạ: X2 → từng mục ;TYPE=PLATED/NON_PLATED (mục nào có mũi) → từ trong tên file (npth, pth, plated… theo ranh giới từ).'))
children.push(H2('3.5 Đơn vị & khi thiếu viền'))
children.push(B('Mỗi lớp giữ đơn vị gốc (mm / in); kích thước bo quy về mm; viewer nhân 25.4 cho lớp inch — kể cả lỗ khoét tách khỏi lớp viền.'))
children.push(B('Thiếu viền: lấy nét AperFunction,Profile lẫn trong lớp khác (Pulsonix); không có thì ước lượng từ khung lớp đồng ("viền bo ước lượng").'))
children.push(breakPage())

// ═══ 4. OUTLINE · DRILL · SLOT ═══
children.push(H1('4. Quan trọng: Outline · Drill · Slot'))
children.push(P('Ba thứ quyết định **kích thước bo (→ giá)** và **hình bo đúng hay sai**. Luật nằm trong geometry.ts, outlineLoops.ts, identify.ts, reader.ts và phần vẽ Viewer2D.WebGL.tsx.'))
children.push(H2('4.1 Outline (viền bo)'))
children.push(H3('Chọn lớp viền'))
children.push(B('Chỉ lớp viền có **ô bao lớn nhất (tính bằng mm)** dựng thân bo và cho kích thước; lớp viền khác thành tài liệu "… (viền phụ)" (22/09, chưa commit).'))
children.push(H3('Nối nét thành vòng'))
children.push(T([
  ['Bước', 'Luật'],
  ['Bẻ cung', 'Cung → đoạn thẳng (web-gerber bóp cung nếu để nguyên)'],
  ['Bỏ đoạn trùng', 'CAM350 ghi viền 4 lần; đoạn ngắn so 0.001 mm (góc KiCad 10); cung so tâm + bán kính + góc giữa'],
  ['Nối', 'Dung sai 0.05 mm (inch: 0.05/25.4); ưu tiên đoạn khít, theo thứ tự file; mảnh hở nối lại với dung sai ×10'],
  ['Tách vòng "số 8"', 'Chuỗi đi qua cùng đỉnh hai lần → tách vòng đơn (đỉnh trùng khít, phần tách ≥ 1 mm²)'],
  ['Giữ vòng', '≥ 3 đoạn; 1–2 đoạn chỉ khi khép kín và có cung (lỗ tròn EasyEDA, bo tròn CAM350)'],
  ['Kích thước', 'Ô bao các vòng đã nối + nửa nét — không dùng số thô'],
], [25, 75]))
children.push(H3('Vòng nào là thân bo, lỗ khoét hay nét phay'))
children.push(T([
  ['Loại', 'Luật'],
  ['Nét phay', 'Chuỗi hở, nằm trong vòng khác, khoảng hở ≥ nửa chiều dài → chỉ vẽ nét'],
  ['"Nằm trong"', 'Tâm ô bao trong vòng lớn hơn và ≥ 50% ô bao chồng lên'],
  ['Không nằm trong vòng nào', 'To (≥ 5% vòng lớn nhất) hoặc dài như rail → thân bo; vòng nhỏ khác (mouse-bite) → lỗ khoét'],
  ['Nằm trong, < 5%', 'Lỗ khoét'],
  ['Nằm trong, ≥ 5%', '≥ 3 pad/đường mạch bên trong → bo con; không → lỗ khoét (không đếm mảng phủ)'],
], [28, 72]))
children.push(H2('4.2 Drill (lỗ khoan)'))
children.push(B('**Đếm lỗ**: mỗi dòng toạ độ (cả dòng chỉ có Y… hay X…), G85 một dòng, mỗi M15 của lệnh phay; Gerber khoan: D03 + chuỗi D02→D01.'))
children.push(B('**File một phần** (PTH, NPTH, -PTH/-NPTH KiCad, Round/Slot/Rect/SquareHoles, Slot.txt) → vẽ tất cả; còn lại là file **gộp** → chỉ vẽ file gộp nhiều lỗ nhất.'))
children.push(B('Có Excellon thì bản Gerber khoan xuất đôi thành tài liệu (tránh đếm đôi). Mọi file khoan là con của một khung rỗng.'))
children.push(B('Lỗi nặng nhất đợt này: Altium metric **FILE_FORMAT=4:3** đọc nhỏ 100 lần (5/171 bộ Altium trong corpus bị).'))
children.push(B('Vẽ: 2D ép cụm khoan thành lát mỏng ngay mặt đang nhìn; 3D trụ cao đúng bề dày bo + lượng rất nhỏ.'))
children.push(H2('4.3 Slot / rãnh / lỗ chữ nhật'))
children.push(T([
  ['Nguồn', 'Dạng trong file', 'Đọc'],
  ['Altium -SlotHoles.TXT, -RectHoles.TXT', 'Excellon phay G00 → M15 → G01 → M16', 'Hình thuôn theo bề rộng dao; đếm theo M15'],
  ['Altium -SquareHoles.TXT', 'Toạ độ thường', 'Lỗ tròn'],
  ['Excellon G85', 'X…Y…G85X…Y…', 'Slot một dòng'],
  ['Gerber khoan (Proteus)', 'D02 → D01', 'Rãnh'],
  ['Rãnh trong lớp viền', 'Vòng kín nhỏ trong bo', 'Lỗ khoét; 2D/3D đi cùng cụm khoan'],
  ['Đường phay hở trong lớp viền', 'Nét hở', 'Nét phay — vẽ nét, không khoét'],
], [30, 32, 38]))
children.push(P('Lưu ý: rect hole Altium là rãnh phay bằng dao tròn (góc bo theo bán kính dao); toạ độ slot nằm SAU G00/G01 — mọi luật đọc số phải dò cả ở đó.'))
children.push(breakPage())

// ═══ 5. VẤN ĐỀ CÒN TỒN & CHECKLIST ═══
children.push(H1('5. Vấn đề còn tồn & checklist'))
children.push(H2('5.1 Vấn đề còn tồn'))
for (const s of [
  '**Chưa commit**: lỗi 8 (FILE_FORMAT), lỗi 9 (viền phụ), lỗi 11 (hộp chọn file web) và thư mục báo cáo.',
  '**.DRD bị chọn thay THRUHOLE.tap** (Dinh Quang Viet, Dinh Ngoc Tram — AUTOMATION-2): .drd gán là dữ liệu khoan (Eagle) nhưng ở các bộ này có vẻ là bản vẽ khoan. Có từ trước.',
  '**Tam giác chéo sai** ở một số panel (Rail.zip, GWLRWEX-CELLULAR, ph_analyzer…): đa giác viền tô lệch. Bản cũ cũng bị.',
  '**Chưa nhận biết file đa thiết kế**: CHAT_BOT_1 (4 bo ghép) vẫn đi bảng tra khi chưa tích Ghép panel — app đếm được số bo trong viền, có thể tự nhắc.',
  '**V-cut / mouse bite chưa vào giá**: chỉ nhắc nhở; công thức chưa có phí V-cut.',
  '**Báo giá ghép panel ghi số set hay số PCB** — đang ghi số set, chờ chốt.',
  '**Bo 6 lớp chưa có đơn giá** (phương án L6).',
  '**DFM chưa có**: đồng / lỗ khoan ngoài hoặc quá sát viền (như J11 ESP32_DR), trace/space, annular ring, đo kích thước.',
]) children.push(B(s))
children.push(H2('5.2 Checklist khi sửa luật đọc file'))
for (const s of [
  'Viết test trong test/ dựng lại đúng dáng file thật gây lỗi.',
  'Chạy **npm run build** (tsc -b chặt hơn tsc --noEmit — lỗi build Vercel ở f12b339 là do chỉ chạy lệnh nhẹ) và npx vitest run (131 test).',
  'Hồi quy corpus D:\\JobDatMach: so bản cũ/mới — kích thước bo, số vòng + thân/lỗ/nét, số lỗ và tỉ lệ lỗ nằm trong bo; xem hình cũ/mới các bộ bị đổi trước khi chốt.',
  'Mở lại bộ mẫu: FC_F405RGT6_Wing (KiCad 6 lớp), BOAD NUT NHAN (EasyEDA), AGVH7 (Altium inch, slot), Ceiling / Dynamic Master (panel inch), Slaver_Ceiling bản lẻ (GKO + GM1), ESP32_DR (Altium metric 4:3, RectHoles), CHAT_BOT_1 (panel 4 bo), 3W NHUA XANH (CAM350, RAR).',
]) children.push(B(s))

// ── tài liệu ───────────────────────────────────────────────────────────
const doc = new Document({
  creator: 'DQPCB',
  title: 'Báo cáo DQPCB — 22/09/2026',
  styles: {
    default: { document: { run: { font: FONT, size: 21 } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 30, bold: true, font: FONT }, paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, font: FONT }, paragraph: { spacing: { before: 220, after: 100 }, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, font: FONT }, paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 270 } } } },
      ],
    }],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
    footers: {
      default: new Footer({
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('Báo cáo DQPCB · 22/09/2026 · trang ', { size: 17, color: '808080' }), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 17, color: '808080' })] })],
      }),
    },
    children,
  }],
})

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf)
  console.log('wrote', OUT, buf.length, 'bytes')
})
