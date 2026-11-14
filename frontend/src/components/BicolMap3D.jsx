import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  geoToWorld,
  getTerrainY,
  getUncarvedTerrainY,
  getShortestRoadRouteCoords,
  getWaterFacilityPlacement,
  BASE_ELEVATION,
  NAGA_RIVER_COORDS,
  BICOL_RIVER_COORDS,
  RIVER_FLOW_METADATA,
  NAGA_ROAD_NODES,
  NAGA_ROADS_COORDS,
  NAGA_SECONDARY_STREETS,
  NAGA_TERTIARY_ROADS,
  NAGA_LOCAL_STREETS,
  NAGA_BRIDGES,
  NAGA_LANDMARKS,
  NAGA_URBAN_ENVIRONMENT_FEATURES,
  NAGA_BUILDING_CLUSTERS,
  NAGA_TREE_CLUSTERS,
  BARANGAY_BOUNDARIES,
  NAGA_BARANGAY_DISTRICTS,
  CDRRMO_HUB,
} from '../data/nagaGeoData';
import { buildBatchedCityChunks } from './CityBuildingBatcher';

// --- External GLB/GLTF Loader with Bounding-Box Grounding & Scale Normalization ---
const gltfCache = new Map();
// Explicit registry of bundled GLB assets under /public/models to prevent 404 request storms when procedural models are used
const AVAILABLE_GLB_MODELS = new Set();

function useNormalizedGLTF(url, targetW = 0.24, targetD = 0.20, targetH = 0.22) {
  const [scene, setScene] = useState(null);

  useEffect(() => {
    if (!url || !AVAILABLE_GLB_MODELS.has(url)) return;
    let mounted = true;

    const normalize = (raw) => {
      const root = raw.clone(true);
      root.traverse((n) => {
        if (n.isMesh) {
          n.castShadow = true;
          n.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(root);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      if (size.x > 0 && size.y > 0 && size.z > 0) {
        const sx = targetW / size.x;
        const sy = targetH / size.y;
        const sz = targetD / size.z;
        root.scale.set(sx, sy, sz);
        root.position.set(-center.x * sx, -box.min.y * sy, -center.z * sz);
      }
      const group = new THREE.Group();
      group.add(root);
      return group;
    };

    if (gltfCache.has(url)) {
      const cached = gltfCache.get(url);
      if (cached) setScene(normalize(cached));
      return;
    }

    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (!mounted || !gltf?.scene) return;
        gltfCache.set(url, gltf.scene);
        setScene(normalize(gltf.scene));
      },
      undefined,
      () => {
        gltfCache.set(url, null);
      }
    );

    return () => {
      mounted = false;
    };
  }, [url, targetW, targetD, targetH]);

  return scene;
}

// --- True 4-Slope Dutch Hip & Gable Roof Geometries ---
const GABLE_ROOF_GEOMETRY = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.54, 0);
  shape.lineTo(0.54, 0);
  shape.lineTo(0, 0.42);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.08, bevelEnabled: false });
  geo.translate(0, 0, -0.54);
  geo.computeVertexNormals();
  return geo;
})();

const HIP_ROOF_GEOMETRY = (() => {
  const hw = 0.55;
  const hd = 0.55;
  const rh = 0.42;
  const ridge = 0.22;
  const verts = new Float32Array([
    -hw, 0, -hd,
     hw, 0, -hd,
     hw, 0,  hd,
    -hw, 0,  hd,
    -ridge, rh, 0,
     ridge, rh, 0,
  ]);
  const indices = [
    3, 2, 5, 3, 5, 4,
    1, 0, 4, 1, 4, 5,
    0, 3, 4,
    2, 1, 5,
    0, 1, 2, 0, 2, 3,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(indices);
  const nonIndexed = geo.toNonIndexed();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
})();

// --- Hyperrealistic Photorealistic Terrain, Asphalt, Concrete, Water & Architectural PBR Textures ---
function useSceneTextures() {
  return useMemo(() => {
    let s = 42;
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };

    // 0A. Natural Tropical Urban & Agricultural Orthophoto Terrain Albedo + Bump + Roughness
    const satCanvas = document.createElement('canvas');
    satCanvas.width = 1024;
    satCanvas.height = 1024;
    const ctx = satCanvas.getContext('2d');

    const terrBumpCanvas = document.createElement('canvas');
    terrBumpCanvas.width = 512;
    terrBumpCanvas.height = 512;
    const tbCtx = terrBumpCanvas.getContext('2d');

    const terrRoughCanvas = document.createElement('canvas');
    terrRoughCanvas.width = 512;
    terrRoughCanvas.height = 512;
    const trCtx = terrRoughCanvas.getContext('2d');

    // Base natural muted tropical vegetation & soil tone (no cartoon lime green)
    ctx.fillStyle = '#475938';
    ctx.fillRect(0, 0, 1024, 1024);
    tbCtx.fillStyle = '#808080';
    tbCtx.fillRect(0, 0, 512, 512);
    trCtx.fillStyle = '#D8D8D8';
    trCtx.fillRect(0, 0, 512, 512);

    // Organic soft agricultural/vegetative patches (blurred radial blobs, zero harsh grid lines)
    const naturalTones = [
      'rgba(62, 78, 48, 0.42)',
      'rgba(78, 94, 58, 0.38)',
      'rgba(52, 68, 40, 0.45)',
      'rgba(92, 102, 68, 0.32)',
      'rgba(104, 100, 82, 0.24)',
      'rgba(45, 62, 36, 0.40)',
    ];
    for (let i = 0; i < 650; i++) {
      const cx = rand() * 1024;
      const cy = rand() * 1024;
      const rx = 18 + rand() * 64;
      const grad = ctx.createRadialGradient(cx, cy, rx * 0.1, cx, cy, rx);
      const col = naturalTones[Math.floor(rand() * naturalTones.length)];
      grad.addColorStop(0, col);
      grad.addColorStop(1, 'rgba(71, 89, 56, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rx, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine soil, grass & canopy micro-grain
    for (let i = 0; i < 24000; i++) {
      const gx = rand() * 1024;
      const gy = rand() * 1024;
      const sz = 1 + rand() * 2.2;
      ctx.fillStyle = rand() > 0.5 ? 'rgba(30, 40, 24, 0.12)' : 'rgba(138, 148, 110, 0.09)';
      ctx.fillRect(gx, gy, sz, sz);
    }

    // Deep tropical forest canopy gradient on Mt. Isarog eastern foothills
    const hillGrad = ctx.createRadialGradient(780, 310, 20, 760, 330, 380);
    hillGrad.addColorStop(0, 'rgba(32, 48, 26, 0.90)');
    hillGrad.addColorStop(0.55, 'rgba(44, 64, 34, 0.62)');
    hillGrad.addColorStop(1, 'rgba(65, 84, 48, 0)');
    ctx.fillStyle = hillGrad;
    ctx.fillRect(320, 0, 704, 720);

    // Subtle compacted urban earth/concrete undertone in Naga CBD
    const urbanGrad = ctx.createRadialGradient(465, 525, 25, 470, 525, 210);
    urbanGrad.addColorStop(0, 'rgba(112, 110, 96, 0.34)');
    urbanGrad.addColorStop(0.6, 'rgba(92, 98, 76, 0.18)');
    urbanGrad.addColorStop(1, 'rgba(71, 89, 56, 0)');
    ctx.fillStyle = urbanGrad;
    ctx.fillRect(200, 260, 540, 520);

    // Terrain bump & roughness micro-variation
    for (let i = 0; i < 14000; i++) {
      const bx = rand() * 512;
      const by = rand() * 512;
      const v = Math.floor(105 + rand() * 50);
      tbCtx.fillStyle = `rgb(${v},${v},${v})`;
      tbCtx.fillRect(bx, by, 2, 2);
      const rv = Math.floor(205 + rand() * 45);
      trCtx.fillStyle = `rgb(${rv},${rv},${rv})`;
      trCtx.fillRect(bx, by, 3, 3);
    }

    const satelliteTex = new THREE.CanvasTexture(satCanvas);
    satelliteTex.colorSpace = THREE.SRGBColorSpace;
    satelliteTex.wrapS = THREE.ClampToEdgeWrapping;
    satelliteTex.wrapT = THREE.ClampToEdgeWrapping;
    satelliteTex.anisotropy = 8;

    const terrainBumpTex = new THREE.CanvasTexture(terrBumpCanvas);
    terrainBumpTex.wrapS = THREE.RepeatWrapping;
    terrainBumpTex.wrapT = THREE.RepeatWrapping;
    terrainBumpTex.repeat.set(16, 16);

    const terrainRoughnessTex = new THREE.CanvasTexture(terrRoughCanvas);
    terrainRoughnessTex.wrapS = THREE.RepeatWrapping;
    terrainRoughnessTex.wrapT = THREE.RepeatWrapping;
    terrainRoughnessTex.repeat.set(12, 12);

    // 0B. Weathered Asphalt Road Textures (Albedo + Mineral Aggregate Bump)
    const priRoadCanvas = document.createElement('canvas');
    priRoadCanvas.width = 256;
    priRoadCanvas.height = 256;
    const prCtx = priRoadCanvas.getContext('2d');
    prCtx.fillStyle = '#2B2F34';
    prCtx.fillRect(0, 0, 256, 256);
    // Subtle gutter shading (no harsh black rectangular tire stripes)
    prCtx.fillStyle = 'rgba(15, 17, 20, 0.12)';
    prCtx.fillRect(0, 0, 14, 256);
    prCtx.fillRect(242, 0, 14, 256);
    // Mineral aggregate noise
    for (let i = 0; i < 6500; i++) {
      const ax = rand() * 256;
      const ay = rand() * 256;
      prCtx.fillStyle = rand() > 0.5 ? 'rgba(255, 255, 255, 0.045)' : 'rgba(0, 0, 0, 0.09)';
      prCtx.fillRect(ax, ay, 1.5, 1.5);
    }
    // Weathered thermoplastic centerline dashes
    prCtx.fillStyle = 'rgba(228, 231, 235, 0.74)';
    prCtx.fillRect(125, 24, 6, 72);
    prCtx.fillRect(125, 152, 6, 72);
    const primaryRoadTex = new THREE.CanvasTexture(priRoadCanvas);
    primaryRoadTex.colorSpace = THREE.SRGBColorSpace;
    primaryRoadTex.wrapS = THREE.RepeatWrapping;
    primaryRoadTex.wrapT = THREE.RepeatWrapping;
    primaryRoadTex.anisotropy = 8;

    const secRoadCanvas = document.createElement('canvas');
    secRoadCanvas.width = 128;
    secRoadCanvas.height = 128;
    const srCtx = secRoadCanvas.getContext('2d');
    srCtx.fillStyle = '#363B42';
    srCtx.fillRect(0, 0, 128, 128);
    srCtx.fillStyle = 'rgba(15, 17, 20, 0.18)';
    srCtx.fillRect(0, 0, 14, 128);
    srCtx.fillRect(114, 0, 14, 128);
    for (let i = 0; i < 2400; i++) {
      const ax = rand() * 128;
      const ay = rand() * 128;
      srCtx.fillStyle = rand() > 0.5 ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.08)';
      srCtx.fillRect(ax, ay, 1.5, 1.5);
    }
    const secondaryRoadTex = new THREE.CanvasTexture(secRoadCanvas);
    secondaryRoadTex.colorSpace = THREE.SRGBColorSpace;
    secondaryRoadTex.wrapS = THREE.RepeatWrapping;
    secondaryRoadTex.wrapT = THREE.RepeatWrapping;
    secondaryRoadTex.anisotropy = 4;

    const asphaltBumpCanvas = document.createElement('canvas');
    asphaltBumpCanvas.width = 128;
    asphaltBumpCanvas.height = 128;
    const abCtx = asphaltBumpCanvas.getContext('2d');
    abCtx.fillStyle = '#808080';
    abCtx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4500; i++) {
      const v = Math.floor(95 + rand() * 70);
      abCtx.fillStyle = `rgb(${v},${v},${v})`;
      abCtx.fillRect(rand() * 128, rand() * 128, 1.5, 1.5);
    }
    const asphaltBumpTex = new THREE.CanvasTexture(asphaltBumpCanvas);
    asphaltBumpTex.wrapS = THREE.RepeatWrapping;
    asphaltBumpTex.wrapT = THREE.RepeatWrapping;
    asphaltBumpTex.repeat.set(2, 2);

    // 0C. Weathered Poured Concrete Sidewalk & Bridge Deck Texture
    const concCanvas = document.createElement('canvas');
    concCanvas.width = 256;
    concCanvas.height = 256;
    const ccCtx = concCanvas.getContext('2d');
    ccCtx.fillStyle = '#B7B3A9';
    ccCtx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      ccCtx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(40,38,34,0.06)';
      ccCtx.fillRect(rand() * 256, rand() * 256, 2, 2);
    }
    // Expansion joints
    ccCtx.fillStyle = 'rgba(65, 62, 56, 0.28)';
    for (let y = 0; y < 256; y += 64) {
      ccCtx.fillRect(0, y, 256, 2);
    }
    ccCtx.fillRect(128, 0, 1, 256);
    const concreteTex = new THREE.CanvasTexture(concCanvas);
    concreteTex.colorSpace = THREE.SRGBColorSpace;
    concreteTex.wrapS = THREE.RepeatWrapping;
    concreteTex.wrapT = THREE.RepeatWrapping;
    concreteTex.anisotropy = 4;

    // 0D. High-Resolution Seamless Multi-Harmonic River Ripple Normal Map
    const wnSize = 512;
    const wnCanvas = document.createElement('canvas');
    wnCanvas.width = wnSize;
    wnCanvas.height = wnSize;
    const wnCtx = wnCanvas.getContext('2d');
    const wnImg = wnCtx.createImageData(wnSize, wnSize);
    for (let py = 0; py < wnSize; py++) {
      for (let px = 0; px < wnSize; px++) {
        const u = (px / wnSize) * Math.PI * 2;
        const v = (py / wnSize) * Math.PI * 2;
        // Multi-directional integer-harmonic swells + capillary ripples (seamless periodic tiling)
        const dx =
          Math.cos(u * 2 + v * 3) * 0.28 +
          Math.cos(u * 5 - v * 4) * 0.24 +
          Math.cos(u * 9 + v * 7) * 0.16 +
          Math.cos(u * 14 - v * 11) * 0.11 +
          Math.cos(u * 21 + v * 17) * 0.06;
        const dy =
          Math.sin(v * 3 + u * 2) * 0.26 +
          Math.sin(v * 6 - u * 3) * 0.22 +
          Math.sin(v * 10 + u * 6) * 0.16 +
          Math.sin(v * 16 - u * 9) * 0.11 +
          Math.sin(v * 23 + u * 13) * 0.06;
        const idx = (py * wnSize + px) * 4;
        wnImg.data[idx] = Math.max(0, Math.min(255, Math.floor(128 + dx * 42)));
        wnImg.data[idx + 1] = Math.max(0, Math.min(255, Math.floor(128 + dy * 42)));
        wnImg.data[idx + 2] = 247;
        wnImg.data[idx + 3] = 255;
      }
    }
    wnCtx.putImageData(wnImg, 0, 0);
    const waterNormalTex = new THREE.CanvasTexture(wnCanvas);
    waterNormalTex.wrapS = THREE.RepeatWrapping;
    waterNormalTex.wrapT = THREE.RepeatWrapping;
    waterNormalTex.repeat.set(3, 20);
    waterNormalTex.anisotropy = 8;

    const bicolWaterNormalTex = waterNormalTex.clone();
    bicolWaterNormalTex.needsUpdate = true;
    bicolWaterNormalTex.repeat.set(4, 24);

    // 1. Architectural Precast / Limestone & Dark-Tinted Window Facade Texture
    const commCanvas = document.createElement('canvas');
    commCanvas.width = 256;
    commCanvas.height = 256;
    const cCtx = commCanvas.getContext('2d');
    cCtx.fillStyle = '#EAE6DF';
    cCtx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) {
      const y = row * 64;
      // Precast spandrel beam & subtle shadow joint
      cCtx.fillStyle = '#DFDAD0';
      cCtx.fillRect(0, y, 256, 13);
      cCtx.fillStyle = '#C2BBB0';
      cCtx.fillRect(0, y + 13, 256, 2);
      for (let col = 0; col < 4; col++) {
        const x = col * 64;
        // Vertical pilaster panel
        cCtx.fillStyle = '#E5E0D7';
        cCtx.fillRect(x, y + 15, 9, 49);
        cCtx.fillRect(x + 55, y + 15, 9, 49);
        // Dark anodized aluminum window frame
        cCtx.fillStyle = '#2A343E';
        cCtx.fillRect(x + 9, y + 16, 46, 43);
        // Deep architectural tinted glass gradient (no cartoon cyan)
        const glassGrad = cCtx.createLinearGradient(x + 11, y + 18, x + 53, y + 57);
        glassGrad.addColorStop(0, '#14222F');
        glassGrad.addColorStop(0.5, '#1D3244');
        glassGrad.addColorStop(1, '#274258');
        cCtx.fillStyle = glassGrad;
        cCtx.fillRect(x + 11, y + 18, 42, 39);
        // Subtle interior ceiling / blind depth band
        cCtx.fillStyle = 'rgba(226, 232, 240, 0.12)';
        cCtx.fillRect(x + 12, y + 19, 40, 7);
        // Slim dark aluminum transom & vertical mullion
        cCtx.fillStyle = '#334155';
        cCtx.fillRect(x + 31, y + 18, 2, 39);
        cCtx.fillRect(x + 11, y + 32, 42, 2);
        // Projecting limestone sill
        cCtx.fillStyle = '#CFC8BC';
        cCtx.fillRect(x + 8, y + 58, 48, 4);
      }
    }
    const commercialFacadeTex = new THREE.CanvasTexture(commCanvas);
    commercialFacadeTex.colorSpace = THREE.SRGBColorSpace;
    commercialFacadeTex.wrapS = THREE.RepeatWrapping;
    commercialFacadeTex.wrapT = THREE.RepeatWrapping;
    commercialFacadeTex.anisotropy = 4;

    // 2. Realistic Dark-Tinted Architectural Curtain-Wall Texture (PBR handles real speculars)
    const glassCanvas = document.createElement('canvas');
    glassCanvas.width = 256;
    glassCanvas.height = 256;
    const gCtx = glassCanvas.getContext('2d');
    const cwGrad = gCtx.createLinearGradient(0, 0, 0, 256);
    cwGrad.addColorStop(0, '#182A3A');
    cwGrad.addColorStop(0.5, '#1F364A');
    cwGrad.addColorStop(1, '#142331');
    gCtx.fillStyle = cwGrad;
    gCtx.fillRect(0, 0, 256, 256);
    // Subtle per-pane glass tint variation & interior floor-slab shadow bands
    for (let gy = 0; gy < 256; gy += 32) {
      gCtx.fillStyle = 'rgba(10, 18, 28, 0.55)';
      gCtx.fillRect(0, gy, 256, 7);
      gCtx.fillStyle = 'rgba(148, 163, 184, 0.14)';
      gCtx.fillRect(0, gy + 9, 256, 4);
      // Horizontal dark anodized transom
      gCtx.fillStyle = '#2B3744';
      gCtx.fillRect(0, gy + 6, 256, 2);
    }
    for (let gx = 0; gx < 256; gx += 32) {
      // Subtle pane-to-pane reflection shift
      if ((gx / 32) % 2 === 0) {
        gCtx.fillStyle = 'rgba(203, 213, 225, 0.05)';
        gCtx.fillRect(gx + 2, 0, 30, 256);
      }
      // Vertical dark anodized mullion
      gCtx.fillStyle = '#2B3744';
      gCtx.fillRect(gx, 0, 2, 256);
    }
    const glazingTex = new THREE.CanvasTexture(glassCanvas);
    glazingTex.colorSpace = THREE.SRGBColorSpace;
    glazingTex.wrapS = THREE.RepeatWrapping;
    glazingTex.wrapT = THREE.RepeatWrapping;
    glazingTex.anisotropy = 4;

    // 3. Scalloped Clay Barrel-Tile Roof Texture (Reference Images 7 & 8)
    const roofCanvas = document.createElement('canvas');
    roofCanvas.width = 128;
    roofCanvas.height = 128;
    const rCtx = roofCanvas.getContext('2d');
    rCtx.fillStyle = '#EBE6DF';
    rCtx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      rCtx.fillStyle = 'rgba(15, 23, 42, 0.18)';
      rCtx.fillRect(0, y + 12, 128, 4);
      rCtx.fillStyle = 'rgba(255, 255, 255, 0.22)';
      rCtx.fillRect(0, y + 1, 128, 3);
    }
    for (let x = 0; x < 128; x += 12) {
      rCtx.fillStyle = 'rgba(15, 23, 42, 0.14)';
      rCtx.fillRect(x, 0, 3, 128);
      rCtx.fillStyle = 'rgba(255, 255, 255, 0.18)';
      rCtx.fillRect(x + 4, 0, 3, 128);
    }
    const roofTileTex = new THREE.CanvasTexture(roofCanvas);
    roofTileTex.colorSpace = THREE.SRGBColorSpace;
    roofTileTex.wrapS = THREE.RepeatWrapping;
    roofTileTex.wrapT = THREE.RepeatWrapping;
    roofTileTex.repeat.set(3, 3);

    // 4. Antique Square Slate & Terracotta Tile Texture (Reference Image 5 sphere 5)
    const slateCanvas = document.createElement('canvas');
    slateCanvas.width = 128;
    slateCanvas.height = 128;
    const slCtx = slateCanvas.getContext('2d');
    slCtx.fillStyle = '#585E66';
    slCtx.fillRect(0, 0, 128, 128);
    for (let sy = 0; sy < 128; sy += 16) {
      for (let sx = 0; sx < 128; sx += 16) {
        const shade = ((sx + sy) / 16) % 2 === 0 ? '#626870' : '#4E545C';
        slCtx.fillStyle = shade;
        slCtx.fillRect(sx + 1, sy + 1, 14, 14);
        slCtx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
        slCtx.lineWidth = 1;
        slCtx.strokeRect(sx + 0.5, sy + 0.5, 15, 15);
      }
    }
    const slateTileTex = new THREE.CanvasTexture(slateCanvas);
    slateTileTex.colorSpace = THREE.SRGBColorSpace;
    slateTileTex.wrapS = THREE.RepeatWrapping;
    slateTileTex.wrapT = THREE.RepeatWrapping;
    slateTileTex.repeat.set(2, 2);

    // 5. Small Glazed Azure Ceramic Mosaic Tile Texture (Reference Image 5 sphere 6)
    const mosaicCanvas = document.createElement('canvas');
    mosaicCanvas.width = 128;
    mosaicCanvas.height = 128;
    const mCtx = mosaicCanvas.getContext('2d');
    mCtx.fillStyle = '#BAE6FD';
    mCtx.fillRect(0, 0, 128, 128);
    const mosaicBlues = ['#1E6B99', '#2582B8', '#3398CF', '#185980', '#44AAE0'];
    for (let my = 0; my < 128; my += 16) {
      for (let mx = 0; mx < 128; mx += 16) {
        const cIdx = (mx / 16 + (my / 16) * 3) % mosaicBlues.length;
        mCtx.fillStyle = mosaicBlues[cIdx];
        mCtx.fillRect(mx + 1, my + 1, 14, 14);
        mCtx.fillStyle = 'rgba(255, 255, 255, 0.28)';
        mCtx.fillRect(mx + 2, my + 2, 5, 4);
      }
    }
    const mosaicTileTex = new THREE.CanvasTexture(mosaicCanvas);
    mosaicTileTex.colorSpace = THREE.SRGBColorSpace;
    mosaicTileTex.wrapS = THREE.RepeatWrapping;
    mosaicTileTex.wrapT = THREE.RepeatWrapping;
    mosaicTileTex.repeat.set(2, 2);

    // 6. Subtle Architectural Stucco Plaster Texture (Eliminates flat plastic wall look)
    const stuccoCanvas = document.createElement('canvas');
    stuccoCanvas.width = 128;
    stuccoCanvas.height = 128;
    const stCtx = stuccoCanvas.getContext('2d');
    stCtx.fillStyle = '#F7F5F0';
    stCtx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1800; i++) {
      const sx = (i * 73) % 128;
      const sy = (i * 137) % 128;
      stCtx.fillStyle = i % 2 === 0 ? 'rgba(120, 113, 108, 0.045)' : 'rgba(255, 255, 255, 0.12)';
      stCtx.fillRect(sx, sy, 2, 2);
    }
    // Subtle vertical ambient-occlusion gradient
    const aoGrad = stCtx.createLinearGradient(0, 0, 0, 128);
    aoGrad.addColorStop(0, 'rgba(15, 23, 42, 0.06)');
    aoGrad.addColorStop(0.18, 'rgba(15, 23, 42, 0.0)');
    aoGrad.addColorStop(0.84, 'rgba(15, 23, 42, 0.0)');
    aoGrad.addColorStop(1, 'rgba(15, 23, 42, 0.08)');
    stCtx.fillStyle = aoGrad;
    stCtx.fillRect(0, 0, 128, 128);
    const stuccoTex = new THREE.CanvasTexture(stuccoCanvas);
    stuccoTex.colorSpace = THREE.SRGBColorSpace;
    stuccoTex.wrapS = THREE.RepeatWrapping;
    stuccoTex.wrapT = THREE.RepeatWrapping;

    // 7. Perforated Charcoal Breeze-Block / Brick Screen Texture (Reference Image 3 Center)
    const brickCanvas = document.createElement('canvas');
    brickCanvas.width = 128;
    brickCanvas.height = 128;
    const brCtx = brickCanvas.getContext('2d');
    brCtx.fillStyle = '#474B52';
    brCtx.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 16; row++) {
      const by = row * 8;
      const offset = (row % 2) * 8;
      for (let col = -1; col < 8; col++) {
        const bx = col * 16 + offset;
        brCtx.fillStyle = '#5B6068';
        brCtx.fillRect(bx + 1, by + 1, 14, 6);
        brCtx.fillStyle = '#1E2229';
        brCtx.fillRect(bx + 4, by + 2, 8, 4);
      }
    }
    const brickScreenTex = new THREE.CanvasTexture(brickCanvas);
    brickScreenTex.colorSpace = THREE.SRGBColorSpace;
    brickScreenTex.wrapS = THREE.RepeatWrapping;
    brickScreenTex.wrapT = THREE.RepeatWrapping;

    // 8. Warm Fluted Timber Slat Texture (Reference Image 3 Upper-Left & Gates)
    const timberCanvas = document.createElement('canvas');
    timberCanvas.width = 128;
    timberCanvas.height = 128;
    const tCtx = timberCanvas.getContext('2d');
    tCtx.fillStyle = '#9C7A5B';
    tCtx.fillRect(0, 0, 128, 128);
    for (let ty = 0; ty < 128; ty += 8) {
      tCtx.fillStyle = '#B08D6C';
      tCtx.fillRect(0, ty, 128, 5);
      tCtx.fillStyle = '#6E5138';
      tCtx.fillRect(0, ty + 5, 128, 3);
    }
    const timberSlatTex = new THREE.CanvasTexture(timberCanvas);
    timberSlatTex.colorSpace = THREE.SRGBColorSpace;
    timberSlatTex.wrapS = THREE.RepeatWrapping;
    timberSlatTex.wrapT = THREE.RepeatWrapping;

    // 9. Weathered Creosote Timber / Aged Utility Pole Texture (Reference Images 1 & 2)
    const poleCanvas = document.createElement('canvas');
    poleCanvas.width = 128;
    poleCanvas.height = 256;
    const pCtx = poleCanvas.getContext('2d');
    pCtx.fillStyle = '#85745F';
    pCtx.fillRect(0, 0, 128, 256);
    for (let x = 0; x < 128; x += 3) {
      pCtx.fillStyle = rand() > 0.45 ? 'rgba(52, 42, 30, 0.24)' : 'rgba(196, 184, 162, 0.18)';
      pCtx.fillRect(x, 0, 2, 256);
    }
    for (let i = 0; i < 1400; i++) {
      pCtx.fillStyle = rand() > 0.5 ? 'rgba(34, 26, 18, 0.18)' : 'rgba(208, 198, 178, 0.12)';
      pCtx.fillRect(rand() * 128, rand() * 256, 2, 7);
    }
    // Concrete base collar zone at lower pole
    const baseGrad = pCtx.createLinearGradient(0, 218, 0, 256);
    baseGrad.addColorStop(0, 'rgba(130, 126, 118, 0)');
    baseGrad.addColorStop(0.45, 'rgba(118, 114, 106, 0.78)');
    baseGrad.addColorStop(1, 'rgba(92, 88, 82, 0.94)');
    pCtx.fillStyle = baseGrad;
    pCtx.fillRect(0, 218, 128, 38);
    const poleWoodTex = new THREE.CanvasTexture(poleCanvas);
    poleWoodTex.colorSpace = THREE.SRGBColorSpace;
    poleWoodTex.wrapS = THREE.RepeatWrapping;
    poleWoodTex.wrapT = THREE.ClampToEdgeWrapping;

    // 10. Yellow & Black Vertical Hazard Bumper Texture for Main Traffic Light Mast (Reference Image 3)
    const bumperCanvas = document.createElement('canvas');
    bumperCanvas.width = 128;
    bumperCanvas.height = 128;
    const bpCtx = bumperCanvas.getContext('2d');
    bpCtx.fillStyle = '#FACC15';
    bpCtx.fillRect(0, 0, 128, 128);
    for (let bx = 0; bx < 128; bx += 16) {
      bpCtx.fillStyle = '#181C22';
      bpCtx.fillRect(bx, 0, 7, 128);
    }
    bpCtx.fillStyle = '#181C22';
    bpCtx.fillRect(0, 0, 128, 6);
    bpCtx.fillRect(0, 122, 128, 6);
    const signalBumperTex = new THREE.CanvasTexture(bumperCanvas);
    signalBumperTex.colorSpace = THREE.SRGBColorSpace;
    signalBumperTex.wrapS = THREE.RepeatWrapping;
    signalBumperTex.wrapT = THREE.ClampToEdgeWrapping;

    // 11. Vertical Red Regulatory Plaque Texture for Traffic Signal Mast (Reference Image 3)
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 64;
    signCanvas.height = 160;
    const sgCtx = signCanvas.getContext('2d');
    sgCtx.fillStyle = '#B91C1C';
    sgCtx.fillRect(0, 0, 64, 160);
    sgCtx.strokeStyle = '#F1F5F9';
    sgCtx.lineWidth = 3;
    sgCtx.strokeRect(4, 4, 56, 152);
    sgCtx.fillStyle = '#F8FAFC';
    for (let sy = 18; sy < 142; sy += 22) {
      sgCtx.fillRect(20, sy, 24, 10);
    }
    const trafficSignRedTex = new THREE.CanvasTexture(signCanvas);
    trafficSignRedTex.colorSpace = THREE.SRGBColorSpace;

    // 12. Pedestrian Crossing Pylon Graphic Face Texture (Reference Image 3 Right Unit)
    const makePedSignalTex = (isGreen) => {
      const pc = document.createElement('canvas');
      pc.width = 128;
      pc.height = 256;
      const p = pc.getContext('2d');
      // Dark upper housing backdrop
      p.fillStyle = '#151920';
      p.fillRect(0, 0, 128, 154);

      // Upper square LED lens screen
      p.fillStyle = '#0D1116';
      p.fillRect(14, 12, 100, 86);
      const glow = p.createRadialGradient(64, 55, 4, 64, 55, 46);
      glow.addColorStop(0, isGreen ? 'rgba(34, 255, 95, 0.35)' : 'rgba(255, 56, 56, 0.35)');
      glow.addColorStop(1, 'rgba(13, 17, 22, 0)');
      p.fillStyle = glow;
      p.fillRect(14, 12, 100, 86);

      // Stylized Pedestrian Pictogram (Walking vs Standing)
      p.fillStyle = isGreen ? '#22FF5E' : '#FF3B3B';
      // Head
      p.beginPath();
      p.arc(64, 29, 7, 0, Math.PI * 2);
      p.fill();
      if (isGreen) {
        // Torso & striding legs + arms
        p.beginPath();
        p.moveTo(61, 38);
        p.lineTo(68, 38);
        p.lineTo(66, 61);
        p.lineTo(59, 61);
        p.closePath();
        p.fill();
        p.lineWidth = 6;
        p.strokeStyle = '#22FF5E';
        p.lineCap = 'round';
        p.beginPath();
        p.moveTo(62, 60);
        p.lineTo(48, 84);
        p.moveTo(65, 60);
        p.lineTo(79, 83);
        p.moveTo(61, 43);
        p.lineTo(47, 57);
        p.moveTo(66, 43);
        p.lineTo(81, 54);
        p.stroke();
      } else {
        // Upright standing silhouette
        p.fillRect(58, 38, 12, 24);
        p.fillRect(59, 62, 4, 22);
        p.fillRect(65, 62, 4, 22);
        p.fillRect(52, 40, 4, 20);
        p.fillRect(72, 40, 4, 20);
      }

      // Dark tinted countdown LED sub-window
      p.fillStyle = '#1E242D';
      p.fillRect(18, 105, 92, 38);
      p.strokeStyle = '#334155';
      p.lineWidth = 2;
      p.strokeRect(18, 105, 92, 38);

      // Lower informational blue transit/crosswalk directory plate
      p.fillStyle = '#39557A';
      p.fillRect(10, 154, 108, 96);
      p.strokeStyle = '#94A3B8';
      p.lineWidth = 2;
      p.strokeRect(10, 154, 108, 96);
      // 2x3 White/Blue Pictogram Tiles
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) {
          p.fillStyle = '#E2E8F0';
          p.fillRect(18 + col * 32, 162 + row * 24, 26, 20);
          p.fillStyle = '#39557A';
          p.fillRect(23 + col * 32, 167 + row * 24, 16, 10);
        }
      }
      // Informational horizontal directory rows below
      p.fillStyle = '#CBD5E1';
      for (let r = 0; r < 4; r++) {
        p.fillRect(18, 212 + r * 8, 86 - (r % 2) * 14, 4);
      }

      const t = new THREE.CanvasTexture(pc);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const pedSignalGreenTex = makePedSignalTex(true);
    const pedSignalRedTex = makePedSignalTex(false);

    // 9. Neutral Weathered Running-Bond Brick & CHB Masonry Texture (Stage 3 PBR)
    const masonryCanvas = document.createElement('canvas');
    masonryCanvas.width = 128;
    masonryCanvas.height = 128;
    const brickCtx = masonryCanvas.getContext('2d');
    brickCtx.fillStyle = '#B8B2A8'; // recessed mortar tone
    brickCtx.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 16; row++) {
      const my = row * 8;
      const offset = (row % 2) * 16;
      for (let col = -1; col < 5; col++) {
        const mx = col * 32 + offset;
        const shade = 222 + (((row * 17 + col * 31) % 7) - 3) * 5;
        brickCtx.fillStyle = `rgb(${shade}, ${shade - 3}, ${shade - 7})`;
        brickCtx.fillRect(mx + 1, my + 1, 30, 6);
      }
    }
    const brickMasonryTex = new THREE.CanvasTexture(masonryCanvas);
    brickMasonryTex.colorSpace = THREE.SRGBColorSpace;
    brickMasonryTex.wrapS = THREE.RepeatWrapping;
    brickMasonryTex.wrapT = THREE.RepeatWrapping;

    return {
      satelliteTex,
      terrainBumpTex,
      terrainRoughnessTex,
      primaryRoadTex,
      secondaryRoadTex,
      asphaltBumpTex,
      concreteTex,
      waterNormalTex,
      bicolWaterNormalTex,
      commercialFacadeTex,
      glazingTex,
      roofTileTex,
      slateTileTex,
      mosaicTileTex,
      stuccoTex,
      brickScreenTex,
      brickMasonryTex,
      timberSlatTex,
      poleWoodTex,
      signalBumperTex,
      trafficSignRedTex,
      pedSignalGreenTex,
      pedSignalRedTex,
    };
  }, []);
}

// ============================================================================
// 1. ARCHITECTURAL BUILDING & WATER INFRASTRUCTURE MODELS
// ============================================================================

function OrganicShrubStrip({ position = [0, 0, 0], width = 0.06, scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      {[-0.36, -0.14, 0.08, 0.30].map((fx, i) => (
        <mesh
          key={i}
          position={[fx * width, (i % 2 === 0 ? 0.004 : 0.007), (i % 2 === 0 ? 0.002 : -0.002)]}
          castShadow
        >
          <dodecahedronGeometry args={[0.0075 + (i % 2) * 0.002, 0]} />
          <meshStandardMaterial
            color={i % 3 === 0 ? '#3A5A2A' : i % 3 === 1 ? '#4B6E38' : '#2D4820'}
            roughness={0.88}
          />
        </mesh>
      ))}
    </group>
  );
}

