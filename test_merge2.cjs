const fs = require('fs');

function mergePathsToPolygon(d) {
  const cmds = d.match(/[ML][^ML]+/g);
  if (!cmds) return '';
  let currentPt = null;
  const segments = [];
  for (const cmd of cmds) {
     const type = cmd[0];
     const coords = cmd.substring(1).trim().split(/[\s,]+/);
     const pt = { x: parseFloat(coords[0]), y: parseFloat(coords[1]) };
     if (type === 'M') {
        currentPt = pt;
     } else if (type === 'L' && currentPt) {
        segments.push({ x1: currentPt.x, y1: currentPt.y, x2: pt.x, y2: pt.y, used: false });
        currentPt = pt;
     }
  }
  
  if (segments.length === 0) return '';
  
  let currentPoly = [];
  let firstSeg = segments[0];
  firstSeg.used = true;
  currentPoly.push({ x: firstSeg.x1, y: firstSeg.y1 });
  let tracePt = { x: firstSeg.x2, y: firstSeg.y2 };
  
  const TOL = 0.005;
  const isMatch = (p1, p2) => Math.abs(p1.x - p2.x) < TOL && Math.abs(p1.y - p2.y) < TOL;

  let closed = false;
  for (let i = 0; i < segments.length; i++) {
    currentPoly.push({ x: tracePt.x, y: tracePt.y });
    
    if (isMatch(tracePt, currentPoly[0])) {
      closed = true;
      break;
    }
    
    let found = false;
    for (let j = 0; j < segments.length; j++) {
      let seg = segments[j];
      if (seg.used) continue;
      
      if (isMatch(tracePt, {x: seg.x1, y: seg.y1})) {
        tracePt = {x: seg.x2, y: seg.y2};
        seg.used = true;
        found = true;
        break;
      } else if (isMatch(tracePt, {x: seg.x2, y: seg.y2})) {
        tracePt = {x: seg.x1, y: seg.y1};
        seg.used = true;
        found = true;
        break;
      }
    }
    
    if (!found) break; 
  }
  
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
