/**
 * Nhận diện lớp theo thuộc tính Gerber X2 (%TF.FileFunction) và xử lý bo không có viền.
 *
 * Dựng từ một bộ xuất Proteus CADCAM thật (hai bo, 11/09/2026):
 * tên file đánh lừa luật đoán theo tên — "Mechanical 1.GBR" thực ra là NPTH rỗng,
 * "Drill TOP-BOT Plated.GBR" thực ra là dữ liệu khoan — và cả bộ không có lớp viền,
 * làm viewer sập ở `OutLine.children[0].material`.
 */
import { describe, it, expect } from 'vitest'
import {
  GerberParser,
  matchLayer,
  isAuxiliaryFile,
  extractProfileGerber,
  ESTIMATED_OUTLINE_FILE,
} from '../src/lib/gerber-reader'

const x2 = (fn: string, body = '') =>
  [
    'G04 PROTEUS GERBER X2 FILE*',
    '%TF.GenerationSoftware,Labcenter,Proteus,8.8-SP1-Build27031*%',
    `%TF.FileFunction,${fn}*%`,
    '%FSLAX45Y45*%',
    '%MOMM*%',
    'G01*',
    body,
    'M02*',
  ].join('\n')

/** Bộ file giống hệt cấu trúc Proteus: đồng hai mặt, khoan Gerber, NPTH rỗng, không viền. */
const PREFIX = 'PROJ TONG HOP - CADCAM '
const copperTop = x2(
  'Copper,L1,Top',
  '%ADD10C,0.254000*%\nD10*\nX+100000Y+100000D02*\nX+9000000Y+100000D01*\nX+9000000Y+5500000D01*\n',
)
const copperBot = x2(
  'Copper,L2,Bot',
  '%ADD10C,0.254000*%\nD10*\nX+0Y+0D02*\nX+9100000Y+0D01*\nX+9100000Y+5700000D01*\nX+0Y+5700000D01*\n',
)
const drillPlated = x2(
  'Plated,1,2,PTH',
  '%TA.AperFunction,ComponentDrill*%\n%ADD40C,1.000000*%\n%TD.AperFunction*%\nD40*\n' +
    'X+250000Y+250000D03*\nX+758000Y+250000D03*\nX+3742000Y+5250000D03*\n',
)
const mechanicalEmpty = x2('NonPlated,1,2,NPTH', '%TD.AperFunction*%')

const asFile = (name: string, content: string) =>
  ({ name, text: async () => content, arrayBuffer: async () => new TextEncoder().encode(content).buffer }) as unknown as File

