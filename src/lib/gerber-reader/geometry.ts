/**
 * Xử lý hình học sau khi web-gerber đã plot: bẻ cung, nới vùng tô, nối viền bo.
 *
 * [DQPCB] Toàn bộ file này là của DQPCB. Nó chạy SAU `plot()` của web-gerber và sửa
 * những chỗ thư viện đó dựng sai (cung bị bóp thẳng, viền rời rạc, khe giữa các dải
 * phủ đồng của CAM350).
 */

/**
 * Sai số lớn nhất cho phép giữa cung thật và chuỗi đoạn thẳng thay thế nó (mm).
 * 0.02mm nhỏ hơn nét in mảnh nhất nên mắt không thấy được chỗ gãy.
 */
const ARC_TOLERANCE_MM = 0.02

/** Bẻ một cung thành chuỗi đoạn thẳng đủ mịn. `tol` tính theo đơn vị của file. */
const arcToLines = (seg: any, tol: number): any[] => {
  const r = seg?.radius
  const cx = seg?.center?.[0]
  const cy = seg?.center?.[1]
  const a0 = seg?.start?.[2]
  const a1 = seg?.end?.[2]
  if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(cx) || !Number.isFinite(a0) || !Number.isFinite(a1)) {
    return [seg]
  }

  // Cung khép kín (Gerber đa cung tư: điểm đầu trùng điểm cuối) có góc quét bằng 0.
  // Giữ nguyên thì nó thành một điểm, mất hẳn — hiểu là cả vòng tròn.
  let sweep = a1 - a0
  if (Math.abs(sweep) < 1e-9) sweep = Math.PI * 2

  // Bước góc lớn nhất giữ sai số cung-dây dưới tol: r(1 - cos(θ/2)) <= tol
  const maxStep = r > tol ? 2 * Math.acos(1 - tol / r) : Math.PI
  const n = Math.max(1, Math.min(64, Math.ceil(Math.abs(sweep) / maxStep)))
  if (n < 2) return [seg]

  const at = (i: number) => {
    if (i === 0) return [seg.start[0], seg.start[1]]
    if (i === n) return [seg.end[0], seg.end[1]]
    const a = a0 + (sweep * i) / n
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  const out: any[] = []
  for (let i = 0; i < n; i++) out.push({ type: 'line', start: at(i), end: at(i + 1) })
  return out
}

/**
 * Nới mỗi vùng tô đặc (imageRegion) ra ngoài một quãng nhỏ.
 *
 * CAM350 (và vài bộ xuất khác) không ghi phủ đồng hay pad thành một đa giác mà thành
 * hàng nghìn DẢI kề nhau — bo "3W NHUA XANH": TOP.gbr 3412 vùng, SMT.gbr 2063 vùng, cao
 * trung vị 0.2 mm. Giữa các dải hở 0.005-0.06 mm, cả lớp đồng lẫn lớp mask hở đúng cùng
 * chỗ. Zoom vào là thấy lớp dưới lộ qua khe thành nét mảnh chạy ngang dọc khắp pad và
 * mảng đồng, rất dễ đọc nhầm thành đường mạch. Đã thử: không phải cao độ lớp (giãn ×10
 * không đổi), không phải vát cạnh (hình chỉ có hai mức z).
 *
 * Nới mỗi dải ra REGION_DILATE_MM là các dải phủ lên nhau, khe biến mất; mép ngoài của
 * mảng đồng rộng thêm 0.035 mm — dưới một pixel ở mọi mức zoom thường dùng. Chỉ nới
 * vùng vẽ đậm; vùng khoét (đảo cực) để nguyên vì nới nó là ăn vào hình bên cạnh.
 */
const REGION_DILATE_MM = 0.035

/** Đỉnh của một vùng, cung đã bẻ thành đoạn thẳng. */
const regionPoints = (region: any, tol: number): number[][] => {
  const pts: number[][] = []
  for (const seg of region.segments ?? []) {
    const pieces = seg?.type === 'arc' ? arcToLines(seg, tol) : [seg]
    for (const p of pieces) if (p?.start) pts.push([p.start[0], p.start[1]])
  }
  // Bỏ đỉnh trùng điểm trước nó (đoạn dài 0 làm pháp tuyến thành NaN).
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-9)
}

