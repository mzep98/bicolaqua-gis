import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import {
  geoToWorld,
  getTerrainY,
  getShortestRoadRouteCoords,
  BASE_ELEVATION,
  LOGO_PALETTE,
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

function useProceduralTextures() {
  return useMemo(() => {
    const stoneCanvas = document.createElement('canvas');
    stoneCanvas.width = 128;
    stoneCanvas.height = 128;
    const sCtx = stoneCanvas.getContext('2d');
    sCtx.fillStyle = '#9A9488';
    sCtx.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 6; r++) {
      const colW = 128 / 4;
      const offset = (r % 2) * (colW * 0.5);
      for (let c = -1; c <= 4; c++) {
        const shade = 135 + ((r * 17 + c * 29) % 32);
        sCtx.fillStyle = `rgb(${shade}, ${shade - 4}, ${shade - 12})`;
        sCtx.fillRect(c * colW + offset + 2, r * (128 / 6) + 2, colW - 4, 128 / 6 - 4);
      }
    }
    const stoneTex = new THREE.CanvasTexture(stoneCanvas);
    stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
    stoneTex.repeat.set(3, 2);

    const corrCanvas = document.createElement('canvas');
    corrCanvas.width = 64;
    corrCanvas.height = 64;
    const cCtx = corrCanvas.getContext('2d');
    for (let x = 0; x < 64; x += 4) {
      cCtx.fillStyle = x % 8 === 0 ? '#7D746D' : '#5E5650';
      cCtx.fillRect(x, 0, 2, 64);
    }
    const corrTex = new THREE.CanvasTexture(corrCanvas);
    corrTex.wrapS = corrTex.wrapT = THREE.RepeatWrapping;
    corrTex.repeat.set(4, 2);

    const winCanvas = document.createElement('canvas');
    winCanvas.width = 128;
    winCanvas.height = 128;
    const wCtx = winCanvas.getContext('2d');
    wCtx.fillStyle = LOGO_PALETTE.white;
    wCtx.fillRect(0, 0, 128, 128);
    for (let y = 10; y < 118; y += 22) {
      wCtx.fillStyle = '#E2E8F0';
      wCtx.fillRect(0, y - 3, 128, 2);
      for (let x = 10; x < 118; x += 24) {
        wCtx.fillStyle = '#CBD5E1';
        wCtx.fillRect(x - 1, y - 1, 16, 13);
        wCtx.fillStyle = LOGO_PALETTE.yaleBlue;
        wCtx.fillRect(x, y, 14, 11);
        wCtx.fillStyle = LOGO_PALETTE.pacificBlue;
        wCtx.fillRect(x + 2, y + 2, 4, 7);
      }
    }
    const winTex = new THREE.CanvasTexture(winCanvas);
    winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;

    // Pure Asphalt Texture (ZERO sidewalk stripes baked into the asphalt texture so intersections never show lines cutting across)
    const priRoadCanvas = document.createElement('canvas');
    priRoadCanvas.width = 128;
    priRoadCanvas.height = 128;
    const prCtx = priRoadCanvas.getContext('2d');
    prCtx.fillStyle = '#3B4656';
    prCtx.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 2) {
      for (let x = 0; x < 128; x += 2) {
        const v = 54 + ((x * 19 + y * 37) % 10);
        prCtx.fillStyle = `rgb(${v}, ${v + 8}, ${v + 18})`;
        prCtx.fillRect(x, y, 2, 2);
      }
    }
    const primaryRoadTex = new THREE.CanvasTexture(priRoadCanvas);
    primaryRoadTex.wrapS = THREE.RepeatWrapping;
    primaryRoadTex.wrapT = THREE.RepeatWrapping;

    const secRoadCanvas = document.createElement('canvas');
    secRoadCanvas.width = 64;
    secRoadCanvas.height = 64;
    const srCtx = secRoadCanvas.getContext('2d');
    srCtx.fillStyle = '#4B5768';
    srCtx.fillRect(0, 0, 64, 64);
    const secondaryRoadTex = new THREE.CanvasTexture(secRoadCanvas);
    secondaryRoadTex.wrapS = THREE.RepeatWrapping;
    secondaryRoadTex.wrapT = THREE.RepeatWrapping;

    return { stoneTex, corrTex, winTex, primaryRoadTex, secondaryRoadTex };
  }, []);
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
  const centerPts = [];
  const up = new THREE.Vector3(0, 1, 0);
  let cumulativeDist = 0;

  if (smoothCatmull && controlPts.length >= 3) {
    const curve = new THREE.CatmullRomCurve3(controlPts);
    const points = curve.getSpacedPoints(samples);
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      centerPts.push(pt);
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

        let jointSide = side;
        if (s === subSteps && seg < controlPts.length - 2) {
          const p2 = controlPts[seg + 2];
          const nextDir = new THREE.Vector3(p2.x - p1.x, 0, p2.z - p1.z).normalize();
          const nextSide = new THREE.Vector3().crossVectors(nextDir, up).normalize();
          const avg = new THREE.Vector3().addVectors(side, nextSide);
          if (avg.lengthSq() > 0.01) {
            avg.normalize();
            const dot = Math.max(0.55, avg.dot(side));
            jointSide = avg.multiplyScalar(1 / dot);
          }
        }

        const lx = px - jointSide.x * (width * 0.5);
        const lz = pz - jointSide.z * (width * 0.5);
        const rx = px + jointSide.x * (width * 0.5);
        const rz = pz + jointSide.z * (width * 0.5);
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
  return { geo, centerPts };
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
      const arch = Math.sin(t * Math.PI) * 0.082;
      return base + 0.088 + arch;
    }
  }
  return base + 0.046;
}

function getSafeCameraMinY(x, z) {
  const localTerrainY = getTerrainY(x, z);
  return Math.max(BASE_ELEVATION + 1.15, localTerrainY + 0.95);
}

