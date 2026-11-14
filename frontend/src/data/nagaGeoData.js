import * as THREE from 'three';

import {
  NAGA_TERTIARY_ROADS,
  NAGA_LOCAL_STREETS,
  NAGA_TERTIARY_ROAD_METADATA,
  NAGA_LOCAL_STREET_METADATA,
} from './nagaOsmRoads.js';

import {
  NAGA_OSM_BUILDINGS,
  NAGA_BUILDING_METADATA,
} from './nagaOsmBuildings.js';

export const NAGA_CENTER = { lat: 13.6238, lng: 123.1935 };
export const GEO_SCALE = 255;
export const COS_CENTER_LAT = Math.cos((NAGA_CENTER.lat * Math.PI) / 180);
export const METERS_PER_WORLD_UNIT = 110636 / GEO_SCALE;
export const ELEVATION_WORLD_PER_METER = 0.015;
export const TERRAIN_WIDTH = 38;
export const TERRAIN_DEPTH = 30;
export const BASE_ELEVATION = 0.05;

export function geoToWorldXZ(lat, lng) {
  const x = (lng - NAGA_CENTER.lng) * GEO_SCALE * COS_CENTER_LAT;
  const z = -(lat - NAGA_CENTER.lat) * GEO_SCALE;
  return [x, z];
}

// Elevation anchor points in WGS84 calibrated to project elevation_m data (4m lowland -> 115m Pacol -> 165m Mt. Isarog foothills)
const ELEVATION_ANCHORS_RAW = [
  { lat: 13.6198, lng: 123.1792, elevM: 4.0 },   // NAGA-02 Sabang
  { lat: 13.6166, lng: 123.1842, elevM: 4.0 },   // NAGA-07 Tabuco
  { lat: 13.6105, lng: 123.1732, elevM: 5.0 },   // NAGA-06 Mabolo
  { lat: 13.6122, lng: 123.1862, elevM: 6.0 },   // NAGA-04 Triangulo
  { lat: 13.6338, lng: 123.1902, elevM: 11.0 },  // NAGA-05 Peñafrancia
  { lat: 13.6130, lng: 123.1992, elevM: 14.0 },  // NAGA-03 Concepcion Pequeña
  { lat: 13.6388, lng: 123.2322, elevM: 48.0 },  // NAGA-01 Cararayan
  { lat: 13.6468, lng: 123.2435, elevM: 115.0 }, // NAGA-08 Pacol
  { lat: 13.6535, lng: 123.2550, elevM: 155.0 }, // Mt. Isarog Foothills (Carolina)
  { lat: 13.6425, lng: 123.2580, elevM: 145.0 }, // Mt. Isarog Foothills (Panicuason)
  { lat: 13.6310, lng: 123.1565, elevM: 3.5 },   // Bicol River West Floodplain
];

const ELEVATION_ANCHORS_XZ = ELEVATION_ANCHORS_RAW.map((a) => {
  const [x, z] = geoToWorldXZ(a.lat, a.lng);
  return { x, z, elevM: a.elevM };
});

export function getUncarvedTerrainY(x, z) {
  const halfW = TERRAIN_WIDTH * 0.5;
  const halfD = TERRAIN_DEPTH * 0.5;
  const nx = Math.min(1, Math.abs(x) / (halfW * 1.15));
  const nz = Math.min(1, Math.abs(z) / (halfD * 1.15));
  const edgeX = 1 - nx * nx * (3 - 2 * nx);
  const edgeZ = 1 - nz * nz * (3 - 2 * nz);
  const boundaryEnvelope = Math.max(0, edgeX * edgeZ);

  let weightSum = 0;
  let elevSum = 0;
  for (let i = 0; i < ELEVATION_ANCHORS_XZ.length; i++) {
    const a = ELEVATION_ANCHORS_XZ[i];
    const d2 = (x - a.x) * (x - a.x) + (z - a.z) * (z - a.z) + 1.8;
    const w = 1 / (d2 * d2);
    weightSum += w;
    elevSum += w * a.elevM;
  }
  const interpElevM = weightSum > 0 ? elevSum / weightSum : 4.0;
  // Subtle Mt. Isarog volcanic ridge & crater relief on far-east foothills (x > 5.2, well east of urban core)
  const eastFactor = Math.max(0, Math.min(1, (x - 5.2) / 2.2));
  const ridgeMod =
    eastFactor > 0
      ? eastFactor * (0.045 * Math.sin(z * 1.15 + x * 0.6) + 0.032 * Math.cos(z * 2.1 - x * 0.9))
      : 0;
  return BASE_ELEVATION + (interpElevM * ELEVATION_WORLD_PER_METER + ridgeMod) * boundaryEnvelope;
}

export function getTerrainY(x, z) {
  const baseY = getUncarvedTerrainY(x, z);
  const { dist, waterHw, bankHw } = getMinRiverChannelInfoXZ(x, z);
  const outerR = bankHw * 1.12;
  if (dist < outerR) {
    // Smooth channel depression: -0.036 under river bed, rising smoothly across the bank slope to floodplain rim
    const innerR = waterHw * 0.85;
    const u = Math.max(0, Math.min(1, (dist - innerR) / (outerR - innerR)));
    const carve = (1 - u * u * (3 - 2 * u)) * 0.036;
    return baseY - carve;
  }
  return baseY;
}

export function geoToWorld(lat, lng) {
  const [x, z] = geoToWorldXZ(lat, lng);
  const y = getTerrainY(x, z);
  return [x, y, z];
}

export function worldToGeo(x, z) {
  const lat = NAGA_CENTER.lat - z / GEO_SCALE;
  const lng = NAGA_CENTER.lng + x / (GEO_SCALE * COS_CENTER_LAT);
  return [lat, lng];
}

export const RIVER_RENDER_WIDTHS = {
  nagaWater: 0.48,
  nagaBank: 0.60,
  bicolWater: 0.66,
  bicolBank: 0.80,
  nagaWaterHalfWidth: 0.24,
  nagaBankHalfWidth: 0.30,
  bicolWaterHalfWidth: 0.33,
  bicolBankHalfWidth: 0.40,
};

export const ROAD_RENDER_WIDTHS = {
  primaryAsphalt: 0.16,
  primaryCurb: 0.24,
  secondaryAsphalt: 0.11,
  secondaryCurb: 0.17,
  tertiaryAsphalt: 0.086,
  tertiaryCurb: 0.128,
  localAsphalt: 0.064,
  localCurb: 0.096,
  primaryAsphaltHalfWidth: 0.08,
  primaryCurbHalfWidth: 0.12,
  secondaryAsphaltHalfWidth: 0.055,
  secondaryCurbHalfWidth: 0.085,
  tertiaryAsphaltHalfWidth: 0.043,
  tertiaryCurbHalfWidth: 0.064,
  localAsphaltHalfWidth: 0.032,
  localCurbHalfWidth: 0.048,
};

export function calculateWaterPointWvi(point) {
  const m = point.metrics || {};
  let qualityRisk = 0.0;
  if (m.coliform_present) qualityRisk += 25.0;
  if (m.tds_ppm > 500) qualityRisk += Math.min(10.0, (m.tds_ppm - 500) / 50.0);
  if (m.ph < 6.5 || m.ph > 8.5) qualityRisk += 5.0;
  if (m.turbidity_ntu > 5.0) qualityRisk += 5.0;
  qualityRisk = Math.min(40.0, qualityRisk);

  const floodRisk = ((point.flood_risk_level || 1) / 5.0) * 25.0;
  const statusMap = { Functional: 0.0, 'Under Repair': 14.0, Abandoned: 20.0 };
  const infraRisk = statusMap[point.status] ?? 10.0;
  const popRisk = Math.min(15.0, ((point.population_served || 300) / 1000.0) * 15.0);

  const totalWvi = Math.round((qualityRisk + floodRisk + infraRisk + popRisk) * 10) / 10;
  const tier =
    totalWvi >= 65.0
      ? 'Critical'
      : totalWvi >= 35.0
      ? 'Moderate'
      : 'Safe / Compliant';

  return { wvi_score: totalWvi, risk_tier: tier };
}

export const NAGA_RIVER_COORDS = [
  [13.6720, 123.2710],
  [13.6620, 123.2550],
  [13.6545, 123.2420],
  [13.6465, 123.2285],
  [13.6398, 123.2135],
  [13.6352, 123.2022],
  [13.6312, 123.1976],
  [13.6273, 123.1919],
  [13.6240, 123.1878],
  [13.6199, 123.1850],
  [13.6156, 123.1795],
];

export const BICOL_RIVER_COORDS = [
  [13.6680, 123.1440],
  [13.6560, 123.1485],
  [13.6430, 123.1525],
  [13.6310, 123.1565],
  [13.6225, 123.1620],
  [13.6168, 123.1685],
  [13.6155, 123.1750],
  [13.6156, 123.1795],
  [13.6130, 123.1794],
  [13.6065, 123.1765],
  [13.5950, 123.1705],
  [13.5780, 123.1615],
];

export const RIVER_FLOW_METADATA = {
  naga: {
    name: 'Naga River',
    flowDirection: 'NE-to-SW (Mt. Isarog foothills toward Sabang/Tabuco confluence)',
    uvScrollSign: -1, // Coords ordered upstream -> downstream (+v)
  },
  bicol: {
    name: 'Bicol River',
    flowDirection: 'S-to-N/NW (Milaor/Mabolo past confluence toward San Miguel Bay)',
    uvScrollSign: 1, // Coords ordered NW -> S, so true downstream flow is -v
  },
};

const RIVER_CENTERLINE_SEGS_XZ = (() => {
  const segs = [];
  const rivers = [
    { coords: NAGA_RIVER_COORDS, waterHw: RIVER_RENDER_WIDTHS.nagaWaterHalfWidth, bankHw: RIVER_RENDER_WIDTHS.nagaBankHalfWidth },
    { coords: BICOL_RIVER_COORDS, waterHw: RIVER_RENDER_WIDTHS.bicolWaterHalfWidth, bankHw: RIVER_RENDER_WIDTHS.bicolBankHalfWidth },
  ];
  rivers.forEach(({ coords, waterHw, bankHw }) => {
    const pts = coords.map(([lat, lng]) => {
      const [x, z] = geoToWorldXZ(lat, lng);
      return new THREE.Vector3(x, 0, z);
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    const sampled = curve.getSpacedPoints(120);
    for (let i = 0; i < sampled.length - 1; i++) {
      segs.push([sampled[i].x, sampled[i].z, sampled[i + 1].x, sampled[i + 1].z, waterHw, bankHw]);
    }
  });
  return segs;
})();

function getMinRiverChannelInfoXZ(px, pz) {
  let bestNorm = Infinity;
  let bestDist = Infinity;
  let bestWaterHw = 0.24;
  let bestBankHw = 0.30;
  for (let i = 0; i < RIVER_CENTERLINE_SEGS_XZ.length; i++) {
    const [ax, az, bx, bz, waterHw, bankHw] = RIVER_CENTERLINE_SEGS_XZ[i];
    const vx = bx - ax;
    const vz = bz - az;
    const lenSq = vx * vx + vz * vz;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / lenSq)) : 0;
    const d = Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
    const norm = d / bankHw;
    if (norm < bestNorm) {
      bestNorm = norm;
      bestDist = d;
      bestWaterHw = waterHw;
      bestBankHw = bankHw;
    }
  }
  return { dist: bestDist, waterHw: bestWaterHw, bankHw: bestBankHw };
}

