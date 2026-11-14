import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { geoToWorld } from '../data/nagaGeoData.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);

const WALL_PALETTE = {
  white: '#F4F3EE',
  cream: '#EFE7D4',
  sand: '#E3D3B6',
  sandstone: '#DDD0BA',
  warm: '#E6D9C7',
  ochre: '#D9C08F',
  terracotta: '#C8785B',
  sage: '#CDD9CC',
  slate: '#C5CDD4',
  limestone: '#E6E3DC',
  travertine: '#DFD7C8',
  charcoal: '#4A5563',
  coral: '#D8A295',
  teal: '#BCCECE',
};

// Shared unit templates (non-indexed for zero-overhead vertex color merging)
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10).toNonIndexed();

function createUnitRoofGeo(kind = 'hipped') {
  const pos = [];
  const uv = [];
  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, ua = 0, va = 0, ub = 1, vb = 0, uc = 0.5, vc = 1) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    uv.push(ua, va, ub, vb, uc, vc);
  };
  const hw = 0.5, hd = 0.5, h = 1;
  if (kind === 'gabled') {
    const rx = 0.5;
    pushTri(-hw, 0, hd, hw, 0, hd, rx, h, 0, 0, 0, 1, 0, 1, 1);
    pushTri(-hw, 0, hd, rx, h, 0, -rx, h, 0, 0, 0, 1, 1, 0, 1);
    pushTri(hw, 0, -hd, -hw, 0, -hd, -rx, h, 0, 0, 0, 1, 0, 1, 1);
    pushTri(hw, 0, -hd, -rx, h, 0, rx, h, 0, 0, 0, 1, 1, 0, 1);
    pushTri(-hw, 0, -hd, -hw, 0, hd, -rx, h, 0, 0, 0, 1, 0, 0.5, 1);
    pushTri(hw, 0, hd, hw, 0, -hd, rx, h, 0, 0, 0, 1, 0, 0.5, 1);
  } else if (kind === 'shed') {
    // Mono-pitch roof sloping down toward +Z
    pushTri(-hw, 0, hd, hw, 0, hd, hw, h, -hd, 0, 0, 1, 0, 1, 1);
    pushTri(-hw, 0, hd, hw, h, -hd, -hw, h, -hd, 0, 0, 1, 1, 0, 1);
    pushTri(-hw, 0, -hd, -hw, 0, hd, -hw, h, -hd, 0, 0, 1, 0, 0, 1);
    pushTri(hw, 0, hd, hw, 0, -hd, hw, h, -hd, 0, 0, 1, 0, 1, 1);
    pushTri(-hw, 0, -hd, hw, h, -hd, hw, 0, -hd, 0, 0, 1, 1, 1, 0);
    pushTri(-hw, 0, -hd, -hw, h, -hd, hw, h, -hd, 0, 0, 0, 1, 1, 1);
  } else {
    const rx = 0.25;
    pushTri(-hw, 0, hd, hw, 0, hd, rx, h, 0, 0, 0, 1, 0, 0.75, 1);
    pushTri(-hw, 0, hd, rx, h, 0, -rx, h, 0, 0, 0, 0.75, 1, 0.25, 1);
    pushTri(hw, 0, -hd, -hw, 0, -hd, -rx, h, 0, 0, 0, 1, 0, 0.75, 1);
    pushTri(hw, 0, -hd, -rx, h, 0, rx, h, 0, 0, 0, 0.75, 1, 0.25, 1);
    pushTri(-hw, 0, -hd, -hw, 0, hd, -rx, h, 0, 0, 0, 1, 0, 0.5, 1);
    pushTri(hw, 0, hd, hw, 0, -hd, rx, h, 0, 0, 0, 1, 0, 0.5, 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

const UNIT_HIP_ROOF = createUnitRoofGeo('hipped');
const UNIT_GABLE_ROOF = createUnitRoofGeo('gabled');
const UNIT_SHED_ROOF = createUnitRoofGeo('shed');

function hashBuilding(b) {
  let h = 2166136261;
  const str = b.id || `${b.lat},${b.lng}`;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function stampColoredPart(bucket, templateGeo, mat4, colorHex, uvScaleX = 1, uvScaleY = 1) {
  const g = templateGeo.clone();
  g.applyMatrix4(mat4);
  const count = g.attributes.position.count;

  if (uvScaleX !== 1 || uvScaleY !== 1) {
    const uv = g.attributes.uv;
    if (uv) {
      for (let i = 0; i < count; i++) {
        uv.setXY(i, uv.getX(i) * uvScaleX, uv.getY(i) * uvScaleY);
      }
    }
  }

  const col = new THREE.Color(colorHex);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));

  for (const attr of Object.keys(g.attributes)) {
    if (attr !== 'position' && attr !== 'normal' && attr !== 'uv' && attr !== 'color') {
      g.deleteAttribute(attr);
    }
  }
  bucket.push(g);
}

const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const tmpLocalMat = new THREE.Matrix4();
const tmpPartMat = new THREE.Matrix4();

function addLocalBox(bucket, groupMat, lx, ly, lz, sx, sy, sz, colorHex, uvX = 1, uvY = 1) {
  tmpVec.set(lx, ly, lz);
  tmpQuat.identity();
  tmpScale.set(sx, sy, sz);
  tmpLocalMat.compose(tmpVec, tmpQuat, tmpScale);
  tmpPartMat.multiplyMatrices(groupMat, tmpLocalMat);
  stampColoredPart(bucket, UNIT_BOX, tmpPartMat, colorHex, uvX, uvY);
}

function addLocalCyl(bucket, groupMat, lx, ly, lz, rx, sy, rz, colorHex) {
  tmpVec.set(lx, ly, lz);
  tmpQuat.identity();
  tmpScale.set(rx * 2, sy, rz * 2);
  tmpLocalMat.compose(tmpVec, tmpQuat, tmpScale);
  tmpPartMat.multiplyMatrices(groupMat, tmpLocalMat);
  stampColoredPart(bucket, UNIT_CYL, tmpPartMat, colorHex, 1, 1);
}

function addLocalRoof(bucket, groupMat, kind, lx, ly, lz, sx, sy, sz, colorHex, rotY = 0) {
  tmpVec.set(lx, ly, lz);
  if (rotY !== 0) tmpQuat.setFromAxisAngle(Y_AXIS, rotY);
  else tmpQuat.identity();
  tmpScale.set(sx, sy, sz);
  tmpLocalMat.compose(tmpVec, tmpQuat, tmpScale);
  tmpPartMat.multiplyMatrices(groupMat, tmpLocalMat);
  const geo = kind === 'gabled' ? UNIT_GABLE_ROOF : kind === 'shed' ? UNIT_SHED_ROOF : UNIT_HIP_ROOF;
  stampColoredPart(bucket, geo, tmpPartMat, colorHex, 1.5, 1.5);
}

function addExtrudedPolyPart(bucket, groupMat, pts, yBase, height, scaleXY, colorHex) {
  const shape = new THREE.Shape();
  pts.forEach(([px, pz], i) => {
    if (i === 0) shape.moveTo(px * scaleXY, -pz * scaleXY);
    else shape.lineTo(px * scaleXY, -pz * scaleXY);
  });
  shape.closePath();
  let geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, yBase, 0);
  if (geo.index) geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  stampColoredPart(bucket, geo, groupMat, colorHex, 1.5, 1.5);
  geo.dispose();
}

