/**
 * Điểm vào: giải nén ZIP/RAR, gom file thành từng bo, nhận diện và plot từng lớp.
 *
 * [DQPCB] Luồng đọc là của DQPCB. Thư viện ngoài dùng bên trong:
 *   [jszip]          giải nén ZIP
 *   [node-unrar-js]  giải nén RAR (WASM, nạp khi cần)
 *   [web-gerber]     parse + plot Gerber/Excellon thành ImageTree
 */
import JSZip from 'jszip'
import { createParser, plot } from '../webgerber'
import type { BoardParsedData, ParsedGerberLayer } from './types'
import {
  META,
  countHoles,
  drillPlatingOf,
  isAuxiliaryFile,
  isGerberContent,
  looksLikeCamData,
  matchLayer,
  shortenNames,
} from './identify'
import { dilateRegions, flattenArcs, outlineSize, stitchOutline } from './geometry'
import { convertIncrementalToAbsolute, defineMissingApertures, detectFileUnits, parseApertureList } from './normalize'
import { buildEstimatedOutline, extractProfileGerber, plotOutline } from './outline'

/**
 * Một gói file đã giải nén, tương ứng ĐÚNG MỘT bo.
 * Mỗi archive thả vào là một gói; các file Gerber rời thả cùng lượt gộp thành một gói.
 */
/** Ảnh yêu cầu của khách: tên có "spec" (PCB_Specifications.png, *_PCB_Spec.png…). */
const isSpecImage = (name: string) => /spec/i.test(name) && /.(png|jpe?g|webp)$/i.test(name)
const imageUrl = (name: string, base64: string) =>
  `data:image/${/.png$/i.test(name) ? 'png' : /.webp$/i.test(name) ? 'webp' : 'jpeg'};base64,${base64}`

interface InputBundle {
  projectName: string
  /** Tên file archive đã sinh ra gói này — để ghép lại đường dẫn thật ở tầng UI. */
  sourceFile: string
  rawFiles: { name: string; content: string }[]
  orcadLisText: string
  orcadGtdText: string
  specImages: { name: string; url: string }[]
}

type Box = [number, number, number, number]
const toMm = (size: number[], units: string | undefined): Box => {
  const k = units === 'in' ? 25.4 : 1
  return [size[0] * k, size[1] * k, size[2] * k, size[3] * k]
}
/** a nằm trong b (có chừa 3% kích thước b cho lỗ sát mép, rail…). */
const boxInside = (a: Box, b: Box): boolean => {
  const tx = (b[2] - b[0]) * 0.03
  const ty = (b[3] - b[1]) * 0.03
  return a[0] >= b[0] - tx && a[1] >= b[1] - ty && a[2] <= b[2] + tx && a[3] <= b[3] + ty
}

/** Phần diện tích của a nằm chồng lên b (0…1). */
const overlapShare = (a: Box, b: Box): number => {
  const w = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
  const h = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))
  const area = Math.max((a[2] - a[0]) * (a[3] - a[1]), 1e-9)
  return (w * h) / area
}

/**
 * [DQPCB] File khoan KHÔNG nói rõ định dạng số — không dấu thập phân, không
 * ";FILE_FORMAT=", không "INCH,LZ/TZ" — thì parser áp mặc định inch 2:4. Pulsonix xuất
 * "INCH" trơn với toạ độ 3:5 giữ số 0 đầu (X01011283 = 10.11283 in): đọc 2:4 thành
 * 1.011283 in, cả cụm lỗ co 10 lần (báo giá FRIWO 55807.931-90FE, 22/09/2026).
 *
 * Trả về mọi cách đặt dấu thập phân hay gặp, mỗi cách một khoá (để file khoan cùng bộ
 * dùng lại đúng cách đã chốt). null nếu toạ độ đã có dấu chấm — khi đó không mơ hồ.
 */
const drillReadings = (content: string): { key: string; text: string }[] | null => {
  const body = content.replace(/;[^\n]*/g, '')
  const tokens = body.match(/[XY][+-]?[\d.]+/g) || []
  if (tokens.length === 0 || tokens.some((t) => t.includes('.'))) return null
  const withDecimal = (fmt: (digits: string) => string) =>
    content.replace(/([XY])([+-]?)(\d+)(?=\D|$)/g, (_w, axis, sign, digits) => axis + sign + fmt(digits))
  const out: { key: string; text: string }[] = []
  // Giữ đủ chữ số (hoặc bỏ số 0 ĐẦU): giá trị = số nguyên ÷ 10^dec.
  for (let dec = 2; dec <= 6; dec++) {
    out.push({
      key: `div${dec}`,
      text: withDecimal((d) => {
        const p = d.padStart(dec + 1, '0')
        return p.slice(0, p.length - dec) + '.' + p.slice(p.length - dec)
      }),
    })
  }
  // Bỏ số 0 CUỐI (LZ): bù đuôi cho đủ tổng số chữ số rồi mới đặt dấu.
  for (const [int, dec] of [[2, 4], [2, 5], [3, 3], [3, 4], [3, 5], [4, 4]]) {
    out.push({
      key: `lz${int}${dec}`,
      text: withDecimal((d) => {
        if (d.length > int + dec) return d
        const f = d.padEnd(int + dec, '0')
        return f.slice(0, int) + '.' + f.slice(int)
      }),
    })
  }
  return out
}

