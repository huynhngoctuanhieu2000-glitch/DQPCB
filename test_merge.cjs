const fs = require('fs');

function mergePathsToPolygon(d) {
  const regex = /M\s*([-.\d]+)[\s,]+([-.\d]+)\s*L\s*([-.\d]+)[\s,]+([-.\d]+)/g;
  let match;
  const segments = [];
  while ((match = regex.exec(d)) !== null) {
    segments.push({
      x1: parseFloat(match[1]), y1: parseFloat(match[2]),
      x2: parseFloat(match[3]), y2: parseFloat(match[4]),
      used: false
    });
  }
  
  if (segments.length === 0) return '';
  
  let currentPoly = [];
  let firstSeg = segments[0];
  firstSeg.used = true;
  currentPoly.push({ x: firstSeg.x1, y: firstSeg.y1 });
  let currentPt = { x: firstSeg.x2, y: firstSeg.y2 };
  
  const TOL = 0.005;
  const isMatch = (p1, p2) => Math.abs(p1.x - p2.x) < TOL && Math.abs(p1.y - p2.y) < TOL;

  let closed = false;
  for (let i = 0; i < segments.length; i++) {
    currentPoly.push({ x: currentPt.x, y: currentPt.y });
    
    if (isMatch(currentPt, currentPoly[0])) {
      closed = true;
      break;
    }
    
    let found = false;
    for (let j = 0; j < segments.length; j++) {
      let seg = segments[j];
      if (seg.used) continue;
      
      if (isMatch(currentPt, {x: seg.x1, y: seg.y1})) {
        currentPt = {x: seg.x2, y: seg.y2};
        seg.used = true;
        found = true;
        console.log(`Matched start of seg ${j} -> new pt:`, currentPt);
        break;
      } else if (isMatch(currentPt, {x: seg.x2, y: seg.y2})) {
        currentPt = {x: seg.x1, y: seg.y1};
        seg.used = true;
        found = true;
        console.log(`Matched end of seg ${j} -> new pt:`, currentPt);
        break;
      }
    }
    
    if (!found) {
        console.log("Could not find match for pt:", currentPt);
        break;
    }
  }
  
  console.log("Poly length:", currentPoly.length, "closed:", closed);
  if (currentPoly.length > 2 && closed) {
    let dStr = `M ${currentPoly[0].x} ${currentPoly[0].y} `;
    for (let i = 1; i < currentPoly.length; i++) {
      dStr += `L ${currentPoly[i].x} ${currentPoly[i].y} `;
    }
    dStr += 'Z';
    return dStr;
  }
  return '';
}

const d = "M1 -1L2.61417 -1M1 -1L1 -1.29528M2.61417 -1L2.61417 -1.29528M2.61417 -1.49213L2.69291 -1.49213M2.61417 -1.29528L2.69291 -1.29528M2.61417 -1.49213L2.61417 -1.7874M0.92126 -1.295L0.92126 -1.49213M1 -1.295L1 -1.29528M0.92126 -1.29528L1 -1.29528M0.92126 -1.49213L1 -1.49213L1 -1.7874L2.61417 -1.7874M2.69291 -1.29528L2.69291 -1.49213";
console.log(mergePathsToPolygon(d));
