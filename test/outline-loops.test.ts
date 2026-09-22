/**
 * Phân biệt lỗ khoét với bo con trong lớp outline nhiều vòng.
 *
 * Bo LED "3W NHUA XANH" (CAM350, inch) có rãnh cắm LED chiếm 9.1% diện tích bo — quá
 * mốc 5% nên bị tô đặc như thân bo, trong khi nó là chỗ thủng. Dấu hiệu quyết định là
 * bên trong có đồng hay không: rãnh không có, bo con trong panel thì đầy.
 */
import { describe, it, expect } from 'vitest'
import { copperSamplePoints, countBoards, pointInPolygon, splitOutlineLoops } from '../src/lib/gerber-reader'

/** Vòng chữ nhật kín từ (x, y) kích thước w × h, mỗi cạnh một child một đoạn. */
const rect = (x: number, y: number, w: number, h: number) => {
  const c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  return {
    children: c.map((p, i) => ({ segments: [{ type: 'line', start: p, end: c[(i + 1) % 4] }] })),
  }
}

const copperAt = (pts: number[][]) => [
  { type: 'copper', imageTree: { units: 'mm', children: pts.map(([cx, cy]) => ({ type: 'imageShape', shape: { type: 'circle', cx, cy, r: 0.5 } })) } },
]

describe('splitOutlineLoops', () => {
  const board = rect(0, 0, 100, 60)

  it('vòng bé dưới 5% là lỗ, không cần xét đồng', () => {
    const hole = rect(10, 10, 3, 3)
    const r = splitOutlineLoops([board, hole])
    expect(r.body).toEqual([board])
    expect(r.cutouts).toEqual([hole])
  })

  it('vòng to hơn 5% nhưng bên trong không có đồng vẫn là lỗ', () => {
    const slot = rect(40, 20, 25, 25) // 10.4% bo
    const copper = copperSamplePoints(copperAt([[5, 5], [90, 50], [20, 55]]))
    const r = splitOutlineLoops([board, slot], { copperPoints: copper })
    expect(r.cutouts).toEqual([slot])
  })

  it('bo con trong panel có đồng bên trong thì là thân bo', () => {
    const sub = rect(40, 20, 25, 25)
    const copper = copperSamplePoints(copperAt([[45, 25], [50, 30], [55, 35], [60, 40]]))
    const r = splitOutlineLoops([board, sub], { copperPoints: copper })
    expect(r.body).toEqual([board, sub])
    expect(r.cutouts).toEqual([])
  })

  it('một đỉnh mảng phủ chạy sát mép lỗ không đủ để lỗ hoá thân', () => {
    const slot = rect(40, 20, 25, 25)
    const copper = copperSamplePoints(copperAt([[41, 21], [64, 44]])) // 2 điểm, dưới mức 3
    expect(splitOutlineLoops([board, slot], { copperPoints: copper }).cutouts).toEqual([slot])
  })

  it('mảng phủ đồng tràn qua lỗ không tính là "có mạch"', () => {
    const slot = rect(40, 20, 25, 25)
    const pour = [{ type: 'copper', imageTree: { units: 'mm', children: Array.from({ length: 30 }, (_, i) => ({
      type: 'imageRegion', segments: [{ type: 'line', start: [42 + (i % 5) * 4, 22 + Math.floor(i / 5) * 3], end: [43, 23] }] })) } }]
    expect(copperSamplePoints(pour)).toEqual([])
    expect(splitOutlineLoops([board, slot], { copperPoints: copperSamplePoints(pour) }).cutouts).toEqual([slot])
  })

  it('vòng to nằm NGOÀI vòng lớn nhất là bo khác, không phải lỗ', () => {
    const other = rect(120, 0, 30, 30) // rời hẳn khỏi bo
    const r = splitOutlineLoops([board, other], { copperPoints: [] })
    expect(r.body).toEqual([board, other])
  })

  it('file inch: đổi cả vòng lẫn điểm đồng về mm rồi mới so', () => {
    const inchBoard = rect(0, 0, 4, 2.4)
    const inchSlot = rect(1.6, 0.8, 1, 1)
    // Đồng nằm trong rãnh nhưng tính bằng mm (lớp đồng mm, viền inch)
    const copper = copperSamplePoints(copperAt([[45, 25], [50, 30], [55, 35]]))
    const r = splitOutlineLoops([inchBoard, inchSlot], { scale: 25.4, copperPoints: copper })
    expect(r.body).toEqual([inchBoard, inchSlot])
  })
})

