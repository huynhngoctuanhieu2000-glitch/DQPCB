import React, { useEffect, useRef, useState } from 'react'
import { BoardDataModel } from '../../models/BoardDataModel'
import { realPalette, HOLE, MASK_OPENING, BASE_BOARD } from '../../models/RealPalette'
import { copperSamplePoints, splitOutlineLoops } from '../../lib/gerber-reader'
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
  // Oil/Copper thật sự dùng khi dựng bo do `realPalette` suy ra từ màu bo người dùng
  // chọn; hai giá trị dưới chỉ là mốc tham chiếu cho màu xanh mặc định.
  Oil: 0x185428,
  Copper: 0x2c7834,
  MaskOpening: MASK_OPENING,
  Silkscreen: 0xf2f2f2,
  BaseBoard: BASE_BOARD,
  Drill: HOLE,
}

// Màu dự phòng khi layer chưa có màu hợp lệ
const CAM_FALLBACK = 0x9b59b6

/** Nền khung CAM — cũng là "màu nằm dưới" khi khoét đảo cực ở chế độ CAM. */
const CAM_BACKGROUND = 0x14161b

/**
 * Tách cây ảnh thành các ĐOẠN liên tiếp cùng cực (`%LPD*%` / `%LPC*%`).
 *
 * web-gerber có đọc đảo cực và đóng dấu `polarity` lên từng hình, nhưng không
 * renderer nào của nó đọc lại con dấu đó — hằng số "clear" chỉ được định nghĩa, gán,
 * rồi export ra ngoài, không hề có chỗ nào so sánh. Kết quả: mọi hình đảo cực bị vẽ
 * ĐẶC như hình thường, mảng phủ đồng nuốt sạch đường mạch và ruột chữ O/D/8 bị bít.
 *
 * THỨ TỰ LÀ THỨ QUYẾT ĐỊNH, không phải gom hai nhóm. Altium xuất lớp đồng theo kiểu:
 *
 *     dark(mảng phủ) → clear(khoét khe cách) → dark(đường mạch + pad)
 *
 * Gom hết clear lại rồi khoét sau cùng sẽ xoá luôn đám dark vẽ sau nó — đúng là
 * đường mạch biến mất, chỉ còn lại vệt khe cách rỗng. Nên phải giữ nguyên trình tự
 * và vẽ từng đoạn chồng lên nhau đúng thứ tự trong file.
 *
 * Trả về null nếu lớp không dùng đảo cực — tuyệt đại đa số file, khỏi tốn công.
 */
const splitPolarityRuns = (tree: any): { erase: boolean; tree: any }[] | null => {
  const children = tree?.children
  if (!Array.isArray(children)) return null
  if (!children.some((c: any) => c?.polarity === 'clear')) return null

  const runs: { erase: boolean; children: any[] }[] = []
  for (const child of children) {
    const erase = child?.polarity === 'clear'
    const last = runs[runs.length - 1]
    if (last && last.erase === erase) last.children.push(child)
    else runs.push({ erase, children: [child] })
  }
  return runs.map((r) => ({ erase: r.erase, tree: { ...tree, children: r.children } }))
}

// Stack-up phóng đại theo trục z. Giữ đúng tỉ lệ tương đối giữa các lớp, chỉ nhân lên
// để depth buffer phân biệt được — nhìn thẳng từ trên xuống thì không thấy khác biệt.
const LAMINAR = { Copper: 0.12, SolderMask: 0.14, Oil: 0.04, Silkscreen: 0.04, Total: 2.4 }
/** Các loại lớp thật sự được lắp vào cảnh. Loại khác dựng xong cũng không có chỗ đặt. */
const SCENE_TYPES = new Set(['copper', 'soldermask', 'silkscreen', 'outline', 'drill'])

/**
 * Hình đã dựng cho từng lớp, dùng lại giữa các lần dựng cảnh.
 *
 * `renderThree` chiếm hơn 90% thời gian load (đo trên bo thật: parse 0.3 s, dựng hình
 * 4-5 s), và cảnh bị dựng lại mỗi khi đổi chế độ xem, đổi màu bo, hay — nặng nhất —
 * mở "2 Mặt": hai khung là hai component, mỗi khung dựng lại toàn bộ từ đầu, cùng một
 * hình y hệt. Giữ bản gốc ở đây, khung nào cần thì `clone()` (dùng chung geometry và
 * material, chỉ tốn transform).
 *
 * Cache thuộc về một `board.layers` cụ thể: nạp bo khác là dọn sạch, giải phóng GPU.
 */
