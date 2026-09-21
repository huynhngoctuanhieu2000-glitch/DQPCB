/**
 * Sơ đồ tấm panel sau khi ghép: X × Y bo (vẽ đúng hình viền thật nếu có), rail hai bên,
 * đường V-cut hoặc cầu mouse bite giữa các bo, kèm kích thước tấm. Tỉ lệ đúng, để người
 * lập nhìn ra ngay mình vừa ghép gì.
 *
 * Không vẽ khe phay của mouse bite: kích thước tấm phải khớp đúng số đang tính giá
 * (bo × X×Y + rail). Mouse bite chỉ khác V-cut ở ký hiệu trên đường nối.
 */
import React from 'react'

export type PanelKind = 'vcut' | 'mousebite'

/** Hình một bo, mm, gốc ở góc dưới-trái ô bao của bo (trục y hướng lên như Gerber). */
export interface BoardShape {
  body: number[][][]
  holes: number[][][]
}

export const PanelPreview: React.FC<{
  /** Kích thước một bo, mm. */
  boardW: number
  boardH: number
  cols: number
  rows: number
  /** Tổng rail theo mỗi trục, mm — chia đều hai bên. */
  railX: number
  railY: number
  kind: PanelKind
  shape?: BoardShape | null
}> = ({ boardW, boardH, cols, rows, railX, railY, kind, shape }) => {
  const panelW = boardW * cols + railX
  const panelH = boardH * rows + railY
  const MAX = 170
  const k = MAX / Math.max(panelW, panelH)
  const W = panelW * k
  const H = panelH * k
  const rx = (railX / 2) * k
  const ry = (railY / 2) * k

  // Hình bo gốc (mm, y lên) → toạ độ SVG trong ô của bo (y xuống), co giãn theo ô nếu
  // kích thước đang bị sửa tay khác Gerber.
  const toPath = (polys: number[][][], ox: number, oy: number, sx: number, sy: number) =>
    polys
      .map((poly) =>
        poly.map(([x, y], i) => `${i ? 'L' : 'M'}${(ox + x * sx).toFixed(1)},${(oy + (boardH - y) * sy).toFixed(1)}`).join('') + 'Z',
      )
      .join('')

  const boards: React.ReactNode[] = []
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const ox = rx + c * boardW * k
      const oy = ry + r * boardH * k
      if (shape && shape.body.length > 0) {
        boards.push(
          <path
            key={`b${c}-${r}`}
            d={toPath([...shape.body, ...shape.holes], ox, oy, k, k)}
            fill="#22a55a"
            fillRule="evenodd"
            stroke="#86efac"
            strokeWidth={0.6}
          />,
        )
      } else {
        boards.push(
          <rect key={`b${c}-${r}`} x={ox} y={oy} width={boardW * k} height={boardH * k} fill="#22a55a" stroke="#86efac" strokeWidth={0.6} />,
        )
      }
    }
  }

  const cuts: React.ReactNode[] = []
  if (kind === 'vcut') {
    // V-cut: vạch đứt xuyên cả tấm giữa các hàng/cột bo.
    for (let c = 1; c < cols; c++) {
      const x = rx + c * boardW * k
      cuts.push(<line key={`vx${c}`} x1={x} y1={0} x2={x} y2={H} stroke="#fbbf24" strokeWidth={1} strokeDasharray="3 2" />)
    }
    for (let r = 1; r < rows; r++) {
      const y = ry + r * boardH * k
      cuts.push(<line key={`vy${r}`} x1={0} y1={y} x2={W} y2={y} stroke="#fbbf24" strokeWidth={1} strokeDasharray="3 2" />)
    }
  } else {
    // Mouse bite: cầu (chấm) giữa các bo kề nhau.
    for (let c = 1; c < cols; c++) {
      const x = rx + c * boardW * k
      for (let r = 0; r < rows; r++) cuts.push(<circle key={`mx${c}-${r}`} cx={x} cy={ry + (r + 0.5) * boardH * k} r={2} fill="#fbbf24" />)
    }
    for (let r = 1; r < rows; r++) {
      const y = ry + r * boardH * k
      for (let c = 0; c < cols; c++) cuts.push(<circle key={`my${r}-${c}`} cx={rx + (c + 0.5) * boardW * k} cy={y} r={2} fill="#fbbf24" />)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 0' }}>
      <svg width={W + 2} height={H + 2} style={{ overflow: 'visible' }}>
        <g transform="translate(1,1)">
          {/* Nền tấm = phần rail/khung, màu xám cho tách khỏi bo */}
          <rect x={0} y={0} width={W} height={H} fill="#3f4a5a" stroke="#64748b" strokeWidth={1} />
          <rect x={rx} y={ry} width={W - 2 * rx} height={H - 2 * ry} fill="#0f1a14" />
          {boards}
          {cuts}
        </g>
      </svg>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>
        Tấm {+panelW.toFixed(2)} × {+panelH.toFixed(2)} mm · {cols * rows} bo · {kind === 'vcut' ? 'V-cut' : 'mouse bite'}
      </div>
    </div>
  )
}
