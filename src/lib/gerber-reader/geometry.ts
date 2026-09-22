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


/** Khoảng cách từ điểm p tới đoạn ab. */
const distToSegment = (p: number[], a: number[], b: number[]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/**
 * Đa giác với mỗi cạnh đẩy ra một quãng RIÊNG (`dist[i]` cho cạnh i → i+1). Đỉnh mới là
 * giao của hai cạnh kề đã đẩy; hai cạnh gần song song thì đẩy đỉnh theo cạnh xa hơn.
 */
const offsetEdges = (pts: number[][], dist: number[]): number[][] => {
  const n = pts.length
  let area = 0
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n]
    area += a[0] * b[1] - b[0] * a[1]
  }
  const sign = area >= 0 ? 1 : -1
  const normal = (i: number) => {
    const a = pts[i], b = pts[(i + 1) % n]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    return [(sign * dy) / len, (-sign * dx) / len]
  }
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n
    const n0 = normal(prev), n1 = normal(i)
    const d0 = dist[prev], d1 = dist[i]
    if (d0 === 0 && d1 === 0) {
      out.push(pts[i])
      continue
    }
    // Giải [n0; n1]·v = [d0; d1] để v dịch đỉnh sao cho cả hai cạnh đều lùi đúng quãng.
    const det = n0[0] * n1[1] - n0[1] * n1[0]
    if (Math.abs(det) < 0.2) {
      const d = Math.max(d0, d1)
      const mx = n0[0] + n1[0], my = n0[1] + n1[1]
      const len = Math.hypot(mx, my) || 1
      out.push([pts[i][0] + (mx / len) * d, pts[i][1] + (my / len) * d])
      continue
    }
    const vx = (d0 * n1[1] - d1 * n0[1]) / det
    const vy = (n0[0] * d1 - n1[0] * d0) / det
    out.push([pts[i][0] + vx, pts[i][1] + vy])
  }
  return out
}

