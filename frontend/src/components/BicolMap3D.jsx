import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  geoToWorld,
  getTerrainY,
  getShortestRoadRouteCoords,
  BASE_ELEVATION,
  NAGA_RIVER_COORDS,
  BICOL_RIVER_COORDS,
  NAGA_ROAD_NODES,
  NAGA_ROADS_COORDS,
  NAGA_SECONDARY_STREETS,
  NAGA_BRIDGES,
  NAGA_LANDMARKS,
  NAGA_BUILDING_CLUSTERS,
  NAGA_TREE_CLUSTERS,
  BARANGAY_BOUNDARIES,
  NAGA_BARANGAY_DISTRICTS,
  CDRRMO_HUB,
} from '../data/nagaGeoData';

// --- External GLB/GLTF Loader with Bounding-Box Grounding & Scale Normalization ---
const gltfCache = new Map();

function useNormalizedGLTF(url, targetW = 0.24, targetD = 0.20, targetH = 0.22) {
  const [scene, setScene] = useState(null);

  useEffect(() => {
    if (!url) return;
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
  geo.computeVertexNormals();
  return geo;
})();

// --- Sunlit Green Bicol Terrain, Road & High-Contrast Architectural Facade Textures ---
function useSceneTextures() {
  return useMemo(() => {
    const satCanvas = document.createElement('canvas');
    satCanvas.width = 1024;
    satCanvas.height = 1024;
    const ctx = satCanvas.getContext('2d');

    // Vibrant sunlit Bicol lowland green base (No gray overlay!)
    ctx.fillStyle = '#58943D';
    ctx.fillRect(0, 0, 1024, 1024);

    let s = 42;
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };

    // Rich agricultural & barangay green parcel mosaic
    const parcelTones = [
      '#5C9B3E',
      '#4E8A34',
      '#68A649',
      '#74B255',
      '#467F2D',
      '#629F43',
      '#7EBA5E',
    ];
    for (let y = 0; y < 1024; y += 16) {
      for (let x = 0; x < 1024; x += 20) {
        const w = 14 + Math.floor(rand() * 16);
        const h = 10 + Math.floor(rand() * 14);
        ctx.fillStyle = parcelTones[Math.floor(rand() * parcelTones.length)];
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(34, 68, 22, 0.22)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    }

    // Lush emerald forest gradient on Mt. Isarog eastern foothills
    const hillGrad = ctx.createRadialGradient(780, 310, 20, 760, 330, 380);
    hillGrad.addColorStop(0, 'rgba(32, 78, 26, 0.92)');
    hillGrad.addColorStop(0.55, 'rgba(48, 98, 36, 0.65)');
    hillGrad.addColorStop(1, 'rgba(88, 148, 61, 0)');
    ctx.fillStyle = hillGrad;
    ctx.fillRect(320, 0, 704, 720);

    // Subtle warm sunlit meadow tint in the urban core (keeps city green, never gray)
    const urbanLawnGrad = ctx.createRadialGradient(465, 525, 25, 470, 525, 220);
    urbanLawnGrad.addColorStop(0, 'rgba(116, 168, 78, 0.45)');
    urbanLawnGrad.addColorStop(0.65, 'rgba(98, 152, 66, 0.25)');
    urbanLawnGrad.addColorStop(1, 'rgba(88, 148, 61, 0)');
    ctx.fillStyle = urbanLawnGrad;
    ctx.fillRect(200, 260, 540, 520);

    const satelliteTex = new THREE.CanvasTexture(satCanvas);
    satelliteTex.colorSpace = THREE.SRGBColorSpace;
    satelliteTex.wrapS = THREE.ClampToEdgeWrapping;
    satelliteTex.wrapT = THREE.ClampToEdgeWrapping;
    satelliteTex.anisotropy = 8;

    const priRoadCanvas = document.createElement('canvas');
    priRoadCanvas.width = 128;
    priRoadCanvas.height = 128;
    const prCtx = priRoadCanvas.getContext('2d');
    prCtx.fillStyle = '#334155';
    prCtx.fillRect(0, 0, 128, 128);
    prCtx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    prCtx.fillRect(62, 12, 4, 40);
    prCtx.fillRect(62, 76, 4, 40);
    const primaryRoadTex = new THREE.CanvasTexture(priRoadCanvas);
    primaryRoadTex.colorSpace = THREE.SRGBColorSpace;
    primaryRoadTex.wrapS = THREE.RepeatWrapping;
    primaryRoadTex.wrapT = THREE.RepeatWrapping;

    const secRoadCanvas = document.createElement('canvas');
    secRoadCanvas.width = 64;
    secRoadCanvas.height = 64;
    const srCtx = secRoadCanvas.getContext('2d');
    srCtx.fillStyle = '#475569';
    srCtx.fillRect(0, 0, 64, 64);
    const secondaryRoadTex = new THREE.CanvasTexture(secRoadCanvas);
    secondaryRoadTex.colorSpace = THREE.SRGBColorSpace;
    secondaryRoadTex.wrapS = THREE.RepeatWrapping;
    secondaryRoadTex.wrapT = THREE.RepeatWrapping;

    // Crisp Architectural Curtain-Wall & Mullion Facade Texture
    const commCanvas = document.createElement('canvas');
    commCanvas.width = 256;
    commCanvas.height = 256;
    const cCtx = commCanvas.getContext('2d');
    cCtx.fillStyle = '#FFFFFF';
    cCtx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 4; row++) {
      const y = row * 64;
      cCtx.fillStyle = '#E2E8F0';
      cCtx.fillRect(0, y, 256, 10);
      for (let col = 0; col < 4; col++) {
        const x = col * 64;
        cCtx.fillStyle = '#94A3B8';
        cCtx.fillRect(x + 8, y + 14, 48, 42);
        cCtx.fillStyle = '#0F2942';
        cCtx.fillRect(x + 11, y + 17, 42, 36);
        cCtx.fillStyle = '#38BDF8';
        cCtx.fillRect(x + 13, y + 19, 16, 12);
        cCtx.fillStyle = '#F8FAFC';
        cCtx.fillRect(x + 31, y + 17, 2, 36);
      }
    }
    const commercialFacadeTex = new THREE.CanvasTexture(commCanvas);
    commercialFacadeTex.colorSpace = THREE.SRGBColorSpace;
    commercialFacadeTex.wrapS = THREE.RepeatWrapping;
    commercialFacadeTex.wrapT = THREE.RepeatWrapping;
    commercialFacadeTex.anisotropy = 4;

    return { satelliteTex, primaryRoadTex, secondaryRoadTex, commercialFacadeTex };
  }, []);
}

