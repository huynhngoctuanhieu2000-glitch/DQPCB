const fs = require('fs');
const unrar = require('node-unrar-js');
const { createParser } = require('@tracespace/parser');
const { plot } = require('@tracespace/plotter');

async function run() {
  const buf = fs.readFileSync('D:/JobDatMach/Phan Van Thi/2026/29-08/Project Outputs for PCB_LED_3SEG_TM1650.rar');
  const wasmBuf = fs.readFileSync('node_modules/node-unrar-js/esm/js/unrar.wasm');
  const extractor = await unrar.createExtractorFromData({ data: buf, wasmBinary: wasmBuf });
  const extracted = extractor.extract();
  
  for (const file of extracted.files) {
    if (file.fileHeader.flags.directory) continue;
    const name = file.fileHeader.name;
    const lower = name.toLowerCase();
    
    // Test parsing
    if (lower.endsWith('.gbr') || lower.endsWith('.gtl') || lower.endsWith('.gbl') || lower.endsWith('.gto') || lower.endsWith('.gbo') || lower.endsWith('.gko') || lower.endsWith('.txt')) {
       try {
         const content = new TextDecoder().decode(file.extraction);
         const parser = createParser();
         parser.feed(content);
         const tree = plot(parser.results());
         console.log(`Parsed ${name} OK, bounds:`, tree.size);
       } catch (err) {
         console.log(`ERROR parsing ${name}:`, err.message);
       }
    }
  }
}
run().catch(console.error);
