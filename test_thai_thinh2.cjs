const fs = require('fs');
const unrar = require('node-unrar-js');
const { createParser } = require('@tracespace/parser');
const { plot } = require('@tracespace/plotter');

function convertExcellonToGerber(text, projectUnits) {
  const lines = text.split(/\r?\n/);
  const isMetric = /METRIC/i.test(text) || projectUnits === 'mm';
  const units = isMetric ? '%MOMM*%' : '%MOIN*%';
  const tools = new Map();
  const bodyCommands = [];
  let curXStr = '0';
  let curYStr = '0';

  for (const dLine of lines) {
    const lineTrim = dLine.trim();
    if (!lineTrim || lineTrim === '%' || lineTrim === 'M48' || lineTrim === 'M30' || lineTrim === 'G90') continue;

    const defMatch = lineTrim.match(/^T(\d+).*?C([0-9\.]+)/i);
    if (defMatch) {
      const tNum = parseInt(defMatch[1], 10);
      const diameter = parseFloat(defMatch[2]);
      const dCode = 10 + tNum;
      tools.set(tNum, { dCode, diameter });
      continue;
    }

    const toolMatch = lineTrim.match(/^T(\d+)$/i);
    if (toolMatch) {
      const tNum = parseInt(toolMatch[1], 10);
      const toolInfo = tools.get(tNum);
      if (toolInfo) {
        bodyCommands.push(`D${toolInfo.dCode}*`);
      }
      continue;
    }

    if (lineTrim.startsWith('X') || lineTrim.startsWith('Y')) {
      let xStr = curXStr;
      let yStr = curYStr;
      let matched = false;
      const xMatch = lineTrim.match(/X([+-]?\d+)/i);
      if (xMatch) {
        xStr = xMatch[1];
        matched = true;
      }
      const yMatch = lineTrim.match(/Y([+-]?\d+)/i);
      if (yMatch) {
        yStr = yMatch[1];
        matched = true;
      }

      if (matched) {
        curXStr = xStr;
        curYStr = yStr;

        let parseCoord = (str) => {
          let sign = 1;
          if (str.startsWith('-')) { sign = -1; str = str.substring(1); }
          else if (str.startsWith('+')) { str = str.substring(1); }
          
          if (str.includes('.')) return parseFloat(str) * sign;
          
          if (str.length >= 2) {
            const intPart = str.substring(0, 2);
            const fracPart = str.substring(2);
            return parseFloat(intPart + '.' + fracPart) * sign;
          }
          return parseFloat(str) * sign;
        };

        let mx = parseCoord(xStr);
        let my = parseCoord(yStr);

        let formattedX = Math.round(mx * 10000).toString().padStart(6, '0');
        let formattedY = Math.round(my * 10000).toString().padStart(6, '0');
        bodyCommands.push(`X${formattedX}Y${formattedY}D03*`);
      }
      continue;
    }
  }

  if (tools.size === 0 && bodyCommands.length === 0) return text;

  let gerber = `%FSLAX24Y24*%\n`;
  gerber += `${units}\n`;
  for (const [tNum, info] of tools.entries()) {
    gerber += `%ADD${info.dCode}C,${info.diameter.toFixed(4)}*%\n`;
  }
  gerber += bodyCommands.join('\n') + '\n';
  gerber += `M02*\n`;
  return gerber;
}

async function run() {
  const buf = fs.readFileSync('D:/JobDatMach/Thai Thinh/2026/04-09/Gerber.rar');
  const wasmBuf = fs.readFileSync('node_modules/node-unrar-js/esm/js/unrar.wasm');
  const extractor = await unrar.createExtractorFromData({ data: buf, wasmBinary: wasmBuf });
  const extracted = extractor.extract();

  for (const f of extracted.files) {
    if (f.fileHeader.name.endsWith('PCB2-RoundHoles.TXT')) {
      let content = new TextDecoder('utf-8').decode(f.extraction);
      console.log('--- ORIGINAL EXCELLON ---\n' + content.split('\n').slice(0, 20).join('\n'));
      content = convertExcellonToGerber(content, 'mm');
      console.log('\n--- CONVERTED GERBER ---\n' + content.split('\n').slice(0, 20).join('\n'));
      const parser = createParser();
      parser.feed(content);
      const tree = plot(parser.results());
      console.log('Bounds:', tree.size, 'Children:', tree.children.length);
    }
  }
}
run().catch(console.error);