export const NAGA_ROAD_NODES = {
  CALABANGA_BNDRY: [13.6720, 123.1730],
  CAMALIGAN_BNDRY: [13.6285, 123.1635],
  MILAOR_BNDRY: [13.5780, 123.1540],
  PILI_BNDRY: [13.5780, 123.2540],
  OCOMPO_BNDRY: [13.6720, 123.2780],
  BAGUMBAYAN_FAR_N: [13.6485, 123.1795],
  BAGUMBAYAN_NORTH: [13.6415, 123.1835],
  BAGUMBAYAN_JCT: [13.6338, 123.1856],
  LIBOTON_JCT: [13.6285, 123.1862],
  CALAUAG_WEST: [13.6372, 123.1895],
  CALAUAG_JCT: [13.6365, 123.1942],
  SAN_FELIPE_JCT: [13.6430, 123.2040],
  SAN_FELIPE_NORTH: [13.6545, 123.2085],
  SAN_FELIPE_EAST: [13.6460, 123.2190],
  MAGSAYSAY_NORTH: [13.6425, 123.1965],
  PENAFRANCIA_JCT: [13.6318, 123.1942],
  MAGSAYSAY_BRIDGE_N: [13.6288, 123.1904],
  MAGSAYSAY_BRIDGE_S: [13.6258, 123.1934],
  CDRRMO_JCT: [13.6240, 123.1938],
  DAYANGDANG_JCT: [13.6272, 123.1962],
  BALATAS_CROSSING_W: [13.6330, 123.1960],
  BALATAS_CROSSING_E: [13.6294, 123.1992],
  BALATAS_JCT: [13.6322, 123.2045],
  TINAGO_JCT: [13.6234, 123.1916],
  DINAGA_JCT: [13.6232, 123.1850],
  STA_CRUZ_JCT: [13.6246, 123.1806],
  ABELLA_WEST: [13.6255, 123.1742],
  ABELLA_NORTH: [13.6365, 123.1725],
  IGUALDAD_JCT: [13.6208, 123.1812],
  SABANG_JCT: [13.6190, 123.1806],
  SABANG_WEST: [13.6188, 123.1715],
  TABUCO_BRIDGE_N: [13.6214, 123.1838],
  TABUCO_BRIDGE_S: [13.6184, 123.1862],
  LERMA_JCT: [13.6205, 123.1912],
  PANGANIBAN_EAST: [13.6170, 123.1930],
  PANGANIBAN_MID: [13.6180, 123.1895],
  TABUCO_JCT: [13.6174, 123.1868],
  TRIANGULO_JCT: [13.6148, 123.1889],
  TRIANGULO_SOUTH: [13.6045, 123.1915],
  MABOLO_BRIDGE_E: [13.6138, 123.1822],
  MABOLO_BRIDGE_W: [13.6122, 123.1766],
  MABOLO_JCT: [13.6108, 123.1745],
  MABOLO_SOUTH: [13.6050, 123.1705],
  CONCEPCION_JCT: [13.6154, 123.1972],
  CONCEPCION_SOUTH: [13.6025, 123.2035],
  CONCEPCION_GRANDE_JCT: [13.6185, 123.2065],
  DEL_ROSARIO_JCT: [13.6135, 123.2185],
  DEL_ROSARIO_SOUTH: [13.6075, 123.2285],
  CARARAYAN_LOWER: [13.6245, 123.2145],
  CARARAYAN_MID: [13.6305, 123.2250],
  CARARAYAN_JCT: [13.6368, 123.2351],
  SAN_ISIDRO_EAST: [13.6315, 123.2445],
  SAN_ISIDRO_SOUTH: [13.6165, 123.2495],
  PACOL_TURN: [13.6428, 123.2385],
  PACOL_JCT: [13.6485, 123.2410],
  CAROLINA_JCT: [13.6535, 123.2525],
  PANICUASON_EAST: [13.6425, 123.2555],
};

export const NAGA_BRIDGES = [
  { id: 'BRIDGE_TABUCO', name: 'Tabuco Bridge', river: 'Naga River', from: 'TABUCO_BRIDGE_N', to: 'TABUCO_BRIDGE_S' },
  { id: 'BRIDGE_MABOLO', name: 'Delfin Rosales Bridge', river: 'Bicol River', from: 'MABOLO_BRIDGE_E', to: 'MABOLO_BRIDGE_W' },
  { id: 'BRIDGE_MAGSAYSAY', name: 'Magsaysay Bridge', river: 'Naga River', from: 'MAGSAYSAY_BRIDGE_N', to: 'MAGSAYSAY_BRIDGE_S' },
  { id: 'BRIDGE_BALATAS', name: 'Balatas Crossing', river: 'Naga River', from: 'BALATAS_CROSSING_W', to: 'BALATAS_CROSSING_E' },
];

