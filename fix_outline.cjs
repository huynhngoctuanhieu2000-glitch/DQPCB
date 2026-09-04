const fs = require('fs');

function fixOutline() {
  let text = fs.readFileSync('src/core/GerberParser.ts', 'utf-8');
  
  const oldLogic = `const outlineLayer = parsedLayers.find((l) => l.type === 'outline')`;
  
  const newLogic = `const outlineLayers = parsedLayers.filter((l) => l.type === 'outline')
    let outlineLayer = undefined;
    if (outlineLayers.length > 0) {
      // Pick the outline layer with the largest bounding box area
      outlineLayer = outlineLayers.reduce((prev, current) => {
        const prevArea = (prev.size[2] - prev.size[0]) * (prev.size[3] - prev.size[1])
        const currArea = (current.size[2] - current.size[0]) * (current.size[3] - current.size[1])
        return currArea > prevArea ? current : prev
      })
    }`;
    
  text = text.replace(oldLogic, newLogic);
  
  fs.writeFileSync('src/core/GerberParser.ts', text);
}
fixOutline();
