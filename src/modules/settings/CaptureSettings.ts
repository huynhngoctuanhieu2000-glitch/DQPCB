/**
 * Cài đặt của ảnh "Copy ảnh 2 mặt": độ đậm logo chìm.
 *
 * Để ở localStorage như cấu hình giá (PricingStore), sửa trong Cài đặt → Ảnh chụp.
 * Chỉ đọc lúc bấm chụp nên không cần listener.
 */

const STORAGE_KEY = 'dqpcb.capture-settings.v1'

export interface CaptureSettingsData {
  /** Độ đậm logo Thiên Lâm đè lên ảnh, 0-100 (%). 8% là mức chốt 19/09/2026. */
  watermarkPercent: number
}

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettingsData = { watermarkPercent: 8 }

const clampPercent = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : DEFAULT_CAPTURE_SETTINGS.watermarkPercent)

const load = (): CaptureSettingsData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CAPTURE_SETTINGS }
    const saved = JSON.parse(raw) as Partial<CaptureSettingsData>
    return { watermarkPercent: clampPercent(Number(saved.watermarkPercent ?? DEFAULT_CAPTURE_SETTINGS.watermarkPercent)) }
  } catch {
    return { ...DEFAULT_CAPTURE_SETTINGS }
  }
}

let current = load()

export const CaptureSettings = {
  get: (): CaptureSettingsData => ({ ...current }),
  set: (next: CaptureSettingsData) => {
    current = { watermarkPercent: clampPercent(next.watermarkPercent) }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
    } catch {
      // localStorage bị chặn — vẫn dùng được trong phiên này.
    }
  },
}
