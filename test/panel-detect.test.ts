/**
 * Nhận biết file đã ghép (detectPanel) và mũi khoan nhỏ nhất (minDrill).
 *
 * Dựng thẳng lớp đã plot (imageTree) cho gọn: một "bo" mẫu gồm pad đồng, nét lụa, lỗ khoan;
 * ghép = lặp nguyên mẫu đó; bo lẻ có kênh lặp = pad lặp nhưng chữ in lụa mỗi kênh khác nhau.
 */
import { describe, it, expect } from 'vitest'
import { detectPanel, minDrill } from '../src/lib/gerber-reader'

const circle = (cx: number, cy: number, r = 0.3) => ({ type: 'imageShape', shape: { type: 'circle', cx, cy, r } })
const stroke = (x: number, y: number) => ({ type: 'imagePath', width: 0.15, segments: [{ type: 'line', start: [x, y], end: [x + 1, y] }] })
const layer = (type: string, children: any[], filename = type) => ({ type, filename, holeCount: type === 'drill' ? children.length : 0, imageTree: { units: 'mm', children } })

/** Một bo 30 × 20 mm tại (ox, oy): 30 pad, 30 nét lụa (dời theo `silkShift` để làm "tên linh kiện" khác), 10 lỗ. */
const board = (ox: number, oy: number, silkShift = 0) => {
  const pads: any[] = [], silk: any[] = [], holes: any[] = []
  for (let i = 0; i < 30; i++) pads.push(circle(ox + 2 + (i % 6) * 4.3, oy + 2 + Math.floor(i / 6) * 3.7 + (i % 3) * 0.41, 0.4))
  for (let i = 0; i < 30; i++) silk.push(stroke(ox + 1.7 + ((i * 7) % 26) + silkShift, oy + 1.3 + ((i * 5) % 17) + silkShift * 0.37))
  for (let i = 0; i < 10; i++) holes.push(circle(ox + 3 + i * 2.6, oy + 10 + (i % 2) * 1.9, i === 0 ? 0.15 : 0.4))
  return { pads, silk, holes }
}

const set = (boards: ReturnType<typeof board>[]) => [
  layer('copper', boards.flatMap((b) => b.pads)),
  layer('silkscreen', boards.flatMap((b) => b.silk)),
  layer('drill', boards.flatMap((b) => b.holes), 'x.drl'),
]

describe('detectPanel — bo lặp lại (panel chỉ ngăn bằng rãnh / V-cut)', () => {
  it('lụa + đồng lặp nguyên 3 × 2 → có ghép, 6 bo', () => {
    const boards = []
    for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) boards.push(board(c * 32, r * 22))
    const p = detectPanel(set(boards) as any, { bounds: { widthMM: 94, heightMM: 42 } })
    expect(p.verdict).toBe('yes')
    expect(p.method).toBe('repeat')
    expect([p.cols, p.rows, p.count]).toEqual([3, 2, 6])
  })

  it('kênh giống nhau trong một bo (pad lặp, chữ in lụa mỗi kênh khác) → không phải ghép', () => {
    const boards = [0, 1, 2].map((c) => board(c * 32, 0, c * 1.3))
    const p = detectPanel(set(boards) as any, { bounds: { widthMM: 94, heightMM: 20 } })
    expect(p.verdict).toBe('no')
  })

  it('tên file có "ghep" mà không thấy lặp → chỉ "có thể"', () => {
    const p = detectPanel(set([board(0, 0)]) as any, { names: ['Khach Ghep 2x2.zip'], bounds: { widthMM: 30, heightMM: 20 } })
    expect(p.verdict).toBe('maybe')
    expect(p.method).toBe('name')
  })
})

describe('minDrill', () => {
  it('lỗ tròn nhỏ nhất và rãnh hẹp nhất (bề rộng = 2 × bán kính cung đầu rãnh)', () => {
    const slot = {
      type: 'imageRegion',
      segments: [
        { type: 'line', start: [0, 0], end: [0, 2] },
        { type: 'arc', start: [0, 2, 0], end: [0.8, 2, Math.PI], center: [0.4, 2], radius: 0.4 },
      ],
    }
    const m = minDrill([layer('drill', [circle(0, 0, 0.15), circle(1, 1, 0.15), circle(2, 2, 0.5), slot])] as any)
    expect(m.hole).toEqual({ d: 0.3, count: 2 })
    expect(m.slot).toBe(0.8)
  })
})
