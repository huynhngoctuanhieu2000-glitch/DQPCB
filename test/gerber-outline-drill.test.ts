/**
 * Hai lỗi lộ ra từ một bộ EasyEDA Pro thật (bo drone 100×100, 12/09/2026):
 *
 *  1. Viền: lỗ tròn/cutout tròn của EasyEDA vẽ bằng ĐÚNG HAI cung 180°, có bộ xuất dùng
 *     một cung 360°. Bộ nối vòng loại thẳng mọi vòng dưới 3 đoạn nên 4 lỗ ở đầu càng
 *     biến mất; bo tròn (CAM350, một cung 360°) thì mất luôn cả viền.
 *  2. Khoan: tên "Drill_NPTH_Through.DRL" trượt luật đoán /-(N?PTH)\.\w+$/ của KiCad nên
 *     cả bộ PTH/NPTH/Via bị coi là ba file GỘP, viewer chỉ vẽ file đông lỗ nhất — mất
 *     sạch lỗ không mạ lẫn lỗ via.
 */
import { describe, it, expect } from 'vitest'
import { GerberParser, countExcellonHoles, drillPlatingOf, isPartialDrillFile, isSlotOnlyDrill, matchLayer } from '../src/lib/gerber-reader'
import { defineMissingApertures } from '../src/lib/gerber-reader/normalize'
import { isGerberContent } from '../src/lib/gerber-reader/identify'

const asFile = (name: string, content: string) =>
  ({
    name,
    text: async () => content,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  }) as unknown as File

/** Gerber mm, 4 số nguyên + 5 thập phân — đúng format EasyEDA Pro xuất ra. */
const gbr = (body: string) =>
  ['%FSLAX45Y45*%', '%MOMM*%', '%ADD10C,0.1*%', 'G75*', 'G54D10*', body, 'M02*'].join('\n')

const copper = gbr('G01X0Y0D02*\nG01X1000000Y0D01*\nG01X1000000Y1000000D01*\n')

/** Vuông 10×10 + một lỗ tròn Ø2 ở giữa, lỗ ghép từ hai cung 180° kiểu EasyEDA. */
const outlineWithRoundHole = gbr(
  [
    'G01X0Y0D02*',
    'G01X1000000Y0D01*',
    'G01X1000000Y1000000D01*',
    'G01X0Y1000000D01*',
    'G01X0Y0D01*',
    'G01X400000Y500000D02*',
    'G03X600000Y500000I100000J0D01*',
    'G03X400000Y500000I-100000J0D01*',
  ].join('\n'),
)

/** Bo TRÒN Ø20: cả viền chỉ là một cung 360° (CAM350 xuất kiểu này). */
const roundBoard = gbr('G01X2000000Y1000000D02*\nG03X2000000Y1000000I-1000000J0D01*')

/** Hai đoạn thẳng đi ra rồi đi về trên cùng một vạch — khép kín nhưng diện tích 0. */
const outlineWithDegenerateStub = gbr(
  [
    'G01X0Y0D02*',
    'G01X1000000Y0D01*',
    'G01X1000000Y1000000D01*',
    'G01X0Y1000000D01*',
    'G01X0Y0D01*',
    'G01X200000Y200000D02*',
    'G01X300000Y200000D01*',
    'G01X200000Y200000D01*',
  ].join('\n'),
)

const parse = (files: [string, string][]) =>
  GerberParser.parseInputFiles(files.map(([n, c]) => asFile(n, c)) as any)

const outlineOf = (board: any) => board.layers.find((l: any) => l.type === 'outline')

describe('stitchOutline — vòng kín ít đoạn', () => {
  it('giữ lỗ tròn ghép từ hai cung, không loại theo số đoạn', async () => {
    const [board] = await parse([
      ['Gerber_TopLayer.GTL', copper],
      ['Gerber_BoardOutlineLayer.GKO', outlineWithRoundHole],
    ])
    // 2 vòng: biên ngoài + lỗ tròn. Trước khi sửa chỉ còn 1.
    expect(outlineOf(board).imageTree.parts).toHaveLength(2)
  })

  it('dựng được bo tròn vẽ bằng một cung 360°', async () => {
    const [board] = await parse([
      ['COPPER1.gbr', copper],
      ['OUTLINE.gbr', roundBoard],
    ])
    expect(outlineOf(board).imageTree.parts).toHaveLength(1)
    // Đường kính 20 mm, trừ lại nét vẽ 0.1 mm ở hai mép.
    expect(board.bounds.widthMM).toBeCloseTo(20, 1)
    expect(board.bounds.heightMM).toBeCloseTo(20, 1)
  })

  it('vẫn bỏ vòng kín toàn đoạn thẳng không bao diện tích', async () => {
    const [board] = await parse([
      ['Gerber_TopLayer.GTL', copper],
      ['Gerber_BoardOutlineLayer.GKO', outlineWithDegenerateStub],
    ])
    expect(outlineOf(board).imageTree.parts).toHaveLength(1)
  })
})

