import { createParser } from '@tracespace/parser'
import identify from 'whats-that-gerber'
import { plot } from '@tracespace/plotter'
import { render } from '@tracespace/renderer'
import { toHtml } from 'hast-util-to-html'
import JSZip from 'jszip'

export interface ParsedGerberLayer {
  id: string
  filename: string
  displayName: string
  type: string
  side: string
  color: string
  order: number
  visible: boolean
  svgContent: string
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
}

// 🎨 Comprehensive Layer Matcher for Altium, KiCad, Eagle, OrCAD, Sprint-Layout, Proteus, EasyEDA, CAM350
export const matchLayer = (filename: string) => {
  const lower = filename.toLowerCase()
  const nameOnly = lower.replace(/\.[^/.]+$/, '')

  // 1. Outline / Border / Edge Cuts / Mechanical (All EDA suites)
  if (
    /outline|border|contour|profile|edge[-_.]?cuts|board[-_.]?outline|dimension|dim|mil|mechanical\s*1/i.test(
      lower
    ) ||
    /\.(gko|gm1|gm2|gm3|gml|dim|mil|fab|oln|bor|contour|profile)$/i.test(lower)
  ) {
    return { type: 'outline', side: 'all', displayName: 'Outline', color: '#F1C40F', order: 8 }
  }

  // 2. Top Silkscreen (Altium: .GTO, KiCad: F_SilkS, Eagle: .plc, OrCAD: .SST, Sprint: Silkscreen_top, Proteus: CADCAM Top Silk)
  if (
    /top[-_.\s]?silk|silk[-_.\s]?top|silkscreen[-_.\s]?top|top[-_.\s]?silkscreen|f[-_.]?silk|f[-_.]?silkscreen/i.test(
      lower
    ) ||
    /\.(gto|plc|sst|sstop|tss|topsilk|ssrot)$/i.test(lower)
  ) {
    return { type: 'silkscreen', side: 'top', displayName: 'Top Silk', color: '#FFFFFF', order: 7 }
  }

  // 3. Bottom Silkscreen (Altium: .GBO, KiCad: B_SilkS, Eagle: .pls, OrCAD: .SSB, Sprint: Silkscreen_bottom, Proteus: CADCAM Bottom Silk)
  if (
    /bot[-_.\s]?silk|bottom[-_.\s]?silk|silk[-_.\s]?bot|silk[-_.\s]?bottom|silkscreen[-_.\s]?bot|b[-_.]?silk|b[-_.]?silkscreen/i.test(
      lower
    ) ||
    /\.(gbo|pls|ssb|ssbot|bss|botsilk)$/i.test(lower)
  ) {
    return { type: 'silkscreen', side: 'bottom', displayName: 'Bot Silk', color: '#8EAEE0', order: 4 }
  }

  // 4. Top Soldermask (Altium: .GTS, KiCad: F_Mask, Eagle: .stc, OrCAD: .SMT, Sprint: Soldermask_top, Proteus: CADCAM Top Solder Resist)
  if (
    /top[-_.\s]?solder|solder[-_.\s]?top|top[-_.\s]?mask|mask[-_.\s]?top|top[-_.\s]?resist|resist[-_.\s]?top|f[-_.]?mask/i.test(
      lower
    ) ||
    /\.(gts|stc|smt|smtop|tsm|topmask)$/i.test(lower)
  ) {
    return { type: 'soldermask', side: 'top', displayName: 'Top Solder', color: '#00B08B', order: 5 }
  }

  // 5. Bottom Soldermask (Altium: .GBS, KiCad: B_Mask, Eagle: .sts, OrCAD: .SMB, Sprint: Soldermask_bottom, Proteus: CADCAM Bottom Solder Resist)
  if (
    /bot[-_.\s]?solder|bottom[-_.\s]?solder|solder[-_.\s]?bot|bot[-_.\s]?mask|bottom[-_.\s]?mask|mask[-_.\s]?bot|mask[-_.\s]?bottom|bot[-_.\s]?resist|bottom[-_.\s]?resist|b[-_.]?mask/i.test(
      lower
    ) ||
    /\.(gbs|sts|smb|smbot|bsm|botmask)$/i.test(lower)
  ) {
    return { type: 'soldermask', side: 'bottom', displayName: 'Bot Solder', color: '#16A085', order: 2 }
  }

  // 6. Top Copper (Altium: .GTL, KiCad: F_Cu, Eagle: .cmp, OrCAD: .TOP, Sprint: Copper_top, Proteus: CADCAM Top Copper)
  if (
    /top[-_.\s]?copper|copper[-_.\s]?top|top[-_.\s]?layer|layer[-_.\s]?1|f[-_.]?cu|front[-_.]?cu/i.test(
      lower
    ) ||
    /^(top|cmp|l1|layer1|cu_top)$/i.test(nameOnly) ||
    /\.(gtl|cmp|top|toplayer|l1|layer1)$/i.test(lower)
  ) {
    return { type: 'copper', side: 'top', displayName: 'Top Copper', color: '#E55039', order: 6 }
  }

  // 7. Bottom Copper (Altium: .GBL, KiCad: B_Cu, Eagle: .sol, OrCAD: .BOT, Sprint: Copper_bottom, Proteus: CADCAM Bottom Copper)
  if (
    /bot[-_.\s]?copper|bottom[-_.\s]?copper|copper[-_.\s]?bot|copper[-_.\s]?bottom|bot[-_.\s]?layer|bottom[-_.\s]?layer|layer[-_.\s]?2|b[-_.]?cu|back[-_.]?cu/i.test(
      lower
    ) ||
    /^(bot|bottom|sol|l2|layer2|cu_bot|cu_bottom)$/i.test(nameOnly) ||
    /\.(gbl|sol|bot|bottomlayer|l2|layer2)$/i.test(lower)
  ) {
    return { type: 'copper', side: 'bottom', displayName: 'Bot Copper', color: '#38BDF8', order: 3 }
  }

  // 8. Inner Copper
  if (
    /\.(g[1-9]|in[1-9]|layer[3-9])$/i.test(lower) ||
    /in[1-9]?[-_.]?cu|inner[-_.\s]?[1-9]?/i.test(lower)
  ) {
    return { type: 'copper', side: 'inner', displayName: 'Inner Copper', color: '#E67E22', order: 3 }
  }

  // 9. Top Paste
  if (
    /top[-_.\s]?paste|paste[-_.\s]?top|f[-_.]?paste/i.test(lower) ||
    /^(pastetop|toppaste|spt|sptop|tsp)$/i.test(nameOnly) ||
    /\.(gtp|crc|spt|sptop|tsp|toppaste)$/i.test(lower)
  ) {
    return { type: 'solderpaste', side: 'top', displayName: 'Top Paste', color: '#B5A672', order: 1 }
  }

  // 10. Bottom Paste
  if (
    /bot[-_.\s]?paste|bottom[-_.\s]?paste|paste[-_.\s]?bot|paste[-_.\s]?bottom|b[-_.]?paste/i.test(
      lower
    ) ||
    /^(pastebot|botpaste|spb|spbot|bsp)$/i.test(nameOnly) ||
    /\.(gbp|crs|spb|spbot|bsp|botpaste)$/i.test(lower)
  ) {
    return { type: 'solderpaste', side: 'bottom', displayName: 'Bot Paste', color: '#A59662', order: 1 }
  }

  // 11. Drill / Excellon (Altium: .DRL/.TXT, KiCad: .drl, Eagle: .drd, OrCAD: .tap, Proteus: CADCAM Drill, Sprint: .drl)
  if (
    /drill|excellon|npth|pth|holes/i.test(lower) ||
    /^(drill|holes|thruhole)$/i.test(nameOnly) ||
    /\.(drl|tap|xln|exc|ncd)$/i.test(lower) ||
    (/\.txt$/i.test(lower) && /drill/i.test(lower))
  ) {
    return { type: 'drill', side: 'all', displayName: 'Drl', color: '#000000', order: 9 }
  }

  // 12. Drill Drawing / Sheet notes (.DRD, .DTS)
  if (/\.(drd|dts|art|rep|log)$/i.test(lower)) {
    return { type: 'drawing', side: 'all', displayName: 'Drill Drawing', color: '#718096', order: 12 }
  }

  // Fallback to whats-that-gerber
  const fallback = identify([filename])[filename]
  if (fallback?.type) {
    let side = fallback.side || 'all'
    let displayName = fallback.type.charAt(0).toUpperCase() + fallback.type.slice(1)
    if (fallback.type === 'copper') {
      displayName = side === 'top' ? 'Top Copper' : side === 'bottom' ? 'Bot Copper' : 'Inner Copper'
    } else if (fallback.type === 'silkscreen') {
      displayName = side === 'top' ? 'Top Silk' : 'Bot Silk'
    } else if (fallback.type === 'soldermask') {
      displayName = side === 'top' ? 'Top Solder' : 'Bot Solder'
    } else if (fallback.type === 'drill') {
      displayName = 'Drl'
    }

    return {
      type: fallback.type,
      side,
      displayName,
      color: '#9B59B6',
      order: 10,
    }
  }

  return { type: 'other', side: 'all', displayName: nameOnly.toUpperCase(), color: '#9B59B6', order: 13 }
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
    const rawFiles: { name: string; content: string }[] = []
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
          const baseName = entryName.split('/').pop() || entryName
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
            const baseName = entryName.split('/').pop() || entryName
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

    for (const raw of rawFiles) {
      try {
        const meta = matchLayer(raw.name)
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

        const parser = createParser()
        parser.feed(fileContent)
        const tree = parser.results()

        const imageTree = plot(tree as any)

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

        const hast = render(imageTree) as any
        const svgContent = toHtml(hast)

        parsedLayers.push({
          id: raw.name,
          filename: raw.name,
          displayName: meta.displayName,
          type: meta.type,
          side: meta.side,
          color: meta.color,
          order: meta.order,
          visible: meta.type !== 'drawing', // Hide drawing/sheet notes by default
          svgContent,
          size,
          units: imageTree.units || 'mm',
          outlineMaxStroke
        })
      } catch (err) {
        console.warn(`Skipping unparseable file: ${raw.name}`, err)
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
    }
  }
}
