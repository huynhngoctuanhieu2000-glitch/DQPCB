/**
 * [DQPCB] Toàn bộ file này là của DQPCB.
 *
 * Chia các vòng của lớp outline thành phần THÂN BO và phần LỖ KHOÉT.
 *
 * Lớp outline có thể chứa nhiều vòng kín vì hai lý do khác hẳn nhau:
 *  - bo có lỗ phay bên trong (lỗ bắt ốc, rãnh cắm LED… không nằm trong file khoan vì
 *    quá to so với mũi khoan) — phải thủng;
 *  - tấm panel gồm nhiều bo con cộng khung ngoài — mỗi vòng là một miếng vật liệu
 *    thật, phải đặc.
 *
 * Hai dấu hiệu, dấu nào trúng trước thì kết luận:
 *  0. Vị trí: lỗ khoét phải nằm TRONG một vòng khác. Vòng không nằm trong vòng nào là
 *     thân bo (rail, bo con khác trong panel) dù bé đến đâu.
 *  1. Độ lớn tương đối so với vòng chứa nó: lỗ phay thường bé xíu so với bo (lỗ 3.2 mm
 *     trên bo 121×86 mm chỉ chiếm 0.08%), còn một bo con trong panel 9 bo chiếm cỡ 11%.
 *     Dưới 5% là lỗ.
 *  2. Có LINH KIỆN/MẠCH bên trong hay không: bo con trong panel thì đầy pad và đường
 *     mạch; lỗ khoét thì không có gì để hàn. Bo LED "3W NHUA XANH" có rãnh cắm LED
 *     chiếm 9.1% — quá mốc 5% — bên trong không một pad hay đường mạch nào: đó là lỗ.
 *
 *     Đếm pad (imageShape) và đường mạch (imagePath), KHÔNG đếm mảng phủ (imageRegion):
 *     CAM350 hay vẽ phủ đồng tràn qua cả chỗ sẽ phay bỏ — chính rãnh LED trên có 29
 *     đỉnh mảng phủ nằm trong mà vẫn là lỗ. Đòi ít nhất 3 điểm mới tính, để một pad lạc
 *     sát mép không làm lỗ hoá thành thân.
 */
export const OUTLINE_CUTOUT_MAX_RATIO = 0.05
/** Hai đầu chuỗi cách nhau hơn mức này (mm) thì chuỗi là nét hở, không phải vòng. */
const OPEN_GAP_MM = 0.5
/** Số điểm đồng tối thiểu bên trong một vòng để coi vòng đó là bo con (có mạch). */
const COPPER_POINTS_FOR_BODY = 3

/** Diện tích hình chữ nhật bao của một vòng outline, theo đơn vị của file. */
export const loopArea = (part: any): number => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const child of part?.children ?? []) {
    for (const seg of child?.segments ?? []) {
      for (const pt of [seg.start, seg.end]) {
        if (!pt) continue
        minX = Math.min(minX, pt[0]); maxX = Math.max(maxX, pt[0])
        minY = Math.min(minY, pt[1]); maxY = Math.max(maxY, pt[1])
      }
    }
  }
  if (!Number.isFinite(minX)) return 0
  return (maxX - minX) * (maxY - minY)
}

/** Đỉnh của vòng (điểm đầu mỗi đoạn), đã nhân `scale` để về mm. */
export const loopPolygon = (part: any, scale = 1): number[][] => {
  const pts: number[][] = []
  for (const child of part?.children ?? []) {
    for (const seg of child?.segments ?? []) {
      if (seg?.start) pts.push([seg.start[0] * scale, seg.start[1] * scale])
    }
  }
  return pts
}