describe('pointInPolygon', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]]
  it('trong / ngoài', () => {
    expect(pointInPolygon([5, 5], sq)).toBe(true)
    expect(pointInPolygon([15, 5], sq)).toBe(false)
    expect(pointInPolygon([-1, -1], sq)).toBe(false)
  })
})

describe('splitOutlineLoops — panel (Le Quoc Huy, 21/09/2026)', () => {
  const frame = rect(0, 0, 144, 212)

  it('rail nhỏ nằm NGOÀI khung là thân bo, không phải lỗ', () => {
    const rail = rect(0, -5, 144, 5) // 2.4% khung — dưới mốc 5% nhưng không nằm trong gì
    const r = splitOutlineLoops([frame, rail], { copperPoints: [] })
    expect(r.body).toEqual([frame, rail])
    expect(r.cutouts).toEqual([])
  })

  it('panel nhiều bo xếp ngang: lỗ nhỏ trong MỖI bo đều là lỗ, không chỉ trong bo lớn nhất', () => {
    const a = rect(0, 0, 60, 150), b = rect(60, 0, 60, 150)
    const holeInB = rect(80, 10, 3, 3)
    const r = splitOutlineLoops([a, b, holeInB], { copperPoints: [] })
    expect(r.body).toEqual([a, b])
    expect(r.cutouts).toEqual([holeInB])
  })

  it('nét hở nằm trong bo là đường phay: chỉ vẽ nét, không tô, không khoét', () => {
    const zigzag = {
      children: [[10, 10], [20, 10], [20, 30], [30, 30]].slice(0, 3).map((p, i, arr) => ({
        segments: [{ type: 'line', start: p, end: [[20, 10], [20, 30], [30, 30]][i] }],
      })),
    }
    const r = splitOutlineLoops([frame, zigzag], { copperPoints: [] })
    expect(r.body).toEqual([frame])
    expect(r.cutouts).toEqual([])
    expect(r.lines).toEqual([zigzag])
  })
})

describe('countBoards — file ghép sẵn nhiều bo', () => {
  const layersOf = (parts: any[]) => [{ type: 'outline', imageTree: { units: 'mm', parts } }]

  it('đếm bo, bỏ rail và điền số cột × hàng', () => {
    // 3 bo 60×150 xếp ngang + 2 rail 5 mm hai bên (kiểu "Ceiling Master")
    const parts = [rect(0, 0, 60, 150), rect(60, 0, 60, 150), rect(120, 0, 60, 150), rect(-5, 0, 5, 150), rect(180, 0, 5, 150)]
    expect(countBoards(layersOf(parts))).toEqual({ count: 3, cols: 3, rows: 1 })
  })

  it('lưới 2 × 4', () => {
    const parts: any[] = []
    for (let c = 0; c < 2; c++) for (let r = 0; r < 4; r++) parts.push(rect(c * 40, r * 20, 40, 20))
    expect(countBoards(layersOf(parts))).toEqual({ count: 8, cols: 2, rows: 4 })
  })

  it('bo lẻ có lỗ khoét vẫn là 1 bo', () => {
    expect(countBoards(layersOf([rect(0, 0, 100, 60), rect(10, 10, 3, 3)]))?.count).toBe(1)
  })

  it('khung panel ôm các bo không bị đếm là bo', () => {
    const frame = rect(0, 0, 100, 60)
    const parts = [frame, rect(10, 10, 35, 40), rect(55, 10, 35, 40)]
    // Bo con thật có pad bên trong — không có đồng thì luật chia vòng coi là lỗ khoét.
    const pads = copperAt([[15, 15], [20, 20], [25, 25], [60, 15], [65, 20], [70, 25]])
    expect(countBoards([...layersOf(parts), ...pads])?.count).toBe(2)
  })
})
