/**
 * Kiểu dữ liệu công khai của thư viện đọc Gerber.
 *
 * [DQPCB] Toàn bộ file này là của DQPCB.
 */

export interface ParsedGerberLayer {
  id: string
  filename: string
  /** Tên rút gọn (đã bỏ tiền tố chung của cả bộ file) dùng để phân biệt trên UI */
  shortName: string
  displayName: string
  type: string
  side: string
  color: string
  order: number
  visible: boolean
  size: [number, number, number, number] // [minX, minY, maxX, maxY] in mm
  units: 'mm' | 'in'
  outlineMaxStroke?: number
  /**
   * Hình học đã plot (ImageTree của web-gerber), dùng lại cho viewer thay vì parse lần
   * hai. Trước đây viewer tự parse từ rawFiles, và hai đường đi đã lệch nhau hai lần:
   * một lần ở phân loại lớp, một lần ở chuẩn hoá file khoan.
   */
  imageTree: any
  /** Số lỗ khoan (chỉ có ý nghĩa với layer type 'drill') */
  holeCount: number
  /** File khoan chỉ chứa lỗ mạ / lỗ không mạ / cả hai — xem drillPlatingOf. */
  drillPlating?: 'PTH' | 'NPTH' | 'mixed'
}

export interface BoardParsedData {
  projectName: string
  /** Tên file archive nguồn; rỗng nếu là các file gerber rời. */
  sourceFile?: string
  layers: ParsedGerberLayer[]
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
    widthMM: number
    heightMM: number
  }
  layerCount: number
  drillCount: number
  /** File phụ trợ bị bỏ qua (report, aperture list, BOM…) */
  ignoredFiles: string[]
  /** File có vẻ là Gerber/Drill nhưng parser không đọc được */
  failedFiles: { name: string; reason: string }[]
}


/** Kết quả nhận diện một file: loại lớp, mặt bo, tên hiển thị, màu và thứ tự vẽ. */
export interface LayerMeta {
  type: string
  side: string
  displayName: string
  color: string
  order: number
}
