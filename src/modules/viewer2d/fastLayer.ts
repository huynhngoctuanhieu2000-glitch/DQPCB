/**
 * [DQPCB] Dựng NHANH một lớp rất nhiều hình.
 *
 * `renderThree` của web-gerber dựng mỗi hình thành một khối riêng: lớp in lụa của bo FRIWO
 * "P84390-S02" (23/09/2026) có 85.570 vùng tô ở mặt dưới mà ra **102,5 triệu đỉnh**, mặt trên
 * 150.220 vùng ra **180 triệu đỉnh** trong 30–42 giây; trình duyệt hết bộ nhớ, tab tự tải lại.
 *
 * Ở đây tự ráp MỘT lưới tam giác cho cả lớp. Cùng lớp mặt dưới đó ra **758.766 đỉnh**.
 *
 * Hai chỗ phải làm cho đúng, không được làm tắt (23/09 làm tắt thì chữ in lụa bết thành cục):
 *  - **Bẻ cung ra đoạn thẳng.** `plot()` biến MỌI nét vẽ thành vùng tô viền quanh nét, hai đầu
 *    nét là cung tròn. Chỉ lấy điểm đầu của cung thì nét mất hai đầu bo tròn.
 *  - **Tô bằng cắt tai (ear clipping), không chia quạt.** Cả một nét gấp khúc (nguyên chữ
 *    "R441" vẽ liền tay) là MỘT vùng tô lõm sâu; chia quạt từ đỉnh đầu sẽ tô đầy cả ruột chữ.
 *    Hình lồi (84.612/85.570 vùng của lớp này là nét thẳng, viền quanh luôn lồi) vẫn chia
 *    quạt vì rẻ hơn.
 *
 * Đánh đổi còn lại (chấp nhận được với lớp nặng, thường là in lụa):
 *  - bỏ qua hình đảo cực (polarity 'clear');
 *  - hình phẳng, không có bề dày như lớp thường.
 *
 * Lấy lớp three của web-gerber từ chính đối tượng nó trả về: thư viện bundle three riêng, app
 * không import trực tiếp được (xem src/lib/webgerber.ts). Còn `ShapeUtils` thì lấy từ three
 * của app được, vì nó chỉ tính toán trên mảng số — không đẻ ra Object3D nào.
 */
import { ShapeUtils, Vector2 } from 'three'
import { renderThree, type GerberObject3D } from '../../lib/webgerber'

/** Số cạnh xấp xỉ một hình tròn của pad. */
const CIRCLE_SIDES = 12
/** Sai số cung-dây tối đa khi bẻ cung thành đoạn thẳng (mm) — như gerber-reader. */
const ARC_TOLERANCE_MM = 0.02

type ThreeClasses = {
  BufferGeometry: new () => any
  Attribute: new (array: Float32Array, itemSize: number) => any
  Mesh: new (geometry: any, material: any) => any
  Group: new () => any
  Material: new (opts: { color: number }) => any
}
let classes: ThreeClasses | null = null

