const fs = require('fs'); 
const unrar = require('node-unrar-js'); 
const { createParser } = require('@tracespace/parser'); 
const { plot } = require('@tracespace/plotter'); 
const { render } = require('@tracespace/renderer'); 
const { toHtml } = require('hast-util-to-html'); 

async function run() { 
  const buf = fs.readFileSync('D:/JobDatMach/Tieu Hoai Van/2026/29-08/TBL0225-2B-DIF_ADAPTER_CAM_DFM_REVA_20260828.rar'); 
  const wasmBuf = fs.readFileSync('node_modules/node-unrar-js/esm/js/unrar.wasm'); 
  
  const extractor = await unrar.createExtractorFromData({ 
    data: buf, 
    wasmBinary: wasmBuf 
  }); 
  
  const extracted = extractor.extract(); 
  
  let hasDrill = false;
  let outlinePathStr = '';
  
  for (const file of extracted.files) { 
    if (!file.fileHeader.flags.directory && file.extraction) { 
      const name = file.fileHeader.name; 
      const content = new TextDecoder().decode(file.extraction); 
      
      const parser = createParser(); 
      parser.feed(content); 
      const tree = plot(parser.results()); 
      
      console.log('\n--- File: ' + name + ' ---'); 
      console.log('Bounds:', tree.size); 
      
      const lower = name.toLowerCase();
      if (lower.includes('outline') || lower.includes('gko') || lower.endsWith('.gm1')) { 
        const svgStr = toHtml(render(tree)); 
        const paths = svgStr.match(/d="([^"]+)"/g) || []; 
        console.log('Outline paths count:', paths.length); 
        paths.slice(0, 3).forEach(p => console.log('  ' + p.substring(0, 50) + '...')); 
      }
      
      if (lower.endsWith('.tap') || lower.endsWith('.drl') || lower.endsWith('.txt')) {
         hasDrill = true;
         console.log('Is Drill file! Does it have %MO or METRIC?');
         console.log('Includes METRIC:', /METRIC/.test(content));
         console.log('Includes %MO:', /%MO/.test(content));
         if (!/%MO/.test(content) && !/METRIC/.test(content)) {
            console.log('Missing units in drill! Convert Excellon to Gerber?');
         }
      }
    } 
  } 
} 
run().catch(console.error);
