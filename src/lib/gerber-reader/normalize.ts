/**
 * Chuẩn hoá nội dung file trước khi đưa cho web-gerber: đơn vị, danh sách aperture
 * của OrCAD, toạ độ tương đối (G91) → tuyệt đối.
 *
 * [DQPCB] Toàn bộ file này là của DQPCB.
 */

export function detectFileUnits(content: string): 'mm' | 'in' | null {
  if (/%MOMM\*%|G71\*|METRIC/i.test(content)) return 'mm'
  if (/%MOIN\*%|G70\*|INCH/i.test(content)) return 'in'
  return null
}

// Parse OrCAD Aperture List (.lis / .rep / .apt)
export function parseApertureList(lisText: string): string[] {
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
export function convertIncrementalToAbsolute(content: string): string {
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
 * [DQPCB] Khai báo aperture còn thiếu (dùng `Dnn` ≥ 10 mà không có `%ADDnn…%`) bằng nét tròn
 * mảnh 0.1 mm. Chỉ dùng cho lớp viền: bo "Dao Quoc Thai 5pcs" (22/09/2026) vẽ viền bằng D37
 * không khai báo, web-gerber tự cho nét 0.069 in (1.75 mm) — CAM vẽ khung viền dày cộp và
 * kích thước cộng thêm nửa nét đó. Viền chỉ cần đường tâm nên nét mảnh là đúng.
 */
export function defineMissingApertures(content: string): string {
  const defined = new Set([...content.matchAll(/%ADD(\d+)/g)].map((m) => Number(m[1])))
  const used = new Set(
    [...content.matchAll(/(?:G54)?D(\d+)\*/g)].map((m) => Number(m[1])).filter((d) => d >= 10 && !defined.has(d)),
  )
  if (used.size === 0) return content
  const width = /%MOIN/i.test(content) ? '0.0039' : '0.1'
  const defs = [...used].map((d) => `%ADD${d}C,${width}*%`).join('\n')
  // Chèn sau khai báo đơn vị (hoặc định dạng số) để aperture có sẵn trước lần dùng đầu tiên.
  const anchor = content.match(/%MO(?:IN|MM)\*%/i) ?? content.match(/%FS[^%]*%/i)
  if (!anchor || anchor.index === undefined) return defs + '\n' + content
  const at = anchor.index + anchor[0].length
  return content.slice(0, at) + '\n' + defs + content.slice(at)
}