describe('drillPlatingOf — tách file khoan PTH/NPTH', () => {
  it('đọc chú thích ;TYPE= của Excellon EasyEDA/Altium', () => {
    expect(drillPlatingOf('Drill_NPTH_Through.DRL', ';TYPE=NON_PLATED\n;Layer: NPTH_Through\nM48\n')).toBe('NPTH')
    expect(drillPlatingOf('Drill_PTH_Through.DRL', ';TYPE=PLATED\nM48\n')).toBe('PTH')
  })

  it('đọc tên file theo TỪ, không chỉ theo đuôi -PTH.drl của KiCad', () => {
    expect(drillPlatingOf('Drill_NPTH_Through.DRL')).toBe('NPTH')
    expect(drillPlatingOf('Drill_PTH_Through_Via.DRL')).toBe('PTH')
    expect(drillPlatingOf('board-NPTH.drl')).toBe('NPTH')
    expect(drillPlatingOf('board-PTH.drl')).toBe('PTH')
  })

  it('không nhận nhầm chữ khác có chứa "pth"', () => {
    expect(drillPlatingOf('DEPTH_MAP.drl')).toBeUndefined()
    expect(drillPlatingOf('drill.drl')).toBeUndefined()
  })

  it('X2 FileFunction vẫn thắng tên file', () => {
    const x2 = '%TF.FileFunction,NonPlated,1,2,NPTH*%\n%FSLAX45Y45*%\n'
    expect(drillPlatingOf('Drill TOP-BOT Plated.GBR', x2)).toBe('NPTH')
    expect(drillPlatingOf('any.drl', '%TF.FileFunction,MixedPlating,1,2*%\n')).toBe('mixed')
  })
})

describe('matchLayer — tên lớp ba chữ kiểu CAM350/OrCAD', () => {
  it('SMT/SMB là mask, SST/SSB là in lụa, TOP/BOT là đồng', () => {
    const set = ['TOP.gbr', 'BOT.gbr', 'SMT.gbr', 'SMB.gbr', 'SST.gbr', 'SSB.gbr', 'OUTLINE.gbr', 'drill.drl']
    expect(matchLayer('SMT.gbr', set)).toMatchObject({ type: 'soldermask', side: 'top' })
    expect(matchLayer('SMB.gbr', set)).toMatchObject({ type: 'soldermask', side: 'bottom' })
    expect(matchLayer('SST.gbr', set)).toMatchObject({ type: 'silkscreen', side: 'top' })
    expect(matchLayer('SSB.gbr', set)).toMatchObject({ type: 'silkscreen', side: 'bottom' })
    expect(matchLayer('TOP.gbr', set)).toMatchObject({ type: 'copper', side: 'top' })
  })

  it('"Top SMT Paste" của Proteus vẫn là paste, không bị bắt thành mask', () => {
    expect(matchLayer('Top SMT Paste.GBR', [])).toMatchObject({ type: 'solderpaste', side: 'top' })
  })
})

