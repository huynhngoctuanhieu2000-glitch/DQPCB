/**
 * Nhận diện file: file nào là lớp gì, mặt nào, file nào là rác/phụ trợ, file khoan
 * nào là lỗ mạ hay không mạ.
 *
 * Nguồn nhận diện, theo thứ tự tin cậy — mỗi hàm bên dưới có thẻ ghi rõ của ai:
 *   [DQPCB]                    luật tự viết của DQPCB
 *   [whats-that-gerber]      thư viện ngoài, chỉ dùng làm phương án cuối trong matchLayer
 */
import identify from 'whats-that-gerber'
import type { LayerMeta } from './types'

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


// [DQPCB] Lọc file phụ trợ/rác.
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

/**
 * File dự án KiCad hay bị nén kèm khi khách gửi nguyên thư mục. `fp-info-cache` không có
 * đuôi nên lọt qua mọi luật đuôi file, rơi xuống parser Gerber — 4 MB văn bản thường
 * đem parse như Gerber làm treo cả app (gặp ở nhiều bộ KiCad khách nén nguyên thư mục).
 */
const KICAD_PROJECT_FILE =
  /^(fp-info-cache|fp-lib-table|sym-lib-table)$|\.(kicad_(pcb|sch|pro|prl|mod|sym|dru|wks)|kicad_pcb-bak|lck)$/i

