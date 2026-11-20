import {
  NAGA_OSM_PRIMARY_ROADS,
  NAGA_OSM_SECONDARY_ROADS,
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
  { lat: 13.6192, lng: 123.1766, elevM: 4.0 },   // NAGA-02 Sabang
  { lat: 13.6164, lng: 123.1848, elevM: 4.0 },   // NAGA-07 Tabuco
  { lat: 13.6095, lng: 123.1818, elevM: 5.0 },   // NAGA-06 Mabolo
  { lat: 13.6118, lng: 123.1924, elevM: 6.0 },   // NAGA-04 Triangulo
  { lat: 13.6335, lng: 123.1922, elevM: 11.0 },  // NAGA-05 Peñafrancia
  { lat: 13.6178, lng: 123.2042, elevM: 14.0 },  // NAGA-03 Concepcion Pequeña
  { lat: 13.6275, lng: 123.2215, elevM: 48.0 },  // NAGA-01 Cararayan
  { lat: 13.6470, lng: 123.2240, elevM: 115.0 }, // NAGA-08 Pacol
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

function sampleCatmullRomXZ(pts, divisions) {
  if (pts.length < 2) return pts;
  const out = [];
  const n = pts.length - 1;
  for (let i = 0; i <= divisions; i++) {
    const u = (i / divisions) * n;
    const seg = Math.min(n - 1, Math.floor(u));
    const t = u - seg;
    const p0 = pts[Math.max(0, seg - 1)];
    const p1 = pts[seg];
    const p2 = pts[seg + 1];
    const p3 = pts[Math.min(n, seg + 2)];
    const t2 = t * t;
    const t3 = t2 * t;
    const interp = (a, b, c, d) =>
      0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
    out.push({ x: interp(p0.x, p1.x, p2.x, p3.x), z: interp(p0.z, p1.z, p2.z, p3.z) });
  }
  return out;
}

const RIVER_CENTERLINE_SEGS_XZ = (() => {
  const segs = [];
  const rivers = [
    { coords: NAGA_RIVER_COORDS, waterHw: RIVER_RENDER_WIDTHS.nagaWaterHalfWidth, bankHw: RIVER_RENDER_WIDTHS.nagaBankHalfWidth },
    { coords: BICOL_RIVER_COORDS, waterHw: RIVER_RENDER_WIDTHS.bicolWaterHalfWidth, bankHw: RIVER_RENDER_WIDTHS.bicolBankHalfWidth },
  ];
  rivers.forEach(({ coords, waterHw, bankHw }) => {
    const pts = coords.map(([lat, lng]) => {
      const [x, z] = geoToWorldXZ(lat, lng);
      return { x, z };
    });
    const sampled = sampleCatmullRomXZ(pts, 120);
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
  COLGANTE_BRIDGE_W: [13.6252, 123.1864],
  COLGANTE_BRIDGE_E: [13.6228, 123.1892],
  DAYANGDANG_BRIDGE_W: [13.6312, 123.1942],
  DAYANGDANG_BRIDGE_E: [13.6284, 123.1970],
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
  MABOLO_JCT: [13.6128, 123.1805],
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
  { id: 'BRIDGE_COLGANTE', name: 'Colgante Bridge', river: 'Naga River', from: 'COLGANTE_BRIDGE_W', to: 'COLGANTE_BRIDGE_E' },
  { id: 'BRIDGE_MABOLO', name: 'Delfin Rosales Bridge', river: 'Bicol River', from: 'MABOLO_BRIDGE_E', to: 'MABOLO_BRIDGE_W' },
  { id: 'BRIDGE_MAGSAYSAY', name: 'Magsaysay Bridge', river: 'Naga River', from: 'MAGSAYSAY_BRIDGE_N', to: 'MAGSAYSAY_BRIDGE_S' },
  { id: 'BRIDGE_DAYANGDANG', name: 'Dayangdang-Balatas Bridge', river: 'Naga River', from: 'DAYANGDANG_BRIDGE_W', to: 'DAYANGDANG_BRIDGE_E' },
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
  { id: 'R_COL_W', from: 'DINAGA_JCT', to: 'COLGANTE_BRIDGE_W', coords: [NAGA_ROAD_NODES.DINAGA_JCT, NAGA_ROAD_NODES.COLGANTE_BRIDGE_W] },
  { id: 'R_COL_BR', bridgeId: 'BRIDGE_COLGANTE', from: 'COLGANTE_BRIDGE_W', to: 'COLGANTE_BRIDGE_E', coords: [NAGA_ROAD_NODES.COLGANTE_BRIDGE_W, NAGA_ROAD_NODES.COLGANTE_BRIDGE_E] },
  { id: 'R_COL_E', from: 'COLGANTE_BRIDGE_E', to: 'TINAGO_JCT', coords: [NAGA_ROAD_NODES.COLGANTE_BRIDGE_E, NAGA_ROAD_NODES.TINAGO_JCT] },
  { id: 'R_DAY_W', from: 'PENAFRANCIA_JCT', to: 'DAYANGDANG_BRIDGE_W', coords: [NAGA_ROAD_NODES.PENAFRANCIA_JCT, NAGA_ROAD_NODES.DAYANGDANG_BRIDGE_W] },
  { id: 'R_DAY_BR', bridgeId: 'BRIDGE_DAYANGDANG', from: 'DAYANGDANG_BRIDGE_W', to: 'DAYANGDANG_BRIDGE_E', coords: [NAGA_ROAD_NODES.DAYANGDANG_BRIDGE_W, NAGA_ROAD_NODES.DAYANGDANG_BRIDGE_E] },
  { id: 'R_DAY_E', from: 'DAYANGDANG_BRIDGE_E', to: 'DAYANGDANG_JCT', coords: [NAGA_ROAD_NODES.DAYANGDANG_BRIDGE_E, NAGA_ROAD_NODES.DAYANGDANG_JCT] },
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
  NAGA_OSM_PRIMARY_ROADS,
  NAGA_OSM_SECONDARY_ROADS,
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

// Crisp street-grid [lat, lng] dispatch routes solved on Naga OSM roads originating from CDRRMO Hub
export const TANKER_ROUTES = {
  'NAGA-02': [[13.6226, 123.1965], [13.62177, 123.19598], [13.62178, 123.19591], [13.62158, 123.1959], [13.6212, 123.19584], [13.61903, 123.1949], [13.61919, 123.1944], [13.61727, 123.19353], [13.61565, 123.19299], [13.61566, 123.19309], [13.61564, 123.19262], [13.61568, 123.19209], [13.61666, 123.18539], [13.61664, 123.18509], [13.61657, 123.18474], [13.61652, 123.18448], [13.6165, 123.18413], [13.61654, 123.18403], [13.61666, 123.18376], [13.6168, 123.18345], [13.61681, 123.1833], [13.61657, 123.18299], [13.61863, 123.18112], [13.6185, 123.18096], [13.61847, 123.18057], [13.61778, 123.18004], [13.61767, 123.1799], [13.61765, 123.17979], [13.61769, 123.17935], [13.61769, 123.17897], [13.61744, 123.17876], [13.61741, 123.17867], [13.61741, 123.17834], [13.61747, 123.17759], [13.61754, 123.17743], [13.61824, 123.17656], [13.61859, 123.17645], [13.61885, 123.1764], [13.6192, 123.1766]],
  'NAGA-07': [[13.6226, 123.1965], [13.62177, 123.19598], [13.62178, 123.19591], [13.62158, 123.1959], [13.6212, 123.19584], [13.61903, 123.1949], [13.61919, 123.1944], [13.61727, 123.19353], [13.61565, 123.19299], [13.61566, 123.19309], [13.61564, 123.19262], [13.61568, 123.19209], [13.61666, 123.18539], [13.61664, 123.18509], [13.61657, 123.18474], [13.6164, 123.1848]],
  'NAGA-04': [[13.6226, 123.1965], [13.62177, 123.19598], [13.62178, 123.19591], [13.62158, 123.1959], [13.6212, 123.19584], [13.61903, 123.1949], [13.61919, 123.1944], [13.61727, 123.19353], [13.61565, 123.19299], [13.61566, 123.19309], [13.61542, 123.19356], [13.61436, 123.19381], [13.61274, 123.19423], [13.61248, 123.19432], [13.6118, 123.1924]],
  'NAGA-06': [[13.6226, 123.1965], [13.62177, 123.19598], [13.62178, 123.19591], [13.62158, 123.1959], [13.6212, 123.19584], [13.61903, 123.1949], [13.61919, 123.1944], [13.61727, 123.19353], [13.61565, 123.19299], [13.61566, 123.19309], [13.61564, 123.19262], [13.61568, 123.19209], [13.61666, 123.18539], [13.61664, 123.18509], [13.61657, 123.18474], [13.61649, 123.18459], [13.61637, 123.18425], [13.61604, 123.18395], [13.61594, 123.18382], [13.61448, 123.1827], [13.61414, 123.1825], [13.61104, 123.18164], [13.6095, 123.1818]],
  'NAGA-03': [[13.6226, 123.1965], [13.62177, 123.19598], [13.62178, 123.19591], [13.62158, 123.1959], [13.6212, 123.19584], [13.61903, 123.1949], [13.61919, 123.1944], [13.61727, 123.19353], [13.61565, 123.19299], [13.61566, 123.19309], [13.61574, 123.19349], [13.6159, 123.19397], [13.6162, 123.19459], [13.61923, 123.19985], [13.61952, 123.2002], [13.61942, 123.2001], [13.61916, 123.20058], [13.61875, 123.20113], [13.61863, 123.20116], [13.61838, 123.20094], [13.61761, 123.20149], [13.61738, 123.20173], [13.61744, 123.20189], [13.61702, 123.20223], [13.61652, 123.20306], [13.61581, 123.20238], [13.61565, 123.20256], [13.61552, 123.20271], [13.61627, 123.20347], [13.61668, 123.20385], [13.61673, 123.20387], [13.61684, 123.20386], [13.61693, 123.20378], [13.61708, 123.20397], [13.61724, 123.20421], [13.61763, 123.20451], [13.6178, 123.2042]],
  'NAGA-05': [[13.6226, 123.1965], [13.62177, 123.19598], [13.62178, 123.19591], [13.62158, 123.1959], [13.6212, 123.19584], [13.61903, 123.1949], [13.61919, 123.1944], [13.61727, 123.19353], [13.61565, 123.19299], [13.61566, 123.19309], [13.61564, 123.19262], [13.61568, 123.19209], [13.61666, 123.18539], [13.61664, 123.18509], [13.61657, 123.18474], [13.61652, 123.18448], [13.6165, 123.18413], [13.61654, 123.18403], [13.61666, 123.18376], [13.6168, 123.18345], [13.61681, 123.1833], [13.61759, 123.18429], [13.62014, 123.18305], [13.62013, 123.18303], [13.62057, 123.18312], [13.62059, 123.1832], [13.62218, 123.1836], [13.62267, 123.18372], [13.62256, 123.18437], [13.623, 123.18447], [13.62414, 123.18483], [13.62424, 123.18493], [13.62428, 123.18508], [13.62421, 123.18557], [13.62415, 123.18594], [13.62469, 123.18626], [13.6253, 123.18692], [13.62581, 123.18734], [13.62619, 123.18761], [13.62753, 123.18846], [13.62831, 123.18912], [13.63335, 123.19468], [13.63343, 123.19456], [13.63345, 123.19447], [13.63368, 123.19255], [13.6335, 123.1922]],
  'NAGA-01': [[13.6226, 123.1965], [13.62177, 123.19598], [13.62178, 123.19591], [13.62158, 123.1959], [13.6212, 123.19584], [13.61903, 123.1949], [13.61919, 123.1944], [13.61727, 123.19353], [13.61565, 123.19299], [13.61566, 123.19309], [13.61574, 123.19349], [13.6159, 123.19397], [13.6162, 123.19459], [13.61923, 123.19985], [13.61952, 123.2002], [13.61973, 123.20038], [13.61989, 123.20049], [13.62064, 123.20085], [13.62089, 123.20107], [13.62091, 123.20112], [13.62095, 123.20135], [13.62093, 123.2019], [13.62088, 123.20259], [13.62104, 123.20511], [13.62116, 123.20615], [13.62122, 123.20726], [13.62099, 123.20908], [13.62093, 123.20978], [13.62091, 123.21015], [13.62093, 123.2107], [13.62103, 123.21143], [13.62112, 123.2118], [13.62124, 123.21207], [13.62161, 123.21277], [13.62176, 123.21321], [13.62181, 123.21354], [13.62181, 123.21402], [13.62158, 123.21787], [13.62154, 123.21829], [13.6214, 123.21884], [13.62122, 123.21924], [13.62111, 123.21943], [13.62086, 123.21977], [13.62091, 123.2197], [13.62118, 123.22001], [13.62127, 123.22007], [13.62179, 123.22028], [13.62219, 123.21925], [13.62224, 123.2192], [13.62232, 123.2192], [13.62255, 123.21928], [13.62261, 123.2192], [13.62445, 123.21992], [13.62452, 123.2199], [13.6275, 123.2215]],
  'NAGA-08': [[13.6226, 123.1965], [13.62177, 123.19598], [13.62178, 123.19591], [13.62158, 123.1959], [13.6212, 123.19584], [13.61903, 123.1949], [13.61919, 123.1944], [13.61727, 123.19353], [13.61565, 123.19299], [13.61566, 123.19309], [13.61564, 123.19262], [13.61568, 123.19209], [13.61666, 123.18539], [13.61664, 123.18509], [13.61657, 123.18474], [13.61652, 123.18448], [13.6165, 123.18413], [13.61654, 123.18403], [13.61666, 123.18376], [13.6168, 123.18345], [13.61681, 123.1833], [13.61759, 123.18429], [13.62014, 123.18305], [13.62013, 123.18303], [13.62057, 123.18312], [13.62059, 123.1832], [13.62218, 123.1836], [13.62267, 123.18372], [13.62256, 123.18437], [13.623, 123.18447], [13.62414, 123.18483], [13.62424, 123.18493], [13.62428, 123.18508], [13.62421, 123.18557], [13.62415, 123.18594], [13.62469, 123.18626], [13.6253, 123.18692], [13.62581, 123.18734], [13.62619, 123.18761], [13.62753, 123.18846], [13.62831, 123.18912], [13.63335, 123.19468], [13.63406, 123.19564], [13.63474, 123.19621], [13.63481, 123.1963], [13.63624, 123.1994], [13.63667, 123.20081], [13.63675, 123.20098], [13.63697, 123.2013], [13.63761, 123.20198], [13.63772, 123.20208], [13.63974, 123.203], [13.63934, 123.2045], [13.63941, 123.20504], [13.63927, 123.20584], [13.63915, 123.20602], [13.63889, 123.20631], [13.63869, 123.20675], [13.63863, 123.20698], [13.63897, 123.20781], [13.63896, 123.20779], [13.63634, 123.20866], [13.63818, 123.21316], [13.63828, 123.21347], [13.63849, 123.21422], [13.63852, 123.21476], [13.63854, 123.21484], [13.63859, 123.21491], [13.63888, 123.21507], [13.63918, 123.2155], [13.64041, 123.21825], [13.64041, 123.21846], [13.64032, 123.21862], [13.64031, 123.2188], [13.64041, 123.21898], [13.6408, 123.21944], [13.64092, 123.21939], [13.64116, 123.21993], [13.64405, 123.21964], [13.6470, 123.2240]],
};

export function getShortestRoadRouteCoords(pointId) {
  if (TANKER_ROUTES[pointId]?.length >= 2) {
    return TANKER_ROUTES[pointId].map((pt) => [...pt]);
  }
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
  "type": "FeatureCollection",
  "crs": {
    "type": "name",
    "properties": {
      "name": "EPSG:4326"
    }
  },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-01",
        "name": "Abella",
        "labelLat": 13.62269,
        "labelLng": 123.17849
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.62489,
              123.1808
            ],
            [
              13.62495,
              123.17646
            ],
            [
              13.62224,
              123.17581
            ],
            [
              13.62146,
              123.17696
            ],
            [
              13.62106,
              123.17597
            ],
            [
              13.62048,
              123.17621
            ],
            [
              13.62045,
              123.1808
            ],
            [
              13.62489,
              123.1808
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-02",
        "name": "Bagumbayan Norte",
        "labelLat": 13.63842,
        "labelLng": 123.18598
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6352,
              123.18859
            ],
            [
              13.64489,
              123.1885
            ],
            [
              13.64444,
              123.18718
            ],
            [
              13.64264,
              123.18736
            ],
            [
              13.64121,
              123.18596
            ],
            [
              13.6412,
              123.18552
            ],
            [
              13.64053,
              123.185
            ],
            [
              13.63981,
              123.18514
            ],
            [
              13.63768,
              123.18269
            ],
            [
              13.63709,
              123.18137
            ],
            [
              13.63601,
              123.18178
            ],
            [
              13.6352,
              123.18115
            ],
            [
              13.6352,
              123.18859
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-03",
        "name": "Bagumbayan Sur",
        "labelLat": 13.63189,
        "labelLng": 123.18307
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6352,
              123.187
            ],
            [
              13.6352,
              123.18115
            ],
            [
              13.63291,
              123.17936
            ],
            [
              13.63261,
              123.17947
            ],
            [
              13.63208,
              123.17816
            ],
            [
              13.62981,
              123.17762
            ],
            [
              13.6284,
              123.187
            ],
            [
              13.6352,
              123.187
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-04",
        "name": "Balatas",
        "labelLat": 13.63057,
        "labelLng": 123.20403
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6255,
              123.1988
            ],
            [
              13.6255,
              123.2095
            ],
            [
              13.63402,
              123.2095
            ],
            [
              13.63453,
              123.20875
            ],
            [
              13.63448,
              123.2084
            ],
            [
              13.63347,
              123.20801
            ],
            [
              13.63329,
              123.20744
            ],
            [
              13.63347,
              123.20704
            ],
            [
              13.63396,
              123.20678
            ],
            [
              13.63571,
              123.207
            ],
            [
              13.63768,
              123.20665
            ],
            [
              13.63801,
              123.20632
            ],
            [
              13.63796,
              123.20567
            ],
            [
              13.63749,
              123.20528
            ],
            [
              13.63598,
              123.20605
            ],
            [
              13.63527,
              123.20572
            ],
            [
              13.63485,
              123.20477
            ],
            [
              13.63534,
              123.20365
            ],
            [
              13.63676,
              123.20308
            ],
            [
              13.63706,
              123.20271
            ],
            [
              13.6371,
              123.20208
            ],
            [
              13.63646,
              123.2015
            ],
            [
              13.63496,
              123.20164
            ],
            [
              13.63503,
              123.20105
            ],
            [
              13.63596,
              123.20012
            ],
            [
              13.63607,
              123.19963
            ],
            [
              13.63562,
              123.19911
            ],
            [
              13.63458,
              123.19946
            ],
            [
              13.63395,
              123.19921
            ],
            [
              13.63375,
              123.1988
            ],
            [
              13.6255,
              123.1988
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-05",
        "name": "Calauag",
        "labelLat": 13.64254,
        "labelLng": 123.19322
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6375,
              123.1975
            ],
            [
              13.65039,
              123.1975
            ],
            [
              13.64956,
              123.19636
            ],
            [
              13.64792,
              123.19599
            ],
            [
              13.64632,
              123.19423
            ],
            [
              13.6478,
              123.19161
            ],
            [
              13.64752,
              123.19027
            ],
            [
              13.64489,
              123.1885
            ],
            [
              13.6375,
              123.1885
            ],
            [
              13.6375,
              123.1975
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-06",
        "name": "Cararayan",
        "labelLat": 13.6321,
        "labelLng": 123.23722
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.64331,
              123.253
            ],
            [
              13.642,
              123.246
            ],
            [
              13.64063,
              123.21771
            ],
            [
              13.62732,
              123.21682
            ],
            [
              13.62863,
              123.21894
            ],
            [
              13.6287,
              123.22011
            ],
            [
              13.62828,
              123.22074
            ],
            [
              13.62723,
              123.21977
            ],
            [
              13.62687,
              123.21878
            ],
            [
              13.62624,
              123.21819
            ],
            [
              13.62591,
              123.21721
            ],
            [
              13.62547,
              123.21738
            ],
            [
              13.62625,
              123.22011
            ],
            [
              13.62723,
              123.22108
            ],
            [
              13.62788,
              123.22266
            ],
            [
              13.62809,
              123.22388
            ],
            [
              13.62945,
              123.22538
            ],
            [
              13.62973,
              123.22646
            ],
            [
              13.62923,
              123.22692
            ],
            [
              13.62872,
              123.22606
            ],
            [
              13.62799,
              123.22561
            ],
            [
              13.62641,
              123.22662
            ],
            [
              13.62516,
              123.22687
            ],
            [
              13.62464,
              123.22823
            ],
            [
              13.62481,
              123.22935
            ],
            [
              13.625,
              123.22989
            ],
            [
              13.62608,
              123.23022
            ],
            [
              13.6261,
              123.23054
            ],
            [
              13.62498,
              123.23134
            ],
            [
              13.62452,
              123.23283
            ],
            [
              13.62296,
              123.23354
            ],
            [
              13.62264,
              123.23446
            ],
            [
              13.62232,
              123.23459
            ],
            [
              13.62206,
              123.23453
            ],
            [
              13.62143,
              123.2335
            ],
            [
              13.62099,
              123.23409
            ],
            [
              13.62013,
              123.23363
            ],
            [
              13.61939,
              123.23403
            ],
            [
              13.61965,
              123.23471
            ],
            [
              13.62024,
              123.23527
            ],
            [
              13.62154,
              123.23489
            ],
            [
              13.62253,
              123.23593
            ],
            [
              13.62251,
              123.2364
            ],
            [
              13.62158,
              123.23695
            ],
            [
              13.62238,
              123.23781
            ],
            [
              13.62243,
              123.23854
            ],
            [
              13.62212,
              123.23919
            ],
            [
              13.62314,
              123.23965
            ],
            [
              13.62303,
              123.24036
            ],
            [
              13.62135,
              123.24155
            ],
            [
              13.62078,
              123.24165
            ],
            [
              13.6206,
              123.24126
            ],
            [
              13.62155,
              123.24086
            ],
            [
              13.62088,
              123.23995
            ],
            [
              13.6201,
              123.23992
            ],
            [
              13.62006,
              123.24077
            ],
            [
              13.61985,
              123.24095
            ],
            [
              13.619,
              123.24047
            ],
            [
              13.61848,
              123.24064
            ],
            [
              13.61783,
              123.24204
            ],
            [
              13.61724,
              123.24251
            ],
            [
              13.61754,
              123.24265
            ],
            [
              13.61789,
              123.24369
            ],
            [
              13.62011,
              123.24341
            ],
            [
              13.62002,
              123.244
            ],
            [
              13.62061,
              123.24475
            ],
            [
              13.62037,
              123.24595
            ],
            [
              13.6208,
              123.24598
            ],
            [
              13.62119,
              123.24527
            ],
            [
              13.62222,
              123.24564
            ],
            [
              13.62249,
              123.24657
            ],
            [
              13.62211,
              123.24676
            ],
            [
              13.62312,
              123.24802
            ],
            [
              13.62272,
              123.24906
            ],
            [
              13.62159,
              123.24926
            ],
            [
              13.62048,
              123.24997
            ],
            [
              13.61973,
              123.24914
            ],
            [
              13.61837,
              123.24869
            ],
            [
              13.61828,
              123.24997
            ],
            [
              13.61904,
              123.25164
            ],
            [
              13.61735,
              123.25193
            ],
            [
              13.61761,
              123.253
            ],
            [
              13.64331,
              123.253
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-07",
        "name": "Carolina",
        "labelLat": 13.65945,
        "labelLng": 123.28607
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6743,
              123.303
            ],
            [
              13.67049,
              123.29512
            ],
            [
              13.66963,
              123.29462
            ],
            [
              13.67016,
              123.29349
            ],
            [
              13.67094,
              123.29379
            ],
            [
              13.67267,
              123.29278
            ],
            [
              13.67305,
              123.29146
            ],
            [
              13.67285,
              123.29039
            ],
            [
              13.67345,
              123.289
            ],
            [
              13.67303,
              123.28846
            ],
            [
              13.67238,
              123.28851
            ],
            [
              13.67216,
              123.2879
            ],
            [
              13.67308,
              123.28715
            ],
            [
              13.666,
              123.268
            ],
            [
              13.64612,
              123.268
            ],
            [
              13.648,
              123.278
            ],
            [
              13.64849,
              123.303
            ],
            [
              13.6743,
              123.303
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-08",
        "name": "Concepcion Grande",
        "labelLat": 13.62041,
        "labelLng": 123.21816
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.61045,
              123.2097
            ],
            [
              13.61152,
              123.21313
            ],
            [
              13.61106,
              123.21655
            ],
            [
              13.61115,
              123.21864
            ],
            [
              13.61214,
              123.2205
            ],
            [
              13.61144,
              123.22079
            ],
            [
              13.61102,
              123.22359
            ],
            [
              13.61181,
              123.22618
            ],
            [
              13.61156,
              123.22728
            ],
            [
              13.617,
              123.2277
            ],
            [
              13.62471,
              123.22869
            ],
            [
              13.62464,
              123.22823
            ],
            [
              13.62516,
              123.22687
            ],
            [
              13.62641,
              123.22662
            ],
            [
              13.62799,
              123.22561
            ],
            [
              13.62872,
              123.22606
            ],
            [
              13.62923,
              123.22692
            ],
            [
              13.62973,
              123.22646
            ],
            [
              13.62945,
              123.22538
            ],
            [
              13.62809,
              123.22388
            ],
            [
              13.62788,
              123.22266
            ],
            [
              13.62723,
              123.22108
            ],
            [
              13.62625,
              123.22011
            ],
            [
              13.62547,
              123.21738
            ],
            [
              13.62591,
              123.21721
            ],
            [
              13.62624,
              123.21819
            ],
            [
              13.62687,
              123.21878
            ],
            [
              13.62723,
              123.21977
            ],
            [
              13.62828,
              123.22074
            ],
            [
              13.6287,
              123.22011
            ],
            [
              13.62863,
              123.21894
            ],
            [
              13.62729,
              123.2169
            ],
            [
              13.62743,
              123.21651
            ],
            [
              13.62978,
              123.21599
            ],
            [
              13.63078,
              123.21524
            ],
            [
              13.63082,
              123.21468
            ],
            [
              13.62977,
              123.21291
            ],
            [
              13.62979,
              123.21236
            ],
            [
              13.63037,
              123.2118
            ],
            [
              13.63086,
              123.21173
            ],
            [
              13.631,
              123.21331
            ],
            [
              13.63145,
              123.21369
            ],
            [
              13.63206,
              123.2136
            ],
            [
              13.6331,
              123.21252
            ],
            [
              13.63335,
              123.21184
            ],
            [
              13.63316,
              123.21118
            ],
            [
              13.63245,
              123.21043
            ],
            [
              13.63251,
              123.21005
            ],
            [
              13.63402,
              123.2095
            ],
            [
              13.61045,
              123.2097
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-09",
        "name": "Concepcion Pequeña",
        "labelLat": 13.61711,
        "labelLng": 123.2018
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6255,
              123.1945
            ],
            [
              13.60611,
              123.19482
            ],
            [
              13.60868,
              123.20073
            ],
            [
              13.60916,
              123.20119
            ],
            [
              13.61045,
              123.2097
            ],
            [
              13.6255,
              123.2095
            ],
            [
              13.6255,
              123.1945
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-10",
        "name": "Dayangdang",
        "labelLat": 13.62931,
        "labelLng": 123.19672
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.63375,
              123.1988
            ],
            [
              13.63337,
              123.19804
            ],
            [
              13.63332,
              123.19687
            ],
            [
              13.63272,
              123.19508
            ],
            [
              13.63178,
              123.19453
            ],
            [
              13.6255,
              123.1945
            ],
            [
              13.6255,
              123.1988
            ],
            [
              13.63375,
              123.1988
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-11",
        "name": "Del Rosario",
        "labelLat": 13.61716,
        "labelLng": 123.23414
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.61156,
              123.22728
            ],
            [
              13.61178,
              123.22867
            ],
            [
              13.61096,
              123.22939
            ],
            [
              13.61067,
              123.23029
            ],
            [
              13.61089,
              123.23142
            ],
            [
              13.61053,
              123.23274
            ],
            [
              13.61098,
              123.23324
            ],
            [
              13.61166,
              123.2357
            ],
            [
              13.61024,
              123.23828
            ],
            [
              13.61044,
              123.23916
            ],
            [
              13.61181,
              123.24007
            ],
            [
              13.61477,
              123.24064
            ],
            [
              13.61522,
              123.24161
            ],
            [
              13.61724,
              123.24251
            ],
            [
              13.61783,
              123.24204
            ],
            [
              13.61848,
              123.24064
            ],
            [
              13.619,
              123.24047
            ],
            [
              13.61985,
              123.24095
            ],
            [
              13.62006,
              123.24077
            ],
            [
              13.6201,
              123.23992
            ],
            [
              13.62088,
              123.23995
            ],
            [
              13.62155,
              123.24086
            ],
            [
              13.6206,
              123.24126
            ],
            [
              13.62078,
              123.24165
            ],
            [
              13.62135,
              123.24155
            ],
            [
              13.62303,
              123.24036
            ],
            [
              13.62314,
              123.23965
            ],
            [
              13.62212,
              123.23919
            ],
            [
              13.62243,
              123.23854
            ],
            [
              13.62238,
              123.23781
            ],
            [
              13.62158,
              123.23695
            ],
            [
              13.62251,
              123.2364
            ],
            [
              13.62253,
              123.23593
            ],
            [
              13.62154,
              123.23489
            ],
            [
              13.62024,
              123.23527
            ],
            [
              13.61965,
              123.23471
            ],
            [
              13.61939,
              123.23403
            ],
            [
              13.62013,
              123.23363
            ],
            [
              13.62099,
              123.23409
            ],
            [
              13.62143,
              123.2335
            ],
            [
              13.62206,
              123.23453
            ],
            [
              13.62264,
              123.23446
            ],
            [
              13.62296,
              123.23354
            ],
            [
              13.62452,
              123.23283
            ],
            [
              13.62498,
              123.23134
            ],
            [
              13.6261,
              123.23054
            ],
            [
              13.62608,
              123.23022
            ],
            [
              13.625,
              123.22989
            ],
            [
              13.62471,
              123.22869
            ],
            [
              13.617,
              123.2277
            ],
            [
              13.61156,
              123.22728
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-12",
        "name": "Dinaga",
        "labelLat": 13.62146,
        "labelLng": 123.18513
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6196,
              123.18598
            ],
            [
              13.62357,
              123.18614
            ],
            [
              13.6238,
              123.1858
            ],
            [
              13.6232,
              123.1845
            ],
            [
              13.61994,
              123.18392
            ],
            [
              13.6196,
              123.18338
            ],
            [
              13.6196,
              123.18598
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-13",
        "name": "Igualdad Interior",
        "labelLat": 13.62287,
        "labelLng": 123.18286
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.62045,
              123.1808
            ],
            [
              13.62042,
              123.184
            ],
            [
              13.6232,
              123.1845
            ],
            [
              13.6238,
              123.1858
            ],
            [
              13.62366,
              123.186
            ],
            [
              13.62482,
              123.186
            ],
            [
              13.62489,
              123.1808
            ],
            [
              13.62045,
              123.1808
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-14",
        "name": "Lerma",
        "labelLat": 13.62313,
        "labelLng": 123.18816
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.62792,
              123.1895
            ],
            [
              13.62763,
              123.1891
            ],
            [
              13.62606,
              123.18876
            ],
            [
              13.62303,
              123.18692
            ],
            [
              13.62357,
              123.18614
            ],
            [
              13.6208,
              123.18603
            ],
            [
              13.6208,
              123.1895
            ],
            [
              13.62792,
              123.1895
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-15",
        "name": "Liboton",
        "labelLat": 13.63156,
        "labelLng": 123.188
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6284,
              123.187
            ],
            [
              13.6283,
              123.18936
            ],
            [
              13.6352,
              123.18859
            ],
            [
              13.6352,
              123.187
            ],
            [
              13.6284,
              123.187
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-16",
        "name": "Mabolo",
        "labelLat": 13.61093,
        "labelLng": 123.18189
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6152,
              123.17758
            ],
            [
              13.61335,
              123.17759
            ],
            [
              13.61126,
              123.17694
            ],
            [
              13.61059,
              123.17596
            ],
            [
              13.60967,
              123.17776
            ],
            [
              13.60725,
              123.18054
            ],
            [
              13.60651,
              123.18306
            ],
            [
              13.60451,
              123.1846
            ],
            [
              13.60289,
              123.18532
            ],
            [
              13.6152,
              123.18581
            ],
            [
              13.6152,
              123.17758
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-17",
        "name": "Pacol",
        "labelLat": 13.652,
        "labelLng": 123.2436
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.666,
              123.268
            ],
            [
              13.66564,
              123.26703
            ],
            [
              13.66607,
              123.26638
            ],
            [
              13.66603,
              123.26534
            ],
            [
              13.66532,
              123.26441
            ],
            [
              13.66522,
              123.26241
            ],
            [
              13.66424,
              123.26003
            ],
            [
              13.66408,
              123.25835
            ],
            [
              13.66381,
              123.25833
            ],
            [
              13.66354,
              123.25698
            ],
            [
              13.66296,
              123.25682
            ],
            [
              13.66296,
              123.25596
            ],
            [
              13.66268,
              123.25611
            ],
            [
              13.66258,
              123.25537
            ],
            [
              13.66124,
              123.25357
            ],
            [
              13.6617,
              123.25202
            ],
            [
              13.6611,
              123.25068
            ],
            [
              13.66117,
              123.24947
            ],
            [
              13.66065,
              123.24769
            ],
            [
              13.66096,
              123.2464
            ],
            [
              13.66161,
              123.24675
            ],
            [
              13.66178,
              123.2464
            ],
            [
              13.66141,
              123.24623
            ],
            [
              13.66157,
              123.24603
            ],
            [
              13.66083,
              123.24486
            ],
            [
              13.66098,
              123.24378
            ],
            [
              13.66186,
              123.24316
            ],
            [
              13.66114,
              123.24297
            ],
            [
              13.66089,
              123.24254
            ],
            [
              13.66049,
              123.24049
            ],
            [
              13.6614,
              123.23865
            ],
            [
              13.66161,
              123.23742
            ],
            [
              13.66137,
              123.23639
            ],
            [
              13.66079,
              123.2367
            ],
            [
              13.6606,
              123.23639
            ],
            [
              13.66112,
              123.23588
            ],
            [
              13.66097,
              123.23528
            ],
            [
              13.66044,
              123.2353
            ],
            [
              13.6593,
              123.23434
            ],
            [
              13.6596,
              123.23387
            ],
            [
              13.65934,
              123.23329
            ],
            [
              13.6602,
              123.23311
            ],
            [
              13.65991,
              123.23245
            ],
            [
              13.66029,
              123.23213
            ],
            [
              13.65988,
              123.23171
            ],
            [
              13.66054,
              123.23144
            ],
            [
              13.65961,
              123.23018
            ],
            [
              13.66017,
              123.22952
            ],
            [
              13.65946,
              123.22745
            ],
            [
              13.65953,
              123.22628
            ],
            [
              13.65894,
              123.22614
            ],
            [
              13.65889,
              123.22536
            ],
            [
              13.65836,
              123.22565
            ],
            [
              13.658,
              123.22542
            ],
            [
              13.65855,
              123.22465
            ],
            [
              13.65854,
              123.22357
            ],
            [
              13.65919,
              123.22289
            ],
            [
              13.6583,
              123.22269
            ],
            [
              13.65844,
              123.22224
            ],
            [
              13.65796,
              123.22183
            ],
            [
              13.65783,
              123.22036
            ],
            [
              13.65843,
              123.22043
            ],
            [
              13.65836,
              123.21982
            ],
            [
              13.65877,
              123.21931
            ],
            [
              13.65823,
              123.21919
            ],
            [
              13.6581,
              123.21887
            ],
            [
              13.64063,
              123.21771
            ],
            [
              13.642,
              123.246
            ],
            [
              13.64612,
              123.268
            ],
            [
              13.666,
              123.268
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-18",
        "name": "Panicuason",
        "labelLat": 13.65945,
        "labelLng": 123.33212
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.64849,
              123.303
            ],
            [
              13.64877,
              123.31712
            ],
            [
              13.64978,
              123.31835
            ],
            [
              13.64864,
              123.32295
            ],
            [
              13.64835,
              123.32617
            ],
            [
              13.64868,
              123.32963
            ],
            [
              13.64749,
              123.33138
            ],
            [
              13.64757,
              123.33241
            ],
            [
              13.64861,
              123.33381
            ],
            [
              13.64931,
              123.3381
            ],
            [
              13.64751,
              123.34774
            ],
            [
              13.64844,
              123.35456
            ],
            [
              13.65009,
              123.35794
            ],
            [
              13.65026,
              123.35961
            ],
            [
              13.65025,
              123.36071
            ],
            [
              13.64952,
              123.36181
            ],
            [
              13.6497,
              123.36238
            ],
            [
              13.64909,
              123.36414
            ],
            [
              13.64905,
              123.36591
            ],
            [
              13.651,
              123.37158
            ],
            [
              13.65266,
              123.37372
            ],
            [
              13.65317,
              123.37381
            ],
            [
              13.65367,
              123.37494
            ],
            [
              13.65507,
              123.37647
            ],
            [
              13.65576,
              123.37427
            ],
            [
              13.65762,
              123.37278
            ],
            [
              13.65729,
              123.37188
            ],
            [
              13.65882,
              123.36781
            ],
            [
              13.65896,
              123.36806
            ],
            [
              13.65945,
              123.36789
            ],
            [
              13.65965,
              123.3665
            ],
            [
              13.66011,
              123.36644
            ],
            [
              13.66021,
              123.36387
            ],
            [
              13.66075,
              123.36382
            ],
            [
              13.66197,
              123.3589
            ],
            [
              13.67436,
              123.32537
            ],
            [
              13.6743,
              123.303
            ],
            [
              13.64849,
              123.303
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-19",
        "name": "Peñafrancia",
        "labelLat": 13.63391,
        "labelLng": 123.19259
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6375,
              123.1885
            ],
            [
              13.6283,
              123.18936
            ],
            [
              13.6283,
              123.19003
            ],
            [
              13.6299,
              123.19227
            ],
            [
              13.63037,
              123.19348
            ],
            [
              13.63019,
              123.19425
            ],
            [
              13.63039,
              123.19462
            ],
            [
              13.63178,
              123.19453
            ],
            [
              13.63272,
              123.19508
            ],
            [
              13.63335,
              123.1975
            ],
            [
              13.6375,
              123.1975
            ],
            [
              13.6375,
              123.1885
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-20",
        "name": "Sabang",
        "labelLat": 13.61849,
        "labelLng": 123.17899
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.62048,
              123.17621
            ],
            [
              13.62033,
              123.17627
            ],
            [
              13.61989,
              123.17553
            ],
            [
              13.6193,
              123.1759
            ],
            [
              13.61932,
              123.17634
            ],
            [
              13.6184,
              123.1765
            ],
            [
              13.61837,
              123.1755
            ],
            [
              13.61768,
              123.17568
            ],
            [
              13.61735,
              123.17517
            ],
            [
              13.61617,
              123.17593
            ],
            [
              13.61593,
              123.17733
            ],
            [
              13.61643,
              123.18035
            ],
            [
              13.61906,
              123.18252
            ],
            [
              13.61994,
              123.18392
            ],
            [
              13.62042,
              123.184
            ],
            [
              13.62048,
              123.17621
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-21",
        "name": "San Felipe",
        "labelLat": 13.64428,
        "labelLng": 123.20881
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.63335,
              123.1975
            ],
            [
              13.63337,
              123.19804
            ],
            [
              13.63395,
              123.19921
            ],
            [
              13.63458,
              123.19946
            ],
            [
              13.63562,
              123.19911
            ],
            [
              13.63607,
              123.19963
            ],
            [
              13.63596,
              123.20012
            ],
            [
              13.63503,
              123.20105
            ],
            [
              13.63496,
              123.20164
            ],
            [
              13.63646,
              123.2015
            ],
            [
              13.6371,
              123.20208
            ],
            [
              13.63706,
              123.20271
            ],
            [
              13.63676,
              123.20308
            ],
            [
              13.63534,
              123.20365
            ],
            [
              13.63494,
              123.2042
            ],
            [
              13.63485,
              123.20477
            ],
            [
              13.63527,
              123.20572
            ],
            [
              13.63598,
              123.20605
            ],
            [
              13.63749,
              123.20528
            ],
            [
              13.63796,
              123.20567
            ],
            [
              13.63801,
              123.20632
            ],
            [
              13.63768,
              123.20665
            ],
            [
              13.63571,
              123.207
            ],
            [
              13.63396,
              123.20678
            ],
            [
              13.63347,
              123.20704
            ],
            [
              13.63329,
              123.20744
            ],
            [
              13.63347,
              123.20801
            ],
            [
              13.63448,
              123.2084
            ],
            [
              13.63453,
              123.20875
            ],
            [
              13.63394,
              123.20962
            ],
            [
              13.63251,
              123.21005
            ],
            [
              13.63245,
              123.21043
            ],
            [
              13.63316,
              123.21118
            ],
            [
              13.63335,
              123.21184
            ],
            [
              13.6331,
              123.21252
            ],
            [
              13.63206,
              123.2136
            ],
            [
              13.63145,
              123.21369
            ],
            [
              13.631,
              123.21331
            ],
            [
              13.63086,
              123.21173
            ],
            [
              13.63037,
              123.2118
            ],
            [
              13.62979,
              123.21236
            ],
            [
              13.62977,
              123.21291
            ],
            [
              13.63082,
              123.21468
            ],
            [
              13.63078,
              123.21524
            ],
            [
              13.62978,
              123.21599
            ],
            [
              13.62743,
              123.21651
            ],
            [
              13.62732,
              123.21682
            ],
            [
              13.6581,
              123.21887
            ],
            [
              13.65793,
              123.21847
            ],
            [
              13.65812,
              123.21825
            ],
            [
              13.65875,
              123.21853
            ],
            [
              13.65891,
              123.21818
            ],
            [
              13.65747,
              123.21769
            ],
            [
              13.65788,
              123.21659
            ],
            [
              13.65616,
              123.21514
            ],
            [
              13.65674,
              123.21443
            ],
            [
              13.65659,
              123.21377
            ],
            [
              13.65585,
              123.21368
            ],
            [
              13.65643,
              123.21243
            ],
            [
              13.65528,
              123.21221
            ],
            [
              13.65609,
              123.21094
            ],
            [
              13.6549,
              123.21015
            ],
            [
              13.65533,
              123.20878
            ],
            [
              13.65493,
              123.20811
            ],
            [
              13.65536,
              123.20766
            ],
            [
              13.65316,
              123.20621
            ],
            [
              13.65426,
              123.20543
            ],
            [
              13.65406,
              123.20489
            ],
            [
              13.65448,
              123.20455
            ],
            [
              13.65437,
              123.2042
            ],
            [
              13.65312,
              123.20375
            ],
            [
              13.65328,
              123.20325
            ],
            [
              13.65281,
              123.20308
            ],
            [
              13.65315,
              123.2021
            ],
            [
              13.65256,
              123.20193
            ],
            [
              13.65244,
              123.20141
            ],
            [
              13.65332,
              123.20059
            ],
            [
              13.65252,
              123.20046
            ],
            [
              13.65039,
              123.1975
            ],
            [
              13.63335,
              123.1975
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-22",
        "name": "San Francisco",
        "labelLat": 13.62631,
        "labelLng": 123.18734
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.62366,
              123.186
            ],
            [
              13.62303,
              123.18692
            ],
            [
              13.62606,
              123.18876
            ],
            [
              13.62763,
              123.1891
            ],
            [
              13.6283,
              123.19003
            ],
            [
              13.62855,
              123.186
            ],
            [
              13.62366,
              123.186
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-23",
        "name": "San Isidro",
        "labelLat": 13.63743,
        "labelLng": 123.27502
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.61761,
              123.253
            ],
            [
              13.61783,
              123.25388
            ],
            [
              13.61714,
              123.25529
            ],
            [
              13.6176,
              123.25606
            ],
            [
              13.61709,
              123.25688
            ],
            [
              13.61718,
              123.25809
            ],
            [
              13.62092,
              123.26021
            ],
            [
              13.62265,
              123.26294
            ],
            [
              13.62287,
              123.2643
            ],
            [
              13.62261,
              123.26505
            ],
            [
              13.62297,
              123.26674
            ],
            [
              13.62265,
              123.26764
            ],
            [
              13.62398,
              123.2684
            ],
            [
              13.62586,
              123.26825
            ],
            [
              13.62674,
              123.27017
            ],
            [
              13.62846,
              123.27186
            ],
            [
              13.62969,
              123.27148
            ],
            [
              13.63061,
              123.27216
            ],
            [
              13.63086,
              123.27265
            ],
            [
              13.62953,
              123.27553
            ],
            [
              13.63041,
              123.2765
            ],
            [
              13.63024,
              123.27698
            ],
            [
              13.62843,
              123.27665
            ],
            [
              13.62836,
              123.27693
            ],
            [
              13.62957,
              123.2789
            ],
            [
              13.62963,
              123.27934
            ],
            [
              13.62897,
              123.28
            ],
            [
              13.62908,
              123.28042
            ],
            [
              13.63132,
              123.27992
            ],
            [
              13.63227,
              123.2801
            ],
            [
              13.63279,
              123.28109
            ],
            [
              13.63247,
              123.28223
            ],
            [
              13.63289,
              123.28261
            ],
            [
              13.63439,
              123.28249
            ],
            [
              13.63442,
              123.28293
            ],
            [
              13.6337,
              123.28357
            ],
            [
              13.63508,
              123.28409
            ],
            [
              13.63458,
              123.28596
            ],
            [
              13.63543,
              123.2869
            ],
            [
              13.63514,
              123.28875
            ],
            [
              13.63625,
              123.28916
            ],
            [
              13.63741,
              123.29158
            ],
            [
              13.63662,
              123.29249
            ],
            [
              13.63736,
              123.29243
            ],
            [
              13.63763,
              123.29273
            ],
            [
              13.63744,
              123.29427
            ],
            [
              13.63816,
              123.2968
            ],
            [
              13.63946,
              123.29804
            ],
            [
              13.64038,
              123.29839
            ],
            [
              13.63962,
              123.29969
            ],
            [
              13.64101,
              123.3001
            ],
            [
              13.6419,
              123.30142
            ],
            [
              13.642,
              123.30242
            ],
            [
              13.64262,
              123.30279
            ],
            [
              13.64329,
              123.30389
            ],
            [
              13.64333,
              123.30459
            ],
            [
              13.64302,
              123.30481
            ],
            [
              13.64335,
              123.30532
            ],
            [
              13.64257,
              123.30546
            ],
            [
              13.64265,
              123.30609
            ],
            [
              13.64433,
              123.30666
            ],
            [
              13.64432,
              123.3078
            ],
            [
              13.64481,
              123.3088
            ],
            [
              13.64327,
              123.30984
            ],
            [
              13.64501,
              123.31027
            ],
            [
              13.64409,
              123.3115
            ],
            [
              13.64524,
              123.31135
            ],
            [
              13.64598,
              123.31212
            ],
            [
              13.64524,
              123.31337
            ],
            [
              13.64533,
              123.31379
            ],
            [
              13.64578,
              123.31421
            ],
            [
              13.6469,
              123.31393
            ],
            [
              13.64704,
              123.31462
            ],
            [
              13.6462,
              123.31508
            ],
            [
              13.64631,
              123.31541
            ],
            [
              13.64877,
              123.31712
            ],
            [
              13.648,
              123.278
            ],
            [
              13.64331,
              123.253
            ],
            [
              13.61761,
              123.253
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-24",
        "name": "Santa Cruz",
        "labelLat": 13.62701,
        "labelLng": 123.1813
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.62482,
              123.186
            ],
            [
              13.62855,
              123.186
            ],
            [
              13.62981,
              123.17762
            ],
            [
              13.62495,
              123.17646
            ],
            [
              13.62482,
              123.186
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-25",
        "name": "Tabuco",
        "labelLat": 13.61699,
        "labelLng": 123.18298
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6152,
              123.18581
            ],
            [
              13.6196,
              123.18598
            ],
            [
              13.6196,
              123.18338
            ],
            [
              13.61906,
              123.18252
            ],
            [
              13.61643,
              123.18035
            ],
            [
              13.61593,
              123.17733
            ],
            [
              13.61588,
              123.17757
            ],
            [
              13.6152,
              123.17758
            ],
            [
              13.6152,
              123.18581
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-26",
        "name": "Tinago",
        "labelLat": 13.62519,
        "labelLng": 123.19213
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6208,
              123.1895
            ],
            [
              13.6208,
              123.1945
            ],
            [
              13.63032,
              123.1945
            ],
            [
              13.63037,
              123.19348
            ],
            [
              13.6299,
              123.19227
            ],
            [
              13.62792,
              123.1895
            ],
            [
              13.6208,
              123.1895
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BRGY-27",
        "name": "Triangulo",
        "labelLat": 13.61224,
        "labelLng": 123.18999
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              13.6208,
              123.18603
            ],
            [
              13.60289,
              123.18532
            ],
            [
              13.60233,
              123.18613
            ],
            [
              13.60611,
              123.19482
            ],
            [
              13.6208,
              123.1945
            ],
            [
              13.6208,
              123.18603
            ]
          ]
        ]
      }
    }
  ]
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
    lat: 13.6275,
    lng: 123.2215,
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
    lat: 13.6192,
    lng: 123.1766,
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
    lat: 13.6178,
    lng: 123.2042,
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
    lat: 13.6118,
    lng: 123.1924,
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
    lat: 13.6335,
    lng: 123.1922,
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
    lat: 13.6095,
    lng: 123.1818,
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
    lat: 13.6164,
    lng: 123.1848,
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
    lat: 13.6470,
    lng: 123.2240,
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
    role: 'RESIDENT',
    label: 'Community Resident',
    shortLabel: 'Resident',
    organization: 'Public Water Safety Portal',
    requiresCredentials: false,
    defaultCode: '',
    permissions: ['view_public_map', 'locate_safe_kiosk', 'submit_incident'],
    description:
      'Locate nearest functional Safe (<35) potable kiosks, view simplified safety ratings and hygiene tips, and report water issues.',
  },
  {
    role: 'BHW',
    label: 'BHW',
    shortLabel: 'BHW',
    organization: 'Barangay Health Worker Field Kit',
    requiresCredentials: true,
    defaultCode: 'BHW-NAGA-2026',
    permissions: ['view_public_map', 'submit_incident', 'log_field_kit', 'offline_pwa_sync'],
    description:
      'Log mobile field-kit telemetry (pH, TDS, turbidity, coliform), update hardware status, and flag sanitation hazards offline or online.',
  },
  {
    role: 'CDRRMO',
    label: 'CDRRMO Operator',
    shortLabel: 'CDRRMO',
    organization: 'Disaster Risk Reduction & Tanker Ops',
    requiresCredentials: true,
    defaultCode: 'CDRRMO-NAGA-2026',
    permissions: ['view_public_map', 'toggle_flood_overlay', 'dispatch_tanker', 'manage_evac_camps', 'broadcast_advisory'],
    description:
      'Manage flood overlays, dispatch or reroute emergency tankers, track evacuation camp water security, and broadcast boil-water advisories.',
  },
  {
    role: 'LGU_COORDINATOR',
    label: 'LGU / WASH Coordinator',
    shortLabel: 'LGU WASH',
    organization: 'Municipal WASH Registry & Governance',
    requiresCredentials: true,
    defaultCode: 'WASH-ADMIN-2026',
    permissions: ['view_public_map', 'register_facility', 'equity_analytics', 'broadcast_policy', 'configure_thresholds', 'reset_baseline'],
    description:
      'Register new kiosks, solar pumps, or shallow wells, monitor barangay water access equity, broadcast WASH guidelines, and configure WVI thresholds.',
  },
];

