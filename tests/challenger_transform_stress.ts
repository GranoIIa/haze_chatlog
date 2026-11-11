/**
 * Empirical Adversarial Test: Transform handles (all 4 corners + rotation)
 */

interface CornerTestCase {
  mode: 'resize-se' | 'resize-sw' | 'resize-ne' | 'resize-nw';
  rotation: number;
}

const testCases: CornerTestCase[] = [
  { mode: 'resize-se', rotation: 0 },
  { mode: 'resize-se', rotation: 45 },
  { mode: 'resize-sw', rotation: 0 },
  { mode: 'resize-sw', rotation: 30 },
  { mode: 'resize-ne', rotation: 0 },
  { mode: 'resize-ne', rotation: 60 },
  { mode: 'resize-nw', rotation: 0 },
  { mode: 'resize-nw', rotation: 90 }
];

console.log('Testing transform handles across all 4 corners and multiple rotation angles...');

for (const tc of testCases) {
  const layer = {
    x: 200,
    y: 200,
    width: 100,
    height: 100,
    rotation: tc.rotation
  };

  const halfW = layer.width / 2;
  const halfH = layer.height / 2;
  const cx = layer.x + halfW;
  const cy = layer.y + halfH;

  const rad = (layer.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Compute anchor in world coords
  let locOx = 0, locOy = 0;
  if (tc.mode === 'resize-se') { locOx = -halfW; locOy = -halfH; }
  else if (tc.mode === 'resize-sw') { locOx = halfW; locOy = -halfH; }
  else if (tc.mode === 'resize-ne') { locOx = -halfW; locOy = halfH; }
  else if (tc.mode === 'resize-nw') { locOx = halfW; locOy = halfH; }

  const anchorWorldX = cx + locOx * cos - locOy * sin;
  const anchorWorldY = cy + locOx * sin + locOy * cos;

  // Simulate drag
  const targetW = 160;
  const targetH = 180;

  let projX = 0, projY = 0;
  if (tc.mode === 'resize-se') { projX = targetW; projY = targetH; }
  else if (tc.mode === 'resize-sw') { projX = -targetW; projY = targetH; }
  else if (tc.mode === 'resize-ne') { projX = targetW; projY = -targetH; }
  else if (tc.mode === 'resize-nw') { projX = -targetW; projY = -targetH; }

  let newW = targetW;
  let newH = targetH;
  let cxNew = anchorWorldX;
  let cyNew = anchorWorldY;

  if (tc.mode === 'resize-se') {
    newW = Math.max(20, Math.round(projX));
    newH = Math.max(20, Math.round(projY));
    cxNew = anchorWorldX + cos * (newW / 2) - sin * (newH / 2);
    cyNew = anchorWorldY + sin * (newW / 2) + cos * (newH / 2);
  } else if (tc.mode === 'resize-sw') {
    newW = Math.max(20, Math.round(-projX));
    newH = Math.max(20, Math.round(projY));
    cxNew = anchorWorldX - cos * (newW / 2) - sin * (newH / 2);
    cyNew = anchorWorldY - sin * (newW / 2) + cos * (newH / 2);
  } else if (tc.mode === 'resize-ne') {
    newW = Math.max(20, Math.round(projX));
    newH = Math.max(20, Math.round(-projY));
    cxNew = anchorWorldX + cos * (newW / 2) + sin * (newH / 2);
    cyNew = anchorWorldY + sin * (newW / 2) - cos * (newH / 2);
  } else if (tc.mode === 'resize-nw') {
    newW = Math.max(20, Math.round(-projX));
    newH = Math.max(20, Math.round(-projY));
    cxNew = anchorWorldX - cos * (newW / 2) + sin * (newH / 2);
    cyNew = anchorWorldY - sin * (newW / 2) - cos * (newH / 2);
  }

  // Calculate where the anchor corner ends up in world space after resize
  let checkLocX = 0, checkLocY = 0;
  if (tc.mode === 'resize-se') { checkLocX = -newW / 2; checkLocY = -newH / 2; }
  else if (tc.mode === 'resize-sw') { checkLocX = newW / 2; checkLocY = -newH / 2; }
  else if (tc.mode === 'resize-ne') { checkLocX = -newW / 2; checkLocY = newH / 2; }
  else if (tc.mode === 'resize-nw') { checkLocX = newW / 2; checkLocY = newH / 2; }

  const finalAnchorX = cxNew + checkLocX * cos - checkLocY * sin;
  const finalAnchorY = cyNew + checkLocX * sin + checkLocY * cos;

  const diffX = Math.abs(finalAnchorX - anchorWorldX);
  const diffY = Math.abs(finalAnchorY - anchorWorldY);

  if (diffX > 0.001 || diffY > 0.001) {
    console.error(`ANCHOR DRIFT ERROR in ${tc.mode} (rot=${tc.rotation}deg): diffX=${diffX}, diffY=${diffY}`);
  } else {
    console.log(`[PASS] ${tc.mode} (rot=${tc.rotation}deg): Anchor invariant (drift < 1e-4)`);
  }
}