const built: { layers: unknown; entries: Map<string, { obj: any; cutouts: any[] }> } = {
  layers: null,
  entries: new Map(),
}
/**
 * Geometry/material đang nằm trong cache — cleanup của cảnh phải chừa chúng ra. Chúng
 * được dispose khi cache bị dọn (đổi bo), không phải khi một khung đóng.
 */
const cachedGpu = new WeakSet<object>()

const materialsOf = (o: any): any[] =>
  Array.isArray(o.material) ? o.material : o.material ? [o.material] : []

const disposeDeep = (obj: any) =>
  obj?.traverse?.((o: any) => {
    o.geometry?.dispose?.()
    materialsOf(o).forEach((m: any) => m?.dispose?.())
  })

const claimGpu = (obj: any) =>
  obj?.traverse?.((o: any) => {
    if (o.geometry) cachedGpu.add(o.geometry)
    materialsOf(o).forEach((m: any) => cachedGpu.add(m))
  })

const ensureBuildCache = (layers: unknown) => {
  if (built.layers === layers) return
  for (const { obj, cutouts } of built.entries.values()) {
    disposeDeep(obj)
    cutouts.forEach(disposeDeep)
  }
  built.entries.clear()
  built.layers = layers
}

/**
 * Dựng hình ba chiều cho một lớp từ ImageTree đã plot. Thuần dựng, không đụng cảnh:
 * lỗ phay của outline trả riêng để bên gọi quyết định đặt vào đâu theo chế độ.
 */
const buildLayerObject = (
  plotted: any,
  opts: {
    color: number
    eraseColor: number
    fillOutline: boolean
    isOutline: boolean
    holeColor: number
    /** Điểm đồng (mm) của cả bo — để phân biệt lỗ khoét với bo con, xem outlineLoops. */
    copperPoints: number[][]
  },
): { obj: any; cutouts: any[] } | null => {
  const { color, eraseColor, fillOutline, isOutline, holeColor, copperPoints } = opts
  const cutouts: any[] = []

  // Panel có nhiều đường bao rời (9 bo + khung + rãnh v-cut). renderThree chỉ dựng
  // được MỘT shape mỗi lần gọi, nên gọi riêng từng vòng rồi gộp các mảnh lại;
  // gộp chung một lần gọi thì các bo bị nối liền thành khối tự cắt.
  // Lớp có đảo cực phải dựng theo TỪNG ĐOẠN và xếp chồng đúng thứ tự trong
  // file (xem splitPolarityRuns), nếu không phần vẽ sau sẽ bị phần khoét
  // trước đó xoá mất.
  const runs = splitPolarityRuns(plotted)

  let obj: any
  if (runs) {
    // Đoạn khoét tô bằng màu của thứ nằm dưới lớp này. Ở Real/3D thứ nằm dưới
    // in lụa và dưới đồng đều là lớp phủ mask, nên ra đúng cảm giác bo thật.
    const made = runs
      .map((run, i) => {
        const g = renderThree(run.tree, run.erase ? eraseColor : color, undefined, fillOutline)
        if (g) {
          g.userData.polarityErase = run.erase
          // Vị trí trong chuỗi, dùng để xếp thứ tự vẽ và nhấc cao độ.
          g.userData.polarityIndex = i
          g.userData.polarityCount = runs.length
        }
        return g
      })
      .filter(Boolean)
    obj = made.shift()
    made.forEach((extra: any) => obj?.add(extra))
  } else if (isOutline && plotted.parts?.length > 1) {
    // Lỗ phay bên trong bo tách riêng khỏi đường bao, vì hai lý do:
    //  - Real/3D: dựng cùng chỗ với lỗ khoan để nó xuyên suốt bề dày bo — tô đặc
    //    như thân bo thì lỗ biến mất.
    //  - CAM: tô trắng như lỗ khoan để phân biệt với đường bao gia công; ăn theo
    //    màu outline thì lỗ bắt vít lẫn hẳn vào viền bo.
    const { body, cutouts: holes } = splitOutlineLoops(plotted.parts, {
      scale: plotted.units === 'in' ? 25.4 : 1,
      copperPoints,
    })
    const made = body
      .map((part: any) => renderThree(part, color, undefined, fillOutline))
      .filter(Boolean)
    obj = made.shift()
    made.forEach((extra: any) => obj?.add(extra))
    for (const part of holes) {
      const hole = renderThree(part, holeColor, undefined, fillOutline)
      if (hole) cutouts.push(hole)
    }
  } else {
    obj = renderThree(plotted, color, undefined, fillOutline)
  }
  return obj ? { obj, cutouts } : null
}

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
  /**
   * Hệ số lề khi fit bo vào khung. 1.15 là vừa khít cho khung đơn; khung chia đôi cần
   * lề rộng hơn, nếu không hai bo fit sát mép và dính vào nhau ở đường giữa.
   */
  fitPadding?: number
  /**
   * Nhận hàm chụp khung hình hiện tại. Trả về một canvas RỜI (đã sao chép pixel) vì
   * canvas WebGL không giữ bộ đệm sau khi trình duyệt ghép hình (preserveDrawingBuffer
   * tắt) — đọc muộn một tick là ra ảnh đen.
   */
  captureRef?: React.MutableRefObject<CaptureFn | null>
}