/** Điểm có nằm trong đa giác không (ray casting, biên tính là ngoài). */
export const pointInPolygon = (pt: number[], poly: number[][]): boolean => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    const crosses = yi > pt[1] !== yj > pt[1]
    if (crosses && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * Một điểm đại diện cho mỗi pad / đường mạch đồng, tính bằng mm. Không cần chính xác
 * tâm — chỉ cần một điểm chắc chắn thuộc hình đó (tâm pad tròn, gốc pad chữ nhật, đầu
 * đường mạch), đủ để đếm "bên trong vòng này có mạch không". Mảng phủ bỏ qua, xem
 * chú thích đầu file.
 */
export const copperSamplePoints = (layers: { type: string; imageTree?: any }[]): number[][] => {
  const out: number[][] = []
  for (const l of layers) {
    if (l.type !== 'copper' || !l.imageTree?.children) continue
    const scale = l.imageTree.units === 'in' ? 25.4 : 1
    for (const c of l.imageTree.children) {
      if (c?.type === 'imageRegion') continue
      const s = c?.shape
      let p: number[] | undefined
      if (s && Number.isFinite(s.cx) && Number.isFinite(s.cy)) p = [s.cx, s.cy]
      else if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) p = [s.x, s.y]
      else if (s?.points?.[0]) p = s.points[0]
      else if (c?.segments?.[0]?.start) p = c.segments[0].start
      if (p) out.push([p[0] * scale, p[1] * scale])
    }
  }
  return out
}

