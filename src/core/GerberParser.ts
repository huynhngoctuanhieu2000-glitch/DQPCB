import identify from 'whats-that-gerber'
import JSZip from 'jszip'
// @ts-ignore - web-gerber không kèm type cho các named export
import { createParser, plot } from 'web-gerber'

export interface ParsedGerberLayer {
  id: string
  filename: string
  /** Tên rút gọn (đã bỏ tiền tố chung của cả bộ file) dùng để phân biệt trên UI */
  shortName: string
  displayName: string
  type: string
  side: string
  color: string
  order: number
  visible: boolean
  size: [number, number, number, number] // [minX, minY, maxX, maxY] in mm
  units: 'mm' | 'in'
  outlineMaxStroke?: number
  /**
   * Hình học đã plot (ImageTree của web-gerber), dùng lại cho viewer thay vì parse lần
   * hai. Trước đây viewer tự parse từ rawFiles, và hai đường đi đã lệch nhau hai lần:
   * một lần ở phân loại lớp, một lần ở chuẩn hoá file khoan.
   */
  imageTree: any
  /** Số lỗ khoan (chỉ có ý nghĩa với layer type 'drill') */
  holeCount: number
}

export interface BoardParsedData {
  projectName: string
  /** Tên file archive nguồn; rỗng nếu là các file gerber rời. */
  sourceFile?: string
  layers: ParsedGerberLayer[]
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
    widthMM: number
    heightMM: number
  }
  layerCount: number
  drillCount: number
  /** File phụ trợ bị bỏ qua (report, aperture list, BOM…) */
  ignoredFiles: string[]
  /** File có vẻ là Gerber/Drill nhưng parser không đọc được */
  failedFiles: { name: string; reason: string }[]
}

// 🎨 Comprehensive Layer Matcher for Altium, KiCad, Eagle, OrCAD, Sprint-Layout, Proteus, EasyEDA, CAM350
//
// Thứ tự ưu tiên (dừng ở rule đầu tiên khớp):
//   1. Đuôi file "chuẩn" của từng EDA  → độ tin cậy cao nhất
//   2. Từ khoá trong tên file, so khớp theo *ranh giới từ* (\b) trên chuỗi đã
//      chuẩn hoá — tránh bắt nhầm "Similar" ⇒ "mil", "depth" ⇒ "pth"
//   3. whats-that-gerber (chỉ dùng khi 1 & 2 không có kết quả)
//
// Lưu ý về `type`:
//   - 'documentation' = lớp tài liệu (drill drawing/guide, fab, assembly…) → ẩn mặc định
//   - 'unknown'       = không nhận dạng được → VẪN HIỆN, để người dùng tự bật/tắt

export interface LayerMeta {
  type: string
  side: string
  displayName: string
  color: string
  order: number
}

// File phụ trợ (report, aperture list, BOM, ảnh…) — không chứa dữ liệu đồ hoạ,
// không bao giờ được đưa vào danh sách layer.
const AUXILIARY_EXT =
  /\.(apr|apr_lib|extrep|rul|rep|drr|ldp|ipc|cam|dri|gpi|lis|apt|gtd|gbrjob|rpt|log|max|csv|tsv|xls|xlsx|pdf|doc|docx|htm|html|md|ini|cfg|json|xml|bak|db|zip|rar|7z|tgz|tar|gz|ddw|jpe?g|png|gif|bmp|svg|step|stp|iges|igs|dwg|dxf)$/i

// "read[-_ ]?me" chứ không phải "readme": Proteus đặt tên READ-ME.TXT, mà .txt lại là
// đuôi file khoan của Altium nên nếu lọt qua đây nó sẽ bị nhận thành lớp khoan.
const AUXILIARY_NAME =
  /\b(bom|pick[-_ ]?(and[-_ ]?)?place|pnp|read[-_ ]?me|report|status|netlist|aperture)\b/i

/**
 * DipTrace đặt tên lớp bằng đuôi 3 ký tự (.top/.bot/.plc/.stp/.sbt…), trong đó .stp
 * trùng với đuôi file STEP 3D. Chỉ có thể phân biệt bằng ngữ cảnh: nếu trong cùng bộ
 * file có các đuôi đặc trưng của DipTrace thì .stp/.sbt là lớp kem hàn, không phải STEP.
 */
const looksLikeDipTrace = (allFilenames?: string[]) =>
  !!allFilenames?.some((f) => /\.(top|bot|plc|pls|smt|smb)$/i.test(f))

/** File không chứa dữ liệu Gerber/Excellon → bỏ hẳn, không parse, không hiển thị. */
export const isAuxiliaryFile = (filename: string, allFilenames?: string[]): boolean => {
  const base = filename.split(/[\\/]/).pop() || filename
  if (/\.(stp|sbt)$/i.test(base) && looksLikeDipTrace(allFilenames)) return false
  if (AUXILIARY_EXT.test(base)) return true
  // .txt vừa có thể là NC-Drill (Altium) vừa là file ghi chú → chỉ loại khi tên rõ ràng là tài liệu
  if (/\.txt$/i.test(base) && AUXILIARY_NAME.test(base)) return true
  return false
}

/**
 * Sai số lớn nhất cho phép giữa cung thật và chuỗi đoạn thẳng thay thế nó (mm).
 * 0.02mm nhỏ hơn nét in mảnh nhất nên mắt không thấy được chỗ gãy.
 */
const ARC_TOLERANCE_MM = 0.02

