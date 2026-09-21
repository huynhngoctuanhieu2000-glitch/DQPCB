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
): { body: any[]; cutouts: any[]; lines: any[] } => {
  if (!Array.isArray(parts) || parts.length < 2) return { body: parts ?? [], cutouts: [], lines: [] }
  const areas = parts.map(loopArea)
  const biggest = Math.max(...areas)
  if (!(biggest > 0)) return { body: parts, cutouts: [], lines: [] }

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
      if (!boxInside(boxes[i], boxes[j], 0.01)) continue
      const c = [(boxes[i][0] + boxes[i][2]) / 2, (boxes[i][1] + boxes[i][3]) / 2]
      // Tâm ô bao của lỗ tròn/chữ nhật nằm trong chính nó; lỗ hình chữ C thì tâm có thể
      // rơi ra ngoài lỗ nhưng vẫn trong vòng chứa — đúng thứ cần biết ở đây.
      if (!pointInPolygon(c, polys[j]) && !pointInPolygon(polys[i][0], polys[j])) continue
      if (best === -1 || areas[j] < areas[best]) best = j
    }
    return best
  }

  const isCutout = (i: number): boolean => {
    const host = containerOf(i)
    if (host === -1) return false
    if (areas[i] / areas[host] < OUTLINE_CUTOUT_MAX_RATIO) return true
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
  const isOpen = (i: number) => {
    const ch = parts[i]?.children ?? []
    const a = ch[0]?.segments?.[0]?.start
    const b = ch[ch.length - 1]?.segments?.[0]?.end
    return !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) * scale > OPEN_GAP_MM
  }

  const body: any[] = []
  const cutouts: any[] = []
  const lines: any[] = []
  parts.forEach((part, i) => {
    if (isOpen(i) && containerOf(i) !== -1) lines.push(part)
    else (isCutout(i) ? cutouts : body).push(part)
  })
  return body.length > 0 ? { body, cutouts, lines } : { body: parts, cutouts: [], lines: [] }
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

/** Ô a nằm trọn trong ô b (cho lệch `tol` mm ở mép — hai vòng chung cạnh). */
const boxInside = (a: number[], b: number[], tol: number) =>
  a[0] >= b[0] - tol && a[1] >= b[1] - tol && a[2] <= b[2] + tol && a[3] <= b[3] + tol