function RecessedWindow({
  position,
  rotation = [0, 0, 0],
  w = 0.052,
  h = 0.048,
  canopy = false,
  canopyColor = '#8C4332',
  frameColor = '#334155',
  glassColor = '#1B2836',
  shutters = false,
  shutterColor = '#41523A',
  planter = false,
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Slim Architectural Frame & Shadow Reveal */}
      <mesh position={[0, 0, 0.0012]}>
        <boxGeometry args={[w, h, 0.003]} />
        <meshStandardMaterial color={frameColor} roughness={0.5} />
      </mesh>
      {/* Realistic Dark-Tinted Architectural Glass Pane */}
      <mesh position={[0, 0, 0.0024]}>
        <boxGeometry args={[w - 0.006, h - 0.006, 0.002]} />
        <meshStandardMaterial color={glassColor} metalness={0.62} roughness={0.14} />
      </mesh>
      {/* Fine Casement Mullions */}
      <mesh position={[0, 0, 0.0032]}>
        <boxGeometry args={[0.0022, h - 0.005, 0.002]} />
        <meshStandardMaterial color={frameColor} roughness={0.45} />
      </mesh>
      <mesh position={[0, h * 0.10, 0.0032]}>
        <boxGeometry args={[w - 0.005, 0.0020, 0.002]} />
        <meshStandardMaterial color={frameColor} roughness={0.45} />
      </mesh>
      {/* Slim Stone Lintel & Projecting Sill */}
      <mesh position={[0, h * 0.5 + 0.002, 0.0022]}>
        <boxGeometry args={[w + 0.005, 0.004, 0.005]} />
        <meshStandardMaterial color="#E5E0D8" roughness={0.65} />
      </mesh>
      <mesh position={[0, -h * 0.5 - 0.002, 0.0028]}>
        <boxGeometry args={[w + 0.007, 0.004, 0.007]} />
        <meshStandardMaterial color="#D6CFC2" roughness={0.7} />
      </mesh>
      {/* Optional Louvered Heritage Shutters */}
      {shutters && (
        <>
          <mesh position={[-w * 0.5 - 0.0045, 0, 0.002]}>
            <boxGeometry args={[0.0075, h - 0.003, 0.003]} />
            <meshStandardMaterial color={shutterColor} roughness={0.75} />
          </mesh>
          <mesh position={[w * 0.5 + 0.0045, 0, 0.002]}>
            <boxGeometry args={[0.0075, h - 0.003, 0.003]} />
            <meshStandardMaterial color={shutterColor} roughness={0.75} />
          </mesh>
        </>
      )}
      {/* Optional Slim Planter Trough with Organic Botanical Foliage */}
      {planter && (
        <group position={[0, -h * 0.5 - 0.005, 0.005]}>
          <mesh>
            <boxGeometry args={[w * 0.86, 0.006, 0.008]} />
            <meshStandardMaterial color="#C8B9A6" roughness={0.78} />
          </mesh>
          <OrganicShrubStrip position={[0, 0.003, 0]} width={w * 0.78} />
        </group>
      )}
      {/* Optional Slim Sun-Breaker Brow */}
      {canopy && (
        <mesh position={[0, h * 0.5 + 0.005, 0.005]}>
          <boxGeometry args={[w + 0.008, 0.004, 0.011]} />
          <meshStandardMaterial color={canopyColor} roughness={0.55} />
        </mesh>
      )}
    </group>
  );
}

// Ensures every residential building has realistic fenestration on Left, Right, and Rear facades (zero blank white boxes)
function PerimeterWindows({
  bodyW,
  bodyD,
  bodyH,
  centerZ = 0,
  baseY = 0.006,
  levels = 2,
  frameColor = '#334155',
  shutters = false,
  canopy = false,
  canopyColor = '#3B5978',
}) {
  const clampedLevels = Math.min(4, Math.max(1, levels));
  const rows = Array.from({ length: clampedLevels }, (_, i) => (i + 0.52) / clampedLevels);
  const winW = Math.min(0.040, bodyW * 0.24);
  const winH = Math.min(0.034, (bodyH / clampedLevels) * 0.48);

  return (
    <group>
      {rows.map((ry, rIdx) => {
        const wy = baseY + bodyH * ry;
        return (
          <group key={rIdx}>
            {/* Left & Right Facade Windows */}
            <RecessedWindow
              position={[-bodyW * 0.5, wy, centerZ]}
              rotation={[0, -Math.PI * 0.5, 0]}
              w={winW}
              h={winH}
              frameColor={frameColor}
              shutters={shutters}
              canopy={canopy}
              canopyColor={canopyColor}
            />
            <RecessedWindow
              position={[bodyW * 0.5, wy, centerZ]}
              rotation={[0, Math.PI * 0.5, 0]}
              w={winW}
              h={winH}
              frameColor={frameColor}
              shutters={shutters}
              canopy={canopy}
              canopyColor={canopyColor}
            />
            {/* Rear Facade Twin Windows */}
            {[-bodyW * 0.24, bodyW * 0.24].map((rx, cIdx) => (
              <RecessedWindow
                key={cIdx}
                position={[rx, wy, centerZ - bodyD * 0.5]}
                rotation={[0, Math.PI, 0]}
                w={winW * 0.92}
                h={winH}
                frameColor={frameColor}
                shutters={shutters}
                canopy={canopy}
                canopyColor={canopyColor}
              />
            ))}
          </group>
        );
      })}
    </group>
  );
}

// Concrete perimeter wall & slatted steel gate for local Philippine residential lots
function ResidentialFenceAndGate({ w, d, wallColor = '#D6D0C4', gateColor = '#1E293B' }) {
  const zFront = d * 0.44;
  return (
    <group position={[0, 0.008, zFront]}>
      {/* Left concrete perimeter wall + corner pier */}
      <mesh position={[-w * 0.24, 0.011, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.40, 0.022, 0.009]} />
        <meshStandardMaterial color={wallColor} roughness={0.82} />
      </mesh>
      <mesh position={[-w * 0.44, 0.016, 0]} castShadow>
        <boxGeometry args={[0.011, 0.032, 0.012]} />
        <meshStandardMaterial color="#B8B0A2" roughness={0.8} />
      </mesh>
      {/* Gate piers */}
      {[-0.02, w * 0.20].map((gx, i) => (
        <mesh key={i} position={[gx, 0.017, 0]} castShadow>
          <boxGeometry args={[0.011, 0.034, 0.012]} />
          <meshStandardMaterial color="#B8B0A2" roughness={0.8} />
        </mesh>
      ))}
      {/* Right short perimeter wall + corner pier */}
      <mesh position={[w * 0.32, 0.011, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.24, 0.022, 0.009]} />
        <meshStandardMaterial color={wallColor} roughness={0.82} />
      </mesh>
      <mesh position={[w * 0.44, 0.016, 0]} castShadow>
        <boxGeometry args={[0.011, 0.032, 0.012]} />
        <meshStandardMaterial color="#B8B0A2" roughness={0.8} />
      </mesh>
      {/* Slatted steel gate frame & bars */}
      <mesh position={[w * 0.09, 0.024, 0]}>
        <boxGeometry args={[w * 0.20, 0.003, 0.004]} />
        <meshStandardMaterial color={gateColor} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[w * 0.09, 0.007, 0]}>
        <boxGeometry args={[w * 0.20, 0.003, 0.004]} />
        <meshStandardMaterial color={gateColor} metalness={0.6} roughness={0.35} />
      </mesh>
      {[-0.06, -0.02, 0.02, 0.06].map((bx, i) => (
        <mesh key={i} position={[w * 0.09 + bx * w, 0.015, 0]}>
          <boxGeometry args={[0.0022, 0.022, 0.0022]} />
          <meshStandardMaterial color={gateColor} metalness={0.6} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

// Compact rooftop stainless/poly water tank & AC condenser unit (Reference Images 1-5)
function RooftopWaterTank({ position = [0, 0, 0], tankColor = '#CBD5E1' }) {
  return (
    <group position={position}>
      <mesh position={[0, 0.005, 0]}>
        <boxGeometry args={[0.020, 0.010, 0.020]} />
        <meshStandardMaterial color="#475569" metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.019, 0]} castShadow>
        <cylinderGeometry args={[0.009, 0.009, 0.020, 10]} />
        <meshStandardMaterial color={tankColor} metalness={0.55} roughness={0.28} />
      </mesh>
    </group>
  );
}

export function DetailedResidentialHouseModel({
  w = 0.20,
  d = 0.18,
  h = 0.15,
  levels = 2,
  wallColor = '#F7F5F0',
  roofColor = '#8C4332',
  roofShape = 'hipped',
  roofTex = null,
  slateTex = null,
  mosaicTex = null,
  glazingTex = null,
  stuccoTex = null,
  brickTex = null,
  timberTex = null,
  variant = 0,
}) {
  const externalGlb = useNormalizedGLTF('/models/residential_house.glb', w, d, h * 1.35);
  if (externalGlb) return <primitive object={externalGlb} />;

  const style = variant % 6;
  const clampedLevels = Math.min(4, Math.max(1, levels));
  const isSingle = clampedLevels === 1;
  const f1H = isSingle ? h : h * 0.48;
  const f2H = isSingle ? 0 : h * 0.52;
  const roofH = Math.min(0.044, Math.max(0.026, w * 0.20));

  return (
    <group>
      {/* Sub-Terrain Slope Foundation Skirt */}
      <mesh position={[0, -0.32, 0]} receiveShadow>
        <boxGeometry args={[w * 0.86, 0.64, d * 0.86]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
      </mesh>

      {/* Realistic Concrete Parcel Plinth & Paving */}
      <mesh position={[0, 0.005, 0]} receiveShadow>
        <boxGeometry args={[w * 0.96, 0.010, d * 0.96]} />
        <meshStandardMaterial color="#D6D2C8" roughness={0.85} />
      </mesh>

      {/* ====================================================================
          ARCHETYPE 0: MODERN PHILIPPINE CONCRETE & TIMBER RESIDENCE
          (Supports 1-storey tropical bungalow & 2+ storey cantilevered residence)
          ==================================================================== */}
      {style === 0 && (
        <group>
          {isSingle ? (
            <>
              <mesh position={[-w * 0.08, h * 0.5 + 0.006, -d * 0.04]} castShadow receiveShadow>
                <boxGeometry args={[w * 0.72, h, d * 0.74]} />
                <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.62} />
              </mesh>
              {/* Side covered carport / veranda bay */}
              <mesh position={[w * 0.30, h * 0.86 + 0.006, 0]} castShadow>
                <boxGeometry args={[w * 0.24, 0.008, d * 0.74]} />
                <meshStandardMaterial color="#475569" map={slateTex} roughness={0.65} />
              </mesh>
              <mesh position={[w * 0.39, h * 0.43 + 0.006, d * 0.32]} castShadow>
                <boxGeometry args={[0.010, h * 0.86, 0.010]} />
                <meshStandardMaterial color="#D6D2C8" roughness={0.7} />
              </mesh>
              {/* Timber entry door + front picture window */}
              <mesh position={[-w * 0.24, h * 0.42 + 0.006, d * 0.332]}>
                <boxGeometry args={[0.026, h * 0.74, 0.005]} />
                <meshStandardMaterial color="#6B442A" map={timberTex} roughness={0.68} />
              </mesh>
              <RecessedWindow
                position={[w * 0.04, h * 0.52 + 0.006, d * 0.33]}
                w={w * 0.24}
                h={h * 0.48}
                frameColor="#334155"
                canopy
                canopyColor="#3F4E5C"
              />
              <PerimeterWindows bodyW={w * 0.72} bodyD={d * 0.74} bodyH={h} centerZ={-d * 0.04} levels={1} />
              <mesh position={[-w * 0.08, h + 0.009, -d * 0.04]} castShadow>
                <boxGeometry args={[w * 0.78, 0.008, d * 0.80]} />
                <meshStandardMaterial color="#E5E0D8" roughness={0.58} />
              </mesh>
              <mesh
                geometry={roofShape === 'gabled' ? GABLE_ROOF_GEOMETRY : HIP_ROOF_GEOMETRY}
                position={[-w * 0.08, h + 0.013, -d * 0.04]}
                scale={[w * 0.77, roofH * 1.15, d * 0.79]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color={roofColor} map={roofTex} roughness={0.54} />
              </mesh>
              <ResidentialFenceAndGate w={w} d={d} />
            </>
          ) : (
            <>
              {/* Perforated Brick Ground Core */}
              <mesh position={[0, f1H * 0.5 + 0.006, -d * 0.04]} castShadow receiveShadow>
                <boxGeometry args={[w * 0.86, f1H, d * 0.74]} />
                <meshStandardMaterial color="#FFFFFF" map={brickTex} roughness={0.82} />
              </mesh>
              {/* Warm Fluted Timber Left Wing */}
              <mesh position={[-w * 0.25, h * 0.48 + 0.006, -d * 0.02]} castShadow receiveShadow>
                <boxGeometry args={[w * 0.36, h * 0.96, d * 0.78]} />
                <meshStandardMaterial color="#E6DDD0" map={timberTex || stuccoTex} roughness={0.68} />
              </mesh>
              <ResidentialFenceAndGate w={w} d={d} />
              {/* Cantilevered Stucco Upper Volume */}
              <group position={[w * 0.10, f1H + f2H * 0.5 + 0.008, d * 0.04]}>
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[w * 0.62, f2H, d * 0.76]} />
                  <meshStandardMaterial color="#FAF9F5" map={stuccoTex} roughness={0.58} />
                </mesh>
                <mesh position={[0, f2H * 0.47, d * 0.388]} castShadow>
                  <boxGeometry args={[w * 0.63, 0.008, 0.016]} />
                  <meshStandardMaterial color="#FFFFFF" map={stuccoTex} roughness={0.52} />
                </mesh>
                <mesh position={[0, -f2H * 0.47, d * 0.388]} castShadow>
                  <boxGeometry args={[w * 0.63, 0.008, 0.016]} />
                  <meshStandardMaterial color="#FFFFFF" map={stuccoTex} roughness={0.52} />
                </mesh>
                <RecessedWindow
                  position={[w * 0.06, f2H * 0.06, d * 0.38]}
                  w={w * 0.30}
                  h={f2H * 0.52}
                  frameColor="#334155"
                  canopy
                  canopyColor="#3F4E5C"
                />
                <mesh
                  geometry={GABLE_ROOF_GEOMETRY}
                  position={[0, f2H * 0.5 + 0.005, -d * 0.02]}
                  scale={[w * 0.62, roofH * 1.18, d * 0.72]}
                  castShadow
                  receiveShadow
                >
                  <meshStandardMaterial color={roofColor} map={roofTex} roughness={0.52} />
                </mesh>
              </group>
              <RecessedWindow
                position={[-w * 0.25, f1H + f2H * 0.42, d * 0.37]}
                w={w * 0.22}
                h={f2H * 0.46}
                frameColor="#334155"
              />
              <mesh position={[-w * 0.25, h * 0.96 + 0.009, -d * 0.02]} castShadow>
                <boxGeometry args={[w * 0.38, 0.012, d * 0.80]} />
                <meshStandardMaterial color="#EAE7E1" map={stuccoTex} roughness={0.58} />
              </mesh>
              <RooftopWaterTank position={[-w * 0.25, h * 0.96 + 0.015, -d * 0.16]} />
              <PerimeterWindows bodyW={w * 0.86} bodyD={d * 0.76} bodyH={h * 0.96} centerZ={-d * 0.03} levels={clampedLevels} />
            </>
          )}
        </group>
      )}

      {/* ====================================================================
          ARCHETYPE 1: BANDED CONCRETE MULTI-STOREY APARTMENT / BOARDING HOUSE
          (Reference Images 2, 3, 4: Horizontal Banded Facades, Projecting
           Balcony Bays, Window Sun-Hoods & Rooftop Stair/Tank Bulkheads)
          ==================================================================== */}
      {style === 1 && (
        <group>
          <mesh position={[0, h * 0.5 + 0.006, -d * 0.02]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.88, h, d * 0.80]} />
            <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.62} />
          </mesh>
          {/* Horizontal Floor Spandrel Bands & Per-Floor Window Bays (Ref Images 2-4) */}
          {Array.from({ length: clampedLevels }).map((_, flIdx) => {
            const storyH = h / clampedLevels;
            const fy = 0.006 + storyH * (flIdx + 0.5);
            const hoodColor = flIdx % 2 === 0 ? '#3B5978' : '#4E5D6C';
            return (
              <group key={flIdx}>
                {/* Horizontal Banding */}
                <mesh position={[0, 0.006 + storyH * (flIdx + 1), -d * 0.02]} castShadow>
                  <boxGeometry args={[w * 0.90, 0.007, d * 0.82]} />
                  <meshStandardMaterial color="#D6CFC2" roughness={0.72} />
                </mesh>
                {/* Left & Right Front Recessed Windows with Blue/Slate Sun-Hoods */}
                {[-w * 0.24, w * 0.24].map((wx, cIdx) => (
                  <RecessedWindow
                    key={cIdx}
                    position={[wx, fy, d * 0.38]}
                    w={w * 0.22}
                    h={storyH * 0.52}
                    frameColor="#334155"
                    canopy
                    canopyColor={hoodColor}
                  />
                ))}
                {/* Center Balcony Bay on Upper Floors / Recessed Entry on Ground Floor */}
                {flIdx === 0 ? (
                  <mesh position={[0, fy - storyH * 0.06, d * 0.382]}>
                    <boxGeometry args={[w * 0.20, storyH * 0.78, 0.006]} />
                    <meshStandardMaterial color="#27323F" roughness={0.6} />
                  </mesh>
                ) : (
                  <group position={[0, fy - storyH * 0.42, d * 0.415]}>
                    <mesh castShadow>
                      <boxGeometry args={[w * 0.24, 0.007, 0.036]} />
                      <meshStandardMaterial color="#E5E0D8" roughness={0.6} />
                    </mesh>
                    <mesh position={[0, 0.012, 0.015]}>
                      <boxGeometry args={[w * 0.24, 0.016, 0.003]} />
                      <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.35} />
                    </mesh>
                  </group>
                )}
              </group>
            );
          })}
          {/* Flat Parapet Roof, Stair Bulkhead & Water Tank */}
          <mesh position={[0, h + 0.011, -d * 0.02]} castShadow>
            <boxGeometry args={[w * 0.91, 0.012, d * 0.83]} />
            <meshStandardMaterial color="#E5E0D8" map={stuccoTex} roughness={0.58} />
          </mesh>
          <mesh position={[0, h + 0.018, -d * 0.02]} receiveShadow>
            <boxGeometry args={[w * 0.79, 0.005, d * 0.71]} />
            <meshStandardMaterial color="#586068" map={slateTex} roughness={0.82} />
          </mesh>
          <mesh position={[-w * 0.16, h + 0.034, -d * 0.10]} castShadow>
            <boxGeometry args={[w * 0.24, 0.024, d * 0.22]} />
            <meshStandardMaterial color="#E2DDD3" map={stuccoTex} roughness={0.6} />
          </mesh>
          <RooftopWaterTank position={[w * 0.18, h + 0.020, -d * 0.12]} tankColor="#94A3B8" />
          <PerimeterWindows
            bodyW={w * 0.88}
            bodyD={d * 0.80}
            bodyH={h}
            centerZ={-d * 0.02}
            levels={clampedLevels}
            canopy
            canopyColor="#3B5978"
          />
        </group>
      )}

      {/* ====================================================================
          ARCHETYPE 2: HERITAGE BICOLANO BAHAY-NA-BATO / COLONIAL RESIDENCE
          (Supports 1-storey heritage cottage & 2+ storey stone-base residence)
          ==================================================================== */}
      {style === 2 && (
        <group>
          {isSingle ? (
            <>
              <mesh position={[0, h * 0.5 + 0.006, -d * 0.02]} castShadow receiveShadow>
                <boxGeometry args={[w * 0.86, h, d * 0.80]} />
                <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.68} />
              </mesh>
              <mesh position={[-w * 0.16, h * 0.44 + 0.006, d * 0.382]}>
                <boxGeometry args={[0.030, h * 0.78, 0.005]} />
                <meshStandardMaterial color="#5C3A21" map={timberTex} roughness={0.7} />
              </mesh>
              <RecessedWindow
                position={[w * 0.18, h * 0.52 + 0.006, d * 0.38]}
                w={w * 0.22}
                h={h * 0.46}
                frameColor="#475569"
                shutters
              />
              <PerimeterWindows bodyW={w * 0.86} bodyD={d * 0.80} bodyH={h} centerZ={-d * 0.02} levels={1} shutters />
              <mesh position={[0, h + 0.009, -d * 0.02]} castShadow>
                <boxGeometry args={[w * 0.92, 0.008, d * 0.86]} />
                <meshStandardMaterial color="#EDE7DC" roughness={0.55} />
              </mesh>
              <mesh
                geometry={roofShape === 'gabled' ? GABLE_ROOF_GEOMETRY : HIP_ROOF_GEOMETRY}
                position={[0, h + 0.013, -d * 0.02]}
                scale={[w * 0.91, roofH * 1.25, d * 0.85]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color={roofColor} map={roofTex} roughness={0.54} />
              </mesh>
              <ResidentialFenceAndGate w={w} d={d} wallColor="#C8BEB0" />
            </>
          ) : (
            <>
              <mesh position={[0, f1H * 0.5 + 0.006, -d * 0.02]} castShadow receiveShadow>
                <boxGeometry args={[w * 0.88, f1H, d * 0.82]} />
                <meshStandardMaterial color="#D9CFC0" map={stuccoTex} roughness={0.8} />
              </mesh>
              {/* Staggered Corner Stone Quoins */}
              {[-w * 0.44, w * 0.44].map((qx, cIdx) =>
                [0.2, 0.5, 0.8].map((qy, rIdx) => (
                  <mesh key={`${cIdx}-${rIdx}`} position={[qx, f1H * qy + 0.006, d * 0.385]} castShadow>
                    <boxGeometry args={[0.014, f1H * 0.18, 0.014]} />
                    <meshStandardMaterial color="#A86449" roughness={0.8} />
                  </mesh>
                ))
              )}
              <mesh position={[0, f1H + 0.008, -d * 0.01]} castShadow>
                <boxGeometry args={[w * 0.92, 0.010, d * 0.86]} />
                <meshStandardMaterial color="#EDE7DC" map={stuccoTex} roughness={0.62} />
              </mesh>
              <mesh position={[0, f1H + f2H * 0.5 + 0.012, -d * 0.01]} castShadow receiveShadow>
                <boxGeometry args={[w * 0.90, f2H, d * 0.84]} />
                <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.64} />
              </mesh>
              <group position={[-w * 0.16, f1H * 0.45 + 0.006, d * 0.392]}>
                <mesh>
                  <boxGeometry args={[0.040, f1H * 0.82, 0.006]} />
                  <meshStandardMaterial color="#EDE7DC" roughness={0.65} />
                </mesh>
                <mesh position={[0, -0.002, 0.002]}>
                  <boxGeometry args={[0.030, f1H * 0.76, 0.004]} />
                  <meshStandardMaterial color="#5C3A21" map={timberTex} roughness={0.7} />
                </mesh>
              </group>
              <RecessedWindow
                position={[w * 0.18, f1H * 0.52 + 0.006, d * 0.39]}
                w={w * 0.22}
                h={f1H * 0.44}
                frameColor="#475569"
                shutters
              />
              <RecessedWindow
                position={[-w * 0.20, f1H + f2H * 0.54 + 0.012, d * 0.41]}
                w={w * 0.22}
                h={f2H * 0.46}
                frameColor="#475569"
                shutters
              />
              <RecessedWindow
                position={[w * 0.20, f1H + f2H * 0.54 + 0.012, d * 0.41]}
                w={w * 0.22}
                h={f2H * 0.46}
                frameColor="#475569"
                shutters
              />
              <PerimeterWindows
                bodyW={w * 0.90}
                bodyD={d * 0.84}
                bodyH={h}
                centerZ={-d * 0.01}
                levels={clampedLevels}
                frameColor="#475569"
                shutters
              />
              <mesh position={[0, h + 0.011, -d * 0.01]} castShadow>
                <boxGeometry args={[w * 0.96, 0.009, d * 0.90]} />
                <meshStandardMaterial color="#EDE7DC" roughness={0.55} />
              </mesh>
              <mesh
                geometry={roofShape === 'gabled' ? GABLE_ROOF_GEOMETRY : HIP_ROOF_GEOMETRY}
                position={[0, h + 0.016, -d * 0.01]}
                scale={[w * 0.95, roofH * 1.35, d * 0.89]}
                castShadow
                receiveShadow
              >
                <meshStandardMaterial color={roofColor} map={roofTex} roughness={0.54} />
              </mesh>
              <ResidentialFenceAndGate w={w} d={d} wallColor="#C8BEB0" />
            </>
          )}
        </group>
      )}

      {/* ====================================================================
          ARCHETYPE 3: URBAN MASONRY ROWHOUSE / MULTI-STOREY APARTMENT
          (Reference Image 1: Brick/Plaster Multi-Storey Rowhouse, Ground
           Awning Canopy, Rhythmic Window Bays, Balconies & Roof Equipment)
          ==================================================================== */}
      {style === 3 && (
        <group>
          {/* Ground Floor Masonry Base */}
          {(() => {
            const storyH = h / clampedLevels;
            const upperH = Math.max(0.01, h - storyH);
            return (
              <>
                <mesh position={[0, storyH * 0.5 + 0.006, 0]} castShadow receiveShadow>
                  <boxGeometry args={[w * 0.90, storyH, d * 0.84]} />
                  <meshStandardMaterial color="#FFFFFF" map={brickTex} roughness={0.78} />
                </mesh>
                <RecessedWindow
                  position={[-w * 0.14, storyH * 0.52 + 0.006, d * 0.42]}
                  w={w * 0.38}
                  h={storyH * 0.54}
                  frameColor="#334155"
                  canopy
                  canopyColor={roofColor}
                />
                <group position={[w * 0.24, storyH * 0.44 + 0.006, d * 0.422]}>
                  <mesh>
                    <boxGeometry args={[0.032, storyH * 0.78, 0.006]} />
                    <meshStandardMaterial color="#E5E0D8" />
                  </mesh>
                  <mesh position={[0, 0, 0.002]}>
                    <boxGeometry args={[0.024, storyH * 0.72, 0.004]} />
                    <meshStandardMaterial color="#6B442A" map={timberTex} />
                  </mesh>
                </group>
                {!isSingle && (
                  <>
                    <mesh position={[0, storyH + 0.008, 0]} castShadow>
                      <boxGeometry args={[w * 0.94, 0.009, d * 0.88]} />
                      <meshStandardMaterial color="#EDE7DC" map={stuccoTex} roughness={0.55} />
                    </mesh>
                    <mesh position={[0, storyH + upperH * 0.5 + 0.012, 0]} castShadow receiveShadow>
                      <boxGeometry args={[w * 0.90, upperH, d * 0.84]} />
                      <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.62} />
                    </mesh>
                    {/* Vertical Pilasters */}
                    {[-w * 0.44, 0, w * 0.44].map((px, i) => (
                      <mesh key={i} position={[px, storyH + upperH * 0.5 + 0.012, d * 0.42]} castShadow>
                        <boxGeometry args={[0.010, upperH, 0.008]} />
                        <meshStandardMaterial color="#EDE7DC" roughness={0.54} />
                      </mesh>
                    ))}
                    {/* Per-upper-floor windows + small balcony ledge */}
                    {Array.from({ length: clampedLevels - 1 }).map((_, uIdx) => {
                      const wy = storyH + 0.012 + storyH * (uIdx + 0.52);
                      return (
                        <group key={uIdx}>
                          <RecessedWindow
                            position={[-w * 0.22, wy, d * 0.42]}
                            w={w * 0.22}
                            h={storyH * 0.50}
                            frameColor="#334155"
                          />
                          <RecessedWindow
                            position={[w * 0.22, wy, d * 0.42]}
                            w={w * 0.22}
                            h={storyH * 0.50}
                            frameColor="#334155"
                          />
                        </group>
                      );
                    })}
                  </>
                )}
                <PerimeterWindows bodyW={w * 0.90} bodyD={d * 0.84} bodyH={h} centerZ={0} levels={clampedLevels} />
                <mesh position={[0, h + 0.014, 0]} castShadow>
                  <boxGeometry args={[w * 0.95, 0.014, d * 0.89]} />
                  <meshStandardMaterial color="#EDE7DC" map={stuccoTex} roughness={0.52} />
                </mesh>
                <mesh position={[0, h + 0.022, 0]} receiveShadow>
                  <boxGeometry args={[w * 0.83, 0.005, d * 0.77]} />
                  <meshStandardMaterial color="#585E66" map={slateTex} roughness={0.78} />
                </mesh>
                <mesh position={[-w * 0.18, h + 0.036, -d * 0.10]} castShadow>
                  <boxGeometry args={[w * 0.22, 0.022, d * 0.20]} />
                  <meshStandardMaterial color="#D6D3CD" roughness={0.6} />
                </mesh>
                <RooftopWaterTank position={[w * 0.18, h + 0.024, -d * 0.12]} />
              </>
            );
          })()}
        </group>
      )}

      {/* ====================================================================
          ARCHETYPE 4: VERNACULAR CONCRETE L-MASSING HOUSE WITH SHED CARPORT
          (Reference Image 5: Main Pitched-Roof Living Volume + Lower Side
           Extension, Corrugated/Tile Roof, Perimeter Wall & Water Tank)
          ==================================================================== */}
      {style === 4 && (
        <group>
          {/* Main Volume */}
          <mesh position={[-w * 0.12, h * 0.5 + 0.006, -d * 0.04]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.64, h, d * 0.76]} />
            <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.68} />
          </mesh>
          {/* Lower Attached Side Wing / Extension */}
          <mesh position={[w * 0.30, h * 0.34 + 0.006, d * 0.02]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.28, h * 0.68, d * 0.66]} />
            <meshStandardMaterial color="#EAE5DB" map={stuccoTex} roughness={0.74} />
          </mesh>
          {/* Side Wing Sloped Shed Roof */}
          <mesh position={[w * 0.30, h * 0.69 + 0.008, d * 0.02]} rotation={[0, 0, -0.14]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.32, 0.009, d * 0.72]} />
            <meshStandardMaterial color="#4E5D6C" map={slateTex} roughness={0.58} />
          </mesh>
          {/* Front Door & Ground/Upper Windows with Sun-Hoods */}
          <mesh position={[-w * 0.24, (isSingle ? h : f1H) * 0.44 + 0.006, d * 0.342]}>
            <boxGeometry args={[0.026, (isSingle ? h : f1H) * 0.76, 0.005]} />
            <meshStandardMaterial color="#5C3A21" map={timberTex} roughness={0.7} />
          </mesh>
          <RecessedWindow
            position={[0, (isSingle ? h : f1H) * 0.52 + 0.006, d * 0.34]}
            w={w * 0.20}
            h={(isSingle ? h : f1H) * 0.46}
            canopy
            canopyColor="#4E5D6C"
          />
          {!isSingle && (
            <RecessedWindow
              position={[-w * 0.12, f1H + f2H * 0.50 + 0.006, d * 0.34]}
              w={w * 0.24}
              h={f2H * 0.46}
              canopy
              canopyColor="#4E5D6C"
            />
          )}
          <PerimeterWindows bodyW={w * 0.64} bodyD={d * 0.76} bodyH={h} centerZ={-d * 0.04} levels={clampedLevels} />
          {/* Overhanging Eave & Main Pitched Roof */}
          <mesh position={[-w * 0.12, h + 0.009, -d * 0.04]} castShadow>
            <boxGeometry args={[w * 0.70, 0.008, d * 0.82]} />
            <meshStandardMaterial color="#E5E0D8" roughness={0.6} />
          </mesh>
          <mesh
            geometry={roofShape === 'gabled' ? GABLE_ROOF_GEOMETRY : HIP_ROOF_GEOMETRY}
            position={[-w * 0.12, h + 0.013, -d * 0.04]}
            scale={[w * 0.69, roofH * 1.25, d * 0.81]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={roofColor} map={roofTex} roughness={0.54} />
          </mesh>
          <RooftopWaterTank position={[w * 0.30, h * 0.70 + 0.010, -d * 0.16]} />
          <ResidentialFenceAndGate w={w} d={d} />
        </group>
      )}

      {/* ====================================================================
          ARCHETYPE 5: SUBURBAN VERANDA RESIDENCE WITH RECESSED PORCH & FENCE
          (Reference Image 5: Concrete & Plaster House with Front Columns,
           Recessed Balcony/Porch, Window Hoods & Pitched Corrugated/Tile Roof)
          ==================================================================== */}
      {style === 5 && (
        <group>
          <mesh position={[0, h * 0.5 + 0.006, -d * 0.05]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.86, h, d * 0.72]} />
            <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.64} />
          </mesh>
          {/* Front Veranda / Balcony Slab & Square Concrete Columns */}
          <mesh position={[0, (isSingle ? h : f1H) + 0.008, d * 0.34]} castShadow>
            <boxGeometry args={[w * 0.68, 0.009, d * 0.16]} />
            <meshStandardMaterial color="#E5E0D8" roughness={0.58} />
          </mesh>
          {[-w * 0.30, w * 0.30].map((cx, i) => (
            <mesh key={i} position={[cx, (isSingle ? h : f1H) * 0.5 + 0.006, d * 0.39]} castShadow>
              <boxGeometry args={[0.012, isSingle ? h : f1H, 0.012]} />
              <meshStandardMaterial color="#EDE7DC" roughness={0.62} />
            </mesh>
          ))}
          {/* Front Door & Ground Window */}
          <mesh position={[-w * 0.16, (isSingle ? h : f1H) * 0.44 + 0.006, d * 0.312]}>
            <boxGeometry args={[0.028, (isSingle ? h : f1H) * 0.76, 0.005]} />
            <meshStandardMaterial color="#5C3A21" map={timberTex} roughness={0.7} />
          </mesh>
          <RecessedWindow
            position={[w * 0.14, (isSingle ? h : f1H) * 0.52 + 0.006, d * 0.31]}
            w={w * 0.22}
            h={(isSingle ? h : f1H) * 0.48}
          />
          {!isSingle && (
            <>
              {/* Upper Balcony Railing + Twin Upper Windows with Sun-Hoods */}
              <mesh position={[0, f1H + 0.022, d * 0.41]}>
                <boxGeometry args={[w * 0.66, 0.016, 0.003]} />
                <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.35} />
              </mesh>
              <RecessedWindow
                position={[-w * 0.20, f1H + f2H * 0.52 + 0.006, d * 0.31]}
                w={w * 0.22}
                h={f2H * 0.46}
                canopy
                canopyColor="#3F4E5C"
              />
              <RecessedWindow
                position={[w * 0.20, f1H + f2H * 0.52 + 0.006, d * 0.31]}
                w={w * 0.22}
                h={f2H * 0.46}
                canopy
                canopyColor="#3F4E5C"
              />
            </>
          )}
          <PerimeterWindows bodyW={w * 0.86} bodyD={d * 0.72} bodyH={h} centerZ={-d * 0.05} levels={clampedLevels} />
          <mesh position={[0, h + 0.009, -d * 0.04]} castShadow>
            <boxGeometry args={[w * 0.92, 0.009, d * 0.80]} />
            <meshStandardMaterial color="#EDE7DC" roughness={0.55} />
          </mesh>
          <mesh
            geometry={roofShape === 'gabled' ? GABLE_ROOF_GEOMETRY : HIP_ROOF_GEOMETRY}
            position={[0, h + 0.014, -d * 0.04]}
            scale={[w * 0.91, roofH * 1.30, d * 0.79]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={roofColor} map={slateTex || roofTex} roughness={0.58} />
          </mesh>
          <ResidentialFenceAndGate w={w} d={d} />
        </group>
      )}
    </group>
  );
}