/** Mượn lớp three của web-gerber bằng cách dựng một tam giác rồi soi đối tượng trả về. */
const threeClasses = (): ThreeClasses | null => {
  if (classes) return classes
  const sample = {
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
  const root: any = renderThree(sample as any, 0xffffff, undefined, false)
  root?.traverse?.((o: any) => {
    if (!proto && o.geometry?.getAttribute?.('position')) proto = o
  })
  if (!proto || !root) return null
  classes = {
    BufferGeometry: proto.geometry.constructor,
    Attribute: proto.geometry.getAttribute('position').constructor,
    Mesh: proto.constructor,
    Material: proto.material.constructor,
    Group: root.constructor,
  }
  return classes
}

/** Thêm tam giác (a, b, c) vào mảng toạ độ. */
const tri = (out: number[], a: number[], b: number[], c: number[]) => {
  out.push(a[0], a[1], 0, b[0], b[1], 0, c[0], c[1], 0)
}

/** Tô một đa giác LỒI bằng cách chia quạt từ đỉnh đầu. */
const fan = (out: number[], pts: number[][]) => {
  for (let i = 1; i + 1 < pts.length; i++) tri(out, pts[0], pts[i], pts[i + 1])
}

/** Đa giác có lõm không — quyết định tô bằng chia quạt hay cắt tai. */
const isConvex = (pts: number[][]) => {
  let sign = 0
  const n = pts.length
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n]
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (Math.abs(cross) < 1e-12) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** Tô một đa giác bất kỳ. Lõm thì cắt tai, lồi thì chia quạt cho rẻ. */
const fill = (out: number[], pts: number[][]) => {
  if (pts.length < 3) return
  if (pts.length === 3 || isConvex(pts)) {
    fan(out, pts)
    return
  }
  const faces = ShapeUtils.triangulateShape(pts.map(([x, y]) => new Vector2(x, y)), [])
  for (const f of faces) tri(out, pts[f[0]], pts[f[1]], pts[f[2]])
}

/**
 * Điểm của một đoạn: đoạn thẳng thì một điểm đầu, cung thì rải đều theo sai số cho phép.
 * Điểm cuối để đoạn kế tiếp lo (vùng tô là vòng kín).
 */
const pushSegment = (pts: number[][], seg: any, tol: number) => {
  const start = seg?.start
  if (!start) return
  pts.push([start[0], start[1]])
  if (seg.type !== 'arc') return
  const r = seg.radius
  const cx = seg.center?.[0]
  const cy = seg.center?.[1]
  const a0 = start[2]
  const a1 = seg.end?.[2]
  if (!(r > 0) || !Number.isFinite(cx) || !Number.isFinite(a0) || !Number.isFinite(a1)) return
  let sweep = a1 - a0
  // Cung khép kín (điểm đầu trùng điểm cuối) quét 0 độ — hiểu là cả vòng tròn.
  if (Math.abs(sweep) < 1e-9) sweep = Math.PI * 2
  const maxStep = r > tol ? 2 * Math.acos(1 - tol / r) : Math.PI
  const n = Math.max(1, Math.min(64, Math.ceil(Math.abs(sweep) / maxStep)))
  for (let i = 1; i < n; i++) {
    const a = a0 + (sweep * i) / n
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
  }
}

/** Vòng kín của một vùng tô / nét vẽ. */
const contourOf = (segs: any[], tol: number) => {
  const pts: number[][] = []
  for (const s of segs) pushSegment(pts, s, tol)
  return pts
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
  const tol = ARC_TOLERANCE_MM / (tree.units === 'in' ? 25.4 : 1)
  const pos: number[] = []
  for (const child of tree.children) {
    if (child?.polarity === 'clear') continue
    const segs = child.segments ?? []
    if (child.type === 'imageRegion') {
      if (segs.length >= 3) fill(pos, contourOf(segs, tol))
    } else if (child.type === 'imagePath') {
      // Nét vẽ còn nguyên (lớp viền chẳng hạn): mỗi đoạn một chữ nhật theo bề rộng nét.
      const w = child.width > 0 ? child.width / 2 : 0
      if (!(w > 0)) continue
      const pts = contourOf(segs, tol)
      const last = segs[segs.length - 1]?.end
      if (last) pts.push([last[0], last[1]])
      for (let i = 0; i + 1 < pts.length; i++) {
        const dx = pts[i + 1][0] - pts[i][0]
        const dy = pts[i + 1][1] - pts[i][1]
        const len = Math.hypot(dx, dy)
        if (!(len > 0)) continue
        const nx = (-dy / len) * w
        const ny = (dx / len) * w
        fan(pos, [
          [pts[i][0] + nx, pts[i][1] + ny],
          [pts[i + 1][0] + nx, pts[i + 1][1] + ny],
          [pts[i + 1][0] - nx, pts[i + 1][1] - ny],
          [pts[i][0] - nx, pts[i][1] - ny],
        ])
      }
    } else if (child.type === 'imageShape') {
      for (const pts of shapePoints(child.shape)) fill(pos, pts)
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
  // PHẢI bọc trong Group, không trả Mesh trần: three xếp thứ tự vẽ theo groupOrder (lấy từ
  // renderOrder của Group cha) TRƯỚC rồi mới tới renderOrder của từng mesh. Mesh nằm thẳng
  // trong Scene có groupOrder 0 nên luôn bị vẽ trước — ở Real/3D thì lớp mask và đồng phủ
  // đè lên, in lụa coi như biến mất (23/09). renderThree cũng trả về Group.
  const group = new cls.Group()
  group.add(new cls.Mesh(geometry, new cls.Material({ color })))
  return group as GerberObject3D
}