describe('dilateRegions — lấp khe giữa các dải phủ đồng', () => {
  /** Chữ nhật tô đặc, toạ độ theo đơn vị file (1e-5 mm). */
  const box = (x0: number, y0: number, x1: number, y1: number) =>
    ['G36*', `G01X${x0}Y${y0}D02*`, `G01X${x1}Y${y0}D01*`, `G01X${x1}Y${y1}D01*`, `G01X${x0}Y${y1}D01*`, `G01X${x0}Y${y0}D01*`, 'G37*'].join('\n')
  /** Sáu dải cao 0.2 mm xếp chồng, hở 0.02 mm — kiểu CAM350 xuất phủ đồng. */
  const strips = gbr(Array.from({ length: 6 }, (_, k) => box(0, k * 22000, 1000000, k * 22000 + 20000)).join('\n'))
  const regionsOf = (board: any) => board.layers[0].imageTree.children.filter((c: any) => c.type === 'imageRegion')
  const yRange = (region: any) => {
    const ys = region.segments.map((s: any) => s.start[1])
    return [Math.min(...ys), Math.max(...ys)]
  }

  it('lớp kiểu dải: nới đều cả dải, dải kề phủ lên nhau', async () => {
    const [board] = await parse([['Gerber_TopLayer.GTL', strips]])
    const ranges = regionsOf(board).map(yRange).sort((p: number[], q: number[]) => p[0] - q[0])
    expect(ranges).toHaveLength(6)
    expect(ranges[0][1]).toBeGreaterThan(ranges[1][0])
    expect(ranges[0][0]).toBeCloseTo(-0.035, 3)
    expect(ranges[0][1]).toBeCloseTo(0.235, 3)
  })

  it('mảnh chạm khít kiểu KiCad (khe 0) giữ nguyên, mép không bị răng cưa', async () => {
    const pieces = gbr(Array.from({ length: 6 }, (_, k) => box(0, k * 20000, 1000000, k * 20000 + 20000)).join('\n'))
    const [board] = await parse([['Gerber_TopLayer.GTL', pieces]])
    const ranges = regionsOf(board).map(yRange).sort((p: number[], q: number[]) => p[0] - q[0])
    expect(ranges[0][0]).toBeCloseTo(0, 5)
    expect(ranges[0][1]).toBeCloseTo(0.2, 5)
  })

  it('pad đứng riêng giữ nguyên kích thước (khe 0.25 mm như chân QFP)', async () => {
    const pads = gbr(
      [
        'G36*', 'G01X0Y0D02*', 'G01X25000Y0D01*', 'G01X25000Y100000D01*', 'G01X0Y100000D01*', 'G01X0Y0D01*', 'G37*',
        'G36*', 'G01X50000Y0D02*', 'G01X75000Y0D01*', 'G01X75000Y100000D01*', 'G01X50000Y100000D01*', 'G01X50000Y0D01*', 'G37*',
      ].join('\n'),
    )
    const [board] = await parse([['Gerber_TopLayer.GTL', pads]])
    const xs = board.layers[0].imageTree.children
      .filter((c: any) => c.type === 'imageRegion')
      .map((r: any) => r.segments.map((s: any) => s.start[0]))
    expect(Math.min(...xs[0])).toBeCloseTo(0, 3)
    expect(Math.max(...xs[0])).toBeCloseTo(0.25, 3)
    expect(Math.min(...xs[1])).toBeCloseTo(0.5, 3)
  })

  it('không đụng tới viền và lớp khoan', async () => {
    const [board] = await parse([['Gerber_TopLayer.GTL', copper], ['Gerber_BoardOutlineLayer.GKO', outlineWithRoundHole]])
    expect(board.bounds.widthMM).toBeCloseTo(10, 1)
  })
})

describe('Altium: lỗ slot / chữ nhật và file khoan tách theo hình lỗ', () => {
  // Bo "AGVH7" (Vu Bao, 21/09/2026): slot vẽ bằng lệnh phay G00 → M15 → G01 → M16.
  const slotHoles = [
    'M48', ';FILE_FORMAT=2:4', 'INCH,LZ', ';TYPE=PLATED', 'T7F00S00C0.0354', 'T13F00S00C0.0472', ';TYPE=NON_PLATED', '%',
    'G90', 'G05', 'T07',
    'G00X-006898Y020936', 'M15', 'G01X-006858Y020937', 'M16',
    'G00X-005913Y020936', 'M15', 'G01X-005874Y020937', 'M16',
    'T13',
    'G00X-008087Y022121', 'M15', 'G01Y021806', 'M16',
    'M17', 'M30',
  ].join('\n')
  // RoundHoles cùng bộ: mũi T1 mạ, T21 KHÔNG mạ (Ø3.2) — nằm chung một file.
  const roundHoles = [
    'M48', 'INCH,LZ', ';TYPE=PLATED', 'T1F00S00C0.0280', ';TYPE=NON_PLATED', 'T21F00S00C0.1260', '%',
    'G90', 'G05', 'T01', 'X010000Y010000', 'Y012000', 'X011000', 'T21', 'X020000Y020000', 'M30',
  ].join('\n')

  it('mỗi lần hạ dao M15 là một lỗ; G00/G01 chỉ là di chuyển', () => {
    expect(countExcellonHoles(slotHoles)).toBe(3)
  })

  it('dòng chỉ có Y (giữ X cũ) vẫn là một lỗ', () => {
    expect(countExcellonHoles(roundHoles)).toBe(4)
  })

  it('đọc từng mục ;TYPE= xem mục nào có mũi thật', () => {
    expect(drillPlatingOf('AGVH7-RoundHoles.TXT', roundHoles)).toBe('mixed')
    expect(drillPlatingOf('AGVH7-SlotHoles.TXT', slotHoles)).toBe('PTH') // mục NON_PLATED rỗng
  })

  it('file tách theo hình lỗ luôn là một phần của bộ khoan, kể cả khi mixed', () => {
    expect(isPartialDrillFile('AGVH7-RoundHoles.TXT', 'mixed')).toBe(true)
    expect(isPartialDrillFile('AGVH7-SlotHoles.TXT')).toBe(true)
    expect(isPartialDrillFile('BAI111-RectHoles.TXT')).toBe(true)
    expect(isPartialDrillFile('squareholes.drl')).toBe(true)
    expect(isPartialDrillFile('Slot.txt')).toBe(true)
    expect(isPartialDrillFile('Drill.drl')).toBe(false)
    expect(isPartialDrillFile('Rectifier.drl')).toBe(false)
    expect(isPartialDrillFile('board.drl', 'mixed')).toBe(false)
  })
})