/** Bẻ một cung thành chuỗi đoạn thẳng đủ mịn. `tol` tính theo đơn vị của file. */
const arcToLines = (seg: any, tol: number): any[] => {
  const r = seg?.radius
  const cx = seg?.center?.[0]
  const cy = seg?.center?.[1]
  const a0 = seg?.start?.[2]
  const a1 = seg?.end?.[2]
  if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(cx) || !Number.isFinite(a0) || !Number.isFinite(a1)) {
    return [seg]
  }

  // Cung khép kín (Gerber đa cung tư: điểm đầu trùng điểm cuối) có góc quét bằng 0.
  // Giữ nguyên thì nó thành một điểm, mất hẳn — hiểu là cả vòng tròn.
  let sweep = a1 - a0
  if (Math.abs(sweep) < 1e-9) sweep = Math.PI * 2

  // Bước góc lớn nhất giữ sai số cung-dây dưới tol: r(1 - cos(θ/2)) <= tol
  const maxStep = r > tol ? 2 * Math.acos(1 - tol / r) : Math.PI
  const n = Math.max(1, Math.min(64, Math.ceil(Math.abs(sweep) / maxStep)))
  if (n < 2) return [seg]

  const at = (i: number) => {
    if (i === 0) return [seg.start[0], seg.start[1]]
    if (i === n) return [seg.end[0], seg.end[1]]
    const a = a0 + (sweep * i) / n
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  }
  const out: any[] = []
  for (let i = 0; i < n; i++) out.push({ type: 'line', start: at(i), end: at(i + 1) })
  return out
}

/**
 * Bẻ mọi cung trong các nét vẽ (imagePath) thành đoạn thẳng.
 *
 * web-gerber dựng nét vẽ bằng ExtrudeGeometry với `extrudePath` và `steps: 1`. Một
 * bước dọc theo đường dẫn nghĩa là nó chỉ lấy điểm đầu và điểm cuối, nên xương sống
 * cong bị bóp thẳng: cung bo góc 90° ra thành vát 45°, còn lỗ tròn ghép từ bốn cung
 * ra thành hình thoi. Vùng tô (imageRegion) thì nó dựng bằng `absarc` nên đúng sẵn,
 * không đụng tới.
 *
 * Mỗi đoạn tách thành một child riêng vì bộ dựng outline của thư viện từ chối child
 * có nhiều hơn một segment ("Invalid outline segments length") — nhét cả chuỗi vào
 * một child là mất luôn lõi bo.
 */
const flattenArcs = (tree: any): any => {
  const children = tree?.children
  if (!Array.isArray(children)) return tree
  const tol = ARC_TOLERANCE_MM / (tree.units === 'in' ? 25.4 : 1)

  let touched = false
  const out: any[] = []
  for (const child of children) {
    const segs = child?.segments
    if (child?.type !== 'imagePath' || !Array.isArray(segs) || !segs.some((s: any) => s?.type === 'arc')) {
      out.push(child)
      continue
    }
    touched = true
    for (const seg of segs) {
      const pieces = seg?.type === 'arc' ? arcToLines(seg, tol) : [seg]
      for (const piece of pieces) out.push({ ...child, segments: [piece] })
    }
  }
  if (!touched) return tree

  const flat: any = { ...tree, children: out }
  if (Array.isArray(tree.parts)) flat.parts = tree.parts.map(flattenArcs)
  return flat
}

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

  // web-gerber dựng outline bằng cách duyệt từng child và nối vào MỘT shape, nhưng
  // nó CHỈ chấp nhận child có đúng 1 segment:
  //     if (n.segments.length != 1) -> warn("Invalid outline segments length"), null
  // Gộp cả chuỗi vào một child sẽ bị từ chối và lõi bo không được dựng (nhìn xuyên
  // xuống mặt dưới). Nên trả về mỗi segment một child, chỉ khác là ĐÚNG THỨ TỰ.
  //
  // Vì nó chỉ dựng được một shape, panel có NHIỀU đường bao rời (9 bo + khung + rãnh
  // v-cut = 13 vòng) sẽ bị nối liền thành một khối tự cắt. Nên tách mỗi vòng thành một
  // cây riêng để bên ngoài dựng từng mảnh rồi gộp lại.
  const template = tree.children.find((c: any) => c?.segments?.length) ?? tree.children[0]
  const asTree = (segments: any[]) => ({
    ...tree,
    children: segments.map((seg) => ({ ...template, segments: [seg] })),
  })

  // Giữ mọi vòng đủ 3 đoạn — đủ để tạo thành một vùng, kể cả khi còn hở (khung panel
  // hay bị hở vài chục mm chỗ nối rãnh, bỏ đi thì mất luôn cả khung). Vòng 1–2 đoạn
  // chỉ là đường thẳng lẻ (vạch v-cut, khe tab), tô đặc không ra hình gì.
  const usable = chains.filter((ch) => ch.length >= 3)

  const main = asTree(usable.flat())
  return { ...main, parts: usable.map(asTree) }
}

