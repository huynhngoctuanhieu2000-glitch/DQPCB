/**
 * Điểm vào: giải nén ZIP/RAR, gom file thành từng bo, nhận diện và plot từng lớp.
 *
 * [DQPCB] Luồng đọc là của DQPCB. Thư viện ngoài dùng bên trong:
 *   [jszip]          giải nén ZIP
 *   [node-unrar-js]  giải nén RAR (WASM, nạp khi cần)
 *   [web-gerber]     parse + plot Gerber/Excellon thành ImageTree
 */
import JSZip from 'jszip'
// @ts-ignore - web-gerber không kèm type cho các named export
import { createParser, plot } from 'web-gerber'
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
import { convertIncrementalToAbsolute, detectFileUnits, parseApertureList } from './normalize'
import { buildEstimatedOutline, extractProfileGerber, plotOutline } from './outline'

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
    // Ngoài luật tên/đuôi, bỏ luôn file không nhận ra lớp mà nội dung cũng chẳng giống
    // Gerber/Excellon. Vẫn liệt kê trong ignoredFiles để người dùng thấy, không giấu.
    const isJunk = (f: { name: string; content: string }) =>
      isAuxiliaryFile(f.name, allInputNames) ||
      (matchLayer(f.name, allInputNames, f.content).type === 'unknown' && !looksLikeCamData(f.content))
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
          holeCount: isDrillFile ? countHoles(fileContent) : 0,
          ...(isDrillFile ? { drillPlating: drillPlatingOf(raw.name, raw.content) } : null),
        })
        if (isDrillFile && isGerberContent(raw.content)) gerberDrillIds.add(id)
      } catch (err: any) {
        // Không nuốt lỗi im lặng: người dùng cần biết lớp nào bị mất và vì sao.
        console.warn(`Skipping unparseable file: ${raw.name}`, err)
        failedFiles.push({ name: raw.name, reason: err?.message || String(err) })
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
      outlineLayer = outlineLayers.reduce((prev, current) => (areaMm(current) > areaMm(prev) ? current : prev))

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
      layerCount: Math.max(copperLayers.length, 2),
      drillCount: drillLayers.length,
      ignoredFiles,
      failedFiles,
    }
  }
}