export const splitOutlineLoops = (
  parts: any[],
  opts: { scale?: number; copperPoints?: number[][] } = {},
): { body: any[]; cutouts: any[]; lines: any[]; notches: any[] } => {
  if (!Array.isArray(parts) || parts.length < 2) return { body: parts ?? [], cutouts: [], lines: [], notches: [] }
  const areas = parts.map(loopArea)
  const biggest = Math.max(...areas)
  if (!(biggest > 0)) return { body: parts, cutouts: [], lines: [], notches: [] }

  const scale = opts.scale ?? 1
  const copper = opts.copperPoints ?? []
  const polys = parts.map((p) => loopPolygon(p, scale))
  const boxes = polys.map(bbox)

  // Vòng chứa trực tiếp: vòng NHỎ NHẤT bao trọn vòng này. Không có vòng nào bao thì nó
  // không thể là lỗ — là rail, hoặc một bo con khác trong panel.
  //
  // Trước đây chỉ so với vòng lớn nhất, và "dưới 5% là lỗ" chạy trước cả việc xét vị
  // trí. Panel của Le Quoc Huy (21/09/2026) sai cả hai kiểu: rail 5 mm trên/dưới của
  // "Dynamic Master" chỉ bằng 2.4% khung bo nên bị khoét thủng; còn "Ceiling Master"
  // là 3 bo xếp ngang, vòng lớn nhất chỉ là MỘT bo, "nằm trong vòng lớn nhất" chẳng
  // nói lên gì với hai bo kia.
  const containerOf = (i: number): number => {
    let best = -1
    for (let j = 0; j < parts.length; j++) {
      if (j === i || areas[j] <= areas[i]) continue
      // Không đòi nằm TRỌN: khấc ở mép bo hay được vẽ lấn ra ngoài cạnh vài phần trăm mm
      // (bo "AC_Board_Mon22_2": khấc lấn 0.025–0.037 mm) mà vẫn là lỗ. Đòi tâm nằm trong
      // vòng chứa và ít nhất nửa ô bao chồng lên nó; rail thì tâm nằm ngoài bo.
      if (overlapRatio(boxes[i], boxes[j]) < 0.5) continue
      const c = [(boxes[i][0] + boxes[i][2]) / 2, (boxes[i][1] + boxes[i][3]) / 2]
      // Tâm ô bao của lỗ tròn/chữ nhật nằm trong chính nó; lỗ hình chữ C thì tâm có thể
      // rơi ra ngoài lỗ nhưng vẫn trong vòng chứa — đúng thứ cần biết ở đây.
      if (!pointInPolygon(c, polys[j])) continue
      if (best === -1 || areas[j] < areas[best]) best = j
    }
    return best
  }

  // Ô bao cả lớp viền — để nhận ra rail: dải chạy gần hết một cạnh của tấm.
  const all = bbox(polys.flat())
  const railLike = (i: number) => {
    const [x0, y0, x1, y1] = boxes[i]
    return x1 - x0 >= (all[2] - all[0]) * 0.5 || y1 - y0 >= (all[3] - all[1]) * 0.5
  }

  // Khấc phay bỏ ở mép bo: vòng VẮT NGANG mép một vòng lớn hơn — có đỉnh nằm hẳn trong
  // và có đỉnh nằm hẳn ngoài vòng đó. Bo "Dao Quoc Thai 5pcs" (22/09/2026): vùng 6.3 × 18 mm
  // lấn 2.7 mm vào mép phải, thò ra ngoài 3.6 mm — ô bao chỉ chồng 42% nên không "nằm
  // trong", bị coi là thân bo thứ hai: bo rộng thành 70.01 mm thay vì 66.28 mm. Altium xuất
  // vùng cắt bo (board cutout) đúng kiểu này. Tai bo / rail vẽ riêng thì chỉ CHẠM mép (đỉnh
  // nằm trên cạnh), không lấn vào trong thân bo.
  //
  // Chỉ vòng NHỎ (≤ 10% vòng bị vắt qua; khấc Dao Quoc Thai 5%): hồi quy 523 bộ có panel
  // "PHAONUOC V3.9" nối viền lộn xộn — hai vòng 180 × 50 và 83 × 150 mm chồng lên nhau bị
  // coi nhầm là khấc; "Driver_Lift" có vòng 17% lấn 7.7 mm vào mép, không rõ khấc hay tai bo.
  const STRADDLE_MM = 0.2
  const NOTCH_MAX_RATIO = 0.1
  const straddles = (i: number) => {
    for (let j = 0; j < parts.length; j++) {
      if (j === i || areas[j] <= areas[i] || polys[j].length < 3) continue
      if (areas[i] > areas[j] * NOTCH_MAX_RATIO) continue
      let inDeep = false
      let outDeep = false
      for (const p of polys[i]) {
        const deep = edgeDistance(p, polys[j]) > STRADDLE_MM
        if (!deep) continue
        if (pointInPolygon(p, polys[j])) inDeep = true
        else outDeep = true
        if (inDeep && outDeep) return true
      }
    }
    return false
  }

  const isCutout = (i: number): boolean => {
    if (straddles(i)) return true
    const small = areas[i] / biggest < OUTLINE_CUTOUT_MAX_RATIO
    const host = containerOf(i)
    // Không nằm trong vòng nào: rail thì là thân bo; vòng nhỏ khác vẫn là lỗ như trước
    // (lỗ mouse-bite ở tab giữa các bo không nằm trong bo nào — hồi quy "Dual USB
    // Switch-Panel" mất hơn 30 lỗ khi coi mọi vòng lẻ là thân bo).
    if (host === -1) return small && !railLike(i)
    if (small) return true
    const poly = polys[i]
    if (poly.length < 3) return false
    let inside = 0
    for (const p of copper) {
      if (pointInPolygon(p, poly) && ++inside >= COPPER_POINTS_FOR_BODY) return false
    }
    return true
  }

  // Nét HỞ nằm trong một vòng khác là đường phay/rãnh cắt vẽ bằng một nét (bo
  // "Slaver_Ceiling": đường gấp khúc tách cụm đầu nối). Tô nó thì hai đầu hở bị nối
  // thẳng thành một mảng lạ; khoét thì thủng mất một mảng bo. Chỉ vẽ nét.
  //
  // Chỉ khi hở RÕ: khoảng hở ≥ nửa chiều dài nét (đường phay Slaver: 0.58; vạch V-cut
  // 0.7–0.95). Viền bo con hở một khe nhỏ (panel "SAL-66": 0.04–0.25) vẫn tô như vòng
  // kín — coi nó là nét thì bo con mất nền.
  const isOpen = (i: number) => {
    const segs = (parts[i]?.children ?? []).map((c: any) => c?.segments?.[0]).filter(Boolean)
    if (segs.length === 0) return false
    const a = segs[0].start
    const b = segs[segs.length - 1].end
    const gap = Math.hypot(a[0] - b[0], a[1] - b[1]) * scale
    let len = 0
    for (const sg of segs) len += Math.hypot(sg.end[0] - sg.start[0], sg.end[1] - sg.start[1]) * scale
    return gap > OPEN_GAP_MM && gap >= len * 0.5
  }

  const body: any[] = []
  const cutouts: any[] = []
  const lines: any[] = []
  const notches: any[] = []
  parts.forEach((part, i) => {
    if (isOpen(i) && containerOf(i) !== -1) lines.push(part)
    else if (isCutout(i)) {
      cutouts.push(part)
      if (straddles(i)) notches.push(part)
    } else body.push(part)
  })
  return body.length > 0 ? { body, cutouts, lines, notches } : { body: parts, cutouts: [], lines: [], notches: [] }
}