/** Đa giác nới ra `d` (âm là co vào) theo pháp tuyến tại mỗi đỉnh, góc nhọn cắt miter. */
const offsetPolygon = (pts: number[][], d: number): number[][] => {
  const n = pts.length
  if (n < 3) return pts
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    area += a[0] * b[1] - b[0] * a[1]
  }
  const sign = area >= 0 ? 1 : -1 // CCW: pháp tuyến ngoài là (dy, -dx)
  const normal = (i: number) => {
    const a = pts[i], b = pts[(i + 1) % n]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    return [(sign * dy) / len, (-sign * dx) / len]
  }
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    const n0 = normal((i - 1 + n) % n), n1 = normal(i)
    const mx = n0[0] + n1[0], my = n0[1] + n1[1]
    const dot = 1 + (n0[0] * n1[0] + n0[1] * n1[1])
    // Góc quá nhọn thì miter vọt xa; lấy bevel (trung bình pháp tuyến) cho an toàn.
    const k = dot > 0.3 ? d / dot : d / Math.max(Math.hypot(mx, my), 1e-9)
    out.push([pts[i][0] + mx * k, pts[i][1] + my * k])
  }
  return out
}

export const dilateRegions = (tree: any): any => {
  const children = tree?.children
  if (!Array.isArray(children)) return tree
  const scale = tree.units === 'in' ? 1 / 25.4 : 1
  const d = REGION_DILATE_MM * scale
  const tol = ARC_TOLERANCE_MM * scale
  let touched = false
  const out = children.map((child) => {
    if (child?.type !== 'imageRegion' || child.polarity === 'clear' || !Array.isArray(child.segments)) return child
    const pts = offsetPolygon(regionPoints(child, tol), d)
    if (pts.length < 3) return child
    touched = true
    const segments = pts.map((p, i) => ({ type: 'line', start: p, end: pts[(i + 1) % pts.length] }))
    return { ...child, segments }
  })
  return touched ? { ...tree, children: out } : tree
}

/**
 * Bẻ mọi cung trong các nét vẽ (imagePath) thành đoạn thẳng.
 *
 * web-gerber dựng nét vẽ bằng ExtrudeGeometry với `extrudePath` và `steps: 1`. Một
 * bước dọc theo đường dẫn nghĩa là nó chỉ lấy điểm đầu và điểm cuối, nên xương sống
 * cong bị bóp thẳng: cung bo góc 90° ra thành vát 45°, còn lỗ tròn ghép từ bốn cung
 * ra thành hình thoi. Vùng tô (imageRegion) thì nó dựng bằng `absarc` nên đúng sẵn,
 * không đụng tới.
 *
 * Mỗi đoạn tách thành một child riêng vì bộ dựng outline của thư viện từ chối child
 * có nhiều hơn một segment ("Invalid outline segments length") — nhét cả chuỗi vào
 * một child là mất luôn lõi bo.
 */
export const flattenArcs = (tree: any): any => {
  const children = tree?.children
  if (!Array.isArray(children)) return tree
  const tol = ARC_TOLERANCE_MM / (tree.units === 'in' ? 25.4 : 1)

  let touched = false
  const out: any[] = []
  for (const child of children) {
    const segs = child?.segments
    if (child?.type !== 'imagePath' || !Array.isArray(segs) || !segs.some((s: any) => s?.type === 'arc')) {
      out.push(child)
      continue
    }
    touched = true
    for (const seg of segs) {
      const pieces = seg?.type === 'arc' ? arcToLines(seg, tol) : [seg]
      for (const piece of pieces) out.push({ ...child, segments: [piece] })
    }
  }
  if (!touched) return tree

  const flat: any = { ...tree, children: out }
  if (Array.isArray(tree.parts)) flat.parts = tree.parts.map(flattenArcs)
  return flat
}

