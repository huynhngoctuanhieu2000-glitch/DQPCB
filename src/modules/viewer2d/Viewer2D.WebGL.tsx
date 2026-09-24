import React, { useEffect, useMemo, useRef, useState } from 'react'
import { BoardDataModel } from '../../models/BoardDataModel'
import { realPalette, HOLE, MASK_OPENING, BASE_BOARD } from '../../models/RealPalette'
import { copperSamplePoints, detectPanel, isPartialDrillFile, isSlotOnlyDrill, minDrill, splitOutlineLoops } from '../../lib/gerber-reader'
import {
  assemblyPCBToThreeJS,
  emptyObject3D,
  newRenderByElement,
  renderThree,
  setSceneBackground,
  type GerberRender,
} from '../../lib/webgerber'

import { Button } from '../../ui/Button'
import { buildFastLayer } from './fastLayer'
import { C, RADIUS } from '../../ui/theme'
import { isLowMemoryDevice, useIsMobile } from '../../ui/useIsMobile'

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
 * Màu mũi khoan nhỏ nhất trên badge: dưới 0.254 mm (10 mil) đỏ, 0.254 – dưới 0.3 mm vàng.
 * So có dung sai 0.0005 mm: toạ độ inch đổi ra mm (0.01 in = 0.254) có thể lệch ở số lẻ cuối.
 */
const drillColor = (mm: number) => (mm < 0.2535 ? '#f87171' : mm < 0.2995 ? '#fbbf24' : undefined)
/** 0.254 → "0.254", 0.25 → "0.25", 0.4 → "0.40": đủ số lẻ để thấy mũi 10 mil. */
const mmText = (mm: number) => mm.toFixed(3).replace(/(\.\d\d)0$/, '$1')

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
 * Cache giữ RIÊNG cho từng bo (khoá là `board.layers`). Trước đây chỉ giữ một bo: mở 3 file,
 * đang xem file 3 bấm lại file 1 là dọn sạch rồi dựng lại từ đầu — FRIWO 55807 mất 3.3 s mỗi
 * lần bấm qua, bấm lại lần 2 vẫn 3.2 s (khảo sát 22/09/2026). Giữ tối đa maxCachedBoards()
 * bo dùng gần nhất; bo đã đóng (hoặc đọc lại vì chọn tay loại lớp) thì giải phóng GPU.
 */
type BuildEntry = { obj: any; cutouts: any[] }
/** Lớp dựng ra rỗng — vẫn ghi vào cache để biết "đã dựng", khỏi dựng lại mỗi lần. */
const EMPTY_ENTRY: BuildEntry = { obj: null, cutouts: [] }
/**
 * Số bo giữ hình trong bộ nhớ. Điện thoại chỉ được ~0.5–1 GB mỗi tab: bo "Bo Dem Linhgragon
 * ESP32-S3" (file 144 KB!) đã ngốn 529 MB, giữ 5 bo là tab bị hệ điều hành giết (24/09/2026).
 */
const maxCachedBoards = () => (isLowMemoryDevice() ? 1 : 5)
/**
 * Lớp nhiều hình hơn mức này dựng bằng đường nhanh (xem fastLayer.ts): `renderThree` tốn
 * ~1.200 đỉnh cho MỖI hình, nên lớp in lụa 8.309 hình của bo "Bo Dem" ra 9.9 triệu đỉnh.
 * Hạ từ 50.000 xuống 2.000 (24/09/2026): cả bo đó còn 556.564 đỉnh thay vì 14.327.408, bộ
 * nhớ trang 529 → 107 MB.
 */
const HEAVY_SHAPES = 2000
/**
 * Trên mức này thì dựng kiểu cũ là hết bộ nhớ (lụa 150.220 hình của "P84390-S02" ra 180
 * triệu đỉnh), nên vẽ nhanh bằng mọi giá — kể cả lớp có hình đảo cực.
 */
const HUGE_SHAPES = 50000
const shapeCount = (raw: any) => raw?.imageTree?.children?.length ?? 0
/** Lớp có hình đảo cực (vùng khoét trong mảng đồng): đường nhanh bỏ qua chúng nên vẽ sai. */
const hasClearPolarity = (raw: any) =>
  (raw?.imageTree?.children ?? []).some((c: any) => c?.polarity === 'clear')
export const isHeavyLayer = (raw: any) => {
  const n = shapeCount(raw)
  if (n > HUGE_SHAPES) return true
  return n > HEAVY_SHAPES && !hasClearPolarity(raw)
}
/** layers của bo → hình đã dựng của bo đó. Thứ tự trong Map = thứ tự dùng (cuối = mới nhất). */
const boardCaches = new Map<object, Map<string, BuildEntry>>()
/**
 * Geometry/material đang nằm trong cache — cleanup của cảnh phải chừa chúng ra. Chúng
 * được dispose khi cache của bo bị dọn (đóng bo / quá số bo giữ), không phải khi một khung đóng.
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

const disposeCache = (cache: Map<string, BuildEntry>) => {
  for (const { obj, cutouts } of cache.values()) {
    disposeDeep(obj)
    cutouts.forEach(disposeDeep)
  }
  cache.clear()
}

/**
 * Dọn cache của bo không còn mở (đóng bo, hoặc bo đã đọc lại nên có mảng layers mới) và
 * của bo dùng lâu nhất khi giữ quá maxCachedBoards() bo. Bo `keep` (đang xem) không bao giờ bị dọn.
 */
const pruneCaches = (keep?: object) => {
  const open = new Set<object>(BoardDataModel.getState().boards.map((b) => b.layers))
  for (const [layers, cache] of boardCaches) {
    if (layers === keep || open.has(layers)) continue
    disposeCache(cache)
    boardCaches.delete(layers)
  }
  for (const [layers, cache] of boardCaches) {
    if (boardCaches.size <= maxCachedBoards()) break
    if (layers === keep) continue
    disposeCache(cache)
    boardCaches.delete(layers)
  }
}

