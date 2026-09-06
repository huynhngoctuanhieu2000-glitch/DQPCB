import React, { useEffect, useRef, useState } from 'react'
import { BoardDataModel } from '../../models/BoardDataModel'
// @ts-ignore - web-gerber typings for named exports are incomplete
import {
  createParser,
  plot,
  renderThree,
  assemblyPCBToThreeJS,
  NewRenderByElement,
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

  // web-gerber dựng outline bằng cách duyệt từng child và nối vào một shape, nhưng
  // nó CHỈ chấp nhận child có đúng 1 segment:
  //     if (n.segments.length != 1) -> warn("Invalid outline segments length"), null
  // Gộp cả chuỗi vào một child sẽ bị từ chối và lõi bo không được dựng (nhìn xuyên
  // xuống mặt dưới). Nên trả về mỗi segment một child, chỉ khác là ĐÚNG THỨ TỰ.
  const template = tree.children.find((c: any) => c?.segments?.length) ?? tree.children[0]
  return {
    ...tree,
    children: chains.flat().map((seg) => ({ ...template, segments: [seg] })),
  }
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
  Oil: 0x1c7a3c,         // soldermask xanh phủ vùng không có đồng
  // Đồng nằm DƯỚI mask nên thấy màu đồng đã bị mask xanh lọc qua — sáng hơn nền mask
  // rõ rệt, đúng như bo thật soi thẳng. Trước đây để gần trùng màu Oil vì tưởng đó là
  // nguyên nhân "nhìn xuyên", nhưng thủ phạm thật là lõi FR-4 bị thủng (xem stitchOutline);
  // sửa xong lõi rồi thì mạch nổi lên vẫn không hề bị xuyên xuống mặt dưới.
  Copper: 0x49b06a,
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

// Stack-up phóng đại theo trục z. Giữ đúng tỉ lệ tương đối giữa các lớp, chỉ nhân lên
// để depth buffer phân biệt được — nhìn thẳng từ trên xuống thì không thấy khác biệt.
const LAMINAR = { Copper: 0.12, SolderMask: 0.14, Oil: 0.04, Silkscreen: 0.04, Total: 2.4 }
// Ở chế độ CAM, vùng bo chỉ là nền tối để các lớp gia công nổi lên (tô vàng cả đĩa sẽ chói)
const CAM_BOARD = 0x232833
export interface Viewer2DWebGLProps {
  /** Ép chế độ hiển thị, bỏ qua activeView của model (dùng cho khung chia đôi Top/Bot) */
  viewOverride?: 'CAM' | 'Real' | '3D'
  /**
   * Chỉ trình bày một mặt bo:
   *   'top'    – nhìn từ trên xuống (mặc định)
   *   'bottom' – nhìn từ dưới lên, tức là ảnh lật gương như bản vẽ lắp ráp mặt dưới
   * Không ẩn lớp nào — chỉ đảo thứ tự vẽ để mặt cần xem nằm trên cùng.
   */
  faceSide?: 'top' | 'bottom'
  /** Ẩn badge thông tin (khung chia đôi chỉ cần một badge) */
  hideBadge?: boolean
}

export const Viewer2DWebGL: React.FC<Viewer2DWebGLProps> = ({
  viewOverride,
  faceSide = 'top',
  hideBadge = false,
}) => {
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

  const effectiveView = viewOverride ?? board.activeView
  const camMode = effectiveView === 'CAM'
  const threeDMode = effectiveView === '3D'
  const fromBelow = faceSide === 'bottom'

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
    // Phân loại lấy từ board.layers (matchLayer trong GerberParser) — CHÍNH LÀ thứ
    // sidebar đang hiển thị, nên hai bên luôn khớp nhau.
    // Không dùng identifyLayers của web-gerber: nó chỉ bắt chữ top/bottom rồi mặc định
    // copper, ví dụ PCB_soldermask_top.gbr và PCB_silkscreen_top.gbr đều ra copper/top
    // -> soldermask/silk bị nhét vào ô Copper và ghi đè lẫn nhau.
    const identity: Record<string, { type: string; side: string }> = {}
    for (const l of board.layers) identity[l.filename] = { type: l.type, side: l.side }

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
      // Bề dày thật của các lớp (đồng 0.035mm, mask 0.04mm…) quá mỏng để depth buffer
      // phân giải -> lớp mặt dưới lọt lên trên nền FR-4, nhìn như xuyên thấu.
      // Nới khoảng cách z lên ~10 lần: nhìn từ trên xuống không khác gì, nhưng thứ tự
      // che khuất trở nên chính xác.
      assemblyPCBToThreeJS(render.Scene, pcb, LAMINAR, REAL.Oil)
    } catch (e) {
      console.error('[WebGL] assemblyPCBToThreeJS lỗi:', e)
      setStatus('Lỗi lắp PCB — xem console')
    }

    // Trước đây tắt depth test và xếp lớp bằng renderOrder — KHÔNG ăn thua: three vẫn
    // vẽ theo độ sâu nên lớp mặt dưới lọt lên trên nền FR-4 (hiện tượng "nhìn xuyên").
    // Giờ để depth buffer làm việc của nó; renderOrder chỉ còn là tie-break.
    const paintOrder = (obj: any, order: number) => {
      if (!obj) return
      obj.renderOrder = order
      obj.traverse((o: any) => {
        o.renderOrder = order
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        mats.forEach((m: any) => {
          m.depthTest = true
          m.depthWrite = true
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

    // Thứ tự đúng theo vật lý bo thật (kể từ nền FR-4 đi lên):
    //   đồng -> soldermask (phủ lên đồng, hơi trong) -> in lụa -> pad lộ ra ở lỗ mở mask
    // Vẽ đồng ĐÈ LÊN mask là sai: mọi đường mạch sẽ hiện rõ như ảnh X-quang.
    // Mặt dưới xếp ngược lại vì nhìn từ trên xuống.
    // Silk vẽ TRƯỚC mask openings: nhà máy luôn cắt bỏ mực in lụa ở vùng pad,
    // nên pad đồng phải luôn nằm trên silk.
    //
    // Lưu ý: đã thử xếp copper DƯỚI oil rồi cho oil bán trong suốt (đúng vật lý hơn),
    // nhưng renderOrder không khống chế được thứ tự vẽ ở đây — copper vẫn đè lên oil
    // và cả bo ra màu đồng. Nên giữ copper trên oil, và mô phỏng "đồng nhìn qua mask"
    // bằng MÀU (xem REAL.Copper) thay vì bằng alpha.
    //
    // Khung "mặt dưới" nhìn ngược từ dưới lên nên phải đảo toàn bộ thứ tự: mặt Bot
    // trở thành mặt trên cùng, mặt Top bị nền bo + oil che lại.
    const near = fromBelow ? pcb.Btm : pcb.Top
    const far = fromBelow ? pcb.Top : pcb.Btm
    const nearOil = fromBelow ? bottomOil : topOil
    const farOil = fromBelow ? topOil : bottomOil

    paintOrder(far.SolderMask, 0)
    paintOrder(far.Silkscreen, 1)
    paintOrder(far.Copper, 2)
    paintOrder(farOil, 3)
    paintOrder(pcb.OutLine, 4)
    paintOrder(nearOil, 5)
    paintOrder(near.Copper, 6)
    paintOrder(near.Silkscreen, 7)
    paintOrder(near.SolderMask, 8)
    paintOrder(pcb.Drill, 9)

    // --- Chỉnh cao độ để pad và lỗ khoan đọc được ở view 3D ---
    // Ở view 2D thứ tự do painter's algorithm quyết định, nhưng 3D bật depth test nên
    // cao độ thật mới là thứ quyết định che khuất. Hai chỗ cần nắn:
    //
    // 1) Stack của web-gerber đặt in lụa CAO HƠN lớp mask, nên chữ in đè trắng lên pad.
    //    Thực tế nhà máy luôn cắt bỏ mực in ở vùng pad -> nâng mask lên trên silk.
    //    Pad chính là chỗ ĐỒNG lộ ra, nên mặt pad phải NGANG BẰNG mặt đồng. Neo cả
    //    in lụa lẫn mask vào cao độ mặt đồng, chỉ chênh nhau EPS đủ để mask thắng
    //    depth test. Nâng mask lên trên in lụa (silk ở 1.20 còn đồng chỉ 1.02) sẽ làm
    //    pad cao hơn mặt đồng gần 0.2 — nhìn ngang thành cục vàng dựng đứng.
    const EPS = 0.005
    const flushToCopper = (slot: any, outward: 1 | -1) => {
      if (!slot?.Copper) return
      const copperOuter = slot.Copper.position.z + (outward * slot.Copper.scale.z) / 2
      if (slot.Silkscreen) {
        slot.Silkscreen.position.z =
          copperOuter + outward * (EPS / 2 - slot.Silkscreen.scale.z / 2)
      }
      if (slot.SolderMask) {
        slot.SolderMask.position.z =
          copperOuter + outward * (EPS - slot.SolderMask.scale.z / 2)
      }
    }
    flushToCopper(pcb.Top, 1)
    flushToCopper(pcb.Btm, -1)

    // 2) Trụ khoan phải cao ĐÚNG bằng bo (nhìn ngang mới không thấy nó thò ra), nhưng
    //    đỉnh trùng khít cao độ mặt mask thì z-fighting và lỗ biến mất. Nên tính theo
    //    bề mặt ngoài cùng thực tế rồi cộng thêm một lượng rất nhỏ.
    if (pcb.Drill?.scale) {
      const outer = [
        pcb.Top.SolderMask, pcb.Top.Silkscreen, pcb.Top.Copper, topOil, pcb.OutLine,
      ]
        .filter(Boolean)
        .map((o: any) => o.position.z + o.scale.z / 2)
      const topOuter = Math.max(...outer)
      if (Number.isFinite(topOuter) && topOuter > 0) {
        pcb.Drill.position.setZ(0)
        pcb.Drill.scale.setZ((topOuter + EPS) * 2)
      }
    }

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
      // View 2D: FOV rất nhỏ + camera rất xa => phối cảnh triệt tiêu, nhìn như
      // orthographic (không lộ thành bo, chữ silkscreen không méo ở rìa).
      // View 3D: FOV thường để thấy được độ dày và khối của bo.
      // FOV 2D để nhỏ cho gần giống orthographic, nhưng KHÔNG được quá nhỏ: FOV càng
      // nhỏ thì camera càng xa, mà logarithmicDepthBuffer (web-gerber hard-code) mất
      // sạch độ chính xác khi near/far đều lớn và sát nhau.
      cam.fov = threeDMode ? 40 : 6
      const fov = (cam.fov * Math.PI) / 180

      const aspectNow = () => (el.clientWidth || 800) / (el.clientHeight || 600)
      const fitDist = (Math.max(h, w / aspectNow()) / 2 / Math.tan(fov / 2)) * 1.15

      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      // 2D pan bằng dịch tâm nhìn; 3D orbit bằng góc phương vị/cao độ quanh tâm bo
      const view = { x: cx, y: cy, dist: fitDist, az: -Math.PI / 2, el: fromBelow ? -0.9 : 0.9 }

      const apply = () => {
        // AddResizeListener của web-gerber gọi setSize() nhưng KHÔNG cập nhật
        // camera.aspect -> khung hình lệch tỉ lệ, bo tròn hiển thị thành elip.
        cam.aspect = aspectNow()

        if (threeDMode) {
          const r = view.dist
          cam.near = Math.max(0.1, r * 0.05)
          cam.far = r * 4
          cam.position.set(
            view.x + r * Math.cos(view.el) * Math.cos(view.az),
            view.y + r * Math.cos(view.el) * Math.sin(view.az),
            r * Math.sin(view.el)
          )
          cam.up.set(0, 0, 1)
          cam.lookAt(view.x, view.y, 0)
        } else {
          // Các lớp PCB chỉ cách nhau 0.01–0.04 mm. Với camera ở xa (trick FOV nhỏ),
          // near/far rộng sẽ làm depth buffer không phân giải nổi -> z-fighting,
          // mask/silk bị copper đè. Siết near/far ôm sát bề dày bo (±5 mm là dư).
          // near nhỏ hơn far hai bậc -> log depth buffer phân giải tốt, đủ tách các
          // lớp cách nhau ~0.1 mm; near/far sát nhau sẽ làm depth mất tác dụng.
          cam.near = view.dist / 50
          cam.far = view.dist * 2
          // Mặt dưới: đặt camera bên dưới bo nhìn ngược lên -> ảnh lật gương,
          // đúng quy ước bản vẽ "bottom view" của nhà máy.
          cam.position.set(view.x, view.y, fromBelow ? -view.dist : view.dist)
          cam.up.set(0, 1, 0)
          cam.lookAt(view.x, view.y, 0)
        }
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
          if (threeDMode) {
            // kéo ngang = xoay quanh trục z, kéo dọc = nâng/hạ góc nhìn
            view.az -= (e.clientX - lastX) * 0.008
            view.el += (e.clientY - lastY) * 0.008
            // chặn sát 2 cực để camera không lật
            view.el = Math.min(Math.max(view.el, -1.5), 1.5)
          } else {
            // đổi pixel -> đơn vị world theo chiều cao khung nhìn hiện tại
            const worldPerPx = (2 * view.dist * Math.tan(fov / 2)) / (canvas.clientHeight || 1)
            // Nhìn từ dưới lên thì trục X trên màn hình bị lật -> đảo dấu để kéo
            // sang phải thì bo vẫn chạy sang phải.
            view.x += (fromBelow ? 1 : -1) * (e.clientX - lastX) * worldPerPx
            view.y += (e.clientY - lastY) * worldPerPx
          }
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
    // threeDMode phải nằm trong deps: chuyển Real 2D → 3D View không đổi camMode
    // (cả hai đều false) nên effect không chạy lại và cảnh vẫn là ảnh 2D phẳng.
  }, [board.isLoaded, board.rawFiles, camMode, threeDMode, fromBelow])

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
      {hideBadge ? (
        <div style={faceTag}>{fromBelow ? 'BOT — nhìn từ dưới' : 'TOP — nhìn từ trên'}</div>
      ) : (
        <div style={badge}>
          <div><b>WebGL (web-gerber)</b> · assemblyPCBToThreeJS</div>
          <div>{status}</div>
          {totalMs !== null && <div>Parse + Render: {totalMs} ms</div>}
          {threeDMode && (
            <div style={{ color: '#93c5fd', marginTop: 4 }}>
              Kéo chuột để xoay (kéo lên để lật xem mặt Bot) · lăn để zoom
            </div>
          )}
          {failed.length > 0 && (
            <div style={{ color: '#fca5a5', marginTop: 4 }}>
              Lỗi {failed.length} lớp: {failed.slice(0, 3).join(', ')}{failed.length > 3 && '…'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const emptyStyle: React.CSSProperties = {
  width: '100%', height: '100%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#94a3b8', backgroundColor: '#0b0d10', textAlign: 'center',
}
const faceTag: React.CSSProperties = {
  position: 'absolute', top: 8, left: 8,
  background: 'rgba(15,23,42,0.85)', color: '#e2e8f0',
  padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
  letterSpacing: 0.4, border: '1px solid #334155', pointerEvents: 'none',
}
const badge: React.CSSProperties = {
  position: 'absolute', top: 8, left: 8,
  background: 'rgba(15,23,42,0.85)', color: '#e2e8f0',
  padding: '8px 10px', borderRadius: 6, fontSize: 12,
  fontFamily: 'ui-monospace, monospace', border: '1px solid #334155',
  pointerEvents: 'none',
}
