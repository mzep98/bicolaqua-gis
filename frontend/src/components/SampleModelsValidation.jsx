import React, { useMemo, useState, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Html } from '@react-three/drei';

/**
 * Verified GLB Asset Loader with automatic shadow & PBR roughness normalization.
 * Drop CC0 / licensed .glb files into public/models/:
 * - /models/residential_house.glb
 * - /models/commercial_building.glb
 * - /models/water_kiosk.glb
 */
function useVerifiedGLTF(url) {
  const [scene, setScene] = useState(null);

  useEffect(() => {
    if (!url) return;
    let isMounted = true;
    const loader = new GLTFLoader();

    loader.load(
      url,
      (gltf) => {
        if (!isMounted || !gltf?.scene) return;
        const root = gltf.scene.clone(true);
        root.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            if (node.material) {
              node.material.envMapIntensity = 0.85;
              node.material.needsUpdate = true;
            }
          }
        });
        setScene(root);
      },
      undefined,
      () => {
        if (isMounted) setScene(null);
      }
    );

    return () => {
      isMounted = false;
    };
  }, [url]);

  return scene;
}

/**
 * Shared PBR Material Palette calibrated for natural daylight & white GIS aesthetics
 */
const useArchitecturalMaterials = () =>
  useMemo(
    () => ({
      plinthConcrete: new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: 0.9, metalness: 0.05 }),
      wallWarmCream: new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.78, metalness: 0.02 }),
      wallSandstone: new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.82, metalness: 0.04 }),
      wallAccentTerracotta: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.75, metalness: 0.05 }),
      commercialFacade: new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.7, metalness: 0.08 }),
      spandrelConcrete: new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.8, metalness: 0.1 }),
      mullionDark: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.6 }),
      windowGlass: new THREE.MeshPhysicalMaterial({
        color: '#1e3a5f',
        roughness: 0.15,
        metalness: 0.1,
        transmission: 0.25,
        reflectivity: 0.8,
      }),
      roofTerracottaGI: new THREE.MeshStandardMaterial({ color: '#8c3b2b', roughness: 0.55, metalness: 0.25 }),
      roofFascia: new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.6, metalness: 0.2 }),
      kioskTileBlue: new THREE.MeshStandardMaterial({ color: '#0284c7', roughness: 0.35, metalness: 0.1 }),
      stainlessSteel: new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.25, metalness: 0.85 }),
      steelStructure: new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.75 }),
      waterTankBlue: new THREE.MeshStandardMaterial({ color: '#0369a1', roughness: 0.35, metalness: 0.3 }),
    }),
    []
  );

/**
 * Recessed Window Bay Component (Frame + Sill + Recessed Glass + Mullions + Canopy)
 */