// ============================================================================
// STAGE 3: HYPERREALISTIC RESIDENTIAL ARCHITECTURAL GENERATORS (6 ARCHETYPES)
// ============================================================================

function addCompoundFenceAndGate(buckets, groupMat, w, d, wallHex, sideFlip, gateStyle = 0) {
  const zFront = d * 0.46;
  const xL = -w * 0.46;
  const xR = w * 0.46;
  const gateCx = sideFlip * w * 0.16;
  const gateHalf = w * 0.14;
  const postH = 0.022;
  const wallH = 0.015;
  const pierHex = '#D6D0C4';

  // Left and right front wall wings leaving gate gap cleanly open
  const gLeft = gateCx - gateHalf;
  const gRight = gateCx + gateHalf;
  const lenL = Math.max(0.008, gLeft - xL);
  const lenR = Math.max(0.008, xR - gRight);
  if (lenL > 0.010) {
    addLocalBox(buckets.stoneBrick, groupMat, (xL + gLeft) * 0.5, wallH * 0.5 + 0.004, zFront, lenL, wallH, 0.007, wallHex, 1.4, 0.7);
    addLocalBox(buckets.trim, groupMat, (xL + gLeft) * 0.5, wallH + 0.005, zFront, lenL + 0.002, 0.0025, 0.009, '#94A3B8');
  }
  if (lenR > 0.010) {
    addLocalBox(buckets.stoneBrick, groupMat, (gRight + xR) * 0.5, wallH * 0.5 + 0.004, zFront, lenR, wallH, 0.007, wallHex, 1.4, 0.7);
    addLocalBox(buckets.trim, groupMat, (gRight + xR) * 0.5, wallH + 0.005, zFront, lenR + 0.002, 0.0025, 0.009, '#94A3B8');
  }

  // Gate masonry pillars + caps
  addLocalBox(buckets.stoneBrick, groupMat, gLeft, postH * 0.5 + 0.004, zFront, 0.009, postH, 0.009, pierHex);
  addLocalBox(buckets.stoneBrick, groupMat, gRight, postH * 0.5 + 0.004, zFront, 0.009, postH, 0.009, pierHex);
  addLocalBox(buckets.accent, groupMat, gLeft, postH + 0.005, zFront, 0.012, 0.003, 0.012, '#64748B');
  addLocalBox(buckets.accent, groupMat, gRight, postH + 0.005, zFront, 0.012, 0.003, 0.012, '#64748B');

  // Corner fence posts & short side return walls
  addLocalBox(buckets.stoneBrick, groupMat, xL, wallH * 0.5 + 0.004, zFront - d * 0.14, 0.006, wallH, d * 0.28, wallHex, 1, 0.6);
  addLocalBox(buckets.stoneBrick, groupMat, xR, wallH * 0.5 + 0.004, zFront - d * 0.14, 0.006, wallH, d * 0.28, wallHex, 1, 0.6);

  // Steel-or-timber slatted residential gate
  const gateBucket = gateStyle === 0 ? buckets.woodCanopy : buckets.trim;
  const gateHex = gateStyle === 0 ? '#8C5835' : '#334155';
  addLocalBox(gateBucket, groupMat, gateCx, 0.014, zFront, gateHalf * 1.85, 0.016, 0.0035, gateHex);
  addLocalBox(buckets.trim, groupMat, gateCx, 0.022, zFront, gateHalf * 1.9, 0.0025, 0.0045, '#1E293B');
}

function addResidentialWindow(buckets, groupMat, wx, wy, wz, ww, wh, dirZ, opts = {}) {
  const { frameHex = '#E2E8F0', hoodHex = null, shutterHex = null, hasSill = true, hasAC = false, hasRail = false } = opts;
  const dz = dirZ >= 0 ? 1 : -1;
  // Recessed dark reflective glass pane
  addLocalBox(buckets.glass, groupMat, wx, wy, wz + dz * 0.001, ww, wh, 0.003, '#9EBAD0');
  // Exterior sill & frame header
  if (hasSill) {
    addLocalBox(buckets.trim, groupMat, wx, wy - wh * 0.53, wz + dz * 0.0035, ww * 1.14, 0.0032, 0.006, frameHex);
  }
  addLocalBox(buckets.trim, groupMat, wx, wy, wz + dz * 0.0022, 0.0022, wh, 0.0022, '#475569'); // center mullion
  if (hoodHex) {
    addLocalBox(buckets.accent, groupMat, wx, wy + wh * 0.55, wz + dz * 0.005, ww * 1.18, 0.0035, 0.009, hoodHex);
  }
  if (shutterHex) {
    addLocalBox(buckets.woodCanopy, groupMat, wx - ww * 0.64, wy, wz + dz * 0.0025, ww * 0.26, wh * 1.02, 0.003, shutterHex);
    addLocalBox(buckets.woodCanopy, groupMat, wx + ww * 0.64, wy, wz + dz * 0.0025, ww * 0.26, wh * 1.02, 0.003, shutterHex);
  }
  if (hasRail) {
    addLocalBox(buckets.trim, groupMat, wx, wy - wh * 0.26, wz + dz * 0.005, ww * 1.05, 0.0025, 0.002, '#1E293B');
    addLocalBox(buckets.trim, groupMat, wx, wy - wh * 0.42, wz + dz * 0.004, ww * 1.05, 0.002, 0.004, '#1E293B');
  }
  if (hasAC) {
    addLocalBox(buckets.trim, groupMat, wx + ww * 0.65, wy - wh * 0.38, wz + dz * 0.006, 0.011, 0.0085, 0.008, '#D8DEE6');
    addLocalBox(buckets.trim, groupMat, wx + ww * 0.65, wy - wh * 0.38, wz + dz * 0.0102, 0.007, 0.0055, 0.001, '#334155');
  }
}

