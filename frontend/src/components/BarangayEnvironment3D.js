import { ScenegraphLayer } from '@deck.gl/mesh-layers';
import {
  NAGA_LOCAL_STREETS,
  NAGA_OSM_PRIMARY_ROADS,
  NAGA_OSM_SECONDARY_ROADS,
  NAGA_TERTIARY_ROADS,
} from '../data/nagaOsmRoads';
import { isInsideWaterwayClearance } from './CityBuildingBatcher';
import { ScatterplotLayer } from '@deck.gl/layers';

const COS_NAGA_LAT = Math.cos((13.621 * Math.PI) / 180);
const METERS_PER_DEG_LAT = 110636;
const METERS_PER_DEG_LNG = 111320 * COS_NAGA_LAT;

export const SHOP_MODEL_PATHS = [
  '/models/low_poly_shop.glb',
  '/models/low_poly_shop_1.glb',
  '/models/low_poly_shop_2.glb',
  '/models/low_poly_shop_3.glb',
  '/models/low_poly_shop_4.glb',
];

export const HOUSE_MODEL_PATHS = [
  '/models/low_poly_house.glb',
  '/models/low_poly_house_1.glb',
  '/models/low_poly_house_2.glb',
  '/models/low_poly_house_3.glb',
  '/models/low_poly_house_4.glb',
  '/models/low_poly_house_5.glb',
];

export const ENV_MODEL_PATHS = {
  barangayHall: '/models/low_poly_city_hall.glb?v=6',
  plaza: '/models/plaza.glb',
  coveredCourt: '/models/covered_court.glb',
  school: '/models/low_poly_school.glb',
  policeStation: '/models/low_poly_police_station.glb',
  hospital: '/models/low_poly_hospital.glb',
  trees: '/models/lowpoly_tree_game_asset.glb',
  bench: '/models/bench.glb',
  benchTable: '/models/bench_2.glb',
  roadSigns: '/models/road_signs.glb',
  trafficLights: '/models/traffic_lights.glb',
  dumpster: '/models/dumpster.glb',
  wasteBin: '/models/waste_bin.glb',
  wasteBin2: '/models/waste_bin2.glb',
  streetLight: '/models/street_light.glb',
  utilityPole: '/models/utility_pole.glb',
  fireHydrant: '/models/fire_hydrant.glb',
  jeepney: '/models/jeepney.glb',
  tricycle: '/models/tricycle.glb',
  deliveryTruck: '/models/delivery_truck.glb',
  flowerTruck: '/models/flower_truck.glb',
  ambulance: '/models/ambulance.glb',
  policeCar: '/models/police_car.glb',
  car: '/models/car.glb',
  car2: '/models/car_2.glb',
};

const TARGET_HEIGHT_M = {
  tree: 72,
  bench: 4.5,
  benchTable: 5.0,
  roadSign: 34.0,
  trafficLight: 52.0,
  streetLight: 60.0,
  utilityPole: 66.0,
  fireHydrant: 12.0,
  wasteBin: 12.5,
  dumpster: 13.0,
  car: 13.0,
  car2: 8.2,
  policeCar: 8.6,
  ambulance: 13.5,
  deliveryTruck: 15.0,
  flowerTruck: 14.0,
  jeepney: 14.5,
  tricycle: 12.5,
  citizen: 16.5,
};


const PLAZA_TARGET_SPAN_M = 185;
const COVERED_COURT_TARGET_SPAN_M = 224;
const SURFACE_LIFT_M = 0.15;
const REFERENCE_AREA_M2 = 250000;

function computeAdaptiveLimits(areaM2) {
  const areaRatio = Math.max(0.75, areaM2 / REFERENCE_AREA_M2);
  const ratio = Math.min(2.6, areaRatio);
  const scale = (base, minVal, maxVal) =>
    Math.max(minVal, Math.min(maxVal, Math.round(base * ratio)));

  // Always spawn at least all 5 shop GLBs & all 6 house GLBs; scale count + size up for larger barangays
  const largeFactor = Math.max(1.0, areaRatio);
  const shops = Math.max(5, Math.min(14, Math.round(5 * Math.pow(largeFactor, 0.55))));
  const houses = Math.max(6, Math.min(20, Math.round(6 * Math.pow(largeFactor, 0.65))));
  const buildingSizeScale = Number(
    Math.max(1.0, Math.min(1.28, 1 + (Math.sqrt(largeFactor) - 1) * 0.25)).toFixed(2)
  );

  return {
    barangayHalls: 1,
    plazas: 1,
    coveredCourts: 1,
    schools: 1,
    policeStations: 1,
    hospitals: 1,
    buildingSizeScale,
    maxTotalEnvBuildings: shops + houses + 1,
    shops,
    houses,
    trees: scale(22, 14, 40),
    trafficLights: scale(4, 2, 8),
    roadSigns: scale(5, 3, 10),
    benches: scale(8, 4, 16),
    benchTables: scale(6, 4, 12),
    streetLights: scale(8, 5, 18),
    utilityPoles: scale(7, 4, 16),
    fireHydrants: scale(4, 2, 8),
    wasteBins: scale(8, 4, 16),
    dumpsters: scale(4, 2, 8),
    movingJeepneys: scale(3, 2, 5),
    movingTricycles: scale(4, 2, 6),
    parkedJeepneys: 2,
    parkedTricycles: 2,
    parkedCars: scale(3, 2, 6),
    parkedCars2: scale(3, 2, 6),
    parkedDeliveryTrucks: 2,
    flowerTrucks: 2,
    ambulances: 1,
    policeCars: 2,
    walkingCitizens: scale(12, 8, 22),
    standingCitizens: scale(10, 6, 18),
  };
}

// ============================================================================
// MANUAL BUILDING AXIS OFFSETS (IN DEGREES)
// Edit any value below (e.g. 0, 90, 180, 270) and save/reload to rotate that model.
// ============================================================================
export const BUILDING_AXIS_OFFSETS = {
  // Civic & Community Landmarks
  barangayHall: 180, // /models/low_poly_city_hall.glb
  plaza: 180,        // /models/plaza.glb
  coveredCourt: 180, // /models/covered_court.glb

  // Commercial Shophouses (SHOP_MODEL_PATHS[0..4])
  shop_0: 90,   //done, blue house    // /models/low_poly_shop.glb
  shop_1: 180,   //do    // /models/low_poly_shop_1.glb
  shop_2: 180,       // /models/low_poly_shop_2.glb
  shop_3: 180,       // /models/low_poly_shop_3.glb
  shop_4: 180,       // /models/low_poly_shop_4.glb

  // Residential Houses (HOUSE_MODEL_PATHS[0..5])
  house_0: 90,  //done, chimney house    // /models/low_poly_house.glb
  house_1: 90,  //done, dark brown house    // /models/low_poly_house_1.glb
  house_2: 90,  //done, pinkiest house // /models/low_poly_house_2.glb
  house_3: 90,    //done, dark red house // /models/low_poly_house_3.glb
  house_4: 90,   //done, light orange house // /models/low_poly_house_4.glb
  house_5: 90,  //done, dark red house   // /models/low_poly_house_5.glb
};

const SHOP_FRONT_AXIS_OFFSETS = [
  BUILDING_AXIS_OFFSETS.shop_0,
  BUILDING_AXIS_OFFSETS.shop_1,
  BUILDING_AXIS_OFFSETS.shop_2,
  BUILDING_AXIS_OFFSETS.shop_3,
  BUILDING_AXIS_OFFSETS.shop_4,
];

const HOUSE_FRONT_AXIS_OFFSETS = [
  BUILDING_AXIS_OFFSETS.house_0,
  BUILDING_AXIS_OFFSETS.house_1,
  BUILDING_AXIS_OFFSETS.house_2,
  BUILDING_AXIS_OFFSETS.house_3,
  BUILDING_AXIS_OFFSETS.house_4,
  BUILDING_AXIS_OFFSETS.house_5,
];


const JEEPNEY_FRONT_AXIS_OFFSET = 180;
const TRICYCLE_FRONT_AXIS_OFFSET = 90;
const PARKED_VEHICLE_FRONT_AXIS_OFFSET = 180;
const AMBULANCE_FRONT_AXIS_OFFSET = 90;
const CAR2_FRONT_AXIS_OFFSET = 90;

const CIVIC_SIZE_MULT = 2.10;
const CIVIC_VISUAL_BOOST = 1.00;
const SHOP_SIZE_MULT = 2.82;
const SHOP_LOT_MULT = 2.40;
const HOUSE_SIZE_MULT = 2.72;
const HOUSE_LOT_MULT = 2.30;

const _sc = (v, m) => Number((v * m).toFixed(1));

const BUILDING_SIZE_REF = {
  barangayHall: {
    targetX: _sc(64.0, CIVIC_SIZE_MULT),
    targetY: _sc(86.0, CIVIC_SIZE_MULT),
    targetZ: _sc(64.0, CIVIC_SIZE_MULT),
    halfSpanM: _sc(31.5, CIVIC_SIZE_MULT),
    frontAxisOffset: BUILDING_AXIS_OFFSETS.barangayHall,
  },
  school: {
    targetX: _sc(62.0, CIVIC_SIZE_MULT),
    targetY: _sc(84.0, CIVIC_SIZE_MULT),
    targetZ: _sc(62.0, CIVIC_SIZE_MULT),
    halfSpanM: _sc(30.5, CIVIC_SIZE_MULT),
    frontAxisOffset: BUILDING_AXIS_OFFSETS.school,
  },
  hospital: {
    targetX: _sc(62.0, CIVIC_SIZE_MULT),
    targetY: _sc(84.0, CIVIC_SIZE_MULT),
    targetZ: _sc(62.0, CIVIC_SIZE_MULT),
    halfSpanM: _sc(30.5, CIVIC_SIZE_MULT),
    frontAxisOffset: BUILDING_AXIS_OFFSETS.hospital,
  },
  policeStation: {
    targetX: _sc(58.0, CIVIC_SIZE_MULT),
    targetY: _sc(78.0, CIVIC_SIZE_MULT),
    targetZ: _sc(58.0, CIVIC_SIZE_MULT),
    halfSpanM: _sc(28.5, CIVIC_SIZE_MULT),
    frontAxisOffset: BUILDING_AXIS_OFFSETS.policeStation,
  },
  shop: {
    targetX: _sc(54.0, SHOP_SIZE_MULT),
    targetY: _sc(72.0, SHOP_SIZE_MULT),
    targetZ: _sc(52.0, SHOP_SIZE_MULT),
    halfSpanM: _sc(25.0, SHOP_LOT_MULT),
  },
  house: {
    targetX: _sc(50.0, HOUSE_SIZE_MULT),
    targetY: _sc(68.0, HOUSE_SIZE_MULT),
    targetZ: _sc(48.0, HOUSE_SIZE_MULT),
    halfSpanM: _sc(23.0, HOUSE_LOT_MULT),
  },
};





// ============================================================================
// 1. IN-MEMORY BINARY GLB NORMALIZER & NON-FLICKERING CITIZEN BUILDERS
// ============================================================================

function multiplyMat4(a, b) {
  const out = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function getNodeLocalMat4(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) {
    return Float64Array.from(node.matrix);
  }
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const [qx, qy, qz, qw] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  return Float64Array.from([
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function transformPointMat4(m, x, y, z) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function stripFlatBasePlaneMeshes(gltf, rootNodeIndices, parentMat) {
  const entries = [];

  const visit = (idx, pMat) => {
    const node = gltf.nodes?.[idx];
    if (!node) return;
    const worldMat = multiplyMat4(pMat, getNodeLocalMat4(node));

    if (typeof node.mesh === 'number' && gltf.meshes?.[node.mesh]) {
      let nMinX = Infinity, nMaxX = -Infinity;
      let nMinY = Infinity, nMaxY = -Infinity;
      let nMinZ = Infinity, nMaxZ = -Infinity;
      for (const prim of gltf.meshes[node.mesh].primitives || []) {
        const acc = gltf.accessors?.[prim.attributes?.POSITION];
        if (Array.isArray(acc?.min) && Array.isArray(acc?.max)) {
          for (const x of [acc.min[0], acc.max[0]]) {
            for (const y of [acc.min[1], acc.max[1]]) {
              for (const z of [acc.min[2], acc.max[2]]) {
                const [wx, wy, wz] = transformPointMat4(worldMat, x, y, z);
                if (wx < nMinX) nMinX = wx;
                if (wx > nMaxX) nMaxX = wx;
                if (wy < nMinY) nMinY = wy;
                if (wy > nMaxY) nMaxY = wy;
                if (wz < nMinZ) nMinZ = wz;
                if (wz > nMaxZ) nMaxZ = wz;
              }
            }
          }
        }
      }
      if (Number.isFinite(nMinX)) {
        entries.push({
          nodeIdx: idx,
          spanX: nMaxX - nMinX,
          spanY: nMaxY - nMinY,
          spanZ: nMaxZ - nMinZ,
        });
      }
    }

    for (const childIdx of node.children || []) {
      visit(childIdx, worldMat);
    }
  };

  for (const rIdx of rootNodeIndices) {
    visit(rIdx, parentMat);
  }

  if (entries.length <= 1) return;

  const tallEntries = entries.filter((e) => e.spanY >= Math.max(e.spanX, e.spanZ) * 0.12);
  if (tallEntries.length === 0) return;

  const maxCoreFootprint = Math.max(...tallEntries.map((e) => Math.max(e.spanX, e.spanZ)));
  for (const e of entries) {
    const footprint = Math.max(e.spanX, e.spanZ);
    const isFlat = e.spanY < footprint * 0.08;
    const isOversizedPlane = footprint > maxCoreFootprint * 1.35;
    if (isFlat && isOversizedPlane && gltf.nodes?.[e.nodeIdx]) {
      delete gltf.nodes[e.nodeIdx].mesh;
    }
  }
}

function computeSubtreeBounds(gltf, nodeIndices, parentMat) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const visit = (idx, pMat) => {
    const node = gltf.nodes?.[idx];
    if (!node) return;
    const worldMat = multiplyMat4(pMat, getNodeLocalMat4(node));

    if (typeof node.mesh === 'number' && gltf.meshes?.[node.mesh]) {
      for (const prim of gltf.meshes[node.mesh].primitives || []) {
        const acc = gltf.accessors?.[prim.attributes?.POSITION];
        if (Array.isArray(acc?.min) && Array.isArray(acc?.max)) {
          for (const x of [acc.min[0], acc.max[0]]) {
            for (const y of [acc.min[1], acc.max[1]]) {
              for (const z of [acc.min[2], acc.max[2]]) {
                const [wx, wy, wz] = transformPointMat4(worldMat, x, y, z);
                if (wx < minX) minX = wx;
                if (wx > maxX) maxX = wx;
                if (wy < minY) minY = wy;
                if (wy > maxY) maxY = wy;
                if (wz < minZ) minZ = wz;
                if (wz > maxZ) maxZ = wz;
              }
            }
          }
        }
      }
    }

    for (const childIdx of node.children || []) {
      visit(childIdx, worldMat);
    }
  };

  for (const rootIdx of nodeIndices) {
    visit(rootIdx, parentMat);
  }

  if (!Number.isFinite(minX)) return null;
  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
    spanX: Math.max(1e-4, maxX - minX),
    spanY: Math.max(1e-4, maxY - minY),
    spanZ: Math.max(1e-4, maxZ - minZ),
  };
}

function sanitizeGltfMaterials(gltf) {
  if (gltf && Array.isArray(gltf.materials)) {
    const matsWithVertexColor = new Set();
    for (const mesh of gltf.meshes || []) {
      for (const prim of mesh.primitives || []) {
        if (prim.attributes?.COLOR_0 !== undefined && typeof prim.material === 'number') {
          matsWithVertexColor.add(prim.material);
        }
      }
    }

    for (let matIdx = 0; matIdx < gltf.materials.length; matIdx++) {
      const mat = gltf.materials[matIdx];
      if (!mat) continue;
      if (!mat.pbrMetallicRoughness) mat.pbrMetallicRoughness = {};
      const pbr = mat.pbrMetallicRoughness;

      const wasUnlit = Boolean(mat.extensions?.KHR_materials_unlit);
      if (wasUnlit) {
        delete mat.extensions.KHR_materials_unlit;
        if (Object.keys(mat.extensions).length === 0) delete mat.extensions;
      }

      const bf = pbr.baseColorFactor;
      const isPitchBlackBase =
        Array.isArray(bf) && bf.length >= 3 && bf[0] < 0.04 && bf[1] < 0.04 && bf[2] < 0.04;

      if (wasUnlit && isPitchBlackBase) {
        if (mat.emissiveTexture && !pbr.baseColorTexture) {
          pbr.baseColorTexture = { ...mat.emissiveTexture };
          pbr.baseColorFactor = [1, 1, 1, bf[3] ?? 1];
          delete mat.emissiveTexture;
          mat.emissiveFactor = [0, 0, 0];
        } else if (Array.isArray(mat.emissiveFactor) && mat.emissiveFactor.some((v) => v > 0.02)) {
          // Promote artist's unlit emissive color (e.g. car_2.glb) into lit PBR baseColorFactor
          const [er, eg, eb] = mat.emissiveFactor;
          const lift = (v) => Number(Math.min(1, Math.pow(Math.max(0, v), 0.78)).toFixed(4));
          pbr.baseColorFactor = [lift(er), lift(eg), lift(eb), bf[3] ?? 1];
          mat.emissiveFactor = [
            Number((er * 0.14).toFixed(4)),
            Number((eg * 0.14).toFixed(4)),
            Number((eb * 0.14).toFixed(4)),
          ];
        } else if (pbr.baseColorTexture || matsWithVertexColor.has(matIdx)) {
          pbr.baseColorFactor = [1, 1, 1, bf[3] ?? 1];
        } else {
          pbr.baseColorFactor = [0.45, 0.56, 0.72, bf[3] ?? 1];
        }
        pbr.metallicFactor = 0.12;
        pbr.roughnessFactor = 0.48;
      } else if (isPitchBlackBase && (pbr.baseColorTexture || matsWithVertexColor.has(matIdx))) {
        pbr.baseColorFactor = [1, 1, 1, bf[3] ?? 1];
      }

      // Clamp overly metallic surfaces so non-IBL Deck.gl PBR never renders dark silhouettes
      if (typeof pbr.metallicFactor === 'number' && pbr.metallicFactor > 0.35) {
        pbr.metallicFactor = 0.22;
        if (typeof pbr.roughnessFactor !== 'number' || pbr.roughnessFactor < 0.38) {
          pbr.roughnessFactor = 0.44;
        }
      }

      for (const texRef of [
        pbr.baseColorTexture,
        pbr.metallicRoughnessTexture,
        mat.normalTexture,
        mat.occlusionTexture,
        mat.emissiveTexture,
      ]) {
        if (texRef && typeof texRef.texCoord === 'number' && texRef.texCoord > 1) {
          texRef.texCoord = 0;
        }
      }
    }

    if (Array.isArray(gltf.extensionsUsed)) {
      gltf.extensionsUsed = gltf.extensionsUsed.filter((e) => e !== 'KHR_materials_unlit');
    }
    if (Array.isArray(gltf.extensionsRequired)) {
      gltf.extensionsRequired = gltf.extensionsRequired.filter((e) => e !== 'KHR_materials_unlit');
    }
  }

  _origSanitizeGltfMaterials(gltf);
}

function _origSanitizeGltfMaterials(gltf) {
  let hasMissingNormals = false;
  if (Array.isArray(gltf.meshes)) {
    for (const mesh of gltf.meshes) {
      for (const prim of mesh?.primitives || []) {
        if (prim?.attributes && prim.attributes.NORMAL === undefined) {
          hasMissingNormals = true;
        }
      }
    }
  }

  if (!Array.isArray(gltf.materials) || gltf.materials.length === 0) {
    gltf.materials = [
      {
        name: 'FallbackBrightMat',
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [0.92, 0.94, 0.98, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.72,
        },
      },
    ];
  }

  let needsUnlitExtension = false;

  for (const mat of gltf.materials) {
    if (!mat) continue;
    mat.doubleSided = true;

    const specGloss = mat.extensions?.KHR_materials_pbrSpecularGlossiness;
    if (specGloss) {
      mat.pbrMetallicRoughness = mat.pbrMetallicRoughness || {};
      if (specGloss.diffuseFactor && !mat.pbrMetallicRoughness.baseColorFactor) {
        mat.pbrMetallicRoughness.baseColorFactor = specGloss.diffuseFactor;
      }
      if (specGloss.diffuseTexture && !mat.pbrMetallicRoughness.baseColorTexture) {
        mat.pbrMetallicRoughness.baseColorTexture = specGloss.diffuseTexture;
      }
      delete mat.extensions.KHR_materials_pbrSpecularGlossiness;
    }

    if (!mat.pbrMetallicRoughness) {
      mat.pbrMetallicRoughness = {
        baseColorFactor: [0.92, 0.92, 0.92, 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 0.72,
      };
    } else {
      mat.pbrMetallicRoughness.metallicFactor = 0.0;
      const r = mat.pbrMetallicRoughness.roughnessFactor;
      mat.pbrMetallicRoughness.roughnessFactor =
        typeof r === 'number' && Number.isFinite(r) ? Math.max(0.65, r) : 0.72;
    }

    if (hasMissingNormals) {
      mat.extensions = mat.extensions || {};
      mat.extensions.KHR_materials_unlit = {};
      needsUnlitExtension = true;
    } else {
      mat.emissiveFactor = [0.10, 0.10, 0.10];
    }
  }

  if (Array.isArray(gltf.extensionsUsed)) {
    gltf.extensionsUsed = gltf.extensionsUsed.filter(
      (ext) => ext !== 'KHR_materials_pbrSpecularGlossiness'
    );
  }
  if (Array.isArray(gltf.extensionsRequired)) {
    gltf.extensionsRequired = gltf.extensionsRequired.filter(
      (ext) => ext !== 'KHR_materials_pbrSpecularGlossiness'
    );
  }
  if (needsUnlitExtension) {
    gltf.extensionsUsed = Array.from(new Set([...(gltf.extensionsUsed || []), 'KHR_materials_unlit']));
  }
}

function packGlbFromJsonAndBin(gltf, binChunkBytes) {
  const rawJsonBytes = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonPadding = (4 - (rawJsonBytes.length % 4)) % 4;
  const paddedJsonLen = rawJsonBytes.length + jsonPadding;

  const totalByteLength = 12 + 8 + paddedJsonLen + (binChunkBytes ? binChunkBytes.byteLength : 0);
  const outBuf = new ArrayBuffer(totalByteLength);
  const view = new DataView(outBuf);
  const outBytes = new Uint8Array(outBuf);

  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalByteLength, true);

  view.setUint32(12, paddedJsonLen, true);
  view.setUint32(16, 0x4e4f534a, true);
  outBytes.set(rawJsonBytes, 20);
  for (let i = 0; i < jsonPadding; i++) {
    outBytes[20 + rawJsonBytes.length + i] = 0x20;
  }

  if (binChunkBytes) {
    outBytes.set(binChunkBytes, 20 + paddedJsonLen);
  }

  const blob = new Blob([outBuf], { type: 'model/gltf-binary' });
  return URL.createObjectURL(blob);
}

function buildIsolatedSubModelBlobUrl(baseGltf, binChunkBytes, targetNodeIndices, bounds) {
  const cloned = JSON.parse(JSON.stringify(baseGltf));
  sanitizeGltfMaterials(cloned);
  cloned.nodes = Array.isArray(cloned.nodes) ? [...cloned.nodes] : [];

  const wrapperIdx = cloned.nodes.length;
  cloned.nodes.push({
    name: 'NormalizedPivotRoot',
    translation: [-bounds.centerX, -bounds.minY, -bounds.centerZ],
    children: targetNodeIndices,
  });

  cloned.scenes = [{ nodes: [wrapperIdx] }];
  cloned.scene = 0;

  return packGlbFromJsonAndBin(cloned, binChunkBytes);
}

function buildMultiMaterialBoxGlb(parts) {
  const matList = [];
  const primitives = [];
  const posChunks = [];
  const normChunks = [];
  const idxChunks = [];
  const accessors = [];
  const bufferViews = [];
  let byteOffset = 0;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const { rgb, boxes, emissiveBoost = 0.14 } of parts) {
    const matIdx = matList.length;
    matList.push({
      doubleSided: true,
      pbrMetallicRoughness: {
        baseColorFactor: [rgb[0], rgb[1], rgb[2], 1.0],
        metallicFactor: 0.0,
        roughnessFactor: 0.72,
      },
      emissiveFactor: [
        Math.min(1, rgb[0] * emissiveBoost),
        Math.min(1, rgb[1] * emissiveBoost),
        Math.min(1, rgb[2] * emissiveBoost),
      ],
    });

    const positions = [];
    const normals = [];
    const indices = [];

    for (const [cx, cy, cz, sx, sy, sz, pitchRad = 0] of boxes) {
      const hx = sx * 0.5;
      const hy = sy * 0.5;
      const hz = sz * 0.5;
      const cosP = Math.cos(pitchRad);
      const sinP = Math.sin(pitchRad);

      const rotPt = (lx, ly, lz) => [
        cx + lx,
        cy + ly * cosP - lz * sinP,
        cz + ly * sinP + lz * cosP,
      ];
      const rotNorm = (nx, ny, nz) => [
        nx,
        ny * cosP - nz * sinP,
        ny * sinP + nz * cosP,
      ];

      const faces = [
        { n: [0, 0, 1], c: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
        { n: [0, 0, -1], c: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
        { n: [1, 0, 0], c: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
        { n: [-1, 0, 0], c: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
        { n: [0, 1, 0], c: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
        { n: [0, -1, 0], c: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
      ];

      for (const f of faces) {
        const base = positions.length / 3;
        const [rnx, rny, rnz] = rotNorm(f.n[0], f.n[1], f.n[2]);
        for (const [lx, ly, lz] of f.c) {
          const [wx, wy, wz] = rotPt(lx, ly, lz);
          positions.push(wx, wy, wz);
          normals.push(rnx, rny, rnz);
          if (wx < minX) minX = wx;
          if (wx > maxX) maxX = wx;
          if (wy < minY) minY = wy;
          if (wy > maxY) maxY = wy;
          if (wz < minZ) minZ = wz;
          if (wz > maxZ) maxZ = wz;
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    const posArr = new Float32Array(positions);
    const normArr = new Float32Array(normals);
    const idxArr = new Uint16Array(indices);
    const idxPad = (4 - (idxArr.byteLength % 4)) % 4;

    const pMin = [Infinity, Infinity, Infinity];
    const pMax = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < posArr.length; i += 3) {
      if (posArr[i] < pMin[0]) pMin[0] = posArr[i];
      if (posArr[i] > pMax[0]) pMax[0] = posArr[i];
      if (posArr[i + 1] < pMin[1]) pMin[1] = posArr[i + 1];
      if (posArr[i + 1] > pMax[1]) pMax[1] = posArr[i + 1];
      if (posArr[i + 2] < pMin[2]) pMin[2] = posArr[i + 2];
      if (posArr[i + 2] > pMax[2]) pMax[2] = posArr[i + 2];
    }

    const posView = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: posArr.byteLength, target: 34962 });
    byteOffset += posArr.byteLength;

    const normView = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: normArr.byteLength, target: 34962 });
    byteOffset += normArr.byteLength;

    const idxView = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: idxArr.byteLength, target: 34963 });
    byteOffset += idxArr.byteLength + idxPad;

    const posAcc = accessors.length;
    accessors.push({
      bufferView: posView,
      componentType: 5126,
      count: posArr.length / 3,
      type: 'VEC3',
      min: pMin,
      max: pMax,
    });
    const normAcc = accessors.length;
    accessors.push({ bufferView: normView, componentType: 5126, count: normArr.length / 3, type: 'VEC3' });
    const idxAcc = accessors.length;
    accessors.push({ bufferView: idxView, componentType: 5123, count: idxArr.length, type: 'SCALAR' });

    posChunks.push(new Uint8Array(posArr.buffer));
    normChunks.push(new Uint8Array(normArr.buffer));
    const paddedIdx = new Uint8Array(idxArr.byteLength + idxPad);
    paddedIdx.set(new Uint8Array(idxArr.buffer));
    idxChunks.push(paddedIdx);

    primitives.push({ attributes: { POSITION: posAcc, NORMAL: normAcc }, indices: idxAcc, material: matIdx });
  }

  const binChunk = new Uint8Array(8 + byteOffset);
  const dv = new DataView(binChunk.buffer);
  dv.setUint32(0, byteOffset, true);
  dv.setUint32(4, 0x004e4942, true);
  let cursor = 8;
  for (let i = 0; i < posChunks.length; i++) {
    binChunk.set(posChunks[i], cursor);
    cursor += posChunks[i].byteLength;
    binChunk.set(normChunks[i], cursor);
    cursor += normChunks[i].byteLength;
    binChunk.set(idxChunks[i], cursor);
    cursor += idxChunks[i].byteLength;
  }

  const gltf = {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives }],
    materials: matList,
    buffers: [{ byteLength: byteOffset }],
    bufferViews,
    accessors,
  };

  return {
    url: packGlbFromJsonAndBin(gltf, binChunk),
    bounds: {
      spanX: Math.max(1e-3, maxX - minX),
      spanY: Math.max(1e-3, maxY - minY),
      spanZ: Math.max(1e-3, maxZ - minZ),
    },
  };
}