function RecessedWindowBay({ position, rotation = [0, 0, 0], width = 1.6, height = 1.3, hasCanopy = true, mats }) {
  return (
    <group position={position} rotation={rotation}>
      {/* Outer Recessed Frame Box */}
      <mesh position={[0, 0, 0.02]} material={mats.mullionDark} castShadow receiveShadow>
        <boxGeometry args={[width, height, 0.14]} />
      </mesh>
      {/* Inset Glazing Pane */}
      <mesh position={[0, 0, 0.06]} material={mats.windowGlass}>
        <boxGeometry args={[width - 0.14, height - 0.14, 0.08]} />
      </mesh>
      {/* Center Vertical Mullion */}
      <mesh position={[0, 0, 0.08]} material={mats.mullionDark}>
        <boxGeometry args={[0.05, height - 0.1, 0.06]} />
      </mesh>
      {/* Horizontal Transom Bar */}
      <mesh position={[0, height * 0.15, 0.08]} material={mats.mullionDark}>
        <boxGeometry args={[width - 0.1, 0.04, 0.06]} />
      </mesh>
      {/* Projecting Concrete Window Sill */}
      <mesh position={[0, -height / 2 - 0.04, 0.08]} material={mats.plinthConcrete} castShadow receiveShadow>
        <boxGeometry args={[width + 0.16, 0.08, 0.22]} />
      </mesh>
      {/* Media Agua (Sun-Breaker Canopy) */}
      {hasCanopy && (
        <mesh position={[0, height / 2 + 0.06, 0.18]} material={mats.spandrelConcrete} castShadow receiveShadow>
          <boxGeometry args={[width + 0.28, 0.08, 0.42]} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Pitched Hip Roof Geometry with True Overhang, Soffit & Fascia Thickness
 */
function HipRoofAssembly({ width, depth, ridgeHeight, overhang = 0.65, mats }) {
  const roofGeo = useMemo(() => {
    const w = width / 2 + overhang;
    const d = depth / 2 + overhang;
    const ridgeHalf = Math.max(0.4, (width - depth) * 0.35 + w * 0.35);

    const vertices = new Float32Array([
      // Base perimeter (0..3)
      -w, 0, -d,
       w, 0, -d,
       w, 0,  d,
      -w, 0,  d,
      // Ridge endpoints (4..5)
      -ridgeHalf, ridgeHeight, 0,
       ridgeHalf, ridgeHeight, 0,
    ]);

    const indices = [
      // Front slope
      3, 2, 5,  3, 5, 4,
      // Back slope
      1, 0, 4,  1, 4, 5,
      // Left hip triangle
      0, 3, 4,
      // Right hip triangle
      2, 1, 5,
      // Bottom soffit closure
      0, 1, 2,  0, 2, 3,
    ];

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geom.setIndex(indices);
    geom.computeVertexNormals();
    return geom;
  }, [width, depth, ridgeHeight, overhang]);

  return (
    <group>
      {/* Fascia Perimeter Band */}
      <mesh position={[0, -0.08, 0]} material={mats.roofFascia} castShadow receiveShadow>
        <boxGeometry args={[width + overhang * 2, 0.16, depth + overhang * 2]} />
      </mesh>
      {/* Main Sloped Hip Roof */}
      <mesh geometry={roofGeo} material={mats.roofTerracottaGI} castShadow receiveShadow />
      {/* Ridge Cap Flashing */}
      <mesh position={[0, ridgeHeight, 0]} material={mats.roofFascia} castShadow>
        <boxGeometry args={[Math.max(0.8, width * 0.45), 0.12, 0.18]} />
      </mesh>
    </group>
  );
}

/**
 * SAMPLE 1: Realistic Filipino 2-Story Residential Structure
 */
export function SampleResidentialBuilding({ position = [0, 0, 0], rotation = [0, 0, 0], glbUrl = '/models/residential_house.glb' }) {
  const glbScene = useVerifiedGLTF(glbUrl);
  const mats = useArchitecturalMaterials();

  if (glbScene) {
    return <primitive object={glbScene} position={position} rotation={rotation} />;
  }

  return (
    <group position={position} rotation={rotation}>
      {/* Flood-Resilient Concrete Plinth (0.35m height) */}
      <mesh position={[0, 0.175, 0]} material={mats.plinthConcrete} castShadow receiveShadow>
        <boxGeometry args={[8.8, 0.35, 10.6]} />
      </mesh>

      {/* Entry Porch Steps */}
      <mesh position={[-2.1, 0.1, 5.55]} material={mats.plinthConcrete} castShadow receiveShadow>
        <boxGeometry args={[2.4, 0.2, 0.6]} />
      </mesh>

      {/* Ground Floor Core Masonry Volume (Recessed on Left for Porch/Carport) */}
      <mesh position={[1.1, 1.8, -0.3]} material={mats.wallSandstone} castShadow receiveShadow>
        <boxGeometry args={[6.0, 2.9, 9.2]} />
      </mesh>
      <mesh position={[-2.1, 1.8, -1.6]} material={mats.wallSandstone} castShadow receiveShadow>
        <boxGeometry args={[2.4, 2.9, 6.6]} />
      </mesh>

      {/* Ground Floor Reinforced Concrete Porch Columns (3x) */}
      {[-3.15, -1.05].map((xPos, idx) => (
        <mesh key={idx} position={[xPos, 1.8, 4.1]} material={mats.wallWarmCream} castShadow receiveShadow>
          <boxGeometry args={[0.28, 2.9, 0.28]} />
        </mesh>
      ))}

      {/* Main Timber/Steel Panel Entry Door + Frame */}
      <mesh position={[-1.9, 1.45, 1.72]} material={mats.mullionDark} castShadow>
        <boxGeometry args={[1.15, 2.2, 0.12]} />
      </mesh>

      {/* Inter-Floor Concrete Slab Belt Course */}
      <mesh position={[0, 3.32, 0]} material={mats.plinthConcrete} castShadow receiveShadow>
        <boxGeometry args={[8.5, 0.18, 10.1]} />
      </mesh>

      {/* Second Floor Cantilevered Living Volume */}
      <mesh position={[0, 4.8, 0]} material={mats.wallWarmCream} castShadow receiveShadow>
        <boxGeometry args={[8.2, 2.8, 9.8]} />
      </mesh>

      {/* Second Floor Front Balcony Cutout & Railing */}
      <mesh position={[-2.1, 3.95, 5.15]} material={mats.mullionDark} castShadow>
        <boxGeometry args={[3.6, 1.05, 0.08]} />
      </mesh>
      <mesh position={[-2.1, 3.4, 4.75]} material={mats.plinthConcrete} castShadow receiveShadow>
        <boxGeometry args={[3.7, 0.16, 0.9]} />
      </mesh>

      {/* Articulated Window Bays - Front Elevation */}
      <RecessedWindowBay position={[1.6, 1.85, 4.32]} width={2.1} height={1.35} mats={mats} />
      <RecessedWindowBay position={[1.6, 4.85, 4.92]} width={2.2} height={1.4} mats={mats} />
      <RecessedWindowBay position={[-2.1, 4.85, 4.92]} width={1.8} height={1.4} hasCanopy={false} mats={mats} />

      {/* Articulated Window Bays - Side & Rear Elevations */}
      <RecessedWindowBay position={[4.12, 1.85, -1.2]} rotation={[0, Math.PI / 2, 0]} width={1.8} height={1.3} mats={mats} />
      <RecessedWindowBay position={[4.12, 4.85, 1.4]} rotation={[0, Math.PI / 2, 0]} width={1.8} height={1.35} mats={mats} />
      <RecessedWindowBay position={[4.12, 4.85, -2.0]} rotation={[0, Math.PI / 2, 0]} width={1.8} height={1.35} mats={mats} />
      <RecessedWindowBay position={[-4.12, 4.85, 0.5]} rotation={[0, -Math.PI / 2, 0]} width={1.8} height={1.35} mats={mats} />

      {/* Main Dutch-Hip Roof Assembly */}
      <group position={[0, 6.28, 0]}>
        <HipRoofAssembly width={8.2} depth={9.8} ridgeHeight={2.15} overhang={0.7} mats={mats} />
      </group>
    </group>
  );
}

/**
 * SAMPLE 2: Realistic 4-Story Naga Commercial Mid-Rise Building
 */
export function SampleCommercialBuilding({ position = [0, 0, 0], rotation = [0, 0, 0], glbUrl = '/models/commercial_building.glb' }) {
  const glbScene = useVerifiedGLTF(glbUrl);
  const mats = useArchitecturalMaterials();

  if (glbScene) {
    return <primitive object={glbScene} position={position} rotation={rotation} />;
  }

  const width = 14.0;
  const depth = 16.0;
  const groundHeight = 3.8;
  const floorHeight = 3.2;
  const upperFloors = 3;

  return (
    <group position={position} rotation={rotation}>
      {/* Ground Sidewalk Apron & Elevated Curb Plinth */}
      <mesh position={[0, 0.15, 0]} material={mats.plinthConcrete} castShadow receiveShadow>
        <boxGeometry args={[width + 1.2, 0.3, depth + 1.2]} />
      </mesh>

      {/* Recessed Ground-Floor Storefront Core (Creates Pedestrian Silong / Arcade) */}
      <mesh position={[0, 0.3 + groundHeight / 2, -0.7]} material={mats.mullionDark} castShadow receiveShadow>
        <boxGeometry args={[width - 0.8, groundHeight, depth - 1.8]} />
      </mesh>
      {/* Storefront Curtain Glazing */}
      <mesh position={[0, 0.3 + groundHeight / 2, depth / 2 - 1.55]} material={mats.windowGlass}>
        <boxGeometry args={[width - 1.4, groundHeight - 0.4, 0.12]} />
      </mesh>

      {/* Ground-Floor Colonnade Structural Piers along Street Frontage */}
      {[-6.4, -3.2, 0, 3.2, 6.4].map((xPos, i) => (
        <mesh key={i} position={[xPos, 0.3 + groundHeight / 2, depth / 2 - 0.35]} material={mats.commercialFacade} castShadow receiveShadow>
          <boxGeometry args={[0.55, groundHeight, 0.55]} />
        </mesh>
      ))}

      {/* Upper 3 Commercial Levels with Articulated Spandrels, Pilasters & Recessed Curtain Bays */}
      {Array.from({ length: upperFloors }).map((_, levelIdx) => {
        const yBase = 0.3 + groundHeight + levelIdx * floorHeight;
        return (
          <group key={levelIdx} position={[0, yBase, 0]}>
            {/* Projecting Concrete Floor Slab Spandrel Band */}
            <mesh position={[0, 0.18, 0]} material={mats.spandrelConcrete} castShadow receiveShadow>
              <boxGeometry args={[width + 0.3, 0.36, depth + 0.3]} />
            </mesh>

            {/* Structural Core Mass */}
            <mesh position={[0, floorHeight / 2, 0]} material={mats.commercialFacade} castShadow receiveShadow>
              <boxGeometry args={[width, floorHeight - 0.36, depth]} />
            </mesh>

            {/* Vertical Architectural Pilasters (Front & Back) */}
            {[-6.6, -3.3, 0, 3.3, 6.6].map((xPos, pIdx) => (
              <mesh key={pIdx} position={[xPos, floorHeight / 2, depth / 2 + 0.12]} material={mats.commercialFacade} castShadow receiveShadow>
                <boxGeometry args={[0.42, floorHeight, 0.28]} />
              </mesh>
            ))}

            {/* Recessed Ribbon Window Bays between Pilasters */}
            {[-4.95, -1.65, 1.65, 4.95].map((bayX, bIdx) => (
              <RecessedWindowBay
                key={bIdx}
                position={[bayX, floorHeight / 2 + 0.1, depth / 2 + 0.02]}
                width={2.65}
                height={2.1}
                hasCanopy={true}
                mats={mats}
              />
            ))}

            {/* Side Facade Articulated Window Bays */}
            {[-5.2, -1.8, 1.8, 5.2].map((bayZ, sIdx) => (
              <React.Fragment key={sIdx}>
                <RecessedWindowBay
                  position={[width / 2 + 0.02, floorHeight / 2 + 0.1, bayZ]}
                  rotation={[0, Math.PI / 2, 0]}
                  width={2.5}
                  height={2.0}
                  hasCanopy={false}
                  mats={mats}
                />
                <RecessedWindowBay
                  position={[-width / 2 - 0.02, floorHeight / 2 + 0.1, bayZ]}
                  rotation={[0, -Math.PI / 2, 0]}
                  width={2.5}
                  height={2.0}
                  hasCanopy={false}
                  mats={mats}
                />
              </React.Fragment>
            ))}
          </group>
        );
      })}

      {/* Roof Deck Slab & Perimeter Parapet Walls (1.1m height) */}
      {(() => {
        const roofY = 0.3 + groundHeight + upperFloors * floorHeight;
        return (
          <group position={[0, roofY, 0]}>
            {/* Roof Slab */}
            <mesh position={[0, 0.15, 0]} material={mats.plinthConcrete} receiveShadow>
              <boxGeometry args={[width + 0.2, 0.3, depth + 0.2]} />
            </mesh>
            {/* 4-Sided Perimeter Parapet Wall */}
            <mesh position={[0, 0.75, depth / 2 - 0.15]} material={mats.commercialFacade} castShadow receiveShadow>
              <boxGeometry args={[width, 1.1, 0.3]} />
            </mesh>
            <mesh position={[0, 0.75, -depth / 2 + 0.15]} material={mats.commercialFacade} castShadow receiveShadow>
              <boxGeometry args={[width, 1.1, 0.3]} />
            </mesh>
            <mesh position={[width / 2 - 0.15, 0.75, 0]} material={mats.commercialFacade} castShadow receiveShadow>
              <boxGeometry args={[0.3, 1.1, depth - 0.6]} />
            </mesh>
            <mesh position={[-width / 2 + 0.15, 0.75, 0]} material={mats.commercialFacade} castShadow receiveShadow>
              <boxGeometry args={[0.3, 1.1, depth - 0.6]} />
            </mesh>

            {/* Rooftop Elevator/Stair Penthouse Bulkhead */}
            <mesh position={[-3.2, 1.6, -3.5]} material={mats.commercialFacade} castShadow receiveShadow>
              <boxGeometry args={[4.4, 2.8, 4.8]} />
            </mesh>
            <mesh position={[-3.2, 3.08, -3.5]} material={mats.spandrelConcrete} castShadow>
              <boxGeometry args={[4.7, 0.18, 5.1]} />
            </mesh>

            {/* Rooftop HVAC Chiller Units & Auxiliary Water Tank */}
            <mesh position={[3.2, 0.9, -2.5]} material={mats.stainlessSteel} castShadow receiveShadow>
              <boxGeometry args={[3.2, 1.3, 2.2]} />
            </mesh>
            <mesh position={[3.5, 1.4, 2.5]} material={mats.waterTankBlue} castShadow receiveShadow>
              <cylinderGeometry args={[1.1, 1.1, 2.2, 24]} />
            </mesh>
          </group>
        );
      })()}
    </group>
  );
}

/**
 * SAMPLE 3: Realistic LGU Communal Water Kiosk, Filtration Plant & Elevated Tank Tower
 */
export function SampleWaterFacility({ position = [0, 0, 0], rotation = [0, 0, 0], glbUrl = '/models/water_kiosk.glb' }) {
  const glbScene = useVerifiedGLTF(glbUrl);
  const mats = useArchitecturalMaterials();

  if (glbScene) {
    return <primitive object={glbScene} position={position} rotation={rotation} />;
  }

  return (
    <group position={position} rotation={rotation}>
      {/* Flood-Protected Reinforced Concrete Facility Pad (7.0m x 8.5m x 0.45m) */}
      <mesh position={[0, 0.225, 0]} material={mats.plinthConcrete} castShadow receiveShadow>
        <boxGeometry args={[7.0, 0.45, 8.5]} />
      </mesh>
      {/* Front Access Ramp */}
      <mesh position={[-1.4, 0.18, 4.55]} rotation={[0.22, 0, 0]} material={mats.plinthConcrete} receiveShadow>
        <boxGeometry args={[3.2, 0.15, 0.9]} />
      </mesh>

      {/* --- LEFT MODULE: Filtration & Chlorination Kiosk Building --- */}
      <group position={[-1.4, 0.45, 0.4]}>
        {/* Rear Enclosed Pump & Media Filtration Room */}
        <mesh position={[0, 1.45, -1.1]} material={mats.wallWarmCream} castShadow receiveShadow>
          <boxGeometry args={[3.6, 2.9, 3.2]} />
        </mesh>
        {/* Louvered Ventilation Grille on Pump Room */}
        <mesh position={[-1.82, 1.6, -1.1]} material={mats.mullionDark}>
          <boxGeometry args={[0.08, 1.1, 1.6]} />
        </mesh>

        {/* Dual FRP Pressure Sand/Carbon Filter Vessels (Visible through service bay) */}
        <mesh position={[-0.6, 1.1, 0.7]} material={mats.waterTankBlue} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 1.8, 16]} />
        </mesh>
        <mesh position={[0.1, 1.1, 0.7]} material={mats.waterTankBlue} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 1.8, 16]} />
        </mesh>

        {/* Front Tiled Dispensing Apron Counter & Drainage Trough */}
        <mesh position={[0, 0.55, 1.65]} material={mats.kioskTileBlue} castShadow receiveShadow>
          <boxGeometry args={[3.6, 1.1, 0.85]} />
        </mesh>
        <mesh position={[0, 1.14, 1.65]} material={mats.stainlessSteel} castShadow receiveShadow>
          <boxGeometry args={[3.7, 0.08, 0.95]} />
        </mesh>

        {/* 4 Stainless-Steel Gooseneck Dispensing Tap Risers */}
        {[-1.2, -0.4, 0.4, 1.2].map((tapX, idx) => (
          <group key={idx} position={[tapX, 1.38, 1.55]}>
            <mesh material={mats.stainlessSteel} castShadow>
              <cylinderGeometry args={[0.035, 0.035, 0.45, 12]} />
            </mesh>
            <mesh position={[0, 0.2, 0.12]} rotation={[Math.PI / 2, 0, 0]} material={mats.stainlessSteel}>
              <cylinderGeometry args={[0.025, 0.025, 0.24, 12]} />
            </mesh>
          </group>
        ))}

        {/* Front Steel Canopy Columns */}
        {[-1.7, 1.7].map((colX, idx) => (
          <mesh key={idx} position={[colX, 1.5, 2.0]} material={mats.steelStructure} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 3.0, 12]} />
          </mesh>
        ))}

        {/* Sloped Mono-Pitch Steel Truss Canopy Roof */}
        <group position={[0, 3.05, 0.35]} rotation={[0.12, 0, 0]}>
          <mesh material={mats.roofFascia} castShadow receiveShadow>
            <boxGeometry args={[4.2, 0.14, 5.4]} />
          </mesh>
          <mesh position={[0, 0.09, 0]} material={mats.kioskTileBlue} castShadow receiveShadow>
            <boxGeometry args={[4.05, 0.08, 5.25]} />
          </mesh>
        </group>
      </group>

      {/* --- RIGHT MODULE: 4-Legged Steel Lattice Elevated Water Storage Tower --- */}
      <group position={[1.85, 0.45, -1.2]}>
        {/* 4 Concrete Pier Footings */}
        {[
          [-1.0, -1.0],
          [1.0, -1.0],
          [1.0, 1.0],
          [-1.0, 1.0],
        ].map(([lx, lz], i) => (
          <React.Fragment key={i}>
            <mesh position={[lx, 0.2, lz]} material={mats.plinthConcrete} castShadow receiveShadow>
              <boxGeometry args={[0.42, 0.4, 0.42]} />
            </mesh>
            {/* Vertical Steel Tower Column */}
            <mesh position={[lx * 0.92, 2.8, lz * 0.92]} material={mats.steelStructure} castShadow receiveShadow>
              <cylinderGeometry args={[0.08, 0.1, 5.2, 12]} />
            </mesh>
          </React.Fragment>
        ))}

        {/* Horizontal Steel Girder Rings at 1.8m, 3.5m, and 5.2m */}
        {[1.8, 3.5, 5.2].map((ringY, rIdx) => (
          <group key={rIdx} position={[0, ringY, 0]}>
            <mesh position={[0, 0, 0.92]} material={mats.steelStructure} castShadow>
              <boxGeometry args={[1.95, 0.1, 0.1]} />
            </mesh>
            <mesh position={[0, 0, -0.92]} material={mats.steelStructure} castShadow>
              <boxGeometry args={[1.95, 0.1, 0.1]} />
            </mesh>
            <mesh position={[0.92, 0, 0]} material={mats.steelStructure} castShadow>
              <boxGeometry args={[0.1, 0.1, 1.95]} />
            </mesh>
            <mesh position={[-0.92, 0, 0]} material={mats.steelStructure} castShadow>
              <boxGeometry args={[0.1, 0.1, 1.95]} />
            </mesh>
          </group>
        ))}

        {/* Elevated Steel Service Platform Deck */}
        <mesh position={[0, 5.35, 0]} material={mats.steelStructure} castShadow receiveShadow>
          <cylinderGeometry args={[1.55, 1.55, 0.16, 24]} />
        </mesh>

        {/* Cylindrical Elevated Storage Tank (Ribbed Polyethylene / Coated Steel) */}
        <mesh position={[0, 6.85, 0]} material={mats.waterTankBlue} castShadow receiveShadow>
          <cylinderGeometry args={[1.28, 1.28, 2.8, 32]} />
        </mesh>
        {/* Conical Tank Dome Top */}
        <mesh position={[0, 8.45, 0]} material={mats.waterTankBlue} castShadow>
          <coneGeometry args={[1.32, 0.45, 32]} />
        </mesh>
        {/* Stainless Riser & Downcomer Piping */}
        <mesh position={[-0.25, 2.7, 0]} material={mats.stainlessSteel} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 5.3, 12]} />
        </mesh>
        {/* Telemetry / WVI Sensor Mast */}
        <mesh position={[0.85, 8.9, 0]} material={mats.stainlessSteel}>
          <cylinderGeometry args={[0.025, 0.025, 1.4, 8]} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * VALIDATION STAGE: Renders the 3 Representative Models side-by-side for visual sign-off
 * Toggle `visible={true}` in BicolMap3D.jsx to inspect geometry, lighting, and scale.
 */