function appendStage3Residential(buckets, b, groupMat) {
  const { w, d, h } = b;
  const hsh = hashBuilding(b);
  const sideFlip = hsh % 2 === 0 ? 1 : -1;
  const levels = Math.max(1, b.levels || 1);
  // Gracefully map 1F multi-family styles to authentic Filipino village / courtyard houses
  let style = b.archStyle !== undefined ? b.archStyle % 6 : hsh % 6;
  if (levels === 1 && (style === 3 || style === 5)) {
    style = hsh % 3 === 0 ? 4 : 1;
  }

  const wallHex = WALL_PALETTE[b.tone] || '#EFE7D4';
  const roofHex = b.roofColor || '#8C4332';
  const accentHex = b.accentColor || '#25638A';
  const roofH = Math.max(0.030, Math.min(0.062, Math.min(w, d) * 0.36));

  // Sub-terrain slope skirt + parcel yard slab strictly within OBB [w, d]
  addLocalBox(buckets.foundation, groupMat, 0, -0.17, 0, w * 0.94, 0.34, d * 0.94, '#ABB4BF');
  addLocalBox(buckets.foundation, groupMat, 0, 0.004, 0, w * 0.98, 0.008, d * 0.98, '#CBD3DC', 1.4, 1.4);

  // -------------------------------------------------------------------------
  // ARCH 3: 1:1 Cream & Ochre Banded Mid-Rise Walk-Up Apartment (08a047f0 / 79fcde68)
  // -------------------------------------------------------------------------
  if (style === 3) {
    const bw = w * 0.88;
    const bd = d * 0.84;
    const groundH = Math.min(0.068, h / levels);
    const upperCount = Math.max(1, levels - 1);
    const storyH = (h - groundH) / upperCount;
    const creamHex = '#EFE7D2';
    const ochreHex = hsh % 3 === 0 ? '#C8B994' : '#D9C38F';
    const awningHues = ['#4C749E', '#B55B45', '#647C6E', '#8F7A52'];

    // Ground floor masonry shop/lobby base + dark storefront glazing + entry awning
    addLocalBox(buckets.stoneBrick, groupMat, 0, groundH * 0.5 + 0.008, 0, bw, groundH, bd, '#B4ABA0', 2, 1);
    addLocalBox(buckets.glass, groupMat, 0, groundH * 0.42 + 0.008, bd * 0.502, bw * 0.80, groundH * 0.62, 0.005, '#7FA2BD');
    addLocalBox(buckets.accent, groupMat, 0, groundH + 0.011, 0, bw * 1.04, 0.009, bd * 1.04, '#E5DEC9');
    // Ground commercial shop canopy & subtle signboard frieze
    addLocalBox(buckets.accent, groupMat, 0, groundH * 0.82 + 0.008, bd * 0.54, bw * 0.88, 0.006, 0.022, accentHex);
    addLocalBox(buckets.trim, groupMat, -sideFlip * bw * 0.18, groundH * 0.94 + 0.008, bd * 0.515, bw * 0.42, 0.011, 0.006, awningHues[hsh % 2]);

    // Upper stacked apartment floors with alternating cream / ochre signature bands
    const cols = bw > 0.125 ? 4 : 3;
    for (let u = 0; u < upperCount; u++) {
      const yBot = 0.008 + groundH + u * storyH;
      // Alternating cream upper band & warm ochre lower spandrel band per story
      addLocalBox(buckets.masonry, groupMat, 0, yBot + storyH * 0.23, 0, bw, storyH * 0.46, bd, ochreHex, 2, 1);
      addLocalBox(buckets.masonry, groupMat, 0, yBot + storyH * 0.73, 0, bw, storyH * 0.54, bd, creamHex, 2, 1);

      // Cantilevered wrap/corner balcony bay on alternating side
      const balX = sideFlip * bw * 0.25;
      const balW = bw * 0.42;
      addLocalBox(buckets.accent, groupMat, balX, yBot + 0.004, bd * 0.5 + 0.009, balW, 0.006, 0.020, creamHex);
      addLocalBox(buckets.masonry, groupMat, balX, yBot + storyH * 0.21, bd * 0.5 + 0.017, balW, storyH * 0.30, 0.004, ochreHex);
      addLocalBox(buckets.trim, groupMat, balX, yBot + storyH * 0.38, bd * 0.5 + 0.018, balW, 0.003, 0.003, '#475569');

      // Window array + small rain canopies + exterior AC units
      for (let c = 0; c < cols; c++) {
        const wx = ((c + 0.5) / cols - 0.5) * (bw * 0.82);
        const ww = bw * 0.14;
        const wh = storyH * 0.42;
        const hood = (c + u) % 2 === 0 ? awningHues[(c + u + hsh) % awningHues.length] : '#E2E8F0';
        addResidentialWindow(buckets, groupMat, wx, yBot + storyH * 0.60, bd * 0.5, ww, wh, 1, {
          hoodHex: hood,
          hasAC: (c + u) % 3 === 1,
        });
        addResidentialWindow(buckets, groupMat, wx, yBot + storyH * 0.60, -bd * 0.5, ww, wh, -1, { hoodHex: '#CBD5E1' });
      }
      // Side elevation windows
      for (const sx of [-1, 1]) {
        addLocalBox(buckets.glass, groupMat, sx * bw * 0.502, yBot + storyH * 0.60, 0, 0.004, storyH * 0.38, bd * 0.42, '#92B0C7');
      }
    }

    // Authentic 08a047f0 flat roof: parapet coping + stairwell bulkhead + tanks + antenna
    const roofY = 0.008 + h;
    addLocalBox(buckets.masonry, groupMat, 0, roofY + 0.006, bd * 0.48, bw, 0.012, 0.006, creamHex);
    addLocalBox(buckets.masonry, groupMat, 0, roofY + 0.006, -bd * 0.48, bw, 0.012, 0.006, creamHex);
    addLocalBox(buckets.masonry, groupMat, -bw * 0.48, roofY + 0.006, 0, 0.006, 0.012, bd, creamHex);
    addLocalBox(buckets.masonry, groupMat, bw * 0.48, roofY + 0.006, 0, 0.006, 0.012, bd, creamHex);
    addLocalBox(buckets.roof, groupMat, 0, roofY + 0.003, 0, bw * 0.94, 0.006, bd * 0.94, '#6E747C');
    // Stairwell penthouse bulkhead + curved top cap + rooftop tanks
    addLocalBox(buckets.masonry, groupMat, -sideFlip * bw * 0.16, roofY + 0.018, -bd * 0.10, bw * 0.34, 0.028, bd * 0.32, creamHex);
    addLocalBox(buckets.roof, groupMat, -sideFlip * bw * 0.16, roofY + 0.034, -bd * 0.10, bw * 0.38, 0.005, bd * 0.36, '#525C68');
    addLocalCyl(buckets.trim, groupMat, sideFlip * bw * 0.24, roofY + 0.015, bd * 0.16, 0.009, 0.018, 0.009, '#94A3B8');
    addLocalBox(buckets.trim, groupMat, -sideFlip * bw * 0.16, roofY + 0.048, -bd * 0.10, 0.0025, 0.026, 0.0025, '#334155');
    return;
  }

  // -------------------------------------------------------------------------
  // ARCH 2: Poblacion Heritage Shophouse / Bahay-na-Bato (11bb784c + Bicol heritage)
  // -------------------------------------------------------------------------
  if (style === 2) {
    const bw = w * 0.84;
    const bd = d * 0.80;
    const groundH = levels >= 2 ? h * 0.46 : h;
    const upperH = Math.max(0, h - groundH);

    // Stone zocalo base + 3-pier front arcade
    addLocalBox(buckets.stoneBrick, groupMat, 0, groundH * 0.5 + 0.008, -bd * 0.04, bw * 0.96, groundH, bd * 0.88, '#C8BFB2', 2, 1.2);
    for (const px of [-bw * 0.42, 0, bw * 0.42]) {
      addLocalBox(buckets.stoneBrick, groupMat, px, groundH * 0.5 + 0.008, bd * 0.46, 0.011, groundH, 0.012, '#B6AC9E');
    }
    // Glazed ground doors & striped porch/shop canopy
    addLocalBox(buckets.glass, groupMat, -bw * 0.21, groundH * 0.42 + 0.008, bd * 0.41, bw * 0.24, groundH * 0.72, 0.005, '#7B9AB4');
    addLocalBox(buckets.woodCanopy, groupMat, bw * 0.21, groundH * 0.40 + 0.008, bd * 0.41, bw * 0.22, groundH * 0.68, 0.005, '#6B4226');
    addLocalBox(buckets.woodCanopy, groupMat, 0, groundH * 0.86 + 0.008, bd * 0.50, bw * 0.92, 0.008, 0.022, '#9E4B38');

    // Cantilevered upper wooden/plaster volada volume
    if (upperH > 0.01) {
      addLocalBox(buckets.masonry, groupMat, 0, groundH + upperH * 0.5 + 0.008, 0, bw * 1.03, upperH, bd * 1.02, wallHex, 1.8, 1);
      addLocalBox(buckets.woodCanopy, groupMat, 0, groundH + 0.010, 0, bw * 1.06, 0.008, bd * 1.05, '#5C3A21');
      addLocalBox(buckets.woodCanopy, groupMat, 0, h + 0.006, 0, bw * 1.07, 0.006, bd * 1.06, '#5C3A21');
      // Corner pilasters
      for (const cx of [-bw * 0.50, bw * 0.50]) {
        addLocalBox(buckets.woodCanopy, groupMat, cx, groundH + upperH * 0.5 + 0.008, bd * 0.50, 0.009, upperH, 0.008, '#5C3A21');
      }
      const cols = bw > 0.13 ? 3 : 2;
      for (let c = 0; c < cols; c++) {
        const wx = ((c + 0.5) / cols - 0.5) * (bw * 0.76);
        addResidentialWindow(buckets, groupMat, wx, groundH + upperH * 0.52 + 0.008, bd * 0.51, bw * 0.15, upperH * 0.54, 1, {
          shutterHex: '#5C3A21',
          frameHex: '#EFE7D4',
          hasAC: c === 0 && (hsh % 2 === 0),
        });
        addResidentialWindow(buckets, groupMat, wx, groundH + upperH * 0.52 + 0.008, -bd * 0.51, bw * 0.15, upperH * 0.54, -1, {
          shutterHex: '#5C3A21',
        });
      }
    } else {
      for (const wx of [-bw * 0.21, bw * 0.21]) {
        addResidentialWindow(buckets, groupMat, wx, groundH * 0.55 + 0.008, -bd * 0.48, bw * 0.16, groundH * 0.44, -1, { shutterHex: '#5C3A21' });
      }
    }

    const rotY = bd > bw ? Math.PI * 0.5 : 0;
    const rx = rotY === 0 ? bw * 1.14 : bd * 1.14;
    const rz = rotY === 0 ? bd * 1.14 : bw * 1.14;
    addLocalRoof(buckets.roof, groupMat, 'hipped', 0, h + 0.008, 0, rx, roofH, rz, roofHex, rotY);
    addLocalBox(buckets.trim, groupMat, 0, h + 0.008 + roofH, 0, rotY === 0 ? rx * 0.48 : 0.007, 0.005, rotY === 0 ? 0.007 : rx * 0.48, '#5C3A21');
    return;
  }

  // -------------------------------------------------------------------------
  // ARCH 5: Poblacion Brick & Stucco Walk-Up Townhouse (11bb784c adapted to Naga)
  // -------------------------------------------------------------------------
  if (style === 5) {
    const bw = w * 0.86;
    const bd = d * 0.82;
    const storyH = h / levels;
    const brickTones = ['#A65642', '#B56E53', '#8B624E', '#627B78'];
    const upperBrick = brickTones[hsh % brickTones.length];
    const quoinHex = '#E8DFCF';

    // Rusticated stone base floor
    addLocalBox(buckets.stoneBrick, groupMat, 0, storyH * 0.5 + 0.008, 0, bw * 1.01, storyH, bd * 1.01, '#8D867C', 2, 1);
    addLocalBox(buckets.glass, groupMat, -sideFlip * bw * 0.14, storyH * 0.42 + 0.008, bd * 0.506, bw * 0.42, storyH * 0.66, 0.004, '#8BA9C2');
    addLocalBox(buckets.woodCanopy, groupMat, sideFlip * bw * 0.25, storyH * 0.40 + 0.008, bd * 0.506, bw * 0.18, storyH * 0.66, 0.004, '#4B2E1B');
    addLocalBox(buckets.woodCanopy, groupMat, 0, storyH * 0.88 + 0.008, bd * 0.54, bw * 0.88, 0.007, 0.020, '#8C382A');

    // Upper brick/masonry storeys + corner pale stone quoins + belt courses
    const upH = Math.max(0.05, h - storyH);
    addLocalBox(buckets.stoneBrick, groupMat, 0, 0.008 + storyH + upH * 0.5, 0, bw, upH, bd, upperBrick, 2.2, 2);
    for (const qx of [-bw * 0.49, bw * 0.49]) {
      for (const qz of [-bd * 0.49, bd * 0.49]) {
        addLocalBox(buckets.masonry, groupMat, qx, 0.008 + storyH + upH * 0.5, qz, 0.011, upH, 0.011, quoinHex);
      }
    }

    const cols = bw > 0.13 ? 3 : 2;
    for (let lv = 1; lv < levels; lv++) {
      const yB = 0.008 + lv * storyH;
      addLocalBox(buckets.masonry, groupMat, 0, yB, 0, bw * 1.03, 0.007, bd * 1.03, quoinHex);
      for (let c = 0; c < cols; c++) {
        const wx = ((c + 0.5) / cols - 0.5) * (bw * 0.74);
        addResidentialWindow(buckets, groupMat, wx, yB + storyH * 0.54, bd * 0.5, bw * 0.16, storyH * 0.48, 1, {
          frameHex: quoinHex,
          hoodHex: quoinHex,
          hasRail: true,
          hasAC: c === cols - 1 && lv === 1,
        });
        addResidentialWindow(buckets, groupMat, wx, yB + storyH * 0.54, -bd * 0.5, bw * 0.16, storyH * 0.48, -1, {
          frameHex: quoinHex,
        });
      }
    }

    // Crown cornice + parapet terrace + skylight + water tank
    const roofY = 0.008 + h;
    addLocalBox(buckets.masonry, groupMat, 0, roofY + 0.005, 0, bw * 1.06, 0.010, bd * 1.06, quoinHex);
    addLocalBox(buckets.roof, groupMat, 0, roofY + 0.012, 0, bw * 0.96, 0.010, bd * 0.96, roofHex);
    addLocalBox(buckets.glass, groupMat, -sideFlip * bw * 0.16, roofY + 0.022, 0, bw * 0.24, 0.012, bd * 0.26, '#90B2CA');
    addLocalBox(buckets.trim, groupMat, sideFlip * bw * 0.20, roofY + 0.021, -bd * 0.14, 0.018, 0.014, 0.016, '#94A3B8');
    return;
  }

  // -------------------------------------------------------------------------
  // ARCH 4: Courtyard L-Wing Residence w/ Garden Colonnade & Dual Hipped Roofs
  // -------------------------------------------------------------------------
  if (style === 4) {
    addCompoundFenceAndGate(buckets, groupMat, w, d, wallHex, sideFlip, 0);
    const bw = w * 0.86;
    const bd = d * 0.78;
    const mainD = bd * 0.54;
    const mainZ = -bd * 0.20;
    const wingW = bw * 0.42;
    const wingX = sideFlip * (bw * 0.5 - wingW * 0.5);
    const wingD = bd * 0.48;
    const wingZ = bd * 0.18;
    const wingH = Math.max(0.055, h * (levels >= 2 ? 0.62 : 0.86));

    // Rear main 2F wing + stone base + windows + hipped roof
    addLocalBox(buckets.stoneBrick, groupMat, 0, 0.014, mainZ, bw * 1.01, 0.016, mainD * 1.01, '#9BA3AD');
    addLocalBox(buckets.masonry, groupMat, 0, h * 0.5 + 0.008, mainZ, bw, h, mainD, wallHex, 1.8, 1.2);
    // Side L-wing projecting forward
    addLocalBox(buckets.stoneBrick, groupMat, wingX, 0.014, wingZ, wingW * 1.01, 0.016, wingD * 1.01, '#9BA3AD');
    addLocalBox(buckets.masonry, groupMat, wingX, wingH * 0.5 + 0.008, wingZ, wingW, wingH, wingD, wallHex, 1.2, 1);

    // Courtyard colonnade + flat garden veranda canopy beside L-wing
    const porchX = -sideFlip * bw * 0.22;
    addLocalBox(buckets.woodCanopy, groupMat, porchX, Math.min(0.056, h * 0.65) + 0.008, bd * 0.14, bw * 0.48, 0.006, wingD * 0.55, '#6B4226');
    for (const colOffset of [-bw * 0.16, bw * 0.12]) {
      addLocalBox(buckets.masonry, groupMat, porchX + colOffset, Math.min(0.056, h * 0.65) * 0.5 + 0.008, bd * 0.26, 0.008, Math.min(0.056, h * 0.65), 0.008, '#F1EDE4');
    }

    // Windows on rear main & front L-wing facades
    const storyH = h / levels;
    for (let lv = 0; lv < levels; lv++) {
      const wy = 0.008 + (lv + 0.54) * storyH;
      addResidentialWindow(buckets, groupMat, -sideFlip * bw * 0.24, wy, mainZ + mainD * 0.5, bw * 0.16, storyH * 0.44, 1, {
        hoodHex: accentHex,
        hasAC: lv === 0,
      });
      addResidentialWindow(buckets, groupMat, 0, wy, mainZ - mainD * 0.5, bw * 0.22, storyH * 0.44, -1, { hoodHex: '#CBD5E1' });
    }
    addResidentialWindow(buckets, groupMat, wingX, wingH * 0.52 + 0.008, wingZ + wingD * 0.5, wingW * 0.46, wingH * 0.42, 1, {
      hoodHex: accentHex,
    });

    // Dual interlocking hipped roofs
    addLocalRoof(buckets.roof, groupMat, 'hipped', 0, h + 0.008, mainZ, bw * 1.10, roofH, mainD * 1.14, roofHex, 0);
    addLocalRoof(buckets.roof, groupMat, 'hipped', wingX, wingH + 0.008, wingZ, wingW * 1.12, roofH * 0.72, wingD * 1.12, roofHex, Math.PI * 0.5);
    return;
  }

  // -------------------------------------------------------------------------
  // ARCH 1: Filipino Village Barangay House w/ Stepped Firewalls & Water Tank (ba621f1e)
  // -------------------------------------------------------------------------
  if (style === 1) {
    addCompoundFenceAndGate(buckets, groupMat, w, d, wallHex, sideFlip, 1);
    const mainW = w * 0.58;
    const mainX = -sideFlip * w * 0.13;
    const mainD = d * 0.68;
    const mainZ = -d * 0.06;
    const wingW = w * 0.28;
    const wingX = sideFlip * (w * 0.58 * 0.5 + wingW * 0.5 - w * 0.12);
    const wingH = Math.max(0.044, h * 0.64);
    const metalRoofTones = ['#5A6A78', '#4F6572', '#7C4332', '#64726A'];
    const vRoofHex = metalRoofTones[hsh % metalRoofTones.length];

    // Main block with stone hollow-block base wainscot
    addLocalBox(buckets.stoneBrick, groupMat, mainX, 0.018, mainZ, mainW * 1.01, 0.022, mainD * 1.01, '#8C949E', 2, 0.8);
    addLocalBox(buckets.masonry, groupMat, mainX, h * 0.5 + 0.008, mainZ, mainW, h, mainD, wallHex, 1.5, 1.2);

    // Adjacent lower side annex wing (mono-pitch shed or flat concrete terrace + rooftop water tank)
    addLocalBox(buckets.masonry, groupMat, wingX, wingH * 0.5 + 0.008, mainZ - 0.005, wingW, wingH, mainD * 0.84, '#DCDAD2', 1, 1);
    if (hsh % 2 === 0) {
      addLocalBox(buckets.accent, groupMat, wingX, wingH + 0.012, mainZ - 0.005, wingW * 1.06, 0.008, mainD * 0.88, '#94A3B8');
      // ba621f1e rooftop cylindrical water tank on steel legs
      addLocalCyl(buckets.trim, groupMat, wingX, wingH + 0.027, mainZ - 0.005, 0.011, 0.022, 0.011, (hsh % 3 === 0) ? '#2B7AC4' : '#B8C4D0');
    } else {
      addLocalRoof(buckets.roof, groupMat, 'shed', wingX, wingH + 0.008, mainZ - 0.005, wingW * 1.08, roofH * 0.45, mainD * 0.92, vRoofHex, 0);
    }

    // Stepped plastered firewall gable parapets framing ends of main roof (ba621f1e look)
    const wallEndH = roofH * 0.92;
    for (const gx of [mainX - mainW * 0.49, mainX + mainW * 0.49]) {
      addLocalBox(buckets.masonry, groupMat, gx, h + 0.008 + wallEndH * 0.42, mainZ, 0.008, wallEndH * 0.84, mainD * 0.84, wallHex);
    }
    addLocalRoof(buckets.roof, groupMat, 'gabled', mainX, h + 0.008, mainZ, mainW * 1.06, roofH, mainD * 1.10, vRoofHex, 0);

    // Shaded ground entry awning + 2 steel support posts + casement windows w/ canopies
    addLocalBox(buckets.woodCanopy, groupMat, mainX, Math.min(0.048, h * 0.72) + 0.008, mainZ + mainD * 0.5 + 0.010, mainW * 0.76, 0.005, 0.022, accentHex);
    for (const px of [mainX - mainW * 0.30, mainX + mainW * 0.30]) {
      addLocalBox(buckets.trim, groupMat, px, Math.min(0.048, h * 0.72) * 0.5 + 0.008, mainZ + mainD * 0.5 + 0.018, 0.004, Math.min(0.048, h * 0.72), 0.004, '#475569');
    }
    const storyH = h / levels;
    for (let lv = 0; lv < levels; lv++) {
      const wy = 0.008 + (lv + 0.52) * storyH;
      addResidentialWindow(buckets, groupMat, mainX - mainW * 0.22, wy, mainZ + mainD * 0.5, mainW * 0.22, storyH * 0.42, 1, {
        hoodHex: accentHex,
        hasAC: lv === levels - 1,
      });
      addResidentialWindow(buckets, groupMat, mainX + mainW * 0.22, wy, mainZ + mainD * 0.5, mainW * 0.22, storyH * 0.42, 1, {
        hoodHex: '#64748B',
      });
    }
    return;
  }

  // -------------------------------------------------------------------------
  // ARCH 0 (default): Contemporary Tropical 2F Villa (cantilever + glass balcony + timber louvers)
  // -------------------------------------------------------------------------
  addCompoundFenceAndGate(buckets, groupMat, w, d, wallHex, sideFlip, hsh % 2);
  const bw = w * 0.84;
  const bd = d * 0.74;
  const baseZ = -d * 0.05;
  const groundH = levels >= 2 ? h * 0.48 : h;
  const upperH = Math.max(0, h - groundH);

  // Ground storey shifted away from carport bay on sideFlip
  const coreW = levels >= 2 ? bw * 0.68 : bw;
  const coreX = levels >= 2 ? -sideFlip * bw * 0.16 : 0;
  addLocalBox(buckets.stoneBrick, groupMat, coreX, 0.017, baseZ, coreW * 1.01, 0.020, bd * 0.94, '#94A3B8', 2, 0.8);
  addLocalBox(buckets.masonry, groupMat, coreX, groundH * 0.5 + 0.008, baseZ, coreW, groundH, bd * 0.92, wallHex, 1.6, 1.1);
  // Warm hardwood entry door + concrete stoop
  addLocalBox(buckets.woodCanopy, groupMat, coreX + sideFlip * coreW * 0.22, 0.024, baseZ + bd * 0.465, coreW * 0.22, 0.032, 0.005, '#7C4A27');

  // Carport porch columns on sideFlip if 2F
  if (levels >= 2) {
    const colX = sideFlip * bw * 0.44;
    addLocalBox(buckets.masonry, groupMat, colX, groundH * 0.5 + 0.008, baseZ + bd * 0.40, 0.009, groundH, 0.009, '#F1EDE4');
    addLocalBox(buckets.masonry, groupMat, colX, groundH * 0.5 + 0.008, baseZ - bd * 0.36, 0.009, groundH, 0.009, '#F1EDE4');

    // Cantilevered upper box overhanging carport & entry
    addLocalBox(buckets.masonry, groupMat, 0, 0.008 + groundH + upperH * 0.5, baseZ + 0.004, bw * 1.03, upperH, bd * 1.02, wallHex, 1.8, 1.2);
    // Floor slab reveal + decorative timber louver screen on upper corner
    addLocalBox(buckets.accent, groupMat, 0, 0.008 + groundH, baseZ + 0.004, bw * 1.05, 0.008, bd * 1.05, accentHex);
    addLocalBox(buckets.woodCanopy, groupMat, -sideFlip * bw * 0.34, 0.008 + groundH + upperH * 0.5, baseZ + bd * 0.52, bw * 0.24, upperH * 0.84, 0.005, '#8A5A36');

    // Recessed glass balcony over carport with dark rail & frosted/tinted glass parapet
    const balX = sideFlip * bw * 0.24;
    addLocalBox(buckets.glass, groupMat, balX, 0.008 + groundH + 0.012, baseZ + bd * 0.525, bw * 0.40, 0.015, 0.004, '#92B8D4');
    addLocalBox(buckets.trim, groupMat, balX, 0.008 + groundH + 0.021, baseZ + bd * 0.526, bw * 0.41, 0.003, 0.005, '#1E293B');

    // Upper & rear casement windows + exterior AC unit on side wall
    addResidentialWindow(buckets, groupMat, balX, 0.008 + groundH + upperH * 0.58, baseZ + bd * 0.515, bw * 0.26, upperH * 0.50, 1, {
      hoodHex: '#E2E8F0',
    });
    addResidentialWindow(buckets, groupMat, 0, 0.008 + groundH + upperH * 0.54, baseZ - bd * 0.505, bw * 0.42, upperH * 0.44, -1, {
      hoodHex: '#CBD5E1',
      hasAC: true,
    });
  } else {
    addResidentialWindow(buckets, groupMat, -coreW * 0.22, groundH * 0.56 + 0.008, baseZ + bd * 0.46, coreW * 0.22, groundH * 0.42, 1, {
      hoodHex: accentHex,
      hasAC: true,
    });
  }

  // Ground front window + crisp standing-seam hipped roof w/ white eave fascia
  addResidentialWindow(buckets, groupMat, coreX - sideFlip * coreW * 0.22, groundH * 0.56 + 0.008, baseZ + bd * 0.46, coreW * 0.24, groundH * 0.42, 1, {
    hoodHex: '#E2E8F0',
  });
  addLocalBox(buckets.masonry, groupMat, 0, 0.006 + h, baseZ + (levels >= 2 ? 0.004 : 0), bw * 1.10, 0.006, bd * 1.10, '#F1EDE4');
  const rotY = bd > bw ? Math.PI * 0.5 : 0;
  const rx = rotY === 0 ? bw * 1.14 : bd * 1.14;
  const rz = rotY === 0 ? bd * 1.14 : bw * 1.14;
  addLocalRoof(buckets.roof, groupMat, 'hipped', 0, h + 0.008, baseZ + (levels >= 2 ? 0.004 : 0), rx, roofH, rz, roofHex, rotY);
}

