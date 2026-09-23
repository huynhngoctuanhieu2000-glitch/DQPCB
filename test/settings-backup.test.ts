/**
 * Sao lưu / khôi phục cấu hình: file xuất ra phải nhập lại được y nguyên, và file lạ
 * phải bị từ chối kèm lý do đọc được — không được ghi đè bảng giá đang dùng.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { applyBackup, backupFileName, buildBackup, describeBackup, parseBackup } from '../src/modules/settings/backup'
import { PricingStore } from '../src/modules/pricing/PricingStore'
import { CaptureSettings } from '../src/modules/settings/CaptureSettings'
import { DEFAULT_CONFIG } from '../src/modules/pricing/PricingModel'

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

describe('Sao lưu cấu hình', () => {
  it('xuất rồi nhập lại thì bảng giá về đúng như cũ', () => {
    const cfg = clone(DEFAULT_CONFIG)
    cfg.table.tiers[0].priceVnd = 999_000
    cfg.stencil.tiers = cfg.stencil.tiers.slice(0, 2)
    PricingStore.setConfig(cfg)
    CaptureSettings.set({ watermarkPercent: 42 })

    const file = JSON.stringify(buildBackup())

    // người dùng lỡ tay đưa hết về mặc định
    PricingStore.setConfig(clone(DEFAULT_CONFIG))
    CaptureSettings.set({ watermarkPercent: 8 })
    expect(PricingStore.getConfig().table.tiers[0].priceVnd).not.toBe(999_000)

    applyBackup(parseBackup(file))
    expect(PricingStore.getConfig().table.tiers[0].priceVnd).toBe(999_000)
    expect(PricingStore.getConfig().stencil.tiers.length).toBe(2)
    expect(CaptureSettings.get().watermarkPercent).toBe(42)
  })

  it('file JSON khác (báo giá, gerber…) bị từ chối, cấu hình đang dùng không đổi', () => {
    const cfg = clone(DEFAULT_CONFIG)
    cfg.table.tiers[0].priceVnd = 123_000
    PricingStore.setConfig(cfg)

    for (const bad of ['{"items":[]}', 'không phải json', '{"app":"khac","version":1}']) {
      expect(() => parseBackup(bad)).toThrow()
    }
    expect(PricingStore.getConfig().table.tiers[0].priceVnd).toBe(123_000)
  })

  it('bản lưu đời mới hơn app thì báo rõ thay vì nhập bừa', () => {
    const future = JSON.stringify({ ...buildBackup(), version: 99 })
    expect(() => parseBackup(future)).toThrow(/mới hơn app/)
  })

  it('bản lưu thiếu trường mới vẫn nhập được (trộn lên bản mặc định)', () => {
    const old = JSON.stringify({ app: 'dqpcb-settings', version: 1, pricing: { table: DEFAULT_CONFIG.table } })
    const b = parseBackup(old)
    expect(b.pricing.formula).toBeTruthy()
    expect(b.capture.watermarkPercent).toBe(8)
  })

  it('tên file có ngày, đuôi .json', () => {
    expect(backupFileName(new Date(2026, 8, 23))).toBe('DQPCB cau hinh 23-09-2026.json')
  })

  it('mô tả bản lưu nói rõ có bao nhiêu mốc giá — để còn biết mà xác nhận', () => {
    const text = describeBackup(buildBackup())
    expect(text).toMatch(/mốc bảng giá PCB/)
    expect(text).toMatch(/cỡ stencil/)
  })
})
