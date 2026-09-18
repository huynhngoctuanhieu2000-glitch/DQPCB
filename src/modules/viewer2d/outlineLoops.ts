/**
 * Chia các vòng của lớp outline thành phần THÂN BO và phần LỖ KHOÉT.
 *
 * Lớp outline có thể chứa nhiều vòng kín vì hai lý do khác hẳn nhau:
 *  - bo có lỗ phay bên trong (lỗ bắt ốc, rãnh cắm LED… không nằm trong file khoan vì
 *    quá to so với mũi khoan) — phải thủng;
 *  - tấm panel gồm nhiều bo con cộng khung ngoài — mỗi vòng là một miếng vật liệu
 *    thật, phải đặc.
 *
 * Hai dấu hiệu, dấu nào trúng trước thì kết luận:
 *  1. Độ lớn tương đối: lỗ phay thường bé xíu so với bo (lỗ 3.2 mm trên bo 121×86 mm
 *     chỉ chiếm 0.08%), còn một bo con trong panel 9 bo chiếm cỡ 11%. Dưới 5% là lỗ.
 *  2. Có LINH KIỆN/MẠCH bên trong hay không: bo con trong panel thì đầy pad và đường
 *     mạch; lỗ khoét thì không có gì để hàn. Bo LED "3W NHUA XANH" có rãnh cắm LED
 *     chiếm 9.1% — quá mốc 5% — bên trong không một pad hay đường mạch nào: đó là lỗ.
 *
 *     Đếm pad (imageShape) và đường mạch (imagePath), KHÔNG đếm mảng phủ (imageRegion):
 *     CAM350 hay vẽ phủ đồng tràn qua cả chỗ sẽ phay bỏ — chính rãnh LED trên có 29
 *     đỉnh mảng phủ nằm trong mà vẫn là lỗ. Chỉ xét vòng nằm trong vòng lớn nhất, và
 *     đòi ít nhất 3 điểm mới tính, để một pad lạc sát mép không làm lỗ hoá thành thân.
 */
export const OUTLINE_CUTOUT_MAX_RATIO = 0.05
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
): { body: any[]; cutouts: any[] } => {
  if (!Array.isArray(parts) || parts.length < 2) return { body: parts ?? [], cutouts: [] }
  const areas = parts.map(loopArea)
  const biggest = Math.max(...areas)
  if (!(biggest > 0)) return { body: parts, cutouts: [] }

  const scale = opts.scale ?? 1
  const copper = opts.copperPoints ?? []
  const outerIdx = areas.indexOf(biggest)
  const outer = loopPolygon(parts[outerIdx], scale)

  const isCutout = (part: any, i: number): boolean => {
    if (i === outerIdx) return false
    if (areas[i] / biggest < OUTLINE_CUTOUT_MAX_RATIO) return true
    const poly = loopPolygon(part, scale)
    if (poly.length < 3 || !pointInPolygon(poly[0], outer)) return false
    let inside = 0
    for (const p of copper) {
      if (pointInPolygon(p, poly) && ++inside >= COPPER_POINTS_FOR_BODY) return false
    }
    return true
  }

  const body: any[] = []
  const cutouts: any[] = []
  parts.forEach((part, i) => (isCutout(part, i) ? cutouts : body).push(part))
  return body.length > 0 ? { body, cutouts } : { body: parts, cutouts: [] }
}