export const INITIAL_ADVISORIES_FALLBACK = [
  {
    id: 'ADV-2026-01',
    barangay_name: 'Sabang',
    level: 'Boil-Water Advisory',
    message: 'Boil drinking water for at least 3 minutes or draw from CDRRMO Tanker #01 stationed near Sabang Public Kiosk.',
    issued_by: 'CDRRMO Operations Center',
    timestamp: '2026-11-14T09:20:00Z',
  },
  {
    id: 'ADV-2026-02',
    barangay_name: 'Tabuco',
    level: 'Emergency Tanker Order',
    message: 'Direct well extraction suspended at NAGA-07 due to positive coliform and elevated turbidity; tanker rationing active.',
    issued_by: 'Naga City Health Office / CDRRMO',
    timestamp: '2026-11-14T10:12:00Z',
  },
];

export const INITIAL_EVACUATION_CAMPS_FALLBACK = [
  {
    id: 'CAMP-01',
    name: 'Jesse M. Robredo Coliseum',
    barangay_name: 'Triangulo',
    lat: 13.6226,
    lng: 123.1955,
    evacuees: 420,
    daily_demand_liters: 6300,
    supply_liters: 4800,
    status: 'Dispatch Needed',
    last_updated: '2026-11-14T10:00:00Z',
  },
  {
    id: 'CAMP-02',
    name: "Naga City People's Hall",
    barangay_name: 'Concepcion Pequeña',
    lat: 13.6194,
    lng: 123.1948,
    evacuees: 185,
    daily_demand_liters: 2775,
    supply_liters: 3200,
    status: 'Adequate',
    last_updated: '2026-11-14T09:45:00Z',
  },
  {
    id: 'CAMP-03',
    name: 'Sabang Barangay Evacuation Center',
    barangay_name: 'Sabang',
    lat: 13.6191,
    lng: 123.1806,
    evacuees: 260,
    daily_demand_liters: 3900,
    supply_liters: 1600,
    status: 'Critical Deficit',
    last_updated: '2026-11-14T10:30:00Z',
  },
];

