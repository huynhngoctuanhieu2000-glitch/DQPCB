/**
 * Sao lưu / khôi phục cấu hình của app (bảng giá PCB, bảng giá stencil, cài đặt ảnh chụp).
 *
 * Cấu hình chỉ nằm trong localStorage của từng máy: xoá dữ liệu trình duyệt, đổi máy, hay
 * dùng điện thoại là mất — mà bảng giá là thứ gõ tay lâu nhất. Ở đây xuất ra một file JSON
 * để cất/gửi, và nhập lại được.
 *
 * File có `app` và `version` để sau này đổi cấu trúc còn nhận ra bản cũ; nhập nhầm file
 * khác (báo giá, gerber…) thì báo lỗi rõ chứ không ghi đè cấu hình đang dùng.
 */
import { DEFAULT_CONFIG, type PricingConfig } from '../pricing/PricingModel'
import { PricingStore } from '../pricing/PricingStore'
import { CaptureSettings, DEFAULT_CAPTURE_SETTINGS, type CaptureSettingsData } from './CaptureSettings'

const APP = 'dqpcb-settings'
const VERSION = 1

export interface SettingsBackup {
  app: typeof APP
  version: number
  /** Lúc xuất, giờ máy người dùng — chỉ để đọc, không dùng để so sánh. */
  exportedAt: string
  pricing: PricingConfig
  capture: CaptureSettingsData
}

export const buildBackup = (): SettingsBackup => ({
  app: APP,
  version: VERSION,
  exportedAt: new Date().toISOString(),
  pricing: PricingStore.getConfig(),
  capture: CaptureSettings.get(),
})

/** Tên file gợi ý: có ngày để cất nhiều bản. */
export const backupFileName = (d = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `DQPCB cau hinh ${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}.json`
}

/**
 * Đọc nội dung file sao lưu. Ném lỗi kèm lý do đọc được cho người dùng nếu file không
 * phải bản sao lưu của app.
 */
export const parseBackup = (text: string): SettingsBackup => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('File không phải JSON — chọn đúng file .json đã xuất từ Cài đặt.')
  }
  const o = data as Partial<SettingsBackup> | null
  if (!o || typeof o !== 'object' || o.app !== APP) {
    throw new Error('File này không phải bản sao lưu cấu hình DQPCB.')
  }
  if (typeof o.version !== 'number' || o.version > VERSION) {
    throw new Error(`Bản sao lưu đời ${String(o.version)} mới hơn app — cập nhật app rồi nhập lại.`)
  }
  if (!o.pricing || typeof o.pricing !== 'object') {
    throw new Error('Bản sao lưu thiếu phần bảng giá.')
  }
  return {
    app: APP,
    version: o.version,
    exportedAt: typeof o.exportedAt === 'string' ? o.exportedAt : '',
    // Trộn lên bản mặc định: bản lưu cũ thiếu trường mới vẫn dùng được.
    pricing: { ...DEFAULT_CONFIG, ...o.pricing },
    capture: { ...DEFAULT_CAPTURE_SETTINGS, ...(o.capture ?? {}) },
  }
}

/** Ghi bản sao lưu vào app (thay cấu hình đang dùng). */
export const applyBackup = (b: SettingsBackup) => {
  PricingStore.setConfig(b.pricing)
  CaptureSettings.set(b.capture)
}

/** Mô tả ngắn để hỏi lại trước khi ghi đè: bản này có gì. */
export const describeBackup = (b: SettingsBackup): string => {
  const when = b.exportedAt ? new Date(b.exportedAt).toLocaleString('vi-VN') : 'không rõ ngày'
  const tiers = b.pricing.table?.tiers?.length ?? 0
  const stencil = b.pricing.stencil?.tiers?.length ?? 0
  return `Bản lưu ${when} · ${tiers} mốc bảng giá PCB · ${stencil} cỡ stencil`
}