/** Tâm các lỗ tròn của một lớp khoan đã plot, mm. */
const holeCenters = (tree: any): [number, number][] => {
  const k = tree?.units === 'in' ? 25.4 : 1
  const out: [number, number][] = []
  for (const c of tree?.children ?? []) {
    if (c.type === 'imageShape' && c.shape?.type === 'circle') out.push([c.shape.cx * k, c.shape.cy * k])
  }
  return out
}

/** Đường chéo ô bao một đám điểm. */
const spreadOf = (pts: [number, number][]): number => {
  if (!pts.length) return 0
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [x, y] of pts) {
    if (x < x0) x0 = x
    if (y < y0) y0 = y
    if (x > x1) x1 = x
    if (y > y1) y1 = y
  }
  return Math.hypot(x1 - x0, y1 - y0)
}

/** Ô bao của một hình flash (pad), theo đơn vị của lớp. */
const shapeBox = (sh: any): Box | null => {
  if (!sh) return null
  if (sh.type === 'circle') return [sh.cx - sh.r, sh.cy - sh.r, sh.cx + sh.r, sh.cy + sh.r]
  if (sh.type === 'rectangle') return [sh.x, sh.y, sh.x + sh.xSize, sh.y + sh.ySize]
  const pts: number[][] =
    sh.type === 'polygon'
      ? sh.points
      : sh.type === 'outline'
        ? sh.segments.flatMap((g: any) => [g.start, g.end])
        : []
  if (sh.type === 'layeredShape') {
    const boxes = sh.shapes.filter((x: any) => !x.erase).map(shapeBox).filter(Boolean) as Box[]
    if (!boxes.length) return null
    return [
      Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
      Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3])),
    ]
  }
  if (!pts.length) return null
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** Dời mọi hình của một lớp đã plot đi (dx, dy) mm — toạ độ trong cây theo đơn vị lớp. */
const shiftTree = (tree: any, dxMm: number, dyMm: number) => {
  const k = tree?.units === 'in' ? 25.4 : 1
  const dx = dxMm / k
  const dy = dyMm / k
  const pt = (p: number[]) => { p[0] += dx; p[1] += dy }
  const shape = (sh: any) => {
    if (!sh) return
    if (sh.type === 'circle') { sh.cx += dx; sh.cy += dy }
    else if (sh.type === 'rectangle') { sh.x += dx; sh.y += dy }
    else if (sh.type === 'polygon') sh.points.forEach(pt)
    else if (sh.type === 'outline') sh.segments.forEach(seg)
    else if (sh.type === 'layeredShape') sh.shapes.forEach(shape)
  }
  const seg = (g: any) => { pt(g.start); pt(g.end); if (g.center) pt(g.center) }
  for (const c of tree?.children ?? []) {
    if (c.type === 'imageShape') shape(c.shape)
    else if (c.segments) c.segments.forEach(seg)
  }
  if (tree?.size?.length === 4) tree.size = [tree.size[0] + dx, tree.size[1] + dy, tree.size[2] + dx, tree.size[3] + dy]
}

/**
 * Pad đồng của cả bo (mm), xếp theo lưới để tra nhanh "tâm lỗ này có nằm trên pad nào
 * không". Pad = hình flash (tròn, chữ nhật, macro…) và vùng tô NHỎ (≤ 6 mm — có EDA vẽ
 * pad bằng vùng); vùng tô lớn là mảng đồng phủ, lỗ nào rơi vào cũng "trúng" nên bỏ.
 */
class PadIndex {
  private cells = new Map<string, Box[]>()
  count = 0
  private static CELL = 2 // mm

  constructor(trees: any[]) {
    for (const tree of trees) {
      const k = tree?.units === 'in' ? 25.4 : 1
      for (const c of tree?.children ?? []) {
        if (c.polarity === 'clear') continue
        let box: Box | null = null
        if (c.type === 'imageShape') box = shapeBox(c.shape)
        else if (c.type === 'imageRegion') {
          const r = shapeBox({ type: 'outline', segments: c.segments })
          if (r && (r[2] - r[0]) * k <= 6 && (r[3] - r[1]) * k <= 6) box = r
        }
        if (!box) continue
        // Pad thật không to quá 20 mm; hình flash khổng lồ (logo, khung vẽ bằng flash) chỉ
        // làm "trúng pad" giả và làm vòng chia lưới bên dưới chạy rất lâu.
        if ((box[2] - box[0]) * k > 20 || (box[3] - box[1]) * k > 20) continue
        this.add([box[0] * k, box[1] * k, box[2] * k, box[3] * k])
      }
    }
  }