export const HYGIENE_AND_CONSERVATION_TIPS = [
  {
    title: '3-Minute Rolling Boil Rule',
    detail: 'During Advisory (35–64) alerts or heavy monsoon runoff, boil tap/kiosk water for 3 minutes and store in covered clean containers.',
  },
  {
    title: 'Check Mobile Tanker Chlorine (0.5–1.5 mg/L)',
    detail: 'Confirm DOH AO 2017-0010 free residual chlorine strip reading at CDRRMO tankers before filling household drums.',
  },
  {
    title: 'Protect Wellheads & Greywater Drainage',
    detail: 'Keep septic and laundry runoff at least 25 m downstream of shallow wells and report loose handpump seals immediately.',
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
      const [x, , z] = geoToWorld(lat, lng);
      return { x, z };
    });
    const sampled = sampleCatmullRomXZ(pts, 160);
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
  ...NAGA_OSM_PRIMARY_ROADS.map((coords) => ({ coords, halfWidth: ROAD_RENDER_WIDTHS.primaryCurbHalfWidth })),
  ...NAGA_SECONDARY_STREETS.map((coords) => ({ coords, halfWidth: ROAD_RENDER_WIDTHS.secondaryCurbHalfWidth })),
  ...NAGA_OSM_SECONDARY_ROADS.map((coords) => ({ coords, halfWidth: ROAD_RENDER_WIDTHS.secondaryCurbHalfWidth })),
  ...NAGA_TERTIARY_ROADS.map((coords) => ({ coords, halfWidth: ROAD_RENDER_WIDTHS.tertiaryCurbHalfWidth })),
  ...NAGA_LOCAL_STREETS.map((coords) => ({ coords, halfWidth: ROAD_RENDER_WIDTHS.localCurbHalfWidth })),
];

