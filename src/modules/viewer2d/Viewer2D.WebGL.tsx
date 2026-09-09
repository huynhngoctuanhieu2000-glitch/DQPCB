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
  Oil: 0x0f4f26,         // soldermask xanh phủ vùng không có đồng
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

const hexToRgb = (hex: string) => {
  const n = parseInt(String(hex).replace('#', ''), 16)
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [28, 122, 60]
}
const rgbToHex = ([r, g, b]: number[]) => (r << 16) | (g << 8) | b
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

/**
 * Bảng màu Real/3D suy ra từ màu soldermask người dùng chọn, thay vì cố định màu xanh.
 *  - Đồng nằm DƯỚI mask nên mắt thấy màu mask đã bị đồng làm ngả đi: lệch một quãng
 *    cố định so với nền. Mask sáng thì phải làm TỐI đi, mask tối thì làm SÁNG lên —
 *    nếu không, bo trắng sẽ cho đồng trắng và mất hẳn đường mạch.
 *  - In lụa cũng vậy: trên bo trắng/vàng phải in mực đen mới đọc được.
 */
const realPalette = (maskHex: string) => {
  const rgb = hexToRgb(maskHex)
  // độ sáng cảm nhận (ITU-R BT.601)
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
  const light = lum > 0.6
  const shift = light ? -52 : 28
  return {
    Oil: rgbToHex(rgb.map(clamp)),
    Copper: rgbToHex(rgb.map((c) => clamp(c + shift))),
    Silkscreen: light ? 0x1a1a1a : 0xf2f2f2,
    MaskOpening: REAL.MaskOpening,
    BaseBoard: REAL.BaseBoard,
    Drill: REAL.Drill,
  }
}

// Stack-up phóng đại theo trục z. Giữ đúng tỉ lệ tương đối giữa các lớp, chỉ nhân lên
// để depth buffer phân biệt được — nhìn thẳng từ trên xuống thì không thấy khác biệt.
const LAMINAR = { Copper: 0.12, SolderMask: 0.14, Oil: 0.04, Silkscreen: 0.04, Total: 2.4 }
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
}