function buildLowPolyCitizenVariant({
  shirtRgb,
  sleeveRgb,
  pantsRgb,
  shoeRgb = [0.95, 0.95, 0.96],
  skinRgb,
  hairRgb,
  bagRgb = null,
  hasCap = false,
  strideAngleRad = 0,
}) {
  const parts = [
    {
      rgb: shoeRgb,
      boxes: [
        [-0.12, 0.08, 0.03, 0.17, 0.14, 0.24, strideAngleRad],
        [0.12, 0.08, 0.03, 0.17, 0.14, 0.24, -strideAngleRad],
      ],
    },
    {
      rgb: pantsRgb,
      boxes: [
        [-0.12, 0.44, 0, 0.17, 0.62, 0.19, strideAngleRad],
        [0.12, 0.44, 0, 0.17, 0.62, 0.19, -strideAngleRad],
        [0, 0.76, 0, 0.42, 0.14, 0.24, 0],
      ],
    },
    {
      rgb: [0.14, 0.12, 0.10],
      boxes: [[0, 0.83, 0, 0.44, 0.06, 0.25, 0]],
    },
    {
      rgb: shirtRgb,
      boxes: [
        [0, 1.10, 0, 0.46, 0.50, 0.26, 0],
        [0, 1.36, 0, 0.24, 0.06, 0.22, 0],
      ],
    },
    {
      rgb: sleeveRgb,
      boxes: [
        [-0.31, 1.21, 0, 0.15, 0.24, 0.17, -strideAngleRad * 0.85],
        [0.31, 1.21, 0, 0.15, 0.24, 0.17, strideAngleRad * 0.85],
      ],
    },
    {
      rgb: skinRgb,
      boxes: [
        [-0.31, 0.96, 0, 0.12, 0.30, 0.13, -strideAngleRad * 0.85],
        [0.31, 0.96, 0, 0.12, 0.30, 0.13, strideAngleRad * 0.85],
        [0, 1.54, 0, 0.30, 0.30, 0.30, 0],
      ],
    },
    {
      rgb: hairRgb,
      boxes: [
        [0, 1.70, -0.02, 0.32, 0.11, 0.33, 0],
        ...(hasCap ? [[0, 1.72, 0.14, 0.30, 0.04, 0.18, 0]] : []),
      ],
    },
  ];
  if (bagRgb) {
    parts.push({ rgb: bagRgb, boxes: [[0, 1.12, -0.18, 0.34, 0.40, 0.14, 0]] });
  }
  return buildMultiMaterialBoxGlb(parts);
}

function createCitizenCatalog() {
  const skin = [0.92, 0.74, 0.58];
  const darkHair = [0.15, 0.13, 0.12];
  const brownHair = [0.34, 0.22, 0.14];

  const redOutfit = {
    shirtRgb: [0.94, 0.28, 0.24],
    sleeveRgb: [0.98, 0.96, 0.94],
    pantsRgb: [0.16, 0.27, 0.46],
    skinRgb: skin,
    hairRgb: darkHair,
    bagRgb: [0.18, 0.20, 0.24],
  };

  const blueOutfit = {
    shirtRgb: [0.08, 0.56, 0.88],
    sleeveRgb: [0.06, 0.42, 0.70],
    pantsRgb: [0.22, 0.24, 0.28],
    skinRgb: skin,
    hairRgb: brownHair,
    hasCap: true,
  };

  return {
    walkRedA: buildLowPolyCitizenVariant({ ...redOutfit, strideAngleRad: 0.42 }),
    walkRedB: buildLowPolyCitizenVariant({ ...redOutfit, strideAngleRad: -0.42 }),
    walkBlueA: buildLowPolyCitizenVariant({ ...blueOutfit, strideAngleRad: 0.42 }),
    walkBlueB: buildLowPolyCitizenVariant({ ...blueOutfit, strideAngleRad: -0.42 }),
    standA: buildLowPolyCitizenVariant({
      shirtRgb: [0.96, 0.68, 0.12],
      sleeveRgb: [0.85, 0.54, 0.08],
      pantsRgb: [0.18, 0.30, 0.48],
      skinRgb: skin,
      hairRgb: darkHair,
      bagRgb: [0.76, 0.24, 0.20],
      strideAngleRad: 0,
    }),
    standB: buildLowPolyCitizenVariant({
      shirtRgb: [0.12, 0.68, 0.46],
      sleeveRgb: [0.94, 0.96, 0.95],
      pantsRgb: [0.24, 0.26, 0.32],
      skinRgb: skin,
      hairRgb: brownHair,
      hasCap: true,
      strideAngleRad: 0,
    }),
  };
}

async function parseAndNormalizeGlb(url, { splitLeftToRight = false, stripGroundPlanes = false } = {}) {
  const res = await fetch(url);
  if (!res.ok) return [];
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) return [];

  const buf = await res.arrayBuffer();
  const view = new DataView(buf);
  if (buf.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) return [];

  const jsonLen = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a) return [];
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));

  const binOffset = 20 + jsonLen;
  const binChunkBytes =
    buf.byteLength > binOffset + 8 ? new Uint8Array(buf, binOffset, buf.byteLength - binOffset) : null;

  const sceneIdx = gltf.scene ?? 0;
  const originalRootNodes = gltf.scenes?.[sceneIdx]?.nodes || [];
  if (originalRootNodes.length === 0) return [];

  const identity = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  if (stripGroundPlanes) {
    stripFlatBasePlaneMeshes(gltf, originalRootNodes, identity);
  }

  if (!splitLeftToRight) {
    const bounds = computeSubtreeBounds(gltf, originalRootNodes, identity);
    if (!bounds) return [];
    const blobUrl = buildIsolatedSubModelBlobUrl(gltf, binChunkBytes, originalRootNodes, bounds);
    return [{ index: 0, url: blobUrl, bounds }];
  }

  let candidateNodes = originalRootNodes;
  let wrapperChain = [];
  while (candidateNodes.length === 1) {
    const onlyNode = gltf.nodes?.[candidateNodes[0]];
    if (!onlyNode || typeof onlyNode.mesh === 'number' || !onlyNode.children?.length) break;
    wrapperChain.push(candidateNodes[0]);
    candidateNodes = onlyNode.children;
  }

  let parentAccumMat = identity;
  for (const wIdx of wrapperChain) {
    parentAccumMat = multiplyMat4(parentAccumMat, getNodeLocalMat4(gltf.nodes[wIdx]));
  }

  const items = [];
  for (let i = 0; i < candidateNodes.length; i++) {
    const nIdx = candidateNodes[i];
    const bounds = computeSubtreeBounds(gltf, [nIdx], parentAccumMat);
    if (!bounds || bounds.spanY < 0.25 || bounds.spanY < Math.max(bounds.spanX, bounds.spanZ) * 1.15) {
      continue;
    }
    items.push({ nodeIdx: nIdx, bounds });
  }

  if (items.length === 0) {
    const bounds = computeSubtreeBounds(gltf, originalRootNodes, identity);
    if (!bounds) return [];
    return [
      {
        index: 0,
        url: buildIsolatedSubModelBlobUrl(gltf, binChunkBytes, originalRootNodes, bounds),
        bounds,
      },
    ];
  }

  items.sort((a, b) => a.bounds.centerX - b.bounds.centerX);

  return items.map((item, sortedIdx) => {
    const clonedGltf = JSON.parse(JSON.stringify(gltf));
    let childList = [item.nodeIdx];
    for (let w = wrapperChain.length - 1; w >= 0; w--) {
      const origWrapper = clonedGltf.nodes[wrapperChain[w]];
      const newWrapperIdx = clonedGltf.nodes.length;
      clonedGltf.nodes.push({
        ...origWrapper,
        children: childList,
      });
      childList = [newWrapperIdx];
    }

    return {
      index: sortedIdx,
      url: buildIsolatedSubModelBlobUrl(clonedGltf, binChunkBytes, childList, item.bounds),
      bounds: item.bounds,
    };
  });
}

let CACHED_ENV_CATALOG_PROMISE = null;

export function loadEnvironmentGlbCatalog() {
  if (CACHED_ENV_CATALOG_PROMISE) return CACHED_ENV_CATALOG_PROMISE;

  CACHED_ENV_CATALOG_PROMISE = (async () => {
    const citizens = createCitizenCatalog();

    const [
      barangayHallItems,
      shopLists,
      houseLists,
      plazaItems,
      coveredCourtItems,
      schoolItems,
      policeStationItems,
      hospitalItems,
      treeItems,
      signItems,
      benchItems,
      benchTableItems,
      trafficLightItems,
      dumpsterItems,
      wasteBinItems,
      wasteBin2Items,
      streetLightItems,
      utilityPoleItems,
      fireHydrantItems,
      jeepneyItems,
      tricycleItems,
      deliveryTruckItems,
      flowerTruckItems,
      ambulanceItems,
      policeCarItems,
      carItems,
      car2Items,
    ] = await Promise.all([
      parseAndNormalizeGlb(ENV_MODEL_PATHS.barangayHall, { splitLeftToRight: false, stripGroundPlanes: true }).catch(() => []),
      Promise.all(
        SHOP_MODEL_PATHS.map((p) =>
          parseAndNormalizeGlb(p, { splitLeftToRight: false, stripGroundPlanes: true }).catch(() => [])
        )
      ),
      Promise.all(
        HOUSE_MODEL_PATHS.map((p) =>
          parseAndNormalizeGlb(p, { splitLeftToRight: false, stripGroundPlanes: true }).catch(() => [])
        )
      ),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.plaza, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.coveredCourt, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.school, { splitLeftToRight: false, stripGroundPlanes: true }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.policeStation, { splitLeftToRight: false, stripGroundPlanes: true }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.hospital, { splitLeftToRight: false, stripGroundPlanes: true }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.trees, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.roadSigns, { splitLeftToRight: true }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.bench, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.benchTable, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.trafficLights, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.dumpster, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.wasteBin, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.wasteBin2, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.streetLight, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.utilityPole, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.fireHydrant, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.jeepney, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.tricycle, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.deliveryTruck, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.flowerTruck, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.ambulance, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.policeCar, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.car, { splitLeftToRight: false }).catch(() => []),
      parseAndNormalizeGlb(ENV_MODEL_PATHS.car2, { splitLeftToRight: false }).catch(() => []),
    ]);

    return {
      ready: true,
      barangayHall: barangayHallItems[0] || null,
      shops: shopLists.map((list) => list[0]).filter(Boolean),
      houses: houseLists.map((list) => list[0]).filter(Boolean),
      plaza: plazaItems[0] || null,
      coveredCourt: coveredCourtItems[0] || null,
      school: schoolItems[0] || null,
      policeStation: policeStationItems[0] || null,
      hospital: hospitalItems[0] || null,
      citizens,
      tree: treeItems[0] || null,
      roadSigns: signItems,
      bench: benchItems[0] || null,
      benchTable: benchTableItems[0] || null,
      trafficLight: trafficLightItems[0] || null,
      dumpster: dumpsterItems[0] || null,
      wasteBin: wasteBinItems[0] || null,
      wasteBin2: wasteBin2Items[0] || wasteBinItems[0] || null,
      streetLight: streetLightItems[0] || null,
      utilityPole: utilityPoleItems[0] || null,
      fireHydrant: fireHydrantItems[0] || null,
      jeepney: jeepneyItems[0] || null,
      tricycle: tricycleItems[0] || null,
      deliveryTruck: deliveryTruckItems[0] || null,
      flowerTruck: flowerTruckItems[0] || null,
      ambulance: ambulanceItems[0] || null,
      policeCar: policeCarItems[0] || null,
      car: carItems[0] || null,
      car2: car2Items[0] || null,
    };
  })();

  return CACHED_ENV_CATALOG_PROMISE;
}

// ============================================================================
// 2. GEOMETRY, AREA SCALING & SPATIAL HELPERS
// ============================================================================

function spatialHash01(lng, lat, salt = 0) {
  const x =
    Math.round(lng * 100000) * 12.9898 +
    Math.round(lat * 100000) * 78.233 +
    salt * 43.17;
  const s = Math.sin(x) * 43758.5453;
  return s - Math.floor(s);
}

function pointInRingLngLat(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function isInsidePolygon(lng, lat, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates || [];
    if (!outer || !pointInRingLngLat(lng, lat, outer)) return false;
    for (const h of holes) if (pointInRingLngLat(lng, lat, h)) return false;
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates || []) {
      const [outer, ...holes] = poly;
      if (outer && pointInRingLngLat(lng, lat, outer)) {
        let inHole = false;
        for (const h of holes) if (pointInRingLngLat(lng, lat, h)) inHole = true;
        if (!inHole) return true;
      }
    }
  }
  return false;
}

function computeRingAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x1 = ring[j][0] * METERS_PER_DEG_LNG;
    const y1 = ring[j][1] * METERS_PER_DEG_LAT;
    const x2 = ring[i][0] * METERS_PER_DEG_LNG;
    const y2 = ring[i][1] * METERS_PER_DEG_LAT;
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) * 0.5;
}

function computePolygonAreaM2(geometry) {
  if (!geometry) return REFERENCE_AREA_M2;
  let total = 0;
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates || [];
    total += computeRingAreaM2(outer);
    for (const h of holes) total -= computeRingAreaM2(h);
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates || []) {
      const [outer, ...holes] = poly;
      total += computeRingAreaM2(outer);
      for (const h of holes) total -= computeRingAreaM2(h);
    }
  }
  return Math.max(45000, total);
}

function getBBox(geometry) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  const scan = (ring) => {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  };
  if (geometry?.type === 'Polygon') {
    for (const r of geometry.coordinates || []) scan(r);
  } else if (geometry?.type === 'MultiPolygon') {
    for (const p of geometry.coordinates || []) for (const r of p) scan(r);
  }
  return Number.isFinite(minLng) ? { minLng, maxLng, minLat, maxLat } : null;
}