export const NAGA_ROAD_EDGES = [
  { id: 'E_CALA', from: 'CALABANGA_BNDRY', to: 'BAGUMBAYAN_FAR_N', coords: [NAGA_ROAD_NODES.CALABANGA_BNDRY, NAGA_ROAD_NODES.BAGUMBAYAN_FAR_N] },
  { id: 'E_CAMA', from: 'CAMALIGAN_BNDRY', to: 'ABELLA_WEST', coords: [NAGA_ROAD_NODES.CAMALIGAN_BNDRY, NAGA_ROAD_NODES.ABELLA_WEST] },
  { id: 'E_MILA', from: 'MILAOR_BNDRY', to: 'MABOLO_SOUTH', coords: [NAGA_ROAD_NODES.MILAOR_BNDRY, NAGA_ROAD_NODES.MABOLO_SOUTH] },
  { id: 'E_PILI', from: 'PILI_BNDRY', to: 'DEL_ROSARIO_SOUTH', coords: [NAGA_ROAD_NODES.PILI_BNDRY, NAGA_ROAD_NODES.DEL_ROSARIO_SOUTH] },
  { id: 'E_OCOM', from: 'OCOMPO_BNDRY', to: 'CAROLINA_JCT', coords: [NAGA_ROAD_NODES.OCOMPO_BNDRY, NAGA_ROAD_NODES.CAROLINA_JCT] },
  { id: 'R_BAG0', from: 'BAGUMBAYAN_FAR_N', to: 'BAGUMBAYAN_NORTH', coords: [NAGA_ROAD_NODES.BAGUMBAYAN_FAR_N, NAGA_ROAD_NODES.BAGUMBAYAN_NORTH] },
  { id: 'R_BAG1', from: 'BAGUMBAYAN_NORTH', to: 'BAGUMBAYAN_JCT', coords: [NAGA_ROAD_NODES.BAGUMBAYAN_NORTH, NAGA_ROAD_NODES.BAGUMBAYAN_JCT] },
  { id: 'R_BAG2', from: 'BAGUMBAYAN_JCT', to: 'LIBOTON_JCT', coords: [NAGA_ROAD_NODES.BAGUMBAYAN_JCT, NAGA_ROAD_NODES.LIBOTON_JCT] },
  { id: 'R_CAL1', from: 'BAGUMBAYAN_JCT', to: 'CALAUAG_WEST', coords: [NAGA_ROAD_NODES.BAGUMBAYAN_JCT, NAGA_ROAD_NODES.CALAUAG_WEST] },
  { id: 'R_CAL2', from: 'CALAUAG_WEST', to: 'CALAUAG_JCT', coords: [NAGA_ROAD_NODES.CALAUAG_WEST, NAGA_ROAD_NODES.CALAUAG_JCT] },
  { id: 'R_CAL3', from: 'CALAUAG_JCT', to: 'PENAFRANCIA_JCT', coords: [NAGA_ROAD_NODES.CALAUAG_JCT, NAGA_ROAD_NODES.PENAFRANCIA_JCT] },
  { id: 'R_SF1', from: 'CALAUAG_JCT', to: 'SAN_FELIPE_JCT', coords: [NAGA_ROAD_NODES.CALAUAG_JCT, [13.6373, 123.1954], NAGA_ROAD_NODES.SAN_FELIPE_JCT] },
  { id: 'R_SF_N', from: 'SAN_FELIPE_JCT', to: 'SAN_FELIPE_NORTH', coords: [NAGA_ROAD_NODES.SAN_FELIPE_JCT, NAGA_ROAD_NODES.SAN_FELIPE_NORTH] },
  { id: 'R_SF2', from: 'SAN_FELIPE_JCT', to: 'SAN_FELIPE_EAST', coords: [NAGA_ROAD_NODES.SAN_FELIPE_JCT, NAGA_ROAD_NODES.SAN_FELIPE_EAST] },
  { id: 'R_MAG1', from: 'MAGSAYSAY_NORTH', to: 'PENAFRANCIA_JCT', coords: [NAGA_ROAD_NODES.MAGSAYSAY_NORTH, [13.6373, 123.1954], NAGA_ROAD_NODES.PENAFRANCIA_JCT] },
  { id: 'R_MAG2', from: 'PENAFRANCIA_JCT', to: 'MAGSAYSAY_BRIDGE_N', coords: [NAGA_ROAD_NODES.PENAFRANCIA_JCT, NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_N] },
  { id: 'R_MAG_BR', bridgeId: 'BRIDGE_MAGSAYSAY', from: 'MAGSAYSAY_BRIDGE_N', to: 'MAGSAYSAY_BRIDGE_S', coords: [NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_N, NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_S] },
  { id: 'R_MAG3', from: 'MAGSAYSAY_BRIDGE_S', to: 'CDRRMO_JCT', coords: [NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_S, NAGA_ROAD_NODES.CDRRMO_JCT] },
  { id: 'R_CEN1', from: 'LIBOTON_JCT', to: 'DINAGA_JCT', coords: [NAGA_ROAD_NODES.LIBOTON_JCT, NAGA_ROAD_NODES.DINAGA_JCT] },
  { id: 'R_CEN2', from: 'TINAGO_JCT', to: 'MAGSAYSAY_BRIDGE_S', coords: [NAGA_ROAD_NODES.TINAGO_JCT, NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_S] },
  { id: 'R_CEN3', from: 'TINAGO_JCT', to: 'LERMA_JCT', coords: [NAGA_ROAD_NODES.TINAGO_JCT, NAGA_ROAD_NODES.LERMA_JCT] },
  { id: 'R_CEN4', from: 'DINAGA_JCT', to: 'TABUCO_BRIDGE_N', coords: [NAGA_ROAD_NODES.DINAGA_JCT, NAGA_ROAD_NODES.TABUCO_BRIDGE_N] },
  { id: 'R_CEN5', from: 'LERMA_JCT', to: 'CDRRMO_JCT', coords: [NAGA_ROAD_NODES.LERMA_JCT, NAGA_ROAD_NODES.CDRRMO_JCT] },
  { id: 'R_CEN6', from: 'LERMA_JCT', to: 'PANGANIBAN_EAST', coords: [NAGA_ROAD_NODES.LERMA_JCT, NAGA_ROAD_NODES.PANGANIBAN_EAST] },
  { id: 'R_CEN7', from: 'DINAGA_JCT', to: 'STA_CRUZ_JCT', coords: [NAGA_ROAD_NODES.DINAGA_JCT, NAGA_ROAD_NODES.STA_CRUZ_JCT] },
  { id: 'R_CEN8', from: 'STA_CRUZ_JCT', to: 'ABELLA_WEST', coords: [NAGA_ROAD_NODES.STA_CRUZ_JCT, NAGA_ROAD_NODES.ABELLA_WEST] },
  { id: 'R_ABE_N', from: 'STA_CRUZ_JCT', to: 'ABELLA_NORTH', coords: [NAGA_ROAD_NODES.STA_CRUZ_JCT, [13.6317, 123.1758], NAGA_ROAD_NODES.ABELLA_NORTH] },
  { id: 'R_IGU1', from: 'DINAGA_JCT', to: 'IGUALDAD_JCT', coords: [NAGA_ROAD_NODES.DINAGA_JCT, NAGA_ROAD_NODES.IGUALDAD_JCT] },
  { id: 'R_IGU2', from: 'IGUALDAD_JCT', to: 'SABANG_JCT', coords: [NAGA_ROAD_NODES.IGUALDAD_JCT, NAGA_ROAD_NODES.SABANG_JCT] },
  { id: 'R_SAB_W', from: 'SABANG_JCT', to: 'SABANG_WEST', coords: [NAGA_ROAD_NODES.SABANG_JCT, NAGA_ROAD_NODES.SABANG_WEST] },
  { id: 'R_TAB_BR', bridgeId: 'BRIDGE_TABUCO', from: 'TABUCO_BRIDGE_N', to: 'TABUCO_BRIDGE_S', coords: [NAGA_ROAD_NODES.TABUCO_BRIDGE_N, NAGA_ROAD_NODES.TABUCO_BRIDGE_S] },
  { id: 'R_TAB_S', from: 'TABUCO_BRIDGE_S', to: 'TABUCO_JCT', coords: [NAGA_ROAD_NODES.TABUCO_BRIDGE_S, NAGA_ROAD_NODES.TABUCO_JCT] },
  { id: 'R_TAB3', from: 'PANGANIBAN_EAST', to: 'PANGANIBAN_MID', coords: [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.PANGANIBAN_MID] },
  { id: 'R_TAB4', from: 'PANGANIBAN_MID', to: 'TABUCO_JCT', coords: [NAGA_ROAD_NODES.PANGANIBAN_MID, NAGA_ROAD_NODES.TABUCO_JCT] },
  { id: 'R_SOU1', from: 'PANGANIBAN_EAST', to: 'TRIANGULO_JCT', coords: [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.TRIANGULO_JCT] },
  { id: 'R_SOU2', from: 'TABUCO_JCT', to: 'TRIANGULO_JCT', coords: [NAGA_ROAD_NODES.TABUCO_JCT, NAGA_ROAD_NODES.TRIANGULO_JCT] },
  { id: 'R_SOU3', from: 'TRIANGULO_JCT', to: 'TRIANGULO_SOUTH', coords: [NAGA_ROAD_NODES.TRIANGULO_JCT, [13.6065, 123.1910], NAGA_ROAD_NODES.TRIANGULO_SOUTH] },
  { id: 'R_SOU4', from: 'TRIANGULO_JCT', to: 'MABOLO_BRIDGE_E', coords: [NAGA_ROAD_NODES.TRIANGULO_JCT, NAGA_ROAD_NODES.MABOLO_BRIDGE_E] },
  { id: 'R_MAB_BR', bridgeId: 'BRIDGE_MABOLO', from: 'MABOLO_BRIDGE_E', to: 'MABOLO_BRIDGE_W', coords: [NAGA_ROAD_NODES.MABOLO_BRIDGE_E, NAGA_ROAD_NODES.MABOLO_BRIDGE_W] },
  { id: 'R_SOU5', from: 'MABOLO_BRIDGE_W', to: 'MABOLO_JCT', coords: [NAGA_ROAD_NODES.MABOLO_BRIDGE_W, NAGA_ROAD_NODES.MABOLO_JCT] },
  { id: 'R_SOU6', from: 'MABOLO_JCT', to: 'MABOLO_SOUTH', coords: [NAGA_ROAD_NODES.MABOLO_JCT, NAGA_ROAD_NODES.MABOLO_SOUTH] },
  { id: 'R_BAL_W', from: 'PENAFRANCIA_JCT', to: 'BALATAS_CROSSING_W', coords: [NAGA_ROAD_NODES.PENAFRANCIA_JCT, NAGA_ROAD_NODES.BALATAS_CROSSING_W] },
  { id: 'R_BAL1', from: 'CDRRMO_JCT', to: 'DAYANGDANG_JCT', coords: [NAGA_ROAD_NODES.CDRRMO_JCT, NAGA_ROAD_NODES.DAYANGDANG_JCT] },
  { id: 'R_BAL2', from: 'DAYANGDANG_JCT', to: 'BALATAS_CROSSING_E', coords: [NAGA_ROAD_NODES.DAYANGDANG_JCT, NAGA_ROAD_NODES.BALATAS_CROSSING_E] },
  { id: 'R_BAL_BR', bridgeId: 'BRIDGE_BALATAS', from: 'BALATAS_CROSSING_W', to: 'BALATAS_CROSSING_E', coords: [NAGA_ROAD_NODES.BALATAS_CROSSING_W, NAGA_ROAD_NODES.BALATAS_CROSSING_E] },
  { id: 'R_BAL3', from: 'BALATAS_CROSSING_E', to: 'BALATAS_JCT', coords: [NAGA_ROAD_NODES.BALATAS_CROSSING_E, NAGA_ROAD_NODES.BALATAS_JCT] },
  { id: 'R_EAS1', from: 'PANGANIBAN_EAST', to: 'CONCEPCION_JCT', coords: [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.CONCEPCION_JCT] },
  { id: 'R_CON_S', from: 'CONCEPCION_JCT', to: 'CONCEPCION_SOUTH', coords: [NAGA_ROAD_NODES.CONCEPCION_JCT, [13.6083, 123.2007], NAGA_ROAD_NODES.CONCEPCION_SOUTH] },
  { id: 'R_EAS2', from: 'CONCEPCION_JCT', to: 'CONCEPCION_GRANDE_JCT', coords: [NAGA_ROAD_NODES.CONCEPCION_JCT, NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT] },
  { id: 'R_EAS3', from: 'BALATAS_JCT', to: 'CONCEPCION_GRANDE_JCT', coords: [NAGA_ROAD_NODES.BALATAS_JCT, NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT] },
  { id: 'R_EAS4', from: 'CONCEPCION_GRANDE_JCT', to: 'DEL_ROSARIO_JCT', coords: [NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT, NAGA_ROAD_NODES.DEL_ROSARIO_JCT] },
  { id: 'R_EAS5', from: 'DEL_ROSARIO_JCT', to: 'DEL_ROSARIO_SOUTH', coords: [NAGA_ROAD_NODES.DEL_ROSARIO_JCT, NAGA_ROAD_NODES.DEL_ROSARIO_SOUTH] },
  { id: 'R_EAS6', from: 'CONCEPCION_GRANDE_JCT', to: 'CARARAYAN_LOWER', coords: [NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT, NAGA_ROAD_NODES.CARARAYAN_LOWER] },
  { id: 'R_EAS7', from: 'CARARAYAN_LOWER', to: 'CARARAYAN_MID', coords: [NAGA_ROAD_NODES.CARARAYAN_LOWER, NAGA_ROAD_NODES.CARARAYAN_MID] },
  { id: 'R_EAS8', from: 'CARARAYAN_MID', to: 'CARARAYAN_JCT', coords: [NAGA_ROAD_NODES.CARARAYAN_MID, NAGA_ROAD_NODES.CARARAYAN_JCT] },
  { id: 'R_EAS9', from: 'CARARAYAN_JCT', to: 'SAN_ISIDRO_EAST', coords: [NAGA_ROAD_NODES.CARARAYAN_JCT, NAGA_ROAD_NODES.SAN_ISIDRO_EAST] },
  { id: 'R_SI_S', from: 'SAN_ISIDRO_EAST', to: 'SAN_ISIDRO_SOUTH', coords: [NAGA_ROAD_NODES.SAN_ISIDRO_EAST, NAGA_ROAD_NODES.SAN_ISIDRO_SOUTH] },
  { id: 'R_EAS10', from: 'CARARAYAN_JCT', to: 'PACOL_TURN', coords: [NAGA_ROAD_NODES.CARARAYAN_JCT, NAGA_ROAD_NODES.PACOL_TURN] },
  { id: 'R_EAS11', from: 'PACOL_TURN', to: 'PACOL_JCT', coords: [NAGA_ROAD_NODES.PACOL_TURN, NAGA_ROAD_NODES.PACOL_JCT] },
  { id: 'R_EAS12', from: 'PACOL_JCT', to: 'CAROLINA_JCT', coords: [NAGA_ROAD_NODES.PACOL_JCT, NAGA_ROAD_NODES.CAROLINA_JCT] },
  { id: 'R_PAN_E', from: 'PACOL_TURN', to: 'PANICUASON_EAST', coords: [NAGA_ROAD_NODES.PACOL_TURN, NAGA_ROAD_NODES.PANICUASON_EAST] },
];