export const dilateRegions = (tree: any): any => {
  const children = tree?.children
  if (!Array.isArray(children)) return tree
  const scale = tree.units === 'in' ? 1 / 25.4 : 1
  const d = REGION_DILATE_MM * scale
  const tol = ARC_TOLERANCE_MM * scale
  const reach = 2 * d

  // Chỉ nới lớp xuất kiểu DẢI: nhiều cặp DẢI CHỮ NHẬT hở nhau một khe THẬT — khe
  // 0 < g ≤ 2·d, điểm giữa khe sát mép thật của cả hai dải và không vùng nào khác lấp.
  // Rồi nới ĐỀU cả lớp như bản đầu (dải chữ nhật nới đều vẫn phẳng mép).
  //
  // Bo KiCad "FC_F405RGT6_Wing" cắt pad/mảng đồng thành nhiều mảnh nhưng các mảnh chạm
  // khít (khe 0), không có gì để lấp. Bản trước nới theo TỪNG CẠNH ở mọi lớp: mép cong
  // bẻ thành đoạn ngắn, đoạn dò thấy hàng xóm bị đẩy, đoạn kế bên không, mép thành răng
  // cưa ("gợn") ngay chỗ đường dây nhập vào mảng đồng. Nới đều mọi lớp thì pad KiCad
  // phình ra, khe chân QFP hẹp lại nhìn như chạm.
  const regions: { i: number; pts: number[][]; box: number[]; strip: boolean }[] = []
  children.forEach((child, i) => {
    if (child?.type !== 'imageRegion' || child.polarity === 'clear' || !Array.isArray(child.segments)) return
    const pts = regionPoints(child, tol)
    if (pts.length < 3) return
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const [x, y] of pts) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
    // Dải CAM350: chữ nhật thẳng trục, cạnh dài vượt quãng với tới. Pad bo góc (hàng trăm
    // đỉnh) hay hạt vụn 0.01 mm của KiCad không tính — khe giữa hai pad là cầu mask thật.
    const ring = pts.length > 4 && Math.hypot(pts[4][0] - pts[0][0], pts[4][1] - pts[0][1]) <= 1e-9 ? pts.slice(0, 4) : pts
    const strip =
      ring.length === 4 &&
      Math.max(x1 - x0, y1 - y0) > reach &&
      ring.every((a, e) => {
        const b = ring[(e + 1) % 4]
        return Math.abs(a[0] - b[0]) <= 1e-9 || Math.abs(a[1] - b[1]) <= 1e-9
      })
    regions.push({ i, pts, box: [x0, y0, x1, y1], strip })
  })
  // CAM350 "3W NHUA XANH": 47-77% vùng là dải; KiCad "FC_F405RGT6_Wing": ≤ 6%, toàn
  // mảnh vụn 0.01 mm quanh pad.
  if (regions.length < 5 || regions.filter((r) => r.strip).length < regions.length * 0.25) return tree

  const distToRegion = (p: number[], pts: number[][]) => {
    let best = Infinity
    for (let j = 0; j < pts.length; j++) best = Math.min(best, distToSegment(p, pts[j], pts[(j + 1) % pts.length]))
    return best
  }
  const inside = (p: number[], pts: number[][]) => {
    let hit = false
    for (let j = 0, k = pts.length - 1; j < pts.length; k = j++) {
      const [xj, yj] = pts[j], [xk, yk] = pts[k]
      if (yj > p[1] !== yk > p[1] && p[0] < ((xk - xj) * (p[1] - yj)) / (yk - yj) + xj) hit = !hit
    }
    return hit
  }

  const eps = d / 50
  const byX = regions.map((_, k) => k).sort((a, b) => regions[a].box[0] - regions[b].box[0])
  const covered = (p: number[]) => {
    for (const k of byX) {
      const [x0, y0, x1, y1] = regions[k].box
      if (x0 > p[0]) break
      if (p[0] <= x1 && p[1] >= y0 && p[1] <= y1 && inside(p, regions[k].pts)) return true
    }
    return false
  }
  const need = 5
  let gaps = 0
  scan: for (let a = 0; a < byX.length; a++) {
    const A = regions[byX[a]]
    for (let b = a + 1; b < byX.length; b++) {
      const B = regions[byX[b]]
      if (B.box[0] - A.box[2] > reach) break
      if (!A.strip || !B.strip) continue
      const gx = Math.max(B.box[0] - A.box[2], A.box[0] - B.box[2])
      const gy = Math.max(B.box[1] - A.box[3], A.box[1] - B.box[3])
      // Mặt đối mặt: hở theo đúng một trục, trục kia chồng lên nhau.
      let probe: number[]
      if (gx > eps && gx <= reach && gy < 0) {
        const x = A.box[2] < B.box[0] ? (A.box[2] + B.box[0]) / 2 : (B.box[2] + A.box[0]) / 2
        probe = [x, (Math.max(A.box[1], B.box[1]) + Math.min(A.box[3], B.box[3])) / 2]
      } else if (gy > eps && gy <= reach && gx < 0) {
        const y = A.box[3] < B.box[1] ? (A.box[3] + B.box[1]) / 2 : (B.box[3] + A.box[1]) / 2
        probe = [(Math.max(A.box[0], B.box[0]) + Math.min(A.box[2], B.box[2])) / 2, y]
      } else continue
      if (distToRegion(probe, A.pts) > reach || distToRegion(probe, B.pts) > reach || covered(probe)) continue
      if (++gaps >= need) break scan
    }
  }
  if (gaps < need) return tree

  const replaced = new Map<number, any>()
  for (const { i, pts } of regions) {
    const moved = offsetEdges(pts, pts.map(() => d))
    replaced.set(i, {
      ...children[i],
      segments: moved.map((p, e) => ({ type: 'line', start: p, end: moved[(e + 1) % moved.length] })),
    })
  }
  return { ...tree, children: children.map((c, i) => replaced.get(i) ?? c) }
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
  for (const c of tree?.children ?? []) {
    if (!c?.segments?.length) continue
    for (const seg of c.segments) segs.push(typeof c.width === 'number' ? { ...seg, _w: c.width } : seg)
  }
  // Không bỏ qua ở mốc 2 đoạn: cả viền bo TRÒN có khi chỉ là MỘT cung 360° (CAM350),
  // bỏ qua thì lớp không có `parts` và bên ngoài dựng nhầm thành một khối tự cắt.
  if (segs.length === 0) return tree

  // 0.05 mm — KiCad để hở vài µm giữa cung và đoạn thẳng. Toạ độ giữ nguyên đơn vị
  // của file, nên file inch phải đổi mốc theo: giữ nguyên 0.05 với inch là 1.27 mm,
  // lỏng gấp 25 lần — bo CAM350 "3W NHUA XANH" bị nối chéo qua chỗ đứt tới 1.17 mm,
  // ra đa giác zíc zắc và lõi bo tô thành hình nêm.
  const TOL = tree.units === 'in' ? 0.05 / 25.4 : 0.05
  const nearAt = (a: number[], b: number[], tol: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol
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
  //
  // So TRÙNG bằng sai số siêu nhỏ, KHÔNG dùng TOL nối: KiCad 10 vẽ góc bo tròn bằng 500
  // đoạn thẳng dài ~0.02 mm — ngắn hơn TOL 0.05 mm, nên hai đoạn KẾ NHAU cũng lọt
  // "cùng hai đầu mút" và bị xoá mất một. Bản sao của CAM350 trùng tuyệt đối nên
  // 0.001 mm là đủ bắt.
  //
  // Nhưng đoạn thường thì vẫn so bằng TOL: vài bộ xuất vẽ lặp viền lệch nhau vài phần
  // trăm mm, siết hết về 0.001 mm là để lọt bản sao và vòng viền lại hở (đo trên corpus).
  const DUP_TOL = TOL / 50
  const segLen = (a: any) => Math.hypot(a.end[0] - a.start[0], a.end[1] - a.start[1])
  const sameSeg = (a: any, b: any) => {
    const tol = segLen(a) < TOL * 2 || segLen(b) < TOL * 2 ? DUP_TOL : TOL
    const same = (p: number[], q: number[]) => nearAt(p, q, tol)
    if ((a.type === 'arc') !== (b.type === 'arc')) return false
    if (a.type === 'arc') {
      return (
        !!a.center && !!b.center &&
        same(a.center, b.center) &&
        Math.abs((a.radius ?? 0) - (b.radius ?? 0)) <= TOL &&
        Math.abs(midAngle(a) - midAngle(b)) < 1e-6
      )
    }
    return (same(a.start, b.start) && same(a.end, b.end)) || (same(a.start, b.end) && same(a.end, b.start))
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
        // Hai lượt tìm đoạn nối tiếp, đều theo thứ tự trong file (thứ tự vẽ giữ đúng
        // đường đi ở chỗ hai vòng chạm nhau tại một điểm, như góc bo con trong panel):
        //  1. Đoạn KHÍT tuyệt đối (≤ DUP_TOL). Góc bo KiCad 10 là 500 đoạn ngắn hơn cả
        //     dung sai nối; lượt cũ lấy đoạn đầu tiên lọt dung sai nên nhảy cóc qua góc,
        //     vòng viền vỡ làm hai — tô mỗi nửa bằng một đường nối thẳng hai đầu hở ra
        //     vết cắt chéo ngang bo (FC_F405RGT6_Wing).
        //  2. Không có đoạn khít thì lấy đoạn đầu tiên lọt dung sai như trước. Đã thử
        //     lấy đoạn GẦN NHẤT thay vào: trên corpus làm hở thêm vòng ở vài panel.
        const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1])
        // how: 1 đuôi←start, 2 đuôi←end, 3 đầu←end, 4 đầu←start
        const joins = (s: any): [number, number][] => [
          [dist(s.start, tail), 1],
          [dist(s.end, tail), 2],
          [dist(s.end, head), 3],
          [dist(s.start, head), 4],
        ]
        let best = -1
        let how = 0
        for (let i = 0; i < remaining.length && best < 0; i++) {
          const exact = joins(remaining[i]).find(([d]) => d <= DUP_TOL)
          if (exact) {
            best = i
            how = exact[1]
          }
        }
        for (let i = 0; i < remaining.length && best < 0; i++) {
          const hit = joins(remaining[i]).find(([d]) => d <= tol)
          if (hit) {
            best = i
            how = hit[1]
          }
        }
        if (best < 0) continue
        const seg = remaining.splice(best, 1)[0]
        if (how === 1) chain.push(seg)
        else if (how === 2) chain.push(reverse(seg))
        else if (how === 3) chain.unshift(seg)
        else chain.unshift(reverse(seg))
        grew = true
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
  //
  // [DQPCB] Mẫu phải là NÉT VẼ (imagePath) nếu lớp có nét. Bo "Gerber Anh Nhat" (Altium,
  // 22/09/2026): BAI111.GKO có một vùng tô G36 (rãnh dưới anten Module1) đứng TRƯỚC khung bo.
  // Lấy phần tử đầu tiên làm mẫu thì cả 8 đoạn khung bo thành 8 "vùng tô" một đoạn — tô đặc
  // ra 0 đỉnh, 2D/3D mất sạch lõi bo (CAM vẽ nét nên không lộ). Corpus: ~1–2% bộ dính.
  // Lớp chỉ có vùng tô thì giữ như cũ.
  const template =
    tree.children.find((c: any) => c?.type === 'imagePath' && c?.segments?.length) ??
    tree.children.find((c: any) => c?.segments?.length) ??
    tree.children[0]
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
  /**
   * Tách vòng "hình số 8" thành từng vòng đơn: vòng đi qua cùng một đỉnh hai lần.
   *
   * Panel V-cut vẽ mỗi bo một đường bao, hai bo chung một cạnh. Ở góc chung có 4 đoạn
   * gặp nhau, chainUp đi thẳng sang bo bên cạnh thay vì khép vòng bo đang đi, ra MỘT
   * vòng ôm cả hai bo, qua cạnh chung hai lần. Đa giác tự chạm như vậy tô ra sai: bo
   * dưới của panel "Dynamic Master" (Le Quoc Huy, 21/09/2026) mất nửa thân bo, nhìn
   * trắng toát giữa mạch.
   *
   * Chỉ tách ở đỉnh TRÙNG KHÍT (≤ DUP_TOL) và khi phần tách ra có diện tích thật: góc bo
   * KiCad 10 là hàng trăm đoạn ngắn hơn TOL, so bằng TOL thì vỡ vụn cả góc.
   */
  const MIN_LOOP_AREA = (TOL * 20) ** 2 // 1 mm²
  const chordArea = (ch: any[]) => {
    let a = 0
    for (const seg of ch) a += seg.start[0] * seg.end[1] - seg.end[0] * seg.start[1]
    return Math.abs(a) / 2
  }
  const key = (pt: number[]) => `${Math.round(pt[0] / DUP_TOL)},${Math.round(pt[1] / DUP_TOL)}`
  const splitAtRepeats = (ch: any[]): any[][] => {
    // Cả chuỗi HỞ cũng xét: bo "Slaver_Ceiling" có rail chung cạnh dưới với bo, cạnh
    // chung chỉ vẽ một lần (bản trùng đã bị bỏ) nên chuỗi bo + rail không khép — vẫn
    // đi qua góc chung hai lần, 3D cắt chéo mất hai góc bo.
    if (ch.length < 6) return [ch]
    const out: any[][] = []
    const stack: any[] = []
    const at = new Map<string, number>() // đỉnh → vị trí đoạn bắt đầu từ đỉnh đó trong stack
    for (const seg of ch) {
      at.set(key(seg.start), stack.length)
      stack.push(seg)
      const k = at.get(key(seg.end))
      if (k === undefined || stack.length - k < 3) continue
      const loop = stack.slice(k)
      if (chordArea(loop) < MIN_LOOP_AREA) continue
      // Vòng khép ngay ở đoạn cuối và đi từ đầu chuỗi là vòng bình thường — để nguyên.
      if (k === 0 && seg === ch[ch.length - 1]) break
      stack.length = k
      for (const [pt, idx] of at) if (idx >= k) at.delete(pt)
      out.push(loop)
    }
    if (out.length === 0) return [ch]
    if (stack.length > 0) out.push(stack)
    return out
  }
  const simple = chains.flatMap(splitAtRepeats)

  const isClosedArc = (ch: any[]) =>
    isClosedLoop(ch, TOL * 10) && ch.some((s) => s?.type === 'arc')
  const usable = simple.filter((ch) => ch.length >= 3 || isClosedArc(ch))

  // [DQPCB] Rãnh phay vẽ bằng MỘT nét thẳng trong lớp viền. Bo "CHAT_BOT_4" (Nguyen Van
  // Quang, 22/09/2026): khung chữ L nét 0.5 mm + 3 rãnh chia bo nét 0.8 mm, mỗi rãnh một
  // đoạn — bị loại cùng "đường lẻ", mất sạch rãnh. Chuỗi hở 1–2 đoạn thẳng có mọi đầu mút
  // nằm HẲN trong bo (cách mép ≥ 1 mm) là rãnh: dựng thành vòng kín hình thuôn đúng bề
  // rộng nét, để nó đi đường lỗ khoét (CAM tô trắng, 2D/3D khoét thủng). Vạch chạm mép bo
  // (V-cut vẽ trong lớp viền) và nét mảnh < 0.3 mm (nét vẽ) vẫn bỏ như cũ.
  if (usable.length > 0) {
    const polyOf = (ch: any[]) => ch.map((sg) => sg.start)
    const boxArea = (ch: any[]) => {
      const xs = ch.flatMap((sg) => [sg.start[0], sg.end[0]]), ys = ch.flatMap((sg) => [sg.start[1], sg.end[1]])
      return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
    }
    const main = polyOf(usable.reduce((a, b) => (boxArea(b) > boxArea(a) ? b : a)))
    const inside = (pt: number[]) => {
      let hit = false
      for (let i = 0, j = main.length - 1; i < main.length; j = i++) {
        const [xi, yi] = main[i], [xj, yj] = main[j]
        if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit
      }
      return hit
    }
    const edgeDist = (pt: number[]) => {
      let best = Infinity
      for (let i = 0, j = main.length - 1; i < main.length; j = i++) {
        const a = main[j], b = main[i]
        const dx = b[0] - a[0], dy = b[1] - a[1]
        const len2 = dx * dx + dy * dy
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / len2)) : 0
        best = Math.min(best, Math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dy)))
      }
      return best
    }
    const MARGIN = tree.units === 'in' ? 1 / 25.4 : 1
    // Nét dưới 0.3 mm là nét vẽ / ghi chú, không phải đường dao phay (dao thường ≥ 0.5 mm).
    const MIN_TOOL = tree.units === 'in' ? 0.3 / 25.4 : 0.3
    const fallbackW = template?.width ?? 0
    /** Vòng kín hình thuôn quanh đoạn a→b, bán kính r (hai đầu tròn, 8 bước mỗi nửa vòng). */
    const stadium = (a: number[], b: number[], r: number) => {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
      const pts: number[][] = []
      const arc = (c: number[], from: number) => {
        for (let k = 0; k <= 8; k++) {
          const t = from + (Math.PI * k) / 8
          pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)])
        }
      }
      arc(b, ang - Math.PI / 2) // quanh đầu b
      arc(a, ang + Math.PI / 2) // quanh đầu a
      return pts.map((pt, k) => ({ type: 'line', start: pt, end: pts[(k + 1) % pts.length] }))
    }
    const segDist = (pt: number[], sg: any) => {
      const dx = sg.end[0] - sg.start[0], dy = sg.end[1] - sg.start[1]
      const len2 = dx * dx + dy * dy
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((pt[0] - sg.start[0]) * dx + (pt[1] - sg.start[1]) * dy) / len2)) : 0
      return Math.hypot(pt[0] - (sg.start[0] + t * dx), pt[1] - (sg.start[1] + t * dy))
    }
    // Rãnh thật đứng riêng. Mảnh của đường phay gấp khúc bị đứt (Altium "PHAONUOC": nét
    // 0.8 mm nhiều khúc chạm nhau) chạm nét khác ở đầu mút → không phải rãnh, bỏ như cũ.
    // Cùng lý do: bề rộng nét nào đã dùng cho một đường hở ≥ 3 khúc (đường vẽ, không phải
    // rãnh) thì các mảnh ngắn cùng bề rộng cũng là đường vẽ.
    const JOIN = TOL * 10
    const touchesOther = (ch: any[], pt: number[]) =>
      simple.some((o) => o !== ch && o.some((sg: any) => sg?.start && sg?.end && segDist(pt, sg) <= JOIN))
    const drawnWidths = simple
      .filter((o) => o.length >= 3 && !isClosedLoop(o, TOL))
      .flatMap((o) => o.map((sg: any) => sg._w).filter((w: any) => typeof w === 'number'))
    const isDrawnWidth = (w: number) => drawnWidths.some((d) => Math.abs(d - w) < 1e-6)
    for (const ch of simple) {
      if (ch.length > 2 || isClosedLoop(ch, TOL) || ch.some((sg: any) => sg?.type === 'arc')) continue
      const ends = [ch[0].start, ...ch.map((sg: any) => sg.end)]
      if (!ends.every((pt: number[]) => inside(pt) && edgeDist(pt) >= MARGIN)) continue
      if (ends.some((pt: number[]) => touchesOther(ch, pt))) continue
      for (const sg of ch) {
        const w = typeof sg._w === 'number' && sg._w > 0 ? sg._w : fallbackW
        if (!(w >= MIN_TOOL) || isDrawnWidth(w) || Math.hypot(sg.end[0] - sg.start[0], sg.end[1] - sg.start[1]) <= 0) continue
        const loop: any = stadium(sg.start, sg.end, w / 2)
        // Giữ nét gốc: CAM vẽ lại đúng một nét như file khách, chỉ 2D/3D mới khoét hình thuôn.
        loop._millLine = [{ type: 'line', start: sg.start, end: sg.end }]
        usable.push(loop)
      }
    }
  }

  // Lọc sạch nhẵn thì trả lại nguyên cây: lớp .GM1 nhiều khi chỉ có một vạch ghi chú cơ
  // khí, dựng ra rỗng là vẽ ít hơn trước.
  if (usable.length === 0) return tree

  const main = asTree(usable.flat())
  return {
    ...main,
    parts: usable.map((ch: any) => (ch._millLine ? { ...asTree(ch), millLine: asTree(ch._millLine) } : asTree(ch))),
  }
}