// ============================================================================
// COMMERCIAL GENERATORS (Stage 2 baseline — upgraded in Stage 4)
// ============================================================================

function appendFootprintBuilding(buckets, b, groupMat) {
  const wallColor = WALL_PALETTE[b.tone] || '#E9E2D4';
  const accentColor = b.accentColor || '#3B5266';
  const levels = Math.max(2, b.levels || 3);
  const podiumH = Math.min(0.088, b.h * 0.28);
  const upperH = Math.max(0.07, b.h - podiumH);
  const pts = b.footprint;

  // Grounding skirt + concrete plinth
  addExtrudedPolyPart(buckets.foundation, groupMat, pts, -0.34, 0.348, 0.96, '#B8C1CC');
  addExtrudedPolyPart(buckets.foundation, groupMat, pts, 0.002, 0.010, 1.01, '#CBD5E1');
  // Glazed ground-floor lobby / retail podium
  addExtrudedPolyPart(buckets.glass, groupMat, pts, 0.010, podiumH, 0.95, '#89AFC9');
  addExtrudedPolyPart(buckets.accent, groupMat, pts, podiumH + 0.006, 0.014, 1.02, '#EFE8DA');
  // Upper masonry massing + per-storey spandrel/window bands
  addExtrudedPolyPart(buckets.masonry, groupMat, pts, podiumH + 0.020, upperH, 0.99, wallColor);
  const storyH = upperH / Math.max(1, levels - 1);
  for (let lv = 1; lv < levels; lv++) {
    const sy = podiumH + 0.020 + (lv - 0.5) * storyH;
    addExtrudedPolyPart(buckets.glass, groupMat, pts, sy - storyH * 0.20, storyH * 0.42, 0.996, '#9BB8CE');
    addExtrudedPolyPart(buckets.trim, groupMat, pts, sy - storyH * 0.45, 0.007, 1.01, '#D6DCE3');
  }
  // Crown parapet + dark roof + rooftop HVAC/elevator bulkhead
  addExtrudedPolyPart(buckets.trim, groupMat, pts, b.h + 0.020, 0.016, 1.018, accentColor);
  addExtrudedPolyPart(buckets.roof, groupMat, pts, b.h + 0.024, 0.008, 0.92, '#475569');
  addLocalBox(buckets.trim, groupMat, 0, b.h + 0.044, 0, Math.min(b.w * 0.26, 0.055), 0.026, Math.min(b.d * 0.26, 0.048), '#64748B');
  addLocalBox(buckets.trim, groupMat, b.w * 0.16, b.h + 0.036, -b.d * 0.12, Math.min(b.w * 0.12, 0.026), 0.012, Math.min(b.d * 0.12, 0.024), '#94A3B8');
}

