const fs = require('fs');
const unrar = require('node-unrar-js');
const { createParser } = require('@tracespace/parser');
const { plot } = require('@tracespace/plotter');

async function run() {
  const buf = fs.readFileSync('D:/JobDatMach/Tieu Hoai Van/2026/29-08/TBL0225-2B-DIF_ADAPTER_CAM_DFM_REVA_20260828.rar');
  const wasmBuf = fs.readFileSync('node_modules/node-unrar-js/esm/js/unrar.wasm');
  const extractor = await unrar.createExtractorFromData({ data: buf, wasmBinary: wasmBuf });
  const extracted = extractor.extract();
  for (const file of extracted.files) {
    if (file.fileHeader.name.includes('DRILL-1-2.drl')) {
      const content = new TextDecoder().decode(file.extraction);
      const parser = createParser();
      parser.feed(content);
      const tree = plot(parser.results());
      console.log('Bounds:', tree.size);
    }
  }
}
run().catch(console.error);
