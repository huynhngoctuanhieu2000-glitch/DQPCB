const fs = require('fs');
const unrar = require('node-unrar-js');
const { createParser } = require('@tracespace/parser');
const { plot } = require('@tracespace/plotter');
const { render } = require('@tracespace/renderer');
const { toHtml } = require('hast-util-to-html');

async function run() {
  const buf = fs.readFileSync('D:/JobDatMach/Phan Van Thi/2026/29-08/Project Outputs for PCB_LED_3SEG_TM1650.rar');
  const wasmBuf = fs.readFileSync('node_modules/node-unrar-js/esm/js/unrar.wasm');
  const extractor = await unrar.createExtractorFromData({ data: buf, wasmBinary: wasmBuf });
  const extracted = extractor.extract();
  
  for (const file of extracted.files) {
    if (file.fileHeader.name.endsWith('.GKO')) {
      const content = new TextDecoder().decode(file.extraction);
      const parser = createParser();
      parser.feed(content);
      const tree = plot(parser.results());
      
      console.log('Tree children count:', tree.children.length);
      const svgStr = toHtml(render(tree));
      const paths = svgStr.match(/<path[^>]+>/g) || [];
      console.log('Paths:', paths.length);
      paths.slice(0, 5).forEach(p => console.log('  ' + p));
    }
  }
}
run().catch(console.error);