export function DetailedCommercialBuildingModel({
  w = 0.26,
  d = 0.22,
  h = 0.38,
  levels = 4,
  wallColor = '#EAE4D8',
  accentColor = '#2D4A63',
  facadeTex = null,
  glazingTex = null,
  stuccoTex = null,
  timberTex = null,
  variant = 0,
}) {
  const externalGlb = useNormalizedGLTF('/models/commercial_building.glb', w, d, h);
  if (externalGlb) return <primitive object={externalGlb} />;

  const style = variant % 5;
  const podiumH = Math.min(0.105, Math.max(0.055, h * 0.27));
  const towerH = Math.max(0.10, h - podiumH);
  const floorStep = towerH / Math.max(1, levels - 1);
  const frameColor = '#2A333D';
  const roofDeckColor = '#464E56';
  const mechColor = '#8E97A0';
  const stoneTrim = '#D8D1C5';

  return (
    <group>
      {/* Sub-Terrain Slope Foundation Skirt */}
      <mesh position={[0, -0.32, 0]} receiveShadow>
        <boxGeometry args={[w * 0.88, 0.64, d * 0.88]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.88} />
      </mesh>

      {/* Grounded Granite Sidewalk Plinth */}
      <mesh position={[0, 0.007, 0]} receiveShadow>
        <boxGeometry args={[w * 0.98, 0.014, d * 0.98]} />
        <meshStandardMaterial color="#CBD2D9" roughness={0.82} />
      </mesh>

      {/* ====================================================================
          COMMERCIAL ARCHETYPE 0: TWIN-WING STEPPED GLASS & PRECAST TOWER
          (Ref Image 1: Recessed Central Glazing Core, Twin Stepped Glass &
           Spandrel-Fin Wings, Ground Retail Podium & Entrance Canopy)
          ==================================================================== */}
      {style === 0 && (
        <group>
          {/* Ground-Floor Lobby Glazing & Stone Colonnade Piers */}
          <mesh position={[0, podiumH * 0.5 + 0.007, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.86, podiumH, d * 0.82]} />
            <meshStandardMaterial color="#B8CAD8" map={glazingTex} metalness={0.62} roughness={0.14} />
          </mesh>
          {[-w * 0.42, -w * 0.14, w * 0.14, w * 0.42].map((px, idx) => (
            <group key={idx}>
              <mesh position={[px, podiumH * 0.5 + 0.007, d * 0.41]} castShadow>
                <boxGeometry args={[0.018, podiumH, 0.018]} />
                <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.68} />
              </mesh>
              <mesh position={[px, podiumH * 0.5 + 0.007, -d * 0.41]} castShadow>
                <boxGeometry args={[0.018, podiumH, 0.018]} />
                <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.68} />
              </mesh>
            </group>
          ))}
          {/* Cantilevered Dark Steel & Glass Entrance Canopy */}
          <mesh position={[0, podiumH * 0.74 + 0.007, d * 0.445]} castShadow>
            <boxGeometry args={[w * 0.44, 0.008, 0.042]} />
            <meshStandardMaterial color={frameColor} metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[0, podiumH + 0.008, 0]} castShadow>
            <boxGeometry args={[w * 0.92, 0.014, d * 0.88]} />
            <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.65} />
          </mesh>

          {/* Central Recessed Vertical Glazing Core (Ref Image 1) */}
          <mesh position={[0, podiumH + towerH * 0.5 + 0.014, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.24, towerH, d * 0.70]} />
            <meshStandardMaterial color="#9BBBD4" map={glazingTex} metalness={0.68} roughness={0.12} />
          </mesh>

          {/* Twin Stepped Curtain-Wall & Horizontal Spandrel-Fin Wings */}
          {[-w * 0.26, w * 0.26].map((wx, wIdx) => (
            <group key={wIdx} position={[wx, podiumH + 0.014, 0]}>
              {/* Lower Wing Tier */}
              <mesh position={[0, towerH * 0.31, 0]} castShadow receiveShadow>
                <boxGeometry args={[w * 0.34, towerH * 0.62, d * 0.80]} />
                <meshStandardMaterial color="#C8D9E6" map={glazingTex} metalness={0.64} roughness={0.14} />
              </mesh>
              {/* Horizontal Sun-Shade Spandrel Fins */}
              {Array.from({ length: Math.max(2, levels - 1) }).map((_, fIdx) => {
                const fy = (fIdx + 0.5) * (towerH * 0.58 / Math.max(2, levels - 1));
                return (
                  <mesh key={fIdx} position={[0, fy, 0]} castShadow>
                    <boxGeometry args={[w * 0.38, 0.008, d * 0.84]} />
                    <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.60} />
                  </mesh>
                );
              })}
              {/* Upper Stepped Wing Tier */}
              <mesh position={[0, towerH * 0.80, 0]} castShadow receiveShadow>
                <boxGeometry args={[w * 0.29, towerH * 0.36, d * 0.68]} />
                <meshStandardMaterial color="#D4E2EC" map={glazingTex} metalness={0.66} roughness={0.12} />
              </mesh>
              {/* Wing Crown Cap */}
              <mesh position={[0, towerH * 0.99, 0]} castShadow>
                <boxGeometry args={[w * 0.31, 0.014, d * 0.72]} />
                <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.62} />
              </mesh>
            </group>
          ))}
          {/* Central Mechanical Penthouse */}
          <mesh position={[0, h + 0.030, -d * 0.04]} castShadow>
            <boxGeometry args={[w * 0.24, 0.026, d * 0.34]} />
            <meshStandardMaterial color={mechColor} roughness={0.65} />
          </mesh>
        </group>
      )}

      {/* ====================================================================
          COMMERCIAL ARCHETYPE 1: CYLINDRICAL GLASS ROTUNDA PLAZA
          ==================================================================== */}
      {style === 1 && (
        <group>
          {/* Rectangular Stone Podium Base */}
          <mesh position={[0, podiumH * 0.55 + 0.007, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.88, podiumH * 1.1, d * 0.84]} />
            <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.66} />
          </mesh>
          <mesh position={[0, podiumH * 0.50 + 0.007, d * 0.422]}>
            <boxGeometry args={[w * 0.64, podiumH * 0.74, 0.006]} />
            <meshStandardMaterial color="#C8D6E2" map={glazingTex} metalness={0.6} roughness={0.15} />
          </mesh>
          <mesh position={[0, podiumH * 0.50 + 0.007, -d * 0.422]}>
            <boxGeometry args={[w * 0.64, podiumH * 0.74, 0.006]} />
            <meshStandardMaterial color="#C8D6E2" map={glazingTex} metalness={0.6} roughness={0.15} />
          </mesh>
          {/* Cantilevered Lobby Canopy */}
          <mesh position={[0, podiumH * 0.88 + 0.007, d * 0.445]} castShadow>
            <boxGeometry args={[w * 0.44, 0.008, 0.042]} />
            <meshStandardMaterial color={frameColor} metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[0, podiumH * 1.1 + 0.010, 0]} castShadow>
            <boxGeometry args={[w * 0.92, 0.014, d * 0.88]} />
            <meshStandardMaterial color={stoneTrim} roughness={0.65} />
          </mesh>

          {/* Cylindrical Architectural Glass Rotunda Tower */}
          {(() => {
            const cylR = Math.min(w, d) * 0.40;
            return (
              <group position={[0, podiumH * 1.1 + 0.014, 0]}>
                <mesh position={[0, towerH * 0.48, 0]} castShadow receiveShadow>
                  <cylinderGeometry args={[cylR, cylR, towerH * 0.96, 28]} />
                  <meshStandardMaterial
                    color="#CFDCE6"
                    map={glazingTex}
                    metalness={0.64}
                    roughness={0.14}
                  />
                </mesh>
                {Array.from({ length: Math.max(2, levels) }).map((_, i) => (
                  <mesh key={i} position={[0, (i + 0.5) * (towerH * 0.92 / Math.max(2, levels)), 0]} castShadow>
                    <cylinderGeometry args={[cylR + 0.005, cylR + 0.005, 0.011, 28]} />
                    <meshStandardMaterial color={wallColor} roughness={0.55} />
                  </mesh>
                ))}
                <mesh position={[0, towerH * 0.96 + 0.010, 0]} castShadow>
                  <cylinderGeometry args={[cylR + 0.011, cylR + 0.011, 0.016, 28]} />
                  <meshStandardMaterial color={wallColor} roughness={0.58} />
                </mesh>
                <mesh position={[0, towerH * 0.96 + 0.019, 0]}>
                  <cylinderGeometry args={[cylR * 0.88, cylR * 0.88, 0.005, 24]} />
                  <meshStandardMaterial color={roofDeckColor} roughness={0.86} />
                </mesh>
                {[-cylR * 0.34, cylR * 0.34].map((sx, idx) => (
                  <mesh
                    key={idx}
                    position={[sx, towerH * 0.96 + 0.034, 0]}
                    rotation={[0.32, 0, 0]}
                    castShadow
                  >
                    <boxGeometry args={[cylR * 0.46, 0.007, cylR * 0.58]} />
                    <meshStandardMaterial color="#1B2A38" metalness={0.65} roughness={0.22} />
                  </mesh>
                ))}
              </group>
            );
          })()}
        </group>
      )}

      {/* ====================================================================
          COMMERCIAL ARCHETYPE 2: CONTEMPORARY STEPPED CURTAIN-WALL & SPANDREL OFFICE
          (Ref Image 3: Asymmetric Glass Curtain-Wall Volume, White Horizontal
           Spandrel Ribbons, Rear Core Wall & Raised Entrance Steps)
          ==================================================================== */}
      {style === 2 && (
        <group>
          {/* Raised Entrance Apron & Steps */}
          <mesh position={[0, 0.012, d * 0.45]} receiveShadow>
            <boxGeometry args={[w * 0.48, 0.010, 0.036]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.76} />
          </mesh>
          {/* Rear Structural Shear Core Fin (Ref Image 3) */}
          <mesh position={[-w * 0.36, h * 0.52 + 0.007, -d * 0.14]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.16, h * 1.04, d * 0.56]} />
            <meshStandardMaterial color={wallColor} map={stuccoTex} roughness={0.62} />
          </mesh>
          {/* Main Full-Height Blue-Tinted Curtain-Wall Volume */}
          <mesh position={[0, h * 0.5 + 0.007, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.80, h, d * 0.78]} />
            <meshStandardMaterial color="#8FBCE0" map={glazingTex} metalness={0.68} roughness={0.12} />
          </mesh>
          {/* Lower Stepped Side Wing */}
          <mesh position={[w * 0.28, h * 0.36 + 0.007, d * 0.04]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.26, h * 0.72, d * 0.72]} />
            <meshStandardMaterial color="#9AC2E2" map={glazingTex} metalness={0.66} roughness={0.14} />
          </mesh>
          {/* Crisp White Horizontal Spandrel Ribbons */}
          {Array.from({ length: Math.max(2, levels) }).map((_, i) => {
            const ry = 0.024 + (i + 0.5) * ((h - 0.02) / Math.max(2, levels));
            return (
              <mesh key={i} position={[0, ry, 0]} castShadow>
                <boxGeometry args={[w * 0.84, 0.012, d * 0.82]} />
                <meshStandardMaterial color="#F8FAFC" roughness={0.48} />
              </mesh>
            );
          })}
          {/* Ground-Floor Entrance Canopy & Portal Frame */}
          <mesh position={[-w * 0.12, podiumH * 0.68 + 0.007, d * 0.41]} castShadow>
            <boxGeometry args={[w * 0.32, 0.008, 0.040]} />
            <meshStandardMaterial color={frameColor} metalness={0.55} roughness={0.32} />
          </mesh>
          {/* Crown Parapet & Rooftop Deck */}
          <mesh position={[0, h + 0.012, 0]} castShadow>
            <boxGeometry args={[w * 0.84, 0.014, d * 0.82]} />
            <meshStandardMaterial color="#F8FAFC" roughness={0.52} />
          </mesh>
          <mesh position={[0, h + 0.020, 0]}>
            <boxGeometry args={[w * 0.74, 0.004, d * 0.72]} />
            <meshStandardMaterial color={roofDeckColor} roughness={0.86} />
          </mesh>
        </group>
      )}

      {/* ====================================================================
          COMMERCIAL ARCHETYPE 3: URBAN RETAIL PLAZA & MASONRY MID-RISE
          (Ref Image 2: Dark Storefront Arcade, Rhythmic Recessed Window Grid,
           Floor Stringcourses, Canopy & Rooftop Stair Bulkhead)
          ==================================================================== */}
      {style === 3 && (
        <group>
          {/* Ground-Floor Dark Aluminum Retail Storefront Core */}
          <mesh position={[0, podiumH * 0.5 + 0.007, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.88, podiumH, d * 0.84]} />
            <meshStandardMaterial color="#1F2933" roughness={0.45} />
          </mesh>
          {/* Glazed Retail Display Bays on Front & Rear */}
          {[-w * 0.24, w * 0.24].map((ax, i) => (
            <group key={i}>
              <mesh position={[ax, podiumH * 0.46 + 0.007, d * 0.422]}>
                <boxGeometry args={[w * 0.34, podiumH * 0.72, 0.006]} />
                <meshStandardMaterial color="#B8C9D8" map={glazingTex} metalness={0.62} roughness={0.15} />
              </mesh>
              <mesh position={[ax, podiumH * 0.46 + 0.007, -d * 0.422]}>
                <boxGeometry args={[w * 0.34, podiumH * 0.72, 0.006]} />
                <meshStandardMaterial color="#B8C9D8" map={glazingTex} metalness={0.62} roughness={0.15} />
              </mesh>
            </group>
          ))}
          {/* Cantilevered Steel Entrance Canopy & Subtle Signage Band */}
          <mesh position={[0, podiumH * 0.84 + 0.007, d * 0.455]} castShadow>
            <boxGeometry args={[w * 0.56, 0.009, 0.044]} />
            <meshStandardMaterial color={frameColor} metalness={0.55} roughness={0.32} />
          </mesh>
          <mesh position={[w * 0.14, podiumH + 0.020, d * 0.432]} castShadow>
            <boxGeometry args={[w * 0.42, 0.022, 0.012]} />
            <meshStandardMaterial color={accentColor} map={timberTex} roughness={0.58} />
          </mesh>

          {/* Upper Precast / Masonry Mid-Rise Body */}
          <mesh position={[0, podiumH + towerH * 0.5 + 0.007, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.86, towerH, d * 0.82]} />
            <meshStandardMaterial color={wallColor} map={facadeTex} roughness={0.66} />
          </mesh>

          {/* Deep Horizontal Architectural Spandrel Bands per Floor (Ref Image 2) */}
          {Array.from({ length: Math.max(2, levels) }).map((_, i) => {
            const by = podiumH + 0.007 + i * floorStep;
            return (
              <mesh key={i} position={[0, by, 0]} castShadow receiveShadow>
                <boxGeometry args={[w * 0.90, 0.014, d * 0.86]} />
                <meshStandardMaterial color={stoneTrim} map={stuccoTex} roughness={0.62} />
              </mesh>
            );
          })}
          {/* Corner & Mid-Bay Structural Piers */}
          {[
            [-w * 0.43, d * 0.41],
            [0, d * 0.415],
            [w * 0.43, d * 0.41],
            [-w * 0.43, -d * 0.41],
            [0, -d * 0.415],
            [w * 0.43, -d * 0.41],
          ].map(([cx, cz], i) => (
            <mesh key={i} position={[cx, podiumH + towerH * 0.5 + 0.007, cz]} castShadow>
              <boxGeometry args={[0.018, towerH, 0.018]} />
              <meshStandardMaterial color={stoneTrim} map={stuccoTex} roughness={0.62} />
            </mesh>
          ))}

          {/* Roof Parapet Coping, Dark Membrane Deck & Stair/Elevator Bulkhead (Ref Image 2) */}
          <mesh position={[0, h + 0.014, 0]} castShadow>
            <boxGeometry args={[w * 0.90, 0.016, d * 0.86]} />
            <meshStandardMaterial color={stoneTrim} map={stuccoTex} roughness={0.62} />
          </mesh>
          <mesh position={[0, h + 0.023, 0]}>
            <boxGeometry args={[w * 0.82, 0.005, d * 0.78]} />
            <meshStandardMaterial color={roofDeckColor} roughness={0.88} />
          </mesh>
          <mesh position={[w * 0.16, h + 0.044, -d * 0.12]} castShadow>
            <boxGeometry args={[w * 0.28, 0.036, d * 0.28]} />
            <meshStandardMaterial color={mechColor} roughness={0.62} />
          </mesh>
          <mesh position={[-w * 0.20, h + 0.034, d * 0.12]} castShadow>
            <boxGeometry args={[w * 0.18, 0.018, d * 0.20]} />
            <meshStandardMaterial color={frameColor} roughness={0.55} />
          </mesh>
        </group>
      )}

      {/* ====================================================================
          COMMERCIAL ARCHETYPE 4: HERITAGE MASONRY CORNER BLOCK & SHOPHOUSE
          (Ref Image 4: Grey Stone Ground Plinth, Brick/Terracotta Upper Facade,
           Central Entrance Portico & Balcony, Pitched Slate Roof / Parapet)
          ==================================================================== */}
      {style === 4 && (
        <group>
          {/* Grey Stone Ground-Floor Plinth & Shopfront Arcade */}
          <mesh position={[0, podiumH * 0.55 + 0.007, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.90, podiumH * 1.1, d * 0.86]} />
            <meshStandardMaterial color="#64748B" roughness={0.68} />
          </mesh>
          {/* Ground-Floor Storefront Glazing Bays */}
          {[-w * 0.24, w * 0.24].map((sx, idx) => (
            <mesh key={idx} position={[sx, podiumH * 0.48 + 0.007, d * 0.432]}>
              <boxGeometry args={[w * 0.28, podiumH * 0.68, 0.006]} />
              <meshStandardMaterial color="#B8C9D8" map={glazingTex} metalness={0.58} roughness={0.18} />
            </mesh>
          ))}
          {/* Central Projecting Entrance Portico & Steps (Ref Image 4) */}
          <mesh position={[0, podiumH * 0.55 + 0.007, d * 0.44]} castShadow>
            <boxGeometry args={[w * 0.22, podiumH * 1.1, 0.028]} />
            <meshStandardMaterial color={stoneTrim} roughness={0.68} />
          </mesh>
          <mesh position={[0, podiumH * 0.42 + 0.007, d * 0.456]}>
            <boxGeometry args={[w * 0.12, podiumH * 0.78, 0.005]} />
            <meshStandardMaterial color="#4A2F1D" map={timberTex} roughness={0.72} />
          </mesh>
          {[-w * 0.24, w * 0.24].map((ax, i) => (
            <mesh key={i} position={[ax, podiumH * 0.86 + 0.007, d * 0.445]} rotation={[0.28, 0, 0]} castShadow>
              <boxGeometry args={[w * 0.30, 0.007, 0.030]} />
              <meshStandardMaterial color={accentColor} roughness={0.68} />
            </mesh>
          ))}
          <mesh position={[0, podiumH * 1.1 + 0.008, 0]} castShadow>
            <boxGeometry args={[w * 0.94, 0.014, d * 0.90]} />
            <meshStandardMaterial color={stoneTrim} roughness={0.68} />
          </mesh>

          {/* Upper Brick/Terracotta or Warm Sandstone Facade */}
          <mesh position={[0, podiumH * 1.1 + towerH * 0.5 + 0.012, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.88, towerH, d * 0.84]} />
            <meshStandardMaterial color={wallColor} map={facadeTex} roughness={0.68} />
          </mesh>
          {/* Central Upper Balcony & Portico Gable Projection */}
          <mesh position={[0, podiumH * 1.1 + towerH * 0.5 + 0.012, d * 0.43]} castShadow>
            <boxGeometry args={[w * 0.22, towerH, 0.018]} />
            <meshStandardMaterial color={wallColor} map={facadeTex} roughness={0.66} />
          </mesh>
          <mesh position={[0, podiumH * 1.1 + 0.020, d * 0.455]} castShadow>
            <boxGeometry args={[w * 0.24, 0.010, 0.026]} />
            <meshStandardMaterial color={stoneTrim} roughness={0.65} />
          </mesh>

          {/* Crown Cornice & Pitched Slate-Green/Charcoal Hipped Roof (Ref Image 4) */}
          <mesh position={[0, h + 0.014, 0]} castShadow>
            <boxGeometry args={[w * 0.92, 0.016, d * 0.88]} />
            <meshStandardMaterial color={stoneTrim} roughness={0.65} />
          </mesh>
          {levels <= 3 ? (
            <mesh
              geometry={HIP_ROOF_GEOMETRY}
              position={[0, h + 0.022, 0]}
              scale={[w * 0.90, Math.min(0.055, w * 0.22), d * 0.86]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial color="#365E52" roughness={0.56} />
            </mesh>
          ) : (
            <>
              <mesh position={[0, h + 0.024, 0]}>
                <boxGeometry args={[w * 0.82, 0.005, d * 0.78]} />
                <meshStandardMaterial color={roofDeckColor} roughness={0.88} />
              </mesh>
              <mesh position={[w * 0.14, h + 0.042, -d * 0.14]} castShadow>
                <boxGeometry args={[w * 0.24, 0.036, d * 0.24]} />
                <meshStandardMaterial color={mechColor} roughness={0.68} />
              </mesh>
            </>
          )}
        </group>
      )}
    </group>
  );
}

// --- HIGH-DETAIL ENGINEERED WATER PUMPS, KIOSKS, FILTRATION PLANTS & SPRINGS ---
export function DetailedWaterFacilityModel({ sourceType = 'Public Kiosk', statusColor = '#059669' }) {
  const externalKiosk = useNormalizedGLTF(
    sourceType === 'Public Kiosk' ? '/models/water_kiosk.glb' : null,
    0.46,
    0.40,
    0.50
  );
  if (externalKiosk) return <primitive object={externalKiosk} />;

  // ==========================================================================
  // 1. HIGH-DETAIL CAST-IRON DEEP-WELL HANDPUMP STATION (India Mark II / Jetmatic)
  // ==========================================================================
  if (sourceType === 'Handpump') {
    return (
      <group scale={[0.62, 0.62, 0.62]}>
        {/* Sub-terrain foundation (inset inside sanitary pad) */}
        <mesh position={[0, -0.30, 0]} receiveShadow>
          <boxGeometry args={[0.38, 0.60, 0.38]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
        </mesh>

        {/* Sanitary Concrete Pad with Perimeter Curb Walls & Blue Ceramic Wet-Floor */}
        <mesh position={[0, 0.018, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.46, 0.036, 0.46]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.7} />
        </mesh>
        {/* Perimeter Concrete Splash Curbs */}
        <mesh position={[0, 0.044, -0.215]} castShadow>
          <boxGeometry args={[0.46, 0.024, 0.03]} />
          <meshStandardMaterial color="#CBD5E1" />
        </mesh>
        <mesh position={[-0.215, 0.044, 0]} castShadow>
          <boxGeometry args={[0.03, 0.024, 0.46]} />
          <meshStandardMaterial color="#CBD5E1" />
        </mesh>
        <mesh position={[0.215, 0.044, 0]} castShadow>
          <boxGeometry args={[0.03, 0.024, 0.46]} />
          <meshStandardMaterial color="#CBD5E1" />
        </mesh>

        {/* Sunken Water Catch Basin & Drainage Channel */}
        <mesh position={[-0.08, 0.038, 0.02]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.18, 0.24]} />
          <meshStandardMaterial color="#0284C7" roughness={0.15} metalness={0.25} />
        </mesh>
        {/* Concrete Laundry / Washing Slab Beside Pump */}
        <mesh position={[0.12, 0.048, -0.08]} castShadow receiveShadow>
          <boxGeometry args={[0.12, 0.028, 0.18]} />
          <meshStandardMaterial color="#E2E8F0" roughness={0.6} />
        </mesh>

        {/* 4 Corner Steel Pipe Safety Bollards */}
        {[
          [-0.19, -0.19],
          [0.19, -0.19],
          [-0.19, 0.19],
          [0.19, 0.19],
        ].map(([bx, bz], i) => (
          <mesh key={i} position={[bx, 0.09, bz]} castShadow>
            <cylinderGeometry args={[0.01, 0.01, 0.11, 10]} />
            <meshStandardMaterial color={statusColor} metalness={0.5} roughness={0.3} />
          </mesh>
        ))}

        {/* --- CAST-IRON JETMATIC / INDIA MARK II HANDPUMP ASSEMBLY --- */}
        <group position={[0.03, 0.036, 0.02]}>
          {/* Raised Concrete Pump Pedestal Ring */}
          <mesh position={[0, 0.022, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[0.075, 0.09, 0.044, 16]} />
            <meshStandardMaterial color="#94A3B8" roughness={0.75} />
          </mesh>

          {/* Bolted Cast-Iron Base Flange + 4 Anchor Bolts */}
          <mesh position={[0, 0.052, 0]} castShadow>
            <cylinderGeometry args={[0.062, 0.068, 0.018, 16]} />
            <meshStandardMaterial color="#0369A1" metalness={0.65} roughness={0.28} />
          </mesh>
          {[
            [0.045, 0],
            [-0.045, 0],
            [0, 0.045],
            [0, -0.045],
          ].map(([ax, az], idx) => (
            <mesh key={idx} position={[ax, 0.064, az]}>
              <cylinderGeometry args={[0.007, 0.007, 0.01, 8]} />
              <meshStandardMaterial color="#E2E8F0" metalness={0.8} />
            </mesh>
          ))}

          {/* Lower Rising Main Standpipe */}
          <mesh position={[0, 0.13, 0]} castShadow>
            <cylinderGeometry args={[0.032, 0.038, 0.14, 16]} />
            <meshStandardMaterial color="#0284C7" metalness={0.6} roughness={0.25} />
          </mesh>

          {/* Enlarged Cast-Iron Piston Cylinder Barrel with Reinforcing Ribs */}
          <mesh position={[0, 0.23, 0]} castShadow>
            <cylinderGeometry args={[0.048, 0.044, 0.11, 20]} />
            <meshStandardMaterial color="#0284C7" metalness={0.65} roughness={0.22} />
          </mesh>
          <mesh position={[0, 0.18, 0]} castShadow>
            <cylinderGeometry args={[0.054, 0.054, 0.016, 20]} />
            <meshStandardMaterial color="#0369A1" metalness={0.7} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.28, 0]} castShadow>
            <cylinderGeometry args={[0.056, 0.056, 0.018, 20]} />
            <meshStandardMaterial color="#0369A1" metalness={0.7} roughness={0.25} />
          </mesh>

          {/* Curved Gooseneck Discharge Spout + Flange + Active Water Stream */}
          <group position={[-0.045, 0.225, 0]}>
            <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.018, 0.022, 0.075, 14]} />
              <meshStandardMaterial color="#0284C7" metalness={0.65} roughness={0.25} />
            </mesh>
            <mesh position={[-0.042, -0.018, 0]} rotation={[0, 0, 0.45]} castShadow>
              <cylinderGeometry args={[0.015, 0.017, 0.045, 12]} />
              <meshStandardMaterial color="#0284C7" metalness={0.65} roughness={0.25} />
            </mesh>
            {/* Active Clear-Blue Water Stream Pouring Into Jerrycan */}
            <mesh position={[-0.052, -0.105, 0]}>
              <cylinderGeometry args={[0.007, 0.011, 0.15, 10]} />
              <meshStandardMaterial color="#38BDF8" transparent opacity={0.85} roughness={0.1} />
            </mesh>
          </group>

          {/* Yellow 20-Liter Community Water Jerrycan (Galon) Under Spout */}
          <group position={[-0.098, 0.062, 0]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[0.062, 0.088, 0.052]} />
              <meshStandardMaterial color="#FACC15" roughness={0.35} />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.016, 10]} />
              <meshStandardMaterial color="#0284C7" />
            </mesh>
          </group>

          {/* Upper Pump Head Cap, Fulcrum Clevis Bracket & Plunger Rod */}
          <mesh position={[0, 0.315, 0]} castShadow>
            <cylinderGeometry args={[0.042, 0.048, 0.055, 16]} />
            <meshStandardMaterial color={statusColor} metalness={0.55} roughness={0.3} />
          </mesh>
          {/* Vertical Polished Steel Piston Plunger Rod */}
          <mesh position={[0, 0.365, 0]} castShadow>
            <cylinderGeometry args={[0.008, 0.008, 0.075, 10]} />
            <meshStandardMaterial color="#F8FAFC" metalness={0.9} roughness={0.1} />
          </mesh>
          {/* Rear Fulcrum Pivot Bracket */}
          <mesh position={[0.038, 0.335, 0]} castShadow>
            <boxGeometry args={[0.045, 0.048, 0.026]} />
            <meshStandardMaterial color="#1E293B" metalness={0.7} roughness={0.3} />
          </mesh>

          {/* Long Forged-Steel Lever Handle + Counterweight & Grip */}
          <group position={[0.035, 0.35, 0]} rotation={[0, 0, -0.52]}>
            {/* Main Lever Arm */}
            <mesh position={[0.085, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.009, 0.012, 0.28, 12]} />
              <meshStandardMaterial color="#1E293B" metalness={0.75} roughness={0.25} />
            </mesh>
            {/* Cast-Iron Counterweight Ball & T-Handle Grip */}
            <mesh position={[0.21, 0, 0]} castShadow>
              <sphereGeometry args={[0.02, 12, 12]} />
              <meshStandardMaterial color={statusColor} metalness={0.6} roughness={0.3} />
            </mesh>
            <mesh position={[0.23, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.007, 0.007, 0.06, 10]} />
              <meshStandardMaterial color="#0F172A" />
            </mesh>
          </group>
        </group>
      </group>
    );
  }

  // ==========================================================================
  // 2. COMMUNAL SPRING CATCHMENT BOX & TIMBER PAVILION
  // ==========================================================================
  if (sourceType === 'Communal Spring') {
    return (
      <group scale={[0.58, 0.58, 0.58]}>
        <mesh position={[0, -0.32, 0]} receiveShadow>
          <boxGeometry args={[0.38, 0.64, 0.36]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.014, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.44, 0.028, 0.42]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.75} />
        </mesh>
        {/* Grouted Stone Catchment Box & Inspection Manhole */}
        <mesh position={[0, 0.11, -0.06]} castShadow receiveShadow>
          <boxGeometry args={[0.38, 0.20, 0.24]} />
          <meshStandardMaterial color="#E2E8F0" roughness={0.75} />
        </mesh>
        <mesh position={[0, 0.218, -0.06]} castShadow>
          <cylinderGeometry args={[0.065, 0.065, 0.018, 16]} />
          <meshStandardMaterial color="#334155" metalness={0.6} />
        </mesh>
        {/* Dual Brass Discharge Spouts & Aerated Water Basin */}
        {[-0.07, 0.07].map((sx, i) => (
          <group key={i} position={[sx, 0.14, 0.07]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.012, 0.012, 0.06, 10]} />
              <meshStandardMaterial color="#D97706" metalness={0.8} roughness={0.2} />
            </mesh>
            <mesh position={[0, -0.035, 0.025]}>
              <cylinderGeometry args={[0.007, 0.01, 0.07, 8]} />
              <meshStandardMaterial color="#38BDF8" transparent opacity={0.85} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.065, 0.12]} castShadow>
          <boxGeometry args={[0.34, 0.11, 0.16]} />
          <meshStandardMaterial color="#CBD5E1" />
        </mesh>
        <mesh position={[0, 0.122, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.28, 0.12]} />
          <meshStandardMaterial color="#0284C7" roughness={0.12} metalness={0.25} />
        </mesh>
        {/* 4 Timber Pavilion Columns & Pitched Roof */}
        {[
          [-0.19, -0.17],
          [0.19, -0.17],
          [-0.19, 0.19],
          [0.19, 0.19],
        ].map(([px, pz], idx) => (
          <mesh key={idx} position={[px, 0.22, pz]} castShadow>
            <boxGeometry args={[0.026, 0.34, 0.026]} />
            <meshStandardMaterial color="#6D3B1E" />
          </mesh>
        ))}
        <mesh geometry={HIP_ROOF_GEOMETRY} position={[0, 0.39, 0.01]} scale={[0.46, 0.24, 0.44]} castShadow>
          <meshStandardMaterial color={statusColor} roughness={0.5} />
        </mesh>
      </group>
    );
  }

  // ==========================================================================
  // 3. SCHOOL FILTRATION & CLARIFIER TREATMENT PLANT
  // ==========================================================================
  if (sourceType === 'School Filtration') {
    return (
      <group scale={[0.54, 0.54, 0.54]}>
        <mesh position={[0, -0.32, 0]} receiveShadow>
          <boxGeometry args={[0.54, 0.64, 0.42]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.015, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.64, 0.03, 0.50]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.75} />
        </mesh>
        {/* Pump & Control House with Recessed Window & Solar Array */}
        <mesh position={[-0.15, 0.14, -0.04]} castShadow receiveShadow>
          <boxGeometry args={[0.30, 0.22, 0.26]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
        </mesh>
        <RecessedWindow position={[-0.15, 0.15, 0.095]} w={0.13} h={0.085} canopy={false} />
        <mesh geometry={GABLE_ROOF_GEOMETRY} position={[-0.15, 0.25, -0.04]} scale={[0.34, 0.18, 0.30]} castShadow>
          <meshStandardMaterial color="#0284C7" />
        </mesh>
        {/* 3 Stage FRP Multimedia Filtration Vessels + Stainless Manifold */}
        {[-0.05, 0.01, 0.07].map((fx, idx) => (
          <mesh key={idx} position={[fx, 0.14, 0.14]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 0.21, 16]} />
            <meshStandardMaterial color="#0284C7" metalness={0.6} roughness={0.2} />
          </mesh>
        ))}
        <mesh position={[0.01, 0.25, 0.14]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.008, 0.008, 0.16, 10]} />
          <meshStandardMaterial color="#F8FAFC" metalness={0.85} />
        </mesh>
        {/* Circular Clarifier Basin with Rotating Scraper Bridge & Center Motor */}
        <group position={[0.18, 0.03, -0.02]}>
          <mesh position={[0, 0.06, 0]} castShadow>
            <cylinderGeometry args={[0.125, 0.125, 0.12, 24]} />
            <meshStandardMaterial color="#E2E8F0" />
          </mesh>
          <mesh position={[0, 0.122, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 0.008, 24]} />
            <meshStandardMaterial color="#0284C7" roughness={0.12} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.134, 0]} castShadow>
            <boxGeometry args={[0.26, 0.014, 0.034]} />
            <meshStandardMaterial color="#334155" metalness={0.5} />
          </mesh>
          <mesh position={[0, 0.155, 0]} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.035, 12]} />
            <meshStandardMaterial color={statusColor} />
          </mesh>
        </group>
      </group>
    );
  }

  // ==========================================================================
  // 4. PUBLIC WATER KIOSK + CROSS-BRACED ELEVATED STEEL WATER TOWER
  // ==========================================================================
  return (
    <group scale={[0.56, 0.56, 0.56]}>
      <mesh position={[0, -0.32, 0]} receiveShadow>
        <boxGeometry args={[0.48, 0.64, 0.40]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.018, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.58, 0.036, 0.48]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.7} />
      </mesh>

      {/* --- LEFT: Tiled Water Refilling Kiosk Building & 4-Tap Counter --- */}
      <group position={[-0.12, 0.036, -0.01]}>
        <mesh position={[0, 0.12, -0.02]} castShadow receiveShadow>
          <boxGeometry args={[0.28, 0.24, 0.26]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
        </mesh>
        {/* Ceramic Blue Tiled Dispensing Counter */}
        <mesh position={[0, 0.048, 0.14]} castShadow receiveShadow>
          <boxGeometry args={[0.26, 0.095, 0.07]} />
          <meshStandardMaterial color="#0284C7" roughness={0.3} />
        </mesh>
        {/* Stainless Drip Grate */}
        <mesh position={[0, 0.098, 0.145]} castShadow>
          <boxGeometry args={[0.27, 0.01, 0.08]} />
          <meshStandardMaterial color="#E2E8F0" metalness={0.85} roughness={0.2} />
        </mesh>
        {/* 4 Stainless Gooseneck Dispensing Taps + 2 Blue Water Galons */}
        {[-0.09, -0.03, 0.03, 0.09].map((tx, idx) => (
          <group key={idx} position={[tx, 0.125, 0.135]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.006, 0.006, 0.045, 8]} />
              <meshStandardMaterial color="#F8FAFC" metalness={0.9} roughness={0.15} />
            </mesh>
            {idx % 2 === 0 && (
              <mesh position={[0, -0.01, 0.018]} castShadow>
                <cylinderGeometry args={[0.016, 0.016, 0.042, 12]} />
                <meshStandardMaterial color="#38BDF8" roughness={0.2} />
              </mesh>
            )}
          </group>
        ))}
        {/* Recessed Dispensing Service Bay Window */}
        <mesh position={[0, 0.145, 0.112]}>
          <boxGeometry args={[0.21, 0.085, 0.01]} />
          <meshStandardMaterial color="#0F2942" metalness={0.55} roughness={0.18} />
        </mesh>
        {/* Overhanging Kiosk Roof + Fascia Signboard */}
        <mesh geometry={HIP_ROOF_GEOMETRY} position={[0, 0.245, 0]} scale={[0.34, 0.19, 0.34]} castShadow>
          <meshStandardMaterial color={statusColor} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.245, 0.165]} castShadow>
          <boxGeometry args={[0.22, 0.032, 0.012]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
      </group>

      {/* --- RIGHT: 4-Column Cross-Braced Steel Water Tower & Elevated Tank --- */}
      <group position={[0.15, 0.036, 0]}>
        {/* 4 Concrete Pier Footings & Vertical Steel H-Columns */}
        {[
          [-0.075, -0.075],
          [0.075, -0.075],
          [-0.075, 0.075],
          [0.075, 0.075],
        ].map(([lx, lz], i) => (
          <React.Fragment key={i}>
            <mesh position={[lx, 0.015, lz]} castShadow>
              <boxGeometry args={[0.032, 0.03, 0.032]} />
              <meshStandardMaterial color="#94A3B8" />
            </mesh>
            <mesh position={[lx, 0.19, lz]} castShadow>
              <cylinderGeometry args={[0.011, 0.014, 0.36, 10]} />
              <meshStandardMaterial color="#334155" metalness={0.7} roughness={0.35} />
            </mesh>
          </React.Fragment>
        ))}

        {/* 3 Horizontal Steel Girder Tiers + Diagonal Cross-Bracing Struts */}
        {[0.12, 0.24, 0.35].map((ry, i) => (
          <group key={i} position={[0, ry, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.16, 0.012, 0.16]} />
              <meshStandardMaterial color="#475569" metalness={0.6} />
            </mesh>
            {i < 2 && (
              <>
                <mesh position={[0, 0.06, 0.075]} rotation={[0, 0, 0.72]} castShadow>
                  <boxGeometry args={[0.19, 0.007, 0.007]} />
                  <meshStandardMaterial color="#64748B" metalness={0.6} />
                </mesh>
                <mesh position={[0, 0.06, -0.075]} rotation={[0, 0, -0.72]} castShadow>
                  <boxGeometry args={[0.19, 0.007, 0.007]} />
                  <meshStandardMaterial color="#64748B" metalness={0.6} />
                </mesh>
              </>
            )}
          </group>
        ))}

        {/* Central Stainless Riser & Downcomer Pipes + Side Maintenance Ladder */}
        <mesh position={[0, 0.19, 0]} castShadow>
          <cylinderGeometry args={[0.016, 0.016, 0.36, 12]} />
          <meshStandardMaterial color="#E2E8F0" metalness={0.8} roughness={0.2} />
        </mesh>
        <mesh position={[-0.092, 0.22, 0]} castShadow>
          <boxGeometry args={[0.008, 0.40, 0.032]} />
          <meshStandardMaterial color="#334155" />
        </mesh>

        {/* Elevated Steel Service Platform Deck & Safety Guardrail Ring */}
        <mesh position={[0, 0.37, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.135, 0.135, 0.018, 24]} />
          <meshStandardMaterial color="#334155" metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.40, 0]}>
          <cylinderGeometry args={[0.132, 0.132, 0.038, 20, 1, true]} />
          <meshStandardMaterial color="#94A3B8" wireframe />
        </mesh>

        {/* Ribbed Cylindrical Elevated Water Storage Tank + Conical Roof + Telemetry Mast */}
        <mesh position={[0, 0.48, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.108, 0.108, 0.20, 28]} />
          <meshStandardMaterial color="#0284C7" metalness={0.45} roughness={0.22} />
        </mesh>
        {/* Structural Tank Reinforcing Rings */}
        {[0.42, 0.48, 0.54].map((ty, idx) => (
          <mesh key={idx} position={[0, ty, 0]} castShadow>
            <cylinderGeometry args={[0.112, 0.112, 0.01, 28]} />
            <meshStandardMaterial color="#F8FAFC" metalness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 0.605, 0]} castShadow>
          <coneGeometry args={[0.116, 0.06, 28]} />
          <meshStandardMaterial color="#0369A1" metalness={0.5} roughness={0.25} />
        </mesh>
        <mesh position={[0, 0.66, 0]}>
          <cylinderGeometry args={[0.004, 0.004, 0.07, 8]} />
          <meshStandardMaterial color="#F8FAFC" />
        </mesh>
      </group>
    </group>
  );
}

