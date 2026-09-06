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
}

export interface RawGerberFile {
  name: string
  content: string
}

export interface BoardParsedData {
  projectName: string
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
  rawFiles: RawGerberFile[]
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
  /\.(apr|apr_lib|extrep|rul|rep|drr|ldp|ipc|cam|dri|gpi|lis|apt|gtd|gbrjob|rpt|log|max|csv|tsv|xls|xlsx|pdf|doc|docx|htm|html|md|ini|cfg|json|xml|bak|db|zip|rar|7z|jpe?g|png|gif|bmp|svg|step|stp|iges|igs|dwg|dxf)$/i

const AUXILIARY_NAME = /\b(bom|pick[-_ ]?(and[-_ ]?)?place|pnp|readme|report|status|netlist|aperture)\b/i

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
  drill: { type: 'drill', side: 'all', displayName: 'Drl', color: '#000000', order: 9 },
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

export const matchLayer = (filename: string, allFilenames?: string[]): LayerMeta => {
  const ext = getExt(filename)
  const norm = normalizeName(filename)

  // ---- 1. Đuôi file chuẩn -------------------------------------------------
  const byExt = EXT_MAP[ext]
  if (byExt) return { ...byExt }

  // OrCAD/Allegro dùng chung đuôi .art cho mọi lớp, ý nghĩa nằm ở tên file. Các rule
  // từ khoá bên dưới lo được SOLDERMASK_TOP/SILKSCREEN_TOP/PASTEMASK_TOP; riêng
  // TOP.art / BOTTOM.art chỉ có mỗi tên mặt bo nên ngầm hiểu là lớp đồng.
  if (ext === 'art' && /^(top|bottom|bot)$/.test(norm)) {
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

  if (has(/\b(drill|drl|excellon|npth|pth|holes|thruhole)\b/) && !has(/\b(drawing|guide|map|report)\b/)) {
    return { ...META.drill }
  }
  if (has(/\b(top|t|f|front)\s*(solder\s*)?paste\b|\bpaste\s*(mask\s*)?(top|t|f|front)\b/)) return { ...META.pasteTop }
  if (has(/\b(bot|bottom|b|back)\s*(solder\s*)?paste\b|\bpaste\s*(mask\s*)?(bot|bottom|b|back)\b/)) return { ...META.pasteBot }

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

// Convert Excellon Tap/Drl to Gerber RS-274X Flashes
function convertExcellonToGerber(text: string, projectUnits: 'mm' | 'in'): string {
  const lines = text.split(/\r?\n/)
  const isMetric = /METRIC/i.test(text) || projectUnits === 'mm'
  const units = isMetric ? '%MOMM*%' : '%MOIN*%'

  const tools = new Map<number, { dCode: number; diameter: number }>()
  const bodyCommands: string[] = []
  
  let curXStr = "0"
  let curYStr = "0"
  let intDigits = isMetric ? 3 : 2

  for (const dLine of lines) {
    const lineTrim = dLine.trim()
    if (!lineTrim || lineTrim === '%' || lineTrim === 'M48' || lineTrim === 'M30' || lineTrim === 'G90') continue

    // Parse FILE_FORMAT if present (e.g., ;FILE_FORMAT=4:4 or ;FILE_FORMAT=2:5)
    const fmtMatch = lineTrim.match(/;FILE_FORMAT=(\d+):(\d+)/i)
    if (fmtMatch) {
      intDigits = parseInt(fmtMatch[1], 10)
      continue
    }

    // Tool Definition: T3C0.039F200S100 or T1F00S00C0.01181
    const defMatch = lineTrim.match(/^T(\d+).*?C([0-9\.]+)/i)
    if (defMatch) {
      const tNum = parseInt(defMatch[1], 10)
      const diameter = parseFloat(defMatch[2])
      const dCode = 10 + tNum
      tools.set(tNum, { dCode, diameter })
      continue
    }

    const toolMatch = lineTrim.match(/^T(\d+)$/i)
    if (toolMatch) {
      const tNum = parseInt(toolMatch[1], 10)
      const toolInfo = tools.get(tNum)
      if (toolInfo) {
        bodyCommands.push(`D${toolInfo.dCode}*`)
      }
      continue
    }

    // Coordinate drill: X002300Y-022000
    if (lineTrim.startsWith('X') || lineTrim.startsWith('Y')) {
      let xStr = curXStr
      let yStr = curYStr
      let matched = false
      const xMatch = lineTrim.match(/X([+-]?\d+)/i)
      if (xMatch) {
        xStr = xMatch[1]
        matched = true
      }
      const yMatch = lineTrim.match(/Y([+-]?\d+)/i)
      if (yMatch) {
        yStr = yMatch[1]
        matched = true
      }

      if (matched) {
        curXStr = xStr
        curYStr = yStr
        
        let parseCoord = (str: string) => {
           let sign = 1
           if (str.startsWith('-')) { sign = -1; str = str.substring(1) }
           else if (str.startsWith('+')) { str = str.substring(1) }
           
           if (str.includes('.')) return parseFloat(str) * sign
           
           // If no decimal point, assume 2 digits integer, rest is fraction (Altium 2:5 format)
           if (str.length >= intDigits) {
             const intPart = str.substring(0, intDigits)
             const fracPart = str.substring(intDigits)
             return parseFloat(intPart + '.' + fracPart) * sign
           }
           // Fallback if shorter than intDigits (e.g. '0' or '1')
           return parseFloat(str) * sign
           return parseFloat(str) * sign
        }

        let mx = parseCoord(xStr)
        let my = parseCoord(yStr)
        
        let formattedX = Math.round(mx * 10000).toString().padStart(6, '0')
        let formattedY = Math.round(my * 10000).toString().padStart(6, '0')
        bodyCommands.push(`X${formattedX}Y${formattedY}D03*`)
      }
      continue
    }
    
    const repMatch = lineTrim.match(/^R(\d+)(?:X([+-]?\d+))?(?:Y([+-]?\d+))?$/i)
    if (repMatch) {
      const count = parseInt(repMatch[1], 10)
      
      let parseCoord = (str: string) => {
         let sign = 1
         if (str.startsWith('-')) { sign = -1; str = str.substring(1) }
         else if (str.startsWith('+')) { str = str.substring(1) }
         if (str.includes('.')) return parseFloat(str) * sign
         if (str.length >= intDigits) {
             const intPart = str.substring(0, intDigits)
             const fracPart = str.substring(intDigits)
             return parseFloat(intPart + '.' + fracPart) * sign
           }
           // Fallback if shorter than intDigits (e.g. '0' or '1')
           return parseFloat(str) * sign
         return parseFloat(str) * sign
      }

      const dx = repMatch[2] ? parseCoord(repMatch[2]) : 0
      const dy = repMatch[3] ? parseCoord(repMatch[3]) : 0
      
      let tempX = parseCoord(curXStr)
      let tempY = parseCoord(curYStr)
      for (let i = 0; i < count; i++) {
        tempX += dx
        tempY += dy
        let formattedX = Math.round(tempX * 10000).toString().padStart(6, '0')
        let formattedY = Math.round(tempY * 10000).toString().padStart(6, '0')
        bodyCommands.push(`X${formattedX}Y${formattedY}D03*`)
      }
      
      let formatBack = (num: number) => {
         let s = Math.abs(num).toFixed(5).replace('.', '')
         if (num < 0) s = '-' + s
         return s
      }
      curXStr = formatBack(tempX)
      curYStr = formatBack(tempY)
      continue
    }
  }
  if (tools.size === 0 && bodyCommands.length === 0) return text
  
  const toolDefs = Array.from(tools.values())
    .map((t) => `%ADD${t.dCode}C,${t.diameter}*%`)
    .join('\n')

  return `${units}\n%FSLAX24Y24*%\n${toolDefs}\n${bodyCommands.join('\n')}\nM02*\n`
}

export class GerberParser {
  static async parseInputFiles(files: File[]): Promise<BoardParsedData> {
    let rawFiles: { name: string; content: string }[] = []
    let projectName = 'PCB_Project'
    let orcadLisText = ''
    let orcadGtdText = ''

    for (const file of files) {
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
        } catch (e) {
          console.error('Failed to parse RAR:', e)
          throw new Error('Không thể đọc file RAR. Vui lòng đảm bảo thư viện node-unrar-js được cài đặt đúng cách.')
        }
      } else {
        if (files.length === 1) {
          projectName = file.name.replace(/\.[^/.]+$/, '')
        }
        try {
          const content = await file.text()
          if (content && content.trim().length > 0) {
            rawFiles.push({ name: file.name, content })
          }
        } catch (e) {
          console.warn('Could not read file:', file.name, e)
        }
      }
    }

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
        const meta = matchLayer(raw.name, allNames)
        let fileContent = raw.content

        // Skip incremental logic completely for drill files
        const isDrillFile = meta.type === 'drill'

        if (isDrillFile) {
          if (!fileContent.includes('%FS') && !fileContent.includes('%MO')) {
            fileContent = convertExcellonToGerber(fileContent, projectUnits)
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
        const parser = createParser()
        parser.feed(fileContent)
        const imageTree = plot(parser.result(), meta.type === 'outline')

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
          outlineMaxStroke
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
      rawFiles,
      ignoredFiles,
      failedFiles,
    }
  }
}