export const NAGA_CONTINUOUS_ROAD_CORRIDORS = [
  [NAGA_ROAD_NODES.CALABANGA_BNDRY, NAGA_ROAD_NODES.BAGUMBAYAN_FAR_N, NAGA_ROAD_NODES.BAGUMBAYAN_NORTH, NAGA_ROAD_NODES.BAGUMBAYAN_JCT, NAGA_ROAD_NODES.LIBOTON_JCT, NAGA_ROAD_NODES.DINAGA_JCT, NAGA_ROAD_NODES.TABUCO_BRIDGE_N],
  [NAGA_ROAD_NODES.BAGUMBAYAN_JCT, NAGA_ROAD_NODES.CALAUAG_WEST, NAGA_ROAD_NODES.CALAUAG_JCT, NAGA_ROAD_NODES.PENAFRANCIA_JCT, NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_N],
  [NAGA_ROAD_NODES.MAGSAYSAY_NORTH, [13.6373, 123.1954], NAGA_ROAD_NODES.PENAFRANCIA_JCT],
  [NAGA_ROAD_NODES.PENAFRANCIA_JCT, NAGA_ROAD_NODES.BALATAS_CROSSING_W],
  [NAGA_ROAD_NODES.CALAUAG_JCT, [13.6373, 123.1954], NAGA_ROAD_NODES.SAN_FELIPE_JCT, NAGA_ROAD_NODES.SAN_FELIPE_EAST],
  [NAGA_ROAD_NODES.SAN_FELIPE_JCT, NAGA_ROAD_NODES.SAN_FELIPE_NORTH],
  [NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_S, NAGA_ROAD_NODES.CDRRMO_JCT, NAGA_ROAD_NODES.LERMA_JCT, NAGA_ROAD_NODES.PANGANIBAN_EAST],
  [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.PANGANIBAN_MID, NAGA_ROAD_NODES.TABUCO_JCT],
  [NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_S, NAGA_ROAD_NODES.TINAGO_JCT, NAGA_ROAD_NODES.LERMA_JCT],
  [NAGA_ROAD_NODES.CAMALIGAN_BNDRY, NAGA_ROAD_NODES.ABELLA_WEST, NAGA_ROAD_NODES.STA_CRUZ_JCT, NAGA_ROAD_NODES.DINAGA_JCT],
  [NAGA_ROAD_NODES.STA_CRUZ_JCT, [13.6317, 123.1758], NAGA_ROAD_NODES.ABELLA_NORTH],
  [NAGA_ROAD_NODES.DINAGA_JCT, NAGA_ROAD_NODES.IGUALDAD_JCT, NAGA_ROAD_NODES.SABANG_JCT, NAGA_ROAD_NODES.SABANG_WEST],
  [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.TRIANGULO_JCT, NAGA_ROAD_NODES.MABOLO_BRIDGE_E],
  [NAGA_ROAD_NODES.TABUCO_BRIDGE_S, NAGA_ROAD_NODES.TABUCO_JCT, NAGA_ROAD_NODES.TRIANGULO_JCT, [13.6065, 123.1910], NAGA_ROAD_NODES.TRIANGULO_SOUTH],
  [NAGA_ROAD_NODES.MILAOR_BNDRY, NAGA_ROAD_NODES.MABOLO_SOUTH, NAGA_ROAD_NODES.MABOLO_JCT, NAGA_ROAD_NODES.MABOLO_BRIDGE_W],
  [NAGA_ROAD_NODES.CDRRMO_JCT, NAGA_ROAD_NODES.DAYANGDANG_JCT, NAGA_ROAD_NODES.BALATAS_CROSSING_E],
  [NAGA_ROAD_NODES.BALATAS_CROSSING_E, NAGA_ROAD_NODES.BALATAS_JCT],
  [NAGA_ROAD_NODES.BALATAS_JCT, NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT],
  [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.CONCEPCION_JCT, NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT, NAGA_ROAD_NODES.DEL_ROSARIO_JCT, NAGA_ROAD_NODES.DEL_ROSARIO_SOUTH, NAGA_ROAD_NODES.PILI_BNDRY],
  [NAGA_ROAD_NODES.CONCEPCION_JCT, [13.6083, 123.2007], NAGA_ROAD_NODES.CONCEPCION_SOUTH],
  [NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT, NAGA_ROAD_NODES.CARARAYAN_LOWER, NAGA_ROAD_NODES.CARARAYAN_MID, NAGA_ROAD_NODES.CARARAYAN_JCT, NAGA_ROAD_NODES.PACOL_TURN, NAGA_ROAD_NODES.PACOL_JCT, NAGA_ROAD_NODES.CAROLINA_JCT, NAGA_ROAD_NODES.OCOMPO_BNDRY],
  [NAGA_ROAD_NODES.CARARAYAN_JCT, NAGA_ROAD_NODES.SAN_ISIDRO_EAST, NAGA_ROAD_NODES.SAN_ISIDRO_SOUTH],
  [NAGA_ROAD_NODES.PACOL_TURN, NAGA_ROAD_NODES.PANICUASON_EAST],
];

export const NAGA_SECONDARY_STREETS = [
  [[13.6285, 123.1862], [13.6280, 123.1785]],
  [[13.6280, 123.1785], [13.6246, 123.1806]],
  [[13.6338, 123.1856], [13.6345, 123.1765], [13.6317, 123.1758]],
  [[13.6317, 123.1758], [13.6255, 123.1742]],
  [[13.6415, 123.1835], [13.6410, 123.1920], [13.6365, 123.1942]],
  [[13.6485, 123.1795], [13.6475, 123.1945], [13.6430, 123.2040]],
  [[13.6272, 123.1962], [13.6225, 123.2010], [13.6154, 123.1972]],
  [[13.6322, 123.2045], [13.6285, 123.2145], [13.6245, 123.2145]],
  [[13.6065, 123.1910], [13.6083, 123.2007]],
  [[13.6083, 123.2007], [13.6085, 123.2020], [13.6111, 123.2107]],
  [[13.6111, 123.2107], [13.6135, 123.2185]],
  [[13.6185, 123.2065], [13.6111, 123.2107]],
  [[13.6111, 123.2107], [13.6080, 123.2125], [13.6075, 123.2285]],
  [[13.6245, 123.2145], [13.6205, 123.2285]],
  [[13.6205, 123.2285], [13.6135, 123.2185]],
  [[13.6305, 123.2250], [13.6240, 123.2360], [13.6165, 123.2495]],
  [[13.6234, 123.1916], [13.6208, 123.1892], [13.6184, 123.1862]],
  [[13.6288, 123.1904], [13.6320, 123.1880], [13.6338, 123.1856]],
  // Additional Naga City CBD, barangay collector & neighborhood streets
  [[13.6246, 123.1806], [13.6208, 123.1812]],
  [[13.6208, 123.1812], [13.6228, 123.1765], [13.6255, 123.1742]],
  [[13.6255, 123.1742], [13.6188, 123.1715]],
  [[13.6285, 123.1862], [13.6302, 123.1904], [13.6318, 123.1942]],
  [[13.6365, 123.1942], [13.6425, 123.1965]],
  [[13.6425, 123.1965], [13.6475, 123.1945]],
  [[13.6430, 123.2040], [13.6380, 123.2015], [13.6330, 123.1960]],
  [[13.6272, 123.1962], [13.6305, 123.2015], [13.6322, 123.2045]],
  [[13.6174, 123.1868], [13.6152, 123.1848], [13.6138, 123.1822]],
  [[13.6148, 123.1889], [13.6088, 123.1948]],
  [[13.6088, 123.1948], [13.6154, 123.1972]],
  [[13.6088, 123.1948], [13.6065, 123.1910]],
  [[13.6225, 123.2010], [13.6185, 123.2065]],
  [[13.6108, 123.1745], [13.6080, 123.1718], [13.6050, 123.1705]],
  [[13.6535, 123.2525], [13.6475, 123.2540], [13.6425, 123.2555]],
  // Phase 4: Missing barangay & local collector streets completing network connectivity
  [[13.6365, 123.1725], [13.6395, 123.1775], [13.6415, 123.1835]], // Abella North -> Bagumbayan North
  [[13.6255, 123.1742], [13.6285, 123.1700], [13.6365, 123.1725]], // Abella West -> Abella North perimeter street
  [[13.6545, 123.2085], [13.6515, 123.2145], [13.6460, 123.2190]], // San Felipe North -> San Felipe East barangay loop
  [[13.6372, 123.1895], [13.6425, 123.1965]],                       // Calauag West -> Magsaysay North collector
  [[13.6045, 123.1915], [13.6035, 123.1975], [13.6025, 123.2035]], // Triangulo South -> Concepcion South connector
  [[13.6025, 123.2035], [13.6050, 123.2110], [13.6075, 123.2285]], // Concepcion South -> Del Rosario South local road
];

export const NAGA_ROADS_COORDS = NAGA_CONTINUOUS_ROAD_CORRIDORS;
export {
  NAGA_TERTIARY_ROADS,
  NAGA_LOCAL_STREETS,
  NAGA_TERTIARY_ROAD_METADATA,
  NAGA_LOCAL_STREET_METADATA,
};

export const POINT_ROAD_NODE_MAP = {
  'NAGA-01': 'CARARAYAN_JCT',
  'NAGA-02': 'SABANG_JCT',
  'NAGA-03': 'CONCEPCION_JCT',
  'NAGA-04': 'TRIANGULO_JCT',
  'NAGA-05': 'PENAFRANCIA_JCT',
  'NAGA-06': 'MABOLO_JCT',
  'NAGA-07': 'TABUCO_JCT',
  'NAGA-08': 'PACOL_JCT',
};

export function getShortestRoadRouteCoords(pointId) {
  const startNode = 'CDRRMO_JCT';
  const endNode = POINT_ROAD_NODE_MAP[pointId];
  if (!endNode || startNode === endNode) return [NAGA_ROAD_NODES.CDRRMO_JCT];

  const adj = {};
  Object.keys(NAGA_ROAD_NODES).forEach((k) => (adj[k] = []));

  NAGA_ROAD_EDGES.forEach((edge) => {
    const [ax, , az] = geoToWorld(...NAGA_ROAD_NODES[edge.from]);
    const [bx, , bz] = geoToWorld(...NAGA_ROAD_NODES[edge.to]);
    const dist = Math.hypot(bx - ax, bz - az);
    adj[edge.from].push({ to: edge.to, weight: dist, coords: edge.coords });
    adj[edge.to].push({ to: edge.from, weight: dist, coords: [...edge.coords].reverse() });
  });

  const distMap = {};
  const prevEdge = {};
  const visited = new Set();
  Object.keys(NAGA_ROAD_NODES).forEach((k) => (distMap[k] = Infinity));
  distMap[startNode] = 0;

  while (visited.size < Object.keys(NAGA_ROAD_NODES).length) {
    let u = null;
    let best = Infinity;
    for (const k of Object.keys(distMap)) {
      if (!visited.has(k) && distMap[k] < best) {
        best = distMap[k];
        u = k;
      }
    }
    if (!u || u === endNode) break;
    visited.add(u);

    for (const neighbor of adj[u]) {
      if (visited.has(neighbor.to)) continue;
      const alt = distMap[u] + neighbor.weight;
      if (alt < distMap[neighbor.to]) {
        distMap[neighbor.to] = alt;
        prevEdge[neighbor.to] = { from: u, coords: neighbor.coords };
      }
    }
  }

  const edgeChain = [];
  let curr = endNode;
  while (prevEdge[curr]) {
    edgeChain.unshift(prevEdge[curr].coords);
    curr = prevEdge[curr].from;
  }

  const routeCoords = [];
  edgeChain.forEach((coords, idx) => {
    coords.forEach((pt, ptIdx) => {
      if (idx > 0 && ptIdx === 0) return;
      routeCoords.push(pt);
    });
  });

  return routeCoords.length >= 2 ? routeCoords : [NAGA_ROAD_NODES.CDRRMO_JCT, NAGA_ROAD_NODES[endNode]];
}