describe('matchLayer — Gerber X2 FileFunction', () => {
  it('đọc đúng mặt và loại lớp từ X2', () => {
    expect(matchLayer('a.GBR', [], x2('Copper,L1,Top'))).toMatchObject({ type: 'copper', side: 'top' })
    expect(matchLayer('a.GBR', [], x2('Copper,L2,Bot'))).toMatchObject({ type: 'copper', side: 'bottom' })
    expect(matchLayer('a.GBR', [], x2('Soldermask,Bot'))).toMatchObject({ type: 'soldermask', side: 'bottom' })
    expect(matchLayer('a.GBR', [], x2('Legend,Top'))).toMatchObject({ type: 'silkscreen', side: 'top' })
    expect(matchLayer('a.GBR', [], x2('Paste,Top'))).toMatchObject({ type: 'solderpaste', side: 'top' })
    expect(matchLayer('a.GBR', [], x2('Profile,NP'))).toMatchObject({ type: 'outline' })
  })

  it('lớp đồng giữa đánh số theo quy ước .G1 = Inner 1', () => {
    expect(matchLayer('a.GBR', [], x2('Copper,L2,Inr'))).toMatchObject({ type: 'copper', side: 'inner', displayName: 'Inner 1' })
    expect(matchLayer('a.GBR', [], x2('Copper,L3,Inr'))).toMatchObject({ displayName: 'Inner 2' })
  })

  it('"Drill … Plated.GBR" có X2 Plated là DỮ LIỆU khoan, không phải bản vẽ khoan', () => {
    // Không có X2 thì vẫn giữ luật cũ: .GBR mang chữ drill là bản vẽ khoan.
    expect(matchLayer(`${PREFIX}Drill TOP-BOT Plated.GBR`)).toMatchObject({ type: 'documentation' })
    expect(matchLayer(`${PREFIX}Drill TOP-BOT Plated.GBR`, [], drillPlated)).toMatchObject({ type: 'drill' })
  })

  it('"Mechanical 1.GBR" có X2 NonPlated là khoan NPTH, không phải viền bo', () => {
    expect(matchLayer(`${PREFIX}Mechanical 1.GBR`)).toMatchObject({ type: 'outline' })
    expect(matchLayer(`${PREFIX}Mechanical 1.GBR`, [], mechanicalEmpty)).toMatchObject({ type: 'drill' })
  })

  it('X2 Drillmap vẫn là bản vẽ khoan', () => {
    expect(matchLayer('x Drill.GBR', [], x2('Drillmap'))).toMatchObject({ type: 'documentation', displayName: 'Drill Drawing' })
  })

  it('X2 "Other" KHÔNG quyết định — .GM1 của Altium vẫn là viền bo', () => {
    // Altium ghi lớp cơ khí là Other,…; gán cứng thành tài liệu thì ẩn mất viền bo.
    expect(matchLayer('board.GM1', [], x2('Other,Mechanical_1'))).toMatchObject({ type: 'outline' })
    expect(matchLayer('x Top Assembly.GBR', [], x2('AssemblyDrawing,Top'))).toMatchObject({ type: 'documentation' })
  })

  it('X2 Copper thiếu mặt ("Copper,Signal") thì không đoán là lớp giữa', () => {
    expect(matchLayer('x_Copper_Signal_Top.gbr', [], x2('Copper,Signal'))).toMatchObject({ type: 'copper', side: 'top' })
    expect(matchLayer('x_Copper_1_Signal_0.gbr', [], x2('Copper,Signal')).side).not.toBe('inner')
  })

  it('"Slot.GBR" của Proteus khai NonPlated nhưng chỉ vẽ Profile → là viền bo', () => {
    const slot = x2('NonPlated,1,2,NPTH', '%TA.AperFunction,Profile*%\n%ADD10C,0.2*%\nD10*\nX0Y0D02*\nX1000000Y0D01*\n')
    expect(matchLayer('board - CADCAM Slot.GBR', [], slot)).toMatchObject({ type: 'outline' })
  })

  it('"Profile.GBR" của Proteus (Profile + CutOut) là viền bo dù khai NonPlated', () => {
    const profile = x2('NonPlated,1,2,NPTH', '%TA.AperFunction,Profile*%\n%ADD10C,0.2*%\n%TA.AperFunction,CutOut*%\n%ADD11C,0.2*%\nD10*\nX0Y0D02*\nX1000000Y0D01*\n')
    expect(matchLayer('board - CADCAM Profile.GBR', [], profile)).toMatchObject({ type: 'outline' })
  })

  it('X2 "Other" toàn Profile (Pulsonix/DesignSpark "(Board).gbr", dạng chú thích) là viền bo', () => {
    const board = [
      'G04 GENERATED BY PULSONIX 12.5 GERBER.DLL 9449*',
      '%FSLAX35Y35*%',
      '%MOIN*%',
      'G04 #@! TF.FileFunction,Other,Board*',
      'G04 #@! TA.AperFunction,Profile*',
      '%ADD17C,0.01181*%',
      'D17*',
      'X591Y591D02*',
      'Y115591D01*',
      'M02*',
    ].join('\n')
    expect(matchLayer('proj-board(Board).gbr', [], board)).toMatchObject({ type: 'outline' })
    // "Other" mà có nét không phải Profile thì vẫn không quyết định.
    expect(matchLayer('x(Documentation).gbr', [], board.replace('Profile', 'Material'))).not.toMatchObject({ type: 'outline' })
  })

  it('bản vẽ lắp ráp chỉ còn đường viền vẫn là tài liệu, không thành viền thứ hai', () => {
    const assy = x2('AssemblyDrawing,Bot', '%TA.AperFunction,Profile*%\n%ADD10C,0.2*%\nD10*\nX0Y0D02*\nX1000000Y0D01*\n')
    expect(matchLayer('board - CADCAM Bottom Assembly.GBR', [], assy)).toMatchObject({ type: 'documentation' })
    const pulsonixAssy = x2('AssemblyDrawing,Bot', '%TA.AperFunction,Profile*%\n%ADD10C,0.2*%\nD10*\nX0Y0D02*\nX1000000Y0D01*\n')
    expect(matchLayer('proj-board(Bot Assy).gbr', [], pulsonixAssy)).toMatchObject({ type: 'documentation' })
  })

  it('đọc được X2 dạng chú thích trong Excellon của KiCad', () => {
    const drl = 'M48\n; #@! TF.FileFunction,NonPlated,1,2,NPTH\nMETRIC\nT1C1.0\n%\nT1\nX1.0Y1.0\nM30'
    expect(matchLayer('board-NPTH.drl', [], drl)).toMatchObject({ type: 'drill' })
  })
})

