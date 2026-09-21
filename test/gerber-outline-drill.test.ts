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
import { GerberParser, countExcellonHoles, drillPlatingOf, isPartialDrillFile, matchLayer } from '../src/lib/gerber-reader'

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
