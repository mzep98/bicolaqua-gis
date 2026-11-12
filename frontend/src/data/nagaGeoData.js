import * as THREE from 'three';

export const NAGA_CENTER = { lat: 13.6265, lng: 123.2040 };

export const TERRAIN_WIDTH = 38;
export const TERRAIN_DEPTH = 30;
export const BASE_ELEVATION = 0.05;

export const LOGO_PALETTE = {
  balticBlue: '#01658E',
  white: '#FDFDFD',
  tangerineDream: '#FE9659',
  electricAqua: '#91EFF7',
  yaleBlue: '#033F56',
  atomicTangerine: '#FD7132',
  pacificBlue: '#00B3CD',
  strongCyan: '#2ED5E5',
};

export const GEOGRAPHIC_DATA_SOURCES = {
  coordinate_system: 'WGS84 (EPSG:4326) -> Full-Viewport Naga City Equirectangular Projection',
  hydrology: 'OpenStreetMap / NAMRIA Naga River & Bicol River Confluence',
  road_and_bridge_network: 'OpenStreetMap & Naga City CLUP Arterial & Secondary Street Grid',
  barangay_geography: '27 Official Naga City Barangays (Full-Canvas Planar Tessellation)',
  topography: 'SRTM 30m Elevation Gradient (Naga Floodplain to Mt. Isarog Terraced Foothills)',
};

export function getTerrainY(x, z) {
  const halfW = TERRAIN_WIDTH * 0.5;
  const halfD = TERRAIN_DEPTH * 0.5;

  const nx = Math.min(1, Math.abs(x) / (halfW * 1.15));
  const nz = Math.min(1, Math.abs(z) / (halfD * 1.15));
  const edgeX = 1 - nx * nx * (3 - 2 * nx);
  const edgeZ = 1 - nz * nz * (3 - 2 * nz);
  const boundaryEnvelope = Math.max(0, edgeX * edgeZ);

  // Main Mt. Isarog volcanic massif in NE quadrant (Pacol / Carolina / Panicuason)
  const dx = x - 9.6;
  const dz = z - -5.4;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const hillRadius = 9.8;
  const tHill = Math.max(0, 1 - dist / hillRadius);
  const rawMain = tHill * tHill * (3 - 2 * tHill) * 2.85;

  // Secondary foothill ridge across Cararayan, San Isidro & Concepcion Grande
  const dx2 = x - 5.2;
  const dz2 = z - -1.9;
  const dist2 = Math.sqrt(dx2 * dx2 * 0.85 + dz2 * dz2 * 1.15);
  const tShoulder = Math.max(0, 1 - dist2 / 7.8);
  const rawShoulder = tShoulder * tShoulder * (3 - 2 * tShoulder) * 0.95;

  const combined = rawMain + rawShoulder;
  const terraced =
    combined > 0.35
      ? combined + Math.sin(combined * 7.5) * 0.035 * Math.min(1, (combined - 0.35) / 1.2)
      : combined;

  return BASE_ELEVATION + terraced * boundaryEnvelope;
}

// Calibrated full-city scale (255) so all 27 barangays fit in the full viewport
export function geoToWorld(lat, lng) {
  const x = (lng - NAGA_CENTER.lng) * 255;
  const z = -(lat - NAGA_CENTER.lat) * 255;
  const y = getTerrainY(x, z);
  return [x, y, z];
}

// Extended Naga River (Mt. Isarog headwaters to Bicol River confluence)
export const NAGA_RIVER_COORDS = [
  [13.6750, 123.2750],
  [13.6620, 123.2550],
  [13.6535, 123.2465],
  [13.6455, 123.2310],
  [13.6395, 123.2145],
  [13.6350, 123.2015],
  [13.6305, 123.1965],
  [13.6272, 123.1918],
  [13.6235, 123.1882],
  [13.6198, 123.1846],
  [13.6185, 123.1805],
];

// Extended Bicol River (Canaman/Camaligan north to Milaor/San Fernando south)
export const BICOL_RIVER_COORDS = [
  [13.6720, 123.1420],
  [13.6580, 123.1510],
  [13.6480, 123.1580],
  [13.6400, 123.1640],
  [13.6340, 123.1680],
  [13.6275, 123.1730],
  [13.6220, 123.1775],
  [13.6185, 123.1805],
  [13.6130, 123.1795],
  [13.6065, 123.1745],
  [13.5950, 123.1680],
  [13.5760, 123.1580],
];