describe('stitchOutline — panel V-cut: hai bo chung cạnh', () => {
  // Đúng dáng bộ "Dynamic Master" (Le Quoc Huy, 21/09/2026): bo dưới có khấc ở cạnh
  // chung nên cạnh đó bị chia hai đoạn, bo trên vẽ cạnh chung bằng một đường liền.
  // Bản cũ nối cả hai bo thành MỘT vòng 12 đoạn hình số 8 → mất nửa thân bo khi tô.
  const P = (x: number, y: number) => `X${x * 100000}Y${y * 100000}`
  const path = (pts: number[][]) => [`G01${P(pts[0][0], pts[0][1])}D02*`, ...pts.slice(1).map(([x, y]) => `G01${P(x, y)}D01*`)]
  const lower = path([[10, 10], [6, 10], [6, 10.5], [4, 10.5], [4, 10], [0, 10], [0, 0], [10, 0], [10, 10]])
  const upper = path([[10, 10], [0, 10], [0, 20], [10, 20], [10, 10]])

  for (const [order, body] of [['bo trên trước', [...upper, ...lower]], ['bo dưới trước', [...lower, ...upper]]] as const) {
    it(`tách thành hai vòng đơn (${order})`, async () => {
      const [board] = await parse([['Gerber_TopLayer.GTL', copper], ['Gerber_BoardOutlineLayer.GKO', gbr(body.join('\n'))]])
      const parts = outlineOf(board).imageTree.parts
      expect(parts.map((p: any) => p.children.length).sort()).toEqual([4, 8])
      expect(board.bounds.heightMM).toBeCloseTo(20, 1)
    })
  }
})

describe('Excellon khai ;FILE_FORMAT (Altium)', () => {
  // Bo "ESP32_DR" (Nguyen Van Quang, 22/09/2026): METRIC, LZ, 4:3 — X0050419 là 50.419 mm.
  // web-gerber không đọc dòng chú thích FILE_FORMAT, đọc ra 0.50419 mm: lỗ co 100 lần.
  const board = gbr('G01X0Y0D02*\nG01X6700000Y0D01*\nG01X6700000Y9000000D01*\nG01X0Y9000000D01*\nG01X0Y0D01*')
  const round = ['M48', ';FILE_FORMAT=4:3', 'METRIC,LZ', ';TYPE=PLATED', 'T01F00S00C0.400', '%', 'T01', 'X0050419Y0024003', 'X0055245Y0031623', 'M30'].join('\n')
  // Lỗ chữ nhật phay: toạ độ nằm sau G00/G01, không đứng đầu dòng.
  const rect = ['M48', ';FILE_FORMAT=4:3', 'METRIC,LZ', ';TYPE=PLATED', 'T02F00S00C1.000', '%', 'G90', 'G05', 'T02', 'G00X0027000Y0016500', 'M15', 'G01X0041000', 'M16', 'M30'].join('\n')

  it('đặt lỗ đúng chỗ theo format đã khai, kể cả toạ độ sau lệnh phay', async () => {
    const [b] = await parse([['PCB2.GTL', copper], ['PCB2.GKO', board], ['PCB2.TXT', round], ['PCB2-RectHoles.TXT', rect]])
    const drill = (name: string) => b.layers.find((l: any) => l.filename === name)
    const hole = drill('PCB2.TXT').imageTree.children.find((c: any) => c.type === 'imageShape').shape
    expect(hole.cx).toBeCloseTo(50.419, 3)
    expect(hole.cy).toBeCloseTo(24.003, 3)
    const [x0, , x1] = drill('PCB2-RectHoles.TXT').size
    expect(x0).toBeGreaterThan(26)
    expect(x1).toBeLessThan(42)
  })
})