export function SampleModelsValidationStage({ position = [0, 0.2, 0], scale = 1 }) {
  return (
    <group position={position} scale={scale}>
      {/* Calibrated Metric Inspection Base Pad */}
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[48, 0.16, 24]} />
        <meshStandardMaterial color="#cbd5e1" roughness={0.9} />
      </mesh>

      {/* 1. Filipino Residential Building */}
      <group position={[-15, 0, 0]}>
        <SampleResidentialBuilding />
        <Html position={[0, 9.5, 0]} center distanceFactor={60}>
          <div className="px-2.5 py-1 rounded bg-white/95 text-slate-900 text-xs font-semibold shadow border border-slate-200 whitespace-nowrap">
            Sample 1: Filipino Residential (8.4m × 10.2m)
          </div>
        </Html>
      </group>

      {/* 2. Naga Commercial Shophouse / Mid-Rise */}
      <group position={[1, 0, 0]}>
        <SampleCommercialBuilding />
        <Html position={[0, 16.5, 0]} center distanceFactor={60}>
          <div className="px-2.5 py-1 rounded bg-white/95 text-slate-900 text-xs font-semibold shadow border border-slate-200 whitespace-nowrap">
            Sample 2: Commercial Mid-Rise (14m × 16m, 4 Floors)
          </div>
        </Html>
      </group>

      {/* 3. Communal Water Kiosk & Elevated Tank */}
      <group position={[16, 0, 0]}>
        <SampleWaterFacility />
        <Html position={[0, 10.8, 0]} center distanceFactor={60}>
          <div className="px-2.5 py-1 rounded bg-white/95 text-sky-900 text-xs font-semibold shadow border border-sky-200 whitespace-nowrap">
            Sample 3: LGU Water Kiosk & Storage Tower
          </div>
        </Html>
      </group>
    </group>
  );
}