/** Chụp bo fit sát khung, `pxPerMm` quyết định cỡ ảnh theo kích thước bo. */
export type CaptureFn = (pxPerMm?: number) => HTMLCanvasElement | null

export const Viewer2DWebGL: React.FC<Viewer2DWebGLProps> = ({
  viewOverride,
  faceSide = 'top',
  hideBadge = false,
  fitPadding = 1.15,
  captureRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  // Hàm đưa khung nhìn về vừa khít, do effect dựng cảnh gán vào
  const fitViewRef = useRef<(() => void) | null>(null)
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
    if (!el || !board.isLoaded || board.layers.length === 0) return

    while (el.firstChild) el.removeChild(el.firstChild)

    // OrbitControls nội bộ của web-gerber không được expose ra (render chỉ có Scene/Camera/Renderer)
    // và nó ghi đè camera mỗi frame với target (0,0,0) -> bo bị nghiêng. Tự làm pan/zoom thay thế.
    const render: any = NewRenderByElement(el, {
      AddAnimationLoop: true,
      AddOrbitControls: false,
      AddResizeListener: true,
    })
    render.Scene.background?.set?.(camMode ? CAM_BACKGROUND : REAL.background)
    // Chỉ khi chạy dev: lộ cảnh ra window để soi material/light từ console mà không
    // phải sửa code — three của web-gerber không import được từ ngoài.
    if (import.meta.env.DEV) {
      ;(window as any).__dqpcbScene = render.Scene
      ;(window as any).__dqpcbRender = render
    }

    const t0 = performance.now()
    const bad: string[] = []
    const palette = realPalette(board.maskColor)
    ensureBuildCache(board.layers)
    let cacheHits = 0
    const copperPoints = copperSamplePoints(board.layers)

    // --- Chọn file khoan ---
    // KiCad có thể xuất cả bản gộp (.drl, FileFunction MixedPlating) LẪN bộ tách
    // (-PTH.drl / -NPTH.drl). Bản gộp là đầy đủ nhất; nếu chỉ có bộ tách thì phải
    // dùng tất cả. pcb.Drill chỉ có 1 slot nên các file phụ được gắn làm con.
    const drills = board.layers
      .filter((l) => l.type === 'drill' && l.holeCount > 0)
      .map((l) => ({
        name: l.filename,
        holes: l.holeCount,
        // Tách = chỉ chứa một phần (PTH hoặc NPTH), phải vẽ kèm các file tách còn lại.
        // Proteus đặt tên "Drill TOP-BOT Plated.GBR" / "… NonPlated.GBR" nên chỉ đoán
        // theo đuôi -PTH/-NPTH của KiCad thì bỏ sót — GerberParser đọc X2 cho chắc.
        split:
          l.drillPlating === 'PTH' ||
          l.drillPlating === 'NPTH' ||
          /-(N?PTH)\.\w+$/i.test(l.filename),
      }))

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
    /** Lớp đồng giữa của bo nhiều lớp — assembly không nhận, phải tự xếp. */
    const innerCopper: { obj: any; idx: number }[] = []
    /** Lỗ phay lấy từ lớp outline — gắn vào cụm khoan để xuyên suốt bề dày bo. */
    const outlineCutouts: any[] = []

    let ok = 0
    let drillPlaced = 0
    // Dùng lại hình học GerberParser đã plot, KHÔNG parse lần hai. Trước đây viewer tự
    // parse lại từ rawFiles nên tồn tại hai đường đi độc lập, và chúng đã lệch nhau hai
    // lần: phân loại lớp (identifyLayers vs matchLayer) và chuẩn hoá file khoan.
    for (const raw of board.layers) {
      const id = { type: raw.type, side: raw.side }
      if (!id.type) continue

      // Dựng xong mà không có chỗ đặt trong cảnh thì dựng làm gì: lớp tài liệu (drill
      // drawing, assembly…) và file khoan không được chọn vẽ. Trước đây vẫn dựng hết —
      // riêng ba lớp tài liệu của một bo Altium đã tốn 1.1 s trong tổng 4.7 s.
      if (!SCENE_TYPES.has(id.type)) continue
      if (id.type === 'drill' && !drillUse.has(raw.filename)) continue

      const isOutline = id.type === 'outline'
      try {
        const plotted = raw.imageTree
        if (!plotted) continue

        if (plotted?.size?.length === 4) {
          const scale = plotted.units === 'in' ? 25.4 : 1
          minX = Math.min(minX, plotted.size[0] * scale)
          minY = Math.min(minY, plotted.size[1] * scale)
          maxX = Math.max(maxX, plotted.size[2] * scale)
          maxY = Math.max(maxY, plotted.size[3] * scale)
        }

        // CAM lấy màu từ chính layer, tức ô màu người dùng bấm đổi được ở sidebar.
        // Real/3D thì màu là mô phỏng vật liệu nên vẫn dùng bảng cố định.
        // `|| CAM_FALLBACK` cũ coi màu đen (parseInt = 0) là không hợp lệ, nên lớp nào
        // để đen cũng bị đổi sang tím dự phòng. Chỉ thật sự hỏng khi parse ra NaN.
        const swatch = parseInt(String(raw.color).replace('#', ''), 16)
        const color = camMode
          ? (Number.isNaN(swatch) ? CAM_FALLBACK : swatch)
          : id.type === 'copper' ? palette.Copper :
            id.type === 'soldermask' ? palette.MaskOpening :
            id.type === 'silkscreen' ? palette.Silkscreen :
            id.type === 'drill' ? palette.Drill :
            palette.BaseBoard

        // Tham số cuối của renderThree quyết định outline được TÔ ĐẶC hay vẽ VIỀN.
        // Real/3D cần tô đặc vì đó là lõi FR-4 của bo. CAM thì outline là đường bao gia
        // công, phải vẽ thành viền — tô đặc sẽ thành một mảng che hết, mà bật riêng lớp
        // Outline lại chỉ thấy một mảng tối.
        const fillOutline = isOutline && !camMode

        const eraseColor = camMode ? CAM_BACKGROUND : palette.Oil
        const key = [raw.id, camMode ? 'cam' : 'real', color, eraseColor, fillOutline].join('|')
        let hit = built.entries.get(key)
        if (hit) {
          cacheHits++
        } else {
          const made = buildLayerObject(plotted, {
            color,
            eraseColor,
            fillOutline,
            isOutline,
            holeColor: HOLE,
            copperPoints,
          })
          if (!made) continue
          claimGpu(made.obj)
          made.cutouts.forEach(claimGpu)
          built.entries.set(key, made)
          hit = made
        }
        // Bản trong cache là bản gốc, cảnh chỉ nhận bản clone: assembly và paintOrder
        // đổi position/scale/renderOrder, mà hai khung "2 Mặt" đặt khác nhau.
        const obj: any = hit.obj.clone()
        for (const cut of hit.cutouts) {
          const hole = cut.clone()
          // Ở CAM lỗ phay là hình vẽ của chính lớp Outline nên phải tắt/bật theo nó.
          // Real/3D thì nó là chỗ thủng vật liệu, đi chung cụm khoan để kéo dài hết
          // bề dày bo.
          if (camMode) obj.add(hole)
          else outlineCutouts.push(hole)
        }

        // Các lớp trong cùng một bộ có thể khác đơn vị — bo VOL LED có gerber theo mm
        // nhưng file khoan theo inch. Bounds đã quy về mm sẵn, còn hình học thì giữ
        // nguyên đơn vị gốc, nên lớp inch bị nhỏ đi 25.4 lần và văng khỏi bo.
        // (assemblyPCBToThreeJS chỉ đụng tới scale.z nên scale x/y ở đây được giữ lại.)
        if (plotted.units === 'in') obj.scale.set(25.4, 25.4, obj.scale.z)

        byFile.set(raw.filename, obj)

        const slot = id.side === 'bottom' ? pcb.Btm : pcb.Top
        if (id.type === 'copper' && id.side === 'inner') {
          // pcb của assemblyPCBToThreeJS chỉ có hai ngăn đồng (Top/Btm) — không có chỗ
          // cho lớp giữa của bo 4/6 lớp. Trước đây lớp giữa rơi vào ngăn Top rồi bị lớp
          // đồng mặt trên ghi đè, nên đọc ra thì thấy trong danh sách mà bật lên không
          // hiện gì. Giữ riêng ra đây rồi tự gắn vào cảnh sau khi assembly chạy xong.
          const idx = parseInt(String(raw.displayName).match(/(\d+)/)?.[1] ?? '0', 10)
          innerCopper.push({ obj, idx })
        }
        else if (id.type === 'copper') slot.Copper = obj
        else if (id.type === 'soldermask') {
          slot.SolderMask = obj
          maskFiles[id.side === 'bottom' ? 'bottom' : 'top'].push(raw.filename)
        }
        else if (id.type === 'silkscreen') slot.Silkscreen = obj
        else if (isOutline) {
          // Viền rỗng (file viền không có nét nào) mà lọt vào đây thì assembly sập ở
          // `OutLine.children[0].material`. Bỏ qua, để viền khác — hoặc viền ước lượng
          // GerberParser dựng sẵn — giữ chỗ này.
          if (!obj.children?.length) continue
          pcb.OutLine = obj
        }
        else if (id.type === 'drill') {
          // Mọi file khoan đều là CON của khung rỗng ban đầu, kể cả file đầu tiên. Trước
          // đây file đầu tiên thay chỗ khung rồi các file sau gắn vào nó — mà file khoan
          // inch đã tự phóng ×25.4, nên file thứ hai bị nhân hai lần (×645) và văng khỏi
          // bo: bo KiCad 6 lớp mất sạch 250 lỗ PTH, chỉ còn 2 lỗ NPTH của file đầu.
          pcb.Drill.add(obj)
          drillPlaced++
        }
        else continue

        ok++
      } catch (e) {
        console.warn('[WebGL] lỗi lớp', raw.filename, e)
        bad.push(raw.filename)
      }
    }

    // Lỗ phay của outline đi chung với lỗ khoan: cùng được kéo dài hết bề dày bo.
    outlineCutouts.forEach((hole) => pcb.Drill?.add(hole))

    try {
      // Bề dày thật của các lớp (đồng 0.035mm, mask 0.04mm…) quá mỏng để depth buffer
      // phân giải -> lớp mặt dưới lọt lên trên nền FR-4, nhìn như xuyên thấu.
      // Nới khoảng cách z lên ~10 lần: nhìn từ trên xuống không khác gì, nhưng thứ tự
      // che khuất trở nên chính xác.
      assemblyPCBToThreeJS(render.Scene, pcb, LAMINAR, palette.Oil)
    } catch (e) {
      console.error('[WebGL] assemblyPCBToThreeJS lỗi:', e)
      setStatus('Lỗi lắp PCB — xem console')
    }

    // --- Lớp đồng giữa (bo 4/6 lớp) ---
    // assemblyPCBToThreeJS không có ngăn cho chúng, nên tự gắn vào cảnh: bề dày mượn
    // của lớp đồng mặt trên, cao độ rải đều giữa hai lớp đồng ngoài theo đúng thứ tự
    // Inner 1, Inner 2… Ở Real/3D chúng nằm trong lõi bo nên bị nền che, đúng như bo
    // thật; ở CAM thì hiện ra để soi được.
    if (innerCopper.length > 0) {
      innerCopper.sort((a, b) => a.idx - b.idx)
      const topZ = pcb.Top.Copper?.position?.z ?? 0
      const botZ = pcb.Btm.Copper?.position?.z ?? 0
      const thickness = pcb.Top.Copper?.scale?.z ?? 1
      innerCopper.forEach(({ obj }, i) => {
        // Inner 1 gần mặt trên nhất: chia đều khoảng giữa hai lớp đồng ngoài.
        const t = (i + 1) / (innerCopper.length + 1)
        obj.position.z = topZ + (botZ - topZ) * t
        obj.scale.setZ(thickness)
        // Real nhìn thẳng (Real 2D, 2 Mặt): lớp giữa kẹp trong lõi FR-4, không bao giờ
        // nhìn thấy — không đưa vào cảnh, khỏi lộ ra ở mép khe phay hay chỗ lõi khuyết.
        // CAM thì cần soi, 3D thì depth test đã tự che.
        if (camMode || threeDMode) render.Scene.add(obj)
      })
    }

    // Nhìn thẳng từ trên (2D) thì thứ tự lớp là thứ tự vẽ, KHÔNG dùng depth buffer:
    // depth ở đây không đáng tin. Pad chỉ cao hơn lớp đồng 0.005, mà lớp đồng của CAM350
    // là hàng nghìn dải tam giác; dọc mép mỗi tam giác depth nội suy lệch đủ để đồng
    // thắng pad, lộ lên thành nét mảnh chạy ngang dọc khắp pad (đo trên bo "3W NHUA
    // XANH": 211 pixel nét trong một ô 400×400, tắt depth test còn 0). polygonOffset
    // không ăn vì web-gerber bật logarithmicDepthBuffer — depth ghi từ fragment shader.
    //
    // Lần trước tắt depth test bị "nhìn xuyên" là vì các lớp còn CHUNG renderOrder nên
    // three xếp theo khoảng cách; giờ mỗi lớp một số thứ tự riêng, không còn chuyện đó.
    // 3D thì nhìn nghiêng, phải có depth để che khuất đúng.
    const paintOrder = (obj: any, order: number) => {
      if (!obj) return
      obj.renderOrder = order
      obj.traverse((o: any) => {
        o.renderOrder = order
        materialsOf(o).forEach((m: any) => {
          m.depthTest = threeDMode
          m.depthWrite = threeDMode
        })
      })

      // Các đoạn đảo cực của cùng một lớp vẽ theo ĐÚNG TRÌNH TỰ trong file, đoạn sau
      // đè lên đoạn trước, rải trong khe (order, order+1) để không đụng thứ tự giữa
      // các lớp. Đoạn khoét tô đè ĐỤC bằng màu của thứ nằm dưới lớp này.
      //
      // Đã thử hai cách "khoét thật" bằng depth buffer và đều hỏng:
      //  - vẽ xuôi, đoạn khoét chỉ ghi độ sâu: không khoét được gì, vì ghi độ sâu chỉ
      //    chặn hình vẽ SAU nó chứ không xoá được màu đã vẽ TRƯỚC.
      //  - vẽ ngược + cao độ tăng dần để depth tự chọn đoạn sau: web-gerber hard-code
      //    logarithmicDepthBuffer, chênh lệch z ở đây nhỏ hơn một phần nghìn nên depth
      //    test không phân giải nổi — mảng phủ ra đặc, mất hết khe cách.
      //
      // Giá phải trả: ở CAM, vùng bị khoét của lớp trên tô màu nền nên che mất lớp
      // nằm dưới nó. Đổi lại hình trong từng lớp là đúng — cái đó quan trọng hơn.
      obj.children?.forEach((child: any) => {
        const idx = child.userData?.polarityIndex
        const count = child.userData?.polarityCount
        if (idx === undefined || !count) return
        child.traverse((o: any) => {
          o.renderOrder = order + idx / count
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

    // assemblyPCBToThreeJS clone OutLine để làm lớp mask phủ bo, nhưng chỉ tô màu cho
    // children[0]. Bo đơn có đúng một mảnh nên không lộ, còn panel thì OutLine gồm
    // 13 mảnh (9 bo + khung + rãnh) — 12 mảnh còn lại giữ nguyên màu nền FR-4 và hiện
    // ra thành các mảng vàng loang lổ. Tô lại toàn bộ cho chắc.
    for (const oil of [topOil, bottomOil]) {
      oil?.traverse((o: any) => {
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
        mats.forEach((m: any) => m?.color?.set?.(palette.Oil))
      })
    }

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
    // Lớp giữa nằm TRONG lõi bo: vẽ sau lớp phủ mặt xa (3) nhưng trước lõi FR-4 (4),
    // để ở Real lõi che kín chúng như bo thật. Trước đây rải trong (2, 6) — lớp giữa cuối
    // cùng ra 5.2, vẽ đè lên mask mặt trên (5) nên đường mạch bên trong lộ hẳn ra. Lúc
    // còn depth test thì cao độ che giúp; 2D giờ vẽ theo thứ tự nên thứ tự phải đúng.
    // Mặt xa → mặt gần theo đúng chiều nhìn: nhìn từ dưới thì In4 là lớp gần hơn.
    innerCopper.forEach(({ obj }, i) => {
      const k = fromBelow ? innerCopper.length - 1 - i : i
      paintOrder(obj, 3 + ((innerCopper.length - k) / (innerCopper.length + 1)))
    })
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

    // Các đoạn đảo cực nằm trùng mặt phẳng với nhau, nên phải nhấc dần ra phía ngoài
    // theo đúng trình tự thì depth test mới cho đoạn sau thắng đoạn trước. Nhấc ÍT
    // thôi: khoảng hở giữa mặt in lụa và mặt mask chỉ có EPS/2, vượt qua đó là các
    // đoạn này leo lên che cả pad.
    const liftPolarityRuns = (slot: any, outward: 1 | -1) => {
      for (const layer of [slot?.Copper, slot?.SolderMask, slot?.Silkscreen]) {
        const scaleZ = layer?.scale?.z
        if (!layer || !scaleZ) continue
        layer.children.forEach((child: any) => {
          const idx = child.userData?.polarityIndex
          const count = child.userData?.polarityCount
          if (idx === undefined || !count) return
          child.position.z = (outward * (EPS / 4) * (idx / count)) / scaleZ
        })
      }
    }
    liftPolarityRuns(pcb.Top, 1)
    liftPolarityRuns(pcb.Btm, -1)

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

      // CAM phải thấy ĐỦ MỌI LỚP cùng lúc. Nếu giữ nguyên xếp lớp theo vật lý bo thật
      // thì các lớp mặt dưới nằm dưới nền FR-4 và bị nền che sạch — chỉ còn mặt trên.
      // Nên xếp lại: nền bo xuống đáy, rồi chồng lần lượt các lớp bot và top lên trên.
      const plate = pcb.OutLine
      if (plate) plate.position.setZ(0)

      const stack = [
        pcb.Btm.Copper, pcb.Btm.Silkscreen, pcb.Btm.SolderMask,
        pcb.Top.Copper, pcb.Top.Silkscreen, pcb.Top.SolderMask,
      ].filter(Boolean)

      const plateTop = plate ? plate.scale.z / 2 : 0
      stack.forEach((o: any, k) => {
        o.position.setZ(plateTop + EPS * (k + 1) + o.scale.z / 2)
      })

      if (pcb.Drill?.scale) {
        const top = stack.length
          ? Math.max(...stack.map((o: any) => o.position.z + o.scale.z / 2))
          : plateTop
        pcb.Drill.position.setZ(0)
        pcb.Drill.scale.setZ((top + EPS) * 2)
      }
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
      const fitDist = (Math.max(h, w / aspectNow()) / 2 / Math.tan(fov / 2)) * fitPadding

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

      // Đưa khung nhìn về đúng lúc vừa dựng xong: vừa khít bo, đúng tâm, đúng góc.
      // Mỗi khung (Top/Bot ở chế độ 2 Mặt) có camera riêng nên nút bấm cũng riêng.
      const resetView = () => {
        view.x = cx
        view.y = cy
        view.dist = fitDist
        view.az = -Math.PI / 2
        view.el = fromBelow ? -0.9 : 0.9
        apply()
      }
      fitViewRef.current = resetView

      if (captureRef) {
        // Chụp KHÔNG theo khung đang nhìn: dựng riêng một khung fit sát bo, cỡ ảnh tính
        // theo kích thước bo (pxPerMm) nên bo nhỏ được phóng to, bo/panel lớn thu về
        // vừa ảnh — ảnh gửi khách lúc nào cũng cùng một cỡ. Xong trả camera và kích
        // thước canvas về như cũ; bộ đệm WebGL không giữ sau khi ghép hình nên phải
        // vẽ rồi chép ngay trong cùng một lượt.
        const capture: CaptureFn = (pxPerMm = 10) => {
          const r = render.Renderer
          const canvas = r?.domElement as HTMLCanvasElement | undefined
          if (!r || !canvas) return null
          const PAD_MM = 6
          const outW = Math.round((w + PAD_MM * 2) * pxPerMm)
          const outH = Math.round((h + PAD_MM * 2) * pxPerMm)
          const saved = { x: view.x, y: view.y, dist: view.dist, cw: el.clientWidth, ch: el.clientHeight }

          r.setPixelRatio(1)
          r.setSize(outW, outH, false)
          cam.aspect = outW / outH
          view.x = cx
          view.y = cy
          // Chiều cao nhìn thấy = h + 2·PAD; bề ngang theo aspect ra đúng w + 2·PAD.
          view.dist = (h + PAD_MM * 2) / 2 / Math.tan(fov / 2)
          apply()
          // apply() lấy aspect theo kích thước CSS của khung (cột cao hẹp) — với khung
          // tạm phải ép lại theo ảnh, nếu không bo bị cắt hai bên.
          cam.aspect = outW / outH
          cam.updateProjectionMatrix()
          r.render(render.Scene, render.Camera)
          const out = document.createElement('canvas')
          out.width = canvas.width
          out.height = canvas.height
          out.getContext('2d')?.drawImage(canvas, 0, 0)

          view.x = saved.x
          view.y = saved.y
          view.dist = saved.dist
          r.setSize(saved.cw, saved.ch, false)
          apply()
          return out
        }
        captureRef.current = capture
        cleanups.push(() => {
          if (captureRef.current === capture) captureRef.current = null
        })
      }
      cleanups.push(() => {
        if (fitViewRef.current === resetView) fitViewRef.current = null
      })

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

    const totalMs = Math.round(performance.now() - t0)
    setTotalMs(totalMs)
    // Khung chia đôi ẩn badge, nên ghi ra console để còn đo được tốc độ dựng.
    const mode = camMode ? 'CAM' : threeDMode ? '3D' : 'Real'
    console.info(`[WebGL] dựng ${fromBelow ? 'bottom' : 'top'}/${mode}: ${totalMs} ms, ${ok} lớp, ${cacheHits} từ cache`)
    setFailed(bad)
    setStatus(
      `Đã dựng ${ok} lớp${cacheHits ? ` (${cacheHits} từ cache)` : ''} · khoan ${drillHoles} lỗ (${drillPlan.map((d) => d.name.split(/[\\/]/).pop()).join(', ') || 'không có'})`
    )

    return () => {
      cleanups.forEach((fn) => fn())
      sceneRef.current = null

      // Renderer.dispose() KHÔNG giải phóng geometry/material — chúng giữ buffer trên
      // GPU cho tới khi tự gọi dispose. Mỗi lần đổi chế độ hoặc đổi màu là một lần dựng
      // lại toàn bộ, không dọn thì bộ nhớ dồn lại và lớp nặng nhất (silkscreen ~5 triệu
      // đỉnh) sẽ là cái đầu tiên dựng hỏng.
      // Riêng hình lấy từ cache thì để nguyên: nó còn phục vụ khung khác và lần dựng
      // sau, chỉ dispose khi đổi bo (xem ensureBuildCache).
      try {
        render.Scene?.traverse?.((o: any) => {
          if (o.geometry && !cachedGpu.has(o.geometry)) o.geometry.dispose?.()
          materialsOf(o).forEach((m: any) => {
            if (m && !cachedGpu.has(m)) m.dispose?.()
          })
        })
        render.Scene?.clear?.()
      } catch { /* ignore */ }

      try { render.Renderer?.dispose?.() } catch { /* ignore */ }
      while (el.firstChild) el.removeChild(el.firstChild)
    }
    // threeDMode phải nằm trong deps: chuyển Real 2D → 3D View không đổi camMode
    // (cả hai đều false) nên effect không chạy lại và cảnh vẫn là ảnh 2D phẳng.
  }, [board.isLoaded, board.layers, board.maskColor, camMode, threeDMode, fromBelow, fitPadding, captureRef])

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
  }, [board.visibleLayers, board.layers])

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

      <button
        onClick={() => fitViewRef.current?.()}
        title="Đưa khung nhìn về vừa khít bo"
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          zIndex: 5,
          padding: '5px 12px',
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 6,
          cursor: 'pointer',
          color: '#e2e8f0',
          backgroundColor: 'rgba(15,23,42,0.85)',
          border: '1px solid #334155',
        }}
      >
        ⤢ Fit
      </button>
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