/** Cache của một bo (tạo nếu chưa có). `touch` = đánh dấu vừa dùng, để không bị dọn trước. */
const cacheFor = (layers: object, touch = true) => {
  let cache = boardCaches.get(layers)
  if (cache && touch) {
    boardCaches.delete(layers)
    boardCaches.set(layers, cache)
  }
  if (!cache) {
    cache = new Map()
    boardCaches.set(layers, cache)
  }
  return cache
}

/** File khoan được vẽ: file gộp nhiều lỗ nhất; không có file gộp thì mọi file tách. */
const drillPlanOf = (layers: any[]) => {
  // KiCad có thể xuất cả bản gộp (.drl, FileFunction MixedPlating) LẪN bộ tách
  // (-PTH.drl / -NPTH.drl). Bản gộp là đầy đủ nhất; nếu chỉ có bộ tách thì phải
  // dùng tất cả. pcb.Drill chỉ có 1 slot nên các file phụ được gắn làm con.
  const drills = layers
    .filter((l) => l.type === 'drill' && l.holeCount > 0)
    .map((l) => ({
      name: l.filename,
      holes: l.holeCount,
      // Tách = chỉ chứa một phần (theo mạ, hoặc theo hình lỗ kiểu Altium Round/Slot/
      // RectHoles), phải vẽ kèm các file tách còn lại — luật nằm trong gerber-reader.
      split: isPartialDrillFile(l.filename, l.drillPlating),
      slotOnly: isSlotOnlyDrill(l.imageTree),
      hasSlots: (l.imageTree?.children ?? []).some((c: any) => c?.type === 'imageRegion' || c?.type === 'imagePath'),
    }))
  const merged = drills.filter((d) => !d.split && !d.slotOnly).sort((a, b) => b.holes - a.holes)
  const base = merged.length > 0 ? [merged[0]] : drills.filter((d) => !d.slotOnly)
  // File CHỈ có rãnh phay (xem isSlotOnlyDrill) luôn vẽ kèm, bất kể tên — trừ khi file gộp
  // đã tự có rãnh (vẽ nữa là trùng). Bo "Dao Quoc Thai 5pcs": Drl.txt (54 lỗ) + SqDrl.txt
  // (3 rãnh) — trước đây chỉ vẽ Drl.txt, mất 3 rãnh.
  const slotFiles = drills.filter((d) => d.slotOnly && !base.some((b) => b.hasSlots))
  const drillPlan = [...base, ...slotFiles]
  return {
    drillPlan,
    drillUse: new Set(drillPlan.map((d) => d.name)),
    drillHoles: drillPlan.reduce((n, d) => n + d.holes, 0),
  }
}

/**
 * Lớp nào có chỗ trong cảnh. Dựng xong mà không có chỗ đặt thì dựng làm gì: lớp tài liệu
 * (drill drawing, assembly…) và file khoan không được chọn vẽ. Trước đây vẫn dựng hết —
 * riêng ba lớp tài liệu của một bo Altium đã tốn 1.1 s trong tổng 4.7 s.
 */
const inScene = (raw: any, drillUse: Set<string>) =>
  Boolean(raw.type) && SCENE_TYPES.has(raw.type) && (raw.type !== 'drill' || drillUse.has(raw.filename)) && Boolean(raw.imageTree)

/**
 * Màu, khoá cache và tham số dựng của một lớp — dùng chung cho cảnh và cho dựng sẵn ở nền,
 * để hai bên ra đúng một khoá (khác khoá là dựng sẵn vô ích).
 */
const layerSpec = (raw: any, camMode: boolean, palette: ReturnType<typeof realPalette>) => {
  // CAM lấy màu từ chính layer, tức ô màu người dùng bấm đổi được ở sidebar.
  // Real/3D thì màu là mô phỏng vật liệu nên vẫn dùng bảng cố định.
  // `|| CAM_FALLBACK` cũ coi màu đen (parseInt = 0) là không hợp lệ, nên lớp nào
  // để đen cũng bị đổi sang tím dự phòng. Chỉ thật sự hỏng khi parse ra NaN.
  const swatch = parseInt(String(raw.color).replace('#', ''), 16)
  const color = camMode
    ? (Number.isNaN(swatch) ? CAM_FALLBACK : swatch)
    : raw.type === 'copper' ? palette.Copper :
      raw.type === 'soldermask' ? palette.MaskOpening :
      raw.type === 'silkscreen' ? palette.Silkscreen :
      raw.type === 'drill' ? palette.Drill :
      palette.BaseBoard
  const isOutline = raw.type === 'outline'
  // Tham số cuối của renderThree quyết định outline được TÔ ĐẶC hay vẽ VIỀN.
  // Real/3D cần tô đặc vì đó là lõi FR-4 của bo. CAM thì outline là đường bao gia
  // công, phải vẽ thành viền — tô đặc sẽ thành một mảng che hết, mà bật riêng lớp
  // Outline lại chỉ thấy một mảng tối.
  const fillOutline = isOutline && !camMode
  const eraseColor = camMode ? CAM_BACKGROUND : palette.Oil
  const key = [raw.id, camMode ? 'cam' : 'real', color, eraseColor, fillOutline].join('|')
  return { key, color, eraseColor, fillOutline, isOutline }
}

/**
 * Bo này đã có sẵn hình cho chế độ xem đó chưa — chuyển sang là hiện ngay, hay phải dựng
 * (Layout bật màn chờ trước khi chuyển nếu phải dựng).
 */
export const isBoardBuilt = (board: { layers: any[]; maskColor: string }, view: string) => {
  const cache = boardCaches.get(board.layers)
  if (!cache) return false
  const camMode = view === 'CAM'
  const palette = realPalette(board.maskColor)
  const { drillUse } = drillPlanOf(board.layers)
  return board.layers.filter((l) => inScene(l, drillUse)).every((l) => cache.has(layerSpec(l, camMode, palette).key))
}

let prebuildRun = 0
const whenIdle = (fn: () => void) => {
  const ric = (window as any).requestIdleCallback
  if (ric) ric(fn, { timeout: 2000 })
  else window.setTimeout(fn, 60)
}