// --- COMPLETE NAGA CITY ROAD & BRIDGE NETWORK GRAPH ---
export const NAGA_ROAD_NODES = {
  CALABANGA_BNDRY: [13.6760, 123.1720],
  CAMALIGAN_BNDRY: [13.6290, 123.1360],
  MILAOR_BNDRY: [13.5760, 123.1520],
  PILI_BNDRY: [13.5760, 123.2580],
  OCOMPO_BNDRY: [13.6760, 123.2820],

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
  BALATAS_CROSSING_W: [13.6290, 123.1950],
  BALATAS_CROSSING_E: [13.6318, 123.1984],
  BALATAS_JCT: [13.6322, 123.2045],

  TINAGO_JCT: [13.6248, 123.1906],
  DINAGA_JCT: [13.6232, 123.1850],
  STA_CRUZ_JCT: [13.6246, 123.1806],
  ABELLA_WEST: [13.6255, 123.1742],
  ABELLA_NORTH: [13.6365, 123.1725],
  IGUALDAD_JCT: [13.6208, 123.1812],
  SABANG_JCT: [13.6182, 123.1802],
  SABANG_WEST: [13.6165, 123.1665],
  TABUCO_BRIDGE_N: [13.6214, 123.1838],
  TABUCO_BRIDGE_S: [13.6184, 123.1862],
  LERMA_JCT: [13.6205, 123.1912],
  PANGANIBAN_EAST: [13.6170, 123.1930],
  PANGANIBAN_MID: [13.6180, 123.1895],
  TABUCO_JCT: [13.6184, 123.1862],

  TRIANGULO_JCT: [13.6148, 123.1889],
  TRIANGULO_SOUTH: [13.6045, 123.1915],
  MABOLO_BRIDGE_E: [13.6138, 123.1822],
  MABOLO_BRIDGE_W: [13.6122, 123.1766],
  MABOLO_JCT: [13.6112, 123.1764],
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
  { id: 'R_SF1', from: 'CALAUAG_JCT', to: 'SAN_FELIPE_JCT', coords: [NAGA_ROAD_NODES.CALAUAG_JCT, NAGA_ROAD_NODES.SAN_FELIPE_JCT] },
  { id: 'R_SF_N', from: 'SAN_FELIPE_JCT', to: 'SAN_FELIPE_NORTH', coords: [NAGA_ROAD_NODES.SAN_FELIPE_JCT, NAGA_ROAD_NODES.SAN_FELIPE_NORTH] },
  { id: 'R_SF2', from: 'SAN_FELIPE_JCT', to: 'SAN_FELIPE_EAST', coords: [NAGA_ROAD_NODES.SAN_FELIPE_JCT, NAGA_ROAD_NODES.SAN_FELIPE_EAST] },
  { id: 'R_MAG1', from: 'MAGSAYSAY_NORTH', to: 'PENAFRANCIA_JCT', coords: [NAGA_ROAD_NODES.MAGSAYSAY_NORTH, NAGA_ROAD_NODES.PENAFRANCIA_JCT] },
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
  { id: 'R_ABE_N', from: 'STA_CRUZ_JCT', to: 'ABELLA_NORTH', coords: [NAGA_ROAD_NODES.STA_CRUZ_JCT, NAGA_ROAD_NODES.ABELLA_NORTH] },
  { id: 'R_IGU1', from: 'DINAGA_JCT', to: 'IGUALDAD_JCT', coords: [NAGA_ROAD_NODES.DINAGA_JCT, NAGA_ROAD_NODES.IGUALDAD_JCT] },
  { id: 'R_IGU2', from: 'IGUALDAD_JCT', to: 'SABANG_JCT', coords: [NAGA_ROAD_NODES.IGUALDAD_JCT, NAGA_ROAD_NODES.SABANG_JCT] },
  { id: 'R_SAB_W', from: 'SABANG_JCT', to: 'SABANG_WEST', coords: [NAGA_ROAD_NODES.SABANG_JCT, NAGA_ROAD_NODES.SABANG_WEST] },
  { id: 'R_TAB_BR', bridgeId: 'BRIDGE_TABUCO', from: 'TABUCO_BRIDGE_N', to: 'TABUCO_BRIDGE_S', coords: [NAGA_ROAD_NODES.TABUCO_BRIDGE_N, NAGA_ROAD_NODES.TABUCO_BRIDGE_S] },
  { id: 'R_TAB3', from: 'PANGANIBAN_EAST', to: 'PANGANIBAN_MID', coords: [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.PANGANIBAN_MID] },
  { id: 'R_TAB4', from: 'PANGANIBAN_MID', to: 'TABUCO_JCT', coords: [NAGA_ROAD_NODES.PANGANIBAN_MID, NAGA_ROAD_NODES.TABUCO_JCT] },
  { id: 'R_SOU1', from: 'PANGANIBAN_EAST', to: 'TRIANGULO_JCT', coords: [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.TRIANGULO_JCT] },
  { id: 'R_SOU2', from: 'TABUCO_JCT', to: 'TRIANGULO_JCT', coords: [NAGA_ROAD_NODES.TABUCO_JCT, NAGA_ROAD_NODES.TRIANGULO_JCT] },
  { id: 'R_SOU3', from: 'TRIANGULO_JCT', to: 'TRIANGULO_SOUTH', coords: [NAGA_ROAD_NODES.TRIANGULO_JCT, NAGA_ROAD_NODES.TRIANGULO_SOUTH] },
  { id: 'R_SOU4', from: 'TRIANGULO_JCT', to: 'MABOLO_BRIDGE_E', coords: [NAGA_ROAD_NODES.TRIANGULO_JCT, NAGA_ROAD_NODES.MABOLO_BRIDGE_E] },
  { id: 'R_MAB_BR', bridgeId: 'BRIDGE_MABOLO', from: 'MABOLO_BRIDGE_E', to: 'MABOLO_BRIDGE_W', coords: [NAGA_ROAD_NODES.MABOLO_BRIDGE_E, NAGA_ROAD_NODES.MABOLO_BRIDGE_W] },
  { id: 'R_SOU5', from: 'MABOLO_BRIDGE_W', to: 'MABOLO_JCT', coords: [NAGA_ROAD_NODES.MABOLO_BRIDGE_W, NAGA_ROAD_NODES.MABOLO_JCT] },
  { id: 'R_SOU6', from: 'MABOLO_JCT', to: 'MABOLO_SOUTH', coords: [NAGA_ROAD_NODES.MABOLO_JCT, NAGA_ROAD_NODES.MABOLO_SOUTH] },
  { id: 'R_BAL1', from: 'CDRRMO_JCT', to: 'DAYANGDANG_JCT', coords: [NAGA_ROAD_NODES.CDRRMO_JCT, NAGA_ROAD_NODES.DAYANGDANG_JCT] },
  { id: 'R_BAL2', from: 'DAYANGDANG_JCT', to: 'BALATAS_CROSSING_W', coords: [NAGA_ROAD_NODES.DAYANGDANG_JCT, NAGA_ROAD_NODES.BALATAS_CROSSING_W] },
  { id: 'R_BAL_BR', bridgeId: 'BRIDGE_BALATAS', from: 'BALATAS_CROSSING_W', to: 'BALATAS_CROSSING_E', coords: [NAGA_ROAD_NODES.BALATAS_CROSSING_W, NAGA_ROAD_NODES.BALATAS_CROSSING_E] },
  { id: 'R_BAL3', from: 'BALATAS_CROSSING_E', to: 'BALATAS_JCT', coords: [NAGA_ROAD_NODES.BALATAS_CROSSING_E, NAGA_ROAD_NODES.BALATAS_JCT] },
  { id: 'R_EAS1', from: 'PANGANIBAN_EAST', to: 'CONCEPCION_JCT', coords: [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.CONCEPCION_JCT] },
  { id: 'R_CON_S', from: 'CONCEPCION_JCT', to: 'CONCEPCION_SOUTH', coords: [NAGA_ROAD_NODES.CONCEPCION_JCT, NAGA_ROAD_NODES.CONCEPCION_SOUTH] },
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

// Primary Arterial Corridors (Strictly on dry land between bridge abutments)
export const NAGA_CONTINUOUS_ROAD_CORRIDORS = [
  [NAGA_ROAD_NODES.CALABANGA_BNDRY, NAGA_ROAD_NODES.BAGUMBAYAN_FAR_N, NAGA_ROAD_NODES.BAGUMBAYAN_NORTH, NAGA_ROAD_NODES.BAGUMBAYAN_JCT, NAGA_ROAD_NODES.LIBOTON_JCT, NAGA_ROAD_NODES.DINAGA_JCT, NAGA_ROAD_NODES.TABUCO_BRIDGE_N],
  [NAGA_ROAD_NODES.BAGUMBAYAN_JCT, NAGA_ROAD_NODES.CALAUAG_WEST, NAGA_ROAD_NODES.CALAUAG_JCT, NAGA_ROAD_NODES.PENAFRANCIA_JCT, NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_N],
  [NAGA_ROAD_NODES.MAGSAYSAY_NORTH, NAGA_ROAD_NODES.PENAFRANCIA_JCT],
  [NAGA_ROAD_NODES.CALAUAG_JCT, NAGA_ROAD_NODES.SAN_FELIPE_JCT, NAGA_ROAD_NODES.SAN_FELIPE_EAST],
  [NAGA_ROAD_NODES.SAN_FELIPE_JCT, NAGA_ROAD_NODES.SAN_FELIPE_NORTH],
  [NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_S, NAGA_ROAD_NODES.CDRRMO_JCT, NAGA_ROAD_NODES.LERMA_JCT, NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.PANGANIBAN_MID, NAGA_ROAD_NODES.TABUCO_JCT],
  [NAGA_ROAD_NODES.MAGSAYSAY_BRIDGE_S, NAGA_ROAD_NODES.TINAGO_JCT, NAGA_ROAD_NODES.LERMA_JCT],
  [NAGA_ROAD_NODES.CAMALIGAN_BNDRY, NAGA_ROAD_NODES.ABELLA_WEST, NAGA_ROAD_NODES.STA_CRUZ_JCT, NAGA_ROAD_NODES.DINAGA_JCT],
  [NAGA_ROAD_NODES.STA_CRUZ_JCT, NAGA_ROAD_NODES.ABELLA_NORTH],
  [NAGA_ROAD_NODES.DINAGA_JCT, NAGA_ROAD_NODES.IGUALDAD_JCT, NAGA_ROAD_NODES.SABANG_JCT, NAGA_ROAD_NODES.SABANG_WEST],
  [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.TRIANGULO_JCT, NAGA_ROAD_NODES.MABOLO_BRIDGE_E],
  [NAGA_ROAD_NODES.TABUCO_JCT, NAGA_ROAD_NODES.TRIANGULO_JCT, NAGA_ROAD_NODES.TRIANGULO_SOUTH],
  [NAGA_ROAD_NODES.MILAOR_BNDRY, NAGA_ROAD_NODES.MABOLO_SOUTH, NAGA_ROAD_NODES.MABOLO_JCT, NAGA_ROAD_NODES.MABOLO_BRIDGE_W],
  [NAGA_ROAD_NODES.CDRRMO_JCT, NAGA_ROAD_NODES.DAYANGDANG_JCT, NAGA_ROAD_NODES.BALATAS_CROSSING_W],
  [NAGA_ROAD_NODES.BALATAS_CROSSING_E, NAGA_ROAD_NODES.BALATAS_JCT, NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT],
  [NAGA_ROAD_NODES.PANGANIBAN_EAST, NAGA_ROAD_NODES.CONCEPCION_JCT, NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT, NAGA_ROAD_NODES.DEL_ROSARIO_JCT, NAGA_ROAD_NODES.DEL_ROSARIO_SOUTH, NAGA_ROAD_NODES.PILI_BNDRY],
  [NAGA_ROAD_NODES.CONCEPCION_JCT, NAGA_ROAD_NODES.CONCEPCION_SOUTH],
  [NAGA_ROAD_NODES.CONCEPCION_GRANDE_JCT, NAGA_ROAD_NODES.CARARAYAN_LOWER, NAGA_ROAD_NODES.CARARAYAN_MID, NAGA_ROAD_NODES.CARARAYAN_JCT, NAGA_ROAD_NODES.PACOL_TURN, NAGA_ROAD_NODES.PACOL_JCT, NAGA_ROAD_NODES.CAROLINA_JCT, NAGA_ROAD_NODES.OCOMPO_BNDRY],
  [NAGA_ROAD_NODES.CARARAYAN_JCT, NAGA_ROAD_NODES.SAN_ISIDRO_EAST, NAGA_ROAD_NODES.SAN_ISIDRO_SOUTH],
  [NAGA_ROAD_NODES.PACOL_TURN, NAGA_ROAD_NODES.PANICUASON_EAST],
];

// Secondary Neighborhood Streets (All unbridged river crossings removed)
export const NAGA_SECONDARY_STREETS = [
  [[13.6285, 123.1862], [13.6280, 123.1785], [13.6246, 123.1806]],
  [[13.6338, 123.1856], [13.6345, 123.1765], [13.6255, 123.1742]],
  [[13.6415, 123.1835], [13.6410, 123.1920], [13.6365, 123.1942]],
  [[13.6485, 123.1795], [13.6475, 123.1945], [13.6430, 123.2040]],
  [[13.6272, 123.1962], [13.6225, 123.2010], [13.6154, 123.1972]],
  [[13.6322, 123.2045], [13.6285, 123.2145], [13.6245, 123.2145]],
  [[13.6065, 123.1915], [13.6085, 123.2020], [13.6135, 123.2185]],
  [[13.6185, 123.2065], [13.6080, 123.2125], [13.6075, 123.2285]],
  [[13.6245, 123.2145], [13.6205, 123.2285], [13.6135, 123.2185]],
  [[13.6305, 123.2250], [13.6240, 123.2360], [13.6165, 123.2495]],
];

export const NAGA_ROADS_COORDS = NAGA_CONTINUOUS_ROAD_CORRIDORS;

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

// --- COMPLETE 27-BARANGAY GEOJSON FEATURE COLLECTION ---
export const NAGA_BARANGAYS_GEOJSON = {
  type: 'FeatureCollection',
  crs: { type: 'name', properties: { name: 'EPSG:4326' } },
  features: [
    { type: 'Feature', properties: { id: 'BRGY-01', name: 'Abella', labelLat: 13.6285, labelLng: 123.1735 }, geometry: { type: 'Polygon', coordinates: [[[13.6380, 123.1660], [13.6380, 123.1795], [13.6238, 123.1795], [13.6238, 123.1660], [13.6380, 123.1660]]] } },
    { type: 'Feature', properties: { id: 'BRGY-13', name: 'Igualdad', labelLat: 13.6222, labelLng: 123.1792 }, geometry: { type: 'Polygon', coordinates: [[[13.6238, 123.1755], [13.6238, 123.1822], [13.6198, 123.1822], [13.6198, 123.1755], [13.6238, 123.1755]]] } },
    { type: 'Feature', properties: { id: 'BRGY-20', name: 'Sabang', labelLat: 13.6152, labelLng: 123.1745 }, geometry: { type: 'Polygon', coordinates: [[[13.6198, 123.1680], [13.6198, 123.1835], [13.6142, 123.1835], [13.6142, 123.1680], [13.6198, 123.1680]]] } },
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
    { type: 'Feature', properties: { id: 'BRGY-17', name: 'Pacol', labelLat: 13.6465, labelLng: 123.2335 }, geometry: { type: 'Polygon', coordinates: [[[13.6555, 123.2215], [13.6555, 123.2435], [13.6385, 123.2435], [13.6385, 123.2365], [13.6405, 123.2365], [13.6405, 123.2215], [13.6555, 123.2215]]] } },
    { type: 'Feature', properties: { id: 'BRGY-07', name: 'Carolina', labelLat: 13.6518, labelLng: 123.2485 }, geometry: { type: 'Polygon', coordinates: [[[13.6565, 123.2435], [13.6565, 123.2555], [13.6465, 123.2555], [13.6465, 123.2435], [13.6565, 123.2435]]] } },
    { type: 'Feature', properties: { id: 'BRGY-18', name: 'Panicuason', labelLat: 13.6425, labelLng: 123.2495 }, geometry: { type: 'Polygon', coordinates: [[[13.6465, 123.2435], [13.6465, 123.2555], [13.6385, 123.2555], [13.6385, 123.2435], [13.6465, 123.2435]]] } },
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

// --- VERIFIED NAGA CITY LANDMARKS (Strictly on dry land, clear of rivers & roads) ---
export const NAGA_LANDMARKS = [
  { id: 'L_CATHEDRAL', type: 'cathedral', name: 'Naga Metropolitan Cathedral', lat: 13.6262, lng: 123.1828, w: 0.62, d: 0.78, h: 0.85, rot: 0.15 },
  { id: 'L_BASILICA', type: 'basilica', name: 'Basilica Minore de Peñafrancia', lat: 13.6348, lng: 123.1924, w: 0.68, d: 0.84, h: 0.92, rot: -0.2 },
  { id: 'L_SMNAGA', type: 'mall', name: 'SM City Naga', lat: 13.6152, lng: 123.1912, w: 0.96, d: 0.68, h: 0.56, rot: 0.08 },
  { id: 'L_CITYHALL', type: 'hall', name: 'Naga City Hall', lat: 13.6194, lng: 123.1948, w: 0.68, d: 0.48, h: 0.62, rot: -0.1 },
  { id: 'L_ATENEO', type: 'university', name: 'Ateneo de Naga University', lat: 13.6312, lng: 123.1835, w: 0.72, d: 0.56, h: 0.74, rot: 0.25 },
];

export const CDRRMO_HUB = { lat: 13.6226, lng: 123.1965 };

export const INITIAL_NAGA_POINTS = [
  { id: 'NAGA-01', name: 'Sitio Cararayan Shallow Well #2', barangay: 'Cararayan', lat: 13.6388, lng: 123.2322, source_type: 'Handpump', status: 'Functional', flood_risk_level: 2, population_served: 320, metrics: { ph: 7.1, tds_ppm: 240.0, turbidity_ntu: 1.8, coliform_present: false }, wvi_score: 14.8, risk_tier: 'Safe / Compliant', last_updated: '2026-11-10T08:00:00Z', data_provenance: 'Synthetic Demo', history: [], route_waypoints: getShortestRoadRouteCoords('NAGA-01') },
  { id: 'NAGA-02', name: 'Sabang Riverside Public Kiosk', barangay: 'Sabang', lat: 13.6158, lng: 123.1772, source_type: 'Public Kiosk', status: 'Under Repair', flood_risk_level: 5, population_served: 850, metrics: { ph: 6.4, tds_ppm: 610.0, turbidity_ntu: 7.2, coliform_present: true }, wvi_score: 80.5, risk_tier: 'Critical', last_updated: '2026-11-11T14:30:00Z', data_provenance: 'Synthetic Demo', history: [], route_waypoints: getShortestRoadRouteCoords('NAGA-02') },
  { id: 'NAGA-03', name: 'Concepcion Pequeña Filtration', barangay: 'Concepcion Pequeña', lat: 13.6130, lng: 123.1992, source_type: 'School Filtration', status: 'Functional', flood_risk_level: 3, population_served: 640, metrics: { ph: 7.3, tds_ppm: 185.0, turbidity_ntu: 0.9, coliform_present: false }, wvi_score: 24.6, risk_tier: 'Safe / Compliant', last_updated: '2026-11-12T07:15:00Z', data_provenance: 'Synthetic Demo', history: [], route_waypoints: getShortestRoadRouteCoords('NAGA-03') },
  { id: 'NAGA-04', name: 'Triangulo Zone 4 Communal Pump', barangay: 'Triangulo', lat: 13.6122, lng: 123.1862, source_type: 'Handpump', status: 'Functional', flood_risk_level: 4, population_served: 510, metrics: { ph: 6.8, tds_ppm: 430.0, turbidity_ntu: 4.1, coliform_present: false }, wvi_score: 27.7, risk_tier: 'Safe / Compliant', last_updated: '2026-11-11T16:45:00Z', data_provenance: 'Synthetic Demo', history: [], route_waypoints: getShortestRoadRouteCoords('NAGA-04') },
  { id: 'NAGA-05', name: 'Peñafrancia Basilica Refill', barangay: 'Peñafrancia', lat: 13.6338, lng: 123.1902, source_type: 'Public Kiosk', status: 'Functional', flood_risk_level: 3, population_served: 720, metrics: { ph: 7.2, tds_ppm: 210.0, turbidity_ntu: 1.2, coliform_present: false }, wvi_score: 25.8, risk_tier: 'Safe / Compliant', last_updated: '2026-11-12T06:50:00Z', data_provenance: 'Synthetic Demo', history: [], route_waypoints: getShortestRoadRouteCoords('NAGA-05') },
  { id: 'NAGA-06', name: 'Mabolo Riverbank Shallow Well', barangay: 'Mabolo', lat: 13.6105, lng: 123.1732, source_type: 'Handpump', status: 'Under Repair', flood_risk_level: 5, population_served: 590, metrics: { ph: 6.6, tds_ppm: 540.0, turbidity_ntu: 5.8, coliform_present: false }, wvi_score: 53.7, risk_tier: 'Moderate', last_updated: '2026-11-11T17:10:00Z', data_provenance: 'Synthetic Demo', history: [], route_waypoints: getShortestRoadRouteCoords('NAGA-06') },
  { id: 'NAGA-07', name: 'Tabuco Market Public Stand', barangay: 'Tabuco', lat: 13.6166, lng: 123.1842, source_type: 'Public Kiosk', status: 'Abandoned', flood_risk_level: 5, population_served: 910, metrics: { ph: 6.3, tds_ppm: 690.0, turbidity_ntu: 8.4, coliform_present: true }, wvi_score: 97.5, risk_tier: 'Critical', last_updated: '2026-11-11T11:20:00Z', data_provenance: 'Synthetic Demo', history: [], route_waypoints: getShortestRoadRouteCoords('NAGA-07') },
  { id: 'NAGA-08', name: 'Mt. Isarog Upland Gravity Spring', barangay: 'Pacol', lat: 13.6508, lng: 123.2405, source_type: 'Communal Spring', status: 'Functional', flood_risk_level: 1, population_served: 410, metrics: { ph: 7.4, tds_ppm: 125.0, turbidity_ntu: 0.6, coliform_present: false }, wvi_score: 11.2, risk_tier: 'Safe / Compliant', last_updated: '2026-11-12T08:10:00Z', data_provenance: 'Synthetic Demo', history: [], route_waypoints: getShortestRoadRouteCoords('NAGA-08') },
];

function distToSegmentXZ(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq)) : 0;
  const projX = ax + t * vx;
  const projZ = az + t * vz;
  return Math.hypot(px - projX, pz - projZ);
}

const SAMPLED_RIVER_SEGMENTS = (() => {
  const segs = [];
  [
    { coords: NAGA_RIVER_COORDS, bankHalfWidth: 0.48 },
    { coords: BICOL_RIVER_COORDS, bankHalfWidth: 0.58 },
  ].forEach(({ coords, bankHalfWidth }) => {
    const pts = coords.map(([lat, lng]) => {
      const [x, y, z] = geoToWorld(lat, lng);
      return new THREE.Vector3(x, y, z);
    });
    const curve = new THREE.CatmullRomCurve3(pts);
    const sampled = curve.getSpacedPoints(120);
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
  ...NAGA_ROADS_COORDS.map((coords) => ({ coords, halfWidth: 0.17 })),
  ...NAGA_SECONDARY_STREETS.map((coords) => ({ coords, halfWidth: 0.12 })),
];

function isClearOfInfrastructure(lat, lng, objectHalfRadius = 0.24, placedList = []) {
  const [x, , z] = geoToWorld(lat, lng);
  if (Math.abs(x) > 28.0 || Math.abs(z) > 22.0) return false;

  const [hx, , hz] = geoToWorld(CDRRMO_HUB.lat, CDRRMO_HUB.lng);
  if (Math.hypot(x - hx, z - hz) < objectHalfRadius + 0.65) return false;

  for (const pt of INITIAL_NAGA_POINTS) {
    const [px, , pz] = geoToWorld(pt.lat, pt.lng);
    if (Math.hypot(x - px, z - pz) < objectHalfRadius + 0.58) return false;
  }

  for (const lm of NAGA_LANDMARKS) {
    const [lx, , lz] = geoToWorld(lm.lat, lm.lng);
    if (Math.hypot(x - lx, z - lz) < objectHalfRadius + Math.max(lm.w, lm.d) * 0.85) return false;
  }

  for (const poly of ALL_ROAD_POLYLINES) {
    const minRoadDist = objectHalfRadius + poly.halfWidth + 0.08;
    for (let i = 0; i < poly.coords.length - 1; i++) {
      const [ax, , az] = geoToWorld(...poly.coords[i]);
      const [bx, , bz] = geoToWorld(...poly.coords[i + 1]);
      if (distToSegmentXZ(x, z, ax, az, bx, bz) < minRoadDist) return false;
    }
  }

  for (const seg of SAMPLED_RIVER_SEGMENTS) {
    if (distToSegmentXZ(x, z, seg.ax, seg.az, seg.bx, seg.bz) < objectHalfRadius + seg.bankHalfWidth + 0.12) {
      return false;
    }
  }

  for (const other of placedList) {
    if (Math.hypot(x - other.x, z - other.z) < objectHalfRadius + other.r + 0.05) {
      return false;
    }
  }

  return true;
}

export const NAGA_BUILDING_CLUSTERS = (() => {
  const buildings = [];
  const placed = [];
  let seed = 101;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const roofPalettes = ['#B85D3B', '#01658E', '#475569', '#8C4A32', '#3F624D', '#64748B'];
  const wallTones = ['white', 'cream', 'sand', 'slate', 'warm'];

  const selectBuildingSpec = (lat, lng) => {
    const distCentro = Math.hypot(lat - 13.6225, lng - 123.1885);
    const r = nextRand();
    const roofColor = roofPalettes[Math.floor(nextRand() * roofPalettes.length)];
    const tone = wallTones[Math.floor(nextRand() * wallTones.length)];

    if (distCentro < 0.0085) {
      if (r < 0.34) {
        return {
          type: 'highrise_tower',
          w: 0.38 + nextRand() * 0.14,
          d: 0.34 + nextRand() * 0.12,
          h: 1.05 + nextRand() * 0.65,
          tone,
          roofColor: '#01658E',
        };
      }
      if (r < 0.68) {
        return {
          type: 'stepped_midrise',
          w: 0.42 + nextRand() * 0.12,
          d: 0.36 + nextRand() * 0.12,
          h: 0.68 + nextRand() * 0.38,
          tone,
          roofColor: '#94A3B8',
        };
      }
      return {
        type: 'l_commercial',
        w: 0.44 + nextRand() * 0.1,
        d: 0.38 + nextRand() * 0.1,
        h: 0.48 + nextRand() * 0.25,
        tone,
        roofColor,
      };
    }

    if (distCentro < 0.0175) {
      if (r < 0.25) {
        return {
          type: 'stepped_midrise',
          w: 0.38 + nextRand() * 0.1,
          d: 0.34 + nextRand() * 0.1,
          h: 0.58 + nextRand() * 0.32,
          tone,
          roofColor: '#64748B',
        };
      }
      if (r < 0.52) {
        return {
          type: 'l_commercial',
          w: 0.40 + nextRand() * 0.1,
          d: 0.34 + nextRand() * 0.08,
          h: 0.42 + nextRand() * 0.2,
          tone,
          roofColor,
        };
      }
      if (r < 0.80) {
        return {
          type: 'townhouse_row',
          w: 0.46 + nextRand() * 0.1,
          d: 0.24 + nextRand() * 0.05,
          h: 0.38 + nextRand() * 0.12,
          tone,
          roofColor,
        };
      }
      return {
        type: 'gable_villa',
        w: 0.30 + nextRand() * 0.08,
        d: 0.26 + nextRand() * 0.06,
        h: 0.32 + nextRand() * 0.1,
        tone,
        roofColor,
      };
    }

    if (r < 0.18) {
      return {
        type: 'l_commercial',
        w: 0.36 + nextRand() * 0.08,
        d: 0.32 + nextRand() * 0.08,
        h: 0.38 + nextRand() * 0.14,
        tone,
        roofColor,
      };
    }
    if (r < 0.45) {
      return {
        type: 'townhouse_row',
        w: 0.42 + nextRand() * 0.08,
        d: 0.23 + nextRand() * 0.04,
        h: 0.34 + nextRand() * 0.1,
        tone,
        roofColor,
      };
    }
    if (r < 0.75) {
      return {
        type: 'gable_villa',
        w: 0.28 + nextRand() * 0.08,
        d: 0.24 + nextRand() * 0.06,
        h: 0.28 + nextRand() * 0.1,
        tone,
        roofColor,
      };
    }
    return {
      type: 'hip_house',
      w: 0.25 + nextRand() * 0.06,
      d: 0.23 + nextRand() * 0.06,
      h: 0.26 + nextRand() * 0.08,
      tone,
      roofColor,
    };
  };

  ALL_ROAD_POLYLINES.forEach(({ coords, halfWidth }) => {
    for (let i = 0; i < coords.length - 1; i++) {
      const [latA, lngA] = coords[i];
      const [latB, lngB] = coords[i + 1];
      const [ax, , az] = geoToWorld(latA, lngA);
      const [bx, , bz] = geoToWorld(latB, lngB);

      const segLen = Math.hypot(bx - ax, bz - az);
      if (segLen < 0.45) continue;

      const dirX = (bx - ax) / segLen;
      const dirZ = (bz - az) / segLen;
      const normX = -dirZ;
      const normZ = dirX;
      const roadAngle = Math.atan2(dirX, dirZ);

      const stepWorld = 0.52;
      const steps = Math.floor(segLen / stepWorld);

      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const baseLat = latA + (latB - latA) * t;
        const baseLng = lngA + (lngB - lngA) * t;

        [-1, 1].forEach((side) => {
          if (nextRand() < 0.16) return;
          const spec = selectBuildingSpec(baseLat, baseLng);
          const padRadius = Math.hypot(spec.w * 1.15, spec.d * 1.15) * 0.5;
          const setbackWorld = halfWidth + spec.d * 0.58 + 0.16 + nextRand() * 0.12;

          const worldX = ax + (bx - ax) * t + normX * side * setbackWorld;
          const worldZ = az + (bz - az) * t + normZ * side * setbackWorld;
          const bLng = NAGA_CENTER.lng + worldX / 255;
          const bLat = NAGA_CENTER.lat - worldZ / 255;

          if (!isClearOfInfrastructure(bLat, bLng, padRadius, placed)) return;

          placed.push({ x: worldX, z: worldZ, r: padRadius });
          buildings.push({
            lat: bLat,
            lng: bLng,
            rot: roadAngle + (side > 0 ? Math.PI * 0.5 : -Math.PI * 0.5),
            ...spec,
          });
        });
      }
    }
  });

  // Horizon-to-horizon regional settlement fill (Naga + surrounding Camarines Sur borderlands)
  for (let lat = 13.5750; lat <= 13.6800; lat += 0.0028) {
    for (let lng = 123.1350; lng <= 123.2850; lng += 0.0028) {
      const distCentro = Math.hypot(lat - 13.6225, lng - 123.1885);
      if (distCentro > 0.032 && nextRand() < 0.55) continue;
      if (distCentro > 0.022 && distCentro <= 0.032 && nextRand() < 0.35) continue;

      const bLat = lat + (nextRand() - 0.5) * 0.0014;
      const bLng = lng + (nextRand() - 0.5) * 0.0014;
      const spec = selectBuildingSpec(bLat, bLng);
      const padRadius = Math.hypot(spec.w * 1.15, spec.d * 1.15) * 0.5;

      if (!isClearOfInfrastructure(bLat, bLng, padRadius, placed)) continue;

      const [bx, , bz] = geoToWorld(bLat, bLng);
      placed.push({ x: bx, z: bz, r: padRadius });
      buildings.push({
        lat: bLat,
        lng: bLng,
        rot: Math.floor(nextRand() * 4) * (Math.PI * 0.5) + (nextRand() - 0.5) * 0.18,
        ...spec,
      });
    }
  }

  return buildings;
})();

export const NAGA_TREE_CLUSTERS = (() => {
  const trees = [];
  const buildingBoxes = NAGA_BUILDING_CLUSTERS.map((b) => {
    const [x, , z] = geoToWorld(b.lat, b.lng);
    return { x, z, r: Math.hypot(b.w * 1.15, b.d * 1.15) * 0.5 };
  });

  let idx = 0;
  for (let lat = 13.5740; lat <= 13.6810; lat += 0.0025) {
    for (let lng = 123.1340; lng <= 123.2860; lng += 0.0026) {
      idx++;
      const isOuterOrUpland = lng > 123.212 || lng < 123.170 || lat > 13.642 || lat < 13.604;
      if (!isOuterOrUpland && idx % 2 === 0) continue;

      const tLat = lat + (((idx * 13) % 7) - 3) * 0.00024;
      const tLng = lng + (((idx * 29) % 7) - 3) * 0.00024;
      if (!isClearOfInfrastructure(tLat, tLng, 0.13, buildingBoxes)) continue;

      const [x, y, z] = geoToWorld(tLat, tLng);
      trees.push({
        x,
        y,
        z,
        s: 0.65 + (idx % 5) * 0.13,
        variant: idx % 3,
      });
    }
  }
  return trees;
})();