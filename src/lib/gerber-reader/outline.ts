/**
 * Viền bo dự phòng: lấy nét Profile lẫn trong lớp khác, hoặc ước lượng từ khung lớp
 * đồng khi bộ file không có viền.
 *
 * [DQPCB] Toàn bộ file này là của DQPCB (dùng createParser/plot của web-gerber để dựng).
 */
import { createParser, plot } from '../webgerber'
import type { ParsedGerberLayer } from './types'
import { META } from './identify'
import { flattenArcs, stitchOutline } from './geometry'

/** Tên file giả của lớp viền tự dựng — UI dùng để nhận ra đây không phải file thật. */
export const ESTIMATED_OUTLINE_FILE = '(viền bo ước lượng)'

/**
 * Giữ lại đúng những nét vẽ bằng aperture khai `AperFunction,Profile` (viền bo), bỏ
 * mọi nét khác. Trả null nếu file không có aperture Profile nào.
 *
 * Pulsonix/DesignSpark không có lớp viền riêng khi không xuất "(Board).gbr" — viền nằm
 * lẫn trong "(Documentation).gbr" cùng chữ ghi chú. Lấy nguyên lớp đó thì dính cả chữ;
 * lấy khung lớp đồng thì sai hẳn vì đồng có thứ nằm ngoài bo (một bo Pulsonix ra 319×162
 * trong khi viền thật 143×103).
 *
 * Nét bị bỏ không xoá đi mà đổi thành lệnh di chuyển D02: toạ độ Gerber là modal
 * ("Y115591D01*" dùng lại X của lệnh trước), xoá đi thì các nét Profile phía sau lệch chỗ.
 */
export const extractProfileGerber = (content: string): string | null => {
  const profileApertures = new Set<string>()
  let attr = ''
  // Lượt 1: aperture nào mang chức năng Profile. Thuộc tính TA đứng trước %ADD và còn
  // hiệu lực tới khi gặp TD — cả dạng %…% lẫn dạng chú thích "G04 #@! …".
  for (const m of content.matchAll(/(?:%|#@!\s*)TA\.AperFunction,([A-Za-z]+)|(?:%|#@!\s*)TD(?:\.AperFunction)?\s*\*|%ADD(\d+)/g)) {
    if (m[1]) attr = m[1].toLowerCase()
    else if (m[2]) {
      if (attr === 'profile') profileApertures.add(String(parseInt(m[2], 10)))
    } else attr = ''
  }
  if (profileApertures.size === 0) return null

  // Lượt 2: duyệt từng câu lệnh, câu nào vẽ bằng aperture khác thì đổi thành D02.
  let current = ''
  let inRegion = false
  const out: string[] = []
  for (const stmt of content.match(/%[^%]*%|[^%*]+\*/g) ?? []) {
    const s = stmt.trim()
    if (s.startsWith('%') || /^G0?4/.test(s)) { out.push(s); continue } // header, chú thích
    if (/^G36\*$/.test(s)) { inRegion = true; continue } // vùng tô đặc không phải viền
    if (/^G37\*$/.test(s)) { inRegion = false; continue }
    const sel = s.match(/^(?:G54)?D(\d{2,})\*$/)
    if (sel) { current = String(parseInt(sel[1], 10)); out.push(s); continue }
    const keep = !inRegion && profileApertures.has(current)
    if (keep || !/[XYIJ]/.test(s)) { out.push(s); continue }
    // Có toạ độ: giữ vị trí, bỏ nét.
    out.push(/D0?[123]\*$/.test(s) ? s.replace(/D0?[123]\*$/, 'D02*') : s.replace(/\*$/, 'D02*'))
  }
  return out.join('\n')
}

/** Parse → plot → nối nét như một lớp viền thật, để viewer xử lý y hệt. */
export const plotOutline = (text: string) => {
  const parser = createParser()
  parser.feed(text.replace(/(%ADD\d+[A-Za-z]*),[ \t]+/g, '$1,'))
  const imageTree = flattenArcs(stitchOutline(plot(parser.result(), true)))
  const s = imageTree.size
  const size: [number, number, number, number] =
    s && s.length === 4 ? [s[0], s[1], s[2], s[3]] : [0, 0, 0, 0]
  let outlineMaxStroke = 0
  for (const child of imageTree.children ?? []) {
    if (child.type === 'imagePath' && typeof child.width === 'number') {
      outlineMaxStroke = Math.max(outlineMaxStroke, child.width)
    }
  }
  return { imageTree, size, units: (imageTree.units || 'mm') as 'mm' | 'in', outlineMaxStroke }
}

/**
 * Dựng lớp viền hình chữ nhật từ khung bo (mm), đi đúng đường parse → plot → nối nét
 * như một lớp viền thật để viewer xử lý y hệt.
 */
export const buildEstimatedOutline = (
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  usedIds: Set<string>
): ParsedGerberLayer => {
  // Định dạng 4.6 mm: toạ độ là số nguyên micromet-phần-nghìn, đủ mịn và không cần dấu chấm.
  const c = (v: number) => String(Math.round(v * 1e6))
  const pt = (x: number, y: number, d: string) => `X${c(x)}Y${c(y)}${d}*`
  const STROKE = 0.1
  const text = [
    '%FSLAX46Y46*%',
    '%MOMM*%',
    `%ADD10C,${STROKE}*%`,
    'D10*',
    pt(minX, minY, 'D02'),
    pt(maxX, minY, 'D01'),
    pt(maxX, maxY, 'D01'),
    pt(minX, maxY, 'D01'),
    pt(minX, minY, 'D01'),
    'M02*',
  ].join('\n')

  const parser = createParser()
  parser.feed(text)
  const imageTree = flattenArcs(stitchOutline(plot(parser.result(), true)))

  let id = ESTIMATED_OUTLINE_FILE
  while (usedIds.has(id)) id += '#'
  usedIds.add(id)

  return {
    id,
    filename: ESTIMATED_OUTLINE_FILE,
    shortName: ESTIMATED_OUTLINE_FILE,
    ...META.outline,
    displayName: 'Outline (ước lượng)',
    visible: true,
    size: [minX - STROKE / 2, minY - STROKE / 2, maxX + STROKE / 2, maxY + STROKE / 2],
    units: 'mm',
    outlineMaxStroke: STROKE,
    imageTree,
    holeCount: 0,
  }
}
