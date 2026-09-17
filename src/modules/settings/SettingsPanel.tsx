/**
 * Cài đặt — hiện chỉ có một mục: Công thức tính tiền.
 *
 * Mọi con số của sheet giá nằm ở đây, không nằm trong code. Sửa xong bấm Lưu thì
 * PricingStore ghi vào localStorage và thẻ tính giá đổi theo ngay.
 *
 * Bảng "Đối chiếu sheet" ở cuối chạy lại bảy ca của mục 07 báo cáo với chính cấu hình
 * đang sửa dở. Chỉnh một hằng số làm lệch giá so với sheet thì thấy đỏ ngay tại chỗ,
 * không phải chờ tới lúc báo giá cho khách mới biết.
 */
import React, { useMemo, useState } from 'react'
import { PricingStore } from '../pricing/PricingStore'
import {
  DEFAULT_CONFIG,
  priceFromFormula,
  type PriceMode,
  type PricingConfig,
} from '../pricing/PricingModel'

const money = (n: number) => Math.round(n).toLocaleString('vi-VN')

const num = (raw: string, fallback: number): number => {
  const s = raw.replace(/[^\d.,-]/g, '').replace(',', '.')
  const n = Number(s)
  return s === '' || !Number.isFinite(n) ? fallback : n
}

/** Bảng 6 mục 07 — giá trị lấy thẳng từ sheet, dùng làm mốc đối chiếu. */
const SHEET_CASES: { id: string; option: string; mode: PriceMode; priceVnd: number }[] = [
  { id: 'T1', option: 'L2', mode: 'tiered', priceVnd: 3718000 },
  { id: 'T2', option: 'L2', mode: 'flat', priceVnd: 4446000 },
  { id: 'T3', option: 'L1', mode: 'flat', priceVnd: 3770000 },
  { id: 'T4', option: 'L4', mode: 'flat', priceVnd: 6218000 },
  { id: 'T5', option: 'ENIG2', mode: 'flat', priceVnd: 5850000 },
  { id: 'T6', option: 'OZ2', mode: 'flat', priceVnd: 5922000 },
  { id: 'T7', option: 'FLEX', mode: 'flat', priceVnd: 7348000 },
]

