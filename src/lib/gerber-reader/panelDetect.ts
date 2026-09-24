/**
 * [DQPCB] Nhận biết file đã ghép panel, và đo mũi khoan nhỏ nhất.
 *
 * Toàn bộ file này là của DQPCB. Dùng cho badge ở khung xem và nhắc nhở ở thẻ giá.
 */
import { boardBoxes, copperSamplePoints, countBoards } from './outlineLoops'

/** Một lỗ tròn (mm). */
interface Hole {
  x: number
  y: number
  d: number
}

type DrillLayer = { type: string; filename: string; holeCount?: number; imageTree?: any }

/** Lấy lỗ tròn và bề rộng rãnh (mm) từ các lớp khoan. */
const drillGeometry = (layers: DrillLayer[], only?: Set<string>) => {
  const holes: Hole[] = []
  const slotWidths: number[] = []
  for (const l of layers) {
    if (l.type !== 'drill' || !l.imageTree?.children) continue
    if (only && !only.has(l.filename)) continue
    const k = l.imageTree.units === 'in' ? 25.4 : 1
    for (const c of l.imageTree.children) {
      if (c?.type === 'imageShape' && c.shape?.type === 'circle' && c.shape.r > 0) {
        holes.push({ x: c.shape.cx * k, y: c.shape.cy * k, d: +(c.shape.r * 2 * k).toFixed(3) })
      } else if (c?.type === 'imageRegion' || c?.type === 'imagePath') {
        // Rãnh phay (Altium SlotHoles / G85): hai đầu là cung — bề rộng = 2 × bán kính cung.
        const arc = (c.segments ?? []).find((s: any) => s?.type === 'arc' && s.radius > 0)
        if (arc) slotWidths.push(+(arc.radius * 2 * k).toFixed(3))
        else if (c.type === 'imagePath' && c.width > 0) slotWidths.push(+(c.width * k).toFixed(3))
      }
    }
  }
  return { holes, slotWidths }
}

export interface MinDrill {
  /** Lỗ tròn nhỏ nhất (mm) và số lỗ cỡ đó. */
  hole: { d: number; count: number } | null
  /** Rãnh hẹp nhất (mm). */
  slot: number | null
}

/** Mũi khoan nhỏ nhất trong các file khoan được vẽ (`only` = tên file; bỏ trống = mọi file khoan). */
export const minDrill = (layers: DrillLayer[], only?: Set<string>): MinDrill => {
  const { holes, slotWidths } = drillGeometry(layers, only)
  let hole: MinDrill['hole'] = null
  if (holes.length) {
    const d = Math.min(...holes.map((h) => h.d))
    hole = { d, count: holes.filter((h) => Math.abs(h.d - d) < 0.005).length }
  }
  return { hole, slot: slotWidths.length ? Math.min(...slotWidths) : null }
}

export interface PanelInfo {
  /** Có ghép không: 'yes' chắc chắn, 'maybe' chỉ có gợi ý, 'no' không thấy dấu hiệu. */
  verdict: 'yes' | 'maybe' | 'no'
  /** Số bo (ước lượng) và lưới cột × hàng. */
  count: number
  cols: number
  rows: number
  /** Nhận ra bằng cách nào. */
  method: 'outline' | 'repeat' | 'name' | 'none'
  /** Một dòng giải thích cho người lập. */
  detail: string
  /** Chỉ một phần bo lặp lại (có bo khác mẫu / xoay): `count` là số tối thiểu. */
  partial?: boolean
  /** Số THIẾT KẾ khác nhau (bo giống hệt nhau tính là một). */
  designs: number
  /** Từng thiết kế: kích thước bo (mm) và số bản trên tấm. Chỉ có khi đếm được theo viền. */
  designList?: { widthMM: number; heightMM: number; count: number }[]
}

/** Một điểm đại diện cho mỗi hình của các lớp loại `type` (mm), kể cả vùng tô (chữ in lụa). */
const samplePoints = (layers: { type: string; imageTree?: any }[], type: string): number[][] => {
  const out: number[][] = []
  for (const l of layers) {
    if (l.type !== type || !l.imageTree?.children) continue
    const k = l.imageTree.units === 'in' ? 25.4 : 1
    for (const c of l.imageTree.children) {
      const s = c?.shape
      const p =
        s && Number.isFinite(s.cx) ? [s.cx, s.cy]
        : s && Number.isFinite(s.x) ? [s.x, s.y]
        : s?.points?.[0] ?? c?.segments?.[0]?.start
      if (p) out.push([p[0] * k, p[1] * k])
    }
  }
  return out
}