/**
 * Dựng sẵn ở nền các bo đang mở mà chưa xem, theo chế độ xem hiện tại: mở 3 file thì bo
 * cuối hiện trước, hai bo kia dựng dần lúc rảnh → lần đầu bấm sang cũng hiện ngay.
 * Mỗi lượt dựng MỘT lớp rồi nhả luồng, để giao diện vẫn bấm được giữa các lớp. Gọi lại
 * (đổi bo / đổi chế độ) thì lượt cũ tự dừng.
 */
const schedulePrebuild = () => {
  // Máy ít bộ nhớ thì KHÔNG dựng sẵn: mở file thứ hai trên điện thoại là app lặng lẽ dựng lại
  // cả file thứ nhất ở nền, cộng vào là tab bị giết (24/09/2026). Đổi bo thì chịu màn chờ.
  if (isLowMemoryDevice()) return
  const run = ++prebuildRun
  const s = BoardDataModel.getState()
  const camMode = s.activeView === 'CAM'
  const active = s.boards.find((b) => b.id === s.activeBoardId)
  // Bo mở gần nhất dựng trước; chừa một chỗ cho bo đang xem.
  const others = s.boards.filter((b) => b !== active).reverse().slice(0, maxCachedBoards() - 1)
  const queue: (() => void)[] = []
  for (const b of others) {
    const palette = realPalette(b.maskColor)
    const { drillUse } = drillPlanOf(b.layers)
    let copperPoints: number[][] | null = null
    for (const raw of b.layers.filter((l) => inScene(l, drillUse))) {
      queue.push(() => {
        const spec = layerSpec(raw, camMode, palette)
        const cache = cacheFor(b.layers, false)
        if (cache.has(spec.key)) return
        copperPoints ??= copperSamplePoints(b.layers)
        let made: BuildEntry | null = null
        try {
          const fast = isHeavyLayer(raw) ? buildFastLayer(raw.imageTree, spec.color) : null
          made = fast ? { obj: fast, cutouts: [] } : buildLayerObject(raw.imageTree, { ...spec, holeColor: HOLE, copperPoints })
        } catch (e) {
          // Dựng hỏng (thường là hết bộ nhớ) thì vẫn ghi vào cache: không thử lại mỗi lần.
          console.warn('[WebGL] dựng sẵn lỗi', raw.filename, e)
        }
        if (made) {
          claimGpu(made.obj)
          made.cutouts.forEach(claimGpu)
        }
        cache.set(spec.key, made ?? EMPTY_ENTRY)
      })
    }
  }
  const step = () => {
    if (run !== prebuildRun || queue.length === 0) return
    try {
      queue.shift()!()
    } catch (e) {
      console.warn('[WebGL] dựng sẵn lỗi', e)
    }
    whenIdle(step)
  }
  // Chờ bo đang xem hiện lên đã rồi mới bắt đầu.
  window.setTimeout(() => whenIdle(step), 600)
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
    const { body, cutouts: holes, lines } = splitOutlineLoops(plotted.parts, {
      scale: plotted.units === 'in' ? 25.4 : 1,
      copperPoints,
    })
    const made = body
      .map((part: any) => renderThree(part, color, undefined, fillOutline))
      .filter(Boolean)
    obj = made.shift()
    made.forEach((extra: any) => obj?.add(extra))
    // Đường phay vẽ bằng một nét hở: chỉ vẽ nét, không tô (xem splitOutlineLoops).
    for (const part of lines) {
      const line = renderThree(part, color, undefined, false)
      if (line) obj?.add(line)
    }
    for (const part of holes) {
      // Rãnh phay khách vẽ bằng một nét (xem stitchOutline): CAM vẽ đúng nét đó như file,
      // Real/3D mới khoét hình thuôn theo bề rộng nét.
      if (!fillOutline && part.millLine) {
        const line = renderThree(part.millLine, color, undefined, false)
        if (line) obj?.add(line)
        continue
      }
      const hole = renderThree(part, holeColor, undefined, fillOutline)
      if (hole) cutouts.push(hole)
    }
  } else {
    obj = renderInChunks(plotted, color, fillOutline)
  }
  return obj ? { obj, cutouts } : null
}

/**
 * Số hình tối đa dựng trong MỘT lần gọi renderThree.
 *
 * renderThree gom hình học của cả lớp vào một mảng rồi gộp một lần: lớp in lụa 150.500 hình
 * của "P84390-S02" (FRIWO, 23/09/2026) làm mảng tạm phình tới trần bộ nhớ trang (4.4 GB) rồi
 * treo hẳn. Dựng theo từng mẻ thì bộ nhớ tạm chỉ bằng một mẻ; các mẻ gắn làm con của cùng một
 * object nên hình vẽ ra y hệt, chỉ tốn thêm vài lần gọi vẽ.
 */
const CHUNK_SHAPES = 20000

/** Dựng một mẻ hình (các phần tử từ `from` đến `from + CHUNK_SHAPES`). */
const renderChunk = (plotted: any, color: number, fillOutline: boolean, from: number) =>
  renderThree({ ...plotted, children: (plotted?.children ?? []).slice(from, from + CHUNK_SHAPES) }, color, undefined, fillOutline)

