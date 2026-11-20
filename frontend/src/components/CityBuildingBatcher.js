import { NAGA_OSM_BUILDINGS } from '../data/nagaOsmBuildings.js';
import {
  BICOL_RIVER_COORDS,
  CDRRMO_HUB,
  INITIAL_EVACUATION_CAMPS_FALLBACK,
  INITIAL_NAGA_POINTS,
  NAGA_BARANGAYS_GEOJSON,
  NAGA_RIVER_COORDS,
} from '../data/nagaGeoData.js';
import {
  NAGA_LOCAL_STREETS,
  NAGA_OSM_PRIMARY_ROADS,
  NAGA_OSM_SECONDARY_ROADS,
  NAGA_TERTIARY_ROADS,
} from '../data/nagaOsmRoads.js';

export const CIVIC_HALL_MIN_ZOOM = 13.8;
export const DETAIL_BUILDINGS_MIN_ZOOM = 14.8;
export const MAX_VIEWPORT_BUILDINGS = 10000;
export const MIN_MACRO_CLEARANCE_M = 500;
export const EXAGGERATION_MULTIPLIER = 85.0;
export const MIN_BUILDING_SCALE = [10.0, 10.5, 10.0];

const PROCEDURAL_STEP_M = 220;
const PROCEDURAL_OFFSET_M = 68;
const MIN_OSM_CLEARANCE_M = 120;
const MIN_PROCEDURAL_ROAD_CLEARANCE_M = 28;
const COLOSSAL_TOY_BASE_UNIT_M = 4.18;

const MIN_FACILITY_CLEARANCE_M = 250;
const MIN_CIVIC_LANDMARK_CLEARANCE_M = 500;
const MIN_RIVER_CLEARANCE_M = 185;
const MIN_CREEK_CLEARANCE_M = 120;

const COS_NAGA_LAT = Math.cos((13.621 * Math.PI) / 180);
const METERS_PER_DEG_LAT = 110636;
const METERS_PER_DEG_LNG = 111320 * COS_NAGA_LAT;
const METERS_PER_BUILDING_UNIT = 114;

export const BUILDING_ARCHETYPE_CONFIGS = [
  {
    key: 'house_residential',
    url: '/models/house_residential.glb',
    minZoom: DETAIL_BUILDINGS_MIN_ZOOM,
    targetFootprintM: 9.5,
    triangles: 6671,
    rawBounds: {
      min: [-4.75, 0, -6.2],
      max: [4.75, 7.6, 6.2],
      size: [9.5, 7.6, 12.4],
    },
    getScale: [1, 1, 1],
    zOffset: 0,
  },
  {
    key: 'shophouse_commercial',
    url: '/models/shophouse_commercial.glb',
    minZoom: DETAIL_BUILDINGS_MIN_ZOOM,
    targetFootprintM: 12.5,
    triangles: 6608,
    rawBounds: {
      min: [-6.25, 0, -6.75],
      max: [6.25, 11.4, 6.75],
      size: [12.5, 11.4, 13.5],
    },
    getScale: [1, 1, 1],
    zOffset: 0,
  },
  {
    key: 'midrise_building',
    url: '/models/midrise_building.glb',
    minZoom: DETAIL_BUILDINGS_MIN_ZOOM,
    targetFootprintM: 16,
    triangles: 109722,
    rawBounds: {
      min: [-7.5, 0, -9.5],
      max: [7.5, 21.0, 9.5],
      size: [15.0, 21.0, 19.0],
    },
    getScale: [1, 1, 1],
    zOffset: 0,
  },
  {
    key: 'civic_hall',
    url: '/models/low_poly_city_hall.glb?v=6',
    minZoom: CIVIC_HALL_MIN_ZOOM,
    targetFootprintM: 28,
    triangles: 6917,
    rawBounds: {
      min: [-2.504, -0.002, -4.624],
      max: [2.906, 7.105, 4.624],
      size: [5.41, 7.107, 9.248],
    },
    getScale: [1, 1, 1],
    zOffset: 0,
  },
];

const ARCHETYPE_CONFIG_BY_KEY = Object.fromEntries(
  BUILDING_ARCHETYPE_CONFIGS.map((cfg) => [cfg.key, cfg])
);

const CONCEPCION_CREEK_COORDS = [
  [13.6212, 123.1995],
  [13.6215, 123.2022],
  [13.622, 123.2045],
  [13.6225, 123.207],
];

const NAGA_ELEVATION_ANCHORS_M = [
  { lat: 13.6192, lng: 123.1766, elevM: 4.0 },
  { lat: 13.6164, lng: 123.1848, elevM: 4.0 },
  { lat: 13.6095, lng: 123.1818, elevM: 5.0 },
  { lat: 13.6118, lng: 123.1924, elevM: 6.0 },
  { lat: 13.6335, lng: 123.1922, elevM: 11.0 },
  { lat: 13.6178, lng: 123.2042, elevM: 14.0 },
  { lat: 13.6275, lng: 123.2215, elevM: 48.0 },
  { lat: 13.647, lng: 123.224, elevM: 115.0 },
];

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS_M = 6371000;