/**
 * KiCad xuất Edge_Cuts thành nhiều đoạn/cung RỜI RẠC và không theo thứ tự liền mạch
 * (các lệnh D02 nhảy vị trí). plot(tree, true) trả về mỗi đoạn là một imagePath riêng,
 * nên khi tô đặc nền bo sẽ sinh cạnh giả -> thủng mảng lớn hình "ngọn lửa".
 * Nối các đoạn theo endpoint (đảo chiều khi cần) thành vòng kín trước khi render.
 */
export const stitchOutline = (tree: any) => {
  const segs: any[] = []
  for (const c of tree?.children ?? []) if (c?.segments?.length) segs.push(...c.segments)
  // Không bỏ qua ở mốc 2 đoạn: cả viền bo TRÒN có khi chỉ là MỘT cung 360° (CAM350),
  // bỏ qua thì lớp không có `parts` và bên ngoài dựng nhầm thành một khối tự cắt.
  if (segs.length === 0) return tree

  // 0.05 mm — KiCad để hở vài µm giữa cung và đoạn thẳng. Toạ độ giữ nguyên đơn vị
  // của file, nên file inch phải đổi mốc theo: giữ nguyên 0.05 với inch là 1.27 mm,
  // lỏng gấp 25 lần — bo CAM350 "3W NHUA XANH" bị nối chéo qua chỗ đứt tới 1.17 mm,
  // ra đa giác zíc zắc và lõi bo tô thành hình nêm.
  const TOL = tree.units === 'in' ? 0.05 / 25.4 : 0.05
  const nearAt = (a: number[], b: number[], tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol
  const near = (a: number[], b: number[]) => nearAt(a, b, TOL)
  const reverse = (s: any) => ({ ...s, start: s.end, end: s.start })

  // CAM350 có khi ghi cả viền BỐN lần y hệt nhau (cùng một bo trên: 4 bản viền + 4 bản
  // lỗ khoét). Để nguyên thì mỗi bản thành một vòng, dựng chồng bốn lớp lõi. Bỏ đoạn
  // trùng (cùng hai đầu mút, kể cả đảo chiều) trước khi nối.
  //
  // Cung KHÔNG được so bằng hai đầu mút: hai nửa của một lỗ tròn có cùng hai đầu mút
  // (đảo chiều nhau) mà là hai cung khác hẳn — so vậy thì lỗ tròn mất một nửa. Cung so
  // theo tâm, bán kính và góc GIỮA cung; hai nửa vòng có góc giữa lệch nhau 180°.
  const midAngle = (s: any) => {
    const a0 = s.start?.[2] ?? 0
    const a1 = s.end?.[2] ?? 0
    const m = (a0 + a1) / 2
    return ((m % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  }
  const sameSeg = (a: any, b: any) => {
    if ((a.type === 'arc') !== (b.type === 'arc')) return false
    if (a.type === 'arc') {
      return (
        !!a.center && !!b.center &&
        near(a.center, b.center) &&
        Math.abs((a.radius ?? 0) - (b.radius ?? 0)) <= TOL &&
        Math.abs(midAngle(a) - midAngle(b)) < 1e-6
      )
    }
    return (near(a.start, b.start) && near(a.end, b.end)) || (near(a.start, b.end) && near(a.end, b.start))
  }
  const unique: any[] = []
  for (const s of segs) if (!unique.some((u) => sameSeg(u, s))) unique.push(s)

  const isClosedLoop = (ch: any[], tol: number) => nearAt(ch[0].start, ch[ch.length - 1].end, tol)

  /**
   * Nối đoạn thành chuỗi theo đầu mút, mọc ở CẢ HAI đầu. Chỉ mọc ở đuôi thì chuỗi bắt
   * đầu từ giữa một vòng hở sẽ đi được một hướng rồi dừng, nửa kia thành chuỗi riêng.
   */
  const chainUp = (pool: any[], tol: number): any[][] => {
    const remaining = pool.slice()
    const out: any[][] = []
    while (remaining.length > 0) {
      const chain = [remaining.shift()]
      let grew = true
      while (grew && remaining.length > 0) {
        grew = false
        const tail = chain[chain.length - 1].end
        const head = chain[0].start
        for (let i = 0; i < remaining.length; i++) {
          const s = remaining[i]
          if (nearAt(s.start, tail, tol)) chain.push(remaining.splice(i, 1)[0])
          else if (nearAt(s.end, tail, tol)) chain.push(reverse(remaining.splice(i, 1)[0]))
          else if (nearAt(s.end, head, tol)) chain.unshift(remaining.splice(i, 1)[0])
          else if (nearAt(s.start, head, tol)) chain.unshift(reverse(remaining.splice(i, 1)[0]))
          else continue
          grew = true
          break
        }
      }
      out.push(chain)
    }
    return out
  }

  // Hai lượt: lượt đầu khít (0.05 mm) cho phần lớn file. Mảnh nào còn hở sau lượt đầu
  // thì nối lại với nhau bằng dung sai lỏng gấp 10 — rãnh khoét của CAM350 vẽ bằng
  // cung và đoạn thẳng lệch nhau vài phần mười mm, để hở thì mỗi mảnh tô thành một
  // hình nêm trắng giữa bo. Chỉ nối mảnh hở với mảnh hở, vòng đã kín không bị đụng.
  const strict = chainUp(unique, TOL)
  const chains = strict.filter((ch) => isClosedLoop(ch, TOL))
  const loose = strict.filter((ch) => !isClosedLoop(ch, TOL)).flat()
  if (loose.length > 0) chains.push(...chainUp(loose, TOL * 10))

  // web-gerber dựng outline bằng cách duyệt từng child và nối vào MỘT shape, nhưng
  // nó CHỈ chấp nhận child có đúng 1 segment:
  //     if (n.segments.length != 1) -> warn("Invalid outline segments length"), null
  // Gộp cả chuỗi vào một child sẽ bị từ chối và lõi bo không được dựng (nhìn xuyên
  // xuống mặt dưới). Nên trả về mỗi segment một child, chỉ khác là ĐÚNG THỨ TỰ.
  //
  // Vì nó chỉ dựng được một shape, panel có NHIỀU đường bao rời (9 bo + khung + rãnh
  // v-cut = 13 vòng) sẽ bị nối liền thành một khối tự cắt. Nên tách mỗi vòng thành một
  // cây riêng để bên ngoài dựng từng mảnh rồi gộp lại.
  const template = tree.children.find((c: any) => c?.segments?.length) ?? tree.children[0]
  const asTree = (segments: any[]) => ({
    ...tree,
    children: segments.map((seg) => ({ ...template, segments: [seg] })),
  })

  // Giữ mọi vòng đủ 3 đoạn — đủ để tạo thành một vùng, kể cả khi còn hở (khung panel
  // hay bị hở vài chục mm chỗ nối rãnh, bỏ đi thì mất luôn cả khung).
  //
  // Vòng 1–2 đoạn thì phải xét đã KHÉP KÍN chưa, không được loại thẳng: EasyEDA vẽ lỗ
  // tròn/cutout tròn bằng ĐÚNG HAI cung 180°, vài bộ xuất khác dùng một cung 360°.
  // Loại theo số đoạn là mất sạch mấy lỗ đó (bo drone EasyEDA: 4 lỗ đầu càng biến mất).
  // Còn hở mà chỉ 1–2 đoạn thì đúng là đường lẻ (vạch v-cut, khe tab), bỏ.
  // Phải có ít nhất một cung: hai ĐOẠN THẲNG khép kín chỉ là đi ra rồi đi về trên cùng
  // một vạch, diện tích bằng 0.
  const isClosedArc = (ch: any[]) =>
    isClosedLoop(ch, TOL * 10) && ch.some((s) => s?.type === 'arc')
  const usable = chains.filter((ch) => ch.length >= 3 || isClosedArc(ch))

  // Lọc sạch nhẵn thì trả lại nguyên cây: lớp .GM1 nhiều khi chỉ có một vạch ghi chú cơ
  // khí, dựng ra rỗng là vẽ ít hơn trước.
  if (usable.length === 0) return tree

  const main = asTree(usable.flat())
  return { ...main, parts: usable.map(asTree) }
}
