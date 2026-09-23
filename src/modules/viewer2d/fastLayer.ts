/**
 * [DQPCB] Dựng NHANH một lớp rất nhiều hình.
 *
 * `renderThree` của web-gerber dựng mỗi hình thành một khối riêng rồi gộp lại: lớp in lụa
 * của bo FRIWO "P84390-S02" (23/09/2026) có 150.220 vùng tô — toàn hình chữ nhật 4 đỉnh cỡ
 * 0.26 × 0.004 mm — mà ra **180 triệu đỉnh** (≈1200 đỉnh cho mỗi chữ nhật) và mất 30–42 giây;
 * trình duyệt hết bộ nhớ, tab tự tải lại.
 *
 * Ở đây tự ráp MỘT lưới tam giác cho cả lớp: mỗi vùng tô chia quạt từ đỉnh đầu, mỗi nét vẽ
 * thành một chữ nhật theo bề rộng nét, mỗi pad thành đa giác đơn. Cùng lớp đó ra **1.33 triệu
 * đỉnh trong 72 ms**.
 *
 * Đánh đổi (chấp nhận được với lớp nặng, thường là in lụa):
 *  - nét không bo tròn hai đầu, góc nối vuông;
 *  - vùng lõm tô theo kiểu chia quạt nên có thể hơi khác ở hình lõm sâu;
 *  - bỏ qua hình đảo cực (polarity 'clear');
 *  - hình phẳng, không có bề dày như lớp thường.
 *
 * Lấy lớp three từ chính đối tượng web-gerber trả về: thư viện bundle three riêng, app không
 * import trực tiếp được (xem src/lib/webgerber.ts).
 */
import { renderThree, type GerberObject3D } from '../../lib/webgerber'

/** Số cạnh xấp xỉ một hình tròn. */
const CIRCLE_SIDES = 12

type ThreeClasses = {
  BufferGeometry: new () => any
  Attribute: new (array: Float32Array, itemSize: number) => any
  Mesh: new (geometry: any, material: any) => any
  Material: new (opts: { color: number }) => any
}
let classes: ThreeClasses | null = null

/** Mượn lớp three của web-gerber bằng cách dựng một tam giác rồi soi đối tượng trả về. */
const threeClasses = (): ThreeClasses | null => {
  if (classes) return classes
  const tri = {
    units: 'mm',
    children: [
      {
        type: 'imageRegion',
        polarity: 'dark',
        segments: [
          { type: 'line', start: [0, 0], end: [1, 0] },
          { type: 'line', start: [1, 0], end: [0, 1] },
          { type: 'line', start: [0, 1], end: [0, 0] },
        ],
      },
    ],
  }
  let proto: any = null
  renderThree(tri as any, 0xffffff, undefined, false)?.traverse?.((o: any) => {
    if (!proto && o.geometry?.getAttribute?.('position')) proto = o
  })
  if (!proto) return null
  classes = {
    BufferGeometry: proto.geometry.constructor,
    Attribute: proto.geometry.getAttribute('position').constructor,
    Mesh: proto.constructor,
    Material: proto.material.constructor,
  }
  return classes
}

/** Thêm tam giác (a, b, c) vào mảng toạ độ. */
const tri = (out: number[], a: number[], b: number[], c: number[]) => {
  out.push(a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0)
}

/** Tô một đa giác bằng cách chia quạt từ đỉnh đầu. */
const fan = (out: number[], pts: number[][]) => {
  for (let i = 1; i + 1 < pts.length; i++) tri(out, pts[0], pts[i], pts[i + 1])
}

/** Các đỉnh của một hình flash (pad). */
const shapePoints = (sh: any): number[][][] => {
  if (!sh) return []
  if (sh.type === 'circle') {
    const pts: number[][] = []
    for (let i = 0; i < CIRCLE_SIDES; i++) {
      const a = (i / CIRCLE_SIDES) * Math.PI * 2
      pts.push([sh.cx + sh.r * Math.cos(a), sh.cy + sh.r * Math.sin(a)])
    }
    return [pts]
  }
  if (sh.type === 'rectangle') {
    return [[[sh.x, sh.y], [sh.x + sh.xSize, sh.y], [sh.x + sh.xSize, sh.y + sh.ySize], [sh.x, sh.y + sh.ySize]]]
  }
  if (sh.type === 'polygon') return [sh.points]
  if (sh.type === 'outline') return [sh.segments.map((g: any) => g.start)]
  if (sh.type === 'layeredShape') return sh.shapes.filter((x: any) => !x.erase).flatMap(shapePoints)
  return []
}

/**
 * Dựng cả lớp thành một lưới tam giác. Trả null khi không mượn được lớp three hoặc lớp rỗng.
 */
export const buildFastLayer = (tree: any, color: number): GerberObject3D | null => {
  const cls = threeClasses()
  if (!cls || !Array.isArray(tree?.children)) return null
  const pos: number[] = []
  for (const child of tree.children) {
    if (child?.polarity === 'clear') continue
    const segs = child.segments ?? []
    if (child.type === 'imageRegion') {
      if (segs.length >= 3) fan(pos, segs.map((s: any) => s.start))
    } else if (child.type === 'imagePath') {
      const w = child.width > 0 ? child.width / 2 : 0
      for (const s of segs) {
        if (s?.type !== 'line') continue
        const dx = s.end[0] - s.start[0]
        const dy = s.end[1] - s.start[1]
        const len = Math.hypot(dx, dy)
        if (!(len > 0) || !(w > 0)) continue
        const nx = (-dy / len) * w
        const ny = (dx / len) * w
        const p = [
          [s.start[0] + nx, s.start[1] + ny],
          [s.end[0] + nx, s.end[1] + ny],
          [s.end[0] - nx, s.end[1] - ny],
          [s.start[0] - nx, s.start[1] - ny],
        ]
        fan(pos, p)
      }
    } else if (child.type === 'imageShape') {
      for (const pts of shapePoints(child.shape)) if (pts.length >= 3) fan(pos, pts)
    }
  }
  if (pos.length === 0) return null
  const geometry = new cls.BufferGeometry()
  geometry.setAttribute('position', new cls.Attribute(new Float32Array(pos), 3))
  // Không có pháp tuyến thì vật liệu có tính sáng tô ra màu tối thui — hình phẳng nên mọi
  // mặt đều ngửa lên (0, 0, 1).
  const nrm = new Float32Array(pos.length)
  for (let i = 2; i < nrm.length; i += 3) nrm[i] = 1
  geometry.setAttribute('normal', new cls.Attribute(nrm, 3))
  return new cls.Mesh(geometry, new cls.Material({ color })) as GerberObject3D
}