const ROAD_GRID_CELL = 0.6;
export const ALL_ROAD_SEGMENTS_XZ = [];
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

export function getFootprintCheckPoints(cx, cz, w, d, rot = 0) {
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

export function obbOverlaps2D(a, b, pad = 0.012) {
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

export function isClearOfInfrastructure(
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

// --- STAGE 2 BUILDING FOOTPRINTS & URBAN LAYOUT (Verified OSM + Barangay-Aware 1:1 Archetypes #1–#12) ---
export { NAGA_BUILDING_METADATA };

export const BUILDING_ARCHETYPE_CATALOG = {
  1: { id: 1, name: 'Low-Cost Corrugated-Metal Dwelling (Barong-Barong)', w: 0.132, d: 0.122, h: 0.116, levels: 1, type: 'residential_hip' },
  2: { id: 2, name: 'Bahay Kubo (Bamboo & Nipa Stilt House)', w: 0.210, d: 0.106, h: 0.152, levels: 1, type: 'residential_hip' },
  3: { id: 3, name: 'Modern Small House V1 (Concrete Bungalow)', w: 0.158, d: 0.124, h: 0.108, levels: 1, type: 'residential_hip' },
  4: { id: 4, name: 'Sari-Sari Store / Neighborhood Convenience Store', w: 0.162, d: 0.122, h: 0.098, levels: 1, type: 'commercial_lowrise' },
  5: { id: 5, name: 'Low-Rise Walk-Up Apartment', w: 0.174, d: 0.134, h: 0.186, levels: 3, type: 'commercial_midrise' },
  6: { id: 6, name: 'Suburban Two-Story House V2 (Cobalt Blue 2F)', w: 0.168, d: 0.130, h: 0.154, levels: 2, type: 'residential_hip' },
  7: { id: 7, name: 'Water Refilling Station', w: 0.154, d: 0.118, h: 0.100, levels: 1, type: 'commercial_lowrise' },
  8: { id: 8, name: 'Suburban Two-Story House V1 (Octagonal Bay & Teal Gate)', w: 0.168, d: 0.130, h: 0.156, levels: 2, type: 'residential_hip' },
  9: { id: 9, name: 'Asian Shophouse V1 (Two-Tone Red/Rust Roof)', w: 0.168, d: 0.128, h: 0.162, levels: 2, type: 'commercial_lowrise' },
  10: { id: 10, name: 'Modern Small House V2 (Red-Orange Trim & Blue Valance)', w: 0.148, d: 0.120, h: 0.106, levels: 1, type: 'residential_hip' },
  11: { id: 11, name: 'Modern Small House V3 (Crimson Roof & AC Window)', w: 0.152, d: 0.120, h: 0.108, levels: 1, type: 'residential_hip' },
  12: { id: 12, name: 'Asian Shophouse V2 (Rust/Grey GI Roof & Right Balcony)', w: 0.168, d: 0.128, h: 0.162, levels: 2, type: 'commercial_lowrise' },
};

function pointInRingLatLng(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > lng) !== (yj > lng)) && (lat < ((xj - xi) * (lng - yi)) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function getBarangayForLatLng(lat, lng) {
  for (const feat of NAGA_BARANGAYS_GEOJSON.features) {
    const ring = feat.geometry?.coordinates?.[0];
    if (ring && pointInRingLatLng(lat, lng, ring)) {
      return feat.properties.name;
    }
  }
  let bestName = 'Concepcion Pequeña';
  let bestD2 = Infinity;
  for (const feat of NAGA_BARANGAYS_GEOJSON.features) {
    const dLat = lat - feat.properties.labelLat;
    const dLng = lng - feat.properties.labelLng;
    const d2 = dLat * dLat + dLng * dLng;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestName = feat.properties.name;
    }
  }
  return bestName;
}

export function getNearestRoadInfoXZ(px, pz, fallbackRot = 0) {
  let bestDist = Infinity;
  let bestCx = px;
  let bestCz = pz;
  let bestHw = 0.07;
  let bestSegAngle = fallbackRot;
  let secondSegAngle = null;

  const searchR = 1.2;
  const gx0 = Math.floor((px - searchR) / ROAD_GRID_CELL);
  const gx1 = Math.floor((px + searchR) / ROAD_GRID_CELL);
  const gz0 = Math.floor((pz - searchR) / ROAD_GRID_CELL);
  const gz1 = Math.floor((pz + searchR) / ROAD_GRID_CELL);

  roadQueryEpoch++;
  const epoch = roadQueryEpoch;

  for (let gx = gx0; gx <= gx1; gx++) {
    for (let gz = gz0; gz <= gz1; gz++) {
      const bucket = ROAD_SEG_GRID.get(`${gx},${gz}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const sIdx = bucket[i];
        if (ROAD_SEG_SEEN[sIdx] === epoch) continue;
        ROAD_SEG_SEEN[sIdx] = epoch;
        const seg = ALL_ROAD_SEGMENTS_XZ[sIdx];
        const vx = seg.bx - seg.ax;
        const vz = seg.bz - seg.az;
        const lenSq = vx * vx + vz * vz;
        const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - seg.ax) * vx + (pz - seg.az) * vz) / lenSq)) : 0;
        const cx = seg.ax + t * vx;
        const cz = seg.az + t * vz;
        const d = Math.hypot(px - cx, pz - cz);
        const segAng = Math.atan2(vx, vz);
        if (d < bestDist) {
          if (bestDist < 0.42 && Math.abs(Math.sin(segAng - bestSegAngle)) > 0.45) {
            secondSegAngle = bestSegAngle;
          }
          bestDist = d;
          bestCx = cx;
          bestCz = cz;
          bestHw = seg.halfWidth;
          bestSegAngle = segAng;
        } else if (d < 0.42 && Math.abs(Math.sin(segAng - bestSegAngle)) > 0.45) {
          secondSegAngle = segAng;
        }
      }
    }
  }

  let roadFacingRot = fallbackRot;
  if (bestDist < 1.15 && bestDist > 1e-4) {
    // Local +Z is the front facade in CityBuildingBatcher; point +Z toward the nearest road segment
    roadFacingRot = Math.atan2(bestCx - px, bestCz - pz);
  }
  const isCorner = secondSegAngle !== null && bestDist < 0.38;
  return { dist: bestDist, cx: bestCx, cz: bestCz, halfWidth: bestHw, rot: roadFacingRot, isCorner };
}

function selectArchetypeForBuilding(brgy, lat, lng, roadInfo, riverDist, raw, idx = 0) {
  if (raw.type && raw.type !== 'residential_hip') return null;
  const set3Variants = [11, 10, 3];
  const set4Variants = [8, 6];
  const set6Shophouses = [9, 12];
  const pickSet3 = () => set3Variants[idx % 3];
  const pickSet4 = () => set4Variants[idx % 2];
  const pickShophouse = () => set6Shophouses[idx % 2];
  switch (brgy) {
    // Set 1 + Set 5 corner/corridor stores + Set 6 Centro Shophouses
    case 'Sabang':
      return roadInfo.isCorner || idx % 6 === 0 ? 4 : 1;
    case 'Lerma':
      return idx % 3 === 1 ? 7 : 1;
    case 'Tabuco':
      return idx % 2 === 1 ? 7 : 1;
    case 'Mabolo':
      return 1;
    case 'Igualdad':
      return roadInfo.dist < 0.24 && idx % 3 === 0 ? pickShophouse() : 1;
    // Road-adjacent lots in Pacol & Cararayan -> Set 3 bungalows (Bahay Kubo removed)
    case 'Pacol':
    case 'Cararayan':
      return roadInfo.dist < 0.30 && idx % 2 === 0 ? pickSet3() : null;
    case 'Carolina':
    case 'Panicuason':
    case 'San Isidro':
      return null;
    // Set 3 Task — Modern Small Concrete Bungalows (#11, #10, #3) + Set 5 Water Stations + Set 6 Magsaysay/Panganiban Shophouses
    case 'Concepcion Pequeña':
      if (roadInfo.dist < 0.26 && idx % 6 === 0) return 7;
      if (roadInfo.dist < 0.22 && idx % 4 === 1) return pickShophouse();
      return pickSet3();
    case 'Balatas':
      return pickSet3();
    // Set 3 & Set 4 blend + Set 5 Water Stations in San Felipe
    case 'Concepcion Grande':
    case 'Del Rosario':
      return idx % 5 < 2 ? pickSet4() : pickSet3();
    case 'San Felipe':
      if (roadInfo.dist < 0.24 && idx % 9 === 0) return 7;
      return idx % 5 < 2 ? pickSet4() : pickSet3();
    // Set 4 + Set 6 Walk-Up Apartments (#5) + Set 5 Corner Sari-Sari Stores
    case 'Bagumbayan Norte':
      return pickSet4();
    case 'Bagumbayan Sur':
      return idx % 3 === 0 ? 5 : pickSet4();
    case 'Liboton':
      return idx % 2 === 0 ? 5 : pickSet4();
    case 'Peñafrancia':
      if (roadInfo.isCorner) return 4;
      return idx % 2 === 0 ? 5 : pickSet4();
    // Set 5 Task — Sari-Sari Stores (#4) & Water Stations (#7) + Set 6 Walk-Up Apartments (#5) & Shophouses (#9, #12)
    case 'Abella':
      if (roadInfo.isCorner || idx % 5 === 0) return 4;
      if (roadInfo.dist < 0.20 && idx % 4 === 2) return pickShophouse();
      return null;
    case 'Sta. Cruz':
      if (roadInfo.isCorner || idx % 5 === 0) return 4;
      return 5;
    case 'Calauag':
      if (roadInfo.isCorner || idx % 6 === 0) return 4;
      if (roadInfo.dist < 0.26 && idx % 5 === 1) return 7;
      if (roadInfo.dist < 0.20 && idx % 4 === 2) return pickShophouse();
      return null;
    case 'Triangulo':
      if (roadInfo.isCorner || idx % 5 === 0) return 4;
      if (roadInfo.dist < 0.38 && idx % 3 === 0) return 7;
      if (roadInfo.dist < 0.20 && idx % 4 === 2) return pickShophouse();
      return null;
    // Set 6 Task — Walk-Up Apartments (#5) & Centro / Commercial Avenue Shophouses (#9, #12)
    case 'Dinaga':
      return idx % 2 === 0 ? 5 : pickShophouse();
    case 'San Francisco':
    case 'Dayangdang':
    case 'Tinago':
      return pickShophouse();
    default:
      return null;
  }
}

export const NAGA_BUILDING_CLUSTERS = (() => {
  const placed = [];
  const placedBoxes = [];

  for (let i = 0; i < NAGA_OSM_BUILDINGS.length; i++) {
    const raw = NAGA_OSM_BUILDINGS[i];
    const [rawX, , rawZ] = geoToWorld(raw.lat, raw.lng);
    const brgy = getBarangayForLatLng(raw.lat, raw.lng);
    const roadInfo = getNearestRoadInfoXZ(rawX, rawZ, raw.rot || 0);
    const riverInfo = getMinRiverChannelInfoXZ(rawX, rawZ);

    const archetypeId = selectArchetypeForBuilding(brgy, raw.lat, raw.lng, roadInfo, riverInfo.dist, raw, i);
    if (!archetypeId) {
      const halfR = Math.hypot(raw.w, raw.d) * 0.48;
      placedBoxes.push({ x: rawX, z: rawZ, r: halfR * 0.85, w: raw.w, d: raw.d, rot: raw.rot || 0 });
      placed.push({
        ...raw,
        barangay: brgy,
      });
      continue;
    }

    const spec = BUILDING_ARCHETYPE_CATALOG[archetypeId];
    const scaleJitter = 0.94 + ((i * 17) % 13) * 0.01;
    const targetW = Number((spec.w * scaleJitter).toFixed(4));
    const targetD = Number((spec.d * scaleJitter).toFixed(4));
    const h = Number((spec.h * scaleJitter).toFixed(4));
    const roadRot = Number(roadInfo.rot.toFixed(4));

    let alignedRawRot = raw.rot || 0;
    if (roadInfo.dist < 1.15) {
      const toRoadX = roadInfo.cx - rawX;
      const toRoadZ = roadInfo.cz - rawZ;
      const dot = Math.sin(alignedRawRot) * toRoadX + Math.cos(alignedRawRot) * toRoadZ;
      if (dot < 0) alignedRawRot += Math.PI;
    }
    alignedRawRot = Number(alignedRawRot.toFixed(4));

    const candidates = [
      { w: targetW, d: targetD, rot: roadRot },
      { w: Math.min(targetW, raw.w), d: Math.min(targetD, raw.d), rot: alignedRawRot },
      { w: Math.min(targetW, raw.w * 0.92), d: Math.min(targetD, raw.d * 0.92), rot: alignedRawRot },
    ];

    let chosen = null;
    for (const cand of candidates) {
      const halfR = Math.hypot(cand.w, cand.d) * 0.48;
      if (isClearOfInfrastructure(raw.lat, raw.lng, halfR * 0.84, placedBoxes, cand.w, cand.d, cand.rot)) {
        chosen = { ...cand, halfR };
        break;
      }
    }
    if (!chosen) {
      const w = Number(Math.min(targetW, Math.max(0.118, raw.w * 0.94)).toFixed(4));
      const d = Number(Math.min(targetD, Math.max(0.102, raw.d * 0.94)).toFixed(4));
      const halfR = Math.hypot(w, d) * 0.48;
      chosen = { w, d, rot: alignedRawRot, halfR };
    }

    placedBoxes.push({ x: rawX, z: rawZ, r: chosen.halfR * 0.85, w: chosen.w, d: chosen.d, rot: chosen.rot });
    placed.push({
      ...raw,
      rot: chosen.rot,
      w: chosen.w,
      d: chosen.d,
      h,
      levels: 1,
      type: 'residential_hip',
      archetypeId,
      archetypeName: spec.name,
      barangay: brgy,
      footprint: null,
      footprintShape: 'rect',
    });
  }

  // Add supplemental Set 1 riparian & inner-block lots in Sabang, Mabolo, Tabuco, Igualdad, and Lerma
  const set1SupplementalSeeds = [
    // Sabang riparian & inner-block pockets
    [13.6168, 123.1755], [13.6155, 123.1735], [13.6176, 123.1778], [13.6184, 123.1762],
    // Mabolo low-lying riparian pockets
    [13.6085, 123.1745], [13.6072, 123.1725], [13.6115, 123.1752], [13.6098, 123.1768],
    // Tabuco river/creek edge & inner-block pockets
    [13.6188, 123.1852], [13.6192, 123.1862], [13.6156, 123.1862], [13.6162, 123.1872],
    [13.6172, 123.1874], [13.6180, 123.1876], [13.6155, 123.1852],
    // Igualdad riparian & inner-block pockets
    [13.6215, 123.1782], [13.6226, 123.1775], [13.6206, 123.1796], [13.6212, 123.1768],
    // Lerma creek edge & dense inner-block pockets
    [13.6194, 123.1904], [13.6188, 123.1902], [13.6174, 123.1902], [13.6174, 123.1922],
    [13.6186, 123.1936], [13.6196, 123.1938], [13.6170, 123.1912],
  ];

  set1SupplementalSeeds.forEach(([sLat, sLng], sIdx) => {
    const spec = BUILDING_ARCHETYPE_CATALOG[1];
    const [x, , z] = geoToWorld(sLat, sLng);
    const roadInfo = getNearestRoadInfoXZ(x, z, (sIdx * 1.1) % 3.14);
    const rot = Number(roadInfo.rot.toFixed(4));
    const w = spec.w;
    const d = spec.d;
    const h = spec.h;
    const halfR = Math.hypot(w, d) * 0.52;
    if (!isClearOfInfrastructure(sLat, sLng, halfR * 0.86, placedBoxes, w, d, rot)) return;
    const brgy = getBarangayForLatLng(sLat, sLng);
    placedBoxes.push({ x, z, r: halfR * 0.88, w, d, rot });
    placed.push({
      id: `BLDG-SET1-${sIdx + 1}`,
      lat: sLat,
      lng: sLng,
      rot,
      w,
      d,
      h,
      levels: 1,
      type: 'residential_hip',
      archetypeId: 1,
      archetypeName: spec.name,
      barangay: brgy,
      footprint: null,
      footprintShape: 'rect',
      dataSource: 'set1_riparian_infill',
    });
  });

  return placed;
})();

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


// ============================================================================
// STEP 1 SPATIAL ANALYTICAL LAYERS (RFC 7946 [lng, lat] GeoJSON, EPSG:4326)
// ============================================================================

export const NAGA_BARANGAY_METADATA = {
  Abella: { population: 5420, baselineWvi: 52, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.5m – 1.2m' },
  'Bagumbayan Norte': { population: 3680, baselineWvi: 31, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.3m – 0.9m' },
  'Bagumbayan Sur': { population: 5890, baselineWvi: 34, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.4m – 1.1m' },
  Balatas: { population: 11240, baselineWvi: 42, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.5m – 1.3m' },
  Calauag: { population: 12180, baselineWvi: 46, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.5m – 1.3m' },
  Cararayan: { population: 15840, baselineWvi: 19, floodTier: 'upland', hazardClassification: 'Upland Runoff / Landslide Buffer', floodDepth: 'Runoff / Slope' },
  Carolina: { population: 6420, baselineWvi: 14, floodTier: 'upland', hazardClassification: 'Upland Runoff / Landslide Buffer', floodDepth: 'Runoff / Slope' },
  'Concepcion Grande': { population: 13210, baselineWvi: 33, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.4m – 1.1m' },
  'Concepcion Pequeña': { population: 24890, baselineWvi: 38, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.6m – 1.4m' },
  Dayangdang: { population: 4910, baselineWvi: 44, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.5m – 1.2m' },
  'Del Rosario': { population: 8940, baselineWvi: 28, floodTier: 'upland', hazardClassification: 'Upland Runoff / Landslide Buffer', floodDepth: 'Runoff / Slope' },
  Dinaga: { population: 620, baselineWvi: 68, floodTier: 'high', hazardClassification: 'High Flood Depth (>1.5m–3.0m+)', floodDepth: '1.6m – 2.8m' },
  'Igualdad Interior': { population: 3480, baselineWvi: 74, floodTier: 'high', hazardClassification: 'High Flood Depth (>1.5m–3.0m+)', floodDepth: '1.8m – 3.1m' },
  Lerma: { population: 2890, baselineWvi: 67, floodTier: 'high', hazardClassification: 'High Flood Depth (>1.5m–3.0m+)', floodDepth: '1.5m – 2.6m' },
  Liboton: { population: 3320, baselineWvi: 36, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.4m – 1.1m' },
  Mabolo: { population: 8760, baselineWvi: 69, floodTier: 'high', hazardClassification: 'High Flood Depth (>1.5m–3.0m+)', floodDepth: '1.8m – 3.2m+' },
  Pacol: { population: 13450, baselineWvi: 18, floodTier: 'upland', hazardClassification: 'Upland Runoff / Landslide Buffer', floodDepth: 'Runoff / Slope' },
  Panicuason: { population: 3120, baselineWvi: 12, floodTier: 'upland', hazardClassification: 'Upland Runoff / Landslide Buffer', floodDepth: 'Runoff / Slope' },
  'Peñafrancia': { population: 7340, baselineWvi: 49, floodTier: 'high', hazardClassification: 'High Flood Depth (>1.5m–3.0m+)', floodDepth: '1.5m – 2.4m' },
  Sabang: { population: 7190, baselineWvi: 86, floodTier: 'high', hazardClassification: 'High Flood Depth (>1.5m–3.0m+)', floodDepth: '2.0m – 3.4m+' },
  'San Felipe': { population: 21450, baselineWvi: 32, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.4m – 1.0m' },
  'San Francisco': { population: 1240, baselineWvi: 45, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.6m – 1.3m' },
  'San Isidro': { population: 3420, baselineWvi: 22, floodTier: 'upland', hazardClassification: 'Upland Runoff / Landslide Buffer', floodDepth: 'Runoff / Slope' },
  'Santa Cruz': { population: 7850, baselineWvi: 41, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.5m – 1.3m' },
  Tabuco: { population: 4380, baselineWvi: 91, floodTier: 'high', hazardClassification: 'High Flood Depth (>1.5m–3.0m+)', floodDepth: '2.1m – 3.5m+' },
  Tinago: { population: 3610, baselineWvi: 47, floodTier: 'moderate', hazardClassification: 'Moderate Flood Susceptibility (<1.5m)', floodDepth: '0.6m – 1.4m' },
  Triangulo: { population: 10980, baselineWvi: 66, floodTier: 'high', hazardClassification: 'High Flood Depth (>1.5m–3.0m+)', floodDepth: '1.6m – 2.9m' },
};

export function buildBarangayChoroplethGeoJson(waterPoints = [], backendBarangays = []) {
  const backendByName = new globalThis.Map(
    (backendBarangays || []).map((b) => [(b.name || '').toLowerCase(), b])
  );
  return {
    type: 'FeatureCollection',
    features: NAGA_BARANGAYS_GEOJSON.features.map((feat) => {
      const name = feat.properties.name;
      const meta = NAGA_BARANGAY_METADATA[name] || {
        population: 5000,
        baselineWvi: 35,
        floodTier: 'moderate',
        hazardClassification: 'Moderate Flood Susceptibility (<1.5m)',
        floodDepth: '0.5m – 1.2m',
      };
      const liveBrgy = backendByName.get(name.toLowerCase());
      const matching = waterPoints.filter(
        (wp) => (wp.barangay || '').toLowerCase() === name.toLowerCase()
      );
      const wviScore =
        liveBrgy != null
          ? Number(liveBrgy.wvi_score)
          : matching.length > 0
          ? Math.max(...matching.map((m) => m.wvi_score || 0))
          : meta.baselineWvi;

      // Convert [lat, lng] boundary ring to RFC 7946 [lng, lat]
      const ringLngLat = feat.geometry.coordinates[0].map(([lat, lng]) => [lng, lat]);

      return {
        type: 'Feature',
        properties: {
          id: feat.properties.id,
          name,
          displayName: name === 'Igualdad' ? 'Igualdad Interior' : name === 'Sta. Cruz' ? 'Santa Cruz' : name,
          lat: feat.properties.labelLat,
          lng: feat.properties.labelLng,
          wvi_score: Number(wviScore.toFixed(1)),
          population_exposure: liveBrgy?.population_exposure ?? meta.population,
          flood_tier: liveBrgy?.flood_tier ?? meta.floodTier,
          hazard_classification: liveBrgy?.hazard_classification ?? meta.hazardClassification,
          flood_depth: liveBrgy?.flood_depth ?? meta.floodDepth,
          facility_count: liveBrgy?.active_facility_count ?? matching.length,
        },
        geometry: {
          type: 'Polygon',
          coordinates: [ringLngLat],
        },
      };
    }),
  };
}

// Multi-tier LDRRM Flood Susceptibility & Watershed Hazard Polygons ([lng, lat])
export const NAGA_FLOOD_HAZARD_GEOJSON = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "HAZ-HIGH-CONFLUENCE",
        "name": "Bicol–Naga River Confluence Floodplain",
        "tier": "high",
        "classification": "High Flood Depth (>1.5m–3.0m+)",
        "depthRange": "1.5m – 3.5m+",
        "barangays": "Sabang, Tabuco, Mabolo, Triangulo, Dinaga, Igualdad Interior, Lerma, lower Peñafrancia"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              123.17671,
              13.626
            ],
            [
              123.17581,
              13.62224
            ],
            [
              123.17696,
              13.62146
            ],
            [
              123.17597,
              13.62106
            ],
            [
              123.17627,
              13.62033
            ],
            [
              123.17553,
              13.61989
            ],
            [
              123.1759,
              13.6193
            ],
            [
              123.17634,
              13.61932
            ],
            [
              123.1765,
              13.6184
            ],
            [
              123.1755,
              13.61837
            ],
            [
              123.17568,
              13.61768
            ],
            [
              123.17517,
              13.61735
            ],
            [
              123.17593,
              13.61617
            ],
            [
              123.17757,
              13.61588
            ],
            [
              123.17759,
              13.61335
            ],
            [
              123.17694,
              13.61126
            ],
            [
              123.17596,
              13.61059
            ],
            [
              123.17776,
              13.60967
            ],
            [
              123.18054,
              13.60725
            ],
            [
              123.18306,
              13.60651
            ],
            [
              123.1846,
              13.60451
            ],
            [
              123.18536,
              13.60278
            ],
            [
              123.18613,
              13.60233
            ],
            [
              123.19364,
              13.60559
            ],
            [
              123.194,
              13.6195
            ],
            [
              123.1945,
              13.6245
            ],
            [
              123.1995,
              13.6285
            ],
            [
              123.2015,
              13.6335
            ],
            [
              123.1955,
              13.6318
            ],
            [
              123.189,
              13.6265
            ],
            [
              123.1845,
              13.6242
            ],
            [
              123.1795,
              13.6245
            ],
            [
              123.17671,
              13.626
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "HAZ-MOD-URBAN",
        "name": "Mid-Elevation Urban & Subdivision Corridor",
        "tier": "moderate",
        "classification": "Moderate Flood Susceptibility (<1.5m)",
        "depthRange": "0.4m – 1.4m",
        "barangays": "Santa Cruz, San Francisco, Calauag, Concepcion Pequeña, Concepcion Grande, Balatas, Dayangdang"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              123.21887,
              13.6581
            ],
            [
              123.21847,
              13.65793
            ],
            [
              123.21825,
              13.65812
            ],
            [
              123.21853,
              13.65875
            ],
            [
              123.21818,
              13.65891
            ],
            [
              123.21769,
              13.65747
            ],
            [
              123.21659,
              13.65788
            ],
            [
              123.21514,
              13.65616
            ],
            [
              123.21443,
              13.65674
            ],
            [
              123.21377,
              13.65659
            ],
            [
              123.21368,
              13.65585
            ],
            [
              123.21243,
              13.65643
            ],
            [
              123.21221,
              13.65528
            ],
            [
              123.21094,
              13.65609
            ],
            [
              123.21015,
              13.6549
            ],
            [
              123.20878,
              13.65533
            ],
            [
              123.20811,
              13.65493
            ],
            [
              123.20766,
              13.65536
            ],
            [
              123.20621,
              13.65316
            ],
            [
              123.20543,
              13.65426
            ],
            [
              123.20489,
              13.65406
            ],
            [
              123.20455,
              13.65448
            ],
            [
              123.2042,
              13.65437
            ],
            [
              123.20375,
              13.65312
            ],
            [
              123.20325,
              13.65328
            ],
            [
              123.20308,
              13.65281
            ],
            [
              123.2021,
              13.65315
            ],
            [
              123.20193,
              13.65256
            ],
            [
              123.20141,
              13.65244
            ],
            [
              123.20059,
              13.65332
            ],
            [
              123.20046,
              13.65252
            ],
            [
              123.19636,
              13.64956
            ],
            [
              123.19599,
              13.64792
            ],
            [
              123.19423,
              13.64632
            ],
            [
              123.19161,
              13.6478
            ],
            [
              123.19027,
              13.64752
            ],
            [
              123.18855,
              13.64491
            ],
            [
              123.18718,
              13.64444
            ],
            [
              123.18736,
              13.64264
            ],
            [
              123.18711,
              13.64229
            ],
            [
              123.18596,
              13.64121
            ],
            [
              123.18552,
              13.6412
            ],
            [
              123.185,
              13.64053
            ],
            [
              123.18514,
              13.63981
            ],
            [
              123.18269,
              13.63768
            ],
            [
              123.18137,
              13.63709
            ],
            [
              123.18178,
              13.63601
            ],
            [
              123.17936,
              13.63291
            ],
            [
              123.17947,
              13.63261
            ],
            [
              123.17816,
              13.63208
            ],
            [
              123.17671,
              13.626
            ],
            [
              123.1795,
              13.6245
            ],
            [
              123.1845,
              13.6242
            ],
            [
              123.189,
              13.6265
            ],
            [
              123.1955,
              13.6318
            ],
            [
              123.2015,
              13.6335
            ],
            [
              123.1995,
              13.6285
            ],
            [
              123.1945,
              13.6245
            ],
            [
              123.194,
              13.6195
            ],
            [
              123.19364,
              13.60559
            ],
            [
              123.20073,
              13.60868
            ],
            [
              123.20119,
              13.60916
            ],
            [
              123.20896,
              13.61022
            ],
            [
              123.21313,
              13.61152
            ],
            [
              123.21655,
              13.61106
            ],
            [
              123.21864,
              13.61115
            ],
            [
              123.2205,
              13.61214
            ],
            [
              123.22079,
              13.61144
            ],
            [
              123.22359,
              13.61102
            ],
            [
              123.22618,
              13.61181
            ],
            [
              123.22728,
              13.61156
            ],
            [
              123.2277,
              13.617
            ],
            [
              123.2165,
              13.623
            ],
            [
              123.21887,
              13.6581
            ]
          ]
        ]
      }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "HAZ-UPLAND-ISAROG",
        "name": "Mt. Isarog Foothill Runoff & Landslide Buffer",
        "tier": "upland",
        "classification": "Upland Runoff / Landslide Buffer",
        "depthRange": "Flash Runoff / Slope",
        "barangays": "Cararayan, Carolina, Del Rosario, Pacol, Panicuason, San Isidro"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              123.22728,
              13.61156
            ],
            [
              123.22867,
              13.61178
            ],
            [
              123.22939,
              13.61096
            ],
            [
              123.23029,
              13.61067
            ],
            [
              123.23142,
              13.61089
            ],
            [
              123.23274,
              13.61053
            ],
            [
              123.23324,
              13.61098
            ],
            [
              123.2357,
              13.61166
            ],
            [
              123.23828,
              13.61024
            ],
            [
              123.23916,
              13.61044
            ],
            [
              123.24007,
              13.61181
            ],
            [
              123.24064,
              13.61477
            ],
            [
              123.24161,
              13.61522
            ],
            [
              123.24265,
              13.61754
            ],
            [
              123.24369,
              13.61789
            ],
            [
              123.24341,
              13.62011
            ],
            [
              123.244,
              13.62002
            ],
            [
              123.24475,
              13.62061
            ],
            [
              123.24595,
              13.62037
            ],
            [
              123.24598,
              13.6208
            ],
            [
              123.24527,
              13.62119
            ],
            [
              123.24564,
              13.62222
            ],
            [
              123.24657,
              13.62249
            ],
            [
              123.24676,
              13.62211
            ],
            [
              123.24802,
              13.62312
            ],
            [
              123.24906,
              13.62272
            ],
            [
              123.24926,
              13.62159
            ],
            [
              123.24997,
              13.62048
            ],
            [
              123.24914,
              13.61973
            ],
            [
              123.24869,
              13.61837
            ],
            [
              123.24997,
              13.61828
            ],
            [
              123.25164,
              13.61904
            ],
            [
              123.25193,
              13.61735
            ],
            [
              123.25388,
              13.61783
            ],
            [
              123.25529,
              13.61714
            ],
            [
              123.25606,
              13.6176
            ],
            [
              123.25688,
              13.61709
            ],
            [
              123.25809,
              13.61718
            ],
            [
              123.26021,
              13.62092
            ],
            [
              123.26294,
              13.62265
            ],
            [
              123.2643,
              13.62287
            ],
            [
              123.26505,
              13.62261
            ],
            [
              123.26674,
              13.62297
            ],
            [
              123.26764,
              13.62265
            ],
            [
              123.2684,
              13.62398
            ],
            [
              123.26825,
              13.62586
            ],
            [
              123.27017,
              13.62674
            ],
            [
              123.27186,
              13.62846
            ],
            [
              123.27148,
              13.62969
            ],
            [
              123.27216,
              13.63061
            ],
            [
              123.27265,
              13.63086
            ],
            [
              123.27553,
              13.62953
            ],
            [
              123.2765,
              13.63041
            ],
            [
              123.27698,
              13.63024
            ],
            [
              123.27665,
              13.62843
            ],
            [
              123.27693,
              13.62836
            ],
            [
              123.2789,
              13.62957
            ],
            [
              123.27934,
              13.62963
            ],
            [
              123.28,
              13.62897
            ],
            [
              123.28042,
              13.62908
            ],
            [
              123.27992,
              13.63132
            ],
            [
              123.2801,
              13.63227
            ],
            [
              123.28109,
              13.63279
            ],
            [
              123.28223,
              13.63247
            ],
            [
              123.28261,
              13.63289
            ],
            [
              123.28249,
              13.63439
            ],
            [
              123.28293,
              13.63442
            ],
            [
              123.28357,
              13.6337
            ],
            [
              123.28409,
              13.63508
            ],
            [
              123.28596,
              13.63458
            ],
            [
              123.2869,
              13.63543
            ],
            [
              123.28875,
              13.63514
            ],
            [
              123.28916,
              13.63625
            ],
            [
              123.29158,
              13.63741
            ],
            [
              123.29249,
              13.63662
            ],
            [
              123.29243,
              13.63736
            ],
            [
              123.29273,
              13.63763
            ],
            [
              123.29427,
              13.63744
            ],
            [
              123.2968,
              13.63816
            ],
            [
              123.29804,
              13.63946
            ],
            [
              123.29839,
              13.64038
            ],
            [
              123.29969,
              13.63962
            ],
            [
              123.3001,
              13.64101
            ],
            [
              123.30142,
              13.6419
            ],
            [
              123.30242,
              13.642
            ],
            [
              123.30279,
              13.64262
            ],
            [
              123.30389,
              13.64329
            ],
            [
              123.30459,
              13.64333
            ],
            [
              123.30481,
              13.64302
            ],
            [
              123.30532,
              13.64335
            ],
            [
              123.30546,
              13.64257
            ],
            [
              123.30609,
              13.64265
            ],
            [
              123.30666,
              13.64433
            ],
            [
              123.3078,
              13.64432
            ],
            [
              123.3088,
              13.64481
            ],
            [
              123.30984,
              13.64327
            ],
            [
              123.31027,
              13.64501
            ],
            [
              123.3115,
              13.64409
            ],
            [
              123.31135,
              13.64524
            ],
            [
              123.31212,
              13.64598
            ],
            [
              123.31337,
              13.64524
            ],
            [
              123.31379,
              13.64533
            ],
            [
              123.31421,
              13.64578
            ],
            [
              123.31393,
              13.6469
            ],
            [
              123.31462,
              13.64704
            ],
            [
              123.31508,
              13.6462
            ],
            [
              123.31541,
              13.64631
            ],
            [
              123.31722,
              13.64892
            ],
            [
              123.31835,
              13.64978
            ],
            [
              123.32295,
              13.64864
            ],
            [
              123.32617,
              13.64835
            ],
            [
              123.32963,
              13.64868
            ],
            [
              123.33138,
              13.64749
            ],
            [
              123.33241,
              13.64757
            ],
            [
              123.33381,
              13.64861
            ],
            [
              123.3381,
              13.64931
            ],
            [
              123.34774,
              13.64751
            ],
            [
              123.35456,
              13.64844
            ],
            [
              123.35794,
              13.65009
            ],
            [
              123.35961,
              13.65026
            ],
            [
              123.36071,
              13.65025
            ],
            [
              123.36181,
              13.64952
            ],
            [
              123.36238,
              13.6497
            ],
            [
              123.36414,
              13.64909
            ],
            [
              123.36591,
              13.64905
            ],
            [
              123.37158,
              13.651
            ],
            [
              123.37372,
              13.65266
            ],
            [
              123.37381,
              13.65317
            ],
            [
              123.37494,
              13.65367
            ],
            [
              123.37647,
              13.65507
            ],
            [
              123.37427,
              13.65576
            ],
            [
              123.37278,
              13.65762
            ],
            [
              123.37188,
              13.65729
            ],
            [
              123.36781,
              13.65882
            ],
            [
              123.36806,
              13.65896
            ],
            [
              123.36789,
              13.65945
            ],
            [
              123.3665,
              13.65965
            ],
            [
              123.36644,
              13.66011
            ],
            [
              123.36387,
              13.66021
            ],
            [
              123.36382,
              13.66075
            ],
            [
              123.3589,
              13.66197
            ],
            [
              123.32537,
              13.67436
            ],
            [
              123.3027,
              13.6743
            ],
            [
              123.29512,
              13.67049
            ],
            [
              123.29462,
              13.66963
            ],
            [
              123.29349,
              13.67016
            ],
            [
              123.29379,
              13.67094
            ],
            [
              123.29278,
              13.67267
            ],
            [
              123.29146,
              13.67305
            ],
            [
              123.29039,
              13.67285
            ],
            [
              123.289,
              13.67345
            ],
            [
              123.28846,
              13.67303
            ],
            [
              123.28851,
              13.67238
            ],
            [
              123.2879,
              13.67216
            ],
            [
              123.28715,
              13.67308
            ],
            [
              123.26703,
              13.66564
            ],
            [
              123.26638,
              13.66607
            ],
            [
              123.26534,
              13.66603
            ],
            [
              123.26441,
              13.66532
            ],
            [
              123.26241,
              13.66522
            ],
            [
              123.26003,
              13.66424
            ],
            [
              123.25835,
              13.66408
            ],
            [
              123.25833,
              13.66381
            ],
            [
              123.25698,
              13.66354
            ],
            [
              123.25682,
              13.66296
            ],
            [
              123.25596,
              13.66296
            ],
            [
              123.25611,
              13.66268
            ],
            [
              123.25537,
              13.66258
            ],
            [
              123.25357,
              13.66124
            ],
            [
              123.25202,
              13.6617
            ],
            [
              123.25068,
              13.6611
            ],
            [
              123.24947,
              13.66117
            ],
            [
              123.24769,
              13.66065
            ],
            [
              123.2464,
              13.66096
            ],
            [
              123.24675,
              13.66161
            ],
            [
              123.2464,
              13.66178
            ],
            [
              123.24623,
              13.66141
            ],
            [
              123.24603,
              13.66157
            ],
            [
              123.24486,
              13.66083
            ],
            [
              123.24378,
              13.66098
            ],
            [
              123.24316,
              13.66186
            ],
            [
              123.24297,
              13.66114
            ],
            [
              123.24254,
              13.66089
            ],
            [
              123.24049,
              13.66049
            ],
            [
              123.23865,
              13.6614
            ],
            [
              123.23742,
              13.66161
            ],
            [
              123.23639,
              13.66137
            ],
            [
              123.2367,
              13.66079
            ],
            [
              123.23639,
              13.6606
            ],
            [
              123.23588,
              13.66112
            ],
            [
              123.23528,
              13.66097
            ],
            [
              123.2353,
              13.66044
            ],
            [
              123.23434,
              13.6593
            ],
            [
              123.23387,
              13.6596
            ],
            [
              123.23329,
              13.65934
            ],
            [
              123.23311,
              13.6602
            ],
            [
              123.23245,
              13.65991
            ],
            [
              123.23213,
              13.66029
            ],
            [
              123.23171,
              13.65988
            ],
            [
              123.23144,
              13.66054
            ],
            [
              123.23018,
              13.65961
            ],
            [
              123.22952,
              13.66017
            ],
            [
              123.22745,
              13.65946
            ],
            [
              123.22628,
              13.65953
            ],
            [
              123.22614,
              13.65894
            ],
            [
              123.22536,
              13.65889
            ],
            [
              123.22565,
              13.65836
            ],
            [
              123.22542,
              13.658
            ],
            [
              123.22465,
              13.65855
            ],
            [
              123.22357,
              13.65854
            ],
            [
              123.22289,
              13.65919
            ],
            [
              123.22269,
              13.6583
            ],
            [
              123.22224,
              13.65844
            ],
            [
              123.22183,
              13.65796
            ],
            [
              123.22036,
              13.65783
            ],
            [
              123.22043,
              13.65843
            ],
            [
              123.21982,
              13.65836
            ],
            [
              123.21931,
              13.65877
            ],
            [
              123.21919,
              13.65823
            ],
            [
              123.21887,
              13.6581
            ],
            [
              123.2165,
              13.623
            ],
            [
              123.2277,
              13.617
            ],
            [
              123.22728,
              13.61156
            ]
          ]
        ]
      }
    }
  ]
};

function pointInRingLngLat(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getFacilityHazardCrossRef(lat, lng, barangayName = '') {
  for (const feat of NAGA_FLOOD_HAZARD_GEOJSON.features) {
    if (pointInRingLngLat(lng, lat, feat.geometry.coordinates[0])) {
      const p = feat.properties;
      return {
        hazardTier: p.tier,
        hazardClassification: p.classification,
        depthRange: p.depthRange,
        inundationRisk: p.tier === 'high' ? 'Elevated Inundation & Coliform Backflow Risk' : p.tier === 'moderate' ? 'Seasonal Drainage Ponding Risk' : 'Upland Surface Runoff / Turbidity Surge Risk',
      };
    }
  }
  const meta = NAGA_BARANGAY_METADATA[barangayName];
  return {
    hazardTier: meta?.floodTier || 'moderate',
    hazardClassification: meta?.hazardClassification || 'Moderate Flood Susceptibility (<1.5m)',
    depthRange: meta?.floodDepth || '0.4m – 1.4m',
    inundationRisk: 'Standard Municipal Monitoring',
  };
}

function buildRiverRibbonFeature(name, coordsLatLng, halfWidthMeters) {
  const leftSide = [];
  const rightSide = [];
  const mPerLat = 110636;
  const mPerLng = 110636 * COS_CENTER_LAT;

  for (let i = 0; i < coordsLatLng.length; i++) {
    const [lat, lng] = coordsLatLng[i];
    const prev = coordsLatLng[Math.max(0, i - 1)];
    const next = coordsLatLng[Math.min(coordsLatLng.length - 1, i + 1)];
    const dxM = (next[1] - prev[1]) * mPerLng;
    const dyM = (next[0] - prev[0]) * mPerLat;
    const len = Math.hypot(dxM, dyM) || 1;
    const nxM = -dyM / len;
    const nyM = dxM / len;
    const offLng = (nxM * halfWidthMeters) / mPerLng;
    const offLat = (nyM * halfWidthMeters) / mPerLat;
    leftSide.push([Number((lng + offLng).toFixed(6)), Number((lat + offLat).toFixed(6))]);
    rightSide.push([Number((lng - offLng).toFixed(6)), Number((lat - offLat).toFixed(6))]);
  }

  const ring = [...leftSide, ...rightSide.reverse(), leftSide[0]];
  return {
    type: 'Feature',
    properties: { name, kind: 'river_polygon' },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

export function buildVibrantRiversGeoJson() {
  return {
    type: 'FeatureCollection',
    features: [
      buildRiverRibbonFeature('Naga River', NAGA_RIVER_COORDS, 24),
      buildRiverRibbonFeature('Bicol River', BICOL_RIVER_COORDS, 44),
    ],
  };
}

export function buildWhiteClayBuildingsGeoJson(waterPoints = INITIAL_NAGA_POINTS) {
  const features = [];
  const clearLatDeg = 0.00038; // ~42m clearance around facility kiosks, wells & sonar centers
  const civicHallCenters = INITIAL_EVACUATION_CAMPS_FALLBACK.slice(0, 2);
  const clearCivicLatDeg = 0.00028; // ~31m clearance around Evacuation Civic Halls
  const combined = [...NAGA_BUILDING_CLUSTERS, ...NAGA_URBAN_ENVIRONMENT_FEATURES];
  const placedBoxes = [];

  const isNearReservedLandmark = (lat, lng) =>
    waterPoints.some(
      (pt) => Math.abs(pt.lat - lat) < clearLatDeg && Math.abs(pt.lng - lng) < clearLatDeg
    ) ||
    civicHallCenters.some(
      (c) => Math.abs(c.lat - lat) < clearCivicLatDeg && Math.abs(c.lng - lng) < clearCivicLatDeg
    );

  const pushBoxFeature = (id, lat, lng, wWorld, dWorld, rot, baseLevels, idxSeed) => {
    const hw = Math.max(0.024, wWorld * 0.5);
    const hd = Math.max(0.022, dWorld * 0.5);
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const localCorners = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
      [-hw, -hd],
    ];
    const ring = localCorners.map(([lx, lz]) => {
      const rx = lx * cosR - lz * sinR;
      const rz = lx * sinR + lz * cosR;
      const ptLat = lat - rz / GEO_SCALE;
      const ptLng = lng + rx / (GEO_SCALE * COS_CENTER_LAT);
      return [Number(ptLng.toFixed(6)), Number(ptLat.toFixed(6))];
    });

    const heightM = Math.max(9, Math.min(26, Math.round(baseLevels * 4.5 + ((idxSeed % 4) * 1.4))));
    const tonePalette = ['#FFFFFF', '#F8FAFC', '#F1F5F9', '#E8EEF5'];
    features.push({
      type: 'Feature',
      id: features.length + 1,
      properties: {
        id,
        height: heightM,
        min_height: 0,
        levels: baseLevels,
        tone: tonePalette[idxSeed % tonePalette.length],
      },
      geometry: { type: 'Polygon', coordinates: [ring] },
    });
  };

  for (let i = 0; i < combined.length; i++) {
    const b = combined[i];
    if (b?.lat == null || b?.lng == null) continue;
    if (isNearReservedLandmark(b.lat, b.lng)) continue;

    const scaleF = 0.62;
    const wWorld = (b.w || 0.14) * scaleF;
    const dWorld = (b.d || 0.10) * scaleF;
    const [bx, , bz] = geoToWorld(b.lat, b.lng);
    placedBoxes.push({ x: bx, z: bz, w: wWorld, d: dWorld, rot: b.rot || 0, r: Math.hypot(wWorld, dWorld) * 0.56 });
    const baseLevels = Number(b.levels) || (b.type === 'commercial_midrise' ? 4 : 2);
    pushBoxFeature(b.id || `CLAY-${i}`, b.lat, b.lng, wWorld, dWorld, b.rot || 0, baseLevels, i);
  }

  // Deterministic architectural neighborhood massing across urban Naga so z=13.6..14.5 stays densely populated
  let infillIdx = 0;
  for (let lat = 13.6062; lat <= 13.6455; lat += 0.00062) {
    for (let lng = 123.1735; lng <= 123.2255; lng += 0.00064) {
      infillIdx++;
      const jLat = lat + (((infillIdx * 19) % 7) - 3) * 0.00006;
      const jLng = lng + (((infillIdx * 31) % 7) - 3) * 0.00006;
      if (isNearReservedLandmark(jLat, jLng)) continue;

      const wWorld = 0.068 + (infillIdx % 4) * 0.012;
      const dWorld = 0.052 + ((infillIdx * 3) % 4) * 0.010;
      const rot = ((infillIdx % 6) - 2.5) * 0.12 + 0.18;
      if (!isClearOfInfrastructure(jLat, jLng, 0.044, placedBoxes, wWorld, dWorld, rot)) continue;

      const [bx, , bz] = geoToWorld(jLat, jLng);
      placedBoxes.push({ x: bx, z: bz, w: wWorld, d: dWorld, rot, r: Math.hypot(wWorld, dWorld) * 0.54 });
      const levels = infillIdx % 7 === 0 ? 3 : 2;
      pushBoxFeature(`URB-${infillIdx}`, jLat, jLng, wWorld, dWorld, rot, levels, infillIdx);
    }
  }

  return { type: 'FeatureCollection', features };
}
