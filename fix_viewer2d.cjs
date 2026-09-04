const fs = require('fs');
let text = fs.readFileSync('src/modules/viewer2d/Viewer2D.tsx', 'utf-8');
text = text.replace(
  "const outlineLayer = boardState.layers.find((l) => l.type === 'outline')",
  `const outlineLayers = boardState.layers.filter((l) => l.type === 'outline')
            const outlineLayer = outlineLayers.length > 0 ? outlineLayers.reduce((prev, curr) => {
              const prevArea = (prev.size[2] - prev.size[0]) * (prev.size[3] - prev.size[1])
              const currArea = (curr.size[2] - curr.size[0]) * (curr.size[3] - curr.size[1])
              return currArea > prevArea ? curr : prev
            }) : undefined`
);
fs.writeFileSync('src/modules/viewer2d/Viewer2D.tsx', text);
