import JSZip from 'jszip'
import fs from 'fs'
import { createParser } from '@tracespace/parser'
import { plot } from '@tracespace/plotter'
import { render } from '@tracespace/renderer'
import { toHtml } from 'hast-util-to-html'

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
  let globalMinX = Infinity, globalMinY = Infinity, globalMaxX = -Infinity, globalMaxY = -Infinity;
  const layers: any[] = [];
  
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    let content = await entry.async('string');
    if (/%FS[LT]?I/i.test(content)) {
      content = convertIncrementalToAbsolute(content);
    }
    const parser = createParser();
    parser.feed(content);
    const tree = plot(parser.results() as any);
    
    // mimic loop
    let size = [0,0,0,0];
    if (tree.size && tree.size.length === 4) {
      size = [tree.size[0], tree.size[1], tree.size[2], tree.size[3]];
      if (size[2]-size[0] > 0.1 || size[3]-size[1] > 0.1) {
        const scale = tree.units === 'in' ? 25.4 : 1;
        globalMinX = Math.min(globalMinX, size[0] * scale);
        globalMinY = Math.min(globalMinY, size[1] * scale);
        globalMaxX = Math.max(globalMaxX, size[2] * scale);
        globalMaxY = Math.max(globalMaxY, size[3] * scale);
      }
    }
    const svgStr = toHtml(render(tree) as any);
    layers.push({ name, units: tree.units || 'mm', size, svgStr });
  }
  
  let widthMM = 0, heightMM = 0;
  const outlineLayer = layers.find(l => l.name.toLowerCase().includes('outline'));
  if (outlineLayer && outlineLayer.size[2] > outlineLayer.size[0]) {
    const scale = outlineLayer.units === 'in' ? 25.4 : 1;
    globalMinX = outlineLayer.size[0] * scale;
    globalMinY = outlineLayer.size[1] * scale;
    globalMaxX = outlineLayer.size[2] * scale;
    globalMaxY = outlineLayer.size[3] * scale;
  }
  widthMM = globalMaxX - globalMinX;
  heightMM = globalMaxY - globalMinY;
  
  console.log({ globalMinX, globalMinY, globalMaxX, globalMaxY, widthMM, heightMM });
  
  for (const layer of layers) {
    const scale = layer.units === 'in' ? 1/25.4 : 1;
    const vbMinX = globalMinX * scale;
    // THIS IS THE LINE IN Viewer2D:
    const vbMinY = -(globalMinY + heightMM) * scale; 
    const vbWidth = widthMM * scale;
    const vbHeight = heightMM * scale;
    const viewBoxStr = `${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`;
    
    console.log(`Layer: ${layer.name}`);
    console.log(`Native size: ${layer.size}`);
    console.log(`Units: ${layer.units}`);
    console.log(`Computed viewBox: ${viewBoxStr}`);
    
    const match = layer.svgStr.match(/viewBox="([^"]*)"/);
    console.log(`Native viewBox: ${match ? match[1] : 'none'}`);
    console.log('---');
  }
}
run();