describe('Excellon INCH không khai định dạng số (Pulsonix)', () => {
  // Bo "FRIWO 55807.931-90FE" (22/09/2026): Pulsonix xuất "INCH" trơn, toạ độ 3:5 giữ số
  // 0 đầu. Không có gì trong file nói là 3:5, parser áp 2:4 → X01011283 thành 1.011283 in,
  // cả cụm lỗ co 10 lần nằm ngoài bo. Lấy chính viền bo làm thước để chọn lại cách đọc.
  const inchGbr = (body: string) =>
    ['%FSLAX35Y35*%', '%MOIN*%', '%ADD10C,0.00787*%', 'G75*', 'G54D10*', body, 'M02*'].join('\n')
  const outline = inchGbr(
    'G01X946100Y630200D02*\nG01X1487800Y630200D01*\nG01X1487800Y1209700D01*\nG01X946100Y1209700D01*\nG01X946100Y630200D01*',
  )
  const drill = ['M48', 'FMAT,1', 'INCH', 'T01C000.00984', '%', 'G81', 'M70', 'T01', 'X01011283Y00706890', 'X01411283Y01106890', 'M30'].join('\n')

  it('đặt lỗ vào đúng trong viền bo', async () => {
    const [b] = await parse([['55807(Keep Out).gbr', outline], ['55807(Drilling Data).drl', drill]])
    const layer = b.layers.find((l: any) => l.type === 'drill')
    const hole = layer.imageTree.children.find((c: any) => c.type === 'imageShape').shape
    expect(layer.imageTree.units).toBe('in')
    expect(hole.cx).toBeCloseTo(10.11283, 4)
    expect(hole.cy).toBeCloseTo(7.0689, 4)
  })

  // Bo sát gốc toạ độ: lỗ đọc 2:4 co 10 lần nhưng vẫn nằm TRONG khung bo (dồn về góc dưới
  // trái) — chỉ nhìn khung bo thì không thấy sai. Dò theo pad đồng mới bắt được.
  const pts: [number, number][] = [
    [1.0, 0.7], [1.4, 1.1], [2.0, 1.3], [0.5, 0.4], [1.8, 0.2], [0.3, 1.2],
    [2.2, 0.6], [0.9, 1.0], [1.6, 0.5], [0.6, 0.9], [2.1, 1.0], [1.2, 0.3],
  ]
  const in35 = (v: number) => String(Math.round(v * 100000)).padStart(8, '0') // 3:5 giữ số 0 đầu
  const nearOrigin = inchGbr('G01X0Y0D02*\nG01X250000Y0D01*\nG01X250000Y150000D01*\nG01X0Y150000D01*\nG01X0Y0D01*')
  const padsAt = (list: [number, number][]) =>
    ['%FSLAX35Y35*%', '%MOIN*%', '%ADD11C,0.06*%', 'G54D11*',
      ...list.map(([x, y]) => `X${Math.round(x * 100000)}Y${Math.round(y * 100000)}D03*`), 'M02*'].join('\n')
  const drillAt = (list: [number, number][], dia = '000.03150') =>
    ['M48', 'INCH', `T01C${dia}`, '%', 'T01', ...list.map(([x, y]) => `X${in35(x)}Y${in35(y)}`), 'M30'].join('\n')

  it('bo sát gốc toạ độ: dò theo pad, không để lỗ dồn về góc', async () => {
    const [b] = await parse([['p(Keep Out).gbr', nearOrigin], ['p(Copper Top Side).gbr', padsAt(pts)], ['p(Drilling Data).drl', drillAt(pts)]])
    const holes = b.layers.find((l: any) => l.type === 'drill').imageTree.children.map((c: any) => c.shape)
    expect(holes[0].cx).toBeCloseTo(1.0, 4)
    expect(holes[0].cy).toBeCloseTo(0.7, 4)
    expect(holes[2].cx).toBeCloseTo(2.0, 4)
  })

  it('file NPTH không có pad: dùng lại cách đọc đã chốt cho file PTH cùng bộ', async () => {
    const mount: [number, number][] = [[0.15, 0.15], [2.35, 0.15], [0.15, 1.35], [2.35, 1.35], [1.25, 0.75]]
    const [b] = await parse([
      ['p(Keep Out).gbr', nearOrigin],
      ['p(Copper Top Side).gbr', padsAt(pts)],
      ['p-PTH.drl', drillAt(pts)],
      ['p-NPTH.drl', drillAt(mount, '000.12205')],
    ])
    const npth = b.layers.find((l: any) => l.filename === 'p-NPTH.drl')
    const first = npth.imageTree.children[0].shape
    expect(first.cx).toBeCloseTo(0.15, 4)
    expect(npth.size[2]).toBeCloseTo(2.35 + 0.061025, 3)
  })

  it('file khoan lệch gốc so với Gerber: dời cho khớp pad và ghi lại để cảnh báo', async () => {
    // Bộ "PCB_doline" (Altium, 25/08/2025): khai đúng 2:4 nhưng file khoan xuất theo gốc
    // khác Gerber, cả cụm lỗ dời (+88, +25.5) mm. Ở đây dời (+3, +1) in.
    const in24 = (v: number) => String(Math.round(v * 10000)).padStart(6, '0')
    const off = ['M48', 'INCH', 'T01C0.0315', '%', 'T01', ...pts.map(([x, y]) => `X${in24(x + 3)}Y${in24(y + 1)}`), 'M30'].join('\n')
    const [b] = await parse([['p(Keep Out).gbr', nearOrigin], ['p(Copper Top Side).gbr', padsAt(pts)], ['p(Drilling Data).drl', off]])
    const layer = b.layers.find((l: any) => l.type === 'drill')
    const hole = layer.imageTree.children[0].shape
    expect(hole.cx).toBeCloseTo(1.0, 3)
    expect(hole.cy).toBeCloseTo(0.7, 3)
    expect(layer.drillFix).toMatchObject({ reading: null, via: 'pad' })
    expect(layer.drillFix.dxMm).toBeCloseTo(-76.2, 1)
    expect(layer.drillFix.dyMm).toBeCloseTo(-25.4, 1)
  })

  it('file NPTH có khai định dạng: lỗ bắt vít không trúng pad vẫn giữ nguyên', async () => {
    // Bộ EasyEDA "5395_1" (Le Van Quy, 09/01/2025): NPTH khai FILE_FORMAT=3:3 METRIC,LZ,
    // đọc đúng rồi. Lỗ bắt vít ở 4 góc không có pad — bản đầu của cách dò pad thấy tỉ lệ
    // trúng pad thấp, thử cách đọc khác và dồn cả cụm vào vài pad to (khớp giả).
    const mm = (v: number) => String(Math.round(Math.abs(v) * 25.4 * 1000)).padStart(6, '0')
    const holes: [number, number][] = [[0.15, 0.15], [2.35, 0.15], [0.15, 1.35], [2.35, 1.35], [1.25, 0.75], [0.8, 0.8]]
    const npth = ['M48', 'METRIC,LZ,000.000', ';FILE_FORMAT=3:3', ';TYPE=NON_PLATED', 'T01C3.200', '%', 'T01',
      ...holes.map(([x, y]) => `X${mm(x)}Y${mm(y)}`), 'M30'].join('\n')
    const [b] = await parse([['p(Keep Out).gbr', nearOrigin], ['p(Copper Top Side).gbr', padsAt(pts)], ['Drill_NPTH_Through.DRL', npth]])
    const layer = b.layers.find((l: any) => l.type === 'drill')
    expect(layer.drillFix).toBeUndefined()
    expect(layer.imageTree.children[0].shape.cx).toBeCloseTo(0.15 * 25.4, 2)
  })

  it('không đụng file khoan mà cách đọc mặc định đã trúng pad', async () => {
    // Cùng vị trí nhưng file ghi đúng 2:4 (6 chữ số): mặc định đã đúng, phải giữ nguyên.
    const in24 = (v: number) => String(Math.round(v * 10000)).padStart(6, '0')
    const ok = ['M48', 'INCH', 'T01C0.0315', '%', 'T01', ...pts.map(([x, y]) => `X${in24(x)}Y${in24(y)}`), 'M30'].join('\n')
    const [b] = await parse([['p(Keep Out).gbr', nearOrigin], ['p(Copper Top Side).gbr', padsAt(pts)], ['p(Drilling Data).drl', ok]])
    const hole = b.layers.find((l: any) => l.type === 'drill').imageTree.children[0].shape
    expect(hole.cx).toBeCloseTo(1.0, 4)
  })
})

