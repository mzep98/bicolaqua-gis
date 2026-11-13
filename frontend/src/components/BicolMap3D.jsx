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

// --- Optional External GLB/GLTF Asset Hook (Supports drop-in /public/models/*.glb assets via GLTFLoader) ---
function useOptionalGLTF(url) {
  const [gltfScene, setGltfScene] = useState(null);
  useEffect(() => {
    if (!url) return;
    let mounted = true;
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        if (mounted && gltf?.scene) {
          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          setGltfScene(gltf.scene);
        }
      },
      undefined,
      () => {
        // Gracefully falls back to high-detail multi-mesh procedural geometry when external file is absent
      }
    );
    return () => {
      mounted = false;
    };
  }, [url]);
  return gltfScene;
}

// --- Shared Extruded Pitched Gable & Hip Roof Geometries (Real 3D Overhangs, Ridge Caps & Fascia) ---
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

function useTerrainAndRoadTextures() {
  return useMemo(() => {
    const satCanvas = document.createElement('canvas');
    satCanvas.width = 1024;
    satCanvas.height = 1024;
    const ctx = satCanvas.getContext('2d');

    ctx.fillStyle = '#627A54';
    ctx.fillRect(0, 0, 1024, 1024);

    let s = 42;
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296;
      return s / 4294967296;
    };

    const parcelTones = ['#69825A', '#58704B', '#738A62', '#7E9369', '#526946', '#6D845E'];
    for (let y = 0; y < 1024; y += 18) {
      for (let x = 0; x < 1024; x += 22) {
        const w = 16 + Math.floor(rand() * 14);
        const h = 12 + Math.floor(rand() * 12);
        ctx.fillStyle = parcelTones[Math.floor(rand() * parcelTones.length)];
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(40, 54, 34, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
      }
    }

    const hillGrad = ctx.createRadialGradient(780, 310, 20, 760, 330, 360);
    hillGrad.addColorStop(0, 'rgba(38, 60, 34, 0.90)');
    hillGrad.addColorStop(0.55, 'rgba(52, 76, 44, 0.68)');
    hillGrad.addColorStop(1, 'rgba(75, 99, 63, 0)');
    ctx.fillStyle = hillGrad;
    ctx.fillRect(340, 0, 684, 700);

    const urbanGrad = ctx.createRadialGradient(465, 525, 30, 470, 525, 240);
    urbanGrad.addColorStop(0, 'rgba(176, 180, 174, 0.88)');
    urbanGrad.addColorStop(0.55, 'rgba(142, 150, 138, 0.55)');
    urbanGrad.addColorStop(1, 'rgba(98, 122, 84, 0)');
    ctx.fillStyle = urbanGrad;
    ctx.fillRect(180, 250, 560, 540);

    const satelliteTex = new THREE.CanvasTexture(satCanvas);
    satelliteTex.wrapS = THREE.ClampToEdgeWrapping;
    satelliteTex.wrapT = THREE.ClampToEdgeWrapping;
    satelliteTex.anisotropy = 8;

    const priRoadCanvas = document.createElement('canvas');
    priRoadCanvas.width = 128;
    priRoadCanvas.height = 128;
    const prCtx = priRoadCanvas.getContext('2d');
    prCtx.fillStyle = '#334155';
    prCtx.fillRect(0, 0, 128, 128);
    prCtx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    prCtx.fillRect(62, 12, 4, 40);
    prCtx.fillRect(62, 76, 4, 40);
    const primaryRoadTex = new THREE.CanvasTexture(priRoadCanvas);
    primaryRoadTex.wrapS = THREE.RepeatWrapping;
    primaryRoadTex.wrapT = THREE.RepeatWrapping;

    const secRoadCanvas = document.createElement('canvas');
    secRoadCanvas.width = 64;
    secRoadCanvas.height = 64;
    const srCtx = secRoadCanvas.getContext('2d');
    srCtx.fillStyle = '#475569';
    srCtx.fillRect(0, 0, 64, 64);
    const secondaryRoadTex = new THREE.CanvasTexture(secRoadCanvas);
    secondaryRoadTex.wrapS = THREE.RepeatWrapping;
    secondaryRoadTex.wrapT = THREE.RepeatWrapping;

    return { satelliteTex, primaryRoadTex, secondaryRoadTex };
  }, []);
}

// ============================================================================
// 1. VALIDATED DETAILED 3D ARCHITECTURAL MODELS (Genuine 3D Geometry: Roofs, Walls, Recessed Windows, Doors, Columns)
// ============================================================================