/** Khoảng cách từ điểm tới cạnh gần nhất của đa giác (cùng đơn vị). */
const edgeDistance = (p: number[], poly: number[][]) => {
  let best = Infinity
  for (let k = 0, m = poly.length - 1; k < poly.length; m = k++) {
    const a = poly[m], b = poly[k]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)))
  }
  return best
}

const bbox = (poly: number[][]): number[] => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of poly) {
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  return [x0, y0, x1, y1]
}

/** Phần ô bao a chồng lên ô b, tính theo diện tích ô a (0..1). */
const overlapRatio = (a: number[], b: number[]) => {
  const w = Math.min(a[2], b[2]) - Math.max(a[0], b[0])
  const h = Math.min(a[3], b[3]) - Math.max(a[1], b[1])
  const area = (a[2] - a[0]) * (a[3] - a[1])
  return w > 0 && h > 0 && area > 0 ? (w * h) / area : 0
}

/**
 * [DQPCB] Trong lớp viền có bao nhiêu BO (để nhắc "file này đã ghép sẵn nhiều bo").
 *
 * Lấy các vòng thân bo của splitOutlineLoops rồi bỏ:
 *  - rail / dải hẹp (cạnh ngắn < 8 mm) — Ceiling Master có 2 rail 5 mm;
 *  - mảnh nhỏ (< 10% vòng lớn nhất);
 *  - khung panel ôm lấy ≥ 2 bo khác.
 * Trả thêm số cột / số hàng (gom tâm theo trục) để điền sẵn ô "số bo mỗi cạnh".
 * CHAT_BOT_1 (Nguyen Van Quang, 22/09/2026): 4 bo ghép mà vẫn đi bảng tra giá bo lẻ.
 */
export const countBoards = (
  layers: { type: string; imageTree?: any }[],
): { count: number; cols: number; rows: number } | null => {
  const ol = layers.find((l) => l.type === 'outline' && l.imageTree?.parts?.length)
  if (!ol) return null
  const scale = ol.imageTree.units === 'in' ? 25.4 : 1
  const parts = ol.imageTree.parts
  const body = parts.length > 1 ? splitOutlineLoops(parts, { scale, copperPoints: copperSamplePoints(layers) }).body : parts
  const boxes = body.map((p: any) => bbox(loopPolygon(p, scale))).filter((b: number[]) => Number.isFinite(b[0]))
  if (boxes.length === 0) return null
  const area = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1])
  const biggest = Math.max(...boxes.map(area))
  let boards = boxes.filter((b: number[]) => Math.min(b[2] - b[0], b[3] - b[1]) >= 8 && area(b) >= biggest * 0.1)
  const centre = (b: number[]) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
  const holds = (outer: number[], inner: number[]) => {
    const [x, y] = centre(inner)
    return inner !== outer && x > outer[0] && x < outer[2] && y > outer[1] && y < outer[3]
  }
  boards = boards.filter((b: number[]) => boards.filter((o: number[]) => holds(b, o)).length < 2)
  if (boards.length === 0) return null

  // Gom tâm theo từng trục: hai tâm cách nhau dưới nửa bề rộng bo là cùng cột/hàng.
  const groups = (vals: number[], tol: number) => {
    const s = [...vals].sort((a, b) => a - b)
    let n = 1
    for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] > tol) n++
    return n
  }
  const medW = boards.map((b: number[]) => b[2] - b[0]).sort((a: number, b: number) => a - b)[Math.floor(boards.length / 2)]
  const medH = boards.map((b: number[]) => b[3] - b[1]).sort((a: number, b: number) => a - b)[Math.floor(boards.length / 2)]
  const cols = groups(boards.map((b: number[]) => centre(b)[0]), medW / 2)
  const rows = groups(boards.map((b: number[]) => centre(b)[1]), medH / 2)
  return { count: boards.length, cols, rows }
}