export const NAGA_BARANGAYS_GEOJSON = {
  type: 'FeatureCollection',
  crs: { type: 'name', properties: { name: 'EPSG:4326' } },
  features: [
    { type: 'Feature', properties: { id: 'BRGY-01', name: 'Abella', labelLat: 13.6285, labelLng: 123.1735 }, geometry: { type: 'Polygon', coordinates: [[[13.6380, 123.1660], [13.6380, 123.1795], [13.6238, 123.1795], [13.6238, 123.1660], [13.6380, 123.1660]]] } },
    { type: 'Feature', properties: { id: 'BRGY-13', name: 'Igualdad', labelLat: 13.6222, labelLng: 123.1792 }, geometry: { type: 'Polygon', coordinates: [[[13.6238, 123.1755], [13.6238, 123.1822], [13.6198, 123.1822], [13.6198, 123.1755], [13.6238, 123.1755]]] } },
    { type: 'Feature', properties: { id: 'BRGY-20', name: 'Sabang', labelLat: 13.6152, labelLng: 123.1745 }, geometry: { type: 'Polygon', coordinates: [[[13.6202, 123.1680], [13.6202, 123.1835], [13.6142, 123.1835], [13.6142, 123.1680], [13.6202, 123.1680]]] } },
    { type: 'Feature', properties: { id: 'BRGY-16', name: 'Mabolo', labelLat: 13.6065, labelLng: 123.1745 }, geometry: { type: 'Polygon', coordinates: [[[13.6142, 123.1660], [13.6142, 123.1835], [13.6020, 123.1835], [13.6020, 123.1660], [13.6142, 123.1660]]] } },
    { type: 'Feature', properties: { id: 'BRGY-24', name: 'Sta. Cruz', labelLat: 13.6272, labelLng: 123.1824 }, geometry: { type: 'Polygon', coordinates: [[[13.6305, 123.1795], [13.6305, 123.1852], [13.6238, 123.1852], [13.6238, 123.1795], [13.6305, 123.1795]]] } },
    { type: 'Feature', properties: { id: 'BRGY-12', name: 'Dinaga', labelLat: 13.6220, labelLng: 123.1838 }, geometry: { type: 'Polygon', coordinates: [[[13.6238, 123.1822], [13.6238, 123.1862], [13.6202, 123.1862], [13.6202, 123.1822], [13.6238, 123.1822]]] } },
    { type: 'Feature', properties: { id: 'BRGY-22', name: 'San Francisco', labelLat: 13.6226, labelLng: 123.1878 }, geometry: { type: 'Polygon', coordinates: [[[13.6252, 123.1862], [13.6252, 123.1895], [13.6202, 123.1895], [13.6202, 123.1862], [13.6252, 123.1862]]] } },
    { type: 'Feature', properties: { id: 'BRGY-25', name: 'Tabuco', labelLat: 13.6162, labelLng: 123.1852 }, geometry: { type: 'Polygon', coordinates: [[[13.6202, 123.1835], [13.6202, 123.1882], [13.6152, 123.1882], [13.6152, 123.1835], [13.6202, 123.1835]]] } },
    { type: 'Feature', properties: { id: 'BRGY-27', name: 'Triangulo', labelLat: 13.6095, labelLng: 123.1895 }, geometry: { type: 'Polygon', coordinates: [[[13.6168, 123.1882], [13.6168, 123.1945], [13.6020, 123.1945], [13.6020, 123.1835], [13.6152, 123.1835], [13.6152, 123.1882], [13.6168, 123.1882]]] } },
    { type: 'Feature', properties: { id: 'BRGY-14', name: 'Lerma', labelLat: 13.6192, labelLng: 123.1912 }, geometry: { type: 'Polygon', coordinates: [[[13.6218, 123.1895], [13.6218, 123.1945], [13.6168, 123.1945], [13.6168, 123.1882], [13.6202, 123.1882], [13.6202, 123.1895], [13.6218, 123.1895]]] } },
    { type: 'Feature', properties: { id: 'BRGY-26', name: 'Tinago', labelLat: 13.6258, labelLng: 123.1904 }, geometry: { type: 'Polygon', coordinates: [[[13.6278, 123.1895], [13.6278, 123.1932], [13.6218, 123.1932], [13.6218, 123.1895], [13.6278, 123.1895]]] } },
    { type: 'Feature', properties: { id: 'BRGY-02', name: 'Bagumbayan Norte', labelLat: 13.6425, labelLng: 123.1832 }, geometry: { type: 'Polygon', coordinates: [[[13.6505, 123.1775], [13.6505, 123.1892], [13.6362, 123.1892], [13.6362, 123.1775], [13.6505, 123.1775]]] } },
    { type: 'Feature', properties: { id: 'BRGY-03', name: 'Bagumbayan Sur', labelLat: 13.6334, labelLng: 123.1842 }, geometry: { type: 'Polygon', coordinates: [[[13.6362, 123.1795], [13.6362, 123.1882], [13.6305, 123.1882], [13.6305, 123.1795], [13.6362, 123.1795]]] } },
    { type: 'Feature', properties: { id: 'BRGY-15', name: 'Liboton', labelLat: 13.6282, labelLng: 123.1874 }, geometry: { type: 'Polygon', coordinates: [[[13.6305, 123.1852], [13.6305, 123.1895], [13.6252, 123.1895], [13.6252, 123.1852], [13.6305, 123.1852]]] } },
    { type: 'Feature', properties: { id: 'BRGY-05', name: 'Calauag', labelLat: 13.6398, labelLng: 123.1932 }, geometry: { type: 'Polygon', coordinates: [[[13.6475, 123.1892], [13.6475, 123.1982], [13.6352, 123.1982], [13.6352, 123.1882], [13.6362, 123.1882], [13.6362, 123.1892], [13.6475, 123.1892]]] } },
    { type: 'Feature', properties: { id: 'BRGY-19', name: 'Peñafrancia', labelLat: 13.6304, labelLng: 123.1934 }, geometry: { type: 'Polygon', coordinates: [[[13.6352, 123.1882], [13.6352, 123.1965], [13.6278, 123.1965], [13.6278, 123.1895], [13.6305, 123.1895], [13.6305, 123.1882], [13.6352, 123.1882]]] } },
    { type: 'Feature', properties: { id: 'BRGY-10', name: 'Dayangdang', labelLat: 13.6268, labelLng: 123.1972 }, geometry: { type: 'Polygon', coordinates: [[[13.6278, 123.1932], [13.6278, 123.1995], [13.6218, 123.1995], [13.6218, 123.1932], [13.6278, 123.1932]]] } },
    { type: 'Feature', properties: { id: 'BRGY-04', name: 'Balatas', labelLat: 13.6335, labelLng: 123.2055 }, geometry: { type: 'Polygon', coordinates: [[[13.6375, 123.1965], [13.6375, 123.2135], [13.6245, 123.2135], [13.6245, 123.1995], [13.6278, 123.1995], [13.6278, 123.1965], [13.6375, 123.1965]]] } },
    { type: 'Feature', properties: { id: 'BRGY-21', name: 'San Felipe', labelLat: 13.6458, labelLng: 123.2085 }, geometry: { type: 'Polygon', coordinates: [[[13.6545, 123.1982], [13.6545, 123.2215], [13.6375, 123.2215], [13.6375, 123.1965], [13.6352, 123.1965], [13.6352, 123.1982], [13.6545, 123.1982]]] } },
    { type: 'Feature', properties: { id: 'BRGY-09', name: 'Concepcion Pequeña', labelLat: 13.6168, labelLng: 123.1992 }, geometry: { type: 'Polygon', coordinates: [[[13.6218, 123.1945], [13.6245, 123.1995], [13.6245, 123.2035], [13.6035, 123.2035], [13.6035, 123.1945], [13.6218, 123.1945]]] } },
    { type: 'Feature', properties: { id: 'BRGY-08', name: 'Concepcion Grande', labelLat: 13.6185, labelLng: 123.2095 }, geometry: { type: 'Polygon', coordinates: [[[13.6245, 123.2035], [13.6245, 123.2155], [13.6055, 123.2155], [13.6055, 123.2035], [13.6245, 123.2035]]] } },
    { type: 'Feature', properties: { id: 'BRGY-11', name: 'Del Rosario', labelLat: 13.6115, labelLng: 123.2235 }, geometry: { type: 'Polygon', coordinates: [[[13.6215, 123.2155], [13.6215, 123.2355], [13.6035, 123.2355], [13.6035, 123.2155], [13.6215, 123.2155]]] } },
    { type: 'Feature', properties: { id: 'BRGY-06', name: 'Cararayan', labelLat: 13.6328, labelLng: 123.2255 }, geometry: { type: 'Polygon', coordinates: [[[13.6405, 123.2135], [13.6405, 123.2365], [13.6215, 123.2365], [13.6215, 123.2155], [13.6245, 123.2155], [13.6245, 123.2135], [13.6405, 123.2135]]] } },
    { type: 'Feature', properties: { id: 'BRGY-23', name: 'San Isidro', labelLat: 13.6265, labelLng: 123.2445 }, geometry: { type: 'Polygon', coordinates: [[[13.6385, 123.2365], [13.6385, 123.2545], [13.6155, 123.2545], [13.6155, 123.2365], [13.6385, 123.2365]]] } },
    { type: 'Feature', properties: { id: 'BRGY-17', name: 'Pacol', labelLat: 13.6465, labelLng: 123.2335 }, geometry: { type: 'Polygon', coordinates: [[[13.6555, 123.2215], [13.6555, 123.2442], [13.6385, 123.2442], [13.6385, 123.2365], [13.6405, 123.2365], [13.6405, 123.2215], [13.6555, 123.2215]]] } },
    { type: 'Feature', properties: { id: 'BRGY-07', name: 'Carolina', labelLat: 13.6518, labelLng: 123.2485 }, geometry: { type: 'Polygon', coordinates: [[[13.6565, 123.2442], [13.6565, 123.2555], [13.6465, 123.2555], [13.6465, 123.2442], [13.6565, 123.2442]]] } },
    { type: 'Feature', properties: { id: 'BRGY-18', name: 'Panicuason', labelLat: 13.6425, labelLng: 123.2495 }, geometry: { type: 'Polygon', coordinates: [[[13.6465, 123.2442], [13.6465, 123.2555], [13.6385, 123.2555], [13.6385, 123.2442], [13.6465, 123.2442]]] } },
  ],
};

