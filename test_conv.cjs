const fs = require('fs');
const unrar = require('node-unrar-js');

function convertExcellonToGerber(text, projectUnits) {
  const lines = text.split(/\r?\n/)
  const isMetric = /METRIC/i.test(text) || projectUnits === 'mm'
  const units = isMetric ? '%MOMM*%' : '%MOIN*%'

  const tools = new Map()
  const bodyCommands = []

  for (const dLine of lines) {
    const lineTrim = dLine.trim()
    if (!lineTrim || lineTrim === '%' || lineTrim === 'M48' || lineTrim === 'M30') continue

    const defMatch = lineTrim.match(/^T(\d+)C([0-9\.]+)/i)
    if (defMatch) {
      const tNum = parseInt(defMatch[1], 10)
      const diameter = parseFloat(defMatch[2])
      const dCode = 10 + tNum
      tools.set(tNum, { dCode, diameter })
      bodyCommands.push('D' + dCode + '*')
      continue
    }

    const selMatch = lineTrim.match(/^T(\d+)$/i)
    if (selMatch) {
      const tNum = parseInt(selMatch[1], 10)
      const tool = tools.get(tNum)
      if (tool) bodyCommands.push('D' + tool.dCode + '*')
      continue
    }

    const coordMatch = lineTrim.match(/^(?:X([+-]?\d+))?(?:Y([+-]?\d+))?$/i)
    if (coordMatch && (coordMatch[1] || coordMatch[2])) {
      let cmd = ''
      if (coordMatch[1]) cmd += 'X' + coordMatch[1]
      if (coordMatch[2]) cmd += 'Y' + coordMatch[2]
      cmd += 'D03*'
      bodyCommands.push(cmd)
    }
  }

  if (tools.size === 0 && bodyCommands.length === 0) return text
  
  const toolDefs = Array.from(tools.values())
    .map((t) => '%ADD' + t.dCode + 'C,' + t.diameter + '*%')
    .join('\n')

  return units + '\n%FSLAX24Y24*%\n' + toolDefs + '\n' + bodyCommands.join('\n') + '\nM02*\n'
}

async function run() {
  const buf = fs.readFileSync('D:/JobDatMach/Tieu Hoai Van/2026/29-08/TBL0225-2B-DIF_ADAPTER_CAM_DFM_REVA_20260828.rar');
  const wasmBuf = fs.readFileSync('node_modules/node-unrar-js/esm/js/unrar.wasm');
  const extractor = await unrar.createExtractorFromData({ data: buf, wasmBinary: wasmBuf });
  const extracted = extractor.extract();
  for (const file of extracted.files) {
    if (file.fileHeader.name.includes('DRILL-1-2.drl')) {
      const content = new TextDecoder().decode(file.extraction);
      console.log("--- ORIGINAL ---");
      console.log(content.substring(0, 300));
      console.log("--- CONVERTED ---");
      console.log(convertExcellonToGerber(content, 'mm').substring(0, 300));
    }
  }
}
run().catch(console.error);