export const Viewer2DWebGL: React.FC<Viewer2DWebGLProps> = ({
  viewOverride,
  faceSide = 'top',
  hideBadge = false,
  fitPadding = 1.15,
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

    const t0 = performance.now()
    const bad: string[] = []
    const palette = realPalette(board.maskColor)

    // --- Chọn file khoan ---
    // KiCad có thể xuất cả bản gộp (.drl, FileFunction MixedPlating) LẪN bộ tách
    // (-PTH.drl / -NPTH.drl). Bản gộp là đầy đủ nhất; nếu chỉ có bộ tách thì phải
    // dùng tất cả. pcb.Drill chỉ có 1 slot nên các file phụ được gắn làm con.
    const drills = board.layers
      .filter((l) => l.type === 'drill' && l.holeCount > 0)
      .map((l) => ({
        name: l.filename,
        holes: l.holeCount,
        split: /-(N?PTH)\.\w+$/i.test(l.filename),
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

    let ok = 0
    let drillPlaced = 0
    // Dùng lại hình học GerberParser đã plot, KHÔNG parse lần hai. Trước đây viewer tự
    // parse lại từ rawFiles nên tồn tại hai đường đi độc lập, và chúng đã lệch nhau hai
    // lần: phân loại lớp (identifyLayers vs matchLayer) và chuẩn hoá file khoan.
    for (const raw of board.layers) {
      const id = { type: raw.type, side: raw.side }
      if (!id.type) continue

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
        const color = camMode
          ? parseInt(String(raw.color).replace('#', ''), 16) || CAM_FALLBACK
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
          const eraseColor = camMode ? CAM_BACKGROUND : palette.Oil
          const built = runs
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
          obj = built.shift()
          built.forEach((extra: any) => obj?.add(extra))
        } else if (fillOutline && plotted.parts?.length > 1) {
          const built = plotted.parts
            .map((part: any) => renderThree(part, color, undefined, true))
            .filter(Boolean)
          obj = built.shift()
          built.forEach((extra: any) => obj?.add(extra))
        } else {
          obj = renderThree(plotted, color, undefined, fillOutline)
        }
        if (!obj) continue

        // Các lớp trong cùng một bộ có thể khác đơn vị — bo VOL LED có gerber theo mm
        // nhưng file khoan theo inch. Bounds đã quy về mm sẵn, còn hình học thì giữ
        // nguyên đơn vị gốc, nên lớp inch bị nhỏ đi 25.4 lần và văng khỏi bo.
        // (assemblyPCBToThreeJS chỉ đụng tới scale.z nên scale x/y ở đây được giữ lại.)
        if (plotted.units === 'in') obj.scale.set(25.4, 25.4, obj.scale.z)

        byFile.set(raw.filename, obj)

        const slot = id.side === 'bottom' ? pcb.Btm : pcb.Top
        if (id.type === 'copper') slot.Copper = obj
        else if (id.type === 'soldermask') {
          slot.SolderMask = obj
          maskFiles[id.side === 'bottom' ? 'bottom' : 'top'].push(raw.filename)
        }
        else if (id.type === 'silkscreen') slot.Silkscreen = obj
        else if (isOutline) pcb.OutLine = obj
        else if (id.type === 'drill') {
          if (!drillUse.has(raw.filename)) continue
          // Object rỗng khởi tạo ban đầu không có mesh -> file khoan đầu tiên thay thế nó,
          // các file sau gắn làm con để cùng chịu scale/transform của assembly.
          if (drillPlaced === 0) pcb.Drill = obj
          else pcb.Drill.add(obj)
          drillPlaced++
        }
        else continue

        ok++
      } catch (e) {
        console.warn('[WebGL] lỗi lớp', raw.filename, e)
        bad.push(raw.filename)
      }
    }

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

    // Trước đây tắt depth test và xếp lớp bằng renderOrder — KHÔNG ăn thua: three vẫn
    // vẽ theo độ sâu nên lớp mặt dưới lọt lên trên nền FR-4 (hiện tượng "nhìn xuyên").
    // Giờ để depth buffer làm việc của nó; renderOrder chỉ còn là tie-break.
    const materialsOf = (o: any): any[] =>
      Array.isArray(o.material) ? o.material : o.material ? [o.material] : []

    const paintOrder = (obj: any, order: number) => {
      if (!obj) return
      obj.renderOrder = order
      obj.traverse((o: any) => {
        o.renderOrder = order
        materialsOf(o).forEach((m: any) => {
          m.depthTest = true
          m.depthWrite = true
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

    setTotalMs(Math.round(performance.now() - t0))
    setFailed(bad)
    setStatus(
      `Đã dựng ${ok} lớp · khoan ${drillHoles} lỗ (${drillPlan.map((d) => d.name.split(/[\\/]/).pop()).join(', ') || 'không có'})`
    )

    return () => {
      cleanups.forEach((fn) => fn())
      sceneRef.current = null

      // Renderer.dispose() KHÔNG giải phóng geometry/material — chúng giữ buffer trên
      // GPU cho tới khi tự gọi dispose. Mỗi lần đổi chế độ hoặc đổi màu là một lần dựng
      // lại toàn bộ, không dọn thì bộ nhớ dồn lại và lớp nặng nhất (silkscreen ~5 triệu
      // đỉnh) sẽ là cái đầu tiên dựng hỏng.
      try {
        render.Scene?.traverse?.((o: any) => {
          o.geometry?.dispose?.()
          const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
          mats.forEach((m: any) => m?.dispose?.())
        })
        render.Scene?.clear?.()
      } catch { /* ignore */ }

      try { render.Renderer?.dispose?.() } catch { /* ignore */ }
      while (el.firstChild) el.removeChild(el.firstChild)
    }
    // threeDMode phải nằm trong deps: chuyển Real 2D → 3D View không đổi camMode
    // (cả hai đều false) nên effect không chạy lại và cảnh vẫn là ảnh 2D phẳng.
  }, [board.isLoaded, board.layers, board.maskColor, camMode, threeDMode, fromBelow, fitPadding])

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