export const BARANGAY_BOUNDARIES = NAGA_BARANGAYS_GEOJSON.features.map(
  (f) => f.geometry.coordinates[0]
);

export const NAGA_BARANGAY_DISTRICTS = NAGA_BARANGAYS_GEOJSON.features.map((f) => ({
  id: f.properties.id,
  name: f.properties.name,
  lat: f.properties.labelLat,
  lng: f.properties.labelLng,
}));

export const NAGA_LANDMARKS = [
  {
    id: 'OSM-WAY-CATHEDRAL',
    type: 'cathedral',
    name: 'Naga Metropolitan Cathedral',
    lat: 13.6262,
    lng: 123.1828,
    w: 0.48,
    d: 0.62,
    h: 0.64,
    rot: 0.15,
    dataSource: 'verified_gis',
    footprintShape: 'rect',
    parcelPolygon: [[-0.24, -0.31], [0.24, -0.31], [0.24, 0.31], [-0.24, 0.31]],
    osmTags: { building: 'cathedral', 'building:levels': 4, 'roof:shape': 'gabled', source: 'Verified GIS Landmark Footprint' },
  },
  {
    id: 'OSM-WAY-BASILICA',
    type: 'basilica',
    name: 'Basilica Minore de Peñafrancia',
    lat: 13.6350,
    lng: 123.1924,
    w: 0.48,
    d: 0.58,
    h: 0.68,
    rot: -0.05,
    dataSource: 'verified_gis',
    footprintShape: 'rect',
    parcelPolygon: [[-0.24, -0.29], [0.24, -0.29], [0.24, 0.29], [-0.24, 0.29]],
    osmTags: { building: 'church', 'building:levels': 4, 'roof:shape': 'gabled', source: 'Verified GIS Landmark Footprint' },
  },
  {
    id: 'OSM-WAY-SMNAGA',
    type: 'mall',
    name: 'SM City Naga Commercial Complex',
    lat: 13.6135,
    lng: 123.1932,
    w: 0.72,
    d: 0.50,
    h: 0.36,
    rot: 0.04,
    dataSource: 'verified_gis',
    footprintShape: 'rect',
    parcelPolygon: [[-0.36, -0.25], [0.36, -0.25], [0.36, 0.25], [-0.36, 0.25]],
    osmTags: { building: 'retail', 'building:levels': 3, 'roof:shape': 'flat', source: 'Verified GIS Landmark Footprint' },
  },
  {
    id: 'OSM-WAY-CITYHALL',
    type: 'hall',
    name: 'Naga City Hall Civic Complex',
    lat: 13.6194,
    lng: 123.1948,
    w: 0.54,
    d: 0.40,
    h: 0.42,
    rot: -0.1,
    dataSource: 'verified_gis',
    footprintShape: 'rect',
    parcelPolygon: [[-0.27, -0.20], [0.27, -0.20], [0.27, 0.20], [-0.27, 0.20]],
    osmTags: { building: 'civic', 'building:levels': 3, 'roof:shape': 'hipped', source: 'Verified GIS Landmark Footprint' },
  },
  {
    id: 'OSM-WAY-UNIVERSITY',
    type: 'university',
    name: 'Ateneo de Naga Main Campus',
    lat: 13.6312,
    lng: 123.1835,
    w: 0.58,
    d: 0.44,
    h: 0.48,
    rot: 0.25,
    dataSource: 'verified_gis',
    footprintShape: 'rect',
    parcelPolygon: [[-0.29, -0.22], [0.29, -0.22], [0.29, 0.22], [-0.29, 0.22]],
    osmTags: { building: 'university', 'building:levels': 4, 'roof:shape': 'hipped', source: 'Verified GIS Landmark Footprint' },
  },
];

// Phase 6D: Curated Conceptual Urban Plazas, Riverfront Promenades & Arterial Waiting Sheds
// Distinctly labeled as conceptual_urban_design (not verified real-world landmarks)
export const NAGA_URBAN_ENVIRONMENT_FEATURES = [
  {
    id: 'ENV-PLAZA-CENTRO',
    kind: 'civic_plaza',
    style: 'fountain_plaza',
    name: 'Centro Community Fountain Plaza',
    lat: 13.6195,
    lng: 123.1900,
    w: 0.34,
    d: 0.30,
    rot: 0.12,
    dataSource: 'conceptual_urban_design',
  },
  {
    id: 'ENV-PLAZA-STACRUZ',
    kind: 'civic_plaza',
    style: 'pergola_garden',
    name: 'Sta. Cruz Shaded Pocket Park',
    lat: 13.6300,
    lng: 123.1810,
    w: 0.30,
    d: 0.26,
    rot: 0.25,
    dataSource: 'conceptual_urban_design',
  },
  {
    id: 'ENV-ESPLANADE-TINAGO',
    kind: 'riverfront_promenade',
    name: 'Tinago Riverfront Promenade',
    lat: 13.6239,
    lng: 123.1903,
    w: 0.32,
    d: 0.14,
    rot: -0.879,
    dataSource: 'conceptual_urban_design',
  },
  {
    id: 'ENV-ESPLANADE-DAYANGDANG',
    kind: 'riverfront_promenade',
    name: 'Dayangdang Riverbank Terrace',
    lat: 13.6273,
    lng: 123.1949,
    w: 0.32,
    d: 0.14,
    rot: -0.957,
    dataSource: 'conceptual_urban_design',
  },
  {
    id: 'ENV-SHED-BAGUMBAYAN',
    kind: 'waiting_shelter',
    name: 'Bagumbayan Waiting Shed',
    lat: 13.6464,
    lng: 123.1799,
    w: 0.11,
    d: 0.055,
    rot: 2.078,
    dataSource: 'conceptual_urban_design',
  },
  {
    id: 'ENV-SHED-MAGSAYSAY',
    kind: 'waiting_shelter',
    name: 'Magsaysay Ave Waiting Shed',
    lat: 13.63186,
    lng: 123.19554,
    w: 0.11,
    d: 0.055,
    rot: 3.743,
    dataSource: 'conceptual_urban_design',
  },
  {
    id: 'ENV-SHED-PANGANIBAN',
    kind: 'waiting_shelter',
    name: 'Panganiban Waiting Shed',
    lat: 13.6183,
    lng: 123.1880,
    w: 0.11,
    d: 0.055,
    rot: 0.225,
    dataSource: 'conceptual_urban_design',
  },
  {
    id: 'ENV-SHED-CONCEPCION',
    kind: 'waiting_shelter',
    name: 'Concepcion Waiting Shed',
    lat: 13.6139,
    lng: 123.1987,
    w: 0.11,
    d: 0.055,
    rot: -1.124,
    dataSource: 'conceptual_urban_design',
  },
];

export const CDRRMO_HUB = { lat: 13.6226, lng: 123.1965 };

