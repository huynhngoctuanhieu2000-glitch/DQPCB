/**
 * Cột trái: danh sách lớp của bo đang mở (lọc theo mặt, bật/tắt từng lớp, đổi loại lớp
 * khi app nhận diện sai) và khung chẩn đoán file đọc lỗi / bị bỏ qua.
 *
 * Tách khỏi Layout.tsx: Layout từng ôm cả thanh công cụ, danh sách lớp, khung xem và
 * bảng thông tin trong một file 1600 dòng — hai người sửa hai việc khác nhau là đụng nhau.
 */
import React, { useState } from 'react'
import { BoardDataModel, type BoardState } from '../models/BoardDataModel'
import { LAYER_CHOICES, layerKeyOf, type ParsedGerberLayer } from '../lib/gerber-reader'
import { Button } from './Button'
import { Icon, IconLabel } from './Icon'

export const LayerPanel: React.FC<{
  board: BoardState
  isMobile: boolean
  /** Bảng trượt trên điện thoại đang mở ngăn nào (null = đóng). */
  drawer: 'layers' | 'info' | null
  /** Dải hai tab Lớp / Thông tin, dùng chung với cột thông tin. */
  tabs: React.ReactNode
  /** Kiểu bảng trượt từ đáy (chỉ dùng trên màn gọn). */
  sheetStyle: React.CSSProperties
}> = ({ board: boardState, isMobile, drawer, tabs: sheetTabs, sheetStyle: SHEET }) => (
    <div
      style={{
        width: '240px',
        backgroundColor: '#181a20',
        borderRight: '1px solid #282b34',
        display: isMobile && drawer !== 'layers' ? 'none' : 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...(isMobile ? SHEET : null),
      }}
    >
      {/* Layers header & tabs */}
      {isMobile ? sheetTabs : (
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #282b34',
          backgroundColor: '#14161b',
        }}
      >
        <div
          style={{
            flex: 1,
            padding: '8px',
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: 600,
            color: '#38bdf8',
            borderBottom: '2px solid #38bdf8',
          }}
        >
          Lớp ({boardState.layers.length})
        </div>
      </div>
      )}

      {/* Side Filter Tabs (All / Top / Bottom) */}
      {boardState.layers.length > 0 && (
        <div
          className="tap-dense"
          style={{
            display: 'flex',
            padding: '6px 8px',
            gap: '6px',
            backgroundColor: '#16181e',
            borderBottom: '1px solid #282b34',
          }}
        >
          {(['all', 'top', 'bottom'] as const).map((side) => {
            const isActive = boardState.sideFilter === side
            return (
              <Button
                key={side}
                variant="chip"
                size="sm"
                on={isActive}
                aria-pressed={isActive}
                onClick={() => BoardDataModel.setSideFilter(side)}
                style={{ flex: 1, padding: '3px 0' }}
              >
                {side === 'all' ? 'Tất cả' : side === 'top' ? 'Mặt Top' : 'Mặt Bot'}
              </Button>
            )
          })}
        </div>
      )}

      {/* Quick Visibility Controls */}
      {boardState.layers.length > 0 && (
        <div
          className="tap-dense"
          style={{
            display: 'flex',
            gap: '6px',
            padding: '4px 8px',
            borderBottom: '1px solid #282b34',
            backgroundColor: '#121418',
          }}
        >
          {/* Trước là hai chữ 11px cao 14px, gần như không bấm trúng trên điện thoại. */}
          <Button size="sm" onClick={() => BoardDataModel.setAllLayersVisible(true)} style={{ flex: 1 }}>
            Hiện tất cả
          </Button>
          <Button size="sm" onClick={() => BoardDataModel.setAllLayersVisible(false)} style={{ flex: 1 }}>
            Ẩn tất cả
          </Button>
        </div>
      )}

      {/* Layers List Table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px' }}>
        {boardState.layers.length === 0 ? (
          <div style={{ padding: '20px 10px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
            Chưa mở bo nào.
          </div>
        ) : (
          boardState.layers.map((layer, index) => {
            const isVisible = boardState.visibleLayers.has(layer.id)
            const isActive = boardState.activeLayerId === layer.id
            // Nhiều lớp cùng loại (3 file khoan, nhiều lớp inner…) sẽ có cùng
            // displayName → thêm phần tên riêng để phân biệt được trên panel.
            const isDuplicate =
              boardState.layers.filter((l) => l.displayName === layer.displayName).length > 1
            const label =
              isDuplicate && layer.shortName ? `${layer.displayName} · ${layer.shortName}` : layer.displayName
            return (
              <div
                key={layer.id}
                onClick={() => BoardDataModel.setActiveLayer(layer.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 8px',
                  borderRadius: '4px',
                  marginBottom: '2px',
                  backgroundColor: isActive
                    ? 'rgba(56, 189, 248, 0.12)'
                    : isVisible
                    ? 'rgba(255,255,255,0.03)'
                    : 'transparent',
                  border: isActive ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
                  opacity: isVisible ? 1 : 0.4,
                  fontSize: '12px',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.1s ease',
                }}
              >
                {/* Index */}
                <span style={{ width: '14px', color: '#64748b', fontSize: '11px', textAlign: 'right' }}>
                  {index + 1}
                </span>

                {/* Visibility Checkbox — bọc trong label có đệm để vùng bấm to hơn ô 15px. */}
                <label
                  onClick={(e) => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', padding: '4px', margin: '-4px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Hiện lớp ${label}`}
                    checked={isVisible}
                    onChange={() => BoardDataModel.toggleLayer(layer.id)}
                    style={{ margin: 0, accentColor: layer.color }}
                  />
                </label>

                {/* Ô màu — bấm để đổi màu lớp (áp dụng cho chế độ CAM 2D) */}
                <label
                  title="Đổi màu lớp (chế độ CAM)"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '3px',
                    backgroundColor: layer.color,
                    border: '1px solid rgba(255,255,255,0.2)',
                    flexShrink: 0,
                    cursor: 'pointer',
                    display: 'block',
                    position: 'relative',
                  }}
                >
                  <input
                    type="color"
                    value={layer.color}
                    onChange={(e) => BoardDataModel.setLayerColor(layer.id, e.target.value)}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      opacity: 0,
                      width: '100%',
                      height: '100%',
                      padding: 0,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  />
                </label>

                {/* Display Name */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                >
                  <span
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontWeight: isVisible ? 600 : 400,
                      color: isVisible ? '#f1f5f9' : '#64748b',
                    }}
                    title={`${layer.filename}  —  ${layer.type}/${layer.side}`}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      color: '#64748b',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={layer.filename}
                  >
                    {layer.userType ? '✎ ' : ''}
                    {layer.shortName || layer.filename}
                  </span>
                  {isActive && <LayerTypeSelect layer={layer} />}
                </div>

                {/* Solo Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    BoardDataModel.soloLayer(layer.id)
                  }}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#94a3b8',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '2px 4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                  title="Chỉ xem lớp này (ẩn các lớp khác)"
                  aria-label={`Chỉ xem lớp ${label}`}
                >
                  {/* Điện thoại không rê chuột xem được chú thích → hiện chữ. */}
                  {isMobile ? <IconLabel icon="target" size={15}>Riêng</IconLabel> : <Icon name="target" size={15} />}
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Chẩn đoán: file bị bỏ qua / không đọc được — trước đây chỉ ghi console.warn
          nên người dùng không biết vì sao thiếu lớp. */}
      {(boardState.failedFiles.length > 0 ||
        boardState.ignoredFiles.length > 0 ||
        boardState.layers.some((l) => l.drillFix || l.drillUnmatched)) && (
        <div
          style={{
            borderTop: '1px solid #282b34',
            padding: '6px 10px',
            fontSize: '10px',
            lineHeight: 1.5,
            color: '#64748b',
            backgroundColor: '#121418',
            maxHeight: '120px',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {boardState.failedFiles.length > 0 && (
            <div style={{ color: '#f87171' }}>
              ⚠ {boardState.failedFiles.length} file không đọc được:{' '}
              <span title={boardState.failedFiles.map((f) => `${f.name}: ${f.reason}`).join(' | ')}>
                {boardState.failedFiles.map((f) => f.name).join(', ')}
              </span>
            </div>
          )}
          {/* File khoan app đã tự đọc lại (sai định dạng số / lệch gốc so với Gerber).
              Lệch gốc là lỗi thật của file xuất — xưởng khoan theo file sẽ khoan lệch —
              nên phải nói rõ để người lập báo khách, không chỉ âm thầm sửa trên màn hình. */}
          {boardState.layers
            .filter((l) => l.drillFix)
            .map((l) => {
              const f = l.drillFix!
              const shift = f.dxMm || f.dyMm
              const how =
                f.via === 'pad'
                  ? `khớp ${Math.round((f.padHit ?? 0) * 100)}% pad đồng`
                  : f.via === 'sibling'
                    ? 'theo file khoan cùng bộ'
                    : 'theo khung bo — chưa kiểm được bằng pad'
              return (
                <div key={l.id} style={{ color: '#fbbf24' }} title={l.filename}>
                  ⚠ {l.filename.split(/[\\/]/).pop()}:{' '}
                  {f.reading && `không khai định dạng số, app đọc theo ${drillReadingLabel(f.reading)}`}
                  {f.reading && shift ? '; ' : ''}
                  {shift
                    ? `lệch gốc ${f.dxMm > 0 ? '+' : ''}${f.dxMm.toFixed(1)}, ${f.dyMm > 0 ? '+' : ''}${f.dyMm.toFixed(1)} mm so với Gerber — app đã dời cho khớp`
                    : ''}{' '}
                  ({how}).{shift ? ' Nên báo khách kiểm lại file khoan.' : ''}
                </div>
              )
            })}
          {boardState.layers
            .filter((l) => l.drillUnmatched)
            .map((l) => (
              <div key={l.id} style={{ color: '#f87171' }} title={l.filename}>
                ⚠ {l.filename.split(/[\\/]/).pop()}: lỗ khoan nằm ngoài bo, không cách đọc nào khớp
                pad — file khoan có thể sai, kiểm lại với khách.
              </div>
            ))}
          {boardState.ignoredFiles.length > 0 && (
            <div title={boardState.ignoredFiles.join(' | ')}>
              ℹ {boardState.ignoredFiles.length} file phụ trợ đã bỏ qua (report / aperture / BOM)
            </div>
          )}
        </div>
      )}
    </div>
)

const drillReadingLabel = (key: string): string => {
  const lz = /^lz(\d)(\d)$/.exec(key)
  if (lz) return `${lz[1]}.${lz[2]}`
  const div = /^div(\d)$/.exec(key)
  return div ? `${div[1]} số lẻ` : key
}

function LayerTypeSelect({ layer }: { layer: ParsedGerberLayer }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const current = layer.userType ?? layerKeyOf(layer)
  const change = async (key: string) => {
    setBusy(true)
    setError('')
    try {
      await BoardDataModel.retypeLayer(layer.id, key)
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, color: '#94a3b8' }}>Loại lớp:</span>
      <select
        value={current}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
        title="App nhận diện sai thì chọn lại — cả bộ file sẽ được đọc lại theo loại này"
        style={{
          fontSize: 11,
          padding: '1px 4px',
          borderRadius: 4,
          border: '1px solid #334155',
          backgroundColor: '#0f172a',
          color: '#e2e8f0',
          cursor: 'pointer',
        }}
      >
        {LAYER_CHOICES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.label}
          </option>
        ))}
      </select>
      {layer.userType && !busy && (
        <button
          onClick={() => change('')}
          title="Bỏ chọn tay, để app tự nhận diện"
          style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, border: '1px solid #334155', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}
        >
          ↺ Tự nhận
        </button>
      )}
      {busy && <span style={{ fontSize: 10, color: '#38bdf8' }}>Đang đọc lại…</span>}
      {error && <span style={{ fontSize: 10, color: '#f87171' }}>{error}</span>}
    </div>
  )
}
