const fs = require('fs');
const unrar = require('node-unrar-js');
const { createParser } = require('@tracespace/parser');
const { plot } = require('@tracespace/plotter');

function convertExcellonToGerber(text, projectUnits) {
  const lines = text.split(/\r?\n/)
  const isMetric = /METRIC/i.test(text) || projectUnits === 'mm'
  const units = isMetric ? '%MOMM*%' : '%MOIN*%'

  const tools = new Map()
  const bodyCommands = []
  
  let curXNum = 0
  let curYNum = 0

  for (const dLine of lines) {
    const lineTrim = dLine.trim()
    if (!lineTrim || lineTrim === '%' || lineTrim === 'M48' || lineTrim === 'M30' || lineTrim === 'G90') continue

    const defMatch = lineTrim.match(/^T(\d+)C([0-9\.]+)/i)
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

    if (lineTrim.startsWith('X') || lineTrim.startsWith('Y')) {
      let xNum = curXNum
      let yNum = curYNum
      let matched = false
      const xMatch = lineTrim.match(/X([+-]?\d+)/i)
      if (xMatch) {
        let valStr = xMatch[1]
        let numVal = parseFloat(valStr)
        if (numVal > 1000) numVal = numVal / 10000
        xNum = numVal
        matched = true
      }
      const yMatch = lineTrim.match(/Y([+-]?\d+)/i)
      if (yMatch) {
        let valStr = yMatch[1]
        let numVal = parseFloat(valStr)
        if (numVal > 1000) numVal = numVal / 10000
        yNum = numVal
        matched = true
      }

      if (matched) {
        curXNum = xNum
        curYNum = yNum
        let mx = xNum
        let my = yNum
        let formattedX = Math.round(mx * 10000).toString().padStart(6, '0')
        let formattedY = Math.round(my * 10000).toString().padStart(6, '0')
        bodyCommands.push(`X${formattedX}Y${formattedY}D03*`)
      }
    }
  }

  if (tools.size === 0 && bodyCommands.length === 0) return text;

  let gerber = `%FSLAX24Y24*%\n`
  gerber += `${units}\n`
  for (const [tNum, info] of tools.entries()) {
    gerber += `%ADD${info.dCode}C,${info.diameter.toFixed(4)}*%\n`
  }
  gerber += bodyCommands.join('\n') + '\n'
  gerber += `M02*\n`
  return gerber
}

async function run() {
  const buf = fs.readFileSync('D:/JobDatMach/Phan Van Thi/2026/29-08/Project Outputs for PCB_LED_3SEG_TM1650.rar');
  const wasmBuf = fs.readFileSync('node_modules/node-unrar-js/esm/js/unrar.wasm');
  const extractor = await unrar.createExtractorFromData({ data: buf, wasmBinary: wasmBuf });
  const extracted = extractor.extract();
  
  for (const file of extracted.files) {
    if (file.fileHeader.name.endsWith('PCB_LED_3SEG_TM1650.TXT')) {
      let content = new TextDecoder().decode(file.extraction);
      content = convertExcellonToGerber(content, 'mm');
      const parser = createParser();
      parser.feed(content);
      const tree = plot(parser.results());
      console.log(`Parsed PCB_LED_3SEG_TM1650.TXT OK, bounds:`, tree.size, 'children:', tree.children.length);
    }
  }
}
run().catch(console.error);
