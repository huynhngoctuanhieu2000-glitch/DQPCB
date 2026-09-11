/**
 * Giữ cấu hình giá đang dùng: JSON mặc định + phần người dùng sửa trong Cài đặt.
 *
 * Cùng khuôn với BoardDataModel — một biến module, một danh sách listener, một hàm
 * notify. Không dùng context React để chỗ nào cũng gọi được, kể cả ngoài cây component.
 *
 * Phần sửa nằm ở localStorage chứ không ghi đè pricing-rules.json: file JSON là bản
 * gốc theo repo, người dùng sửa gì cũng hoàn về được bằng resetToDefault().
 */
import { DEFAULT_CONFIG, type PricingConfig } from './PricingModel'

const STORAGE_KEY = 'dqpcb.pricing-config.v1'

type Listener = (cfg: PricingConfig) => void

const clone = (cfg: PricingConfig): PricingConfig =>
  typeof structuredClone === 'function'
    ? structuredClone(cfg)
    : (JSON.parse(JSON.stringify(cfg)) as PricingConfig)

/**
 * Trộn bản lưu lên bản mặc định. Chỉ nhận những khoá mà bản mặc định có — thêm
 * trường mới vào JSON thì bản lưu cũ vẫn dùng được, không phải xoá localStorage.
 * Mảng thì thay nguyên cụm, không trộn từng phần tử: sửa bảng giá là sửa cả bảng.
 */
const mergeDeep = <T>(base: T, patch: unknown): T => {
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) {
    return (patch === undefined ? base : (patch as T))
  }
  if (base === null || typeof base !== 'object' || Array.isArray(base)) {
    return patch as T
  }
  const out = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (!(k in out)) continue // khoá lạ trong bản lưu — bỏ qua
    out[k] = mergeDeep(out[k], v)
  }
  return out as T
}

const load = (): PricingConfig => {
  const fallback = clone(DEFAULT_CONFIG)
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    return mergeDeep(fallback, JSON.parse(raw))
  } catch {
    // localStorage bị chặn, hoặc bản lưu hỏng — chạy bằng bản mặc định còn hơn là chết.
    return fallback
  }
}

let config: PricingConfig = load()
const listeners = new Set<Listener>()

const notify = () => {
  for (const fn of listeners) fn(config)
}

const persist = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {
    // Hết chỗ hoặc bị chặn. Cấu hình trong phiên này vẫn đúng, chỉ là không nhớ được.
  }
}

export const PricingStore = {
  getConfig: (): PricingConfig => config,

  subscribe(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  /** Thay cả cấu hình — dùng khi Cài đặt bấm Lưu. */
  setConfig(next: PricingConfig) {
    config = clone(next)
    persist()
    notify()
  },

  /** Về đúng pricing-rules.json, bỏ mọi chỉnh sửa đã lưu. */
  resetToDefault() {
    config = clone(DEFAULT_CONFIG)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // không xoá được thì thôi, setConfig sau sẽ ghi đè
    }
    notify()
  },

  /** Cấu hình hiện tại có khác bản mặc định không — để Cài đặt hiện dấu "đã sửa". */
  isModified(): boolean {
    return JSON.stringify(config) !== JSON.stringify(DEFAULT_CONFIG)
  },
}