function appendStage4Commercial(buckets, b, groupMat) {
  const { w, d, h } = b;
  const hsh = hashBuilding(b);
  const style = hsh % 5;
  const levels = Math.max(2, b.levels || 3);
  const wallHex = WALL_PALETTE[b.tone] || '#E5E2DC';
  const accentHex = b.accentColor || '#2D4A63';
  const bw = w * 0.92;
  const bd = d * 0.90;

  // Grounding foundation skirt + sidewalk plinth
  addLocalBox(buckets.foundation, groupMat, 0, -0.17, 0, w * 0.96, 0.34, d * 0.96, '#AEB7C2');
  addLocalBox(buckets.foundation, groupMat, 0, 0.005, 0, w * 0.99, 0.010, d * 0.99, '#CBD5E1');

  // -------------------------------------------------------------------------
  // ARCH 0: Twin Silver/Blue-Glass Podium Tower (759c3332) or Slanted Ribbon Tower (8b169c44)
  // -------------------------------------------------------------------------
  if (style === 0) {
    const podiumH = Math.min(0.085, h * 0.26);
    if (hsh % 2 === 0 || levels >= 4) {
      // Twin-wing glass tower on 2F podium
      addLocalBox(buckets.masonry, groupMat, 0, podiumH * 0.5 + 0.008, 0, bw, podiumH, bd, '#D4DCE4');
      addLocalBox(buckets.glass, groupMat, 0, podiumH * 0.5 + 0.008, 0, bw * 0.88, podiumH * 0.68, bd * 1.01, '#6C98B8');
      addLocalBox(buckets.trim, groupMat, 0, podiumH + 0.010, 0, bw * 1.03, 0.008, bd * 1.03, '#94A3B8');

      const towerH = Math.max(0.08, h - podiumH);
      const wingW = bw * 0.41;
      const wingOff = bw * 0.26;
      // Central recessed glass core
      addLocalBox(buckets.glass, groupMat, 0, podiumH + 0.014 + towerH * 0.5, 0, bw * 0.22, towerH, bd * 0.72, '#5E8CAE');
      for (const sx of [-1, 1]) {
        addLocalBox(buckets.glass, groupMat, sx * wingOff, podiumH + 0.014 + towerH * 0.5, 0, wingW, towerH, bd * 0.86, '#7DA8C8');
        addLocalBox(buckets.trim, groupMat, sx * wingOff, podiumH + 0.014 + towerH + 0.012, 0, wingW * 0.72, 0.022, bd * 0.64, '#CBD5E1');
      }
      // Horizontal aluminum brise-soleil fin bands
      for (let lv = 1; lv < levels; lv++) {
        const fy = podiumH + 0.014 + (lv / levels) * towerH;
        addLocalBox(buckets.trim, groupMat, 0, fy, 0, bw * 0.96, 0.005, bd * 0.90, '#CBD5E1');
      }
    } else {
      // 8b169c44-style modern slanted glass & white-ribbon tower with V-columns
      addLocalBox(buckets.foundation, groupMat, 0, 0.014, bd * 0.06, bw * 0.98, 0.012, bd * 0.96, '#DCE3EA');
      const lobbyH = Math.min(0.075, h * 0.24);
      addLocalBox(buckets.glass, groupMat, 0, lobbyH * 0.5 + 0.018, 0, bw * 0.76, lobbyH, bd * 0.76, '#4D7C9E');
      // V-column supports at front corner
      addLocalBox(buckets.masonry, groupMat, -bw * 0.30, lobbyH * 0.5 + 0.018, bd * 0.34, 0.012, lobbyH, 0.012, '#E2E8F0');
      addLocalBox(buckets.masonry, groupMat, bw * 0.30, lobbyH * 0.5 + 0.018, bd * 0.34, 0.012, lobbyH, 0.012, '#E2E8F0');

      const upperH = Math.max(0.08, h - lobbyH);
      addLocalBox(buckets.glass, groupMat, 0, lobbyH + 0.018 + upperH * 0.5, 0, bw * 0.88, upperH, bd * 0.86, '#4B82AB');
      for (let lv = 0; lv < levels; lv++) {
        const ry = lobbyH + 0.022 + (lv / levels) * upperH;
        addLocalBox(buckets.masonry, groupMat, 0, ry, 0, bw * 0.93, 0.009, bd * 0.91, '#F1F5F9');
      }
      addLocalBox(buckets.trim, groupMat, 0, h + 0.022, 0, bw * 0.92, 0.010, bd * 0.88, '#94A3B8');
    }
    return;
  }

  // -------------------------------------------------------------------------
  // ARCH 1: Tan/Grey Masonry CBD Mid-Rise (38e18599)
  // -------------------------------------------------------------------------
  if (style === 1) {
    const cbdTones = ['#C5B6A2', '#B7ADA0', '#CEC3B4'];
    const cbdWall = cbdTones[hsh % cbdTones.length];
    const storyH = h / levels;
    // Ground-floor dark shopfront & subtle awning
    addLocalBox(buckets.stoneBrick, groupMat, 0, storyH * 0.5 + 0.008, 0, bw * 1.01, storyH, bd * 1.01, '#6E6A63', 2, 1);
    addLocalBox(buckets.glass, groupMat, 0, storyH * 0.44 + 0.008, bd * 0.506, bw * 0.72, storyH * 0.62, 0.004, '#5B768B');
    addLocalBox(buckets.trim, groupMat, 0, storyH * 0.84 + 0.008, bd * 0.53, bw * 0.84, 0.007, 0.018, '#334155');

    const upH = Math.max(0.06, h - storyH);
    addLocalBox(buckets.masonry, groupMat, 0, 0.008 + storyH + upH * 0.5, 0, bw, upH, bd, cbdWall, 2, 2);
    for (let lv = 1; lv < levels; lv++) {
      const ly = 0.008 + lv * storyH;
      addLocalBox(buckets.trim, groupMat, 0, ly, 0, bw * 1.03, 0.006, bd * 1.03, '#9E9384');
      addLocalBox(buckets.glass, groupMat, 0, ly + storyH * 0.52, 0, bw * 0.78, storyH * 0.48, bd * 1.008, '#475E70');
      addLocalBox(buckets.glass, groupMat, 0, ly + storyH * 0.52, 0, bw * 1.008, storyH * 0.48, bd * 0.74, '#475E70');
    }
    // Crown cornice + rooftop mechanical bulkhead
    addLocalBox(buckets.trim, groupMat, 0, h + 0.014, 0, bw * 1.04, 0.012, bd * 1.04, '#8A7E6E');
    addLocalBox(buckets.roof, groupMat, 0, h + 0.020, 0, bw * 0.94, 0.006, bd * 0.94, '#475569');
    addLocalBox(buckets.masonry, groupMat, -bw * 0.16, h + 0.036, 0, bw * 0.30, 0.028, bd * 0.32, '#B6ACA0');
    return;
  }

  // -------------------------------------------------------------------------
  // ARCH 2: Naga Retail Plaza / Commercial Strip with Colonnade & Awnings
  // -------------------------------------------------------------------------
  if (style === 2) {
    const podiumH = Math.min(0.08, h * 0.42);
    const awningTones = ['#9E3D2E', '#2D6A73', '#2F4D6D', '#B56E33'];
    const awningHex = awningTones[hsh % awningTones.length];
    addLocalBox(buckets.masonry, groupMat, 0, h * 0.5 + 0.008, 0, bw, h, bd, wallHex, 2, 1.5);
    // Ground-floor glazed storefronts + colonnade piers
    addLocalBox(buckets.glass, groupMat, 0, podiumH * 0.46 + 0.008, bd * 0.504, bw * 0.84, podiumH * 0.74, 0.005, '#7FA2BC');
    addLocalBox(buckets.woodCanopy, groupMat, 0, podiumH * 0.90 + 0.008, bd * 0.54, bw * 0.94, 0.008, 0.024, awningHex);
    // Subtle restrained Naga shopfront fascia
    addLocalBox(buckets.accent, groupMat, 0, podiumH + 0.016, bd * 0.51, bw * 0.62, 0.012, 0.006, accentHex);
    if (levels >= 2) {
      addLocalBox(buckets.glass, groupMat, 0, podiumH + (h - podiumH) * 0.54 + 0.008, 0, bw * 0.80, (h - podiumH) * 0.44, bd * 1.008, '#93B2C8');
    }
    addLocalBox(buckets.trim, groupMat, 0, h + 0.014, 0, bw * 1.03, 0.012, bd * 1.03, accentHex);
    addLocalBox(buckets.roof, groupMat, 0, h + 0.018, 0, bw * 0.94, 0.006, bd * 0.94, '#475569');
    addLocalBox(buckets.trim, groupMat, bw * 0.18, h + 0.028, -bd * 0.12, 0.022, 0.014, 0.020, '#94A3B8');
    return;
  }

  // -------------------------------------------------------------------------
  // ARCH 3: 3F Red-Brick & White-Quoined Heritage Corner Building (963dd789)
  // -------------------------------------------------------------------------
  if (style === 3) {
    const baseH = h * 0.28;
    const upperH = Math.max(0.06, h - baseH);
    const quoinHex = '#ECE4D6';
    addLocalBox(buckets.stoneBrick, groupMat, 0, baseH * 0.5 + 0.008, 0, bw * 1.02, baseH, bd * 1.02, '#8F8A82', 2, 1);
    addLocalBox(buckets.stoneBrick, groupMat, 0, 0.008 + baseH + upperH * 0.5, 0, bw, upperH, bd, '#B45B43', 2.4, 2);
    for (const qx of [-bw * 0.49, bw * 0.49]) {
      for (const qz of [-bd * 0.49, bd * 0.49]) {
        addLocalBox(buckets.masonry, groupMat, qx, 0.008 + baseH + upperH * 0.5, qz, 0.012, upperH, 0.012, quoinHex);
      }
    }
    // Central entrance portico & triangular gable accent
    addLocalBox(buckets.masonry, groupMat, 0, baseH * 0.55 + 0.008, bd * 0.53, bw * 0.28, baseH * 0.9, 0.020, quoinHex);
    addLocalBox(buckets.glass, groupMat, 0, 0.008 + baseH + upperH * 0.52, 0, bw * 0.76, upperH * 0.42, bd * 1.008, '#536A7B');
    // Green hipped heritage roof
    addLocalRoof(buckets.roof, groupMat, 'hipped', 0, h + 0.008, 0, bw * 1.08, Math.min(0.065, h * 0.34), bd * 1.08, '#2D6853', 0);
    return;
  }

  // -------------------------------------------------------------------------
  // ARCH 4: Modern Corner Glass & Composite Commercial Block
  // -------------------------------------------------------------------------
  const podiumH = Math.min(0.08, h * 0.28);
  const storyH = (h - podiumH) / Math.max(1, levels - 1);
  addLocalBox(buckets.glass, groupMat, 0, podiumH * 0.5 + 0.008, 0, bw * 0.94, podiumH, bd * 0.94, '#799EB9');
  addLocalBox(buckets.accent, groupMat, 0, podiumH + 0.012, 0, bw * 1.03, 0.010, bd * 1.03, accentHex);
  const upperH = Math.max(0.06, h - podiumH);
  addLocalBox(buckets.masonry, groupMat, 0, podiumH + 0.014 + upperH * 0.5, 0, bw, upperH, bd, wallHex, 1.8, 1.8);
  for (let lv = 1; lv < levels; lv++) {
    const wy = podiumH + 0.014 + (lv - 0.5) * storyH;
    addLocalBox(buckets.glass, groupMat, 0, wy, 0, bw * 0.84, storyH * 0.48, bd * 1.012, '#8FB5D0');
    addLocalBox(buckets.glass, groupMat, 0, wy, 0, bw * 1.012, storyH * 0.48, bd * 0.80, '#8FB5D0');
    addLocalBox(buckets.trim, groupMat, 0, wy - storyH * 0.42, 0, bw * 1.02, 0.006, bd * 1.02, '#CBD5E1');
  }
  addLocalBox(buckets.trim, groupMat, 0, h + 0.018, 0, bw * 1.03, 0.014, bd * 1.03, accentHex);
  addLocalBox(buckets.roof, groupMat, 0, h + 0.022, 0, bw * 0.94, 0.006, bd * 0.94, '#475569');
  addLocalBox(buckets.trim, groupMat, -bw * 0.14, h + 0.038, 0, bw * 0.26, 0.024, bd * 0.26, '#64748B');
}