/** Dựng một lớp, chia mẻ nếu quá nhiều hình (dùng khi dựng đồng bộ). */
const renderInChunks = (plotted: any, color: number, fillOutline: boolean) => {
  const children = plotted?.children ?? []
  if (children.length <= CHUNK_SHAPES) return renderThree(plotted, color, undefined, fillOutline)
  let root: any
  for (let i = 0; i < children.length; i += CHUNK_SHAPES) {
    const part = renderChunk(plotted, color, fillOutline, i)
    if (!part) continue
    if (!root) root = part
    else root.add(part)
  }
  return root
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

/** Sự kiện trên window, `detail` = id bo vừa dựng xong và đã hiện lên khung. */
export const BOARD_RENDERED_EVENT = 'dqpcb:board-rendered'

/**
 * Lần dựng ĐẦU TIÊN của từng bo (ms), theo id bo. Các lần sau lấy từ cache chỉ vài ms —
 * ghi số đó ra badge thì "Load: 2 ms" trong khi người lập vừa chờ mấy giây.
 */
const firstBuildMs = new Map<string, number>()

/** Chụp bo fit sát khung, `pxPerMm` quyết định cỡ ảnh theo kích thước bo. */
export type CaptureFn = (pxPerMm?: number) => HTMLCanvasElement | null

export const Viewer2DWebGL: React.FC<Viewer2DWebGLProps> = ({
  viewOverride,
  faceSide = 'top',
  hideBadge = false,
  fitPadding = 1.15,
  captureRef,
}) => {
  const isMobile = useIsMobile()
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
    /** Object luôn bật/tắt theo một object khác (pad cắt theo lỗ mở mask → theo lớp mask). */
    followers: { obj: any; leader: any }[]
    /** CAM: dựng lớp phụ (tài liệu, không rõ loại…) lúc nó được bật lần đầu. */
    addExtra: (raw: any) => void
  } | null>(null)
  const [board, setBoard] = useState(BoardDataModel.getState())
  const [status, setStatus] = useState('Chưa tải dữ liệu')
  const [totalMs, setTotalMs] = useState<number | null>(null)
  const [failed, setFailed] = useState<string[]>([])
  /** Lớp dựng bằng đường nhanh (xem fastLayer.ts) — badge ghi lại cho người lập biết. */
  const [lightLayers, setLightLayers] = useState<string[]>([])
  // Badge: file có ghép không (và nhận ra bằng cách nào), mũi khoan nhỏ nhất. Tính một lần
  // cho mỗi bộ lớp (detectPanel tự nhớ kết quả).
  const panel = useMemo(
    () =>
      board.layers.length
        ? detectPanel(board.layers, { names: [board.projectName], bounds: board.bounds })
        : null,
    [board.layers, board.projectName, board.bounds],
  )
  const smallest = useMemo(() => minDrill(board.layers.filter((l) => l.holeCount > 0)), [board.layers])

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
    const render: GerberRender = newRenderByElement(el, {
      AddAnimationLoop: true,
      AddOrbitControls: false,
      AddResizeListener: true,
    })
    setSceneBackground(render, camMode ? CAM_BACKGROUND : REAL.background)
    // Chỉ khi chạy dev: lộ cảnh ra window để soi material/light từ console mà không
    // phải sửa code — three của web-gerber không import được từ ngoài.
    if (import.meta.env.DEV) {
      ;(window as any).__dqpcbScene = render.Scene
      ;(window as any).__dqpcbRender = render
    }

    const t0 = performance.now()
    const bad: string[] = []
    const palette = realPalette(board.maskColor)
    const cache = cacheFor(board.layers)
    pruneCaches(board.layers)
    let cacheHits = 0
    // Tính khi thật sự phải dựng một lớp — lấy hết từ cache thì khỏi tốn.
    let copperPointsMemo: number[][] | null = null
    const copperPoints = () => (copperPointsMemo ??= copperSamplePoints(board.layers))

    // --- Chọn file khoan --- (xem drillPlanOf)
    const { drillPlan, drillUse, drillHoles } = drillPlanOf(board.layers)

    /** Lớp vẽ bằng đường nhanh (fastLayer) — tính từ chính danh sách lớp, không từ lần dựng
     *  này: dựng lại mà lấy hết từ cache thì badge vẫn phải ghi. */
    const light = board.layers.filter((l) => inScene(l, drillUse) && isHeavyLayer(l)).map((l) => l.filename)

    // Bounds tính từ ImageTree.size (không đụng tới three)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    // assemblyPCBToThreeJS yêu cầu mọi slot là Object3D hợp lệ (không nhận null).
    // Tạo group rỗng bằng chính three nội bộ của web-gerber.
    const emptyObj = emptyObject3D

    const pcb = {
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
      if (!inScene(raw, drillUse)) continue

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

        // Màu, khoá cache, tô đặc hay vẽ viền: xem layerSpec.
        const spec = layerSpec(raw, camMode, palette)
        let hit = cache.get(spec.key)
        if (hit) {
          cacheHits++
        } else {
          let made: BuildEntry | null = null
          try {
            // Lớp rất nhiều hình dựng bằng đường NHANH (xem fastLayer.ts): renderThree ra
            // 180 triệu đỉnh cho lớp in lụa 150.220 vùng và làm trình duyệt hết bộ nhớ.
            const fast = isHeavyLayer(raw) ? buildFastLayer(plotted, spec.color) : null
            made = fast ? { obj: fast, cutouts: [] } : buildLayerObject(plotted, { ...spec, holeColor: HOLE, copperPoints: copperPoints() })
          } catch (e) {
            // Hết bộ nhớ khi dựng lớp rất nặng: ghi cache rỗng để không dựng lại mỗi lần
            // đổi chế độ / đổi bo, và báo lên badge.
            console.warn('[WebGL] lỗi lớp', raw.filename, e)
            bad.push(raw.filename)
          }
          if (made) {
            claimGpu(made.obj)
            made.cutouts.forEach(claimGpu)
          }
          hit = made ?? EMPTY_ENTRY
          cache.set(spec.key, hit)
        }
        if (!hit.obj) continue
        // Bản trong cache là bản gốc, cảnh chỉ nhận bản clone: assembly và paintOrder
        // đổi position/scale/renderOrder, mà hai khung "2 Mặt" đặt khác nhau.
        const obj: any = hit.obj.clone()
        for (const cut of hit.cutouts) {
          const hole = cut.clone()
          // Ở CAM lỗ phay là hình vẽ của chính lớp Outline nên phải tắt/bật theo nó.
          // Real/3D thì nó là chỗ thủng vật liệu, đi chung cụm khoan để kéo dài hết
          // bề dày bo.
          if (camMode) obj.add(hole)
          else {
            // Tách khỏi obj thì không ăn theo phép đổi inch → mm của obj ở dưới: lỗ khoét
            // của viền inch nhỏ đi 25.4 lần, dồn về một góc, nhìn như không có (rãnh
            // 38 mm của panel "Ceiling Master" chỉ còn 1.5 mm).
            if (plotted.units === 'in') hole.scale.set(25.4, 25.4, hole.scale.z)
            outlineCutouts.push(hole)
          }
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
    // Bản clone DÙNG CHUNG vật liệu với OutLine gốc: tô thẳng lên đó là tô luôn các nét
    // của lớp Outline (nét phay, rãnh một nét ở CAM thành màu xanh mask). Tô trên bản sao.
    for (const oil of [topOil, bottomOil]) {
      oil?.traverse((o: any) => {
        if (!o.material) return
        const recolor = (m: any) => {
          const c = m?.clone?.() ?? m
          c?.color?.set?.(palette.Oil)
          return c
        }
        o.material = Array.isArray(o.material) ? o.material.map(recolor) : recolor(o.material)
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

    // --- CAM: lớp không có chỗ trong bo (tài liệu, không rõ loại, paste, file khoan
    // không được chọn vẽ) ---
    // Trước đây các lớp này bị bỏ hẳn: có trong danh sách, bật lên vẫn trống (DA82 của
    // OrCAD: .AST, .FAB, .DRD). CAM là chỗ soi file nên vẽ hết. Chỉ dựng khi lớp được
    // BẬT — lớp tài liệu tắt sẵn mà dựng hết thì mở bo chậm hẳn (ba lớp tài liệu Altium
    // ~1.1 s) — effect bật/tắt lớp gọi addExtra khi người dùng tích.
    const extraZ = (pcb.Top.SolderMask?.position?.z ?? 0) + 1
    const addExtra = (raw: any) => {
      if (!camMode || byFile.has(raw.filename) || !raw.imageTree) return
      try {
        const swatch = parseInt(String(raw.color).replace('#', ''), 16)
        const color = Number.isNaN(swatch) ? CAM_FALLBACK : swatch
        const key = [raw.id, 'cam-extra', color].join('|')
        let hit = cache.get(key)
        if (!hit) {
          const made = buildLayerObject(raw.imageTree, {
            color,
            eraseColor: CAM_BACKGROUND,
            fillOutline: false,
            isOutline: false,
            holeColor: HOLE,
            copperPoints: copperPoints(),
          })
          if (!made) return
          claimGpu(made.obj)
          cache.set(key, made)
          hit = made
        }
        const obj: any = hit.obj.clone()
        if (raw.imageTree.units === 'in') obj.scale.set(25.4, 25.4, obj.scale.z)
        obj.position.z = extraZ
        paintOrder(obj, 10)
        render.Scene.add(obj)
        byFile.set(raw.filename, obj)
      } catch (e) {
        console.warn('[WebGL] lỗi lớp phụ', raw.filename, e)
      }
    }
    if (camMode) {
      for (const raw of board.layers) {
        if (!byFile.has(raw.filename) && board.visibleLayers.has(raw.id)) addExtra(raw)
      }
    }

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
    // 3D nhìn nghiêng từ xa: log depth buffer không tách nổi hai mặt cách nhau 0.005 —
    // pad và mặt đồng giành nhau thành sọc dọc trên pad. Khoảng cách trong 3D phải
    // đủ lớn để nhìn thấy được độ dày mask; 2D vẽ theo thứ tự nên không cần.
    const MASK_T = threeDMode ? 0.04 : 0
    const GAP = threeDMode ? 0.02 : EPS
    const flushToCopper = (slot: any, outward: 1 | -1) => {
      if (!slot?.Copper) return
      const copperOuter = slot.Copper.position.z + (outward * slot.Copper.scale.z) / 2
      // Mặt ngoài của lớp mask phủ lên đồng (chỉ có ở 3D, xem maskSheet bên dưới).
      const maskOuter = copperOuter + outward * MASK_T
      if (slot.Silkscreen) {
        slot.Silkscreen.position.z =
          maskOuter + outward * (GAP / 2 - slot.Silkscreen.scale.z / 2)
      }
      if (slot.SolderMask) {
        slot.SolderMask.position.z =
          maskOuter + outward * (GAP - slot.SolderMask.scale.z / 2)
      }
    }
    flushToCopper(pcb.Top, 1)
    flushToCopper(pcb.Btm, -1)

    // --- 3D: lớp mask PHỦ LÊN đồng ---
    // Lớp phủ assembly dựng sẵn nằm DƯỚI đồng (đồng được tô màu "đồng nhìn qua mask"),
    // nên nhìn nghiêng thì đường mạch thành gờ nổi trên mặt mask, như chưa phủ mask.
    // Bo thật: mask phủ trùm lên đồng, mạch chỉ là gờ mờ bên dưới, pad lộ ra ở lỗ mở.
    // Thêm một tấm mask mờ cùng hình bo đặt trên mặt đồng; tấm cũ bên dưới vẫn giữ để
    // màu nền bo không đổi (mask mờ đè lên mask đặc cùng màu thì vẫn ra đúng màu đó).
    const maskSheets: any[] = []
    if (threeDMode) {
      for (const [oil, slot, outward] of [
        [topOil, pcb.Top, 1],
        [bottomOil, pcb.Btm, -1],
      ] as const) {
        if (!oil || !slot?.Copper) continue
        const sheet = oil.clone()
        sheet.traverse((o: any) => {
          const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
          const own = mats.map((m: any) => {
            const c = m.clone()
            c.transparent = true
            c.opacity = 0.55
            c.depthWrite = false
            c.color?.set?.(palette.Oil)
            return c
          })
          if (own.length) o.material = Array.isArray(o.material) ? own : own[0]
        })
        const copperOuter = slot.Copper.position.z + (outward * slot.Copper.scale.z) / 2
        sheet.scale.setZ(MASK_T)
        sheet.position.setZ(copperOuter + (outward * MASK_T) / 2)
        render.Scene.add(sheet)
        maskSheets.push(sheet)
      }
    }

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
        ...maskSheets,
      ]
        .filter(Boolean)
        .map((o: any) => o.position.z + o.scale.z / 2)
      const topOuter = Math.max(...outer)
      if (Number.isFinite(topOuter) && topOuter > 0) {
        if (threeDMode) {
          pcb.Drill.position.setZ(0)
          pcb.Drill.scale.setZ((topOuter + EPS) * 2)
        } else {
          // 2D nhìn thẳng vẽ theo thứ tự, không depth test: trụ khoan cao suốt bề dày bo
          // thì cả thân trụ lẫn đáy trụ đều hiện, mà camera phối cảnh làm đáy lệch ra
          // xa tâm màn hình — lỗ thành vệt dài lệch khỏi tâm vòng đồng. Ép thành một lát
          // mỏng nằm ngay mặt đang nhìn.
          const face = fromBelow ? -1 : 1
          pcb.Drill.scale.setZ(EPS)
          pcb.Drill.position.setZ(face * (topOuter + EPS))
        }
      }
    }

    // --- 2D Real: pad = đồng ∩ lỗ mở mask ---
    // Lớp "SolderMask" của Gerber là LỖ MỞ, không phải pad. KiCad gộp cả dãy chân IC
    // thành một lỗ mở khi khe giữa chân nhỏ hơn mức mask tối thiểu — tô nguyên lỗ mở bằng
    // màu đồng thì cả dãy chân thành một khối, nhìn như chạm nhau. Bo thật: lỗ mở chỉ
    // làm lộ PHẦN ĐỒNG nằm trong nó, giữa các chân là nền FR-4.
    //
    // Không có stencil buffer (web-gerber tạo renderer không kèm stencil), nên mượn depth
    // buffer làm mặt nạ — ở 2D depth test đã tắt cho mọi lớp nên buffer đang trống:
    //   1. lỗ mở vẽ màu FR-4 và GHI depth → depth buffer thành bản đồ "chỗ có lỗ mở";
    //   2. đồng mặt trước vẽ lại màu pad, chỉ cho qua chỗ đã có depth của lỗ mở
    //      (GreaterDepth: mảnh đồng đặt SÂU hơn lỗ mở 0.1, chỗ không có lỗ mở thì
    //      depth còn là giá trị xoá = xa nhất nên không mảnh nào qua được).
    // Mặt xa nằm dưới lõi bo, không cần. 3D và CAM giữ nguyên.
    const followers: { obj: any; leader: any }[] = []
    if (!camMode && !threeDMode) {
      const near = fromBelow ? pcb.Btm : pcb.Top
      const face = fromBelow ? -1 : 1
      const openings = near?.SolderMask
      const copper = near?.Copper
      if (openings && copper && copper.parent) {
        // Hằng của three (bản đóng gói trong web-gerber không export ra).
        const ALWAYS_DEPTH = 1
        const GREATER_DEPTH = 6
        const restyle = (obj: any, fn: (m: any, o: any) => void) =>
          obj.traverse((o: any) => {
            const mats = materialsOf(o)
            if (!mats.length) return
            const own = mats.map((m: any) => {
              const c = m.clone()
              fn(c, o)
              return c
            })
            o.material = Array.isArray(o.material) ? own : own[0]
          })
        restyle(openings, (m) => {
          m.color?.set?.(BASE_BOARD)
          // Tắt depth test trong WebGL là tắt luôn cả ghi depth, nên phải BẬT test
          // nhưng cho mọi mảnh qua (AlwaysDepth) thì lỗ mở mới ghi được mặt nạ.
          m.depthTest = true
          m.depthFunc = ALWAYS_DEPTH
          m.depthWrite = true
        })
        const pads = copper.clone()
        restyle(pads, (m, o) => {
          // Đoạn khoét (đảo cực) trong lớp đồng vẫn là chỗ KHÔNG có đồng.
          const erased = o.userData?.polarityErase || o.parent?.userData?.polarityErase
          m.color?.set?.(erased ? BASE_BOARD : palette.MaskOpening)
          m.depthTest = true
          m.depthWrite = false
          m.depthFunc = GREATER_DEPTH
        })
        const base = openings.renderOrder + 0.5
        pads.traverse((o: any) => {
          o.renderOrder = base + (o.renderOrder - copper.renderOrder) * 0.1
        })
        pads.position.z = copper.position.z - face * 0.1
        copper.parent.add(pads)
        // Bật/tắt theo lớp mask: tắt mask ở sidebar thì pad (vốn là "đồng lộ qua mask")
        // cũng tắt, khỏi còn trơ lại một lớp đồng màu pad.
        followers.push({ obj: pads, leader: openings })
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

    sceneRef.current = { byFile, maskFiles, topOil, bottomOil, camMode, followers, addExtra }

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
      // Khoảng cách camera để bo vừa khung — PHẢI tính theo tỉ lệ khung LÚC GỌI: khung
      // đổi cỡ (xoay điện thoại, đổi cỡ cửa sổ, mở/đóng bảng bên) mà dùng số lúc dựng thì
      // khung dọc hẹp → khung ngang bo chỉ còn ~1/8, và "Vừa khung" cũng không cứu được.
      const fitDistNow = () => (Math.max(h, w / aspectNow()) / 2 / Math.tan(fov / 2)) * fitPadding
      const fitDist = fitDistNow()
      /** Đang ở đúng khung "vừa khung" (chưa zoom/kéo/xoay) → đổi cỡ khung thì tự vừa lại. */
      let atFit = true

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
        view.dist = fitDistNow()
        view.az = -Math.PI / 2
        view.el = fromBelow ? -0.9 : 0.9
        atFit = true
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
        // Người dùng chưa zoom/kéo thì giữ "vừa khung" theo cỡ khung mới; đã zoom vào
        // một chỗ thì giữ nguyên chỗ đang soi.
        if (atFit) {
          view.x = cx
          view.y = cy
          view.dist = fitDistNow()
        }
        apply()
      })
      ro.observe(el)
      cleanups.push(() => ro.disconnect())

      const canvas = render.Renderer?.domElement as HTMLCanvasElement | undefined
      if (canvas) {
        // ── Chuột + cảm ứng ──
        // Điện thoại (22/09/2026): trước chỉ có zoom bằng con lăn — không pinch được; hai
        // ngón cùng lái MỘT lượt kéo nên bo giật qua lại; trình duyệt còn tự cuộn/phóng
        // trang theo cử chỉ. Giờ theo dõi từng ngón: một ngón = kéo (2D) / xoay (3D), hai
        // ngón = chụm để zoom quanh điểm giữa hai ngón + kéo, chạm đúp = về vừa khung.
        canvas.style.touchAction = 'none'
        // Giới hạn zoom theo khoảng cách vừa khung HIỆN TẠI (khung đổi cỡ thì đổi theo).
        const minDist = () => fitDistNow() * 0.02
        const maxDist = () => fitDistNow() * 20
        /** Số đơn vị world trên một pixel màn hình, theo khoảng cách camera hiện tại. */
        const worldPerPx = () => (2 * view.dist * Math.tan(fov / 2)) / (canvas.clientHeight || 1)
        // Nhìn từ dưới lên thì trục X trên màn hình bị lật.
        const sx = fromBelow ? -1 : 1
        /**
         * Zoom theo hệ số `k` (<1 là phóng to) mà giữ nguyên điểm dưới (clientX, clientY)
         * — ở 2D điểm đó đứng yên dưới ngón tay/con trỏ; 3D chỉ đổi khoảng cách.
         */
        const zoomAt = (k: number, clientX: number, clientY: number) => {
          atFit = false
          const next = Math.min(Math.max(view.dist * k, minDist()), maxDist())
          if (!threeDMode) {
            const rect = canvas.getBoundingClientRect()
            const dx = clientX - (rect.left + rect.width / 2)
            const dy = clientY - (rect.top + rect.height / 2)
            const before = worldPerPx()
            const wx = view.x + sx * dx * before
            const wy = view.y - dy * before
            view.dist = next
            const after = worldPerPx()
            view.x = wx - sx * dx * after
            view.y = wy + dy * after
          } else {
            view.dist = next
          }
        }
        const onWheel = (e: WheelEvent) => {
          e.preventDefault()
          zoomAt(e.deltaY > 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY)
          apply()
        }

        /** Các ngón / con trỏ đang chạm, theo pointerId. */
        const pts = new Map<number, { x: number; y: number }>()
        /** Mốc của cử chỉ hai ngón: khoảng cách và điểm giữa lần trước. */
        let pinch: { d: number; mx: number; my: number } | null = null
        let lastTap = { t: 0, x: 0, y: 0 }
        let moved = false
        const pinchState = () => {
          const [a, b] = [...pts.values()]
          return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }
        }

        const onDown = (e: PointerEvent) => {
          pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
          try { canvas.setPointerCapture(e.pointerId) } catch { /* ignore */ }
          if (pts.size === 1) moved = false
          // Ngón thứ hai chạm: bắt đầu cử chỉ hai ngón từ đúng vị trí hiện tại.
          pinch = pts.size === 2 ? pinchState() : null
        }
        const onMove = (e: PointerEvent) => {
          const p = pts.get(e.pointerId)
          if (!p) return
          const ddx = e.clientX - p.x
          const ddy = e.clientY - p.y
          if (Math.hypot(ddx, ddy) > 3) moved = true
          p.x = e.clientX
          p.y = e.clientY

          if (pts.size >= 2 && pinch) {
            const now = pinchState()
            // Chụm/mở: khoảng cách hai ngón tăng thì phóng to (camera lại gần).
            zoomAt(pinch.d / now.d, now.mx, now.my)
            if (!threeDMode) {
              // Kéo hai ngón: điểm giữa di bao nhiêu thì bo di bấy nhiêu.
              const wpp = worldPerPx()
              view.x -= sx * (now.mx - pinch.mx) * wpp
              view.y += (now.my - pinch.my) * wpp
            }
            pinch = now
          } else if (pts.size === 1) {
            if (threeDMode) {
              // kéo ngang = xoay quanh trục z, kéo dọc = nâng/hạ góc nhìn
              view.az -= ddx * 0.008
              view.el += ddy * 0.008
              // chặn sát 2 cực để camera không lật
              view.el = Math.min(Math.max(view.el, -1.5), 1.5)
            } else {
              // Nhìn từ dưới lên thì trục X bị lật -> đảo dấu để kéo sang phải thì bo
              // vẫn chạy sang phải.
              const wpp = worldPerPx()
              view.x -= sx * ddx * wpp
              view.y += ddy * wpp
            }
          } else {
            return
          }
          atFit = false
          apply()
        }
        const onUp = (e: PointerEvent) => {
          const wasSingle = pts.size === 1
          pts.delete(e.pointerId)
          try { canvas.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
          // Nhấc một trong hai ngón: ngón còn lại tiếp tục kéo, không nhảy.
          pinch = pts.size === 2 ? pinchState() : null
          // Chạm đúp (hai lần chạm nhanh, gần nhau, không kéo) = về vừa khung.
          if (e.type === 'pointerup' && wasSingle && !moved && e.pointerType !== 'mouse') {
            const now = performance.now()
            if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
              resetView()
              lastTap = { t: 0, x: 0, y: 0 }
              return
            }
            lastTap = { t: now, x: e.clientX, y: e.clientY }
          }
        }
        const onDblClick = () => resetView()
        canvas.addEventListener('wheel', onWheel, { passive: false })
        canvas.addEventListener('pointerdown', onDown)
        canvas.addEventListener('pointermove', onMove)
        canvas.addEventListener('pointerup', onUp)
        // Hệ điều hành cướp cử chỉ (vuốt thông báo, cuộn) -> phải bỏ ngón đó, không thì
        // kẹt trạng thái kéo.
        canvas.addEventListener('pointercancel', onUp)
        canvas.addEventListener('dblclick', onDblClick)
        canvas.style.cursor = 'grab'
        cleanups.push(() => {
          canvas.removeEventListener('wheel', onWheel)
          canvas.removeEventListener('pointerdown', onDown)
          canvas.removeEventListener('pointermove', onMove)
          canvas.removeEventListener('pointerup', onUp)
          canvas.removeEventListener('pointercancel', onUp)
          canvas.removeEventListener('dblclick', onDblClick)
        })
      }
    }

    const totalMs = Math.round(performance.now() - t0)
    if (board.activeBoardId && !firstBuildMs.has(board.activeBoardId)) firstBuildMs.set(board.activeBoardId, totalMs)
    setTotalMs(totalMs)
    // Khung chia đôi ẩn badge, nên ghi ra console để còn đo được tốc độ dựng.
    const mode = camMode ? 'CAM' : threeDMode ? '3D' : 'Real'
    console.info(`[WebGL] dựng ${fromBelow ? 'bottom' : 'top'}/${mode}: ${totalMs} ms, ${ok} lớp, ${cacheHits} từ cache`)
    setFailed(bad)
    setLightLayers(light)
    // Báo cho khung ngoài biết bo nào vừa hiện lên màn hình — màn chờ mở file chỉ tắt
    // khi đúng bo mới đã dựng xong, không tắt lúc còn đang hiện bo cũ.
    window.dispatchEvent(new CustomEvent(BOARD_RENDERED_EVENT, { detail: board.activeBoardId }))
    // Badge chỉ ghi file khoan đã dùng và số lỗ; số lớp/cache đã có trong console.info ở trên.
    setStatus(
      drillPlan.length
        ? `${drillPlan.map((d) => d.name.split(/[\\/]/).pop()).join(', ')} · ${drillHoles} lỗ`
        : 'không có'
    )
    // Lớp nặng: vẽ dần từng mẻ lúc máy rảnh, gắn vào object rỗng đã đặt sẵn trong cảnh.
    // Mỗi mẻ CHUNK_SHAPES hình (~1–2 s) rồi nhả luồng, nên giao diện vẫn bấm được và hình
    // hiện lên từ từ.
    // Bo đang xem đã hiện: tranh thủ lúc rảnh dựng sẵn các bo còn lại (xem schedulePrebuild).
    schedulePrebuild()

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

    if (s.camMode) for (const l of board.layers) if (board.visibleLayers.has(l.id) && !s.byFile.has(l.filename)) s.addExtra(l)

    for (const [file, obj] of s.byFile) obj.visible = shown(file)
    for (const { obj, leader } of s.followers) obj.visible = leader.visible
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

  const outlineLayer = board.layers.find((l) => l.type === 'outline')
  const outlineFile = outlineLayer ? outlineLayer.filename.split(/[\\/]/).pop() : 'không có'
  // Thời gian mở bo thật: đọc file + lần dựng đầu (không phải lần dựng lại từ cache).
  const loadMs = board.parseMs + ((board.activeBoardId && firstBuildMs.get(board.activeBoardId)) || totalMs || 0)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', backgroundColor: '#0b0d10' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Màn gọn: chỉ icon (2 Mặt có hai nút, để chữ thì chiếm cả đáy khung); còn cử
          chỉ chạm đúp cũng về vừa khung. */}
      <Button
        icon="fit"
        size={isMobile ? 'icon' : 'md'}
        onClick={() => fitViewRef.current?.()}
        title="Đưa khung nhìn về vừa khít bo"
        aria-label="Vừa khung"
        style={{
          position: 'absolute',
          right: 10,
          bottom: 10,
          zIndex: 5,
          borderRadius: RADIUS.md,
          backgroundColor: 'rgba(15,23,42,0.85)',
          borderColor: C.border,
        }}
      >
        {isMobile ? null : 'Vừa khung'}
      </Button>
      {hideBadge ? (
        <div style={faceTag} title={fromBelow ? 'Mặt Bot, nhìn từ dưới lên (đã lật gương)' : 'Mặt Top, nhìn từ trên xuống'}>{fromBelow ? 'BOT' : 'TOP'}</div>
      ) : (
        <div style={badge}>
          {/* Chỉ ba điều người lập cần soát: viền lấy từ file nào, khoan từ file nào,
              dựng mất bao lâu. */}
          <div>Viền: {outlineFile}</div>
          <div>Khoan: {status}</div>
          {(smallest.hole || smallest.slot) && (
            <div title="Đỏ: dưới 0.254 mm · Vàng: 0.254 – dưới 0.3 mm">
              Mũi nhỏ nhất:{' '}
              {smallest.hole && (
                <span style={{ color: drillColor(smallest.hole.d) }}>
                  Ø{mmText(smallest.hole.d)} mm ({smallest.hole.count} lỗ)
                </span>
              )}
              {smallest.hole && smallest.slot ? ' · ' : ''}
              {smallest.slot && <span style={{ color: drillColor(smallest.slot) }}>rãnh {mmText(smallest.slot)} mm</span>}
            </div>
          )}
          {panel && (
            <div
              title={`Cách nhận biết: ${panel.detail}.
1. Viền có nhiều bo tách rời → có ghép.
2. Cả bo lặp lại theo một bước cỡ một bo — chấm bằng chữ in lụa (tên linh kiện lặp y hệt), bo không có lụa thì bằng đồng: khớp ≥ 90% → có; 60–90% → có thể (có bo xoay/khác mẫu, hoặc chỉ là các kênh giống nhau trong một bo).
3. Chỉ có tên file chứa "ghep", "panel"… → có thể.`}
              style={{ color: panel.verdict === 'yes' ? '#fbbf24' : panel.verdict === 'maybe' ? '#fde68a' : undefined }}
            >
              Ghép:{' '}
              {panel.verdict === 'yes'
                ? `Có — ${panel.count}${panel.partial ? '+' : ''} bo${panel.cols * panel.rows === panel.count && panel.count > 1 ? ` (${panel.cols}×${panel.rows})` : ''} · ${panel.designs > 1 ? `${panel.designs} thiết kế` : panel.method === 'outline' ? 'viền rời' : 'bo lặp lại'}`
                : panel.verdict === 'maybe'
                  ? panel.method === 'repeat'
                    ? `có thể — ${panel.count}+ bo giống nhau (một phần lặp lại)`
                    : 'có thể — chỉ theo tên file'
                  : 'không'}
            </div>
          )}
          {totalMs !== null && <div>Load: {loadMs} ms</div>}
          {threeDMode && (
            <div style={{ color: '#93c5fd', marginTop: 4 }}>
              Kéo chuột để xoay (kéo lên để lật xem mặt Bot) · lăn để zoom
            </div>
          )}
          {lightLayers.length > 0 && (
            <div style={{ color: '#93c5fd', marginTop: 4 }} title="Lớp rất nhiều hình được vẽ đơn giản hơn (nét không bo tròn đầu) để xem được — xem fastLayer.ts">
              {lightLayers.length} lớp nhiều hình vẽ ở chế độ nhẹ:{' '}
              {lightLayers.map((f) => f.split(/[/]/).pop()).join(', ')}
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