  /** Tâm pad (mm) — để dò độ dời giữa file khoan và Gerber. */
  centers: [number, number][] = []

  /** Đường chéo ô bao các tâm pad, mm — thước đo "bo trải rộng cỡ nào". */
  spread(): number {
    return spreadOf(this.centers)
  }

  private add(b: Box) {
    const C = PadIndex.CELL
    this.count++
    this.centers.push([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2])
    for (let gx = Math.floor(b[0] / C); gx <= Math.floor(b[2] / C); gx++) {
      for (let gy = Math.floor(b[1] / C); gy <= Math.floor(b[3] / C); gy++) {
        const key = gx + ',' + gy
        const list = this.cells.get(key)
        if (list) list.push(b)
        else this.cells.set(key, [b])
      }
    }
  }

  /**
   * Độ dời (mm) đưa được nhiều tâm lỗ về trúng tâm pad nhất: bỏ phiếu trên hiệu toạ độ
   * lỗ − pad (ô 0.25 mm), lấy ô nhiều phiếu nhất rồi lấy trung bình trong ô. Lỗ thật nằm
   * trên pad nên độ dời đúng được rất nhiều cặp cùng bầu; độ dời ngẫu nhiên thì tản mát.
   */
  bestOffset(holes: [number, number][]): [number, number] {
    const pads = this.centers
    if (!holes.length || !pads.length) return [0, 0]
    const hs = holes.filter((_, i) => i % Math.max(1, Math.floor(holes.length / 120)) === 0)
    const ps = pads.filter((_, i) => i % Math.max(1, Math.floor(pads.length / 3000)) === 0)
    const G = 0.25
    const votes = new Map<number, { n: number; sx: number; sy: number }>()
    let top = { n: 0, sx: 0, sy: 0 }
    for (const [hx, hy] of hs) {
      for (const [px, py] of ps) {
        const dx = px - hx
        const dy = py - hy
        const key = Math.round(dx / G) * 1_000_003 + Math.round(dy / G)
        let v = votes.get(key)
        if (!v) votes.set(key, (v = { n: 0, sx: 0, sy: 0 }))
        v.n++
        v.sx += dx
        v.sy += dy
        if (v.n > top.n) top = v
      }
    }
    return top.n ? [top.sx / top.n, top.sy / top.n] : [0, 0]
  }