// ============================================================================
// 1. ARCHITECTURAL BUILDING & WATER INFRASTRUCTURE MODELS
// ============================================================================

function RecessedWindow({ position, rotation = [0, 0, 0], w = 0.058, h = 0.052, canopy = true }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow>
        <boxGeometry args={[w, h, 0.014]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, 0.004]}>
        <boxGeometry args={[w - 0.009, h - 0.009, 0.009]} />
        <meshStandardMaterial color="#0F2942" metalness={0.55} roughness={0.15} />
      </mesh>
      {/* Window Mullion Crossbars */}
      <mesh position={[0, 0, 0.008]}>
        <boxGeometry args={[0.004, h - 0.008, 0.005]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[0, 0.004, 0.008]}>
        <boxGeometry args={[w - 0.008, 0.004, 0.005]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      {/* Projecting Concrete Window Sill */}
      <mesh position={[0, -h * 0.5 - 0.004, 0.006]} castShadow>
        <boxGeometry args={[w + 0.012, 0.007, 0.018]} />
        <meshStandardMaterial color="#CBD5E1" />
      </mesh>
      {/* Sun-Breaker Canopy (Media Agua) */}
      {canopy && (
        <mesh position={[0, h * 0.5 + 0.006, 0.014]} castShadow>
          <boxGeometry args={[w + 0.018, 0.007, 0.032]} />
          <meshStandardMaterial color="#9B3B2A" />
        </mesh>
      )}
    </group>
  );
}

