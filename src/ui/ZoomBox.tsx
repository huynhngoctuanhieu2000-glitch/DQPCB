/**
 * Khung xem nội dung có bề rộng cố định (bản xem trước báo giá dựng theo khổ A4
 * ngang ~930 px): mở ra là co vừa bề ngang khung, rồi người xem phóng to bằng hai
 * ngón (điện thoại), Ctrl + lăn chuột, hoặc nút +/−, và kéo để xem phần bị khuất.
 *
 * Tự làm zoom thay vì để trình duyệt pinch-zoom cả trang: viewport đã khoá
 * maximum-scale=1 để iOS không tự phóng khi bấm vào ô nhập, nên Android không
 * pinch được nữa; mà phóng cả trang thì thanh nút cũng trôi theo.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MIN_SCALE = 0.25
const MAX_SCALE = 4

export const ZoomBox: React.FC<{ contentWidth: number; children: React.ReactNode }> = ({
  contentWidth,
  children,
}) => {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  // null = đang ở mức "vừa khung"; theo dõi riêng để xoay máy thì vẫn vừa khung.
  const [scale, setScale] = useState<number | null>(null)
  const [contentHeight, setContentHeight] = useState(0)

  // Mức vừa khung = bề ngang khung / bề ngang nội dung, không phóng quá 1. Đo ngay
  // trước lượt vẽ đầu (layout effect) để không loé lên bản 100% rồi mới co lại.
  useLayoutEffect(() => {
    const el = outerRef.current
    if (!el) return
    const measure = () => setFit(Math.min(1, el.clientWidth / contentWidth))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [contentWidth])

  // Chiều cao thật của nội dung, để khung cuộn biết kích thước sau khi scale.
  useEffect(() => {
    const el = innerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContentHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const s = scale ?? fit
  const clamp = (v: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, v))
  // Listener cảm ứng/chuột đăng ký một lần nên đọc scale hiện tại qua ref.
  const scaleRef = useRef(s)
  scaleRef.current = s

  /**
   * Điểm cần giữ đứng yên khi zoom: (mx, my) là vị trí trong khung (px), (fx, fy) là toạ
   * độ nội dung chưa scale đang nằm dưới điểm đó. Scale đổi xong thì cuộn lại cho điểm
   * nội dung ấy quay về đúng dưới ngón tay — không thì zoom luôn từ góc trên-trái và chỗ
   * đang soi trôi mất.
   */
  const anchorRef = useRef<{ mx: number; my: number; fx: number; fy: number } | null>(null)
  const zoomAround = (next: number, mx: number, my: number) => {
    const el = outerRef.current
    if (el) {
      const cur = scaleRef.current
      anchorRef.current = { mx, my, fx: (el.scrollLeft + mx) / cur, fy: (el.scrollTop + my) / cur }
    }
    setScale(next)
  }
  /** Nút +/−: zoom quanh giữa khung. */
  const zoomCenter = (next: number) => {
    const el = outerRef.current
    zoomAround(next, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2)
  }
  useLayoutEffect(() => {
    const el = outerRef.current
    const a = anchorRef.current
    if (!el || !a) return
    anchorRef.current = null
    el.scrollLeft = a.fx * s - a.mx
    el.scrollTop = a.fy * s - a.my
  }, [s])

  // Hai ngón: khoảng cách hai điểm chạm đổi bao nhiêu thì scale đổi bấy nhiêu.
  // Ctrl + lăn chuột: trên máy tính, và cũng là cách trackpad báo pinch.
  // Đăng ký tay với passive:false vì cần preventDefault để trang không cuộn/zoom theo.
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    let pinch: { d0: number; s0: number } | null = null
    let lastTap = { t: 0, x: 0, y: 0 }
    let tapStart: { x: number; y: number; t: number } | null = null
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    /** Điểm giữa hai ngón (hoặc vị trí một ngón), tính trong khung. */
    const local = (x: number, y: number) => {
      const r = el.getBoundingClientRect()
      return { mx: x - r.left, my: y - r.top }
    }
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch = { d0: dist(e.touches), s0: scaleRef.current }
        tapStart = null
      } else if (e.touches.length === 1) {
        tapStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }
      }
    }
    const onMove = (e: TouchEvent) => {
      if (tapStart && e.touches.length === 1) {
        const t = e.touches[0]
        if (Math.hypot(t.clientX - tapStart.x, t.clientY - tapStart.y) > 10) tapStart = null
      }
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const [a, b] = [e.touches[0], e.touches[1]]
      const { mx, my } = local((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2)
      zoomAround(clamp((pinch.s0 * dist(e.touches)) / pinch.d0), mx, my)
    }
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null
      // Chạm đúp (hai lần chạm nhanh, không kéo) = về vừa bề ngang khung.
      if (tapStart && e.touches.length === 0 && performance.now() - tapStart.t < 250) {
        const now = performance.now()
        if (now - lastTap.t < 320 && Math.hypot(tapStart.x - lastTap.x, tapStart.y - lastTap.y) < 30) {
          setScale(null)
          lastTap = { t: 0, x: 0, y: 0 }
        } else {
          lastTap = { t: now, x: tapStart.x, y: tapStart.y }
        }
      }
      tapStart = null
    }
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const { mx, my } = local(e.clientX, e.clientY)
      zoomAround(clamp(scaleRef.current * (e.deltaY < 0 ? 1.1 : 1 / 1.1)), mx, my)
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div
        ref={outerRef}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', touchAction: 'pan-x pan-y', WebkitOverflowScrolling: 'touch' }}
      >
        {/* Khung giữ chỗ đúng kích thước sau scale, để cuộn được tới mép. */}
        <div style={{ width: contentWidth * s, height: contentHeight * s }}>
          <div ref={innerRef} style={{ width: contentWidth, transform: `scale(${s})`, transformOrigin: '0 0' }}>
            {children}
          </div>
        </div>
      </div>

      {/* Nút zoom nổi góc dưới phải */}
      <div style={bar}>
        <button style={btn} onClick={() => zoomCenter(clamp(s / 1.25))} title="Thu nhỏ">
          −
        </button>
        <button
          style={{ ...btn, minWidth: 52, fontSize: 11 }}
          onClick={() => setScale(null)}
          title="Vừa bề ngang khung"
        >
          {Math.round(s * 100)}%
        </button>
        <button style={btn} onClick={() => zoomCenter(clamp(s * 1.25))} title="Phóng to">
          +
        </button>
      </div>
    </div>
  )
}

const bar: React.CSSProperties = {
  position: 'absolute',
  right: 10,
  bottom: 10,
  display: 'flex',
  gap: 2,
  padding: 2,
  borderRadius: 8,
  backgroundColor: 'rgba(15,23,42,0.9)',
  border: '1px solid #334155',
  boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
}

const btn: React.CSSProperties = {
  minWidth: 32,
  height: 30,
  padding: '0 8px',
  border: 'none',
  borderRadius: 6,
  backgroundColor: 'transparent',
  color: '#e2e8f0',
  fontSize: 16,
  lineHeight: 1,
  cursor: 'pointer',
}