const NAME_HINT = /(^|[^a-z])(ghep|panel|pnl|array|mang|x\d+pcs)([^a-z]|$)/i

/** Sai số khi so hai điểm của hai bo với nhau (mm). */
const DESIGN_MATCH_MM = 0.15
/** Tỉ lệ điểm khớp tối thiểu để coi hai bo là cùng một thiết kế. */
const DESIGN_MATCH_RATIO = 0.8
/** Hai bo lệch kích thước quá mức này (mm) thì chắc chắn khác thiết kế. */
const DESIGN_SIZE_TOL_MM = 0.3

/**
 * Gom các bo trên tấm thành từng THIẾT KẾ.
 *
 * Khác với `findRepeats` (tìm một bước lặp chung cho CẢ tấm, chỉ trả lời được "có lặp
 * không"), ở đây so từng bo với nhau: cắt lấy điểm mạch nằm trong ô bao của bo rồi dời về
 * gốc của chính bo đó. Bộ "Bo Dem Linhgragon ESP32-S3" (24/09/2026) có 3 bo: hai bo nhỏ
 * khớp nhau 100%, bo lớn khớp 0–5% → 3 bo, 2 thiết kế.
 *
 * Có thử cả xoay 90/180/270° vì panel hay xoay bo cho khít tấm. Không thử lật gương: bo lật
 * là bo khác mặt, không phải cùng thiết kế.
 */