export function DetailedResidentialHouseModel({
  w = 0.20,
  d = 0.18,
  h = 0.15,
  wallColor = '#FFFDF9',
  roofColor = '#A83E2B',
  roofShape = 'hipped',
  variant = 0,
}) {
  const externalGlb = useNormalizedGLTF('/models/residential_house.glb', w, d, h * 1.4);
  if (externalGlb) return <primitive object={externalGlb} />;

  const f1H = h * 0.52;
  const f2H = h * 0.48;
  const roofH = Math.max(0.06, h * 0.44);
  const isLShape = variant % 2 === 0;

  return (
    <group>
      {/* Sub-Terrain Slope Foundation (Inset so zero gray box sticks out on flat ground) */}
      <mesh position={[0, -0.32, 0]} receiveShadow>
        <boxGeometry args={[w * 0.90, 0.64, d * 0.90]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
      </mesh>

      {/* Warm Stone Ground-Floor Masonry Volume */}
      <mesh position={[w * 0.08, f1H * 0.5, -d * 0.04]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.80, f1H, d * 0.86]} />
        <meshStandardMaterial color="#F3EFE6" roughness={0.7} />
      </mesh>

      {/* Front Veranda Columns & Balustrade */}
      {[-w * 0.40, -w * 0.12].map((cx, i) => (
        <mesh key={i} position={[cx, f1H * 0.5, d * 0.38]} castShadow>
          <boxGeometry args={[0.016, f1H, 0.016]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
      ))}
      <mesh position={[-w * 0.26, f1H * 0.22, d * 0.38]} castShadow>
        <boxGeometry args={[w * 0.28, f1H * 0.38, 0.012]} />
        <meshStandardMaterial color="#E2E8F0" />
      </mesh>

      {/* Inter-Floor Concrete Molded Ledge */}
      <mesh position={[0, f1H + 0.006, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 1.03, 0.014, d * 1.03]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.6} />
      </mesh>

      {/* Second Floor Living Volume */}
      <mesh position={[0, f1H + f2H * 0.5 + 0.012, -d * 0.04]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.98, f2H, d * 0.88]} />
        <meshStandardMaterial color={wallColor} roughness={0.6} />
      </mesh>

      {/* Projecting L-Wing Gable Bay or Covered Balcony */}
      {isLShape ? (
        <group position={[w * 0.22, 0, d * 0.28]}>
          <mesh position={[0, h * 0.5 + 0.006, 0]} castShadow receiveShadow>
            <boxGeometry args={[w * 0.52, h, d * 0.44]} />
            <meshStandardMaterial color={wallColor} roughness={0.6} />
          </mesh>
          <mesh
            geometry={GABLE_ROOF_GEOMETRY}
            position={[0, h + 0.014, 0]}
            scale={[w * 0.56, roofH * 1.65, d * 0.48]}
            castShadow
          >
            <meshStandardMaterial color={roofColor} roughness={0.5} />
          </mesh>
        </group>
      ) : (
        <mesh position={[-w * 0.22, f1H + 0.032, d * 0.42]} castShadow>
          <boxGeometry args={[w * 0.46, 0.032, 0.012]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      )}

      {/* Carved Wood Panel Front Door + Frame */}
      <group position={[-w * 0.06, f1H * 0.44, d * 0.395]}>
        <mesh>
          <boxGeometry args={[0.042, f1H * 0.84, 0.01]} />
          <meshStandardMaterial color="#FFFFFF" />
        </mesh>
        <mesh position={[0, 0, 0.003]}>
          <boxGeometry args={[0.034, f1H * 0.78, 0.008]} />
          <meshStandardMaterial color="#6D3B1E" roughness={0.65} />
        </mesh>
      </group>

      {/* Articulated 3D Recessed Windows on All Elevations */}
      <RecessedWindow position={[w * 0.22, f1H * 0.52, isLShape ? d * 0.505 : d * 0.395]} w={w * 0.26} h={f1H * 0.46} />
      <RecessedWindow position={[-w * 0.22, f1H + f2H * 0.52 + 0.012, d * 0.405]} w={w * 0.26} h={f2H * 0.50} />
      <RecessedWindow position={[w * 0.22, f1H + f2H * 0.52 + 0.012, isLShape ? d * 0.505 : d * 0.405]} w={w * 0.26} h={f2H * 0.50} />
      <RecessedWindow position={[w * 0.495, f1H + f2H * 0.52 + 0.012, -d * 0.04]} rotation={[0, Math.PI * 0.5, 0]} w={d * 0.34} h={f2H * 0.48} />
      <RecessedWindow position={[-w * 0.495, f1H + f2H * 0.52 + 0.012, -d * 0.04]} rotation={[0, -Math.PI * 0.5, 0]} w={d * 0.34} h={f2H * 0.48} />

      {/* White Eave Soffit/Fascia Trim & Terracotta/Green Pitched Roof */}
      <mesh position={[0, h + 0.01, -d * 0.04]} castShadow>
        <boxGeometry args={[w * 1.08, 0.014, d * 1.0]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <mesh
        geometry={roofShape === 'gabled' ? GABLE_ROOF_GEOMETRY : HIP_ROOF_GEOMETRY}
        position={[0, h + 0.016, -d * 0.04]}
        scale={[w * 1.06, roofH * 2.15, d * 0.98]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={roofColor} roughness={0.5} />
      </mesh>
    </group>
  );
}

export function DetailedCommercialBuildingModel({
  w = 0.26,
  d = 0.22,
  h = 0.38,
  levels = 4,
  wallColor = '#FFFFFF',
  accentColor = '#0284C7',
  facadeTex = null,
  variant = 0,
}) {
  const externalGlb = useNormalizedGLTF('/models/commercial_building.glb', w, d, h);
  if (externalGlb) return <primitive object={externalGlb} />;

  const podiumH = Math.min(0.13, h * 0.32);
  const towerH = Math.max(0.15, h - podiumH);
  const towerW = variant % 2 === 0 ? w * 0.88 : w * 0.95;
  const towerD = variant % 2 === 0 ? d * 0.86 : d * 0.94;
  const floorStep = towerH / Math.max(1, levels - 1);

  return (
    <group>
      {/* Sub-Terrain Slope Foundation */}
      <mesh position={[0, -0.32, 0]} receiveShadow>
        <boxGeometry args={[w * 0.92, 0.64, d * 0.92]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
      </mesh>

      {/* Recessed Ground-Floor Storefront Glazing & Colonnade Piers */}
      <mesh position={[0, podiumH * 0.5, -d * 0.04]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.92, podiumH, d * 0.88]} />
        <meshStandardMaterial color="#0F2942" metalness={0.6} roughness={0.18} />
      </mesh>
      {[-w * 0.45, -w * 0.15, w * 0.15, w * 0.45].map((px, idx) => (
        <mesh key={idx} position={[px, podiumH * 0.5, d * 0.43]} castShadow receiveShadow>
          <boxGeometry args={[0.024, podiumH, 0.026]} />
          <meshStandardMaterial color={wallColor} roughness={0.5} />
        </mesh>
      ))}

      {/* Storefront Awning & Accent Signage Fascia Band */}
      <mesh position={[0, podiumH + 0.008, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 1.04, 0.018, d * 1.05]} />
        <meshStandardMaterial color={accentColor} roughness={0.4} />
      </mesh>

      {/* Stepped Upper Commercial Tower with Facade Texture */}
      <mesh position={[0, podiumH + towerH * 0.5 + 0.016, -d * 0.02]} castShadow receiveShadow>
        <boxGeometry args={[towerW, towerH, towerD]} />
        <meshStandardMaterial
          color={wallColor}
          map={facadeTex || null}
          roughness={0.48}
          metalness={0.08}
        />
      </mesh>

      {/* Projecting Concrete Spandrel Ledges per Upper Level */}
      {Array.from({ length: Math.max(1, levels - 1) }).map((_, i) => {
        const ly = podiumH + 0.016 + (i + 1) * floorStep;
        return (
          <mesh key={i} position={[0, ly, -d * 0.02]} castShadow receiveShadow>
            <boxGeometry args={[towerW * 1.04, 0.014, towerD * 1.04]} />
            <meshStandardMaterial color="#F8FAFC" roughness={0.55} />
          </mesh>
        );
      })}

      {/* Vertical Architectural Pilasters */}
      {[-towerW * 0.35, 0, towerW * 0.35].map((fx, i) => (
        <mesh key={i} position={[fx, podiumH + towerH * 0.5 + 0.016, towerD * 0.5 - d * 0.02]} castShadow>
          <boxGeometry args={[0.016, towerH, 0.018]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.45} />
        </mesh>
      ))}

      {/* Roof Parapet Wall, Elevator Bulkhead Penthouse & Chiller Plant */}
      <mesh position={[0, h + 0.026, -d * 0.02]} castShadow>
        <boxGeometry args={[towerW * 1.03, 0.032, towerD * 1.03]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
      </mesh>
      <mesh position={[-towerW * 0.18, h + 0.075, -towerD * 0.16]} castShadow receiveShadow>
        <boxGeometry args={[towerW * 0.38, 0.08, towerD * 0.36]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.55} />
      </mesh>
      <mesh position={[-towerW * 0.18, h + 0.118, -towerD * 0.16]} castShadow>
        <boxGeometry args={[towerW * 0.42, 0.012, towerD * 0.40]} />
        <meshStandardMaterial color={accentColor} />
      </mesh>
      <mesh position={[towerW * 0.22, h + 0.068, towerD * 0.12]} castShadow>
        <cylinderGeometry args={[0.036, 0.036, 0.065, 18]} />
        <meshStandardMaterial color="#0284C7" metalness={0.4} roughness={0.25} />
      </mesh>
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
      <group scale={[1.05, 1.05, 1.05]}>
        {/* Sub-terrain foundation */}
        <mesh position={[0, -0.30, 0]} receiveShadow>
          <boxGeometry args={[0.42, 0.60, 0.42]} />
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
      <group scale={[0.92, 0.92, 0.92]}>
        <mesh position={[0, -0.32, 0]} receiveShadow>
          <boxGeometry args={[0.46, 0.64, 0.42]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.9} />
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
      <group scale={[0.92, 0.92, 0.92]}>
        <mesh position={[0, -0.32, 0]} receiveShadow>
          <boxGeometry args={[0.62, 0.64, 0.48]} />
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
    <group scale={[0.92, 0.92, 0.92]}>
      <mesh position={[0, -0.32, 0]} receiveShadow>
        <boxGeometry args={[0.56, 0.64, 0.46]} />
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
  };
  const wallColor = wallPalette[b.tone] || '#FFFFFF';

  const { mainGeo, roofCapGeo } = useMemo(() => {
    const shape = new THREE.Shape();
    b.footprint.forEach(([px, pz], idx) => {
      if (idx === 0) shape.moveTo(px, pz);
      else shape.lineTo(px, pz);
    });
    shape.closePath();

    const extrude = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false });
    extrude.rotateX(-Math.PI / 2);
    extrude.computeVertexNormals();

    const cap = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    cap.rotateX(-Math.PI / 2);
    cap.computeVertexNormals();

    return { mainGeo: extrude, roofCapGeo: cap };
  }, [b.footprint, b.h]);

  return (
    <group>
      <mesh geometry={mainGeo} castShadow receiveShadow>
        <meshStandardMaterial
          color={wallColor}
          map={b.levels >= 3 ? facadeTex : null}
          roughness={0.52}
          metalness={0.06}
        />
      </mesh>
      <mesh geometry={roofCapGeo} position={[0, b.h, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={b.roofColor || '#A83E2B'} roughness={0.55} />
      </mesh>
    </group>
  );
}

// ============================================================================
// 2. VALIDATION SAMPLE SHOWCASE PEDESTAL (Residential, Commercial, Kiosk + Handpump)
// ============================================================================
function ValidationSampleShowcase({ facadeTex }) {
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
          wallColor="#FFFDF9"
          roofColor="#A83E2B"
          roofShape="hipped"
          variant={0}
        />
        <Html position={[0, 0.36, 0]} center distanceFactor={5.5}>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            1. Filipino Residential (L-Wing, Veranda, Mullion Windows & Hip Roof)
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
          wallColor="#FFFFFF"
          accentColor="#0284C7"
          facadeTex={facadeTex}
          variant={0}
        />
        <Html position={[0, 0.58, 0]} center distanceFactor={5.5}>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            2. Commercial Mid-Rise (Colonnade Podium, Spandrels & Penthouse)
          </div>
        </Html>
      </group>

      {/* 3A. Validated Communal Water Kiosk + Braced Steel Tower */}
      <group position={[0.62, 0.01, 0]} scale={[1.75, 1.75, 1.75]}>
        <DetailedWaterFacilityModel sourceType="Public Kiosk" statusColor="#059669" />
        <Html position={[0, 0.72, 0]} center distanceFactor={5.5}>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            3A. Water Kiosk & Braced Steel Tank Tower
          </div>
        </Html>
      </group>

      {/* 3B. Validated Cast-Iron Deep-Well Handpump Station */}
      <group position={[1.55, 0.01, 0]} scale={[1.85, 1.85, 1.85]}>
        <DetailedWaterFacilityModel sourceType="Handpump" statusColor="#0284C7" />
        <Html position={[0, 0.52, 0]} center distanceFactor={5.5}>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            3B. Cast-Iron Deep-Well Handpump & Jerrycan
          </div>
        </Html>
      </group>
    </group>
  );
}

// ============================================================================
// 3. RECOGNIZABLE NAGA LANDMARKS & CITY FOOTPRINT DISPATCHER
// ============================================================================
function CityArchitecturalBuilding({ b, facadeTex }) {
  const [x, y, z] = geoToWorld(b.lat, b.lng);
  const wallPalette = {
    white: '#FFFFFF',
    cream: '#FFFDF7',
    sand: '#F5EFE2',
    slate: '#F8FAFC',
    warm: '#FAF6EE',
  };
  const wallColor = wallPalette[b.tone] || '#FFFFFF';

  const roofPaletteMap = {
    '#334155': '#A83E2B',
    '#475569': '#2E6F40',
    '#52606D': '#9B4B36',
  };
  const vibrantRoofColor = roofPaletteMap[b.roofColor] || b.roofColor || '#A83E2B';

  return (
    <group position={[x, y, z]} rotation={[0, b.rot || 0, 0]}>
      {b.type === 'cathedral' || b.type === 'basilica' ? (
        <group>
          <mesh position={[0, -0.32, 0]} receiveShadow>
            <boxGeometry args={[b.w * 0.92, 0.64, b.d * 0.92]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
          </mesh>
          <mesh position={[0, 0.18, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.28, 0.36, 0.58]} />
            <meshStandardMaterial color="#FFFBEB" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.16, -0.06]} castShadow receiveShadow>
            <boxGeometry args={[0.48, 0.32, 0.22]} />
            <meshStandardMaterial color="#FEF3C7" roughness={0.6} />
          </mesh>
          <mesh geometry={GABLE_ROOF_GEOMETRY} position={[0, 0.36, 0]} scale={[0.30, 0.24, 0.56]} castShadow>
            <meshStandardMaterial color="#A83E2B" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.38, -0.06]} castShadow>
            <cylinderGeometry args={[0.11, 0.12, 0.10, 8]} />
            <meshStandardMaterial color="#FEF3C7" />
          </mesh>
          <mesh position={[0, 0.43, -0.06]} castShadow>
            <sphereGeometry args={[0.105, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color="#0284C7" roughness={0.35} />
          </mesh>
          {[-0.15, 0.15].map((tx, idx) => (
            <group key={idx} position={[tx, 0, 0.25]}>
              <mesh position={[0, 0.26, 0]} castShadow>
                <boxGeometry args={[0.095, 0.52, 0.095]} />
                <meshStandardMaterial color="#FFFBEB" />
              </mesh>
              <mesh position={[0, 0.56, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[0.075, 0.12, 4]} />
                <meshStandardMaterial color="#A83E2B" />
              </mesh>
            </group>
          ))}
        </group>
      ) : b.type === 'mall' ? (
        <group>
          <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, 0.28, b.d]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.18, b.d * 0.46]} castShadow>
            <cylinderGeometry args={[0.14, 0.14, 0.34, 24]} />
            <meshStandardMaterial color="#0284C7" metalness={0.45} roughness={0.2} />
          </mesh>
          <mesh position={[-b.w * 0.28, 0.21, 0]} castShadow>
            <boxGeometry args={[b.w * 0.38, 0.12, b.d * 0.82]} />
            <meshStandardMaterial color="#0369A1" roughness={0.35} />
          </mesh>
        </group>
      ) : b.type === 'university' || b.type === 'hall' ? (
        <group>
          <mesh position={[0, 0.18, -0.08]} castShadow receiveShadow>
            <boxGeometry args={[b.w, 0.34, b.d * 0.46]} />
            <meshStandardMaterial color="#FFFDF7" map={facadeTex} roughness={0.55} />
          </mesh>
          {[-b.w * 0.36, b.w * 0.36].map((wx, i) => (
            <mesh key={i} position={[wx, 0.16, 0.06]} castShadow receiveShadow>
              <boxGeometry args={[b.w * 0.24, 0.30, b.d * 0.56]} />
              <meshStandardMaterial color="#FFFFFF" map={facadeTex} roughness={0.55} />
            </mesh>
          ))}
          {[-0.09, -0.03, 0.03, 0.09].map((px, i) => (
            <mesh key={i} position={[px, 0.18, 0.12]} castShadow>
              <cylinderGeometry args={[0.01, 0.012, 0.36, 10]} />
              <meshStandardMaterial color="#FFFFFF" />
            </mesh>
          ))}
          <mesh geometry={HIP_ROOF_GEOMETRY} position={[0, 0.35, -0.08]} scale={[b.w * 1.02, 0.18, b.d * 0.50]} castShadow>
            <meshStandardMaterial color={b.type === 'university' ? '#0284C7' : '#A83E2B'} roughness={0.45} />
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
          accentColor="#0284C7"
          facadeTex={facadeTex}
          variant={b.variant || 0}
        />
      ) : (
        <DetailedResidentialHouseModel
          w={b.w}
          d={b.d}
          h={b.h}
          wallColor={wallColor}
          roofColor={vibrantRoofColor}
          roofShape={b.roofShape || 'hipped'}
          variant={b.variant || 0}
        />
      )}
    </group>
  );
}