// --- Full-Viewport Naga City Camera Rig (Fits All 27 Barangays & Prevents Zooming Out Into Empty Space) ---
function MapCameraRig({ activeMapNode, cameraCommand }) {
  const controlsRef = useRef();
  const desiredTarget = useRef(new THREE.Vector3(-0.4, 0.2, 0.2));
  const desiredCameraPos = useRef(new THREE.Vector3(0.4, 13.8, 13.2));
  const isTransitioning = useRef(false);

  useEffect(() => {
    if (activeMapNode) {
      const [x, y, z] = geoToWorld(activeMapNode.lat, activeMapNode.lng);
      const nextCamX = x + 1.6;
      const nextCamZ = z + 2.2;
      const nextCamY = Math.max(y + 2.1, getSafeCameraMinY(nextCamX, nextCamZ));
      desiredTarget.current.set(x, Math.max(BASE_ELEVATION, y + 0.15), z);
      desiredCameraPos.current.set(nextCamX, nextCamY, nextCamZ);
      isTransitioning.current = true;
    }
  }, [activeMapNode]);

  useEffect(() => {
    if (!cameraCommand || !controlsRef.current) return;
    const cam = controlsRef.current.object;
    const target = controlsRef.current.target;
    if (cameraCommand.action === 'RESET') {
      desiredTarget.current.set(-0.4, 0.2, 0.2);
      desiredCameraPos.current.set(0.4, 13.8, 13.2);
      isTransitioning.current = true;
    } else if (cameraCommand.action === 'ZOOM_IN') {
      const dir = new THREE.Vector3().subVectors(cam.position, target).multiplyScalar(0.72);
      if (dir.length() > 1.8) {
        const nextPos = new THREE.Vector3().copy(target).add(dir);
        nextPos.y = Math.max(nextPos.y, getSafeCameraMinY(nextPos.x, nextPos.z));
        desiredCameraPos.current.copy(nextPos);
        isTransitioning.current = true;
      }
    } else if (cameraCommand.action === 'ZOOM_OUT') {
      const dir = new THREE.Vector3().subVectors(cam.position, target).multiplyScalar(1.25);
      const clampedDir = dir.length() > 19.5 ? dir.normalize().multiplyScalar(19.5) : dir;
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

    const t = controlsRef.current.target;
    t.x = THREE.MathUtils.clamp(t.x, -12.0, 12.0);
    t.z = THREE.MathUtils.clamp(t.z, -9.0, 9.0);
    t.y = THREE.MathUtils.clamp(t.y, BASE_ELEVATION, 3.2);

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
      maxPolarAngle={Math.PI / 2.4}
      minDistance={1.6}
      maxDistance={19.5}
    />
  );
}

function NagaTerrainMesh({ onBackgroundClick }) {
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(76, 62, 260, 210);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];

    const cUrbanPlaza = new THREE.Color('#D5D0C3');
    const cSuburban = new THREE.Color('#B4C89B');
    const cLowland = new THREE.Color('#97BA7E');
    const cFarmland = new THREE.Color('#A9C686');
    const cFoothill = new THREE.Color('#77A15E');
    const cPeak = new THREE.Color('#568045');

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = getTerrainY(x, z);
      pos.setY(i, y);

      const color = cLowland.clone();
      const distCentro = Math.hypot(x - -3.2, z - 0.5);

      if (y > 1.2) {
        color.copy(cFoothill).lerp(cPeak, Math.min(1, (y - 1.2) / 1.9));
      } else if (y > 0.25) {
        color.copy(cSuburban).lerp(cFoothill, (y - 0.25) / 0.95);
      } else if (distCentro < 4.2) {
        color.lerp(cUrbanPlaza, Math.pow(1 - distCentro / 4.2, 1.3) * 0.78);
      } else if (distCentro < 7.5) {
        color.lerp(cSuburban, (1 - (distCentro - 4.2) / 3.3) * 0.55);
      } else {
        const checker = Math.sin(x * 1.6) * Math.cos(z * 1.6);
        if (checker > 0.15) color.lerp(cFarmland, 0.65);
      }
      colors.push(color.r, color.g, color.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <group onClick={onBackgroundClick}>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0.02} flatShading={true} />
      </mesh>
    </group>
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
                <boxGeometry args={[0.36, 0.18, 0.14]} />
                <meshStandardMaterial color="#94A3B8" roughness={0.85} />
              </mesh>
            ))}

            <mesh position={[0, 0.016, -spanLength * 0.34]} rotation={[-0.12, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.34, 0.026, spanLength * 0.34]} />
              <meshStandardMaterial color="#CBD5E1" roughness={0.65} />
            </mesh>
            <mesh position={[0, 0.032, -spanLength * 0.34]} rotation={[-0.12, 0, 0]} receiveShadow>
              <boxGeometry args={[0.26, 0.006, spanLength * 0.34]} />
              <meshStandardMaterial map={roadTex} roughness={0.78} />
            </mesh>

            <mesh position={[0, 0.038, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.34, 0.032, spanLength * 0.42]} />
              <meshStandardMaterial color="#CBD5E1" roughness={0.6} />
            </mesh>
            <mesh position={[0, 0.055, 0]} receiveShadow>
              <boxGeometry args={[0.26, 0.006, spanLength * 0.42]} />
              <meshStandardMaterial map={roadTex} roughness={0.78} />
            </mesh>

            <mesh position={[0, 0.016, spanLength * 0.34]} rotation={[0.12, 0, 0]} castShadow receiveShadow>
              <boxGeometry args={[0.34, 0.026, spanLength * 0.34]} />
              <meshStandardMaterial color="#CBD5E1" roughness={0.65} />
            </mesh>
            <mesh position={[0, 0.032, spanLength * 0.34]} rotation={[0.12, 0, 0]} receiveShadow>
              <boxGeometry args={[0.26, 0.006, spanLength * 0.34]} />
              <meshStandardMaterial map={roadTex} roughness={0.78} />
            </mesh>

            {[-0.16, 0.16].map((px, sideIdx) => (
              <group key={`parapet-${sideIdx}`}>
                <mesh position={[px, 0.058, 0]} castShadow>
                  <boxGeometry args={[0.024, 0.022, spanLength * 0.96]} />
                  <meshStandardMaterial color={LOGO_PALETTE.white} roughness={0.55} />
                </mesh>
                <mesh position={[px, 0.082, 0]} castShadow>
                  <boxGeometry args={[0.014, 0.01, spanLength * 0.96]} />
                  <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} metalness={0.5} roughness={0.4} />
                </mesh>
                {[-0.42, -0.21, 0, 0.21, 0.42].map((f, pIdx) => (
                  <mesh key={`post-${pIdx}`} position={[px, 0.072, spanLength * f]} castShadow>
                    <boxGeometry args={[0.016, 0.026, 0.016]} />
                    <meshStandardMaterial color="#CBD5E1" />
                  </mesh>
                ))}
              </group>
            ))}

            {[
              [-0.16, -spanLength * 0.16],
              [0.16, spanLength * 0.16],
            ].map(([lx, lz], lIdx) => (
              <group key={`lamp-${lIdx}`} position={[lx, 0.085, lz]}>
                <mesh position={[0, 0.06, 0]} castShadow>
                  <cylinderGeometry args={[0.006, 0.008, 0.12, 8]} />
                  <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} metalness={0.6} />
                </mesh>
                <mesh position={[lx < 0 ? 0.025 : -0.025, 0.12, 0]}>
                  <boxGeometry args={[0.055, 0.008, 0.014]} />
                  <meshStandardMaterial color={LOGO_PALETTE.electricAqua} emissive={LOGO_PALETTE.strongCyan} emissiveIntensity={0.45} />
                </mesh>
              </group>
            ))}

            {[-spanLength * 0.15, spanLength * 0.15].map((pz, pierIdx) => (
              <group key={`pier-${pierIdx}`} position={[0, -0.005, pz]}>
                <mesh position={[0, 0.018, 0]} castShadow>
                  <boxGeometry args={[0.32, 0.018, 0.055]} />
                  <meshStandardMaterial color="#64748B" roughness={0.8} />
                </mesh>
                {[-0.09, 0.09].map((cx, cIdx) => (
                  <mesh key={`col-${cIdx}`} position={[cx, -0.05, 0]}>
                    <cylinderGeometry args={[0.026, 0.03, 0.14, 12]} />
                    <meshStandardMaterial color="#475569" roughness={0.85} />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        );
      })}
    </group>
  );
}