// --- GIS Polygon Footprint Extruded Urban Block ---
function FootprintExtrudedBuilding({ b, facadeTex }) {
  const wallPalette = {
    white: '#FFFFFF',
    cream: '#FFFDF7',
    sand: '#F5EFE2',
    slate: '#F1F5F9',
    warm: '#FAF6EE',
    terracotta: '#F4DFD3',
    sage: '#EBF2E8',
    ochre: '#F6E8CC',
    coral: '#F5DCD6',
    teal: '#E6F2F2',
  };
  const wallColor = wallPalette[b.tone] || '#FFFFFF';
  const accentColor = b.accentColor || '#2B7AC4';
  const levels = Math.max(2, b.levels || 3);
  const podiumH = Math.min(0.10, b.h * 0.28);

  const { foundationGeo, podiumGeo, mainGeo, roofCapGeo, roofDeckGeo, corniceGeo } = useMemo(() => {
    const shape = new THREE.Shape();
    const foundationShape = new THREE.Shape();
    const deckShape = new THREE.Shape();
    const corniceShape = new THREE.Shape();

    b.footprint.forEach(([px, pz], idx) => {
      if (idx === 0) {
        shape.moveTo(px, -pz);
        foundationShape.moveTo(px * 0.94, -pz * 0.94);
        deckShape.moveTo(px * 0.88, -pz * 0.88);
        corniceShape.moveTo(px * 1.015, -pz * 1.015);
      } else {
        shape.lineTo(px, -pz);
        foundationShape.lineTo(px * 0.94, -pz * 0.94);
        deckShape.lineTo(px * 0.88, -pz * 0.88);
        corniceShape.lineTo(px * 1.015, -pz * 1.015);
      }
    });
    shape.closePath();
    foundationShape.closePath();
    deckShape.closePath();
    corniceShape.closePath();

    const foundation = new THREE.ExtrudeGeometry(foundationShape, {
      depth: 0.64,
      bevelEnabled: false,
    });
    foundation.rotateX(-Math.PI / 2);
    foundation.translate(0, -0.64, 0);
    foundation.computeVertexNormals();

    const podium = new THREE.ExtrudeGeometry(foundationShape, {
      depth: podiumH,
      bevelEnabled: false,
    });
    podium.rotateX(-Math.PI / 2);
    podium.computeVertexNormals();

    const upperH = Math.max(0.08, b.h - podiumH);
    const extrude = new THREE.ExtrudeGeometry(shape, { depth: upperH, bevelEnabled: false });
    extrude.rotateX(-Math.PI / 2);
    extrude.translate(0, podiumH, 0);
    extrude.computeVertexNormals();

    const cornice = new THREE.ExtrudeGeometry(corniceShape, { depth: 0.012, bevelEnabled: false });
    cornice.rotateX(-Math.PI / 2);
    cornice.computeVertexNormals();

    const cap = new THREE.ExtrudeGeometry(corniceShape, { depth: 0.024, bevelEnabled: false });
    cap.rotateX(-Math.PI / 2);
    cap.computeVertexNormals();

    const deck = new THREE.ExtrudeGeometry(deckShape, { depth: 0.008, bevelEnabled: false });
    deck.rotateX(-Math.PI / 2);
    deck.computeVertexNormals();

    return {
      foundationGeo: foundation,
      podiumGeo: podium,
      mainGeo: extrude,
      roofCapGeo: cap,
      roofDeckGeo: deck,
      corniceGeo: cornice,
    };
  }, [b.footprint, b.h, podiumH]);

  const floorStep = (b.h - podiumH) / Math.max(1, levels - 1);

  return (
    <group>
      <mesh geometry={foundationGeo} receiveShadow>
        <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
      </mesh>
      {/* Ground-Floor Recessed Storefront Base */}
      <mesh geometry={podiumGeo} castShadow receiveShadow>
        <meshStandardMaterial color="#27323F" metalness={0.35} roughness={0.32} />
      </mesh>
      {/* Storefront Fascia Accent Band */}
      <mesh geometry={corniceGeo} position={[0, podiumH, 0]} castShadow>
        <meshStandardMaterial color="#F5EFE2" roughness={0.48} />
      </mesh>
      {/* Upper Commercial / Urban Block Body */}
      <mesh geometry={mainGeo} castShadow receiveShadow>
        <meshStandardMaterial
          color={wallColor}
          map={facadeTex}
          roughness={0.46}
          metalness={0.08}
        />
      </mesh>
      {/* Per-Story Slab Cornice Bands */}
      {Array.from({ length: Math.max(1, levels - 2) }).map((_, idx) => (
        <mesh
          key={idx}
          geometry={corniceGeo}
          position={[0, podiumH + (idx + 1) * floorStep, 0]}
          castShadow
        >
          <meshStandardMaterial color="#F8FAFC" roughness={0.5} />
        </mesh>
      ))}
      {/* Perimeter Roof Parapet Wall & Recessed Roof Deck */}
      <mesh geometry={roofCapGeo} position={[0, b.h, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#F8FAFC" roughness={0.5} />
      </mesh>
      <mesh geometry={roofDeckGeo} position={[0, b.h + 0.020, 0]} receiveShadow>
        <meshStandardMaterial color="#475569" roughness={0.78} />
      </mesh>
      {/* Rooftop Garden Planter & Articulated Mechanical Penthouse (Reference Image 6 & 9) */}
      <mesh position={[b.w * 0.14, b.h + 0.028, -b.d * 0.10]} receiveShadow>
        <boxGeometry args={[b.w * 0.28, 0.010, b.d * 0.28]} />
        <meshStandardMaterial color="#4E8A34" roughness={0.85} />
      </mesh>
      <mesh position={[-b.w * 0.14, b.h + 0.052, -b.d * 0.12]} castShadow receiveShadow>
        <boxGeometry args={[b.w * 0.26, 0.052, b.d * 0.24]} />
        <meshStandardMaterial color="#E2E8F0" roughness={0.52} />
      </mesh>
      <mesh position={[-b.w * 0.14, b.h + 0.080, -b.d * 0.12]} castShadow>
        <boxGeometry args={[b.w * 0.29, 0.008, b.d * 0.27]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>
    </group>
  );
}

// ============================================================================
// 2. VALIDATION SAMPLE SHOWCASE PEDESTAL (Residential, Commercial, Kiosk + Handpump)
// ============================================================================
function ValidationSampleShowcase({ facadeTex, glazingTex, roofTileTex, slateTileTex, mosaicTileTex, stuccoTex, brickTex, timberTex }) {
  return (
    <group position={[-1.2, BASE_ELEVATION + 0.06, 0.3]}>
      <mesh position={[0, -0.03, 0]} receiveShadow>
        <boxGeometry args={[4.4, 0.06, 1.85]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.75} />
      </mesh>

      {/* 1. Validated Filipino Residential House */}
      <group position={[-1.45, 0.01, 0]} scale={[2.3, 2.3, 2.3]}>
        <DetailedResidentialHouseModel
          w={0.22}
          d={0.19}
          h={0.16}
          levels={2}
          wallColor="#FFFDF9"
          roofColor="#8C4332"
          roofShape="hipped"
          roofTex={roofTileTex}
          slateTex={slateTileTex}
          mosaicTex={mosaicTileTex}
          glazingTex={glazingTex}
          stuccoTex={stuccoTex}
          brickTex={brickTex}
          timberTex={timberTex}
          variant={0}
        />
        <Html position={[0, 0.36, 0]} center>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            1. Filipino Residential (C-Portal / Bahay-na-Bato / Courtyard Archetypes)
          </div>
        </Html>
      </group>

      {/* 2. Validated Naga Commercial Building */}
      <group position={[-0.45, 0.01, 0]} scale={[1.9, 1.9, 1.9]}>
        <DetailedCommercialBuildingModel
          w={0.28}
          d={0.24}
          h={0.44}
          levels={4}
          wallColor="#EAE4D8"
          accentColor="#2D4A63"
          facadeTex={facadeTex}
          glazingTex={glazingTex}
          stuccoTex={stuccoTex}
          timberTex={timberTex}
          variant={0}
        />
        <Html position={[0, 0.58, 0]} center>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            2. Commercial Mid-Rise (Curtain-Wall, Rotunda & Atrium Archetypes)
          </div>
        </Html>
      </group>

      {/* 3A. Validated Communal Water Kiosk + Braced Steel Tower */}
      <group position={[0.62, 0.01, 0]} scale={[2.75, 2.75, 2.75]}>
        <DetailedWaterFacilityModel sourceType="Public Kiosk" statusColor="#059669" />
        <Html position={[0, 0.46, 0]} center>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            3A. Water Kiosk & Braced Steel Tank Tower
          </div>
        </Html>
      </group>

      {/* 3B. Validated Cast-Iron Deep-Well Handpump Station */}
      <group position={[1.55, 0.01, 0]} scale={[2.9, 2.9, 2.9]}>
        <DetailedWaterFacilityModel sourceType="Handpump" statusColor="#0284C7" />
        <Html position={[0, 0.34, 0]} center>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            3B. Cast-Iron Deep-Well Handpump & Jerrycan
          </div>
        </Html>
      </group>
    </group>
  );
}

// ============================================================================
// 2B. PHASE 6D — STREETSCAPE FURNITURE, PLAZAS, PROMENADES & WAITING SHELTERS
// ============================================================================
// Slatted teak-and-steel public park bench (Reference Image 1)
function ParkBenchAsset({ position = [0, 0, 0], rotation = [0, 0, 0], scale = 1, timberTex = null }) {
  return (
    <group position={position} rotation={rotation} scale={[scale, scale, scale]}>
      {/* Twin T-shaped matte charcoal-steel pedestal legs & base anchor plates */}
      {[-0.018, 0.018].map((lx, i) => (
        <group key={i} position={[lx, 0, 0]}>
          <mesh position={[0, 0.001, 0]}>
            <boxGeometry args={[0.003, 0.0015, 0.015]} />
            <meshStandardMaterial color="#2D333B" metalness={0.65} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.006, 0]} castShadow>
            <boxGeometry args={[0.0028, 0.010, 0.0032]} />
            <meshStandardMaterial color="#2D333B" metalness={0.65} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.015, -0.0055]} rotation={[-0.22, 0, 0]} castShadow>
            <boxGeometry args={[0.0026, 0.012, 0.0026]} />
            <meshStandardMaterial color="#2D333B" metalness={0.65} roughness={0.35} />
          </mesh>
        </group>
      ))}
      {/* Tubular steel seat-front & backrest perimeter rails */}
      <mesh position={[0, 0.0105, 0.0062]} rotation={[0, 0, Math.PI * 0.5]}>
        <cylinderGeometry args={[0.0012, 0.0012, 0.048, 8]} />
        <meshStandardMaterial color="#2D333B" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.022, -0.0072]} rotation={[0, 0, Math.PI * 0.5]}>
        <cylinderGeometry args={[0.0012, 0.0012, 0.048, 8]} />
        <meshStandardMaterial color="#2D333B" metalness={0.65} roughness={0.35} />
      </mesh>
      {/* 3 Horizontal warm teak timber seat slats */}
      {[-0.003, 0.0005, 0.004].map((sz, i) => (
        <mesh key={`s-${i}`} position={[0, 0.0112, sz]} castShadow>
          <boxGeometry args={[0.047, 0.0016, 0.0028]} />
          <meshStandardMaterial color="#A6683C" map={timberTex} roughness={0.65} />
        </mesh>
      ))}
      {/* 3 Angled warm teak timber backrest slats */}
      {[0.015, 0.018, 0.021].map((by, i) => (
        <mesh key={`b-${i}`} position={[0, by, -0.0045 - i * 0.0008]} rotation={[-0.22, 0, 0]} castShadow>
          <boxGeometry args={[0.047, 0.0024, 0.0016]} />
          <meshStandardMaterial color="#A6683C" map={timberTex} roughness={0.65} />
        </mesh>
      ))}
    </group>
  );
}

function UrbanEnvironmentalFeature({ feature, timberTex, slateTileTex, glazingTex, stuccoTex }) {
  const [x, y, z] = geoToWorld(feature.lat, feature.lng);
  const w = feature.w || 0.24;
  const d = feature.d || 0.14;

  return (
    <group position={[x, y, z]} rotation={[0, feature.rot || 0, 0]}>
      {feature.kind === 'civic_plaza' && (
        <group>
          {/* Grounded stone plaza terrace with sub-terrain foundation skirt */}
          <mesh position={[0, -0.14, 0]} receiveShadow>
            <boxGeometry args={[w * 0.94, 0.28, d * 0.94]} />
            <meshStandardMaterial color="#94A3B8" roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.006, 0]} receiveShadow>
            <boxGeometry args={[w, 0.012, d]} />
            <meshStandardMaterial color="#DCD6CA" map={stuccoTex} roughness={0.78} />
          </mesh>
          {/* Landscaped corner lawn planters */}
          {[
            [-w * 0.36, d * 0.34],
            [w * 0.36, d * 0.34],
            [-w * 0.36, -d * 0.34],
            [w * 0.36, -d * 0.34],
          ].map(([px, pz], i) => (
            <group key={i} position={[px, 0.015, pz]}>
              <mesh receiveShadow>
                <boxGeometry args={[w * 0.20, 0.008, d * 0.22]} />
                <meshStandardMaterial color="#4D7C36" roughness={0.88} />
              </mesh>
              <OrganicShrubStrip position={[0, 0.005, 0]} width={w * 0.16} />
            </group>
          ))}
          {feature.style === 'fountain_plaza' ? (
            <>
              {/* Central Stone Basin Fountain & Obelisk Finial */}
              <mesh position={[0, 0.016, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[0.056, 0.060, 0.014, 24]} />
                <meshStandardMaterial color="#CBD5E1" roughness={0.62} />
              </mesh>
              <mesh position={[0, 0.0235, 0]} rotation={[-Math.PI * 0.5, 0, 0]}>
                <circleGeometry args={[0.048, 24]} />
                <meshStandardMaterial color="#2582B8" metalness={0.35} roughness={0.14} />
              </mesh>
              <mesh position={[0, 0.036, 0]} castShadow>
                <cylinderGeometry args={[0.010, 0.015, 0.042, 12]} />
                <meshStandardMaterial color="#E2E8F0" roughness={0.55} />
              </mesh>
              <mesh position={[0, 0.062, 0]} castShadow>
                <cylinderGeometry args={[0.020, 0.008, 0.010, 16]} />
                <meshStandardMaterial color="#E2E8F0" roughness={0.55} />
              </mesh>
            </>
          ) : (
            <>
              {/* Shaded Timber-and-Steel Courtyard Pergola */}
              {[
                [-w * 0.16, -d * 0.14],
                [w * 0.16, -d * 0.14],
                [-w * 0.16, d * 0.14],
                [w * 0.16, d * 0.14],
              ].map(([px, pz], i) => (
                <mesh key={i} position={[px, 0.034, pz]} castShadow>
                  <boxGeometry args={[0.008, 0.048, 0.008]} />
                  <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.38} />
                </mesh>
              ))}
              {[-0.025, 0, 0.025].map((bz, i) => (
                <mesh key={i} position={[0, 0.058, bz]} castShadow>
                  <boxGeometry args={[w * 0.38, 0.005, 0.008]} />
                  <meshStandardMaterial color="#8C5835" map={timberTex} roughness={0.65} />
                </mesh>
              ))}
            </>
          )}
          {/* Facing Slatted Park Benches */}
          <ParkBenchAsset position={[0, 0.012, d * 0.28]} rotation={[0, Math.PI, 0]} scale={1.05} timberTex={timberTex} />
          <ParkBenchAsset position={[0, 0.012, -d * 0.28]} rotation={[0, 0, 0]} scale={1.05} timberTex={timberTex} />
        </group>
      )}

      {feature.kind === 'riverfront_promenade' && (
        <group>
          {/* Stepped Stone Riverbank Esplanade Terrace */}
          <mesh position={[0, -0.14, 0]} receiveShadow>
            <boxGeometry args={[w * 0.94, 0.28, d * 0.92]} />
            <meshStandardMaterial color="#94A3B8" roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.006, 0]} receiveShadow>
            <boxGeometry args={[w, 0.012, d]} />
            <meshStandardMaterial color="#D6CFC2" map={stuccoTex} roughness={0.76} />
          </mesh>
          {/* Rear Landscaped Embankment Planter */}
          <mesh position={[0, 0.015, -d * 0.34]} receiveShadow>
            <boxGeometry args={[w * 0.88, 0.008, d * 0.20]} />
            <meshStandardMaterial color="#4D7C36" roughness={0.88} />
          </mesh>
          <OrganicShrubStrip position={[0, 0.020, -d * 0.34]} width={w * 0.78} />
          {/* Waterside Safety Balustrade */}
          <mesh position={[0, 0.026, d * 0.44]} castShadow>
            <boxGeometry args={[w * 0.94, 0.004, 0.004]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.35} />
          </mesh>
          {[-w * 0.44, -w * 0.15, w * 0.15, w * 0.44].map((px, i) => (
            <mesh key={i} position={[px, 0.019, d * 0.44]} castShadow>
              <boxGeometry args={[0.006, 0.018, 0.006]} />
              <meshStandardMaterial color="#64748B" roughness={0.65} />
            </mesh>
          ))}
          {/* Twin Promenade Benches Overlooking the Naga River */}
          <ParkBenchAsset position={[-w * 0.20, 0.012, 0.005]} rotation={[0, 0, 0]} scale={1.1} timberTex={timberTex} />
          <ParkBenchAsset position={[w * 0.20, 0.012, 0.005]} rotation={[0, 0, 0]} scale={1.1} timberTex={timberTex} />
        </group>
      )}

      {feature.kind === 'waiting_shelter' && (
        <group>
          {/* Concrete Kerb Pad */}
          <mesh position={[0, -0.10, 0]} receiveShadow>
            <boxGeometry args={[w * 0.94, 0.20, d * 0.94]} />
            <meshStandardMaterial color="#94A3B8" roughness={0.88} />
          </mesh>
          <mesh position={[0, 0.005, 0]} receiveShadow>
            <boxGeometry args={[w, 0.010, d]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.82} />
          </mesh>
          {/* Dark Steel Rear Uprights & Cantilevered Glazed Canopy */}
          {[-w * 0.36, w * 0.36].map((ux, i) => (
            <mesh key={i} position={[ux, 0.028, -d * 0.26]} castShadow>
              <boxGeometry args={[0.005, 0.044, 0.005]} />
              <meshStandardMaterial color="#1E293B" metalness={0.65} roughness={0.32} />
            </mesh>
          ))}
          {/* Rear Tempered Glass Windscreen & Transit Route Panel */}
          <mesh position={[0, 0.026, -d * 0.28]}>
            <boxGeometry args={[w * 0.70, 0.034, 0.003]} />
            <meshStandardMaterial color="#93C5FD" map={glazingTex} transparent opacity={0.62} metalness={0.5} roughness={0.14} />
          </mesh>
          <mesh position={[0, 0.050, 0]} rotation={[0.08, 0, 0]} castShadow>
            <boxGeometry args={[w * 0.92, 0.005, d * 0.88]} />
            <meshStandardMaterial color="#334155" map={slateTileTex} metalness={0.55} roughness={0.38} />
          </mesh>
          {/* Slatted Timber & Steel Shelter Bench */}
          <ParkBenchAsset position={[0, 0.010, -d * 0.04]} rotation={[0, 0, 0]} scale={0.95} timberTex={timberTex} />
        </group>
      )}
    </group>
  );
}