export const SettingsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [cfg, setCfg] = useState<PricingConfig>(() =>
    JSON.parse(JSON.stringify(PricingStore.getConfig())),
  )
  const [saved, setSaved] = useState(false)
  /** Hai trang giá tách riêng: mạch in và stencil là hai bảng giá không liên quan nhau. */
  const [page, setPage] = useState<'pcb' | 'stencil'>('pcb')

  /** Sửa sâu trong cây cấu hình mà không phải viết spread lồng bốn tầng ở mỗi ô. */
  const edit = (fn: (draft: PricingConfig) => void) => {
    setCfg((prev) => {
      const next: PricingConfig = JSON.parse(JSON.stringify(prev))
      fn(next)
      return next
    })
    setSaved(false)
  }

  const checks = useMemo(
    () =>
      SHEET_CASES.map((c) => {
        try {
          const r = priceFromFormula(
            { boardW: 20, boardH: 35, qty: 15, option: c.option, mode: c.mode },
            cfg,
          )
          return { ...c, got: r.priceVnd, ok: r.priceVnd === c.priceVnd, err: null as string | null }
        } catch (e) {
          return { ...c, got: 0, ok: false, err: e instanceof Error ? e.message : String(e) }
        }
      }),
    [cfg],
  )
  const drift = checks.filter((c) => !c.ok).length

  const F = cfg.formula
  const T = F.tiered

  return (
    <div style={S.backdrop} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.headerTitle}>⚙ Cài đặt</span>
          <span style={S.headerSub}>Công thức tính tiền</span>
          <div style={S.tabs}>
            {(
              [
                ['pcb', 'PCB'],
                ['stencil', 'Stencil'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setPage(key)}
                style={{ ...S.tab, ...(page === key ? S.tabOn : null) }}
              >
                {label}
              </button>
            ))}
          </div>
          <button style={S.close} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={S.body}>
          {page === 'stencil' ? (
            <StencilSection cfg={cfg} edit={edit} />
          ) : (
          <>
          {/* ── Bảng giá cố định ────────────────────────── */}
          <Section
            title="Bảng giá dưới 10×10 cm (không ghép panel)"
            note="Giá là THÀNH TIỀN cả đơn, không phải đơn giá. Nhà máy chỉ nhận đúng các mốc số lượng này — số lượng khác app sẽ báo ngoài bảng để nhập tay. Bảng chỉ có một cột giá nên chỉ áp cho đúng một loại bo; chọn loại khác thì app tự chuyển sang công thức."
          >
            <div style={S.rowWrap}>
              <NumField
                label="Cạnh tối đa (mm)"
                value={cfg.table.maxWidthMm}
                onChange={(v) => edit((d) => void (d.table.maxWidthMm = v))}
              />
              <NumField
                label="Cạnh còn lại tối đa (mm)"
                value={cfg.table.maxHeightMm}
                onChange={(v) => edit((d) => void (d.table.maxHeightMm = v))}
              />
              <div style={S.field}>
                <span style={S.fieldLabel}>Bảng này áp cho loại bo</span>
                <select
                  style={S.input}
                  value={cfg.table.coversOption}
                  onChange={(e) => edit((d) => void (d.table.coversOption = e.target.value))}
                >
                  {cfg.options.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Số lượng (pcs)</th>
                  <th style={S.th}>Thành tiền (đ)</th>
                  <th style={S.th}>Đơn giá</th>
                  <th style={S.th} />
                </tr>
              </thead>
              <tbody>
                {cfg.table.tiers.map((t, i) => (
                  <tr key={i}>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={t.qty}
                        onChange={(e) =>
                          edit((d) => void (d.table.tiers[i].qty = Math.round(num(e.target.value, t.qty))))
                        }
                      />
                    </td>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={money(t.priceVnd)}
                        onChange={(e) =>
                          edit(
                            (d) =>
                              void (d.table.tiers[i].priceVnd = Math.round(
                                num(e.target.value.replace(/\./g, ''), t.priceVnd),
                              )),
                          )
                        }
                      />
                    </td>
                    <td style={{ ...S.td, color: '#64748b', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {t.qty > 0 ? `${money(t.priceVnd / t.qty)} đ/pcs` : '—'}
                    </td>
                    <td style={{ ...S.td, width: 28 }}>
                      <button
                        style={S.rowDel}
                        title="Xoá mốc này"
                        onClick={() => edit((d) => void d.table.tiers.splice(i, 1))}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              style={S.addRow}
              onClick={() =>
                edit((d) => {
                  const last = d.table.tiers[d.table.tiers.length - 1]
                  d.table.tiers.push({ qty: last ? last.qty + 50 : 5, priceVnd: 0 })
                })
              }
            >
              + Thêm mốc
            </button>
          </Section>

          {/* ── Hằng số chung ──────────────────────────── */}
          <Section
            title="Công thức theo kích thước — hằng số chung"
            note="Sheet gốc có hai tỉ giá khác nhau ở hai đường giá (F-01). Đang giữ nguyên như sheet để bảy ca đối chiếu bên dưới khớp 100%; muốn thống nhất về một số thì sửa cả hai ô cho bằng nhau."
          >
            <div style={S.rowWrap}>
              <NumField
                label="Tỉ giá — đường phẳng (đ/¥)"
                value={F.vndPerCny}
                onChange={(v) => edit((d) => void (d.formula.vndPerCny = v))}
              />
              <NumField
                label="Hệ số phẳng"
                value={F.flatMarkup}
                onChange={(v) => edit((d) => void (d.formula.flatMarkup = v))}
              />
              <NumField
                label="Hệ số lãi chung"
                value={F.marginMultiplier}
                onChange={(v) => edit((d) => void (d.formula.marginMultiplier = v))}
              />
              <NumField
                label="Mốc đổi nhánh (pcs)"
                value={F.qtyBreak}
                onChange={(v) => edit((d) => void (d.formula.qtyBreak = v))}
              />
              <NumField
                label="Thuế suất (%)"
                value={+(F.vatRate * 100).toFixed(2)}
                onChange={(v) => edit((d) => void (d.formula.vatRate = v / 100))}
              />
              <NumField
                label="Làm tròn đơn giá (đ)"
                value={F.unitRoundVnd}
                onChange={(v) => edit((d) => void (d.formula.unitRoundVnd = v))}
              />
              <div style={S.field}>
                <span style={S.fieldLabel}>Đường giá mặc định</span>
                <select
                  style={S.input}
                  value={F.defaultMode}
                  onChange={(e) =>
                    edit((d) => void (d.formula.defaultMode = e.target.value as PriceMode))
                  }
                >
                  <option value="flat">Hệ số phẳng (P3)</option>
                  <option value="tiered">Bậc thang (I3)</option>
                </select>
              </div>
            </div>
          </Section>

          <Section title="Khối lượng & phí bo lớn">
            <div style={S.rowWrap}>
              <NumField
                label="kg / cm²"
                value={F.weight.kgPerCm2}
                onChange={(v) => edit((d) => void (d.formula.weight.kgPerCm2 = v))}
              />
              <NumField
                label="Bao bì (kg)"
                value={F.weight.packingKg}
                onChange={(v) => edit((d) => void (d.formula.weight.packingKg = v))}
              />
              <NumField
                label="Ngưỡng bo lớn (cm²)"
                value={F.bigBoard.thresholdCm2}
                onChange={(v) => edit((d) => void (d.formula.bigBoard.thresholdCm2 = v))}
              />
              <NumField
                label="Bậc (cm²)"
                value={F.bigBoard.stepCm2}
                onChange={(v) => edit((d) => void (d.formula.bigBoard.stepCm2 = v))}
              />
              <NumField
                label="¥ mỗi bậc"
                value={F.bigBoard.cnyPerStep}
                onChange={(v) => edit((d) => void (d.formula.bigBoard.cnyPerStep = v))}
              />
              <NumField
                label="Chia diện tích"
                value={F.bigBoard.areaDivisor}
                onChange={(v) => edit((d) => void (d.formula.bigBoard.areaDivisor = v))}
              />
            </div>
          </Section>

          <Section
            title="Đường giá bậc thang"
            note="Cước nội địa Trung Quốc theo kg, cộng giá vốn, quy đổi, cộng cước quốc tế và phí cố định, rồi nhân hệ số lãi giảm dần theo giá trị đơn."
          >
            <div style={S.rowWrap}>
              <NumField
                label="Tỉ giá — bậc thang (đ/¥)"
                value={T.vndPerCny}
                onChange={(v) => edit((d) => void (d.formula.tiered.vndPerCny = v))}
              />
              <NumField
                label="Cước nội địa nền (¥)"
                value={T.domesticShip.baseCny}
                onChange={(v) => edit((d) => void (d.formula.tiered.domesticShip.baseCny = v))}
              />
              <NumField
                label="kg đầu tiên"
                value={T.domesticShip.firstKg}
                onChange={(v) => edit((d) => void (d.formula.tiered.domesticShip.firstKg = v))}
              />
              <NumField
                label="Bậc kg"
                value={T.domesticShip.stepKg}
                onChange={(v) => edit((d) => void (d.formula.tiered.domesticShip.stepKg = v))}
              />
              <NumField
                label="¥ mỗi bậc kg"
                value={T.domesticShip.cnyPerStep}
                onChange={(v) => edit((d) => void (d.formula.tiered.domesticShip.cnyPerStep = v))}
              />
              <NumField
                label="Cước quốc tế (đ/kg)"
                value={T.freightVndPerKg}
                onChange={(v) => edit((d) => void (d.formula.tiered.freightVndPerKg = v))}
              />
              <NumField
                label="Phí cố định (đ)"
                value={T.fixedFeeVnd}
                onChange={(v) => edit((d) => void (d.formula.tiered.fixedFeeVnd = v))}
              />
              <NumField
                label="Hệ số cuối"
                value={T.finalFactor}
                onChange={(v) => edit((d) => void (d.formula.tiered.finalFactor = v))}
              />
            </div>

            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Đơn dưới (đ)</th>
                  <th style={S.th}>Hệ số lãi</th>
                </tr>
              </thead>
              <tbody>
                {T.tiers.map((t, i) => (
                  <tr key={i}>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={t.maxVnd === null ? 'không trần' : money(t.maxVnd)}
                        disabled={t.maxVnd === null}
                        onChange={(e) =>
                          edit(
                            (d) =>
                              void (d.formula.tiered.tiers[i].maxVnd = Math.round(
                                num(e.target.value.replace(/\./g, ''), t.maxVnd ?? 0),
                              )),
                          )
                        }
                      />
                    </td>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={t.factor}
                        onChange={(e) =>
                          edit(
                            (d) =>
                              void (d.formula.tiered.tiers[i].factor = num(e.target.value, t.factor)),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* ── Bảng phương án ─────────────────────────── */}
          <Section
            title="Phương án giá"
            note="Nhánh <50 pcs tính theo diện tích thuần. Nhánh ≥50 pcs thêm phí khuôn theo diện tích panel và đơn giá diện tích rẻ hơn."
          >
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>Phương án</th>
                  <th style={S.th}>Nền &lt;50</th>
                  <th style={S.th}>×DT &lt;50</th>
                  <th style={S.th}>Nền ≥50</th>
                  <th style={S.th}>×Panel ≥50</th>
                  <th style={S.th}>×DT ≥50</th>
                </tr>
              </thead>
              <tbody>
                {cfg.options.map((o, i) => (
                  <tr key={o.key}>
                    <td style={{ ...S.td, color: '#cbd5e1', whiteSpace: 'nowrap' }}>{o.label}</td>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={o.small.base}
                        onChange={(e) =>
                          edit((d) => void (d.options[i].small.base = num(e.target.value, o.small.base)))
                        }
                      />
                    </td>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={o.small.area}
                        onChange={(e) =>
                          edit((d) => void (d.options[i].small.area = num(e.target.value, o.small.area)))
                        }
                      />
                    </td>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={o.large.base}
                        onChange={(e) =>
                          edit((d) => void (d.options[i].large.base = num(e.target.value, o.large.base)))
                        }
                      />
                    </td>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={o.large.board}
                        onChange={(e) =>
                          edit((d) => void (d.options[i].large.board = num(e.target.value, o.large.board)))
                        }
                      />
                    </td>
                    <td style={S.td}>
                      <input
                        style={S.cellInput}
                        value={o.large.area}
                        onChange={(e) =>
                          edit((d) => void (d.options[i].large.area = num(e.target.value, o.large.area)))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* ── Đối chiếu sheet ────────────────────────── */}
          <Section
            title="Đối chiếu sheet"
            note="Bảy ca lấy từ sheet gốc, đều là bo 20×35 cm, 15 pcs, không rail, không phí thêm. Sửa hằng số ở trên làm lệch ca nào thì ca đó đỏ."
          >
            <div style={{ ...S.checkStrip, ...(drift ? S.checkStripBad : S.checkStripOk) }}>
              {drift === 0
                ? '✓ Cả 7 ca khớp sheet'
                : `⚠ ${drift}/7 ca lệch so với sheet — cấu hình đang khác bản giá gốc`}
            </div>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>#</th>
                  <th style={S.th}>Phương án · đường</th>
                  <th style={S.th}>Sheet</th>
                  <th style={S.th}>App</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td style={{ ...S.td, color: '#64748b' }}>{c.id}</td>
                    <td style={{ ...S.td, color: '#cbd5e1' }}>
                      {cfg.options.find((o) => o.key === c.option)?.label ?? c.option} ·{' '}
                      {c.mode === 'flat' ? 'phẳng' : 'bậc'}
                    </td>
                    <td style={{ ...S.td, color: '#64748b', textAlign: 'right' }}>
                      {money(c.priceVnd)}
                    </td>
                    <td
                      style={{
                        ...S.td,
                        textAlign: 'right',
                        fontWeight: 600,
                        color: c.ok ? '#5eead4' : '#fca5a5',
                      }}
                    >
                      {c.err ?? money(c.got)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          </>
          )}
        </div>

        <div style={S.footer}>
          {saved && <span style={S.savedTag}>Đã lưu</span>}
          <button
            style={S.btnGhost}
            onClick={() => {
              setCfg(JSON.parse(JSON.stringify(DEFAULT_CONFIG)))
              setSaved(false)
            }}
          >
            Về mặc định
          </button>
          <button style={S.btnGhost} onClick={onClose}>
            Đóng
          </button>
          <button
            style={S.btnPrimary}
            onClick={() => {
              PricingStore.setConfig(cfg)
              setSaved(true)
            }}
          >
            Lưu
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Trang Stencil: bảng giá stencil khung nhôm theo cỡ khung. Mỗi cỡ khung nhận được bo
 * lớn tới "vùng mạch"; giá là giá một tấm, khối lượng dùng để tính cước gửi.
 */
const StencilSection: React.FC<{
  cfg: PricingConfig
  edit: (fn: (draft: PricingConfig) => void) => void
}> = ({ cfg, edit }) => {
  const tiers = cfg.stencil.tiers
  /** Ô số trong bảng: sửa một trường của một dòng. */
  const cell = (i: number, field: 'frameW' | 'frameH' | 'areaW' | 'areaH' | 'weightKg') => (
    <input
      style={{ ...S.cellInput, ...S.cellSmall }}
      value={tiers[i][field]}
      onChange={(e) =>
        edit((d) => void (d.stencil.tiers[i][field] = num(e.target.value, tiers[i][field])))
      }
    />
  )

  return (
    <Section
      title="Bảng giá stencil khung nhôm"
      note="Giá một tấm theo cỡ khung. Vùng mạch là bo lớn nhất đặt vừa khung đó (xoay 90° vẫn tính). Kích thước tính bằng cm."
    >
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>#</th>
            <th style={S.th}>Khung (cm)</th>
            <th style={S.th}>Không khung</th>
            <th style={S.th}>Vùng mạch (cm)</th>
            <th style={S.th}>Giá (đ)</th>
            <th style={S.th}>Khối lượng (kg)</th>
            <th style={S.th} />
          </tr>
        </thead>
        <tbody>
          {tiers.map((t, i) => (
            <tr key={i}>
              <td style={{ ...S.td, color: '#64748b', width: 24 }}>{i + 1}</td>
              <td style={S.td}>
                <div style={S.pair}>
                  {cell(i, 'frameW')}
                  <span style={S.times}>×</span>
                  {cell(i, 'frameH')}
                </div>
              </td>
              <td style={{ ...S.td, textAlign: 'center' }}>
                <input
                  type="checkbox"
                  checked={!!t.noFrame}
                  onChange={(e) =>
                    edit((d) => {
                      if (e.target.checked) d.stencil.tiers[i].noFrame = true
                      else delete d.stencil.tiers[i].noFrame
                    })
                  }
                />
              </td>
              <td style={S.td}>
                <div style={S.pair}>
                  {cell(i, 'areaW')}
                  <span style={S.times}>×</span>
                  {cell(i, 'areaH')}
                </div>
              </td>
              <td style={S.td}>
                <input
                  style={S.cellInput}
                  value={money(t.priceVnd)}
                  onChange={(e) =>
                    edit(
                      (d) =>
                        void (d.stencil.tiers[i].priceVnd = Math.round(
                          num(e.target.value.replace(/\./g, ''), t.priceVnd),
                        )),
                    )
                  }
                />
              </td>
              <td style={{ ...S.td, width: 90 }}>{cell(i, 'weightKg')}</td>
              <td style={{ ...S.td, width: 28 }}>
                <button
                  style={S.rowDel}
                  title="Xoá cỡ này"
                  onClick={() => edit((d) => void d.stencil.tiers.splice(i, 1))}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        style={S.addRow}
        onClick={() =>
          edit((d) =>
            d.stencil.tiers.push({ frameW: 0, frameH: 0, areaW: 0, areaH: 0, priceVnd: 0, weightKg: 0 }),
          )
        }
      >
        + Thêm cỡ khung
      </button>
    </Section>
  )
}

const Section: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({
  title,
  note,
  children,
}) => (
  <section style={{ marginBottom: 18 }}>
    <div style={S.sectionTitle}>{title}</div>
    {note && <div style={S.sectionNote}>{note}</div>}
    {children}
  </section>
)

const NumField: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <div style={S.field}>
    <span style={S.fieldLabel}>{label}</span>
    <input style={S.input} value={value} onChange={(e) => onChange(num(e.target.value, value))} />
  </div>
)

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 110,
  },
  modal: {
    width: 'min(880px, 94vw)',
    maxHeight: '92vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#181a20',
    border: '1px solid #334155',
    borderRadius: 8,
    boxShadow: '0 12px 40px rgba(0,0,0,0.55)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    backgroundColor: '#14161b',
    borderBottom: '1px solid #282b34',
  },
  headerTitle: { color: '#e2e8f0', fontWeight: 600, fontSize: 13 },
  headerSub: { color: '#38bdf8', fontSize: 12 },
  tabs: {
    display: 'flex',
    marginLeft: 12,
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 14,
    padding: 2,
  },
  tab: {
    background: 'none',
    border: 'none',
    borderRadius: 12,
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
    padding: '2px 14px',
  },
  tabOn: { backgroundColor: '#3b82f6', color: '#ffffff' },
  pair: { display: 'flex', alignItems: 'center', gap: 4 },
  cellSmall: { width: 64 },
  times: { color: '#475569', fontSize: 11 },
  close: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 14,
  },
  body: { padding: 14, overflowY: 'auto', flex: 1 },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    backgroundColor: '#14161b',
    borderTop: '1px solid #282b34',
    justifyContent: 'flex-end',
  },
  sectionTitle: { fontSize: 12, fontWeight: 600, color: '#38bdf8', marginBottom: 4 },
  sectionNote: { fontSize: 11, color: '#64748b', lineHeight: 1.6, marginBottom: 8, maxWidth: '78ch' },
  rowWrap: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 8,
    marginBottom: 10,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 3 },
  fieldLabel: { fontSize: 10, color: '#94a3b8' },
  input: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 4,
    color: '#e2e8f0',
    fontSize: 12,
    padding: '5px 7px',
    width: '100%',
    boxSizing: 'border-box',
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12 },
  th: {
    textAlign: 'left',
    padding: '4px 6px',
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: 600,
    borderBottom: '1px solid #334155',
    whiteSpace: 'nowrap',
  },
  td: { padding: '3px 6px', borderBottom: '1px solid #22252e', verticalAlign: 'middle' },
  cellInput: {
    backgroundColor: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 3,
    color: '#e2e8f0',
    fontSize: 12,
    padding: '4px 6px',
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'right',
  },
  rowDel: {
    background: 'none',
    border: 'none',
    color: '#64748b',
    cursor: 'pointer',
    fontSize: 11,
    padding: 2,
  },
  addRow: {
    marginTop: 6,
    backgroundColor: '#1c2029',
    border: '1px solid #2c313c',
    borderRadius: 4,
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 11,
    padding: '4px 10px',
  },
  checkStrip: {
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 9px',
    marginBottom: 8,
  },
  checkStripOk: { backgroundColor: '#0c2e28', color: '#5eead4', border: '1px solid #115e52' },
  checkStripBad: { backgroundColor: '#2a1416', color: '#fca5a5', border: '1px solid #5b2326' },
  savedTag: { color: '#5eead4', fontSize: 11, marginRight: 'auto' },
  btnGhost: {
    backgroundColor: '#1c2029',
    border: '1px solid #2c313c',
    borderRadius: 4,
    color: '#cbd5e1',
    cursor: 'pointer',
    fontSize: 12,
    padding: '5px 12px',
  },
  btnPrimary: {
    backgroundColor: '#0ea5e9',
    border: 'none',
    borderRadius: 4,
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 16px',
  },
}