function pointToSegDistM(lng, lat, lng1, lat1, lng2, lat2) {
  const px = lng * METERS_PER_DEG_LNG;
  const py = lat * METERS_PER_DEG_LAT;
  const ax = lng1 * METERS_PER_DEG_LNG;
  const ay = lat1 * METERS_PER_DEG_LAT;
  const bx = lng2 * METERS_PER_DEG_LNG;
  const by = lat2 * METERS_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function makeRotatedRectRing(lng, lat, ux, uy, nx, ny, halfLenM, halfWidthM) {
  const pt = (along, perp) => [
    Number((lng + (ux * along + nx * perp) / METERS_PER_DEG_LNG).toFixed(6)),
    Number((lat + (uy * along + ny * perp) / METERS_PER_DEG_LAT).toFixed(6)),
  ];
  const p0 = pt(-halfLenM, halfWidthM);
  const p1 = pt(halfLenM, halfWidthM);
  const p2 = pt(halfLenM, -halfWidthM);
  const p3 = pt(-halfLenM, -halfWidthM);
  return [p0, p1, p2, p3, p0];
}

function makeCirclePolygonRing(lng, lat, radiusM, segments = 16) {
  const ring = [];
  for (let i = 0; i <= segments; i++) {
    const ang = (i / segments) * Math.PI * 2;
    ring.push([
      Number((lng + (Math.cos(ang) * radiusM) / METERS_PER_DEG_LNG).toFixed(6)),
      Number((lat + (Math.sin(ang) * radiusM) / METERS_PER_DEG_LAT).toFixed(6)),
    ]);
  }
  return ring;
}

function samplePolylineAtFraction(path, cumDist, totalLen, fraction) {
  const targetDist = Math.min(totalLen, Math.max(0, totalLen * fraction));
  for (let i = 0; i < path.length - 1; i++) {
    const startD = cumDist[i];
    const endD = cumDist[i + 1];
    if (endD >= targetDist || i === path.length - 2) {
      const segLen = endD - startD;
      const t = segLen > 0 ? Math.min(1, Math.max(0, (targetDist - startD) / segLen)) : 0;
      const p1 = path[i];
      const p2 = path[i + 1];
      return [p1[0] + (p2[0] - p1[0]) * t, p1[1] + (p2[1] - p1[1]) * t];
    }
  }
  return path[0];
}

function sampleRoutePoint(path, cumDist, totalLen, fraction) {
  if (!Array.isArray(path) || path.length < 2 || totalLen <= 0) return null;
  const f = Math.min(1, Math.max(0, fraction));
  const [lng, lat] = samplePolylineAtFraction(path, cumDist, totalLen, f);
  const lookBehind = samplePolylineAtFraction(path, cumDist, totalLen, Math.max(0, f - 0.02));
  const lookAhead = samplePolylineAtFraction(path, cumDist, totalLen, Math.min(1, f + 0.02));
  const dEast = (lookAhead[0] - lookBehind[0]) * METERS_PER_DEG_LNG;
  const dNorth = (lookAhead[1] - lookBehind[1]) * METERS_PER_DEG_LAT;
  const bearingDeg = (Math.atan2(dEast, dNorth) * 180) / Math.PI;
  return { lng, lat, bearingDeg };
}

function buildOffsetLanePath(coordsLngLat, laneOffsetM) {
  const out = [];
  for (let i = 0; i < coordsLngLat.length; i++) {
    const curr = coordsLngLat[i];
    const prev = coordsLngLat[Math.max(0, i - 1)];
    const next = coordsLngLat[Math.min(coordsLngLat.length - 1, i + 1)];
    const dE = (next[0] - prev[0]) * METERS_PER_DEG_LNG;
    const dN = (next[1] - prev[1]) * METERS_PER_DEG_LAT;
    const len = Math.hypot(dE, dN);
    if (len < 1e-3) {
      out.push(curr);
      continue;
    }
    const nx = -dN / len;
    const ny = dE / len;
    out.push([
      curr[0] + (nx * laneOffsetM) / METERS_PER_DEG_LNG,
      curr[1] + (ny * laneOffsetM) / METERS_PER_DEG_LAT,
    ]);
  }
  const cumDist = [0];
  for (let i = 0; i < out.length - 1; i++) {
    const d = Math.hypot(
      (out[i + 1][0] - out[i][0]) * METERS_PER_DEG_LNG,
      (out[i + 1][1] - out[i][1]) * METERS_PER_DEG_LAT
    );
    cumDist.push(cumDist[i] + d);
  }
  return { path: out, cumDist, totalLenM: cumDist[cumDist.length - 1] };
}

function segmentOverlapsRiver(lng1, lat1, lng2, lat2) {
  for (let k = -2; k <= 18; k++) {
    const t = k / 16;
    const lng = lng1 + (lng2 - lng1) * t;
    const lat = lat1 + (lat2 - lat1) * t;
    if (isInsideWaterwayClearance(lat, lng, 68, 58)) return true;
  }
  return false;
}

// ============================================================================
// 3. ADAPTIVE 3D BARANGAY ENVIRONMENT BUILDER
// ============================================================================

export function buildBarangayEnvironment({
  barangayName,
  barangayGeometry,
  buildings = [],
  waterPoints = [],
  evacHalls = [],
}) {
  if (!barangayName || !barangayGeometry) return null;
  const bbox = getBBox(barangayGeometry);
  if (!bbox) return null;

  const areaM2 = computePolygonAreaM2(barangayGeometry);
  const limits = computeAdaptiveLimits(areaM2);
  const buildingSizeScale = limits.buildingSizeScale || 1.0;
  const scaleBuildingRef = (ref, f) => ({
    ...ref,
    targetX: Number((ref.targetX * f).toFixed(1)),
    targetY: Number((ref.targetY * f).toFixed(1)),
    targetZ: Number((ref.targetZ * f).toFixed(1)),
    halfSpanM: Number((ref.halfSpanM * f).toFixed(1)),
  });
  const hallRefScaled = scaleBuildingRef(BUILDING_SIZE_REF.barangayHall, buildingSizeScale);
  const shopRefScaled = scaleBuildingRef(BUILDING_SIZE_REF.shop, buildingSizeScale);
  const houseRefScaled = scaleBuildingRef(BUILDING_SIZE_REF.house, buildingSizeScale);

  const pad = 0.0025;
  const rawRoadGroups = [
    { tier: 'primary', halfAsphaltM: 17.5, halfSidewalkM: 28.0, lines: NAGA_OSM_PRIMARY_ROADS },
    { tier: 'secondary', halfAsphaltM: 15.0, halfSidewalkM: 24.5, lines: NAGA_OSM_SECONDARY_ROADS },
    { tier: 'tertiary', halfAsphaltM: 12.5, halfSidewalkM: 21.0, lines: NAGA_TERTIARY_ROADS },
    { tier: 'local', halfAsphaltM: 10.0, halfSidewalkM: 17.5, lines: NAGA_LOCAL_STREETS },
  ];

  const insideSegments = [];
  const insideCorridors = [];
  const outsideArterialFeatures = [];
  const groundFeatures = [];
  const endpointBuckets = new Map();
  const probes = [];

  const turfPolys =
    barangayGeometry.type === 'Polygon'
      ? [barangayGeometry.coordinates]
      : barangayGeometry.type === 'MultiPolygon'
      ? barangayGeometry.coordinates
      : [];
  for (const polyCoords of turfPolys) {
    if (Array.isArray(polyCoords) && polyCoords.length > 0) {
      groundFeatures.push({
        type: 'Feature',
        properties: { kind: 'turf_base' },
        geometry: { type: 'Polygon', coordinates: polyCoords },
      });
    }
  }

  for (const group of rawRoadGroups) {
    for (let li = 0; li < group.lines.length; li++) {
      const line = group.lines[li];
      if (!Array.isArray(line) || line.length < 2) continue;

      const outsideRun = [];
      let currentInsideCoords = [];

      const flushInsideCorridor = () => {
        if (currentInsideCoords.length >= 2) {
          insideCorridors.push({
            tier: group.tier,
            halfAsphaltM: group.halfAsphaltM,
            halfSidewalkM: group.halfSidewalkM,
            coords: [...currentInsideCoords],
          });
        }
        currentInsideCoords = [];
      };

      for (let si = 0; si < line.length - 1; si++) {
        const [lat1, lng1] = line[si];
        const [lat2, lng2] = line[si + 1];
        const midLng = (lng1 + lng2) * 0.5;
        const midLat = (lat1 + lat2) * 0.5;

        const inBox =
          Math.max(lng1, lng2) >= bbox.minLng - pad &&
          Math.min(lng1, lng2) <= bbox.maxLng + pad &&
          Math.max(lat1, lat2) >= bbox.minLat - pad &&
          Math.min(lat1, lat2) <= bbox.maxLat + pad;

        const overlapsRiver = segmentOverlapsRiver(lng1, lat1, lng2, lat2);

        const inside =
          inBox &&
          !overlapsRiver &&
          (isInsidePolygon(midLng, midLat, barangayGeometry) ||
            isInsidePolygon(lng1, lat1, barangayGeometry) ||
            isInsidePolygon(lng2, lat2, barangayGeometry));

        if (!inside) {
          flushInsideCorridor();
          if (
            !overlapsRiver &&
            (group.tier === 'primary' || group.tier === 'secondary' || group.tier === 'tertiary')
          ) {
            if (outsideRun.length === 0) outsideRun.push([lng1, lat1]);
            outsideRun.push([lng2, lat2]);
          } else {
            if (outsideRun.length >= 2) {
              outsideArterialFeatures.push({
                type: 'Feature',
                properties: { tier: group.tier },
                geometry: { type: 'LineString', coordinates: [...outsideRun] },
              });
            }
            outsideRun.length = 0;
          }
          continue;
        }

        if (outsideRun.length >= 2) {
          outsideArterialFeatures.push({
            type: 'Feature',
            properties: { tier: group.tier },
            geometry: { type: 'LineString', coordinates: [...outsideRun] },
          });
        }
        outsideRun.length = 0;

        if (currentInsideCoords.length === 0) currentInsideCoords.push([lng1, lat1]);
        currentInsideCoords.push([lng2, lat2]);

        const dE = (lng2 - lng1) * METERS_PER_DEG_LNG;
        const dN = (lat2 - lat1) * METERS_PER_DEG_LAT;
        const lenM = Math.hypot(dE, dN);
        if (lenM < 4) continue;

        const ux = dE / lenM;
        const uy = dN / lenM;
        const nx = -uy;
        const ny = ux;
        const bearingDeg = (((Math.atan2(ux, uy) * 180) / Math.PI) % 360 + 360) % 360;

        const seg = {
          tier: group.tier,
          lng1,
          lat1,
          lng2,
          lat2,
          midLng,
          midLat,
          lenM,
          ux,
          uy,
          nx,
          ny,
          bearingDeg,
          halfAsphaltM: group.halfAsphaltM,
          halfSidewalkM: group.halfSidewalkM,
        };
        insideSegments.push(seg);

        for (const [epLng, epLat, dirSign] of [
          [lng1, lat1, 1],
          [lng2, lat2, -1],
        ]) {
          const epKey = `${epLng.toFixed(4)},${epLat.toFixed(4)}`;
          let bucket = endpointBuckets.get(epKey);
          if (!bucket) {
            bucket = {
              lng: epLng,
              lat: epLat,
              approaches: [],
              maxHalfAsphaltM: group.halfAsphaltM,
              maxHalfSidewalkM: group.halfSidewalkM,
            };
            endpointBuckets.set(epKey, bucket);
          }
          if (group.halfAsphaltM > bucket.maxHalfAsphaltM) bucket.maxHalfAsphaltM = group.halfAsphaltM;
          if (group.halfSidewalkM > bucket.maxHalfSidewalkM) bucket.maxHalfSidewalkM = group.halfSidewalkM;
          bucket.approaches.push({
            ux: ux * dirSign,
            uy: uy * dirSign,
            nx: nx * dirSign,
            ny: ny * dirSign,
            bearingDeg: (((Math.atan2(ux * dirSign, uy * dirSign) * 180) / Math.PI) % 360 + 360) % 360,
            halfAsphaltM: group.halfAsphaltM,
            halfSidewalkM: group.halfSidewalkM,
            segLenM: lenM,
            tier: group.tier,
          });
        }

        const swHalfLen = lenM * 0.5 + 1.5;
        const roadHalfLen = lenM * 0.5 + 1.2;

        groundFeatures.push({
          type: 'Feature',
          properties: { kind: 'sidewalk_shadow' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              makeRotatedRectRing(midLng, midLat, ux, uy, nx, ny, swHalfLen + 1.2, group.halfSidewalkM + 1.4),
            ],
          },
        });
        groundFeatures.push({
          type: 'Feature',
          properties: { kind: 'sidewalk' },
          geometry: {
            type: 'Polygon',
            coordinates: [makeRotatedRectRing(midLng, midLat, ux, uy, nx, ny, swHalfLen, group.halfSidewalkM)],
          },
        });
        groundFeatures.push({
          type: 'Feature',
          properties: { kind: 'curb' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              makeRotatedRectRing(midLng, midLat, ux, uy, nx, ny, roadHalfLen, group.halfAsphaltM + 0.7),
            ],
          },
        });
        groundFeatures.push({
          type: 'Feature',
          properties: { kind: 'asphalt' },
          geometry: {
            type: 'Polygon',
            coordinates: [makeRotatedRectRing(midLng, midLat, ux, uy, nx, ny, roadHalfLen, group.halfAsphaltM)],
          },
        });

        if (lenM > 14) {
          if (group.tier === 'primary' || group.tier === 'secondary') {
            for (const offset of [-0.45, 0.45]) {
              const mLng = midLng + (nx * offset) / METERS_PER_DEG_LNG;
              const mLat = midLat + (ny * offset) / METERS_PER_DEG_LAT;
              groundFeatures.push({
                type: 'Feature',
                properties: { kind: 'marking', paint: 'yellow' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [makeRotatedRectRing(mLng, mLat, ux, uy, nx, ny, lenM * 0.46, 0.24)],
                },
              });
            }
            for (const edgeSide of [-1, 1]) {
              const edgeOffset = (group.halfAsphaltM - 1.1) * edgeSide;
              const eLng = midLng + (nx * edgeOffset) / METERS_PER_DEG_LNG;
              const eLat = midLat + (ny * edgeOffset) / METERS_PER_DEG_LAT;
              groundFeatures.push({
                type: 'Feature',
                properties: { kind: 'marking', paint: 'white' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [makeRotatedRectRing(eLng, eLat, ux, uy, nx, ny, lenM * 0.46, 0.22)],
                },
              });
            }
          } else {
            const dashStep = 12;
            for (let d = 6; d < lenM - 6; d += dashStep) {
              const dLng = lng1 + (ux * d) / METERS_PER_DEG_LNG;
              const dLat = lat1 + (uy * d) / METERS_PER_DEG_LAT;
              groundFeatures.push({
                type: 'Feature',
                properties: { kind: 'marking', paint: 'white' },
                geometry: {
                  type: 'Polygon',
                  coordinates: [makeRotatedRectRing(dLng, dLat, ux, uy, nx, ny, 2.8, 0.24)],
                },
              });
            }
          }
        }
      }

      flushInsideCorridor();
      if (outsideRun.length >= 2) {
        outsideArterialFeatures.push({
          type: 'Feature',
          properties: { tier: group.tier },
          geometry: { type: 'LineString', coordinates: [...outsideRun] },
        });
      }
    }
  }

  for (const [, bucket] of endpointBuckets.entries()) {
    if (bucket.approaches.length < 2) continue;
    groundFeatures.push({
      type: 'Feature',
      properties: { kind: 'sidewalk' },
      geometry: {
        type: 'Polygon',
        coordinates: [makeCirclePolygonRing(bucket.lng, bucket.lat, bucket.maxHalfSidewalkM, 16)],
      },
    });
    groundFeatures.push({
      type: 'Feature',
      properties: { kind: 'curb' },
      geometry: {
        type: 'Polygon',
        coordinates: [makeCirclePolygonRing(bucket.lng, bucket.lat, bucket.maxHalfAsphaltM + 0.7, 16)],
      },
    });
    groundFeatures.push({
      type: 'Feature',
      properties: { kind: 'asphalt' },
      geometry: {
        type: 'Polygon',
        coordinates: [makeCirclePolygonRing(bucket.lng, bucket.lat, bucket.maxHalfAsphaltM, 16)],
      },
    });
  }

  const squareOccupiedLots = buildings.map((b) => {
    const halfSpanM = Math.max((b.lotWidthM || 45) * 0.5, (b.lotDepthM || 45) * 0.5);
    return {
      lng: b.lng,
      lat: b.lat,
      archetype: b.archetype,
      bearingDeg: b.bearingDeg || 0,
      halfSpanM,
      lotWidthM: b.lotWidthM || 45,
      lotDepthM: b.lotDepthM || 45,
      lotRing: Array.isArray(b.lotRing) ? b.lotRing : null,
    };
  });

  const isInsideAnySquareLot = (lng, lat, padM = 3.0) => {
    for (let i = 0; i < squareOccupiedLots.length; i++) {
      const b = squareOccupiedLots[i];
      if (b.lotRing && b.lotRing.length >= 4 && pointInRingLngLat(lng, lat, b.lotRing)) {
        return true;
      }
      const dE = Math.abs((lng - b.lng) * METERS_PER_DEG_LNG);
      const dN = Math.abs((lat - b.lat) * METERS_PER_DEG_LAT);
      if (dE < b.halfSpanM + padM && dN < b.halfSpanM + padM) {
        return true;
      }
    }
    return false;
  };

  const isOnRoadOrSidewalk = (lng, lat, marginM = 2.0, includeSidewalk = false) => {
    for (let i = 0; i < insideSegments.length; i++) {
      const s = insideSegments[i];
      const limit = (includeSidewalk ? s.halfSidewalkM : s.halfAsphaltM) + marginM;
      if (pointToSegDistM(lng, lat, s.lng1, s.lat1, s.lng2, s.lat2) < limit) {
        return true;
      }
    }
    return false;
  };

  const isNearRoadCornerOrEndpoint = (lng, lat, minCornerDistM = 46) => {
    for (const [, bucket] of endpointBuckets.entries()) {
      const d = Math.hypot((lng - bucket.lng) * METERS_PER_DEG_LNG, (lat - bucket.lat) * METERS_PER_DEG_LAT);
      if (d < minCornerDistM) return true;
    }
    return false;
  };  // Rejects acute boundary tips/corners while allowing uniform street-front & neighborhood lots
       const isUniformOpenLand = (
    lng,
    lat,
    halfSpanM,
    {
      uniformHaloM = 16.0,
      roadBufferM = 12.0,
      lotGapM = 34.0,
      avoidCorners = true,
      civicGapM = 52.0,
      waterwayPad = 42,
      waterwayInner = 34,
      isCivic = false,
    } = {}
  ) => {
    const isStandardBuilding = !isCivic;

    if (avoidCorners) {
      if (
        typeof isNearRoadCornerOrEndpoint === 'function' &&
        isNearRoadCornerOrEndpoint(lng, lat, halfSpanM + 34)
      ) {
        return false;
      }
    }

    const haloRadiusM = halfSpanM + uniformHaloM;
    for (let k = 0; k < 12; k++) {
      const ang = (k * Math.PI) / 6;
      const hLng = lng + (Math.cos(ang) * haloRadiusM) / METERS_PER_DEG_LNG;
      const hLat = lat + (Math.sin(ang) * haloRadiusM) / METERS_PER_DEG_LAT;
      if (!isInsidePolygon(hLng, hLat, barangayGeometry)) return false;
      if (isInsideWaterwayClearance(hLat, hLng, waterwayPad, waterwayInner)) return false;
    }

    const squareLotHalfM = halfSpanM + uniformHaloM * 0.65;
    const steps = [-1, -0.5, 0, 0.5, 1];
    for (const sx of steps) {
      for (const sy of steps) {
        const cLng = lng + (sx * squareLotHalfM) / METERS_PER_DEG_LNG;
        const cLat = lat + (sy * squareLotHalfM) / METERS_PER_DEG_LAT;
        if (!isInsidePolygon(cLng, cLat, barangayGeometry)) return false;
        if (isInsideWaterwayClearance(cLat, cLng, waterwayPad, waterwayInner)) return false;
        if (isOnRoadOrSidewalk(cLng, cLat, roadBufferM, true)) return false;
      }
    }

    for (const wp of waterPoints) {
      const dE = Math.abs((lng - wp.lng) * METERS_PER_DEG_LNG);
      const dN = Math.abs((lat - wp.lat) * METERS_PER_DEG_LAT);
      if (dE < halfSpanM + 34 && dN < halfSpanM + 34) return false;
    }
    for (const hall of evacHalls) {
      const dE = Math.abs((lng - hall.lng) * METERS_PER_DEG_LNG);
      const dN = Math.abs((lat - hall.lat) * METERS_PER_DEG_LAT);
      if (dE < halfSpanM + 46 && dN < halfSpanM + 46) return false;
    }

    for (let i = 0; i < squareOccupiedLots.length; i++) {
      const occ = squareOccupiedLots[i];
      const occTrueHalfM = Math.max(
        occ.halfSpanM || 0,
        (occ.lotWidthM || 0) * 0.5,
        (occ.lotDepthM || 0) * 0.5
      );
      const dE = Math.abs((lng - occ.lng) * METERS_PER_DEG_LNG);
      const dN = Math.abs((lat - occ.lat) * METERS_PER_DEG_LAT);

      const isCivicOcc =
        occ.archetype === 'civic_hall' ||
        occ.archetype === 'park_plaza' ||
        occ.archetype === 'covered_court';
      const requiredGapM = isCivicOcc && isStandardBuilding ? civicGapM : lotGapM;

      if (Math.hypot(dE, dN) < halfSpanM + occTrueHalfM + requiredGapM) {
        return false;
      }
    }

    return true;
  };

  const getNearestStreetInfo = (lng, lat) => {
    let bestSeg = null;
    let bestDist = Infinity;
    let bestSide = 1;
    for (let i = 0; i < insideSegments.length; i++) {
      const s = insideSegments[i];
      const d = pointToSegDistM(lng, lat, s.lng1, s.lat1, s.lng2, s.lat2);
      if (d < bestDist) {
        bestDist = d;
        bestSeg = s;
        const dx = (lng - s.lng1) * METERS_PER_DEG_LNG;
        const dy = (lat - s.lat1) * METERS_PER_DEG_LAT;
        bestSide = dx * s.nx + dy * s.ny >= 0 ? 1 : -1;
      }
    }
    return { seg: bestSeg, distM: bestDist, side: bestSide };
  };

  const computeStreetFacingYaw = (lng, lat, seg, side = 1, frontAxisOffset = 180) => {
    const baseBearing = seg ? seg.bearingDeg : 0;
    const faceBearingDeg =
      side === 1 ? (baseBearing + 90) % 360 : (baseBearing + 270) % 360;
    const yawDeg = Number((((frontAxisOffset - faceBearingDeg) % 360 + 360) % 360).toFixed(1));
    return { faceBearingDeg, yawDeg };
  };

  // ==========================================================================
  // STEP 0: CIVIC CENTER COMPLEX (CITY HALL + PLAZA + COURT IN UPPER ZONE)
  // ==========================================================================
  const PLAZA_FOOTPRINT_HALF_M = Math.round(PLAZA_TARGET_SPAN_M * 0.54);
  const COURT_FOOTPRINT_HALF_M = 80.0;

  const targetUpperLeftLng = bbox.minLng + (bbox.maxLng - bbox.minLng) * 0.35;
  const targetUpperLeftLat = bbox.minLat + (bbox.maxLat - bbox.minLat) * 0.70;

  const isClearOfOccupiedLotsRadial = (lng, lat, halfSpanM, minGapM = 40.0) => {
    for (let i = 0; i < squareOccupiedLots.length; i++) {
      const occ = squareOccupiedLots[i];
      const occHalfM = Math.max(
        occ.halfSpanM || 0,
        (occ.lotWidthM || 0) * 0.5,
        (occ.lotDepthM || 0) * 0.5
      );
      const dE = (lng - occ.lng) * METERS_PER_DEG_LNG;
      const dN = (lat - occ.lat) * METERS_PER_DEG_LAT;
      const requiredDistM = (halfSpanM + occHalfM) * 1.2 + Math.max(minGapM, 40.0);
      if (Math.hypot(dE, dN) < requiredDistM) {
        return false;
      }
    }
    return true;
  };





  const findCivicSpotWithFallback = (halfSpanM, anchor = null) => {
    const minAnchorDistM = anchor
      ? Math.round((anchor.halfSpanM || 83) + halfSpanM + 24)
      : 38;

    if (anchor) {
            const distances = [
        minAnchorDistM,
        minAnchorDistM + 25,
        minAnchorDistM + 50,
        minAnchorDistM + 80,
        minAnchorDistM + 115,
        minAnchorDistM + 150,
      ];

      const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
      for (const haloM of [6.0, 2.0]) {
        for (const distM of distances) {
          for (const angDeg of angles) {
            const rad = (angDeg * Math.PI) / 180;
            const cLng = anchor.lng + (Math.sin(rad) * distM) / METERS_PER_DEG_LNG;
            const cLat = anchor.lat + (Math.cos(rad) * distM) / METERS_PER_DEG_LAT;
            if (!isClearOfOccupiedLotsRadial(cLng, cLat, halfSpanM, 22.0)) continue;
            if (
              isUniformOpenLand(cLng, cLat, halfSpanM, {
                uniformHaloM: haloM,
                roadBufferM: 5.5,
                lotGapM: 32.0,
                avoidCorners: false,
                isCivic: true,
              })
            ) {
              const st = getNearestStreetInfo(cLng, cLat);
              return {
                lng: cLng,
                lat: cLat,
                halfSpanM,
                seg: st.seg || anchor.seg,
                side: st.side || anchor.side,
                bearingDeg: st.seg ? st.seg.bearingDeg : anchor.bearingDeg,
              };
            }
          }
        }
      }
    }

    const _spanM = Math.max(
      120,
      (bbox.maxLng - bbox.minLng) * METERS_PER_DEG_LNG,
      (bbox.maxLat - bbox.minLat) * METERS_PER_DEG_LAT
    );
    const _stepM = Math.max(18, Math.ceil(_spanM / 26));
    const stepLng = _stepM / METERS_PER_DEG_LNG;
    const stepLat = _stepM / METERS_PER_DEG_LAT;
    for (const [haloM, roadBufM, gapM] of [
      [8.0, 6.5, 22.0],
      [4.0, 4.5, 18.0],
      [1.0, 3.0, 14.0],
    ]) {
      let bestSpot = null;
      let bestScore = -Infinity;
      for (let lat = bbox.minLat + stepLat; lat <= bbox.maxLat - stepLat; lat += stepLat) {
        for (let lng = bbox.minLng + stepLng; lng <= bbox.maxLng - stepLng; lng += stepLng) {
          if (!isClearOfOccupiedLotsRadial(lng, lat, halfSpanM, gapM)) continue;
          if (
            !isUniformOpenLand(lng, lat, halfSpanM, {
              uniformHaloM: haloM,
              roadBufferM: roadBufM,
              lotGapM: gapM,
              avoidCorners: false,
              isCivic: true,
            })
          ) {
            continue;
          }
          const st = getNearestStreetInfo(lng, lat);
          if (!st.seg) continue;

          const dTargetM = anchor
            ? Math.hypot(
                (lng - anchor.lng) * METERS_PER_DEG_LNG,
                (lat - anchor.lat) * METERS_PER_DEG_LAT
              )
            : Math.hypot(
                (lng - targetUpperLeftLng) * METERS_PER_DEG_LNG,
                (lat - targetUpperLeftLat) * METERS_PER_DEG_LAT
              );
          const score = -dTargetM * 2.0 - Math.abs(st.distM - (halfSpanM + 14)) * 0.4;
          if (score > bestScore) {
            bestScore = score;
            bestSpot = {
              lng,
              lat,
              halfSpanM,
              seg: st.seg,
              side: st.side,
              bearingDeg: st.seg.bearingDeg,
            };
          }
        }
      }
      if (bestSpot) return bestSpot;
    }
    return null;
  };

    const barangayHalls = [];
  const plazas = [];
  const coveredCourts = [];
  const schools = [];
  const policeStations = [];
  const hospitals = [];
    const shops = [];
  const houses = [];
    const stationaryVehicles = [];
  const benches = [];
  const benchTables = [];
  const wasteBins = [];
  const dumpsters = [];
  const streetLights = [];
  const utilityPoles = [];
  const roadSigns = [];
  const trafficLights = [];
  const fireHydrants = [];
  const trees = [];
  const walkingCitizens = [];
  const standingCitizens = [];
  const movingVehicles = [];
  const movingVehicleTracks = [];
  const citizenWalkTracks = [];
  const citizens = [];
  const walkingCitizenTracks = [];




  let civicAnchor = null;

  // ==========================================================================
  // EXACT 2D SAT ORIENTED BOUNDING BOX (OBB) ZERO-COLLISION VALIDATOR
  // ==========================================================================
  const _getLotAxes = (lot) => {
    if (typeof lot.ux === 'number' && typeof lot.uy === 'number') {
      return { ux: lot.ux, uy: lot.uy, nx: lot.nx ?? -lot.uy, ny: lot.ny ?? lot.ux };
    }
    const rad = ((lot.bearingDeg || 0) * Math.PI) / 180;
    const ux = Math.sin(rad);
    const uy = Math.cos(rad);
    return { ux, uy, nx: -uy, ny: ux };
  };

  const _obbOverlaps = (
    ax, ay, aux, auy, anx, any, ahw, ahd,
    bx, by, bux, buy, bnx, bny, bhw, bhd,
    gapM
  ) => {
    const tx = bx - ax;
    const ty = by - ay;
    const axes = [
      [aux, auy],
      [anx, any],
      [bux, buy],
      [bnx, bny],
    ];
    for (let i = 0; i < 4; i++) {
      const lx = axes[i][0];
      const ly = axes[i][1];
      const dist = Math.abs(tx * lx + ty * ly);
      const rA = ahw * Math.abs(aux * lx + auy * ly) + ahd * Math.abs(anx * lx + any * ly);
      const rB = bhw * Math.abs(bux * lx + buy * ly) + bhd * Math.abs(bnx * lx + bny * ly);
      if (dist >= rA + rB + gapM) return false;
    }
    return true;
  };

  const isOrientedLotClear = (
    lng,
    lat,
    halfW,
    halfD,
    ux,
    uy,
    nx,
    ny,
    {
      roadBufM = 4.2,
      lotGapM = 4.5,
      edgePadM = 1.0,
      waterwayPad = 18,
      waterwayInner = 12,
      checkCivicHub = false,
      civicBufM = 6.0,
    } = {}
  ) => {
    const checkW = halfW + edgePadM;
    const checkD = halfD + edgePadM;

    const gridSteps = [-1, -0.5, 0, 0.5, 1];
    for (let ix = 0; ix < gridSteps.length; ix++) {
      const sx = gridSteps[ix];
      for (let iy = 0; iy < gridSteps.length; iy++) {
        const sy = gridSteps[iy];
        const dE = ux * (sx * checkW) + nx * (sy * checkD);
        const dN = uy * (sx * checkW) + ny * (sy * checkD);
        const pLng = lng + dE / METERS_PER_DEG_LNG;
        const pLat = lat + dN / METERS_PER_DEG_LAT;
        if (!isInsidePolygon(pLng, pLat, barangayGeometry)) return false;
        if (isInsideWaterwayClearance(pLat, pLng, waterwayPad, waterwayInner)) return false;
        if (isOnRoadOrSidewalk(pLng, pLat, roadBufM, true)) return false;
      }
    }

    const ax = lng * METERS_PER_DEG_LNG;
    const ay = lat * METERS_PER_DEG_LAT;

    for (let i = 0; i < squareOccupiedLots.length; i++) {
      const occ = squareOccupiedLots[i];
      const bx = occ.lng * METERS_PER_DEG_LNG;
      const by = occ.lat * METERS_PER_DEG_LAT;
      const occHalf = Math.max(
        occ.halfSpanM || 0,
        (occ.lotWidthM || 0) * 0.50,
        (occ.lotDepthM || 0) * 0.50
      );
      const oW = occ.obbHalfW || occHalf;
      const oD = occ.obbHalfD || occHalf;
      const isCivicOcc =
        occ.archetype === 'civic_hall' ||
        occ.archetype === 'park_plaza' ||
        occ.archetype === 'covered_court' ||
        occ.archetype === 'civic_school' ||
        occ.archetype === 'civic_hospital' ||
        occ.archetype === 'civic_police';
      const reqGap = checkCivicHub && isCivicOcc ? Math.max(lotGapM, civicBufM) : lotGapM;

      const maxReach = Math.hypot(halfW, halfD) + Math.hypot(oW, oD) + reqGap;
      if (Math.hypot(bx - ax, by - ay) >= maxReach) continue;

      const oAx = _getLotAxes(occ);
      if (
        _obbOverlaps(
          ax, ay, ux, uy, nx, ny, halfW, halfD,
          bx, by, oAx.ux, oAx.uy, oAx.nx, oAx.ny, oW, oD,
          reqGap
        )
      ) {
        return false;
      }
    }

    return true;
  };

  // ==========================================================================
  // UNIFIED 6-BUILDING CIVIC HUB (TESTS 3x2 & 2x3 LAYOUTS SO ALL 6 FIT BIG)
  // ==========================================================================
  const civicStructures = [];
  const _preCivicOccupiedLen = squareOccupiedLots.length;
  const _preCivicProbesLen = probes.length;

  const _hubSpanM = Math.max(
    120,
    (bbox.maxLng - bbox.minLng) * METERS_PER_DEG_LNG,
    (bbox.maxLat - bbox.minLat) * METERS_PER_DEG_LAT
  );
  const _hubStepM = Math.max(14, Math.ceil(_hubSpanM / 26));
  const _hubStepLng = _hubStepM / METERS_PER_DEG_LNG;
  const _hubStepLat = _hubStepM / METERS_PER_DEG_LAT;
  const _hubAnchors = [];
  for (let lat = bbox.minLat + _hubStepLat * 0.5; lat <= bbox.maxLat - _hubStepLat * 0.5; lat += _hubStepLat) {
    for (let lng = bbox.minLng + _hubStepLng * 0.5; lng <= bbox.maxLng - _hubStepLng * 0.5; lng += _hubStepLng) {
      if (!isInsidePolygon(lng, lat, barangayGeometry)) continue;
      if (isInsideWaterwayClearance(lat, lng, 20, 14)) continue;
      if (isOnRoadOrSidewalk(lng, lat, 6, true)) continue;
      const st = getNearestStreetInfo(lng, lat);
      if (!st.seg) continue;
      _hubAnchors.push({ lng, lat, st });
    }
  }

  const _civicScaleCandidates = [1.0, 0.94, 0.88, 0.82, 0.76];
  let _resolvedCivicScale = 0.88;

  const _civicGridLayouts = [
    [ [0, 0], [1, 0], [-1, 0], [-1, 1], [0, 1], [1, 1] ], // 3x2 forward
    [ [0, 0], [1, 0], [-1, 0], [-1, -1], [0, -1], [1, -1] ], // 3x2 back
    [ [0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2] ], // 2x3 forward
    [ [0, 0], [1, 0], [0, -1], [1, -1], [0, -2], [1, -2] ], // 2x3 back
  ];

  const _placeCivicHubAtScale = (cScale) => {
    squareOccupiedLots.length = _preCivicOccupiedLen;
    probes.length = _preCivicProbesLen;
    barangayHalls.length = 0;
    plazas.length = 0;
    coveredCourts.length = 0;
    schools.length = 0;
    policeStations.length = 0;
    hospitals.length = 0;
    civicStructures.length = 0;
    civicAnchor = null;

    const specs = [
      {
        key: 'barangayHall',
        id: 'BARANGAY-HALL-1',
        list: barangayHalls,
        archetype: 'civic_hall',
        halfSpanM: Number((BUILDING_SIZE_REF.barangayHall.halfSpanM * cScale).toFixed(1)),
        lotW: Number((BUILDING_SIZE_REF.barangayHall.targetX * cScale).toFixed(1)),
        lotD: Number((BUILDING_SIZE_REF.barangayHall.targetZ * cScale).toFixed(1)),
        offset: BUILDING_AXIS_OFFSETS.barangayHall,
      },
      {
        key: 'plaza',
        id: 'PLAZA-1',
        list: plazas,
        archetype: 'park_plaza',
        halfSpanM: Number((29.0 * CIVIC_SIZE_MULT * cScale).toFixed(1)),
        lotW: Number((58.0 * CIVIC_SIZE_MULT * cScale).toFixed(1)),
        lotD: Number((58.0 * CIVIC_SIZE_MULT * cScale).toFixed(1)),
        offset: BUILDING_AXIS_OFFSETS.plaza,
      },
      {
        key: 'coveredCourt',
        id: 'COURT-1',
        list: coveredCourts,
        archetype: 'covered_court',
        halfSpanM: Number((31.0 * CIVIC_SIZE_MULT * cScale).toFixed(1)),
        lotW: Number((62.0 * CIVIC_SIZE_MULT * cScale).toFixed(1)),
        lotD: Number((62.0 * CIVIC_SIZE_MULT * cScale).toFixed(1)),
        offset: BUILDING_AXIS_OFFSETS.coveredCourt,
      },
      {
        key: 'school',
        id: 'SCHOOL-1',
        list: schools,
        archetype: 'civic_school',
        halfSpanM: Number((BUILDING_SIZE_REF.school.halfSpanM * cScale).toFixed(1)),
        lotW: Number((BUILDING_SIZE_REF.school.targetX * cScale).toFixed(1)),
        lotD: Number((BUILDING_SIZE_REF.school.targetZ * cScale).toFixed(1)),
        offset: BUILDING_AXIS_OFFSETS.school,
      },
      {
        key: 'hospital',
        id: 'HOSPITAL-1',
        list: hospitals,
        archetype: 'civic_hospital',
        halfSpanM: Number((BUILDING_SIZE_REF.hospital.halfSpanM * cScale).toFixed(1)),
        lotW: Number((BUILDING_SIZE_REF.hospital.targetX * cScale).toFixed(1)),
        lotD: Number((BUILDING_SIZE_REF.hospital.targetZ * cScale).toFixed(1)),
        offset: BUILDING_AXIS_OFFSETS.hospital,
      },
      {
        key: 'policeStation',
        id: 'POLICE-1',
        list: policeStations,
        archetype: 'civic_police',
        halfSpanM: Number((BUILDING_SIZE_REF.policeStation.halfSpanM * cScale).toFixed(1)),
        lotW: Number((BUILDING_SIZE_REF.policeStation.targetX * cScale).toFixed(1)),
        lotD: Number((BUILDING_SIZE_REF.policeStation.targetZ * cScale).toFixed(1)),
        offset: BUILDING_AXIS_OFFSETS.policeStation,
      },
    ];

    const maxCivicHalfM = Math.max(...specs.map((s) => s.halfSpanM));
    const civicPadGapM = Number((4.5 * cScale).toFixed(1));
    const pitchM = Number((maxCivicHalfM * 2 + civicPadGapM + 1.5).toFixed(1));

    let bestAnchor = null;
    let bestLayout = _civicGridLayouts[0];
    let bestFits = -1;
    let bestScore = -Infinity;

    for (const cand of _hubAnchors) {
      const seg = cand.st.seg;
      const side = cand.st.side || 1;
      const ux = seg.ux;
      const uy = seg.uy;
      const nx = seg.nx * side;
      const ny = seg.ny * side;

      for (const layout of _civicGridLayouts) {
        let fits = 0;
        for (let i = 0; i < specs.length; i++) {
          const sp = specs[i];
          const [col, row] = layout[i];
          const dE = ux * (col * pitchM) + nx * (row * pitchM);
          const dN = uy * (col * pitchM) + ny * (row * pitchM);
          const pLng = cand.lng + dE / METERS_PER_DEG_LNG;
          const pLat = cand.lat + dN / METERS_PER_DEG_LAT;
          if (
            isOrientedLotClear(pLng, pLat, sp.halfSpanM, sp.halfSpanM, ux, uy, nx, ny, {
              roadBufM: 3.5,
              lotGapM: civicPadGapM,
              edgePadM: 1.0,
              waterwayPad: 16,
              waterwayInner: 10,
            })
          ) {
            fits++;
          }
        }

        const dPref = Math.hypot(
          (cand.lng - targetUpperLeftLng) * METERS_PER_DEG_LNG,
          (cand.lat - targetUpperLeftLat) * METERS_PER_DEG_LAT
        );
        const score = fits * 700 - dPref * 0.2 - Math.abs(cand.st.distM - (maxCivicHalfM + 10)) * 0.4;
        if (fits > bestFits || (fits === bestFits && score > bestScore)) {
          bestFits = fits;
          bestScore = score;
          bestAnchor = cand;
          bestLayout = layout;
        }
      }
    }

    if (!bestAnchor) return false;
    civicAnchor = bestAnchor;

    const hubSeg = bestAnchor.st.seg;
    const hubSide = bestAnchor.st.side || 1;
    const hUx = hubSeg.ux;
    const hUy = hubSeg.uy;
    const hNx = hubSeg.nx * hubSide;
    const hNy = hubSeg.ny * hubSide;

    const commitCivic = (sp, cLng, cLat, seg, side) => {
      const { faceBearingDeg, yawDeg } = computeStreetFacingYaw(cLng, cLat, seg, side, sp.offset);
      squareOccupiedLots.push({
        lng: cLng,
        lat: cLat,
        archetype: sp.archetype,
        bearingDeg: faceBearingDeg,
        ux: seg.ux,
        uy: seg.uy,
        nx: seg.nx,
        ny: seg.ny,
        obbHalfW: sp.halfSpanM,
        obbHalfD: sp.halfSpanM,
        halfSpanM: sp.halfSpanM,
        lotWidthM: sp.lotW,
        lotDepthM: sp.lotD,
        lotRing: null,
      });
      probes.push({ lng: cLng, lat: cLat });
      const item = {
        id: sp.id,
        lng: cLng,
        lat: cLat,
        halfSpanM: sp.halfSpanM,
        faceBearingDeg,
        yawDeg,
      };
      sp.list.push(item);
      civicStructures.push(item);
    };

    const unplaced = [];
    for (let i = 0; i < specs.length; i++) {
      const sp = specs[i];
      const [col, row] = bestLayout[i];
      const dE = hUx * (col * pitchM) + hNx * (row * pitchM);
      const dN = hUy * (col * pitchM) + hNy * (row * pitchM);
      const pLng = bestAnchor.lng + dE / METERS_PER_DEG_LNG;
      const pLat = bestAnchor.lat + dN / METERS_PER_DEG_LAT;
      if (
        isOrientedLotClear(pLng, pLat, sp.halfSpanM, sp.halfSpanM, hUx, hUy, hNx, hNy, {
          roadBufM: 3.5,
          lotGapM: civicPadGapM,
          edgePadM: 1.0,
          waterwayPad: 16,
          waterwayInner: 10,
        })
      ) {
        commitCivic(sp, pLng, pLat, hubSeg, hubSide);
      } else {
        unplaced.push(sp);
      }
    }

    // Tightly pack any remaining civic building right beside the SAME hub anchor (locked to hubSeg orientation)
    for (const sp of unplaced) {
      let bestSpot = null;
      let bestDist = Infinity;

      for (const roadBufM of [3.5, 2.5]) {
        for (let r = pitchM * 0.85; r <= Math.max(240, Math.round(pitchM * 3.4)); r += 8) {
          for (let a = 0; a < 360; a += 15) {
            const rad = (a * Math.PI) / 180;
            const cLng = bestAnchor.lng + (Math.cos(rad) * r) / METERS_PER_DEG_LNG;
            const cLat = bestAnchor.lat + (Math.sin(rad) * r) / METERS_PER_DEG_LAT;
            if (
              !isOrientedLotClear(cLng, cLat, sp.halfSpanM, sp.halfSpanM, hUx, hUy, hNx, hNy, {
                roadBufM,
                lotGapM: civicPadGapM,
                edgePadM: 1.0,
                waterwayPad: 14,
                waterwayInner: 9,
              })
            ) {
              continue;
            }
            if (r < bestDist) {
              bestDist = r;
              bestSpot = { lng: cLng, lat: cLat, seg: hubSeg, side: hubSide };
            }
          }
          if (bestSpot) break;
        }
        if (bestSpot) break;
      }

      if (bestSpot) {
        commitCivic(sp, bestSpot.lng, bestSpot.lat, bestSpot.seg, bestSpot.side);
      }
    }

    // Prefer scales where at least 4 of 6 sit directly on the unified grid AND all 6 are placed
    return civicStructures.length === specs.length && bestFits >= 2;
  };

  let _bestCivicFallback = null;
  for (const cScale of _civicScaleCandidates) {
    const cleanAll6 = _placeCivicHubAtScale(cScale);
    if (cleanAll6) {
      _resolvedCivicScale = cScale;
      _bestCivicFallback = null;
      break;
    }
    if (!_bestCivicFallback || civicStructures.length > _bestCivicFallback.count) {
      _bestCivicFallback = { scale: cScale, count: civicStructures.length };
    }
  }
  if (_bestCivicFallback) {
    _resolvedCivicScale = _bestCivicFallback.scale;
    _placeCivicHubAtScale(_bestCivicFallback.scale);
  }

  const isInsideCivicExclusiveZone = (lng, lat, extraBufferM = 6) => {
    for (const cs of civicStructures) {
      const dE = (lng - cs.lng) * METERS_PER_DEG_LNG;
      const dN = (lat - cs.lat) * METERS_PER_DEG_LAT;
      const minClearM = (cs.halfSpanM || 24) + extraBufferM;
      if (Math.hypot(dE, dN) < minClearM) return true;
    }
    return false;
  };

  // ==========================================================================
  // STEP 1: ZERO-TILT STRAIGHT-RUN SIDE-BY-SIDE ROWS + BALANCED OPPOSITE SIDES
  // ==========================================================================
  const totalEnvBuildings = () =>
    civicStructures.length + shops.length + houses.length;

  // Partition corridors at turns > 20 deg (dot < 0.94) so gentle curves stay continuous
  // while every building on a run locks to ONE length-weighted straight bearing (zero tilt)
  const _straightSideTracks = [];
  for (let ci = 0; ci < insideCorridors.length; ci++) {
    const cor = insideCorridors[ci];
    const coords = cor.coords || [];
    if (coords.length < 2) continue;

    const rawEdges = [];
    for (let k = 0; k < coords.length - 1; k++) {
      const [lng1, lat1] = coords[k];
      const [lng2, lat2] = coords[k + 1];
      const dE = (lng2 - lng1) * METERS_PER_DEG_LNG;
      const dN = (lat2 - lat1) * METERS_PER_DEG_LAT;
      const lenM = Math.hypot(dE, dN);
      if (lenM < 2) continue;
      rawEdges.push({ lng1, lat1, lng2, lat2, lenM, ux: dE / lenM, uy: dN / lenM });
    }
    if (rawEdges.length === 0) continue;

    const runs = [];
    let curRun = [rawEdges[0]];
    for (let i = 1; i < rawEdges.length; i++) {
      const first = curRun[0];
      const prev = curRun[curRun.length - 1];
      const curr = rawEdges[i];
      const adjDot = prev.ux * curr.ux + prev.uy * curr.uy;
      const cumDot = first.ux * curr.ux + first.uy * curr.uy;
      if (adjDot < 0.966 || cumDot < 0.966) {
        runs.push(curRun);
        curRun = [curr];
      } else {
        curRun.push(curr);
      }
    }
    runs.push(curRun);

    const isCommercialRoad =
      cor.tier === 'primary' || cor.tier === 'secondary' || cor.tier === 'tertiary';

    for (let ri = 0; ri < runs.length; ri++) {
      const rEdges = runs[ri];
      let sumE = 0;
      let sumN = 0;
      let cumM = 0;
      const edges = [];

      for (const e of rEdges) {
        sumE += e.ux * e.lenM;
        sumN += e.uy * e.lenM;
        edges.push({
          ...e,
          startM: cumM,
          endM: cumM + e.lenM,
        });
        cumM += e.lenM;
      }
      if (cumM < 20) continue;

      const mag = Math.hypot(sumE, sumN) || 1;
      const runUx = sumE / mag;
      const runUy = sumN / mag;
      const runNx = -runUy;
      const runNy = runUx;
      const runBearingDeg = (((Math.atan2(runUx, runUy) * 180) / Math.PI) % 360 + 360) % 360;
      const runSeg = {
        ux: runUx,
        uy: runUy,
        nx: runNx,
        ny: runNy,
        bearingDeg: runBearingDeg,
        tier: cor.tier,
        halfAsphaltM: cor.halfAsphaltM || 10,
        halfSidewalkM: cor.halfSidewalkM || 15,
      };

      for (const side of [1, -1]) {
        _straightSideTracks.push({
          id: `C${ci}-R${ri}-S${side}`,
          corridorIdx: ci,
          runIdx: ri,
          side,
          edges,
          totalLenM: cumM,
          runSeg,
          halfSidewalkM: cor.halfSidewalkM || 15,
          isCommercialRoad,
        });
      }
    }
  }
  _straightSideTracks.sort((a, b) => b.totalLenM - a.totalLenM);

  const _sampleRunAt = (track, distM) => {
    const clamped = Math.max(0, Math.min(track.totalLenM, distM));
    let edge = track.edges[track.edges.length - 1];
    for (let i = 0; i < track.edges.length; i++) {
      if (clamped <= track.edges[i].endM) {
        edge = track.edges[i];
        break;
      }
    }
    const t = edge.lenM > 0 ? (clamped - edge.startM) / edge.lenM : 0;
    return {
      baseLng: edge.lng1 + (edge.lng2 - edge.lng1) * t,
      baseLat: edge.lat1 + (edge.lat2 - edge.lat1) * t,
      edge,
    };
  };

  const _baseOccupiedLen = squareOccupiedLots.length;
  const _baseProbesLen = probes.length;

  // Keep residential/shop scale coupled to civic scale so civic halls ALWAYS stay noticeably larger
  const _maxCoupledBuildingScale = Number(
    Math.min(buildingSizeScale, 1.08).toFixed(2)
  );
  const _scaleCandidates = [
    _maxCoupledBuildingScale,
    Number((_maxCoupledBuildingScale * 0.94).toFixed(2)),
    Number((_maxCoupledBuildingScale * 0.89).toFixed(2)),
    Number((_maxCoupledBuildingScale * 0.84).toFixed(2)),
  ].filter((v, idx, arr) => v >= 0.84 && arr.indexOf(v) === idx);

  let _resolvedBuildingScale = _maxCoupledBuildingScale;

  const _runBalancedRowsAtScale = (scaleF) => {
    squareOccupiedLots.length = _baseOccupiedLen;
    probes.length = _baseProbesLen;
    shops.length = 0;
    houses.length = 0;

    const sRef = scaleBuildingRef(BUILDING_SIZE_REF.shop, scaleF);
    const hRef = scaleBuildingRef(BUILDING_SIZE_REF.house, scaleF);

    const computeProportionalSlotsForTrack = (track, ref, cfg, rowDepthIdx) => {
      const rowOffsetM = rowDepthIdx * (ref.halfSpanM * 2 + cfg.rowBackGapM);
      const setbackM = track.halfSidewalkM + ref.halfSpanM + cfg.roadBufM + 1.5 + rowOffsetM;
      const stepM = 5.0;
      const marginM = Math.min(track.totalLenM * 0.12, 8.0);
      if (track.totalLenM < marginM * 2 + 1) return { usableLenM: 0, slots: [], setbackM };

      const seg = track.runSeg;
      const intervals = [];
      let curStart = null;
      let lastValid = null;

      for (let d = marginM; d <= track.totalLenM - marginM + 0.5; d += stepM) {
        const clampedD = Math.min(d, track.totalLenM - marginM);
        const { baseLng, baseLat, edge: localEdge } = _sampleRunAt(track, clampedD);
        const edgeAligned = localEdge
          ? localEdge.ux * seg.ux + localEdge.uy * seg.uy >= 0.966
          : true;
        const bLng = baseLng + (seg.nx * track.side * setbackM) / METERS_PER_DEG_LNG;
        const bLat = baseLat + (seg.ny * track.side * setbackM) / METERS_PER_DEG_LAT;
        const ok = edgeAligned && isOrientedLotClear(bLng, bLat, ref.halfSpanM, ref.halfSpanM, seg.ux, seg.uy, seg.nx, seg.ny, {
          roadBufM: cfg.roadBufM,
          lotGapM: cfg.lotGapM,
          edgePadM: 1.0,
          waterwayPad: cfg.wPad,
          waterwayInner: cfg.wIn,
          checkCivicHub: true,
          civicBufM: cfg.civicBufM,
        });
        if (ok) {
          if (curStart === null) curStart = clampedD;
          lastValid = clampedD;
        } else if (curStart !== null) {
          intervals.push([curStart, lastValid]);
          curStart = null;
          lastValid = null;
        }
      }
      if (curStart !== null) intervals.push([curStart, lastValid]);

      const W = ref.halfSpanM * 2;
      const targetPitch = W + cfg.sideGapM;
      const slots = [];
      let usableLenM = 0;

      for (const [a, b] of intervals) {
        const centerSpan = Math.max(0, b - a);
        const fullSpan = centerSpan + W;
        usableLenM += fullSpan;

        const count = Math.max(1, Math.floor((fullSpan + cfg.sideGapM) / targetPitch));
        if (count === 1) {
          slots.push((a + b) * 0.5);
        } else {
          const idealGap = (fullSpan - count * W) / (count - 1);
          const actualGap = Math.max(cfg.sideGapM, Math.min(cfg.sideGapM + 6.0, idealGap));
          const pitch = W + actualGap;
          const totalUsed = (count - 1) * pitch;
          const startCenter = (a + b) * 0.5 - totalUsed * 0.5;
          for (let k = 0; k < count; k++) {
            slots.push(startCenter + k * pitch);
          }
        }
      }

      return { usableLenM, slots, setbackM };
    };

    const tiers = [
      { roadBufM: 3.8, sideGapM: 3.8, lotGapM: 3.2, rowBackGapM: 8.0, civicBufM: 5.0, wPad: 16, wIn: 11 },
      { roadBufM: 3.0, sideGapM: 2.8, lotGapM: 2.5, rowBackGapM: 6.5, civicBufM: 4.0, wPad: 13, wIn: 9 },
      { roadBufM: 2.4, sideGapM: 2.2, lotGapM: 2.0, rowBackGapM: 5.5, civicBufM: 3.2, wPad: 11, wIn: 8 },
    ];

    const minHouses = Math.max(limits.houses, HOUSE_FRONT_AXIS_OFFSETS.length);
    const minShops = Math.max(limits.shops, SHOP_FRONT_AXIS_OFFSETS.length);
    const maxBalancedHouses = Math.min(24, minHouses + 10);
    const maxBalancedShops = Math.min(10, minShops + 3);

    const trackPlacedSpan = new Map();
    const frontRowSlotsByTrack = new Map();

    const tryCommitSlot = (track, slotD, setbackM, list, ref, archetype, offsets, cfg, isFrontRow = true) => {
      const seg = track.runSeg;
      const { baseLng, baseLat } = _sampleRunAt(track, slotD);
      const bLng = baseLng + (seg.nx * track.side * setbackM) / METERS_PER_DEG_LNG;
      const bLat = baseLat + (seg.ny * track.side * setbackM) / METERS_PER_DEG_LAT;

      if (
        !isOrientedLotClear(bLng, bLat, ref.halfSpanM, ref.halfSpanM, seg.ux, seg.uy, seg.nx, seg.ny, {
          roadBufM: cfg.roadBufM,
          lotGapM: cfg.lotGapM,
          edgePadM: 1.0,
          waterwayPad: cfg.wPad,
          waterwayInner: cfg.wIn,
          checkCivicHub: true,
          civicBufM: cfg.civicBufM,
        })
      ) {
        return false;
      }

      const variantIndex = list.length % offsets.length;
      const frontOffset = offsets[variantIndex];
      const { faceBearingDeg, yawDeg } = computeStreetFacingYaw(
        bLng,
        bLat,
        seg,
        track.side,
        frontOffset
      );

      squareOccupiedLots.push({
        lng: bLng,
        lat: bLat,
        archetype,
        bearingDeg: faceBearingDeg,
        ux: seg.ux,
        uy: seg.uy,
        nx: seg.nx,
        ny: seg.ny,
        obbHalfW: ref.halfSpanM,
        obbHalfD: ref.halfSpanM,
        halfSpanM: ref.halfSpanM,
        lotWidthM: ref.targetX,
        lotDepthM: ref.targetZ,
        lotRing: null,
      });
      probes.push({ lng: bLng, lat: bLat });
      list.push({
        id: `${archetype === 'shophouse_commercial' ? 'SHOP' : 'HOUSE'}-${list.length + 1}`,
        variantIndex,
        lng: bLng,
        lat: bLat,
        faceBearingDeg,
        yawDeg,
      });

      const prevSpan = trackPlacedSpan.get(track.id) || 0;
      trackPlacedSpan.set(track.id, prevSpan + ref.halfSpanM * 2 + cfg.sideGapM);
      if (isFrontRow) {
        const arr = frontRowSlotsByTrack.get(track.id) || [];
        arr.push(slotD);
        frontRowSlotsByTrack.set(track.id, arr);
      }
      return true;
    };

    const runDepthPass = (cfg, rowDepthIdx) => {
      const plans = _straightSideTracks
        .map((track) => {
          const isShopTrack = track.isCommercialRoad && track.side === 1 && rowDepthIdx === 0;
          const ref = isShopTrack ? sRef : hRef;

          if (rowDepthIdx === 1) {
            // Back-row slots must align strictly in-column behind existing street-front buildings on the same run
            const frontSlots = frontRowSlotsByTrack.get(track.id);
            if (!frontSlots || frontSlots.length === 0) return null;
            const rowOffsetM = ref.halfSpanM * 2 + cfg.rowBackGapM;
            const setbackM = track.halfSidewalkM + ref.halfSpanM + cfg.roadBufM + 1.5 + rowOffsetM;
            return {
              track,
              isShopTrack: false,
              ref,
              usableLenM: track.totalLenM,
              setbackM,
              slots: [...frontSlots].sort((a, b) => a - b),
              cursor: 0,
            };
          }

          const res = computeProportionalSlotsForTrack(track, ref, cfg, 0);
          return {
            track,
            isShopTrack,
            ref,
            usableLenM: res.usableLenM,
            setbackM: res.setbackM,
            slots: res.slots,
            cursor: 0,
          };
        })
        .filter((p) => p && p.slots.length > 0 && p.usableLenM > 0);

      let madeProgress = true;
      while (madeProgress) {
        madeProgress = false;
        plans.sort((a, b) => {
          const covA = (trackPlacedSpan.get(a.track.id) || 0) / Math.max(1, a.usableLenM);
          const covB = (trackPlacedSpan.get(b.track.id) || 0) / Math.max(1, b.usableLenM);
          if (Math.abs(covA - covB) > 0.04) return covA - covB;
          return b.usableLenM - a.usableLenM;
        });

        for (const plan of plans) {
          if (plan.cursor >= plan.slots.length) continue;

          let useShop = plan.isShopTrack;
          if (useShop && shops.length >= maxBalancedShops) useShop = false;
          if (!useShop && houses.length >= maxBalancedHouses) useShop = true;
          if (useShop && shops.length >= maxBalancedShops) continue;
          if (!useShop && houses.length >= maxBalancedHouses) continue;

          const needShopQuota = shops.length < SHOP_FRONT_AXIS_OFFSETS.length;
          const needHouseQuota = houses.length < HOUSE_FRONT_AXIS_OFFSETS.length;
          if (needShopQuota && !needHouseQuota && shops.length < maxBalancedShops) useShop = true;
          if (needHouseQuota && !needShopQuota && houses.length < maxBalancedHouses) useShop = false;

          const ref = useShop ? sRef : hRef;
          const list = useShop ? shops : houses;
          const archetype = useShop ? 'shophouse_commercial' : 'house_residential';
          const offsets = useShop ? SHOP_FRONT_AXIS_OFFSETS : HOUSE_FRONT_AXIS_OFFSETS;

          let committed = false;
          while (plan.cursor < plan.slots.length) {
            const slotD = plan.slots[plan.cursor++];
            if (tryCommitSlot(plan.track, slotD, plan.setbackM, list, ref, archetype, offsets, cfg, rowDepthIdx === 0)) {
              committed = true;
              madeProgress = true;
              break;
            }
          }
          if (committed) break;
        }

        if (
          rowDepthIdx === 1 &&
          houses.length >= HOUSE_FRONT_AXIS_OFFSETS.length &&
          shops.length >= SHOP_FRONT_AXIS_OFFSETS.length
        ) {
          break;
        }
      }
    };

    // Pass 1: Fill ALL clear straight street-front rows across tiers for balanced coverage
    for (const cfg of tiers) {
      runDepthPass(cfg, 0);
      if (houses.length >= maxBalancedHouses && shops.length >= maxBalancedShops) break;
    }

    // Pass 2: Aligned interior-block infill for large open pockets (e.g. central & western open lots)
    // Uses the exact same 2D SAT OBB zero-collision check and locks to the nearest street's straight bearing
    if (houses.length < maxBalancedHouses && _straightSideTracks.length > 0) {
      const refTrack = _straightSideTracks[0];
      const gUx = refTrack.runSeg.ux;
      const gUy = refTrack.runSeg.uy;
      const gNx = refTrack.runSeg.nx;
      const gNy = refTrack.runSeg.ny;
      const stepX = Math.max(34, hRef.halfSpanM * 1.15);
      const stepY = Math.max(34, hRef.halfSpanM * 1.15);

      const centerLng = (bbox.minLng + bbox.maxLng) * 0.5;
      const centerLat = (bbox.minLat + bbox.maxLat) * 0.5;
      const spanE = (bbox.maxLng - bbox.minLng) * METERS_PER_DEG_LNG;
      const spanN = (bbox.maxLat - bbox.minLat) * METERS_PER_DEG_LAT;
      const halfGrid = Math.hypot(spanE, spanN) * 0.62;
      const maxCols = Math.ceil(halfGrid / stepX);
      const maxRows = Math.ceil(halfGrid / stepY);

      for (let r = -maxRows; r <= maxRows && houses.length < maxBalancedHouses; r++) {
        for (let c = -maxCols; c <= maxCols && houses.length < maxBalancedHouses; c++) {
          const dE = gUx * (c * stepX) + gNx * (r * stepY);
          const dN = gUy * (c * stepX) + gNy * (r * stepY);
          const bLng = centerLng + dE / METERS_PER_DEG_LNG;
          const bLat = centerLat + dN / METERS_PER_DEG_LAT;

          if (
            !isOrientedLotClear(bLng, bLat, hRef.halfSpanM, hRef.halfSpanM, gUx, gUy, gNx, gNy, {
              roadBufM: 4.5,
              lotGapM: 9.5,
              edgePadM: 1.5,
              waterwayPad: 12,
              waterwayInner: 9,
              checkCivicHub: true,
              civicBufM: 6.0,
            })
          ) {
            continue;
          }

          const variantIndex = houses.length % HOUSE_FRONT_AXIS_OFFSETS.length;
          const frontOffset = HOUSE_FRONT_AXIS_OFFSETS[variantIndex];
          const { faceBearingDeg, yawDeg } = computeStreetFacingYaw(
            bLng,
            bLat,
            refTrack.runSeg,
            1,
            frontOffset
          );

          squareOccupiedLots.push({
            lng: bLng,
            lat: bLat,
            archetype: 'house_residential',
            bearingDeg: faceBearingDeg,
            ux: gUx,
            uy: gUy,
            nx: gNx,
            ny: gNy,
            obbHalfW: hRef.halfSpanM,
            obbHalfD: hRef.halfSpanM,
            halfSpanM: hRef.halfSpanM,
            lotWidthM: hRef.targetX,
            lotDepthM: hRef.targetZ,
            lotRing: null,
          });
          probes.push({ lng: bLng, lat: bLat });
          houses.push({
            id: `HOUSE-${houses.length + 1}`,
            variantIndex,
            lng: bLng,
            lat: bLat,
            faceBearingDeg,
            yawDeg,
          });
        }
      }
    }

    return (
      houses.length >= HOUSE_FRONT_AXIS_OFFSETS.length &&
      shops.length >= SHOP_FRONT_AXIS_OFFSETS.length
    );
  };

  let _bestFallback = null;
  for (const candScale of _scaleCandidates) {
    const allFit = _runBalancedRowsAtScale(candScale);
    if (allFit) {
      _resolvedBuildingScale = candScale;
      _bestFallback = null;
      break;
    }
    const count = houses.length + shops.length;
    if (!_bestFallback || count > _bestFallback.count) {
      _bestFallback = { scale: candScale, count };
    }
  }
  if (_bestFallback) {
    _resolvedBuildingScale = _bestFallback.scale;
    _runBalancedRowsAtScale(_bestFallback.scale);
  }

  // ==========================================================================
  // STEP 1B: COLLISION-FREE WATER FACILITY PAD RESOLVER (INSPECTION MODE)
  // Keeps civic buildings locked; snaps water facility onto nearest clear pad
  // ==========================================================================
  const facilityOverrides = {};
  const facilityPads = [];

  for (const wp of waterPoints || []) {
    if (!Number.isFinite(wp?.lng) || !Number.isFinite(wp?.lat)) continue;
    const inBarangay = isInsidePolygon(wp.lng, wp.lat, barangayGeometry);
    if (!inBarangay) continue;

    const isHandPump =
      wp.source_type === 'Handpump' ||
      wp.source_type === 'Gravity Spring Box' ||
      ['NAGA-04', 'NAGA-05', 'NAGA-06', 'NAGA-08'].includes(wp.id);
    const padHalfM = isHandPump ? 11.5 : 14.0;
    const scaleMult = isHandPump ? 0.42 : 0.44;

    const isPadClear = (cLng, cLat, roadBufM, lotGapM) =>
      isOrientedLotClear(cLng, cLat, padHalfM, padHalfM, 1, 0, 0, 1, {
        roadBufM,
        lotGapM,
        edgePadM: 1.5,
        waterwayPad: 14,
        waterwayInner: 10,
        checkCivicHub: true,
        civicBufM: lotGapM,
      });

    let chosen = null;
    for (const [roadBufM, lotGapM] of [
      [5.0, 5.5],
      [3.5, 4.0],
      [2.2, 2.5],
    ]) {
      if (isPadClear(wp.lng, wp.lat, roadBufM, lotGapM)) {
        chosen = { lng: wp.lng, lat: wp.lat };
        break;
      }
      for (let r = 6; r <= 185 && !chosen; r += 6) {
        let bestCand = null;
        let bestScore = -Infinity;
        for (let a = 0; a < 360; a += 15) {
          const rad = (a * Math.PI) / 180;
          const cLng = wp.lng + (Math.cos(rad) * r) / METERS_PER_DEG_LNG;
          const cLat = wp.lat + (Math.sin(rad) * r) / METERS_PER_DEG_LAT;
          if (!isPadClear(cLng, cLat, roadBufM, lotGapM)) continue;
          const st = getNearestStreetInfo(cLng, cLat);
          // Prefer closest clear spot that remains accessible near a street
          const streetDist = st?.distM ?? 60;
          const score = -r * 1.4 - Math.abs(streetDist - 24) * 0.25;
          if (score > bestScore) {
            bestScore = score;
            bestCand = { lng: cLng, lat: cLat };
          }
        }
        if (bestCand) chosen = bestCand;
      }
      if (chosen) break;
    }

    const finalLng = chosen ? chosen.lng : wp.lng;
    const finalLat = chosen ? chosen.lat : wp.lat;
    facilityOverrides[wp.id] = {
      id: wp.id,
      lng: finalLng,
      lat: finalLat,
      origLng: wp.lng,
      origLat: wp.lat,
      radiusM: padHalfM,
      scaleMult,
    };
    facilityPads.push({ id: wp.id, lng: finalLng, lat: finalLat, radiusM: padHalfM });
  }

  const isNearWaterFacilityPad = (lng, lat, extraM = 4.0) => {
    for (let i = 0; i < facilityPads.length; i++) {
      const fp = facilityPads[i];
      if (
        Math.hypot((lng - fp.lng) * METERS_PER_DEG_LNG, (lat - fp.lat) * METERS_PER_DEG_LAT) <
        fp.radiusM + extraM
      ) {
        return true;
      }
    }
    return false;
  };

  // ==========================================================================
  // STEP 2: TRUE 3-WAY/4-WAY INTERSECTIONS ONLY
  // ==========================================================================
  const intersectionNodes = [];
  for (const [, node] of endpointBuckets.entries()) {
    if (node.approaches.length < 3) continue;
    if (!isInsidePolygon(node.lng, node.lat, barangayGeometry)) continue;

    let hasTrueBranch = false;
    for (let i = 0; i < node.approaches.length && !hasTrueBranch; i++) {
      for (let j = i + 1; j < node.approaches.length; j++) {
        const diff = Math.abs(node.approaches[i].bearingDeg - node.approaches[j].bearingDeg) % 360;
        const acute = diff > 180 ? 360 - diff : diff;
        if (acute >= 25 && acute <= 155) {
          hasTrueBranch = true;
          break;
        }
      }
    }
    if (!hasTrueBranch) continue;

    const tooClose = intersectionNodes.some(
      (existing) =>
        Math.hypot((node.lng - existing.lng) * METERS_PER_DEG_LNG, (node.lat - existing.lat) * METERS_PER_DEG_LAT) < 75
    );
    if (tooClose) continue;

    intersectionNodes.push(node);

    const maxCrossHalfAsphalt = Math.max(...node.approaches.map((a) => a.halfAsphaltM));
    for (let ai = 0; ai < node.approaches.length; ai++) {
      const app = node.approaches[ai];
      if (app.segLenM < maxCrossHalfAsphalt + 14) continue;

      const cwDist = maxCrossHalfAsphalt + 2.4;
      const cwLng = node.lng + (app.ux * cwDist) / METERS_PER_DEG_LNG;
      const cwLat = node.lat + (app.uy * cwDist) / METERS_PER_DEG_LAT;
      const stripeCount = Math.max(6, Math.floor((app.halfAsphaltM * 1.65) / 2.2));

      for (let k = 0; k < stripeCount; k++) {
        const lateral =
          -app.halfAsphaltM * 0.76 +
          k * ((app.halfAsphaltM * 1.52) / Math.max(1, stripeCount - 1));
        const sLng = cwLng + (app.nx * lateral) / METERS_PER_DEG_LNG;
        const sLat = cwLat + (app.ny * lateral) / METERS_PER_DEG_LAT;
        groundFeatures.push({
          type: 'Feature',
          properties: { kind: 'marking', paint: 'white' },
          geometry: {
            type: 'Polygon',
            coordinates: [makeRotatedRectRing(sLng, sLat, app.ux, app.uy, app.nx, app.ny, 2.0, 0.55)],
          },
        });
      }

      const stopDist = cwDist + 2.6;
      const stopLng =
        node.lng + (app.ux * stopDist - app.nx * (app.halfAsphaltM * 0.48)) / METERS_PER_DEG_LNG;
      const stopLat =
        node.lat + (app.uy * stopDist - app.ny * (app.halfAsphaltM * 0.48)) / METERS_PER_DEG_LAT;
      groundFeatures.push({
        type: 'Feature',
        properties: { kind: 'marking', paint: 'white' },
        geometry: {
          type: 'Polygon',
          coordinates: [
            makeRotatedRectRing(stopLng, stopLat, app.ux, app.uy, app.nx, app.ny, 0.7, app.halfAsphaltM * 0.42),
          ],
        },
      });
    }
  }
  
    // STEP 2B: TRAFFIC LIGHTS AT INTERSECTIONS & MAIN ARTERIAL CORNERS
  const registerTrafficLightAt = (lng, lat, yawDeg) => {
    if (trafficLights.length >= limits.trafficLights) return false;
    if (!isInsidePolygon(lng, lat, barangayGeometry)) return false;
    if (isInsideWaterwayClearance(lat, lng, 14, 10)) return false;
    if (isOnRoadOrSidewalk(lng, lat, 1.8, false)) return false;
    if (isNearWaterFacilityPad(lng, lat, 4.0)) return false;
    for (const occ of squareOccupiedLots) {
      const half = Math.max(occ.obbHalfW || occ.halfSpanM || 20, occ.obbHalfD || occ.halfSpanM || 20);
      if (Math.hypot((lng - occ.lng) * METERS_PER_DEG_LNG, (lat - occ.lat) * METERS_PER_DEG_LAT) < half + 3.0) {
        return false;
      }
    }
    for (const tl of trafficLights) {
      if (Math.hypot((lng - tl.lng) * METERS_PER_DEG_LNG, (lat - tl.lat) * METERS_PER_DEG_LAT) < 38.0) {
        return false;
      }
    }
    trafficLights.push({
      id: `TRAFFIC-LIGHT-${trafficLights.length + 1}`,
      lng,
      lat,
      yawDeg: Number(((yawDeg % 360) + 360) % 360),
      targetHeightM: TARGET_HEIGHT_M.trafficLight,
    });
    probes.push({ lng, lat });
    return true;
  };

  for (const node of intersectionNodes) {
    if (trafficLights.length >= limits.trafficLights) break;
    const apps = node.approaches || [];
    for (let ai = 0; ai < apps.length && trafficLights.length < limits.trafficLights; ai++) {
      const app = apps[ai];
      const backM = (node.maxHalfAsphaltM || 10) + 7.5;
      const sideM = (app.halfAsphaltM || 10) + 4.2;
      const tlLng = node.lng + (app.ux * backM + app.nx * sideM) / METERS_PER_DEG_LNG;
      const tlLat = node.lat + (app.uy * backM + app.ny * sideM) / METERS_PER_DEG_LAT;
      const approachBearing = (((Math.atan2(app.ux, app.uy) * 180) / Math.PI) % 360 + 360) % 360;
      if (registerTrafficLightAt(tlLng, tlLat, 180 - approachBearing)) break;
    }
  }

  // Fallback on main arterial segment corners if fewer intersections exist inside this barangay
  if (trafficLights.length < Math.min(2, limits.trafficLights)) {
    for (const seg of insideSegments) {
      if (trafficLights.length >= Math.min(2, limits.trafficLights)) break;
      if (seg.lenM < 40) continue;
      if (seg.tier !== 'primary' && seg.tier !== 'secondary' && seg.tier !== 'tertiary') continue;
      const sideM = seg.halfAsphaltM + 4.2;
      const tlLng = seg.lng1 + (seg.ux * 16 + seg.nx * sideM) / METERS_PER_DEG_LNG;
      const tlLat = seg.lat1 + (seg.uy * 16 + seg.ny * sideM) / METERS_PER_DEG_LAT;
      registerTrafficLightAt(tlLng, tlLat, 180 - seg.bearingDeg);
    }
  }

  // Oriented bounding-box helper in local meters
  const isOrientedBoxOverlappingPoint = (
    boxLng,
    boxLat,
    bearingDeg,
    halfLenM,
    halfWidthM,
    testLng,
    testLat,
    padM = 0
  ) => {
    const rad = ((bearingDeg || 0) * Math.PI) / 180;
    const ux = Math.sin(rad);
    const uy = Math.cos(rad);
    const nx = -uy;
    const ny = ux;
    const dE = (testLng - boxLng) * METERS_PER_DEG_LNG;
    const dN = (testLat - boxLat) * METERS_PER_DEG_LAT;
    const along = Math.abs(dE * ux + dN * uy);
    const perp = Math.abs(dE * nx + dN * ny);
    return along <= halfLenM + padM && perp <= halfWidthM + padM;
  };

  // Full 9-point oriented footprint validator for stationary jeepneys & vehicles
  const isVehicleFootprintClear = (lng, lat, bearingDeg, halfLenM, halfWidthM) => {
    if (isNearRoadCornerOrEndpoint(lng, lat, halfLenM + 22)) return false;

    const rad = ((bearingDeg || 0) * Math.PI) / 180;
    const ux = Math.sin(rad);
    const uy = Math.cos(rad);
    const nx = -uy;
    const ny = ux;

    // Sample center, corners, and mid-edges of the vehicle footprint
    for (const a of [-1, 0, 1]) {
      for (const p of [-1, 0, 1]) {
        const sLng = lng + (ux * (a * halfLenM) + nx * (p * halfWidthM)) / METERS_PER_DEG_LNG;
        const sLat = lat + (uy * (a * halfLenM) + ny * (p * halfWidthM)) / METERS_PER_DEG_LAT;
        if (!isInsidePolygon(sLng, sLat, barangayGeometry)) return false;
        // Must be completely outside active road asphalt (1.1m safety margin from lane edge)
        if (isOnRoadOrSidewalk(sLng, sLat, 1.1, false)) return false;
      }
    }

    for (const occ of squareOccupiedLots) {
      const dE = Math.abs((lng - occ.lng) * METERS_PER_DEG_LNG);
      const dN = Math.abs((lat - occ.lat) * METERS_PER_DEG_LAT);
      if (dE < occ.halfSpanM + halfLenM + 2.5 && dN < occ.halfSpanM + halfLenM + 2.5) {
        return false;
      }
    }

    // Check against benches, picnic tables, trees, poles, hydrants, bins, and other vehicles
    for (const bt of benchTables) {
      if (isOrientedBoxOverlappingPoint(lng, lat, bearingDeg, halfLenM, halfWidthM, bt.lng, bt.lat, 2.2)) {
        return false;
      }
    }
    for (const b of benches) {
      if (isOrientedBoxOverlappingPoint(lng, lat, bearingDeg, halfLenM, halfWidthM, b.lng, b.lat, 1.9)) {
        return false;
      }
    }
    const radialProps = [
      ...trees.map((p) => ({ ...p, r: 1.8 })),
      ...streetLights.map((p) => ({ ...p, r: 1.2 })),
      ...utilityPoles.map((p) => ({ ...p, r: 1.2 })),
      ...fireHydrants.map((p) => ({ ...p, r: 1.1 })),
      ...roadSigns.map((p) => ({ ...p, r: 1.1 })),
      ...trafficLights.map((p) => ({ ...p, r: 1.3 })),
      ...wasteBins.map((p) => ({ ...p, r: 1.2 })),
      ...dumpsters.map((p) => ({ ...p, r: 1.8 })),
    ];
    for (const prop of radialProps) {
      if (isOrientedBoxOverlappingPoint(lng, lat, bearingDeg, halfLenM, halfWidthM, prop.lng, prop.lat, prop.r)) {
        return false;
      }
    }
    for (const sv of stationaryVehicles) {
      const dE = (lng - sv.lng) * METERS_PER_DEG_LNG;
      const dN = (lat - sv.lat) * METERS_PER_DEG_LAT;
      if (Math.hypot(dE, dN) < halfLenM + (sv.halfLenM || 3.4) + 2.6) return false;
    }
    return true;
  };

  // Dedicated footprint validator for waste bins & dumpsters (prevents table/bench/street overlap)
  const isWasteBinSpotClear = (lng, lat, binRadiusM = 0.75) => {
    if (!isInsidePolygon(lng, lat, barangayGeometry)) return false;
    // Keep entire bin radius strictly outside the active roadway asphalt
    if (isOnRoadOrSidewalk(lng, lat, binRadiusM + 0.85, false)) return false;
    if (isNearRoadCornerOrEndpoint(lng, lat, 10)) return false;

    for (const occ of squareOccupiedLots) {
      const dE = Math.abs((lng - occ.lng) * METERS_PER_DEG_LNG);
      const dN = Math.abs((lat - occ.lat) * METERS_PER_DEG_LAT);
      if (dE < occ.halfSpanM + binRadiusM + 1.4 && dN < occ.halfSpanM + binRadiusM + 1.4) {
        return false;
      }
    }
    // Check full rectangular footprint of picnic table+chair sets (bench_table: ~3.2m x 2.6m)
    for (const bt of benchTables) {
      if (isOrientedBoxOverlappingPoint(bt.lng, bt.lat, bt.bearingDeg || 0, 1.75, 1.45, lng, lat, binRadiusM + 0.9)) {
        return false;
      }
    }
    // Check full rectangular footprint of benches (~2.6m x 1.3m)
    for (const b of benches) {
      if (isOrientedBoxOverlappingPoint(b.lng, b.lat, b.bearingDeg || 0, 1.45, 0.85, lng, lat, binRadiusM + 0.8)) {
        return false;
      }
    }
    // Check stationary vehicles
    for (const sv of stationaryVehicles) {
      if (
        isOrientedBoxOverlappingPoint(
          sv.lng,
          sv.lat,
          sv.bearingDeg || 0,
          sv.halfLenM || 3.4,
          sv.halfWidthM || 1.45,
          lng,
          lat,
          binRadiusM + 1.2
        )
      ) {
        return false;
      }
    }
    // Check other street furniture & existing bins
    const otherProps = [
      ...trees.map((p) => ({ ...p, r: 1.5 })),
      ...streetLights.map((p) => ({ ...p, r: 0.9 })),
      ...utilityPoles.map((p) => ({ ...p, r: 0.9 })),
      ...fireHydrants.map((p) => ({ ...p, r: 0.9 })),
      ...roadSigns.map((p) => ({ ...p, r: 0.9 })),
      ...wasteBins.map((p) => ({ ...p, r: 1.4 })),
      ...dumpsters.map((p) => ({ ...p, r: 1.9 })),
    ];
    for (const p of otherProps) {
      const dM = Math.hypot((lng - p.lng) * METERS_PER_DEG_LNG, (lat - p.lat) * METERS_PER_DEG_LAT);
      if (dM < binRadiusM + p.r) return false;
    }
    return true;
  };


    // ==========================================================================
    // STEP 3: VEHICLES PARKED AT BUILDINGS/LOTS + CURBSIDE TRANSIT BAYS
  // ==========================================================================
  const placedProps = [];
  const parkedVehicleCoords = [];

  // Seed traffic lights into placedProps so vehicles and sidewalk props stay clear of them
  for (const tl of trafficLights) {
    placedProps.push({ lng: tl.lng, lat: tl.lat, category: 'trafficLight' });
  }

  // True rendered half-dimensions (meters) derived from GLB aspect ratios x TARGET_HEIGHT_M
  const VEHICLE_FOOTPRINT_HALF_M = {
    car:           { halfLenM: 12.6, halfWidthM: 6.8 },
    car2:          { halfLenM: 14.0, halfWidthM: 6.9 },
    policeCar:     { halfLenM: 14.6, halfWidthM: 5.5 },
    ambulance:     { halfLenM: 15.0, halfWidthM: 7.1 },
    deliveryTruck: { halfLenM: 15.8, halfWidthM: 7.6 },
    flowerTruck:   { halfLenM: 16.3, halfWidthM: 6.2 },
    jeepney:       { halfLenM: 20.1, halfWidthM: 7.2 },
    tricycle:      { halfLenM: 8.4,  halfWidthM: 6.3 },
  };

  const isNearParkedVehicle = (lng, lat, padM = 3.5) => {
    const px = lng * METERS_PER_DEG_LNG;
    const py = lat * METERS_PER_DEG_LAT;
    for (let i = 0; i < stationaryVehicles.length; i++) {
      const sv = stationaryVehicles[i];
      const rad = ((sv.bearingDeg || 0) * Math.PI) / 180;
      const ux = Math.sin(rad);
      const uy = Math.cos(rad);
      const nx = -uy;
      const ny = ux;
      const dx = px - sv.lng * METERS_PER_DEG_LNG;
      const dy = py - sv.lat * METERS_PER_DEG_LAT;
      const along = Math.abs(dx * ux + dy * uy);
      const perp = Math.abs(dx * nx + dy * ny);
      if (along < (sv.halfLenM || 14) + padM && perp < (sv.halfWidthM || 7) + padM) {
        return true;
      }
    }
    return false;
  };

  const registerParkedBay = (
    type,
    lng,
    lat,
    facingBearingDeg,
    targetHeightM,
    frontAxisOffset,
    bayKind = 'parking_bay'
  ) => {
    const dims = VEHICLE_FOOTPRINT_HALF_M[type] || { halfLenM: 13.5, halfWidthM: 6.8 };
    const { halfLenM, halfWidthM } = dims;

    const rad = ((facingBearingDeg || 0) * Math.PI) / 180;
    const ux = Math.sin(rad);
    const uy = Math.cos(rad);
    const nx = -uy;
    const ny = ux;

    // 9-point full OBB check: completely inside barangay, off waterways, and STRICTLY off active asphalt lanes
    for (const a of [-1, 0, 1]) {
      for (const p of [-1, 0, 1]) {
        const sLng = lng + (ux * (a * (halfLenM + 1.0)) + nx * (p * (halfWidthM + 0.8))) / METERS_PER_DEG_LNG;
        const sLat = lat + (uy * (a * (halfLenM + 1.0)) + ny * (p * (halfWidthM + 0.8))) / METERS_PER_DEG_LAT;
        if (!isInsidePolygon(sLng, sLat, barangayGeometry)) return false;
        if (isInsideWaterwayClearance(sLat, sLng, 16, 11)) return false;
        // Strictly outside road asphalt (>= 2.2 m clear of driving lanes so moving jeepneys/tricycles never collide)
        if (isOnRoadOrSidewalk(sLng, sLat, 2.2, false)) return false;
      }
    }

    if (isNearWaterFacilityPad(lng, lat, Math.max(halfLenM, halfWidthM) + 2.5)) return false;

    // Clear of intersections & traffic lights
    for (const node of intersectionNodes) {
      if (Math.hypot((lng - node.lng) * METERS_PER_DEG_LNG, (lat - node.lat) * METERS_PER_DEG_LAT) < halfLenM + 20) {
        return false;
      }
    }
    for (const tl of trafficLights) {
      if (Math.hypot((lng - tl.lng) * METERS_PER_DEG_LNG, (lat - tl.lat) * METERS_PER_DEG_LAT) < halfLenM + 5.0) {
        return false;
      }
    }

    const ax = lng * METERS_PER_DEG_LNG;
    const ay = lat * METERS_PER_DEG_LAT;

    // Exact 2D SAT OBB check against all buildings & locked civic structures
    for (let i = 0; i < squareOccupiedLots.length; i++) {
      const occ = squareOccupiedLots[i];
      const bx = occ.lng * METERS_PER_DEG_LNG;
      const by = occ.lat * METERS_PER_DEG_LAT;
      const oW = occ.obbHalfW || occ.halfSpanM || 24;
      const oD = occ.obbHalfD || occ.halfSpanM || 24;
      if (Math.hypot(bx - ax, by - ay) >= Math.hypot(halfLenM, halfWidthM) + Math.hypot(oW, oD) + 2.5) continue;
      const oAx = _getLotAxes(occ);
      if (_obbOverlaps(ax, ay, ux, uy, nx, ny, halfLenM, halfWidthM, bx, by, oAx.ux, oAx.uy, oAx.nx, oAx.ny, oW, oD, 2.2)) {
        return false;
      }
    }

    // Exact 2D SAT OBB check against every already-placed parked vehicle (zero overlapping cars)
    for (let i = 0; i < stationaryVehicles.length; i++) {
      const sv = stationaryVehicles[i];
      const bx = sv.lng * METERS_PER_DEG_LNG;
      const by = sv.lat * METERS_PER_DEG_LAT;
      const sRad = ((sv.bearingDeg || 0) * Math.PI) / 180;
      const sux = Math.sin(sRad);
      const suy = Math.cos(sRad);
      const snx = -suy;
      const sny = sux;
      if (
        _obbOverlaps(
          ax, ay, ux, uy, nx, ny, halfLenM, halfWidthM,
          bx, by, sux, suy, snx, sny, sv.halfLenM, sv.halfWidthM,
          6.0
        )
      ) {
        return false;
      }
    }

    // Parking bay footprint is enforced via OBB collision logic without rendering an orange ground box

    parkedVehicleCoords.push({ lng, lat, type, halfLenM, halfWidthM, bearingDeg: facingBearingDeg });
    placedProps.push({ lng, lat, category: 'parkedVehicle' });
    probes.push({ lng, lat });
    stationaryVehicles.push({
      id: `PARKED-${type.toUpperCase()}-${stationaryVehicles.length + 1}`,
      type,
      lng,
      lat,
      bearingDeg: facingBearingDeg,
      halfLenM,
      halfWidthM,
      yawDeg: Number((((frontAxisOffset - facingBearingDeg) % 360 + 360) % 360).toFixed(1)),
      targetHeightM,
    });
    return true;
  };

  const fillCurbTransitType = (type, limit, targetHeightM, frontAxisOffset, startIdx = 0) => {
    let count = stationaryVehicles.filter((v) => v.type === type).length;
    const dims = VEHICLE_FOOTPRINT_HALF_M[type] || { halfLenM: 13.5, halfWidthM: 6.8 };
    const fracs = [0.22, 0.50, 0.78];

    // Prefer straight runs (clean alignment) with fallback to insideSegments
    const candidateRuns = _straightSideTracks.length > 0 ? _straightSideTracks : [];
    for (let step = 0; step < candidateRuns.length && count < limit; step++) {
      const tr = candidateRuns[(startIdx + step) % candidateRuns.length];
      if (tr.totalLenM < dims.halfLenM * 2 + 12) continue;
      const seg = tr.runSeg;

      for (const extraLat of [3.2, 6.0]) {
        const lateralOffsetM = seg.halfAsphaltM + dims.halfWidthM + extraLat;
        for (let fIdx = 0; fIdx < fracs.length && count < limit; fIdx++) {
          const d = tr.totalLenM * fracs[fIdx];
          const { baseLng, baseLat } = _sampleRunAt(tr, d);
          const vLng = baseLng + (seg.nx * tr.side * lateralOffsetM) / METERS_PER_DEG_LNG;
          const vLat = baseLat + (seg.ny * tr.side * lateralOffsetM) / METERS_PER_DEG_LAT;
          const travelBearingDeg = tr.side === 1 ? seg.bearingDeg : (seg.bearingDeg + 180) % 360;
          if (registerParkedBay(type, vLng, vLat, travelBearingDeg, targetHeightM, frontAxisOffset, 'transit_bay')) {
            count++;
          }
        }
      }
    }

    // Fallback scan across insideSegments if any quota remains
    for (let step = 0; step < insideSegments.length && count < limit; step++) {
      const si = (startIdx + step) % insideSegments.length;
      const seg = insideSegments[si];
      if (seg.lenM < dims.halfLenM * 2 + 10) continue;
      for (const side of [1, -1]) {
        const lateralOffsetM = (seg.halfAsphaltM || 10) + dims.halfWidthM + 3.4;
        for (const frac of [0.32, 0.68]) {
          if (count >= limit) break;
          const d = seg.lenM * frac;
          const vLng = seg.lng1 + (seg.ux * d + seg.nx * lateralOffsetM * side) / METERS_PER_DEG_LNG;
          const vLat = seg.lat1 + (seg.uy * d + seg.ny * lateralOffsetM * side) / METERS_PER_DEG_LAT;
          const travelBearingDeg = side === 1 ? seg.bearingDeg : (seg.bearingDeg + 180) % 360;
          if (registerParkedBay(type, vLng, vLat, travelBearingDeg, targetHeightM, frontAxisOffset, 'transit_bay')) {
            count++;
          }
        }
      }
    }
  };

  fillCurbTransitType('jeepney', limits.parkedJeepneys, TARGET_HEIGHT_M.jeepney, JEEPNEY_FRONT_AXIS_OFFSET, 1);
  fillCurbTransitType('tricycle', limits.parkedTricycles, TARGET_HEIGHT_M.tricycle, TRICYCLE_FRONT_AXIS_OFFSET, 3);
  fillCurbTransitType('policeCar', limits.policeCars, TARGET_HEIGHT_M.policeCar, PARKED_VEHICLE_FRONT_AXIS_OFFSET, 5);
  fillCurbTransitType('ambulance', limits.ambulances, TARGET_HEIGHT_M.ambulance, AMBULANCE_FRONT_AXIS_OFFSET, 7);
  fillCurbTransitType('deliveryTruck', limits.parkedDeliveryTrucks, TARGET_HEIGHT_M.deliveryTruck, PARKED_VEHICLE_FRONT_AXIS_OFFSET, 9);
  fillCurbTransitType('flowerTruck', limits.flowerTrucks, TARGET_HEIGHT_M.flowerTruck, PARKED_VEHICLE_FRONT_AXIS_OFFSET, 11);
  fillCurbTransitType('car', limits.parkedCars, TARGET_HEIGHT_M.car, PARKED_VEHICLE_FRONT_AXIS_OFFSET, 13);
  fillCurbTransitType('car2', limits.parkedCars2, TARGET_HEIGHT_M.car2, CAR2_FRONT_AXIS_OFFSET, 15);

  // ==========================================================================
  // STEP 4: BENCHES, WASTE BINS, LIGHTS, SIGNS & TREES (ALL MODELS INCLUDED)
  // ==========================================================================
  const isClearOfPlaced = (lng, lat, minDistM, category = null) => {
    for (let i = 0; i < placedProps.length; i++) {
      const p = placedProps[i];
      if (category && p.category !== category) continue;
      const d = Math.hypot((lng - p.lng) * METERS_PER_DEG_LNG, (lat - p.lat) * METERS_PER_DEG_LAT);
      if (d < minDistM) return false;
    }
    return true;
  };

  const canPlaceSidewalkProp = (
    lng,
    lat,
    {
      minGlobalM = 10.0,
      minSameCatM = 34.0,
      minVehiclePadM = 4.5,
      curbBufferM = 2.2,
      footprintM = 1.2,
      clearSidewalk = false,
      category = 'prop',
    } = {}
  ) => {
    const checkPts =
      footprintM > 1.2
        ? [[0, 0], [footprintM, 0], [-footprintM, 0], [0, footprintM], [0, -footprintM]]
        : [[0, 0]];

    for (const [ox, oy] of checkPts) {
      const cLng = lng + ox / METERS_PER_DEG_LNG;
      const cLat = lat + oy / METERS_PER_DEG_LAT;
      if (!isInsidePolygon(cLng, cLat, barangayGeometry)) return false;
      if (isInsideWaterwayClearance(cLat, cLng, 18, 12)) return false;
      if (isOnRoadOrSidewalk(cLng, cLat, curbBufferM, clearSidewalk)) return false;
      if (isInsideAnySquareLot(cLng, cLat, 2.2)) return false;
    }

    if (isNearParkedVehicle(lng, lat, minVehiclePadM)) return false;
    if (isNearWaterFacilityPad(lng, lat, 3.5)) return false;
    if (!isClearOfPlaced(lng, lat, minGlobalM, null)) return false;
    if (!isClearOfPlaced(lng, lat, minSameCatM, category)) return false;
    return true;
  };

  const registerProp = (targetArray, category, item) => {
    targetArray.push(item);
    placedProps.push({ lng: item.lng, lat: item.lat, category });
    probes.push({ lng: item.lng, lat: item.lat });
  };

  const signTypePool = ['stopSign', 'pedestrianSign', 'speedLimitSign', 'barangaySign'];
  let signCursor = 0;

  // Walk all road segments (>= 24m) for streetlights, road signs, fire hydrants, waste bins & utility poles
  for (let si = 0; si < insideSegments.length; si++) {
    const seg = insideSegments[si];
    if (seg.lenM < 24) continue;

    const isMainOrCollector =
      seg.tier === 'primary' || seg.tier === 'secondary' || seg.tier === 'tertiary';

    const stepM = isMainOrCollector ? 46 : 56;
    for (let d = 14; d <= seg.lenM - 14; d += stepM) {
      const slotIdx = Math.floor(d / stepM);
      const side = (si + slotIdx) % 2 === 0 ? 1 : -1;
      const faceYaw = side === 1 ? (seg.bearingDeg + 270) % 360 : (seg.bearingDeg + 90) % 360;

      // Streetlights (main/collector roads)
      if (isMainOrCollector && streetLights.length < limits.streetLights) {
        const lightOffsetM = seg.halfAsphaltM + 3.8;
        const lLng = seg.lng1 + (seg.ux * d + seg.nx * lightOffsetM * side) / METERS_PER_DEG_LNG;
        const lLat = seg.lat1 + (seg.uy * d + seg.ny * lightOffsetM * side) / METERS_PER_DEG_LAT;
        if (
          canPlaceSidewalkProp(lLng, lLat, {
            minGlobalM: 10.0,
            minSameCatM: 42.0,
            minVehiclePadM: 4.5,
            curbBufferM: 2.0,
            category: 'streetLight',
          })
        ) {
          registerProp(streetLights, 'streetLight', {
            id: `LIGHT-${streetLights.length + 1}`,
            lng: lLng,
            lat: lLat,
            yawDeg: Number(((faceYaw + 360) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.streetLight,
          });
        }
      }

      // Road Signs (all 4 variants, fixed height TARGET_HEIGHT_M.roadSign = 34.0m)
      if (roadSigns.length < limits.roadSigns) {
        const signOffsetM = seg.halfAsphaltM + 3.8;
        const signD = Math.min(seg.lenM - 10, d + 10);
        const sLng = seg.lng1 + (seg.ux * signD + seg.nx * signOffsetM * -side) / METERS_PER_DEG_LNG;
        const sLat = seg.lat1 + (seg.uy * signD + seg.ny * signOffsetM * -side) / METERS_PER_DEG_LAT;
        const signType = signTypePool[signCursor % signTypePool.length];
        if (
          canPlaceSidewalkProp(sLng, sLat, {
            minGlobalM: 9.0,
            minSameCatM: 34.0,
            minVehiclePadM: 4.5,
            curbBufferM: 2.0,
            category: 'roadSign',
          })
        ) {
          signCursor++;
          registerProp(roadSigns, 'roadSign', {
            id: `SIGN-${roadSigns.length + 1}`,
            signType,
            variantIndex: (signCursor - 1) % signTypePool.length,
            lng: sLng,
            lat: sLat,
            yawDeg: Number(((180 - seg.bearingDeg + 360) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.roadSign,
          });
        }
      }

      // Fire Hydrants
      if (fireHydrants.length < limits.fireHydrants) {
        const hydOffsetM = seg.halfAsphaltM + 3.6;
        const hydD = Math.max(10, d - 8);
        const hLng = seg.lng1 + (seg.ux * hydD + seg.nx * hydOffsetM * -side) / METERS_PER_DEG_LNG;
        const hLat = seg.lat1 + (seg.uy * hydD + seg.ny * hydOffsetM * -side) / METERS_PER_DEG_LAT;
        if (
          canPlaceSidewalkProp(hLng, hLat, {
            minGlobalM: 9.0,
            minSameCatM: 52.0,
            minVehiclePadM: 4.5,
            curbBufferM: 2.0,
            category: 'fireHydrant',
          })
        ) {
          registerProp(fireHydrants, 'fireHydrant', {
            id: `HYD-${fireHydrants.length + 1}`,
            lng: hLng,
            lat: hLat,
            yawDeg: Number(((faceYaw + 180) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.fireHydrant,
          });
        }
      }

      // Waste Bins (alternating v1 and v2)
      if (wasteBins.length < limits.wasteBins) {
        const binOffsetM = seg.halfAsphaltM + 3.8;
        const wbLng = seg.lng1 + (seg.ux * d + seg.nx * binOffsetM * -side) / METERS_PER_DEG_LNG;
        const wbLat = seg.lat1 + (seg.uy * d + seg.ny * binOffsetM * -side) / METERS_PER_DEG_LAT;
        const binYaw = -side === 1 ? (seg.bearingDeg + 270) % 360 : (seg.bearingDeg + 90) % 360;
        if (
          canPlaceSidewalkProp(wbLng, wbLat, {
            minGlobalM: 8.5,
            minSameCatM: 32.0,
            minVehiclePadM: 4.5,
            curbBufferM: 2.0,
            footprintM: 0.8,
            category: 'wasteBin',
          })
        ) {
          registerProp(wasteBins, 'wasteBin', {
            id: `BIN-${wasteBins.length + 1}`,
            lng: wbLng,
            lat: wbLat,
            variant: wasteBins.length % 2 === 0 ? 'v1' : 'v2',
            yawDeg: Number(((binYaw + 360) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.wasteBin,
          });
        }
      }

      // Utility Poles (local & secondary roads)
      if (!isMainOrCollector && utilityPoles.length < limits.utilityPoles) {
        const poleOffsetM = seg.halfAsphaltM + 3.8;
        const pLng = seg.lng1 + (seg.ux * d + seg.nx * poleOffsetM * side) / METERS_PER_DEG_LNG;
        const pLat = seg.lat1 + (seg.uy * d + seg.ny * poleOffsetM * side) / METERS_PER_DEG_LAT;
        if (
          canPlaceSidewalkProp(pLng, pLat, {
            minGlobalM: 11.0,
            minSameCatM: 58.0,
            minVehiclePadM: 4.5,
            curbBufferM: 2.0,
            category: 'utilityPole',
          })
        ) {
          registerProp(utilityPoles, 'utilityPole', {
            id: `POLE-${utilityPoles.length + 1}`,
            lng: pLng,
            lat: pLat,
            yawDeg: Number(((180 - seg.bearingDeg + 360) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.utilityPole,
          });
        }
      }
    }
  }

  // Plaza & Civic Perimeter Benches/Tables + Commercial/Civic Dumpsters
  for (const b of squareOccupiedLots) {
    const rad = ((b.bearingDeg || 0) * Math.PI) / 180;
    const fx = Math.sin(rad);
    const fy = Math.cos(rad);
    const ux = fy;
    const uy = -fx;
    const halfM = b.obbHalfW || b.halfSpanM || 26;

    if (b.archetype === 'park_plaza' || b.archetype === 'covered_court' || b.archetype === 'civic_hall') {
      // Place bench tables cleanly along the outer perimeter walkway (never inside structure)
      const outerD = halfM + 7.2;
      const tableSpots = [
        [fx * outerD + ux * (halfM * 0.45), fy * outerD + uy * (halfM * 0.45)],
        [fx * outerD - ux * (halfM * 0.45), fy * outerD - uy * (halfM * 0.45)],
        [-fx * outerD + ux * (halfM * 0.45), -fy * outerD + uy * (halfM * 0.45)],
        [-fx * outerD - ux * (halfM * 0.45), -fy * outerD - uy * (halfM * 0.45)],
        [ux * outerD, uy * outerD],
        [-ux * outerD, -uy * outerD],
      ];
      for (const [ox, oy] of tableSpots) {
        if (benchTables.length >= limits.benchTables) break;
        const tblLng = b.lng + ox / METERS_PER_DEG_LNG;
        const tblLat = b.lat + oy / METERS_PER_DEG_LAT;
        if (
          canPlaceSidewalkProp(tblLng, tblLat, {
            minGlobalM: 10.0,
            minSameCatM: 18.0,
            minVehiclePadM: 5.0,
            curbBufferM: 5.0,
            footprintM: 4.2,
            category: 'benchTable',
          })
        ) {
          registerProp(benchTables, 'benchTable', {
            id: `TBL-${benchTables.length + 1}`,
            lng: tblLng,
            lat: tblLat,
            yawDeg: Number(((180 - (b.bearingDeg || 0) + 360) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.benchTable,
          });
        }
      }

      // Place benches along perimeter walkways
      const benchSpots = [
        [fx * (halfM + 7.8), fy * (halfM + 7.8), 180 - (b.bearingDeg || 0)],
        [ux * (halfM + 7.8) + fx * (halfM * 0.35), uy * (halfM + 7.8) + fy * (halfM * 0.35), 90 - (b.bearingDeg || 0)],
        [-ux * (halfM + 7.8) + fx * (halfM * 0.35), -uy * (halfM + 7.8) + fy * (halfM * 0.35), 270 - (b.bearingDeg || 0)],
        [-fx * (halfM + 7.8), -fy * (halfM + 7.8), -(b.bearingDeg || 0)],
      ];
      for (const [ox, oy, yaw] of benchSpots) {
        if (benches.length >= limits.benches) break;
        const bLng = b.lng + ox / METERS_PER_DEG_LNG;
        const bLat = b.lat + oy / METERS_PER_DEG_LAT;
        if (
          canPlaceSidewalkProp(bLng, bLat, {
            minGlobalM: 9.0,
            minSameCatM: 18.0,
            minVehiclePadM: 6.5,
            curbBufferM: 2.2,
            footprintM: 5.8,
            category: 'bench',
          })
        ) {
          registerProp(benches, 'bench', {
            id: `BENCH-${benches.length + 1}`,
            lng: bLng,
            lat: bLat,
            yawDeg: Number(((yaw % 360) + 360) % 360),
            targetHeightM: TARGET_HEIGHT_M.bench,
          });
        }
      }
    }

    // Dumpsters beside/behind shops & civic service areas
    if (
      (b.archetype === 'shophouse_commercial' || b.archetype === 'civic_hall' || b.archetype === 'covered_court') &&
      dumpsters.length < limits.dumpsters
    ) {
      const dumpOffsets = [
        [-fx * (halfM + 5.0) - ux * (halfM * 0.4), -fy * (halfM + 5.0) - uy * (halfM * 0.4)],
        [-fx * (halfM + 5.0) + ux * (halfM * 0.4), -fy * (halfM + 5.0) + uy * (halfM * 0.4)],
        [ux * (halfM + 5.0), uy * (halfM + 5.0)],
        [-ux * (halfM + 5.0), -uy * (halfM + 5.0)],
      ];
      for (const [ox, oy] of dumpOffsets) {
        if (dumpsters.length >= limits.dumpsters) break;
        const dLng = b.lng + ox / METERS_PER_DEG_LNG;
        const dLat = b.lat + oy / METERS_PER_DEG_LAT;
        if (
          canPlaceSidewalkProp(dLng, dLat, {
            minGlobalM: 9.0,
            minSameCatM: 28.0,
            minVehiclePadM: 5.0,
            curbBufferM: 2.4,
            footprintM: 2.2,
            category: 'dumpster',
          })
        ) {
          registerProp(dumpsters, 'dumpster', {
            id: `DUMP-${dumpsters.length + 1}`,
            lng: dLng,
            lat: dLat,
            yawDeg: Number(((90 - (b.bearingDeg || 0) + 360) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.dumpster,
          });
          break;
        }
      }
    }
  }

  // Sidewalk Benches, Bench Tables & Service Dumpsters along open curbs to fulfill full street-asset roster
  for (let si = 0; si < insideSegments.length; si++) {
    const seg = insideSegments[si];
    if (seg.lenM < 28) continue;

    for (let d = 16; d <= seg.lenM - 16; d += 38) {
      const side = (si + Math.floor(d / 38)) % 2 === 0 ? 1 : -1;
      const curbOff = seg.halfAsphaltM + 9.6;
      const pLng = seg.lng1 + (seg.ux * d + seg.nx * curbOff * side) / METERS_PER_DEG_LNG;
      const pLat = seg.lat1 + (seg.uy * d + seg.ny * curbOff * side) / METERS_PER_DEG_LAT;
      const faceYaw = side === 1 ? (seg.bearingDeg + 270) % 360 : (seg.bearingDeg + 90) % 360;

      if (benches.length < limits.benches) {
        if (
          canPlaceSidewalkProp(pLng, pLat, {
            minGlobalM: 10.0,
            minSameCatM: 28.0,
            minVehiclePadM: 6.5,
            curbBufferM: 2.4,
            footprintM: 5.8,
            category: 'bench',
          })
        ) {
          registerProp(benches, 'bench', {
            id: `BENCH-${benches.length + 1}`,
            lng: pLng,
            lat: pLat,
            yawDeg: Number(((faceYaw + 360) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.bench,
          });
          continue;
        }
      }

      if (benchTables.length < limits.benchTables) {
        const tblOff = seg.halfAsphaltM + 7.2;
        const tLng = seg.lng1 + (seg.ux * d + seg.nx * tblOff * -side) / METERS_PER_DEG_LNG;
        const tLat = seg.lat1 + (seg.uy * d + seg.ny * tblOff * -side) / METERS_PER_DEG_LAT;
        const end1Lng = tLng + (seg.ux * 8.5) / METERS_PER_DEG_LNG;
        const end1Lat = tLat + (seg.uy * 8.5) / METERS_PER_DEG_LAT;
        const end2Lng = tLng - (seg.ux * 8.5) / METERS_PER_DEG_LNG;
        const end2Lat = tLat - (seg.uy * 8.5) / METERS_PER_DEG_LAT;
        const endsClear =
          isInsidePolygon(end1Lng, end1Lat, barangayGeometry) &&
          isInsidePolygon(end2Lng, end2Lat, barangayGeometry) &&
          !isOnRoadOrSidewalk(end1Lng, end1Lat, 2.2, false) &&
          !isOnRoadOrSidewalk(end2Lng, end2Lat, 2.2, false);
        if (
          endsClear &&
          canPlaceSidewalkProp(tLng, tLat, {
            minGlobalM: 10.0,
            minSameCatM: 32.0,
            minVehiclePadM: 6.5,
            curbBufferM: 2.5,
            footprintM: 3.2,
            category: 'benchTable',
          })
        ) {
          registerProp(benchTables, 'benchTable', {
            id: `TBL-${benchTables.length + 1}`,
            lng: tLng,
            lat: tLat,
            yawDeg: Number(((90 - seg.bearingDeg + 360) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.benchTable,
          });
          continue;
        }
      }

      if (dumpsters.length < limits.dumpsters) {
        const dOff = seg.halfAsphaltM + 5.8;
        const dLng = seg.lng1 + (seg.ux * d + seg.nx * dOff * -side) / METERS_PER_DEG_LNG;
        const dLat = seg.lat1 + (seg.uy * d + seg.ny * dOff * -side) / METERS_PER_DEG_LAT;
        if (
          canPlaceSidewalkProp(dLng, dLat, {
            minGlobalM: 10.0,
            minSameCatM: 36.0,
            minVehiclePadM: 5.2,
            curbBufferM: 2.6,
            footprintM: 2.2,
            category: 'dumpster',
          })
        ) {
          registerProp(dumpsters, 'dumpster', {
            id: `DUMP-${dumpsters.length + 1}`,
            lng: dLng,
            lat: dLat,
            yawDeg: Number(((faceYaw + 360) % 360).toFixed(1)),
            targetHeightM: TARGET_HEIGHT_M.dumpster,
          });
        }
      }
    }
  }

  // Roadside Trees (clear of buildings, parked vehicles & water facilities)
  for (let si = 0; si < insideSegments.length && trees.length < limits.trees; si++) {
    const seg = insideSegments[si];
    if (seg.lenM < 34) continue;
    const stepM = 58;
    const treeLateral = seg.halfAsphaltM + 5.6;

    for (let d = 20; d <= seg.lenM - 20 && trees.length < limits.trees; d += stepM) {
      const baseLng = seg.lng1 + (seg.ux * d) / METERS_PER_DEG_LNG;
      const baseLat = seg.lat1 + (seg.uy * d) / METERS_PER_DEG_LAT;
      const side = Math.floor(d / stepM) % 2 === 0 ? 1 : -1;
      const tLng = baseLng + (seg.nx * treeLateral * side) / METERS_PER_DEG_LNG;
      const tLat = baseLat + (seg.ny * treeLateral * side) / METERS_PER_DEG_LAT;
      if (
        !canPlaceSidewalkProp(tLng, tLat, {
          minGlobalM: 13.0,
          minSameCatM: 44.0,
          minVehiclePadM: 6.5,
          curbBufferM: 4.0,
          footprintM: 2.0,
          category: 'tree',
        })
      ) {
        continue;
      }
      const scaleJitter = 0.9 + spatialHash01(tLng, tLat, 13) * 0.20;
      registerProp(trees, 'tree', {
        id: `TREE-${trees.length + 1}`,
        lng: tLng,
        lat: tLat,
        yawDeg: Number((spatialHash01(tLng, tLat, 19) * 360).toFixed(1)),
        targetHeightM: TARGET_HEIGHT_M.tree * scaleJitter,
      });
    }
  }

  // ==========================================================================
  // STEP 5: STRICTLY 1 MOVING VEHICLE PER CORRIDOR (ZERO COLLISIONS)
  // ==========================================================================
  const arterialCorridors = insideCorridors
    .filter((c) => c.tier === 'primary' || c.tier === 'secondary')
    .map((c) => {
      const forward = buildOffsetLanePath(c.coords, -c.halfAsphaltM * 0.50);
      return { ...c, forward };
    })
    .filter((c) => c.forward.totalLenM >= 100)
    .sort((a, b) => b.forward.totalLenM - a.forward.totalLenM);

  const localCorridors = insideCorridors
    .filter((c) => c.tier === 'tertiary' || c.tier === 'local')
    .map((c) => {
      const forward = buildOffsetLanePath(c.coords, -c.halfAsphaltM * 0.45);
      return { ...c, forward };
    })
    .filter((c) => c.forward.totalLenM >= 85)
    .sort((a, b) => b.forward.totalLenM - a.forward.totalLenM);

  const jeepCorridors = arterialCorridors.length > 0 ? arterialCorridors : localCorridors;
  const jeepCount = Math.min(limits.movingJeepneys, jeepCorridors.length);
  for (let i = 0; i < jeepCount; i++) {
    const corr = jeepCorridors[i];
    movingVehicleTracks.push({
      id: `MOVING-JEEPNEY-${i + 1}`,
      type: 'jeepney',
      path: corr.forward.path,
      cumDist: corr.forward.cumDist,
      totalLenM: corr.forward.totalLenM,
      cycleSec: 30 + i * 5,
      phaseOffset: 0.15,
      targetHeightM: TARGET_HEIGHT_M.jeepney,
    });
  }

  const usedJeepIds = new Set(jeepCorridors.slice(0, jeepCount));
  const trikeCorridors =
    localCorridors.length > 0
      ? localCorridors
      : arterialCorridors.filter((c) => !usedJeepIds.has(c));
  const trikeCount = Math.min(limits.movingTricycles, trikeCorridors.length);
  for (let i = 0; i < trikeCount; i++) {
    const corr = trikeCorridors[i];
    movingVehicleTracks.push({
      id: `MOVING-TRICYCLE-${i + 1}`,
      type: 'tricycle',
      path: corr.forward.path,
      cumDist: corr.forward.cumDist,
      totalLenM: corr.forward.totalLenM,
      cycleSec: 28 + i * 5,
      phaseOffset: 0.45,
      targetHeightM: TARGET_HEIGHT_M.tricycle,
    });
  }

  // ==========================================================================
  // STEP 6: NON-FLICKERING CLOTHED LOW-POLY CITIZENS
  // ==========================================================================
  const citizenSpots = [];
  const isClearOfCitizens = (lng, lat, minDistM = 12.0) => {
    for (let i = 0; i < citizenSpots.length; i++) {
      const c = citizenSpots[i];
      if (Math.hypot((lng - c.lng) * METERS_PER_DEG_LNG, (lat - c.lat) * METERS_PER_DEG_LAT) < minDistM) {
        return false;
      }
    }
    return true;
  };

  for (let bi = 0; bi < squareOccupiedLots.length && standingCitizens.length < limits.standingCitizens; bi++) {
    const b = squareOccupiedLots[bi];
    const rad = ((b.bearingDeg || 0) * Math.PI) / 180;
    const fx = Math.sin(rad);
    const fy = Math.cos(rad);
    const ux = fy;
    const uy = -fx;

    const isCivic = b.archetype === 'park_plaza' || b.archetype === 'covered_court';
    const frontDist = isCivic ? 18.0 : b.halfSpanM + 5.0;
    const sideShift = (bi % 2 === 0 ? 1 : -1) * 7.0;
    const cLng = b.lng + (fx * frontDist + ux * sideShift) / METERS_PER_DEG_LNG;
    const cLat = b.lat + (fy * frontDist + uy * sideShift) / METERS_PER_DEG_LAT;

    if (!isInsidePolygon(cLng, cLat, barangayGeometry)) continue;
    if (isInsideWaterwayClearance(cLat, cLng, 68, 58)) continue;
    if (isOnRoadOrSidewalk(cLng, cLat, 3.0, false)) continue;
    if (!isCivic && isInsideAnySquareLot(cLng, cLat, 2.0)) continue;
    if (isNearParkedVehicle(cLng, cLat, 16.0)) continue;
    if (!isClearOfPlaced(cLng, cLat, 10.0, null)) continue;
    if (!isClearOfCitizens(cLng, cLat, 12.0) || isNearParkedVehicle(cLng, cLat, 3.0) || isNearWaterFacilityPad(cLng, cLat, 3.0)) continue;

    citizenSpots.push({ lng: cLng, lat: cLat });
    probes.push({ lng: cLng, lat: cLat });
    standingCitizens.push({
      id: `CITIZEN-STAND-${standingCitizens.length + 1}`,
      variant: standingCitizens.length % 2 === 0 ? 'standA' : 'standB',
      lng: cLng,
      lat: cLat,
      yawDeg: Number(((180 - (b.bearingDeg || 0) + (bi % 3 - 1) * 24 + 360) % 360).toFixed(1)),
      targetHeightM: TARGET_HEIGHT_M.citizen,
    });
  }

  const allWalkCorridors = [...arterialCorridors, ...localCorridors];
  for (let i = 0; i < limits.walkingCitizens && allWalkCorridors.length > 0; i++) {
    const corr = allWalkCorridors[i % allWalkCorridors.length];
    const side = i % 2 === 0 ? 1 : -1;
    const walkLateral = (corr.halfAsphaltM + (corr.halfSidewalkM - corr.halfAsphaltM) * 0.65) * side;
    const baseCoords = side === 1 ? corr.coords : [...corr.coords].reverse();
    const walkPath = buildOffsetLanePath(baseCoords, -walkLateral);
    if (walkPath.totalLenM < 60) continue;

    const slotInCorridor = Math.floor(i / allWalkCorridors.length);
    const totalInCorridor = Math.ceil(limits.walkingCitizens / allWalkCorridors.length);
    walkingCitizenTracks.push({
      id: `CITIZEN-WALK-${i + 1}`,
      shirtGroup: i % 2 === 0 ? 'red' : 'blue',
      path: walkPath.path,
      cumDist: walkPath.cumDist,
      totalLenM: walkPath.totalLenM,
      cycleSec: 46 + (i % 3) * 8,
      phaseOffset: (slotInCorridor + 0.23 * i) / Math.max(1, totalInCorridor),
      targetHeightM: TARGET_HEIGHT_M.citizen,
    });
  }

  // Oriented rectangular shadows matching each structure's exact dimensions & rotation
  for (const lot of squareOccupiedLots) {
    const rad = ((lot.bearingDeg || 0) * Math.PI) / 180;
    const ux = Math.sin(rad);
    const uy = Math.cos(rad);
    const nx = -uy;
    const ny = ux;
    const halfW = (lot.lotWidthM || lot.halfSpanM * 2) * 0.46;
    const halfD = (lot.lotDepthM || lot.halfSpanM * 2) * 0.46;

    const sLng = lot.lng - 4.5 / METERS_PER_DEG_LNG;
    const sLat = lot.lat - 3.8 / METERS_PER_DEG_LAT;

    groundFeatures.push({
      type: 'Feature',
      properties: { kind: 'building_shadow_outer' },
      geometry: {
        type: 'Polygon',
        coordinates: [makeRotatedRectRing(sLng, sLat, ux, uy, nx, ny, halfD + 4.5, halfW + 4.5)],
      },
    });
    groundFeatures.push({
      type: 'Feature',
      properties: { kind: 'building_shadow_core' },
      geometry: {
        type: 'Polygon',
        coordinates: [makeRotatedRectRing(sLng, sLat, ux, uy, nx, ny, halfD + 1.2, halfW + 1.2)],
      },
    });
  }
  // Export footprints for sun-tracked daytime shadows and warm night building glow
  const buildingShadowFootprints = squareOccupiedLots.map((lot) => ({
    lng: lot.lng,
    lat: lot.lat,
    archetype: lot.archetype,
    bearingDeg: lot.bearingDeg || 0,
    halfW: (lot.lotWidthM || lot.halfSpanM * 2) * 0.46,
    halfD: (lot.lotDepthM || lot.halfSpanM * 2) * 0.46,
    heightM:
      lot.archetype === 'civic_hall'
        ? 42
        : lot.archetype === 'park_plaza'
        ? 10
        : lot.archetype === 'covered_court'
        ? 24
        : 28,
  }));

  const contactShadows = trees.map((t) => ({ lng: t.lng, lat: t.lat, radiusM: 10.5 }));

  const _houseVariantCounts = Array.from({ length: HOUSE_FRONT_AXIS_OFFSETS.length }, (_, v) =>
    houses.filter((h) => (h.variantIndex ?? 0) % HOUSE_FRONT_AXIS_OFFSETS.length === v).length
  );
  const _shopVariantCounts = Array.from({ length: SHOP_FRONT_AXIS_OFFSETS.length }, (_, v) =>
    shops.filter((s) => (s.variantIndex ?? 0) % SHOP_FRONT_AXIS_OFFSETS.length === v).length
  );
  const _missingVariants = [
    ...(barangayHalls.length === 0 ? ['low_poly_city_hall.glb'] : []),
    ...(plazas.length === 0 ? ['plaza.glb'] : []),
    ...(coveredCourts.length === 0 ? ['covered_court.glb'] : []),
    ...(schools.length === 0 ? ['low_poly_school.glb'] : []),
    ...(hospitals.length === 0 ? ['low_poly_hospital.glb'] : []),
    ...(policeStations.length === 0 ? ['low_poly_police_station.glb'] : []),
    ..._houseVariantCounts.map((c, i) => (c === 0 ? `house_${i}` : null)).filter(Boolean),
    ..._shopVariantCounts.map((c, i) => (c === 0 ? `shop_${i}` : null)).filter(Boolean),
  ];
  console.info('[BicolAqua 3D Inventory]', {
    civicScale: _resolvedCivicScale,
    buildingScale: _resolvedBuildingScale,
    effectiveMeters: {
      cityHall: Number((BUILDING_SIZE_REF.barangayHall.targetX * _resolvedCivicScale).toFixed(1)),
      shop: Number((BUILDING_SIZE_REF.shop.targetX * _resolvedBuildingScale).toFixed(1)),
      house: Number((BUILDING_SIZE_REF.house.targetX * _resolvedBuildingScale).toFixed(1)),
    },
    civic: {
      cityHall: barangayHalls.length,
      plaza: plazas.length,
      coveredCourt: coveredCourts.length,
      school: schools.length,
      hospital: hospitals.length,
      policeStation: policeStations.length,
    },
    housesTotal: houses.length,
    houseVariants_0_to_5: _houseVariantCounts,
    shopsTotal: shops.length,
    shopVariants_0_to_4: _shopVariantCounts,
    propsAndVehicles: {
      trees: trees.length,
      benches: benches.length,
      benchTables: benchTables.length,
      wasteBins: wasteBins.length,
      dumpsters: dumpsters.length,
      streetLights: streetLights.length,
      utilityPoles: utilityPoles.length,
      roadSigns: roadSigns.length,
      trafficLights: trafficLights.length,
      fireHydrants: fireHydrants.length,
      stationaryVehicles: stationaryVehicles.length,
      movingVehicleTracks: movingVehicleTracks.length,
      facilityPadsSnapped: facilityPads.length,
    },
    missingBuildingModels: _missingVariants.length ? _missingVariants : 'NONE (ALL PRESENT)',
  });

  return {
    groundGeoJson: { type: 'FeatureCollection', features: groundFeatures },
    outsideArterialsGeoJson: { type: 'FeatureCollection', features: outsideArterialFeatures },
    barangayHalls,
    plazas,
    coveredCourts,
    schools,
    policeStations,
    hospitals,
    civicSizeScale: _resolvedCivicScale,
    shops,
    houses,
    trees,
    benches,
    benchTables,
    roadSigns,
    trafficLights,
    streetLights,
    utilityPoles,
    fireHydrants,
    wasteBins,
    dumpsters,
    stationaryVehicles,
    movingVehicleTracks,
    standingCitizens,
    walkingCitizenTracks,
    buildingShadowFootprints,
    contactShadows,
       buildingSizeScale: _resolvedBuildingScale,
    facilityOverrides,
    probes,
  };
}

// ============================================================================
// 4. DECK.GL SCENEGRAPH LAYERS


export function buildBarangayEnvironmentLayers({ 
  envData,
  envCatalog,
  getGroundPosition,
  terrainSyncTick,
  animTime = 0,
  streetLightFactor = 0,
}) {

  if (!envData || !envCatalog?.ready) return [];

  const layers = [];

  const pushHeightScaledLayer = (id, asset, data, zOffsetM = SURFACE_LIFT_M) => {
    if (!asset?.url || !Array.isArray(data) || data.length === 0) return;
    layers.push(
      new ScenegraphLayer({
        id,
        slot: 'top',
        data,
        scenegraph: asset.url,
        getPosition: (d) => getGroundPosition(d.lng, d.lat, 4, zOffsetM),
        getOrientation: (d) => [0, d.yawDeg ?? 0, 90],
        getScale: (d) => {
          const s = d.targetHeightM / asset.bounds.spanY;
          return [s, s, s];
        },
        sizeScale: 1,
        _lighting: 'pbr',
        pickable: false,
        updateTriggers: {
          getPosition: [terrainSyncTick, envData],
          getOrientation: [envData],
          getScale: [envData],
        },
      })
    );
  };

  if (envCatalog.plaza?.url && envData.plazas?.length > 0) {
    const asset = envCatalog.plaza;
    const s = (58 * CIVIC_SIZE_MULT * CIVIC_VISUAL_BOOST * (envData.civicSizeScale || 0.85)) / Math.max(asset.bounds.spanX, asset.bounds.spanZ);
    layers.push(
      new ScenegraphLayer({
        id: 'bicol-env-plaza',
        slot: 'top',
        data: envData.plazas,
        scenegraph: asset.url,
        getPosition: (d) => getGroundPosition(d.lng, d.lat, 4, SURFACE_LIFT_M + 0.05),
        getOrientation: (d) => [0, d.yawDeg ?? 0, 90],
        getScale: [s, s, s],
        sizeScale: 1,
        _lighting: 'pbr',
        pickable: false,
        updateTriggers: { getPosition: [terrainSyncTick, envData], getOrientation: [envData] },
      })
    );
  }

  if (envCatalog.coveredCourt?.url && envData.coveredCourts?.length > 0) {
    const asset = envCatalog.coveredCourt;
    const s = (62 * CIVIC_SIZE_MULT * CIVIC_VISUAL_BOOST * (envData.civicSizeScale || 0.85)) / Math.max(asset.bounds.spanX, asset.bounds.spanZ);
    layers.push(
      new ScenegraphLayer({
        id: 'bicol-env-covered-court',
        slot: 'top',
        data: envData.coveredCourts,
        scenegraph: asset.url,
        getPosition: (d) => getGroundPosition(d.lng, d.lat, 4, SURFACE_LIFT_M + 0.05),
        getOrientation: (d) => [0, d.yawDeg ?? 0, 90],
        getScale: [s, s, s],
        sizeScale: 1,
        _lighting: 'pbr',
        pickable: false,
        updateTriggers: { getPosition: [terrainSyncTick, envData], getOrientation: [envData] },
      })
    );
  }

  const areaBuildingScale = envData.buildingSizeScale || 1.0;
  const civicBuildingScale = (envData.civicSizeScale || 0.85) * CIVIC_VISUAL_BOOST;
  const pushBuildingVariantLayers = (prefix, assetList, items, ref, scaleMult = areaBuildingScale) => {
    if (!Array.isArray(assetList) || assetList.length === 0 || !Array.isArray(items) || items.length === 0) return;
    const count = assetList.length;
    const grouped = Array.from({ length: count }, () => []);
    for (const item of items) {
      grouped[(item.variantIndex ?? 0) % count].push(item);
    }
    grouped.forEach((subset, idx) => {
      const asset = assetList[idx];
      if (!asset?.url || subset.length === 0) return;
      const s = Math.min(
        ref.targetX / asset.bounds.spanX,
        ref.targetY / asset.bounds.spanY,
        ref.targetZ / asset.bounds.spanZ
      ) * scaleMult;
      layers.push(
        new ScenegraphLayer({
          id: `${prefix}-${idx}`,
          slot: 'top',
          data: subset,
          scenegraph: asset.url,
          getPosition: (d) => getGroundPosition(d.lng, d.lat, 4, SURFACE_LIFT_M + 0.1),
          getOrientation: (d) => [0, d.yawDeg ?? 0, 90],
          getScale: [s, s, s],
          sizeScale: 1,
          _lighting: 'pbr',
          pickable: false,
          updateTriggers: { getPosition: [terrainSyncTick, envData], getOrientation: [envData] },
        })
      );
    });
  };

  if (envCatalog.barangayHall?.url && envData.barangayHalls?.length > 0) {
    pushBuildingVariantLayers(
      'bicol-env-barangay-hall',
      [envCatalog.barangayHall],
      envData.barangayHalls,
      BUILDING_SIZE_REF.barangayHall,
      civicBuildingScale
    );
  }
  if (envCatalog.school?.url && envData.schools?.length > 0) {
    pushBuildingVariantLayers(
      'bicol-env-school',
      [envCatalog.school],
      envData.schools,
      BUILDING_SIZE_REF.school,
      civicBuildingScale
    );
  }
  if (envCatalog.policeStation?.url && envData.policeStations?.length > 0) {
    pushBuildingVariantLayers(
      'bicol-env-police-station',
      [envCatalog.policeStation],
      envData.policeStations,
      BUILDING_SIZE_REF.policeStation,
      civicBuildingScale
    );
  }
  if (envCatalog.hospital?.url && envData.hospitals?.length > 0) {
    pushBuildingVariantLayers(
      'bicol-env-hospital',
      [envCatalog.hospital],
      envData.hospitals,
      BUILDING_SIZE_REF.hospital,
      civicBuildingScale
    );
  }

  pushBuildingVariantLayers('bicol-env-shop', envCatalog.shops, envData.shops, BUILDING_SIZE_REF.shop);
  pushBuildingVariantLayers('bicol-env-house', envCatalog.houses, envData.houses, BUILDING_SIZE_REF.house);

  pushHeightScaledLayer('bicol-env-trees', envCatalog.tree, envData.trees, SURFACE_LIFT_M);

  if (Array.isArray(envCatalog.roadSigns) && envCatalog.roadSigns.length > 0 && envData.roadSigns?.length > 0) {
    const count = envCatalog.roadSigns.length;
    const byVariant = Array.from({ length: count }, () => []);
    const signTypeIndex = { stopSign: 0, pedestrianSign: 1, speedLimitSign: 2, barangaySign: 3 };
    envData.roadSigns.forEach((s, i) => {
      const vIdx = Number.isFinite(s.variantIndex)
        ? s.variantIndex
        : (signTypeIndex[s.signType] ?? i);
      byVariant[((vIdx % count) + count) % count].push(s);
    });
        byVariant.forEach((groupData, idx) => {
      const safeGroup = groupData
        .filter((d) => Number.isFinite(d?.lng) && Number.isFinite(d?.lat))
        .map((d) => ({
          ...d,
          yawDeg: Number.isFinite(d.yawDeg) ? d.yawDeg : 0,
          targetHeightM: Number.isFinite(d.targetHeightM) ? d.targetHeightM : 3.2,
        }));
      pushHeightScaledLayer(`bicol-env-road-sign-${idx}`, envCatalog.roadSigns[idx], safeGroup, SURFACE_LIFT_M + 0.05);
    });

  }

  pushHeightScaledLayer('bicol-env-traffic-lights', envCatalog.trafficLight, envData.trafficLights, SURFACE_LIFT_M + 0.05);
  pushHeightScaledLayer('bicol-env-street-lights', envCatalog.streetLight, envData.streetLights, SURFACE_LIFT_M + 0.05);
    if (streetLightFactor > 0.01) {
    // 1. High-contrast golden streetlight pools & glowing bulb heads
    if (Array.isArray(envData.streetLights) && envData.streetLights.length > 0) {
      const lampLitData = envData.streetLights.map((sl) => {
        const armBearingRad = ((90 - (sl.yawDeg || 0)) * Math.PI) / 180;
        const armReachM = 4.5;
        return {
          ...sl,
          headLng: sl.lng + (Math.sin(armBearingRad) * armReachM) / METERS_PER_DEG_LNG,
          headLat: sl.lat + (Math.cos(armBearingRad) * armReachM) / METERS_PER_DEG_LAT,
          lampZ: (sl.targetHeightM || TARGET_HEIGHT_M.streetLight) * 0.88,
        };
      });

      layers.push(
        new ScatterplotLayer({
          id: 'bicol-env-streetlight-pool-outer',
          slot: 'top',
          data: lampLitData,
          getPosition: (d) => getGroundPosition(d.headLng, d.headLat, 0, 0.18),
          getRadius: 28,
          radiusUnits: 'meters',
          filled: true,
          stroked: false,
          getFillColor: [255, 166, 58, Math.round(64 * streetLightFactor)],
          pickable: false,
          updateTriggers: {
            getPosition: [terrainSyncTick, envData],
            getFillColor: [streetLightFactor],
          },
        }),
        new ScatterplotLayer({
          id: 'bicol-env-streetlight-pool-mid',
          slot: 'top',
          data: lampLitData,
          getPosition: (d) => getGroundPosition(d.headLng, d.headLat, 0, 0.21),
          getRadius: 16,
          radiusUnits: 'meters',
          filled: true,
          stroked: false,
          getFillColor: [255, 202, 104, Math.round(115 * streetLightFactor)],
          pickable: false,
          updateTriggers: {
            getPosition: [terrainSyncTick, envData],
            getFillColor: [streetLightFactor],
          },
        }),
        new ScatterplotLayer({
          id: 'bicol-env-streetlight-pool-core',
          slot: 'top',
          data: lampLitData,
          getPosition: (d) => getGroundPosition(d.headLng, d.headLat, 0, 0.24),
          getRadius: 8.5,
          radiusUnits: 'meters',
          filled: true,
          stroked: false,
          getFillColor: [255, 238, 178, Math.round(168 * streetLightFactor)],
          pickable: false,
          updateTriggers: {
            getPosition: [terrainSyncTick, envData],
            getFillColor: [streetLightFactor],
          },
        }),
        new ScatterplotLayer({
          id: 'bicol-env-streetlight-bulb-halo',
          slot: 'top',
          data: lampLitData,
          getPosition: (d) => getGroundPosition(d.headLng, d.headLat, 0, d.lampZ),
          getRadius: 3.6,
          radiusUnits: 'meters',
          filled: true,
          stroked: false,
          getFillColor: [255, 244, 204, Math.round(245 * streetLightFactor)],
          pickable: false,
          updateTriggers: {
            getPosition: [terrainSyncTick, envData],
            getFillColor: [streetLightFactor],
          },
        })
      );
    }

    // 2. Warm interior window/porch ground spill around buildings & shops at night
    const litBuildings = (envData.buildingShadowFootprints || []).filter(
      (b) => b.archetype !== 'park_plaza'
    );
    if (litBuildings.length > 0) {
      layers.push(
        new ScatterplotLayer({
          id: 'bicol-env-night-building-warm-spill',
          slot: 'top',
          data: litBuildings,
          getPosition: (d) => getGroundPosition(d.lng, d.lat, 0, 0.16),
          getRadius: (d) => Math.max(d.halfW, d.halfD) * 1.32,
          radiusUnits: 'meters',
          filled: true,
          stroked: false,
          getFillColor: (d) =>
            d.archetype === 'shophouse_commercial'
              ? [255, 178, 72, Math.round(82 * streetLightFactor)]
              : [255, 206, 120, Math.round(64 * streetLightFactor)],
          pickable: false,
          updateTriggers: {
            getPosition: [terrainSyncTick, envData],
            getFillColor: [streetLightFactor],
          },
        })
      );
    }
  }
  pushHeightScaledLayer('bicol-env-utility-poles', envCatalog.utilityPole, envData.utilityPoles, SURFACE_LIFT_M + 0.05);
  pushHeightScaledLayer('bicol-env-benches', envCatalog.bench, envData.benches, SURFACE_LIFT_M + 0.05);
  pushHeightScaledLayer('bicol-env-bench-tables', envCatalog.benchTable, envData.benchTables, SURFACE_LIFT_M + 0.05);
  pushHeightScaledLayer('bicol-env-fire-hydrants', envCatalog.fireHydrant, envData.fireHydrants, SURFACE_LIFT_M + 0.05);
  pushHeightScaledLayer('bicol-env-dumpsters', envCatalog.dumpster, envData.dumpsters, SURFACE_LIFT_M + 0.05);

  const binsV1 = (envData.wasteBins || []).filter((b) => b.variant === 'v1');
  const binsV2 = (envData.wasteBins || []).filter((b) => b.variant === 'v2');
  pushHeightScaledLayer('bicol-env-waste-bins-v1', envCatalog.wasteBin, binsV1, SURFACE_LIFT_M + 0.05);
  pushHeightScaledLayer('bicol-env-waste-bins-v2', envCatalog.wasteBin2, binsV2, SURFACE_LIFT_M + 0.05);

  const parkedGroups = [
    ['jeepney', envCatalog.jeepney],
    ['tricycle', envCatalog.tricycle],
    ['policeCar', envCatalog.policeCar],
    ['ambulance', envCatalog.ambulance],
    ['flowerTruck', envCatalog.flowerTruck],
    ['deliveryTruck', envCatalog.deliveryTruck],
    ['car', envCatalog.car],
    ['car2', envCatalog.car2],
  ];
  for (const [typeKey, asset] of parkedGroups) {
    const subset = (envData.stationaryVehicles || []).filter((v) => v.type === typeKey);
    pushHeightScaledLayer(`bicol-env-parked-${typeKey}`, asset, subset, SURFACE_LIFT_M + 0.1);
  }

  const movingGroups = [
    ['jeepney', envCatalog.jeepney, JEEPNEY_FRONT_AXIS_OFFSET],
    ['tricycle', envCatalog.tricycle, TRICYCLE_FRONT_AXIS_OFFSET],
  ];
  for (const [typeKey, asset, frontOffset] of movingGroups) {
    if (!asset?.url) continue;
    const tracks = (envData.movingVehicleTracks || []).filter((t) => t.type === typeKey);
    if (tracks.length === 0) continue;

    const liveUnits = tracks
      .map((tr) => {
        const baseFraction = (animTime / tr.cycleSec + tr.phaseOffset) % 1;
        const progress = 0.08 + 0.84 * baseFraction;
        const sample = sampleRoutePoint(tr.path, tr.cumDist, tr.totalLenM, progress);
        if (!sample) return null;
        return {
          id: tr.id,
          lng: sample.lng,
          lat: sample.lat,
          bearingDeg: sample.bearingDeg,
          targetHeightM: tr.targetHeightM,
        };
      })
      .filter(Boolean);

    if (liveUnits.length === 0) continue;
    const scaleVal = liveUnits[0].targetHeightM / asset.bounds.spanY;

    layers.push(
      new ScenegraphLayer({
        id: `bicol-env-moving-${typeKey}`,
        slot: 'top',
        data: liveUnits,
        scenegraph: asset.url,
        getPosition: (d) => getGroundPosition(d.lng, d.lat, 4, SURFACE_LIFT_M + 0.1),
        getOrientation: (d) => [0, frontOffset - d.bearingDeg, 90],
        getScale: [scaleVal, scaleVal, scaleVal],
        sizeScale: 1,
        _lighting: 'pbr',
        pickable: false,
        updateTriggers: {
          getPosition: [terrainSyncTick, animTime],
          getOrientation: [animTime],
          
        },
      })
    );
        if (streetLightFactor > 0.05) {
      const headlightCones = [];
      for (const u of liveUnits) {
        const rad = ((u.bearingDeg || 0) * Math.PI) / 180;
        const ux = Math.sin(rad);
        const uy = Math.cos(rad);
        headlightCones.push(
          {
            lng: u.lng + (ux * 10.5) / METERS_PER_DEG_LNG,
            lat: u.lat + (uy * 10.5) / METERS_PER_DEG_LAT,
            radiusM: 6.5,
            alpha: Math.round(145 * streetLightFactor),
          },
          {
            lng: u.lng + (ux * 19.5) / METERS_PER_DEG_LNG,
            lat: u.lat + (uy * 19.5) / METERS_PER_DEG_LAT,
            radiusM: 12.0,
            alpha: Math.round(78 * streetLightFactor),
          }
        );
      }
      layers.push(
        new ScatterplotLayer({
          id: `bicol-env-headlights-${typeKey}`,
          slot: 'top',
          data: headlightCones,
          getPosition: (d) => getGroundPosition(d.lng, d.lat, 0, 0.22),
          getRadius: (d) => d.radiusM,
          radiusUnits: 'meters',
          filled: true,
          stroked: false,
          getFillColor: (d) => [255, 236, 168, d.alpha],
          pickable: false,
          updateTriggers: {
            getPosition: [terrainSyncTick, animTime],
            getFillColor: [streetLightFactor, animTime],
          },
        })
      );
    }
  }

  if (envCatalog.citizens) {
    for (const standVariant of ['standA', 'standB']) {
      const asset = envCatalog.citizens[standVariant];
      const subset = (envData.standingCitizens || []).filter((c) => c.variant === standVariant);
      pushHeightScaledLayer(`bicol-env-citizens-${standVariant}`, asset, subset, SURFACE_LIFT_M + 0.05);
    }

    const walkTracks = envData.walkingCitizenTracks || [];
    if (walkTracks.length > 0) {
      const strideFlip = Math.floor(animTime * 4.4) % 2 === 0;

      for (const [groupKey, assetKey] of [
        ['red', strideFlip ? 'walkRedA' : 'walkRedB'],
        ['blue', strideFlip ? 'walkBlueA' : 'walkBlueB'],
      ]) {
        const walkAsset = envCatalog.citizens[assetKey];
        const groupTracks = walkTracks.filter((tr) => tr.shirtGroup === groupKey);
        if (!walkAsset?.url || groupTracks.length === 0) continue;

        const liveWalkers = groupTracks
          .map((tr, idx) => {
            const baseFraction = (animTime / tr.cycleSec + tr.phaseOffset) % 1;
            const progress = 0.06 + 0.88 * baseFraction;
            const sample = sampleRoutePoint(tr.path, tr.cumDist, tr.totalLenM, progress);
            if (!sample) return null;
            return {
              id: tr.id,
              lng: sample.lng,
              lat: sample.lat,
              bearingDeg: sample.bearingDeg,
              targetHeightM: tr.targetHeightM,
              bobM: Math.abs(Math.sin(animTime * 8.8 + idx)) * 0.45,
            };
          })
          .filter(Boolean);

        if (liveWalkers.length > 0) {
          const scaleVal = liveWalkers[0].targetHeightM / walkAsset.bounds.spanY;
          layers.push(
            new ScenegraphLayer({
              id: `bicol-env-citizens-walking-${groupKey}`,
              slot: 'top',
              data: liveWalkers,
              scenegraph: walkAsset.url,
              getPosition: (d) => getGroundPosition(d.lng, d.lat, 4, SURFACE_LIFT_M + 0.05 + d.bobM),
              getOrientation: (d) => [0, 180 - d.bearingDeg, 90],
              getScale: [scaleVal, scaleVal, scaleVal],
              sizeScale: 1,
              _lighting: 'pbr',
              pickable: false,
              updateTriggers: {
                getPosition: [terrainSyncTick, animTime],
                getOrientation: [animTime],
              },
            })
          );
        }
      }
    }
  }

  return layers;
}