export const INITIAL_NAGA_POINTS = [
  {
    id: 'NAGA-01',
    name: 'Sitio Cararayan Shallow Well #2',
    barangay: 'Cararayan',
    lat: 13.6388,
    lng: 123.2322,
    elevation_m: 48,
    source_type: 'Handpump',
    status: 'Functional',
    flood_risk_level: 2,
    population_served: 320,
    metrics: { ph: 7.1, tds_ppm: 240.0, turbidity_ntu: 1.8, coliform_present: false },
    wvi_score: 14.8,
    risk_tier: 'Safe / Compliant',
    last_updated: '2026-11-12T08:00:00Z',
    data_provenance: 'Simulated Baseline',
    history: [
      { id: 'INSP-101', recorded_at: '2026-11-12 08:00', unit: 'LGU Field Unit #01', status: 'Functional', wvi: 14.8, note: 'Clear discharge; concrete apron drainage intact.' },
    ],
    route_waypoints: getShortestRoadRouteCoords('NAGA-01'),
  },
  {
    id: 'NAGA-02',
    name: 'Sabang Riverside Public Kiosk',
    barangay: 'Sabang',
    lat: 13.6198,
    lng: 123.1792,
    elevation_m: 4,
    source_type: 'Public Kiosk',
    status: 'Under Repair',
    flood_risk_level: 5,
    population_served: 850,
    metrics: { ph: 6.4, tds_ppm: 610.0, turbidity_ntu: 7.2, coliform_present: true },
    wvi_score: 89.0,
    risk_tier: 'Critical',
    last_updated: '2026-11-12T14:30:00Z',
    data_provenance: 'Simulated Baseline',
    history: [
      { id: 'INSP-102', recorded_at: '2026-11-12 14:30', unit: 'LGU Field Unit #02', status: 'Under Repair', wvi: 89.0, note: 'Tidal backflow intrusion near Bicol River; positive coliform test.' },
    ],
    route_waypoints: getShortestRoadRouteCoords('NAGA-02'),
  },
  {
    id: 'NAGA-03',
    name: 'Concepcion Pequeña Filtration Station',
    barangay: 'Concepcion Pequeña',
    lat: 13.6130,
    lng: 123.1992,
    elevation_m: 14,
    source_type: 'School Filtration',
    status: 'Functional',
    flood_risk_level: 3,
    population_served: 640,
    metrics: { ph: 7.3, tds_ppm: 185.0, turbidity_ntu: 0.9, coliform_present: false },
    wvi_score: 24.6,
    risk_tier: 'Safe / Compliant',
    last_updated: '2026-11-12T07:15:00Z',
    data_provenance: 'Simulated Baseline',
    history: [
      { id: 'INSP-103', recorded_at: '2026-11-12 07:15', unit: 'Municipal WASH Unit', status: 'Functional', wvi: 24.6, note: 'Dual-media filter pressure nominal; UV disinfection active.' },
    ],
    route_waypoints: getShortestRoadRouteCoords('NAGA-03'),
  },
  {
    id: 'NAGA-04',
    name: 'Triangulo Zone 4 Communal Pump',
    barangay: 'Triangulo',
    lat: 13.6122,
    lng: 123.1862,
    elevation_m: 6,
    source_type: 'Handpump',
    status: 'Functional',
    flood_risk_level: 4,
    population_served: 510,
    metrics: { ph: 6.8, tds_ppm: 430.0, turbidity_ntu: 4.1, coliform_present: false },
    wvi_score: 27.6,
    risk_tier: 'Safe / Compliant',
    last_updated: '2026-11-11T16:45:00Z',
    data_provenance: 'Simulated Baseline',
    history: [
      { id: 'INSP-104', recorded_at: '2026-11-11 16:45', unit: 'LGU Field Unit #03', status: 'Functional', wvi: 27.6, note: 'Slightly elevated TDS after rain; within potable threshold.' },
    ],
    route_waypoints: getShortestRoadRouteCoords('NAGA-04'),
  },
  {
    id: 'NAGA-05',
    name: 'Peñafrancia Community Refill Kiosk',
    barangay: 'Peñafrancia',
    lat: 13.6338,
    lng: 123.1902,
    elevation_m: 11,
    source_type: 'Public Kiosk',
    status: 'Functional',
    flood_risk_level: 3,
    population_served: 720,
    metrics: { ph: 7.2, tds_ppm: 210.0, turbidity_ntu: 1.2, coliform_present: false },
    wvi_score: 25.8,
    risk_tier: 'Safe / Compliant',
    last_updated: '2026-11-12T06:50:00Z',
    data_provenance: 'Simulated Baseline',
    history: [
      { id: 'INSP-105', recorded_at: '2026-11-12 06:50', unit: 'LGU Field Unit #01', status: 'Functional', wvi: 25.8, note: 'Residual chlorine verified at 0.4 mg/L.' },
    ],
    route_waypoints: getShortestRoadRouteCoords('NAGA-05'),
  },
  {
    id: 'NAGA-06',
    name: 'Mabolo Riverbank Shallow Well',
    barangay: 'Mabolo',
    lat: 13.6105,
    lng: 123.1732,
    elevation_m: 5,
    source_type: 'Handpump',
    status: 'Under Repair',
    flood_risk_level: 5,
    population_served: 590,
    metrics: { ph: 6.6, tds_ppm: 540.0, turbidity_ntu: 5.8, coliform_present: false },
    wvi_score: 53.6,
    risk_tier: 'Moderate',
    last_updated: '2026-11-11T17:10:00Z',
    data_provenance: 'Simulated Baseline',
    history: [
      { id: 'INSP-106', recorded_at: '2026-11-11 17:10', unit: 'LGU Field Unit #02', status: 'Under Repair', wvi: 53.6, note: 'Boil-water advisory issued due to elevated turbidity.' },
    ],
    route_waypoints: getShortestRoadRouteCoords('NAGA-06'),
  },
  {
    id: 'NAGA-07',
    name: 'Tabuco Public Water Stand',
    barangay: 'Tabuco',
    lat: 13.6166,
    lng: 123.1842,
    elevation_m: 4,
    source_type: 'Public Kiosk',
    status: 'Abandoned',
    flood_risk_level: 5,
    population_served: 910,
    metrics: { ph: 6.3, tds_ppm: 690.0, turbidity_ntu: 8.4, coliform_present: true },
    wvi_score: 97.5,
    risk_tier: 'Critical',
    last_updated: '2026-11-12T11:20:00Z',
    data_provenance: 'Simulated Baseline',
    history: [
      { id: 'INSP-107', recorded_at: '2026-11-12 11:20', unit: 'Municipal WASH Unit', status: 'Abandoned', wvi: 97.5, note: 'Foot valve seal damaged during flood surge; tanker rationing active.' },
    ],
    route_waypoints: getShortestRoadRouteCoords('NAGA-07'),
  },
  {
    id: 'NAGA-08',
    name: 'Mt. Isarog Upland Gravity Spring Box',
    barangay: 'Pacol',
    lat: 13.6468,
    lng: 123.2435,
    elevation_m: 115,
    source_type: 'Communal Spring',
    status: 'Functional',
    flood_risk_level: 1,
    population_served: 410,
    metrics: { ph: 7.4, tds_ppm: 125.0, turbidity_ntu: 0.6, coliform_present: false },
    wvi_score: 11.1,
    risk_tier: 'Safe / Compliant',
    last_updated: '2026-11-12T08:10:00Z',
    data_provenance: 'Simulated Baseline',
    history: [
      { id: 'INSP-108', recorded_at: '2026-11-12 08:10', unit: 'LGU Field Unit #03', status: 'Functional', wvi: 11.1, note: 'High-elevation spring intake clear; zero sediment.' },
    ],
    route_waypoints: getShortestRoadRouteCoords('NAGA-08'),
  },
];

export const INITIAL_INCIDENT_REPORTS = [
  {
    id: 'REP-2026-01',
    point_id: 'NAGA-02',
    barangay: 'Sabang',
    reporter_role: 'Community User',
    issue_type: 'Turbid / Discolored Water',
    description: 'Water from the riverside kiosk turned brownish after high tide.',
    status: 'Tanker Dispatched',
    submitted_at: '2026-11-12 09:15',
  },
  {
    id: 'REP-2026-02',
    point_id: 'NAGA-06',
    barangay: 'Mabolo',
    reporter_role: 'Community User',
    issue_type: 'Low Pressure / Loose Lever',
    description: 'Handpump lever pin is loose and discharge has slight silt.',
    status: 'Under LGU Review',
    submitted_at: '2026-11-12 13:40',
  },
];

export const ROLE_DEFINITIONS = [
  {
    role: 'COMMUNITY',
    label: 'Community User',
    organization: 'Public Water Access Portal',
    requiresCredentials: false,
    defaultCode: '',
    permissions: ['view_public_map', 'submit_incident', 'track_reports'],
    description: 'View public water point safety, filter nearby potable stations, and submit or track community water incident reports.',
  },
  {
    role: 'LGU_PERSONNEL',
    label: 'LGU Personnel',
    organization: 'Municipal WASH & Disaster Response Unit',
    requiresCredentials: true,
    defaultCode: 'LGU-NAGA-2026',
    permissions: ['view_public_map', 'submit_incident', 'track_reports', 'log_field_inspection', 'manage_tanker_dispatch', 'update_report_status'],
    description: 'Access operational GIS telemetry, log water quality field inspections, and coordinate water tanker dispatches.',
  },
  {
    role: 'ADMIN',
    label: 'Administrator',
    organization: 'System Governance & Data Quality',
    requiresCredentials: true,
    defaultCode: 'ADMIN-GIS-2026',
    permissions: ['view_public_map', 'submit_incident', 'track_reports', 'log_field_inspection', 'manage_tanker_dispatch', 'update_report_status', 'manage_roles_and_records'],
    description: 'Manage role permissions, audit system-wide water records, and oversee data provenance.',
  },
];

function distToSegmentXZ(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq)) : 0;
  return Math.hypot(px - (ax + t * vx), pz - (az + t * vz));
}