describe('Viền bo lẫn trong lớp khác (Pulsonix "(Documentation).gbr")', () => {
  // Viền 0,1→2,1 in × 0,1→1,1 in vẽ bằng D17 (Profile); chữ ghi chú vẽ bằng D18
  // (Material) nằm tận X=9 in — nếu lấy cả lớp thì khung phình ra gấp bốn.
  const doc = [
    'G04 #@! TF.GenerationSoftware,Pulsonix,Pulsonix,12.5.9449*',
    '%FSLAX35Y35*%',
    '%MOIN*%',
    'G04 #@! TF.FileFunction,Other,Documentation*',
    'G04 #@! TA.AperFunction,Profile*',
    '%ADD17C,0.01000*%',
    'G04 #@! TA.AperFunction,Material*',
    '%ADD18C,0.02000*%',
    'G04 #@! TD.AperFunction*',
    'D17*',
    'X10000Y10000D02*',
    'X210000D01*',
    'Y110000D01*',
    'X10000D01*',
    'Y10000D01*',
    'D18*',
    'X900000Y50000D02*',
    'X950000D01*',
    // Toạ độ modal: câu này dùng lại Y=50000 của lệnh D18 trước — nét D17 sau đó phải
    // vẫn đúng chỗ dù nét D18 đã bị bỏ.
    'D17*',
    'X10000Y10000D02*',
    'M02*',
  ].join('\n')

  it('chỉ giữ nét Profile, nét khác đổi thành di chuyển để toạ độ modal không lệch', () => {
    const out = extractProfileGerber(doc)!
    expect(out).toContain('X210000D01*')
    expect(out).toContain('X950000D02*') // nét chữ bị bỏ, vị trí vẫn giữ
    expect(out).not.toMatch(/X950000D01/)
  })

  it('file không có aperture Profile thì trả null', () => {
    expect(extractProfileGerber(copperTop)).toBeNull()
  })

  it('bộ không có lớp viền thì lấy viền từ nét Profile, không ước lượng từ lớp đồng', async () => {
    const [b] = await GerberParser.parseInputFiles([
      asFile('Relay(Top).gbr', copperTop),
      asFile('Relay(Documentation).gbr', doc),
    ])
    const outline = b.layers.find((l) => l.type === 'outline')!
    expect(outline.filename).toBe('(viền bo từ Relay(Documentation).gbr)')
    expect(b.layers.some((l) => l.filename === ESTIMATED_OUTLINE_FILE)).toBe(false)
    expect(b.bounds.widthMM).toBeCloseTo(50.8, 1) // 2,0 in
    expect(b.bounds.heightMM).toBeCloseTo(25.4, 1) // 1,0 in
  })
})

describe('File dự án kèm theo không được đem parse', () => {
  it('fp-info-cache và file .kicad_* của KiCad là file phụ trợ', () => {
    expect(isAuxiliaryFile('fp-info-cache')).toBe(true)
    expect(isAuxiliaryFile('proj/fp-lib-table')).toBe(true)
    expect(isAuxiliaryFile('board.kicad_pcb')).toBe(true)
    expect(isAuxiliaryFile('board.kicad_sch')).toBe(true)
    expect(isAuxiliaryFile('board-F_Cu.gbr')).toBe(false)
  })

  it('file không nhận ra lớp mà nội dung không phải Gerber/Excellon thì bỏ qua, có liệt kê', async () => {
    const junk = '27219017742349286\nAudio_Module\nReverb_BTDR-1H\nDigital Reverberation Unit\n0\n2\n'
    const [b] = await GerberParser.parseInputFiles([
      asFile('b-F_Cu.gbr', copperTop),
      asFile('ghichu', junk),
    ])
    expect(b.layers.some((l) => l.filename === 'ghichu')).toBe(false)
    expect(b.ignoredFiles).toContain('ghichu')
  })

  it('Gerber OrCAD không header vẫn được giữ dù không nhận ra lớp', async () => {
    const orcadNoHeader = 'G54D10*\nX1000Y1000D02*\nX5000Y1000D01*\nM02*\n'
    const [b] = await GerberParser.parseInputFiles([
      asFile('b-F_Cu.gbr', copperTop),
      asFile('LAYER7.art', orcadNoHeader),
    ])
    expect(b.layers.some((l) => l.filename === 'LAYER7.art')).toBe(true)
  })
})

