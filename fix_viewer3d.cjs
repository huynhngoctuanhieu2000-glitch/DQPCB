const fs = require('fs');
let text = fs.readFileSync('src/modules/viewer3d/Viewer3D.tsx', 'utf-8');

// Replace color assignments for realism
text = text.replace(
  /if \(layer\.type === 'copper'\) {[\s\S]*?} else if \(layer\.type === 'soldermask'\) {[\s\S]*?}/,
  `if (layer.type === 'copper') {
            strokeFill = '#2a6a3a' // Darker green trace relief under mask
          } else if (layer.type === 'silkscreen') {
            strokeFill = selectedColor === 'White' ? '#111827' : '#ffffff'
          } else if (layer.type === 'outline') {
            strokeFill = 'rgba(0,0,0,0)' // Hide outline in texture mapping to avoid artifacts
          } else if (layer.type === 'drill') {
            strokeFill = '#0a0a0a' // Punch holes
          } else if (layer.type === 'soldermask') {
            strokeFill = '#d4af37' // Exposed shiny gold/copper pads!
          }`
);

fs.writeFileSync('src/modules/viewer3d/Viewer3D.tsx', text);