const SAMPLED_RIVER_SEGMENTS = (() => {
  const segs = [];
  [
    { coords: NAGA_RIVER_COORDS, bankHalfWidth: RIVER_RENDER_WIDTHS.nagaBankHalfWidth },
    { coords: BICOL_RIVER_COORDS, bankHalfWidth: RIVER_RENDER_WIDTHS.bicolBankHalfWidth },
  ].forEach(({ coords, bankHalfWidth }) => {
    const pts = coords.map(([lat, lng]) => {
      const [x, y, z] = geoToWorld(lat, lng);
      return new THREE.Vector3(x, y, z);
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    const sampled = curve.getSpacedPoints(160);
    for (let i = 0; i < sampled.length - 1; i++) {
      segs.push({
        ax: sampled[i].x,
        az: sampled[i].z,
        bx: sampled[i + 1].x,
        bz: sampled[i + 1].z,
        bankHalfWidth,
      });
    }
  });
  return segs;
})();

const ALL_ROAD_POLYLINES = [
  ...NAGA_ROADS_COORDS.map((coords) => ({ coords, halfWidth: ROAD_RENDER_WIDTHS.primaryCurbHalfWidth })),
  ...NAGA_SECONDARY_STREETS.map((coords) => ({ coords, halfWidth: ROAD_RENDER_WIDTHS.secondaryCurbHalfWidth })),
  ...NAGA_TERTIARY_ROADS.map((coords) => ({ coords, halfWidth: ROAD_RENDER_WIDTHS.tertiaryCurbHalfWidth })),
  ...NAGA_LOCAL_STREETS.map((coords) => ({ coords, halfWidth: ROAD_RENDER_WIDTHS.localCurbHalfWidth })),
];

const ROAD_GRID_CELL = 0.6;
const ALL_ROAD_SEGMENTS_XZ = [];
const ROAD_SEG_GRID = new Map();
ALL_ROAD_POLYLINES.forEach((poly) => {
  for (let i = 0; i < poly.coords.length - 1; i++) {
    const [ax, , az] = geoToWorld(...poly.coords[i]);
    const [bx, , bz] = geoToWorld(...poly.coords[i + 1]);
    const idx = ALL_ROAD_SEGMENTS_XZ.length;
    ALL_ROAD_SEGMENTS_XZ.push({ ax, az, bx, bz, halfWidth: poly.halfWidth });
    const pad = poly.halfWidth + 0.35;
    const gx0 = Math.floor((Math.min(ax, bx) - pad) / ROAD_GRID_CELL);
    const gx1 = Math.floor((Math.max(ax, bx) + pad) / ROAD_GRID_CELL);
    const gz0 = Math.floor((Math.min(az, bz) - pad) / ROAD_GRID_CELL);
    const gz1 = Math.floor((Math.max(az, bz) + pad) / ROAD_GRID_CELL);
    for (let gx = gx0; gx <= gx1; gx++) {
      for (let gz = gz0; gz <= gz1; gz++) {
        const key = `${gx},${gz}`;
        let list = ROAD_SEG_GRID.get(key);
        if (!list) {
          list = [];
          ROAD_SEG_GRID.set(key, list);
        }
        list.push(idx);
      }
    }
  }
});
const ROAD_SEG_SEEN = new Int32Array(ALL_ROAD_SEGMENTS_XZ.length);
let roadQueryEpoch = 0;

function getFootprintCheckPoints(cx, cz, w, d, rot = 0) {
  if (!w || !d) return [[cx, cz]];
  const hw = w * 0.54;
  const hd = d * 0.54;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const localPts = [
    [0, 0],
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
    [0, -hd],
    [hw, 0],
    [0, hd],
    [-hw, 0],
  ];
  return localPts.map(([lx, lz]) => [
    cx + lx * cos + lz * sin,
    cz - lx * sin + lz * cos,
  ]);
}

function obbOverlaps2D(a, b, pad = 0.012) {
  const axes = [
    [Math.cos(a.rot), -Math.sin(a.rot)],
    [Math.sin(a.rot), Math.cos(a.rot)],
    [Math.cos(b.rot), -Math.sin(b.rot)],
    [Math.sin(b.rot), Math.cos(b.rot)],
  ];
  const getCorners = (box) => {
    const hw = box.w * 0.5 + pad * 0.5;
    const hd = box.d * 0.5 + pad * 0.5;
    const cos = Math.cos(box.rot);
    const sin = Math.sin(box.rot);
    return [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ].map(([lx, lz]) => [
      box.x + lx * cos + lz * sin,
      box.z - lx * sin + lz * cos,
    ]);
  };
  const cornersA = getCorners(a);
  const cornersB = getCorners(b);
  for (const [ax, az] of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;
    for (const [px, pz] of cornersA) {
      const p = px * ax + pz * az;
      if (p < minA) minA = p;
      if (p > maxA) maxA = p;
    }
    for (const [px, pz] of cornersB) {
      const p = px * ax + pz * az;
      if (p < minB) minB = p;
      if (p > maxB) maxB = p;
    }
    if (maxA <= minB || maxB <= minA) return false;
  }
  return true;
}

const WATER_FACILITY_PARCEL_OFFSETS = {
  'NAGA-01': { dx: 0.0, dz: 0.0, rot: 0.22 },
  'NAGA-02': { dx: -0.17, dz: -0.12, rot: 0.08 },
  'NAGA-03': { dx: 0.20, dz: 0.04, rot: -0.35 },
  'NAGA-04': { dx: 0.0, dz: 0.0, rot: 0.12 },
  'NAGA-05': { dx: -0.04, dz: 0.03, rot: -0.08 },
  'NAGA-06': { dx: -0.14, dz: -0.11, rot: 0.45 },
  'NAGA-07': { dx: 0.0, dz: 0.0, rot: -0.14 },
  'NAGA-08': { dx: 0.0, dz: 0.0, rot: 0.30 },
};

export function getWaterFacilityPlacement(point) {
  const [rawX, , rawZ] = geoToWorld(point.lat, point.lng);
  const spec = WATER_FACILITY_PARCEL_OFFSETS[point.id] || { dx: 0, dz: 0, rot: 0 };
  const x = rawX + spec.dx;
  const z = rawZ + spec.dz;
  const y = getTerrainY(x, z);
  return { x, y, z, rot: spec.rot || 0 };
}

function isClearOfInfrastructure(
  lat,
  lng,
  objectHalfRadius = 0.12,
  placedList = [],
  specW = 0,
  specD = 0,
  rot = 0
) {
  const [x, , z] = geoToWorld(lat, lng);
  if (Math.abs(x) > 25.0 || Math.abs(z) > 19.0) return false;

  const checkPts = getFootprintCheckPoints(x, z, specW, specD, rot);
  const pointMargin = specW > 0 && specD > 0 ? 0.028 : objectHalfRadius;

  const [hx, , hz] = geoToWorld(CDRRMO_HUB.lat, CDRRMO_HUB.lng);
  if (Math.hypot(x - hx, z - hz) < objectHalfRadius + 0.44) return false;

  for (const pt of INITIAL_NAGA_POINTS) {
    const [px, , pz] = geoToWorld(pt.lat, pt.lng);
    if (Math.hypot(x - px, z - pz) < objectHalfRadius + 0.38) return false;
    const fp = getWaterFacilityPlacement(pt);
    if (Math.hypot(x - fp.x, z - fp.z) < objectHalfRadius + 0.36) return false;
  }

  const candidateOBB = specW > 0 && specD > 0 ? { x, z, w: specW, d: specD, rot } : null;

  for (const lm of NAGA_LANDMARKS) {
    const [lx, , lz] = geoToWorld(lm.lat, lm.lng);
    if (Math.hypot(x - lx, z - lz) < objectHalfRadius + Math.max(lm.w, lm.d) * 0.72) return false;
    if (
      candidateOBB &&
      obbOverlaps2D(candidateOBB, { x: lx, z: lz, w: lm.w, d: lm.d, rot: lm.rot || 0 }, 0.03)
    ) {
      return false;
    }
  }

  roadQueryEpoch++;
  const epoch = roadQueryEpoch;
  const maxExt = Math.max(objectHalfRadius, Math.hypot(specW, specD) * 0.55) + 0.16;
  const gx0 = Math.floor((x - maxExt) / ROAD_GRID_CELL);
  const gx1 = Math.floor((x + maxExt) / ROAD_GRID_CELL);
  const gz0 = Math.floor((z - maxExt) / ROAD_GRID_CELL);
  const gz1 = Math.floor((z + maxExt) / ROAD_GRID_CELL);
  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const bucket = ROAD_SEG_GRID.get(`${gx},${gz}`);
      if (!bucket) continue;
      for (let b = 0; b < bucket.length; b++) {
        const sIdx = bucket[b];
        if (ROAD_SEG_SEEN[sIdx] === epoch) continue;
        ROAD_SEG_SEEN[sIdx] = epoch;
        const seg = ALL_ROAD_SEGMENTS_XZ[sIdx];
        const minCenterDist = objectHalfRadius + seg.halfWidth + 0.02;
        if (distToSegmentXZ(x, z, seg.ax, seg.az, seg.bx, seg.bz) < minCenterDist) return false;
        const minCornerDist = seg.halfWidth + pointMargin;
        for (let p = 1; p < checkPts.length; p++) {
          if (distToSegmentXZ(checkPts[p][0], checkPts[p][1], seg.ax, seg.az, seg.bx, seg.bz) < minCornerDist) {
            return false;
          }
        }
      }
    }
  }

  for (const seg of SAMPLED_RIVER_SEGMENTS) {
    const minCenterRiver = objectHalfRadius + seg.bankHalfWidth + 0.035;
    const minCornerRiver = seg.bankHalfWidth + pointMargin;
    if (distToSegmentXZ(x, z, seg.ax, seg.az, seg.bx, seg.bz) < minCenterRiver) {
      return false;
    }
    for (let p = 1; p < checkPts.length; p++) {
      if (distToSegmentXZ(checkPts[p][0], checkPts[p][1], seg.ax, seg.az, seg.bx, seg.bz) < minCornerRiver) {
        return false;
      }
    }
  }

  for (const other of placedList) {
    const centerDist = Math.hypot(x - other.x, z - other.z);
    if (centerDist < objectHalfRadius + other.r + 0.015) {
      return false;
    }
    if (candidateOBB && other.w && other.d && centerDist < objectHalfRadius + other.r + 0.12) {
      if (obbOverlaps2D(candidateOBB, other, 0.015)) return false;
    }
  }

  return true;
}

// Helper to generate realistic rect, L-shape, or U-shape urban parcel polygons
function makeParcelFootprint(w, d, shapeType) {
  const hw = w * 0.5;
  const hd = d * 0.5;
  if (shapeType === 'rect') {
    return [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ];
  }
  if (shapeType === 'L') {
    return [
      [-hw, -hd],
      [hw, -hd],
      [hw, -hd * 0.15],
      [-hw * 0.1, -hd * 0.15],
      [-hw * 0.1, hd],
      [-hw, hd],
    ];
  }
  if (shapeType === 'U') {
    return [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [hw * 0.35, hd],
      [hw * 0.35, -hd * 0.2],
      [-hw * 0.35, -hd * 0.2],
      [-hw * 0.35, hd],
      [-hw, hd],
    ];
  }
  return null;
}

// --- STAGE 2 BUILDING FOOTPRINTS & URBAN LAYOUT (Verified OSM + Procedural Street Infill) ---
export { NAGA_BUILDING_METADATA };
export const NAGA_BUILDING_CLUSTERS = NAGA_OSM_BUILDINGS;

export const NAGA_TREE_CLUSTERS = (() => {
  const trees = [];
  const buildingBoxes = [...NAGA_BUILDING_CLUSTERS, ...NAGA_URBAN_ENVIRONMENT_FEATURES].map((b) => {
    const [x, , z] = geoToWorld(b.lat, b.lng);
    return { x, z, r: Math.hypot(b.w, b.d) * 0.56 };
  });

  let idx = 0;
  // 1. Eastern Mt. Isarog Foothills & Upland Greenbelt (Carolina, Panicuason, Upper Pacol, Upper San Isidro)
  for (let lat = 13.6060; lat <= 13.6580; lat += 0.0020) {
    for (let lng = 123.2340; lng <= 123.2620; lng += 0.0020) {
      idx++;
      const tLat = lat + (((idx * 13) % 7) - 3) * 0.00024;
      const tLng = lng + (((idx * 29) % 7) - 3) * 0.00024;
      if (!isClearOfInfrastructure(tLat, tLng, 0.09, buildingBoxes)) continue;
      const [x, y, z] = geoToWorld(tLat, tLng);
      trees.push({ x, y, z, s: 0.68 + (idx % 5) * 0.11, variant: idx % 3 });
    }
  }

  // 2. Riparian Greenway Trees along Naga River & Bicol River banks (only on open riverbank strips)
  for (const seg of SAMPLED_RIVER_SEGMENTS) {
    idx++;
    if (idx % 3 !== 0) continue;
    const mx = (seg.ax + seg.bx) * 0.5;
    const mz = (seg.az + seg.bz) * 0.5;
    const dx = seg.bx - seg.ax;
    const dz = seg.bz - seg.az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const side = idx % 2 === 0 ? 1 : -1;
    const offset = seg.bankHalfWidth + 0.11 + (idx % 3) * 0.04;
    const tx = mx + nx * side * offset;
    const tz = mz + nz * side * offset;
    const [tLat, tLng] = worldToGeo(tx, tz);
    if (!isClearOfInfrastructure(tLat, tLng, 0.09, buildingBoxes)) continue;
    const [, ty] = geoToWorld(tLat, tLng);
    trees.push({ x: tx, y: ty, z: tz, s: 0.60 + (idx % 4) * 0.08, variant: idx % 3 });
  }

  // 3. Outer Rural Perimeter & Parkland Groves (outside the built-up city blocks)
  for (let lat = 13.5920; lat <= 13.6600; lat += 0.0036) {
    for (let lng = 123.1540; lng <= 123.2340; lng += 0.0036) {
      idx++;
      const inBuiltCity = lat >= 13.604 && lat <= 13.650 && lng >= 123.170 && lng <= 123.234;
      if (inBuiltCity) continue;
      const tLat = lat + (((idx * 17) % 7) - 3) * 0.00025;
      const tLng = lng + (((idx * 23) % 7) - 3) * 0.00025;
      if (!isClearOfInfrastructure(tLat, tLng, 0.10, buildingBoxes)) continue;
      const [x, y, z] = geoToWorld(tLat, tLng);
      trees.push({ x, y, z, s: 0.64 + (idx % 5) * 0.10, variant: idx % 3 });
    }
  }

  return trees;
})();