describe('Bộ Proteus CADCAM đọc trọn vẹn', () => {
  const parse = () =>
    GerberParser.parseInputFiles([
      asFile(`${PREFIX}Top Copper.GBR`, copperTop),
      asFile(`${PREFIX}Bottom Copper.GBR`, copperBot),
      asFile(`${PREFIX}Drill TOP-BOT Plated.GBR`, drillPlated),
      asFile(`${PREFIX}Mechanical 1.GBR`, mechanicalEmpty),
    ])

  it('đếm lỗ khoan Gerber theo lệnh flash D03', async () => {
    const [b] = await parse()
    const drill = b.layers.find((l) => l.filename.includes('Plated'))!
    expect(drill.type).toBe('drill')
    expect(drill.visible).toBe(true)
    expect(drill.holeCount).toBe(3)
  })

  it('file khoan rỗng không tính vào "File khoan"', async () => {
    const [b] = await parse()
    expect(b.drillCount).toBe(1)
  })

  it('không có viền thì dựng viền ước lượng từ khung lớp đồng', async () => {
    const [b] = await parse()
    const outlines = b.layers.filter((l) => l.type === 'outline')
    expect(outlines).toHaveLength(1)
    expect(outlines[0].filename).toBe(ESTIMATED_OUTLINE_FILE)
    expect(outlines[0].displayName).toMatch(/ước lượng/)
    // Viền phải có hình học thật, không thì viewer lại sập ở children[0].
    expect(outlines[0].imageTree?.children?.length ?? 0).toBeGreaterThan(0)
    expect(b.bounds.widthMM).toBeCloseTo(91.25, 1) // 0→91mm cộng nửa nét 0,254
    expect(b.bounds.heightMM).toBeCloseTo(57.25, 1)
  })

  it('ghi nhận file khoan chỉ chứa PTH hay NPTH, để viewer vẽ đủ cả hai', async () => {
    const npth = x2('NonPlated,1,2,NPTH', '%ADD41C,3.000000*%\nD41*\nX+500000Y+500000D03*\n')
    const [b] = await GerberParser.parseInputFiles([
      asFile(`${PREFIX}Top Copper.GBR`, copperTop),
      asFile(`${PREFIX}Drill TOP-BOT Plated.GBR`, drillPlated),
      asFile(`${PREFIX}Drill TOP-BOT NonPlated.GBR`, npth),
    ])
    const byName = (s: string) => b.layers.find((l) => l.filename.includes(s))!
    expect(byName('Plated.GBR').drillPlating).toBe('PTH')
    expect(byName('NonPlated.GBR').drillPlating).toBe('NPTH')
    expect(byName('NonPlated.GBR').holeCount).toBe(1)
    expect(b.drillCount).toBe(2)
  })

  it('có Excellon thì bản khoan Gerber trùng lặp (KiCad/Altium) bị hạ xuống tài liệu', async () => {
    const excellon = 'M48\n; #@! TF.FileFunction,Plated,1,2,PTH\nMETRIC\nT1C1.000\n%\nT1\nX2.5Y2.5\nX7.58Y2.5\nX37.42Y52.5\nM30'
    const [b] = await GerberParser.parseInputFiles([
      asFile('board-F_Cu.gbr', copperTop),
      asFile('board-PTH.drl', excellon),
      asFile('board-PTH-drl.gbr', drillPlated),
    ])
    const gbr = b.layers.find((l) => l.filename === 'board-PTH-drl.gbr')!
    expect(gbr.type).toBe('documentation')
    expect(gbr.visible).toBe(false)
    expect(b.layers.find((l) => l.filename === 'board-PTH.drl')!.type).toBe('drill')
    expect(b.drillCount).toBe(1) // không đếm đôi
  })

  it('có viền thật thì KHÔNG dựng viền ước lượng', async () => {
    const profile = x2('Profile,NP', '%ADD10C,0.100000*%\nD10*\nX+0Y+0D02*\nX+5000000Y+0D01*\nX+5000000Y+3000000D01*\nX+0Y+3000000D01*\nX+0Y+0D01*\n')
    const [b] = await GerberParser.parseInputFiles([
      asFile('b Top Copper.GBR', copperTop),
      asFile('b Edge.GBR', profile),
    ])
    expect(b.layers.some((l) => l.filename === ESTIMATED_OUTLINE_FILE)).toBe(false)
    expect(b.bounds.widthMM).toBeCloseTo(50, 1)
  })
})
