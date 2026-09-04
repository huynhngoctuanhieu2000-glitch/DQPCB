const fs = require('fs');
const unrar = require('node-unrar-js');
async function run() {
  const buf1 = fs.readFileSync('D:/JobDatMach/Phan Van Thi/2026/29-08/Project Outputs for PCB_LED_3SEG_TM1650.rar');
  const wasmBuf = fs.readFileSync('node_modules/node-unrar-js/esm/js/unrar.wasm');
  let extractor = await unrar.createExtractorFromData({ data: buf1, wasmBinary: wasmBuf });
  let extracted = extractor.extract();
  console.log("=== RAR 1: PCB_LED_3SEG_TM1650 ===");
  for (const file of extracted.files) {
    if (!file.fileHeader.flags.directory) {
      console.log("- " + file.fileHeader.name);
    }
  }

  const buf2 = fs.readFileSync('D:/JobDatMach/Phan Van Thi/2026/29-08/Project Outputs for SDNL_CR3200_ALL_OXY.rar');
  extractor = await unrar.createExtractorFromData({ data: buf2, wasmBinary: wasmBuf });
  extracted = extractor.extract();
  console.log("\n=== RAR 2: SDNL_CR3200_ALL_OXY ===");
  for (const file of extracted.files) {
    if (!file.fileHeader.flags.directory) {
      console.log("- " + file.fileHeader.name);
    }
  }
}
run().catch(console.error);
