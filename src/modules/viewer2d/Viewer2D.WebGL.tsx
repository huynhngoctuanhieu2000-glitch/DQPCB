import React, { useEffect, useRef, useState } from 'react'
import { BoardDataModel } from '../../models/BoardDataModel'
// @ts-ignore - web-gerber typings for named exports are incomplete
import {
  createParser,
  plot,
  renderThree,
  identifyLayers,
  assemblyPCBToThreeJS,
  NewRenderByElement,
  DefaultLaminar,
} from 'web-gerber'

/**
 * web-gerber bundle three.js 0.175 vào trong dist của nó (không import ngoài).
 * => TUYỆT ĐỐI không tạo THREE.Scene/Camera/Renderer từ `three` của app (0.185),
 *    vì object của 2 bản three không tương thích (crash `determinantAffine`).
 *    Mọi thứ phải đi qua NewRenderByElement.
 */

// assemblyPCBToThreeJS chỉ xếp chồng lớp có màu, không composite mask-opening đúng vật lý:
//   OutLine -> oil(phủ cả bo, = oilColor) -> Copper -> SolderMask -> Silkscreen
// Lớp "SolderMask" trong Gerber là các LỖ MỞ mask và được vẽ TRÊN CÙNG (đè lên copper),
// nên muốn "bo xanh + pad đồng" thì phải tô lỗ mở bằng màu đồng, còn copper thì tô xanh.
/**
 * KiCad xuất Edge_Cuts thành nhiều đoạn/cung RỜI RẠC và không theo thứ tự liền mạch
 * (các lệnh D02 nhảy vị trí). plot(tree, true) trả về mỗi đoạn là một imagePath riêng,
 * nên khi tô đặc nền bo sẽ sinh cạnh giả -> thủng mảng lớn hình "ngọn lửa".
 * Nối các đoạn theo endpoint (đảo chiều khi cần) thành vòng kín trước khi render.
 */
const stitchOutline = (tree: any) => {
  const segs: any[] = []
  for (const c of tree?.children ?? []) if (c?.segments?.length) segs.push(...c.segments)
  if (segs.length < 2) return tree

  const TOL = 0.05 // mm — KiCad để hở vài µm giữa cung và đoạn thẳng
  const near = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= TOL
  const reverse = (s: any) => ({ ...s, start: s.end, end: s.start })

  const remaining = segs.slice()
  const chains: any[][] = []
  while (remaining.length > 0) {
    const chain = [remaining.shift()]
    let grew = true
    while (grew && remaining.length > 0) {
      grew = false
      const tail = chain[chain.length - 1].end
      for (let i = 0; i < remaining.length; i++) {
        if (near(remaining[i].start, tail)) {
          chain.push(remaining.splice(i, 1)[0])
          grew = true
          break
        }
        if (near(remaining[i].end, tail)) {
          chain.push(reverse(remaining.splice(i, 1)[0]))
          grew = true
          break
        }
      }
    }
    chains.push(chain)
  }

  const template = tree.children.find((c: any) => c?.segments?.length) ?? tree.children[0]
  return { ...tree, children: chains.map((segments) => ({ ...template, segments })) }
}

// Đã thử tối ưu renderThree (chiếm ~86% thời gian dựng) bằng cách tắt
// extrudeSettings.bevelEnabled và giảm curveSegments: nhanh 2.8x nhưng nền bo và
// copper biến mất hoàn toàn — web-gerber phụ thuộc vào bevel để dựng mặt tô đặc.
// Giữ nguyên cấu hình mặc định của thư viện.

/**
 * Chế độ Real: mô phỏng bo thật. Soldermask xanh là lớp phủ mờ đục, nên đường mạch
 * bên dưới chỉ hiện lờ mờ. Màu Copper vì thế phải RẤT sát màu Oil — chênh nhiều sẽ
 * ra cảm giác "nhìn xuyên" như ảnh X-quang.
 * Chế độ CAM: xem file gia công, mỗi lớp một màu phẳng tương phản trên nền tối,
 * không có mask/nền FR-4.
 */
const REAL = {
  background: 0xeeeeee,
  Oil: 0x1c7a3c,
  Copper: 0x1d7d3f,      // chỉ nhạt hơn Oil một chút -> trace hiện mờ, không chói
  MaskOpening: 0xc9a227, // lỗ mở mask = pad đồng mạ ENIG
  Silkscreen: 0xf2f2f2,
  BaseBoard: 0xbfaf42,
  Drill: 0x2b2b2b,
}