function haversineDistanceM(aLat, aLng, bLat, bLng) {
  const dLat = (bLat - aLat) * DEG_TO_RAD;
  const dLng = (bLng - aLng) * DEG_TO_RAD;
  const sinLat = Math.sin(dLat * 0.5);
  const sinLng = Math.sin(dLng * 0.5);
  const h =
    sinLat * sinLat +
    Math.cos(aLat * DEG_TO_RAD) * Math.cos(bLat * DEG_TO_RAD) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function distanceMeters(aLat, aLng, bLat, bLng) {
  const dy = (aLat - bLat) * METERS_PER_DEG_LAT;
  const dx = (aLng - bLng) * METERS_PER_DEG_LNG;
  return Math.hypot(dx, dy);
}

function pointToSegmentDistanceM(lat, lng, aLat, aLng, bLat, bLng) {
  const px = lng * METERS_PER_DEG_LNG;
  const py = lat * METERS_PER_DEG_LAT;
  const ax = aLng * METERS_PER_DEG_LNG;
  const ay = aLat * METERS_PER_DEG_LAT;
  const bx = bLng * METERS_PER_DEG_LNG;
  const by = bLat * METERS_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function getTerrainElevationM(lat, lng) {
  let wSum = 0;
  let eSum = 0;
  for (let i = 0; i < NAGA_ELEVATION_ANCHORS_M.length; i++) {
    const a = NAGA_ELEVATION_ANCHORS_M[i];
    const dKm = distanceMeters(lat, lng, a.lat, a.lng) / 1000;
    const d2 = dKm * dKm + 0.12;
    const w = 1 / (d2 * d2);
    wSum += w;
    eSum += w * a.elevM;
  }
  return wSum > 0 ? Number((eSum / wSum).toFixed(2)) : 5.0;
}

const ROAD_GRID_STEP_DEG = 0.0025;
const MAJOR_ROAD_GRID = new Map();
const ALL_ROAD_CELL_DEG = 0.0005;
const ALL_ROAD_GRID = new Map();

function indexRoadGroup(polylines, isMajor) {
  if (!Array.isArray(polylines)) return;
  for (let i = 0; i < polylines.length; i++) {
    const line = polylines[i];
    if (!Array.isArray(line) || line.length < 2) continue;
    for (let j = 0; j < line.length - 1; j++) {
      const pA = line[j];
      const pB = line[j + 1];
      if (!pA || !pB) continue;
      const seg = { aLat: pA[0], aLng: pA[1], bLat: pB[0], bLng: pB[1] };

      const aR1 = Math.floor(Math.min(seg.aLat, seg.bLat) / ALL_ROAD_CELL_DEG);
      const aR2 = Math.floor(Math.max(seg.aLat, seg.bLat) / ALL_ROAD_CELL_DEG);
      const aC1 = Math.floor(Math.min(seg.aLng, seg.bLng) / ALL_ROAD_CELL_DEG);
      const aC2 = Math.floor(Math.max(seg.aLng, seg.bLng) / ALL_ROAD_CELL_DEG);
      for (let r = aR1; r <= aR2; r++) {
        for (let c = aC1; c <= aC2; c++) {
          const key = `${r},${c}`;
          let bucket = ALL_ROAD_GRID.get(key);
          if (!bucket) {
            bucket = [];
            ALL_ROAD_GRID.set(key, bucket);
          }
          bucket.push(seg);
        }
      }

      if (isMajor) {
        const minCellLat = Math.floor(Math.min(seg.aLat, seg.bLat) / ROAD_GRID_STEP_DEG);
        const maxCellLat = Math.floor(Math.max(seg.aLat, seg.bLat) / ROAD_GRID_STEP_DEG);
        const minCellLng = Math.floor(Math.min(seg.aLng, seg.bLng) / ROAD_GRID_STEP_DEG);
        const maxCellLng = Math.floor(Math.max(seg.aLng, seg.bLng) / ROAD_GRID_STEP_DEG);
        for (let r = minCellLat; r <= maxCellLat; r++) {
          for (let c = minCellLng; c <= maxCellLng; c++) {
            const key = `${r},${c}`;
            let bucket = MAJOR_ROAD_GRID.get(key);
            if (!bucket) {
              bucket = [];
              MAJOR_ROAD_GRID.set(key, bucket);
            }
            bucket.push(seg);
          }
        }
      }
    }
  }
}

indexRoadGroup(NAGA_OSM_PRIMARY_ROADS, true);
indexRoadGroup(NAGA_OSM_SECONDARY_ROADS, true);
indexRoadGroup(NAGA_TERTIARY_ROADS, false);
indexRoadGroup(NAGA_LOCAL_STREETS, false);

function getMajorRoadDistanceM(lat, lng) {
  const r0 = Math.floor(lat / ROAD_GRID_STEP_DEG);
  const c0 = Math.floor(lng / ROAD_GRID_STEP_DEG);
  let minDist = Infinity;
  const seen = new Set();

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const bucket = MAJOR_ROAD_GRID.get(`${r0 + dr},${c0 + dc}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const seg = bucket[i];
        if (seen.has(seg)) continue;
        seen.add(seg);
        const d = pointToSegmentDistanceM(lat, lng, seg.aLat, seg.aLng, seg.bLat, seg.bLng);
        if (d < minDist) minDist = d;
      }
    }
  }

  return minDist;
}

function isNearAnyRoadM(lat, lng, thresholdM) {
  const r0 = Math.floor(lat / ALL_ROAD_CELL_DEG);
  const c0 = Math.floor(lng / ALL_ROAD_CELL_DEG);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const bucket = ALL_ROAD_GRID.get(`${r0 + dr},${c0 + dc}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        const seg = bucket[i];
        if (
          pointToSegmentDistanceM(lat, lng, seg.aLat, seg.aLng, seg.bLat, seg.bLng) < thresholdM
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

let MAJOR_ROAD_SEGMENTS_CACHE = null;

function getMajorRoadSegmentsFlat() {
  if (MAJOR_ROAD_SEGMENTS_CACHE) return MAJOR_ROAD_SEGMENTS_CACHE;
  const flat = [];
  const groups = [NAGA_OSM_PRIMARY_ROADS, NAGA_OSM_SECONDARY_ROADS];
  for (let g = 0; g < groups.length; g++) {
    const list = groups[g];
    if (!Array.isArray(list)) continue;
    for (let r = 0; r < list.length; r++) {
      const road = list[r];
      if (!Array.isArray(road)) continue;
      for (let i = 0; i < road.length - 1; i++) {
        const [aLat, aLng] = road[i];
        const [bLat, bLng] = road[i + 1];
        if (
          !Number.isFinite(aLat) ||
          !Number.isFinite(aLng) ||
          !Number.isFinite(bLat) ||
          !Number.isFinite(bLng)
        ) {
          continue;
        }
        flat.push({ aLat, aLng, bLat, bLng });
      }
    }
  }
  MAJOR_ROAD_SEGMENTS_CACHE = flat;
  return flat;
}

function getNearestRoadInfo(lat, lng) {
  const px = lng * METERS_PER_DEG_LNG;
  const py = lat * METERS_PER_DEG_LAT;
  let bestRawDist = Infinity;
  let bestRawSeg = null;
  let bestRawSide = 1;
  let bestCleanDist = Infinity;
  let bestCleanSeg = null;
  let bestCleanSide = 1;

  const evalSegment = (seg) => {
    const ax = seg.aLng * METERS_PER_DEG_LNG;
    const ay = seg.aLat * METERS_PER_DEG_LAT;
    const bx = seg.bLng * METERS_PER_DEG_LNG;
    const by = seg.bLat * METERS_PER_DEG_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 9) return;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const d = Math.hypot(px - cx, py - cy);
    const side = (px - cx) * dy - (py - cy) * dx >= 0 ? 1 : -1;

    if (d < bestRawDist) {
      bestRawDist = d;
      bestRawSeg = { dx, dy };
      bestRawSide = side;
    }
    if (lenSq >= 625 && d < bestCleanDist) {
      bestCleanDist = d;
      bestCleanSeg = { dx, dy };
      bestCleanSide = side;
    }
  };

  const majorSegs = getMajorRoadSegmentsFlat();
  for (let i = 0; i < majorSegs.length; i++) {
    evalSegment(majorSegs[i]);
  }

  const chosenSeg =
    bestCleanSeg && bestCleanDist <= bestRawDist + 25 ? bestCleanSeg : bestRawSeg;
  const chosenSide =
    chosenSeg === bestCleanSeg ? bestCleanSide : bestRawSide;

  if (!chosenSeg) {
    return { bearingDeg: 0, angleDeg: 0, signedSide: 1 };
  }
  const rawBearingDeg = (Math.atan2(chosenSeg.dx, chosenSeg.dy) * 180) / Math.PI;
  const bearingDeg = ((rawBearingDeg % 360) + 360) % 360;
  return {
    bearingDeg,
    angleDeg: bearingDeg,
    signedSide: chosenSide,
  };
}

const BARANGAY_BBOX_INDEX = (NAGA_BARANGAYS_GEOJSON?.features || []).map((feat) => {
  const ring = feat.geometry?.coordinates?.[0] || [];
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const [rLat, rLng] = ring[i];
    if (rLat < minLat) minLat = rLat;
    if (rLat > maxLat) maxLat = rLat;
    if (rLng < minLng) minLng = rLng;
    if (rLng > maxLng) maxLng = rLng;
  }
  return {
    name: feat.properties?.name || 'Centro',
    ring,
    minLat,
    maxLat,
    minLng,
    maxLng,
  };
});

function resolveBarangayName(lat, lng) {
  for (let i = 0; i < BARANGAY_BBOX_INDEX.length; i++) {
    const b = BARANGAY_BBOX_INDEX[i];
    if (lat < b.minLat || lat > b.maxLat || lng < b.minLng || lng > b.maxLng) continue;
    let inside = false;
    const ring = b.ring;
    for (let p = 0, q = ring.length - 1; p < ring.length; q = p++) {
      const [x1, y1] = ring[p];
      const [x2, y2] = ring[q];
      if ((y1 > lng) !== (y2 > lng) && lat < ((x2 - x1) * (lng - y1)) / (y2 - y1) + x1) {
        inside = !inside;
      }
    }
    if (inside) return b.name;
  }
  return '';
}

export function isInsideWaterwayClearance(
  lat,
  lng,
  riverMarginM = MIN_RIVER_CLEARANCE_M,
  creekMarginM = MIN_CREEK_CLEARANCE_M
) {
  for (const poly of [NAGA_RIVER_COORDS, BICOL_RIVER_COORDS]) {
    for (let i = 0; i < poly.length - 1; i++) {
      if (
        pointToSegmentDistanceM(lat, lng, poly[i][0], poly[i][1], poly[i + 1][0], poly[i + 1][1]) <
        riverMarginM
      ) {
        return true;
      }
    }
  }
  for (let i = 0; i < CONCEPCION_CREEK_COORDS.length - 1; i++) {
    const a = CONCEPCION_CREEK_COORDS[i];
    const b = CONCEPCION_CREEK_COORDS[i + 1];
    if (pointToSegmentDistanceM(lat, lng, a[0], a[1], b[0], b[1]) < creekMarginM) {
      return true;
    }
  }
  return false;
}

function spatialHash01(lng, lat, salt = 0) {
  const x =
    Math.round(lng * 100000) * 12.9898 +
    Math.round(lat * 100000) * 78.233 +
    salt * 43.17;
  const s = Math.sin(x) * 43758.5453;
  return s - Math.floor(s);
}

function computeLotFootprintAreaM2(b) {
  const w = Number.isFinite(b?.w) && b.w > 0 ? b.w : 0.13;
  const d = Number.isFinite(b?.d) && b.d > 0 ? b.d : 0.1;
  const rawPoly =
    Array.isArray(b?.footprint) && b.footprint.length >= 3
      ? b.footprint
      : Array.isArray(b?.parcelPolygon) && b.parcelPolygon.length >= 3
      ? b.parcelPolygon
      : null;

  if (!rawPoly) {
    return Math.max(36, w * d * METERS_PER_BUILDING_UNIT * METERS_PER_BUILDING_UNIT);
  }

  let doubleArea = 0;
  for (let i = 0; i < rawPoly.length; i++) {
    const [x1, y1] = rawPoly[i];
    const [x2, y2] = rawPoly[(i + 1) % rawPoly.length];
    doubleArea += x1 * y2 - x2 * y1;
  }
  const areaM2 = 0.5 * Math.abs(doubleArea) * METERS_PER_BUILDING_UNIT * METERS_PER_BUILDING_UNIT;
  return Math.max(36, areaM2);
}

function hashBuildingFacingQuarter(id, lng, lat) {
  let h = 2166136261;
  const key = String(id || '');
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idPart = ((h >>> 0) % 10000) / 10000;
  const coordPart = spatialHash01(lng, lat, 19);
  const mixed = (idPart * 0.63 + coordPart * 0.37) % 1;
  return Math.floor(mixed * 4) % 4;
}

function resolveOrthogonalRoadAngle(lat, lng, id) {
  const { bearingDeg: nearestMainRoadBearing } = getNearestRoadInfo(lat, lng);
  const orthoOffsetDeg = hashBuildingFacingQuarter(id, lng, lat) * 90;
  const snapped = (((nearestMainRoadBearing + orthoOffsetDeg) % 360) + 360) % 360;
  return Number(snapped.toFixed(1));
}

function classifyUrbanArchetype(areaM2, majorRoadDistM) {
  if (areaM2 > 500) return 'civic_hall';
  if (majorRoadDistM <= 40) return 'shophouse_commercial';
  if (areaM2 > 250) return 'midrise_building';
  return 'house_residential';
}

function computeColossalScaleVec(lng, lat, archetype, aspectBias = 1) {
  const cfg = ARCHETYPE_CONFIG_BY_KEY[archetype] || ARCHETYPE_CONFIG_BY_KEY.house_residential;
  const [rawW, , rawD] = cfg.rawBounds.size;

  const macroMult = EXAGGERATION_MULTIPLIER - 13.0 + spatialHash01(lng, lat, 11) * 26.0;
  const targetSpan = macroMult * COLOSSAL_TOY_BASE_UNIT_M;
  const heightJitter = 0.90 + spatialHash01(lng, lat, 9) * 0.22;

  let scx;
  let scy;
  let scz;
  if (archetype === 'house_residential') {
    scx = Math.min(39.0, Math.max(32.5, targetSpan / (rawW * aspectBias)));
    scz = Math.min(29.8, Math.max(25.0, (targetSpan * aspectBias) / rawD));
    scy = Math.max(27.5, ((scx + scz) * 0.5) * 0.96 * heightJitter);
  } else if (archetype === 'shophouse_commercial') {
    scx = Math.min(29.6, Math.max(24.8, (targetSpan * 0.98) / (rawW * aspectBias)));
    scz = Math.min(27.4, Math.max(22.8, (targetSpan * 0.97 * aspectBias) / rawD));
    scy = Math.max(20.0, ((scx + scz) * 0.5) * 0.90 * heightJitter);
  } else if (archetype === 'midrise_building') {
    scx = Math.min(24.6, Math.max(20.5, (targetSpan * 0.98) / (rawW * aspectBias)));
    scz = Math.min(19.4, Math.max(16.2, (targetSpan * 0.98 * aspectBias) / rawD));
    scy = Math.max(15.2, ((scx + scz) * 0.5) * 0.88 * heightJitter);
  } else {
    scx = Math.min(15.0, Math.max(12.6, (targetSpan * 1.01) / (rawW * aspectBias)));
    scz = Math.min(13.8, Math.max(11.6, (targetSpan * 1.01 * aspectBias) / rawD));
    scy = Math.max(11.5, ((scx + scz) * 0.5) * 0.96 * heightJitter);
  }

  return [Number(scx.toFixed(3)), Number(scy.toFixed(3)), Number(scz.toFixed(3))];
}

// Snug SimCity lot proportions so concrete/grass pads hug building bases cleanly
function computeSimCityLotSpec(archetype) {
  const cfg = ARCHETYPE_CONFIG_BY_KEY[archetype] || ARCHETYPE_CONFIG_BY_KEY.house_residential;
  const [rawX, , rawZ] = cfg.rawBounds.size;

  if (archetype === 'shophouse_commercial') {
    const sx = 7.0;
    const sy = 12.2;
    const sz = 7.0;
    const buildingWidthM = Number((rawX * sx).toFixed(1));
    const buildingDepthM = Number((rawZ * sz).toFixed(1));
    return {
      scaleVec: [sx, sy, sz],
      buildingWidthM,
      buildingDepthM,
      lotWidthM: Number((buildingWidthM + 1.0).toFixed(1)),
      lotDepthM: Number((buildingDepthM + 1.0).toFixed(1)),
    };
  }

  if (archetype === 'midrise_building') {
    const sx = 8.2;
    const sy = 12.2;
    const sz = 8.2;
    const buildingDepthM = Number((rawX * sx).toFixed(1));
    const buildingWidthM = Number((rawZ * sz).toFixed(1));
    return {
      scaleVec: [sx, sy, sz],
      buildingWidthM,
      buildingDepthM,
      lotWidthM: Number((buildingWidthM + 1.4).toFixed(1)),
      lotDepthM: Number((buildingDepthM + 1.4).toFixed(1)),
    };
  }

  const sx = 12.2;
  const sy = 12.6;
  const sz = 12.2;
  const buildingDepthM = Number((rawX * sx).toFixed(1));
  const buildingWidthM = Number((rawZ * sz).toFixed(1));
  return {
    scaleVec: [sx, sy, sz],
    buildingWidthM,
    buildingDepthM,
    lotWidthM: Number((buildingWidthM + 1.5).toFixed(1)),
    lotDepthM: Number((buildingDepthM + 1.5).toFixed(1)),
  };
}

function computeStreetFacingYawDeg(archetype, faceBearingDeg) {
  let frontAxisOffset = 270;
  if (archetype === 'shophouse_commercial') {
    frontAxisOffset = 180;
  } else if (archetype === 'midrise_building') {
    frontAxisOffset = 90;
  }
  return Number((((frontAxisOffset - faceBearingDeg) % 360 + 360) % 360).toFixed(1));
}

function buildOrientedRectRingLngLat(centerLng, centerLat, alongUx, alongUy, faceFx, faceFy, widthM, depthM, frontBiasM = 0) {
  const halfW = widthM * 0.5;
  const frontD = depthM * 0.5 + frontBiasM;
  const backD = depthM * 0.5 - frontBiasM;

  const toLngLat = (alongM, forwardM) => [
    Number((centerLng + (alongUx * alongM + faceFx * forwardM) / METERS_PER_DEG_LNG).toFixed(6)),
    Number((centerLat + (alongUy * alongM + faceFy * forwardM) / METERS_PER_DEG_LAT).toFixed(6)),
  ];

  const p0 = toLngLat(-halfW, frontD);
  const p1 = toLngLat(halfW, frontD);
  const p2 = toLngLat(halfW, -backD);
  const p3 = toLngLat(-halfW, -backD);
  return [p0, p1, p2, p3, p0];
}

function buildLotSamplePointsLngLat(centerLng, centerLat, alongUx, alongUy, faceFx, faceFy, widthM, depthM, frontBiasM = 0) {
  const halfW = widthM * 0.5;
  const frontD = depthM * 0.5 + frontBiasM;
  const backD = depthM * 0.5 - frontBiasM;
  const pts = [];

  for (const uFrac of [-1, -0.5, 0, 0.5, 1]) {
    const alongM = uFrac * halfW;
    for (const vFrac of [0, 0.25, 0.5, 0.75, 1]) {
      const forwardM = -backD + vFrac * (frontD + backD);
      pts.push([
        centerLng + (alongUx * alongM + faceFx * forwardM) / METERS_PER_DEG_LNG,
        centerLat + (alongUy * alongM + faceFy * forwardM) / METERS_PER_DEG_LAT,
      ]);
    }
  }
  return pts;
}

function doesRoadClipOrientedLot(
  centerLng,
  centerLat,
  alongUx,
  alongUy,
  faceFx,
  faceFy,
  halfWidthM,
  halfDepthM,
  roadSegmentsLngLat,
  roadBufferM
) {
  const cx = centerLng * METERS_PER_DEG_LNG;
  const cy = centerLat * METERS_PER_DEG_LAT;
  const boundU = halfWidthM + roadBufferM;
  const boundV = halfDepthM + roadBufferM;

  for (let i = 0; i < roadSegmentsLngLat.length; i++) {
    const [lng1, lat1, lng2, lat2] = roadSegmentsLngLat[i];
    const ax = lng1 * METERS_PER_DEG_LNG - cx;
    const ay = lat1 * METERS_PER_DEG_LAT - cy;
    const bx = lng2 * METERS_PER_DEG_LNG - cx;
    const by = lat2 * METERS_PER_DEG_LAT - cy;

    const u0 = ax * alongUx + ay * alongUy;
    const v0 = ax * faceFx + ay * faceFy;
    const u1 = bx * alongUx + by * alongUy;
    const v1 = bx * faceFx + by * faceFy;

    if (
      (u0 < -boundU && u1 < -boundU) ||
      (u0 > boundU && u1 > boundU) ||
      (v0 < -boundV && v1 < -boundV) ||
      (v0 > boundV && v1 > boundV)
    ) {
      continue;
    }

    const du = u1 - u0;
    const dv = v1 - v0;
    let tMin = 0;
    let tMax = 1;

    const clipAxis = (p, q) => {
      if (Math.abs(p) < 1e-8) return q >= 0;
      const r = q / p;
      if (p < 0) {
        if (r > tMax) return false;
        if (r > tMin) tMin = r;
      } else {
        if (r < tMin) return false;
        if (r < tMax) tMax = r;
      }
      return true;
    };

    if (
      clipAxis(-du, u0 + boundU) &&
      clipAxis(du, boundU - u0) &&
      clipAxis(-dv, v0 + boundV) &&
      clipAxis(dv, boundV - v0) &&
      tMin <= tMax
    ) {
      return true;
    }
  }
  return false;
}

function doOrientedLotRingsOverlap(ringA, ringB, padM = 1.8) {
  if (!Array.isArray(ringA) || !Array.isArray(ringB) || ringA.length < 4 || ringB.length < 4) {
    return false;
  }

  const ptsA = [
    [ringA[0][0] * METERS_PER_DEG_LNG, ringA[0][1] * METERS_PER_DEG_LAT],
    [ringA[1][0] * METERS_PER_DEG_LNG, ringA[1][1] * METERS_PER_DEG_LAT],
    [ringA[2][0] * METERS_PER_DEG_LNG, ringA[2][1] * METERS_PER_DEG_LAT],
    [ringA[3][0] * METERS_PER_DEG_LNG, ringA[3][1] * METERS_PER_DEG_LAT],
  ];
  const ptsB = [
    [ringB[0][0] * METERS_PER_DEG_LNG, ringB[0][1] * METERS_PER_DEG_LAT],
    [ringB[1][0] * METERS_PER_DEG_LNG, ringB[1][1] * METERS_PER_DEG_LAT],
    [ringB[2][0] * METERS_PER_DEG_LNG, ringB[2][1] * METERS_PER_DEG_LAT],
    [ringB[3][0] * METERS_PER_DEG_LNG, ringB[3][1] * METERS_PER_DEG_LAT],
  ];

  const axes = [];
  for (const poly of [ptsA, ptsB]) {
    for (let i = 0; i < 2; i++) {
      const ex = poly[i + 1][0] - poly[i][0];
      const ey = poly[i + 1][1] - poly[i][1];
      const len = Math.hypot(ex, ey);
      if (len > 1e-6) {
        axes.push([-ey / len, ex / len]);
      }
    }
  }

  for (let a = 0; a < axes.length; a++) {
    const [ax, ay] = axes[a];
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;

    for (let i = 0; i < 4; i++) {
      const projA = ptsA[i][0] * ax + ptsA[i][1] * ay;
      if (projA < minA) minA = projA;
      if (projA > maxA) maxA = projA;

      const projB = ptsB[i][0] * ax + ptsB[i][1] * ay;
      if (projB < minB) minB = projB;
      if (projB > maxB) maxB = projB;
    }

    if (maxA + padM <= minB || maxB + padM <= minA) {
      return false;
    }
  }

  return true;
}

function resolveMacroBlockTransform(lat, lng, bid, archetype) {
  const bearingDeg = resolveOrthogonalRoadAngle(lat, lng, bid);
  const yawDeg = Number((((90 - bearingDeg) % 360 + 360) % 360).toFixed(1));
  return {
    bearingDeg,
    roadAngle: bearingDeg,
    yawDeg,
    scaleVec: computeColossalScaleVec(lng, lat, archetype, 1),
  };
}

const OSM_CLEAR_CELL_DEG = 0.001;
const OSM_BUILDING_GRID = new Map();
for (let i = 0; i < NAGA_OSM_BUILDINGS.length; i++) {
  const b = NAGA_OSM_BUILDINGS[i];
  if (b?.lat == null || b?.lng == null) continue;
  const key = `${Math.floor(b.lat / OSM_CLEAR_CELL_DEG)},${Math.floor(b.lng / OSM_CLEAR_CELL_DEG)}`;
  let bucket = OSM_BUILDING_GRID.get(key);
  if (!bucket) {
    bucket = [];
    OSM_BUILDING_GRID.set(key, bucket);
  }
  bucket.push(b);
}

function isNearRealOsmBuildingM(lat, lng, minRadiusM) {
  const r0 = Math.floor(lat / OSM_CLEAR_CELL_DEG);
  const c0 = Math.floor(lng / OSM_CLEAR_CELL_DEG);
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const bucket = OSM_BUILDING_GRID.get(`${r0 + dr},${c0 + dc}`);
      if (!bucket) continue;
      for (let i = 0; i < bucket.length; i++) {
        if (distanceMeters(lat, lng, bucket[i].lat, bucket[i].lng) < minRadiusM) {
          return true;
        }
      }
    }
  }
  return false;
}

export function generateProceduralInfill(waterPoints = [], evacuationCamps = []) {
  const generated = [];

  const roadTiers = [
    { archetype: 'shophouse_commercial', prefix: 'PROC-SHOP', groups: [NAGA_OSM_SECONDARY_ROADS, NAGA_TERTIARY_ROADS] },
    { archetype: 'house_residential', prefix: 'PROC-HOUSE', groups: [NAGA_LOCAL_STREETS] },
  ];

  let seqId = 1;
  for (let t = 0; t < roadTiers.length; t++) {
    const { archetype, prefix, groups } = roadTiers[t];
    for (let g = 0; g < groups.length; g++) {
      const polylines = groups[g];
      if (!Array.isArray(polylines)) continue;
      for (let p = 0; p < polylines.length; p++) {
        const line = polylines[p];
        if (!Array.isArray(line) || line.length < 2) continue;
        let nextSpawnM = PROCEDURAL_STEP_M * 0.5;
        let accM = 0;

        for (let s = 0; s < line.length - 1; s++) {
          const [aLat, aLng] = line[s];
          const [bLat, bLng] = line[s + 1];
          const dxEast = (bLng - aLng) * METERS_PER_DEG_LNG;
          const dyNorth = (bLat - aLat) * METERS_PER_DEG_LAT;
          const segLenM = Math.hypot(dxEast, dyNorth);
          if (segLenM < 1) continue;

          const ux = dxEast / segLenM;
          const uy = dyNorth / segLenM;
          const nx = -uy;
          const ny = ux;

          while (nextSpawnM <= accM + segLenM) {
            const alongM = nextSpawnM - accM;
            const baseLat = aLat + (uy * alongM) / METERS_PER_DEG_LAT;
            const baseLng = aLng + (ux * alongM) / METERS_PER_DEG_LNG;

            for (const side of [-1, 1]) {
              const lat = Number((baseLat + (ny * PROCEDURAL_OFFSET_M * side) / METERS_PER_DEG_LAT).toFixed(6));
              const lng = Number((baseLng + (nx * PROCEDURAL_OFFSET_M * side) / METERS_PER_DEG_LNG).toFixed(6));

              const barangay = resolveBarangayName(lat, lng);
              if (!barangay) continue;
              if (isNearRealOsmBuildingM(lat, lng, MIN_OSM_CLEARANCE_M)) continue;
              if (isNearAnyRoadM(lat, lng, MIN_PROCEDURAL_ROAD_CLEARANCE_M)) continue;
              if (isInsideWaterwayClearance(lat, lng)) continue;

              let blockedByFacility =
                distanceMeters(lat, lng, CDRRMO_HUB.lat, CDRRMO_HUB.lng) < MIN_FACILITY_CLEARANCE_M;
              if (!blockedByFacility && Array.isArray(waterPoints)) {
                for (let w = 0; w < waterPoints.length; w++) {
                  if (distanceMeters(lat, lng, waterPoints[w].lat, waterPoints[w].lng) < MIN_FACILITY_CLEARANCE_M) {
                    blockedByFacility = true;
                    break;
                  }
                }
              }
              if (blockedByFacility) continue;

              let blockedByCamp = false;
              if (Array.isArray(evacuationCamps)) {
                for (let c = 0; c < evacuationCamps.length; c++) {
                  if (
                    distanceMeters(lat, lng, evacuationCamps[c].lat, evacuationCamps[c].lng) <
                    MIN_CIVIC_LANDMARK_CLEARANCE_M
                  ) {
                    blockedByCamp = true;
                    break;
                  }
                }
              }
              if (blockedByCamp) continue;

              const procId = `${prefix}-${seqId++}`;
              const { bearingDeg, roadAngle, yawDeg, scaleVec } = resolveMacroBlockTransform(
                lat,
                lng,
                procId,
                archetype
              );

              generated.push({
                id: procId,
                lat,
                lng,
                barangay,
                areaM2: archetype === 'shophouse_commercial' ? 205 : 155,
                archetype,
                bearingDeg,
                roadAngle,
                yawDeg,
                scaleVec,
                elevation_m: getTerrainElevationM(lat, lng),
                isEvacLandmark: false,
                isProcedural: true,
              });
            }
            nextSpawnM += PROCEDURAL_STEP_M;
          }
          accM += segLenM;
        }
      }
    }
  }

  return generated;
}

const STATIC_TITAN_CANDIDATES = (() => {
  const osmItems = [];
  const seenIds = new Set();

  for (let i = 0; i < NAGA_OSM_BUILDINGS.length; i++) {
    const b = NAGA_OSM_BUILDINGS[i];
    if (b?.lat == null || b?.lng == null) continue;
    const bid = b.id || `BLDG-${i + 1}`;
    if (seenIds.has(bid)) continue;
    seenIds.add(bid);
    if (isInsideWaterwayClearance(b.lat, b.lng)) continue;

    const areaM2 = computeLotFootprintAreaM2(b);
    const majorRoadDistM = getMajorRoadDistanceM(b.lat, b.lng);
    const archetype = classifyUrbanArchetype(areaM2, majorRoadDistM);
    const { bearingDeg, roadAngle, yawDeg, scaleVec } = resolveMacroBlockTransform(
      b.lat,
      b.lng,
      bid,
      archetype
    );

    osmItems.push({
      id: bid,
      lat: b.lat,
      lng: b.lng,
      barangay: b.barangay || resolveBarangayName(b.lat, b.lng),
      areaM2: Math.round(areaM2),
      archetype,
      bearingDeg,
      roadAngle,
      yawDeg,
      scaleVec,
      elevation_m: getTerrainElevationM(b.lat, b.lng),
      isEvacLandmark: false,
      isProcedural: false,
    });
  }

  const procItems = generateProceduralInfill([], []);
  return [...osmItems, ...procItems];
})();

function resolveEvacuationCivicHalls(evacuationCamps = INITIAL_EVACUATION_CAMPS_FALLBACK) {
  const sourceList =
    Array.isArray(evacuationCamps) && evacuationCamps.length > 0
      ? evacuationCamps
      : INITIAL_EVACUATION_CAMPS_FALLBACK;

  const targetDefs = [
    {
      matchId: 'CAMP-01',
      matchName: 'Robredo',
      badgeTitle: 'EVACUATION CAMP · JMR Coliseum',
      yawDeg: 0,
      fallback: INITIAL_EVACUATION_CAMPS_FALLBACK[0],
    },
    {
      matchId: 'CAMP-02',
      matchName: "People's Hall",
      badgeTitle: "EVACUATION CAMP · Naga City People's Hall",
      yawDeg: 90,
      fallback: INITIAL_EVACUATION_CAMPS_FALLBACK[1],
    },
  ];

  return targetDefs
    .map((def) => {
      const matched =
        sourceList.find(
          (c) => c.id === def.matchId || c.name?.toLowerCase().includes(def.matchName.toLowerCase())
        ) || def.fallback;
      if (!matched || matched.lat == null || matched.lng == null) return null;
      const campLat = Number(matched.lat);
      const campLng = Number(matched.lng);
      const { bearingDeg, roadAngle, yawDeg } = resolveMacroBlockTransform(
        campLat,
        campLng,
        matched.id || def.matchId,
        'civic_hall'
      );
      return {
        id: matched.id,
        name: matched.name,
        barangay_name: matched.barangay_name,
        badgeTitle: def.badgeTitle,
        status: matched.status,
        evacuees: matched.evacuees,
        lat: campLat,
        lng: campLng,
        bearingDeg,
        roadAngle,
        yawDeg,
        scaleVec: [10.0, 10.5, 10.0],
        elevation_m: getTerrainElevationM(campLat, campLng),
        archetype: 'civic_hall',
        isEvacLandmark: true,
      };
    })
    .filter(Boolean);
}

const CITY_POOL_CACHE = new Map();
const MAX_POOL_CACHE_ENTRIES = 8;
const EMPTY_VIEWPORT_CACHE = new WeakMap();

export function buildCityBuildingPool(
  waterPoints = INITIAL_NAGA_POINTS,
  evacuationCamps = INITIAL_EVACUATION_CAMPS_FALLBACK,
  scaleMultiplier = EXAGGERATION_MULTIPLIER
) {
  const wpKey = Array.isArray(waterPoints)
    ? waterPoints.map((p) => `${p.id}:${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`).join('|')
    : '';
  const campKey = Array.isArray(evacuationCamps)
    ? evacuationCamps
        .map((c) => `${c.id}:${Number(c.lat).toFixed(5)},${Number(c.lng).toFixed(5)}:${c.status || ''}:${c.evacuees || 0}`)
        .join('|')
    : '';
  const cacheKey = `${scaleMultiplier}__${wpKey}__${campKey}`;
  if (CITY_POOL_CACHE.has(cacheKey)) {
    return CITY_POOL_CACHE.get(cacheKey);
  }

  const evacHalls = resolveEvacuationCivicHalls(evacuationCamps);
  const scaleFactor =
    Number.isFinite(scaleMultiplier) && EXAGGERATION_MULTIPLIER > 0
      ? scaleMultiplier / EXAGGERATION_MULTIPLIER
      : 1;
  const finalCulledBuildings = [];

  for (let i = 0; i < STATIC_TITAN_CANDIDATES.length; i++) {
    const candidate = STATIC_TITAN_CANDIDATES[i];
    if (isInsideWaterwayClearance(candidate.lat, candidate.lng)) {
      continue;
    }

    if (
      haversineDistanceM(candidate.lat, candidate.lng, CDRRMO_HUB.lat, CDRRMO_HUB.lng) <=
      MIN_FACILITY_CLEARANCE_M
    ) {
      continue;
    }

    let blockedByFacility = false;
    for (let j = 0; j < waterPoints.length; j++) {
      if (
        haversineDistanceM(candidate.lat, candidate.lng, waterPoints[j].lat, waterPoints[j].lng) <=
        MIN_FACILITY_CLEARANCE_M
      ) {
        blockedByFacility = true;
        break;
      }
    }
    if (blockedByFacility) continue;

    let blockedByCamp = false;
    for (let j = 0; j < evacHalls.length; j++) {
      if (
        haversineDistanceM(candidate.lat, candidate.lng, evacHalls[j].lat, evacHalls[j].lng) <
        MIN_CIVIC_LANDMARK_CLEARANCE_M
      ) {
        blockedByCamp = true;
        break;
      }
    }
    if (blockedByCamp) continue;

    let collidesWithPlaced = false;
    for (let j = 0; j < finalCulledBuildings.length; j++) {
      const placed = finalCulledBuildings[j];
      if (
        haversineDistanceM(candidate.lat, candidate.lng, placed.lat, placed.lng) <
        MIN_MACRO_CLEARANCE_M
      ) {
        collidesWithPlaced = true;
        break;
      }
    }
    if (collidesWithPlaced) continue;

    if (Math.abs(scaleFactor - 1) > 1e-4 && Array.isArray(candidate.scaleVec)) {
      finalCulledBuildings.push({
        ...candidate,
        scaleVec: candidate.scaleVec.map((v) => Number((v * scaleFactor).toFixed(3))),
      });
    } else {
      finalCulledBuildings.push(candidate);
    }
  }

  const result = { evacHalls, pool: finalCulledBuildings };
  if (CITY_POOL_CACHE.size >= MAX_POOL_CACHE_ENTRIES) {
    const oldestKey = CITY_POOL_CACHE.keys().next().value;
    CITY_POOL_CACHE.delete(oldestKey);
  }
  CITY_POOL_CACHE.set(cacheKey, result);
  return result;
}

export function selectViewportCityBuildings(
  poolData,
  viewport = {},
  maxInstances = MAX_VIEWPORT_BUILDINGS
) {
  const getEmptyResult = () => {
    if (poolData && typeof poolData === 'object') {
      const cached = EMPTY_VIEWPORT_CACHE.get(poolData);
      if (cached) return cached;
      const empty = {
        totalSelected: 0,
        evacHalls: poolData.evacHalls || [],
        civicHalls: poolData.evacHalls || [],
        byArchetype: {
          house_residential: [],
          shophouse_commercial: [],
          midrise_building: [],
          civic_hall: poolData.evacHalls || [],
        },
      };
      EMPTY_VIEWPORT_CACHE.set(poolData, empty);
      return empty;
    }
    return {
      totalSelected: 0,
      evacHalls: [],
      civicHalls: [],
      byArchetype: {
        house_residential: [],
        shophouse_commercial: [],
        midrise_building: [],
        civic_hall: [],
      },
    };
  };
  if (!poolData || !Array.isArray(poolData.pool)) return getEmptyResult();

  const zoom = Number(viewport.zoom) || 0;
  if (zoom < DETAIL_BUILDINGS_MIN_ZOOM) {
    return getEmptyResult();
  }

  const centerLat = Number.isFinite(viewport.centerLat) ? viewport.centerLat : 13.624;
  const centerLng = Number.isFinite(viewport.centerLng) ? viewport.centerLng : 123.2002;
  const rawBounds = viewport.bounds;

  let minLat;
  let maxLat;
  let minLng;
  let maxLng;
  if (
    rawBounds &&
    Number.isFinite(rawBounds.north) &&
    Number.isFinite(rawBounds.south) &&
    Number.isFinite(rawBounds.east) &&
    Number.isFinite(rawBounds.west)
  ) {
    const padLat = Math.max(0.001, (rawBounds.north - rawBounds.south) * 0.15);
    const padLng = Math.max(0.001, (rawBounds.east - rawBounds.west) * 0.15);
    minLat = rawBounds.south - padLat;
    maxLat = rawBounds.north + padLat;
    minLng = rawBounds.west - padLng;
    maxLng = rawBounds.east + padLng;
  } else {
    minLat = centerLat - 0.012;
    maxLat = centerLat + 0.012;
    minLng = centerLng - 0.012;
    maxLng = centerLng + 0.012;
  }

  const inView = [];
  const pool = poolData.pool;
  for (let i = 0; i < pool.length; i++) {
    const b = pool[i];
    if (b.lat < minLat || b.lat > maxLat || b.lng < minLng || b.lng > maxLng) continue;
    const dLat = (b.lat - centerLat) * METERS_PER_DEG_LAT;
    const dLng = (b.lng - centerLng) * METERS_PER_DEG_LNG;
    inView.push({ entry: b, distSq: dLat * dLat + dLng * dLng });
  }

  inView.sort((a, b) => a.distSq - b.distSq);
  const limit = Math.min(inView.length, maxInstances);

  const byArchetype = {
    house_residential: [],
    shophouse_commercial: [],
    midrise_building: [],
    civic_hall: [...poolData.evacHalls],
  };

  for (let i = 0; i < limit; i++) {
    const entry = inView[i].entry;
    byArchetype[entry.archetype]?.push(entry);
  }

  return {
    totalSelected: limit,
    evacHalls: poolData.evacHalls,
    civicHalls: byArchetype.civic_hall,
    byArchetype,
  };
}

export function buildCuratedCityBuildings(
  waterPoints = INITIAL_NAGA_POINTS,
  evacuationCamps = INITIAL_EVACUATION_CAMPS_FALLBACK
) {
  const poolData = buildCityBuildingPool(waterPoints, evacuationCamps);
  return selectViewportCityBuildings(poolData, {
    zoom: 16.0,
    centerLat: 13.621,
    centerLng: 123.192,
    bounds: { north: 13.665, south: 13.595, east: 123.26, west: 123.15 },
  });
}

// ============================================================================
// HIGH-DENSITY BARANGAY LATTICE (TIGHTER SEPARATION + WIDER SIDEWALK CLEARANCE)
// ============================================================================

const SIMCITY_FIXED_SPACING_M = 1.8;
const SIMCITY_LOCAL_ROAD_BUFFER_M = 21.5;
const SIMCITY_MAIN_ROAD_BUFFER_M = 27.5;
const SIMCITY_MIN_RIVER_CLEARANCE_M = 30;
const SIMCITY_MIN_CREEK_CLEARANCE_M = 24;
const SIMCITY_MIN_FACILITY_CLEARANCE_M = 46;
const SIMCITY_MIN_CIVIC_CLEARANCE_M = 90;

const SIMCITY_TARGET_MIDRISE_COUNT = 3;
const SIMCITY_TARGET_SHOPHOUSE_COUNT = 5;
const SIMCITY_TARGET_HOUSE_COUNT = 8;
const SIMCITY_MAX_BARANGAY_BUILDINGS =
  SIMCITY_TARGET_MIDRISE_COUNT + SIMCITY_TARGET_SHOPHOUSE_COUNT + SIMCITY_TARGET_HOUSE_COUNT;

function normalizeBrgyKey(name) {
  return String(name || '')
    .replace(/^brgy\.?\s*/i, '')
    .trim()
    .toLowerCase();
}

function pointInPolygonRingLngLat(lng, lat, ring) {
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

function isInsidePolygonGeometryLngLat(lng, lat, geometry) {
  if (!geometry) return true;
  if (geometry.type === 'Polygon') {
    const [outer, ...holes] = geometry.coordinates || [];
    if (!outer || !pointInPolygonRingLngLat(lng, lat, outer)) return false;
    for (const hole of holes) {
      if (pointInPolygonRingLngLat(lng, lat, hole)) return false;
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates || []) {
      const [outer, ...holes] = poly;
      if (outer && pointInPolygonRingLngLat(lng, lat, outer)) {
        let inHole = false;
        for (const hole of holes) {
          if (pointInPolygonRingLngLat(lng, lat, hole)) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
    return false;
  }
  return true;
}

function getGeometryBBoxLngLat(geometry) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  const scanRing = (ring) => {
    for (let i = 0; i < ring.length; i++) {
      const [lng, lat] = ring[i];
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  };

  if (geometry?.type === 'Polygon') {
    for (const ring of geometry.coordinates || []) scanRing(ring);
  } else if (geometry?.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates || []) {
      for (const ring of poly) scanRing(ring);
    }
  }

  return Number.isFinite(minLng) ? { minLng, maxLng, minLat, maxLat } : null;
}

function minDistanceToSegmentsLngLat(lng, lat, segmentsLngLat) {
  let minD = Infinity;
  for (let i = 0; i < segmentsLngLat.length; i++) {
    const [lng1, lat1, lng2, lat2] = segmentsLngLat[i];
    const d = pointToSegmentDistanceM(lat, lng, lat1, lng1, lat2, lng2);
    if (d < minD) minD = d;
  }
  return minD;
}

function getMasterLatticeOrientation(lng, lat, segmentsLngLat, gridUx, gridUy) {
  const gridNx = -gridUy;
  const gridNy = gridUx;
  let bestDist = Infinity;
  let bestToStreetX = gridNx;
  let bestToStreetY = gridNy;

  for (let i = 0; i < segmentsLngLat.length; i++) {
    const [lng1, lat1, lng2, lat2] = segmentsLngLat[i];
    const ax = lng1 * METERS_PER_DEG_LNG;
    const ay = lat1 * METERS_PER_DEG_LAT;
    const bx = lng2 * METERS_PER_DEG_LNG;
    const by = lat2 * METERS_PER_DEG_LAT;
    const px = lng * METERS_PER_DEG_LNG;
    const py = lat * METERS_PER_DEG_LAT;

    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 16) continue;

    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const toStreetX = cx - px;
    const toStreetY = cy - py;
    const dist = Math.hypot(toStreetX, toStreetY);

    if (dist < bestDist) {
      bestDist = dist;
      bestToStreetX = toStreetX;
      bestToStreetY = toStreetY;
    }
  }

  const projN = bestToStreetX * gridNx + bestToStreetY * gridNy;
  const sign = projN >= 0 ? 1 : -1;
  const faceFx = gridNx * sign;
  const faceFy = gridNy * sign;
  const alongUx = gridUx * sign;
  const alongUy = gridUy * sign;
  const rawBearing = (Math.atan2(faceFx, faceFy) * 180) / Math.PI;
  const faceBearingDeg = ((rawBearing % 360) + 360) % 360;

  return {
    distM: bestDist,
    alongUx,
    alongUy,
    faceFx,
    faceFy,
    faceBearingDeg,
  };
}

const SIMCITY_LAYOUT_CACHE = new Map();

export function buildBarangaySimCityLayout({
  barangayName,
  barangayGeometry = null,
  waterPoints = INITIAL_NAGA_POINTS,
  evacHalls = [],
}) {
  const emptyBuckets = {
    house_residential: [],
    shophouse_commercial: [],
    midrise_building: [],
    zoneBoxRing: null,
  };
  if (!barangayName) return emptyBuckets;

  const targetNorm = normalizeBrgyKey(barangayName);
  const wpSig = waterPoints.map((p) => `${p.id}:${Number(p.lat).toFixed(5)},${Number(p.lng).toFixed(5)}`).join('|');
  const cacheKey = `${targetNorm}__simcity_v25_ultra_tight_wide_roads__${wpSig}__${evacHalls.length}`;
  if (SIMCITY_LAYOUT_CACHE.has(cacheKey)) {
    return SIMCITY_LAYOUT_CACHE.get(cacheKey);
  }

  let resolvedGeom = barangayGeometry;
  if (!resolvedGeom) {
    const feat = (NAGA_BARANGAYS_GEOJSON?.features || []).find(
      (f) => normalizeBrgyKey(f?.properties?.name) === targetNorm
    );
    if (feat?.geometry?.type === 'Polygon') {
      resolvedGeom = {
        type: 'Polygon',
        coordinates: feat.geometry.coordinates.map((ring) => ring.map(([lat, lng]) => [lng, lat])),
      };
    }
  }

  const bbox = getGeometryBBoxLngLat(resolvedGeom);
  if (!bbox) return emptyBuckets;

  const centerLng = (bbox.minLng + bbox.maxLng) * 0.5;
  const centerLat = (bbox.minLat + bbox.maxLat) * 0.5;
  const spanE = (bbox.maxLng - bbox.minLng) * METERS_PER_DEG_LNG;
  const spanN = (bbox.maxLat - bbox.minLat) * METERS_PER_DEG_LAT;
  const maxSpanM = Math.max(spanE, spanN) * 0.76;

  const zoneBoxRing =
    resolvedGeom?.type === 'Polygon'
      ? resolvedGeom.coordinates?.[0] || null
      : resolvedGeom?.type === 'MultiPolygon'
      ? resolvedGeom.coordinates?.[0]?.[0] || null
      : null;

  const padLng = 0.0024;
  const padLat = 0.0024;

  const arterialPolylines = [
    ...NAGA_OSM_PRIMARY_ROADS.map((line) => ({ tier: 'primary', coords: line.map(([lat, lng]) => [lng, lat]) })),
    ...NAGA_OSM_SECONDARY_ROADS.map((line) => ({ tier: 'secondary', coords: line.map(([lat, lng]) => [lng, lat]) })),
    ...NAGA_TERTIARY_ROADS.map((line) => ({ tier: 'tertiary', coords: line.map(([lat, lng]) => [lng, lat]) })),
    ...NAGA_LOCAL_STREETS.map((line) => ({ tier: 'local', coords: line.map(([lat, lng]) => [lng, lat]) })),
  ];

  const allRoadSegments = [];
  const mainRoadSegments = [];
  let longestMainLen = 0;
  let gridUx = 1;
  let gridUy = 0;
  let anchorLng = centerLng;
  let anchorLat = centerLat;

  for (let i = 0; i < arterialPolylines.length; i++) {
    const { tier, coords } = arterialPolylines[i];
    if (!Array.isArray(coords) || coords.length < 2) continue;

    for (let j = 0; j < coords.length - 1; j++) {
      const [lng1, lat1] = coords[j];
      const [lng2, lat2] = coords[j + 1];

      const segMinLng = Math.min(lng1, lng2);
      const segMaxLng = Math.max(lng1, lng2);
      const segMinLat = Math.min(lat1, lat2);
      const segMaxLat = Math.max(lat1, lat2);
      if (
        segMaxLng < bbox.minLng - padLng ||
        segMinLng > bbox.maxLng + padLng ||
        segMaxLat < bbox.minLat - padLat ||
        segMinLat > bbox.maxLat + padLat
      ) {
        continue;
      }

      allRoadSegments.push([lng1, lat1, lng2, lat2]);

      const dE = (lng2 - lng1) * METERS_PER_DEG_LNG;
      const dN = (lat2 - lat1) * METERS_PER_DEG_LAT;
      const segLen = Math.hypot(dE, dN);

      if (tier === 'primary' || tier === 'secondary') {
        mainRoadSegments.push([lng1, lat1, lng2, lat2]);
        const midLng = (lng1 + lng2) * 0.5;
        const midLat = (lat1 + lat2) * 0.5;
        const insideBrgy =
          !resolvedGeom || isInsidePolygonGeometryLngLat(midLng, midLat, resolvedGeom);
        const weightLen = insideBrgy ? segLen * 2.5 : segLen;
        if (weightLen > longestMainLen && segLen > 15) {
          longestMainLen = weightLen;
          gridUx = dE / segLen;
          gridUy = dN / segLen;
          anchorLng = midLng;
          anchorLat = midLat;
        }
      }
    }
  }

  const gridNx = -gridUy;
  const gridNy = gridUx;

  const placedLotRings = [];
  const buckets = {
    house_residential: [],
    shophouse_commercial: [],
    midrise_building: [],
    zoneBoxRing,
  };

  const canPlaceBarangayLatticeLot = (lng, lat, alongUx, alongUy, faceFx, faceFy, spec, lotRing, samplePoints) => {
    if (resolvedGeom && !isInsidePolygonGeometryLngLat(lng, lat, resolvedGeom)) {
      return false;
    }

    for (let s = 0; s < samplePoints.length; s++) {
      const [sLng, sLat] = samplePoints[s];
      if (resolvedGeom && !isInsidePolygonGeometryLngLat(sLng, sLat, resolvedGeom)) {
        return false;
      }
      if (isInsideWaterwayClearance(sLat, sLng, 16, 12)) {
        return false;
      }
      for (let i = 0; i < waterPoints.length; i++) {
        const pt = waterPoints[i];
        if (pt?.lat == null || pt?.lng == null) continue;
        if (distanceMeters(sLat, sLng, pt.lat, pt.lng) < 32) {
          return false;
        }
      }
    }

    if (
      doesRoadClipOrientedLot(
        lng,
        lat,
        alongUx,
        alongUy,
        faceFx,
        faceFy,
        spec.lotWidthM * 0.5,
        spec.lotDepthM * 0.5,
        mainRoadSegments,
        SIMCITY_MAIN_ROAD_BUFFER_M
      )
    ) {
      return false;
    }
    if (
      doesRoadClipOrientedLot(
        lng,
        lat,
        alongUx,
        alongUy,
        faceFx,
        faceFy,
        spec.lotWidthM * 0.5,
        spec.lotDepthM * 0.5,
        allRoadSegments,
        SIMCITY_LOCAL_ROAD_BUFFER_M
      )
    ) {
      return false;
    }

    if (isInsideWaterwayClearance(lat, lng, SIMCITY_MIN_RIVER_CLEARANCE_M, SIMCITY_MIN_CREEK_CLEARANCE_M)) {
      return false;
    }
    if (distanceMeters(lat, lng, CDRRMO_HUB.lat, CDRRMO_HUB.lng) < SIMCITY_MIN_FACILITY_CLEARANCE_M) {
      return false;
    }
    for (let i = 0; i < waterPoints.length; i++) {
      const pt = waterPoints[i];
      if (pt?.lat == null || pt?.lng == null) continue;
      if (distanceMeters(lat, lng, pt.lat, pt.lng) < SIMCITY_MIN_FACILITY_CLEARANCE_M) {
        return false;
      }
    }
    for (let i = 0; i < evacHalls.length; i++) {
      const camp = evacHalls[i];
      if (camp?.lat == null || camp?.lng == null) continue;
      if (distanceMeters(lat, lng, camp.lat, camp.lng) < SIMCITY_MIN_CIVIC_CLEARANCE_M) {
        return false;
      }
    }

    for (let i = 0; i < placedLotRings.length; i++) {
      if (doOrientedLotRingsOverlap(lotRing, placedLotRings[i], SIMCITY_FIXED_SPACING_M)) {
        return false;
      }
    }
    return true;
  };

  // Compact 58m x 56m street-aligned lattice for tight Philippine barangay block density
  const colPitchM = 58;
  const rowPitchM = 56;
  const maxCols = Math.ceil(maxSpanM / colPitchM) + 1;
  const maxRows = Math.ceil(maxSpanM / rowPitchM) + 1;

  const latticeCells = [];
  for (let rIdx = -maxRows; rIdx <= maxRows; rIdx++) {
    if (rIdx === 0) continue;
    const rowSign = rIdx > 0 ? 1 : -1;
    const baseVM =
      rowSign * (SIMCITY_MAIN_ROAD_BUFFER_M + 28) + (rIdx - rowSign) * rowPitchM;

    for (let cIdx = -maxCols; cIdx <= maxCols; cIdx++) {
      const baseUM = cIdx * colPitchM;
      const eastM = gridUx * baseUM + gridNx * baseVM;
      const northM = gridUy * baseUM + gridNy * baseVM;
      const testLng = anchorLng + eastM / METERS_PER_DEG_LNG;
      const testLat = anchorLat + northM / METERS_PER_DEG_LAT;

      const mainDistM =
        mainRoadSegments.length > 0
          ? minDistanceToSegmentsLngLat(testLng, testLat, mainRoadSegments)
          : Math.abs(baseVM);

      latticeCells.push({
        cIdx,
        rIdx,
        baseUM,
        baseVM,
        testLng,
        testLat,
        mainDistM,
      });
    }
  }

  let totalPlaced = 0;
  let midrisePlaced = 0;
  let shophousePlaced = 0;
  let housePlaced = 0;
  const usedCellKeys = new Set();

  const tryPlaceInLatticeCell = (cell, archetype, tag) => {
    if (totalPlaced >= SIMCITY_MAX_BARANGAY_BUILDINGS) return false;
    const cellKey = `${cell.cIdx}:${cell.rIdx}`;
    if (usedCellKeys.has(cellKey)) return false;

    const spec = computeSimCityLotSpec(archetype);

    const vOffsets = [0, 5, -5, 10, -10, 15, -15, 20, -20];
    const uOffsets = [0, 6, -6, 12, -12, 18, -18];

    for (let vi = 0; vi < vOffsets.length; vi++) {
      for (let ui = 0; ui < uOffsets.length; ui++) {
        const uM = cell.baseUM + uOffsets[ui];
        const vM = cell.baseVM + vOffsets[vi];
        const eastM = gridUx * uM + gridNx * vM;
        const northM = gridUy * uM + gridNy * vM;
        const lng = Number((anchorLng + eastM / METERS_PER_DEG_LNG).toFixed(6));
        const lat = Number((anchorLat + northM / METERS_PER_DEG_LAT).toFixed(6));

        if (resolvedGeom && !isInsidePolygonGeometryLngLat(lng, lat, resolvedGeom)) {
          continue;
        }

        const orient = getMasterLatticeOrientation(lng, lat, allRoadSegments, gridUx, gridUy);
        const { alongUx, alongUy, faceFx, faceFy, faceBearingDeg } = orient;

        const lotRing = buildOrientedRectRingLngLat(
          lng,
          lat,
          alongUx,
          alongUy,
          faceFx,
          faceFy,
          spec.lotWidthM,
          spec.lotDepthM,
          0
        );
        const samplePoints = buildLotSamplePointsLngLat(
          lng,
          lat,
          alongUx,
          alongUy,
          faceFx,
          faceFy,
          spec.lotWidthM,
          spec.lotDepthM,
          0
        );

        if (
          !canPlaceBarangayLatticeLot(
            lng,
            lat,
            alongUx,
            alongUy,
            faceFx,
            faceFy,
            spec,
            lotRing,
            samplePoints
          )
        ) {
          continue;
        }

        const yawDeg = computeStreetFacingYawDeg(archetype, faceBearingDeg);
        const id = `SIM-${targetNorm.toUpperCase()}-${tag}-${totalPlaced + 1}`;

        usedCellKeys.add(cellKey);
        placedLotRings.push(lotRing);
        buckets[archetype].push({
          id,
          lat,
          lng,
          barangay: barangayName,
          archetype,
          bearingDeg: faceBearingDeg,
          roadAngle: faceBearingDeg,
          yawDeg,
          scaleVec: spec.scaleVec,
          lotWidthM: spec.lotWidthM,
          lotDepthM: spec.lotDepthM,
          lotRing,
          elevation_m: getTerrainElevationM(lat, lng),
          isEvacLandmark: false,
          isProcedural: true,
        });
        totalPlaced++;
        return true;
      }
    }
    return false;
  };

  const avenueCells = [...latticeCells].sort((a, b) => a.mainDistM - b.mainDistM);

  for (let i = 0; i < avenueCells.length && midrisePlaced < SIMCITY_TARGET_MIDRISE_COUNT; i++) {
    if (tryPlaceInLatticeCell(avenueCells[i], 'midrise_building', 'TWR')) {
      midrisePlaced++;
    }
  }

  for (let i = 0; i < avenueCells.length && shophousePlaced < SIMCITY_TARGET_SHOPHOUSE_COUNT; i++) {
    if (tryPlaceInLatticeCell(avenueCells[i], 'shophouse_commercial', 'SHOP')) {
      shophousePlaced++;
    }
  }

  for (let i = 0; i < avenueCells.length && housePlaced < SIMCITY_TARGET_HOUSE_COUNT; i++) {
    if (tryPlaceInLatticeCell(avenueCells[i], 'house_residential', 'RES')) {
      housePlaced++;
    }
  }

  SIMCITY_LAYOUT_CACHE.set(cacheKey, buckets);
  return buckets;
}

export function buildSimCityLotGeoJson(viewportBuildings) {
  const features = [];
  const byType = viewportBuildings?.byArchetype || {};

  for (const archetype of ['house_residential', 'shophouse_commercial', 'midrise_building']) {
    const list = byType[archetype] || [];
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (Array.isArray(b.lotRing) && b.lotRing.length >= 4) {
        features.push({
          type: 'Feature',
          properties: {
            id: `${b.id}-lot`,
            kind: 'lot',
            archetype,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [b.lotRing],
          },
        });
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features,
  };
}