// --- Two-Pass Global Road Hierarchy (Pass 1 Sidewalks @ 0.035 -> Pass 2 Pure Asphalt @ 0.044) ---
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
    const nagaBank = createTerrainRibbonGeometry(NAGA_RIVER_COORDS, 0.74, 0.012, 110, true).geo;
    const nagaR = createTerrainRibbonGeometry(NAGA_RIVER_COORDS, 0.54, 0.018, 110, true).geo;
    const bicolBank = createTerrainRibbonGeometry(BICOL_RIVER_COORDS, 0.94, 0.012, 110, true).geo;
    const bicolR = createTerrainRibbonGeometry(BICOL_RIVER_COORDS, 0.72, 0.018, 110, true).geo;

    const priCurbs = NAGA_ROADS_COORDS.map(
      (road) => createTerrainRibbonGeometry(road, 0.32, 0.035, 64, false).geo
    );
    const priAsphalt = NAGA_ROADS_COORDS.map(
      (road) => createTerrainRibbonGeometry(road, 0.24, 0.044, 64, false).geo
    );

    const secCurbs = NAGA_SECONDARY_STREETS.map(
      (road) => createTerrainRibbonGeometry(road, 0.22, 0.034, 40, false).geo
    );
    const secAsphalt = NAGA_SECONDARY_STREETS.map(
      (road) => createTerrainRibbonGeometry(road, 0.16, 0.043, 40, false).geo
    );

    const junctions = Object.entries(NAGA_ROAD_NODES).map(([key, [lat, lng]]) => {
      const [x, y, z] = geoToWorld(lat, lng);
      return { key, x, y, z };
    });

    return {
      nagaBankGeo: nagaBank,
      nagaRiverGeo: nagaR,
      bicolBankGeo: bicolBank,
      bicolRiverGeo: bicolR,
      primaryCurbs: priCurbs,
      primaryAsphalt: priAsphalt,
      secondaryCurbs: secCurbs,
      secondaryAsphalt: secAsphalt,
      junctionNodes: junctions,
    };
  }, []);

  return (
    <group>
      {/* Riverbanks & Pacific Blue Hydrology (#00B3CD) */}
      <mesh geometry={nagaBankGeo} receiveShadow>
        <meshStandardMaterial color="#D6CBAF" roughness={0.9} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={nagaRiverGeo} receiveShadow>
        <meshStandardMaterial color={LOGO_PALETTE.pacificBlue} roughness={0.18} metalness={0.15} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
      <mesh geometry={bicolBankGeo} receiveShadow>
        <meshStandardMaterial color="#D6CBAF" roughness={0.9} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={bicolRiverGeo} receiveShadow>
        <meshStandardMaterial color={LOGO_PALETTE.pacificBlue} roughness={0.18} metalness={0.15} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-2} />
      </mesh>

      {/* PASS 1: All Sidewalk / Curb Base Ribbons (yOffset = 0.034–0.035, renderOrder = 1) */}
      {secondaryCurbs.map((geo, i) => (
        <mesh key={`sec-curb-${i}`} geometry={geo} renderOrder={1} receiveShadow>
          <meshStandardMaterial
            color="#D6D1C4"
            roughness={0.88}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-3}
          />
        </mesh>
      ))}
      {primaryCurbs.map((geo, i) => (
        <mesh key={`pri-curb-${i}`} geometry={geo} renderOrder={1} receiveShadow>
          <meshStandardMaterial
            color="#D6D1C4"
            roughness={0.88}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-3}
          />
        </mesh>
      ))}

      {/* PASS 2: All Pure Dark Asphalt Ribbons & Junction Rounds (yOffset = 0.043–0.044, renderOrder = 2) */}
      {secondaryAsphalt.map((geo, i) => (
        <mesh key={`sec-asphalt-${i}`} geometry={geo} renderOrder={2} receiveShadow>
          <meshStandardMaterial
            map={textures.secondaryRoadTex}
            roughness={0.8}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-6}
          />
        </mesh>
      ))}
      {primaryAsphalt.map((geo, i) => (
        <mesh key={`pri-asphalt-${i}`} geometry={geo} renderOrder={2} receiveShadow>
          <meshStandardMaterial
            map={textures.primaryRoadTex}
            roughness={0.78}
            side={THREE.DoubleSide}
            polygonOffset
            polygonOffsetFactor={-6}
          />
        </mesh>
      ))}
      {junctionNodes.map((j) => (
        <mesh
          key={`jct-${j.key}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[j.x, j.y + 0.045, j.z]}
          renderOrder={2}
          receiveShadow
        >
          <circleGeometry args={[0.125, 24]} />
          <meshStandardMaterial
            map={textures.primaryRoadTex}
            roughness={0.78}
            polygonOffset
            polygonOffsetFactor={-7}
          />
        </mesh>
      ))}

      <BridgeStructures roadTex={textures.primaryRoadTex} />

      {/* Barangay Boundary Outlines in Tangerine Dream (#FE9659) */}
      {BARANGAY_BOUNDARIES.map((ring, i) => {
        const sampledPts = [];
        for (let seg = 0; seg < ring.length - 1; seg++) {
          const [latA, lngA] = ring[seg];
          const [latB, lngB] = ring[seg + 1];
          const steps = 12;
          for (let s = 0; s <= steps; s++) {
            if (seg > 0 && s === 0) continue;
            const t = s / steps;
            const lat = latA + (latB - latA) * t;
            const lng = lngA + (lngB - lngA) * t;
            const [x, y, z] = geoToWorld(lat, lng);
            sampledPts.push(new THREE.Vector3(x, y + 0.03, z));
          }
        }
        return (
          <Line
            key={`bound-${i}`}
            points={sampledPts}
            color={LOGO_PALETTE.tangerineDream}
            lineWidth={1.25}
            transparent
            opacity={0.7}
            dashed
            dashSize={0.22}
            gapSize={0.16}
          />
        );
      })}

      {/* 27-Barangay Cartographic Labels in Yale Blue (#033F56) */}
      {NAGA_BARANGAY_DISTRICTS.map((dist) => {
        const [x, y, z] = geoToWorld(dist.lat, dist.lng);
        return (
          <Html
            key={dist.id}
            position={[x, y + 0.05, z]}
            center
            distanceFactor={17}
            zIndexRange={[3, 0]}
          >
            <div className="pointer-events-none px-1.5 py-0.5 rounded bg-[#033F56]/80 text-[#FDFDFD] border border-[#91EFF7]/35 text-[6.5px] font-bold uppercase tracking-wider whitespace-nowrap shadow-2xs">
              {dist.name}
            </div>
          </Html>
        );
      })}
    </group>
  );
}

function ArchitecturalBuilding({ b, winTex, stoneTex }) {
  const [x, y, z] = geoToWorld(b.lat, b.lng);

  const wallPalette = {
    white: LOGO_PALETTE.white,
    cream: '#F4EFE4',
    sand: '#EAE2D3',
    slate: '#E2E8F0',
    warm: '#F5E6D3',
  };
  const wallColor = wallPalette[b.tone] || '#F4EFE4';
  const roofColor = b.roofColor || '#B85D3B';

  return (
    <group position={[x, y, z]} rotation={[0, b.rot || 0, 0]}>
      <mesh position={[0, -0.74, 0]} receiveShadow castShadow>
        <boxGeometry args={[b.w * 1.16, 1.52, b.d * 1.16]} />
        <meshStandardMaterial color="#CEC8B8" roughness={0.92} />
      </mesh>

      {b.type === 'cathedral' && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.38, 0.48, 0.72]} />
            <meshStandardMaterial map={stoneTex} color="#EFEAE0" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.54, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[0.32, 0.16, 4]} />
            <meshStandardMaterial color="#8C4A32" flatShading />
          </mesh>
          <mesh position={[0, 0.22, -0.08]} castShadow receiveShadow>
            <boxGeometry args={[0.64, 0.44, 0.28]} />
            <meshStandardMaterial map={stoneTex} color="#EAE4D8" roughness={0.75} />
          </mesh>
          <mesh position={[0, 0.50, -0.08]} castShadow>
            <cylinderGeometry args={[0.14, 0.15, 0.14, 8]} />
            <meshStandardMaterial color="#D8D2C5" flatShading />
          </mesh>
          <mesh position={[0, 0.58, -0.08]} castShadow>
            <sphereGeometry args={[0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={LOGO_PALETTE.balticBlue} roughness={0.45} />
          </mesh>
          {[-0.21, 0.21].map((tx, idx) => (
            <group key={`bell-${idx}`} position={[tx, 0, 0.28]}>
              <mesh position={[0, 0.34, 0]} castShadow>
                <boxGeometry args={[0.15, 0.68, 0.15]} />
                <meshStandardMaterial map={stoneTex} color="#E5DFD2" />
              </mesh>
              <mesh position={[0, 0.75, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[0.11, 0.16, 4]} />
                <meshStandardMaterial color={LOGO_PALETTE.balticBlue} flatShading />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.34, 0.365]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.01, 16]} />
            <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} />
          </mesh>
          <mesh position={[0, 0.12, 0.365]}>
            <boxGeometry args={[0.12, 0.2, 0.015]} />
            <meshStandardMaterial color="#4A321F" />
          </mesh>
        </group>
      )}

      {b.type === 'basilica' && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.44, 0.5, 0.76]} />
            <meshStandardMaterial color="#F7F3E8" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.22, -0.1]} castShadow>
            <boxGeometry args={[0.68, 0.44, 0.3]} />
            <meshStandardMaterial color="#EFECE2" roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.56, -0.1]} castShadow>
            <cylinderGeometry args={[0.15, 0.16, 0.16, 12]} />
            <meshStandardMaterial color="#E2DDD2" />
          </mesh>
          <mesh position={[0, 0.65, -0.1]} castShadow>
            <sphereGeometry args={[0.145, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshStandardMaterial color={LOGO_PALETTE.atomicTangerine} roughness={0.5} />
          </mesh>
          {[-0.23, 0.23].map((tx, idx) => (
            <group key={`bas-tower-${idx}`} position={[tx, 0, 0.3]}>
              <mesh position={[0, 0.36, 0]} castShadow>
                <boxGeometry args={[0.14, 0.72, 0.14]} />
                <meshStandardMaterial color="#F7F3E8" />
              </mesh>
              <mesh position={[0, 0.78, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[0.11, 0.14, 4]} />
                <meshStandardMaterial color={LOGO_PALETTE.atomicTangerine} flatShading />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {b.type === 'mall' && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, 0.22, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, 0.44, b.d]} />
            <meshStandardMaterial map={winTex} color={LOGO_PALETTE.white} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.46, 0]} castShadow>
            <boxGeometry args={[b.w * 1.02, 0.06, b.d * 1.02]} />
            <meshStandardMaterial color={LOGO_PALETTE.balticBlue} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.26, b.d * 0.48]} castShadow>
            <cylinderGeometry args={[0.18, 0.18, 0.52, 20]} />
            <meshStandardMaterial color={LOGO_PALETTE.strongCyan} metalness={0.55} roughness={0.2} />
          </mesh>
          {[-0.25, 0.22].map((rx, idx) => (
            <mesh key={`hvac-${idx}`} position={[rx, 0.52, -0.08]} castShadow>
              <boxGeometry args={[0.18, 0.06, 0.16]} />
              <meshStandardMaterial color="#94A3B8" />
            </mesh>
          ))}
        </group>
      )}

      {b.type === 'hall' && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, 0.24, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, 0.48, b.d]} />
            <meshStandardMaterial map={winTex} color="#F3EFE6" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.50, 0]} castShadow>
            <boxGeometry args={[b.w * 1.04, 0.05, b.d * 1.04]} />
            <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} />
          </mesh>
          <mesh position={[0, 0.42, b.d * 0.56]} castShadow>
            <boxGeometry args={[0.32, 0.06, 0.12]} />
            <meshStandardMaterial color="#E2DDD2" />
          </mesh>
          {[-0.12, -0.04, 0.04, 0.12].map((cx, idx) => (
            <mesh key={`col-${idx}`} position={[cx, 0.2, b.d * 0.58]} castShadow>
              <cylinderGeometry args={[0.015, 0.015, 0.38, 10]} />
              <meshStandardMaterial color={LOGO_PALETTE.white} />
            </mesh>
          ))}
        </group>
      )}

      {b.type === 'university' && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, 0.26, -0.05]} castShadow receiveShadow>
            <boxGeometry args={[b.w, 0.52, b.d * 0.72]} />
            <meshStandardMaterial map={winTex} color="#F5F2EB" roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.57, -0.05]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[b.w * 0.72, 0.16, 4]} />
            <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} flatShading />
          </mesh>
          <mesh position={[0, 0.44, b.d * 0.38]} castShadow>
            <boxGeometry args={[0.36, 0.07, 0.14]} />
            <meshStandardMaterial color={LOGO_PALETTE.white} />
          </mesh>
          {[-0.13, -0.045, 0.045, 0.13].map((px, idx) => (
            <mesh key={`pillar-${idx}`} position={[px, 0.21, b.d * 0.41]} castShadow>
              <cylinderGeometry args={[0.018, 0.02, 0.42, 12]} />
              <meshStandardMaterial color="#FFFFFF" />
            </mesh>
          ))}
        </group>
      )}

      {b.type === 'highrise_tower' && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, 0.28, b.d]} />
            <meshStandardMaterial map={winTex} color={wallColor} roughness={0.5} />
          </mesh>
          <mesh position={[0, b.h * 0.5 + 0.08, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w * 0.82, b.h * 0.85, b.d * 0.82]} />
            <meshStandardMaterial map={winTex} color={wallColor} roughness={0.45} />
          </mesh>
          <mesh position={[0, b.h + 0.02, 0]} castShadow>
            <boxGeometry args={[b.w * 0.86, 0.04, b.d * 0.86]} />
            <meshStandardMaterial color="#CBD5E1" />
          </mesh>
          <mesh position={[0, b.h + 0.08, 0]} castShadow>
            <boxGeometry args={[b.w * 0.48, 0.09, b.d * 0.48]} />
            <meshStandardMaterial color={roofColor} />
          </mesh>
        </group>
      )}

      {b.type === 'stepped_midrise' && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[-b.w * 0.08, b.h * 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w * 0.84, b.h, b.d]} />
            <meshStandardMaterial map={winTex} color={wallColor} roughness={0.55} />
          </mesh>
          <mesh position={[b.w * 0.22, b.h * 0.36, b.d * 0.06]} castShadow receiveShadow>
            <boxGeometry args={[b.w * 0.52, b.h * 0.72, b.d * 0.84]} />
            <meshStandardMaterial map={winTex} color="#EAE5D9" roughness={0.55} />
          </mesh>
          <mesh position={[-b.w * 0.08, b.h + 0.025, 0]} castShadow>
            <boxGeometry args={[b.w * 0.88, 0.04, b.d * 1.04]} />
            <meshStandardMaterial color={roofColor} />
          </mesh>
        </group>
      )}

      {b.type === 'l_commercial' && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, b.h * 0.5, -b.d * 0.15]} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d * 0.65]} />
            <meshStandardMaterial map={winTex} color={wallColor} roughness={0.6} />
          </mesh>
          <mesh position={[-b.w * 0.22, b.h * 0.44, b.d * 0.18]} castShadow receiveShadow>
            <boxGeometry args={[b.w * 0.54, b.h * 0.88, b.d * 0.62]} />
            <meshStandardMaterial map={winTex} color="#F3EFE4" roughness={0.6} />
          </mesh>
          <mesh position={[0, b.h + 0.02, -b.d * 0.15]} castShadow>
            <boxGeometry args={[b.w * 1.04, 0.035, b.d * 0.69]} />
            <meshStandardMaterial color={roofColor} />
          </mesh>
        </group>
      )}

      {b.type === 'townhouse_row' && (
        <group position={[0, 0.02, 0]}>
          {[-0.31, 0, 0.31].map((offset, idx) => (
            <group key={`th-${idx}`} position={[b.w * offset, 0, (idx % 2) * 0.02]}>
              <mesh position={[0, b.h * 0.5, 0]} castShadow receiveShadow>
                <boxGeometry args={[b.w * 0.32, b.h, b.d]} />
                <meshStandardMaterial color={idx === 1 ? LOGO_PALETTE.white : wallColor} roughness={0.68} />
              </mesh>
              <mesh position={[0, b.h + 0.06, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
                <coneGeometry args={[b.d * 0.72, 0.12, 4]} />
                <meshStandardMaterial color={roofColor} flatShading />
              </mesh>
            </group>
          ))}
        </group>
      )}

      {b.type === 'gable_villa' && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, b.h * 0.5, -0.02]} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d * 0.85]} />
            <meshStandardMaterial color={wallColor} roughness={0.72} />
          </mesh>
          <mesh position={[0, b.h + 0.075, -0.02]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[Math.max(b.w, b.d) * 0.82, 0.15, 4]} />
            <meshStandardMaterial color={roofColor} flatShading />
          </mesh>
          <mesh position={[b.w * 0.15, b.h * 0.3, b.d * 0.38]} castShadow>
            <boxGeometry args={[b.w * 0.55, b.h * 0.58, b.d * 0.32]} />
            <meshStandardMaterial color="#EAE2D3" />
          </mesh>
        </group>
      )}

      {(b.type === 'hip_house' || b.type === 'house') && (
        <group position={[0, 0.02, 0]}>
          <mesh position={[0, b.h * 0.5, 0]} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <meshStandardMaterial color={wallColor} roughness={0.72} />
          </mesh>
          <mesh position={[0, 0.08, b.d * 0.5 + 0.004]}>
            <boxGeometry args={[b.w * 0.22, 0.12, 0.008]} />
            <meshStandardMaterial color="#5C3D24" />
          </mesh>
          <mesh position={[0, b.h + 0.07, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
            <coneGeometry args={[Math.max(b.w, b.d) * 0.84, 0.14, 4]} />
            <meshStandardMaterial color={roofColor} roughness={0.65} flatShading />
          </mesh>
        </group>
      )}
    </group>
  );
}

function DioramaTrees() {
  return (
    <group>
      {NAGA_TREE_CLUSTERS.map((t, i) => (
        <group key={`tree-${i}`} position={[t.x, t.y, t.z]} scale={[t.s, t.s, t.s]}>
          <mesh position={[0, -0.4, 0]} castShadow>
            <cylinderGeometry args={[0.014, 0.026, 0.9, 7]} />
            <meshStandardMaterial color="#5C4033" roughness={0.9} />
          </mesh>
          {t.variant === 0 ? (
            <>
              <mesh position={[0, 0.16, 0]} castShadow>
                <dodecahedronGeometry args={[0.105, 0]} />
                <meshStandardMaterial color="#3F6E36" roughness={0.85} flatShading />
              </mesh>
              <mesh position={[0.03, 0.24, -0.02]} castShadow>
                <dodecahedronGeometry args={[0.075, 0]} />
                <meshStandardMaterial color="#538A47" roughness={0.85} flatShading />
              </mesh>
            </>
          ) : t.variant === 1 ? (
            <>
              <mesh position={[0, 0.18, 0]} castShadow>
                <coneGeometry args={[0.095, 0.24, 7]} />
                <meshStandardMaterial color="#355E3B" roughness={0.85} flatShading />
              </mesh>
              <mesh position={[0, 0.28, 0]} castShadow>
                <coneGeometry args={[0.07, 0.18, 7]} />
                <meshStandardMaterial color="#4F7942" roughness={0.85} flatShading />
              </mesh>
            </>
          ) : (
            <mesh position={[0, 0.19, 0]} scale={[1.25, 0.85, 1.25]} castShadow>
              <dodecahedronGeometry args={[0.1, 1]} />
              <meshStandardMaterial color="#4A7C44" roughness={0.85} flatShading />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}

function WaterFacilityModel({ sourceType, statusColor, textures }) {
  if (sourceType === 'Handpump') {
    const pumpProfile = useMemo(
      () => [
        new THREE.Vector2(0.065, 0.0),
        new THREE.Vector2(0.065, 0.02),
        new THREE.Vector2(0.044, 0.035),
        new THREE.Vector2(0.042, 0.19),
        new THREE.Vector2(0.062, 0.21),
        new THREE.Vector2(0.062, 0.26),
        new THREE.Vector2(0.048, 0.275),
        new THREE.Vector2(0.0, 0.285),
      ],
      []
    );
    return (
      <group>
        <mesh position={[0, -0.7, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.56, 1.5, 0.56]} />
          <meshStandardMaterial color="#C8C5BC" roughness={0.85} />
        </mesh>
        <mesh position={[-0.08, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.3, 0.34]} />
          <meshStandardMaterial color={LOGO_PALETTE.strongCyan} roughness={0.2} />
        </mesh>
        <mesh position={[0.06, 0.085, 0]} castShadow>
          <boxGeometry args={[0.17, 0.09, 0.17]} />
          <meshStandardMaterial color="#B5B2A8" roughness={0.85} />
        </mesh>
        <mesh position={[0.06, 0.13, 0]} castShadow>
          <latheGeometry args={[pumpProfile, 20]} />
          <meshStandardMaterial color={LOGO_PALETTE.balticBlue} metalness={0.45} roughness={0.38} />
        </mesh>
        <mesh position={[0.08, 0.43, 0]} castShadow>
          <boxGeometry args={[0.04, 0.05, 0.04]} />
          <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[-0.02, 0.27, 0]} rotation={[0, 0, Math.PI / 2.2]} castShadow>
          <cylinderGeometry args={[0.02, 0.024, 0.11, 12]} />
          <meshStandardMaterial color={LOGO_PALETTE.balticBlue} metalness={0.45} roughness={0.38} />
        </mesh>
        <mesh position={[-0.075, 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.022, 0.018, 0.045, 12]} />
          <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} metalness={0.5} />
        </mesh>
        <mesh position={[0.17, 0.31, 0]} rotation={[0, 0, -0.68]} castShadow>
          <cylinderGeometry args={[0.012, 0.016, 0.34, 12]} />
          <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0.27, 0.18, 0]} castShadow>
          <sphereGeometry args={[0.024, 12, 12]} />
          <meshStandardMaterial color={LOGO_PALETTE.atomicTangerine} metalness={0.6} />
        </mesh>
      </group>
    );
  }

  if (sourceType === 'Communal Spring') {
    return (
      <group>
        <mesh position={[0, -0.7, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[0.42, 0.44, 1.5, 28]} />
          <meshStandardMaterial color="#B9B4A9" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.25, 0.26, 0.22, 28]} />
          <meshStandardMaterial map={textures.stoneTex} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.255, 0]} castShadow>
          <cylinderGeometry args={[0.275, 0.275, 0.03, 28]} />
          <meshStandardMaterial color="#A8A296" roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.268, 0]}>
          <cylinderGeometry args={[0.21, 0.21, 0.01, 24]} />
          <meshStandardMaterial color={LOGO_PALETTE.pacificBlue} roughness={0.15} metalness={0.2} />
        </mesh>
        {[-0.22, 0.22].map((px, idx) => (
          <group key={`post-${idx}`}>
            <mesh position={[px, 0.35, 0]} castShadow>
              <boxGeometry args={[0.045, 0.44, 0.045]} />
              <meshStandardMaterial color="#6B4423" roughness={0.8} />
            </mesh>
            <mesh position={[px * 0.72, 0.47, 0]} rotation={[0, 0, px < 0 ? -0.65 : 0.65]} castShadow>
              <boxGeometry args={[0.03, 0.14, 0.03]} />
              <meshStandardMaterial color="#59371C" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.41, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.022, 0.022, 0.44, 12]} />
          <meshStandardMaterial color="#59371C" />
        </mesh>
        <mesh position={[0.26, 0.41, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.01, 0.01, 0.08, 8]} />
          <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} metalness={0.6} />
        </mesh>
        <mesh position={[0, 0.36, 0]}>
          <cylinderGeometry args={[0.005, 0.005, 0.09, 6]} />
          <meshStandardMaterial color="#D6C7A9" />
        </mesh>
        <mesh position={[0, 0.31, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.034, 0.065, 14]} />
          <meshStandardMaterial color="#475569" metalness={0.55} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.57, 0.115]} rotation={[0.56, 0, 0]} castShadow>
          <boxGeometry args={[0.58, 0.022, 0.29]} />
          <meshStandardMaterial map={textures.corrTex} roughness={0.6} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.57, -0.115]} rotation={[-0.56, 0, 0]} castShadow>
          <boxGeometry args={[0.58, 0.022, 0.29]} />
          <meshStandardMaterial map={textures.corrTex} roughness={0.6} metalness={0.25} />
        </mesh>
        <mesh position={[0, 0.645, 0]} castShadow>
          <boxGeometry args={[0.60, 0.025, 0.035]} />
          <meshStandardMaterial color="#4B443E" />
        </mesh>
      </group>
    );
  }

  if (sourceType === 'Public Kiosk') {
    return (
      <group>
        <mesh position={[0, -0.7, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.68, 1.5, 0.54]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
        </mesh>
        <mesh position={[-0.14, 0.16, 0]} castShadow>
          <boxGeometry args={[0.32, 0.24, 0.34]} />
          <meshStandardMaterial color={LOGO_PALETTE.white} roughness={0.5} />
        </mesh>
        <mesh position={[-0.14, 0.17, 0.174]}>
          <boxGeometry args={[0.2, 0.1, 0.01]} />
          <meshStandardMaterial color={LOGO_PALETTE.pacificBlue} roughness={0.2} />
        </mesh>
        <mesh position={[-0.14, 0.115, 0.19]} castShadow>
          <boxGeometry args={[0.24, 0.02, 0.05]} />
          <meshStandardMaterial color="#94A3B8" />
        </mesh>
        <mesh position={[-0.14, 0.34, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[0.28, 0.14, 4]} />
          <meshStandardMaterial color={statusColor} roughness={0.55} flatShading />
        </mesh>
        {[
          [0.11, -0.09],
          [0.25, -0.09],
          [0.11, 0.09],
          [0.25, 0.09],
        ].map(([lx, lz], i) => (
          <mesh key={`tower-leg-${i}`} position={[lx, 0.19, lz]} castShadow>
            <cylinderGeometry args={[0.012, 0.014, 0.34, 8]} />
            <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} metalness={0.6} roughness={0.35} />
          </mesh>
        ))}
        <mesh position={[0.18, 0.18, 0]}>
          <boxGeometry args={[0.16, 0.015, 0.2]} />
          <meshStandardMaterial color="#64748B" metalness={0.5} />
        </mesh>
        <mesh position={[0.18, 0.36, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.02, 20]} />
          <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} metalness={0.5} />
        </mesh>
        <mesh position={[0.18, 0.45, 0]} castShadow>
          <cylinderGeometry args={[0.115, 0.115, 0.16, 24]} />
          <meshStandardMaterial color={LOGO_PALETTE.white} metalness={0.25} roughness={0.3} />
        </mesh>
        <mesh position={[0.18, 0.56, 0]} castShadow>
          <coneGeometry args={[0.125, 0.06, 24]} />
          <meshStandardMaterial color={LOGO_PALETTE.balticBlue} roughness={0.35} />
        </mesh>
      </group>
    );
  }

  return (
    <group>
      <mesh position={[0, -0.7, 0]} receiveShadow castShadow>
        <boxGeometry args={[0.78, 1.5, 0.56]} />
        <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.17, -0.07]} castShadow>
        <boxGeometry args={[0.62, 0.26, 0.28]} />
        <meshStandardMaterial map={textures.winTex} color={LOGO_PALETTE.white} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.35, -0.07]} castShadow>
        <boxGeometry args={[0.68, 0.045, 0.34]} />
        <meshStandardMaterial color={statusColor} roughness={0.5} />
      </mesh>
      {[-0.16, -0.04].map((fx, idx) => (
        <group key={`filter-${idx}`} position={[fx, 0.04, 0.15]}>
          <mesh position={[0, 0.11, 0]} castShadow>
            <cylinderGeometry args={[0.042, 0.042, 0.22, 16]} />
            <meshStandardMaterial color={LOGO_PALETTE.balticBlue} metalness={0.45} roughness={0.25} />
          </mesh>
          <mesh position={[0, 0.23, 0]}>
            <cylinderGeometry args={[0.025, 0.042, 0.03, 16]} />
            <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} />
          </mesh>
        </group>
      ))}
      <mesh position={[-0.03, 0.24, 0.15]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.01, 0.01, 0.28, 8]} />
        <meshStandardMaterial color="#94A3B8" metalness={0.6} />
      </mesh>
      <mesh position={[0.16, 0.14, 0.15]} castShadow>
        <cylinderGeometry args={[0.08, 0.08, 0.2, 20]} />
        <meshStandardMaterial color={LOGO_PALETTE.strongCyan} roughness={0.25} />
      </mesh>
    </group>
  );
}

function DetailedTankerTruckMesh({ bodyColor = LOGO_PALETTE.balticBlue }) {
  return (
    <group>
      <mesh position={[0, 0.046, 0]} castShadow>
        <boxGeometry args={[0.15, 0.028, 0.45]} />
        <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.15, -0.06]} castShadow>
        <boxGeometry args={[0.195, 0.185, 0.29]} />
        <meshStandardMaterial color={bodyColor} roughness={0.38} metalness={0.12} />
      </mesh>
      {[-0.16, -0.06, 0.04].map((rz, idx) => (
        <mesh key={`rib-${idx}`} position={[0, 0.15, rz]}>
          <boxGeometry args={[0.202, 0.182, 0.014]} />
          <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} roughness={0.45} />
        </mesh>
      ))}
      <mesh position={[0, 0.245, -0.06]}>
        <boxGeometry args={[0.2, 0.01, 0.295]} />
        <meshStandardMaterial color={LOGO_PALETTE.electricAqua} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.13, 0.15]} castShadow>
        <boxGeometry args={[0.18, 0.155, 0.12]} />
        <meshStandardMaterial color={LOGO_PALETTE.white} roughness={0.28} />
      </mesh>
      <mesh position={[0, 0.218, 0.135]} castShadow>
        <boxGeometry args={[0.165, 0.028, 0.09]} />
        <meshStandardMaterial color={LOGO_PALETTE.white} />
      </mesh>
      <mesh position={[0, 0.152, 0.212]}>
        <boxGeometry args={[0.16, 0.068, 0.006]} />
        <meshStandardMaterial color="#0F172A" roughness={0.12} metalness={0.6} />
      </mesh>
      <mesh position={[0, 0.152, 0.155]}>
        <boxGeometry args={[0.183, 0.062, 0.072]} />
        <meshStandardMaterial color="#0F172A" roughness={0.12} />
      </mesh>
      {[-0.105, 0.105].map((mx, idx) => (
        <mesh key={`mirror-${idx}`} position={[mx, 0.155, 0.195]} castShadow>
          <boxGeometry args={[0.016, 0.04, 0.014]} />
          <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} />
        </mesh>
      ))}
      <mesh position={[0, 0.085, 0.212]}>
        <boxGeometry args={[0.12, 0.04, 0.006]} />
        <meshStandardMaterial color={LOGO_PALETTE.yaleBlue} />
      </mesh>
      <mesh position={[0, 0.05, 0.216]}>
        <boxGeometry args={[0.185, 0.026, 0.015]} />
        <meshStandardMaterial color={LOGO_PALETTE.atomicTangerine} />
      </mesh>
      {[-0.068, 0.068].map((hx, idx) => (
        <mesh key={`headlight-${idx}`} position={[hx, 0.082, 0.213]}>
          <boxGeometry args={[0.024, 0.016, 0.006]} />
          <meshBasicMaterial color={LOGO_PALETTE.electricAqua} />
        </mesh>
      ))}
      {[
        [-0.092, 0.145],
        [0.092, 0.145],
        [-0.092, -0.055],
        [0.092, -0.055],
        [-0.092, -0.145],
        [0.092, -0.145],
      ].map(([wx, wz], idx) => (
        <group key={`wheel-${idx}`} position={[wx, 0.038, wz]} rotation={[0, 0, Math.PI / 2]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.038, 0.038, 0.028, 18]} />
            <meshStandardMaterial color="#0F172A" roughness={0.85} />
          </mesh>
          <mesh position={[0, wx > 0 ? 0.015 : -0.015, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.005, 14]} />
            <meshStandardMaterial color="#CBD5E1" metalness={0.65} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function WaterFacilityNode({ point, isSelected, onSelect, textures }) {
  const [hovered, setHovered] = useState(false);
  const ringRef = useRef();

  const isCritical = point.wvi_score >= 65;
  const isModerate = point.wvi_score >= 35 && point.wvi_score < 65;
  const statusColor = isCritical ? '#EF4444' : isModerate ? '#F59E0B' : '#10B981';

  const [x, y, z] = geoToWorld(point.lat, point.lng);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      const pulse =
        isSelected || isCritical ? 1 + Math.sin(clock.getElapsedTime() * 4) * 0.12 : 1;
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
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.052, 0]}>
        <ringGeometry args={[0.38, isSelected || hovered ? 0.52 : 0.45, 32]} />
        <meshBasicMaterial
          color={isSelected ? LOGO_PALETTE.atomicTangerine : statusColor}
          transparent
          opacity={isSelected || hovered ? 0.95 : 0.65}
          polygonOffset
          polygonOffsetFactor={-3}
        />
      </mesh>

      <WaterFacilityModel
        sourceType={point.source_type}
        statusColor={statusColor}
        textures={textures}
      />

      <Html position={[0, 0.72, 0]} center distanceFactor={11} zIndexRange={[20, 0]}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(point);
          }}
          className={`flex items-center gap-1 px-2 py-0.5 rounded shadow-md border text-[9px] font-extrabold whitespace-nowrap transition-transform ${
            isSelected
              ? 'bg-[#033F56] text-[#FDFDFD] border-[#FD7132] scale-110'
              : hovered
              ? 'bg-[#FDFDFD] text-[#033F56] border-[#01658E] scale-105'
              : 'bg-[#FDFDFD]/95 text-[#033F56] border-[#91EFF7]'
          }`}
        >
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: statusColor }}
          />
          <span>{point.id}</span>
          {(isSelected || hovered) && (
            <span className={isSelected ? 'text-[#FE9659]' : 'text-[#01658E]'}>
              • {point.barangay}
            </span>
          )}
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
      <Line points={linePts} color={LOGO_PALETTE.atomicTangerine} lineWidth={3.2} dashed dashSize={0.18} gapSize={0.12} />
      <group ref={truckGroupRef} scale={[1.15, 1.15, 1.15]}>
        <DetailedTankerTruckMesh bodyColor={LOGO_PALETTE.balticBlue} />
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
}) {
  const textures = useProceduralTextures();
  const criticalPoints = waterPoints.filter((pt) => pt.wvi_score >= 65);
  const floodSusceptiblePoints = waterPoints.filter((pt) => pt.flood_risk_level >= 4);
  const [hubX, hubY, hubZ] = geoToWorld(CDRRMO_HUB.lat, CDRRMO_HUB.lng);

  return (
    <>
      <color attach="background" args={['#BFD8B8']} />
      <fog attach="fog" args={['#BFD8B8', 32, 72]} />

      <ambientLight intensity={0.58} color="#FFFBF0" />
      <hemisphereLight args={[LOGO_PALETTE.white, '#4E6E48', 0.55]} />
      <directionalLight
        position={[16, 26, 14]}
        intensity={1.45}
        color="#FFF5E1"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
      />

      <MapCameraRig activeMapNode={activeMapNode} cameraCommand={cameraCommand} />
      <NagaTerrainMesh onBackgroundClick={() => onNodeSelect(null)} />
      <TerrainRibbons textures={textures} />

      {NAGA_LANDMARKS.map((lm) => (
        <ArchitecturalBuilding
          key={lm.id}
          b={lm}
          winTex={textures.winTex}
          stoneTex={textures.stoneTex}
        />
      ))}

      {NAGA_BUILDING_CLUSTERS.map((b, i) => (
        <ArchitecturalBuilding
          key={`bldg-${i}`}
          b={b}
          winTex={textures.winTex}
          stoneTex={textures.stoneTex}
        />
      ))}

      <DioramaTrees />

      {showFloodLayer &&
        floodSusceptiblePoints.map((pt) => {
          const [x, y, z] = geoToWorld(pt.lat, pt.lng);
          return (
            <mesh
              key={`flood-${pt.id}`}
              rotation={[-Math.PI / 2, 0, 0]}
              position={[x, y + 0.025, z]}
            >
              <circleGeometry args={[pt.flood_risk_level === 5 ? 1.35 : 0.85, 32]} />
              <meshBasicMaterial
                color={LOGO_PALETTE.strongCyan}
                transparent
                opacity={0.28}
                polygonOffset
                polygonOffsetFactor={-1}
              />
            </mesh>
          );
        })}

      <group position={[hubX, hubY, hubZ]}>
        <mesh position={[0, -0.7, 0]} receiveShadow castShadow>
          <boxGeometry args={[0.82, 1.5, 0.64]} />
          <meshStandardMaterial color="#CBD5E1" roughness={0.85} />
        </mesh>
        <mesh position={[-0.14, 0.19, -0.05]} castShadow>
          <boxGeometry args={[0.42, 0.3, 0.38]} />
          <meshStandardMaterial map={textures.winTex} color={LOGO_PALETTE.yaleBlue} roughness={0.5} />
        </mesh>
        <mesh position={[-0.14, 0.355, -0.05]} castShadow>
          <boxGeometry args={[0.46, 0.035, 0.42]} />
          <meshStandardMaterial color={LOGO_PALETTE.atomicTangerine} />
        </mesh>
        <group position={[0.2, 0.035, 0.04]} scale={[0.95, 0.95, 0.95]}>
          <DetailedTankerTruckMesh bodyColor={LOGO_PALETTE.balticBlue} />
        </group>
        <Html position={[0, 0.56, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
          <div className="bg-[#033F56] text-[#FE9659] border border-[#91EFF7]/40 px-2 py-0.5 rounded text-[9px] font-bold shadow">
            CDRRMO Depot
          </div>
        </Html>
      </group>

      {waterPoints.map((pt) => (
        <WaterFacilityNode
          key={pt.id}
          point={pt}
          isSelected={activeMapNode?.id === pt.id}
          onSelect={onNodeSelect}
          textures={textures}
        />
      ))}

      {showTankerRoutes &&
        criticalPoints.map((pt) => (
          <TankerDispatchRoute key={`route-${pt.id}`} targetPoint={pt} />
        ))}
    </>
  );
}

export default function BicolMap3D(props) {
  return (
    <Canvas
      shadows
      camera={{ position: [0.4, 13.8, 13.2], fov: 38, near: 0.1, far: 160 }}
      className="w-full h-full"
    >
      <NagaMapScene {...props} />
    </Canvas>
  );
}