export function buildBatchedCityChunks(buildings) {
  const chunkBuckets = new Map();
  const posVec = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scaleOne = new THREE.Vector3(1, 1, 1);
  const groupMat = new THREE.Matrix4();

  for (const b of buildings) {
    const [x, y, z] = geoToWorld(b.lat, b.lng);
    const gx = Math.floor((x + 8) / 8.5);
    const gz = Math.floor((z + 9) / 8.0);
    const key = `${gx},${gz}`;
    if (!chunkBuckets.has(key)) {
      chunkBuckets.set(key, {
        foundation: [],
        masonry: [],
        stoneBrick: [],
        accent: [],
        roof: [],
        glass: [],
        woodCanopy: [],
        trim: [],
      });
    }
    const buckets = chunkBuckets.get(key);
    posVec.set(x, y, z);
    quat.setFromAxisAngle(Y_AXIS, b.rot || 0);
    groupMat.compose(posVec, quat, scaleOne);

    if (b.footprint && Array.isArray(b.footprint) && b.footprint.length >= 4) {
      appendFootprintBuilding(buckets, b, groupMat);
    } else if (b.type === 'residential_hip') {
      appendStage3Residential(buckets, b, groupMat);
    } else {
      appendStage4Commercial(buckets, b, groupMat);
    }
  }

  const chunks = [];
  for (const [key, buckets] of chunkBuckets.entries()) {
    const merged = {};
    for (const [bucketName, list] of Object.entries(buckets)) {
      if (list.length === 0) continue;
      merged[bucketName] = mergeGeometries(list, false);
      for (const item of list) item.dispose();
    }
    chunks.push({ key, geometries: merged });
  }
  return chunks;
}