describe('nhiều lớp viền (Altium .GKO + .GM1)', () => {
  // Bo "Slaver_Ceiling_ EC" (Le Quoc Huy, 21/09/2026): GM1 chỉ là khung linh kiện nằm
  // trong bo. Viewer lấy lớp viền dựng sau cùng làm thân bo → thân bo chỉ còn cái khung.
  const edge = gbr('G01X0Y0D02*\nG01X10000000Y0D01*\nG01X10000000Y8000000D01*\nG01X0Y8000000D01*\nG01X0Y0D01*')
  const frame = gbr('G01X2000000Y2000000D02*\nG01X4000000Y2000000D01*\nG01X4000000Y3000000D01*\nG01X2000000Y3000000D01*\nG01X2000000Y2000000D01*')

  it('chỉ lớp có ô bao lớn nhất là viền; lớp kia thành tài liệu', async () => {
    const [b] = await parse([['PCB.GTL', copper], ['PCB.GKO', edge], ['PCB.GM1', frame]])
    const outlines = b.layers.filter((l: any) => l.type === 'outline')
    expect(outlines.map((l: any) => l.filename)).toEqual(['PCB.GKO'])
    const gm1 = b.layers.find((l: any) => l.filename === 'PCB.GM1')
    expect(gm1.type).toBe('documentation')
    expect(gm1.displayName).toContain('viền phụ')
    expect(b.bounds.widthMM).toBeCloseTo(100, 0)
  })
})

