/**
 * Thông số đặt hàng của một bo — chọn kiểu JLC: vật liệu, số lớp, bề mặt, độ dày bo,
 * độ dày đồng. Đây là thứ người lập chọn; bảng giá thì chỉ biết vài "phương án"
 * (L1/L2/L4/ENIG2/OZ2/FLEX…), nên phải quy đổi.
 *
 * Quy tắc quy đổi (chốt 19/09/2026): tổ hợp nào bảng giá không có thì KHÔNG lấy giá
 * loại khác thay vào — thẻ báo "chưa có công thức" và không ra giá. Bo 6 lớp từng bị
 * báo theo giá 4 lớp mà không ai hay, nên thà không ra giá còn hơn ra giá sai.
 */

export type Material = 'FR4' | 'ALU' | 'FLEX'
export type Finish = 'HASL' | 'HASL_LF' | 'ENIG'

export interface BoardSpec {
  material: Material
  layers: number
  finish: Finish
  /** Độ dày bo, mm. */
  thicknessMm: number
  /** Độ dày đồng, oz. */
  copperOz: number
}

export const MATERIALS: { key: Material; label: string }[] = [
  { key: 'FR4', label: 'FR4' },
  { key: 'ALU', label: 'Nhôm' },
  { key: 'FLEX', label: 'Mạch dẻo' },
]

export const FINISHES: { key: Finish; label: string }[] = [
  { key: 'HASL', label: 'HASL chì' },
  { key: 'HASL_LF', label: 'HASL không chì' },
  { key: 'ENIG', label: 'Mạ vàng ENIG' },
]

export const LAYER_CHOICES = [1, 2, 4, 6, 8, 10, 12, 14, 16]
export const THICKNESS_CHOICES = [0.6, 0.8, 1.0, 1.2, 1.6, 2.0]
export const COPPER_CHOICES = [1, 2, 2.5, 3.5, 4.5]

/** Độ dày bo tính vào giá như nhau; dày hơn mức này thì nhà máy tính khác. */
const THICKNESS_INCLUDED_MAX = 1.6

export const defaultSpec = (layers: number): BoardSpec => ({
  material: 'FR4',
  layers: Math.max(1, layers || 2),
  finish: 'HASL',
  thicknessMm: 1.6,
  copperOz: 1,
})

/**
 * Thông số → khoá phương án trong bảng giá, hoặc null nếu chưa có công thức.
 *
 * `keys` là các phương án đang có trong cấu hình giá; thêm phương án mới vào
 * pricing-rules.json là chỗ này tự dùng được, không phải sửa code (trừ khi tổ hợp mới
 * không nằm trong luật dưới đây).
 */
export const optionForSpec = (spec: BoardSpec, keys: string[]): string | null => {
  const has = (k: string) => (keys.includes(k) ? k : null)

  // Độ dày 0.6–1.6 mm tính như nhau (mức thường gặp); dày hơn chưa có giá.
  if (spec.thicknessMm > THICKNESS_INCLUDED_MAX) return null
  // Bo nhôm chưa có đơn giá trong bảng.
  if (spec.material === 'ALU') return null
  if (spec.material === 'FLEX') return spec.layers <= 2 ? has('FLEX') : null

  // FR4: mạ vàng chỉ có giá cho bo 2 lớp, đồng 1oz.
  if (spec.finish === 'ENIG') return spec.layers === 2 && spec.copperOz === 1 ? has('ENIG2') : null
  // Đồng dày chỉ có giá cho bo 2 lớp. OZ2 = 2oz, OZ2_5 = 2.5oz…
  if (spec.copperOz > 1) {
    if (spec.layers !== 2) return null
    return has(spec.copperOz === 2 ? 'OZ2' : `OZ${String(spec.copperOz).replace('.', '_')}`)
  }
  return has(`L${spec.layers}`)
}

/** Câu mô tả thông số để ghi vào báo giá / cảnh báo. */
export const specSummary = (spec: BoardSpec): string =>
  [
    MATERIALS.find((m) => m.key === spec.material)?.label ?? spec.material,
    `${spec.layers} lớp`,
    FINISHES.find((f) => f.key === spec.finish)?.label ?? spec.finish,
    `${spec.thicknessMm} mm`,
    `${spec.copperOz} oz`,
  ].join(' · ')

/**
 * Những thông số KHÁC mặc định, để ghi vào ô GHI CHÚ của dòng báo giá — mặc định là
 * đúng "THÔNG SỐ MẶC ĐỊNH" in sẵn trên báo giá (FR4 · 1.6 mm · 1 oz · mạ thiếc HASL),
 * nên thông số trùng thì khỏi ghi. Số lớp và màu bo đã có cột riêng nên không ghi.
 * Vd bo mạ vàng 0.8 mm đồng 2 oz → ["Mạ vàng ENIG", "Bo 0.8mm", "Đồng 2oz"].
 */
export const specNoteParts = (spec: BoardSpec): string[] => {
  const d = defaultSpec(spec.layers)
  const parts: string[] = []
  if (spec.material !== d.material) parts.push(MATERIALS.find((m) => m.key === spec.material)?.label ?? spec.material)
  if (spec.finish !== d.finish) parts.push(FINISHES.find((f) => f.key === spec.finish)?.label ?? spec.finish)
  if (spec.thicknessMm !== d.thicknessMm) parts.push(`Bo ${spec.thicknessMm}mm`)
  if (spec.copperOz !== d.copperOz) parts.push(`Đồng ${spec.copperOz}oz`)
  return parts
}