// Màu CAM lấy trùng bảng màu của sidebar (matchLayer) để nhìn là biết lớp nào
const CAM: Record<string, number> = {
  'copper/top': 0xe55039,
  'copper/bottom': 0x38bdf8,
  'copper/inner': 0xe67e22,
  'soldermask/top': 0x00b08b,
  'soldermask/bottom': 0x16a085,
  'silkscreen/top': 0xffffff,
  'silkscreen/bottom': 0x8eaee0,
  'solderpaste/top': 0xb5a672,
  'solderpaste/bottom': 0xa59662,
  'outline/all': 0xf1c40f,
  'drill/all': 0x111111,
}
const CAM_FALLBACK = 0x9b59b6
// Ở chế độ CAM, vùng bo chỉ là nền tối để các lớp gia công nổi lên (tô vàng cả đĩa sẽ chói)
const CAM_BOARD = 0x232833
export const Viewer2DWebGL: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null)
  // Giữ tham chiếu object đã dựng để effect bật/tắt lớp chạy được mà không phải render lại
  const sceneRef = useRef<{
    byFile: Map<string, any>
    maskFiles: { top: string[]; bottom: string[] }
    topOil: any
    bottomOil: any
    camMode: boolean
  } | null>(null)
  const [board, setBoard] = useState(BoardDataModel.getState())
  const [status, setStatus] = useState('Chưa tải dữ liệu')
  const [totalMs, setTotalMs] = useState<number | null>(null)
  const [failed, setFailed] = useState<string[]>([])

  useEffect(() => BoardDataModel.subscribe(setBoard), [])

  const camMode = board.activeView === 'CAM'

  useEffect(() => {
    const el = containerRef.current
    if (!el || !board.isLoaded || board.rawFiles.length === 0) return

    while (el.firstChild) el.removeChild(el.firstChild)

    // OrbitControls nội bộ của web-gerber không được expose ra (render chỉ có Scene/Camera/Renderer)
    // và nó ghi đè camera mỗi frame với target (0,0,0) -> bo bị nghiêng. Tự làm pan/zoom thay thế.
    const render: any = NewRenderByElement(el, {
      AddAnimationLoop: true,
      AddOrbitControls: false,
      AddResizeListener: true,
    })
    render.Scene.background?.set?.(camMode ? 0x14161b : REAL.background)

    const t0 = performance.now()
    const bad: string[] = []
    const identity = identifyLayers(board.rawFiles.map((f) => f.name))

    // --- Chọn file khoan ---
    // KiCad có thể xuất cả bản gộp (.drl, FileFunction MixedPlating) LẪN bộ tách
    // (-PTH.drl / -NPTH.drl). Bản gộp là đầy đủ nhất; nếu chỉ có bộ tách thì phải
    // dùng tất cả. pcb.Drill chỉ có 1 slot nên các file phụ được gắn làm con.
    const countHoles = (s: string) => (s.match(/^X/gm) || []).length
    const drills = board.rawFiles
      .filter((f) => identity[f.name]?.type === 'drill')
      .map((f) => ({
        name: f.name,
        holes: countHoles(f.content),
        split: /-(N?PTH)\.\w+$/i.test(f.name),
      }))
      .filter((d) => d.holes > 0)

    const merged = drills.filter((d) => !d.split).sort((a, b) => b.holes - a.holes)
    const drillPlan = merged.length > 0 ? [merged[0]] : drills
    const drillUse = new Set(drillPlan.map((d) => d.name))
    const drillHoles = drillPlan.reduce((n, d) => n + d.holes, 0)

    // Bounds tính từ ImageTree.size (không đụng tới three)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    // assemblyPCBToThreeJS yêu cầu mọi slot là Object3D hợp lệ (không nhận null).
    // Tạo group rỗng bằng chính three nội bộ của web-gerber.
    const emptyParser = createParser()
    emptyParser.feed('%FSLAX24Y24*%\n%MOMM*%\nM02*')
    const emptyPlot = plot(emptyParser.result(), false)
    const emptyObj = () => renderThree(emptyPlot, 0x000000, undefined, false)

    const pcb: any = {
      Top: { Copper: emptyObj(), SolderMask: emptyObj(), Silkscreen: emptyObj() },
      Btm: { Copper: emptyObj(), SolderMask: emptyObj(), Silkscreen: emptyObj() },
      OutLine: emptyObj(),
      Drill: emptyObj(),
    }

    // filename -> object, để checkbox layer ở sidebar bật/tắt được lớp tương ứng
    const byFile = new Map<string, any>()
    const maskFiles = { top: [] as string[], bottom: [] as string[] }

    let ok = 0
    let drillPlaced = 0
    for (const raw of board.rawFiles) {
      const id = identity[raw.name]
      if (!id?.type) continue

      const isOutline = id.type === 'outline'
      try {
        const parser = createParser()
        parser.feed(raw.content)
        const rawPlotted = plot(parser.result(), isOutline)
        const plotted = isOutline ? stitchOutline(rawPlotted) : rawPlotted

        if (plotted?.size?.length === 4) {
          const scale = plotted.units === 'in' ? 25.4 : 1
          minX = Math.min(minX, plotted.size[0] * scale)
          minY = Math.min(minY, plotted.size[1] * scale)
          maxX = Math.max(maxX, plotted.size[2] * scale)
          maxY = Math.max(maxY, plotted.size[3] * scale)
        }

        const color = camMode
          ? (isOutline ? CAM_BOARD : CAM[`${id.type}/${id.side ?? 'all'}`] ?? CAM_FALLBACK)
          : id.type === 'copper' ? REAL.Copper :
            id.type === 'soldermask' ? REAL.MaskOpening :
            id.type === 'silkscreen' ? REAL.Silkscreen :
            id.type === 'drill' ? REAL.Drill :
            REAL.BaseBoard

        const obj = renderThree(plotted, color, undefined, isOutline)
        if (!obj) continue

        byFile.set(raw.name, obj)

        const slot = id.side === 'bottom' ? pcb.Btm : pcb.Top
        if (id.type === 'copper') slot.Copper = obj
        else if (id.type === 'soldermask') {
          slot.SolderMask = obj
          maskFiles[id.side === 'bottom' ? 'bottom' : 'top'].push(raw.name)
        }
        else if (id.type === 'silkscreen') slot.Silkscreen = obj
        else if (isOutline) pcb.OutLine = obj
        else if (id.type === 'drill') {
          if (!drillUse.has(raw.name)) continue
          // Object rỗng khởi tạo ban đầu không có mesh -> file khoan đầu tiên thay thế nó,
          // các file sau gắn làm con để cùng chịu scale/transform của assembly.
          if (drillPlaced === 0) pcb.Drill = obj
          else pcb.Drill.add(obj)
          drillPlaced++
        }
        else continue

        ok++
      } catch (e) {
        console.warn('[WebGL] lỗi lớp', raw.name, e)
        bad.push(raw.name)
      }
    }

    try {
      assemblyPCBToThreeJS(render.Scene, pcb, DefaultLaminar, REAL.Oil)
    } catch (e) {
      console.error('[WebGL] assemblyPCBToThreeJS lỗi:', e)
      setStatus('Lỗi lắp PCB — xem console')
    }

    // NewRenderByElement hard-code logarithmicDepthBuffer:true. Các lớp PCB chỉ cách nhau
    // 0.01–0.04 mm nên depth buffer không phân giải nổi -> mask/silk bị copper đè.
    // Nhìn từ trên xuống nên dùng painter's algorithm: tắt depth test, xếp theo renderOrder.
    const paintOrder = (obj: any, order: number) => {
      if (!obj) return
      obj.renderOrder = order
      obj.traverse((o: any) => {
        o.renderOrder = order
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        mats.forEach((m: any) => {
          m.depthTest = false
          m.depthWrite = false
        })
      })
    }

    // Hai lớp "oil" (mask phủ cả bo) do assembly tự clone từ OutLine và add vào scene;
    // nhận diện bằng cách loại trừ các object đã biết, phân biệt trên/dưới theo position.z
    const known = new Set<any>([
      pcb.OutLine, pcb.Drill,
      pcb.Top.Copper, pcb.Top.SolderMask, pcb.Top.Silkscreen,
      pcb.Btm.Copper, pcb.Btm.SolderMask, pcb.Btm.Silkscreen,
    ])
    const oils = (render.Scene.children as any[]).filter(
      (c) => !known.has(c) && c.type !== 'AmbientLight' && c.isObject3D && c.children?.length
    )
    const topOil = oils.find((o) => o.position.z > 0)
    const bottomOil = oils.find((o) => o.position.z < 0)

    // Silk vẽ TRƯỚC mask openings: nhà máy luôn cắt bỏ mực in lụa ở vùng pad,
    // nên pad đồng phải luôn nằm trên silk.
    paintOrder(pcb.Btm.SolderMask, 0)
    paintOrder(pcb.Btm.Silkscreen, 1)
    paintOrder(pcb.Btm.Copper, 2)
    paintOrder(bottomOil, 3)
    paintOrder(pcb.OutLine, 4)
    paintOrder(topOil, 5)
    paintOrder(pcb.Top.Copper, 6)
    paintOrder(pcb.Top.Silkscreen, 7)
    paintOrder(pcb.Top.SolderMask, 8)
    paintOrder(pcb.Drill, 9)

    // Chế độ CAM xem file gia công -> bỏ lớp phủ mask xanh, chỉ còn nền bo + các lớp
    if (camMode) {
      if (topOil) topOil.visible = false
      if (bottomOil) bottomOil.visible = false
    }

    sceneRef.current = { byFile, maskFiles, topOil, bottomOil, camMode }

    // --- Camera top-down + pan/zoom tự quản (chỉ set số, không tạo object three) ---
    const cam = render.Camera
    const cleanups: Array<() => void> = []

    if (cam && Number.isFinite(minX) && maxX > minX && maxY > minY) {
      const w = maxX - minX
      const h = maxY - minY

      // NewRenderByElement chỉ tạo PerspectiveCamera và không cho thay bằng ortho.
      // FOV rất nhỏ + camera rất xa => phối cảnh triệt tiêu, nhìn như orthographic
      // (không lộ thành bo, nét chữ silkscreen không bị méo ở rìa).
      cam.fov = 1.2
      const fov = (cam.fov * Math.PI) / 180

      const aspectNow = () => (el.clientWidth || 800) / (el.clientHeight || 600)
      const fitDist = (Math.max(h, w / aspectNow()) / 2 / Math.tan(fov / 2)) * 1.15

      const view = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, dist: fitDist }
      const apply = () => {
        // AddResizeListener của web-gerber gọi setSize() nhưng KHÔNG cập nhật
        // camera.aspect -> khung hình lệch tỉ lệ, bo tròn hiển thị thành elip.
        cam.aspect = aspectNow()
        // Các lớp PCB chỉ cách nhau 0.01–0.04 mm. Với camera ở xa (trick FOV nhỏ),
        // near/far rộng sẽ làm depth buffer không phân giải nổi -> z-fighting,
        // mask/silk bị copper đè. Siết near/far ôm sát bề dày bo (±5 mm là dư).
        cam.near = Math.max(0.01, view.dist - 5)
        cam.far = view.dist + 5
        cam.position.set(view.x, view.y, view.dist)
        cam.up.set(0, 1, 0)
        cam.lookAt(view.x, view.y, 0)
        cam.updateProjectionMatrix()
      }
      apply()

      // Container đổi kích thước (mở/đóng sidebar, resize cửa sổ) -> cập nhật lại
      // cả renderer lẫn aspect, vì listener của web-gerber chỉ làm nửa việc.
      const ro = new ResizeObserver(() => {
        const cw = el.clientWidth
        const ch = el.clientHeight
        if (!cw || !ch) return
        render.Renderer?.setSize?.(cw, ch)
        apply()
      })
      ro.observe(el)
      cleanups.push(() => ro.disconnect())

      const canvas = render.Renderer?.domElement as HTMLCanvasElement | undefined
      if (canvas) {
        const onWheel = (e: WheelEvent) => {
          e.preventDefault()
          view.dist *= e.deltaY > 0 ? 1.12 : 1 / 1.12
          view.dist = Math.min(Math.max(view.dist, fitDist * 0.02), fitDist * 20)
          apply()
        }
        let dragging = false
        let lastX = 0
        let lastY = 0
        const onDown = (e: PointerEvent) => {
          dragging = true
          lastX = e.clientX
          lastY = e.clientY
          canvas.setPointerCapture(e.pointerId)
        }
        const onMove = (e: PointerEvent) => {
          if (!dragging) return
          // đổi pixel -> đơn vị world theo chiều cao khung nhìn hiện tại
          const worldPerPx = (2 * view.dist * Math.tan(fov / 2)) / (canvas.clientHeight || 1)
          view.x -= (e.clientX - lastX) * worldPerPx
          view.y += (e.clientY - lastY) * worldPerPx
          lastX = e.clientX
          lastY = e.clientY
          apply()
        }
        const onUp = (e: PointerEvent) => {
          dragging = false
          try { canvas.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
        }
        canvas.addEventListener('wheel', onWheel, { passive: false })
        canvas.addEventListener('pointerdown', onDown)
        canvas.addEventListener('pointermove', onMove)
        canvas.addEventListener('pointerup', onUp)
        canvas.style.cursor = 'grab'
        cleanups.push(() => {
          canvas.removeEventListener('wheel', onWheel)
          canvas.removeEventListener('pointerdown', onDown)
          canvas.removeEventListener('pointermove', onMove)
          canvas.removeEventListener('pointerup', onUp)
        })
      }
    }

    setTotalMs(Math.round(performance.now() - t0))
    setFailed(bad)
    setStatus(
      `Đã dựng ${ok} lớp · khoan ${drillHoles} lỗ (${drillPlan.map((d) => d.name.split(/[\\/]/).pop()).join(', ') || 'không có'})`
    )

    return () => {
      cleanups.forEach((fn) => fn())
      sceneRef.current = null
      try { render.Renderer?.dispose?.() } catch { /* ignore */ }
      while (el.firstChild) el.removeChild(el.firstChild)
    }
  }, [board.isLoaded, board.rawFiles, camMode])

  // Bật/tắt lớp theo checkbox ở sidebar — chỉ đổi .visible, không dựng lại scene.
  // Sidebar được dựng từ GerberParser (tracespace), mà tracespace parse fail nhiều lớp
  // -> những lớp đó không có mặt trong danh sách. Chỉ ẩn khi file CÓ trong sidebar và
  // bị bỏ tick; file sidebar không biết thì để hiện.
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    const listed = new Set(board.layers.map((l) => l.id))
    const shown = (file: string) => (listed.has(file) ? board.visibleLayers.has(file) : true)

    for (const [file, obj] of s.byFile) obj.visible = shown(file)
    // Lớp "oil" (mask phủ cả bo) do assembly tự sinh, không có file riêng
    // -> coi như thuộc lớp soldermask cùng mặt.
    const anyShown = (files: string[]) => files.length === 0 || files.some(shown)
    if (s.topOil) s.topOil.visible = !s.camMode && anyShown(s.maskFiles.top)
    if (s.bottomOil) s.bottomOil.visible = !s.camMode && anyShown(s.maskFiles.bottom)
  }, [board.visibleLayers, board.layers, board.rawFiles])

  if (!board.isLoaded) {
    return (
      <div style={emptyStyle}>
        <div>
          <div style={{ fontSize: 16, marginBottom: 8 }}>WebGL Viewer (web-gerber)</div>
          <div style={{ opacity: 0.6 }}>Tải file Gerber ZIP/RAR để bắt đầu</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#0b0d10' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div style={badge}>
        <div><b>WebGL (web-gerber)</b> · assemblyPCBToThreeJS</div>
        <div>{status}</div>
        {totalMs !== null && <div>Parse + Render: {totalMs} ms</div>}
        {failed.length > 0 && (
          <div style={{ color: '#fca5a5', marginTop: 4 }}>
            Lỗi {failed.length} lớp: {failed.slice(0, 3).join(', ')}{failed.length > 3 && '…'}
          </div>
        )}
      </div>
    </div>
  )
}

const emptyStyle: React.CSSProperties = {
  width: '100%', height: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#94a3b8', backgroundColor: '#0b0d10', textAlign: 'center',
}
const badge: React.CSSProperties = {
  position: 'absolute', top: 8, left: 8,
  background: 'rgba(15,23,42,0.85)', color: '#e2e8f0',
  padding: '8px 10px', borderRadius: 6, fontSize: 12,
  fontFamily: 'ui-monospace, monospace', border: '1px solid #334155',
  pointerEvents: 'none',
}