/**
 * [DQPCB] Ô bao của lớp viền tính lại từ các vòng ĐÃ NỐI (sau khi bẻ cung), cộng nửa bề
 * rộng nét như web-gerber vẫn cộng.
 *
 * `size` của web-gerber tính trên dữ liệu thô, gồm cả nét lẻ mà stitchOutline đã bỏ.
 * Bo KiCad "FC_F405RGT6_Wing" có một chấm lẻ trong Edge_Cuts cách bo 47 mm: ô bao thô
 * ra 89.68 mm trong khi bo chỉ 41.5 mm — sai kích thước là sai luôn giá. Trả null nếu
 * lớp không có vòng nào (để bên gọi giữ nguyên số của web-gerber).
 */
export const outlineSize = (tree: any): [number, number, number, number] | null => {
  const parts = tree?.parts
  if (!Array.isArray(parts) || parts.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, stroke = 0
  for (const part of parts) {
    for (const child of part?.children ?? []) {
      if (typeof child?.width === 'number') stroke = Math.max(stroke, child.width)
      for (const seg of child?.segments ?? []) {
        const pieces = seg?.type === 'arc' ? arcToLines(seg, ARC_TOLERANCE_MM / (tree.units === 'in' ? 25.4 : 1)) : [seg]
        for (const piece of pieces) {
          for (const p of [piece.start, piece.end]) {
            if (!p) continue
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0])
            minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
          }
        }
      }
    }
  }
  if (!Number.isFinite(minX)) return null
  const h = stroke / 2
  return [minX - h, minY - h, maxX + h, maxY + h]
}