// Chuẩn hoá tên (bỏ đuôi, thay mọi ký tự không phải chữ/số bằng khoảng trắng)
// để dùng được \b mà không bị các dấu -, _, . làm nhiễu.
const normalizeName = (filename: string) => {
  const base = (filename.split(/[\\/]/).pop() || filename).toLowerCase()
  return base
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const getExt = (filename: string) => {
  const base = (filename.split(/[\\/]/).pop() || filename).toLowerCase()
  const m = base.match(/\.([^.]+)$/)
  return m ? m[1] : ''
}

const META: Record<string, LayerMeta> = {
  copperTop: { type: 'copper', side: 'top', displayName: 'Top Copper', color: '#E55039', order: 6 },
  copperBot: { type: 'copper', side: 'bottom', displayName: 'Bot Copper', color: '#38BDF8', order: 3 },
  copperInner: { type: 'copper', side: 'inner', displayName: 'Inner Copper', color: '#E67E22', order: 4.5 },
  silkTop: { type: 'silkscreen', side: 'top', displayName: 'Top Silk', color: '#FFFFFF', order: 7 },
  silkBot: { type: 'silkscreen', side: 'bottom', displayName: 'Bot Silk', color: '#8EAEE0', order: 4 },
  maskTop: { type: 'soldermask', side: 'top', displayName: 'Top Solder', color: '#00B08B', order: 5 },
  maskBot: { type: 'soldermask', side: 'bottom', displayName: 'Bot Solder', color: '#16A085', order: 2 },
  pasteTop: { type: 'solderpaste', side: 'top', displayName: 'Top Paste', color: '#B5A672', order: 1 },
  pasteBot: { type: 'solderpaste', side: 'bottom', displayName: 'Bot Paste', color: '#A59662', order: 1 },
  outline: { type: 'outline', side: 'all', displayName: 'Outline', color: '#F1C40F', order: 8 },
  drill: { type: 'drill', side: 'all', displayName: 'Drl', color: '#FFFFFF', order: 9 },
  doc: { type: 'documentation', side: 'all', displayName: 'Doc', color: '#718096', order: 12 },
  unknown: { type: 'unknown', side: 'all', displayName: 'Unknown', color: '#9B59B6', order: 11 },
}

// Bảng tra theo đuôi file — kiểm tra trước mọi từ khoá.
const EXT_MAP: Record<string, LayerMeta> = {
  // copper
  gtl: META.copperTop, cmp: META.copperTop, top: META.copperTop,
  toplayer: META.copperTop, l1: META.copperTop, layer1: META.copperTop,
  gbl: META.copperBot, sol: META.copperBot, bot: META.copperBot,
  bottomlayer: META.copperBot, l2: META.copperBot, layer2: META.copperBot,
  // silkscreen
  gto: META.silkTop, plc: META.silkTop, sst: META.silkTop, sstop: META.silkTop, tss: META.silkTop,
  gbo: META.silkBot, pls: META.silkBot, ssb: META.silkBot, ssbot: META.silkBot, bss: META.silkBot,
  // soldermask
  gts: META.maskTop, stc: META.maskTop, smt: META.maskTop, smtop: META.maskTop, tsm: META.maskTop,
  gbs: META.maskBot, sts: META.maskBot, smb: META.maskBot, smbot: META.maskBot, bsm: META.maskBot,
  // solderpaste
  gtp: META.pasteTop, crc: META.pasteTop, spt: META.pasteTop, sptop: META.pasteTop, tsp: META.pasteTop,
  gbp: META.pasteBot, crs: META.pasteBot, spb: META.pasteBot, spbot: META.pasteBot, bsp: META.pasteBot,
  // DipTrace: kem hàn mặt trên/dưới (.stp trùng đuôi file STEP — xem looksLikeDipTrace)
  stp: META.pasteTop, sbt: META.pasteBot,
  // outline
  gko: META.outline, gml: META.outline, oln: META.outline, bor: META.outline,
  dim: META.outline, mil: META.outline, contour: META.outline, profile: META.outline,
  // drill
  drl: META.drill, tap: META.drill, xln: META.drill, exc: META.drill,
  ncd: META.drill, nc: META.drill, drill: META.drill,
  drd: META.drill, // Eagle: drill data, KHÔNG phải drill drawing
  // documentation (không phải lớp gia công → ẩn mặc định)
  gd1: META.doc, gg1: META.doc, gpt: META.doc, gpb: META.doc,
  dts: META.doc, fab: META.doc,
  // Lưu ý: KHÔNG đưa 'art' (OrCAD/Allegro) vào đây. Đuôi .art dùng chung cho mọi lớp,
  // ý nghĩa nằm ở TÊN file (TOP.art, SOLDERMASK_TOP.art…) nên phải để rule từ khoá xử lý.
}

/**
 * Bộ CAM của nhà máy (JLCCAM, Genesis…) xuất file KHÔNG có phần mở rộng, tên chỉ là mã
 * hai chữ cái: tl/bl/to/bo/ts/bs/ko/drl. Bù lại, mỗi file tự khai báo mã lớp ngay trong
 * header: "G04 -- layer:tl*". Header đó đáng tin hơn tên file nên được ưu tiên đọc.
 */
const CAM_LAYER_CODES: Record<string, LayerMeta | undefined> = {
  tl: META.copperTop,
  bl: META.copperBot,
  to: META.silkTop,
  bo: META.silkBot,
  ts: META.maskTop,
  bs: META.maskBot,
  ko: META.outline,
  drl: META.drill,
  // vcut là đường rạch chữ V để tách bo khỏi panel — chỉ dẫn gia công, không phải lớp bo
  vcut: { ...META.doc, displayName: 'V-Cut' },
}

const readCamLayerCode = (content?: string) => {
  if (!content) return undefined
  const m = content.slice(0, 2000).match(/^G04\s*--\s*layer\s*:\s*([A-Za-z0-9_]+)/im)
  return m ? m[1].toLowerCase() : undefined
}

export const matchLayer = (
  filename: string,
  allFilenames?: string[],
  content?: string
): LayerMeta => {
  const ext = getExt(filename)
  const norm = normalizeName(filename)

  // ---- 0. Mã lớp do chính file khai báo -----------------------------------
  // Đáng tin nhất: file tự nói nó là lớp gì, không phụ thuộc người đặt tên.
  const camCode = readCamLayerCode(content)
  if (camCode && CAM_LAYER_CODES[camCode]) return { ...CAM_LAYER_CODES[camCode]! }

  // ---- 1. Đuôi file chuẩn -------------------------------------------------
  const byExt = EXT_MAP[ext]
  if (byExt) return { ...byExt }

  // File không có phần mở rộng, tên chính là mã lớp CAM (tl, bl, ko…). Chỉ áp khi
  // KHÔNG có đuôi, tránh đụng các bộ file thường dùng 2 chữ cái cho mục đích khác.
  if (!ext && CAM_LAYER_CODES[norm]) return { ...CAM_LAYER_CODES[norm]! }

  // Tên file CHỈ có mỗi mặt bo, không kèm chữ "copper": TOP.art / BOTTOM.art của
  // OrCAD, TOP.gbr / BOT.gbr của các bộ xuất tối giản. Quy ước chung của ngành là
  // lớp đồng. Bắt buộc khớp trọn vẹn để không đụng "Top Solder Resist", "MASKTOP"…
  if (/^(top|bottom|bot)$/.test(norm)) {
    return norm === 'top' ? { ...META.copperTop } : { ...META.copperBot }
  }

  // Inner copper: .G1–.G9 / .IN1 / .L3–.L9
  const innerExt = ext.match(/^(?:g|in|l)(\d{1,2})$/)
  if (innerExt) {
    const idx = parseInt(innerExt[1], 10)
    if (idx >= 1 && idx <= 32) {
      return { ...META.copperInner, displayName: `Inner ${idx}` }
    }
  }
  // Mechanical .GM1–.GM99: chỉ GM1 mặc định là outline, còn lại là tài liệu cơ khí
  const mechExt = ext.match(/^gm(\d{1,2})$/)
  if (mechExt) {
    return parseInt(mechExt[1], 10) === 1
      ? { ...META.outline }
      : { ...META.doc, displayName: `Mech ${mechExt[1]}` }
  }

  // ---- 2. Từ khoá trong tên (khớp theo ranh giới từ) ----------------------
  // Thứ tự: drill → paste → mask → silk → copper → outline → documentation
  const has = (re: RegExp) => re.test(norm)

  // Dữ liệu khoan thật luôn là Excellon (.drl/.txt/.xln/.ncd…), không bao giờ mang đuôi
  // ảnh Gerber. Proteus xuất kèm "… Drill.GBR" — đó là BẢN VẼ khoan, 74KB đồ hoạ. Nếu
  // coi nó là dữ liệu khoan thì nó sẽ đè cả file .DRL thật (báo 3155 lỗ thay vì 91).
  if (/^(gbr|ger|gbx|pho|art)$/.test(ext) && has(/\b(drill|drl|excellon)\b/)) {
    return { ...META.doc, displayName: 'Drill Drawing' }
  }

  if (has(/\b(drill|drl|excellon|npth|pth|holes|thruhole)\b/) && !has(/\b(drawing|guide|map|report)\b/)) {
    return { ...META.drill }
  }
  // Cho phép một từ đệm giữa mặt bo và "paste": Proteus ghi "Top SMT Paste",
  // chỗ khác ghi "Top Solder Paste" hoặc "Top Paste".
  if (has(/\b(top|t|f|front)\s*(\w+\s+)?paste\b|\bpaste\s*(mask\s*)?(top|t|f|front)\b/)) return { ...META.pasteTop }
  if (has(/\b(bot|bottom|b|back)\s*(\w+\s+)?paste\b|\bpaste\s*(mask\s*)?(bot|bottom|b|back)\b/)) return { ...META.pasteBot }

  if (has(/\b(top|t|f|front)\s*(solder|mask|resist|soldermask)\b|\b(mask|resist|soldermask)\s*(top|t|f|front)\b/)) return { ...META.maskTop }
  if (has(/\b(bot|bottom|b|back)\s*(solder|mask|resist|soldermask)\b|\b(mask|resist|soldermask)\s*(bot|bottom|b|back)\b/)) return { ...META.maskBot }

  // "Overlay" là tên Altium cho silkscreen; "Legend" là tên của một số nhà máy
  if (has(/\b(top|t|f|front)\s*(silk|silkscreen|overlay|legend)\b|\b(silk|silkscreen|overlay|legend)\s*(top|t|f|front)\b/)) return { ...META.silkTop }
  if (has(/\b(bot|bottom|b|back)\s*(silk|silkscreen|overlay|legend)\b|\b(silk|silkscreen|overlay|legend)\s*(bot|bottom|b|back)\b/)) return { ...META.silkBot }

  const innerName = norm.match(/\b(?:in|inner|internal)\s*(\d{1,2})\b/)
  if (innerName) return { ...META.copperInner, displayName: `Inner ${parseInt(innerName[1], 10)}` }
  if (has(/\b(top|t|f|front)\s*(copper|layer|cu)\b|\b(copper|cu)\s*(top|t|f|front)\b|\blayer\s*1\b/)) return { ...META.copperTop }
  if (has(/\b(bot|bottom|b|back)\s*(copper|layer|cu)\b|\b(copper|cu)\s*(bot|bottom|b|back)\b|\blayer\s*2\b/)) return { ...META.copperBot }
  if (has(/\b(inner|internal)\s*(copper|layer|cu)\b/)) return { ...META.copperInner }

  if (has(/\b(outline|border|contour|profile|dimension|dim|mil|oln|edge\s*cuts?|board\s*outline|keep\s*out)\b|\bmechanical\s*1\b/)) {
    return { ...META.outline }
  }

  if (
    has(
      /\b((drill|drl)\s*(drawing|guide|map)|fab|fabrication|assembly|assy|courtyard|adhesive|glue|comments?|notes?|user|pad\s*master|multi\s*layer|drawing)\b/
    )
  ) {
    return { ...META.doc }
  }

  // ---- 3. whats-that-gerber ----------------------------------------------
  // Truyền cả danh sách file để thư viện suy luận đúng "common CAD"
  // (gọi từng file một sẽ làm mất khả năng phân biệt EDA của thư viện).
  const base = filename.split(/[\\/]/).pop() || filename
  const list = allFilenames && allFilenames.length > 1 ? allFilenames : [base]
  const fallback = identify(list)[base] ?? identify([base])[base]

  if (fallback?.type) {
    const side = fallback.side || 'all'
    switch (fallback.type) {
      case 'copper':
        return side === 'top' ? { ...META.copperTop } : side === 'bottom' ? { ...META.copperBot } : { ...META.copperInner }
      case 'silkscreen':
        return side === 'bottom' ? { ...META.silkBot } : { ...META.silkTop }
      case 'soldermask':
        return side === 'bottom' ? { ...META.maskBot } : { ...META.maskTop }
      case 'solderpaste':
        return side === 'bottom' ? { ...META.pasteBot } : { ...META.pasteTop }
      case 'drill':
        return { ...META.drill }
      case 'outline':
        return { ...META.outline }
      // 'drawing' của whats-that-gerber chỉ có nghĩa "đuôi chung chung" (.gbr/.ger/
      // .gbx/.pho) — KHÔNG phải lớp tài liệu, nên không được ẩn mặc định.
      default:
        break
    }
  }

  return { ...META.unknown }
}

/** Bỏ tiền tố chung của cả bộ file để tên hiển thị không bị trùng nhau. */
export const shortenNames = (filenames: string[]): Record<string, string> => {
  const bases = filenames.map((f) => f.split(/[\\/]/).pop() || f)
  const result: Record<string, string> = {}

  let prefixLen = 0
  if (bases.length > 1) {
    const first = bases[0]
    outer: for (let i = 0; i < first.length; i++) {
      for (const b of bases) {
        if (b.length <= i || b[i].toLowerCase() !== first[i].toLowerCase()) break outer
      }
      prefixLen = i + 1
    }
    // Chỉ cắt tại ranh giới từ để không tạo ra tên vô nghĩa
    while (prefixLen > 0 && !/[-_. ]/.test(first[prefixLen - 1])) prefixLen--
  }

  for (let i = 0; i < filenames.length; i++) {
    const base = bases[i]
    const short = prefixLen > 0 && prefixLen < base.length ? base.slice(prefixLen) : base
    result[filenames[i]] = short.replace(/^[-_. ]+/, '') || base
  }
  return result
}


function detectFileUnits(content: string): 'mm' | 'in' | null {
  if (/%MOMM\*%|G71\*|METRIC/i.test(content)) return 'mm'
  if (/%MOIN\*%|G70\*|INCH/i.test(content)) return 'in'
  return null
}

// Parse OrCAD Aperture List (.lis / .rep / .apt)
function parseApertureList(lisText: string): string[] {
  const aptHeader: string[] = []
  const lines = lisText.split(/\r?\n/)
  for (const line of lines) {
    const match = line.match(/^D(\d+):\s+([\d\.]+)(?:\s*x\s*([\d\.]+))?\s+(ROUND|SQUARE|OBLONG|RECTANGLE)/i)
    if (match) {
      const dCode = match[1]
      const dim1 = match[2]
      const dim2 = match[3]
      const shape = match[4].toUpperCase()

      if (shape === 'ROUND') {
        aptHeader.push(`%ADD${dCode}C,${dim1}*%`)
      } else if (shape === 'SQUARE') {
        aptHeader.push(`%ADD${dCode}R,${dim1}X${dim1}*%`)
      } else if (shape === 'RECTANGLE') {
        aptHeader.push(`%ADD${dCode}R,${dim1}X${dim2 || dim1}*%`)
      } else if (shape === 'OBLONG') {
        aptHeader.push(`%ADD${dCode}O,${dim1}X${dim2 || dim1}*%`)
      }
    }
  }
  return aptHeader
}

// Convert Incremental Coordinates (G91 / %FSLI%) to Absolute Coordinates (G90 / %FSLA%)
function convertIncrementalToAbsolute(content: string): string {
  let curX = 0
  let curY = 0
  const lines = content.split(/\r?\n/)
  const outLines: string[] = []

  for (const rawLine of lines) {
    let line = rawLine.trim()
    if (!line || line.startsWith('G04') || line === 'M02*') {
      outLines.push(line)
      continue
    }

    // Replace %FSLI...% with %FSLAX23Y23*%
    if (line.includes('%FS')) {
      outLines.push(line.replace(/%FS[LT]?I[^\*]*\*%/, '%FSLAX23Y23*%'))
      continue
    }

    if (line.startsWith('%')) {
      outLines.push(line)
      continue
    }

    if (line.endsWith('*')) line = line.slice(0, -1)

    const xMatch = line.match(/X([+-]?\d+)/)
    const yMatch = line.match(/Y([+-]?\d+)/)

    if (xMatch || yMatch) {
      if (xMatch) curX += parseInt(xMatch[1], 10)
      if (yMatch) curY += parseInt(yMatch[1], 10)

      const gMatch = line.match(/^G\d+/)
      const prefix = gMatch ? gMatch[0] : ''
      const suffix = line.replace(/^G\d+/, '').replace(/X[+-]?\d+/, '').replace(/Y[+-]?\d+/, '')

      const absX = (curX >= 0 ? 'X' : 'X-') + Math.abs(curX).toString().padStart(5, '0')
      const absY = (curY >= 0 ? 'Y' : 'Y-') + Math.abs(curY).toString().padStart(5, '0')

      outLines.push(`${prefix}${absX}${absY}${suffix}*`)
    } else {
      outLines.push(`${line}*`)
    }
  }
  return outLines.join('\n')
}

/**
 * Một gói file đã giải nén, tương ứng ĐÚNG MỘT bo.
 * Mỗi archive thả vào là một gói; các file Gerber rời thả cùng lượt gộp thành một gói.
 */
interface InputBundle {
  projectName: string
  /** Tên file archive đã sinh ra gói này — để ghép lại đường dẫn thật ở tầng UI. */
  sourceFile: string
  rawFiles: { name: string; content: string }[]
  orcadLisText: string
  orcadGtdText: string
}

export class GerberParser {
  /**
   * Đọc các file người dùng thả vào, trả về MỘT BO CHO MỖI ARCHIVE.
   *
   * Trước đây mọi file được dồn chung vào một `rawFiles` nên thả hai ZIP ra một bo
   * lẫn lộn, và `projectName` bị archive sau ghi đè. Giờ mỗi ZIP/RAR đứng riêng.
   */
  static async parseInputFiles(files: File[]): Promise<BoardParsedData[]> {
    const bundles = await GerberParser.extractBundles(files)
    const boards: BoardParsedData[] = []
    for (const bundle of bundles) {
      boards.push(await GerberParser.buildBoard(bundle))
    }
    return boards
  }

  private static async extractBundles(files: File[]): Promise<InputBundle[]> {
    const bundles: InputBundle[] = []
    // File Gerber rời thả cùng lượt thì thuộc về cùng một bo.
    const loose: InputBundle = {
      projectName: 'PCB_Project',
      sourceFile: '',
      rawFiles: [],
      orcadLisText: '',
      orcadGtdText: '',
    }

    for (const file of files) {
      let rawFiles: { name: string; content: string }[] = []
      let projectName = 'PCB_Project'
      let orcadLisText = ''
      let orcadGtdText = ''

      const lowerName = file.name.toLowerCase()
      if (lowerName.endsWith('.zip')) {
        projectName = file.name.replace(/\.[^/.]+$/, '')
        const arrayBuffer = await file.arrayBuffer()
        const zip = await JSZip.loadAsync(arrayBuffer)

        // Pre-scan for aperture list / GTD project files
        for (const [entryName, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue
          const lower = entryName.toLowerCase()
          if (lower.endsWith('.lis') || lower.endsWith('.rep') || lower.endsWith('.apt')) {
            orcadLisText = await entry.async('text')
          }
          if (lower.endsWith('.gtd')) {
            orcadGtdText = await entry.async('text')
          }
        }

        for (const [entryName, entry] of Object.entries(zip.files)) {
          if (
            entry.dir ||
            entryName.startsWith('__MACOSX/') ||
            entryName.endsWith('.DS_Store') ||
            entryName.endsWith('.MAX') ||
            entryName.endsWith('.log') ||
            entryName.endsWith('.lis') ||
            entryName.endsWith('.GTD')
          ) {
            continue
          }
          const baseName = entryName.split(/[\\/]/).pop() || entryName
          try {
            const content = await entry.async('text')
            if (content && content.trim().length > 0) {
              rawFiles.push({ name: baseName, content })
            }
          } catch (e) {
            console.warn('Could not read zip entry:', entryName, e)
          }
        }
        bundles.push({ projectName, sourceFile: file.name, rawFiles, orcadLisText, orcadGtdText })
      } else if (lowerName.endsWith('.rar')) {
        projectName = file.name.replace(/\.[^/.]+$/, '')
        const arrayBuffer = await file.arrayBuffer()
        
        try {
          const { createExtractorFromData } = await import('node-unrar-js')
          // Assuming Vite resolves this correctly or user copied it to public
          const wasmUrl = (await import('node-unrar-js/esm/js/unrar.wasm?url')).default
          const wasmBuffer = await fetch(wasmUrl).then(r => r.arrayBuffer())

          const extractor = await createExtractorFromData({
            data: arrayBuffer,
            wasmBinary: wasmBuffer
          })
          
          const extracted = extractor.extract()
          const rarFiles = Array.from(extracted.files)
          
          for (const f of rarFiles) {
            if (f.fileHeader.flags.directory) continue
            const entryName = f.fileHeader.name
            const lower = entryName.toLowerCase()
            
            if (lower.endsWith('.lis') || lower.endsWith('.rep') || lower.endsWith('.apt')) {
              orcadLisText = new TextDecoder('utf-8').decode(f.extraction)
            }
            if (lower.endsWith('.gtd')) {
              orcadGtdText = new TextDecoder('utf-8').decode(f.extraction)
            }
          }
          
          for (const f of rarFiles) {
            if (f.fileHeader.flags.directory) continue
            const entryName = f.fileHeader.name
            if (
              entryName.startsWith('__MACOSX/') ||
              entryName.endsWith('.DS_Store') ||
              entryName.endsWith('.MAX') ||
              entryName.endsWith('.log') ||
              entryName.endsWith('.lis') ||
              entryName.endsWith('.GTD')
            ) {
              continue
            }
            const baseName = entryName.split(/[\\/]/).pop() || entryName
            if (f.extraction && f.extraction.length > 0) {
              const content = new TextDecoder('utf-8').decode(f.extraction)
              rawFiles.push({ name: baseName, content })
            }
          }
          bundles.push({ projectName, sourceFile: file.name, rawFiles, orcadLisText, orcadGtdText })
        } catch (e) {
          console.error('Failed to parse RAR:', e)
          throw new Error('Không thể đọc file RAR. Vui lòng đảm bảo thư viện node-unrar-js được cài đặt đúng cách.')
        }
      } else {
        if (files.length === 1) {
          loose.projectName = file.name.replace(/\.[^/.]+$/, '')
        }
        try {
          const content = await file.text()
          if (content && content.trim().length > 0) {
            loose.rawFiles.push({ name: file.name, content })
          }
        } catch (e) {
          console.warn('Could not read file:', file.name, e)
        }
      }
    }

    if (loose.rawFiles.length > 0) bundles.push(loose)
    if (bundles.length === 0) {
      throw new Error('No valid Gerber or Drill files found in selection.')
    }
    return bundles
  }

  /** Dựng một bo hoàn chỉnh từ một gói file đã giải nén. */
  private static async buildBoard(bundle: InputBundle): Promise<BoardParsedData> {
    const { projectName, sourceFile, orcadLisText, orcadGtdText } = bundle
    let rawFiles = bundle.rawFiles

    // Loại file phụ trợ (report / aperture list / BOM / ảnh…) trước khi phân loại
    // layer — nếu không chúng sẽ nằm trong danh sách layer dưới dạng "Unknown"
    // và luôn render rỗng.
    const allInputNames = rawFiles.map((f) => f.name)
    const ignoredFiles = rawFiles
      .filter((f) => isAuxiliaryFile(f.name, allInputNames))
      .map((f) => f.name)
    rawFiles = rawFiles.filter((f) => !isAuxiliaryFile(f.name, allInputNames))

    // Nhiều archive lồng thư mục → có thể trùng tên cơ sở. Giữ lại tất cả nhưng
    // đảm bảo id là duy nhất (React key + visibleLayers Set dựa vào id này).
    const failedFiles: { name: string; reason: string }[] = []

    if (rawFiles.length === 0) {
      throw new Error('No valid Gerber or Drill files found in selection.')
    }

    // 1. Detect project-wide default units & incremental mode
    let projectUnits: 'mm' | 'in' = 'in'


    if (orcadGtdText.includes('{Metric Yes}')) {
      projectUnits = 'mm'
    } else {
      for (const raw of rawFiles) {
        const detected = detectFileUnits(raw.content)
        if (detected) {
          projectUnits = detected
          break
        }
      }
    }

    // 2. Build OrCAD aperture header if present
    let orcadHeader = ''
    if (orcadLisText) {
      const apertures = parseApertureList(orcadLisText)
      let formatStr = '%FSLAX23Y23*%\n' + (projectUnits === 'mm' ? '%MOMM*%\n' : '%MOIN*%\n')
      if (orcadGtdText.includes('2.4')) {
        formatStr = '%FSLAX24Y24*%\n' + (projectUnits === 'mm' ? '%MOMM*%\n' : '%MOIN*%\n')
      }
      orcadHeader = formatStr + apertures.join('\n') + '\n'
    }

    const parsedLayers: ParsedGerberLayer[] = []
    let globalMinX = Infinity
    let globalMinY = Infinity
    let globalMaxX = -Infinity
    let globalMaxY = -Infinity

    // whats-that-gerber cần cả danh sách tên file mới suy luận đúng EDA đang dùng,
    // nên tính sẵn ở đây thay vì gọi identify() từng file một.
    const allNames = rawFiles.map((f) => f.name)
    const shortNames = shortenNames(allNames)
    const usedIds = new Set<string>()

    for (let fileIndex = 0; fileIndex < rawFiles.length; fileIndex++) {
      const raw = rawFiles[fileIndex]
      try {
        const meta = matchLayer(raw.name, allNames, raw.content)
        let fileContent = raw.content

        // Skip incremental logic completely for drill files
        const isDrillFile = meta.type === 'drill'

        if (isDrillFile) {
          // Để nguyên Excellon: parser của web-gerber đọc thẳng định dạng này và cho
          // toạ độ chính xác hơn convertExcellonToGerber (hàm đó viết cho tracespace,
          // đưa qua nó thì lỗ khoan KiCad lệch hẳn ra ngoài bo).
          //
          // Ngoại lệ: Excellon METRIC không khai báo số chữ số thập phân. Chuẩn metric
          // là 3.3 nhưng parser áp mặc định của hệ inch (2.4), nên toạ độ co lại 10 lần
          // và cả cụm lỗ dồn vào một góc bo (thấy ở bản xuất Proteus: X+54500 phải là
          // 54.500 mm chứ không phải 5.4500). Tự chèn dấu thập phân theo 3.3.
          // Chỉ đụng khi CHẮC CHẮN mơ hồ: metric, chưa có dấu chấm, chưa khai báo format.
          const coordLines = fileContent.match(/^[XY][^\n]*/gm) || []
          const ambiguousMetric =
            /^\s*METRIC/im.test(fileContent) &&
            coordLines.length > 0 &&
            !coordLines.some((l) => l.includes('.')) &&
            !/FILE_FORMAT|;\s*FORMAT/i.test(fileContent)

          if (ambiguousMetric) {
            fileContent = fileContent.replace(
              /([XY])([+-]?)(\d+)(?=\D|$)/g,
              (whole, axis, sign, digits) => {
                if (digits.length > 6) return whole
                const padded = digits.padStart(6, '0')
                return axis + sign + padded.slice(0, 3) + '.' + padded.slice(3)
              }
            )
          }
        } else {
          // Check if file is incremental natively
          const isFileIncremental = /%FS[LT]?I/i.test(fileContent)
          if (isFileIncremental) {
            fileContent = convertIncrementalToAbsolute(fileContent)
          }

          if (!fileContent.includes('%FS')) {
            if (orcadHeader) {
              fileContent = orcadHeader + fileContent
            } else {
              const unitHeader = projectUnits === 'mm' ? '%FSLAX24Y24*%\n%MOMM*%\n' : '%FSLAX24Y24*%\n%MOIN*%\n'
              fileContent = unitHeader + fileContent
            }
          }
        }

        // KHÔNG ghi fileContent ngược lại raw.content. Viewer parse lại từ rawFiles và
        // web-gerber đọc Excellon gốc chuẩn hơn convertExcellonToGerber ở đây — ghi đè
        // làm lỗ khoan KiCad văng ra ngoài bo.
        // Dùng parser/plotter của web-gerber. @tracespace/plotter@5-alpha crash
        // (`t.variableValues` undefined) ngay khi file có aperture macro %AM — mà
        // KiCad dùng macro RoundRect/RotRect cho mọi pad, nên toàn bộ lớp
        // copper/mask/silk của bo KiCad đều không đọc được.
        // Một số CAD xuất định nghĩa aperture có dấu cách sau dấu phẩy
        // ("%ADD10C, 0.20*%"). Chuẩn Gerber không cho phép, và parser bỏ qua luôn
        // aperture đó -> mọi lệnh flash D03 dùng nó biến mất. Thực đo trên bo VOL LED:
        // copper_top từ 0 lên 528 hình sau khi bỏ dấu cách.
        fileContent = fileContent.replace(/(%ADD\d+[A-Za-z]*),[ \t]+/g, '$1,')

        const isOutline = meta.type === 'outline'
        const parser = createParser()
        parser.feed(fileContent)
        const plotted = plot(parser.result(), isOutline)
        const imageTree = flattenArcs(isOutline ? stitchOutline(plotted) : plotted)

        let size: [number, number, number, number] = [0, 0, 0, 0]
        if (imageTree.size && imageTree.size.length === 4) {
          size = [
            imageTree.size[0],
            imageTree.size[1],
            imageTree.size[2],
            imageTree.size[3],
          ]

          // Only expand core board bounds for PCB circuit layers (Top/Bot Copper, Silk, SMB, Drill, Outline)
          const layerW = size[2] - size[0]
          const layerH = size[3] - size[1]
          if (layerW > 0.1 || layerH > 0.1) {
            if (
              meta.type === 'copper' ||
              meta.type === 'silkscreen' ||
              meta.type === 'outline' ||
              (meta.type === 'soldermask' && layerW < 250) ||
              (meta.type === 'drill' && meta.displayName === 'Drl')
            ) {
              const scale = imageTree.units === 'in' ? 25.4 : 1;
              globalMinX = Math.min(globalMinX, size[0] * scale)
              globalMinY = Math.min(globalMinY, size[1] * scale)
              globalMaxX = Math.max(globalMaxX, size[2] * scale)
              globalMaxY = Math.max(globalMaxY, size[3] * scale)
            }
          }
        }
        let outlineMaxStroke = 0
        if (meta.type === 'outline' && imageTree.children) {
          for (const child of imageTree.children) {
            if (child.type === 'imagePath' && typeof child.width === 'number') {
              outlineMaxStroke = Math.max(outlineMaxStroke, child.width)
            }
          }
        }

        // id phải là duy nhất: archive nhiều thư mục con có thể chứa file trùng tên,
        // nếu id trùng thì bật/tắt một lớp sẽ bật/tắt luôn lớp kia.
        let id = raw.name
        if (usedIds.has(id)) id = `${raw.name}#${fileIndex}`
        usedIds.add(id)

        const shortName = shortNames[raw.name] || raw.name

        parsedLayers.push({
          id,
          filename: raw.name,
          shortName,
          displayName:
            meta.type === 'unknown' ? shortName.replace(/\.[^.]+$/, '') || meta.displayName : meta.displayName,
          type: meta.type,
          side: meta.side,
          color: meta.color,
          order: meta.order,
          // Chỉ ẩn mặc định lớp tài liệu (drill drawing/guide, fab, assembly…).
          // Lớp 'unknown' vẫn hiện — trước đây whats-that-gerber trả 'drawing' cho
          // mọi đuôi chung chung (.gbr/.ger/.pho) khiến lớp thật bị ẩn im lặng.
          visible: meta.type !== 'documentation',
          size,
          units: imageTree.units || 'mm',
          outlineMaxStroke,
          imageTree,
          holeCount: isDrillFile ? (fileContent.match(/^X/gm) || []).length : 0,
        })
      } catch (err: any) {
        // Không nuốt lỗi im lặng: người dùng cần biết lớp nào bị mất và vì sao.
        console.warn(`Skipping unparseable file: ${raw.name}`, err)
        failedFiles.push({ name: raw.name, reason: err?.message || String(err) })
      }
    }

    if (parsedLayers.length === 0) {
      throw new Error('Could not parse any valid Gerber layers from the provided files.')
    }

    // Sort layers by CAD stackup order
    parsedLayers.sort((a, b) => a.order - b.order)

    let widthMM = 0
    let heightMM = 0

    // --- DIMENSION & BOUNDING BOX EXTRACTION ---
    // Priority 1: Dedicated Outline layer (.GKO, .GM1, Edge_Cuts, OUTLINE.gbr, .BOR, .DIM)
    const outlineLayers = parsedLayers.filter((l) => l.type === 'outline')
    let outlineLayer = undefined;
    if (outlineLayers.length > 0) {
      // Pick the outline layer with the largest bounding box area
      outlineLayer = outlineLayers.reduce((prev, current) => {
        const prevArea = (prev.size[2] - prev.size[0]) * (prev.size[3] - prev.size[1])
        const currArea = (current.size[2] - current.size[0]) * (current.size[3] - current.size[1])
        return currArea > prevArea ? current : prev
      })
    }
    
    if (
      outlineLayer &&
      outlineLayer.size[2] > outlineLayer.size[0] &&
      outlineLayer.size[3] > outlineLayer.size[1]
    ) {
      // Find maximum stroke width used in the outline drawing to extract the center line
      const maxStroke = outlineLayer.outlineMaxStroke || 0
      const scale = outlineLayer.units === 'in' ? 25.4 : 1
      globalMinX = (outlineLayer.size[0] + maxStroke / 2) * scale
      globalMinY = (outlineLayer.size[1] + maxStroke / 2) * scale
      globalMaxX = (outlineLayer.size[2] - maxStroke / 2) * scale
      globalMaxY = (outlineLayer.size[3] - maxStroke / 2) * scale
    } else {
      // Priority 2: Union of Copper layers ONLY (ignores Silk/Mask artifacts outside the board)
      const copperLayersForBounds = parsedLayers.filter((l) => l.type === 'copper')
      if (copperLayersForBounds.length > 0) {
        globalMinX = Infinity
        globalMinY = Infinity
        globalMaxX = -Infinity
        globalMaxY = -Infinity
        for (const l of copperLayersForBounds) {
          const scale = l.units === 'in' ? 25.4 : 1
          globalMinX = Math.min(globalMinX, l.size[0] * scale)
          globalMinY = Math.min(globalMinY, l.size[1] * scale)
          globalMaxX = Math.max(globalMaxX, l.size[2] * scale)
          globalMaxY = Math.max(globalMaxY, l.size[3] * scale)
        }
      }
    }

    if (globalMinX !== Infinity && globalMaxX !== -Infinity) {
      widthMM = Math.max(0.1, globalMaxX - globalMinX)
      heightMM = Math.max(0.1, globalMaxY - globalMinY)
    } else {
      globalMinX = 0
      globalMinY = 0
      globalMaxX = 100
      globalMaxY = 100
      widthMM = 100
      heightMM = 100
    }

    const copperLayers = parsedLayers.filter((l) => l.type === 'copper')
    const drillLayers = parsedLayers.filter((l) => l.type === 'drill')

    return {
      projectName,
      sourceFile,
      layers: parsedLayers,
      bounds: {
        minX: globalMinX,
        minY: globalMinY,
        maxX: globalMaxX,
        maxY: globalMaxY,
        widthMM: Number(widthMM.toFixed(2)),
        heightMM: Number(heightMM.toFixed(2)),
      },
      layerCount: Math.max(copperLayers.length, 2),
      drillCount: drillLayers.length,
      ignoredFiles,
      failedFiles,
    }
  }
}