describe('rãnh phay vẽ bằng một nét trong lớp viền', () => {
  // Bo "CHAT_BOT_4" (Nguyen Van Quang, 22/09/2026): khung chữ L nét 0.5 mm + 3 rãnh chia bo
  // nét 0.8 mm, mỗi rãnh một đoạn. Trước bị loại cùng "đường lẻ" → mất sạch rãnh.
  const outline = [
    '%FSLAX44Y44*%', '%MOMM*%', '%ADD10C,0.5000*%', '%ADD40C,0.8000*%', 'D10*',
    'X813000Y814000D02*', 'X1137000D01*', 'X813000D02*', 'Y1231000D01*', 'X259000D02*', 'X813000D01*',
    'X1137000Y261000D02*', 'Y814000D01*', 'X259000Y261000D02*', 'X1137000D01*', 'X259000D02*', 'Y1231000D01*',
    'D40*', 'X813000Y403000D02*', 'X813000Y677000D01*', 'X388000Y584000D02*', 'X683000D01*',
    // Vạch chạm mép bo (kiểu V-cut vẽ trong lớp viền): không phải rãnh.
    'D40*', 'X259000Y1000000D02*', 'X500000D01*',
    'M02*',
  ].join('\n')

  it('giữ rãnh nằm hẳn trong bo, bỏ vạch chạm mép; kích thước không đổi', async () => {
    const [b] = await parse([['GHEP_MACH.GTL', copper], ['GHEP_MACH.GKO', outline]])
    const parts = outlineOf(b).imageTree.parts
    expect(parts).toHaveLength(3) // khung + 2 rãnh
    // CAM vẽ lại đúng nét gốc của khách: mỗi rãnh giữ một nét đơn.
    expect(parts.filter((pt: any) => pt.millLine).map((pt: any) => pt.millLine.children.length)).toEqual([1, 1])
    expect(b.bounds.widthMM).toBeCloseTo(87.8, 0)
    expect(b.bounds.heightMM).toBeCloseTo(97, 0)
  })
})

describe('OrCAD Layout: thruhole.tap + bản vẽ khoan .DRD (bo DA82, Dinh Anh Tuan)', () => {
  // Header OrCAD Layout: có "N2" (số chữ số mã dòng) giữa A và X.
  const orcad = (body: string) =>
    ['%FSLAN2X34Y34*%', '%MOIN*%', '%ADD10C,0.010*%', 'G54D10*', body, 'M02*'].join('\n')
  const top = orcad('G01X0000000Y0000000D02*\nX0010000D01*\nY0010000D01*\n')
  // Bản vẽ khoan: ký hiệu vẽ bằng nét, kèm bảng ký hiệu nằm ngoài bo.
  const drd = orcad('X0002000Y0002000D02*\nX0003000Y0003000D01*\nX0050000Y-0020000D02*\nX0060000Y-0020000D01*\n')
  // Excellon không header, format 2.4 giữ số 0 đầu.
  const tap = ['%', 'T1C0.0280F200S100', 'X002500Y002500', 'X007500Y007500', 'M30'].join('\n')

  it('nhận header có N2 là Gerber', () => {
    expect(isGerberContent(drd)).toBe(true)
  })

  it('vẽ thruhole.tap, .DRD thành tài liệu', async () => {
    const [b] = await GerberParser.parseInputFiles([
      asFile('BO.TOP', top),
      asFile('BO.DRD', drd),
      asFile('thruhole.tap', tap),
    ])
    const tapLayer = b.layers.find((l) => l.filename === 'thruhole.tap')!
    expect(tapLayer.type).toBe('drill')
    expect(tapLayer.holeCount).toBe(2)
    expect(b.layers.find((l) => l.filename === 'BO.DRD')!.type).toBe('documentation')
  })

  it('chọn tay loại lớp rồi đọc lại; bỏ chọn tay thì về như cũ', async () => {
    const [b] = await GerberParser.parseInputFiles([
      asFile('BO.TOP', top),
      asFile('BO.DRD', drd),
      asFile('thruhole.tap', tap),
    ])
    const forced = await GerberParser.rebuildBoard(b, { 'BO.DRD': 'drill', 'BO.TOP': 'outline' })
    const drdLayer = forced.layers.find((l) => l.filename === 'BO.DRD')!
    expect(drdLayer.type).toBe('drill')
    expect(drdLayer.userType).toBe('drill')
    expect(forced.layers.find((l) => l.filename === 'BO.TOP')!.type).toBe('outline')
    expect(forced.layerOverrides).toEqual({ 'BO.DRD': 'drill', 'BO.TOP': 'outline' })

    const back = await GerberParser.rebuildBoard(forced, {})
    expect(back.layers.find((l) => l.filename === 'BO.DRD')!.type).toBe('documentation')
    expect(back.layers.find((l) => l.filename === 'BO.TOP')!.type).toBe('copper')
  })
})

