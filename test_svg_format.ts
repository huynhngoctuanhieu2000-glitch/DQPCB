import JSZip from 'jszip'
import fs from 'fs'
import { createParser } from '@tracespace/parser'
import { plot } from '@tracespace/plotter'
import { render } from '@tracespace/renderer'
import { toHtml } from 'hast-util-to-html'

async function run() {
  const buf = fs.readFileSync('D:/JobDatMach/Nhat Truong/2026/29-08/NHAT TRUONG 40PCS GREEN HGV_V4 1X2.zip');
  const zip = await JSZip.loadAsync(buf);
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir && name.endsWith('OUTLINE.gbr')) {
      const content = await entry.async('string');
      const parser = createParser();
      parser.feed(content);
      const tree = plot(parser.results() as any);
      const svgStr = toHtml(render(tree) as any);
      console.log(svgStr.substring(0, 500));
      break;
    }
  }
}
run();