  /** Tỉ lệ tâm lỗ nằm trên một pad (chừa 0.05 mm). Lấy mẫu tối đa 1500 lỗ cho nhanh. */
  hitRate(holes: [number, number][]): number {
    if (!holes.length) return 0
    const step = Math.max(1, Math.floor(holes.length / 1500))
    const C = PadIndex.CELL
    const e = 0.05
    let hit = 0
    let n = 0
    for (let i = 0; i < holes.length; i += step) {
      const [x, y] = holes[i]
      n++
      const list = this.cells.get(Math.floor(x / C) + ',' + Math.floor(y / C))
      if (list?.some((b) => x >= b[0] - e && x <= b[2] + e && y >= b[1] - e && y <= b[3] + e)) hit++
    }
    return hit / n
  }
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
      specImages: [],
    }

    for (const file of files) {
      let rawFiles: { name: string; content: string }[] = []
      const specImages: { name: string; url: string }[] = []
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
          const specName = entryName.split(/[\/]/).pop() || entryName
          if (isSpecImage(specName)) specImages.push({ name: specName, url: imageUrl(specName, await entry.async('base64')) })
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
        bundles.push({ projectName, sourceFile: file.name, rawFiles, orcadLisText, orcadGtdText, specImages })
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
            const specName = entryName.split(/[\/]/).pop() || entryName
            if (isSpecImage(specName) && f.extraction) {
              let bin = ''
              for (const byte of f.extraction) bin += String.fromCharCode(byte)
              specImages.push({ name: specName, url: imageUrl(specName, btoa(bin)) })
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
          bundles.push({ projectName, sourceFile: file.name, rawFiles, orcadLisText, orcadGtdText, specImages })
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

  /**
   * [DQPCB] Đọc lại bo với loại lớp chọn tay (tên file → khoá META, xem LAYER_CHOICES).
   * App nhận diện sai (vd. file khoan đuôi lạ, viền nằm trong file .FAB) thì người dùng
   * đặt lại ở danh sách lớp; cả bộ đọc lại để kích thước, file khoan được vẽ, viền chính…
   * tính lại theo đúng loại mới.
   */
  static async rebuildBoard(data: BoardParsedData, overrides: Record<string, string>): Promise<BoardParsedData> {
    if (!data.source) throw new Error('Bo này không còn file gốc để đọc lại.')
    return GerberParser.buildBoard(data.source as InputBundle, overrides)
  }

  /** Dựng một bo hoàn chỉnh từ một gói file đã giải nén. */
  private static async buildBoard(bundle: InputBundle, overrides: Record<string, string> = {}): Promise<BoardParsedData> {
    const forced = (name: string) => (overrides[name] && META[overrides[name]] ? overrides[name] : null)
    const { projectName, sourceFile, orcadLisText, orcadGtdText } = bundle
    let rawFiles = bundle.rawFiles

    // Loại file phụ trợ (report / aperture list / BOM / ảnh…) trước khi phân loại
    // layer — nếu không chúng sẽ nằm trong danh sách layer dưới dạng "Unknown"
    // và luôn render rỗng.
    const allInputNames = rawFiles.map((f) => f.name)
    // Ngoài luật tên/đuôi, bỏ luôn file không nhận ra lớp mà nội dung cũng chẳng giống
    // Gerber/Excellon. Vẫn liệt kê trong ignoredFiles để người dùng thấy, không giấu.
    const isJunk = (f: { name: string; content: string }) =>
      !forced(f.name) &&
      (isAuxiliaryFile(f.name, allInputNames) ||
      (matchLayer(f.name, allInputNames, f.content).type === 'unknown' && !looksLikeCamData(f.content)))
    const ignoredFiles = rawFiles.filter(isJunk).map((f) => f.name)
    rawFiles = rawFiles.filter((f) => !isJunk(f))

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
    /** Lớp khoan mà dữ liệu là Gerber chứ không phải Excellon. */
    const gerberDrillIds = new Set<string>()

    for (let fileIndex = 0; fileIndex < rawFiles.length; fileIndex++) {
      const raw = rawFiles[fileIndex]
      try {
        const userType = forced(raw.name)
        const meta = userType ? { ...META[userType] } : matchLayer(raw.name, allNames, raw.content)
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

          // [DQPCB] Format KHAI BÁO trong chú thích (Altium: ";FILE_FORMAT=4:3" + "METRIC,LZ").
          // web-gerber không đọc dòng chú thích này mà áp mặc định của nó — inch 2:4 thì
          // trùng nên vẫn đúng, còn metric 4:3 thì X0050419 (50.419 mm) thành 0.50419 mm:
          // cả cụm lỗ co 100 lần dồn về một góc (bo "ESP32_DR", Nguyen Van Quang,
          // 22/09/2026). Có đủ số chữ số và kiểu số 0 thì tự chèn dấu thập phân.
          //   LZ = giữ số 0 đầu, bỏ số 0 cuối → thiếu thì bù ĐUÔI.
          //   TZ = giữ số 0 cuối, bỏ số 0 đầu → thiếu thì bù ĐẦU.
          const declared = fileContent.match(/;\s*FILE_FORMAT\s*=\s*(\d)\s*:\s*(\d)/i)
          const zeros = fileContent.match(/^\s*(?:METRIC|INCH)\s*,\s*(LZ|TZ)/im)?.[1]?.toUpperCase()
          // Toạ độ có thể nằm sau lệnh phay (G00X…/G01Y… của SlotHoles/RectHoles), không
          // đứng đầu dòng — dò trên mọi toạ độ X/Y chứ không chỉ dòng bắt đầu bằng X/Y.
          const coordTokens = fileContent.replace(/;[^\n]*/g, '').match(/[XY][+-]?[\d.]+/g) || []
          if (declared && zeros && coordTokens.length > 0 && !coordTokens.some((t) => t.includes('.'))) {
            const intDigits = Number(declared[1])
            const decDigits = Number(declared[2])
            const total = intDigits + decDigits
            fileContent = fileContent.replace(/([XY])([+-]?)(\d+)(?=\D|$)/g, (whole, axis, sign, digits) => {
              if (digits.length > total) return whole
              const full = zeros === 'LZ' ? digits.padEnd(total, '0') : digits.padStart(total, '0')
              return axis + sign + full.slice(0, intDigits) + '.' + full.slice(intDigits)
            })
          } else if (ambiguousMetric) {
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
        // Lớp viền dùng aperture không khai báo → nét mảnh (xem defineMissingApertures).
        if (meta.type === 'outline') fileContent = defineMissingApertures(fileContent)

        const isOutline = meta.type === 'outline'
        const parser = createParser()
        parser.feed(fileContent)
        const plotted = plot(parser.result(), isOutline)
        const fillTypes = ['copper', 'soldermask', 'silkscreen', 'solderpaste']
        const imageTree = flattenArcs(
          isOutline ? stitchOutline(plotted) : fillTypes.includes(meta.type) ? dilateRegions(plotted) : plotted,
        )

        // Viền: ô bao lấy từ vòng đã nối, không lấy số thô của web-gerber (xem outlineSize).
        if (isOutline) {
          const real = outlineSize(imageTree)
          if (real) imageTree.size = real
        }

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
            meta.type === 'unknown' && !userType ? shortName.replace(/\.[^.]+$/, '') || meta.displayName : meta.displayName,
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
          holeCount: isDrillFile ? countHoles(fileContent) : 0,
          ...(isDrillFile ? { drillPlating: drillPlatingOf(raw.name, raw.content) } : null),
          ...(userType ? { userType } : null),
        })
        // Người dùng đã chọn tay là file khoan thì không hạ xuống tài liệu.
        if (isDrillFile && isGerberContent(raw.content) && !userType) gerberDrillIds.add(id)
      } catch (err: any) {
        // Không nuốt lỗi im lặng: người dùng cần biết lớp nào bị mất và vì sao.
        console.warn(`Skipping unparseable file: ${raw.name}`, err)
        failedFiles.push({ name: raw.name, reason: err?.message || String(err) })
      }
    }

    // ── File khoan không khai định dạng số: chọn lại cách đọc (xem drillReadings) ──
    // 1. Dò theo PAD: lỗ khoan thật nằm trên pad/via, nên cách đọc đúng là cách cho nhiều
    //    tâm lỗ trúng pad đồng nhất. Bắt được cả bo đặt sát gốc toạ độ — lỗ co 10 lần vẫn
    //    nằm trong khung bo (dồn về một góc) nên chỉ nhìn khung bo thì không thấy sai.
    // 2. File không có pad để dò (NPTH, lỗ bắt vít): dùng lại cách đọc đã chốt cho file
    //    khoan khác cùng bộ — cùng một phần mềm xuất thì cùng định dạng.
    // 3. Vẫn chưa chốt được thì lấy KHUNG BO làm thước: cụm lỗ nằm gần như hẳn ngoài bo
    //    (dưới nửa chồng lên bo) là sai; chọn cách cho cụm lỗ nằm trong bo và phủ rộng
    //    nhất (co quá tay thì cũng lọt vào trong nhưng bé tí).
    const parseDrill = (text: string) =>
      flattenArcs(plot((() => { const p = createParser(); p.feed(text); return p.result() })(), false))
    const pads = new PadIndex(parsedLayers.filter((l) => l.type === 'copper').map((l) => l.imageTree))
    const refLayers = parsedLayers.filter((l) => l.type === 'outline' && l.size[2] > l.size[0])
    const refPool = refLayers.length ? refLayers : parsedLayers.filter((l) => l.type === 'copper' && l.size[2] > l.size[0])
    const refBoxes = refPool.map((l) => toMm(l.size, l.units))
    const ref: Box | null = refBoxes.length
      ? [
          Math.min(...refBoxes.map((b) => b[0])), Math.min(...refBoxes.map((b) => b[1])),
          Math.max(...refBoxes.map((b) => b[2])), Math.max(...refBoxes.map((b) => b[3])),
        ]
      : null
    const PAD_OK = 0.5
    /** Dời dưới mức này coi như không dời (sai số làm tròn, pad lệch tâm lỗ). */
    const MIN_SHIFT_MM = 0.5
    let rescaled = false
    /** Cách đọc + độ dời đã chốt theo pad, để file khoan cùng bộ (NPTH…) dùng lại. */
    let chosen: { key: string | null; dx: number; dy: number } | null = null
    const apply = (
      layer: ParsedGerberLayer,
      tree: any,
      fix: NonNullable<ParsedGerberLayer['drillFix']>,
    ) => {
      if (fix.dxMm || fix.dyMm) shiftTree(tree, fix.dxMm, fix.dyMm)
      layer.imageTree = tree
      layer.size = [tree.size[0], tree.size[1], tree.size[2], tree.size[3]]
      layer.units = tree.units || layer.units
      layer.drillFix = fix
      rescaled = true
    }
    const shifted = (holes: [number, number][], dx: number, dy: number) =>
      holes.map(([x, y]) => [x + dx, y + dy] as [number, number])
    const pending: { layer: ParsedGerberLayer; readings: { key: string; text: string }[]; raw: string }[] = []
    for (const layer of parsedLayers) {
      if (layer.type !== 'drill' || gerberDrillIds.has(layer.id) || !(layer.size[2] > layer.size[0])) continue
      const raw = rawFiles.find((f) => f.name === layer.filename)
      if (!raw) continue
      // null = toạ độ có dấu chấm (rõ ràng) — không có cách đọc nào khác, vẫn xét lệch gốc.
      let readings = drillReadings(raw.content) ?? []
      // File KHAI ĐỦ số chữ số (";FILE_FORMAT=a:b", hay "METRIC,LZ,000.000" của EasyEDA)
      // mà cụm lỗ vẫn nằm trong bo thì tin lời khai — chỉ xét lệch gốc, không thử cách
      // đọc khác. Chỉ khai kiểu số 0 ("INCH,TZ", "METRIC,LZ") thì chưa đủ, vẫn mơ hồ. Khai
      // đủ mà lỗ nằm hẳn ngoài bo thì lời khai sai (bộ CS2: FILE_FORMAT=2:4 nhưng không
      // phải) — cho thử như file không khai.
      const declared = /;\s*FILE_FORMAT\s*=|^\s*(?:METRIC|INCH)\s*,\s*(?:LZ|TZ)\s*,\s*0+\.0+/im.test(raw.content)
      if (declared && ref) {
        const own = toMm(layer.size, layer.units)
        if (boxInside(own, ref) || overlapShare(own, ref) >= 0.5) readings = []
      }
      const holes = holeCenters(layer.imageTree)
      // Có đủ pad và đủ lỗ thì dò theo pad. File NPTH thì không: lỗ bắt vít vốn không
      // nằm trên pad, tỉ lệ trúng pad thấp là đúng chứ không phải đọc sai.
      if (pads.count >= 10 && holes.length >= 5 && layer.drillPlating !== 'NPTH') {
        const now = pads.hitRate(holes)
        if (now >= PAD_OK) continue // cách đọc mặc định đã trúng pad — đúng rồi
        // Thử cả cách đọc hiện tại (key null — có thể chỉ lệch gốc) lẫn mọi cách đặt dấu,
        // mỗi cách thử thêm độ dời tốt nhất. Ngang nhau thì ưu tiên KHÔNG dời.
        let best: { key: string | null; tree: any; rate: number; dx: number; dy: number } | null = null
        const padSpread = pads.spread()
        const consider = (key: string | null, tree: any) => {
          const hs = holeCenters(tree)
          if (hs.length < 5) return
          // Cách đọc khác phải giữ cụm lỗ trải rộng tương xứng với bo: co thành một chấm
          // thì dời đi đâu cũng lọt vào vài pad to — khớp giả.
          if (key !== null && spreadOf(hs) < padSpread * 0.25) return
          const plain = pads.hitRate(hs)
          let cand = { key, tree, rate: plain, dx: 0, dy: 0 }
          const [dx, dy] = pads.bestOffset(hs)
          if (Math.hypot(dx, dy) >= MIN_SHIFT_MM) {
            const moved = pads.hitRate(shifted(hs, dx, dy))
            if (moved > plain + 0.05) cand = { key, tree, rate: moved, dx, dy }
          }
          const better =
            !best ||
            cand.rate > best.rate + 0.02 ||
            // ngang nhau: cách không dời thắng
            (cand.rate >= best.rate - 0.02 && !cand.dx && !cand.dy && (best.dx || best.dy))
          if (better) best = cand
        }
        consider(null, layer.imageTree)
        for (const r of readings) {
          try {
            consider(r.key, parseDrill(r.text))
          } catch {
            /* cách đọc này hỏng — bỏ qua */
          }
        }
        const b = best as { key: string | null; tree: any; rate: number; dx: number; dy: number } | null
        if (b && b.rate >= PAD_OK && b.rate >= now + 0.3) {
          // Cây của cách đọc hiện tại là cây đang gắn vào lớp — dời thẳng trên nó.
          apply(layer, b.tree, { reading: b.key, dxMm: b.dx, dyMm: b.dy, via: 'pad', padHit: b.rate })
          chosen = { key: b.key, dx: b.dx, dy: b.dy }
          continue
        }
      }
      pending.push({ layer, readings, raw: raw.content })
    }
    for (const { layer, readings } of pending) {
      const own = toMm(layer.size, layer.units)
      const outside = ref ? !boxInside(own, ref) && overlapShare(own, ref) < 0.5 : false
      // 2. Dùng lại cách đọc + độ dời của file anh em — chỉ khi kết quả nằm trong bo.
      if (chosen) {
        const r = chosen.key === null ? null : readings.find((x) => x.key === chosen!.key)
        if (chosen.key === null || r) {
          try {
            const tree = r ? parseDrill(r.text) : layer.imageTree
            const box = toMm(tree.size, tree.units)
            const moved: Box = [box[0] + chosen.dx, box[1] + chosen.dy, box[2] + chosen.dx, box[3] + chosen.dy]
            if ((r || chosen.dx || chosen.dy) && (!ref || boxInside(moved, ref))) {
              apply(layer, tree, { reading: chosen.key, dxMm: chosen.dx, dyMm: chosen.dy, via: 'sibling' })
              continue
            }
          } catch {
            /* bỏ qua */
          }
        }
      }
      // 3. Khung bo làm thước — chỉ khi cụm lỗ nằm hẳn ngoài bo (chắc chắn sai).
      if (!ref || !outside) continue
      let best: { key: string; tree: any; area: number } | null = null
      for (const r of readings) {
        try {
          const tree = parseDrill(r.text)
          if (!tree.size || tree.size.length !== 4) continue
          const box = toMm(tree.size, tree.units)
          if (!(box[2] > box[0]) || !boxInside(box, ref)) continue
          const area = (box[2] - box[0]) * Math.max(box[3] - box[1], 1e-6)
          if (!best || area > best.area) best = { key: r.key, tree, area }
        } catch {
          /* bỏ qua */
        }
      }
      // Có pad để kiểm mà cách đọc theo khung bo không làm lỗ trúng pad hơn hẳn thì đừng
      // nhận: lỗ lọt vào trong bo nhưng sai chỗ còn tệ hơn để nguyên — trông như đúng.
      // Quét kho: 5/10 lần sửa theo khung bo ra 0% trúng pad (vd Dragonfruit_V8).
      const holesNow = holeCenters(layer.imageTree)
      const checkable = pads.count >= 10 && holesNow.length >= 5 && layer.drillPlating !== 'NPTH'
      if (best && checkable) {
        const gain = pads.hitRate(holeCenters(best.tree)) - pads.hitRate(holesNow)
        if (gain < 0.2) best = null
      }
      if (best) {
        const padHit = checkable ? pads.hitRate(holeCenters(best.tree)) : undefined
        apply(layer, best.tree, { reading: best.key, dxMm: 0, dyMm: 0, via: 'board', ...(padHit !== undefined ? { padHit } : null) })
      } else {
        // Không cách nào khớp: để nguyên, nhưng báo để người lập kiểm với khách.
        layer.drillUnmatched = true
      }
    }
    // Không có viền thì ô bao cả bo cộng dồn trong vòng đọc đã lẫn toạ độ khoan sai —
    // tính lại. Có viền thì phía dưới lấy thẳng từ viền nên khỏi làm.
    if (rescaled && !refLayers.length) {
      globalMinX = globalMinY = Infinity
      globalMaxX = globalMaxY = -Infinity
      for (const l of parsedLayers) {
        const w = l.size[2] - l.size[0]
        const h = l.size[3] - l.size[1]
        const counts =
          (w > 0.1 || h > 0.1) &&
          (l.type === 'copper' || l.type === 'silkscreen' || (l.type === 'soldermask' && w < 250) ||
            (l.type === 'drill' && l.displayName === 'Drl'))
        if (!counts) continue
        const b = toMm(l.size, l.units)
        globalMinX = Math.min(globalMinX, b[0]); globalMinY = Math.min(globalMinY, b[1])
        globalMaxX = Math.max(globalMaxX, b[2]); globalMaxY = Math.max(globalMaxY, b[3])
      }
    }

    if (parsedLayers.length === 0) {
      throw new Error('Could not parse any valid Gerber layers from the provided files.')
    }

    // KiCad và Altium xuất khoan HAI lần: Excellon (.drl/.txt) và một bản Gerber X2 cùng
    // nội dung (-PTH-drl.gbr, _PTH_Drill.gbr). Có Excellon thì bản Gerber là trùng lặp —
    // giữ cả hai thì đếm đôi số lỗ, và viewer coi bản Gerber là file gộp rồi bỏ mất lỗ
    // NPTH. Chỉ khi cả bộ KHÔNG có Excellon (Proteus CADCAM) thì bản Gerber mới là dữ
    // liệu khoan duy nhất.
    const hasExcellon = parsedLayers.some(
      (l) => l.type === 'drill' && l.holeCount > 0 && !gerberDrillIds.has(l.id)
    )
    if (hasExcellon) {
      for (const l of parsedLayers) {
        if (!gerberDrillIds.has(l.id)) continue
        Object.assign(l, { ...META.doc, displayName: 'Drill (Gerber)', visible: false })
        l.holeCount = 0
        delete l.drillPlating
      }
    }

    // Không có lớp viền nào vẽ được gì → tìm nét khai AperFunction,Profile nằm lẫn trong
    // lớp khác (Pulsonix: "(Documentation).gbr"). Có thì đó là viền thật, dùng nó thay
    // cho viền ước lượng từ lớp đồng ở dưới.
    const hasOutlineGeometry = () =>
      parsedLayers.some((l) => l.type === 'outline' && l.size[2] > l.size[0] && l.size[3] > l.size[1])
    if (!hasOutlineGeometry()) {
      let best: ParsedGerberLayer | null = null
      for (const raw of rawFiles) {
        const profile = extractProfileGerber(raw.content)
        if (!profile) continue
        try {
          const plotted = plotOutline(profile)
          const area = (plotted.size[2] - plotted.size[0]) * (plotted.size[3] - plotted.size[1])
          if (!(area > 0)) continue
          const bestArea = best ? (best.size[2] - best.size[0]) * (best.size[3] - best.size[1]) : 0
          if (best && area * (plotted.units === 'in' ? 645.16 : 1) <= bestArea * (best.units === 'in' ? 645.16 : 1)) continue
          // Tên đầy đủ chứ không dùng tên rút gọn: rút gọn cắt ở ranh giới từ nên ra
          // những mẩu vô nghĩa kiểu "5(Documentation).gbr".
          const src = raw.name.split(/[\\/]/).pop() || raw.name
          let id = `(viền bo từ ${src})`
          while (usedIds.has(id)) id += '#'
          best = {
            id,
            filename: id,
            shortName: id,
            ...META.outline,
            displayName: 'Outline (Profile)',
            visible: true,
            holeCount: 0,
            ...plotted,
          }
        } catch (err) {
          console.warn('Không tách được viền Profile từ', raw.name, err)
        }
      }
      if (best) {
        usedIds.add(best.id)
        parsedLayers.push(best)
      }
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
      // Pick the outline layer with the largest bounding box area (so sánh bằng mm — lớp
      // inch và lớp mm trong cùng bộ thì số thô không so được với nhau).
      const areaMm = (l: ParsedGerberLayer) => {
        const s = l.units === 'in' ? 25.4 : 1
        return (l.size[2] - l.size[0]) * (l.size[3] - l.size[1]) * s * s
      }
      // Lớp người dùng chọn tay là viền thì thắng lớp app tự nhận.
      const chosen = outlineLayers.filter((l) => l.userType === 'outline')
      outlineLayer = (chosen.length ? chosen : outlineLayers).reduce((prev, current) =>
        areaMm(current) > areaMm(prev) ? current : prev,
      )

      // [DQPCB] Chỉ MỘT lớp viền dựng thân bo. Altium hay xuất cả .GKO lẫn .GM1, mà GM1 có
      // khi chỉ là khung linh kiện / kích thước: bo "Slaver_Ceiling_ EC" (Le Quoc Huy,
      // 21/09/2026) có GM1 là hai khung rơ-le bên trong bo. Viewer lấy lớp viền dựng
      // SAU CÙNG làm thân bo, nên thân bo chỉ còn hai khung đó. Lớp viền còn lại chuyển
      // thành tài liệu (vẫn bật xem được ở CAM). Trên corpus 34/614 bộ có nhiều lớp viền:
      // 21 bộ trùng khít lớp chính, 13 bộ nằm trong.
      for (const l of outlineLayers) {
        if (l === outlineLayer) continue
        Object.assign(l, { ...META.doc, displayName: `${l.displayName} (viền phụ)`, visible: false })
      }
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

    // --- Bo không có viền ---
    // Bộ xuất Proteus CADCAM (và vài bộ tối giản khác) không kèm lớp viền bo. Thiếu viền
    // thì viewer sập hẳn: assemblyPCBToThreeJS của web-gerber luôn gán
    // `OutLine.children[0].material`, mà viền rỗng thì không có children[0]. Nên dựng
    // một viền chữ nhật từ khung vừa tính (hợp của các lớp đồng) và gọi tên rõ là
    // "ước lượng" — người lập thấy ngay kích thước này là suy ra, không phải viền thật.
    const hasRealOutline = parsedLayers.some(
      (l) => l.type === 'outline' && l.size[2] > l.size[0] && l.size[3] > l.size[1]
    )
    if (!hasRealOutline && widthMM > 0.1 && heightMM > 0.1) {
      try {
        parsedLayers.push(
          buildEstimatedOutline(globalMinX, globalMinY, globalMaxX, globalMaxY, usedIds)
        )
      } catch (err: any) {
        console.warn('Không dựng được viền ước lượng', err)
      }
    }

    const copperLayers = parsedLayers.filter((l) => l.type === 'copper')
    // File khoan rỗng (Proteus luôn xuất file NPTH kể cả khi bo không có lỗ không mạ)
    // không tính — "File khoan: 2" trong khi chỉ một file có lỗ là đếm sai.
    const drillLayers = parsedLayers.filter((l) => l.type === 'drill' && l.holeCount > 0)

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
      // Bo một mặt chỉ có MỘT lớp đồng — trước đây ép tối thiểu 2 nên bo 1 lớp bị báo giá
      // như bo 2 lớp (FRIWO "P84241-S02", 23/09/2026: khách ghi rõ "Single side"; JLC cũng
      // đọc ra 1 lớp). Không đọc được lớp đồng nào thì vẫn để 2 như cũ.
      layerCount: copperLayers.length || 2,
      drillCount: drillLayers.length,
      ignoredFiles,
      failedFiles,
      specImages: bundle.specImages,
      source: bundle,
      layerOverrides: overrides,
    }
  }
}
