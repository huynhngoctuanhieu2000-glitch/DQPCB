const fs = require('fs');

function fixParser() {
  let text = fs.readFileSync('src/core/GerberParser.ts', 'utf-8');
  text = text.replace(
    '  let curYStr = "0"',
    '  let curYStr = "0"\n  let intDigits = isMetric ? 3 : 2'
  );
  
  text = text.replace(
    /if \(!lineTrim \|\| lineTrim === '%' \|\| lineTrim === 'M48' \|\| lineTrim === 'M30' \|\| lineTrim === 'G90'\) continue/,
    `if (!lineTrim || lineTrim === '%' || lineTrim === 'M48' || lineTrim === 'M30' || lineTrim === 'G90') continue

    // Parse FILE_FORMAT if present (e.g., ;FILE_FORMAT=4:4 or ;FILE_FORMAT=2:5)
    const fmtMatch = lineTrim.match(/;FILE_FORMAT=(\\d+):(\\d+)/i)
    if (fmtMatch) {
      intDigits = parseInt(fmtMatch[1], 10)
      continue
    }`
  );
  
  // Replace parseCoord logic inside coordMatch
  text = text.replace(
    /if \(str\.length >= 2\) \{\s*const intPart = str\.substring\(0, 2\)\s*const fracPart = str\.substring\(2\)\s*return parseFloat\(intPart \+ '\.' \+ fracPart\) \* sign\s*\}/g,
    `if (str.length >= intDigits) {
             const intPart = str.substring(0, intDigits)
             const fracPart = str.substring(intDigits)
             return parseFloat(intPart + '.' + fracPart) * sign
           }
           // Fallback if shorter than intDigits (e.g. '0' or '1')
           return parseFloat(str) * sign`
  );
  
  fs.writeFileSync('src/core/GerberParser.ts', text);
}
fixParser();