describe('lớp viền có vùng tô đứng trước khung bo (bo Anh Nhat, BAI111.GKO)', () => {
  // Vùng tô G36 (rãnh khoét) nằm TRƯỚC các nét khung bo 10 × 10 mm.
  const gko = gbr(
    [
      'G36*',
      'X300000Y100000D02*',
      'X700000Y100000D01*',
      'X700000Y200000D01*',
      'X300000Y200000D01*',
      'X300000Y100000D01*',
      'G37*',
      'G01X0Y0D02*',
      'G01X1000000Y0D01*',
      'G01X1000000Y1000000D01*',
      'G01X0Y1000000D01*',
      'G01X0Y0D01*',
    ].join('\n'),
  )

  it('khung bo là nét vẽ, tô đặc được (2D/3D có lõi bo)', async () => {
    const { renderThree } = await import('web-gerber')
    const [b] = await GerberParser.parseInputFiles([asFile('BO.GTL', copper), asFile('BO.GKO', gko)])
    const parts = b.layers.find((l) => l.type === 'outline')!.imageTree.parts
    // Thân bo = vòng có ô bao lớn nhất (vòng kia là rãnh khoét 4 × 1 mm).
    const span = (p: any) => Math.max(...p.children.map((c: any) => Math.abs(c.segments[0].end[0] - c.segments[0].start[0])))
    const body = parts.reduce((a: any, p: any) => (span(p) > span(a) ? p : a))
    expect(parts.every((p: any) => p.children.every((c: any) => c.type === 'imagePath'))).toBe(true)
    let verts = 0
    renderThree(body, 0xffffff, undefined, true).traverse((o: any) => {
      verts += o.geometry?.attributes?.position?.count ?? 0
    })
    expect(verts).toBeGreaterThan(0)
    expect(b.bounds.widthMM).toBeCloseTo(10, 0)
  })
})

describe('bo Dao Quoc Thai 5pcs: khấc mép, file chỉ có rãnh, aperture không khai báo', () => {
  // Khung 10 × 10 mm + vùng tô 2 × 4 mm vắt ngang mép phải (lấn vào 1 mm, thò ra 1 mm).
  const gko = gbr(
    [
      'G36*',
      'X900000Y300000D02*',
      'X1100000Y300000D01*',
      'X1100000Y700000D01*',
      'X900000Y700000D01*',
      'X900000Y300000D01*',
      'G37*',
      'G01X0Y0D02*',
      'G01X1000000Y0D01*',
      'G01X1000000Y1000000D01*',
      'G01X0Y1000000D01*',
      'G01X0Y0D01*',
    ].join('\n'),
  )

  it('khấc vắt ngang mép là lỗ khoét, không tính vào kích thước', async () => {
    const [b] = await GerberParser.parseInputFiles([asFile('BO.GTL', copper), asFile('BO.GKO', gko)])
    expect(b.bounds.widthMM).toBeCloseTo(10, 0)
    expect(b.bounds.heightMM).toBeCloseTo(10, 0)
    const { splitOutlineLoops } = await import('../src/lib/gerber-reader')
    const parts = b.layers.find((l) => l.type === 'outline')!.imageTree.parts
    const sp = splitOutlineLoops(parts)
    expect(sp.body).toHaveLength(1)
    expect(sp.cutouts).toHaveLength(1)
    expect(sp.notches).toHaveLength(1)
  })

  it('file khoan chỉ có rãnh phay được nhận ra bất kể tên', async () => {
    const sq = ['M48', ';FILE_FORMAT=2:5', 'INCH,LZ', 'T3F00S00C0.03150', '%', 'T3', 'G00X003682Y004389', 'M15', 'G01X002816', 'M16', 'M30'].join('\n')
    const drl = ['M48', 'INCH,LZ', 'T2C0.02800', '%', 'T2', 'X0024Y00125', 'X00645Y00065', 'M30'].join('\n')
    const [b] = await GerberParser.parseInputFiles([asFile('BO.GTL', copper), asFile('SqDrl.txt', sq), asFile('Drl.txt', drl)])
    const sqLayer = b.layers.find((l) => l.filename === 'SqDrl.txt')!
    const drlLayer = b.layers.find((l) => l.filename === 'Drl.txt')!
    expect(isPartialDrillFile(sqLayer.filename, sqLayer.drillPlating)).toBe(false) // tên không khớp luật tên
    expect(isSlotOnlyDrill(sqLayer.imageTree)).toBe(true)
    expect(isSlotOnlyDrill(drlLayer.imageTree)).toBe(false)
  })

  it('khai báo aperture còn thiếu bằng nét mảnh, giữ aperture đã khai', () => {
    const src = ['%FSLAX25Y25*%', '%MOIN*%', '%ADD10C,0.01*%', 'G54D37*', 'X0Y0D02*', 'X100000Y0D01*', 'D10*', 'X0Y0D03*', 'M02*'].join('\n')
    const out = defineMissingApertures(src)
    expect(out).toContain('%ADD37C,0.0039*%')
    expect(out.match(/%ADD10/g)).toHaveLength(1)
    expect(out.indexOf('%ADD37')).toBeLessThan(out.indexOf('G54D37'))
    expect(defineMissingApertures(out)).toBe(out)
  })
})