// ============================================================================
// 3. RECOGNIZABLE NAGA LANDMARKS & CITY FOOTPRINT DISPATCHER
// ============================================================================
function CityArchitecturalBuilding({
  b,
  facadeTex,
  glazingTex,
  roofTileTex,
  slateTileTex,
  mosaicTileTex,
  stuccoTex,
  brickTex,
  timberTex,
  showLabels = false,
  zoomTier = 'MID',
}) {
  const [x, y, z] = geoToWorld(b.lat, b.lng);
  const wallPalette = {
    white: '#F4F1EA',
    cream: '#EFEAE0',
    sand: '#E8DEC8',
    slate: '#CBD4DD',
    warm: '#EAE2D3',
    terracotta: '#C27860',
    sage: '#B6C2AE',
    ochre: '#D6B785',
    coral: '#D8A394',
    teal: '#B4C9C9',
    limestone: '#E6DFD2',
    travertine: '#DDD2BF',
    sandstone: '#D3C1A8',
    charcoal: '#525E6B',
  };
  const wallColor = wallPalette[b.tone] || '#EAE4D8';

  const roofPaletteMap = {
    '#334155': '#8C4332',
    '#475569': '#4E5D6C',
    '#52606D': '#7C4230',
  };
  const vibrantRoofColor = roofPaletteMap[b.roofColor] || b.roofColor || '#8C4332';
  const isMajorLandmark =
    b.type === 'cathedral' ||
    b.type === 'basilica' ||
    b.type === 'mall' ||
    b.type === 'university' ||
    b.type === 'hall';

  return (
    <group position={[x, y, z]} rotation={[0, b.rot || 0, 0]}>
      {b.type === 'cathedral' || b.type === 'basilica' ? (
        <group>
          {/* Sub-Terrain Slope Foundation */}
          <mesh position={[0, -0.32, 0]} receiveShadow>
            <boxGeometry args={[b.w * 0.92, 0.64, b.d * 0.92]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
          </mesh>
          {/* Ceremonial Stone Forecourt Plaza, Side Lawn Borders & Steps (Reference Image 2) */}
          <mesh position={[0, 0.008, 0]} receiveShadow>
            <boxGeometry args={[b.w * 0.96, 0.016, b.d * 0.96]} />
            <meshStandardMaterial color="#E7DFD3" roughness={0.78} />
          </mesh>
          {[0, 1, 2].map((stepIdx) => (
            <mesh key={`step-${stepIdx}`} position={[0, 0.004 + stepIdx * 0.005, b.d * 0.49 - stepIdx * 0.012]} receiveShadow>
              <boxGeometry args={[b.w * 0.34, 0.006, 0.018]} />
              <meshStandardMaterial color="#D6CEC0" roughness={0.82} />
            </mesh>
          ))}
          {[-b.w * 0.42, b.w * 0.42].map((gx, i) => (
            <mesh key={i} position={[gx, 0.017, 0]} receiveShadow>
              <boxGeometry args={[b.w * 0.08, 0.006, b.d * 0.80]} />
              <meshStandardMaterial color="#4E8A34" roughness={0.85} />
            </mesh>
          ))}
          {/* Central Cruciform Nave & Clerestory */}
          <mesh position={[0, 0.19, -0.02]} castShadow receiveShadow>
            <boxGeometry args={[b.w * 0.52, 0.36, b.d * 0.82]} />
            <meshStandardMaterial
              color={b.type === 'cathedral' ? '#F5EFE2' : '#FFFBEB'}
              roughness={0.55}
            />
          </mesh>
          {/* Flanking Side Aisles, Sloped Aisle Roofs & Exterior Buttress Piers (Ref Images 1 & 3) */}
          {[-b.w * 0.31, b.w * 0.31].map((ax, i) => (
            <group key={i} position={[ax, 0, -0.02]}>
              <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
                <boxGeometry args={[b.w * 0.15, 0.20, b.d * 0.72]} />
                <meshStandardMaterial color="#E5DDD0" map={stuccoTex} roughness={0.65} />
              </mesh>
              {/* Sloped Side-Aisle Roof */}
              <mesh
                position={[0, 0.225, 0]}
                rotation={[0, 0, i === 0 ? 0.36 : -0.36]}
                castShadow
              >
                <boxGeometry args={[b.w * 0.17, 0.014, b.d * 0.74]} />
                <meshStandardMaterial
                  color={b.type === 'cathedral' ? '#475569' : '#8C4332'}
                  map={b.type === 'cathedral' ? slateTileTex : roofTileTex}
                  roughness={0.50}
                />
              </mesh>
              {/* Rhythmic Buttress Piers & Lancet Aisle Windows */}
              {[-b.d * 0.24, 0, b.d * 0.24].map((bz, bIdx) => (
                <mesh key={bIdx} position={[i === 0 ? -b.w * 0.075 : b.w * 0.075, 0.11, bz]} castShadow>
                  <boxGeometry args={[0.020, 0.21, 0.024]} />
                  <meshStandardMaterial color="#D6CEC0" map={stuccoTex} roughness={0.70} />
                </mesh>
              ))}
              {[-b.d * 0.12, b.d * 0.12].map((wz, wIdx) => (
                <mesh key={wIdx} position={[i === 0 ? -b.w * 0.076 : b.w * 0.076, 0.12, wz]}>
                  <boxGeometry args={[0.005, 0.075, 0.026]} />
                  <meshStandardMaterial color="#1E293B" metalness={0.45} roughness={0.22} />
                </mesh>
              ))}
            </group>
          ))}
          {/* Transept Crossing Arms */}
          <mesh position={[0, 0.17, -b.d * 0.12]} castShadow receiveShadow>
            <boxGeometry args={[b.w * 0.86, 0.32, b.d * 0.28]} />
            <meshStandardMaterial
              color={b.type === 'cathedral' ? '#EAE2D3' : '#FEF3C7'}
              map={stuccoTex}
              roughness={0.58}
            />
          </mesh>
          {/* Pitched Nave & Transept Roofs (Standing-Seam Slate for Cathedral / Clay-Tile for Basilica) */}
          <mesh
            geometry={GABLE_ROOF_GEOMETRY}
            position={[0, 0.37, -0.02]}
            scale={[b.w * 0.56, 0.20, b.d * 0.80]}
            castShadow
          >
            <meshStandardMaterial
              color={b.type === 'cathedral' ? '#475569' : '#8C4332'}
              map={b.type === 'cathedral' ? slateTileTex : roofTileTex}
              roughness={0.46}
            />
          </mesh>
          <mesh
            geometry={GABLE_ROOF_GEOMETRY}
            position={[0, 0.33, -b.d * 0.12]}
            rotation={[0, Math.PI * 0.5, 0]}
            scale={[b.d * 0.30, 0.16, b.w * 0.86]}
            castShadow
          >
            <meshStandardMaterial
              color={b.type === 'cathedral' ? '#475569' : '#8C4332'}
              map={b.type === 'cathedral' ? slateTileTex : roofTileTex}
              roughness={0.46}
            />
          </mesh>
          {/* Front Stone Entrance Steps, Gabled Portico, Double Doors & Stained-Glass Nave Window */}
          <mesh position={[0, 0.018, b.d * 0.45]} receiveShadow>
            <boxGeometry args={[b.w * 0.32, 0.020, 0.055]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.78} />
          </mesh>
          <mesh position={[0, 0.15, b.d * 0.40]} castShadow>
            <boxGeometry args={[b.w * 0.38, 0.28, 0.045]} />
            <meshStandardMaterial color="#DDD3C2" map={stuccoTex} roughness={0.60} />
          </mesh>
          {/* Projecting Entrance Porch & Gable */}
          <mesh position={[0, 0.068, b.d * 0.432]} castShadow>
            <boxGeometry args={[b.w * 0.22, 0.12, 0.036]} />
            <meshStandardMaterial color="#D6CEC0" map={stuccoTex} roughness={0.65} />
          </mesh>
          <mesh
            geometry={GABLE_ROOF_GEOMETRY}
            position={[0, 0.128, b.d * 0.432]}
            scale={[b.w * 0.24, 0.05, 0.042]}
            castShadow
          >
            <meshStandardMaterial color={b.type === 'cathedral' ? '#365E52' : '#8C4332'} roughness={0.52} />
          </mesh>
          <mesh position={[0, 0.062, b.d * 0.452]}>
            <boxGeometry args={[b.w * 0.11, 0.095, 0.008]} />
            <meshStandardMaterial color="#7F1D1D" roughness={0.55} />
          </mesh>
          {/* Nave Stained-Glass Rose / Lancet Window */}
          <mesh position={[0, 0.23, b.d * 0.425]} rotation={[Math.PI * 0.5, 0, 0]}>
            <cylinderGeometry args={[0.042, 0.042, 0.010, 20]} />
            <meshStandardMaterial
              color={b.type === 'cathedral' ? '#1E3A5F' : '#2582B8'}
              map={b.type === 'basilica' ? mosaicTileTex : null}
              metalness={0.35}
              roughness={0.22}
            />
          </mesh>
          {/* Crossing Drum, Dome / Flèche Spire & Lantern */}
          <mesh position={[0, 0.39, -b.d * 0.12]} castShadow>
            <cylinderGeometry args={[0.10, 0.11, 0.10, 8]} />
            <meshStandardMaterial color="#F5EFE2" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.44, -b.d * 0.12]} castShadow>
            <sphereGeometry args={[0.098, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial
              color={b.type === 'cathedral' ? '#475569' : '#2582B8'}
              map={b.type === 'basilica' ? mosaicTileTex : slateTileTex}
              roughness={0.32}
              metalness={0.18}
            />
          </mesh>
          <mesh position={[0, 0.55, -b.d * 0.12]} castShadow>
            <cylinderGeometry args={[0.020, 0.024, 0.056, 8]} />
            <meshStandardMaterial color="#FFFBEB" />
          </mesh>
          {b.type === 'cathedral' && (
            <mesh position={[0, 0.62, -b.d * 0.12]} castShadow>
              <coneGeometry args={[0.018, 0.095, 8]} />
              <meshStandardMaterial color="#365E52" metalness={0.28} roughness={0.38} />
            </mesh>
          )}
          {/* Twin 3-Tier Belfry Towers with Corner Pinnacles & Tall Octagonal Spires (Ref Images 1 & 3) */}
          {[-b.w * 0.29, b.w * 0.29].map((tx, idx) => (
            <group key={idx} position={[tx, 0, b.d * 0.34]}>
              <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.102, 0.32, 0.102]} />
                <meshStandardMaterial color="#EAE0D0" map={stuccoTex} roughness={0.62} />
              </mesh>
              <mesh position={[0, 0.37, 0]} castShadow>
                <boxGeometry args={[0.086, 0.13, 0.086]} />
                <meshStandardMaterial color="#F5EFE2" map={stuccoTex} roughness={0.54} />
              </mesh>
              {/* Louvered Belfry Openings */}
              {[0.044, -0.044].map((lz, lIdx) => (
                <mesh key={lIdx} position={[0, 0.37, lz]}>
                  <boxGeometry args={[0.036, 0.068, 0.005]} />
                  <meshStandardMaterial color="#1E293B" roughness={0.75} />
                </mesh>
              ))}
              {/* 4 Corner Tower Pinnacles */}
              {[
                [-0.038, 0.038],
                [0.038, 0.038],
                [-0.038, -0.038],
                [0.038, -0.038],
              ].map(([px, pz], pIdx) => (
                <mesh key={pIdx} position={[px, 0.455, pz]} castShadow>
                  <coneGeometry args={[0.009, 0.042, 4]} />
                  <meshStandardMaterial color="#D6CEC0" roughness={0.55} />
                </mesh>
              ))}
              <mesh position={[0, 0.47, 0]} castShadow>
                <cylinderGeometry args={[0.038, 0.044, 0.08, 8]} />
                <meshStandardMaterial color="#FFFBEB" />
              </mesh>
              <mesh position={[0, b.type === 'cathedral' ? 0.60 : 0.56, 0]} castShadow>
                <coneGeometry args={[0.044, b.type === 'cathedral' ? 0.22 : 0.10, 8]} />
                <meshStandardMaterial
                  color={b.type === 'cathedral' ? '#5C4033' : '#2582B8'}
                  map={b.type === 'basilica' ? mosaicTileTex : null}
                  roughness={0.38}
                />
              </mesh>
            </group>
          ))}
        </group>
      ) : b.type === 'mall' ? (
        <group>
          <mesh position={[0, -0.32, 0]} receiveShadow>
            <boxGeometry args={[b.w * 0.92, 0.64, b.d * 0.92]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
          </mesh>
          {/* Paved Commercial Plaza Apron & Forecourt Planter Beds (Reference Image 10 Panorama Mall) */}
          <mesh position={[0, 0.008, 0]} receiveShadow>
            <boxGeometry args={[b.w * 0.98, 0.016, b.d * 0.98]} />
            <meshStandardMaterial color="#E2E8F0" roughness={0.74} />
          </mesh>
          {[-b.w * 0.34, b.w * 0.34].map((px, i) => (
            <mesh key={i} position={[px, 0.018, b.d * 0.41]} receiveShadow>
              <boxGeometry args={[b.w * 0.18, 0.010, b.d * 0.10]} />
              <meshStandardMaterial color="#4E8A34" roughness={0.85} />
            </mesh>
          ))}
          {/* Main Multi-Wing Composite Panel Complex Body (Image 10) */}
          <mesh position={[0, 0.125, -0.02]} castShadow receiveShadow>
            <boxGeometry args={[b.w * 0.92, 0.23, b.d * 0.80]} />
            <meshStandardMaterial color="#F1F5F9" roughness={0.42} />
          </mesh>
          {/* Left & Right Deep Cobalt-Blue Anchor Wings (Image 10 Side Wings) */}
          {[-b.w * 0.36, b.w * 0.36].map((wx, idx) => (
            <mesh key={idx} position={[wx, 0.135, -0.01]} castShadow receiveShadow>
              <boxGeometry args={[b.w * 0.22, 0.25, b.d * 0.82]} />
              <meshStandardMaterial color="#1D5B8C" roughness={0.36} />
            </mesh>
          ))}
          {/* Projecting Left Composite Frame & Full-Height Grid Curtain-Wall Atrium (Image 10 Left Wing) */}
          <group position={[-b.w * 0.16, 0.14, b.d * 0.06]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[b.w * 0.26, 0.26, b.d * 0.72]} />
              <meshStandardMaterial color="#E2E8F0" roughness={0.44} />
            </mesh>
            <mesh position={[0, -0.01, b.d * 0.362]}>
              <boxGeometry args={[b.w * 0.21, 0.21, 0.008]} />
              <meshStandardMaterial color="#FFFFFF" map={glazingTex} metalness={0.48} roughness={0.18} />
            </mesh>
          </group>
          {/* Signature Warm Wood/Terracotta Upper Feature Volume & Signage Block (Image 10 Right-Center) */}
          <group position={[b.w * 0.16, 0.22, 0.02]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[b.w * 0.34, 0.14, b.d * 0.68]} />
              <meshStandardMaterial color="#8C4A2F" roughness={0.52} />
            </mesh>
            <mesh position={[0, 0.01, b.d * 0.345]} castShadow>
              <boxGeometry args={[b.w * 0.22, 0.032, 0.012]} />
              <meshStandardMaterial color="#FFFFFF" roughness={0.35} />
            </mesh>
          </group>
          {/* Central Recessed Glass Curtain Atrium & Cantilevered Entrance Canopy (Image 10 Center) */}
          <mesh position={[0.02, 0.12, b.d * 0.382]}>
            <boxGeometry args={[b.w * 0.36, 0.20, 0.010]} />
            <meshStandardMaterial color="#FFFFFF" map={glazingTex} metalness={0.52} roughness={0.16} />
          </mesh>
          <mesh position={[0.02, 0.075, b.d * 0.425]} castShadow>
            <boxGeometry args={[b.w * 0.32, 0.010, 0.07]} />
            <meshStandardMaterial color="#F8FAFC" roughness={0.4} />
          </mesh>
          {/* Rooftop Skylight Atrium & Mechanical Plant */}
          <mesh position={[-b.w * 0.02, 0.255, -0.06]} castShadow>
            <boxGeometry args={[b.w * 0.42, 0.024, b.d * 0.38]} />
            <meshStandardMaterial color="#2B7AC4" map={glazingTex} metalness={0.5} roughness={0.2} />
          </mesh>
        </group>
      ) : b.type === 'university' || b.type === 'hall' ? (
        <group>
          <mesh position={[0, -0.315, 0]} receiveShadow>
            <boxGeometry args={[b.w * 0.92, 0.65, b.d * 0.90]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
          </mesh>
          {/* Grounded Civic / Campus Forecourt Lawn & Paved Walkways */}
          <mesh position={[0, 0.008, 0]} receiveShadow>
            <boxGeometry args={[b.w * 0.96, 0.016, b.d * 0.94]} />
            <meshStandardMaterial color="#E2E8F0" roughness={0.78} />
          </mesh>
          {[-b.w * 0.28, b.w * 0.28].map((lx, i) => (
            <mesh key={i} position={[lx, 0.017, b.d * 0.28]} receiveShadow>
              <boxGeometry args={[b.w * 0.24, 0.006, b.d * 0.22]} />
              <meshStandardMaterial color="#5C9B3E" roughness={0.85} />
            </mesh>
          ))}
          {/* Central Administration / Civic Building Block */}
          <mesh position={[0, 0.17, -b.d * 0.12]} castShadow receiveShadow>
            <boxGeometry args={[b.w * 0.90, 0.32, b.d * 0.46]} />
            <meshStandardMaterial color="#FFFDF7" map={facadeTex} roughness={0.48} />
          </mesh>
          {/* Flanking Quadrangle / Administrative Courtyard Wings */}
          {[-b.w * 0.33, b.w * 0.33].map((wx, i) => (
            <group key={i} position={[wx, 0, b.d * 0.08]}>
              <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
                <boxGeometry args={[b.w * 0.24, 0.26, b.d * 0.52]} />
                <meshStandardMaterial color="#FFFFFF" map={facadeTex} roughness={0.48} />
              </mesh>
              <mesh
                geometry={HIP_ROOF_GEOMETRY}
                position={[0, 0.275, 0]}
                scale={[b.w * 0.26, 0.10, b.d * 0.54]}
                castShadow
              >
                <meshStandardMaterial
                  color={b.type === 'university' ? '#1E3A8A' : '#8C4332'}
                  map={b.type === 'university' ? slateTileTex : roofTileTex}
                  roughness={0.46}
                />
              </mesh>
            </group>
          ))}
          {b.type === 'university' ? (
            <>
              {/* Iconic Ateneo "Four Pillars" Neoclassical Portico & Triangular Pediment */}
              <mesh position={[0, 0.025, b.d * 0.16]} castShadow receiveShadow>
                <boxGeometry args={[b.w * 0.38, 0.036, b.d * 0.18]} />
                <meshStandardMaterial color="#CBD5E1" />
              </mesh>
              {[-0.09, -0.03, 0.03, 0.09].map((px, i) => (
                <mesh key={i} position={[px, 0.18, b.d * 0.18]} castShadow>
                  <cylinderGeometry args={[0.011, 0.014, 0.32, 12]} />
                  <meshStandardMaterial color="#FFFFFF" roughness={0.4} />
                </mesh>
              ))}
              <mesh position={[0, 0.34, b.d * 0.14]} castShadow>
                <boxGeometry args={[b.w * 0.40, 0.024, b.d * 0.16]} />
                <meshStandardMaterial color="#F8FAFC" />
              </mesh>
              <mesh
                geometry={GABLE_ROOF_GEOMETRY}
                position={[0, 0.352, b.d * 0.14]}
                scale={[b.w * 0.42, 0.12, b.d * 0.18]}
                castShadow
              >
                <meshStandardMaterial color="#1E3A8A" map={slateTileTex} roughness={0.45} />
              </mesh>
            </>
          ) : (
            <>
              {/* Modernist Naga City Hall Civic Canopy, Council Glazing & Flagpoles */}
              <mesh position={[0, 0.14, b.d * 0.13]}>
                <boxGeometry args={[b.w * 0.36, 0.24, 0.012]} />
                <meshStandardMaterial color="#FFFFFF" map={glazingTex} metalness={0.48} roughness={0.18} />
              </mesh>
              <mesh position={[0, 0.11, b.d * 0.22]} castShadow>
                <boxGeometry args={[b.w * 0.42, 0.016, b.d * 0.18]} />
                <meshStandardMaterial color="#F8FAFC" roughness={0.42} />
              </mesh>
              {[-b.w * 0.16, b.w * 0.16].map((cx, i) => (
                <mesh key={i} position={[cx, 0.055, b.d * 0.28]} castShadow>
                  <boxGeometry args={[0.018, 0.11, 0.018]} />
                  <meshStandardMaterial color="#E2E8F0" />
                </mesh>
              ))}
              {[-0.04, 0, 0.04].map((fx, i) => (
                <mesh key={i} position={[fx, 0.08, b.d * 0.38]}>
                  <cylinderGeometry args={[0.003, 0.003, 0.14, 6]} />
                  <meshStandardMaterial color="#F8FAFC" metalness={0.8} />
                </mesh>
              ))}
            </>
          )}
          {/* Main Central Hipped Roof */}
          <mesh
            geometry={HIP_ROOF_GEOMETRY}
            position={[0, 0.335, -b.d * 0.12]}
            scale={[b.w * 0.94, 0.15, b.d * 0.48]}
            castShadow
          >
            <meshStandardMaterial
              color={b.type === 'university' ? '#1E3A8A' : '#8C4332'}
              map={b.type === 'university' ? slateTileTex : roofTileTex}
              roughness={0.45}
            />
          </mesh>
        </group>
      ) : b.footprint ? (
        <FootprintExtrudedBuilding b={{ ...b, roofColor: vibrantRoofColor }} facadeTex={facadeTex} />
      ) : b.type === 'commercial_midrise' || b.type === 'commercial_lowrise' ? (
        <DetailedCommercialBuildingModel
          w={b.w}
          d={b.d}
          h={b.h}
          levels={b.levels || 3}
          wallColor={wallColor}
          accentColor={b.accentColor || '#2D4A63'}
          facadeTex={facadeTex}
          glazingTex={glazingTex}
          stuccoTex={stuccoTex}
          timberTex={timberTex}
          variant={b.variant || 0}
        />
      ) : (
        <DetailedResidentialHouseModel
          w={b.w}
          d={b.d}
          h={b.h}
          levels={b.levels || 2}
          wallColor={wallColor}
          roofColor={vibrantRoofColor}
          roofShape={b.roofShape || 'hipped'}
          roofTex={roofTileTex}
          slateTex={slateTileTex}
          mosaicTex={mosaicTileTex}
          glazingTex={glazingTex}
          stuccoTex={stuccoTex}
          brickTex={brickTex}
          timberTex={timberTex}
          variant={b.variant || 0}
        />
      )}

      {/* Subtle Landmark Tag in NEAR Zoom Tier */}
      {isMajorLandmark && showLabels && zoomTier === 'NEAR' && b.name && (
        <Html position={[0, (b.h || 0.45) + 0.16, 0]} center zIndexRange={[8, 0]}>
          <div className="pointer-events-none px-2 py-0.5 rounded bg-slate-900/85 text-amber-100 border border-amber-300/40 shadow-sm backdrop-blur-sm text-[9px] font-semibold tracking-wide whitespace-nowrap">
            {b.name}
          </div>
        </Html>
      )}
    </group>
  );
}

// Precompute shared road junction coordinates and arm-aligned junction topology
// so road ribbons trim cleanly before intersections and unified junction patches bridge all arms without overlap.
const ROAD_INTERSECTION_KEYS = (() => {
  const counts = new Map();
  const keyOf = ([lat, lng]) => `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const bridgeEndKeys = new Set(
    NAGA_BRIDGES.flatMap((br) => [
      keyOf(NAGA_ROAD_NODES[br.from]),
      keyOf(NAGA_ROAD_NODES[br.to]),
    ])
  );
  [...NAGA_ROADS_COORDS, ...NAGA_SECONDARY_STREETS].forEach((poly) => {
    poly.forEach((pt) => {
      const k = keyOf(pt);
      counts.set(k, (counts.get(k) || 0) + 1);
    });
  });
  const shared = new Set();
  for (const [k, c] of counts.entries()) {
    if (c > 1 || bridgeEndKeys.has(k)) shared.add(k);
  }
  return { keyOf, shared, bridgeEndKeys };
})();

const JUNCTION_TOPOLOGY = (() => {
  const nodeMap = new Map();
  const keyOf = ROAD_INTERSECTION_KEYS.keyOf;

  const addArm = (pt, neighborPt, primaryType) => {
    const k = keyOf(pt);
    if (!nodeMap.has(k)) {
      const [cx, , cz] = geoToWorld(pt[0], pt[1]);
      nodeMap.set(k, { key: k, cx, cz, isBridgeEnd: ROAD_INTERSECTION_KEYS.bridgeEndKeys.has(k), arms: [] });
    }
    const entry = nodeMap.get(k);
    const [nx, , nz] = geoToWorld(neighborPt[0], neighborPt[1]);
    const vx = nx - entry.cx;
    const vz = nz - entry.cz;
    const len = Math.hypot(vx, vz);
    if (len < 1e-4) return;
    const dx = vx / len;
    const dz = vz / len;
    const angle = Math.atan2(dz, dx);
    const asphaltHw = primaryType === 'secondary' ? 0.055 : 0.08;
    const curbHw = primaryType === 'secondary' ? 0.085 : 0.12;

    const existing = entry.arms.find((a) => Math.abs(Math.atan2(Math.sin(a.angle - angle), Math.cos(a.angle - angle))) < 0.14);
    if (existing) {
      existing.asphaltHw = Math.max(existing.asphaltHw, asphaltHw);
      existing.curbHw = Math.max(existing.curbHw, curbHw);
      existing.maxLen = Math.max(existing.maxLen, len);
      if (primaryType === 'bridge') existing.isBridgeArm = true;
    } else {
      entry.arms.push({ dx, dz, angle, asphaltHw, curbHw, maxLen: len, isBridgeArm: primaryType === 'bridge' });
    }
  };

  NAGA_ROADS_COORDS.forEach((poly) => {
    for (let i = 0; i < poly.length; i++) {
      if (i > 0) addArm(poly[i], poly[i - 1], 'primary');
      if (i < poly.length - 1) addArm(poly[i], poly[i + 1], 'primary');
    }
  });
  NAGA_SECONDARY_STREETS.forEach((poly) => {
    for (let i = 0; i < poly.length; i++) {
      if (i > 0) addArm(poly[i], poly[i - 1], 'secondary');
      if (i < poly.length - 1) addArm(poly[i], poly[i + 1], 'secondary');
    }
  });
  NAGA_BRIDGES.forEach((br) => {
    const ptA = NAGA_ROAD_NODES[br.from];
    const ptB = NAGA_ROAD_NODES[br.to];
    if (ptA && ptB) {
      addArm(ptA, ptB, 'bridge');
      addArm(ptB, ptA, 'bridge');
    }
  });

  for (const entry of nodeMap.values()) {
    entry.arms.sort((a, b) => a.angle - b.angle);
    entry.armExts = entry.arms.map((a, i) => {
      if (a.isBridgeArm) return Math.min(a.maxLen * 0.40, 0.058);
      const aPrev = entry.arms[(i - 1 + entry.arms.length) % entry.arms.length];
      const aNext = entry.arms[(i + 1) % entry.arms.length];
      let sPrev = a.angle - aPrev.angle;
      if (sPrev <= 0) sPrev += Math.PI * 2;
      let sNext = aNext.angle - a.angle;
      if (sNext <= 0) sNext += Math.PI * 2;
      let needed = entry.isBridgeEnd ? 0.24 : entry.arms.length === 2 ? 0.34 : 0.158;
      if (sPrev < Math.PI * 0.75) {
        needed = Math.max(needed, (a.curbHw + aPrev.curbHw) / Math.max(0.18, Math.sin(sPrev)) + 0.04);
      }
      if (sNext < Math.PI * 0.75) {
        needed = Math.max(needed, (a.curbHw + aNext.curbHw) / Math.max(0.18, Math.sin(sNext)) + 0.04);
      }
      return Math.min(a.maxLen * 0.46, needed);
    });
  }

  const getTrimDist = (coord, dirX, dirZ, segLen) => {
    const k = keyOf(coord);
    if (!ROAD_INTERSECTION_KEYS.shared.has(k)) return 0;
    const entry = nodeMap.get(k);
    if (!entry || entry.arms.length < 2) return 0;
    const targetAng = Math.atan2(dirZ, dirX);
    let bestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < entry.arms.length; i++) {
      const diff = Math.abs(Math.atan2(Math.sin(entry.arms[i].angle - targetAng), Math.cos(entry.arms[i].angle - targetAng)));
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    const ext = entry.armExts[bestIdx] ?? 0.118;
    return Math.min(segLen * 0.45, Math.max(0.035, ext - 0.004));
  };

  return { nodeMap, getTrimDist };
})();

function createRoadJunctionPatchesGeometry(isCurb = false, includeMarkings = false) {
  const positions = [];
  const normals = [];
  const markingPositions = [];
  const markingNormals = [];
  const yOffset = isCurb ? 0.0352 : 0.0448;
  const markYOffset = 0.0458;

  const pushMarkingQuad = (cx0, cz0, dx, dz, alongOff, alongHalf, latOff, latHalf) => {
    const px = -dz;
    const pz = dx;
    const c0x = cx0 + dx * (alongOff - alongHalf) + px * (latOff - latHalf);
    const c0z = cz0 + dz * (alongOff - alongHalf) + pz * (latOff - latHalf);
    const c1x = cx0 + dx * (alongOff - alongHalf) + px * (latOff + latHalf);
    const c1z = cz0 + dz * (alongOff - alongHalf) + pz * (latOff + latHalf);
    const c2x = cx0 + dx * (alongOff + alongHalf) + px * (latOff + latHalf);
    const c2z = cz0 + dz * (alongOff + alongHalf) + pz * (latOff + latHalf);
    const c3x = cx0 + dx * (alongOff + alongHalf) + px * (latOff - latHalf);
    const c3z = cz0 + dz * (alongOff + alongHalf) + pz * (latOff - latHalf);
    const y0 = getUncarvedTerrainY(c0x, c0z) + markYOffset;
    const y1 = getUncarvedTerrainY(c1x, c1z) + markYOffset;
    const y2 = getUncarvedTerrainY(c2x, c2z) + markYOffset;
    const y3 = getUncarvedTerrainY(c3x, c3z) + markYOffset;
    // +Y front-facing winding so crosswalk normals point toward sky instead of flipping downward
    markingPositions.push(c0x, y0, c0z, c1x, y1, c1z, c2x, y2, c2z, c0x, y0, c0z, c2x, y2, c2z, c3x, y3, c3z);
    for (let m = 0; m < 6; m++) markingNormals.push(0, 1, 0);
  };

  for (const [k, { cx, cz, isBridgeEnd, arms, armExts }] of JUNCTION_TOPOLOGY.nodeMap.entries()) {
    if (!ROAD_INTERSECTION_KEYS.shared.has(k) || arms.length < 2) continue;

    const rawPerim = [];
    for (let i = 0; i < arms.length; i++) {
      const a0 = arms[i];
      const a1 = arms[(i + 1) % arms.length];
      const hw0 = isCurb ? a0.curbHw : a0.asphaltHw;
      const hw1 = isCurb ? a1.curbHw : a1.asphaltHw;
      const ext0 = armExts[i];
      const ext1 = armExts[(i + 1) % arms.length];

      const minusX0 = cx + a0.dx * ext0 + a0.dz * hw0;
      const minusZ0 = cz + a0.dz * ext0 - a0.dx * hw0;
      const plusX0 = cx + a0.dx * ext0 - a0.dz * hw0;
      const plusZ0 = cz + a0.dz * ext0 + a0.dx * hw0;

      if (i === 0) {
        rawPerim.push([minusX0, minusZ0]);
      }
      rawPerim.push([plusX0, plusZ0]);

      const nextMinusX = cx + a1.dx * ext1 + a1.dz * hw1;
      const nextMinusZ = cz + a1.dz * ext1 - a1.dx * hw1;

      let sweep = a1.angle - a0.angle;
      if (sweep <= 0) sweep += Math.PI * 2;
      let ctrlX = (plusX0 + nextMinusX) * 0.5;
      let ctrlZ = (plusZ0 + nextMinusZ) * 0.5;

      if (sweep < Math.PI * 0.94) {
        const p0x = cx - a0.dz * hw0;
        const p0z = cz + a0.dx * hw0;
        const p1x = cx + a1.dz * hw1;
        const p1z = cz - a1.dx * hw1;
        const det = a0.dx * a1.dz - a0.dz * a1.dx;
        if (Math.abs(det) > 0.12) {
          const s = ((p1x - p0x) * a1.dz - (p1z - p0z) * a1.dx) / det;
          if (s >= 0) {
            const clampedS = Math.min(ext0 * 0.92, s);
            ctrlX = p0x + a0.dx * clampedS;
            ctrlZ = p0z + a0.dz * clampedS;
          }
        }
      } else if (sweep > Math.PI * 1.06) {
        // Outer corner of a concave bend or reflex T/Y junction: intersect incoming/outgoing road edges for a smooth C-curve
        const det = -a0.dx * a1.dz + a0.dz * a1.dx;
        if (Math.abs(det) > 0.14) {
          const s = ((nextMinusX - plusX0) * a1.dz - (nextMinusZ - plusZ0) * a1.dx) / det;
          if (s > 0 && s <= Math.max(ext0, ext1) * 1.8) {
            ctrlX = plusX0 - a0.dx * s;
            ctrlZ = plusZ0 - a0.dz * s;
          }
        }
      }

      const filletSteps = arms.length === 2 ? 10 : 6;
      for (let step = 1; step <= filletSteps; step++) {
        const u = step / filletSteps;
        const om = 1 - u;
        const fx = om * om * plusX0 + 2 * om * u * ctrlX + u * u * nextMinusX;
        const fz = om * om * plusZ0 + 2 * om * u * ctrlZ + u * u * nextMinusZ;
        rawPerim.push([fx, fz]);
      }
    }

    // Preserve exact perimeter walk order (critical for concave 2-arm V-bends and acute Y-junctions)
    const perim = [];
    for (const [px, pz] of rawPerim) {
      if (perim.length > 0) {
        const prev = perim[perim.length - 1];
        if (Math.hypot(px - prev[0], pz - prev[1]) < 0.003) continue;
      }
      perim.push([px, pz]);
    }
    if (perim.length >= 2) {
      const first = perim[0];
      const last = perim[perim.length - 1];
      if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 0.003) perim.pop();
    }
    if (perim.length < 3) continue;

    const contour2D = perim.map(([px, pz]) => new THREE.Vector2(px, pz));
    const tris = THREE.ShapeUtils.triangulateShape(contour2D, []);
    for (const [i0, i1, i2] of tris) {
      const [x0, z0] = perim[i0];
      const [x1, z1] = perim[i1];
      const [x2, z2] = perim[i2];
      const y0 = getUncarvedTerrainY(x0, z0) + yOffset;
      const y1 = getUncarvedTerrainY(x1, z1) + yOffset;
      const y2 = getUncarvedTerrainY(x2, z2) + yOffset;
      // Ensure upward (+Y) triangle winding in XZ
      const crossY = (x1 - x0) * (z2 - z0) - (z1 - z0) * (x2 - x0);
      if (crossY <= 0) {
        positions.push(x0, y0, z0, x1, y1, z1, x2, y2, z2);
      } else {
        positions.push(x0, y0, z0, x2, y2, z2, x1, y1, z1);
      }
      normals.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    }

    if (includeMarkings && !isCurb && !isBridgeEnd && arms.length >= 3) {
      for (let i = 0; i < arms.length; i++) {
        const a = arms[i];
        const ext = armExts[i];
        if (ext < 0.085 || a.maxLen < Math.max(0.55, ext * 2.35)) continue;
        const hw = a.asphaltHw;
        const stripeCount = hw >= 0.07 ? 5 : 4;
        const span = hw * 1.76;
        const step = span / stripeCount;
        const cwAlongHalf = hw >= 0.07 ? 0.036 : 0.028;
        for (let s = 0; s < stripeCount; s++) {
          const latOff = -span * 0.5 + step * (s + 0.5);
          pushMarkingQuad(cx, cz, a.dx, a.dz, ext - 0.018, cwAlongHalf, latOff, step * 0.30);
        }
        pushMarkingQuad(cx, cz, a.dx, a.dz, ext + 0.028, 0.006, 0, hw * 0.86);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  if (!includeMarkings) return geo;

  const markingsGeo = new THREE.BufferGeometry();
  markingsGeo.setAttribute('position', new THREE.Float32BufferAttribute(markingPositions, 3));
  markingsGeo.setAttribute('normal', new THREE.Float32BufferAttribute(markingNormals, 3));
  return { geo, markingsGeo };
}

function createTerrainRibbonGeometry(coords, width, yOffset, samples = 96, smoothCatmull = false) {
  const rawPts = coords.map(([lat, lng]) => {
    const [x, y, z] = geoToWorld(lat, lng);
    return new THREE.Vector3(x, y, z);
  });

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  let cumulativeDist = 0;

  if (smoothCatmull && rawPts.length >= 3) {
    const curve = new THREE.CatmullRomCurve3(rawPts);
    const points = curve.getSpacedPoints(samples);
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (i > 0) cumulativeDist += pt.distanceTo(points[i - 1]);
      const tangent = curve.getTangent(i / samples);
      tangent.y = 0;
      if (tangent.lengthSq() > 0) tangent.normalize();
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const lx = pt.x - side.x * (width * 0.5);
      const lz = pt.z - side.z * (width * 0.5);
      const rx = pt.x + side.x * (width * 0.5);
      const rz = pt.z + side.z * (width * 0.5);

      const waterLevelY = getUncarvedTerrainY(pt.x, pt.z) + yOffset;
      positions.push(lx, waterLevelY, lz, rx, waterLevelY, rz);
      normals.push(0, 1, 0, 0, 1, 0);
      uvs.push(0, cumulativeDist * 2.2, 1, cumulativeDist * 2.2);
      if (i < points.length - 1) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
    }
  } else {
    // 1. Trim road ribbon endpoints back to exact JUNCTION_TOPOLOGY arm extensions
    const adjustedPts = rawPts.map((p) => p.clone());
    if (adjustedPts.length >= 2) {
      const segVec0 = new THREE.Vector3().subVectors(adjustedPts[1], adjustedPts[0]).setY(0);
      const segLen0 = segVec0.length();
      if (segLen0 > 1e-4) {
        const trim0 = JUNCTION_TOPOLOGY.getTrimDist(coords[0], segVec0.x / segLen0, segVec0.z / segLen0, segLen0);
        if (trim0 > 0) adjustedPts[0].addScaledVector(segVec0.normalize(), trim0);
      }
      const n = adjustedPts.length;
      const segVecEnd = new THREE.Vector3().subVectors(adjustedPts[n - 2], adjustedPts[n - 1]).setY(0);
      const segLenEnd = segVecEnd.length();
      if (segLenEnd > 1e-4) {
        const trimEnd = JUNCTION_TOPOLOGY.getTrimDist(coords[coords.length - 1], segVecEnd.x / segLenEnd, segVecEnd.z / segLenEnd, segLenEnd);
        if (trimEnd > 0) adjustedPts[n - 1].addScaledVector(segVecEnd.normalize(), trimEnd);
      }
    }

    // 2. Smooth interior polyline bends with a curvature-safe quadratic corner fillet (prevents bow-tie folds)
    const controlPts = [];
    for (let i = 0; i < adjustedPts.length; i++) {
      if (i === 0 || i === adjustedPts.length - 1) {
        controlPts.push(adjustedPts[i]);
        continue;
      }
      const prev = adjustedPts[i - 1];
      const curr = adjustedPts[i];
      const next = adjustedPts[i + 1];
      const vIn = new THREE.Vector3(prev.x - curr.x, 0, prev.z - curr.z);
      const vOut = new THREE.Vector3(next.x - curr.x, 0, next.z - curr.z);
      const lenIn = vIn.length();
      const lenOut = vOut.length();
      if (lenIn < 1e-4 || lenOut < 1e-4) {
        controlPts.push(curr);
        continue;
      }
      const filletR = Math.min(lenIn * 0.44, lenOut * 0.44, 0.52);
      const pEnter = new THREE.Vector3(
        curr.x + (vIn.x / lenIn) * filletR,
        0,
        curr.z + (vIn.z / lenIn) * filletR
      );
      const pExit = new THREE.Vector3(
        curr.x + (vOut.x / lenOut) * filletR,
        0,
        curr.z + (vOut.z / lenOut) * filletR
      );
      const arcSteps = 12;
      for (let s = 0; s <= arcSteps; s++) {
        const u = s / arcSteps;
        const oneMinusU = 1 - u;
        const bx =
          oneMinusU * oneMinusU * pEnter.x +
          2 * oneMinusU * u * curr.x +
          u * u * pExit.x;
        const bz =
          oneMinusU * oneMinusU * pEnter.z +
          2 * oneMinusU * u * curr.z +
          u * u * pExit.z;
        controlPts.push(new THREE.Vector3(bx, getTerrainY(bx, bz), bz));
      }
    }

    let vertexPairCount = 0;
    const centerPts = [];
    const segSides = [];
    for (let seg = 0; seg < controlPts.length - 1; seg++) {
      const p0 = controlPts[seg];
      const p1 = controlPts[seg + 1];
      const dir = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z).normalize();
      segSides.push(new THREE.Vector3().crossVectors(dir, up).normalize());
    }
    const nodeMiters = controlPts.map((_, idx) => {
      if (idx === 0) return segSides[0] || new THREE.Vector3(1, 0, 0);
      if (idx === controlPts.length - 1) return segSides[segSides.length - 1] || new THREE.Vector3(1, 0, 0);
      const nPrev = segSides[idx - 1];
      const nNext = segSides[idx];
      const bisector = new THREE.Vector3().addVectors(nPrev, nNext);
      if (bisector.lengthSq() < 1e-5) return nNext.clone();
      bisector.normalize();
      const dot = Math.max(0.76, bisector.dot(nNext));
      const miterScale = Math.min(1.14, 1 / dot);
      return bisector.multiplyScalar(miterScale);
    });

    for (let seg = 0; seg < controlPts.length - 1; seg++) {
      const p0 = controlPts[seg];
      const p1 = controlPts[seg + 1];
      const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const subSteps = Math.max(2, Math.ceil(segLen * 12));

      for (let s = 0; s <= subSteps; s++) {
        if (seg > 0 && s === 0) continue;
        const t = s / subSteps;
        const px = THREE.MathUtils.lerp(p0.x, p1.x, t);
        const pz = THREE.MathUtils.lerp(p0.z, p1.z, t);
        const pt = new THREE.Vector3(px, getTerrainY(px, pz), pz);
        centerPts.push(pt);
        if (centerPts.length > 1) cumulativeDist += pt.distanceTo(centerPts[centerPts.length - 2]);

        const activeSide = new THREE.Vector3().lerpVectors(
          nodeMiters[seg],
          nodeMiters[seg + 1],
          t
        );
        const lx = px - activeSide.x * (width * 0.5);
        const lz = pz - activeSide.z * (width * 0.5);
        const rx = px + activeSide.x * (width * 0.5);
        const rz = pz + activeSide.z * (width * 0.5);
        const waterLevelY = getUncarvedTerrainY(pt.x, pt.z) + yOffset;
      positions.push(lx, waterLevelY, lz, rx, waterLevelY, rz);
        normals.push(0, 1, 0, 0, 1, 0);
        uvs.push(0, cumulativeDist * 2.2, 1, cumulativeDist * 2.2);
        if (vertexPairCount > 0) {
          const a = (vertexPairCount - 1) * 2;
          const b = a + 1;
          const c = a + 2;
          const d = a + 3;
          indices.push(a, b, c, b, d, c);
        }
        vertexPairCount++;
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return { geo };
}

// Profiled sloped riverbank geometry: submerged silt bed -> wet stone toe -> dry earthen rim
function createProfiledRiverbankGeometry(coords, waterWidth, bankWidth, samples = 160) {
  const rawPts = coords.map(([lat, lng]) => {
    const [x, y, z] = geoToWorld(lat, lng);
    return new THREE.Vector3(x, y, z);
  });
  const curve = new THREE.CatmullRomCurve3(rawPts);
  const points = curve.getSpacedPoints(samples);
  const up = new THREE.Vector3(0, 1, 0);
  const waterHw = waterWidth * 0.5;
  const bankHw = bankWidth * 0.5;

  // Profile offsets from centerline: [lateralDist, yRelToUncarved, colorRGB]
  const halfProfile = [
    [waterHw * 0.72, -0.029, [0.22, 0.24, 0.21]], // submerged silt floor
    [waterHw * 0.96, -0.013, [0.32, 0.32, 0.28]], // wet waterline toe
    [waterHw * 1.07, -0.004, [0.43, 0.41, 0.36]], // damp riprap shoulder
    [bankHw, 0.001, [0.51, 0.48, 0.42]],          // upper bank crest
    [bankHw * 1.05, -0.005, [0.44, 0.43, 0.37]],  // outer edge tucked cleanly into terrain
  ];
  // Full cross section: left outer -> left inner, then right inner -> right outer
  const cols = halfProfile.length;

  const buildSide = (sign) => {
    const positions = [];
    const colors = [];
    const uvs = [];
    const indices = [];
    let cumDist = 0;

    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (i > 0) cumDist += pt.distanceTo(points[i - 1]);
      const tangent = curve.getTangent(i / samples);
      tangent.y = 0;
      if (tangent.lengthSq() > 0) tangent.normalize();
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const baseTerrY = getUncarvedTerrainY(pt.x, pt.z);

      for (let c = 0; c < cols; c++) {
        const [lat, dy, rgb] = halfProfile[c];
        const vx = pt.x + side.x * sign * lat;
        const vz = pt.z + side.z * sign * lat;
        const vy = baseTerrY + dy;
        positions.push(vx, vy, vz);
        colors.push(rgb[0], rgb[1], rgb[2]);
        uvs.push(c / (cols - 1), cumDist * 1.6);
      }

      if (i < points.length - 1) {
        const row0 = i * cols;
        const row1 = (i + 1) * cols;
        for (let c = 0; c < cols - 1; c++) {
          const a = row0 + c;
          const b = row0 + c + 1;
          const d = row1 + c;
          const e = row1 + c + 1;
          if (sign > 0) {
            indices.push(a, d, b, b, d, e);
          } else {
            indices.push(a, b, d, b, e, d);
          }
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  };

  return mergeGeometries([buildSide(-1), buildSide(1)]);
}

// Subdivided river water mesh with bathymetric depth coloration (deep channel -> shallow banks)
function createRiverWaterGeometry(coords, waterWidth, yOffset = -0.011, samples = 160, crossSegs = 8) {
  const rawPts = coords.map(([lat, lng]) => {
    const [x, y, z] = geoToWorld(lat, lng);
    return new THREE.Vector3(x, y, z);
  });
  const curve = new THREE.CatmullRomCurve3(rawPts);
  const points = curve.getSpacedPoints(samples);
  const up = new THREE.Vector3(0, 1, 0);
  const hw = waterWidth * 0.5;
  const cols = crossSegs + 1;

  const positions = [];
  const normals = [];
  const uvs = [];
  const colors = [];
  const indices = [];
  let cumDist = 0;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (i > 0) cumDist += pt.distanceTo(points[i - 1]);
    const tangent = curve.getTangent(i / samples);
    tangent.y = 0;
    if (tangent.lengthSq() > 0) tangent.normalize();
    const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const waterY = getUncarvedTerrainY(pt.x, pt.z) + yOffset;

    for (let c = 0; c < cols; c++) {
      const u = c / crossSegs; // 0 (left bank) -> 0.5 (center) -> 1 (right bank)
      const lat = (u - 0.5) * 2 * hw;
      const edgeFactor = Math.abs(u - 0.5) * 2; // 0 at center, 1 at bank
      // Bathymetric color: deep river teal (#123B40) -> mid (#184D4F) -> translucent shallow (#2A6660)
      const depthMix = edgeFactor * edgeFactor;
      const r = THREE.MathUtils.lerp(0.075, 0.175, depthMix);
      const g = THREE.MathUtils.lerp(0.235, 0.405, depthMix);
      const b = THREE.MathUtils.lerp(0.255, 0.375, depthMix);

      positions.push(pt.x + side.x * lat, waterY, pt.z + side.z * lat);
      normals.push(0, 1, 0);
      uvs.push(u, cumDist * 2.2);
      colors.push(r, g, b);
    }

    if (i < points.length - 1) {
      const row0 = i * cols;
      const row1 = (i + 1) * cols;
      for (let c = 0; c < crossSegs; c++) {
        const a = row0 + c;
        const b = row0 + c + 1;
        const d = row1 + c;
        const e = row1 + c + 1;
        indices.push(a, b, d, b, e, d);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  return geo;
}

export const ROAD_SURFACE_OFFSET = 0.046;
export const BRIDGE_ARCH_LIFT = 0.11;

// Shared C1-continuous bridge elevation profile along normalized span t in [0, 1].
// At t <= 0 and t >= 1, elevation matches normal road surface (baseTerrainY + ROAD_SURFACE_OFFSET) with zero slope.
export function bridgeProfileY(t, baseTerrainY = 0) {
  if (t <= 0 || t >= 1) return baseTerrainY + ROAD_SURFACE_OFFSET;
  const s = Math.sin(t * Math.PI);
  const archFactor = s * s * (0.35 + 0.65 * s);
  return baseTerrainY + ROAD_SURFACE_OFFSET + BRIDGE_ARCH_LIFT * archFactor;
}

export function getRoadSurfaceY(x, z) {
  const base = getTerrainY(x, z);
  let maxSurfaceY = base + ROAD_SURFACE_OFFSET;

  for (const br of NAGA_BRIDGES) {
    const [ax, , az] = geoToWorld(...NAGA_ROAD_NODES[br.from]);
    const [bx, , bz] = geoToWorld(...NAGA_ROAD_NODES[br.to]);
    const vx = bx - ax;
    const vz = bz - az;
    const lenSq = vx * vx + vz * vz;
    if (lenSq <= 0) continue;

    const rawT = ((x - ax) * vx + (z - az) * vz) / lenSq;
    if (rawT <= 0 || rawT >= 1) continue;

    const closestX = ax + rawT * vx;
    const closestZ = az + rawT * vz;
    const dist = Math.hypot(x - closestX, z - closestZ);

    if (dist < 0.16) {
      const profileY = bridgeProfileY(rawT, base);
      let lateralWeight = 1;
      if (dist > 0.08) {
        const u = (dist - 0.08) / 0.08;
        lateralWeight = 1 - u * u * (3 - 2 * u);
      }
      const blendedY =
        base + ROAD_SURFACE_OFFSET + (profileY - (base + ROAD_SURFACE_OFFSET)) * lateralWeight;
      if (blendedY > maxSurfaceY) {
        maxSurfaceY = blendedY;
      }
    }
  }

  return maxSurfaceY;
}

function getSafeCameraMinY(x, z) {
  return Math.max(BASE_ELEVATION + 0.45, getTerrainY(x, z) + 0.45);
}

function MapCameraRig({ activeMapNode, cameraCommand, validationMode, onZoomTierChange }) {
  const controlsRef = useRef();
  const desiredTarget = useRef(new THREE.Vector3(-1.2, 0.15, 0.3));
  const desiredCameraPos = useRef(new THREE.Vector3(-0.2, 7.6, 8.2));
  const isTransitioning = useRef(false);
  const currentTierRef = useRef('MID');

  useEffect(() => {
    if (validationMode) {
      desiredTarget.current.set(-1.2, 0.25, 0.3);
      desiredCameraPos.current.set(-1.2, 1.55, 2.85);
      isTransitioning.current = true;
    } else {
      desiredTarget.current.set(-1.2, 0.15, 0.3);
      desiredCameraPos.current.set(-0.2, 7.6, 8.2);
      isTransitioning.current = true;
    }
  }, [validationMode]);

  useEffect(() => {
    if (activeMapNode && !validationMode) {
      let x;
      let y;
      let z;
      if (activeMapNode.id?.startsWith('NAGA-')) {
        const placement = getWaterFacilityPlacement(activeMapNode);
        x = placement.x;
        y = placement.y;
        z = placement.z;
      } else {
        [x, y, z] = geoToWorld(activeMapNode.lat, activeMapNode.lng);
      }
      const nextCamX = x + 1.05;
      const nextCamZ = z + 1.45;
      const nextCamY = Math.max(y + 1.25, getSafeCameraMinY(nextCamX, nextCamZ));
      desiredTarget.current.set(x, Math.max(BASE_ELEVATION, y + 0.12), z);
      desiredCameraPos.current.set(nextCamX, nextCamY, nextCamZ);
      isTransitioning.current = true;
    }
  }, [activeMapNode, validationMode]);

  useEffect(() => {
    if (!cameraCommand || !controlsRef.current) return;
    const cam = controlsRef.current.object;
    const target = controlsRef.current.target;
    if (cameraCommand.action === 'RESET') {
      desiredTarget.current.set(-1.2, 0.15, 0.3);
      desiredCameraPos.current.set(-0.2, 7.6, 8.2);
      isTransitioning.current = true;
    } else if (cameraCommand.action === 'OVERVIEW') {
      desiredTarget.current.set(-0.2, 0.2, 0.1);
      desiredCameraPos.current.set(0.4, 13.5, 13.0);
      isTransitioning.current = true;
    } else if (cameraCommand.action === 'ZOOM_IN') {
      const dir = new THREE.Vector3().subVectors(cam.position, target).multiplyScalar(0.74);
      if (dir.length() > 0.85) {
        const nextPos = new THREE.Vector3().copy(target).add(dir);
        nextPos.y = Math.max(nextPos.y, getSafeCameraMinY(nextPos.x, nextPos.z));
        desiredCameraPos.current.copy(nextPos);
        isTransitioning.current = true;
      }
    } else if (cameraCommand.action === 'ZOOM_OUT') {
      const dir = new THREE.Vector3().subVectors(cam.position, target).multiplyScalar(1.25);
      const clampedDir = dir.length() > 18.5 ? dir.normalize().multiplyScalar(18.5) : dir;
      const nextPos = new THREE.Vector3().copy(target).add(clampedDir);
      nextPos.y = Math.max(nextPos.y, getSafeCameraMinY(nextPos.x, nextPos.z));
      desiredCameraPos.current.copy(nextPos);
      isTransitioning.current = true;
    }
  }, [cameraCommand]);

  useFrame(({ camera }) => {
    if (!controlsRef.current) return;
    if (isTransitioning.current) {
      controlsRef.current.target.lerp(desiredTarget.current, 0.08);
      camera.position.lerp(desiredCameraPos.current, 0.08);
      if (camera.position.distanceTo(desiredCameraPos.current) < 0.04) {
        isTransitioning.current = false;
      }
    }
    const minY = getSafeCameraMinY(camera.position.x, camera.position.z);
    if (camera.position.y < minY) camera.position.y = minY;
    controlsRef.current.update();

    if (onZoomTierChange) {
      const dist = camera.position.distanceTo(controlsRef.current.target);
      let nextTier = currentTierRef.current;
      if (dist < 5.2) nextTier = 'NEAR';
      else if (dist > 11.4) nextTier = 'FAR';
      else if (dist > 5.8 && dist < 10.6) nextTier = 'MID';
      if (nextTier !== currentTierRef.current) {
        currentTierRef.current = nextTier;
        onZoomTierChange(nextTier);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={true}
      enableZoom={true}
      screenSpacePanning={false}
      onStart={() => (isTransitioning.current = false)}
      minPolarAngle={0.18}
      maxPolarAngle={Math.PI / 2.25}
      minDistance={0.85}
      maxDistance={18.5}
    />
  );
}

function NagaTerrainMesh({ satelliteTex, terrainBumpTex, terrainRoughnessTex, onBackgroundClick }) {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(76, 62, 300, 240);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, getTerrainY(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <mesh geometry={geometry} receiveShadow onClick={onBackgroundClick}>
      <meshStandardMaterial
        map={satelliteTex}
        bumpMap={terrainBumpTex}
        bumpScale={0.022}
        roughnessMap={terrainRoughnessTex}
        roughness={0.94}
        metalness={0.0}
      />
    </mesh>
  );
}

function buildProfiledPrismGeometry(stations, lateralCenter, halfWidth) {
  const positions = [];
  const uvs = [];
  const pushQuad = (a, b, c, d, u0 = 0, v0 = 0, u1 = 1, v1 = 1) => {
    positions.push(...a, ...b, ...c, ...a, ...c, ...d);
    uvs.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
  };

  const rings = stations.map((st) => {
    const lOff = lateralCenter - halfWidth;
    const rOff = lateralCenter + halfWidth;
    const lx = st.x + st.sideX * lOff;
    const lz = st.z + st.sideZ * lOff;
    const rx = st.x + st.sideX * rOff;
    const rz = st.z + st.sideZ * rOff;
    return {
      tl: [lx, st.yTop, lz],
      tr: [rx, st.yTop, rz],
      bl: [lx, st.yBot, lz],
      br: [rx, st.yBot, rz],
      v: st.dist * 2.2,
    };
  });

  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    // Top face (+Y)
    pushQuad(r0.tl, r0.tr, r1.tr, r1.tl, 0, r0.v, 1, r1.v);
    // Bottom face (-Y)
    pushQuad(r0.br, r0.bl, r1.bl, r1.br, 0, r0.v, 1, r1.v);
    // Left sidewall
    pushQuad(r0.bl, r0.tl, r1.tl, r1.bl, 0, r0.v, 1, r1.v);
    // Right sidewall
    pushQuad(r0.tr, r0.br, r1.br, r1.tr, 0, r0.v, 1, r1.v);
  }

  if (rings.length >= 2) {
    const first = rings[0];
    const last = rings[rings.length - 1];
    pushQuad(first.bl, first.br, first.tr, first.tl);
    pushQuad(last.tr, last.br, last.bl, last.tl);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

function BridgeStructures({ roadTex, asphaltBumpTex, concreteTex }) {
  const bridgeMeshes = useMemo(() => {
    const segments = 32;
    return NAGA_BRIDGES.map((br) => {
      const [ax, , az] = geoToWorld(...NAGA_ROAD_NODES[br.from]);
      const [bx, , bz] = geoToWorld(...NAGA_ROAD_NODES[br.to]);
      const dx = bx - ax;
      const dz = bz - az;
      const spanLength = Math.hypot(dx, dz);
      const dirX = spanLength > 0 ? dx / spanLength : 0;
      const dirZ = spanLength > 0 ? dz / spanLength : 1;
      // Right-hand perpendicular vector in XZ plane so (side, up, dir) is right-handed
      const sideX = -dirZ;
      const sideZ = dirX;
      const angleY = Math.atan2(dx, dz);

      const deckStations = [];
      const roadStations = [];
      const railStations = [];

      const tTrim = spanLength > 0 ? Math.min(0.10, 0.042 / spanLength) : 0;

      for (let i = 0; i <= segments; i++) {
        const t = tTrim + (1 - 2 * tTrim) * (i / segments);
        const x = ax + dx * t;
        const z = az + dz * t;
        const terrY = getTerrainY(x, z);
        const surfY = bridgeProfileY(t, terrY);
        const dist = t * spanLength;

        // Approach ramps (t <= 0.20 or t >= 0.80) ground into the terrain; central arch spans cleanly over water
        const isRamp = t <= 0.20 || t >= 0.80;
        const deckBotY = isRamp ? Math.min(terrY + 0.008, surfY - 0.018) : surfY - 0.034;

        deckStations.push({
          x,
          z,
          sideX,
          sideZ,
          yTop: surfY - 0.002,
          yBot: deckBotY,
          dist,
        });

        roadStations.push({
          x,
          z,
          sideX,
          sideZ,
          yTop: surfY,
          yBot: surfY - 0.004,
          dist,
        });

        if (i >= 1 && i <= segments - 1) {
          railStations.push({
            x,
            z,
            sideX,
            sideZ,
            yTop: surfY + 0.026,
            yBot: surfY - 0.002,
            dist,
          });
        }
      }

      const piers = [0.20, 0.80].map((pt) => {
        const px = ax + dx * pt;
        const pz = az + dz * pt;
        const terrY = getTerrainY(px, pz);
        const surfY = bridgeProfileY(pt, terrY);
        const pierTop = surfY - 0.010;
        const pierBot = terrY - 0.08;
        const pierH = Math.max(0.08, pierTop - pierBot);
        return {
          x: px,
          y: pierBot + pierH * 0.5,
          z: pz,
          h: pierH,
        };
      });

      return {
        id: br.id,
        angleY,
        deckGeo: buildProfiledPrismGeometry(deckStations, 0, 0.12),
        roadGeo: buildProfiledPrismGeometry(roadStations, 0, 0.08),
        leftRailGeo: buildProfiledPrismGeometry(railStations, -0.112, 0.008),
        rightRailGeo: buildProfiledPrismGeometry(railStations, 0.112, 0.008),
        piers,
      };
    });
  }, []);

  return (
    <group>
      {bridgeMeshes.map((bm) => (
        <group key={bm.id}>
          {bm.piers.map((p, idx) => (
            <mesh
              key={idx}
              position={[p.x, p.y, p.z]}
              rotation={[0, bm.angleY, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.30, p.h, 0.08]} />
              <meshStandardMaterial map={concreteTex} color="#78756E" roughness={0.9} bumpMap={asphaltBumpTex} bumpScale={0.006} />
            </mesh>
          ))}
          <mesh geometry={bm.deckGeo} castShadow receiveShadow>
            <meshStandardMaterial map={concreteTex} color="#B8B4AA" roughness={0.86} bumpMap={asphaltBumpTex} bumpScale={0.004} />
          </mesh>
          <mesh geometry={bm.roadGeo} receiveShadow>
            <meshStandardMaterial
              map={roadTex}
              bumpMap={asphaltBumpTex}
              bumpScale={0.005}
              roughness={0.84}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
          <mesh geometry={bm.leftRailGeo} castShadow receiveShadow>
            <meshStandardMaterial map={concreteTex} color="#C8C4BA" roughness={0.82} />
          </mesh>
          <mesh geometry={bm.rightRailGeo} castShadow receiveShadow>
            <meshStandardMaterial map={concreteTex} color="#C8C4BA" roughness={0.82} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const PRIMARY_OVERVIEW_BARANGAYS = new Set([
  'BRGY-01',
  'BRGY-04',
  'BRGY-06',
  'BRGY-09',
  'BRGY-12',
  'BRGY-16',
  'BRGY-17',
  'BRGY-19',
  'BRGY-20',
  'BRGY-25',
  'BRGY-27',
  'BRGY-DINAGA',
  'BRGY-TRIANGULO',
  'BRGY-PENAFRANCIA',
  'BRGY-SABANG',
  'BRGY-MABOLO',
  'BRGY-TABUCO',
  'BRGY-BALATAS',
  'BRGY-CONCEPCION_PEQ',
  'BRGY-PACOL',
  'BRGY-CARARAYAN',
]);

function splitPolylineAtSharedJunctions(coords) {
  if (!coords || coords.length < 2) return [];
  const segments = [];
  let start = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const k = ROAD_INTERSECTION_KEYS.keyOf(coords[i]);
    if (ROAD_INTERSECTION_KEYS.shared.has(k)) {
      segments.push(coords.slice(start, i + 1));
      start = i;
    }
  }
  segments.push(coords.slice(start));
  return segments.filter((s) => s.length >= 2);
}

function createBatchedRoadNetworkGeometry(polylines, width, yOffset, stepLen = 0.09) {
  const hw = width * 0.5;
  const pos = [];
  const norm = [];
  const uv = [];

  // Precompute primary & secondary centerlines so local/tertiary ribbons smoothly tuck under main road curbs/asphalt with zero puncture
  const majorSegsXZ = [];
  NAGA_ROADS_COORDS.forEach((poly) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, , az] = geoToWorld(...poly[i]);
      const [bx, , bz] = geoToWorld(...poly[i + 1]);
      majorSegsXZ.push({ ax, az, bx, bz, hw: 0.118 });
    }
  });
  NAGA_SECONDARY_STREETS.forEach((poly) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, , az] = geoToWorld(...poly[i]);
      const [bx, , bz] = geoToWorld(...poly[i + 1]);
      majorSegsXZ.push({ ax, az, bx, bz, hw: 0.084 });
    }
  });

  const majorOverlapDrop = (x, z) => {
    for (let i = 0; i < majorSegsXZ.length; i++) {
      const s = majorSegsXZ[i];
      const vx = s.bx - s.ax, vz = s.bz - s.az, l2 = vx * vx + vz * vz;
      if (l2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / l2));
      const d = Math.hypot(x - (s.ax + t * vx), z - (s.az + t * vz));
      if (d < s.hw + 0.015) return 0.008;
    }
    return 0;
  };

  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, u0, v0, u1, v1, u2, v2) => {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const acx = cx - ax, acy = cy - ay, acz = cz - az;
    const ny = abz * acx - abx * acz;
    if (ny >= 0) {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      uv.push(u0, v0, u1, v1, u2, v2);
    } else {
      pos.push(ax, ay, az, cx, cy, cz, bx, by, bz);
      uv.push(u0, v0, u2, v2, u1, v1);
    }
    norm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
  };

  const pushRoundCap = (cx, cy, cz, segs = 12) => {
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2;
      const a1 = ((s + 1) / segs) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * hw;
      const z0 = cz + Math.sin(a0) * hw;
      const x1 = cx + Math.cos(a1) * hw;
      const z1 = cz + Math.sin(a1) * hw;
      pushTri(cx, cy, cz, x1, cy, z1, x0, cy, z0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5);
    }
  };

  for (const poly of polylines) {
    if (!poly || poly.length < 2) continue;
    const rawPts = poly.map(([lat, lng]) => {
      const [x, , z] = geoToWorld(lat, lng);
      return new THREE.Vector3(x, 0, z);
    });
    // Compute total length for clean CatmullRom centripetal smoothing (never overshoots corners!)
    let totalLen = 0;
    for (let i = 0; i < rawPts.length - 1; i++) {
      totalLen += Math.hypot(rawPts[i + 1].x - rawPts[i].x, rawPts[i + 1].z - rawPts[i].z);
    }
    if (totalLen < 1e-3) continue;
    const curve = new THREE.CatmullRomCurve3(rawPts, false, 'centripetal', 0.5);
    const numSamples = Math.max(6, Math.min(220, Math.ceil(totalLen / stepLen)));
    const sampled = curve.getSpacedPoints(numSamples);

    // Mitered continuous left/right vertices
    const strip = [];
    let uAccum = 0;
    for (let i = 0; i < sampled.length; i++) {
      const curr = sampled[i];
      if (i > 0) uAccum += Math.hypot(curr.x - sampled[i - 1].x, curr.z - sampled[i - 1].z);

      let tx0 = 0, tz0 = 0, tx1 = 0, tz1 = 0;
      if (i > 0) {
        const dx = curr.x - sampled[i - 1].x, dz = curr.z - sampled[i - 1].z;
        const l = Math.hypot(dx, dz) || 1;
        tx0 = dx / l; tz0 = dz / l;
      }
      if (i < sampled.length - 1) {
        const dx = sampled[i + 1].x - curr.x, dz = sampled[i + 1].z - curr.z;
        const l = Math.hypot(dx, dz) || 1;
        tx1 = dx / l; tz1 = dz / l;
      }
      if (i === 0) { tx0 = tx1; tz0 = tz1; }
      if (i === sampled.length - 1) { tx1 = tx0; tz1 = tz0; }

      const n0x = -tz0, n0z = tx0;
      const n1x = -tz1, n1z = tx1;
      let mx = n0x + n1x, mz = n0z + n1z;
      const mLen = Math.hypot(mx, mz);
      let scale = hw;
      if (mLen > 1e-4) {
        mx /= mLen; mz /= mLen;
        const dot = Math.max(0.55, mx * n0x + mz * n0z);
        scale = Math.min(hw * 1.45, hw / dot);
      } else {
        mx = n0x; mz = n0z;
      }

      const py = getTerrainY(curr.x, curr.z) + yOffset - majorOverlapDrop(curr.x, curr.z);
      strip.push({
        lx: curr.x + mx * scale,
        lz: curr.z + mz * scale,
        rx: curr.x - mx * scale,
        rz: curr.z - mz * scale,
        y: py,
        u: uAccum * 3.8,
        cx: curr.x,
        cz: curr.z,
        tx: (tx0 + tx1) * 0.5,
        tz: (tz0 + tz1) * 0.5,
      });
    }

    for (let i = 0; i < strip.length - 1; i++) {
      const a = strip[i], b = strip[i + 1];
      pushTri(a.lx, a.y, a.lz, a.rx, a.y, a.rz, b.rx, b.y, b.rz, 0, a.u, 1, a.u, 1, b.u);
      pushTri(a.lx, a.y, a.lz, b.rx, b.y, b.rz, b.lx, b.y, b.lz, 0, a.u, 1, b.u, 0, b.u);
    }
    const first = strip[0], last = strip[strip.length - 1];
    pushRoundCap(first.cx, first.y, first.cz, 12);
    pushRoundCap(last.cx, last.y, last.cz, 12);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

function TerrainRibbons({ textures, showLabels = true, zoomTier = 'MID' }) {
  const {
    nagaBankGeo,
    nagaRiverGeo,
    bicolBankGeo,
    bicolRiverGeo,
    primaryCurbs,
    primaryAsphalt,
    secondaryCurbs,
    secondaryAsphalt,
    tertiaryCurbGeo,
    tertiaryAsphaltGeo,
    localCurbGeo,
    localAsphaltGeo,
    junctionCurbGeo,
    junctionAsphaltGeo,
    junctionMarkingsGeo,
  } = useMemo(() => {
    const primarySegments = NAGA_ROADS_COORDS.flatMap(splitPolylineAtSharedJunctions);
    const secondarySegments = NAGA_SECONDARY_STREETS.flatMap(splitPolylineAtSharedJunctions);
    const { geo: junctionAsphaltGeo, markingsGeo: junctionMarkingsGeo } = createRoadJunctionPatchesGeometry(false, true);

    return {
      nagaBankGeo: createProfiledRiverbankGeometry(NAGA_RIVER_COORDS, 0.48, 0.60, 160),
      nagaRiverGeo: createRiverWaterGeometry(NAGA_RIVER_COORDS, 0.48, -0.011, 160, 8),
      bicolBankGeo: createProfiledRiverbankGeometry(BICOL_RIVER_COORDS, 0.66, 0.80, 160),
      bicolRiverGeo: createRiverWaterGeometry(BICOL_RIVER_COORDS, 0.66, -0.011, 160, 8),
      primaryCurbs: primarySegments.map((r) => createTerrainRibbonGeometry(r, 0.24, 0.035, 64, false).geo),
      primaryAsphalt: primarySegments.map((r) => createTerrainRibbonGeometry(r, 0.16, 0.044, 64, false).geo),
      secondaryCurbs: secondarySegments.map((r) => createTerrainRibbonGeometry(r, 0.17, 0.035, 40, false).geo),
      secondaryAsphalt: secondarySegments.map((r) => createTerrainRibbonGeometry(r, 0.11, 0.044, 40, false).geo),
      tertiaryCurbGeo: createBatchedRoadNetworkGeometry(NAGA_TERTIARY_ROADS, 0.128, 0.032, 0.09),
      tertiaryAsphaltGeo: createBatchedRoadNetworkGeometry(NAGA_TERTIARY_ROADS, 0.086, 0.039, 0.09),
      localCurbGeo: createBatchedRoadNetworkGeometry(NAGA_LOCAL_STREETS, 0.096, 0.031, 0.09),
      localAsphaltGeo: createBatchedRoadNetworkGeometry(NAGA_LOCAL_STREETS, 0.064, 0.038, 0.09),
      junctionCurbGeo: createRoadJunctionPatchesGeometry(true),
      junctionAsphaltGeo,
      junctionMarkingsGeo,
    };
  }, []);

  const roadInfraContext = useMemo(() => {
    const spatial = buildRoadSpatialContext();
    return { spatial, poleData: computeElectricalPoleNetwork(spatial) };
  }, []);

  const waterUniforms = useMemo(() => ({ uTime: { value: 0 } }), []);

  const applyWaterShader = useMemo(() => {
    const patch = (flowSign) => (shader) => {
      shader.uniforms.uTime = waterUniforms.uTime;
      shader.uniforms.uFlowSign = { value: flowSign };
      shader.vertexShader =
        `uniform float uTime;\nuniform float uFlowSign;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float shoreMask = sin(clamp(uv.x, 0.0, 1.0) * 3.14159265);
           float waveA = sin(uv.y * 5.2 + uTime * 1.15 * uFlowSign + uv.x * 3.14159) * 0.00042;
           float waveB = cos(uv.y * 9.7 - uTime * 0.85 * uFlowSign - uv.x * 6.28318) * 0.00024;
           transformed.y += (waveA + waveB) * shoreMask;`
        );
    };
    return {
      naga: patch(RIVER_FLOW_METADATA.naga.uvScrollSign),
      bicol: patch(RIVER_FLOW_METADATA.bicol.uvScrollSign),
    };
  }, [waterUniforms]);

  const visibleBarangayLabels = useMemo(() => {
    if (!showLabels || zoomTier === 'NEAR') return [];
    if (zoomTier === 'FAR') {
      return NAGA_BARANGAY_DISTRICTS.filter((d) => PRIMARY_OVERVIEW_BARANGAYS.has(d.id));
    }
    return NAGA_BARANGAY_DISTRICTS;
  }, [showLabels, zoomTier]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    waterUniforms.uTime.value += dt;
    if (textures.waterNormalTex) {
      textures.waterNormalTex.offset.y =
        (textures.waterNormalTex.offset.y + RIVER_FLOW_METADATA.naga.uvScrollSign * dt * 0.048) % 1;
      textures.waterNormalTex.offset.x = Math.sin(waterUniforms.uTime.value * 0.22) * 0.012;
    }
    if (textures.bicolWaterNormalTex) {
      textures.bicolWaterNormalTex.offset.y =
        (textures.bicolWaterNormalTex.offset.y + RIVER_FLOW_METADATA.bicol.uvScrollSign * dt * 0.042) % 1;
      textures.bicolWaterNormalTex.offset.x = Math.cos(waterUniforms.uTime.value * 0.19) * 0.012;
    }
  });

  return (
    <group>
      <mesh geometry={nagaBankGeo} receiveShadow>
        <meshStandardMaterial
          map={textures.concreteTex}
          vertexColors
          bumpMap={textures.asphaltBumpTex}
          bumpScale={0.008}
          roughness={0.92}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <mesh geometry={nagaRiverGeo} renderOrder={1} receiveShadow>
        <meshPhysicalMaterial
          vertexColors
          transparent
          opacity={0.90}
          roughness={0.075}
          metalness={0.05}
          clearcoat={1.0}
          clearcoatRoughness={0.05}
          ior={1.333}
          reflectivity={0.9}
          normalMap={textures.waterNormalTex}
          normalScale={[0.24, 0.24]}
          envMapIntensity={1.75}
          onBeforeCompile={applyWaterShader.naga}
          customProgramCacheKey={() => 'river-water-naga-v1'}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>
      <mesh geometry={bicolBankGeo} receiveShadow>
        <meshStandardMaterial
          map={textures.concreteTex}
          vertexColors
          bumpMap={textures.asphaltBumpTex}
          bumpScale={0.008}
          roughness={0.92}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <mesh geometry={bicolRiverGeo} renderOrder={1} receiveShadow>
        <meshPhysicalMaterial
          vertexColors
          transparent
          opacity={0.90}
          roughness={0.075}
          metalness={0.05}
          clearcoat={1.0}
          clearcoatRoughness={0.05}
          ior={1.333}
          reflectivity={0.9}
          normalMap={textures.bicolWaterNormalTex}
          normalScale={[0.24, 0.24]}
          envMapIntensity={1.75}
          onBeforeCompile={applyWaterShader.bicol}
          customProgramCacheKey={() => 'river-water-bicol-v1'}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </mesh>

      <mesh geometry={localCurbGeo} renderOrder={0} receiveShadow>
        <meshStandardMaterial
          map={textures.concreteTex}
          color="#BEB9AF"
          roughness={0.92}
          metalness={0.02}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={1}
        />
      </mesh>
      <mesh geometry={tertiaryCurbGeo} renderOrder={0} receiveShadow>
        <meshStandardMaterial
          map={textures.concreteTex}
          color="#C2BEB4"
          roughness={0.92}
          metalness={0.02}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={1}
        />
      </mesh>

      {secondaryCurbs.map((geo, i) => (
        <mesh key={`sc-${i}`} geometry={geo} renderOrder={1} receiveShadow>
          <meshStandardMaterial
            map={textures.concreteTex}
            color="#C4C0B6"
            bumpMap={textures.asphaltBumpTex}
            bumpScale={0.003}
            roughness={0.86}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-3}
          />
        </mesh>
      ))}
      {primaryCurbs.map((geo, i) => (
        <mesh key={`pc-${i}`} geometry={geo} renderOrder={1} receiveShadow>
          <meshStandardMaterial
            map={textures.concreteTex}
            color="#C4C0B6"
            bumpMap={textures.asphaltBumpTex}
            bumpScale={0.003}
            roughness={0.86}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-3}
          />
        </mesh>
      ))}
      <mesh geometry={junctionCurbGeo} renderOrder={1} receiveShadow>
        <meshStandardMaterial
          map={textures.concreteTex}
          color="#C4C0B6"
          bumpMap={textures.asphaltBumpTex}
          bumpScale={0.003}
          roughness={0.86}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-4}
        />
      </mesh>
      {secondaryAsphalt.map((geo, i) => (
        <mesh key={`sa-${i}`} geometry={geo} renderOrder={2} receiveShadow>
          <meshStandardMaterial
            map={textures.secondaryRoadTex}
            bumpMap={textures.asphaltBumpTex}
            bumpScale={0.005}
            roughness={0.85}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-6}
          />
        </mesh>
      ))}
      {primaryAsphalt.map((geo, i) => (
        <mesh key={`pa-${i}`} geometry={geo} renderOrder={2} receiveShadow>
          <meshStandardMaterial
            map={textures.primaryRoadTex}
            bumpMap={textures.asphaltBumpTex}
            bumpScale={0.005}
            roughness={0.83}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-6}
          />
        </mesh>
      ))}
      <mesh geometry={localAsphaltGeo} renderOrder={1} receiveShadow>
        <meshStandardMaterial
          map={textures.secondaryRoadTex}
          bumpMap={textures.asphaltBumpTex}
          bumpScale={0.0045}
          color="#CFD6DF"
          roughness={0.86}
          metalness={0.04}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={0}
        />
      </mesh>
      <mesh geometry={tertiaryAsphaltGeo} renderOrder={1} receiveShadow>
        <meshStandardMaterial
          map={textures.secondaryRoadTex}
          bumpMap={textures.asphaltBumpTex}
          bumpScale={0.005}
          color="#EBEFF5"
          roughness={0.84}
          metalness={0.04}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={0}
        />
      </mesh>
      <mesh geometry={junctionAsphaltGeo} renderOrder={3} receiveShadow>
        <meshStandardMaterial
          color="#2B2F34"
          bumpMap={textures.asphaltBumpTex}
          bumpScale={0.005}
          roughness={0.84}
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={-8}
        />
      </mesh>
      <mesh geometry={junctionMarkingsGeo} renderOrder={4}>
        <meshStandardMaterial color="#F8FAFC" roughness={0.58} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-10} />
      </mesh>

      <BridgeStructures
        roadTex={textures.primaryRoadTex}
        asphaltBumpTex={textures.asphaltBumpTex}
        concreteTex={textures.concreteTex}
      />
      <RoadsideInfrastructureInstanced
        textures={textures}
        spatial={roadInfraContext.spatial}
        polePositions={roadInfraContext.poleData.poles}
      />
      <ElectricalPoleNetworkInstanced
        poleData={roadInfraContext.poleData}
        bumpTex={textures.terrainBumpTex}
        poleTex={textures.poleWoodTex}
      />

      {BARANGAY_BOUNDARIES.map((ring, i) => {
        const sampledPts = [];
        for (let seg = 0; seg < ring.length - 1; seg++) {
          const [latA, lngA] = ring[seg];
          const [latB, lngB] = ring[seg + 1];
          for (let s = 0; s <= 8; s++) {
            if (seg > 0 && s === 0) continue;
            const t = s / 8;
            const [x, y, z] = geoToWorld(latA + (latB - latA) * t, lngA + (lngB - lngA) * t);
            sampledPts.push(new THREE.Vector3(x, y + 0.044, z));
          }
        }
        return (
          <Line
            key={i}
            points={sampledPts}
            color="#FFFFFF"
            lineWidth={1}
            transparent
            opacity={0.38}
            dashed
            dashSize={0.2}
            gapSize={0.16}
          />
        );
      })}

      {visibleBarangayLabels.map((dist) => {
        const [x, y, z] = geoToWorld(dist.lat, dist.lng);
        return (
          <Html key={dist.id} position={[x, y + 0.06, z]} center zIndexRange={[2, 0]}>
            <div className="pointer-events-none px-2 py-0.5 rounded-md bg-slate-900/75 text-white/95 border border-white/25 backdrop-blur-sm shadow-sm text-[9px] font-semibold tracking-wider uppercase whitespace-nowrap">
              {dist.name}
            </div>
          </Html>
        );
      })}
    </group>
  );
}

function createOrganicCanopyGeo(radius, seedOffset) {
  const geo = new THREE.IcosahedronGeometry(radius, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const vx = pos.getX(i);
    const vy = pos.getY(i);
    const vz = pos.getZ(i);
    const n =
      Math.sin(vx * 26 + seedOffset) * 0.14 +
      Math.cos(vy * 31 - seedOffset * 1.3) * 0.12 +
      Math.sin(vz * 23 + vy * 17 + seedOffset * 0.7) * 0.13;
    const scale = 1 + n;
    // Slightly flatten bottom of crown for realistic umbrella/tropical canopy
    const yScale = vy < 0 ? 0.76 : 0.95;
    pos.setXYZ(i, vx * scale, vy * scale * yScale, vz * scale);
  }
  geo.computeVertexNormals();
  return geo;
}

const TREE_TRUNK_GEO = new THREE.CylinderGeometry(0.009, 0.018, 0.82, 7);
const TREE_CANOPY_LOWER_GEO = createOrganicCanopyGeo(0.095, 1.7);
const TREE_CANOPY_UPPER_GEO = createOrganicCanopyGeo(0.068, 4.3);

function DioramaTrees({ foliageBumpTex }) {
  const trunkRef = useRef();
  const lowerCanopyRef = useRef();
  const upperCanopyRef = useRef();
  const count = NAGA_TREE_CLUSTERS.length;

  useEffect(() => {
    if (!trunkRef.current || !lowerCanopyRef.current || !upperCanopyRef.current) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const lowerPalette = ['#2B4123', '#344D2A', '#3D5731', '#25371E', '#465F38'];
    const upperPalette = ['#36522C', '#415E35', '#2F4826', '#4B673C', '#38542D'];

    for (let i = 0; i < count; i++) {
      const t = NAGA_TREE_CLUSTERS[i];
      const sc = t.s * 0.78;
      const yaw = ((i * 1.6180339) % 1) * Math.PI * 2;
      const leanX = Math.sin(i * 2.3) * 0.04;
      const leanZ = Math.cos(i * 1.7) * 0.04;

      dummy.position.set(t.x, t.y - 0.32 * sc, t.z);
      dummy.rotation.set(leanX, yaw, leanZ);
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      trunkRef.current.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, t.y + 0.135 * sc, t.z);
      dummy.rotation.set(leanX * 0.5, yaw, leanZ * 0.5);
      dummy.scale.set(sc * 1.06, sc * 0.92, sc * 0.98);
      dummy.updateMatrix();
      lowerCanopyRef.current.setMatrixAt(i, dummy.matrix);
      color.set(lowerPalette[i % lowerPalette.length]);
      lowerCanopyRef.current.setColorAt(i, color);

      dummy.position.set(
        t.x + Math.cos(yaw) * 0.022 * sc,
        t.y + 0.195 * sc,
        t.z + Math.sin(yaw) * 0.022 * sc
      );
      dummy.rotation.set(-leanX * 0.4, yaw + 1.1, leanZ * 0.4);
      dummy.scale.set(sc * 0.96, sc * 0.92, sc * 1.04);
      dummy.updateMatrix();
      upperCanopyRef.current.setMatrixAt(i, dummy.matrix);
      color.set(upperPalette[(i + 2) % upperPalette.length]);
      upperCanopyRef.current.setColorAt(i, color);
    }

    trunkRef.current.instanceMatrix.needsUpdate = true;
    lowerCanopyRef.current.instanceMatrix.needsUpdate = true;
    if (lowerCanopyRef.current.instanceColor) {
      lowerCanopyRef.current.instanceColor.needsUpdate = true;
    }
    upperCanopyRef.current.instanceMatrix.needsUpdate = true;
    if (upperCanopyRef.current.instanceColor) {
      upperCanopyRef.current.instanceColor.needsUpdate = true;
    }
  }, [count]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[TREE_TRUNK_GEO, undefined, count]} castShadow>
        <meshStandardMaterial color="#443325" roughness={0.94} bumpMap={foliageBumpTex} bumpScale={0.008} />
      </instancedMesh>
      <instancedMesh ref={lowerCanopyRef} args={[TREE_CANOPY_LOWER_GEO, undefined, count]} castShadow receiveShadow>
        <meshStandardMaterial color="#FFFFFF" roughness={0.88} bumpMap={foliageBumpTex} bumpScale={0.014} />
      </instancedMesh>
      <instancedMesh ref={upperCanopyRef} args={[TREE_CANOPY_UPPER_GEO, undefined, count]} castShadow receiveShadow>
        <meshStandardMaterial color="#FFFFFF" roughness={0.86} bumpMap={foliageBumpTex} bumpScale={0.014} />
      </instancedMesh>
    </group>
  );
}

function mergeNormalizedParts(parts) {
  const prepared = parts.map((g) => {
    const nonIdx = g.index ? g.toNonIndexed() : g.clone();
    if (!nonIdx.getAttribute('normal')) nonIdx.computeVertexNormals();
    if (!nonIdx.getAttribute('uv')) {
      const cnt = nonIdx.getAttribute('position').count;
      nonIdx.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(cnt * 2), 2));
    }
    return nonIdx;
  });
  return mergeGeometries(prepared, false);
}

// Shared spatial clearance index preventing infrastructure placement on water, bridges, buildings, junctions, or crossing roads
function buildRoadSpatialContext() {
  const allRoadSegsXZ = [];
  NAGA_ROADS_COORDS.forEach((poly, pIdx) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, , az] = geoToWorld(...poly[i]);
      const [bx, , bz] = geoToWorld(...poly[i + 1]);
      allRoadSegsXZ.push({ ax, az, bx, bz, hw: 0.085, curbHw: 0.122, tag: `p-${pIdx}-${i}` });
    }
  });
  NAGA_SECONDARY_STREETS.forEach((poly, sIdx) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, , az] = geoToWorld(...poly[i]);
      const [bx, , bz] = geoToWorld(...poly[i + 1]);
      allRoadSegsXZ.push({ ax, az, bx, bz, hw: 0.060, curbHw: 0.088, tag: `s-${sIdx}-${i}` });
    }
  });
  NAGA_TERTIARY_ROADS.forEach((poly, tIdx) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, , az] = geoToWorld(...poly[i]);
      const [bx, , bz] = geoToWorld(...poly[i + 1]);
      allRoadSegsXZ.push({ ax, az, bx, bz, hw: 0.043, curbHw: 0.064, tag: `t-${tIdx}-${i}` });
    }
  });
  NAGA_LOCAL_STREETS.forEach((poly, lIdx) => {
    for (let i = 0; i < poly.length - 1; i++) {
      const [ax, , az] = geoToWorld(...poly[i]);
      const [bx, , bz] = geoToWorld(...poly[i + 1]);
      allRoadSegsXZ.push({ ax, az, bx, bz, hw: 0.032, curbHw: 0.048, tag: `l-${lIdx}-${i}` });
    }
  });

  const bridgeSpans = NAGA_BRIDGES.map((br) => {
    const [ax, , az] = geoToWorld(...NAGA_ROAD_NODES[br.from]);
    const [bx, , bz] = geoToWorld(...NAGA_ROAD_NODES[br.to]);
    const vx = bx - ax;
    const vz = bz - az;
    const lenSq = vx * vx + vz * vz;
    return { ax, az, bx, bz, vx, vz, lenSq };
  });

  const buildingBoxes = [...NAGA_BUILDING_CLUSTERS, ...NAGA_LANDMARKS].map((b) => {
    const [bx, , bz] = geoToWorld(b.lat, b.lng);
    const rot = b.rot || 0;
    return {
      bx,
      bz,
      halfW: (b.w || 0.25) * 0.54 + 0.022,
      halfD: (b.d || 0.25) * 0.54 + 0.022,
      cos: Math.cos(-rot),
      sin: Math.sin(-rot),
    };
  });
  const [hubX, , hubZ] = geoToWorld(CDRRMO_HUB.lat, CDRRMO_HUB.lng);
  buildingBoxes.push({ bx: hubX + 0.09, bz: hubZ + 0.01, halfW: 0.28, halfD: 0.21, cos: 1, sin: 0 });

  const isInRiverChannel = (px0, pz0) => getTerrainY(px0, pz0) < getUncarvedTerrainY(px0, pz0) - 0.008;

  const isOnBridge = (px0, pz0, extraPerp = 0.21) => {
    for (const br of bridgeSpans) {
      if (br.lenSq < 1e-6) continue;
      const t = ((px0 - br.ax) * br.vx + (pz0 - br.az) * br.vz) / br.lenSq;
      if (t < -0.10 || t > 1.10) continue;
      const d = Math.hypot(px0 - (br.ax + t * br.vx), pz0 - (br.az + t * br.vz));
      if (d < extraPerp) return true;
    }
    return false;
  };

  const isInsideBuilding = (px0, pz0) => {
    for (const obb of buildingBoxes) {
      const dx = px0 - obb.bx;
      const dz = pz0 - obb.bz;
      const lx = dx * obb.cos - dz * obb.sin;
      const lz = dx * obb.sin + dz * obb.cos;
      if (Math.abs(lx) < obb.halfW && Math.abs(lz) < obb.halfD) return true;
    }
    return false;
  };

  const isInsideAnyJunction = (px0, pz0, pad = 0.055) => {
    for (const [k, jNode] of JUNCTION_TOPOLOGY.nodeMap.entries()) {
      if (!ROAD_INTERSECTION_KEYS.shared.has(k)) continue;
      const vx = px0 - jNode.cx;
      const vz = pz0 - jNode.cz;
      if (Math.hypot(vx, vz) < 0.20) return true;
      for (let aIdx = 0; aIdx < jNode.arms.length; aIdx++) {
        const arm = jNode.arms[aIdx];
        const ext = jNode.armExts[aIdx] ?? 0.14;
        const proj = vx * arm.dx + vz * arm.dz;
        if (proj > -0.02 && proj < ext + pad) {
          const perp = Math.abs(vx * -arm.dz + vz * arm.dx);
          if (perp < arm.curbHw + 0.024) return true;
        }
      }
    }
    return false;
  };

  const isValidSidewalkSpot = (px0, pz0, selfTag = '', roadMargin = 0.028) => {
    if (isInRiverChannel(px0, pz0) || isOnBridge(px0, pz0) || isInsideBuilding(px0, pz0)) return false;
    if (isInsideAnyJunction(px0, pz0)) return false;
    for (const seg of allRoadSegsXZ) {
      const vx = seg.bx - seg.ax;
      const vz = seg.bz - seg.az;
      const l2 = vx * vx + vz * vz;
      if (l2 < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((px0 - seg.ax) * vx + (pz0 - seg.az) * vz) / l2));
      const d = Math.hypot(px0 - (seg.ax + t * vx), pz0 - (seg.az + t * vz));
      const minAllowed = seg.tag === selfTag ? seg.hw + 0.016 : seg.hw + roadMargin;
      if (d < minAllowed) return false;
    }
    return true;
  };

  return { isInRiverChannel, isOnBridge, isInsideBuilding, isValidSidewalkSpot };
}

// ============================================================================
// REDESIGNED ASSET 2A: MAIN BIG CANTILEVER TRAFFIC LIGHT (Reference Image 3 Left)
// Origin at sidewalk ground; mast at (0,y,0); arm reaches -X; 3 diamond heads face +Z
// ============================================================================
const MAIN_SIG_SILVER_GEO = (() => {
  const parts = [];
  // Stepped circular base flange + main brushed chrome/galvanized mast
  const baseFlange = new THREE.CylinderGeometry(0.0056, 0.0072, 0.009, 12);
  baseFlange.translate(0, 0.001, 0);
  parts.push(baseFlange);

  const mast = new THREE.CylinderGeometry(0.0032, 0.0044, 0.162, 12);
  mast.translate(0, 0.076, 0);
  parts.push(mast);

  // Upper straight cantilever tension bar reaching over traffic lanes (-X)
  const topArm = new THREE.CylinderGeometry(0.0015, 0.0018, 0.098, 8);
  topArm.rotateZ(Math.PI / 2);
  topArm.translate(-0.049, 0.148, 0);
  parts.push(topArm);

  // Sweeping arched lower cantilever brace (characteristic double-chord truss in Image 3)
  const archCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.104, 0),
    new THREE.Vector3(-0.025, 0.131, 0),
    new THREE.Vector3(-0.056, 0.144, 0),
    new THREE.Vector3(-0.096, 0.144, 0),
  ]);
  parts.push(new THREE.TubeGeometry(archCurve, 14, 0.00145, 8, false));

  // Two vertical truss web struts bridging top & bottom cantilever chords
  const strut1 = new THREE.CylinderGeometry(0.0010, 0.0010, 0.018, 6);
  strut1.translate(-0.026, 0.139, 0);
  parts.push(strut1);

  const strut2 = new THREE.CylinderGeometry(0.0010, 0.0010, 0.007, 6);
  strut2.translate(-0.044, 0.145, 0);
  parts.push(strut2);

  // Three 45-degree rotated diamond metallic outer shrouds along the cantilever arm
  const outerR = 0.0078;
  const innerR = 0.0056;
  const shroudShape = new THREE.Shape();
  shroudShape.moveTo(-outerR, -outerR);
  shroudShape.lineTo(outerR, -outerR);
  shroudShape.lineTo(outerR, outerR);
  shroudShape.lineTo(-outerR, outerR);
  shroudShape.closePath();

  const holePath = new THREE.Path();
  holePath.moveTo(-innerR, -innerR);
  holePath.lineTo(-innerR, innerR);
  holePath.lineTo(innerR, innerR);
  holePath.lineTo(innerR, -innerR);
  holePath.closePath();
  shroudShape.holes.push(holePath);

  [-0.091, -0.071, -0.051].forEach((hx) => {
    const shroud = new THREE.ExtrudeGeometry(shroudShape, {
      depth: 0.0092,
      bevelEnabled: true,
      bevelThickness: 0.0010,
      bevelSize: 0.0009,
      bevelSegments: 2,
    });
    shroud.translate(0, 0, -0.0022);
    shroud.rotateZ(Math.PI / 4);
    shroud.translate(hx, 0.146, 0.001);
    parts.push(shroud);
  });

  return mergeNormalizedParts(parts);
})();

const MAIN_SIG_DARK_GEO = (() => {
  const parts = [];
  // Mast top rubber cap & collar clamps
  const cap = new THREE.CylinderGeometry(0.0036, 0.0036, 0.004, 10);
  cap.translate(0, 0.158, 0);
  parts.push(cap);

  [0.044, 0.088, 0.104, 0.148].forEach((cy) => {
    const collar = new THREE.CylinderGeometry(0.0047, 0.0047, 0.0035, 10);
    collar.translate(0, cy, 0);
    parts.push(collar);
  });

  // Recessed matte dark interiors inside each of the 3 diamond hoods
  [-0.091, -0.071, -0.051].forEach((hx) => {
    const backBox = new THREE.BoxGeometry(0.0124, 0.0124, 0.0068);
    backBox.rotateZ(Math.PI / 4);
    backBox.translate(hx, 0.146, 0.0002);
    parts.push(backBox);
  });

  // Mounting bracket arm for vertical warning plaque
  const signBracket = new THREE.BoxGeometry(0.0065, 0.0022, 0.0022);
  signBracket.translate(-0.0045, 0.088, 0);
  parts.push(signBracket);

  return mergeNormalizedParts(parts);
})();

const MAIN_SIG_BUMPER_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.0049, 0.0053, 0.042, 12);
  g.translate(0, 0.023, 0);
  return g;
})();

const MAIN_SIG_SIGN_GEO = (() => {
  const g = new THREE.BoxGeometry(0.0074, 0.024, 0.0016);
  g.translate(-0.0075, 0.088, 0.0012);
  return g;
})();

const MAIN_SIG_LENS_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.0044, 0.0044, 0.0022, 16);
  g.rotateX(Math.PI / 2);
  return g;
})();

// ============================================================================
// REDESIGNED ASSET 2B: PEDESTRIAN CROSSING PYLON (Reference Image 3 Right Unit)
// Origin at sidewalk ground; slim twin-post kiosk facing +Z across crosswalk
// ============================================================================
const PED_SIG_FRAME_GEO = (() => {
  const parts = [];
  // Brushed metallic twin vertical posts
  [-0.0085, 0.0085].forEach((px) => {
    const rail = new THREE.BoxGeometry(0.0024, 0.073, 0.0042);
    rail.translate(px, 0.0335, 0);
    parts.push(rail);

    const foot = new THREE.BoxGeometry(0.0040, 0.0030, 0.0065);
    foot.translate(px, -0.001, 0);
    parts.push(foot);
  });

  // Top arched shroud crown + center horizontal divider bar
  const topCrown = new THREE.BoxGeometry(0.0198, 0.0044, 0.0096);
  topCrown.translate(0, 0.0705, 0.0006);
  parts.push(topCrown);

  const midBar = new THREE.BoxGeometry(0.0170, 0.0024, 0.0046);
  midBar.translate(0, 0.040, 0);
  parts.push(midBar);

  return mergeNormalizedParts(parts);
})();

const PED_SIG_BODY_GEO = (() => {
  const parts = [];
  const upperBox = new THREE.BoxGeometry(0.0154, 0.0285, 0.0086);
  upperBox.translate(0, 0.0545, 0);
  parts.push(upperBox);

  const hoodEave = new THREE.BoxGeometry(0.0158, 0.0020, 0.0048);
  hoodEave.translate(0, 0.0672, 0.0052);
  parts.push(hoodEave);

  const lowerPlate = new THREE.BoxGeometry(0.0152, 0.037, 0.0034);
  lowerPlate.translate(0, 0.0205, -0.0006);
  parts.push(lowerPlate);

  return mergeNormalizedParts(parts);
})();

const PED_SIG_FACE_GEO = (() => {
  const g = new THREE.PlaneGeometry(0.0148, 0.060);
  g.translate(0, 0.0365, 0.0045);
  return g;
})();

// ============================================================================
// REDESIGNED ASSET 3: MODERN STREET LIGHTS (Reference Image 4 Styles 2 & 1)
// Origin at sidewalk ground; luminaire arms reach along +Z (and -Z for dual-arm)
// ============================================================================
const LAMP1_BASE_GEO = (() => {
  const parts = [];
  const plinth = new THREE.CylinderGeometry(0.0052, 0.0074, 0.014, 4);
  plinth.rotateY(Math.PI / 4);
  plinth.translate(0, 0.004, 0);
  parts.push(plinth);

  const collar = new THREE.CylinderGeometry(0.0038, 0.0052, 0.005, 10);
  collar.translate(0, 0.0125, 0);
  parts.push(collar);
  return mergeNormalizedParts(parts);
})();

const LAMP1_BODY_GEO = (() => {
  const parts = [];
  // Sleek tapered dark anodized shaft
  const shaft = new THREE.CylinderGeometry(0.0019, 0.0036, 0.114, 10);
  shaft.translate(0, 0.070, 0);
  parts.push(shaft);

  // Smooth curved modern arched gooseneck arm (+Z over roadway)
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.114, 0),
    new THREE.Vector3(0, 0.126, 0.009),
    new THREE.Vector3(0, 0.132, 0.025),
    new THREE.Vector3(0, 0.133, 0.037),
  ]);
  parts.push(new THREE.TubeGeometry(armCurve, 12, 0.00155, 8, false));

  // Signature curved gusset strut beneath the neck curve (Reference Image 4 #2)
  const gussetCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.098, 0.0018),
    new THREE.Vector3(0, 0.118, 0.008),
    new THREE.Vector3(0, 0.129, 0.020),
  ]);
  parts.push(new THREE.TubeGeometry(gussetCurve, 8, 0.0009, 6, false));

  // Aerodynamic ultra-slim LED cobra luminaire head
  const head = new THREE.BoxGeometry(0.0088, 0.0028, 0.0195);
  head.rotateX(-0.07);
  head.translate(0, 0.1335, 0.042);
  parts.push(head);

  return mergeNormalizedParts(parts);
})();

const LAMP1_LENS_GEO = (() => {
  const g = new THREE.BoxGeometry(0.0058, 0.0014, 0.0135);
  g.rotateX(-0.07);
  g.translate(0, 0.1320, 0.0425);
  return g;
})();

// Twin-Arm Modern Boulevard LED Light (Reference Image 4 Style #1) for Civic Plazas
const LAMP2_BODY_GEO = (() => {
  const parts = [];
  const shaft = new THREE.CylinderGeometry(0.0021, 0.0039, 0.120, 10);
  shaft.translate(0, 0.073, 0);
  parts.push(shaft);

  [-1, 1].forEach((dirSign) => {
    const armCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.116, 0),
      new THREE.Vector3(0, 0.128, dirSign * 0.010),
      new THREE.Vector3(0, 0.134, dirSign * 0.026),
      new THREE.Vector3(0, 0.135, dirSign * 0.038),
    ]);
    parts.push(new THREE.TubeGeometry(armCurve, 12, 0.00155, 8, false));

    const gussetCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.100, dirSign * 0.002),
      new THREE.Vector3(0, 0.120, dirSign * 0.009),
      new THREE.Vector3(0, 0.131, dirSign * 0.021),
    ]);
    parts.push(new THREE.TubeGeometry(gussetCurve, 8, 0.0009, 6, false));

    const head = new THREE.BoxGeometry(0.0088, 0.0028, 0.0195);
    head.rotateX(dirSign * -0.07);
    head.translate(0, 0.1355, dirSign * 0.043);
    parts.push(head);
  });

  const crown = new THREE.CylinderGeometry(0.0026, 0.0026, 0.004, 8);
  crown.translate(0, 0.134, 0);
  parts.push(crown);

  return mergeNormalizedParts(parts);
})();

const LAMP2_LENS_GEO = (() => {
  const parts = [];
  [-1, 1].forEach((dirSign) => {
    const lens = new THREE.BoxGeometry(0.0058, 0.0014, 0.0135);
    lens.rotateX(dirSign * -0.07);
    lens.translate(0, 0.1340, dirSign * 0.0435);
    parts.push(lens);
  });
  return mergeNormalizedParts(parts);
})();

function RoadsideInfrastructureInstanced({ textures, spatial: sharedSpatial, polePositions = [] }) {
  const mainSilverRef = useRef();
  const mainDarkRef = useRef();
  const mainBumperRef = useRef();
  const mainSignRef = useRef();
  const litRedRef = useRef();
  const litAmberRef = useRef();
  const litGreenRef = useRef();
  const dimRedRef = useRef();
  const dimAmberRef = useRef();
  const dimGreenRef = useRef();

  const pedFrameRef = useRef();
  const pedBodyRef = useRef();
  const pedGreenFaceRef = useRef();
  const pedRedFaceRef = useRef();

  const lamp1BaseRef = useRef();
  const lamp1BodyRef = useRef();
  const lamp1LensRef = useRef();
  const lamp2BaseRef = useRef();
  const lamp2BodyRef = useRef();
  const lamp2LensRef = useRef();

  const { mainSignals, pedSignals, lamps1, lamps2 } = useMemo(() => {
    const spatial = sharedSpatial || buildRoadSpatialContext();
    const mainList = [];
    const pedList = [];
    const lamp1List = [];
    const lamp2List = [];

    const isOnOtherArmAsphalt = (px0, pz0, selfIdx, arms, cx, cz) => {
      for (let j = 0; j < arms.length; j++) {
        if (j === selfIdx) continue;
        const other = arms[j];
        const vx = px0 - cx;
        const vz = pz0 - cz;
        const proj = vx * other.dx + vz * other.dz;
        if (proj < -0.02 || proj > other.maxLen) continue;
        const perp = Math.abs(vx * -other.dz + vz * other.dx);
        if (perp < other.asphaltHw + 0.016) return true;
      }
      return false;
    };

    const isTooClose = (list, x, z, minD) =>
      list.some((item) => Math.hypot(item.x - x, item.z - z) < minD);

    // 1. Main Cantilever Traffic Lights (2) & Crosswalk Pedestrian Signal Pylons (1)
    // Prioritize major 4+ way intersections first, spaced >= 1.05 units apart to avoid unrealistic clutter
    const signalCandidates = [];
    for (const [k, node] of JUNCTION_TOPOLOGY.nodeMap.entries()) {
      if (!ROAD_INTERSECTION_KEYS.shared.has(k) || node.isBridgeEnd || node.arms.length < 3) continue;
      const primaryArmCount = node.arms.filter((a) => a.asphaltHw >= 0.075 && a.maxLen >= 0.65).length;
      if (primaryArmCount < 2) continue;
      signalCandidates.push(node);
    }
    signalCandidates.sort((a, b) => b.arms.length - a.arms.length);

    const signalizedCenters = [];
    let jctIdx = 0;
    for (const { cx, cz, arms, armExts } of signalCandidates) {
      if (signalizedCenters.some((c) => Math.hypot(c.x - cx, c.z - cz) < 1.55)) continue;
      signalizedCenters.push({ x: cx, z: cz });
      jctIdx++;
      let placedMainAtJct = 0;
      const maxMainAtJct = arms.length >= 4 ? 2 : 1;

      for (let i = 0; i < arms.length; i++) {
        const a = arms[i];
        const ext = armExts[i];
        if (ext < 0.085 || a.asphaltHw < 0.075) continue;

        const hasCrosswalk = a.maxLen >= Math.max(0.55, ext * 2.35);
        // Right-hand curb vector for traffic driving inward (-a.dx, -a.dz): (+a.dz, -a.dx)
        const rightX = a.dz;
        const rightZ = -a.dx;
        const sideDist = a.asphaltHw + 0.022;
        const px = -a.dz;
        const pz = a.dx;

        // Alternating realistic phase per intersection leg
        const phaseState = (i + jctIdx) % 2 === 0 ? 'green' : 'red';

        // 1A. Main Big Overhead Cantilever Traffic Light (1-2 per major arterial hub, well spaced)
        if (placedMainAtJct < maxMainAtJct && a.maxLen >= 0.65) {
          for (const pushBack of [0.036, 0.064, 0.092]) {
            const along = ext + pushBack;
            if (along > a.maxLen * 0.45) continue;
            const sx = cx + a.dx * along + rightX * sideDist;
            const sz = cz + a.dz * along + rightZ * sideDist;
            if (
              !isOnOtherArmAsphalt(sx, sz, i, arms, cx, cz) &&
              !spatial.isInRiverChannel(sx, sz) &&
              !spatial.isOnBridge(sx, sz) &&
              !spatial.isInsideBuilding(sx, sz) &&
              !isTooClose(mainList, sx, sz, 0.40)
            ) {
              const sy = getTerrainY(sx, sz) + 0.035;
              // Local +Z faces approaching drivers (+a.dx, +a.dz); local -X reaches left over road lanes
              const yaw = Math.atan2(a.dx, a.dz);
              mainList.push({ x: sx, y: sy, z: sz, yaw, state: phaseState });
              placedMainAtJct++;
              break;
            }
          }
        }

        // 1B. Pedestrian Crossing Signal Pylon (Reference Image 3 Right) flanking signalized crosswalks
        if (hasCrosswalk) {
          const alongPed = ext - 0.018;
          for (const side of [1, -1]) {
            const bx = cx + a.dx * alongPed + px * side * sideDist;
            const bz = cz + a.dz * alongPed + pz * side * sideDist;
            if (
              !isOnOtherArmAsphalt(bx, bz, i, arms, cx, cz) &&
              !spatial.isInRiverChannel(bx, bz) &&
              !spatial.isOnBridge(bx, bz) &&
              !spatial.isInsideBuilding(bx, bz) &&
              !isTooClose(mainList, bx, bz, 0.035) &&
              !isTooClose(pedList, bx, bz, 0.22)
            ) {
              const by = getTerrainY(bx, bz) + 0.035;
              // Face directly inward across the pedestrian zebra stripes toward the opposite curb
              const yaw = Math.atan2(-px * side, -pz * side);
              // Walk signal is green when vehicles on this crossing leg are stopped (red)
              const walkGreen = phaseState !== 'green';
              pedList.push({ x: bx, y: by, z: bz, yaw, walkGreen });
              break;
            }
          }
        }
      }
    }

    // 2A. Modern Single-Arm Tapered LED Streetlights along Primary & Main Secondary Roads
    NAGA_ROADS_COORDS.forEach((poly, pIdx) => {
      for (let i = 0; i < poly.length - 1; i++) {
        const [ax, , az] = geoToWorld(...poly[i]);
        const [bx, , bz] = geoToWorld(...poly[i + 1]);
        const dx = bx - ax;
        const dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 0.60) continue;
        const ux = dx / len;
        const uz = dz / len;
        const px = -uz;
        const pz = ux;
        const selfTag = `p-${pIdx}-${i}`;
        const steps = Math.floor((len - 0.56) / 0.62);
        for (let s = 0; s <= steps; s++) {
          const d = 0.28 + s * 0.62;
          if (d > len - 0.28) break;
          const prefSide = (s + pIdx) % 2 === 0 ? 1 : -1;
          let placedLamp = false;
          for (const dd of [0, 0.08, -0.08]) {
            const dTry = d + dd;
            if (dTry < 0.26 || dTry > len - 0.26) continue;
            for (const side of [prefSide, -prefSide]) {
              const lx = ax + ux * dTry + px * side * 0.106;
              const lz = az + uz * dTry + pz * side * 0.106;
              if (!spatial.isValidSidewalkSpot(lx, lz, selfTag, 0.024)) continue;
              if (isTooClose(lamp1List, lx, lz, 0.28)) continue;
              if (isTooClose(polePositions, lx, lz, 0.055)) continue;
              const ly = getTerrainY(lx, lz) + 0.035;
              const yaw = Math.atan2(-px * side, -pz * side);
              lamp1List.push({ x: lx, y: ly, z: lz, yaw });
              placedLamp = true;
              break;
            }
            if (placedLamp) break;
          }
        }
      }
    });

    // Subtle secondary boulevard streetlights on longer collector avenues
    NAGA_SECONDARY_STREETS.forEach((poly, sIdx) => {
      for (let i = 0; i < poly.length - 1; i++) {
        const [ax, , az] = geoToWorld(...poly[i]);
        const [bx, , bz] = geoToWorld(...poly[i + 1]);
        const dx = bx - ax;
        const dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 0.85) continue;
        const ux = dx / len;
        const uz = dz / len;
        const px = -uz;
        const pz = ux;
        const selfTag = `s-${sIdx}-${i}`;
        const d = len * 0.5;
        const prefSide = sIdx % 2 === 0 ? 1 : -1;
        for (const side of [prefSide, -prefSide]) {
          const lx = ax + ux * d + px * side * 0.072;
          const lz = az + uz * d + pz * side * 0.072;
          if (!spatial.isValidSidewalkSpot(lx, lz, selfTag, 0.020)) continue;
          if (isTooClose(lamp1List, lx, lz, 0.30)) continue;
          if (isTooClose(polePositions, lx, lz, 0.055)) continue;
          const ly = getTerrainY(lx, lz) + 0.035;
          const yaw = Math.atan2(-px * side, -pz * side);
          lamp1List.push({ x: lx, y: ly, z: lz, yaw });
          break;
        }
      }
    });

    // Bridge Deck Walkway Streetlights mounted cleanly along river crossings
    NAGA_BRIDGES.forEach((br, bIdx) => {
      const [ax, , az] = geoToWorld(...NAGA_ROAD_NODES[br.from]);
      const [bx, , bz] = geoToWorld(...NAGA_ROAD_NODES[br.to]);
      const dx = bx - ax;
      const dz = bz - az;
      const spanLen = Math.hypot(dx, dz);
      if (spanLen < 0.5) return;
      const ux = dx / spanLen;
      const uz = dz / spanLen;
      const px = -uz;
      const pz = ux;
      [0.30, 0.70].forEach((t, kIdx) => {
        const side = (bIdx + kIdx) % 2 === 0 ? 1 : -1;
        const lx = ax + dx * t + px * side * 0.097;
        const lz = az + dz * t + pz * side * 0.097;
        const ly = bridgeProfileY(t, getTerrainY(lx, lz)) - 0.002;
        const yaw = Math.atan2(-px * side, -pz * side);
        lamp1List.push({ x: lx, y: ly, z: lz, yaw });
      });
    });

    // 2B. Modern Double-Arm Tapered LED Boulevard Standards on Civic Plaza Forecourts (Image 4 #1)
    NAGA_LANDMARKS.forEach((lm) => {
      if (lm.type !== 'hall' && lm.type !== 'university' && lm.type !== 'cathedral') return;
      const [bx, , bz] = geoToWorld(lm.lat, lm.lng);
      const rot = lm.rot || 0;
      const fwdX = Math.sin(rot);
      const fwdZ = Math.cos(rot);
      const rightX = Math.cos(rot);
      const rightZ = -Math.sin(rot);
      const halfW = (lm.w || 0.35) * 0.50;
      const halfD = (lm.d || 0.35) * 0.50;
      [-1, 1].forEach((side) => {
        const px0 = bx + fwdX * (halfD + 0.03) + rightX * side * (halfW * 0.72);
        const pz0 = bz + fwdZ * (halfD + 0.03) + rightZ * side * (halfW * 0.72);
        if (spatial.isValidSidewalkSpot(px0, pz0, '', 0.030)) {
          lamp2List.push({
            x: px0,
            y: getTerrainY(px0, pz0) + 0.016,
            z: pz0,
            yaw: rot,
          });
        }
      });
    });

    return {
      mainSignals: mainList,
      pedSignals: pedList,
      lamps1: lamp1List,
      lamps2: lamp2List,
    };
  }, []);

  useEffect(() => {
    const dummy = new THREE.Object3D();

    // Populate Main Big Cantilever Traffic Signals & All 3 Diamond Lenses
    if (mainSignals.length > 0 && mainSilverRef.current) {
      mainSignals.forEach((s, i) => {
        dummy.position.set(s.x, s.y, s.z);
        dummy.rotation.set(0, s.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mainSilverRef.current.setMatrixAt(i, dummy.matrix);
        mainDarkRef.current.setMatrixAt(i, dummy.matrix);
        mainBumperRef.current.setMatrixAt(i, dummy.matrix);
        mainSignRef.current.setMatrixAt(i, dummy.matrix);

        // Local lens centers inside the 3 45-deg diamond shrouds (x = -0.091 Red, -0.071 Amber, -0.051 Green)
        const cosY = Math.cos(s.yaw);
        const sinY = Math.sin(s.yaw);
        const setLens = (ref, lx, active) => {
          if (!ref) return;
          const lz = 0.0046;
          const ly = 0.146;
          dummy.position.set(s.x + lx * cosY + lz * sinY, s.y + ly, s.z - lx * sinY + lz * cosY);
          dummy.rotation.set(0, s.yaw, 0);
          dummy.scale.set(active ? 1 : 0, active ? 1 : 0, active ? 1 : 0);
          dummy.updateMatrix();
          ref.setMatrixAt(i, dummy.matrix);
        };

        const isRed = s.state === 'red';
        const isAmber = s.state === 'amber';
        const isGreen = s.state === 'green';

        setLens(litRedRef.current, -0.091, isRed);
        setLens(dimRedRef.current, -0.091, !isRed);
        setLens(litAmberRef.current, -0.071, isAmber);
        setLens(dimAmberRef.current, -0.071, !isAmber);
        setLens(litGreenRef.current, -0.051, isGreen);
        setLens(dimGreenRef.current, -0.051, !isGreen);
      });

      [
        mainSilverRef,
        mainDarkRef,
        mainBumperRef,
        mainSignRef,
        litRedRef,
        litAmberRef,
        litGreenRef,
        dimRedRef,
        dimAmberRef,
        dimGreenRef,
      ].forEach((ref) => {
        if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
      });
    }

    // Populate Pedestrian Crossing Signal Pylons
    if (pedSignals.length > 0 && pedFrameRef.current) {
      pedSignals.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        pedFrameRef.current.setMatrixAt(i, dummy.matrix);
        pedBodyRef.current.setMatrixAt(i, dummy.matrix);

        dummy.scale.set(p.walkGreen ? 1 : 0, p.walkGreen ? 1 : 0, p.walkGreen ? 1 : 0);
        dummy.updateMatrix();
        pedGreenFaceRef.current.setMatrixAt(i, dummy.matrix);

        dummy.scale.set(p.walkGreen ? 0 : 1, p.walkGreen ? 0 : 1, p.walkGreen ? 0 : 1);
        dummy.updateMatrix();
        pedRedFaceRef.current.setMatrixAt(i, dummy.matrix);
      });
      [pedFrameRef, pedBodyRef, pedGreenFaceRef, pedRedFaceRef].forEach((ref) => {
        if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
      });
    }

    // Populate Modern Single-Arm Streetlights
    if (lamps1.length > 0 && lamp1BaseRef.current) {
      lamps1.forEach((l, i) => {
        dummy.position.set(l.x, l.y, l.z);
        dummy.rotation.set(0, l.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        lamp1BaseRef.current.setMatrixAt(i, dummy.matrix);
        lamp1BodyRef.current.setMatrixAt(i, dummy.matrix);
        lamp1LensRef.current.setMatrixAt(i, dummy.matrix);
      });
      [lamp1BaseRef, lamp1BodyRef, lamp1LensRef].forEach((ref) => {
        if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
      });
    }

    // Populate Modern Double-Arm Civic Boulevard Streetlights
    if (lamps2.length > 0 && lamp2BaseRef.current) {
      lamps2.forEach((l, i) => {
        dummy.position.set(l.x, l.y, l.z);
        dummy.rotation.set(0, l.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        lamp2BaseRef.current.setMatrixAt(i, dummy.matrix);
        lamp2BodyRef.current.setMatrixAt(i, dummy.matrix);
        lamp2LensRef.current.setMatrixAt(i, dummy.matrix);
      });
      [lamp2BaseRef, lamp2BodyRef, lamp2LensRef].forEach((ref) => {
        if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
      });
    }
  }, [mainSignals, pedSignals, lamps1, lamps2]);

  return (
    <group>
      {mainSignals.length > 0 && (
        <>
          <instancedMesh ref={mainSilverRef} args={[MAIN_SIG_SILVER_GEO, undefined, mainSignals.length]} castShadow>
            <meshStandardMaterial color="#C8D0D8" metalness={0.62} roughness={0.26} envMapIntensity={1.45} />
          </instancedMesh>
          <instancedMesh ref={mainDarkRef} args={[MAIN_SIG_DARK_GEO, undefined, mainSignals.length]} castShadow>
            <meshStandardMaterial color="#1A1E24" metalness={0.25} roughness={0.55} />
          </instancedMesh>
          <instancedMesh ref={mainBumperRef} args={[MAIN_SIG_BUMPER_GEO, undefined, mainSignals.length]}>
            <meshStandardMaterial map={textures?.signalBumperTex} roughness={0.38} metalness={0.12} />
          </instancedMesh>
          <instancedMesh ref={mainSignRef} args={[MAIN_SIG_SIGN_GEO, undefined, mainSignals.length]}>
            <meshStandardMaterial map={textures?.trafficSignRedTex} roughness={0.42} metalness={0.15} />
          </instancedMesh>
          <instancedMesh ref={litRedRef} args={[MAIN_SIG_LENS_GEO, undefined, mainSignals.length]}>
            <meshStandardMaterial color="#FF4040" emissive="#EF4444" emissiveIntensity={1.65} roughness={0.15} />
          </instancedMesh>
          <instancedMesh ref={litAmberRef} args={[MAIN_SIG_LENS_GEO, undefined, mainSignals.length]}>
            <meshStandardMaterial color="#FBBF24" emissive="#F59E0B" emissiveIntensity={1.65} roughness={0.15} />
          </instancedMesh>
          <instancedMesh ref={litGreenRef} args={[MAIN_SIG_LENS_GEO, undefined, mainSignals.length]}>
            <meshStandardMaterial color="#22FF66" emissive="#16FF55" emissiveIntensity={1.75} roughness={0.15} />
          </instancedMesh>
          <instancedMesh ref={dimRedRef} args={[MAIN_SIG_LENS_GEO, undefined, mainSignals.length]}>
            <meshStandardMaterial color="#451010" roughness={0.25} metalness={0.1} />
          </instancedMesh>
          <instancedMesh ref={dimAmberRef} args={[MAIN_SIG_LENS_GEO, undefined, mainSignals.length]}>
            <meshStandardMaterial color="#4A2E08" roughness={0.25} metalness={0.1} />
          </instancedMesh>
          <instancedMesh ref={dimGreenRef} args={[MAIN_SIG_LENS_GEO, undefined, mainSignals.length]}>
            <meshStandardMaterial color="#0A3319" roughness={0.25} metalness={0.1} />
          </instancedMesh>
        </>
      )}

      {pedSignals.length > 0 && (
        <>
          <instancedMesh ref={pedFrameRef} args={[PED_SIG_FRAME_GEO, undefined, pedSignals.length]} castShadow>
            <meshStandardMaterial color="#C6C0B4" metalness={0.55} roughness={0.32} envMapIntensity={1.3} />
          </instancedMesh>
          <instancedMesh ref={pedBodyRef} args={[PED_SIG_BODY_GEO, undefined, pedSignals.length]} castShadow>
            <meshStandardMaterial color="#1F242C" metalness={0.35} roughness={0.48} />
          </instancedMesh>
          <instancedMesh ref={pedGreenFaceRef} args={[PED_SIG_FACE_GEO, undefined, pedSignals.length]}>
            <meshStandardMaterial
              map={textures?.pedSignalGreenTex}
              emissiveMap={textures?.pedSignalGreenTex}
              emissive="#FFFFFF"
              emissiveIntensity={0.42}
              roughness={0.22}
            />
          </instancedMesh>
          <instancedMesh ref={pedRedFaceRef} args={[PED_SIG_FACE_GEO, undefined, pedSignals.length]}>
            <meshStandardMaterial
              map={textures?.pedSignalRedTex}
              emissiveMap={textures?.pedSignalRedTex}
              emissive="#FFFFFF"
              emissiveIntensity={0.42}
              roughness={0.22}
            />
          </instancedMesh>
        </>
      )}

      {lamps1.length > 0 && (
        <>
          <instancedMesh ref={lamp1BaseRef} args={[LAMP1_BASE_GEO, undefined, lamps1.length]} castShadow>
            <meshStandardMaterial color="#9CA3AF" metalness={0.15} roughness={0.72} />
          </instancedMesh>
          <instancedMesh ref={lamp1BodyRef} args={[LAMP1_BODY_GEO, undefined, lamps1.length]} castShadow>
            <meshStandardMaterial color="#6D7682" metalness={0.52} roughness={0.32} envMapIntensity={1.35} />
          </instancedMesh>
          <instancedMesh ref={lamp1LensRef} args={[LAMP1_LENS_GEO, undefined, lamps1.length]}>
            <meshStandardMaterial color="#FFFBEB" emissive="#FFE599" emissiveIntensity={0.52} roughness={0.18} />
          </instancedMesh>
        </>
      )}

      {lamps2.length > 0 && (
        <>
          <instancedMesh ref={lamp2BaseRef} args={[LAMP1_BASE_GEO, undefined, lamps2.length]} castShadow>
            <meshStandardMaterial color="#9CA3AF" metalness={0.15} roughness={0.72} />
          </instancedMesh>
          <instancedMesh ref={lamp2BodyRef} args={[LAMP2_BODY_GEO, undefined, lamps2.length]} castShadow>
            <meshStandardMaterial color="#6D7682" metalness={0.52} roughness={0.32} envMapIntensity={1.35} />
          </instancedMesh>
          <instancedMesh ref={lamp2LensRef} args={[LAMP2_LENS_GEO, undefined, lamps2.length]}>
            <meshStandardMaterial color="#FFFBEB" emissive="#FFE599" emissiveIntensity={0.52} roughness={0.18} />
          </instancedMesh>
        </>
      )}
    </group>
  );
}

// ============================================================================
// REDESIGNED ASSET 1: HYPERREALISTIC WIRED UTILITY POLES (Reference Images 1 & 2)
// Origin at ground base; local X = crossarm width; local Z = conductor line axis
// ============================================================================
const POLE_SHAFT_GEO = (() => {
  const g = new THREE.CylinderGeometry(0.0038, 0.0066, 0.258, 12);
  g.translate(0, 0.121, 0); // Spans y = -0.008 .. +0.250
  return g;
})();

const POLE_ARMS_UPPER_GEO = (() => {
  const parts = [];
  [-0.0052, 0.0052].forEach((zOff) => {
    const beam = new THREE.BoxGeometry(0.078, 0.0044, 0.0036);
    beam.translate(0, 0.234, zOff);
    parts.push(beam);
  });
  return mergeNormalizedParts(parts);
})();

const POLE_ARMS_LOWER_GEO = (() => {
  const parts = [];
  [-0.0048, 0.0048].forEach((zOff) => {
    const beam = new THREE.BoxGeometry(0.058, 0.0038, 0.0032);
    beam.translate(0, 0.188, zOff);
    parts.push(beam);
  });
  return mergeNormalizedParts(parts);
})();

const makeRibbedInsulatorGeo = (ribCount = 4, length = 0.0125) => {
  const pts = [new THREE.Vector2(0.0010, 0)];
  const step = length / ribCount;
  for (let i = 0; i < ribCount; i++) {
    const y0 = i * step;
    pts.push(new THREE.Vector2(0.0030, y0 + step * 0.35));
    pts.push(new THREE.Vector2(0.0015, y0 + step * 0.85));
  }
  pts.push(new THREE.Vector2(0.0010, length));
  return new THREE.LatheGeometry(pts, 10);
};

const POLE_STEEL_BASE_GEO = (() => {
  const parts = [];
  // Reinforced base sleeve + 4 height clamping bands
  const sleeve = new THREE.CylinderGeometry(0.0072, 0.0076, 0.020, 10);
  sleeve.translate(0, 0.008, 0);
  parts.push(sleeve);

  [0.068, 0.132, 0.188, 0.234].forEach((bh, idx) => {
    const r = 0.0064 - idx * 0.0005;
    const band = new THREE.CylinderGeometry(r, r, 0.0036, 10);
    band.translate(0, bh, 0);
    parts.push(band);
  });

  // Top U-bayonet neutral wire bracket rising above timber pole apex (Reference Image 1)
  [-0.0036, 0.0036].forEach((bx) => {
    const ear = new THREE.BoxGeometry(0.0016, 0.015, 0.0032);
    ear.translate(bx, 0.254, 0);
    parts.push(ear);
  });

  // Upper V-braces + 6 horizontal clevis mounting pins
  [-1, 1].forEach((dir) => {
    const brace = new THREE.BoxGeometry(0.029, 0.0018, 0.0018);
    brace.rotateZ(dir * 0.68);
    brace.translate(dir * 0.011, 0.223, 0);
    parts.push(brace);
  });
  [-0.030, 0, 0.030].forEach((lat) => {
    const pin = new THREE.CylinderGeometry(0.0010, 0.0010, 0.018, 6);
    pin.rotateX(Math.PI / 2);
    pin.translate(lat, 0.234, 0);
    parts.push(pin);
  });

  return mergeNormalizedParts(parts);
})();

const POLE_STEEL_LOWER_GEO = (() => {
  const parts = [];
  [-1, 1].forEach((dir) => {
    const brace = new THREE.BoxGeometry(0.023, 0.0016, 0.0016);
    brace.rotateZ(dir * 0.68);
    brace.translate(dir * 0.009, 0.178, 0);
    parts.push(brace);

    // Fuse cutout hanger brackets beneath lower crossarm (Reference Image 2)
    const cutoutArm = new THREE.BoxGeometry(0.0016, 0.012, 0.0016);
    cutoutArm.rotateX(0.55);
    cutoutArm.translate(dir * 0.019, 0.179, 0.006);
    parts.push(cutoutArm);
  });
  [-0.021, 0.021].forEach((lat) => {
    const pin = new THREE.CylinderGeometry(0.0009, 0.0009, 0.015, 6);
    pin.rotateX(Math.PI / 2);
    pin.translate(lat, 0.188, 0);
    parts.push(pin);
  });
  return mergeNormalizedParts(parts);
})();

const POLE_INS_UPPER_GEO = (() => {
  const parts = [];
  // Top vertical neutral pin insulator inside bayonet
  const topPin = makeRibbedInsulatorGeo(3, 0.009);
  topPin.translate(0, 0.256, 0);
  parts.push(topPin);

  // 6 horizontal dead-end ribbed ceramic disk insulator strings (3 front +Z, 3 back -Z)
  [-0.030, 0, 0.030].forEach((lat) => {
    [-1, 1].forEach((zSign) => {
      const disk = makeRibbedInsulatorGeo(4, 0.013);
      disk.rotateX((zSign * Math.PI) / 2);
      disk.translate(lat, 0.234, zSign * 0.0085);
      parts.push(disk);
    });
  });

  return mergeNormalizedParts(parts);
})();

const POLE_INS_LOWER_GEO = (() => {
  const parts = [];
  [-0.021, 0.021].forEach((lat) => {
    [-1, 1].forEach((zSign) => {
      const disk = makeRibbedInsulatorGeo(3, 0.010);
      disk.rotateX((zSign * Math.PI) / 2);
      disk.translate(lat, 0.188, zSign * 0.0075);
      parts.push(disk);
    });
  });
  // Angled fuse cutout porcelain bodies under lower crossarm
  [-0.019, 0.019].forEach((lat) => {
    const cutout = makeRibbedInsulatorGeo(3, 0.010);
    cutout.rotateX(Math.PI + 0.55);
    cutout.translate(lat, 0.182, 0.009);
    parts.push(cutout);
  });
  return mergeNormalizedParts(parts);
})();

const POLE_TRANSFORMER_GEO = (() => {
  const parts = [];
  const tank = new THREE.CylinderGeometry(0.0105, 0.0105, 0.033, 14);
  tank.translate(0.0155, 0.132, 0);
  parts.push(tank);

  const topRim = new THREE.CylinderGeometry(0.0114, 0.0114, 0.003, 14);
  topRim.translate(0.0155, 0.1485, 0);
  parts.push(topRim);

  const botRim = new THREE.CylinderGeometry(0.0112, 0.0112, 0.0025, 14);
  botRim.translate(0.0155, 0.116, 0);
  parts.push(botRim);

  const bracket = new THREE.BoxGeometry(0.012, 0.022, 0.006);
  bracket.translate(0.007, 0.132, 0);
  parts.push(bracket);
  return mergeNormalizedParts(parts);
})();

const POLE_TRANS_BUSH_GEO = (() => {
  const parts = [];
  // Tall HV vertical porcelain bushing on left edge + secondary LV bushings on side
  const hv = makeRibbedInsulatorGeo(4, 0.012);
  hv.translate(0.020, 0.149, 0.003);
  parts.push(hv);

  [-0.0035, 0.0035].forEach((bz) => {
    const lv = makeRibbedInsulatorGeo(2, 0.0065);
    lv.translate(0.013, 0.149, bz);
    parts.push(lv);
  });
  return mergeNormalizedParts(parts);
})();

const POLE_BOX_GEO = (() => {
  const parts = [];
  const box = new THREE.BoxGeometry(0.0095, 0.015, 0.009);
  box.translate(-0.0095, 0.156, 0);
  parts.push(box);

  const strap = new THREE.CylinderGeometry(0.0058, 0.0058, 0.0035, 10);
  strap.translate(0, 0.156, 0);
  parts.push(strap);
  return mergeNormalizedParts(parts);
})();

// Append a 4-sided 3D extruded overhead conductor cable mesh between pStart -> pEnd with catenary sag
function appendCableSpan(positions, normals, p0, p1, sag = 0.012, radius = 0.00072, segs = 7) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const dip = 4 * sag * t * (1 - t);
    pts.push(
      new THREE.Vector3(
        p0.x + (p1.x - p0.x) * t,
        p0.y + (p1.y - p0.y) * t - dip,
        p0.z + (p1.z - p0.z) * t
      )
    );
  }

  const rings = [];
  const tVec = new THREE.Vector3();
  const ref = new THREE.Vector3();
  const binorm = new THREE.Vector3();
  const norm = new THREE.Vector3();

  for (let i = 0; i <= segs; i++) {
    if (i === 0) tVec.subVectors(pts[1], pts[0]);
    else if (i === segs) tVec.subVectors(pts[segs], pts[segs - 1]);
    else tVec.subVectors(pts[i + 1], pts[i - 1]);
    if (tVec.lengthSq() < 1e-10) tVec.set(0, 0, 1);
    else tVec.normalize();

    ref.set(0, 1, 0);
    if (Math.abs(tVec.y) > 0.92) ref.set(1, 0, 0);
    binorm.crossVectors(tVec, ref).normalize();
    norm.crossVectors(binorm, tVec).normalize();

    const ring = [];
    for (let s = 0; s < 4; s++) {
      const a = (s * Math.PI) / 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const nx = norm.x * ca + binorm.x * sa;
      const ny = norm.y * ca + binorm.y * sa;
      const nz = norm.z * ca + binorm.z * sa;
      ring.push({
        pos: [pts[i].x + nx * radius, pts[i].y + ny * radius, pts[i].z + nz * radius],
        nrm: [nx, ny, nz],
      });
    }
    rings.push(ring);
  }

  for (let i = 0; i < segs; i++) {
    const r0 = rings[i];
    const r1 = rings[i + 1];
    for (let s = 0; s < 4; s++) {
      const sNext = (s + 1) % 4;
      const a = r0[s];
      const b = r0[sNext];
      const c = r1[sNext];
      const d = r1[s];
      positions.push(...a.pos, ...b.pos, ...c.pos, ...a.pos, ...c.pos, ...d.pos);
      normals.push(...a.nrm, ...b.nrm, ...c.nrm, ...a.nrm, ...c.nrm, ...d.nrm);
    }
  }
}

function computeElectricalPoleNetwork(spatial) {
    const rawPoles = [];
    const wireEdges = []; // pairs of pole indices in rawPoles

    // Build utility poles along continuous primary corridors with full sidewalk clearance
    NAGA_ROADS_COORDS.forEach((poly, pIdx) => {
      const side = pIdx % 2 === 0 ? -1 : 1;
      const segPoleGroups = [];

      for (let i = 0; i < poly.length - 1; i++) {
        const [ax, , az] = geoToWorld(...poly[i]);
        const [bx, , bz] = geoToWorld(...poly[i + 1]);
        const dx = bx - ax;
        const dz = bz - az;
        const len = Math.hypot(dx, dz);
        if (len < 0.62) {
          segPoleGroups.push(null);
          continue;
        }
        const ux = dx / len;
        const uz = dz / len;
        const px = -uz;
        const pz = ux;
        const selfTag = `p-${pIdx}-${i}`;

        const spanStep = 0.70;
        const count = Math.floor((len - 0.50) / spanStep) + 1;
        const currentSegIndices = [];

        for (let s = 0; s < count; s++) {
          const d = 0.25 + s * spanStep;
          if (d > len - 0.25) break;
          let x = null, z = null;
          for (const dd of [0, 0.08, -0.08]) {
            const dTry = d + dd;
            if (dTry < 0.24 || dTry > len - 0.24) continue;
            const cx = ax + ux * dTry + px * side * 0.114;
            const cz = az + uz * dTry + pz * side * 0.114;
            if (!spatial.isValidSidewalkSpot(cx, cz, selfTag, 0.024)) continue;
            if (rawPoles.some((rp) => Math.hypot(rp.x - cx, rp.z - cz) < 0.30)) continue;
            x = cx;
            z = cz;
            break;
          }
          if (x === null) continue;

          const y = getTerrainY(x, z) + 0.034;
          const idx = rawPoles.length;
          rawPoles.push({
            x,
            y,
            z,
            ux,
            uz,
            px: px * side,
            pz: pz * side,
            selfTag,
            neighbors: [],
          });
          currentSegIndices.push(idx);
        }

        // Link consecutive poles within the segment if distance is realistic for cabling
        for (let k = 0; k < currentSegIndices.length - 1; k++) {
          const i0 = currentSegIndices[k];
          const i1 = currentSegIndices[k + 1];
          const dist = Math.hypot(rawPoles[i1].x - rawPoles[i0].x, rawPoles[i1].z - rawPoles[i0].z);
          if (dist <= 1.28) {
            const mx = (rawPoles[i0].x + rawPoles[i1].x) * 0.5;
            const mz = (rawPoles[i0].z + rawPoles[i1].z) * 0.5;
            if (!spatial.isInRiverChannel(mx, mz) && !spatial.isOnBridge(mx, mz)) {
              wireEdges.push([i0, i1]);
              rawPoles[i0].neighbors.push(i1);
              rawPoles[i1].neighbors.push(i0);
            }
          }
        }

        // Link across gentle corridor vertices to create multi-pole runs like Reference Image 1
        if (i > 0 && currentSegIndices.length > 0 && segPoleGroups[i - 1]?.length > 0) {
          const prevSeg = segPoleGroups[i - 1];
          const lastPrev = prevSeg[prevSeg.length - 1];
          const firstCurr = currentSegIndices[0];
          const p0 = rawPoles[lastPrev];
          const p1 = rawPoles[firstCurr];
          const dot = p0.ux * ux + p0.uz * uz;
          const dist = Math.hypot(p1.x - p0.x, p1.z - p0.z);
          const mx = (p0.x + p1.x) * 0.5;
          const mz = (p0.z + p1.z) * 0.5;
          if (
            dot > 0.65 &&
            dist >= 0.30 &&
            dist <= 1.25 &&
            !spatial.isInRiverChannel(mx, mz) &&
            !spatial.isOnBridge(mx, mz) &&
            !spatial.isInsideBuilding(mx, mz)
          ) {
            wireEdges.push([lastPrev, firstCurr]);
            p0.neighbors.push(firstCurr);
            p1.neighbors.push(lastPrev);
          }
        }

        segPoleGroups.push(currentSegIndices);
      }
    });

    // Keep only wired poles so every electrical pole connects into realistic utility spans
    const keepMap = new Map();
    const poleList = [];
    rawPoles.forEach((p, oldIdx) => {
      if (p.neighbors.length === 0) return;
      // Align pole wire axis (local Z) along average connected cable tangent
      let tx = 0;
      let tz = 0;
      if (p.neighbors.length === 1) {
        const nb = rawPoles[p.neighbors[0]];
        tx = nb.x - p.x;
        tz = nb.z - p.z;
      } else {
        const n0 = rawPoles[p.neighbors[0]];
        const n1 = rawPoles[p.neighbors[p.neighbors.length - 1]];
        tx = n1.x - n0.x;
        tz = n1.z - n0.z;
        if (Math.hypot(tx, tz) < 1e-4) {
          tx = p.ux;
          tz = p.uz;
        }
      }
      const tLen = Math.hypot(tx, tz) || 1;
      const wx = tx / tLen;
      const wz = tz / tLen;
      const yaw = Math.atan2(wx, wz);

      const newIdx = poleList.length;
      keepMap.set(oldIdx, newIdx);

      const isTerminal = p.neighbors.length === 1;
      const hasLowerTier = newIdx % 2 === 0 || isTerminal;
      const hasTransformer = hasLowerTier && newIdx % 4 === 0;
      const hasBox = !hasTransformer && newIdx % 2 === 1;

      poleList.push({
        ...p,
        yaw,
        wx,
        wz,
        crossX: Math.cos(yaw),
        crossZ: -Math.sin(yaw),
        hasLowerTier,
        hasTransformer,
        hasBox,
        isTerminal,
      });
    });

    const lowerList = poleList.filter((p) => p.hasLowerTier);
    const transList = poleList.filter((p) => p.hasTransformer);
    const boxList = poleList.filter((p) => p.hasBox);

    // Generate 3D Overhead Power Line Cables, Jumper Loops, Transformer Droppers & Guy Stays
    const wirePos = [];
    const wireNrm = [];

    const insPos = (pole, lat, heightY, zFaceSign) => {
      const zOff = zFaceSign * 0.021;
      return new THREE.Vector3(
        pole.x + pole.crossX * lat + pole.wx * zOff,
        pole.y + heightY,
        pole.z + pole.crossZ * lat + pole.wz * zOff
      );
    };

    wireEdges.forEach(([oldA, oldB]) => {
      const a = keepMap.get(oldA);
      const b = keepMap.get(oldB);
      if (a === undefined || b === undefined) return;
      const p0 = poleList[a];
      const p1 = poleList[b];

      const sx = p1.x - p0.x;
      const sz = p1.z - p0.z;
      const spanLen = Math.hypot(sx, sz);
      if (spanLen < 1e-4) return;
      const dx = sx / spanLen;
      const dz = sz / spanLen;

      // Determine which dead-end insulator face (+Z vs -Z) connects without crossing poles
      const zSign0 = p0.wx * dx + p0.wz * dz >= 0 ? 1 : -1;
      const zSign1 = p1.wx * dx + p1.wz * dz >= 0 ? -1 : 1;
      // Flip lateral phase order on p1 only if crossarms point in opposite signs
      const latSign1 = p0.crossX * p1.crossX + p0.crossZ * p1.crossZ >= 0 ? 1 : -1;

      const sagUpper = spanLen * 0.026;
      const sagLower = spanLen * 0.030;

      // 3 Primary Phase Conductors on Upper Double Crossarm
      [-0.030, 0, 0.030].forEach((lat) => {
        const ptStart = insPos(p0, lat, 0.234, zSign0);
        const ptEnd = insPos(p1, lat * latSign1, 0.234, zSign1);
        appendCableSpan(wirePos, wireNrm, ptStart, ptEnd, sagUpper, 0.00072, 7);
      });

      // Top Shield / Neutral Conductor from Pole-Top Bayonet Insulator
      appendCableSpan(
        wirePos,
        wireNrm,
        new THREE.Vector3(p0.x, p0.y + 0.264, p0.z),
        new THREE.Vector3(p1.x, p1.y + 0.264, p1.z),
        sagUpper * 0.85,
        0.00058,
        7
      );

      // Lower Secondary Distribution Conductors (when both poles carry lower crossarm)
      if (p0.hasLowerTier && p1.hasLowerTier) {
        [-0.021, 0.021].forEach((lat) => {
          const zOff0 = zSign0 * 0.017;
          const zOff1 = zSign1 * 0.017;
          const pt0 = new THREE.Vector3(
            p0.x + p0.crossX * lat + p0.wx * zOff0,
            p0.y + 0.188,
            p0.z + p0.crossZ * lat + p0.wz * zOff0
          );
          const pt1 = new THREE.Vector3(
            p1.x + p1.crossX * (lat * latSign1) + p1.wx * zOff1,
            p1.y + 0.188,
            p1.z + p1.crossZ * (lat * latSign1) + p1.wz * zOff1
          );
          appendCableSpan(wirePos, wireNrm, pt0, pt1, sagLower, 0.00058, 6);
        });
      }
    });

    // Per-Pole Jumper Loops, Transformer Dropper Leads & Safe Terminal Guy Stay Cables
    poleList.forEach((p) => {
      // Underslung U-jumper loops connecting back (-Z) & front (+Z) disk insulators beneath upper crossarm
      [-0.030, 0, 0.030].forEach((lat) => {
        const backTip = insPos(p, lat, 0.234, -1);
        const frontTip = insPos(p, lat, 0.234, 1);
        appendCableSpan(wirePos, wireNrm, backTip, frontTip, 0.011, 0.00050, 4);
      });

      // Dropper cables from lower cutout down to transformer HV bushing
      if (p.hasTransformer) {
        const cutoutWorld = new THREE.Vector3(
          p.x + p.crossX * 0.019 + p.wx * 0.011,
          p.y + 0.174,
          p.z + p.crossZ * 0.019 + p.wz * 0.011
        );
        const bushingWorld = new THREE.Vector3(
          p.x + p.crossX * 0.020 + p.wx * 0.003,
          p.y + 0.160,
          p.z + p.crossZ * 0.020 + p.wz * 0.003
        );
        appendCableSpan(wirePos, wireNrm, cutoutWorld, bushingWorld, 0.005, 0.00048, 3);
      }

      // Anchored Diagonal Guy Stay Cable on terminal poles along sidewalk away from wires (Reference Image 1)
      if (p.isTerminal) {
        const gx = p.x - p.wx * 0.085;
        const gz = p.z - p.wz * 0.085;
        if (spatial.isValidSidewalkSpot(gx, gz, p.selfTag, 0.018)) {
          const gy = getTerrainY(gx, gz) + 0.028;
          const collarPt = new THREE.Vector3(p.x, p.y + 0.155, p.z);
          const groundPt = new THREE.Vector3(gx, gy, gz);
          const rodTop = new THREE.Vector3().lerpVectors(groundPt, collarPt, 0.16);
          appendCableSpan(wirePos, wireNrm, collarPt, rodTop, 0.0, 0.00068, 2);
          appendCableSpan(wirePos, wireNrm, rodTop, groundPt, 0.0, 0.00125, 1);
        }
      }
    });

    const wGeo = new THREE.BufferGeometry();
    wGeo.setAttribute('position', new THREE.Float32BufferAttribute(wirePos, 3));
    wGeo.setAttribute('normal', new THREE.Float32BufferAttribute(wireNrm, 3));

  return {
    poles: poleList,
    lowerPoles: lowerList,
    transPoles: transList,
    boxPoles: boxList,
    wireGeo: wGeo,
  };
}

function ElectricalPoleNetworkInstanced({ poleData, bumpTex, poleTex }) {
  const shaftRef = useRef();
  const armUpperRef = useRef();
  const armLowerRef = useRef();
  const steelBaseRef = useRef();
  const steelLowerRef = useRef();
  const insUpperRef = useRef();
  const insLowerRef = useRef();
  const transRef = useRef();
  const transBushRef = useRef();
  const boxRef = useRef();

  const { poles, lowerPoles, transPoles, boxPoles, wireGeo } = useMemo(
    () => poleData || computeElectricalPoleNetwork(buildRoadSpatialContext()),
    [poleData]
  );

  useEffect(() => {
    const dummy = new THREE.Object3D();

    const applyList = (list, refs) => {
      if (list.length === 0) return;
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(0, p.yaw, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        refs.forEach((r) => {
          if (r.current) r.current.setMatrixAt(i, dummy.matrix);
        });
      });
      refs.forEach((r) => {
        if (r.current) r.current.instanceMatrix.needsUpdate = true;
      });
    };

    applyList(poles, [shaftRef, armUpperRef, steelBaseRef, insUpperRef]);
    applyList(lowerPoles, [armLowerRef, steelLowerRef, insLowerRef]);
    applyList(transPoles, [transRef, transBushRef]);
    applyList(boxPoles, [boxRef]);
  }, [poles, lowerPoles, transPoles, boxPoles]);

  if (poles.length === 0) return null;

  return (
    <group>
      <instancedMesh ref={shaftRef} args={[POLE_SHAFT_GEO, undefined, poles.length]} castShadow>
        <meshStandardMaterial map={poleTex} roughness={0.86} bumpMap={bumpTex} bumpScale={0.007} />
      </instancedMesh>
      <instancedMesh ref={armUpperRef} args={[POLE_ARMS_UPPER_GEO, undefined, poles.length]} castShadow>
        <meshStandardMaterial color="#615547" roughness={0.84} metalness={0.14} />
      </instancedMesh>
      <instancedMesh ref={steelBaseRef} args={[POLE_STEEL_BASE_GEO, undefined, poles.length]}>
        <meshStandardMaterial color="#969EA7" roughness={0.35} metalness={0.70} envMapIntensity={1.25} />
      </instancedMesh>
      <instancedMesh ref={insUpperRef} args={[POLE_INS_UPPER_GEO, undefined, poles.length]}>
        <meshPhysicalMaterial color="#7C412F" roughness={0.16} clearcoat={0.9} clearcoatRoughness={0.10} />
      </instancedMesh>

      {lowerPoles.length > 0 && (
        <>
          <instancedMesh ref={armLowerRef} args={[POLE_ARMS_LOWER_GEO, undefined, lowerPoles.length]} castShadow>
            <meshStandardMaterial color="#615547" roughness={0.84} metalness={0.14} />
          </instancedMesh>
          <instancedMesh ref={steelLowerRef} args={[POLE_STEEL_LOWER_GEO, undefined, lowerPoles.length]}>
            <meshStandardMaterial color="#969EA7" roughness={0.35} metalness={0.70} envMapIntensity={1.25} />
          </instancedMesh>
          <instancedMesh ref={insLowerRef} args={[POLE_INS_LOWER_GEO, undefined, lowerPoles.length]}>
            <meshPhysicalMaterial color="#7C412F" roughness={0.16} clearcoat={0.9} clearcoatRoughness={0.10} />
          </instancedMesh>
        </>
      )}

      {transPoles.length > 0 && (
        <>
          <instancedMesh ref={transRef} args={[POLE_TRANSFORMER_GEO, undefined, transPoles.length]} castShadow>
            <meshStandardMaterial color="#D5DCE0" roughness={0.36} metalness={0.32} envMapIntensity={1.2} />
          </instancedMesh>
          <instancedMesh ref={transBushRef} args={[POLE_TRANS_BUSH_GEO, undefined, transPoles.length]}>
            <meshPhysicalMaterial color="#7C412F" roughness={0.18} clearcoat={0.85} />
          </instancedMesh>
        </>
      )}

      {boxPoles.length > 0 && (
        <instancedMesh ref={boxRef} args={[POLE_BOX_GEO, undefined, boxPoles.length]}>
          <meshStandardMaterial color="#DCE1E6" roughness={0.42} metalness={0.22} />
        </instancedMesh>
      )}

      <mesh geometry={wireGeo}>
        <meshStandardMaterial color="#25292E" roughness={0.55} metalness={0.45} />
      </mesh>
    </group>
  );
}

function DetailedTankerTruckMesh({ bodyColor = '#0E4B73' }) {
  return (
    <group scale={[0.72, 0.72, 0.72]}>
      {/* 6 Grounded Wheel Assemblies (bottom tread at local y = 0.000) */}
      {[-0.14, -0.03, 0.13].map((wz, axleIdx) =>
        [-0.072, 0.072].map((wx, sideIdx) => (
          <mesh
            key={`${axleIdx}-${sideIdx}`}
            position={[wx, 0.022, wz]}
            rotation={[0, 0, Math.PI / 2]}
            castShadow
          >
            <cylinderGeometry args={[0.022, 0.022, 0.022, 16]} />
            <meshStandardMaterial color="#181A1E" roughness={0.88} />
          </mesh>
        ))
      )}
      <mesh position={[0, 0.046, 0]} castShadow>
        <boxGeometry args={[0.14, 0.026, 0.42]} />
        <meshStandardMaterial color="#1F242B" roughness={0.72} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.14, -0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.088, 0.088, 0.27, 24]} />
        <meshPhysicalMaterial
          color={bodyColor}
          roughness={0.22}
          metalness={0.35}
          clearcoat={0.9}
          clearcoatRoughness={0.12}
          envMapIntensity={1.3}
        />
      </mesh>
      <mesh position={[0, 0.125, 0.14]} castShadow receiveShadow>
        <boxGeometry args={[0.16, 0.14, 0.11]} />
        <meshPhysicalMaterial
          color="#EAE8E2"
          roughness={0.24}
          metalness={0.12}
          clearcoat={0.8}
          clearcoatRoughness={0.14}
        />
      </mesh>
      <mesh position={[0, 0.145, 0.198]}>
        <boxGeometry args={[0.14, 0.058, 0.006]} />
        <meshPhysicalMaterial
          color="#101820"
          roughness={0.06}
          metalness={0.25}
          clearcoat={1.0}
          envMapIntensity={1.6}
        />
      </mesh>
    </group>
  );
}

function WaterFacilityNode({ point, isSelected, onSelect, showLabels = true, zoomTier = 'MID' }) {
  const [hovered, setHovered] = useState(false);
  const ringRef = useRef();

  const isCritical = point.wvi_score >= 65;
  const isModerate = point.wvi_score >= 35 && point.wvi_score < 65;
  const statusColor = isCritical ? '#DC2626' : isModerate ? '#D97706' : '#059669';

  const { x, y, z, rot } = getWaterFacilityPlacement(point);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      const pulse = isSelected || isCritical ? 1 + Math.sin(clock.getElapsedTime() * 4) * 0.14 : 1;
      ringRef.current.scale.set(pulse, pulse, 1);
    }
  });

  const showFullDetails = isSelected || hovered || zoomTier === 'NEAR' || (isCritical && showLabels);
  const showMidDetails = !showFullDetails && showLabels && zoomTier === 'MID';
  const showCompactId = !showFullDetails && !showMidDetails && showLabels;

  return (
    <group
      position={[x, y, z]}
      rotation={[0, rot, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(point);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = 'auto';
      }}
    >
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, 0]}>
        <ringGeometry args={[0.13, isSelected || hovered ? 0.19 : 0.165, 32]} />
        <meshBasicMaterial
          color={statusColor}
          transparent
          opacity={isSelected || hovered ? 0.95 : 0.8}
          polygonOffset
          polygonOffsetFactor={-3}
        />
      </mesh>

      <DetailedWaterFacilityModel sourceType={point.source_type} statusColor={statusColor} />

      {(showLabels || isSelected || hovered || isCritical) && (
        <Html position={[0, 0.42, 0]} center zIndexRange={[20, 0]}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(point);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-md border text-[10px] font-bold tracking-tight whitespace-nowrap transition-transform backdrop-blur-sm ${
              isSelected
                ? 'bg-[#0284C7] text-white border-white scale-110 ring-2 ring-sky-300'
                : hovered
                ? 'bg-white text-slate-900 border-[#0284C7] scale-105'
                : isCritical
                ? 'bg-red-50/95 text-red-950 border-red-400 ring-1 ring-red-300'
                : 'bg-white/95 text-slate-900 border-slate-300'
            }`}
          >
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
            <span className="font-extrabold">{point.id}</span>
            {showFullDetails && (
              <>
                <span className={`text-[9px] font-medium ${isSelected ? 'text-sky-100' : 'text-slate-600'}`}>
                  {point.source_type}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                    isSelected
                      ? 'bg-sky-800/80 text-white'
                      : isCritical
                      ? 'bg-red-100 text-red-800'
                      : isModerate
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  WVI {point.wvi_score}
                </span>
              </>
            )}
            {showMidDetails && (
              <span
                className={`px-1 py-0.5 rounded text-[9px] font-bold ${
                  isModerate ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                WVI {point.wvi_score}
              </span>
            )}
            {showCompactId && isCritical && (
              <span className="text-[9px] text-red-700 font-extrabold">!</span>
            )}
          </button>
        </Html>
      )}
    </group>
  );
}

function TankerDispatchRoute({ targetPoint }) {
  const truckGroupRef = useRef();

  const { roadPath, linePts } = useMemo(() => {
    const coords = getShortestRoadRouteCoords(targetPoint.id);
    const sampledPts = [];

    for (let i = 0; i < coords.length - 1; i++) {
      const [ax, , az] = geoToWorld(...coords[i]);
      const [bx, , bz] = geoToWorld(...coords[i + 1]);
      const segLen = Math.hypot(bx - ax, bz - az);
      const steps = Math.max(8, Math.ceil(segLen * 24));
      for (let s = 0; s <= steps; s++) {
        if (i > 0 && s === 0) continue;
        const u = s / steps;
        const x = ax + (bx - ax) * u;
        const z = az + (bz - az) * u;
        sampledPts.push(new THREE.Vector3(x, getRoadSurfaceY(x, z) + 0.008, z));
      }
    }

    if (sampledPts.length < 2 && coords.length > 0) {
      const [x, , z] = geoToWorld(...coords[0]);
      sampledPts.push(new THREE.Vector3(x, getRoadSurfaceY(x, z) + 0.008, z));
    }

    const path = new THREE.CurvePath();
    for (let i = 0; i < sampledPts.length - 1; i++) {
      path.add(new THREE.LineCurve3(sampledPts[i], sampledPts[i + 1]));
    }
    return { roadPath: path, linePts: sampledPts };
  }, [targetPoint.id]);

  useFrame(({ clock }) => {
    if (truckGroupRef.current && roadPath.curves.length > 0) {
      const t = (clock.getElapsedTime() * 0.08) % 1;
      const pos = roadPath.getPointAt(t);
      const tangent = roadPath.getTangentAt(t);
      const horizLen = Math.hypot(tangent.x, tangent.z) || 1;
      const dx = (tangent.x / horizLen) * 0.06;
      const dz = (tangent.z / horizLen) * 0.06;
      const surfaceY = getRoadSurfaceY(pos.x, pos.z);
      const aheadY = getRoadSurfaceY(pos.x + dx, pos.z + dz);
      truckGroupRef.current.position.set(pos.x, surfaceY, pos.z);
      truckGroupRef.current.lookAt(pos.x + dx, aheadY, pos.z + dz);
    }
  });

  return (
    <group>
      <Line points={linePts} color="#DC2626" lineWidth={2.4} dashed dashSize={0.18} gapSize={0.12} />
      <group ref={truckGroupRef}>
        <DetailedTankerTruckMesh bodyColor="#0284C7" />
      </group>
    </group>
  );
}

function RealisticSkyAndIBL() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Physically-inspired atmospheric sky-to-ground equirectangular gradient
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 256);
    skyGrad.addColorStop(0.0, '#3D71A8');
    skyGrad.addColorStop(0.28, '#7AA8D4');
    skyGrad.addColorStop(0.47, '#D2E2EE');
    skyGrad.addColorStop(0.50, '#E8EBEC');
    skyGrad.addColorStop(0.54, '#6A7358');
    skyGrad.addColorStop(1.0, '#363F2B');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 512, 256);

    // Warm sun bloom in upper sky hemisphere for crisp specular highlights on glass, metal, and water
    const sunGrad = ctx.createRadialGradient(340, 74, 4, 340, 74, 88);
    sunGrad.addColorStop(0, 'rgba(255, 250, 235, 1.0)');
    sunGrad.addColorStop(0.22, 'rgba(255, 238, 200, 0.72)');
    sunGrad.addColorStop(1, 'rgba(255, 238, 200, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(240, 0, 200, 170);

    const equirectTex = new THREE.CanvasTexture(canvas);
    equirectTex.mapping = THREE.EquirectangularReflectionMapping;
    equirectTex.colorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(gl);
    pmrem.compileEquirectangularShader();
    const envRT = pmrem.fromEquirectangular(equirectTex);

    const prevEnv = scene.environment;
    const prevIntensity = scene.environmentIntensity;
    scene.environment = envRT.texture;
    scene.environmentIntensity = 0.85;

    return () => {
      scene.environment = prevEnv;
      scene.environmentIntensity = prevIntensity;
      envRT.dispose();
      equirectTex.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

function NagaMapScene({
  waterPoints,
  showFloodLayer,
  showTankerRoutes,
  showLabels = true,
  activeMapNode,
  onNodeSelect,
  cameraCommand,
  validationMode,
}) {
  const textures = useSceneTextures();
  const [zoomTier, setZoomTier] = useState('MID');
  const criticalPoints = waterPoints.filter((pt) => pt.wvi_score >= 65);
  const floodSusceptiblePoints = waterPoints.filter((pt) => pt.flood_risk_level >= 4);
  const [hubX, hubY, hubZ] = geoToWorld(CDRRMO_HUB.lat, CDRRMO_HUB.lng);

  return (
    <>
      <RealisticSkyAndIBL />

      {/* Natural Atmospheric Sky & Distance Aerial Perspective Haze */}
      <color attach="background" args={['#C9DCEB']} />
      <fog attach="fog" args={['#C9DCEB', 38, 86]} />

      {/* Physically Balanced Sunlight + Sky/Ground Hemisphere Fill */}
      <ambientLight intensity={0.24} color="#E6EEF5" />
      <hemisphereLight args={['#CBE0F5', '#47523C', 0.58]} />
      <directionalLight
        position={[20, 24, 15]}
        intensity={2.65}
        color="#FFF4E0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00018}
        shadow-normalBias={0.01}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />

      <MapCameraRig
        activeMapNode={activeMapNode}
        cameraCommand={cameraCommand}
        validationMode={validationMode}
        onZoomTierChange={setZoomTier}
      />

      <NagaTerrainMesh
        satelliteTex={textures.satelliteTex}
        terrainBumpTex={textures.terrainBumpTex}
        terrainRoughnessTex={textures.terrainRoughnessTex}
        onBackgroundClick={() => onNodeSelect(null)}
      />
      <TerrainRibbons textures={textures} showLabels={showLabels} zoomTier={zoomTier} />

      {validationMode ? (
        <ValidationSampleShowcase
          facadeTex={textures.commercialFacadeTex}
          glazingTex={textures.glazingTex}
          roofTileTex={textures.roofTileTex}
          slateTileTex={textures.slateTileTex}
          mosaicTileTex={textures.mosaicTileTex}
          stuccoTex={textures.stuccoTex}
          brickTex={textures.brickScreenTex}
          timberTex={textures.timberSlatTex}
        />
      ) : (
        <>
          {NAGA_LANDMARKS.map((lm) => (
            <CityArchitecturalBuilding
              key={lm.id}
              b={lm}
              facadeTex={textures.commercialFacadeTex}
              glazingTex={textures.glazingTex}
              roofTileTex={textures.roofTileTex}
              slateTileTex={textures.slateTileTex}
              mosaicTileTex={textures.mosaicTileTex}
              stuccoTex={textures.stuccoTex}
              brickTex={textures.brickScreenTex}
              timberTex={textures.timberSlatTex}
              showLabels={showLabels}
              zoomTier={zoomTier}
            />
          ))}

          <BatchedCityBuildings
            buildings={NAGA_BUILDING_CLUSTERS}
            textures={textures}
          />

          <DioramaTrees foliageBumpTex={textures.terrainBumpTex} />

          {NAGA_URBAN_ENVIRONMENT_FEATURES.map((feature) => (
            <UrbanEnvironmentalFeature
              key={feature.id}
              feature={feature}
              timberTex={textures.timberSlatTex}
              slateTileTex={textures.slateTileTex}
              glazingTex={textures.glazingTex}
              stuccoTex={textures.stuccoTex}
            />
          ))}

          {showFloodLayer &&
            floodSusceptiblePoints.map((pt) => {
              const { x, y, z } = getWaterFacilityPlacement(pt);
              const maxR = pt.flood_risk_level === 5 ? 1.1 : 0.75;
              return (
                <group key={pt.id} position={[x, y + 0.025, z]}>
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[maxR, 32]} />
                    <meshBasicMaterial color="#0284C7" transparent opacity={0.18} polygonOffset polygonOffsetFactor={-1} />
                  </mesh>
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[maxR * 0.94, maxR, 32]} />
                    <meshBasicMaterial color="#0369A1" transparent opacity={0.55} polygonOffset polygonOffsetFactor={-2} />
                  </mesh>
                </group>
              );
            })}

          <group position={[hubX, hubY, hubZ]}>
            <DetailedCommercialBuildingModel
              w={0.32}
              d={0.26}
              h={0.28}
              levels={2}
              variant={0}
              wallColor="#FFFFFF"
              accentColor="#0284C7"
              facadeTex={textures.commercialFacadeTex}
              glazingTex={textures.glazingTex}
            />
            {/* Grounded Side Dispatch Apron & Parked Tanker Bay */}
            <mesh position={[0.26, -0.31, 0.02]} receiveShadow>
              <boxGeometry args={[0.18, 0.62, 0.34]} />
              <meshStandardMaterial map={textures.concreteTex} color="#7A776F" roughness={0.92} />
            </mesh>
            <mesh position={[0.26, 0.005, 0.02]} receiveShadow>
              <boxGeometry args={[0.19, 0.01, 0.35]} />
              <meshStandardMaterial map={textures.concreteTex} color="#B4B0A6" roughness={0.85} />
            </mesh>
            <group position={[0.26, 0.01, 0.02]}>
              <DetailedTankerTruckMesh bodyColor="#0E4B73" />
            </group>
            {showLabels && zoomTier !== 'FAR' && (
              <Html position={[0, 0.42, 0]} center zIndexRange={[10, 0]}>
                <div className="pointer-events-none bg-slate-900/90 text-sky-100 border border-sky-400/50 px-2.5 py-0.5 rounded-full text-[9.5px] font-bold tracking-wide shadow-sm backdrop-blur-sm whitespace-nowrap">
                  CDRRMO Water Logistics Hub
                </div>
              </Html>
            )}
          </group>

          {waterPoints.map((pt) => (
            <WaterFacilityNode
              key={pt.id}
              point={pt}
              isSelected={activeMapNode?.id === pt.id}
              onSelect={onNodeSelect}
              showLabels={showLabels}
              zoomTier={zoomTier}
            />
          ))}

          {showTankerRoutes &&
            criticalPoints.map((pt) => <TankerDispatchRoute key={pt.id} targetPoint={pt} />)}
        </>
      )}
    </>
  );
}

function BatchedCityBuildings({ buildings, textures }) {
  const chunks = useMemo(() => buildBatchedCityChunks(buildings), [buildings]);

  useEffect(() => {
    return () => {
      chunks.forEach((c) => Object.values(c.geometries).forEach((g) => g?.dispose?.()));
    };
  }, [chunks]);

  return (
    <group>
      {chunks.map(({ key, geometries }) => (
        <group key={key}>
          {geometries.foundation && (
            <mesh geometry={geometries.foundation} receiveShadow>
              <meshStandardMaterial vertexColors map={textures.concreteTex} roughness={0.88} />
            </mesh>
          )}
          {geometries.masonry && (
            <mesh geometry={geometries.masonry} castShadow receiveShadow>
              <meshStandardMaterial
                vertexColors
                map={textures.stuccoTex}
                bumpMap={textures.stuccoTex}
                bumpScale={0.004}
                roughness={0.76}
                metalness={0.04}
              />
            </mesh>
          )}
          {geometries.stoneBrick && (
            <mesh geometry={geometries.stoneBrick} castShadow receiveShadow>
              <meshStandardMaterial
                vertexColors
                map={textures.brickMasonryTex}
                bumpMap={textures.brickMasonryTex}
                bumpScale={0.008}
                roughness={0.82}
                metalness={0.05}
              />
            </mesh>
          )}
          {geometries.accent && (
            <mesh geometry={geometries.accent} castShadow receiveShadow>
              <meshStandardMaterial vertexColors roughness={0.58} metalness={0.08} />
            </mesh>
          )}
          {geometries.roof && (
            <mesh geometry={geometries.roof} castShadow receiveShadow>
              <meshStandardMaterial
                vertexColors
                map={textures.roofTileTex}
                bumpMap={textures.roofTileTex}
                bumpScale={0.009}
                roughness={0.52}
                metalness={0.18}
              />
            </mesh>
          )}
          {geometries.glass && (
            <mesh geometry={geometries.glass}>
              <meshStandardMaterial vertexColors map={textures.glazingTex} roughness={0.15} metalness={0.72} />
            </mesh>
          )}
          {geometries.woodCanopy && (
            <mesh geometry={geometries.woodCanopy} receiveShadow>
              <meshStandardMaterial vertexColors map={textures.timberSlatTex} roughness={0.66} metalness={0.06} />
            </mesh>
          )}
          {geometries.trim && (
            <mesh geometry={geometries.trim}>
              <meshStandardMaterial vertexColors roughness={0.36} metalness={0.50} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

export default function BicolMap3D(props) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.06 }}
      camera={{ position: [-0.2, 7.6, 8.2], fov: 36, near: 0.1, far: 160 }}
      className="w-full h-full"
    >
      <NagaMapScene {...props} />
    </Canvas>
  );
}
