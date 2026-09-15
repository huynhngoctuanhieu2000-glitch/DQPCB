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
import { GerberParser, drillPlatingOf } from '../src/core/GerberParser'

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
