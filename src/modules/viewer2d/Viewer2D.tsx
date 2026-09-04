import React, { useEffect, useRef, useState, useCallback } from 'react'
import { BoardDataModel } from '../../models/BoardDataModel'

// 🔧 UI CONFIGURATION
const INITIAL_SCALE = 1
const MIN_SCALE = 0.01
const MAX_SCALE = 100
const ZOOM_SPEED = 0.0015

export const Viewer2D: React.FC = () => {
  const [boardState, setBoardState] = useState(BoardDataModel.getState())
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: INITIAL_SCALE })
  const transformRef = useRef(transform)
  transformRef.current = transform

  const [cursorCoord, setCursorCoord] = useState<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)
  const lastMousePos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    return BoardDataModel.subscribe((state) => {
      setBoardState(state)
    })
  }, [])

  // Auto fit to center when new board data loads
  const fitToView = useCallback(() => {
    if (!containerRef.current || !boardState.bounds) return
    const rect = containerRef.current.getBoundingClientRect()
    const containerWidth = rect.width || containerRef.current.clientWidth || 800
    const containerHeight = rect.height || containerRef.current.clientHeight || 600
    const { widthMM, heightMM } = boardState.bounds

    if (widthMM <= 0 || heightMM <= 0) return

    // 85% view coverage padding
    const scaleX = (containerWidth * 0.85) / widthMM
    const scaleY = (containerHeight * 0.85) / heightMM
    const fitScale = Math.min(scaleX, scaleY)

    setTransform({
      x: containerWidth / 2,
      y: containerHeight / 2,
      scale: fitScale,
    })
  }, [boardState.bounds])

  // Center on board load & on resize
  useEffect(() => {
    if (boardState.isLoaded) {
      const timer = setTimeout(() => {
        fitToView()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [boardState.isLoaded, boardState.projectName, fitToView])

  // 🌟 Non-passive wheel event listener to eliminate Chrome/Electron passive event listener warning
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const currentTransform = transformRef.current
      const zoomFactor = Math.exp(-e.deltaY * ZOOM_SPEED)
      const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentTransform.scale * zoomFactor))

      // Smooth Zoom centered at mouse pointer position
      const newX = mouseX - (mouseX - currentTransform.x) * (newScale / currentTransform.scale)
      const newY = mouseY - (mouseY - currentTransform.y) * (newScale / currentTransform.scale)

      setTransform({ x: newX, y: newY, scale: newScale })
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', handleWheel)
    }
  }, [])

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true
    lastMousePos.current = { x: e.clientX, y: e.clientY }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMousePos.current.x
      const dy = e.clientY - lastMousePos.current.y
      lastMousePos.current = { x: e.clientX, y: e.clientY }
      setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }))
    }

    if (containerRef.current && boardState.bounds) {
      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const centerX = (boardState.bounds.minX + boardState.bounds.maxX) / 2
      const centerY = (boardState.bounds.minY + boardState.bounds.maxY) / 2

      const mmX = (mouseX - transformRef.current.x) / transformRef.current.scale + centerX
      const mmY = -(mouseY - transformRef.current.y) / transformRef.current.scale + centerY

      setCursorCoord({ x: Number(mmX.toFixed(2)), y: Number(mmY.toFixed(2)) })
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // Ignored
    }
  }

  const bounds = boardState.bounds || {
    minX: 0,
    minY: 0,
    maxX: 100,
    maxY: 100,
    widthMM: 100,
    heightMM: 100,
  }

  const widthMM = Math.max(0.1, bounds.widthMM || 100)
  const heightMM = Math.max(0.1, bounds.heightMM || 100)

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0c10',
        overflow: 'hidden',
        cursor: isDragging.current ? 'grabbing' : 'crosshair',
        userSelect: 'none',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 2D Board Rendering Stage */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
        }}
      >
        {/* Layer Stack Transform Container */}
        <div
          style={{
            position: 'absolute',
            left: `${transform.x}px`,
            top: `${transform.y}px`,
            width: `${widthMM}px`,
            height: `${heightMM}px`,
            transform: `translate(-50%, -50%) scale(${transform.scale})`,
            transformOrigin: 'center center',
            pointerEvents: 'none',
          }}
        >
          {/* Realistic Green PCB Substrate Board Background */}
          {(() => {
            const outlineLayers = boardState.layers.filter((l) => l.type === 'outline')
            const outlineLayer = outlineLayers.length > 0 ? outlineLayers.reduce((prev, curr) => {
              const prevArea = (prev.size[2] - prev.size[0]) * (prev.size[3] - prev.size[1])
              const currArea = (curr.size[2] - curr.size[0]) * (curr.size[3] - curr.size[1])
              return currArea > prevArea ? curr : prev
            }) : undefined
            if (outlineLayer) {
              const scale = outlineLayer.units === 'in' ? 1 / 25.4 : 1
              const vbMinX = bounds.minX * scale
              const vbMinY = -(bounds.minY + bounds.heightMM) * scale
              const vbWidth = bounds.widthMM * scale
              const vbHeight = bounds.heightMM * scale
              const viewBoxStr = `${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`

              let holesSvg = ''

              // Extract <circle>
              const circleRegex = /<circle([^>]+)>/g
              let match
              while ((match = circleRegex.exec(outlineLayer.svgContent)) !== null) {
                holesSvg += `<circle ${match[1]} fill="black" stroke="none" />`
              }

              // Extract paths for holes and for merging
              const pathRegex = /<path[^>]*d="([^"]+)"[^>]*>/g
              let combinedD = ''
              while ((match = pathRegex.exec(outlineLayer.svgContent)) !== null) {
                const dStr = match[1]
                combinedD += dStr + ' '
                const coords = dStr.match(/[+-]?\d+(\.\d+)?/g)
                if (coords && coords.length > 0) {
                  const nums = coords.map(Number)
                  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
                  for (let i = 0; i < nums.length; i += 2) {
                    if (nums[i] < minX) minX = nums[i]
                    if (nums[i] > maxX) maxX = nums[i]
                    if (nums[i + 1] < minY) minY = nums[i + 1]
                    if (nums[i + 1] > maxY) maxY = nums[i + 1]
                  }
                  const w = maxX - minX
                  const h = maxY - minY
                  
                  if (w < vbWidth * 0.8 && h < vbHeight * 0.8) {
                    holesSvg += `<path d="${dStr}" fill="black" stroke="none" />`
                  }
                }
              }

              // Try to merge the paths to find the real outer boundary (for notches/mouse bites)
              const mergePathsToPolygon = (d: string) => {
                const cmds = d.match(/[ML][^ML]+/g)
                if (!cmds) return ''
                let currentPt: {x: number, y: number} | null = null
                const segments: {x1: number, y1: number, x2: number, y2: number, used: boolean}[] = []
                for (const cmd of cmds) {
                  const type = cmd[0]
                  const coordsStr = cmd.substring(1).trim().split(/[\s,]+/)
                  if (coordsStr.length < 2) continue
                  const pt = { x: parseFloat(coordsStr[0]), y: parseFloat(coordsStr[1]) }
                  if (type === 'M') {
                    currentPt = pt
                  } else if (type === 'L' && currentPt) {
                    segments.push({ x1: currentPt.x, y1: currentPt.y, x2: pt.x, y2: pt.y, used: false })
                    currentPt = pt
                  }
                }
                
                if (segments.length === 0) return ''
                
                const currentPoly = []
                const firstSeg = segments[0]
                firstSeg.used = true
                currentPoly.push({ x: firstSeg.x1, y: firstSeg.y1 })
                let tracePt = { x: firstSeg.x2, y: firstSeg.y2 }
                
                const TOL = 0.005
                const isMatch = (p1: any, p2: any) => Math.abs(p1.x - p2.x) < TOL && Math.abs(p1.y - p2.y) < TOL
                
                let closed = false
                for (let i = 0; i < segments.length; i++) {
                  currentPoly.push({ x: tracePt.x, y: tracePt.y })
                  if (isMatch(tracePt, currentPoly[0])) {
                    closed = true
                    break
                  }
                  
                  let found = false
                  for (let j = 0; j < segments.length; j++) {
                    const seg = segments[j]
                    if (seg.used) continue
                    if (isMatch(tracePt, {x: seg.x1, y: seg.y1})) {
                      tracePt = {x: seg.x2, y: seg.y2}
                      seg.used = true
                      found = true
                      break
                    } else if (isMatch(tracePt, {x: seg.x2, y: seg.y2})) {
                      tracePt = {x: seg.x1, y: seg.y1}
                      seg.used = true
                      found = true
                      break
                    }
                  }
                  if (!found) break
                }
                
                if (currentPoly.length > 2 && closed) {
                  let dStr = `M ${currentPoly[0].x} ${currentPoly[0].y} `
                  for (let i = 1; i < currentPoly.length; i++) {
                    dStr += `L ${currentPoly[i].x} ${currentPoly[i].y} `
                  }
                  dStr += 'Z'
                  return dStr
                }
                return ''
              }

              const mergedOuterPoly = mergePathsToPolygon(combinedD)
              const baseWhiteMask = mergedOuterPoly 
                ? `<path d="${mergedOuterPoly}" fill="white" />` 
                : `<rect x="${vbMinX}" y="${vbMinY}" width="${vbWidth}" height="${vbHeight}" fill="white" />`

              const baseGreenSubstrate = mergedOuterPoly
                ? `<path d="${mergedOuterPoly}" fill="#0a3d24" mask="url(#board-hole-mask)" />`
                : `<rect x="${vbMinX}" y="${vbMinY}" width="${vbWidth}" height="${vbHeight}" fill="#0a3d24" mask="url(#board-hole-mask)" />`

              const maskHtml = `
                <svg viewBox="${viewBoxStr}" preserveAspectRatio="none" style="width: 100%; height: 100%; position: absolute; inset: 0;">
                  <defs>
                    <mask id="board-hole-mask">
                      ${baseWhiteMask}
                      ${holesSvg}
                    </mask>
                  </defs>
                  ${baseGreenSubstrate}
                </svg>
              `

              return (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    filter: 'drop-shadow(0 0 50px rgba(0, 255, 128, 0.12))',
                  }}
                  dangerouslySetInnerHTML={{ __html: maskHtml }}
                />
              )
            }

            // Fallback for boards without Outline
            return (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundColor: '#0a3d24',
                  border: '1px solid rgba(241, 196, 15, 0.6)',
                  boxShadow: '0 0 50px rgba(0, 255, 128, 0.12)',
                  borderRadius: '8px',
                }}
              />
            )
          })()}

          {/* Render All Visible Layers in CAD stackup order */}
          {boardState.layers.map((layer) => {
            if (!boardState.visibleLayers.has(layer.id)) return null

            // Map the global mm bounds back to the layer's native units (mm or inches)
            // Tracespace SVG inverts the Y axis (SVG Y goes down, Gerber Y goes up)
            // So SVG minY = -maxY_gerber
            const scale = layer.units === 'in' ? 1 / 25.4 : 1
            const vbMinX = bounds.minX * scale
            const vbMinY = -(bounds.minY + bounds.heightMM) * scale
            const vbWidth = bounds.widthMM * scale
            const vbHeight = bounds.heightMM * scale
            const viewBoxStr = `${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`

            // Inject the calculated unified viewBox to perfectly register all layers
            const modifiedSvg = layer.svgContent
              .replace(/viewBox="[^"]*"/, `viewBox="${viewBoxStr}" preserveAspectRatio="none"`)
              .replace(/\swidth="[^"]*"/, ' width="100%"')
              .replace(/\sheight="[^"]*"/, ' height="100%"')

            const isDrill = layer.type === 'drill'
            const isSilk = layer.type === 'silkscreen'
            const isMask = layer.type === 'soldermask'
            const isOutline = layer.type === 'outline'

            let opacity = 0.95
            let mixBlendMode: React.CSSProperties['mixBlendMode'] = 'normal'

            if (isMask) {
              opacity = 0.25 // Translucent mask opening so it never obscures traces
            } else if (isSilk) {
              opacity = 1.0 // Crisp white silkscreen text
            } else if (isDrill) {
              opacity = 1.0
            } else if (isOutline) {
              opacity = 1.0
            } else {
              mixBlendMode = 'screen' // Copper traces
            }

            return (
              <div
                key={layer.id}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  color: layer.color,
                  mixBlendMode,
                  opacity,
                  pointerEvents: 'none',
                  zIndex: layer.order,
                }}
                dangerouslySetInnerHTML={{ __html: modifiedSvg }}
              />
            )
          })}
        </div>
      </div>

      {/* Floating Canvas Controls (Bottom Center / Left) */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '16px',
          display: 'flex',
          gap: '8px',
          backgroundColor: 'rgba(20, 24, 30, 0.88)',
          padding: '5px 12px',
          borderRadius: '6px',
          border: '1px solid #2d3748',
          color: '#cbd5e1',
          fontSize: '12px',
          fontFamily: 'monospace',
          backdropFilter: 'blur(6px)',
          zIndex: 10,
        }}
      >
        <span>X: {cursorCoord ? `${cursorCoord.x} mm` : '--'}</span>
        <span style={{ color: '#475569' }}>|</span>
        <span>Y: {cursorCoord ? `${cursorCoord.y} mm` : '--'}</span>
        <span style={{ color: '#475569' }}>|</span>
        <span>Zoom: {Math.round(transform.scale * 100)}%</span>
        <span style={{ color: '#475569' }}>|</span>
        <span>Size: {widthMM.toFixed(2)} × {heightMM.toFixed(2)} mm</span>
      </div>

      {/* Quick Action Floating Buttons (Bottom Right) */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          right: '16px',
          display: 'flex',
          gap: '6px',
          zIndex: 10,
        }}
      >
        <button
          onClick={fitToView}
          style={{
            backgroundColor: '#1e293b',
            color: '#38bdf8',
            border: '1px solid #38bdf8',
            padding: '5px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
          title="Fit to Screen (Căn vừa màn hình)"
        >
          🔍 Fit
        </button>
        <button
          onClick={() => setTransform((prev) => ({ ...prev, scale: Math.min(MAX_SCALE, prev.scale * 1.3) }))}
          style={{
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            padding: '5px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => setTransform((prev) => ({ ...prev, scale: Math.max(MIN_SCALE, prev.scale * 0.75) }))}
          style={{
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            padding: '5px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
          title="Zoom Out"
        >
          -
        </button>
        <button
          onClick={fitToView}
          style={{
            backgroundColor: '#1e293b',
            color: '#f8fafc',
            border: '1px solid #334155',
            padding: '5px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
          title="Reset View"
        >
          1:1
        </button>
      </div>
    </div>
  )
}