function createTerrainRibbonGeometry(coords, width, yOffset, samples = 96, smoothCatmull = false) {
  const controlPts = coords.map(([lat, lng]) => {
    const [x, y, z] = geoToWorld(lat, lng);
    return new THREE.Vector3(x, y, z);
  });

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const up = new THREE.Vector3(0, 1, 0);
  let cumulativeDist = 0;

  if (smoothCatmull && controlPts.length >= 3) {
    const curve = new THREE.CatmullRomCurve3(controlPts);
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

      positions.push(lx, getTerrainY(lx, lz) + yOffset, lz, rx, getTerrainY(rx, rz) + yOffset, rz);
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
    let vertexPairCount = 0;
    const centerPts = [];
    for (let seg = 0; seg < controlPts.length - 1; seg++) {
      const p0 = controlPts[seg];
      const p1 = controlPts[seg + 1];
      const segLen = Math.hypot(p1.x - p0.x, p1.z - p0.z);
      const subSteps = Math.max(4, Math.ceil(segLen * 10));
      const dir = new THREE.Vector3(p1.x - p0.x, 0, p1.z - p0.z).normalize();
      const side = new THREE.Vector3().crossVectors(dir, up).normalize();

      for (let s = 0; s <= subSteps; s++) {
        if (seg > 0 && s === 0) continue;
        const t = s / subSteps;
        const px = THREE.MathUtils.lerp(p0.x, p1.x, t);
        const pz = THREE.MathUtils.lerp(p0.z, p1.z, t);
        const pt = new THREE.Vector3(px, getTerrainY(px, pz), pz);
        centerPts.push(pt);
        if (centerPts.length > 1) cumulativeDist += pt.distanceTo(centerPts[centerPts.length - 2]);

        const lx = px - side.x * (width * 0.5);
        const lz = pz - side.z * (width * 0.5);
        const rx = px + side.x * (width * 0.5);
        const rz = pz + side.z * (width * 0.5);
        positions.push(lx, getTerrainY(lx, lz) + yOffset, lz, rx, getTerrainY(rx, rz) + yOffset, rz);
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

function getRoadSurfaceY(x, z) {
  const base = getTerrainY(x, z);
  for (const br of NAGA_BRIDGES) {
    const [ax, , az] = geoToWorld(...NAGA_ROAD_NODES[br.from]);
    const [bx, , bz] = geoToWorld(...NAGA_ROAD_NODES[br.to]);
    const vx = bx - ax;
    const vz = bz - az;
    const lenSq = vx * vx + vz * vz;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / lenSq)) : 0;
    const dist = Math.hypot(x - (ax + t * vx), z - (az + t * vz));
    if (dist < 0.34) {
      return base + 0.088 + Math.sin(t * Math.PI) * 0.082;
    }
  }
  return base + 0.046;
}

function getSafeCameraMinY(x, z) {
  return Math.max(BASE_ELEVATION + 0.45, getTerrainY(x, z) + 0.45);
}

function MapCameraRig({ activeMapNode, cameraCommand, validationMode }) {
  const controlsRef = useRef();
  const desiredTarget = useRef(new THREE.Vector3(-1.2, 0.15, 0.3));
  const desiredCameraPos = useRef(new THREE.Vector3(-0.2, 7.6, 8.2));
  const isTransitioning = useRef(false);

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
      const [x, y, z] = geoToWorld(activeMapNode.lat, activeMapNode.lng);
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

function NagaTerrainMesh({ satelliteTex, onBackgroundClick }) {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(76, 62, 240, 190);
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
      <meshStandardMaterial map={satelliteTex} roughness={0.82} metalness={0.02} />
    </mesh>
  );
}

function BridgeStructures({ roadTex }) {
  return (
    <group>
      {NAGA_BRIDGES.map((br) => {
        const [ax, ay, az] = geoToWorld(...NAGA_ROAD_NODES[br.from]);
        const [bx, by, bz] = geoToWorld(...NAGA_ROAD_NODES[br.to]);
        const midX = (ax + bx) * 0.5;
        const midZ = (az + bz) * 0.5;
        const baseY = Math.max(ay, by) + 0.062;
        const dx = bx - ax;
        const dz = bz - az;
        const spanLength = Math.hypot(dx, dz);
        const angleY = Math.atan2(dx, dz);

        return (
          <group key={br.id} position={[midX, baseY, midZ]} rotation={[0, angleY, 0]}>
            {[-spanLength * 0.48, spanLength * 0.48].map((azPos, idx) => (
              <mesh key={idx} position={[0, -0.06, azPos]} castShadow receiveShadow>
                <boxGeometry args={[0.30, 0.18, 0.12]} />
                <meshStandardMaterial color="#64748B" roughness={0.8} />
              </mesh>
            ))}
            <mesh position={[0, 0.032, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.28, 0.032, spanLength]} />
              <meshStandardMaterial color="#E2E8F0" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.050, 0]} receiveShadow>
              <boxGeometry args={[0.20, 0.006, spanLength]} />
              <meshStandardMaterial map={roadTex} roughness={0.75} />
            </mesh>
            {[-0.13, 0.13].map((px, sideIdx) => (
              <mesh key={sideIdx} position={[px, 0.062, 0]} castShadow>
                <boxGeometry args={[0.018, 0.028, spanLength * 0.98]} />
                <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

function TerrainRibbons({ textures }) {
  const {
    nagaBankGeo,
    nagaRiverGeo,
    bicolBankGeo,
    bicolRiverGeo,
    primaryCurbs,
    primaryAsphalt,
    secondaryCurbs,
    secondaryAsphalt,
    junctionNodes,
  } = useMemo(() => {
    return {
      nagaBankGeo: createTerrainRibbonGeometry(NAGA_RIVER_COORDS, 0.60, 0.012, 110, true).geo,
      nagaRiverGeo: createTerrainRibbonGeometry(NAGA_RIVER_COORDS, 0.48, 0.018, 110, true).geo,
      bicolBankGeo: createTerrainRibbonGeometry(BICOL_RIVER_COORDS, 0.80, 0.012, 110, true).geo,
      bicolRiverGeo: createTerrainRibbonGeometry(BICOL_RIVER_COORDS, 0.66, 0.018, 110, true).geo,
      primaryCurbs: NAGA_ROADS_COORDS.map((r) => createTerrainRibbonGeometry(r, 0.21, 0.035, 64, false).geo),
      primaryAsphalt: NAGA_ROADS_COORDS.map((r) => createTerrainRibbonGeometry(r, 0.16, 0.044, 64, false).geo),
      secondaryCurbs: NAGA_SECONDARY_STREETS.map((r) => createTerrainRibbonGeometry(r, 0.15, 0.034, 40, false).geo),
      secondaryAsphalt: NAGA_SECONDARY_STREETS.map((r) => createTerrainRibbonGeometry(r, 0.11, 0.043, 40, false).geo),
      junctionNodes: Object.entries(NAGA_ROAD_NODES).map(([key, [lat, lng]]) => {
        const [x, y, z] = geoToWorld(lat, lng);
        return { key, x, y, z };
      }),
    };
  }, []);

  return (
    <group>
      <mesh geometry={nagaBankGeo} receiveShadow>
        <meshStandardMaterial color="#658B58" roughness={0.85} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={nagaRiverGeo} receiveShadow>
        <meshStandardMaterial color="#0284C7" roughness={0.14} metalness={0.32} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={bicolBankGeo} receiveShadow>
        <meshStandardMaterial color="#658B58" roughness={0.85} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={bicolRiverGeo} receiveShadow>
        <meshStandardMaterial color="#0284C7" roughness={0.14} metalness={0.32} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
      </mesh>

      {secondaryCurbs.map((geo, i) => (
        <mesh key={`sc-${i}`} geometry={geo} renderOrder={1} receiveShadow>
          <meshStandardMaterial color="#CBD5E1" roughness={0.8} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-3} />
        </mesh>
      ))}
      {primaryCurbs.map((geo, i) => (
        <mesh key={`pc-${i}`} geometry={geo} renderOrder={1} receiveShadow>
          <meshStandardMaterial color="#CBD5E1" roughness={0.8} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-3} />
        </mesh>
      ))}
      {secondaryAsphalt.map((geo, i) => (
        <mesh key={`sa-${i}`} geometry={geo} renderOrder={2} receiveShadow>
          <meshStandardMaterial map={textures.secondaryRoadTex} roughness={0.78} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-6} />
        </mesh>
      ))}
      {primaryAsphalt.map((geo, i) => (
        <mesh key={`pa-${i}`} geometry={geo} renderOrder={2} receiveShadow>
          <meshStandardMaterial map={textures.primaryRoadTex} roughness={0.74} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-6} />
        </mesh>
      ))}
      {junctionNodes.map((j) => (
        <mesh key={j.key} rotation={[-Math.PI / 2, 0, 0]} position={[j.x, j.y + 0.045, j.z]} renderOrder={2} receiveShadow>
          <circleGeometry args={[0.085, 24]} />
          <meshStandardMaterial color="#334155" roughness={0.75} polygonOffset polygonOffsetFactor={-7} />
        </mesh>
      ))}

      <BridgeStructures roadTex={textures.primaryRoadTex} />

      {BARANGAY_BOUNDARIES.map((ring, i) => {
        const sampledPts = [];
        for (let seg = 0; seg < ring.length - 1; seg++) {
          const [latA, lngA] = ring[seg];
          const [latB, lngB] = ring[seg + 1];
          for (let s = 0; s <= 8; s++) {
            if (seg > 0 && s === 0) continue;
            const t = s / 8;
            const [x, y, z] = geoToWorld(latA + (latB - latA) * t, lngA + (lngB - lngA) * t);
            sampledPts.push(new THREE.Vector3(x, y + 0.032, z));
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

      {NAGA_BARANGAY_DISTRICTS.map((dist) => {
        const [x, y, z] = geoToWorld(dist.lat, dist.lng);
        return (
          <Html key={dist.id} position={[x, y + 0.05, z]} center distanceFactor={16} zIndexRange={[3, 0]}>
            <div className="pointer-events-none px-1.5 py-0.5 rounded bg-white/95 text-slate-900 border border-slate-300 shadow-2xs text-[6.5px] font-bold tracking-wider uppercase whitespace-nowrap">
              {dist.name}
            </div>
          </Html>
        );
      })}
    </group>
  );
}

function DioramaTrees() {
  return (
    <group>
      {NAGA_TREE_CLUSTERS.map((t, i) => (
        <group key={i} position={[t.x, t.y, t.z]} scale={[t.s * 0.78, t.s * 0.78, t.s * 0.78]}>
          <mesh position={[0, -0.32, 0]}>
            <cylinderGeometry args={[0.012, 0.02, 0.80, 6]} />
            <meshStandardMaterial color="#5C3A21" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.14, 0]} castShadow>
            <dodecahedronGeometry args={[0.09, 1]} />
            <meshStandardMaterial color={t.variant === 1 ? '#2E7D32' : '#388E3C'} roughness={0.75} />
          </mesh>
          <mesh position={[0.024, 0.21, -0.014]} castShadow>
            <dodecahedronGeometry args={[0.065, 1]} />
            <meshStandardMaterial color="#4CAF50" roughness={0.75} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function DetailedTankerTruckMesh({ bodyColor = '#0284C7' }) {
  return (
    <group scale={[0.72, 0.72, 0.72]}>
      <mesh position={[0, 0.046, 0]} castShadow>
        <boxGeometry args={[0.14, 0.026, 0.42]} />
        <meshStandardMaterial color="#1E293B" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.14, -0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.088, 0.088, 0.27, 18]} />
        <meshStandardMaterial color={bodyColor} roughness={0.28} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0.125, 0.14]} castShadow>
        <boxGeometry args={[0.16, 0.14, 0.11]} />
        <meshStandardMaterial color="#FFFFFF" roughness={0.25} />
      </mesh>
      <mesh position={[0, 0.145, 0.198]}>
        <boxGeometry args={[0.14, 0.058, 0.006]} />
        <meshStandardMaterial color="#0F172A" roughness={0.12} metalness={0.6} />
      </mesh>
    </group>
  );
}

function WaterFacilityNode({ point, isSelected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const ringRef = useRef();

  const isCritical = point.wvi_score >= 65;
  const isModerate = point.wvi_score >= 35 && point.wvi_score < 65;
  const statusColor = isCritical ? '#DC2626' : isModerate ? '#D97706' : '#059669';

  const [x, y, z] = geoToWorld(point.lat, point.lng);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      const pulse = isSelected || isCritical ? 1 + Math.sin(clock.getElapsedTime() * 4) * 0.14 : 1;
      ringRef.current.scale.set(pulse, pulse, 1);
    }
  });

  return (
    <group
      position={[x, y, z]}
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
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.048, 0]}>
        <ringGeometry args={[0.22, isSelected || hovered ? 0.35 : 0.28, 32]} />
        <meshBasicMaterial
          color={statusColor}
          transparent
          opacity={isSelected || hovered ? 0.95 : 0.8}
          polygonOffset
          polygonOffsetFactor={-3}
        />
      </mesh>

      <DetailedWaterFacilityModel sourceType={point.source_type} statusColor={statusColor} />

      <Html position={[0, 0.56, 0]} center distanceFactor={11} zIndexRange={[20, 0]}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(point);
          }}
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full shadow-md border text-[9px] font-bold whitespace-nowrap transition-transform ${
            isSelected
              ? 'bg-[#0284C7] text-white border-white scale-110 ring-2 ring-sky-300'
              : hovered
              ? 'bg-white text-slate-900 border-[#0284C7] scale-105'
              : 'bg-white/95 text-slate-900 border-slate-300'
          }`}
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
          <span>{point.id}</span>
          <span className="text-[8px] text-slate-600 font-semibold">({point.source_type})</span>
          <span className="text-[8px] text-slate-500 font-semibold">WVI {point.wvi_score}</span>
        </button>
      </Html>
    </group>
  );
}

function TankerDispatchRoute({ targetPoint }) {
  const truckGroupRef = useRef();

  const { roadPath, linePts } = useMemo(() => {
    const coords = getShortestRoadRouteCoords(targetPoint.id);
    const pts = coords.map(([lat, lng]) => {
      const [x, , z] = geoToWorld(lat, lng);
      return new THREE.Vector3(x, getRoadSurfaceY(x, z) + 0.008, z);
    });

    const path = new THREE.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) {
      path.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    }
    return { roadPath: path, linePts: pts };
  }, [targetPoint.id]);

  useFrame(({ clock }) => {
    if (truckGroupRef.current && roadPath.curves.length > 0) {
      const t = (clock.getElapsedTime() * 0.08) % 1;
      const pos = roadPath.getPointAt(t);
      const tangent = roadPath.getTangentAt(t);
      const surfaceY = getRoadSurfaceY(pos.x, pos.z);
      const aheadY = getRoadSurfaceY(pos.x + tangent.x * 0.1, pos.z + tangent.z * 0.1);
      truckGroupRef.current.position.set(pos.x, surfaceY, pos.z);
      truckGroupRef.current.lookAt(pos.x + tangent.x, aheadY, pos.z + tangent.z);
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

function NagaMapScene({
  waterPoints,
  showFloodLayer,
  showTankerRoutes,
  activeMapNode,
  onNodeSelect,
  cameraCommand,
  validationMode,
}) {
  const textures = useSceneTextures();
  const criticalPoints = waterPoints.filter((pt) => pt.wvi_score >= 65);
  const floodSusceptiblePoints = waterPoints.filter((pt) => pt.flood_risk_level >= 4);
  const [hubX, hubY, hubZ] = geoToWorld(CDRRMO_HUB.lat, CDRRMO_HUB.lng);

  return (
    <>
      {/* Bright Daylight Sky Background & Far Horizon Haze (Never dims the city) */}
      <color attach="background" args={['#E0F2FE']} />
      <fog attach="fog" args={['#E0F2FE', 42, 90]} />

      {/* High-Key Sunlit Illumination (Eliminates dull gray shadows) */}
      <ambientLight intensity={1.05} color="#FFFFFF" />
      <hemisphereLight args={['#F0F9FF', '#4D8B31', 0.85]} />
      <directionalLight
        position={[18, 28, 16]}
        intensity={2.0}
        color="#FFFBEB"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0002}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />

      <MapCameraRig
        activeMapNode={activeMapNode}
        cameraCommand={cameraCommand}
        validationMode={validationMode}
      />

      <NagaTerrainMesh satelliteTex={textures.satelliteTex} onBackgroundClick={() => onNodeSelect(null)} />
      <TerrainRibbons textures={textures} />

      {validationMode ? (
        <ValidationSampleShowcase facadeTex={textures.commercialFacadeTex} />
      ) : (
        <>
          {NAGA_LANDMARKS.map((lm) => (
            <CityArchitecturalBuilding key={lm.id} b={lm} facadeTex={textures.commercialFacadeTex} />
          ))}

          {NAGA_BUILDING_CLUSTERS.map((b) => (
            <CityArchitecturalBuilding key={b.id} b={b} facadeTex={textures.commercialFacadeTex} />
          ))}

          <DioramaTrees />

          {showFloodLayer &&
            floodSusceptiblePoints.map((pt) => {
              const [x, y, z] = geoToWorld(pt.lat, pt.lng);
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
              w={0.34}
              d={0.28}
              h={0.28}
              levels={2}
              wallColor="#FFFFFF"
              accentColor="#0284C7"
              facadeTex={textures.commercialFacadeTex}
            />
            <group position={[0.20, 0.03, 0.06]}>
              <DetailedTankerTruckMesh bodyColor="#0284C7" />
            </group>
            <Html position={[0, 0.40, 0]} center distanceFactor={11} zIndexRange={[10, 0]}>
              <div className="bg-white text-slate-900 border border-slate-300 px-2 py-0.5 rounded-full text-[8.5px] font-bold shadow">
                CDRRMO Water Logistics Hub
              </div>
            </Html>
          </group>

          {waterPoints.map((pt) => (
            <WaterFacilityNode
              key={pt.id}
              point={pt}
              isSelected={activeMapNode?.id === pt.id}
              onSelect={onNodeSelect}
            />
          ))}

          {showTankerRoutes &&
            criticalPoints.map((pt) => <TankerDispatchRoute key={pt.id} targetPoint={pt} />)}
        </>
      )}
    </>
  );
}

export default function BicolMap3D(props) {
  return (
    <Canvas
      shadows
      gl={{ toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.25 }}
      camera={{ position: [-0.2, 7.6, 8.2], fov: 36, near: 0.1, far: 160 }}
      className="w-full h-full"
    >
      <NagaMapScene {...props} />
    </Canvas>
  );
}
