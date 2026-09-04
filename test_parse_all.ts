import JSZip from 'jszip'
import fs from 'fs'
import { createParser } from '@tracespace/parser'
import { plot } from '@tracespace/plotter'

function convertIncrementalToAbsolute(content: string): string {
  let curX = 0
  let curY = 0
  const lines = content.split(/\r?\n/)
  const outLines: string[] = []
  for (const rawLine of lines) {
    let line = rawLine.trim()
    if (!line || line.startsWith('G04') || line === 'M02*') { outLines.push(line); continue; }
    if (line.includes('%FS')) { outLines.push(line.replace(/%FS[LT]?I[^\*]*\*%/, '%FSLAX23Y23*%')); continue; }
    if (line.startsWith('%')) { outLines.push(line); continue; }
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

async function run() {
  const buf = fs.readFileSync('D:/JobDatMach/Nhat Truong/2026/29-08/NHAT TRUONG 40PCS GREEN HGV_V4 1X2.zip');
  const zip = await JSZip.loadAsync(buf);
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir && name.endsWith('.gbr')) {
      let content = await entry.async('string');
      content = convertIncrementalToAbsolute(content);
      const parser = createParser();
      parser.feed(content);
      try {
        const tree = plot(parser.results() as any);
        console.log(`Parsed ${name}: success, bounds:`, tree.size);
      } catch (err: any) {
        console.log(`Parsed ${name}: FAILED! ${err.message}`);
      }
    }
  }
}
run();