const groupDesigns = (
  layers: (DrillLayer & { imageTree?: any })[],
  boxes: number[][],
): { widthMM: number; heightMM: number; count: number }[] => {
  const all = (() => {
    const cu = copperSamplePoints(layers)
    return cu.length >= 20 ? cu : samplePoints(layers, 'silkscreen')
  })()
  const size = (b: number[]) => [b[2] - b[0], b[3] - b[1]]
  // Lấy ĐỦ điểm để làm bảng tra, chỉ lấy thưa phía đi hỏi: lấy thưa cả hai phía thì hai bo
  // giống hệt nhau vẫn trượt nhau (bo "DeltaX" 526 và 528 điểm — lấy cách một điểm ra hai
  // tập lệch pha, khớp 0%).
  const localOf = (b: number[]) =>
    all.filter(([x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]).map(([x, y]) => [x - b[0], y - b[1]])
  const turn = (pts: number[][], [w, h]: number[], q: number) =>
    q === 1 ? pts.map(([x, y]) => [h - y, x])
    : q === 2 ? pts.map(([x, y]) => [w - x, h - y])
    : q === 3 ? pts.map(([x, y]) => [y, w - x])
    : pts
  const ratio = (a: number[][], has: (x: number, y: number) => boolean) =>
    a.length === 0 ? 0 : a.filter(([x, y]) => has(x, y)).length / a.length
  /**
   * Dời theo TRỌNG TÂM chứ không theo góc ô bao: viền bo vẽ mỗi bản một kiểu (bo xoay 90°
   * của "CHAT_BOT" lệch góc vài phần mười mm) thì neo theo góc làm lệch hết điểm — khớp
   * tụt còn 35% dù là cùng một thiết kế.
   */
  const centre = (p: number[][]) =>
    p.length ? [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length] : [0, 0]
  const alignTo = (p: number[][], target: number[]) => {
    const c = centre(p)
    return p.map(([x, y]) => [x - c[0] + target[0], y - c[1] + target[1]])
  }

  const groups: { box: number[]; pts: number[][]; mid: number[]; has: (x: number, y: number) => boolean; count: number }[] = []
  for (const box of boxes) {
    const [w, h] = size(box)
    const pts = localOf(box)
    const hit = groups.find((g) => {
      const [gw, gh] = size(g.box)
      for (const q of [0, 1, 2, 3]) {
        const [tw, th] = q % 2 ? [h, w] : [w, h]
        if (Math.abs(tw - gw) > DESIGN_SIZE_TOL_MM || Math.abs(th - gh) > DESIGN_SIZE_TOL_MM) continue
        const turned = alignTo(turn(pts, [w, h], q), g.mid)
        if (
          ratio(thin(turned, 400), g.has) >= DESIGN_MATCH_RATIO &&
          ratio(thin(g.pts, 400), pointSet(turned, DESIGN_MATCH_MM)) >= DESIGN_MATCH_RATIO
        ) return true
      }
      // Bo không có điểm mạch nào (lớp đồng thiếu): chỉ so kích thước.
      return pts.length === 0 && g.pts.length === 0 && Math.abs(w - gw) <= DESIGN_SIZE_TOL_MM && Math.abs(h - gh) <= DESIGN_SIZE_TOL_MM
    })
    if (hit) hit.count++
    else groups.push({ box, pts, mid: centre(pts), has: pointSet(pts, DESIGN_MATCH_MM), count: 1 })
  }
  return groups.map((g) => {
    const [w, h] = size(g.box)
    return { widthMM: +w.toFixed(2), heightMM: +h.toFixed(2), count: g.count }
  })
}

/** Bảng băm điểm (mm) theo ô 0.1 mm, dò cả 8 ô quanh để chịu sai số làm tròn. */
const pointSet = (pts: number[][], Q = 0.1) => {
  const k = (x: number, y: number) => `${Math.round(x / Q)},${Math.round(y / Q)}`
  const st = new Set(pts.map(([x, y]) => k(x, y)))
  return (x: number, y: number) => {
    for (const dx of [-Q, 0, Q]) for (const dy of [-Q, 0, Q]) if (st.has(k(x + dx, y + dy))) return true
    return false
  }
}
const thin = <T,>(a: T[], n: number) => (a.length > n ? a.filter((_, i) => i % Math.ceil(a.length / n) === 0) : a)
const len = (v: number[]) => Math.hypot(v[0], v[1])

/**
 * Tìm bước lặp của cả bo: vector v mà phần lớn điểm của lớp chấm điểm (lụa, hoặc đồng khi
 * không có lụa) có điểm ở đúng vị trí dịch ±v.
 *
 * Chỉ dùng Gerber (đồng bỏ phiếu, lụa/đồng chấm điểm), không dùng lỗ khoan: file khoan không
 * khai định dạng thì toạ độ lỗ là đoán (FRIWO: lỗ lệch vài phần mười mm, bước lỗ ra 65.9 mm
 * trong khi lụa/đồng lặp đúng 65.0 mm).
 */
const findRepeats = (
  votePts: number[][],
  scorePts: number[][],
  need: number,
  extent: { w: number; h: number },
) => {
  const has = pointSet(scorePts)
  const partner = (x: number, y: number, v: number[]) => has(x + v[0], y + v[1]) || has(x - v[0], y - v[1])
  const probe = thin(scorePts, 1500)
  const score = (v: number[]) => probe.filter(([x, y]) => partner(x, y, v)).length / probe.length

  // Bước tối thiểu 15% cạnh ngắn của tấm: bước nhỏ hơn là kênh mạch lặp lại TRONG một bo
  // (7 đoạn LED, dãy relay…) — corpus: bước 10.2 / 15.2 mm (bội 2.54) trên bo 100–240 mm.
  const minStep = Math.max(8, 0.15 * Math.min(extent.w, extent.h))
  // Mốc ~100 điểm, ghép với TOÀN BỘ điểm: lấy mẫu cả hai phía thì điểm tương ứng ở bo bên
  // cạnh hiếm khi cùng lọt mẫu, phiếu dồn cho cặp nhiễu (FRIWO ra bước dọc 65.85 mm thay vì 65.0).
  const anchors = thin(votePts, 100)
  const all = thin(votePts, 10000)
  const votes = new Map<string, { v: number[]; n: number }>()
  for (const a of anchors) {
    for (const b of all) {
      if (a === b) continue
      const v = [b[0] - a[0], b[1] - a[1]]
      // Nửa mặt phẳng (v và −v là một).
      if (v[0] < -0.05 || (Math.abs(v[0]) <= 0.05 && v[1] <= 0) || len(v) < minStep) continue
      const k = `${Math.round(v[0] / 0.2)},${Math.round(v[1] / 0.2)}`
      const e = votes.get(k)
      if (e) e.n++
      else votes.set(k, { v, n: 1 })
    }
  }
  const ranked = [...votes.values()].sort((a, b) => b.n - a.n)
  const scoreTop = (list: { v: number[] }[]) =>
    list
      .slice(0, 40)
      .map(({ v }) => ({ v, score: score(v) }))
      .filter((c) => c.score >= need)
  const across = (a: number[], b: number[]) => Math.abs(a[0] * b[0] + a[1] * b[1]) / (len(a) * len(b)) < 0.5
  // Bước khớp NHIỀU nhất là một bo (bước gấp đôi khớp ít hơn: hàng cuối không có cặp). Gần
  // bằng điểm (±3%) thì ưu tiên bước ngắn.
  const pick = (list: { v: number[]; score: number }[]) => {
    if (!list.length) return null
    const best = Math.max(...list.map((c) => c.score))
    return list.filter((c) => c.score >= best - 0.03).sort((a, b) => len(a.v) - len(b.v))[0]
  }
  const v1 = pick(scoreTop(ranked))
  if (!v1) return null
  // Hướng còn lại tìm riêng trong các bước KHÔNG song song: panel dài theo một chiều thì
  // bước theo chiều đó chiếm hết 40 phiếu đầu (FRIWO 4×2: bước dọc 65 mm không lọt top).
  const v2 = pick(scoreTop(ranked.filter((c) => across(c.v, v1.v))))
  // Số bản lặp theo một hướng = độ trải của các điểm có cặp (chiếu lên hướng đó) / bước + 1.
  const copies = (v: number[]) => {
    const u = [v[0] / len(v), v[1] / len(v)]
    const proj = probe.filter(([x, y]) => partner(x, y, v)).map(([x, y]) => x * u[0] + y * u[1])
    if (proj.length < 2) return 1
    // Không thể nhiều bản hơn số bước vừa bề ngang tấm theo hướng đó, +1 (bo nhỏ hơn bước).
    const fit = Math.floor((Math.abs(u[0]) * extent.w + Math.abs(u[1]) * extent.h) / len(v)) + 1
    return Math.min(fit, Math.floor((Math.max(...proj) - Math.min(...proj)) / len(v) + 0.02) + 1)
  }
  const n1 = copies(v1.v)
  const n2 = v2 ? copies(v2.v) : 1
  const horiz = (v: number[]) => Math.abs(v[0]) >= Math.abs(v[1])
  const matched = probe.filter(([x, y]) => partner(x, y, v1.v) || (v2 && partner(x, y, v2.v))).length / probe.length
  return {
    cols: horiz(v1.v) ? n1 : n2,
    rows: horiz(v1.v) ? n2 : n1,
    v1: v1.v,
    v2: v2?.v,
    matched,
  }
}

/**
 * Nhận biết file đã ghép. Ba dấu hiệu, theo độ tin cậy:
 *  1. Viền rời: lớp viền có ≥ 2 bo tách nhau (countBoards).
 *  2. Bo lặp lại: cả bo (chữ in lụa, hoặc đồng khi không có lụa) lặp theo một bước cỡ một
 *     bo — bắt được panel chỉ ngăn bằng rãnh / V-cut (CHAT_BOT_4, FRIWO 55807), viền chỉ
 *     là một khung chung.
 *  3. Tên file có "ghep", "panel", "array"… — chỉ là gợi ý.
 */
const cache = new WeakMap<object, PanelInfo>()

export const detectPanel = (
  layers: (DrillLayer & { imageTree?: any })[],
  opts: { drillFiles?: Set<string>; names?: string[]; bounds?: { widthMM: number; heightMM: number } | null } = {},
): PanelInfo => {
  // Khung xem và thẻ giá cùng hỏi cho một bo: tính một lần theo mảng lớp.
  const hit = cache.get(layers)
  if (hit) return hit
  const info = detectPanelUncached(layers, opts)
  cache.set(layers, info)
  return info
}

const detectPanelUncached = (
  layers: (DrillLayer & { imageTree?: any })[],
  opts: { drillFiles?: Set<string>; names?: string[]; bounds?: { widthMM: number; heightMM: number } | null },
): PanelInfo => {
  const byOutline = countBoards(layers)
  if (byOutline && byOutline.count >= 2) {
    // Nhiều bo rời KHÔNG chắc là panel bo giống nhau: bộ "Bo Dem Linhgragon ESP32-S3"
    // (24/09/2026) có 1 bo lớn + 2 bo nhỏ giống hệt nhau — 3 bo nhưng 2 THIẾT KẾ, mỗi thiết
    // kế một giá, không nhân theo set được.
    const designList = groupDesigns(layers, boardBoxes(layers) ?? [])
    const mm = (n: number) => n.toFixed(1).replace(/\.0$/, '')
    const shown = designList.slice(0, 3).map((d) => `${d.count} × ${mm(d.widthMM)} × ${mm(d.heightMM)} mm`)
    const sizes = shown.join(', ') + (designList.length > shown.length ? `, và ${designList.length - shown.length} thiết kế nữa` : '')
    return {
      verdict: 'yes',
      ...byOutline,
      method: 'outline',
      designs: designList.length || 1,
      designList,
      detail:
        designList.length > 1
          ? `viền có ${byOutline.count} bo tách rời, ${designList.length} thiết kế khác nhau (${sizes})`
          : `viền có ${byOutline.count} bo tách rời`,
    }
  }

  if (opts.bounds) {
    // Lặp lại thôi chưa đủ: hàng chân linh kiện (bước bội 2.54 mm) hay các kênh mạch giống
    // nhau TRONG một bo cũng lặp lỗ và pad. Chấm bằng CHỮ IN LỤA: bo ghép lặp nguyên cả tên
    // linh kiện (R1, C3…), kênh lặp trong một bo thì tên mỗi kênh khác nhau — corpus 22/09:
    // bo ghép 0.75–1.00, bo lẻ 0.01–0.52 → ngưỡng 65%. Bo không có lụa: đồng lặp ≥ 90%.
    const copper = copperSamplePoints(layers)
    const silk = samplePoints(layers, 'silkscreen')
    const bySilk = silk.length >= 20
    const scorePts = bySilk ? silk : copper
    const rep =
      scorePts.length >= 20 && copper.length >= 8
        ? findRepeats(copper, scorePts, bySilk ? 0.65 : 0.9, { w: opts.bounds.widthMM, h: opts.bounds.heightMM })
        : null
    if (rep && rep.cols * rep.rows >= 2) {
      const step = (v: number[]) => `${len(v).toFixed(1)} mm`
      const pct = Math.round(rep.matched * 100)
      // Khớp dưới 90% thì chỉ "có thể": bo ghép có một bo xoay (CHAT_BOT_4 75%, BUTTON 78%)
      // và bo lẻ có nhiều kênh giống nhau (DAQ 6AI 79%, Pan 8 66%) rơi cùng khoảng này.
      return {
        verdict: pct >= 90 ? 'yes' : 'maybe',
        count: rep.cols * rep.rows,
        designs: 1,
        cols: rep.cols,
        rows: rep.rows,
        method: 'repeat',
        partial: pct < 90,
        detail:
          `${bySilk ? 'lụa + đồng' : 'đồng'} lặp lại ${rep.cols}×${rep.rows}, bước ${step(rep.v1)}${rep.v2 ? ` / ${step(rep.v2)}` : ''}, khớp ${pct}%` +
          (pct < 90 ? ' — chỉ một phần lặp lại: có bo khác mẫu / xoay, hoặc là các kênh giống nhau trong một bo' : ''),
      }
    }
  }

  const hinted = (opts.names ?? []).find((n) => NAME_HINT.test((n.split(/[\\/]/).pop() ?? n).replace(/[_\-.]+/g, ' ')))
  if (hinted) {
    return { verdict: 'maybe', count: 1, cols: 1, rows: 1, designs: 1, method: 'name', detail: `tên file "${hinted.split(/[\\/]/).pop()}" có chữ ghép/panel` }
  }
  return { verdict: 'no', count: 1, cols: 1, rows: 1, designs: 1, method: 'none', detail: 'không thấy viền rời hay bo lặp lại' }
}