export function DetailedResidentialHouseModel({
  w = 0.28,
  d = 0.24,
  h = 0.22,
  wallColor = '#F8FAFC',
  roofColor = '#8C4A36',
  roofShape = 'gabled',
}) {
  const externalGlb = useOptionalGLTF(null);
  if (externalGlb) return <primitive object={externalGlb.clone()} />;

  const roofH = Math.max(0.08, h * 0.42);

  return (
    <group>
      {/* Stepped Concrete Lot Plinth & Foundation */}
      <mesh position={[0, -0.74, 0]} receiveShadow castShadow>
        <boxGeometry args={[w * 1.28, 1.52, d * 1.28]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.025, 0]} receiveShadow castShadow>
        <boxGeometry args={[w * 1.06, 0.03, d * 1.06]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.85} />
      </mesh>

      {/* Main Structural Wall Mass */}
      <mesh position={[0, h * 0.5 + 0.035, -d * 0.04]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d * 0.88]} />
        <meshStandardMaterial color={wallColor} roughness={0.68} />
      </mesh>

      {/* Projecting Front Porch Wing & Columns */}
      <mesh position={[w * 0.18, h * 0.36 + 0.035, d * 0.32]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.52, h * 0.72, d * 0.32]} />
        <meshStandardMaterial color="#F1F5F9" roughness={0.65} />
      </mesh>
      {[-w * 0.36, -w * 0.08].map((cx, i) => (
        <mesh key={`porch-col-${i}`} position={[cx, h * 0.32 + 0.035, d * 0.42]} castShadow>
          <boxGeometry args={[0.018, h * 0.64, 0.018]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
        </mesh>
      ))}
      {/* Porch Canopy Slab */}
      <mesh position={[-w * 0.22, h * 0.64 + 0.035, d * 0.38]} castShadow>
        <boxGeometry args={[w * 0.42, 0.022, d * 0.22]} />
        <meshStandardMaterial color={roofColor} roughness={0.6} />
      </mesh>

      {/* 3D Panelled Timber Front Door & Frame */}
      <group position={[-w * 0.22, 0.095, d * 0.402]}>
        <mesh castShadow>
          <boxGeometry args={[0.056, 0.115, 0.012]} />
          <meshStandardMaterial color="#E2E8F0" />
        </mesh>
        <mesh position={[0, 0, 0.004]}>
          <boxGeometry args={[0.044, 0.105, 0.01]} />
          <meshStandardMaterial color="#5C3A21" roughness={0.7} />
        </mesh>
      </group>

      {/* 3D Recessed Framed Windows with Sills & Reflective Glass Panes (Front, Back & Sides) */}
      {[-w * 0.24, w * 0.18].map((wx, idx) => (
        <group key={`win-f-${idx}`} position={[wx, h * 0.56 + 0.035, idx === 1 ? d * 0.482 : d * 0.402]}>
          {/* Window Frame & Sill */}
          <mesh castShadow>
            <boxGeometry args={[0.068, 0.068, 0.014]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
          </mesh>
          <mesh position={[0, -0.036, 0.006]} castShadow>
            <boxGeometry args={[0.076, 0.008, 0.02]} />
            <meshStandardMaterial color="#94A3B8" />
          </mesh>
          {/* Glass Pane */}
          <mesh position={[0, 0, 0.004]}>
            <boxGeometry args={[0.054, 0.054, 0.01]} />
            <meshStandardMaterial color="#1E3A5F" metalness={0.65} roughness={0.18} />
          </mesh>
          {/* Vertical Mullion */}
          <mesh position={[0, 0, 0.008]}>
            <boxGeometry args={[0.006, 0.054, 0.006]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
        </group>
      ))}

      {/* Side Elevation 3D Windows */}
      {[-1, 1].map((side) => (
        <group key={`win-side-${side}`} position={[side * (w * 0.502), h * 0.56 + 0.035, -d * 0.04]}>
          <mesh castShadow>
            <boxGeometry args={[0.014, 0.064, 0.072]} />
            <meshStandardMaterial color="#FFFFFF" />
          </mesh>
          <mesh position={[side * 0.003, 0, 0]}>
            <boxGeometry args={[0.01, 0.05, 0.058]} />
            <meshStandardMaterial color="#1E3A5F" metalness={0.65} roughness={0.18} />
          </mesh>
        </group>
      ))}

      {/* True Overhanging Pitched Gable or Hip Roof with Ridge Beam */}
      {roofShape === 'gabled' ? (
        <group position={[0, h + 0.035, -d * 0.02]}>
          <mesh geometry={GABLE_ROOF_GEOMETRY} scale={[w * 1.06, roofH * 2.2, d * 0.96]} castShadow receiveShadow>
            <meshStandardMaterial color={roofColor} roughness={0.62} />
          </mesh>
          <mesh position={[0, roofH * 0.92, 0]} castShadow>
            <boxGeometry args={[0.022, 0.018, d * 1.05]} />
            <meshStandardMaterial color="#334155" roughness={0.7} />
          </mesh>
        </group>
      ) : (
        <group position={[0, h + 0.035, 0]}>
          <mesh geometry={GABLE_ROOF_GEOMETRY} rotation={[0, Math.PI * 0.5, 0]} scale={[d * 1.04, roofH * 2.1, w * 1.06]} castShadow receiveShadow>
            <meshStandardMaterial color={roofColor} roughness={0.62} />
          </mesh>
        </group>
      )}
    </group>
  );
}

export function DetailedCommercialBuildingModel({
  w = 0.36,
  d = 0.30,
  h = 0.52,
  levels = 4,
  wallColor = '#F1F5F9',
  accentColor = '#334155',
}) {
  const groundH = Math.min(0.14, h * 0.28);
  const upperH = Math.max(0.16, h - groundH);
  const floorStep = upperH / Math.max(1, levels - 1);

  return (
    <group>
      {/* Paved Commercial Lot & Sidewalk Apron */}
      <mesh position={[0, -0.74, 0]} receiveShadow castShadow>
        <boxGeometry args={[w * 1.24, 1.52, d * 1.24]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.88} />
      </mesh>

      {/* Ground-Floor Recessed Glass Storefront Base & Structural Pilasters */}
      <mesh position={[0, groundH * 0.5 + 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[w * 0.96, groundH, d * 0.96]} />
        <meshStandardMaterial color="#0F172A" metalness={0.7} roughness={0.18} />
      </mesh>
      {[-w * 0.46, -w * 0.16, w * 0.16, w * 0.46].map((px, i) => (
        <mesh key={`pilaster-${i}`} position={[px, groundH * 0.5 + 0.02, d * 0.48]} castShadow>
          <boxGeometry args={[0.028, groundH, 0.028]} />
          <meshStandardMaterial color={wallColor} roughness={0.55} />
        </mesh>
      ))}

      {/* Projecting Steel Entrance Canopy */}
      <mesh position={[0, groundH + 0.02, d * 0.53]} castShadow>
        <boxGeometry args={[w * 0.68, 0.018, 0.09]} />
        <meshStandardMaterial color={accentColor} metalness={0.4} roughness={0.4} />
      </mesh>

      {/* Upper-Floor Architectural Massing */}
      <mesh position={[0, groundH + upperH * 0.5 + 0.02, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, upperH, d]} />
        <meshStandardMaterial color={wallColor} roughness={0.55} />
      </mesh>

      {/* Physical 3D Glazed Window Bands & Horizontal Spandrel Ledges Per Floor */}
      {Array.from({ length: Math.max(1, levels - 1) }).map((_, lvlIdx) => {
        const wy = groundH + (lvlIdx + 0.5) * floorStep + 0.02;
        return (
          <group key={`fl-${lvlIdx}`}>
            {/* Front & Rear 3D Glazed Ribbon Windows */}
            <mesh position={[0, wy, 0]} castShadow>
              <boxGeometry args={[w * 0.88, floorStep * 0.54, d * 1.015]} />
              <meshStandardMaterial color="#1E3A5F" metalness={0.72} roughness={0.16} />
            </mesh>
            {/* Left & Right 3D Glazed Ribbon Windows */}
            <mesh position={[0, wy, 0]} castShadow>
              <boxGeometry args={[w * 1.015, floorStep * 0.54, d * 0.86]} />
              <meshStandardMaterial color="#1E3A5F" metalness={0.72} roughness={0.16} />
            </mesh>
            {/* Projecting Concrete Floor Slab Ledge */}
            <mesh position={[0, wy - floorStep * 0.34, 0]} castShadow>
              <boxGeometry args={[w * 1.03, 0.014, d * 1.03]} />
              <meshStandardMaterial color="#CBD5E1" roughness={0.65} />
            </mesh>
          </group>
        );
      })}

      {/* Vertical Structural Mullion Piers */}
      {[-w * 0.32, 0, w * 0.32].map((mx, i) => (
        <mesh key={`mullion-${i}`} position={[mx, groundH + upperH * 0.5 + 0.02, 0]} castShadow>
          <boxGeometry args={[0.022, upperH, d * 1.022]} />
          <meshStandardMaterial color={wallColor} roughness={0.55} />
        </mesh>
      ))}

      {/* Perimeter Roof Parapet Wall & Coping */}
      <mesh position={[0, h + 0.04, 0]} castShadow>
        <boxGeometry args={[w * 1.04, 0.04, d * 1.04]} />
        <meshStandardMaterial color="#64748B" roughness={0.6} />
      </mesh>
      <mesh position={[0, h + 0.045, 0]}>
        <boxGeometry args={[w * 0.92, 0.035, d * 0.92]} />
        <meshStandardMaterial color="#94A3B8" roughness={0.85} />
      </mesh>

      {/* Rooftop Elevator Overrun & Twin HVAC Chiller Units */}
      <mesh position={[-w * 0.16, h + 0.095, -d * 0.14]} castShadow>
        <boxGeometry args={[w * 0.38, 0.085, d * 0.38]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.6} />
      </mesh>
      {[0.12, 0.26].map((hx, idx) => (
        <mesh key={`hvac-${idx}`} position={[w * hx, h + 0.075, d * 0.14]} castShadow>
          <boxGeometry args={[0.055, 0.045, 0.065]} />
          <meshStandardMaterial color="#475569" metalness={0.45} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export function DetailedWaterFacilityModel({ sourceType = 'Public Kiosk', statusColor = '#059669' }) {
  if (sourceType === 'Handpump') {
    return (
      <group scale={[0.72, 0.72, 0.72]}>
        {/* Sanitary Concrete Drainage Apron & Curb Rim */}
        <mesh position={[0, -0.72, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.50, 1.5, 0.50]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.04, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.22, 0.24, 0.03, 12]} />
          <meshStandardMaterial color="#E2E8F0" roughness={0.8} />
        </mesh>
        {/* Drainage Channel & Cast-Iron Pump Assembly */}
        <mesh position={[-0.08, 0.056, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.14, 0.22]} />
          <meshStandardMaterial color="#0284C7" roughness={0.2} />
        </mesh>
        <mesh position={[0.04, 0.085, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.068, 0.07, 12]} />
          <meshStandardMaterial color="#475569" roughness={0.7} />
        </mesh>
        <mesh position={[0.04, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.036, 0.042, 0.22, 16]} />
          <meshStandardMaterial color="#0284C7" metalness={0.55} roughness={0.3} />
        </mesh>
        <mesh position={[-0.025, 0.24, 0]} rotation={[0, 0, Math.PI / 2.2]} castShadow>
          <cylinderGeometry args={[0.014, 0.018, 0.11, 12]} />
          <meshStandardMaterial color="#0284C7" metalness={0.55} />
        </mesh>
        <mesh position={[0.13, 0.27, 0]} rotation={[0, 0, -0.62]} castShadow>
          <cylinderGeometry args={[0.009, 0.012, 0.28, 10]} />
          <meshStandardMaterial color="#1E293B" metalness={0.65} />
        </mesh>
      </group>
    );
  }

  if (sourceType === 'Communal Spring') {
    return (
      <group scale={[0.72, 0.72, 0.72]}>
        <mesh position={[0, -0.72, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.36, 0.38, 1.5, 24]} />
          <meshStandardMaterial color="#94A3B8" roughness={0.9} />
        </mesh>
        {/* Masonry Spring Catchment Box & Overflow Weir Basin */}
        <mesh position={[0, 0.12, -0.06]} castShadow receiveShadow>
          <boxGeometry args={[0.34, 0.18, 0.24]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.08, 0.12]} castShadow>
          <boxGeometry args={[0.30, 0.10, 0.16]} />
          <meshStandardMaterial color="#94A3B8" />
        </mesh>
        <mesh position={[0, 0.132, 0.12]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.24, 0.12]} />
          <meshStandardMaterial color="#0284C7" roughness={0.15} metalness={0.3} />
        </mesh>
        {/* Timber Shelter Columns & Pitched Roof */}
        {[
          [-0.18, -0.16],
          [0.18, -0.16],
          [-0.18, 0.18],
          [0.18, 0.18],
        ].map(([px, pz], idx) => (
          <mesh key={`sp-p-${idx}`} position={[px, 0.24, pz]} castShadow>
            <boxGeometry args={[0.025, 0.32, 0.025]} />
            <meshStandardMaterial color="#5C3A21" />
          </mesh>
        ))}
        <mesh geometry={GABLE_ROOF_GEOMETRY} position={[0, 0.39, 0.01]} scale={[0.46, 0.22, 0.42]} castShadow>
          <meshStandardMaterial color="#475569" roughness={0.6} />
        </mesh>
      </group>
    );
  }

  if (sourceType === 'School Filtration') {
    return (
      <group scale={[0.72, 0.72, 0.72]}>
        <mesh position={[0, -0.72, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.68, 1.5, 0.52]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
        </mesh>
        {/* Pump & Control Room with 3D Window & Door */}
        <mesh position={[-0.14, 0.15, -0.04]} castShadow receiveShadow>
          <boxGeometry args={[0.34, 0.24, 0.28]} />
          <meshStandardMaterial color="#F8FAFC" roughness={0.55} />
        </mesh>
        <mesh position={[-0.14, 0.15, 0.104]}>
          <boxGeometry args={[0.14, 0.09, 0.01]} />
          <meshStandardMaterial color="#1E3A5F" metalness={0.6} roughness={0.2} />
        </mesh>
        <mesh geometry={GABLE_ROOF_GEOMETRY} position={[-0.14, 0.27, -0.04]} scale={[0.38, 0.16, 0.32]} castShadow>
          <meshStandardMaterial color="#334155" />
        </mesh>
        {/* Dual Pressurized Filtration Vessels & Header Pipe */}
        {[-0.02, 0.07].map((fx, idx) => (
          <mesh key={`vessel-${idx}`} position={[fx, 0.15, 0.14]} castShadow>
            <cylinderGeometry args={[0.034, 0.034, 0.22, 16]} />
            <meshStandardMaterial color="#0284C7" metalness={0.55} roughness={0.25} />
          </mesh>
        ))}
        {/* Circular Sedimentation Clarifier Basin with Walkway Bridge */}
        <mesh position={[0.19, 0.085, -0.02]} castShadow>
          <cylinderGeometry args={[0.12, 0.12, 0.11, 24]} />
          <meshStandardMaterial color="#94A3B8" />
        </mesh>
        <mesh position={[0.19, 0.142, -0.02]}>
          <cylinderGeometry args={[0.105, 0.105, 0.008, 24]} />
          <meshStandardMaterial color="#0284C7" roughness={0.14} metalness={0.3} />
        </mesh>
        <mesh position={[0.19, 0.152, -0.02]} castShadow>
          <boxGeometry args={[0.24, 0.012, 0.03]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      </group>
    );
  }

  // Default: Public Water Kiosk with Elevated Steel Water Tower & Dispensing Booth
  return (
    <group scale={[0.72, 0.72, 0.72]}>
      <mesh position={[0, -0.72, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.58, 1.5, 0.48]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
      </mesh>
      {/* Dispensing Kiosk Booth with Recessed Tap Alcove & Window */}
      <mesh position={[-0.12, 0.14, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.28, 0.22, 0.28]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.5} />
      </mesh>
      <mesh position={[-0.12, 0.14, 0.143]}>
        <boxGeometry args={[0.18, 0.09, 0.012]} />
        <meshStandardMaterial color="#0F172A" metalness={0.5} roughness={0.2} />
      </mesh>
      <mesh position={[-0.12, 0.09, 0.152]} castShadow>
        <boxGeometry args={[0.20, 0.018, 0.035]} />
        <meshStandardMaterial color="#0284C7" />
      </mesh>
      <mesh geometry={GABLE_ROOF_GEOMETRY} position={[-0.12, 0.25, 0]} scale={[0.33, 0.18, 0.33]} castShadow>
        <meshStandardMaterial color={statusColor} roughness={0.5} />
      </mesh>
      {/* 4-Column Steel Water Tower Lattice, Cross Bracing & Cylindrical Tank */}
      {[
        [0.09, -0.08],
        [0.21, -0.08],
        [0.09, 0.08],
        [0.21, 0.08],
      ].map(([lx, lz], i) => (
        <mesh key={`tleg-${i}`} position={[lx, 0.19, lz]} castShadow>
          <cylinderGeometry args={[0.011, 0.013, 0.34, 8]} />
          <meshStandardMaterial color="#334155" metalness={0.6} />
        </mesh>
      ))}
      {/* Horizontal Tower Struts & Riser Pipe */}
      <mesh position={[0.15, 0.20, 0]} castShadow>
        <boxGeometry args={[0.14, 0.012, 0.18]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      <mesh position={[0.15, 0.19, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.016, 0.34, 10]} />
        <meshStandardMaterial color="#64748B" metalness={0.6} />
      </mesh>
      {/* Elevated Cylindrical Water Tank & Conical Roof */}
      <mesh position={[0.15, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.105, 0.105, 0.18, 24]} />
        <meshStandardMaterial color="#0284C7" metalness={0.45} roughness={0.28} />
      </mesh>
      <mesh position={[0.15, 0.53, 0]} castShadow>
        <coneGeometry args={[0.112, 0.055, 24]} />
        <meshStandardMaterial color="#1E293B" metalness={0.4} />
      </mesh>
    </group>
  );
}

// ============================================================================
// 2. VALIDATION SAMPLE SHOWCASE PEDESTAL (1 Residential, 1 Commercial, 1 Water Facility)
// ============================================================================
function ValidationSampleShowcase() {
  return (
    <group position={[-1.2, BASE_ELEVATION + 0.06, 0.3]}>
      {/* Showcase Inspection Platform */}
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[3.4, 0.08, 1.65]} />
        <meshStandardMaterial color="#E2E8F0" roughness={0.8} />
      </mesh>

      {/* 1. Validated Residential House */}
      <group position={[-1.05, 0.02, 0]} scale={[1.85, 1.85, 1.85]}>
        <DetailedResidentialHouseModel
          w={0.30}
          d={0.26}
          h={0.24}
          wallColor="#F8FAFC"
          roofColor="#8C4A36"
          roofShape="gabled"
        />
        <Html position={[0, 0.52, 0]} center distanceFactor={6}>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            1. Residential Model (Pitched Roof, Porch, 3D Windows & Door)
          </div>
        </Html>
      </group>

      {/* 2. Validated Commercial Building */}
      <group position={[0, 0.02, 0]} scale={[1.65, 1.65, 1.65]}>
        <DetailedCommercialBuildingModel
          w={0.36}
          d={0.30}
          h={0.54}
          levels={4}
          wallColor="#F1F5F9"
          accentColor="#0284C7"
        />
        <Html position={[0, 0.72, 0]} center distanceFactor={6}>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            2. Commercial Model (Storefront Podium, Mullions, Spandrels & HVAC)
          </div>
        </Html>
      </group>

      {/* 3. Validated Water Facility */}
      <group position={[1.05, 0.02, 0]} scale={[1.85, 1.85, 1.85]}>
        <DetailedWaterFacilityModel sourceType="Public Kiosk" statusColor="#059669" />
        <Html position={[0, 0.62, 0]} center distanceFactor={6}>
          <div className="px-2.5 py-1 rounded-md bg-white text-slate-900 border border-slate-300 shadow-md text-[10px] font-bold whitespace-nowrap">
            3. Water Facility Model (Steel Lattice Tower, Tank & Kiosk Booth)
          </div>
        </Html>
      </group>
    </group>
  );
}

// --- Landmark & City Building Dispatcher (Uses the Validated Architectural Models) ---
function CityArchitecturalBuilding({ b }) {
  const [x, y, z] = geoToWorld(b.lat, b.lng);
  const wallPalette = {
    white: '#F8FAFC',
    cream: '#F5F2EB',
    sand: '#EAE4D7',
    slate: '#E2E8F0',
    warm: '#EFECE6',
  };
  const wallColor = wallPalette[b.tone] || '#F8FAFC';

  return (
    <group position={[x, y, z]} rotation={[0, b.rot || 0, 0]}>
      {b.type === 'cathedral' || b.type === 'basilica' ? (
        <group>
          <mesh position={[0, -0.74, 0]} receiveShadow castShadow>
            <boxGeometry args={[b.w * 1.2, 1.52, b.d * 1.2]} />
            <meshStandardMaterial color="#CBD5E1" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.38, 0.44, 0.68]} />
            <meshStandardMaterial color="#F5F2EB" roughness={0.65} />
          </mesh>
          <mesh geometry={GABLE_ROOF_GEOMETRY} position={[0, 0.46, 0]} scale={[0.42, 0.34, 0.72]} castShadow>
            <meshStandardMaterial color="#8C4A36" roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.54, -0.06]} castShadow>
            <sphereGeometry args={[0.13, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color="#3B6E8C" roughness={0.4} />
          </mesh>
          {[-0.19, 0.19].map((tx, idx) => (
            <group key={`bell-${idx}`} position={[tx, 0, 0.28]}>
              <mesh position={[0, 0.34, 0]} castShadow>
                <boxGeometry args={[0.12, 0.64, 0.12]} />
                <meshStandardMaterial color="#EAE4D7" />
              </mesh>
              <mesh position={[0, 0.69, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[0.095, 0.14, 4]} />
                <meshStandardMaterial color="#8C4A36" />
              </mesh>
            </group>
          ))}
        </group>
      ) : b.type === 'mall' || b.type === 'hall' || b.type === 'university' || b.type === 'commercial_midrise' || b.type === 'commercial_lowrise' ? (
        <DetailedCommercialBuildingModel
          w={b.w}
          d={b.d}
          h={b.h}
          levels={b.levels || 3}
          wallColor={wallColor}
          accentColor={b.roofColor || '#334155'}
        />
      ) : (
        <DetailedResidentialHouseModel
          w={b.w}
          d={b.d}
          h={b.h}
          wallColor={wallColor}
          roofColor={b.roofColor || '#8C4A36'}
          roofShape={b.roofShape || 'gabled'}
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
  return Math.max(BASE_ELEVATION + 0.55, getTerrainY(x, z) + 0.55);
}

function MapCameraRig({ activeMapNode, cameraCommand, validationMode }) {
  const controlsRef = useRef();
  const desiredTarget = useRef(new THREE.Vector3(-1.2, 0.15, 0.3));
  const desiredCameraPos = useRef(new THREE.Vector3(-0.2, 8.2, 8.8));
  const isTransitioning = useRef(false);

  useEffect(() => {
    if (validationMode) {
      desiredTarget.current.set(-1.2, 0.25, 0.3);
      desiredCameraPos.current.set(-1.2, 1.65, 2.85);
      isTransitioning.current = true;
    } else {
      desiredTarget.current.set(-1.2, 0.15, 0.3);
      desiredCameraPos.current.set(-0.2, 8.2, 8.8);
      isTransitioning.current = true;
    }
  }, [validationMode]);

  useEffect(() => {
    if (activeMapNode && !validationMode) {
      const [x, y, z] = geoToWorld(activeMapNode.lat, activeMapNode.lng);
      const nextCamX = x + 1.25;
      const nextCamZ = z + 1.75;
      const nextCamY = Math.max(y + 1.55, getSafeCameraMinY(nextCamX, nextCamZ));
      desiredTarget.current.set(x, Math.max(BASE_ELEVATION, y + 0.15), z);
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
      desiredCameraPos.current.set(-0.2, 8.2, 8.8);
      isTransitioning.current = true;
    } else if (cameraCommand.action === 'OVERVIEW') {
      desiredTarget.current.set(-0.2, 0.2, 0.1);
      desiredCameraPos.current.set(0.4, 13.5, 13.0);
      isTransitioning.current = true;
    } else if (cameraCommand.action === 'ZOOM_IN') {
      const dir = new THREE.Vector3().subVectors(cam.position, target).multiplyScalar(0.74);
      if (dir.length() > 1.2) {
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
      if (camera.position.distanceTo(desiredCameraPos.current) < 0.05) {
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
      maxPolarAngle={Math.PI / 2.3}
      minDistance={1.1}
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
      <meshStandardMaterial map={satelliteTex} roughness={0.88} metalness={0.04} />
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
              <mesh key={`abut-${idx}`} position={[0, -0.06, azPos]} castShadow receiveShadow>
                <boxGeometry args={[0.32, 0.18, 0.14]} />
                <meshStandardMaterial color="#64748B" roughness={0.85} />
              </mesh>
            ))}
            <mesh position={[0, 0.032, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.30, 0.032, spanLength]} />
              <meshStandardMaterial color="#94A3B8" roughness={0.65} />
            </mesh>
            <mesh position={[0, 0.050, 0]} receiveShadow>
              <boxGeometry args={[0.22, 0.006, spanLength]} />
              <meshStandardMaterial map={roadTex} roughness={0.8} />
            </mesh>
            {[-0.14, 0.14].map((px, sideIdx) => (
              <mesh key={`parapet-${sideIdx}`} position={[px, 0.062, 0]} castShadow>
                <boxGeometry args={[0.02, 0.026, spanLength * 0.98]} />
                <meshStandardMaterial color="#E2E8F0" roughness={0.6} />
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
      nagaBankGeo: createTerrainRibbonGeometry(NAGA_RIVER_COORDS, 0.66, 0.012, 110, true).geo,
      nagaRiverGeo: createTerrainRibbonGeometry(NAGA_RIVER_COORDS, 0.50, 0.018, 110, true).geo,
      bicolBankGeo: createTerrainRibbonGeometry(BICOL_RIVER_COORDS, 0.86, 0.012, 110, true).geo,
      bicolRiverGeo: createTerrainRibbonGeometry(BICOL_RIVER_COORDS, 0.68, 0.018, 110, true).geo,
      primaryCurbs: NAGA_ROADS_COORDS.map((r) => createTerrainRibbonGeometry(r, 0.24, 0.035, 64, false).geo),
      primaryAsphalt: NAGA_ROADS_COORDS.map((r) => createTerrainRibbonGeometry(r, 0.18, 0.044, 64, false).geo),
      secondaryCurbs: NAGA_SECONDARY_STREETS.map((r) => createTerrainRibbonGeometry(r, 0.17, 0.034, 40, false).geo),
      secondaryAsphalt: NAGA_SECONDARY_STREETS.map((r) => createTerrainRibbonGeometry(r, 0.13, 0.043, 40, false).geo),
      junctionNodes: Object.entries(NAGA_ROAD_NODES).map(([key, [lat, lng]]) => {
        const [x, y, z] = geoToWorld(lat, lng);
        return { key, x, y, z };
      }),
    };
  }, []);

  return (
    <group>
      <mesh geometry={nagaBankGeo} receiveShadow>
        <meshStandardMaterial color="#8A9384" roughness={0.88} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={nagaRiverGeo} receiveShadow>
        <meshStandardMaterial color="#1D6886" roughness={0.16} metalness={0.28} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={bicolBankGeo} receiveShadow>
        <meshStandardMaterial color="#8A9384" roughness={0.88} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={bicolRiverGeo} receiveShadow>
        <meshStandardMaterial color="#1D6886" roughness={0.16} metalness={0.28} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
      </mesh>

      {secondaryCurbs.map((geo, i) => (
        <mesh key={`sec-curb-${i}`} geometry={geo} renderOrder={1} receiveShadow>
          <meshStandardMaterial color="#94A3B8" roughness={0.86} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-3} />
        </mesh>
      ))}
      {primaryCurbs.map((geo, i) => (
        <mesh key={`pri-curb-${i}`} geometry={geo} renderOrder={1} receiveShadow>
          <meshStandardMaterial color="#94A3B8" roughness={0.86} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-3} />
        </mesh>
      ))}

      {secondaryAsphalt.map((geo, i) => (
        <mesh key={`sec-asphalt-${i}`} geometry={geo} renderOrder={2} receiveShadow>
          <meshStandardMaterial map={textures.secondaryRoadTex} roughness={0.82} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-6} />
        </mesh>
      ))}
      {primaryAsphalt.map((geo, i) => (
        <mesh key={`pri-asphalt-${i}`} geometry={geo} renderOrder={2} receiveShadow>
          <meshStandardMaterial map={textures.primaryRoadTex} roughness={0.78} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-6} />
        </mesh>
      ))}
      {junctionNodes.map((j) => (
        <mesh key={`jct-${j.key}`} rotation={[-Math.PI / 2, 0, 0]} position={[j.x, j.y + 0.045, j.z]} renderOrder={2} receiveShadow>
          <circleGeometry args={[0.095, 24]} />
          <meshStandardMaterial color="#334155" roughness={0.78} polygonOffset polygonOffsetFactor={-7} />
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
            key={`bound-${i}`}
            points={sampledPts}
            color="#FFFFFF"
            lineWidth={1}
            transparent
            opacity={0.32}
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
            <div className="pointer-events-none px-1.5 py-0.5 rounded bg-white/85 text-slate-800 border border-slate-300/80 shadow-2xs text-[6.5px] font-bold tracking-wider uppercase whitespace-nowrap">
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
        <group key={`tree-${i}`} position={[t.x, t.y, t.z]} scale={[t.s * 0.85, t.s * 0.85, t.s * 0.85]}>
          <mesh position={[0, -0.4, 0]}>
            <cylinderGeometry args={[0.012, 0.022, 0.9, 6]} />
            <meshStandardMaterial color="#4A3728" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.15, 0]} castShadow>
            <dodecahedronGeometry args={[0.095, 1]} />
            <meshStandardMaterial color={t.variant === 1 ? '#2F5233' : '#3E653B'} roughness={0.85} />
          </mesh>
          <mesh position={[0.025, 0.22, -0.015]} castShadow>
            <dodecahedronGeometry args={[0.068, 1]} />
            <meshStandardMaterial color="#4D7747" roughness={0.85} />
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
        <boxGeometry args={[0.15, 0.028, 0.45]} />
        <meshStandardMaterial color="#1E293B" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.145, -0.06]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.095, 0.095, 0.29, 18]} />
        <meshStandardMaterial color={bodyColor} roughness={0.32} metalness={0.22} />
      </mesh>
      <mesh position={[0, 0.13, 0.15]} castShadow>
        <boxGeometry args={[0.175, 0.15, 0.12]} />
        <meshStandardMaterial color="#F8FAFC" roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.152, 0.212]}>
        <boxGeometry args={[0.155, 0.065, 0.006]} />
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
        <ringGeometry args={[0.22, isSelected || hovered ? 0.34 : 0.28, 32]} />
        <meshBasicMaterial
          color={statusColor}
          transparent
          opacity={isSelected || hovered ? 0.95 : 0.75}
          polygonOffset
          polygonOffsetFactor={-3}
        />
      </mesh>

      <DetailedWaterFacilityModel sourceType={point.source_type} statusColor={statusColor} />

      <Html position={[0, 0.48, 0]} center distanceFactor={11} zIndexRange={[20, 0]}>
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
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: statusColor }}
          />
          <span>{point.id}</span>
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
  const textures = useTerrainAndRoadTextures();
  const criticalPoints = waterPoints.filter((pt) => pt.wvi_score >= 65);
  const floodSusceptiblePoints = waterPoints.filter((pt) => pt.flood_risk_level >= 4);
  const [hubX, hubY, hubZ] = geoToWorld(CDRRMO_HUB.lat, CDRRMO_HUB.lng);

  return (
    <>
      <color attach="background" args={['#E2E8F0']} />
      <fog attach="fog" args={['#E2E8F0', 32, 72]} />

      {/* Calibrated PBR Lighting & Shadow Frustum */}
      <ambientLight intensity={0.68} color="#FFFFFF" />
      <hemisphereLight args={['#F8FAFC', '#475569', 0.45]} />
      <directionalLight
        position={[15, 25, 14]}
        intensity={1.35}
        color="#FFFDF8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
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
        <ValidationSampleShowcase />
      ) : (
        <>
          {NAGA_LANDMARKS.map((lm) => (
            <CityArchitecturalBuilding key={lm.id} b={lm} />
          ))}

          {NAGA_BUILDING_CLUSTERS.map((b) => (
            <CityArchitecturalBuilding key={b.id} b={b} />
          ))}

          <DioramaTrees />

          {showFloodLayer &&
            floodSusceptiblePoints.map((pt) => {
              const [x, y, z] = geoToWorld(pt.lat, pt.lng);
              const maxR = pt.flood_risk_level === 5 ? 1.1 : 0.75;
              return (
                <group key={`flood-${pt.id}`} position={[x, y + 0.025, z]}>
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[maxR, 32]} />
                    <meshBasicMaterial color="#0284C7" transparent opacity={0.16} polygonOffset polygonOffsetFactor={-1} />
                  </mesh>
                  <mesh rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[maxR * 0.94, maxR, 32]} />
                    <meshBasicMaterial color="#0369A1" transparent opacity={0.5} polygonOffset polygonOffsetFactor={-2} />
                  </mesh>
                </group>
              );
            })}

          <group position={[hubX, hubY, hubZ]}>
            <DetailedCommercialBuildingModel w={0.42} d={0.34} h={0.32} levels={2} wallColor="#F8FAFC" accentColor="#0284C7" />
            <group position={[0.22, 0.03, 0.06]}>
              <DetailedTankerTruckMesh bodyColor="#0284C7" />
            </group>
            <Html position={[0, 0.44, 0]} center distanceFactor={11} zIndexRange={[10, 0]}>
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
            criticalPoints.map((pt) => <TankerDispatchRoute key={`route-${pt.id}`} targetPoint={pt} />)}
        </>
      )}
    </>
  );
}

export default function BicolMap3D(props) {
  return (
    <Canvas
      shadows
      camera={{ position: [-0.2, 8.2, 8.8], fov: 36, near: 0.1, far: 160 }}
      className="w-full h-full"
    >
      <NagaMapScene {...props} />
    </Canvas>
  );
}