/** File không chứa dữ liệu Gerber/Excellon → bỏ hẳn, không parse, không hiển thị. */
export const isAuxiliaryFile = (filename: string, allFilenames?: string[]): boolean => {
  const base = filename.split(/[\\/]/).pop() || filename
  if (/\.(stp|sbt)$/i.test(base) && looksLikeDipTrace(allFilenames)) return false
  if (KICAD_PROJECT_FILE.test(base)) return true
  if (AUXILIARY_EXT.test(base)) return true
  // .txt vừa có thể là NC-Drill (Altium) vừa là file ghi chú → chỉ loại khi tên rõ ràng là tài liệu
  if (/\.txt$/i.test(base) && AUXILIARY_NAME.test(base)) return true
  return false
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

/** [DQPCB] Bảng meta (tên, màu, thứ tự vẽ) cho từng loại lớp. */
export const META: Record<string, LayerMeta> = {
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
/** [DQPCB] Nhận diện theo đuôi file của từng EDA. */
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
/** [DQPCB] Mã lớp CAM350 ghi trong header file ("G04 Layer 6: drd.gbx"). */
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

/**
 * Gerber X2: file tự khai báo chức năng bằng thuộc tính chuẩn `%TF.FileFunction,…*%`
 * ngay trong header. KiCad, Altium, Proteus, EasyEDA bản mới đều ghi. Excellon của
 * KiCad cũng ghi dưới dạng chú thích `; #@! TF.FileFunction,…`.
 *
 * Đây là nguồn đáng tin nhất sau mã lớp CAM, vì tên file thì ai muốn đặt sao cũng
 * được. Bộ xuất Proteus (CADCAM) là ví dụ: tên "Mechanical 1.GBR" nghe như viền bo
 * nhưng X2 nói nó là NonPlated (NPTH, ở đây còn rỗng); "Drill TOP-BOT Plated.GBR"
 * nghe như bản vẽ khoan nhưng X2 nói nó là DỮ LIỆU khoan PTH, và bộ đó không có
 * file Excellon nào khác. Đoán theo tên thì sai cả hai: mất viền bo, mất hết lỗ khoan.
 *
 * Chỉ quyết định với những chức năng không thể hiểu sai. `Other`, `AssemblyDrawing`,
 * `Component`… trả undefined để rơi xuống luật tên/đuôi file — Altium ghi lớp cơ khí
 * là `Other,…` trong khi .GM1 của nó chính là viền bo, gán cứng thành tài liệu thì
 * ẩn mất viền bo của cả loạt bo Altium.
 */
/** [DQPCB] Đọc thuộc tính Gerber X2 %TF.FileFunction mà file tự khai. */
const X2_FILE_FUNCTION = /(?:%TF\.FileFunction|#@!\s*TF\.FileFunction),([^*%\r\n]+)/i

const readX2FileFunction = (content?: string): LayerMeta | undefined => {
  if (!content) return undefined
  const m = content.slice(0, 4000).match(X2_FILE_FUNCTION)
  if (!m) return undefined
  const [fn, ...args] = m[1].split(',').map((s) => s.trim())
  const side = (args.find((a) => /^(top|bot|inr)$/i.test(a)) ?? '').toLowerCase()

  switch (fn.toLowerCase()) {
    case 'copper': {
      if (side === 'top') return { ...META.copperTop }
      if (side === 'bot') return { ...META.copperBot }
      if (side !== 'inr') return undefined // X2 thiếu mặt ("Copper,Signal") — không đoán
      // L2 là lớp giữa đầu tiên — đánh số trừ 1 cho khớp quy ước .G1 = Inner 1.
      const n = parseInt(args[0]?.replace(/^L/i, '') ?? '', 10)
      return Number.isFinite(n) && n > 1
        ? { ...META.copperInner, displayName: `Inner ${n - 1}` }
        : { ...META.copperInner }
    }
    case 'soldermask':
      return side === 'bot' ? { ...META.maskBot } : { ...META.maskTop }
    case 'legend':
      return side === 'bot' ? { ...META.silkBot } : { ...META.silkTop }
    case 'paste':
      return side === 'bot' ? { ...META.pasteBot } : { ...META.pasteTop }
    case 'profile':
      return { ...META.outline }
    // Dữ liệu khoan — kể cả khi mang đuôi .GBR như bộ Proteus.
    case 'plated':
    case 'nonplated':
    case 'mixedplating':
      // Proteus xuất "… Slot.GBR" khai là NonPlated nhưng bên trong là chính đường
      // viền bo (mọi aperture đều là Profile, nội dung trùng khít Mechanical 1) — đường
      // phay cắt bo, không phải lỗ. Coi là khoan thì cả viền bị vẽ thành lỗ trắng.
      if (isProfileOnly(content)) return { ...META.outline }
      return { ...META.drill }
    case 'drillmap':
      return { ...META.doc, displayName: 'Drill Drawing' }
    case 'vcut':
    case 'vcutmap':
      return { ...META.doc, displayName: 'V-Cut' }
    case 'other':
      // `Other,…` tự nó không nói lên gì, nhưng nếu mọi nét vẽ đều khai là Profile thì
      // đó là viền bo: Pulsonix/DesignSpark xuất "(Board).gbr" = `Other,Board` toàn
      // Profile. Không nhận ra thì kích thước phải đoán từ lớp đồng — một bo Pulsonix ra 74×23
      // trong khi viền thật là 80×29.
      //
      // CHỈ áp cho Other. Bản vẽ lắp ráp của mặt không có linh kiện cũng chỉ còn mỗi
      // đường viền (toàn Profile), nhưng nó vẫn là tài liệu — gán thành viền thì danh
      // sách lớp hiện ba "Outline" chồng lên nhau.
      return isProfileOnly(content) ? { ...META.outline } : undefined
    default:
      return undefined
  }
}

/**
 * File chỉ vẽ hình dạng bo — X2 `%TA.AperFunction` toàn là Profile (viền ngoài) và
 * CutOut (khoét bên trong bo), có ít nhất một Profile. Proteus xuất loại này dưới tên
 * "Slot.GBR" hoặc "Profile.GBR" nhưng khai FileFunction là NonPlated.
 */
const isProfileOnly = (content: string) => {
  // Pulsonix/DesignSpark ghi thuộc tính dạng chú thích: "G04 #@! TA.AperFunction,Profile*".
  const fns = [...content.matchAll(/(?:%|#@!\s*)TA\.AperFunction,([A-Za-z]+)/g)].map((m) => m[1].toLowerCase())
  return fns.includes('profile') && fns.every((f) => f === 'profile' || f === 'cutout')
}

/**
 * File khoan này là phần nào: chỉ lỗ mạ, chỉ lỗ không mạ, hay đã gộp cả hai. Viewer cần
 * biết để quyết định vẽ một file gộp hay vẽ TẤT CẢ file tách — trước chỉ đoán theo
 * đuôi "-PTH.drl"/"-NPTH.drl" của KiCad nên bộ Proteus ("Drill TOP-BOT Plated.GBR" +
 * "… NonPlated.GBR") bị coi là hai file gộp và chỉ vẽ file nhiều lỗ hơn, mất lỗ NPTH.
 *
 * Ba nguồn, theo độ tin cậy giảm dần:
 *   1. X2 FileFunction (Plated/NonPlated/MixedPlating).
 *   2. Chú thích ";TYPE=PLATED" / ";TYPE=NON_PLATED" trong header Excellon — EasyEDA và
 *      Altium ghi kiểu này, không có X2.
 *   3. Tên file. Phải tách token rồi so khớp cả từ, KHÔNG dùng /-(N?PTH)\.\w+$/: đuôi đó
 *      chỉ khớp đúng kiểu KiCad "…-NPTH.drl", còn "Drill_NPTH_Through.DRL" (EasyEDA) thì
 *      trượt, cả bộ ba PTH/NPTH/Via đều bị coi là file gộp và chỉ file đông lỗ nhất được
 *      vẽ — mất sạch lỗ không mạ lẫn lỗ via. So khớp cả từ để "DEPTH" không hoá thành PTH.
 */
export const drillPlatingOf = (
  filename: string,
  content?: string
): 'PTH' | 'NPTH' | 'mixed' | undefined => {
  const head = content?.slice(0, 4000)
  const fn = head?.match(X2_FILE_FUNCTION)?.[1].split(',')[0].trim().toLowerCase()
  if (fn === 'plated') return 'PTH'
  if (fn === 'nonplated') return 'NPTH'
  if (fn === 'mixedplating') return 'mixed'

  // Altium ghi CẢ HAI mục ";TYPE=PLATED" và ";TYPE=NON_PLATED" vào mọi file, mỗi mục kèm
  // các mũi khoan thuộc nó — mục rỗng thì không có mũi nào. Phải xem mục nào có mũi thật:
  // bo "AGVH7" (Vu Bao, 21/09/2026) có RoundHoles.TXT chứa cả lỗ mạ lẫn lỗ Ø3.2 không
  // mạ, trước bị gán PTH vì chỉ đọc dòng ;TYPE= đầu tiên.
  const used = new Set<string>()
  let first: string | undefined
  let current: string | undefined
  for (const line of (head ?? '').split(/\r?\n/)) {
    if (/^\s*%/.test(line)) break // hết header
    const t = line.match(/^\s*;\s*TYPE\s*=\s*([A-Z_ ]+)/i)?.[1].replace(/[^A-Z]/gi, '').toUpperCase()
    if (t) {
      current = t
      first ??= t
    } else if (current && /^T\d+.*C[\d.]+/i.test(line.trim())) {
      used.add(current)
    }
  }
  if (used.has('PLATED') && used.has('NONPLATED')) return 'mixed'
  const type = used.size === 1 ? [...used][0] : first
  if (type === 'NONPLATED') return 'NPTH'
  if (type === 'PLATED') return 'PTH'

  const tokens = normalizeName(filename).split(' ')
  if (tokens.includes('npth') || tokens.includes('nonplated')) return 'NPTH'
  if (tokens.includes('pth')) return 'PTH'
  return undefined
}

/**
 * Nội dung có dáng Gerber hoặc Excellon không. Chỉ dùng cho file KHÔNG nhận ra được lớp:
 * trượt cả bài này nghĩa là file rác (cache, ghi chú, bản sao lưu…), đem parse chỉ tốn
 * thời gian — có khi treo hẳn — mà không vẽ ra gì. Để lỏng tay: OrCAD bỏ trống header
 * nhưng vẫn có lệnh D01/D02/D03; Excellon không có M48 vẫn có dòng T01/X…Y….
 */
/** [DQPCB] */
export const looksLikeCamData = (content: string) => {
  const head = content.slice(0, 20000)
  return (
    /%FS|%MO|%AD|^G0?4|D0?[123]\*/m.test(head) || // Gerber
    /^M48|^T\d+(C[\d.]+)?\s*$|^[XY][-+]?\d/m.test(head) // Excellon
  )
}

/** File khoan dạng Gerber (X2 Plated/NonPlated) chứ không phải Excellon. */
/** [DQPCB] */
export const isGerberContent = (content: string) => /%FS[LT]?[AI]?X\d/i.test(content.slice(0, 4000))

/**
 * [DQPCB] File khoan này chỉ là MỘT PHẦN của bộ khoan — phải vẽ kèm các file còn lại —
 * hay là file gộp đủ mọi lỗ (khi có file gộp thì các file tách thường là bản trùng).
 *
 * Phần theo mạ: PTH / NPTH (X2, ;TYPE=, hoặc đuôi -PTH/-NPTH của KiCad).
 * Phần theo HÌNH LỖ: Altium tách RoundHoles / SlotHoles / RectHoles / SquareHoles.
 * RoundHoles có thể chứa cả lỗ mạ lẫn không mạ (mixed) nhưng vẫn KHÔNG phải file gộp —
 * coi nó là gộp thì viewer chỉ vẽ nó và bỏ mất lỗ slot (bo "AGVH7").
 */
export const isPartialDrillFile = (filename: string, plating?: 'PTH' | 'NPTH' | 'mixed') =>
  plating === 'PTH' ||
  plating === 'NPTH' ||
  /-(N?PTH)\.\w+$/i.test(filename) ||
  // Cả từ: "SlotHoles", "-RectHoles", "squareholes.drl", hay chỉ "Slot.txt" (bộ Dung Nguyen
  // "Rail mtfc_sdkd_main": Drl.txt + Slot.txt). "Rectifier.drl" thì không.
  /(^|[^a-z])(round|slot|rect|square)s?(holes?)?([^a-z]|$)/i.test(filename.split(/[\\/]/).pop() ?? filename)

/**
 * Đếm lỗ khoan. Gerber (bộ Proteus): mỗi lệnh flash D03 là một lỗ, cộng các lỗ oval/rãnh
 * phay vẽ bằng D02 → D01. Excellon: xem countExcellonHoles.
 */
export const countHoles = (content: string): number => {
  if (!isGerberContent(content)) return countExcellonHoles(content)
  let holes = 0
  let inSlot = false
  // Tách theo dấu kết thúc lệnh '*'. Bỏ qua khối %…% (header, aperture) vì D10+ ở đó
  // là định nghĩa aperture chứ không phải lệnh vẽ.
  for (const cmd of content.replace(/%[^%]*%/g, '').split('*')) {
    const op = cmd.match(/D0?([123])\s*$/)?.[1]
    if (op === '3') {
      holes++
      inSlot = false
    } else if (op === '2') {
      inSlot = false
    } else if (op === '1' && !inSlot) {
      // Một chuỗi D01 liền nhau sau một D02 là MỘT rãnh, không phải nhiều lỗ.
      holes++
      inSlot = true
    }
  }
  return holes
}

export const matchLayer = (
  filename: string,
  allFilenames?: string[],
  content?: string
): LayerMeta => {
  const ext = getExt(filename)
  const norm = normalizeName(filename)

  // ---- 0. Mã lớp do chính file khai báo ----------------------- [DQPCB] ---
  // Đáng tin nhất: file tự nói nó là lớp gì, không phụ thuộc người đặt tên.
  const camCode = readCamLayerCode(content)
  if (camCode && CAM_LAYER_CODES[camCode]) return { ...CAM_LAYER_CODES[camCode]! }

  // Thuộc tính chuẩn Gerber X2 — cũng do chính file khai báo.
  const x2 = readX2FileFunction(content)
  if (x2) return x2

  // ---- 1. Đuôi file chuẩn ------------------------------------- [DQPCB] ---
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
  // CAM350/OrCAD đặt tên lớp bằng mã ba chữ rồi gắn đuôi .gbr chung: SMT/SMB là mask,
  // SST/SSB là in lụa (bo "3W NHUA XANH": TOP.gbr, BOT.gbr, SMT.gbr, SST.gbr…). Bảng đuôi
  // đã biết .smt/.sst nhưng ở đây mã nằm ở TÊN, nên phải bắt riêng. Chỉ nhận khi cả tên
  // là đúng mã đó — "Top SMT Paste" của Proteus không lẫn vào.
  if (norm === 'smt' || norm === 'smtop') return { ...META.maskTop }
  if (norm === 'smb' || norm === 'smbot') return { ...META.maskBot }
  if (norm === 'sst' || norm === 'sstop') return { ...META.silkTop }
  if (norm === 'ssb' || norm === 'ssbot') return { ...META.silkBot }

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

  // ---- 3. whats-that-gerber ------------ [thư viện ngoài: whats-that-gerber] ---
  // Chỉ tới được đây khi mọi luật [DQPCB] ở trên đều không khớp.
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
/** [DQPCB] */
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

/**
 * [DQPCB] Đếm lỗ Excellon.
 *
 * Khoan thường: mỗi dòng toạ độ (X…/Y…) là một lỗ; G85 (slot một dòng) cũng một dòng.
 * Phay (route): Altium xuất slot và lỗ chữ nhật bằng G00 tới điểm đầu → M15 hạ dao →
 * G01 chạy → M16 nhấc dao. Mỗi lần hạ dao là MỘT lỗ; các dòng G00/G01 là di chuyển.
 * Trước chỉ đếm dòng bắt đầu bằng X nên SlotHoles.TXT ra 0 lỗ và bị bỏ qua hẳn — bo
 * "AGVH7" mất 6 lỗ slot, bộ "BAI111" mất lỗ RectHoles.
 */
export const countExcellonHoles = (content: string): number => {
  let holes = 0
  let routing = false // đang ở chế độ phay (sau G00), dòng toạ độ chỉ là di chuyển
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim().toUpperCase()
    if (!line || line.startsWith(';')) continue
    if (/^G0?0(?!\d)/.test(line)) routing = true
    else if (/^G0?5(?!\d)/.test(line)) routing = false // G05: về chế độ khoan
    if (/^M15\b/.test(line)) holes++
    else if (!routing && /^[XY][-+]?\d/.test(line)) holes++
  }
  return holes
}
